/* What grows and lies on the ground round the wanderer (the owner: "the soil looks barren… introduce
   more variety"), each region its own: tufts of grass and stones in the home meadow; pale tufts,
   lichen cushions and grey stones on the tundra; fallen-leaf litter and bronze ferns in the autumn
   forest; black stones in the ash; heather on the moor; marram grass on the dunes; red stones and
   dry scrub in the red rock; ferns and moss cushions in the mossland; tufts and flowering cushions
   on the chalk. Sparse, low, near only (~28 m, fading out), one instanced mesh a shape: a few
   hundred small things, never a lawn (the owner also asked for less grass, for the phone).
   Each 1.4 m cell decides once (cached) what it holds; the cells round you are laid a few at a
   time each frame, so walking never stalls. Lit by the moon, the living ones sway. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";
import { groundKind, heightAt, keptClear, regionIndex, WATER_Y } from "./terrain";

const { attribute, cameraPosition, Discard, float, Fn, If, length, mix, positionLocal, positionWorld, screenCoordinate, sin, cos, smoothstep, uniform, vec3, fract, dot, vec2 } = T;
const V = THREE.Vector3;

type Shape = "tuft" | "shrub" | "fern" | "stone" | "litter";
const SHAPES: Shape[] = ["tuft", "shrub", "fern", "stone", "litter"];
const CELL = 1.4;
const R = 28;
const MAX = 900;

/** Per region (−1 the home meadow, then E, NE, N, NW, W, SW, S, SE): how likely a cell holds
    something, and what (shape, weight, colour A, colour B, size range). Colours are linear albedo. */
interface Kind {
  shape: Shape;
  w: number;
  a: [number, number, number];
  b: [number, number, number];
  s: [number, number];
}
const RECIPES: Record<number, { p: number; kinds: Kind[] }> = {
  [-1]: { p: 0.34, kinds: [
    { shape: "tuft", w: 5, a: [0.05, 0.09, 0.06], b: [0.1, 0.13, 0.07], s: [0.7, 1.2] },
    { shape: "stone", w: 2, a: [0.12, 0.11, 0.12], b: [0.2, 0.19, 0.18], s: [0.5, 1.2] },
    { shape: "shrub", w: 1, a: [0.035, 0.07, 0.05], b: [0.07, 0.1, 0.06], s: [0.6, 1.1] },
  ] },
  0: { p: 0.3, kinds: [ // tundra
    { shape: "tuft", w: 4, a: [0.2, 0.18, 0.1], b: [0.3, 0.27, 0.16], s: [0.5, 0.9] },
    { shape: "shrub", w: 2, a: [0.14, 0.16, 0.09], b: [0.22, 0.24, 0.14], s: [0.35, 0.6] },
    { shape: "stone", w: 3, a: [0.16, 0.17, 0.19], b: [0.26, 0.27, 0.29], s: [0.5, 1.4] },
  ] },
  1: { p: 0.55, kinds: [ // autumn forest
    { shape: "litter", w: 6, a: [0.3, 0.07, 0.015], b: [0.42, 0.22, 0.03], s: [0.8, 1.3] },
    { shape: "fern", w: 3, a: [0.22, 0.09, 0.02], b: [0.3, 0.17, 0.04], s: [0.7, 1.2] },
    { shape: "stone", w: 1, a: [0.1, 0.08, 0.07], b: [0.16, 0.13, 0.1], s: [0.5, 1] },
  ] },
  2: { p: 0.22, kinds: [ // ash
    { shape: "stone", w: 6, a: [0.02, 0.02, 0.022], b: [0.05, 0.05, 0.055], s: [0.4, 1.5] },
    { shape: "tuft", w: 1, a: [0.1, 0.1, 0.09], b: [0.15, 0.14, 0.12], s: [0.4, 0.7] },
  ] },
  3: { p: 0.6, kinds: [ // heather moor
    { shape: "shrub", w: 7, a: [0.1, 0.03, 0.08], b: [0.17, 0.06, 0.13], s: [0.6, 1.1] },
    { shape: "tuft", w: 2, a: [0.13, 0.09, 0.05], b: [0.2, 0.14, 0.08], s: [0.6, 1] },
  ] },
  4: { p: 0.18, kinds: [ // dunes
    { shape: "tuft", w: 5, a: [0.25, 0.23, 0.12], b: [0.36, 0.32, 0.16], s: [0.9, 1.5] },
    { shape: "stone", w: 1, a: [0.3, 0.2, 0.1], b: [0.4, 0.28, 0.15], s: [0.4, 0.8] },
  ] },
  5: { p: 0.28, kinds: [ // red rock
    { shape: "stone", w: 5, a: [0.2, 0.06, 0.03], b: [0.32, 0.12, 0.06], s: [0.5, 1.5] },
    { shape: "shrub", w: 2, a: [0.08, 0.08, 0.04], b: [0.13, 0.12, 0.06], s: [0.5, 0.9] },
  ] },
  6: { p: 0.62, kinds: [ // mossland
    { shape: "fern", w: 5, a: [0.03, 0.08, 0.02], b: [0.06, 0.15, 0.04], s: [0.8, 1.4] },
    { shape: "shrub", w: 4, a: [0.03, 0.09, 0.015], b: [0.07, 0.17, 0.03], s: [0.4, 0.8] },
    { shape: "stone", w: 1, a: [0.07, 0.09, 0.06], b: [0.12, 0.14, 0.1], s: [0.5, 1] },
  ] },
  7: { p: 0.4, kinds: [ // chalk downs
    { shape: "tuft", w: 5, a: [0.07, 0.12, 0.05], b: [0.13, 0.18, 0.08], s: [0.6, 1] },
    { shape: "shrub", w: 2, a: [0.4, 0.4, 0.36], b: [0.12, 0.17, 0.08], s: [0.3, 0.55] }, // flowering cushions
    { shape: "stone", w: 2, a: [0.45, 0.44, 0.4], b: [0.6, 0.58, 0.54], s: [0.4, 1] },
  ] },
};

function hash(i: number, j: number, s: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

/* ---------------------------------------------------------------- shapes (aY: 0 at the ground, 1 at the top) */
function build(pos: number[], ys: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aY", new THREE.Float32BufferAttribute(ys, 1));
  g.computeVertexNormals();
  return g;
}
/** A blade or leaf: a strip from `a` along `dir`, bending by `bend`, `w` wide at its root. */
function strip(pos: number[], ys: number[], a: THREE.Vector3, dir: THREE.Vector3, side: THREE.Vector3, len: number, w: number, bend: THREE.Vector3, segs: number, y0: number, y1: number, taper = 0.9): void {
  let prev: [THREE.Vector3, THREE.Vector3] | null = null;
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const c = a.clone().addScaledVector(dir, len * f).addScaledVector(bend, len * f * f);
    const ww = w * (1 - f * taper);
    const l = c.clone().addScaledVector(side, -ww), r = c.clone().addScaledVector(side, ww);
    if (prev) {
      const y = (k: number) => y0 + (y1 - y0) * k;
      const fp = (i - 1) / segs;
      pos.push(...prev[0].toArray(), ...prev[1].toArray(), ...l.toArray(), ...prev[1].toArray(), ...r.toArray(), ...l.toArray());
      ys.push(y(fp), y(fp), y(f), y(fp), y(f), y(f));
    }
    prev = [l, r];
  }
}
function tuft(): THREE.BufferGeometry {
  const pos: number[] = [], ys: number[] = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + Math.sin(k * 7.1) * 0.4;
    const out = new V(Math.cos(a), 0, Math.sin(a));
    const lean = 0.15 + ((k * 0.37) % 1) * 0.35;
    const dir = new V(0, 1, 0).addScaledVector(out, lean).normalize();
    const side = new V(-out.z, 0, out.x);
    const len = 0.3 + ((k * 0.61) % 1) * 0.25;
    strip(pos, ys, out.clone().multiplyScalar(0.03), dir, side, len, 0.012, out.clone().multiplyScalar(0.5).add(new V(0, -0.35, 0)), 4, 0, 1, 0.95);
  }
  return build(pos, ys);
}
function fern(): THREE.BufferGeometry {
  const pos: number[] = [], ys: number[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    const out = new V(Math.cos(a), 0, Math.sin(a)), side = new V(-out.z, 0, out.x);
    // the frond's midrib arcs out and over; leaflets either side, smaller toward the tip
    const rib = (f: number) => out.clone().multiplyScalar(0.5 * f).add(new V(0, 0.75 * Math.sin(f * 2.0) * (1 - f * 0.3), 0));
    for (let i = 1; i <= 12; i++) {
      const f = i / 13, p = rib(f), t = rib(f + 0.02).sub(p).normalize();
      const L = 0.15 * (1 - f * 0.65);
      for (const s of [-1, 1]) {
        const d = side.clone().multiplyScalar(s).addScaledVector(t, 0.5).addScaledVector(new V(0, -1, 0), 0.25).normalize();
        strip(pos, ys, p, d, t.clone().multiplyScalar(0.5), L, 0.02, new V(0, -0.2, 0), 2, f, f, 0.85);
      }
    }
  }
  return build(pos, ys);
}
function shrub(): THREE.BufferGeometry {
  // a rounded cushion of small leaves on a low dome (heather, moss, a bush)
  const pos: number[] = [], ys: number[] = [];
  const n = 70;
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n, th = k * 2.39996;
    const y = Math.sqrt(u), r = Math.sqrt(1 - y * y);
    const p = new V(Math.cos(th) * r * 0.32, y * 0.3, Math.sin(th) * r * 0.32);
    const nrm = new V(p.x / 0.32, p.y / 0.3, p.z / 0.32).normalize();
    const side = new V(-nrm.z, 0, nrm.x).normalize();
    if (side.lengthSq() < 0.1) side.set(1, 0, 0);
    const d = nrm.clone().add(new V(0, 0.4, 0)).normalize();
    strip(pos, ys, p.clone().addScaledVector(nrm, -0.04), d, side, 0.11, 0.035, new V(0, -0.05, 0), 2, y * 0.8, Math.min(1, y + 0.15), 0.6);
  }
  return build(pos, ys);
}
function stone(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.18, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const ys: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const v = new V().fromBufferAttribute(p, i);
    const k = 1 + Math.sin(v.x * 23 + v.z * 17) * 0.12 + Math.sin(v.y * 31 + v.x * 11) * 0.08;
    v.multiplyScalar(k);
    v.y = v.y * 0.55 - 0.03; // flattish, sunk a little
    p.setXYZ(i, v.x, v.y, v.z);
    ys.push(Math.max(0, v.y / 0.12));
  }
  g.setAttribute("aY", new THREE.Float32BufferAttribute(ys, 1));
  g.deleteAttribute("uv");
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  return out;
}
function litter(): THREE.BufferGeometry {
  // a scatter of fallen leaves lying on the ground, a little curled
  const pos: number[] = [], ys: number[] = [];
  for (let k = 0; k < 16; k++) {
    const a = k * 2.39996, r = 0.08 + Math.sqrt((k + 0.5) / 16) * 0.42;
    const c = new V(Math.cos(a) * r, 0.015 + (k % 3) * 0.006, Math.sin(a) * r);
    const ang = k * 1.7;
    const d = new V(Math.cos(ang), 0.05, Math.sin(ang)).normalize(), side = new V(-d.z, 0, d.x);
    strip(pos, ys, c.clone().addScaledVector(d, -0.05), d, side, 0.1, 0.035, new V(0, 0.15, 0), 2, 0, 0.2, 0.7);
  }
  return build(pos, ys);
}
const MAKERS: Record<Shape, () => THREE.BufferGeometry> = { tuft, shrub, fern, stone, litter };

interface Item {
  shape: number;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  tint: [number, number, number];
}

export class GroundCover {
  group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private tints: THREE.InstancedBufferAttribute[] = [];
  private cells = new Map<number, Item | null>();
  private queue: [number, number][] = [];
  private cx = Infinity;
  private cz = Infinity;
  private dirty = false;
  private uT = uniform(0);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new V();
  private up = new V(0, 1, 0);

  constructor() {
    SHAPES.forEach((sh) => {
      const g = MAKERS[sh]();
      const tint = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      tint.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute("aTint", tint);
      const mesh = new THREE.InstancedMesh(g, this.material(sh), MAX);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
      this.tints.push(tint);
      this.group.add(mesh);
    });
  }

  private material(sh: Shape): THREE.MeshStandardNodeMaterial {
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: sh === "stone" ? 0.9 : 0.75, metalness: 0 });
    const y = attribute("aY", "float");
    const living = sh !== "stone" && sh !== "litter";
    if (living) {
      // the air moves them: more at their tips, each place on its own phase
      const ph = positionLocal.x.mul(0.31).add(positionLocal.z.mul(0.23));
      const k = y.mul(y).mul(sh === "shrub" ? 0.02 : 0.07);
      m.positionNode = positionLocal.add(vec3(sin(this.uT.mul(1.3).add(ph)), 0, cos(this.uT.mul(1.1).add(ph.mul(1.4)))).mul(k));
    }
    m.colorNode = Fn(() => {
      const d = length(positionWorld.sub(cameraPosition));
      // fading out toward the edge of the cover (a fine dither, never a ring popping), and never
      // standing between the lens and the view when very near
      const keep = smoothstep(R, R - 7, d).mul(smoothstep(0.35, 1.0, d));
      If(fract(dot(screenCoordinate.xy, vec2(0.0671, 0.0583)).add(fract(screenCoordinate.y.mul(0.7389)))).greaterThan(keep), () => {
        Discard();
      });
      const tint = attribute("aTint", "vec3").mul(2.2);
      // darker low among themselves, lighter at the tips
      const shade = living ? mix(float(0.6), float(1.15), y) : mix(float(0.75), float(1.05), y);
      return tint.mul(shade);
    })();
    // the sky's light on what grows (as the ground's own sky-seen shading), so a heather cushion
    // reads at dusk rather than as a hole
    if (living) m.emissiveNode = attribute("aTint", "vec3").mul(mix(float(0.05), float(0.12), y));
    return m;
  }

  /** What a cell holds (decided once). */
  private cell(i: number, j: number): Item | null {
    const key = (i + 40000) * 80001 + (j + 40000);
    const known = this.cells.get(key);
    if (known !== undefined) return known;
    let out: Item | null = null;
    const x = (i + 0.2 + hash(i, j, 1) * 0.6) * CELL, z = (j + 0.2 + hash(i, j, 2) * 0.6) * CELL;
    const h = heightAt(x, z);
    if (h > WATER_Y + 0.25 && h < 70 && !keptClear(x, z, 1)) {
      const r = regionIndex(x, z);
      const ri = r.away > 0.5 ? r.i : -1;
      const rec = RECIPES[ri] ?? RECIPES[-1];
      const gk = groundKind(x, z, h);
      // not on steep ground; less on the open sand outside the dunes
      const slope = Math.abs(heightAt(x + 1, z) - h) + Math.abs(heightAt(x, z + 1) - h);
      const p = rec.p * (slope > 0.9 ? 0.2 : 1) * (ri === 4 ? 1 : 1 - gk.sand * 0.75);
      if (hash(i, j, 3) < p) {
        let total = 0;
        for (const k of rec.kinds) total += k.w;
        let pick = hash(i, j, 4) * total;
        let kind = rec.kinds[0];
        for (const k of rec.kinds) if ((pick -= k.w) <= 0) {
          kind = k;
          break;
        }
        const t = hash(i, j, 5);
        out = {
          shape: SHAPES.indexOf(kind.shape),
          x, y: h, z,
          rot: hash(i, j, 6) * Math.PI * 2,
          scale: kind.s[0] + (kind.s[1] - kind.s[0]) * hash(i, j, 7),
          tint: [kind.a[0] + (kind.b[0] - kind.a[0]) * t, kind.a[1] + (kind.b[1] - kind.a[1]) * t, kind.a[2] + (kind.b[2] - kind.a[2]) * t],
        };
      }
    }
    this.cells.set(key, out);
    if (this.cells.size > 60000) this.cells.delete(this.cells.keys().next().value!);
    return out;
  }

  /** Each frame, in the open world: decide a few new cells round the wanderer, and lay them out
      again whenever it has moved a few metres. */
  update(t: number, p: THREE.Vector3, reduced: boolean): void {
    this.uT.value = reduced ? t * 0.3 : t;
    const cx = Math.round(p.x / 3), cz = Math.round(p.z / 3);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx;
      this.cz = cz;
      const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL), n = Math.ceil(R / CELL);
      this.queue.length = 0;
      for (let i = -n; i <= n; i++)
        for (let j = -n; j <= n; j++) {
          if ((i * i + j * j) * CELL * CELL > R * R) continue;
          const key = (ci + i + 40000) * 80001 + (cj + j + 40000);
          if (!this.cells.has(key)) this.queue.push([ci + i, cj + j]);
        }
      // nearest first
      this.queue.sort((a, b) => Math.hypot(a[0] - ci, a[1] - cj) - Math.hypot(b[0] - ci, b[1] - cj));
      this.dirty = true;
    }
    // a few new cells a frame (each reads the land a handful of times)
    let budget = 60;
    while (this.queue.length && budget-- > 0) {
      const [i, j] = this.queue.shift()!;
      this.cell(i, j);
      this.dirty = true;
    }
    if (this.dirty && (this.queue.length === 0 || budget <= 0)) this.layout(p);
  }

  private layout(p: THREE.Vector3): void {
    this.dirty = false;
    const counts = this.meshes.map(() => 0);
    const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL), n = Math.ceil(R / CELL);
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++) {
        const key = (ci + i + 40000) * 80001 + (cj + j + 40000);
        const it = this.cells.get(key);
        if (!it) continue;
        if (Math.hypot(it.x - p.x, it.z - p.z) > R) continue;
        const k = counts[it.shape];
        if (k >= MAX) continue;
        this.q.setFromAxisAngle(this.up, it.rot);
        this.m.compose(this.s.set(it.x, it.y, it.z), this.q, new V(it.scale, it.scale, it.scale));
        this.meshes[it.shape].setMatrixAt(k, this.m);
        this.tints[it.shape].setXYZ(k, it.tint[0], it.tint[1], it.tint[2]);
        counts[it.shape] = k + 1;
      }
    this.meshes.forEach((m, s) => {
      m.count = counts[s];
      m.instanceMatrix.needsUpdate = true;
      this.tints[s].needsUpdate = true;
    });
  }
}
