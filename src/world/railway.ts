/* The aetheric way (the owner: "railway should be aetheric so kinda invisible, and simple for the
   train to follow, it can go anywhere… tap train > map view where you tap all the destinations to
   build a route > system follows the route as an auto ride… not straight lines but natural and
   beautiful routes"). Supersedes the loop of rusted rails, sleepers and embankments.
   - No track stands in the world. A car waits, floating a little over the ground on a soft pool of
     light, at each of the great places (the temple, the monuments, the pyramid, Göbekli Tepe, Nan
     Madol, Rapa Nui and every gold mine).
   - Its route is drawn when you ask for it: through the places you chose, in order, each leg found
     over the land (A* on an 18 m grid: gentle grades, round the mountains, the caves, the falls and
     the places kept clear; over the lakes as easily as the land), then relaxed into long easy
     curves that still pass through every place you chose.
   - The car floats along it a little over the land or the water, its height the land's eased; the
     way shows only as two fine threads of light unrolling ahead of the car and fading behind it. */
import * as THREE from "three/webgpu";
import { CAVES, heightAt, keptClear, LANDMARK_SITES, massifAt, WATER_Y, WATERFALLS } from "./terrain";
import { rideCar } from "./mines";
import { T } from "../gpu/tsl";

export interface StationSpec {
  name: string;
  x: number;
  z: number;
}
export interface Station {
  name: string;
  /** where its car rests, and its turn there (its length along x, as `Route.at` gives it) */
  x: number;
  z: number;
  heading: number;
  car: THREE.Group;
  /** its car is away (carrying you, or left where you stepped out) */
  away: boolean;
}
export interface Stop {
  name: string;
  x: number;
  z: number;
}

const STEP = 1.6; // metres between the way's samples
const GRID = 18; // the planner's grid
const HOVER = 0.3; // the way's height over the land or the water
const CAR_Y = 0.55; // the car's reference point over the way (as the mines' rails give it)
type P = { x: number; z: number };

/* ---------------------------------------------------------------- planning */
function blocked(x: number, z: number): boolean {
  if (massifAt(x, z) > 0.3) return true;
  if (keptClear(x, z, 5)) return true;
  if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 26)) return true;
  if (CAVES.some((c) => Math.hypot(x - c.x, z - c.z) < 34)) return true;
  if (WATERFALLS.some((f) => Math.hypot(x - f.x, z - f.z) < 60)) return true;
  return false;
}
/** The land the planner sees: one grid over the route, each cell's height and whether it is open
    worked out only when a search first reaches it (most of the world is never asked). */
class LandGrid {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  private H: Float32Array;
  private B: Uint8Array; // 0 unknown, 1 open, 2 blocked
  constructor(pts: P[], pad: number) {
    this.x0 = Math.min(...pts.map((p) => p.x)) - pad;
    this.z0 = Math.min(...pts.map((p) => p.z)) - pad;
    this.nx = Math.ceil((Math.max(...pts.map((p) => p.x)) + pad - this.x0) / GRID) + 1;
    this.nz = Math.ceil((Math.max(...pts.map((p) => p.z)) + pad - this.z0) / GRID) + 1;
    this.H = new Float32Array(this.nx * this.nz).fill(NaN);
    this.B = new Uint8Array(this.nx * this.nz);
  }
  /** the surface the way floats over: the land, or the water where the land is under it */
  h(k: number): number {
    let v = this.H[k];
    if (v !== v) v = this.H[k] = Math.max(WATER_Y, heightAt(this.x0 + (k % this.nx) * GRID, this.z0 + Math.floor(k / this.nx) * GRID));
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
/** The way from a to b over the land and the water (A* on the grid), as points. */
function findWay(L: LandGrid, ax: number, az: number, bx: number, bz: number): P[] {
  const nx = L.nx, nz = L.nz, N = nx * nz;
  const start = L.idx(ax, az), goal = L.idx(bx, bz);
  const gx = goal % nx, gz = Math.floor(goal / nx);
  const G = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
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
      // (near either end the way is always open: the places stand by kept-clear ground)
      const x = L.x0 + ii * GRID, z = L.z0 + jj * GRID;
      const nearEnd = (x - ax) ** 2 + (z - az) ** 2 < 4900 || (x - bx) ** 2 + (z - bz) ** 2 < 4900;
      if (!nearEnd && L.blocked(n)) continue;
      const len = Math.hypot(di, dj) * GRID;
      const g = Math.abs(L.h(n) - hk) / len;
      // gentle grades (the water is level, and as easy as the land)
      const c = len * (1 + 60 * g * g + (g > 0.12 ? 80 * (g - 0.12) : 0));
      const ng = G[k] + c;
      if (ng < G[n]) {
        G[n] = ng;
        from[n] = k;
        push(n, ng + Math.hypot(ii - gx, jj - gz) * GRID);
      }
    }
  }
  if (from[goal] < 0) return [{ x: ax, z: az }, { x: bx, z: bz }];
  const out: P[] = [];
  for (let k = goal; k >= 0; k = from[k]) out.push({ x: L.x0 + (k % nx) * GRID, z: L.z0 + Math.floor(k / nx) * GRID });
  out.reverse();
  out[0] = { x: ax, z: az };
  out[out.length - 1] = { x: bx, z: bz };
  return out;
}
/** Even spacing along an open polyline, its two ends kept exactly. */
function resample(p: P[], step: number): P[] {
  const L: number[] = [0];
  for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z));
  const total = L[L.length - 1];
  const n = Math.max(1, Math.round(total / step));
  const out: P[] = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = (total * k) / n;
    while (j < p.length - 2 && L[j + 1] < s) j++;
    const t = L[j + 1] > L[j] ? (s - L[j]) / (L[j + 1] - L[j]) : 0;
    out.push({ x: p[j].x + (p[j + 1]?.x - p[j].x || 0) * t, z: p[j].z + (p[j + 1]?.z - p[j].z || 0) * t });
  }
  return out;
}

/** A place for a car moved, if it must be, to dry open ground near where it was asked for. */
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

/* ---------------------------------------------------------------- a route */
/** The way a car takes: from where it stands through each stop, in order. */
export class Route {
  readonly px: Float32Array;
  readonly pz: Float32Array;
  /** the way's height (it floats over the land or the water), and the land under it */
  readonly py: Float32Array;
  readonly ground: Float32Array;
  readonly bend: Float32Array;
  readonly n: number;
  readonly length: number;
  /** each stop: its name, and how far along */
  readonly stops: { name: string; s: number; x: number; z: number }[] = [];
  readonly planMs: number;

  constructor(from: P, stops: Stop[]) {
    const t0 = performance.now();
    const all = [from, ...stops];
    const land = new LandGrid(all, 450);
    // each leg over the land, laid out evenly (6 m), its ends (the stops) kept where they are
    const legs: P[][] = [];
    for (let i = 0; i + 1 < all.length; i++) legs.push(resample(findWay(land, all[i].x, all[i].z, all[i + 1].x, all[i + 1].z), 6));
    let pts: P[] = [legs[0][0]];
    const pin = new Set<number>([0]);
    for (const leg of legs) {
      pts.push(...leg.slice(1));
      pin.add(pts.length - 1);
    }
    // relaxed into long, easy curves (the grid's corners gone), still through every stop
    for (let pass = 0; pass < 48; pass++) {
      const q = pts.map((p) => ({ ...p }));
      for (let i = 1; i < pts.length - 1; i++) {
        if (pin.has(i)) continue;
        q[i].x = pts[i].x * 0.5 + (pts[i - 1].x + pts[i + 1].x) * 0.25;
        q[i].z = pts[i].z * 0.5 + (pts[i - 1].z + pts[i + 1].z) * 0.25;
      }
      pts = q;
    }
    // finely sampled again, leg by leg, so each stop stays exactly on it
    const pins = [...pin].sort((a, b) => a - b);
    const fine: P[] = [pts[0]];
    const stopAt: number[] = [0];
    for (let k = 0; k + 1 < pins.length; k++) {
      const seg = resample(pts.slice(pins[k], pins[k + 1] + 1), STEP);
      fine.push(...seg.slice(1));
      stopAt.push(fine.length - 1);
    }
    const n = fine.length;
    this.n = n;
    this.length = (n - 1) * STEP;
    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.py = new Float32Array(n);
    this.ground = new Float32Array(n);
    this.bend = new Float32Array(n);
    const floor = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = fine[i].x;
      this.pz[i] = fine[i].z;
      this.ground[i] = heightAt(fine[i].x, fine[i].z);
      floor[i] = Math.max(this.ground[i], WATER_Y) + HOVER;
    }
    // its height: the land eased, never below its hover over the land or the water
    let y = Float32Array.from(floor);
    for (const [r, passes] of [[12, 3], [5, 2]] as [number, number][])
      for (let p = 0; p < passes; p++) {
        const q = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          let a = 0, c = 0;
          for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) (a += y[j]), c++;
          q[i] = Math.max(floor[i], a / c);
        }
        y = q;
      }
    this.py.set(y);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3), m = i;
      if (b - a < 2) continue;
      const h0 = Math.atan2(this.pz[m] - this.pz[a], this.px[m] - this.px[a]), h1 = Math.atan2(this.pz[b] - this.pz[m], this.px[b] - this.px[m]);
      let dh = h1 - h0;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      this.bend[i] = Math.abs(dh) / (STEP * Math.max(1, Math.min(i - a, b - i)));
    }
    stops.forEach((st, k) => this.stops.push({ name: st.name, s: stopAt[k + 1] * STEP, x: st.x, z: st.z }));
    this.planMs = performance.now() - t0;
  }

  private sample(s: number): [number, number, number] {
    const f = Math.min(this.n - 1.0001, Math.max(0, s / STEP)), i = Math.floor(f);
    return [i, Math.min(this.n - 1, i + 1), f - i];
  }
  /** The car's reference point at `s` metres along; returns its turn (a rotation about y laying
      its length along the way). */
  at(s: number, out: THREE.Vector3): number {
    const [i, j, t] = this.sample(s);
    const h = (k: number) => this.py[Math.min(this.n - 1, Math.max(0, k))];
    const y0 = h(i - 1), y1 = h(i), y2 = h(j), y3 = h(j + 1);
    const y = 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t * t + (-y0 + 3 * y1 - 3 * y2 + y3) * t * t * t);
    out.set(this.px[i] + (this.px[j] - this.px[i]) * t, y + CAR_Y, this.pz[i] + (this.pz[j] - this.pz[i]) * t);
    const a = Math.max(0, i - 1), b = Math.min(this.n - 1, j + 1);
    return -Math.atan2(this.pz[b] - this.pz[a], this.px[b] - this.px[a]);
  }
  /** The rise ahead at `s` (radians). */
  pitch(s: number): number {
    const [i] = this.sample(s);
    const a = Math.max(0, i - 3), b = Math.min(this.n - 1, i + 3);
    return b > a ? Math.atan2(this.py[b] - this.py[a], STEP * (b - a)) : 0;
  }
  /** How sharply it turns at `s`, looking a little ahead. */
  bendAt(s: number, ahead = 0): number {
    let b = 0;
    for (let d = 0; d <= ahead; d += 8) b = Math.max(b, this.bend[this.sample(s + d)[0]]);
    return b;
  }
  /** Whether the land (not the water) is under the way at `s`. */
  dry(s: number): boolean {
    return this.ground[this.sample(s)[0]] > WATER_Y + 0.1;
  }
}

/* ---------------------------------------------------------------- the cars, and the way's light */
export class Railway {
  readonly group = new THREE.Group();
  readonly stations: Station[] = [];
  route: Route | null = null;
  private track: THREE.Mesh | null = null;
  private trackMat: THREE.MeshBasicNodeMaterial;
  private uS = T.uniform(0);
  private uT = T.uniform(0);
  private pools: THREE.Mesh[] = [];

  constructor(specs: StationSpec[]) {
    // the way's light: two fine threads a car's gauge apart, a faint breath of light between them,
    // shown from a little behind the car to a few hundred metres ahead, swells travelling on
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    m.colorNode = T.Fn(() => {
      const u = T.uv().x.sub(0.5).mul(1.8); // metres across the band (±0.9)
      const along = T.attribute("aS", "float");
      const w = T.max(T.fwidth(u), 0.002);
      const d = T.abs(T.abs(u).sub(0.32));
      // a hairline (a centimetre or so), its light spread thinner where it is finer than a pixel,
      // and a faint halo about it
      const core = T.smoothstep(w.add(0.008), 0.0, d).mul(T.min(1, T.float(0.012).div(w)));
      const halo = T.exp(d.mul(d).mul(-900)).mul(0.18);
      // light flowing on along it: long soft swells with quiet between, so it reads as moving light
      const flow = T.pow(T.sin(along.sub(this.uT.mul(6)).mul(0.11)).mul(0.5).add(0.5), 3);
      const breath = T.float(0.22).add(flow.mul(0.78));
      const rel = along.sub(this.uS);
      const shown = T.smoothstep(-35, -4, rel).mul(T.float(1).sub(T.smoothstep(90, 240, rel)));
      const far = T.float(1).sub(T.smoothstep(120, 260, T.positionWorld.sub(T.cameraPosition).length()));
      const k = core.add(halo).mul(breath).mul(shown).mul(far);
      return T.vec4(T.vec3(1.0, 0.88, 0.66).mul(k.mul(0.34)), 1);
    })();
    this.trackMat = m;
    // the soft pool of light a resting car floats over
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    pm.colorNode = T.Fn(() => {
      const r = T.uv().sub(0.5).length().mul(2);
      const k = T.exp(r.mul(r).mul(-5)).mul(T.float(1).sub(T.smoothstep(0.8, 1, r))).mul(T.sin(this.uT.mul(0.9)).mul(0.12).add(0.88));
      return T.vec4(T.vec3(1.0, 0.84, 0.58).mul(k.mul(0.22)), 1);
    })();
    const poolGeo = new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2);
    for (const sp of specs) {
      const car = rideCar();
      for (const a of car.userData.axles as THREE.Group[]) a.visible = false; // it floats: no wheels
      this.group.add(car);
      // facing toward the shore, the way it most likely goes first
      const heading = -Math.atan2(-sp.z, -sp.x);
      const st: Station = { name: sp.name, x: sp.x, z: sp.z, heading, car, away: false };
      this.stations.push(st);
      const pool = new THREE.Mesh(poolGeo, pm);
      pool.position.set(sp.x, Math.max(heightAt(sp.x, sp.z), WATER_Y) + 0.06, sp.z);
      pool.renderOrder = 2;
      this.pools.push(pool);
      this.group.add(pool);
      this.park(st);
    }
  }

  /** A station's car back at its place, floating. */
  park(st: Station): void {
    st.away = false;
    st.car.position.set(st.x, Math.max(heightAt(st.x, st.z), WATER_Y) + HOVER + CAR_Y, st.z);
    st.car.rotation.set(0, st.heading, 0);
    st.car.userData.rest = st.car.position.y;
    st.car.visible = true;
  }

  /** The route to ride (null lets its light go). */
  setRoute(r: Route | null): void {
    this.route = r;
    if (this.track) {
      this.group.remove(this.track);
      this.track.geometry.dispose();
      this.track = null;
    }
    if (!r) return;
    const pos = new Float32Array(r.n * 6), uv = new Float32Array(r.n * 4), aS = new Float32Array(r.n * 2), idx: number[] = [];
    for (let i = 0; i < r.n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(r.n - 1, i + 1);
      const tx = r.px[b] - r.px[a], tz = r.pz[b] - r.pz[a], L = Math.hypot(tx, tz) || 1;
      const rx = -tz / L, rz = tx / L, y = r.py[i] + 0.02;
      pos.set([r.px[i] - rx * 0.9, y, r.pz[i] - rz * 0.9, r.px[i] + rx * 0.9, y, r.pz[i] + rz * 0.9], i * 6);
      uv.set([0, 0, 1, 0], i * 4);
      aS[i * 2] = aS[i * 2 + 1] = i * STEP;
      if (i + 1 < r.n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.track = new THREE.Mesh(g, this.trackMat);
    this.track.renderOrder = 2;
    this.track.frustumCulled = false;
    this.group.add(this.track);
  }

  /** Each frame: the way's light follows the car (`s` along the route), the resting cars float. */
  update(near: THREE.Vector3, out: boolean, s: number, t: number, riding: Station | null): void {
    this.group.visible = out;
    if (!out) return;
    this.uS.value = s;
    this.uT.value = t;
    this.stations.forEach((st, i) => {
      // a car resting at its place floats on its pool; the pool shows while the car is home
      this.pools[i].visible = !st.away && Math.hypot(st.x - near.x, st.z - near.z) < 900;
      if (st === riding) return;
      st.car.visible = Math.hypot(st.car.position.x - near.x, st.car.position.z - near.z) < 900;
      if (!st.away && st.car.visible) st.car.position.y = (st.car.userData.rest as number) + Math.sin(t * 0.8 + i * 1.7) * 0.035;
    });
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
}
