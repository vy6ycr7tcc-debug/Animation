/* The crystal caverns (the owner: "a cave full of realistic crystals, where you can explore and
   explore deep in"). A place apart, entered by a cold fissure at the back of the cave nearest the
   shore: one long cave winding down about a hundred metres through the dark, its passages
   swelling into chambers and narrowing again, each with its own crystals:
   - the quartz gallery: formations of clear, smoky, blue and milky quartz rooted in lumps of the
     rock along its walls, some taller than you, each crystal its own surface;
   - the narrows: a tight, steep squeeze, small points glinting in the rock;
   - the amethyst geode: a round chamber lined with violet points all turned inward, its rock
     banded like agate;
   - the long descent: a steep winding passage of green and violet fluorite cubes;
   - the cathedral of selenite: the great chamber, crossed by beams of milky selenite ten and
     more metres long, as in the Cave of the Crystals at Naica;
   - the heart: the deepest chamber, a still pool round one great crystal breathing light.
   The cave is one tube swept along a winding path whose plan never crosses itself (so the floor
   under any point is the path's), its cross-section a rough arch with a level floor, its rock
   the scanned cliff face worn by water: flowstone, strata, wet low down, tiny glints of mica.
   Every crystal is a real hexagonal prism with its pyramid tip, faceted and lit from within.
   Walk back up to the fissure to leave. */
import { setWet } from "../gpu/wet";
import * as THREE from "three/webgpu";
import { T, gpuUniforms, type N } from "../gpu/tsl";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshBVH } from "three-mesh-bvh";
import { surface } from "./textures";
import { CAVE_SITES, SPAWN, colliders, heightAt, type Collider } from "./terrain";

export const CAVERN_ORIGIN = new THREE.Vector3(60000, 140, 0);
export const inCavern = (x: number): boolean => x > 55000;

/* ---- noise (CPU), for the rock's shape ---- */
function h3(x: number, y: number, z: number): number {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function vn3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(h3(ix, iy, iz), h3(ix + 1, iy, iz), u), l(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), u), v),
    l(l(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), u), l(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), u), v),
    w,
  );
}
const fbm3 = (x: number, y: number, z: number) => vn3(x, y, z) * 0.55 + vn3(x * 2.03 + 5, y * 2.03, z * 2.03 - 3) * 0.3 + vn3(x * 4.1 - 7, y * 4.1 + 1, z * 4.1) * 0.15;
let seed = 1;
const rnd = () => ((seed = (Math.imul(seed, 16807) + 11) % 2147483647), (seed & 0xffffff) / 0x1000000);

/* ---- the way down: control points (x, z, floor y, half-width, height, zone) ----
   zone: 0 rock, 1 quartz, 2 geode, 3 fluorite, 4 selenite, 5 heart */
type Ctrl = [number, number, number, number, number, number];
const CTRL: Ctrl[] = [
  [0, 6, 0.6, 1.4, 2.6, 0],
  [0, 0, 0, 2.2, 3.2, 0],
  [0.5, -22, -3, 2.4, 3.2, 0],
  [7, -42, -6, 6.5, 6.5, 1],
  [14, -60, -7, 11, 9.5, 1],
  [10, -80, -8, 7, 6.5, 1],
  [-4, -94, -12, 2.1, 2.9, 0],
  [-19, -102, -17, 2.3, 3, 0],
  [-34, -110, -21, 7, 8, 2],
  [-46, -124, -22, 10, 10.5, 2],
  [-49, -141, -23, 6, 6.5, 2],
  [-42, -158, -29, 3, 4, 3],
  [-27, -173, -36, 3.2, 4.4, 3],
  [-8, -186, -43, 3, 4.2, 3],
  [12, -195, -50, 3.4, 4.5, 3],
  [30, -206, -55, 9, 10, 4],
  [46, -228, -58, 21, 18, 4],
  [50, -258, -59, 23, 20, 4],
  [39, -283, -61, 12, 10, 4],
  [23, -296, -69, 3, 4, 0],
  [8, -310, -78, 3, 4, 0],
  [-4, -326, -84, 9, 8.5, 5],
  [-7, -342, -85, 7.5, 6.5, 5],
  [-8, -350, -85.2, 1.2, 1.4, 5],
];
/** Each chamber's name, said as you come into it, and the depth it lies at. */
const CHAMBERS: { name: string; at: number }[] = [
  { name: "The quartz gallery", at: 4 },
  { name: "The narrows", at: 6 },
  { name: "The amethyst geode", at: 9 },
  { name: "The long descent", at: 12 },
  { name: "The cathedral of selenite", at: 16 },
  { name: "The heart of the earth", at: 21 },
];
const STEP = 0.6; // metres between rings
const RING = 40; // vertices round each ring

interface Sample {
  x: number;
  z: number;
  y: number; // floor
  w: number; // half-width
  h: number; // height
  zone: number;
  tx: number;
  tz: number;
}
function samplePath(CTRL: Ctrl[]): Sample[] {
  const pts = CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const attr = CTRL.map(([, , y, w, h, zone]) => new THREE.Vector4(y, w, h, zone));
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
  const L = curve.getLength(), n = Math.ceil(L / STEP);
  const out: Sample[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, t = curve.getUtoTmapping(u, 0);
    const p = curve.getPoint(t), d = curve.getTangent(t);
    // the attributes eased between their control points (a smoothstep across each span)
    const f = t * (CTRL.length - 1), k = Math.min(CTRL.length - 2, Math.floor(f)), r = f - k, e = r * r * (3 - 2 * r);
    const a = attr[k], b = attr[k + 1];
    const hl = Math.hypot(d.x, d.z) || 1;
    out.push({ x: p.x, z: p.z, y: a.x + (b.x - a.x) * e, w: a.y + (b.y - a.y) * e, h: a.z + (b.z - a.z) * e, zone: r < 0.5 ? a.w : b.w, tx: d.x / hl, tz: d.z / hl });
  }
  return out;
}
/** How far the rock swells in (−) or out (+) of the round section at a point, as a fraction: broad
    swells and hollows and a finer roughness, gentler in the narrow passages (the crown stays
    over your head there). */
export const rockSwell = (x: number, y: number, z: number, r: number) =>
  ((fbm3(x * 0.13, y * 0.13, z * 0.13) - 0.5) * 0.95 + (vn3(x * 0.55, y * 0.55, z * 0.55) - 0.5) * 0.28 + (vn3(x * 2.1, y * 2.1, z * 2.1) - 0.5) * 0.06) * Math.min(1, Math.max(0.3, r / 4));
/** The floor's own small unevenness (the same for the mesh and for your feet). */
export const floorBump = (x: number, z: number) => (vn3(x * 0.45, 0.5, z * 0.45) - 0.5) * 0.28 + (vn3(x * 1.6, 3.5, z * 1.6) - 0.5) * 0.06;

/* ---- the rock ---- */
function rockMaterial(crust = true, origin = CAVERN_ORIGIN): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  const S = surface("cliff");
  const pw = T.positionWorld.sub(T.vec3(origin.x, origin.y, origin.z));
  const n = T.normalWorldGeometry;
  const wp = T.pow(T.abs(n), T.vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tri = (t: THREE.Texture, s: number) => T.texture(t, pw.zy.div(s)).mul(w.x).add(T.texture(t, pw.xz.div(s)).mul(w.y)).add(T.texture(t, pw.xy.div(s)).mul(w.z));
  const nz = (p: N) => T.mx_noise_float(p).mul(0.5).add(0.5);
  const zone = T.attribute("aZone", "float");
  const up = T.attribute("aUp", "float"); // 0 at the floor … 1 at the crown
  const diff = tri(S.diff, 3.2), arm = tri(S.arm, 3.2);
  const lum = T.dot(diff.rgb, T.vec3(0.3, 0.5, 0.2));
  // a dark limestone, its grain from the scan
  let c: N = T.mix(T.vec3(0.13, 0.115, 0.1), T.vec3(0.3, 0.27, 0.24), T.smoothstep(0.15, 0.6, lum)).mul(T.mix(T.float(0.45), T.float(1), arm.r));
  // strata, wavering, each bed its own tone
  const bed = pw.y.add(nz(pw.mul(0.12)).mul(1.6));
  c = c.mul(T.float(0.86).add(nz(T.vec3(bed.mul(1.4), 0.3, 0.7)).mul(0.28)));
  // flowstone: pale calcite poured down the walls in streaks, thicker low down
  const flow = T.smoothstep(0.62, 0.82, nz(T.vec3(pw.x.mul(1.3), pw.y.mul(0.12), pw.z.mul(1.3)))).mul(T.smoothstep(0.95, 0.2, up));
  c = T.mix(c, T.vec3(0.46, 0.42, 0.35).mul(lum.add(0.6)), flow.mul(0.55));
  // the geode: its rock banded as agate (blue-grey and white, in rings round the chamber)
  const geo = T.smoothstep(1.5, 2, zone).mul(T.smoothstep(2.5, 2, zone));
  const agate = T.sin(T.length(pw.xz.sub(T.vec2(-46, -124))).mul(3.4).add(nz(pw.mul(0.6)).mul(5))).mul(0.5).add(0.5);
  c = T.mix(c, T.mix(T.vec3(0.18, 0.2, 0.27), T.vec3(0.55, 0.55, 0.6), agate), geo.mul(0.65));
  // selenite country: pale gypsum rock; the heart: dark, with fine veins of quartz
  const sel = T.smoothstep(3.5, 4, zone).mul(T.smoothstep(4.5, 4, zone));
  c = T.mix(c, T.vec3(0.42, 0.37, 0.3).mul(lum.add(0.55)), sel.mul(0.55));
  const heart = T.smoothstep(4.5, 5, zone);
  const vein = T.smoothstep(0.012, 0.0, T.abs(nz(pw.mul(1.1)).sub(0.5))).mul(T.smoothstep(0.45, 0.6, nz(pw.mul(0.2).add(3))));
  c = T.mix(c.mul(T.mix(T.float(1), T.float(0.6), heart)), T.vec3(0.62, 0.6, 0.55), vein.mul(heart).mul(0.25));
  // wet low down: darker and glossier
  const wet = T.smoothstep(0.35, 0.0, up).mul(nz(pw.mul(0.4)).mul(0.6).add(0.4));
  c = c.mul(T.float(1).sub(wet.mul(0.35)));
  // tiny crystals in the rock: glints that catch the light from where you stand
  const cell = T.floor(pw.mul(26));
  const hsh = T.fract(T.sin(T.dot(cell, T.vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const V = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const glint = T.step(0.9975, hsh).mul(T.pow(T.max(T.dot(V, T.normalize(n.add(T.vec3(hsh.sub(0.5), 0.3, T.fract(hsh.mul(7.1)).sub(0.5))))), 0), 24)).mul(T.smoothstep(14, 3, T.length(T.cameraPosition.sub(T.positionWorld))));
  // a crust of small crystals grown over the rock (a druse): on the face's own plane, a field of
  // points, each a little pyramid whose six faces tilt the light their own way, bright at its
  // tip and dark where it meets its neighbours. All over the geode.
  const dom = T.select(w.y.greaterThan(T.max(w.x, w.z)), pw.xz, T.select(w.x.greaterThan(w.z), pw.zy, pw.xy));
  const q = dom.mul(9);
  const cellQ = T.floor(q);
  let best: N = T.float(9), off: N = T.vec2(0), idc: N = T.float(0);
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cc = cellQ.add(T.vec2(i, j));
      const hh = T.fract(T.sin(T.vec2(T.dot(cc, T.vec2(127.1, 311.7)), T.dot(cc, T.vec2(269.5, 183.3)))).mul(43758.5453));
      const pt = cc.add(hh.mul(0.8).add(0.1));
      const dv = pt.sub(q);
      const dd = T.dot(dv, dv);
      const closer = dd.lessThan(best);
      best = T.select(closer, dd, best);
      off = T.select(closer, dv, off);
      idc = T.select(closer, hh.x, idc);
    }
  const dist = T.sqrt(best);
  const sector = T.floor(T.atan(off.y, off.x).div(Math.PI / 3).add(idc.mul(6))).mul(Math.PI / 3);
  const tilt = T.vec2(T.cos(sector), T.sin(sector)).mul(T.smoothstep(0.0, 0.5, dist)).mul(0.9);
  const crustK = (crust ? T.float(1) : T.float(0)).mul(geo.mul(T.smoothstep(0.02, 0.18, up)));
  const tipK = T.smoothstep(0.55, 0.0, dist);
  const crustCol = T.mix(T.mix(T.vec3(0.82, 0.86, 0.95), T.vec3(0.55, 0.3, 0.95), geo), T.vec3(0.95, 0.85, 1), idc.mul(0.3));
  c = T.mix(c, crustCol.mul(T.float(0.04).add(tipK.mul(0.18))), crustK);
  // pools of still water lying in the floor's hollows: dark, and they mirror the cave (gpu/wet.ts)
  const pool = T.smoothstep(0.12, 0.02, up).mul(T.smoothstep(0.8, 0.95, n.y)).mul(T.smoothstep(0.6, 0.66, nz(pw.mul(0.28).add(7)).mul(0.7).add(nz(pw.mul(1.1)).mul(0.3)))).mul(T.float(1).sub(crustK));
  c = c.mul(T.float(1).sub(pool.mul(0.5)));
  setWet(m, T.max(wet.mul(0.4).mul(T.smoothstep(0.5, 0.9, n.y)), pool), pool);
  m.colorNode = T.vec4(c, 1);
  m.roughnessNode = T.mix(T.mix(T.clamp(arm.g, 0.6, 1), T.float(0.32), wet), T.float(0.08), crustK);
  // the crust's points glint as you move (each its own face toward you) and glow faintly at the tips
  const cg = T.pow(T.max(T.dot(V, T.normalize(n.add(T.vec3(tilt.x, 0.4, tilt.y)))), 0), 30).mul(tipK);
  m.emissiveNode = T.vec3(0.9, 0.85, 1).mul(glint).mul(0.5).add(crustCol.mul(cg.mul(0.9).add(tipK.mul(0.05))).mul(crustK));
  // relief from the scan, turned to each side
  const nm = (s: number) => [T.texture(S.nor, pw.zy.div(s)), T.texture(S.nor, pw.xz.div(s)), T.texture(S.nor, pw.xy.div(s))].map((x: N) => x.xy.mul(2).sub(1));
  const [ax, ay, az] = nm(3.2);
  const dn: N = T.vec3(0, ax.y, ax.x).mul(w.x).add(T.vec3(ay.x, 0, ay.y).mul(w.y)).add(T.vec3(az.x, az.y, 0).mul(w.z)).mul(T.float(1).sub(flow.mul(0.6)));
  // the crust's facets in the relief (on the plane they lie in)
  const tw = T.select(w.y.greaterThan(T.max(w.x, w.z)), T.vec3(tilt.x, 0, tilt.y), T.select(w.x.greaterThan(w.z), T.vec3(0, tilt.y, tilt.x), T.vec3(tilt.x, tilt.y, 0)));
  const dn2 = dn.mul(T.float(1).sub(crustK)).add(tw.mul(crustK));
  m.normalNode = T.normalize(T.normalView.add(T.cameraViewMatrix.mul(T.vec4(dn2, 0)).xyz));
  return m;
}

/* ---- crystals: hexagonal prisms with their pyramid tips, baked into a few geometries ---- */
class CrystalBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  u: number[] = [];
  glow: number[] = [];
  seedA: number[] = [];
  /** The crystal's middle (its axis, or a cube's centre): every face is turned to look away from it. */
  private axisA = new THREE.Vector3();
  private axisD: THREE.Vector3 | null = null;
  private tri(a: THREE.Vector3, b0: THREE.Vector3, c0: THREE.Vector3, ua: number, ub0: number, uc0: number, colr: THREE.Color, g: number, s: number): void {
    let b = b0, c = c0, ub = ub0, uc = uc0;
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const mid = a.clone().add(b).add(c).divideScalar(3);
    const out = mid.clone().sub(this.axisA);
    if (this.axisD) out.addScaledVector(this.axisD, -out.dot(this.axisD));
    if (nrm.dot(out) < 0) {
      [b, c, ub, uc] = [c, b, uc, ub];
      nrm.negate();
    }
    for (const [p, uu] of [[a, ua], [b, ub], [c, uc]] as [THREE.Vector3, number][]) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(nrm.x, nrm.y, nrm.z);
      this.col.push(colr.r, colr.g, colr.b);
      this.u.push(uu);
      this.glow.push(g);
      this.seedA.push(s);
    }
  }
  /** One crystal from `base` along `dir`: `len` long, `rad` across, its tip `tip` long; `flat`
      squeezes it into a blade (selenite); `taper` narrows it toward the tip. */
  prism(base: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, tip: number, colr: THREE.Color, glow: number, flat = 1, taper = 0.9, uBase = 0): void {
    const d = dir.clone().normalize();
    const a = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = new THREE.Vector3().crossVectors(d, a).normalize(), e2 = new THREE.Vector3().crossVectors(d, e1).normalize();
    const turn = rnd() * Math.PI;
    const s = rnd();
    const ring = (along: number, r: number) =>
      Array.from({ length: 6 }, (_, k) => {
        // a real crystal's faces are rarely equal: each its own width
        const ang = turn + (k / 6) * Math.PI * 2 + (k % 2 ? 0.06 : -0.04);
        const rr = r * (0.9 + ((k * 37 + Math.floor(s * 97)) % 7) * 0.03);
        return base.clone().addScaledVector(d, along).addScaledVector(e1, Math.cos(ang) * rr).addScaledVector(e2, Math.sin(ang) * rr * flat);
      });
    this.axisA.copy(base);
    this.axisD = d;
    const shaft = Math.max(0.01, len - tip);
    const r0 = ring(-rad * 0.6, rad), r1 = ring(shaft, rad * taper);
    const apex = base.clone().addScaledVector(d, len).addScaledVector(e1, (rnd() - 0.5) * rad * 0.25);
    const uTop = uBase + (1 - uBase) * (shaft / len);
    for (let k = 0; k < 6; k++) {
      const j = (k + 1) % 6;
      this.tri(r0[k], r1[k], r1[j], uBase, uTop, uTop, colr, glow, s);
      this.tri(r0[k], r1[j], r0[j], uBase, uTop, uBase, colr, glow, s);
      this.tri(r1[k], apex, r1[j], uTop, 1, uTop, colr, glow, s);
    }
  }
  /** A cube (fluorite), sitting on the rock. */
  cube(c: THREE.Vector3, size: number, colr: THREE.Color, glow: number): void {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
    const s = rnd();
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).multiplyScalar(size / 2).applyQuaternion(q).add(c);
    this.axisA.copy(c);
    this.axisD = null;
    const P = [v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1), v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)];
    const F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]];
    for (const [a, b, cc, d] of F) {
      this.tri(P[a], P[b], P[cc], 0.4, 0.8, 0.8, colr, glow, s);
      this.tri(P[a], P[cc], P[d], 0.4, 0.8, 0.4, colr, glow, s);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("aU", new THREE.Float32BufferAttribute(this.u, 1));
    g.setAttribute("aGlow", new THREE.Float32BufferAttribute(this.glow, 1));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(this.seedA, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Crystal: faceted and glossy, catching the lights on its faces; within, a light that gathers
    toward the tip, clouded by inclusions seen at depth (an offset along the view), a rim of light
    at its edges, brighter when you come close. Contained: the brightest tips just reach bloom. */
export const cavernUniforms = { uNear: T.uniform(0), uHeart: T.uniform(0) };
function crystalMaterial(instanced = false): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.05, metalness: 0.25 });
  const u = T.attribute("aU", "float");
  const col = instanced ? T.instancedBufferAttribute(iColAttr) : T.attribute("color", "vec3");
  const g = instanced ? T.float(0.95) : T.attribute("aGlow", "float");
  const s = instanced ? T.instancedBufferAttribute(iSeedAttr) : T.attribute("aSeed", "float");
  const V = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const n = T.normalize(T.normalWorld);
  const fres = T.pow(T.float(1).sub(T.abs(T.dot(n, V))), 3);
  // each facet its own brightness (a gem's faces never light alike), from its own direction
  const nf = T.normalWorldGeometry;
  const facet = T.fract(T.sin(T.dot(T.floor(nf.mul(3.7).add(s.mul(5))), T.vec3(12.9898, 78.233, 37.719))).mul(43758.5453)).mul(0.85).add(0.15);
  // inclusions and the light bent through it: a cloud and fine streaks seen deeper than the face
  const deep = T.positionWorld.sub(V.mul(0.3));
  const inner = T.mx_noise_float(deep.mul(2.4).add(s.mul(40))).mul(0.5).add(0.5);
  const phantom = T.smoothstep(0.58, 0.78, inner);
  const streak = T.smoothstep(0.7, 0.95, T.mx_noise_float(T.positionWorld.sub(V.mul(0.6)).mul(T.vec3(9, 1.2, 9)).add(s.mul(13))).mul(0.5).add(0.5));
  const near = T.smoothstep(6, 1.2, T.length(T.positionWorld.sub(gpuUniforms.player)));
  const breathe = T.sin(gpuUniforms.time.mul(0.5).add(s.mul(31))).mul(0.15).add(0.85);
  // Each crystal its own surface (the owner: "randomized textures"), by its seed:
  // - some frosted, etched matte by old water in patches, thicker toward the root (every root a
  //   little), evenly with a little variation (patches read as stains), the rest clear;
  // - growth striations across its faces, lines square to its length, as quartz has (fading where
  //   finer than a pixel);
  // - some stained rust at the root, from iron in the rock they grew from;
  // - its colour a little warmer or cooler, lighter or darker, than its neighbours'.
  const kind = T.fract(s.mul(7.31));
  const frostN = T.mx_noise_float(T.positionWorld.mul(3.1).add(s.mul(21))).mul(0.5).add(0.5);
  const frost = T.clamp(T.smoothstep(0.55, 0.78, kind).mul(frostN.mul(0.35).add(0.65)).mul(T.float(1).sub(u.mul(0.25))).add(T.smoothstep(0.22, 0.0, u).mul(0.45)), 0, 1);
  const sp = u.mul(T.float(55).add(T.fract(s.mul(5.7)).mul(60)));
  const stri = T.sin(sp.mul(6.2832)).mul(0.5).add(0.5).mul(T.float(1).sub(T.smoothstep(0.3, 0.8, T.fwidth(sp))));
  const stain = T.step(T.fract(s.mul(3.17)), 0.35).mul(T.smoothstep(0.38, 0.0, u)).mul(frostN.mul(0.6).add(0.4));
  const tint = T.mix(T.vec3(1.06, 0.98, 0.9), T.vec3(0.9, 0.97, 1.08), T.fract(s.mul(13.7))).mul(T.fract(s.mul(29.3)).mul(0.3).add(0.85));
  const colj = col.mul(tint);
  // the body dark and glassy (its colour seen through it), clouded milky where the inclusions
  // are, pale where frosted, rust where stained, its striations faintly drawn
  const clear = colj.mul(T.float(0.02).add(phantom.mul(0.05)));
  const body = T.mix(T.mix(clear, colj.mul(0.2).add(0.025), frost), T.vec3(0.15, 0.065, 0.022), stain.mul(0.8)).mul(T.float(1).sub(stri.mul(0.1)));
  m.colorNode = T.vec4(body, 1);
  // wet and clear, it mirrors the cave (the wet reflections, gpu/wet.ts), frosted less
  setWet(m, T.float(0.5).mul(T.float(1).sub(frost.mul(0.85))).mul(T.float(1).sub(stain.mul(0.5))));
  // the light within: faint at the root, gathering toward the tip, a slow band of it rising
  const band = T.smoothstep(0.86, 1, T.sin(u.mul(9).sub(gpuUniforms.time.mul(0.7)).add(s.mul(17))).mul(0.5).add(0.5)).mul(0.1);
  const within = T.float(0.012).add(T.pow(u, 2.6).mul(0.34)).add(band).add(phantom.mul(0.05)).add(streak.mul(0.1)).mul(facet.mul(facet));
  // what its faces mirror: the cave's lights as a few bright points (no world is reflected;
  // each flat face catches them at its own angle, so the crystal sparkles facet by facet)
  const r = T.reflect(V.negate(), n);
  const env = T.pow(T.abs(T.sin(r.x.mul(6.3).add(s.mul(9))).mul(T.sin(r.z.mul(5.1).add(r.y.mul(3.7)).add(s.mul(4))))), 22).mul(0.9).add(T.smoothstep(0.55, 1, r.y).mul(0.06));
  m.emissiveNode = colj
    .mul(colj)
    .mul(within)
    .mul(g)
    .mul(breathe)
    .mul(T.float(1).add(near.mul(0.7)))
    .mul(T.float(1).sub(stain.mul(0.75)))
    .mul(T.float(1).sub(stri.mul(0.15)))
    .add(colj.mul(fres).mul(0.22).mul(g.mul(0.5).add(0.5)))
    .add(T.mix(T.vec3(1), colj, 0.35).mul(env).mul(fres.mul(0.7).add(0.3)).mul(T.float(1).sub(frost.mul(0.8))));
  m.roughnessNode = T.mix(T.float(0.03).add(phantom.mul(0.16)), T.float(0.62), frost);
  return m;
}
/* The dense crusts (the geode's lining, the gallery's walls) are one small crystal drawn many
   times over, each turned, sized and coloured on its own. */
let iColAttr = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
let iSeedAttr = new THREE.InstancedBufferAttribute(new Float32Array(1), 1);
function unitCrystal(): THREE.BufferGeometry {
  const b = new CrystalBuilder();
  b.prism(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 1, 0.15, 0.27, new THREE.Color(1, 1, 1), 1, 1, 0.92);
  return b.build();
}

const C = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);

/** One underground place: its way down (control points: x, z, floor y, half-width, height, zone),
    its chambers, where it opens in the world, how its section is cut and what is built in it. */
export interface UndergroundSpec {
  /** Its name (the map, whispers, where you are). */
  label: string;
  /** What is said as you come in. */
  greeting: string;
  origin: THREE.Vector3;
  ctrl: Ctrl[];
  chambers: { name: string; at: number }[];
  /** The hollow in the world it opens from (its mouth faces `face`), and the doorway itself. */
  site: { x: number; y: number; z: number; face: number };
  door: THREE.Vector3;
  doorReach: number;
  /** "arch": a cave's rough arch over a level floor; "drift": a mine's squared tunnel. */
  section: "arch" | "drift";
  /** How much the rock swells and hollows (1 a cave; less in a cut tunnel). */
  swell: number;
  rock: (crust: boolean) => THREE.MeshStandardNodeMaterial;
  speleothems: boolean;
  hemi: [number, number, number];
  /** Builds its doorway in the world (into `u.world`). */
  exterior: (u: Underground) => void;
  /** Builds what fills it (crystals, timbers…), its lights and solids, after the rock. */
  decorate: (u: Underground) => void;
  /** Where you stand coming out, from the site toward its mouth (metres), facing out. */
  outsideAt: number;
}

/** A place apart underground (the crystal caverns, the gold mines): one long way down, swept as a
    tube along a path whose plan never crosses itself. */
export class Underground {
  readonly group = new THREE.Group(); // the cave (built on going in, freed on coming out)
  readonly world = new THREE.Group(); // the fissure at the back of the cave by the shore
  inside = false;
  /** The hollow in the world it opens from, the doorway, where you stand coming out. */
  readonly site: { x: number; y: number; z: number; face: number };
  readonly door = new THREE.Vector3();
  readonly O: THREE.Vector3;
  samples: Sample[] = [];
  private grid = new Map<number, number[]>();
  private lights: THREE.PointLight[] = [];
  /** Its lights (the nearest four are lit), and what stands solid in it, filled by `decorate`. */
  sources: { p: THREE.Vector3; c: THREE.Color; k: number; r: number }[] = [];
  private hemi: THREE.HemisphereLight;
  solids: Collider[] = [];
  private builtParts: THREE.Object3D[] = [];
  /** The tube's chunks while it is being decorated (what `anchor` casts against), then let go. */
  private chunks: { c0: number; c1: number; bvh: MeshBVH | null; mesh: THREE.Mesh }[] = [];
  private told = new Set<number>();
  /** Its heart (the crystal caverns' great crystal), if it has one: heard near. */
  readonly heart = new THREE.Vector3();
  hasHeart = false;
  private heartK = 0;

  constructor(readonly spec: UndergroundSpec) {
    this.O = spec.origin;
    this.site = spec.site;
    this.door.copy(spec.door);
    this.hemi = new THREE.HemisphereLight(spec.hemi[0], spec.hemi[1], spec.hemi[2]);
    spec.exterior(this);
    this.samples = samplePath(spec.ctrl);
    this.samples.forEach((s, i) => {
      const k = this.key(s.x, s.z);
      (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(i);
    });
    this.group.visible = false;
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 30, 1.6);
      l.castShadow = false;
      this.lights.push(l);
      this.group.add(l);
    }
    this.group.add(this.hemi);
  }

  /** The section's shape at angle θ (0 the floor's middle, π the crown): a round arch, or a
      squared drift (a superellipse), half-width a, half-height b. */
  private ring(th: number, a: number, b: number): [number, number] {
    if (this.spec.section === "arch") return [a * Math.sin(th), -b * Math.cos(th)];
    const sn = Math.sin(th), cs = Math.cos(th);
    return [a * Math.sign(sn) * Math.pow(Math.abs(sn), 0.5), -b * Math.sign(cs) * Math.pow(Math.abs(cs), 0.5)];
  }
  /** How high the section's centre stands over the floor (of its half-height), and how much of
      its width is level floor. */
  private get ycK(): number {
    return this.spec.section === "arch" ? 0.75 : 0.9;
  }
  private get floorFrac(): number {
    return this.spec.section === "arch" ? 0.6 : 0.8;
  }
  private key(x: number, z: number): number {
    return (Math.floor(x / 4) + 5000) * 10007 + (Math.floor(z / 4) + 5000);
  }
  /** The path sample nearest a point (local frame). */
  private nearest(lx: number, lz: number): number {
    const cx = Math.floor(lx / 4), cz = Math.floor(lz / 4);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 6 && best < 0; r += 2)
      for (let j = cz - r; j <= cz + r; j++)
        for (let i = cx - r; i <= cx + r; i++) {
          const list = this.grid.get((i + 5000) * 10007 + (j + 5000));
          if (!list) continue;
          for (const k of list) {
            const s = this.samples[k], d = (s.x - lx) ** 2 + (s.z - lz) ** 2;
            if (d < bd) (bd = d), (best = k);
          }
        }
    if (best < 0) {
      for (let k = 0; k < this.samples.length; k++) {
        const s = this.samples[k], d = (s.x - lx) ** 2 + (s.z - lz) ** 2;
        if (d < bd) (bd = d), (best = k);
      }
    }
    return best;
  }

  /** The floor under a point inside. */
  floorAt(x: number, z: number): number {
    const lx = x - this.O.x, lz = z - this.O.z;
    const s = this.samples[this.nearest(lx, lz)];
    return this.O.y + s.y + floorBump(lx, lz);
  }
  /** Keep the wanderer on the cave's floor; true when it has walked back out of the fissure. */
  confine(p: THREE.Vector3): boolean {
    const lx = p.x - this.O.x, lz = p.z - this.O.z;
    const i = this.nearest(lx, lz), s = this.samples[i];
    const dx = lx - s.x, dz = lz - s.z;
    const along = dx * s.tx + dz * s.tz, lat = dx * -s.tz + dz * s.tx;
    if (i <= 1 && along < -0.4) return true;
    const lim = Math.max(0.5, s.w * this.floorFrac - 0.45);
    let nl = lat, na = along;
    if (Math.abs(lat) > lim) nl = Math.sign(lat) * lim;
    if (i >= this.samples.length - 4) na = Math.min(along, 0);
    if (nl !== lat || na !== along) {
      p.x = this.O.x + s.x + s.tx * na - s.tz * nl;
      p.z = this.O.z + s.z + s.tz * na + s.tx * nl;
    }
    return false;
  }
  /** Standing at the fissure, on foot. */
  atDoor(p: THREE.Vector3): boolean {
    // (the cave's own crystals stand solid just before the fissure: its reach comes out past them)
    return Math.hypot(p.x - this.door.x, p.z - this.door.z) < this.spec.doorReach && Math.abs(p.y - this.door.y) < 2.5;
  }
  /** Where you stand coming in: a few steps in, facing down the way. */
  entry(): { x: number; y: number; z: number; heading: number } {
    const s = this.samples[6];
    const x = this.O.x + s.x, z = this.O.z + s.z;
    return { x, y: this.floorAt(x, z), z, heading: Math.atan2(-s.tx, -s.tz) };
  }
  /** A place along the way (0 the fissure … 1 the end), facing on down it: for stills. */
  spot(f: number): { x: number; y: number; z: number; heading: number } {
    const s = this.samples[Math.round(f * (this.samples.length - 1))];
    const x = this.O.x + s.x, z = this.O.z + s.z;
    return { x, y: this.floorAt(x, z), z, heading: Math.atan2(-s.tx, -s.tz) };
  }
  /** A few steps before chamber `i`, looking into it: for stills. */
  chamberSpot(i: number, back = 14): { x: number; y: number; z: number; heading: number } {
    const [cx, cz] = this.spec.ctrl[this.spec.chambers[i].at];
    let k = 0, bd = Infinity;
    this.samples.forEach((s, j) => {
      const d = Math.hypot(s.x - cx, s.z - cz);
      if (d < bd) (bd = d), (k = j);
    });
    const sp = this.spot(Math.max(0, k - back) / (this.samples.length - 1));
    if (back > 0) sp.heading = Math.atan2(-(this.O.x + cx - sp.x), -(this.O.z + cz - sp.z));
    return sp;
  }
  /** Where you stand coming out: in the cave by the shore, turned toward its mouth. */
  outside(): { x: number; z: number; heading: number } {
    const f = this.site.face, x = this.site.x + Math.cos(f) * this.spec.outsideAt, z = this.site.z + Math.sin(f) * this.spec.outsideAt;
    return { x, z, heading: Math.atan2(-Math.cos(f), -Math.sin(f)) };
  }
  /** The chamber you are in (its name), or null in a passage. */
  chamber(p: THREE.Vector3): { name: string; depth: number; i: number } | null {
    const lx = p.x - this.O.x, lz = p.z - this.O.z;
    let best = -1, bd = Infinity;
    this.spec.chambers.forEach((c, i) => {
      const [x, z] = this.spec.ctrl[c.at];
      const d = Math.hypot(lx - x, lz - z);
      if (d < bd) (bd = d), (best = i);
    });
    const c = this.spec.chambers[best], w = this.spec.ctrl[c.at][3];
    if (bd > Math.max(5, w * 0.9)) return null;
    return { name: c.name, depth: Math.round(-this.spec.ctrl[c.at][2] + 6), i: best };
  }
  /** Say a chamber's name the first time you come into it (once a visit). */
  arrived(p: THREE.Vector3): string | null {
    const c = this.chamber(p);
    if (!c || this.told.has(c.i)) return null;
    this.told.add(c.i);
    return `${c.name} · ${c.depth} m down`;
  }

  show(on: boolean): void {
    this.inside = on;
    if (on) {
      this.build();
      this.told.clear();
      for (const c of this.solids) colliders.push(c);
    } else {
      for (const c of this.solids) {
        const k = colliders.indexOf(c);
        if (k >= 0) colliders.splice(k, 1);
      }
      this.unbuild();
    }
    this.group.visible = on;
  }

  update(t: number, player: THREE.Vector3): void {
    if (!this.inside) return;
    // the lights of the nearest crystals (the cave has no other)
    const ranked = this.sources.map((s) => ({ s, d: s.p.distanceTo(player) })).sort((a, b) => a.d - b.d);
    this.lights.forEach((l, i) => {
      const r = ranked[i];
      if (!r) return void (l.intensity = 0);
      l.position.copy(r.s.p);
      l.color.copy(r.s.c);
      l.distance = r.s.r;
      const breath = 0.88 + 0.12 * Math.sin(t * 0.5 + i * 1.7);
      l.intensity = r.s.k * breath * (r.d < r.s.r * 1.3 ? 1 : 0);
    });
    this.heartK = this.hasHeart ? THREE.MathUtils.clamp(1 - (this.heart.distanceTo(player) - 4) / 18, 0, 1) : 0;
  }
  /** What the gaze rests on in contemplation: the nearest of the crystals' lights. */
  focus(player: THREE.Vector3): THREE.Vector3[] {
    return this.sources
      .map((s) => ({ p: s.p, d: s.p.distanceTo(player) }))
      .filter((x) => x.d < 40)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.p);
  }
  /** How near the heart's crystal (0 far … 1 beside it), for its hum. */
  get heartNear(): number {
    return this.heartK;
  }

  /* ---------------------------------------------------------------- the cave, built on going in */
  private build(): void {
    if (this.builtParts.length) return;
    seed = 7;
    const S = this.samples, O = this.O;
    const rock = this.spec.rock(true);
    rock.side = THREE.FrontSide;
    // the tube, in chunks (so the camera's walls test only what is near)
    const CH = 48;
    for (let c0 = 0; c0 < S.length - 1; c0 += CH) {
      const c1 = Math.min(S.length - 1, c0 + CH);
      const pos: number[] = [], zone: number[] = [], upA: number[] = [], idx: number[] = [];
      for (let i = c0; i <= c1; i++) {
        const s = S[i], nx = -s.tz, nz = s.tx;
        const a = s.w, b = s.h / 2, yc = s.y + b * this.ycK;
        for (let j = 0; j <= RING; j++) {
          const th = (j / RING) * Math.PI * 2;
          let [lat, up] = this.ring(th, a, b);
          const wx = s.x + nx * lat, wz = s.z + nz * lat;
          let y = yc + up;
          const floor = s.y + floorBump(wx, wz);
          if (y <= floor + 0.02) y = floor;
          else {
            // the rock's own shape: swells and hollows, larger in the great chambers
            const k = rockSwell(wx, y, wz, Math.min(a, b)) * this.spec.swell;
            const rise = Math.min(1, (y - floor) / 0.8);
            lat *= 1 + k * rise;
            up = (y - yc) * (1 + k * rise * 0.8);
            y = Math.max(floor, yc + up);
          }
          pos.push(O.x + s.x + nx * lat, O.y + y, O.z + s.z + nz * lat);
          zone.push(s.zone);
          upA.push(Math.min(1, Math.max(0, (y - s.y) / Math.max(1, s.h))));
        }
      }
      const rows = c1 - c0;
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < RING; j++) {
          const a = i * (RING + 1) + j, b = a + 1, c = a + RING + 1, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("aZone", new THREE.Float32BufferAttribute(zone, 1));
      g.setAttribute("aUp", new THREE.Float32BufferAttribute(upA, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      // the faces must look inward: if the first ring's floor normal points down, turn them
      const n = g.getAttribute("normal");
      if (n.getY(0) < 0) {
        const ix = g.getIndex()!;
        for (let k = 0; k < ix.count; k += 3) {
          const t = ix.getX(k + 1);
          ix.setX(k + 1, ix.getX(k + 2));
          ix.setX(k + 2, t);
        }
        g.computeVertexNormals();
      }
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, rock);
      mesh.receiveShadow = true;
      this.add(mesh);
      this.chunks.push({ c0, c1, bvh: null, mesh });
    }
    // stalactites from the crown, stalagmites rising to meet them by the walls, and blocks fallen
    // from the roof lying at the floor's edges: in the cave's own rock
    const parts: THREE.BufferGeometry[] = [];
    const tag = (g: THREE.BufferGeometry, zone: number, upK: number) => {
      const c = g.getAttribute("position").count;
      g.setAttribute("aZone", new THREE.Float32BufferAttribute(new Float32Array(c).fill(zone), 1));
      g.setAttribute("aUp", new THREE.Float32BufferAttribute(new Float32Array(c).fill(upK), 1));
      return g;
    };
    const lumpy = (g: THREE.BufferGeometry, amt: number) => {
      const p = g.getAttribute("position");
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
        const f = 1 + (vn3(x * 2.3 + 7, y * 2.3, z * 2.3) - 0.5) * amt;
        p.setXYZ(k, x * f, y, z * f);
      }
      g.computeVertexNormals();
      return g;
    };
    for (let i = 10; i < S.length - 8 && this.spec.speleothems; i += 3) {
      const s = S[i];
      if (s.h < 3.6 || rnd() > 0.5) continue;
      // a stalactite hanging from near the crown
      const th = Math.PI + (rnd() - 0.5) * 1.6;
      const { p } = this.wallAt(i, th);
      const len = Math.min(s.h * 0.35, 0.5 + Math.pow(rnd(), 2) * 3.2);
      const g = lumpy(new THREE.ConeGeometry(len * 0.16 + 0.05, len, 7, 4), 0.35);
      g.rotateX(Math.PI);
      g.translate(p.x, p.y - len / 2 + 0.1, p.z);
      parts.push(tag(g, s.zone, 1));
      // and below it, often, its stalagmite (if it stands clear of the way)
      const lat = Math.abs(Math.sin(th)) * s.w;
      if (rnd() < 0.55 && lat > s.w * 0.6 * 0.6 - 0.45 + 0.8) {
        const h = 0.4 + rnd() * Math.min(2.4, s.h * 0.3);
        const gx = p.x, gz = p.z, gy = this.floorAt(gx, gz);
        const m = lumpy(new THREE.ConeGeometry(h * 0.28 + 0.1, h, 8, 4), 0.3);
        m.translate(gx, gy + h / 2 - 0.05, gz);
        parts.push(tag(m, s.zone, 0.1));
      }
    }
    for (let i = 12; i < S.length - 8; i += this.spec.speleothems ? 5 : 9) {
      const s = S[i];
      if (rnd() > 0.45) continue;
      // fallen blocks at the floor's edges, never on the way itself
      const side = rnd() < 0.5 ? 1 : -1;
      const lat = side * (s.w * 0.62 + rnd() * s.w * 0.15);
      const x = O.x + s.x - s.tz * lat, z = O.z + s.z + s.tx * lat;
      const r = 0.3 + Math.pow(rnd(), 2) * Math.min(2.2, s.w * 0.18);
      const g = new THREE.IcosahedronGeometry(1, 1);
      const pp = g.getAttribute("position");
      for (let k = 0; k < pp.count; k++) {
        const vx = pp.getX(k), vy = pp.getY(k), vz = pp.getZ(k);
        const f = 0.8 + vn3(vx * 1.7 + i, vy * 1.7, vz * 1.7) * 0.45;
        pp.setXYZ(k, vx * f * r * (1 + rnd() * 0.3), Math.max(-0.4, vy * f) * r * 0.7, vz * f * r);
      }
      g.computeVertexNormals();
      g.rotateY(rnd() * 6.28);
      g.translate(x, this.floorAt(x, z) + r * 0.15, z);
      parts.push(tag(g.toNonIndexed(), s.zone, 0.15));
    }
    if (parts.length) {
      const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
      merged.computeBoundingSphere();
      const sp = new THREE.Mesh(merged, this.spec.rock(false));
      this.add(sp);
    }
    // the way out: daylight, faint, beyond the fissure behind you
    const out = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 24),
      (() => {
        const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
        const a = T.smoothstep(1, 0.1, T.length(T.uv().sub(0.5)).mul(2));
        m.colorNode = T.vec4(T.vec3(0.45, 0.5, 0.62).mul(a).mul(0.5), 1);
        return m;
      })(),
    );
    out.position.set(O.x + S[0].x, O.y + S[0].y + 1.2, O.z + S[0].z + 0.4);
    this.add(out);
    this.sources = [];
    this.solids = [];
    this.spec.decorate(this);
    this.chunks = [];
  }
  add(o: THREE.Object3D): void {
    this.group.add(o);
    this.builtParts.push(o);
  }
  private unbuild(): void {
    for (const o of this.builtParts) {
      this.group.remove(o);
      o.traverse((x) => {
        const m = x as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mat = m.material as THREE.Material;
          mat.dispose();
        }
      });
    }
    this.builtParts = [];
    this.sources = [];
  }

  /** Where the rock truly is at sample i, angle θ: a ray from the section's middle out toward
      `wallAt`'s point, cast against the tube as built (its swells and hollows included), so what
      grows on a wall roots in it and never hangs in the air. The normal faces into the cave. */
  anchor(i: number, th: number): { p: THREE.Vector3; n: THREE.Vector3 } {
    const w = this.wallAt(i, th);
    const s = this.samples[i], O = this.O;
    const c = new THREE.Vector3(O.x + s.x, O.y + s.y + s.h * 0.45, O.z + s.z);
    const dir = w.p.clone().sub(c);
    const reach = dir.length() * 1.6 + 2;
    dir.normalize();
    const ray = new THREE.Ray(c, dir);
    let best: { p: THREE.Vector3; n: THREE.Vector3; d: number } | null = null;
    for (const ch of this.chunks) {
      if (i < ch.c0 - 1 || i > ch.c1 + 1) continue;
      ch.bvh ??= new MeshBVH(ch.mesh.geometry);
      const hit = ch.bvh.raycastFirst(ray, THREE.DoubleSide);
      if (hit && hit.distance < reach && (!best || hit.distance < best.d)) {
        const n = hit.face!.normal.clone();
        if (n.dot(dir) > 0) n.negate();
        best = { p: hit.point.clone(), n, d: hit.distance };
      }
    }
    return best ?? w;
  }

  /** The rock under a point near sample i: a ray from a little out in front of `p` back along
      `-n`. Null if there is no rock within reach (the point then stays where it was). */
  onRock(i: number, p: THREE.Vector3, n: THREE.Vector3, reach = 1.6): THREE.Vector3 | null {
    const ray = new THREE.Ray(p.clone().addScaledVector(n, 0.6), n.clone().negate());
    let best: THREE.Vector3 | null = null, bd = Infinity;
    for (const ch of this.chunks) {
      if (i < ch.c0 - 1 || i > ch.c1 + 1) continue;
      ch.bvh ??= new MeshBVH(ch.mesh.geometry);
      const hit = ch.bvh.raycastFirst(ray, THREE.DoubleSide);
      if (hit && hit.distance < reach + 0.6 && hit.distance < bd) (bd = hit.distance), (best = hit.point.clone());
    }
    return best;
  }

  /** A point on the wall of sample i at angle θ (0 the floor's middle, π the crown), with the
      direction into the cave there. */
  wallAt(i: number, th: number): { p: THREE.Vector3; n: THREE.Vector3 } {
    const s = this.samples[i], O = this.O;
    const a = s.w, b = s.h / 2, yc = s.y + b * this.ycK;
    const [lat, up] = this.ring(th, a, b);
    let y = yc + up;
    const wx = s.x - s.tz * lat, wz = s.z + s.tx * lat;
    const floor = s.y + floorBump(wx, wz);
    y = Math.max(floor, y);
    const k = rockSwell(wx, y, wz, Math.min(a, b)) * this.spec.swell;
    const rise = Math.min(1, (y - floor) / 0.8);
    const L = lat * (1 + k * rise), U = (y - yc) * (1 + k * rise * 0.8);
    const p = new THREE.Vector3(O.x + s.x - s.tz * L, O.y + Math.max(floor, yc + U), O.z + s.z + s.tx * L);
    const c = new THREE.Vector3(O.x + s.x, O.y + yc, O.z + s.z);
    const n = c.sub(p).normalize();
    if (y <= floor + 0.05) n.set(0, 1, 0);
    return { p, n };
  }
}

/** The crystal caverns: their fissure in the cave nearest the shore, and their crystals. */
export class Cavern extends Underground {
  constructor() {
    // the cave nearest the shore, its fissure at the back of the hollow (wilds.ts builds the cave)
    let best = CAVE_SITES[0];
    for (const c of CAVE_SITES) if (Math.hypot(c.x - SPAWN.x, c.z - SPAWN.z) < Math.hypot(best.x - SPAWN.x, best.z - SPAWN.z)) best = c;
    const R = 7.5;
    const bx = best.x - Math.cos(best.face) * R * 0.74, bz = best.z - Math.sin(best.face) * R * 0.74;
    super({
      label: "The crystal caverns",
      greeting: "The crystal caverns. The way winds down a long way into the dark: walk on, and back up to this fissure to come out.",
      origin: CAVERN_ORIGIN,
      ctrl: CTRL,
      chambers: CHAMBERS,
      site: best,
      door: new THREE.Vector3(bx, heightAt(bx, bz), bz),
      // (the cave's own crystals stand solid just before the fissure: its reach comes out past them)
      doorReach: 2.3,
      section: "arch",
      swell: 1,
      rock: (crust) => rockMaterial(crust),
      speleothems: true,
      hemi: [0x5a5070, 0x1a140f, 0.9],
      exterior: (u) => (u as Cavern).buildFissure(),
      decorate: (u) => (u as Cavern).buildCrystals(),
      outsideAt: -1.5,
    });
  }

  /* ---------------------------------------------------------------- the world's fissure */
  buildFissure(): void {
    const f = this.site.face;
    // a tall jagged crack, black within, cold violet light standing in it
    const sh = new THREE.Shape();
    const hgt = 2.9, wid = 0.75;
    const pts: [number, number][] = [];
    for (let k = 0; k <= 10; k++) pts.push([wid * Math.sin((k / 10) * Math.PI) * (0.7 + ((k * 7) % 5) * 0.08), (k / 10) * hgt]);
    for (let k = 10; k >= 0; k--) pts.push([-wid * Math.sin((k / 10) * Math.PI) * (0.65 + ((k * 3) % 4) * 0.1), (k / 10) * hgt]);
    sh.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) sh.lineTo(x, y);
    const crack = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicNodeMaterial({ color: 0x020104 }));
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 3.6),
      (() => {
        const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
        const uv = T.uv().sub(0.5);
        const a = T.smoothstep(0.5, 0.0, T.length(uv.mul(T.vec2(1.6, 1)))).mul(T.sin(gpuUniforms.time.mul(0.6)).mul(0.15).add(0.85));
        m.colorNode = T.vec4(T.vec3(0.32, 0.22, 0.6).mul(a).mul(0.6), 1);
        return m;
      })(),
    );
    glow.position.set(0, 1.4, 0.06);
    const g = new THREE.Group();
    g.add(crack, glow);
    // a few crystals at its foot, the first of what lies within
    seed = 99;
    const b = new CrystalBuilder();
    for (let k = 0; k < 9; k++) {
      const side = k % 2 ? 1 : -1;
      const base = new THREE.Vector3(side * (0.5 + rnd() * 0.7), 0, 0.15 + rnd() * 0.5);
      const dir = new THREE.Vector3(side * (0.2 + rnd() * 0.5), 1, rnd() * 0.4);
      const len = 0.25 + rnd() * 0.55;
      b.prism(base, dir, len, len * 0.16, len * 0.25, C("#cdd6ff", 0.9), 0.8);
    }
    g.add(new THREE.Mesh(b.build(), crystalMaterial()));
    g.position.copy(this.door);
    g.rotation.y = Math.PI / 2 - f; // facing the mouth (+face)
    this.world.add(g);
  }

  buildCrystals(): void {
    const S = this.samples, O = this.O;
    const b = new CrystalBuilder();
    const light = (i: number, c: THREE.Color, k: number, r: number, lift = 0.6) => {
      const s = S[i];
      this.sources.push({ p: new THREE.Vector3(O.x + s.x, O.y + s.y + s.h * lift, O.z + s.z), c, k, r });
    };
    // the crusts: many small crystals over a stretch of wall, all drawn as one (instanced)
    const crust: { p: THREE.Vector3; d: THREE.Vector3; len: number; c: THREE.Color }[] = [];
    const lining = (i: number, p: THREE.Vector3, nn: THREE.Vector3, count: number, size: number, col: () => THREE.Color, spread = 0.3) => {
      const a = Math.abs(nn.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const t1 = new THREE.Vector3().crossVectors(nn, a).normalize(), t2 = new THREE.Vector3().crossVectors(nn, t1);
      for (let k = 0; k < count; k++) {
        const d = nn.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(spread * 2)).normalize();
        const len = size * (0.4 + Math.pow(rnd(), 1.8) * 1.3);
        const q = p.clone().addScaledVector(t1, (rnd() - 0.5) * 1.6).addScaledVector(t2, (rnd() - 0.5) * 1.6);
        const r = this.onRock(i, q, nn);
        if (r) q.copy(r);
        q.addScaledVector(nn, -len * 0.18 - 0.04);
        crust.push({ p: q, d, len, c: col() });
      }
    };
    const n = S.length;
    // Formations (the owner: scattered small crystals "look pretty fake… larger structures"): a
    // cluster grows from one lump of the cave's own rock, rooted where the rock truly is
    // (`anchor`): one great crystal, two or three lesser ones fanned about it, and a skirt of
    // small ones at its foot leaning outward, each turned and sized on its own; the great ones
    // lean toward the open cave, as crystals grow toward the space they have.
    const up = new THREE.Vector3(0, 1, 0);
    const mounds: THREE.BufferGeometry[] = [];
    const formation = (i: number, th: number, L: number, col: () => THREE.Color, glow: number, o: { lift?: number; flat?: number; mound?: boolean } = {}) => {
      const { p, n: nn } = this.anchor(i, th);
      const d0 = nn.clone().addScaledVector(up, o.lift ?? 0.4).normalize();
      const a = Math.abs(nn.y) < 0.9 ? up : new THREE.Vector3(1, 0, 0);
      const t1 = new THREE.Vector3().crossVectors(nn, a).normalize(), t2 = new THREE.Vector3().crossVectors(nn, t1);
      const mr = L * 0.26 + 0.12;
      if (o.mound !== false) {
        const g = new THREE.IcosahedronGeometry(1, 2);
        const pp = g.getAttribute("position");
        const sx = 1.1 + rnd() * 0.4, sy = 0.55 + rnd() * 0.2;
        for (let k = 0; k < pp.count; k++) {
          const vx = pp.getX(k), vy = pp.getY(k), vz = pp.getZ(k);
          const f = 0.82 + vn3(vx * 2.1 + i, vy * 2.1, vz * 2.1 + th) * 0.36;
          pp.setXYZ(k, vx * f * sx, vy * f * sy, vz * f * sx);
        }
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, nn));
        g.scale(mr, mr, mr);
        g.translate(p.x - nn.x * mr * 0.25, p.y - nn.y * mr * 0.25, p.z - nn.z * mr * 0.25);
        g.computeVertexNormals();
        const c = g.getAttribute("position").count;
        g.setAttribute("aZone", new THREE.Float32BufferAttribute(new Float32Array(c).fill(S[i].zone), 1));
        g.setAttribute("aUp", new THREE.Float32BufferAttribute(new Float32Array(c).fill(0.3), 1));
        g.deleteAttribute("uv");
        mounds.push(g);
      }
      const fan = (count: number, lo: number, hi: number, lean: number, ring: number) => {
        for (let k = 0; k < count; k++) {
          const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * ring * mr;
          const out = t1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang));
          const dir = d0.clone().addScaledVector(out, lean * (0.4 + rr / mr) + (rnd() - 0.5) * lean * 0.4).normalize();
          const len = L * (lo + rnd() * (hi - lo));
          const rad = len * (0.1 + rnd() * 0.05);
          // each crystal roots in the rock under its own foot (on a bulging wall a step to the side
          // of the cluster's middle is already in the air)
          const foot = p.clone().addScaledVector(out, rr);
          const onR = this.onRock(i, foot, nn);
          if (onR) foot.copy(onR);
          const base = foot.addScaledVector(dir, -len * 0.08 - rad * 0.5);
          b.prism(base, dir, len, rad, rad * (1.5 + rnd() * 0.9), col(), glow, o.flat ?? 1, 0.86 + rnd() * 0.12);
        }
      };
      fan(1, 0.88, 1.0, 0.1, 0.15);
      fan(2 + Math.floor(rnd() * 2), 0.42, 0.72, 0.32, 0.55);
      fan(5 + Math.floor(rnd() * 6), 0.12, 0.36, 0.75, 1.05);
      if (L > 1.2 && nn.y > 0.25) this.solids.push({ x: p.x, z: p.z, r: mr + 0.25, top: p.y + L });
    };
    // one colour to a formation, each crystal a little its own
    const pick = (c: THREE.Color) => () => c.clone().multiplyScalar(0.9 + rnd() * 0.2);
    const quartzKind = () => {
      const r = rnd();
      return pick(r < 0.45 ? C("#d8e6ff", 1.25) : r < 0.7 ? C("#a8968a", 1.05) : r < 0.88 ? C("#b9d2ff", 1.3) : C("#eef0f6", 0.95));
    };
    const amethyst = () => C("#9b4dff", 1.35).lerp(C("#e0c2ff", 1.2), rnd() * 0.4);
    for (let i = 8; i < n - 6; i++) {
      const s = S[i], z = s.zone;
      if (z === 1) {
        // the quartz gallery: formations along both walls, a few great ones by the way, now and
        // then one hanging from the roof
        if ((i - 8) % 3 === 0) {
          const side = (i / 3) % 2 < 1 ? 1 : -1;
          const r = rnd();
          if (r < 0.62) formation(i, side * (0.95 + rnd() * 0.55), 0.9 + rnd() * 1.4, quartzKind(), 0.85);
          else if (r < 0.9) formation(i, side * (1.5 + rnd() * 0.6), 0.7 + rnd() * 1.0, quartzKind(), 0.8, { lift: 0.15 });
          else formation(i, Math.PI + (rnd() - 0.5) * 0.9, 1.0 + rnd() * 0.7, quartzKind(), 0.8, { lift: -0.1 });
        }
        if (i % 12 === 0) formation(i, (rnd() < 0.5 ? 1 : -1) * 1.05, 2.6 + rnd() * 1.1, quartzKind(), 1);
      } else if (z === 2) {
        // the geode: violet points lining it, all turned inward, dense
        // (a crust over the whole of it, floor's edges to crown, every point turned inward)
        for (let k = 0; k < 16; k++) {
          const th = 0.75 + rnd() * (Math.PI * 2 - 1.5);
          const { p, n: nn } = this.anchor(i, th);
          lining(i, p, nn, 9, 0.3 + rnd() * 0.22, amethyst, 0.22);
        }
      } else if (z === 3) {
        // fluorite cubes, green and violet, scattered on the walls of the descent
        if (rnd() < 0.5) {
          const th = (rnd() < 0.5 ? 1 : -1) * (0.9 + rnd() * 1.6);
          const { p } = this.anchor(i, th);
          const col = rnd() < 0.5 ? C("#5fd19a") : C("#9b7be0");
          for (let k = 0; k < 4; k++) b.cube(p.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.4)), 0.12 + rnd() * 0.22, col, 0.6);
        }
      } else if (z === 4) {
        // small selenite blades on the walls between the great beams
        if (rnd() < 0.3) {
          const th = (rnd() < 0.5 ? 1 : -1) * (1 + rnd() * 1.8);
          formation(i, th, 0.9 + rnd() * 0.8, pick(C("#f2ead8")), 0.45, { flat: 0.55, lift: 0.2 });
        }
      } else if (z === 0 && rnd() < 0.035) {
        // here and there in the rock of the passages, a few points glinting
        const th = (rnd() < 0.5 ? 1 : -1) * (0.9 + rnd() * 1.8);
        formation(i, th, 0.7 + rnd() * 0.5, quartzKind(), 0.7);
      }
    }
    // the cathedral: beams of selenite ten and more metres long, crossing the chamber from wall to wall
    const cat = S.map((s, i) => ({ s, i })).filter(({ s }) => s.zone === 4 && s.w > 15);
    for (let k = 0; k < 26 && cat.length; k++) {
      const a = cat[Math.floor(rnd() * cat.length)].i, bI = Math.min(n - 1, Math.max(0, a + Math.floor((rnd() - 0.5) * 50)));
      const A = this.anchor(a, (rnd() < 0.5 ? 1 : -1) * (1.2 + rnd() * 1.2)).p;
      const B = this.anchor(bI, (rnd() < 0.5 ? 1 : -1) * (1.2 + rnd() * 1.4)).p;
      const dir = B.clone().sub(A);
      // keep them over your head, but for a few that lie fallen across the floor
      const low = k % 9 === 0;
      if (!low && Math.min(A.y, B.y) - (O.y + S[a].y) < 3) continue;
      const len = Math.min(dir.length() * (0.55 + rnd() * 0.35), 18);
      const thick = 0.45 + rnd() * 0.75;
      b.prism(A, dir, len, thick, thick * 1.5, C("#fff3dc", 1.05), 1.1, 0.55, 0.96, 0.62);
      if (low) {
        const d = dir.clone().normalize();
        for (let t = 0; t < len; t += 1.2) {
          const q = A.clone().addScaledVector(d, t);
          this.solids.push({ x: q.x, z: q.z, r: thick + 0.3, top: q.y + thick });
        }
      }
    }
    // the heart: one great crystal in a still pool, a crown of smaller ones round it
    const hi = n - 18, hs = S[hi];
    this.heart.set(O.x + hs.x, O.y + hs.y, O.z + hs.z);
    this.hasHeart = true;
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2 + rnd() * 0.3;
      const base = this.heart.clone().add(new THREE.Vector3(Math.cos(ang) * 0.6, -0.3, Math.sin(ang) * 0.6));
      const dir = new THREE.Vector3(Math.cos(ang) * 0.5, 1, Math.sin(ang) * 0.5);
      const len = 1.4 + rnd() * 1.8;
      b.prism(base, dir, len, len * 0.13, len * 0.22, C("#ffe7c2"), 1.1);
    }
    b.prism(this.heart.clone().add(new THREE.Vector3(0, -0.4, 0)), new THREE.Vector3(0.05, 1, 0.02), 4.6, 0.62, 1.1, C("#fff1d6"), 1.25);
    this.solids.push({ x: this.heart.x, z: this.heart.z, r: 2.6, top: this.heart.y + 4.5 });
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 48),
      new THREE.MeshStandardNodeMaterial({ color: 0x050a12, roughness: 0.08, metalness: 0 }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.copy(this.heart).add(new THREE.Vector3(0, 0.04, 0));
    this.add(pool);
    if (crust.length) {
      const unit = unitCrystal();
      iColAttr = new THREE.InstancedBufferAttribute(new Float32Array(crust.length * 3), 3);
      iSeedAttr = new THREE.InstancedBufferAttribute(new Float32Array(crust.length), 1);
      const im = new THREE.InstancedMesh(unit, crystalMaterial(true), crust.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion();
      crust.forEach((c, k) => {
        q.setFromUnitVectors(up, c.d).multiply(turn.setFromAxisAngle(up, rnd() * Math.PI));
        m.compose(c.p, q, new THREE.Vector3(c.len, c.len, c.len));
        im.setMatrixAt(k, m);
        iColAttr.setXYZ(k, c.c.r, c.c.g, c.c.b);
        iSeedAttr.setX(k, rnd());
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.add(im);
    }
    if (mounds.length) {
      const mm = mergeGeometries(mounds);
      mm.computeBoundingSphere();
      this.add(new THREE.Mesh(mm, this.spec.rock(false)));
    }
    const geo = b.build();
    const mesh = new THREE.Mesh(geo, crystalMaterial());
    mesh.frustumCulled = true;
    this.add(mesh);
    // the lights: one in every chamber (in its own colour), and along the passages now and then
    const chamberCol: Record<number, THREE.Color> = { 1: C("#cfe0ff"), 2: C("#a86bff"), 3: C("#79e0b0"), 4: C("#ffe8c4"), 5: C("#ffd9a0") };
    for (let i = 10; i < n - 4; i += 34) {
      const z = S[i].zone;
      if (z === 0) light(i, C("#8fa0d8"), 10, 16, 0.5);
      else light(i, chamberCol[z], z === 4 ? 70 : 32, z === 4 ? 46 : 28, z === 4 ? 0.55 : 0.5);
    }
    this.sources.push({ p: this.heart.clone().add(new THREE.Vector3(0, 2.4, 0)), c: C("#ffd9a0"), k: 60, r: 30 });
  }
}
