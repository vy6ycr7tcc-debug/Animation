/* Forms for visions of light: each a set of N points (xyz, local; y up, the ground at y = 0, the
   form facing +z), so any form can gather into any other point for point, as the vision of
   creation does (world/vision.ts). The lesson scenes tell their stories in these.
   Pure geometry here; the forms of the body (figures, hands) come from the recorded figure's skin,
   posed by its clips (figureForms). Seeded: the same form every time. */
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { floatAttributes, loadBytes } from "../core/assets";
import { grow, SHAPES, tubes } from "./creation";

export type Shape = Float32Array;
export type Rand = () => number;
const V = THREE.Vector3;
/** The forms' height, in metres. */
export const FORM_H = 4.6;

export function rng(seed: number): Rand {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Area-weighted points on a triangle soup. */
export function onSurface(pos: ArrayLike<number>, index: ArrayLike<number> | null, n: number, R: Rand): Float32Array {
  const tri = index ? index.length / 3 : pos.length / 9;
  const vi = (t: number, k: number) => (index ? index[t * 3 + k] : t * 3 + k);
  const cum = new Float32Array(tri);
  const a = new V(), b = new V(), c = new V();
  let acc = 0;
  for (let t = 0; t < tri; t++) {
    a.fromArray(pos as number[], vi(t, 0) * 3);
    b.fromArray(pos as number[], vi(t, 1) * 3);
    c.fromArray(pos as number[], vi(t, 2) * 3);
    acc += b.sub(a).cross(c.sub(a)).length() * 0.5;
    cum[t] = acc;
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = R() * acc;
    let lo = 0, hi = tri - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m] < r) lo = m + 1;
      else hi = m;
    }
    let u = R(), v = R();
    if (u + v > 1) (u = 1 - u), (v = 1 - v);
    a.fromArray(pos as number[], vi(lo, 0) * 3);
    b.fromArray(pos as number[], vi(lo, 1) * 3);
    c.fromArray(pos as number[], vi(lo, 2) * 3);
    a.multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v);
    out.set([a.x, a.y, a.z], i * 3);
  }
  return out;
}

/** Stand points `h` tall, their foot at `y0`, centred on the axis. */
export function fit(p: Float32Array, h: number, y0 = 0): Float32Array {
  const box = new THREE.Box3(), v = new V();
  for (let i = 0; i < p.length; i += 3) box.expandByPoint(v.fromArray(p, i));
  const k = h / Math.max(1e-3, box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  for (let i = 0; i < p.length; i += 3) {
    p[i] = (p[i] - cx) * k;
    p[i + 1] = (p[i + 1] - box.min.y) * k + y0;
    p[i + 2] = (p[i + 2] - cz) * k;
  }
  return p;
}

/** Several forms as one, each with its share of the points (shares sum to 1). */
export function combine(n: number, parts: [(m: number) => Float32Array, number][]): Shape {
  const out = new Float32Array(n * 3);
  let at = 0;
  parts.forEach(([make, share], k) => {
    const m = k === parts.length - 1 ? n - at : Math.round(n * share);
    if (m <= 0) return;
    out.set(make(m).subarray(0, m * 3), at * 3);
    at += m;
  });
  return out;
}

/** Move a shape (in place). */
export function shift(p: Float32Array, x: number, y: number, z: number, k = 1): Float32Array {
  for (let i = 0; i < p.length; i += 3) (p[i] = p[i] * k + x), (p[i + 1] = p[i + 1] * k + y), (p[i + 2] = p[i + 2] * k + z);
  return p;
}

/** Points along a smooth curve through `pts`, as a soft cord of radius `r`. */
export function cord(pts: THREE.Vector3[], n: number, R: Rand, r = 0.06, closed = false): Float32Array {
  const c = new THREE.CatmullRomCurve3(pts, closed, "centripetal");
  const out = new Float32Array(n * 3), p = new V(), d = new V();
  for (let i = 0; i < n; i++) {
    c.getPoint(R(), p);
    d.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(r * Math.sqrt(R()));
    out.set([p.x + d.x, p.y + d.y, p.z + d.z], i * 3);
  }
  return out;
}

/* ---------------------------------------------------------------- simple forms */
export function sphere(n: number, R: Rand, r = 1.4, cy = FORM_H / 2, shell = 0.8): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(R() < shell ? r : r * Math.cbrt(R()));
    out.set([d.x, d.y + cy, d.z], i * 3);
  }
  return out;
}

/** A small glow low on the ground, waiting: what stands at a seat before anyone sits. */
export function seed(n: number, R: Rand): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(0.35 * Math.cbrt(R()) + (R() < 0.3 ? R() * 0.9 : 0));
    out.set([d.x, 0.7 + d.y * 0.8, d.z], i * 3);
  }
  return out;
}

export function point(n: number, R: Rand, cy = FORM_H / 2): Shape {
  return sphere(n, R, 0.06, cy, 0);
}

/** A rope held between two hands (at ±hx, height hy), with an overhand knot pulled tight at its
    middle; `slack` 0 taut, 1 hanging loose, the knot loosened open. */
export function rope(n: number, R: Rand, hx = 1.2, hy = 2.1, slack = 0): Shape {
  const sag = 0.08 + slack * 0.9;
  const pts: THREE.Vector3[] = [];
  const knotR = 0.14 + slack * 0.35;
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, x = -hx + u * 2 * hx;
    const y = hy - Math.sin(u * Math.PI) * sag;
    // the knot: a trefoil wound about the middle of the rope
    const k = Math.exp(-Math.pow((u - 0.5) / 0.09, 2));
    const a = (u - 0.5) * 50;
    pts.push(new V(x + Math.sin(a * 1.5) * knotR * k * 0.6, y + Math.cos(a) * knotR * k, Math.sin(a) * knotR * k));
  }
  return cord(pts, n, R, 0.045 + slack * 0.02);
}

/** A rope from hand to hand (`a`, `b`), sagging by `slack`, with a knot at its middle while taut. */
export function ropeBetween(n: number, R: Rand, a: THREE.Vector3, b: THREE.Vector3, slack = 0): Shape {
  const pts: THREE.Vector3[] = [];
  const knotR = 0.1 + slack * 0.25;
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, p = a.clone().lerp(b, u);
    p.y -= Math.sin(u * Math.PI) * (0.05 + slack * 0.7);
    const k = Math.exp(-Math.pow((u - 0.5) / 0.1, 2)) * (1 - slack * 0.6), t = (u - 0.5) * 50;
    p.add(new V(Math.sin(t * 1.5) * knotR * k * 0.6, Math.cos(t) * knotR * k, Math.sin(t) * knotR * k + 0.05));
    pts.push(p);
  }
  return cord(pts, n, R, 0.035 + slack * 0.015);
}

/** A wheel standing upright facing you: rim, hub, eight spokes. */
export function wheel(n: number, R: Rand, r = 1.8, cy = FORM_H / 2): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const role = R(), a = R() * Math.PI * 2;
    let x: number, y: number, z = (R() - 0.5) * 0.12;
    if (role < 0.55) {
      const rr = r + (R() - 0.5) * 0.1;
      (x = Math.cos(a) * rr), (y = Math.sin(a) * rr);
    } else if (role < 0.68) {
      const rr = 0.25 * Math.sqrt(R());
      (x = Math.cos(a) * rr), (y = Math.sin(a) * rr);
    } else {
      const s = Math.floor(R() * 8) * (Math.PI / 4), u = 0.25 + R() * (r - 0.25);
      (x = Math.cos(s) * u + (R() - 0.5) * 0.05), (y = Math.sin(s) * u + (R() - 0.5) * 0.05);
      z *= 0.4;
    }
    out.set([x, y + cy, z], i * 3);
  }
  return out;
}

/** A river winding past on the ground, and on it one leaf. */
export function river(n: number, R: Rand): Shape {
  // it winds down from far above to the ground at your feet, as a river seen from a hill
  const path = (u: number) => new V(Math.sin(u * 5.2) * 1.3 * (0.4 + u * 0.6), FORM_H * 1.05 * (1 - u) + 0.1, -1.2 + u * 1.8);
  return combine(n, [
    [(m) => {
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const u = R(), c = path(u), w = (R() - 0.5) * (0.25 + u * 0.7);
        out.set([c.x + w, c.y + (R() - 0.5) * 0.05, c.z + (R() - 0.5) * 0.08], i * 3);
      }
      return out;
    }, 0.86],
    [(m) => {
      const c = path(0.55), l = leaf(m, R, 0.7, 0);
      return shift(l, c.x + 0.15, c.y + 0.1, c.z + 0.1);
    }, 0.14],
  ]);
}

/** A leaf, flat, curled a little at its tip (it rides a hand's height if `y` is given). */
export function leaf(n: number, R: Rand, s = 1, y = 0.2): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = R(), w = (R() * 2 - 1) * Math.sin(u * Math.PI) * 0.35;
    const x = (u - 0.5) * 1.1 * s, z = w * s, yy = y + Math.pow(u, 3) * 0.25 * s + (R() < 0.2 ? 0 : Math.abs(w) * 0.1);
    out.set([x, yy, z], i * 3);
  }
  return out;
}

/** A storm cloud over the sea, raining; `spent` 1: the cloud thinned, the rain gone, the sea calm. */
export function storm(n: number, R: Rand, spent = 0): Shape {
  return combine(n, [
    [(m) => {
      // the cloud: billows of soft points
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const k = Math.floor(R() * 7), a = k * 2.1;
        const c = new V(Math.cos(a) * 1.4 * (k ? 1 : 0), 3.6 + Math.sin(k * 1.7) * 0.25, Math.sin(a) * 0.7 * (k ? 1 : 0));
        const d = new V(R() - 0.5, (R() - 0.5) * 0.6, R() - 0.5).normalize().multiplyScalar((0.9 - spent * 0.4) * Math.cbrt(R()));
        out.set([c.x + d.x, c.y + d.y + spent * 0.6, c.z + d.z], i * 3);
      }
      return out;
    }, 0.45],
    [(m) => {
      // the rain, and the sea below
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        if (R() < 0.45 * (1 - spent)) out.set([(R() - 0.5) * 3.4, R() * 3.2, (R() - 0.5) * 1.6], i * 3);
        else {
          const x = (R() - 0.5) * 9, z = (R() - 0.5) * 5;
          out.set([x, 0.06 + Math.sin(x * 1.3 + z) * 0.12 * (1 - spent), z], i * 3);
        }
      }
      return out;
    }, 0.55],
  ]);
}

/** A flame: a teardrop of light rising from a small bowl or wick at height `y`. */
export function flame(n: number, R: Rand, y = 1.2, h = 1.6): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = Math.pow(R(), 0.8), a = R() * Math.PI * 2;
    const r = Math.sin(Math.min(1, v * 1.25) * Math.PI) * 0.42 * (1 - v * 0.55) * Math.sqrt(R());
    out.set([Math.cos(a) * r, y + v * h, Math.sin(a) * r], i * 3);
  }
  return out;
}

/** A candle: a column with its flame. */
export function candle(n: number, R: Rand): Shape {
  return combine(n, [
    [(m) => {
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const a = R() * Math.PI * 2, r = 0.32;
        out.set([Math.cos(a) * r, R() * 1.8, Math.sin(a) * r], i * 3);
      }
      return out;
    }, 0.45],
    [(m) => flame(m, R, 1.95, 1.3), 0.55],
  ]);
}

/** The sun: a disc of light with rays. */
export function sun(n: number, R: Rand, cy = FORM_H * 0.62): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2;
    if (R() < 0.55) {
      const r = Math.sqrt(R()) * 1.05;
      out.set([Math.cos(a) * r, cy + Math.sin(a) * r, (R() - 0.5) * 0.2], i * 3);
    } else {
      const k = Math.round(a / (Math.PI / 8)) * (Math.PI / 8), r = 1.25 + Math.pow(R(), 1.5) * 1.0;
      out.set([Math.cos(k) * r, cy + Math.sin(k) * r, (R() - 0.5) * 0.1], i * 3);
    }
  }
  return out;
}

/** Rain falling from above across the whole form. */
export function rain(n: number, R: Rand): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = (R() - 0.5) * 5, z = (R() - 0.5) * 3;
    out.set([x, R() * FORM_H * 1.1, z], i * 3);
  }
  return out;
}

/** An open book (a ledger): two pages curving up from the spine, lines of writing on them. */
export function book(n: number, R: Rand): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = R() < 0.5 ? -1 : 1, u = R(), v = R();
    const line = Math.floor(v * 14);
    const onLine = R() < 0.55 && u > 0.12 && u < 0.9;
    const vv = onLine ? (line + 0.5) / 14 : v;
    const x = s * u * 1.4, y = 1.3 + Math.sin(u * Math.PI * 0.5) * 0.35 + (onLine ? 0.01 : 0), z = (vv - 0.5) * 1.9;
    out.set([x, y + (onLine ? 0.02 : 0), z], i * 3);
  }
  return out;
}

/** A heart, full and round, standing up. */
export function heart(n: number, R: Rand, s = 1.3, cy = FORM_H / 2): Shape {
  const out = new Float32Array(n * 3);
  let i = 0;
  while (i < n) {
    const x = (R() - 0.5) * 2.6, y = (R() - 0.5) * 2.6, z = (R() - 0.5) * 1.2;
    const f = Math.pow(x * x + (9 / 4) * z * z + y * y - 1, 3) - x * x * y * y * y - (9 / 80) * z * z * y * y * y;
    if (f <= 0) out.set([x * s, cy + y * s, z * s], 3 * i++);
  }
  return out;
}

/** A road going away from you to the horizon. */
export function road(n: number, R: Rand): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.pow(R(), 0.7), side = R() < 0.7 ? (R() < 0.5 ? -1 : 1) : R() * 2 - 1;
    const w = 0.9 * (1 - u * 0.8);
    out.set([side * w + Math.sin(u * 4) * 0.8 * u, 0.05, 2 - u * 26], i * 3);
  }
  return out;
}

/** A tree of the world's own kind (creation.ts), grown from `seedN`. */
export function tree(n: number, R: Rand, seedN = 0.61, h = FORM_H, kind = 2): Shape {
  const { limbs, roots } = grow({ ...SHAPES[kind], height: 4, radius: 0.12, limbLen: 1.8, roots: 5 }, seedN);
  const g = tubes([...limbs, ...roots.slice(0, 5)]);
  return fit(onSurface((g.attributes.position as THREE.BufferAttribute).array, g.index ? g.index.array : null, n, R), h);
}

/** A young plant: a stem and leaves unfolding. */
export function sprout(n: number, R: Rand, h = 1.4): Shape {
  return combine(n, [
    [(m) => cord([new V(0, 0, 0), new V(0.05, h * 0.4, 0), new V(-0.05, h * 0.75, 0.02), new V(0, h, 0)], m, R, 0.03), 0.35],
    [(m) => shift(leaf(m, R, 0.9, 0), 0.4, h * 0.55, 0), 0.33],
    [(m) => shift(leaf(m, R, 0.8, 0), -0.4, h * 0.8, 0.05), 0.32],
  ]);
}

/** A galaxy seen at a slant: a bright core and two arms. */
export function galaxy(n: number, R: Rand, r = 2.4, cy = FORM_H / 2): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const core = R() < 0.25;
    const u = core ? Math.pow(R(), 2) * 0.35 : 0.15 + R() * 0.85;
    const arm = R() < 0.5 ? 0 : Math.PI;
    const a = arm + u * 7 + (R() - 0.5) * 0.5;
    const rr = u * r, th = (R() - 0.5) * 0.18 * (1 - u);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    out.set([x, cy + z * 0.35 + th, z * 0.94], i * 3);
  }
  return out;
}

/** A lantern: a small house of light on a pole. */
export function lantern(n: number, R: Rand): Shape {
  return combine(n, [
    [(m) => cord([new V(0, 0, 0), new V(0, 2.2, 0)], m, R, 0.03), 0.18],
    [(m) => {
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const a = Math.floor(R() * 6) * (Math.PI / 3), b = a + Math.PI / 3, u = R(), v = R();
        const r = 0.34 * (1 - Math.abs(v - 0.5) * 0.4);
        out.set([Math.cos(a) * r * (1 - u) + Math.cos(b) * r * u, 2.3 + v * 0.8, Math.sin(a) * r * (1 - u) + Math.sin(b) * r * u], i * 3);
      }
      return out;
    }, 0.42],
    [(m) => flame(m, R, 2.45, 0.45), 0.4],
  ]);
}

/** A bowl held out, steam rising from it (soup brought to a neighbour). */
export function bowl(n: number, R: Rand, y = 1.6): Shape {
  return combine(n, [
    [(m) => {
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const a = R() * Math.PI * 2, v = R();
        const r = 0.2 + Math.sin(v * Math.PI * 0.5) * 0.45;
        out.set([Math.cos(a) * r, y + v * 0.4, Math.sin(a) * r], i * 3);
      }
      return out;
    }, 0.5],
    [(m) => {
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const v = R(), k = Math.floor(R() * 3), a = v * 6 + k * 2.1;
        out.set([(k - 1) * 0.18 + Math.sin(a) * 0.12 * v, y + 0.45 + v * 1.4, Math.cos(a) * 0.08 * v], i * 3);
      }
      return out;
    }, 0.5],
  ]);
}

/** A fountain: a basin, and water rising from a spring at its heart and falling in arcs. */
export function fountain(n: number, R: Rand): Shape {
  return combine(n, [
    [(m) => {
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const a = R() * Math.PI * 2, r = 1.5 + (R() - 0.5) * 0.12;
        out.set([Math.cos(a) * r, R() * 0.5, Math.sin(a) * r], i * 3);
      }
      return out;
    }, 0.35],
    [(m) => {
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const k = Math.floor(R() * 8), a = (k / 8) * Math.PI * 2, u = R();
        // up the jet, then out and down in an arc
        const r = u * 1.3, y = 0.5 + Math.sin(u * Math.PI) * 2.4 + (1 - u) * 0.6;
        out.set([Math.cos(a) * r + (R() - 0.5) * 0.06, y, Math.sin(a) * r + (R() - 0.5) * 0.06], i * 3);
      }
      return out;
    }, 0.65],
  ]);
}

/** A well: a ring of stone about a still dark water, a rope going down. */
export function well(n: number, R: Rand): Shape {
  return combine(n, [
    [(m) => {
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const a = R() * Math.PI * 2, r = 1.1 + R() * 0.3;
        out.set([Math.cos(a) * r, R() * 0.9, Math.sin(a) * r], i * 3);
      }
      return out;
    }, 0.7],
    [(m) => cord([new V(0, 2.4, 0), new V(0, 0.2, 0)], m, R, 0.03), 0.3],
  ]);
}

/** Turn a shape about the upright axis (in place). */
export function turnY(p: Float32Array, a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], z = p[i + 2];
    p[i] = x * c + z * s;
    p[i + 2] = -x * s + z * c;
  }
  return p;
}

/** A rough stone to sit on. */
export function rock(n: number, R: Rand, sx = 0.7, sy = 0.45, sz = 0.6, y = 0): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    const k = 1 + Math.sin(d.x * 3.1 + d.y * 1.7) * 0.1 + Math.sin(d.z * 5.3 - d.x * 2.2) * 0.07;
    out.set([d.x * sx * k, y + Math.max(0, d.y * sy * k + sy * 0.6), d.z * sz * k], i * 3);
  }
  return out;
}

/** Cords wound about an upright figure: `strands` spirals from `y0` to `y1`. */
export function helix(n: number, R: Rand, r = 0.5, y0 = 0.5, y1 = 3.2, turns = 4, strands = 2): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = R(), k = Math.floor(R() * strands), a = u * turns * Math.PI * 2 + (k / strands) * Math.PI * 2;
    const rr = r * (1 - 0.35 * Math.pow(Math.abs(u - 0.45) * 2, 2)) + (R() - 0.5) * 0.05;
    out.set([Math.cos(a) * rr, y0 + u * (y1 - y0) + (R() - 0.5) * 0.05, Math.sin(a) * rr], i * 3);
  }
  return out;
}

/* ---------------------------------------------------------------- forms of the body */
export interface BodyForms {
  /** The figure's skin posed by a clip at a moment, bones bent further ([bone, rx, rz]), `h` tall. */
  figure(n: number, R: Rand, clip: string, at: number, bends?: [string, number, number?][], h?: number): Shape;
  /** A figure as `figure`, and where its hands are (in the same fitted frame). */
  holding(n: number, R: Rand, clip: string, at: number, bends?: [string, number, number?][], h?: number): { shape: Shape; hl: THREE.Vector3; hr: THREE.Vector3 };
  /** Only the hands (and wrists), posed as `figure`, `h` wide from hand to hand, centred at height `cy`. */
  hands(n: number, R: Rand, clip: string, at: number, bends?: [string, number, number?][], h?: number, cy?: number): Shape;
}

let bodyPromise: Promise<BodyForms | null> | null = null;
/** The recorded figure, loaded once, as forms. */
export function bodyForms(): Promise<BodyForms | null> {
  bodyPromise ??= (async () => {
    const wb = await loadBytes("models/wanderer.glb");
    if (!wb) return null;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(wb, "");
    floatAttributes(gltf.scene);
    const scene = gltf.scene;
    const key = (s: string) => s.replace(/[\s.:/[\]]/g, "");
    const bones: Record<string, THREE.Bone> = {};
    scene.traverse((o) => ((o as THREE.Bone).isBone ? (bones[key(o.name)] = o as THREE.Bone) : 0));
    const mixer = new THREE.AnimationMixer(scene);
    /** The posed skin as triangles, and the hands' places. */
    const pose = (clip: string, at: number, bends: [string, number, number?][] = []) => {
      mixer.stopAllAction();
      const c = gltf.animations.find((a) => a.name === clip);
      if (c) {
        mixer.clipAction(c).reset().play();
        mixer.setTime(at);
      }
      scene.updateMatrixWorld(true);
      for (const [b, rx, rz] of bends) {
        const bone = bones[key(b)];
        if (!bone) continue;
        bone.rotation.x += rx;
        if (rz) bone.rotation.z += rz;
      }
      scene.updateMatrixWorld(true);
      const pos: number[] = [], idx: number[] = [];
      scene.traverse((o) => {
        const sm = o as THREE.SkinnedMesh;
        if (!sm.isSkinnedMesh) return;
        const g = sm.geometry as THREE.BufferGeometry;
        const p = g.attributes.position as THREE.BufferAttribute, v = new V();
        const base = pos.length / 3;
        for (let i = 0; i < p.count; i++) {
          sm.applyBoneTransform(i, v.fromBufferAttribute(p, i));
          v.applyMatrix4(sm.matrixWorld);
          pos.push(v.x, v.y, v.z);
        }
        const ix = g.index ? g.index.array : null;
        const count = ix ? ix.length : p.count;
        for (let i = 0; i < count; i++) idx.push(base + (ix ? ix[i] : i));
      });
      const hl = bones[key("DEF-hand.L")]?.getWorldPosition(new V()) ?? new V(), hr = bones[key("DEF-hand.R")]?.getWorldPosition(new V()) ?? new V();
      return { pos, idx, hl, hr };
    };
    // the figure faces +z in its own frame (its left at +x), as the forms do
    return {
      figure(n, R, clip, at, bends = [], h = FORM_H * 0.8) {
        const { pos, idx } = pose(clip, at, bends);
        return fit(onSurface(pos, idx, n, R), h);
      },
      holding(n, R, clip, at, bends = [], h = FORM_H * 0.8) {
        const { pos, idx, hl, hr } = pose(clip, at, bends);
        const p = onSurface(pos, idx, n, R);
        const box = new THREE.Box3(), v = new V();
        for (let i = 0; i < p.length; i += 3) box.expandByPoint(v.fromArray(p, i));
        const k = h / Math.max(1e-3, box.max.y - box.min.y);
        const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
        const f = (q: THREE.Vector3) => q.set((q.x - cx) * k, (q.y - box.min.y) * k, (q.z - cz) * k);
        for (let i = 0; i < p.length; i += 3) {
          f(v.fromArray(p, i));
          p.set([v.x, v.y, v.z], i);
        }
        return { shape: p, hl: f(hl.clone()), hr: f(hr.clone()) };
      },
      hands(n, R, clip, at, bends = [], h = 2.8, cy = FORM_H * 0.45) {
        const { pos, idx, hl, hr } = pose(clip, at, bends);
        // the triangles near either hand
        const keep: number[] = [];
        const a = new V();
        for (let t = 0; t < idx.length; t += 3) {
          a.fromArray(pos, idx[t] * 3);
          if (a.distanceTo(hl) < 0.2 || a.distanceTo(hr) < 0.2) keep.push(idx[t], idx[t + 1], idx[t + 2]);
        }
        // fitted by their width (`h` apart, palm to palm), centred at the height of an offering
        const p = onSurface(pos, keep, n, R);
        const box = new THREE.Box3(), v = new V();
        for (let i = 0; i < p.length; i += 3) box.expandByPoint(v.fromArray(p, i));
        const k = h / Math.max(1e-3, box.max.x - box.min.x);
        const c = box.getCenter(new V());
        for (let i = 0; i < p.length; i += 3) {
          p[i] = (p[i] - c.x) * k;
          p[i + 1] = (p[i + 1] - c.y) * k + cy;
          p[i + 2] = (p[i + 2] - c.z) * k;
        }
        return p;
      },
    };
  })();
  return bodyPromise;
}

/** A figure holding out its hands, a light between them of radius `r` (0: nothing held). */
export function offering(n: number, R: Rand, b: BodyForms, r = 0.3, clip = "Spell_Simple_Idle_Loop", at = 2.2, h = FORM_H * 0.8): Shape {
  const f = b.holding(r > 0 ? Math.round(n * 0.72) : n, R, clip, at, [], h);
  if (r <= 0) return f.shape;
  const c = f.hl.clone().add(f.hr).multiplyScalar(0.5);
  const out = new Float32Array(n * 3);
  out.set(f.shape);
  out.set(shift(sphere(n - f.shape.length / 3, R, r, 0, 0.5), c.x, c.y, c.z + 0.12), f.shape.length);
  return out;
}

/** A row of small lights along a road going away: every step taken leaves one behind. */
export function lights(n: number, R: Rand, count = 9): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(R() * count), u = k / (count - 1);
    const c = new V(Math.sin(u * 4) * 0.8 * u - 0.4 + (k % 2) * 0.8, 0.5 + u * 0.3, 2 - u * 20);
    const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(0.16 * Math.cbrt(R()) * (1 - u * 0.4));
    out.set([c.x + d.x, c.y + d.y, c.z + d.z], i * 3);
  }
  return out;
}

/** The night sky come down: a dome of stars, and one brighter. */
export function stars(n: number, R: Rand): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, e = Math.pow(R(), 0.6) * Math.PI * 0.45;
    const r = 5.5 + (R() - 0.5) * 0.4;
    const clump = R() < 0.1 ? 0.6 : 0;
    out.set([Math.cos(a) * Math.cos(e) * r, 0.4 + Math.sin(e) * r * 0.75 + clump, Math.sin(a) * Math.cos(e) * r * 0.5 - 1.5], i * 3);
  }
  return out;
}
