/* Reading a stroke drawn on the sanctuary's earth (world/sanctuary.ts): the $1 recogniser's first
   step (resample evenly along its length), then judged by its shape, so a wobbly circle drawn by a
   tired thumb at midnight is still a circle. Pure: no scene, testable on its own. */
export type V2 = [number, number];
/** Loops drawn at least this wide (metres) become ring walls; smaller ones pillars. Two strides:
    a ring you could stand in, a pillar you could put your arms around. */
export const RING_D = 2.4;

/** $1's first step: the stroke resampled to n points evenly along its length. */
function resample(pts: V2[], n: number): V2[] {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (L < 1e-6) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]] as V2);
  const step = L / (n - 1);
  const out: V2[] = [[pts[0][0], pts[0][1]]];
  let acc = 0;
  let prev: V2 = [pts[0][0], pts[0][1]];
  for (let i = 1; i < pts.length && out.length < n; i++) {
    const cur: V2 = [pts[i][0], pts[i][1]];
    let d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const q: V2 = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t];
      out.push(q);
      prev = q;
      d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      acc = 0;
    }
    acc += d;
    prev = cur;
  }
  while (out.length < n) out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

export type Reading =
  | { kind: "dot" }
  | { kind: "wall"; path: V2[]; closed: boolean; length: number }
  | { kind: "ring" | "pillar" | "spire"; c: V2; r: number }
  | null;

/** What a stroke on the earth is (points in metres on the ground; `screen` its length in px). */
export function readStroke(raw: V2[], screen: number): Reading {
  if (screen < 16 || raw.length < 3) return { kind: "dot" };
  const p = resample(raw, 64);
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  if (L < 0.35) return { kind: "dot" };
  if (L > 60) return null;
  const D = Math.hypot(p[63][0] - p[0][0], p[63][1] - p[0][1]);
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, cx = 0, cz = 0;
  for (const [x, z] of p) {
    minx = Math.min(minx, x);
    maxx = Math.max(maxx, x);
    minz = Math.min(minz, z);
    maxz = Math.max(maxz, z);
    cx += x / p.length;
    cz += z / p.length;
  }
  const diag = Math.hypot(maxx - minx, maxz - minz);
  // how far it turns, summed (a circle ≈ 1 turn, a spiral more)
  // the turning is read from the stroke smoothed a little (a finger's tremor is not a corner)
  const sm: V2[] = p.map((_, i) => {
    let x = 0, z = 0, n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(p.length - 1, i + 2); k++) (x += p[k][0]), (z += p[k][1]), n++;
    return [x / n, z / n];
  });
  let turn = 0;
  const steps: number[] = [];
  for (let i = 2; i < sm.length; i++) {
    const a1 = Math.atan2(sm[i - 1][1] - sm[i - 2][1], sm[i - 1][0] - sm[i - 2][0]);
    const a2 = Math.atan2(sm[i][1] - sm[i - 1][1], sm[i][0] - sm[i - 1][0]);
    const d = a2 - a1;
    const st = Math.atan2(Math.sin(d), Math.cos(d));
    steps.push(st);
    turn += st;
  }
  // corners: how much of all the turning happens within one short stretch (a circle spreads it
  // evenly, ~10%; a square turns a quarter of it at each corner)
  let peak = 0;
  for (let i = 0; i + 6 <= steps.length; i++) {
    let w = 0;
    for (let k = i; k < i + 6; k++) w += steps[k];
    peak = Math.max(peak, Math.abs(w));
  }
  const corner = peak / Math.max(Math.abs(turn), 1e-3);
  const turns = Math.abs(turn) / (Math.PI * 2);
  const rad = p.map(([x, z]) => Math.hypot(x - cx, z - cz));
  const mean = rad.reduce((a, b) => a + b, 0) / rad.length;
  const sd = Math.sqrt(rad.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rad.length);
  const round = sd / Math.max(mean, 1e-3);
  if (turns >= 1.25) {
    // a spiral: more than a turn and a quarter, its radius at one end well short of the other
    const q = Math.floor(p.length / 4);
    const head = rad.slice(0, q).reduce((a, b) => a + b, 0) / q;
    const tail = rad.slice(-q).reduce((a, b) => a + b, 0) / q;
    if (Math.max(head, tail) > Math.min(head, tail) * 1.6) return { kind: "spire", c: [cx, cz], r: Math.max(head, tail) };
    // a loop gone round again (a tired thumb closing its circle twice) is still a circle
    if (turns < 2.2 && round < 0.3) return { kind: mean * 2 >= RING_D ? "ring" : "pillar", c: [cx, cz], r: mean };
    return null; // a scribble: not understood
  }
  const closed = D < Math.max(0.5, diag * 0.3);
  if (closed && turns > 0.6) {
    if (round < 0.3 && corner < 0.2) return { kind: mean * 2 >= RING_D ? "ring" : "pillar", c: [cx, cz], r: mean };
    // closed but not round (a square, a leaf): a wall all the way round it
    return { kind: "wall", path: p, closed: true, length: L };
  }
  // an open stroke, straight or bending: a wall along it
  if (turns < 1.1) return { kind: "wall", path: p, closed: false, length: L };
  return null;
}
