/* Symbols for the lessons' visions (the owner: "one symbol at a time… an open hand or something
   like that. Don't focus on the character… simpler stuff, but more of it in the storytelling").
   Each is a shape drawn in points of light, standing upright and facing the seat (+z), about
   FORM_H tall at most: dense along its outline, a thinner fill inside, so it reads at a glance as
   a glyph of light. Shapes are drawn in the plane (x, y) with a little depth. */
import * as THREE from "three/webgpu";
import { combine, cord, FORM_H, shift, sphere, type Rand, type Shape } from "./forms";

const V = THREE.Vector3;

/** Points on and inside a closed 2D outline (x, y), `rim` of them on the edge, the rest filling
    it thinly; `z` their depth, `cy` where its centre stands. */
function glyph(n: number, R: Rand, outline: [number, number][], rim = 0.7, depth = 0.08): Float32Array {
  const out = new Float32Array(n * 3);
  // edge lengths, for even spacing along the outline
  const L: number[] = [];
  let total = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    L.push(total);
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of outline) (minX = Math.min(minX, x)), (maxX = Math.max(maxX, x)), (minY = Math.min(minY, y)), (maxY = Math.max(maxY, y));
  const inside = (x: number, y: number) => {
    let c = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [xi, yi] = outline[i], [xj, yj] = outline[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  for (let k = 0; k < n; k++) {
    if (R() < rim) {
      const d = R() * total;
      let i = 0;
      while (L[i] < d) i++;
      const a = outline[i], b = outline[(i + 1) % outline.length], s0 = i ? L[i - 1] : 0;
      const t = (d - s0) / Math.max(1e-6, L[i] - s0);
      out.set([a[0] + (b[0] - a[0]) * t + (R() - 0.5) * 0.03, a[1] + (b[1] - a[1]) * t + (R() - 0.5) * 0.03, (R() - 0.5) * depth], k * 3);
    } else {
      let x = 0, y = 0;
      for (let tries = 0; tries < 30; tries++) {
        x = minX + R() * (maxX - minX);
        y = minY + R() * (maxY - minY);
        if (inside(x, y)) break;
      }
      out.set([x, y, (R() - 0.5) * depth * 2], k * 3);
    }
  }
  return out;
}

/** An arc of points (a stroke). */
function stroke(n: number, R: Rand, pts: [number, number][], r = 0.04): Float32Array {
  return cord(pts.map(([x, y]) => new V(x, y, 0)), n, R, r);
}

/** The outline of a capsule from a to b, radius r (a finger). */
function capsule(a: [number, number], b: [number, number], r: number, seg = 10): [number, number][] {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const pts: [number, number][] = [];
  // round the far end, then back round the near end
  for (let i = 0; i <= seg; i++) {
    const t = ang - Math.PI / 2 + (Math.PI * i) / seg;
    pts.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]);
  }
  for (let i = 0; i <= seg; i++) {
    const t = ang + Math.PI / 2 + (Math.PI * i) / seg;
    pts.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]);
  }
  return pts;
}

/** A hand, facing you. `open` 1 fingers spread, 0 curled into a fist; `palmUp` lays it flat,
    held out as an offering. Its centre at (0, cy). */
export function hand(n: number, R: Rand, open = 1, cy = FORM_H * 0.5, s = 1, palmUp = false): Shape {
  const palm: [number, number][] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    palm.push([Math.cos(a) * 0.62, Math.sin(a) * 0.74 - 0.1]);
  }
  const fingers: [number, number, number][] = [
    [-0.52, 0.42, 1.1], // index-ish angles and lengths: [x at base, angle offset, length]
    [-0.18, 0.12, 1.3],
    [0.16, -0.08, 1.2],
    [0.46, -0.3, 0.95],
  ];
  const parts: [(m: number) => Float32Array, number][] = [[(m) => glyph(m, R, palm, 0.6), 0.36]];
  for (const [x, lean, len] of fingers) {
    const L = 0.35 + len * 0.95 * open;
    const spread = lean * 0.5 * open;
    const a: [number, number] = [x, 0.5];
    const b: [number, number] = [x + Math.sin(spread) * L, 0.5 + Math.cos(spread) * L];
    parts.push([(m) => glyph(m, R, capsule(a, b, 0.15), 0.75), 0.12]);
  }
  // the thumb, out to the side
  const ta: [number, number] = [-0.5, -0.2], tb: [number, number] = [-0.5 - 0.75 * (0.4 + 0.6 * open), 0.35 * open];
  parts.push([(m) => glyph(m, R, capsule(ta, tb, 0.17), 0.75), 0.16]);
  const out = combine(n, parts);
  for (let i = 0; i < out.length; i += 3) {
    const x = out[i] * s * 0.95;
    let y = out[i + 1] * s * 0.95, z = out[i + 2];
    if (palmUp) [y, z] = [z * 0.5 + 0.0, -y]; // lay it flat, fingers away from you
    out[i] = x;
    out[i + 1] = y + cy;
    out[i + 2] = z;
  }
  return out;
}

/** An open hand held out flat, something resting on it (a light of radius `r`, or none). */
export function offeredHand(n: number, R: Rand, r = 0.3, cy = FORM_H * 0.38): Shape {
  if (r <= 0) return hand(n, R, 1, cy, 1.1, true);
  return combine(n, [[(m) => hand(m, R, 1, cy, 1.1, true), 0.75], [(m) => sphere(m, R, r, cy + r + 0.1, 0.6), 0.25]]);
}

/** Two hands cupped side by side, a light held in them. */
export function cupped(n: number, R: Rand, r = 0.28): Shape {
  const cy = FORM_H * 0.4;
  return combine(n, [
    [(m) => shift(hand(m, R, 0.55, 0, 0.8, true), -0.55, cy, 0), 0.36],
    [(m) => shift(hand(m, R, 0.55, 0, 0.8, true), 0.55, cy, 0).map((v, i) => (i % 3 === 0 ? -v : v)) as Float32Array, 0.36],
    [(m) => sphere(m, R, r, cy + 0.45, 0.6), 0.28],
  ]);
}

/** A hand raised, palm out: stop, or no. */
export function raisedHand(n: number, R: Rand): Shape {
  return hand(n, R, 0.9, FORM_H * 0.55, 1.15);
}

/** A closed hand, gripping. */
export function fist(n: number, R: Rand): Shape {
  return hand(n, R, 0.05, FORM_H * 0.5, 1.15);
}

/** Footsteps going away up the ground (walking on). */
export function footsteps(n: number, R: Rand, count = 6): Shape {
  const parts: [(m: number) => Float32Array, number][] = [];
  for (let k = 0; k < count; k++) {
    const side = k % 2 ? 0.28 : -0.28, z = 1.8 - k * 0.9;
    const foot: [number, number][] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      foot.push([Math.cos(a) * 0.14, Math.sin(a) * 0.3]);
    }
    parts.push([
      (m) => {
        const f = glyph(m, R, foot, 0.8, 0.02);
        for (let i = 0; i < f.length; i += 3) {
          const x = f[i], y = f[i + 1];
          f[i] = x + side;
          f[i + 1] = 0.08;
          f[i + 2] = z - y;
        }
        return f;
      },
      1 / count,
    ]);
  }
  return combine(n, parts);
}

/** A bird in flight: two long curved wings and a small body. */
export function bird(n: number, R: Rand, cy = FORM_H * 0.6, lift = 0): Shape {
  return combine(n, [
    [(m) => shift(stroke(m, R, [[0, 0], [-0.6, 0.35 + lift], [-1.3, 0.5 + lift], [-1.9, 0.3 + lift * 1.3]], 0.07), 0, cy, 0), 0.4],
    [(m) => shift(stroke(m, R, [[0, 0], [0.6, 0.35 + lift], [1.3, 0.5 + lift], [1.9, 0.3 + lift * 1.3]], 0.07), 0, cy, 0), 0.4],
    [(m) => shift(sphere(m, R, 0.16, 0, 0.7), 0, cy - 0.05, 0), 0.2],
  ]);
}

/** An eye: its almond outline and the pupil. */
export function eye(n: number, R: Rand, open = 1, cy = FORM_H * 0.55): Shape {
  const lid: [number, number][] = [];
  for (let i = 0; i <= 30; i++) {
    const x = -1.3 + (2.6 * i) / 30;
    lid.push([x, Math.cos((x / 1.3) * (Math.PI / 2)) * 0.6 * open]);
  }
  for (let i = 29; i > 0; i--) {
    const x = -1.3 + (2.6 * i) / 30;
    lid.push([x, -Math.cos((x / 1.3) * (Math.PI / 2)) * 0.6 * open]);
  }
  return combine(n, [[(m) => shift(glyph(m, R, lid, 0.9), 0, cy, 0), 0.7], [(m) => sphere(m, R, 0.28 * open + 0.02, cy, 0.4), 0.3]]);
}

/** An ear, listening: a spiral opening outward. */
export function ear(n: number, R: Rand, cy = FORM_H * 0.55): Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, a = t * Math.PI * 2.4, r = 0.15 + t * 0.95;
    pts.push([Math.cos(a) * r * 0.75, Math.sin(a) * r + cy]);
  }
  return stroke(n, R, pts, 0.06);
}

/** A doorway with light in it (a welcome; a guest). */
export function doorway(n: number, R: Rand, lit = 1): Shape {
  const pts: [number, number][] = [[-0.9, 0], [-0.9, 2.4]];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI - (Math.PI * i) / 16;
    pts.push([Math.cos(a) * 0.9, 2.4 + Math.sin(a) * 0.9]);
  }
  pts.push([0.9, 0]);
  return combine(n, [[(m) => stroke(m, R, pts, 0.06), 0.7], [(m) => shift(sphere(m, R, 0.45 * lit + 0.05, 0, 0.3), 0, 1.6, 0), 0.3]]);
}

/** An hourglass, its sand running. */
export function hourglass(n: number, R: Rand, run = 0.5): Shape {
  const glass: [number, number][] = [[-0.8, 3.6], [0.8, 3.6], [0.08, 2.1], [0.8, 0.6], [-0.8, 0.6], [-0.08, 2.1]];
  const sand = (m: number) => {
    const out = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) {
      const top = R() < 1 - run;
      const t = R() * (top ? 1 - run : run) * 1.2;
      const y = top ? 2.2 + t : 0.7 + t, w = (top ? y - 2.1 : 2.1 - y) / 1.5 * 0.75;
      out.set([(R() - 0.5) * 2 * w, y, (R() - 0.5) * 0.3], i * 3);
    }
    return out;
  };
  return combine(n, [[(m) => glyph(m, R, glass, 0.9), 0.55], [sand, 0.45]]);
}

/** A spiral: winding inward (`inward`) or opening out. */
export function spiral(n: number, R: Rand, turns = 3, cy = FORM_H * 0.5, r = 1.6): Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120, a = t * Math.PI * 2 * turns;
    pts.push([Math.cos(a) * r * (1 - t * 0.92), cy + Math.sin(a) * r * (1 - t * 0.92)]);
  }
  return stroke(n, R, pts, 0.05);
}

/** A tangle of thread: worry, a mind going round. */
export function tangle(n: number, R: Rand, cy = FORM_H * 0.5): Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90 * Math.PI * 6;
    pts.push([Math.sin(t * 1.3) * 1.1 + Math.sin(t * 3.1) * 0.3, cy + Math.cos(t * 1.7) * 0.9 + Math.sin(t * 2.3) * 0.25]);
  }
  return stroke(n, R, pts, 0.04);
}

/** Rings spreading out from a point: a breath, a word going out. */
export function rings(n: number, R: Rand, count = 4, cy = FORM_H * 0.5): Shape {
  const parts: [(m: number) => Float32Array, number][] = [];
  for (let k = 0; k < count; k++) {
    const r = 0.4 + k * 0.45;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 40; i++) pts.push([Math.cos((i / 40) * Math.PI * 2) * r, cy + Math.sin((i / 40) * Math.PI * 2) * r]);
    parts.push([(m) => stroke(m, R, pts, 0.035), 1 / count]);
  }
  return combine(n, parts);
}

/** A wall and a hand pressed against it (pushing). */
export function pushing(n: number, R: Rand): Shape {
  return combine(n, [
    [(m) => stroke(m, R, [[0.9, 0], [0.9, FORM_H * 0.85]], 0.08), 0.35],
    [(m) => shift(hand(m, R, 0.9, FORM_H * 0.5, 0.9), -0.4, 0, 0), 0.65],
  ]);
}

/** A leaf let go from an open hand, drifting down. */
export function letGo(n: number, R: Rand): Shape {
  const leaf: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const t = (i / 20) * Math.PI;
    leaf.push([Math.sin(t) * 0.22, -Math.cos(t) * 0.45]);
  }
  for (let i = 20; i >= 0; i--) {
    const t = (i / 20) * Math.PI;
    leaf.push([-Math.sin(t) * 0.22, -Math.cos(t) * 0.45]);
  }
  return combine(n, [[(m) => hand(m, R, 1, FORM_H * 0.62, 0.85, true), 0.7], [(m) => shift(glyph(m, R, leaf, 0.8), 0.9, FORM_H * 0.28, 0.4), 0.3]]);
}

/** A row of small flames: many together. */
export function flames(n: number, R: Rand, count = 7): Shape {
  const parts: [(m: number) => Float32Array, number][] = [];
  for (let k = 0; k < count; k++) {
    const x = (k - (count - 1) / 2) * 0.55, h = 0.5 + ((k * 37) % 5) * 0.08;
    const fl: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, w = Math.sin(t * Math.PI) * 0.16 * (1 - t * 0.4);
      fl.push([x + w, 1.4 + t * h]);
    }
    for (let i = 20; i >= 0; i--) {
      const t = i / 20, w = Math.sin(t * Math.PI) * 0.16 * (1 - t * 0.4);
      fl.push([x - w, 1.4 + t * h]);
    }
    parts.push([(m) => glyph(m, R, fl, 0.6), 1 / count]);
  }
  return combine(n, parts);
}

/** A bowl with steam rising (soup; a meal shared). */
export function steamingBowl(n: number, R: Rand): Shape {
  const bowlPts: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI + (Math.PI * i) / 20;
    bowlPts.push([Math.cos(a) * 1.1, 1.3 + Math.sin(a) * 0.7]);
  }
  const steam = (x: number) => (m: number) => stroke(m, R, Array.from({ length: 12 }, (_, i) => [x + Math.sin(i * 0.8) * 0.15, 1.55 + i * 0.13] as [number, number]), 0.035);
  return combine(n, [[(m) => glyph(m, R, bowlPts, 0.8), 0.55], [steam(-0.35), 0.15], [steam(0), 0.15], [steam(0.35), 0.15]]);
}

/* ---------------------------------------------------------------- symbols by meaning
   The widely known sign for a concept, so an image says the idea at once: a lotus for peace and
   awakening, a dove for peace, a broken chain for release, an anchor for hope and trust, a
   butterfly for change, yin and yang for balance, the infinity sign for what never ends, praying
   hands for gratitude, a mountain for steadiness, a wave for feeling, the crescent moon for rest,
   a key for understanding, a compass for direction, a bridge for connection, the ensō (the zen
   circle) for wholeness and the moment, the unalome for the path, a teardrop for grief, a house
   for home. */
const circlePts = (cx: number, cy: number, r: number, a0 = 0, a1 = Math.PI * 2, n = 40): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(a0 + ((a1 - a0) * i) / n) * r, cy + Math.sin(a0 + ((a1 - a0) * i) / n) * r] as [number, number]);

/** A lotus: petals opening upward from a bowl of water-line. */
export function lotus(n: number, R: Rand, cy = FORM_H * 0.35): Shape {
  const parts: [(m: number) => Float32Array, number][] = [];
  const petal = (ang: number, len: number, w: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, bulge = Math.sin(t * Math.PI) * w;
      pts.push([Math.sin(ang) * t * len + Math.cos(ang) * bulge, cy + Math.cos(ang) * t * len - Math.sin(ang) * bulge]);
    }
    for (let i = 16; i >= 0; i--) {
      const t = i / 16, bulge = Math.sin(t * Math.PI) * w;
      pts.push([Math.sin(ang) * t * len - Math.cos(ang) * bulge, cy + Math.cos(ang) * t * len + Math.sin(ang) * bulge]);
    }
    return pts;
  };
  for (const [a, l, w] of [[0, 1.8, 0.42], [-0.55, 1.55, 0.38], [0.55, 1.55, 0.38], [-1.1, 1.25, 0.32], [1.1, 1.25, 0.32]] as const) parts.push([(m) => glyph(m, R, petal(a, l, w), 0.8), 0.17]);
  parts.push([(m) => stroke(m, R, [[-1.9, cy - 0.1], [-0.8, cy - 0.3], [0.8, cy - 0.3], [1.9, cy - 0.1]], 0.04), 0.15]);
  return combine(n, parts);
}

/** A dove in flight, an olive sprig held. */
export function dove(n: number, R: Rand, cy = FORM_H * 0.55): Shape {
  const body: [number, number][] = [[-1.2, 0.1], [-0.6, 0.35], [0.3, 0.3], [0.9, 0.5], [1.15, 0.42], [0.95, 0.25], [0.4, 0], [-0.5, -0.15], [-1.4, -0.35], [-1.1, -0.05]].map(([x, y]) => [x, y + cy] as [number, number]);
  const wing: [number, number][] = [[-0.3, 0.3], [-0.6, 1.2], [0.1, 1.6], [0.5, 0.9], [0.2, 0.32]].map(([x, y]) => [x, y + cy] as [number, number]);
  return combine(n, [[(m) => glyph(m, R, body, 0.8), 0.45], [(m) => glyph(m, R, wing, 0.8), 0.4], [(m) => stroke(m, R, [[1.1, cy + 0.35], [1.5, cy + 0.2], [1.75, cy + 0.3]], 0.03), 0.15]]);
}

/** A chain of links, broken in the middle: release. */
export function brokenChain(n: number, R: Rand, cy = FORM_H * 0.5): Shape {
  const parts: [(m: number) => Float32Array, number][] = [];
  for (const [x, gap] of [[-1.8, 0], [-1.05, 0], [-0.45, 0.35], [0.45, -0.35], [1.05, 0], [1.8, 0]] as const) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      pts.push([x + Math.cos(a) * 0.42, cy + Math.sin(a) * 0.24 + gap * 0.3]);
    }
    parts.push([(m) => stroke(m, R, gap ? pts.slice(0, 26) : pts, 0.05), 1 / 6]);
  }
  return combine(n, parts);
}

/** An anchor: hope, and what holds steady. */
export function anchor(n: number, R: Rand): Shape {
  const top = FORM_H * 0.78, bot = FORM_H * 0.18;
  return combine(n, [
    [(m) => stroke(m, R, circlePts(0, top + 0.28, 0.26), 0.05), 0.14],
    [(m) => stroke(m, R, [[0, top], [0, bot]], 0.06), 0.28],
    [(m) => stroke(m, R, [[-0.8, top - 0.45], [0.8, top - 0.45]], 0.05), 0.14],
    [(m) => stroke(m, R, circlePts(0, bot + 1.1, 1.1, Math.PI * 1.08, Math.PI * 1.92, 30), 0.06), 0.34],
    [(m) => stroke(m, R, [[-1.05, bot + 0.9], [-1.2, bot + 1.3], [-0.8, bot + 1.1]], 0.04), 0.05],
    [(m) => stroke(m, R, [[1.05, bot + 0.9], [1.2, bot + 1.3], [0.8, bot + 1.1]], 0.04), 0.05],
  ]);
}

/** A butterfly: change. */
export function butterfly(n: number, R: Rand, cy = FORM_H * 0.55, open = 1): Shape {
  const wing = (s: number, up: boolean) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 30; i++) {
      const a = (i / 30) * Math.PI;
      const r = up ? 1.2 : 0.8;
      pts.push([s * Math.sin(a) * r * open, cy + (up ? 0.1 : -0.1) + (up ? 1 : -1) * (1 - Math.cos(a)) * r * 0.55]);
    }
    return pts;
  };
  return combine(n, [
    [(m) => glyph(m, R, wing(-1, true), 0.7), 0.26],
    [(m) => glyph(m, R, wing(1, true), 0.7), 0.26],
    [(m) => glyph(m, R, wing(-1, false), 0.7), 0.18],
    [(m) => glyph(m, R, wing(1, false), 0.7), 0.18],
    [(m) => stroke(m, R, [[0, cy - 0.7], [0, cy + 0.8]], 0.06), 0.12],
  ]);
}

/** Yin and yang: balance. */
export function yinYang(n: number, R: Rand, cy = FORM_H * 0.5, r = 1.6): Shape {
  const s: [number, number][] = [...circlePts(0, cy + r / 2, r / 2, -Math.PI / 2, Math.PI / 2, 20).reverse(), ...circlePts(0, cy - r / 2, r / 2, Math.PI / 2, Math.PI * 1.5, 20)];
  return combine(n, [
    [(m) => stroke(m, R, circlePts(0, cy, r, 0, Math.PI * 2, 60), 0.05), 0.4],
    [(m) => stroke(m, R, s, 0.05), 0.3],
    [(m) => shift(sphere(m, R, 0.18, 0, 0.3), 0, cy + r / 2, 0), 0.15],
    [(m) => stroke(m, R, circlePts(0, cy - r / 2, 0.18), 0.04), 0.15],
  ]);
}

/** The infinity sign: what never ends. */
export function infinity(n: number, R: Rand, cy = FORM_H * 0.5): Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 80; i++) {
    const t = (i / 80) * Math.PI * 2, d = 1 + Math.sin(t) ** 2;
    pts.push([(1.9 * Math.cos(t)) / d, cy + (1.9 * Math.sin(t) * Math.cos(t)) / d]);
  }
  return stroke(n, R, pts, 0.06);
}

/** Two hands pressed together, as in prayer: gratitude. */
export function prayerHands(n: number, R: Rand): Shape {
  const cy = FORM_H * 0.5;
  const one = (s: number): [number, number][] => [[0, cy - 1.2], [s * 0.55, cy - 1.0], [s * 0.6, cy - 0.2], [s * 0.45, cy + 0.7], [s * 0.2, cy + 1.3], [0, cy + 1.4]];
  return combine(n, [[(m) => glyph(m, R, one(-1), 0.75), 0.45], [(m) => glyph(m, R, one(1), 0.75), 0.45], [(m) => stroke(m, R, [[-0.9, cy - 1.3], [0.9, cy - 1.3]], 0.04), 0.1]]);
}

/** A mountain, its snow line: steadiness. */
export function mountain(n: number, R: Rand): Shape {
  const pts: [number, number][] = [[-2.3, 0.1], [-0.9, 2.2], [-0.4, 1.7], [0.3, 3.6], [1.4, 1.9], [2.3, 0.1]];
  return combine(n, [[(m) => glyph(m, R, pts, 0.8), 0.8], [(m) => stroke(m, R, [[-0.2, 2.8], [0.1, 2.6], [0.4, 2.85], [0.75, 2.55]], 0.04), 0.2]]);
}

/** A wave rising and curling: feeling. */
export function wave(n: number, R: Rand): Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, x = -2.2 + t * 4.4;
    pts.push([x, 1.4 + Math.sin(t * Math.PI * 1.5) * 0.9 * t]);
  }
  const curl = circlePts(1.5, 2.1, 0.55, -Math.PI / 2, Math.PI * 1.2, 24);
  return combine(n, [[(m) => stroke(m, R, pts, 0.05), 0.55], [(m) => stroke(m, R, curl, 0.05), 0.25], [(m) => stroke(m, R, [[-2.2, 0.9], [2.2, 0.9]], 0.03), 0.2]]);
}

/** The crescent moon: night, and rest. */
export function crescent(n: number, R: Rand, cy = FORM_H * 0.58): Shape {
  const pts: [number, number][] = [...circlePts(0, cy, 1.4, Math.PI * 0.35, Math.PI * 1.65, 40), ...circlePts(0.6, cy, 1.15, Math.PI * 1.55, Math.PI * 0.45, 40)];
  return glyph(n, R, pts, 0.75);
}

/** A key: understanding, the answer. */
export function key(n: number, R: Rand, cy = FORM_H * 0.5): Shape {
  return combine(n, [
    [(m) => stroke(m, R, circlePts(-1.3, cy, 0.55), 0.05), 0.35],
    [(m) => stroke(m, R, [[-0.75, cy], [1.8, cy]], 0.06), 0.4],
    [(m) => stroke(m, R, [[1.3, cy], [1.3, cy - 0.5]], 0.05), 0.12],
    [(m) => stroke(m, R, [[1.7, cy], [1.7, cy - 0.4]], 0.05), 0.13],
  ]);
}

/** A compass rose: direction. */
export function compass(n: number, R: Rand, cy = FORM_H * 0.5): Shape {
  const star: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = i % 4 === 0 ? 1.7 : i % 2 === 0 ? 0.75 : 0.35;
    star.push([Math.sin(a) * r, cy + Math.cos(a) * r]);
  }
  return combine(n, [[(m) => glyph(m, R, star, 0.8), 0.7], [(m) => stroke(m, R, circlePts(0, cy, 1.25), 0.03), 0.3]]);
}

/** A bridge's arch over water: connection. */
export function bridge(n: number, R: Rand): Shape {
  return combine(n, [
    [(m) => stroke(m, R, circlePts(0, 0.6, 2.2, Math.PI * 0.12, Math.PI * 0.88, 40), 0.07), 0.45],
    [(m) => stroke(m, R, [[-2.4, 1.55], [2.4, 1.55]], 0.05), 0.3],
    [(m) => stroke(m, R, [[-2.3, 0.35], [-1, 0.45], [0, 0.35], [1, 0.45], [2.3, 0.35]], 0.03), 0.25],
  ]);
}

/** The ensō, the zen circle drawn in one breath: wholeness, the moment. */
export function enso(n: number, R: Rand, cy = FORM_H * 0.5): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = R() * 0.93, a = Math.PI * 0.6 + t * Math.PI * 2;
    const w = 0.05 + Math.sin(t * Math.PI) * 0.16; // the brush swells and thins
    const r = 1.6 + (R() - 0.5) * w * 2;
    out.set([Math.cos(a) * r, cy + Math.sin(a) * r, (R() - 0.5) * 0.08], i * 3);
  }
  return out;
}

/** The unalome: the winding path of a life, straightening toward awakening. */
export function unalome(n: number, R: Rand): Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, a = t * Math.PI * 6, r = 0.7 * (1 - t);
    pts.push([Math.cos(a) * r, 0.4 + t * 1.6 + Math.sin(a) * r * 0.6]);
  }
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([Math.sin(t * Math.PI * 3) * 0.25 * (1 - t), 2.0 + t * 0.9]);
  }
  pts.push([0, 3.3]);
  return combine(n, [[(m) => stroke(m, R, pts, 0.04), 0.85], [(m) => shift(sphere(m, R, 0.1, 0, 0.3), 0, 3.6, 0), 0.08], [(m) => shift(sphere(m, R, 0.08, 0, 0.3), 0, 3.95, 0), 0.07]]);
}

/** A teardrop: grief. */
export function teardrop(n: number, R: Rand, cy = FORM_H * 0.5): Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 0.9 * (1 - Math.sin(a) * 0.0);
    pts.push([Math.sin(a) * r * Math.sin(a / 2), cy - Math.cos(a) * 1.2]);
  }
  return glyph(n, R, pts, 0.7);
}

/** A house with a lit window: home. */
export function house(n: number, R: Rand): Shape {
  const pts: [number, number][] = [[-1.4, 0.1], [-1.4, 1.7], [0, 3.0], [1.4, 1.7], [1.4, 0.1]];
  return combine(n, [[(m) => stroke(m, R, [...pts, [-1.4, 0.1]], 0.06), 0.7], [(m) => shift(sphere(m, R, 0.3, 0, 0.5), 0, 1.2, 0), 0.3]]);
}
