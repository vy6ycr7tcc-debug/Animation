/* What the new density rooms (1, 2, 4, 6) share: a sky dome of their own, soft clouds of points,
   rough stone spires, seeded placement, and the game's rule for additive light (it adds light but
   leaves the picture's alpha alone, or the lakes' mirror shows dark squares; main.ts
   `additiveKeepsAlpha` does this at start-up, before any room exists). Rooms 0/3/5/7 are not
   touched by this file. */
import * as THREE from "three/webgpu";
import { T, fogUniforms, gradeUniforms, softPoints, spriteCloud, vnoise, type N, type SpriteCloud } from "../../gpu/tsl";
import { fbm } from "../../world/terrain";

const { vec3, vec4, mix, smoothstep, length, exp, max, positionLocal, normalize, uniform } = T;

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
  const P = T.positionWorld;
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
