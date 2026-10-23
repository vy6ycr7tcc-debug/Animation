/* The railway (the owner: "can we connect all rails across the map? So that you can tour just like
   that? it's okay if it goes underwater"). One loop of narrow-gauge track, the mines' own kind (rusted
   rails on timber sleepers in a bed of broken stone), running through every gold mine and the great
   places: the temple, the monuments, the pyramid by the Nile, Göbekli Tepe, Nan Madol, Rapa Nui.
   - Planned once, when the world is made (after every site is chosen, so nothing moved): the
     stations are put in a round by the shortest way (nearest first, then untangled), and each leg is
     found over the land (A* on a 16 m grid: gentle grades, round the places kept clear, the
     mountains, the caves, the falls and the homes; through the lakes if that is the way, under the
     water, as the owner allowed), then eased into curves.
   - Its height follows the land, eased, never below it: over a hollow it rides a timber trestle,
     in a lake it runs along the floor.
   - Each mine's rails run on from their end to its station by a short spur.
   - A car waits at every station. Tap one and it carries you round the whole loop by itself,
     slowing into each station, a pause and its name, then on; the round button stops it (out of the
     water first). Built near you only, a stretch at a time. */
import * as THREE from "three/webgpu";
import { CAVES, CLEAR_LINES, heightAt, keptClear, LANDMARK_SITES, massifAt, WATER_Y, WATERFALLS } from "./terrain";
import { gravel, ironMaterial, Pieces, rideCar, spinCart, timberMaterial } from "./mines";
import { T, type N } from "../gpu/tsl";

export interface StationSpec {
  name: string;
  x: number;
  z: number;
  /** a spur of track from here (a mine's rails' end) to the station */
  spur?: { x: number; z: number };
}
export interface Station {
  name: string;
  /** metres along the loop */
  s: number;
  x: number;
  z: number;
  car: THREE.Group;
  /** where the station's own car stands (metres along), or null while it is away carrying you */
  carAt: number;
}

const STEP = 1.6; // metres between the track's samples
const GRID = 18; // the planner's grid
const CHUNK = 200; // samples to a built stretch (~320 m)
const BUILD_R = 520; // stretches built within this of you
const TRESTLE = 2.4; // higher than this over the land, it rides a trestle

/* ---------------------------------------------------------------- planning */
function blocked(x: number, z: number): boolean {
  if (massifAt(x, z) > 0.3) return true;
  if (keptClear(x, z, 5)) return true;
  if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 26)) return true;
  if (CAVES.some((c) => Math.hypot(x - c.x, z - c.z) < 34)) return true;
  if (WATERFALLS.some((f) => Math.hypot(x - f.x, z - f.z) < 60)) return true;
  return false;
}
/** The land the planner sees: one grid over the whole railway, each cell's height and whether it
    is open worked out only when a search first reaches it (most of the world is never asked). */
class LandGrid {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  private H: Float32Array;
  private B: Uint8Array; // 0 unknown, 1 open, 2 blocked
  constructor(pts: { x: number; z: number }[], pad: number) {
    this.x0 = Math.min(...pts.map((p) => p.x)) - pad;
    this.z0 = Math.min(...pts.map((p) => p.z)) - pad;
    this.nx = Math.ceil((Math.max(...pts.map((p) => p.x)) + pad - this.x0) / GRID) + 1;
    this.nz = Math.ceil((Math.max(...pts.map((p) => p.z)) + pad - this.z0) / GRID) + 1;
    this.H = new Float32Array(this.nx * this.nz).fill(NaN);
    this.B = new Uint8Array(this.nx * this.nz);
  }
  h(k: number): number {
    let v = this.H[k];
    if (v !== v) v = this.H[k] = heightAt(this.x0 + (k % this.nx) * GRID, this.z0 + Math.floor(k / this.nx) * GRID);
    return v;
  }
  blocked(k: number): boolean {
    if (!this.B[k]) this.B[k] = blocked(this.x0 + (k % this.nx) * GRID, this.z0 + Math.floor(k / this.nx) * GRID) ? 2 : 1;
    return this.B[k] === 2;
  }
  idx(x: number, z: number): number {
    return Math.min(this.nz - 1, Math.max(0, Math.round((z - this.z0) / GRID))) * this.nx + Math.min(this.nx - 1, Math.max(0, Math.round((x - this.x0) / GRID)));
  }
}
/** The way from a to b over the land (A* on the grid), as points. */
function findWay(L: LandGrid, ax: number, az: number, bx: number, bz: number): { x: number; z: number }[] {
  const nx = L.nx, nz = L.nz, N = nx * nz;
  const start = L.idx(ax, az), goal = L.idx(bx, bz);
  const gx = goal % nx, gz = Math.floor(goal / nx);
  const G = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  // a binary heap of (f, node)
  const heap: number[] = [], hf: number[] = [];
  const push = (k: number, f: number) => {
    heap.push(k);
    hf.push(f);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= hf[i]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      [hf[p], hf[i]] = [hf[i], hf[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const lk = heap.pop()!, lf = hf.pop()!;
    if (heap.length) {
      heap[0] = lk;
      hf[0] = lf;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && hf[l] < hf[m]) m = l;
        if (r < heap.length && hf[r] < hf[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        [hf[m], hf[i]] = [hf[i], hf[m]];
        i = m;
      }
    }
    return top;
  };
  G[start] = 0;
  push(start, 0);
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [1, 2], [-2, 1], [-1, 2], [2, -1], [1, -2], [-2, -1], [-1, -2]];
  while (heap.length) {
    const k = pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === goal) break;
    const i = k % nx, j = Math.floor(k / nx);
    const hk = L.h(k);
    for (const [di, dj] of D) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const n = jj * nx + ii;
      if (done[n]) continue;
      // (near either end the way is always open: stations stand by kept-clear places)
      const x = L.x0 + ii * GRID, z = L.z0 + jj * GRID;
      const nearEnd = (x - ax) ** 2 + (z - az) ** 2 < 4900 || (x - bx) ** 2 + (z - bz) ** 2 < 4900;
      if (!nearEnd && L.blocked(n)) continue;
      const len = Math.hypot(di, dj) * GRID;
      const hn = L.h(n);
      const g = Math.abs(hn - hk) / len;
      // gentle grades; the water costs a little more, the deep more still
      let c = len * (1 + 60 * g * g + (g > 0.12 ? 80 * (g - 0.12) : 0));
      if (hn < WATER_Y - 0.3) c += len * (hn < -12 ? 1.4 : 0.5);
      const ng = G[k] + c;
      if (ng < G[n]) {
        G[n] = ng;
        from[n] = k;
        push(n, ng + Math.hypot(ii - gx, jj - gz) * GRID);
      }
    }
  }
  const out: { x: number; z: number }[] = [];
  if (from[goal] < 0) return [{ x: ax, z: az }, { x: bx, z: bz }];
  for (let k = goal; k >= 0; k = from[k]) out.push({ x: L.x0 + (k % nx) * GRID, z: L.z0 + Math.floor(k / nx) * GRID });
  out.reverse();
  out[0] = { x: ax, z: az };
  out[out.length - 1] = { x: bx, z: bz };
  return out;
}
/** The stations' round: nearest first, then untangled (2-opt). */
function order(st: StationSpec[]): StationSpec[] {
  const n = st.length, d = (a: StationSpec, b: StationSpec) => Math.hypot(a.x - b.x, a.z - b.z);
  const tour = [0], left = new Set(st.map((_, i) => i).slice(1));
  while (left.size) {
    const last = st[tour[tour.length - 1]];
    let best = -1;
    for (const i of left) if (best < 0 || d(last, st[i]) < d(last, st[best])) best = i;
    tour.push(best);
    left.delete(best);
  }
  for (let pass = 0; pass < 40; pass++) {
    let better = false;
    for (let i = 0; i < n - 1; i++)
      for (let j = i + 2; j < n; j++) {
        const a = st[tour[i]], b = st[tour[i + 1]], c = st[tour[j]], e = st[tour[(j + 1) % n]];
        if (d(a, c) + d(b, e) < d(a, b) + d(c, e) - 1) {
          tour.splice(i + 1, j - i, ...tour.slice(i + 1, j + 1).reverse());
          better = true;
        }
      }
    if (!better) break;
  }
  return tour.map((i) => st[i]);
}
/** Corners rounded (Chaikin), several times over. */
function chaikin(p: { x: number; z: number }[], times: number, closed: boolean): { x: number; z: number }[] {
  for (let t = 0; t < times; t++) {
    const q: { x: number; z: number }[] = [];
    const n = p.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = p[i], b = p[(i + 1) % n];
      q.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    if (!closed) q.unshift(p[0]), q.push(p[n - 1]);
    p = q;
  }
  return p;
}
/** Even spacing along a closed polyline. */
function resample(p: { x: number; z: number }[], step: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  let carry = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    let t = carry;
    while (t < L) {
      out.push({ x: a.x + ((b.x - a.x) * t) / L, z: a.z + ((b.z - a.z) * t) / L });
      t += step;
    }
    carry = t - L;
  }
  return out;
}

/** A station's place moved, if it must be, to dry open ground near where it was asked for. */
export function settle(st: StationSpec): StationSpec {
  const ok = (x: number, z: number) => heightAt(x, z) > WATER_Y + 0.5 && !blocked(x, z) && massifAt(x, z) < 0.1;
  if (ok(st.x, st.z)) return st;
  for (let r = 6; r <= 160; r += 6)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, x = st.x + Math.cos(a) * r, z = st.z + Math.sin(a) * r;
      if (ok(x, z)) return { ...st, x, z };
    }
  return st;
}

/** The whole way: the stations put in a round, each leg found over the land, the loop eased into
    curves and relaxed. */
function planWay(specs: StationSpec[]): { x: number; z: number }[] {
  const round = order(specs);
  let pts: { x: number; z: number }[] = [];
  const land = new LandGrid(round, 450);
  for (let i = 0; i < round.length; i++) {
    const a = round[i], b = round[(i + 1) % round.length];
    const w = findWay(land, a.x, a.z, b.x, b.z);
    pts.push(...w.slice(0, -1));
  }
  pts = resample(chaikin(pts, 4, true), STEP);
  // a few passes of relaxing (no kinks left from the grid)
  for (let pass = 0; pass < 12; pass++) {
    const q = pts.map((p) => ({ ...p }));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 2 + pts.length) % pts.length], b = pts[(i + 2) % pts.length];
      q[i].x = pts[i].x * 0.6 + (a.x + b.x) * 0.2;
      q[i].z = pts[i].z * 0.6 + (a.z + b.z) * 0.2;
    }
    pts = q;
  }
  return pts;
}
function loadWay(key: string): { x: number; z: number }[] | null {
  try {
    const t = localStorage.getItem(key);
    if (!t) return null;
    const bin = atob(t), b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    const f = new Float32Array(b.buffer);
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i + 1 < f.length; i += 2) out.push({ x: f[i], z: f[i + 1] });
    return out.length > 10 ? out : null;
  } catch {
    return null;
  }
}
function saveWay(key: string, pts: { x: number; z: number }[]): void {
  try {
    // (only this version's way is kept: older ones are let go)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("inward-journey:rail:") && k !== key) localStorage.removeItem(k);
    }
    const f = new Float32Array(pts.length * 2);
    pts.forEach((p, i) => ((f[2 * i] = p.x), (f[2 * i + 1] = p.z)));
    const b = new Uint8Array(f.buffer);
    let bin = "";
    for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode(...b.subarray(i, i + 8192));
    localStorage.setItem(key, btoa(bin));
  } catch {
    /* no room: it is planned again next time */
  }
}

/* ---------------------------------------------------------------- the railway */
export class Railway {
  readonly group = new THREE.Group();
  readonly stations: Station[] = [];
  /** the track's middle, its bed's height and the land under it, per sample */
  readonly px: Float32Array;
  readonly pz: Float32Array;
  readonly py: Float32Array;
  readonly ground: Float32Array;
  /** how sharply it turns there (1/m), for the car's speed */
  readonly bend: Float32Array;
  readonly n: number;
  readonly length: number;
  private grid = new Map<number, number[]>();
  private built = new Map<number, THREE.Object3D[]>();
  private spurs: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
  private spurBuilt: THREE.Object3D[] | null = null;
  private mats = { timber: timberMaterial(), steel: ironMaterial() };
  private bedMat = gravel(0.9);
  /** the embankment's slopes: earth, the stone's grey gone to the land's brown */
  private bankMat = (() => {
    const m = gravel(0.9);
    m.colorNode = T.vec4((m.colorNode as N).rgb.mul(T.vec3(1.0, 0.9, 0.78)), 1);
    return m;
  })();
  readonly planMs: number;

  /** `cacheKey`: where the planned way is kept on the device (with the build, so a new version
      plans afresh): the search is the costly part, and the world it was made in is the same. */
  constructor(specs: StationSpec[], cacheKey?: string) {
    const t0 = performance.now();
    const kept = cacheKey ? loadWay(cacheKey) : null;
    let pts = kept ?? planWay(specs);
    if (!kept && cacheKey) saveWay(cacheKey, pts);
    pts = resample(pts, STEP);
    const n = pts.length;
    this.n = n;
    this.length = n * STEP;
    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.py = new Float32Array(n);
    this.ground = new Float32Array(n);
    this.bend = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = pts[i].x;
      this.pz[i] = pts[i].z;
      this.ground[i] = heightAt(pts[i].x, pts[i].z);
    }
    // its height: the land eased (±12 samples), never below it; again, tighter
    let y = Float32Array.from(this.ground, (g) => g + 0.12);
    for (const [r, passes] of [[8, 3], [4, 2]] as [number, number][])
      for (let p = 0; p < passes; p++) {
        const q = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          let a = 0;
          for (let j = -r; j <= r; j++) a += y[(i + j + n) % n];
          q[i] = Math.max(this.ground[i] + 0.12, a / (2 * r + 1));
        }
        y = q;
      }
    this.py.set(y);
    for (let i = 0; i < n; i++) {
      const a = (i - 3 + n) % n, b = (i + 3) % n;
      const h0 = Math.atan2(this.pz[i] - this.pz[a], this.px[i] - this.px[a]), h1 = Math.atan2(this.pz[b] - this.pz[i], this.px[b] - this.px[i]);
      let dh = h1 - h0;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      this.bend[i] = Math.abs(dh) / (STEP * 3);
    }
    // a grid of the samples, for the nearness questions
    for (let i = 0; i < n; i++) {
      const k = this.key(this.px[i], this.pz[i]);
      const l = this.grid.get(k);
      if (l) l.push(i);
      else this.grid.set(k, [i]);
    }
    // the stations: where the loop passes each, and its car
    for (const st of specs) {
      const i = this.nearest(st.x, st.z);
      const car = rideCar();
      this.group.add(car);
      const s = i * STEP;
      this.stations.push({ name: st.name, s, x: this.px[i], z: this.pz[i], car, carAt: s });
      if (st.spur) {
        const v = new THREE.Vector3();
        this.at(s, v);
        this.spurs.push({ from: new THREE.Vector3(st.spur.x, 0, st.spur.z), to: v.clone() });
      }
    }
    this.stations.sort((a, b) => a.s - b.s);
    for (const st of this.stations) this.park(st);
    // each station a low timber platform beside the track, and a lantern on a post
    {
      const P = new Pieces();
      for (const st of this.stations) {
        const i = Math.round(st.s / STEP) % this.n;
        const a = (i - 1 + this.n) % this.n, b = (i + 1) % this.n;
        const tx = this.px[b] - this.px[a], tz = this.pz[b] - this.pz[a], L = Math.hypot(tx, tz) || 1;
        const fx = tx / L, fz = tz / L, rx = -fz, rz = fx;
        const g = heightAt(this.px[i] + rx * 2.1, this.pz[i] + rz * 2.1);
        if (g < WATER_Y + 0.2) continue;
        const top = Math.max(g + 0.35, this.py[i] + 0.2);
        // the deck: planks across, on two bearers
        for (let k = -6; k <= 6; k++) {
          const cx = this.px[i] + fx * k * 0.34 + rx * 2.1, cz = this.pz[i] + fz * k * 0.34 + rz * 2.1;
          P.beam(new THREE.Vector3(cx - rx * 0.7, top, cz - rz * 0.7), new THREE.Vector3(cx + rx * 0.7, top, cz + rz * 0.7), 0.1, 0.95);
        }
        for (const off of [-0.5, 0.5]) {
          const cx = this.px[i] + rx * (2.1 + off), cz = this.pz[i] + rz * (2.1 + off);
          P.beam(new THREE.Vector3(cx - fx * 2.2, top - 0.12, cz - fz * 2.2), new THREE.Vector3(cx + fx * 2.2, top - 0.12, cz + fz * 2.2), 0.14, 0.8);
          for (const e of [-1.9, 1.9]) P.beam(new THREE.Vector3(cx + fx * e, g - 0.3, cz + fz * e), new THREE.Vector3(cx + fx * e, top - 0.15, cz + fz * e), 0.14, 0.85);
        }
        // the post at its far end, an arm, the lantern hung from it
        const px = this.px[i] + rx * 2.6 + fx * 2.0, pz = this.pz[i] + rz * 2.6 + fz * 2.0;
        P.beam(new THREE.Vector3(px, top - 0.1, pz), new THREE.Vector3(px, top + 2.3, pz), 0.13);
        const arm = new THREE.Vector3(px - rx * 0.55, top + 2.15, pz - rz * 0.55);
        P.beam(new THREE.Vector3(px, top + 2.15, pz), arm, 0.07);
        P.lantern(arm.clone().setY(top + 1.75), arm);
      }
      P.build((o) => this.group.add(o), null, this.mats);
    }
    // trees, rocks and cover keep off the track and its spurs
    CLEAR_LINES.push((x, z, pad) => this.distance(x, z, 4 + pad) < 3.2 + pad * 0.4 || this.spurs.some((sp) => segDist(x, z, sp.from, sp.to) < 3 + pad * 0.4));
    this.planMs = performance.now() - t0;
  }

  private key(x: number, z: number): number {
    return (Math.floor(x / 32) + 5000) * 10007 + (Math.floor(z / 32) + 5000);
  }
  /** The nearest sample to a point. */
  nearest(x: number, z: number): number {
    let best = 0, bd = Infinity;
    const cx = Math.floor(x / 32), cz = Math.floor(z / 32);
    for (let r = 1; r <= 64 && best === 0 && bd === Infinity; r *= 2)
      for (let j = cz - r; j <= cz + r; j++)
        for (let i = cx - r; i <= cx + r; i++) {
          const l = this.grid.get((i + 5000) * 10007 + (j + 5000));
          if (!l) continue;
          for (const k of l) {
            const d = (this.px[k] - x) ** 2 + (this.pz[k] - z) ** 2;
            if (d < bd) (bd = d), (best = k);
          }
        }
    if (bd === Infinity) for (let k = 0; k < this.n; k++) {
      const d = (this.px[k] - x) ** 2 + (this.pz[k] - z) ** 2;
      if (d < bd) (bd = d), (best = k);
    }
    return best;
  }
  /** How far from the track's middle, up to `within` (Infinity beyond). */
  distance(x: number, z: number, within = 40): number {
    const r = Math.ceil(within / 32);
    const cx = Math.floor(x / 32), cz = Math.floor(z / 32);
    let bd = Infinity;
    for (let j = cz - r; j <= cz + r; j++)
      for (let i = cx - r; i <= cx + r; i++) {
        const l = this.grid.get((i + 5000) * 10007 + (j + 5000));
        if (!l) continue;
        for (const k of l) bd = Math.min(bd, (this.px[k] - x) ** 2 + (this.pz[k] - z) ** 2);
      }
    const d = Math.sqrt(bd);
    return d <= within + STEP ? Math.max(0, d - STEP * 0.3) : Infinity;
  }
  private sample(s: number): [number, number, number] {
    const f = (((s / STEP) % this.n) + this.n) % this.n, i = Math.floor(f), t = f - i;
    return [i, (i + 1) % this.n, t];
  }
  /** The car's reference point at `s` metres along (0.55 m over the bed, as the mines' rails are):
      returns its turn (a rotation about y laying its length along the rails). */
  at(s: number, out: THREE.Vector3): number {
    const [i, j, t] = this.sample(s);
    const h = (k: number) => this.py[((k % this.n) + this.n) % this.n];
    const y0 = h(i - 1), y1 = h(i), y2 = h(j), y3 = h(j + 1);
    const y = 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t * t + (-y0 + 3 * y1 - 3 * y2 + y3) * t * t * t);
    out.set(this.px[i] + (this.px[j] - this.px[i]) * t, y + 0.55, this.pz[i] + (this.pz[j] - this.pz[i]) * t);
    const a = (i - 1 + this.n) % this.n, b = (j + 1) % this.n;
    const tx = this.px[b] - this.px[a], tz = this.pz[b] - this.pz[a];
    return -Math.atan2(tz, tx);
  }
  /** The rise ahead at `s` (radians). */
  pitch(s: number): number {
    const [i] = this.sample(s);
    return Math.atan2(this.py[(i + 3) % this.n] - this.py[(i - 3 + this.n) % this.n], STEP * 6);
  }
  /** How sharply it turns at `s`, looking a little ahead. */
  bendAt(s: number, ahead = 0): number {
    let b = 0;
    for (let d = 0; d <= ahead; d += 8) b = Math.max(b, this.bend[this.sample(s + d)[0]]);
    return b;
  }
  /** The land (or the lake's floor) under the track at `s`, and its bed's height. */
  bedAt(s: number): { ground: number; bed: number } {
    const [i] = this.sample(s);
    return { ground: this.ground[i], bed: this.py[i] };
  }
  /** The next station ahead of `s` (going forward round the loop), and how far. */
  nextStation(s: number): { st: Station; d: number } {
    let best = this.stations[0], bd = Infinity;
    for (const st of this.stations) {
      const d = (((st.s - s) % this.length) + this.length) % this.length;
      if (d > 0.5 && d < bd) (bd = d), (best = st);
    }
    return { st: best, d: bd };
  }
  /** A station's car back at its stop. */
  park(st: Station): void {
    const v = new THREE.Vector3();
    st.carAt = st.s;
    st.car.rotation.set(0, this.at(st.s, v), this.pitch(st.s));
    st.car.position.copy(v);
    st.car.visible = true;
  }
  /** Move a car along to `s`, its wheels turning. */
  roll(car: THREE.Group, s: number): void {
    const v = new THREE.Vector3();
    const yaw = this.at(s, v);
    car.rotation.set(0, yaw, this.pitch(s));
    spinCart(car, car.position, v);
    car.position.copy(v);
  }

  /* ---------------------------------------------------------------- building, near you */
  update(near: THREE.Vector3, out: boolean, riding: Station | null): void {
    this.group.visible = out;
    if (!out) return;
    const want = new Set<number>();
    const c0 = this.nearest(near.x, near.z);
    for (let k = 0; k < this.n; k += CHUNK) {
      // a stretch is wanted when any of its samples is near (checked on every 8th)
      let close = false;
      for (let i = k; i < Math.min(this.n, k + CHUNK + 1) && !close; i += 8) close = Math.hypot(this.px[i] - near.x, this.pz[i] - near.z) < BUILD_R;
      if (close) want.add(k / CHUNK);
    }
    void c0;
    for (const [k, objs] of this.built)
      if (!want.has(k)) {
        for (const o of objs) {
          this.group.remove(o);
          (o as THREE.Mesh).geometry?.dispose();
        }
        this.built.delete(k);
      }
    // one new stretch a frame, nearest first
    let pick = -1, pd = Infinity;
    for (const k of want)
      if (!this.built.has(k)) {
        const i = Math.min(this.n - 1, k * CHUNK + CHUNK / 2), d = Math.hypot(this.px[i] - near.x, this.pz[i] - near.z);
        if (d < pd) (pd = d), (pick = k);
      }
    if (pick >= 0) this.built.set(pick, this.buildChunk(pick));
    if (!this.spurBuilt && this.spurs.some((sp) => sp.to.distanceTo(near) < BUILD_R)) this.spurBuilt = this.buildSpurs();
    // the stations' cars: only the one carrying you moves; the others wait at their stops
    // (a car waiting at a station steps aside, out of sight, while the one carrying you is at it)
    for (const st of this.stations) {
      const passing = riding && st !== riding && riding.car.position.distanceTo(st.car.position) < 14;
      st.car.visible = st === riding || (!passing && Math.hypot(st.car.position.x - near.x, st.car.position.z - near.z) < 900);
    }
  }
  private buildChunk(k: number): THREE.Object3D[] {
    const i0 = k * CHUNK, i1 = Math.min(this.n, i0 + CHUNK + 1);
    const P = new Pieces();
    const objs: THREE.Object3D[] = [];
    const right = (i: number) => {
      const a = (i - 1 + this.n) % this.n, b = (i + 1) % this.n;
      const tx = this.px[b] - this.px[a], tz = this.pz[b] - this.pz[a], L = Math.hypot(tx, tz) || 1;
      return [-tz / L, tx / L];
    };
    const at = (i: number, lat: number, y: number) => {
      const j = i % this.n, [rx, rz] = right(j);
      return new THREE.Vector3(this.px[j] + rx * lat, this.py[j] + y, this.pz[j] + rz * lat);
    };
    // sleepers every other sample (~0.8 m apart… every 1.6 m with one between: two per sample pair)
    for (let i = i0; i < i1 - 1; i++)
      for (const f of [0, 0.5]) {
        const a = at(i, -0.55, 0.01), b = at(i, 0.55, 0.01), c = at(i + 1, -0.55, 0.01), d = at(i + 1, 0.55, 0.01);
        P.beam(a.lerp(c, f), b.lerp(d, f), 0.17, 0.8);
      }
    // the rails: two continuous bars (head, web and foot drawn as one profile)
    for (const side of [-0.32, 0.32]) {
      const pos: number[] = [], nor: number[] = [];
      const prof: [number, number][] = [[-0.06, 0.095], [-0.06, 0.105], [-0.012, 0.11], [-0.012, 0.155], [-0.03, 0.16], [-0.03, 0.2], [0.03, 0.2], [0.03, 0.16], [0.012, 0.155], [0.012, 0.11], [0.06, 0.105], [0.06, 0.095]];
      for (let i = i0; i < i1 - 1; i++) {
        const [r0x, r0z] = right(i % this.n), [r1x, r1z] = right((i + 1) % this.n);
        const A = (i: number, rx: number, rz: number, u: number, v: number) => [this.px[i % this.n] + rx * (side + u), this.py[i % this.n] + v - 0.065, this.pz[i % this.n] + rz * (side + u)];
        for (let q = 0; q < prof.length - 1; q++) {
          const [u0, v0] = prof[q], [u1, v1] = prof[q + 1];
          const a = A(i, r0x, r0z, u0, v0), b = A(i, r0x, r0z, u1, v1), c = A(i + 1, r1x, r1z, u1, v1), d = A(i + 1, r1x, r1z, u0, v0);
          // the face's normal, turned away from the rail's own axis
          const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
          let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl;
          ny /= nl;
          nz /= nl;
          const um = (u0 + u1) / 2, vm = (v0 + v1) / 2 - 0.15;
          const ox = r0x * um, oy = vm, oz = r0z * um;
          if (nx * ox + ny * oy + nz * oz < 0) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
            pos.push(...a, ...c, ...b, ...a, ...d, ...c);
          } else pos.push(...a, ...b, ...c, ...a, ...c, ...d);
          for (let m = 0; m < 6; m++) nor.push(nx, ny, nz);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
      P.steel.push(g);
    }
    // a trestle where it rides high over a hollow: posts in pairs, a cap and braces (lower, it
    // lies on its embankment)
    for (let i = i0; i < i1; i += 2) {
      const lift = this.py[i % this.n] - this.ground[i % this.n];
      if (lift < TRESTLE || this.ground[i % this.n] < WATER_Y - 6) continue;
      for (const lat of [-0.75, 0.75]) {
        const top = at(i, lat, -0.07), foot = top.clone().setY(this.ground[i % this.n] - 0.4);
        P.beam(foot, top, 0.16, 0.9);
      }
      P.beam(at(i, -0.9, -0.08), at(i, 0.9, -0.08), 0.18, 0.85);
      if (lift > 2.2 && i % 4 === 0) P.beam(at(i, -0.75, -lift + 0.5), at(i, 0.75, -0.3), 0.1, 0.8);
    }
    P.build((o) => objs.push(o), null, this.mats);
    // the bed of broken stone, and under it the embankment down to the land on either side (it
    // keeps the track's easy grade over the land's small hollows)
    {
      const prof = (i: number): THREE.Vector3[] => {
        const j = i % this.n, lift = this.py[j] - this.ground[j];
        const [rx, rz] = right(j);
        const out: THREE.Vector3[] = [];
        for (const sd of [-1, 1]) {
          const w = 1.05 + Math.max(0, lift) * 2.2 + 0.4;
          const fx = this.px[j] + rx * w * sd, fz = this.pz[j] + rz * w * sd;
          const fy = heightAt(fx, fz);
          // (on a hillside the land above the shoulder: the slope only tucks into it)
          if (fy > this.py[j] - 0.3) out.push(at(i, sd * 1.3, -0.4));
          else out.push(new THREE.Vector3(fx, fy - 0.2, fz));
        }
        // left foot, left shoulder, left top, right top, right shoulder, right foot
        return [out[0], at(i, -1.05, -0.12), at(i, -0.7, 0.02), at(i, 0.7, 0.02), at(i, 1.05, -0.12), out[1]];
      };
      const top: number[] = [], sides: number[] = [];
      let A = prof(i0);
      for (let i = i0; i < i1 - 1; i++) {
        const B = prof(i + 1);
        const high = this.py[i % this.n] - this.ground[i % this.n] > TRESTLE && this.py[(i + 1) % this.n] - this.ground[(i + 1) % this.n] > TRESTLE;
        for (let q = 0; q < 5; q++) {
          const side = q === 0 || q === 4;
          if (high && side) continue;
          const a = A[q], b = A[q + 1], c = B[q + 1], d = B[q];
          // (wound so its faces look up and out: the track's right is its left looking down)
          (side ? sides : top).push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
        }
        A = B;
      }
      for (const [pos, mat] of [[top, this.bedMat], [sides, this.bankMat]] as [number[], THREE.Material][]) {
        if (!pos.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        objs.push(m);
      }
    }
    for (const o of objs) {
      o.receiveShadow = true;
      this.group.add(o);
    }
    return objs;
  }
  /** The mines' spurs: their rails run on, straight, to the loop. */
  private buildSpurs(): THREE.Object3D[] {
    const P = new Pieces();
    const objs: THREE.Object3D[] = [];
    for (const sp of this.spurs) {
      const L = Math.hypot(sp.to.x - sp.from.x, sp.to.z - sp.from.z);
      const dx = (sp.to.x - sp.from.x) / L, dz = (sp.to.z - sp.from.z) / L, rx = -dz, rz = dx;
      const y = (t: number) => {
        const x = sp.from.x + dx * t, z = sp.from.z + dz * t;
        return heightAt(x, z);
      };
      for (let t = 0; t < L; t += 0.8) {
        const h = y(t);
        P.beam(new THREE.Vector3(sp.from.x + dx * t - rx * 0.55, h + 0.03, sp.from.z + dz * t - rz * 0.55), new THREE.Vector3(sp.from.x + dx * t + rx * 0.55, h + 0.03, sp.from.z + dz * t + rz * 0.55), 0.13, 0.8);
      }
      for (const side of [-0.32, 0.32])
        for (let t = 0; t < L - 0.5; t += 1) {
          const a = new THREE.Vector3(sp.from.x + dx * t + rx * side, y(t) + 0.12, sp.from.z + dz * t + rz * side);
          const t1 = Math.min(L, t + 1), b = new THREE.Vector3(sp.from.x + dx * t1 + rx * side, y(t1) + 0.12, sp.from.z + dz * t1 + rz * side);
          const g = new THREE.BoxGeometry(0.06, 0.07, a.distanceTo(b) + 0.02);
          g.lookAt(b.clone().sub(a));
          g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
          P.steel.push(g);
        }
    }
    P.build((o) => objs.push(o), null, this.mats);
    for (const o of objs) this.group.add(o);
    return objs;
  }

  /** The station whose car is under a tap (screen x, y), if any within reach. */
  pick(x: number, y: number, camera: THREE.Camera, w: number, h: number): Station | null {
    const v = new THREE.Vector3();
    for (const st of this.stations) {
      if (!st.car.visible) continue;
      const d = camera.position.distanceTo(st.car.position);
      if (d > 60) continue;
      v.copy(st.car.position).project(camera);
      if (v.z < 1 && Math.hypot((v.x * 0.5 + 0.5) * w - x, (-v.y * 0.5 + 0.5) * h - y) < Math.max(40, 1100 / d)) return st;
    }
    return null;
  }
  /** For the map: how far from the track (Infinity beyond 30 m). */
  mapDistance(x: number, z: number): number {
    return this.distance(x, z, 30);
  }
}
function segDist(x: number, z: number, a: THREE.Vector3, b: THREE.Vector3): number {
  const vx = b.x - a.x, vz = b.z - a.z, L = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / L));
  return Math.hypot(x - a.x - vx * t, z - a.z - vz * t);
}
