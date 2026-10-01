/* Stonework for the open world's built places: real structures of cut and standing stone, in the
   temple's photo-scanned sandstone (Poly Haven, CC0), weathered by the open air (lichen on the
   tops, soil and damp at the foot, streaks down the faces). Samuel: "all the other buildings should
   be legit structures made of rocks and realistic".

   `landStone()` lays a scan triplanar in the world, so any shape takes it without stretching;
   `homePlatform()` builds the ground of an archetype's home: a round platform of fitted blocks in
   two courses with a worn step, and a ring of rough standing stones about it, one fallen. */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { T, fogUniforms, gpuUniforms, type N } from "../gpu/tsl";
import { scan, type ScanName } from "./temple";

const { abs, float, mix, smoothstep, vec3 } = T;

/** The scan laid in the world from all three sides, with its occlusion, relief and roughness, and
    the weather of the open air. `base`: the world height of the ground it stands on (the foot
    darkens with soil and damp above it, and the stone is shadowed where it meets the ground). */
/** Cut masonry laid over the scan (for built walls and floors, not boulders or standing stones):
    `course` is a wall course's height and `block` a block's length, in metres; floors are laid
    as flagstones `flag` metres across. Each block has its own tone and roughness and shows its
    own part of the scan (so no repeat reads as a grid), its arrises worn pale, the mortar
    recessed: the joints are seen in depth (a parallax step shows the stone's cut side at grazing
    angles) and shadowed where the key light cannot reach into them.
    `trim` lays the building's bands, the game's one shared trim sheet: a plinth of tall cut stone
    at the foot (from `base`, 0.95 m) and a moulded cornice under each `every` metres (a storey)
    or at `top`. */
export interface Masonry {
  course?: number;
  block?: number;
  flag?: number;
  trim?: { base: number; every?: number; top?: number };
  /** A place apart far from the world's centre (the pyramid's rooms at 50 km): the stone is laid
      in its own frame, so the scan's lookups and the stones' hashes keep their precision. */
  origin?: THREE.Vector3;
  /** Indoors: no lichen on what faces up, no rain streaks. */
  interior?: boolean;
}
/** Each scan's colour over the grain scan's (their mean colours), so a swap keeps the tone. */
const GRAIN_TINT: Record<string, [number, number, number]> = {
  sandstone_blocks_05: [0.835, 0.965, 1.141],
  sandstone_blocks_08: [0.788, 0.91, 1.011],
  red_sandstone_pavement: [0.488, 0.553, 0.651],
};
export function landStone(set: ScanName, base: number, tile = 2.4, tint: [number, number, number] = [1, 1, 1], masonry?: Masonry, finish?: "marble"): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.9 });
  // cut masonry draws its own stones: the scan gives only the stone's grain (the block and
  // pavement scans carry bricks of their own, which fought the joints), in the same colour
  if (masonry && set !== "sandstone_cracks") {
    const k = GRAIN_TINT[set];
    tint = [tint[0] * k[0], tint[1] * k[1], tint[2] * k[2]];
    set = "sandstone_cracks";
  }
  const S = scan(set);
  const pw = masonry?.origin ? T.positionWorld.sub(vec3(masonry.origin.x, masonry.origin.y, masonry.origin.z)) : T.positionWorld;
  const n = T.normalWorldGeometry;
  const dry = masonry?.interior ? 0 : 1;
  const wp = T.pow(abs(n), vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const h = (v: N) => T.fract(T.sin(T.dot(v, T.vec2(12.9898, 78.233))).mul(43758.5453));
  const nz = (p: N) => T.mx_noise_float(p).mul(0.5).add(0.5);
  const wall = float(1).sub(smoothstep(0.55, 0.8, abs(n.y)));
  const xFace = w.x.greaterThan(w.z);
  const hAxis = T.select(xFace, vec3(0, 0, 1), vec3(1, 0, 0));

  /* ---- the masonry's own pattern, worked out first: each stone then takes its own part of the
     scan (a stochastic tiling in stones), and the pattern can be read again at shifted places
     for depth and for shadow ---- */
  type Cell = { e: N; id: N; fu: N; fv: N; du: N; dv: N };
  let cellAt: ((p: N) => Cell) | null = null;
  let band: { plinth: N; cornice: N; ly: N; c0: N } | null = null;
  if (masonry) {
    const course = masonry.course ?? 0.85, block = masonry.block ?? 1.5, flag = masonry.flag ?? 1.1;
    const tr = masonry.trim;
    if (tr) {
      const ly = pw.y.sub(tr.base);
      const plinth = T.step(0, ly).mul(T.step(ly, 0.95));
      const top = tr.every ? T.fract(ly.div(tr.every)).mul(tr.every) : ly;
      const edge = tr.every ? float(tr.every) : float(tr.top !== undefined ? tr.top - tr.base : 1e6);
      const c0 = edge.sub(0.62);
      const cornice = T.step(c0, top).mul(T.step(top, edge)).mul(T.step(1.4, ly));
      band = { plinth, cornice, ly, c0: top.sub(c0) };
    }
    cellAt = (p: N): Cell => {
      // walls: courses along the face's own horizontal, each course staggered; the plinth one
      // tall course of long stones, the cornice one long moulded course
      const along = T.select(xFace, p.z, p.x);
      const inPl = band ? band.plinth : float(0), inCo = band ? band.cornice : float(0);
      const cH = mix(mix(float(course), float(0.95), inPl), float(0.62), inCo);
      const bL = mix(mix(float(block), float(block * 1.5), inPl), float(block * 2.6), inCo);
      const yy = band ? mix(mix(p.y, band.ly, inPl), band.c0, inCo) : p.y;
      const row = T.floor(yy.div(cH));
      const u = along.div(bL).add(row.mul(0.5)).add(h(T.vec2(row, 3.7)).mul(0.35));
      const cellW = T.floor(u);
      const fu = T.fract(u), fv = T.fract(yy.div(cH));
      const du = T.min(fu, float(1).sub(fu)).mul(bL), dv = T.min(fv, float(1).sub(fv)).mul(cH);
      // floors: flagstones in staggered rows, two widths
      const frow = T.floor(p.z.div(flag));
      const fwid = mix(float(flag * 1.1), float(flag * 1.7), h(T.vec2(frow, 9.1)));
      const fu2 = p.x.div(fwid).add(h(T.vec2(frow, 1.3)));
      const cellF = T.floor(fu2);
      const ffu = T.fract(fu2), ffv = T.fract(p.z.div(flag));
      const du2 = T.min(ffu, float(1).sub(ffu)).mul(fwid), dv2 = T.min(ffv, float(1).sub(ffv)).mul(flag);
      const isW = wall.greaterThan(0.5);
      return {
        e: mix(T.min(du2, dv2), T.min(du, dv), wall),
        id: mix(h(T.vec2(cellF, frow).add(17.3)), h(T.vec2(cellW, row.add(inCo.mul(31)))), wall),
        fu: T.select(isW, fu, ffu),
        fv: T.select(isW, fv, ffv),
        du: T.select(isW, du, du2),
        dv: T.select(isW, dv, dv2),
      };
    };
  }
  const cell = cellAt ? cellAt(pw) : null;
  // each stone shows its own part of the scan; plain stone breaks its repeat with a broad drift
  const shift = cell ? vec3(h(T.vec2(cell.id, 1.7)), h(T.vec2(cell.id, 5.3)), h(T.vec2(cell.id, 8.9))).mul(tile * 3.7) : vec3(nz(pw.mul(0.05)), nz(pw.mul(0.05).add(4.4)), 0).mul(tile * 0.6);
  const ps = pw.add(shift);
  const tri = (t: THREE.Texture) =>
    T.texture(t, ps.zy.div(tile)).mul(w.x).add(T.texture(t, ps.xz.div(tile)).mul(w.y)).add(T.texture(t, ps.xy.div(tile)).mul(w.z));
  const arm = tri(S.arm);
  let c: N = tri(S.diff).rgb.mul(mix(float(0.35), float(1), arm.r)).mul(vec3(...tint));
  const marble = finish === "marble";
  if (marble) {
    // pale marble: the scan's grain kept as a quiet variation in a white stone, grey-blue veins
    // wandering through it (warped noise), a warmth where it is thickest
    const lum = T.dot(c, vec3(0.3, 0.5, 0.2)).div(tint[1]);
    const q = pw.mul(0.22);
    const warp = vec3(nz(q.add(1.7)), nz(q.add(8.3)), nz(q.add(4.1))).mul(2.2);
    const v = abs(nz(q.mul(1.4).add(warp)).sub(0.5));
    const vein = smoothstep(0.035, 0.0, v).mul(0.55).add(smoothstep(0.09, 0.0, v).mul(0.2));
    c = mix(vec3(0.86, 0.84, 0.8), vec3(0.97, 0.94, 0.88), smoothstep(0.2, 0.6, lum)).mul(vec3(...tint));
    c = mix(c, vec3(0.5, 0.54, 0.6).mul(tint[1]), vein).mul(mix(float(0.78), float(1), arm.r));
  }
  // a broad variation over the whole face, so a long wall is never one even tone
  c = c.mul(mix(float(0.86), float(1.08), nz(pw.mul(0.09).add(2.2))));
  // lichen and moss on what faces the sky, in patches
  const up = smoothstep(0.45, 0.9, n.y);
  const lichen = up.mul(smoothstep(0.55, 0.78, nz(pw.mul(1.3).add(3.1)))).mul(marble ? 0.12 : 0.7).mul(dry);
  c = mix(c, vec3(0.34, 0.38, 0.24).mul(nz(pw.mul(7)).mul(0.5).add(0.7)), lichen);
  // soil and damp at the foot, streaks where rain runs down the faces
  const above = pw.y.sub(base);
  const foot = smoothstep(0.9, 0.0, above).mul(0.55);
  const streak = smoothstep(0.6, 0.85, nz(vec3(pw.x.mul(3.1), pw.y.mul(0.2), pw.z.mul(3.1)))).mul(float(1).sub(up)).mul(0.3 * dry);
  c = c.mul(float(1).sub(foot)).mul(float(1).sub(streak));
  // contact and occlusion: shadowed where the stone meets the ground, under every overhang
  // (the faces turned down: soffits, cornices, lintels), and grime gathered in the lowest course
  c = c.mul(float(1).sub(smoothstep(0.45, 0.0, above).mul(wall).mul(0.35)));
  c = c.mul(mix(float(1), float(0.5), smoothstep(-0.25, -0.85, n.y)));
  // edge wear: convex edges (where the surface turns sharply) worn pale, catching the light
  const curv = T.clamp(T.length(T.fwidth(n)).mul(3), 0, 1);
  c = c.mul(float(1).add(curv.mul(0.22)));
  let rough: N = marble ? T.clamp(arm.g.mul(0.5).add(0.12), 0.32, 0.62) : T.clamp(arm.g.add(lichen.mul(0.2)), 0.6, 1);
  // relief from the scan's normal map, turned to each side
  const nm = (t: THREE.Texture) => [T.texture(t, ps.zy.div(tile)), T.texture(t, ps.xz.div(tile)), T.texture(t, ps.xy.div(tile))].map((x: N) => x.xy.mul(2).sub(1));
  const [nx, ny, nzz] = nm(S.nor);
  let dn: N = vec3(0, nx.y, nx.x).mul(w.x).add(vec3(ny.x, 0, ny.y).mul(w.y)).add(vec3(nzz.x, nzz.y, 0).mul(w.z)).mul(0.9);
  if (cellAt && cell) {
    const mortar = 0.035, depth = 0.05;
    const jointOf = (k: Cell) => smoothstep(mortar, mortar * 0.35, k.e);
    const joint = jointOf(cell);
    // depth: the joint as a recess seen from where you stand. Where the surface is inside a
    // joint but the view, stepped down the recess, lands back on stone, you are looking at the
    // cut side of the next stone (darker, catching less light). And the key light reaches into
    // a joint only where the lip on its side lets it: elsewhere the joint lies in shadow.
    const tU = T.select(wall.greaterThan(0.5), hAxis, vec3(1, 0, 0)), tV = T.select(wall.greaterThan(0.5), vec3(0, 1, 0), vec3(0, 0, 1));
    const flatN = T.normalize(n);
    const V = T.normalize(T.cameraPosition.sub(T.positionWorld));
    const Lk = fogUniforms.glowDir;
    const inPlane = (d: N) => tU.mul(T.dot(d, tU)).add(tV.mul(T.dot(d, tV))).div(T.max(T.dot(d, flatN), 0.18));
    const seenSide = joint.mul(float(1).sub(jointOf(cellAt(pw.sub(inPlane(V).mul(depth))))));
    const lit = float(1).sub(jointOf(cellAt(pw.add(inPlane(Lk).mul(depth)))));
    const shade = joint.mul(float(1).sub(lit)).mul(smoothstep(0.0, 0.25, T.dot(Lk, flatN).add(0.3)));
    const id = cell.id;
    const arris = smoothstep(0.1, mortar, cell.e).mul(float(1).sub(joint)); // the worn edge of each stone
    const tone = mix(float(0.84), float(1.12), id);
    c = c.mul(tone).mul(mix(float(1), float(0.42), joint)).mul(float(1).add(arris.mul(0.16)));
    c = c.mul(float(1).sub(seenSide.mul(0.3))).mul(float(1).sub(shade.mul(0.45)));
    rough = T.clamp(rough.add(id.sub(0.5).mul(0.12)).add(joint.mul(0.1)), marble ? 0.3 : 0.55, 1);
    // the mortar lies deeper: the stone's face turns away from it toward each joint
    const sU = T.sign(cell.fu.sub(0.5)), sV = T.sign(cell.fv.sub(0.5));
    const kU = smoothstep(0.08, 0.0, cell.du).mul(0.5), kV = smoothstep(0.08, 0.0, cell.dv).mul(0.5);
    const wallBend = hAxis.mul(sU.mul(kU)).add(vec3(0, 1, 0).mul(sV.mul(kV)));
    // each flagstone at its own slight tilt, so the floor never reads as one flat sheet
    const tilt = vec3(h(T.vec2(id, 2.1)).sub(0.5), 0, h(T.vec2(id, 4.2)).sub(0.5)).mul(0.12);
    const floorBend = vec3(sU.mul(kU), 0, sV.mul(kV)).add(tilt);
    dn = dn.add(mix(floorBend, wallBend, wall));
    if (band) {
      // the plinth: a little darker and rougher, weathered; the cornice: a moulding of three
      // rounded fillets and a hollow, paler where it catches the light, deep under its lip
      c = c.mul(mix(float(1), float(0.74), band.plinth.mul(wall)));
      // the drip under the cornice: a hard shadow line where it overhangs
      const drip = smoothstep(-0.22, -0.02, band.c0).mul(T.step(band.c0, 0)).mul(T.step(1.4, band.ly));
      c = c.mul(float(1).sub(drip.mul(wall).mul(0.55)));
      const q = band.c0.div(0.62); // 0 at the moulding's foot, 1 at its top
      const prof = T.sin(q.mul(Math.PI * 3)).mul(0.55).add(q.sub(0.5).mul(0.6));
      const co = band.cornice.mul(wall);
      dn = dn.add(vec3(0, prof, 0).mul(co));
      c = c.mul(mix(float(1), mix(float(0.5), float(1.3), smoothstep(-0.4, 0.5, prof)), co));
    }
  }
  m.colorNode = T.vec4(c, 1);
  m.roughnessNode = rough;
  m.normalNode = T.normalize(T.normalView.add(T.cameraViewMatrix.mul(T.vec4(dn, 0)).xyz));
  m.maskNode = seeThrough(n);
  return m;
}

/** A wall standing between the camera and the wanderer steps out of sight (the owner: going into a
    building, or a tour taking you in, "you are blinded by the walls"): its fragments near the line
    from the camera to the wanderer's chest thin away in a fine dither, so the view looks through
    to them; floors and ceilings stay (only upright faces), and so does all stone beyond the
    wanderer or right at its feet. Every building's stone is this material, so it holds for all of
    them: the monuments outside, their lobbies and rooms, the pyramid's chambers. */
function seeThrough(n: N): N {
  const a = T.cameraPosition, b = gpuUniforms.player.add(vec3(0, 1.2, 0)), ab = b.sub(a);
  const p = T.positionWorld;
  const t = T.dot(p.sub(a), ab).div(T.max(T.dot(ab, ab), 1e-3));
  const d = T.length(p.sub(a.add(ab.mul(T.clamp(t, 0, 1)))));
  const between = smoothstep(-0.05, 0.05, t).mul(smoothstep(0.96, 0.84, t));
  const upright = float(1).sub(smoothstep(0.55, 0.85, abs(n.y)));
  const hide = smoothstep(1.9, 1.0, d).mul(between).mul(upright).mul(0.97);
  const dither = T.fract(T.sin(T.dot(T.screenCoordinate.xy, T.vec2(12.9898, 78.233))).mul(43758.5453));
  return float(1).sub(hide).greaterThan(dither);
}

/** Contact shadow where a building meets the ground: a soft darkening laid on the ground round
    its foot, fading out over `spread` metres (a round footprint of radius `r`, or a `w` × `d`
    rectangle). Lie it just above the ground the building stands on. */
export function contactShade(shape: { r: number } | { w: number; d: number }, spread: number, k = 0.5): THREE.Mesh {
  const ext = "r" in shape ? shape.r * 2 : Math.max(shape.w, shape.d);
  const g = new THREE.PlaneGeometry(ext + spread * 2.2, ext + spread * 2.2);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const p = T.positionGeometry;
  const d = "r" in shape ? T.length(p.xz).sub(shape.r) : T.max(abs(p.x).sub(shape.w / 2), abs(p.z).sub(shape.d / 2));
  const a = smoothstep(spread, 0, d).pow(1.6).mul(k);
  m.colorNode = T.vec4(vec3(0.0, 0.0, 0.01), 1);
  m.opacityNode = a;
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 1;
  mesh.receiveShadow = false;
  return mesh;
}

/** Warm light spilling out of a doorway onto the ground before it: a pool widening from the
    threshold (`w` wide at the door) and fading over `len` metres; lay it just above the ground,
    its +z away from the door. Contained: a glow on the stone, never a glare. */
export function doorSpill(w: number, len: number, color = new THREE.Color(1, 0.72, 0.4), k = 0.3): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w * 2.4, len);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, len / 2);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: true, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const p = T.positionGeometry;
  const z = p.z.div(len);
  const half = mix(float(w * 0.5), float(w * 1.15), z);
  const across = smoothstep(half, half.mul(0.4), abs(p.x));
  const a = across.mul(smoothstep(1, 0, z).pow(1.8)).mul(smoothstep(0, 0.04, z)).mul(k);
  m.colorNode = T.vec4(vec3(color.r, color.g, color.b).mul(a), 1);
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 2;
  return mesh;
}

/** A cut stone block: a box with its edges rounded and its faces a little chipped and uneven, so
    no building reads as a stack of perfect boxes. */
export function stoneBlock(w: number, h: number, d: number, seed = 1): THREE.BufferGeometry {
  const r = Math.min(0.12, Math.min(w, h, d) * 0.08);
  const g = new RoundedBoxGeometry(w, h, d, 2, r);
  const p = g.attributes.position as THREE.BufferAttribute;
  const hash = (x: number, y: number, z: number) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // chips near the corners, a slow unevenness over the faces
    const corner = Math.min(1, (Math.abs(x) / (w / 2)) * (Math.abs(y) / (h / 2)) + (Math.abs(y) / (h / 2)) * (Math.abs(z) / (d / 2)) + (Math.abs(x) / (w / 2)) * (Math.abs(z) / (d / 2)));
    const k = 1 - corner * hash(Math.round(x * 20), Math.round(y * 20), Math.round(z * 20)) * 0.035 + Math.sin(x * 1.7 + z * 1.3 + y * 0.9 + seed) * 0.006;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function rng(seed: number): () => number {
  let s = Math.floor(Math.abs(seed)) % 2147483647 || 16807;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A wedge of a ring course: from angle a0 to a1, radii r0..r1, height y0..y1, its top edges a
    little worn (the outer rim lower) so no two blocks sit quite alike. */
function ringBlock(a0: number, a1: number, r0: number, r1: number, y0: number, y1: number, wear: number): THREE.BufferGeometry {
  const seg = Math.max(2, Math.ceil((a1 - a0) * 6));
  const shape = new THREE.Shape();
  for (let k = 0; k <= seg; k++) {
    const a = a0 + ((a1 - a0) * k) / seg;
    const p = [Math.cos(a) * r1, Math.sin(a) * r1];
    if (k === 0) shape.moveTo(p[0], p[1]);
    else shape.lineTo(p[0], p[1]);
  }
  for (let k = seg; k >= 0; k--) {
    const a = a0 + ((a1 - a0) * k) / seg;
    shape.lineTo(Math.cos(a) * r0, Math.sin(a) * r0);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  // wear: the outer top edge sinks a little
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > y1 - 0.01) p.setY(i, y - wear * Math.min(1, Math.max(0, (Math.hypot(x, z) - r0) / (r1 - r0))));
  }
  return g.index ? g.toNonIndexed() : g;
}

/** A rough standing stone: a tapered slab, its faces broken by noise, leaning a little. */
function standingStone(R: () => number, h: number): THREE.BufferGeometry {
  const w = 0.55 + R() * 0.3, d = 0.35 + R() * 0.2;
  const g = new THREE.BoxGeometry(w, h, d, 3, 6, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const ph = R() * 100;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (y + h / 2) / h; // 0 at the foot, 1 at the top
    const taper = 1 - t * 0.35;
    const bump = 1 + 0.12 * Math.sin(x * 7 + ph) * Math.sin(y * 3.1 + ph * 0.7) + 0.08 * Math.sin(z * 9 + y * 5 + ph);
    const top = t > 0.92 ? -(t - 0.92) * h * 0.6 * Math.abs(Math.sin(x * 4 + ph)) : 0; // a rounded, broken crown
    p.setXYZ(i, x * taper * bump, y + top + h / 2, z * taper * bump);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** The ground of a home: a round platform of fitted blocks (radius ~4.5 m, top at 0.12 m, sunk
    into the ground), a lower worn course round it, and a ring of seven standing stones (radius
    ~5.6 m), one of them fallen. Local to the home's centre. Returns the mesh and where its stones
    stand (for colliders). */
export function homePlatform(seed: number, base: number): { mesh: THREE.Group; stones: { x: number; z: number; r: number }[] } {
  const R = rng(seed * 7919 + 13);
  const parts: THREE.BufferGeometry[] = [];
  const monoliths: THREE.BufferGeometry[] = [];
  // the lower course: a ring of large blocks, half sunk, their joints wide
  const n1 = 14;
  for (let k = 0; k < n1; k++) {
    const a0 = (k / n1) * Math.PI * 2 + 0.012, a1 = ((k + 1) / n1) * Math.PI * 2 - 0.012;
    parts.push(ringBlock(a0, a1, 3.6, 4.7, -0.5, -0.06 + (R() - 0.5) * 0.05, 0.05 + R() * 0.06));
  }
  // the upper floor: a ring of paving round a round centre stone
  const n2 = 10;
  for (let k = 0; k < n2; k++) {
    const a0 = (k / n2) * Math.PI * 2 + 0.01 + 0.3, a1 = ((k + 1) / n2) * Math.PI * 2 - 0.01 + 0.3;
    parts.push(ringBlock(a0, a1, 1.5, 3.9, -0.3, 0.12 + (R() - 0.5) * 0.02, 0.02 + R() * 0.03));
  }
  const centre = new THREE.CylinderGeometry(1.46, 1.5, 0.44, 32).toNonIndexed();
  centre.translate(0, -0.1, 0);
  parts.push(centre);
  // the standing stones: seven, one fallen across the ring
  const stones: { x: number; z: number; r: number }[] = [];
  const fallen = Math.floor(R() * 7);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.22 + (R() - 0.5) * 0.12, r = 5.7 + (R() - 0.5) * 0.3;
    const h = 1.6 + R() * 1.1;
    const g = standingStone(R, h);
    const m = new THREE.Matrix4();
    if (k === fallen) {
      // lying where it fell, half in the grass
      m.compose(new THREE.Vector3(Math.cos(a) * (r + 0.6), -0.12, Math.sin(a) * (r + 0.6)), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.08, -a, 0.1)), new THREE.Vector3(1, 1, 1));
      g.translate(0, -h / 2, 0);
    } else {
      m.compose(new THREE.Vector3(Math.cos(a) * r, -0.25, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.12, -a + Math.PI / 2, (R() - 0.5) * 0.12)), new THREE.Vector3(1, 1, 1));
      stones.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: 0.45 });
    }
    g.applyMatrix4(m);
    monoliths.push(g);
  }
  // keep only the attributes all parts share
  const merge = (list: THREE.BufferGeometry[]) => {
    for (const g of list) for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    for (const g of list) if (!g.attributes.normal) g.computeVertexNormals();
    return mergeGeometries(list)!;
  };
  const group = new THREE.Group();
  for (const [list, mat] of [[parts, landStone("red_sandstone_pavement", base, 2.2, [0.92, 0.9, 0.88])], [monoliths, landStone("sandstone_cracks", base, 1.8)]] as const) {
    const mesh = new THREE.Mesh(merge(list as THREE.BufferGeometry[]), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { mesh: group, stones };
}
