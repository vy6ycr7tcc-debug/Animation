/* What the new density rooms (1, 2, 4, 6) share: a sky dome of their own, soft clouds of points,
   rough stone spires, seeded placement, and the game's rule for additive light (it adds light but
   leaves the picture's alpha alone, or the lakes' mirror shows dark squares; main.ts
   `additiveKeepsAlpha` does this at start-up, before any room exists). Rooms 0/3/5/7 are not
   touched by this file. */
import * as THREE from "three/webgpu";
import { T, fogUniforms, gpuUniforms, gradeUniforms, softPoints, spriteCloud, vnoise, type N, type SpriteCloud } from "../../gpu/tsl";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fbm } from "../../world/terrain";
import { surface, type SurfaceName } from "../../world/textures";

const { vec3, vec4, mix, smoothstep, length, exp, max, positionLocal, normalize, uniform } = T;


/** Where the room you are in has been placed in the world (the journey moves rooms to a place
    apart at x = 22000; a room seen on its own is at the origin). Shading that depends on where a
    point is in the room (patterns, distances to the room's own landmarks) reads `roomPos`, the
    point in the room's own frame: never `positionWorld` against the room's constants, and it keeps
    fine patterns precise so far from the origin. */
export const roomOrigin = T.uniform(new THREE.Vector3());
export const roomPos: N = T.positionWorld.sub(roomOrigin);

/** A repeatable random stream. */
export function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Additive light that leaves alpha alone (see the note above). */
export function keepAlpha<M extends THREE.Material>(m: M): M {
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

/** The room's own sky: a dome coloured by elevation (horizon → zenith), with an optional warm glow
    low toward `glowDir` (a volcano, a sunrise). `extra` may add to the colour (stars, veils). */
export function skyDome(
  radius: number,
  horizon: THREE.Color,
  zenith: THREE.Color,
  opts: { glowDir?: THREE.Vector3; glow?: THREE.Color; glowPow?: number; extra?: (dir: N, base: N) => N } = {},
): { mesh: THREE.Mesh; material: THREE.MeshBasicNodeMaterial; dispose(): void } {
  const geo = new THREE.SphereGeometry(radius, 48, 24);
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
  const d = normalize(positionLocal);
  const e = max(d.y, 0);
  let c: N = mix(vec3(horizon.r, horizon.g, horizon.b), vec3(zenith.r, zenith.g, zenith.b), smoothstep(0, 0.55, e));
  if (opts.glowDir && opts.glow) {
    const g = opts.glowDir.clone().normalize();
    const k = T.pow(max(T.dot(d, vec3(g.x, g.y, g.z)), 0), opts.glowPow ?? 6).mul(smoothstep(0.5, -0.05, d.y));
    c = c.add(vec3(opts.glow.r, opts.glow.g, opts.glow.b).mul(k));
  }
  if (opts.extra) c = opts.extra(d, c);
  m.colorNode = vec4(c, 1);
  const mesh = new THREE.Mesh(geo, m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, material: m, dispose: () => (geo.dispose(), m.dispose()) };
}

/** A cloud of soft round points: `n` of them, each with a base position, a random `aK` (4 values)
    and whatever the room writes into them. World-sized (`size` metres at the base scale). */
export function pointCloud(n: number, size: number): { cloud: SpriteCloud; material: THREE.PointsNodeMaterial; pos: Float32Array; k: Float32Array; round: N } {
  const material = softPoints();
  material.sizeAttenuation = true;
  keepAlpha(material);
  const cloud = spriteCloud(n, { position: 3, aK: 4 }, material);
  const pos = cloud.attrs.position.array as Float32Array, k = cloud.attrs.aK.array as Float32Array;
  material.size = size;
  // a soft round falloff (alpha is folded into the colour)
  const r = length(T.pointUV.sub(0.5)).mul(2);
  const round = exp(r.mul(r).mul(-4)).mul(smoothstep(1, 0.7, r));
  return { cloud, material, pos, k, round };
}

/** Mark a cloud's attributes changed after filling them. */
export function touch(c: SpriteCloud): void {
  for (const a of Object.values(c.attrs)) a.needsUpdate = true;
}

/** A rough stone spire: a tapering column of `sides` faces, its surface broken by noise so no
    two are alike and none is a clean primitive. Flat-shaded, as the game's rocks are. */
export function spireGeometry(radius: number, height: number, seed: number, sides = 7, lean = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius * 0.32, radius, height, sides, Math.max(6, Math.round(height / 2.5)), false);
  g.translate(0, height / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // noise read from the position itself, so the seam's twin vertices move together (no crack)
    const n = fbm(x * 0.45 + seed * 7.3 + y * 0.05, z * 0.45 + y * 0.16 + seed) - 0.5;
    const shelf = Math.sin(y * 0.9 + seed) * 0.08; // horizontal ledges, as weathered basalt
    const k = 1 + n * 0.55 + shelf;
    const bend = (y / height) ** 2 * lean;
    p.setXYZ(i, x * k + bend, y, z * k);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** A rough boulder (a displaced icosahedron), its base flattened so it sits on the ground. */
export function boulderGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const n = fbm(v.x * 0.7 + seed, v.z * 0.7 + v.y * 0.5 - seed) - 0.5;
    v.multiplyScalar(1 + n * 0.5);
    v.y = Math.max(v.y * 0.7, -radius * 0.25);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** The room's own clock for its shaders (seconds, advanced by the room's ticker). */
export function roomClock(): { u: N; tick(dt: number): void } {
  const u = uniform(0);
  return { u, tick: (dt: number) => (u.value += Math.min(0.05, Math.max(0, dt))) };
}

/** Ease a value toward a goal (x += (goal − x)·min(1, dt·k)): the game's damping. */
export function damp(x: number, goal: number, k: number, dt: number): number {
  return x + (goal - x) * Math.min(1, dt * k);
}


/** A room's own air: the fog's colour, its glow and where it glows from, its thickness, and the
    grade after tone mapping. The world's moods set these every frame; a room sets them after
    (it must run after the moods), so it keeps its own atmosphere while you are in it. */
export interface Air {
  color: THREE.Color;
  glow: THREE.Color;
  glowDir: THREE.Vector3;
  density: number;
  shadow?: THREE.Color;
  sat?: number;
  contrast?: number;
}
export function applyAir(a: Air): void {
  fogUniforms.color.value.copy(a.color);
  fogUniforms.glow.value.copy(a.glow);
  fogUniforms.glowDir.value.copy(a.glowDir).normalize();
  fogUniforms.density.value = a.density;
  if (a.shadow) gradeUniforms.shadow.value.copy(a.shadow);
  if (a.sat !== undefined) gradeUniforms.sat.value = a.sat;
  if (a.contrast !== undefined) gradeUniforms.contrast.value = a.contrast;
}

/** Fractal value noise in 0–1 (three octaves). */
export const fbmN = (p: N): N => vnoise(p).mul(0.5).add(vnoise(p.mul(2.03).add(5.2)).mul(0.28)).add(vnoise(p.mul(4.01).add(9.7)).mul(0.14)).div(0.92);

/** A ceiling of cloud: a wide sheet overhead whose billows (domain-warped fbm) drift slowly;
    `color(q, cover)` gives each point's colour; the sheet thins out toward its far edges. */
export function cloudSheet(size: number, height: number, t: N, color: (q: N, cover: N) => N, opts: { scale?: number; cover?: [number, number]; opacity?: number; drift?: [number, number] } = {}): { mesh: THREE.Mesh; dispose(): void } {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(Math.PI / 2); // facing down
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const sc = opts.scale ?? 0.006;
  const [c0, c1] = opts.cover ?? [0.38, 0.78];
  const [dx, dz] = opts.drift ?? [0.004, 0.0022];
  const P = roomPos;
  const q0 = P.xz.mul(sc).add(T.vec2(t.mul(dx), t.mul(dz)));
  const warp = T.vec2(fbmN(q0.mul(1.7)), fbmN(q0.mul(1.7).add(7.3))).sub(0.5).mul(0.9);
  const q = q0.add(warp);
  const cover = smoothstep(c0, c1, fbmN(q));
  const edge = smoothstep(size * 0.5, size * 0.28, length(T.positionGeometry.xz));
  m.colorNode = color(q, cover);
  m.opacityNode = cover.mul(edge).mul(opts.opacity ?? 0.92);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = height;
  mesh.renderOrder = -5;
  mesh.frustumCulled = false;
  return { mesh, dispose: () => (geo.dispose(), m.dispose()) };
}

/** Real texture on a room's ground: a Poly Haven scan laid in metres from above (`tile` metres a
    repeat), at two scales so no repeat reads as a grid; its colour kept mostly as light and shade
    (`hue` of its own colour, the rest the ground's own tint), its occlusion darkening every
    pebble and crack, and its relief turned into the surface (fading with distance so far ground
    doesn't shimmer). Returns the colour to multiply into the ground, and the normal to use. */
export function scannedGround(set: SurfaceName, tile: number, opts: { hue?: number; relief?: number; bright?: number } = {}): { color: N; normal: N } {
  const s = surface(set);
  const P = roomPos;
  const u1 = P.xz.div(tile), u2 = P.xz.div(tile * 2.618).add(T.vec2(0.37, 0.71));
  const d = T.texture(s.diff, u1).rgb.mul(0.6).add(T.texture(s.diff, u2).rgb.mul(0.4));
  const ao = T.texture(s.arm, u1).r.mul(0.6).add(T.texture(s.arm, u2).r.mul(0.4));
  const lum = T.dot(d, T.vec3(0.3, 0.5, 0.2));
  const col = mix(T.vec3(lum), d, opts.hue ?? 0.35).mul(opts.bright ?? 2.2).mul(mix(T.float(0.45), T.float(1.05), ao));
  const camD = length(T.cameraPosition.sub(T.positionWorld));
  const near = T.float(1).sub(smoothstep(20, 90, camD));
  const n1 = T.texture(s.nor, u1).xy.mul(2).sub(1), n2 = T.texture(s.nor, u2).xy.mul(2).sub(1);
  const n = n1.mul(0.6).add(n2.mul(0.4)).mul(near).mul(opts.relief ?? 1.4);
  const dW = T.vec3(n.x, 0, n.y.negate());
  const normal = normalize(T.normalView.add(T.cameraViewMatrix.mul(T.vec4(dW, 0)).xyz));
  // far off, the scan's average, so the ground keeps its tone when the detail has faded
  return { color: mix(T.vec3(0.9), col, T.float(1).sub(smoothstep(120, 260, camD))), normal };
}

/* ---- built things the monuments share: rough stone, walls, lamps ---- */

/** A rough stone: a tapered block, its faces broken by noise (no clean primitive). */
export function roughBlock(w: number, h: number, d: number, taper: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 3, Math.max(4, Math.round(h / 1.2)), 2);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 - taper * (y / h);
    const n = fbm(x * 0.9 + seed * 3.1 + y * 0.13, z * 0.9 + y * 0.31 - seed) - 0.5;
    p.setXYZ(i, x * k * (1 + n * 0.26), y + (y > h - 0.01 ? n * 0.8 : 0), z * k * (1 + n * 0.22));
  }
  g.computeVertexNormals();
  return g;
}
/** Turn a closed shape inside out: its inner faces become its front, lit from within. */
export function inward(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const b = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, b);
  }
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}
export const merge = (list: THREE.BufferGeometry[]) => {
  for (const g of list) for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!;
};
/** A ring wall of `n` blocks, leaving out those whose centre angle is in `gaps` (θ = 0 is +z). */
export function ringWall(r: number, h: number, thick: number, n: number, gaps: number[]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    if (gaps.includes(k)) continue;
    const th = (k / n) * Math.PI * 2;
    const g = new THREE.BoxGeometry(2 * r * Math.sin(Math.PI / n) + 0.08, h, thick);
    g.translate(0, h / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(th).setPosition(Math.sin(th) * r, 0, Math.cos(th) * r));
    out.push(g);
  }
  return out;
}
/** A small soft light for each colour at the given points (contained: no spreading glow). */
export function lamps(points: THREE.Vector3[], colors: THREE.Color[], size: number, k: number[]) {
  const pc = pointCloud(points.length, size);
  const col = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    pc.pos.set([p.x, p.y, p.z], i * 3);
    pc.k.set([k[i] ?? 1, i / points.length, 0, 0], i * 4);
    col.set([colors[i].r, colors[i].g, colors[i].b], i * 3);
  });
  touch(pc.cloud);
  const K = pc.cloud.nodes.aK;
  const colAttr = new THREE.InstancedBufferAttribute(col, 3);
  pc.cloud.sprite.geometry.setAttribute("aCol", colAttr);
  const C = T.instancedBufferAttribute(colAttr);
  const breathe = T.sin(gpuUniforms.time.mul(0.7).add(K.y.mul(6.28))).mul(0.12).add(0.88);
  pc.material.colorNode = vec4(C.mul(pc.round).mul(K.x).mul(breathe), 1);
  return pc;
}

