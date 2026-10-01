/* What the three standalone visions share (atoms and light, other worlds, psychic greetings): one
   great body of light at the heart of each stage, the vision of creation's own format
   (scenes/visionStage.ts) drawn at the scale of the enacted lessons, and the forms these tellings
   need that the others did not (an atom, a world-tree of heavens, a veil, a shell with chinks…).
   Each form is made in the forms' own frame (FORM_H tall, its front toward +z, the seat). */
import * as THREE from "three/webgpu";
import { combine, cord, FORM_H, galaxy, rock, shift, sphere, tree, turnY, type BodyForms, type Rand, type Shape } from "../../world/forms";
import { hand } from "../../world/symbols";
import { VisionStage, type Key, type Maker } from "../visionStage";

const V = THREE.Vector3;
const TAU = Math.PI * 2;

/** The great body of light: a vision stage `scale` times the lessons' size, its foot at `y` in the
    stage's frame, a little back from the stage's foot (`z`). */
export function greatVision(forms: Record<string, Maker>, keys: Key[], seedNum: number, scale: number, y: number, z = 0): VisionStage {
  const vs = new VisionStage({ at: new THREE.Vector3(0, y, z), face: 0, forms, keys, seedNum, pointSize: 0.022 * scale });
  vs.group.scale.setScalar(scale);
  return vs;
}

/** A ring of points (a circle of radius r in the plane turned by `tilt` about x, then `turn` about y). */
function ring(n: number, R: Rand, r: number, tilt: number, turn: number, cy: number, thick = 0.03): Float32Array {
  const out = new Float32Array(n * 3), p = new V();
  for (let i = 0; i < n; i++) {
    const a = R() * TAU;
    p.set(Math.cos(a) * r + (R() - 0.5) * thick, (R() - 0.5) * thick, Math.sin(a) * r + (R() - 0.5) * thick);
    p.applyAxisAngle(new V(1, 0, 0), tilt).applyAxisAngle(new V(0, 1, 0), turn);
    out.set([p.x, p.y + cy, p.z], i * 3);
  }
  return out;
}

/** An atom as the teaching tells it: not billiard balls but a small structure of light holding a
    pattern. A dense bright nucleus, three tilted orbits, and the soft cloud of where it may be. */
export function atom(n: number, R: Rand, r = 1.7, cy = FORM_H / 2): Shape {
  return combine(n, [
    [(m) => sphere(m, R, 0.28 * (r / 1.7), cy, 0.2), 0.2],
    [(m) => ring(m, R, r, 1.15, 0, cy), 0.17],
    [(m) => ring(m, R, r, 1.15, TAU / 3, cy), 0.17],
    [(m) => ring(m, R, r, 1.15, (2 * TAU) / 3, cy), 0.17],
    [(m) => sphere(m, R, r * 1.15, cy, 0), 0.29],
  ]);
}

/** An atom split: its two halves drawn apart, a flash of points between. */
export function split(n: number, R: Rand): Shape {
  return combine(n, [
    [(m) => shift(atom(m, R, 1.1, 0), -1.5, FORM_H / 2, 0), 0.42],
    [(m) => shift(atom(m, R, 1.1, 0), 1.5, FORM_H / 2, 0), 0.42],
    [(m) => sphere(m, R, 0.5, FORM_H / 2, 0), 0.16],
  ]);
}

/** Each portion a hologram of the whole: a galaxy whose arms are made of small atoms. */
export function hologram(n: number, R: Rand): Shape {
  const atoms = 13;
  return combine(n, [
    [(m) => galaxy(m, R, 2.3), 0.45],
    ...Array.from({ length: atoms }, (_, k): [(m: number) => Float32Array, number] => {
      const u = 0.25 + (k / atoms) * 0.75, a = (k % 2 ? Math.PI : 0) + u * 7;
      const x = Math.cos(a) * u * 2.3, z = Math.sin(a) * u * 2.3;
      return [(m) => shift(atom(m, R, 0.22, 0), x, FORM_H / 2 + z * 0.35, z * 0.94), 0.55 / atoms];
    }),
  ]);
}

/** A stone resting in an open palm (held up toward you). */
export function stoneInHand(n: number, R: Rand, glow = 0): Shape {
  return combine(n, [
    [(m) => hand(m, R, 0.75, FORM_H * 0.36, 1.45, false), 0.6],
    [(m) => shift(rock(m, R, 0.62, 0.42, 0.5, 0), 0.1, FORM_H * 0.3, 0.55), 0.3 - glow * 0.1],
    [(m) => sphere(m, R, 0.8 + glow * 0.6, FORM_H * 0.36, 0), 0.1 + glow * 0.1],
  ]);
}

/** The nearest stone and the farthest star, and the line of light that joins them. */
export function stoneAndStar(n: number, R: Rand): Shape {
  return combine(n, [
    [(m) => rock(m, R, 0.7, 0.45, 0.6, 0.2), 0.35],
    [(m) => cord([new V(0, 0.8, 0), new V(0.15, 2.2, 0), new V(-0.1, 3.4, 0), new V(0, 4.5, 0)], m, R, 0.025), 0.3],
    [(m) => sphere(m, R, 0.22, 4.7, 0.1), 0.2],
    [(m) => ring(m, R, 0.55, Math.PI / 2, 0, 4.7, 0.02), 0.15],
  ]);
}

/** A figure with light going out from it in every direction. */
export function radiant(n: number, R: Rand, b: BodyForms, clip = "Spell_Simple_Idle_Loop", at = 1.6, rays = 0.32): Shape {
  const fig = b.figure(Math.round(n * (1 - rays)), R, clip, at, [], FORM_H * 0.78);
  const out = new Float32Array(n * 3);
  out.set(fig);
  const c = new V(0, FORM_H * 0.5, 0), d = new V();
  for (let i = fig.length / 3; i < n; i++) {
    // rays: points strung outward along a few dozen directions
    // one of 40 directions spread evenly over the sphere (a golden spiral)
    const k = Math.floor(R() * 40), yk = 1 - (2 * (k + 0.5)) / 40, rk = Math.sqrt(1 - yk * yk), ak = k * 2.39996;
    d.set(Math.cos(ak) * rk, yk, Math.sin(ak) * rk);
    const len = 0.9 + Math.pow(R(), 0.7) * 1.9;
    out.set([c.x + d.x * len, c.y + d.y * len * 1.1, c.z + d.z * len], i * 3);
  }
  return out;
}

/** A forest seen from its edge: seven trees of light, the nearer ones larger. */
export function forest(n: number, R: Rand): Shape {
  const at: [number, number, number][] = [[0, -0.6, 1], [-1.7, -1.2, 0.8], [1.8, -1.0, 0.85], [-0.9, -2.4, 0.65], [1.0, -2.6, 0.62], [-2.6, -2.8, 0.55], [2.7, -3.0, 0.55]];
  return combine(n, at.map(([x, z, k], i): [(m: number) => Float32Array, number] => [(m) => shift(tree(m, R, 0.3 + i * 0.13, FORM_H * k, i % 3), x, 0, z), k / 5.02]));
}

/** Distant suns, each with its own earth going round it. */
export function systems(n: number, R: Rand): Shape {
  const suns: [number, number, number, number][] = [[0, 3.1, 0, 0.42], [-1.9, 2.0, -0.6, 0.3], [1.9, 2.4, -0.4, 0.34], [-1.0, 4.1, -1.0, 0.24], [1.2, 1.0, -0.2, 0.26]];
  const parts: [(m: number) => Float32Array, number][] = [];
  for (const [x, y, z, s] of suns) {
    parts.push([(m) => sphere(m, R, s * 0.6, y, 0.3).map((v, j) => (j % 3 === 0 ? v + x : j % 3 === 2 ? v + z : v)) as Float32Array, 0.09]);
    parts.push([(m) => shift(ring(m, R, s * 2.4, 1.2, x, 0, 0.015), x, y, z), 0.06]);
    parts.push([(m) => shift(sphere(m, R, s * 0.2, 0, 0), x + s * 2.4, y, z), 0.05]);
  }
  return combine(n, parts);
}

/** The Maya's world: thirteen heavens above the earth and nine underworlds below, one great tree
    rising through them all. */
export function worldTree(n: number, R: Rand): Shape {
  const earth = 1.25, parts: [(m: number) => Float32Array, number][] = [];
  parts.push([(m) => cord([new V(0, 0.05, 0), new V(0.08, 1.4, 0), new V(-0.06, 3.0, 0), new V(0, 4.75, 0)], m, R, 0.09), 0.16]);
  // the branches that hold the heavens, and the roots that reach the underworlds
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    parts.push([(m) => cord([new V(0, 3.6, 0), new V(Math.cos(a) * 0.7, 4.2, Math.sin(a) * 0.7), new V(Math.cos(a) * 1.3, 4.5, Math.sin(a) * 1.3)], m, R, 0.035), 0.016]);
    parts.push([(m) => cord([new V(0, 0.7, 0), new V(Math.cos(a) * 0.6, 0.35, Math.sin(a) * 0.6), new V(Math.cos(a) * 1.1, 0.05, Math.sin(a) * 1.1)], m, R, 0.03), 0.014]);
  }
  parts.push([(m) => ring(m, R, 1.9, 0.08, 0, earth, 0.05), 0.08]);
  for (let k = 0; k < 13; k++) {
    const y = earth + 0.3 + k * 0.26, r = 1.7 - Math.abs(k - 6) * 0.07;
    parts.push([(m) => ring(m, R, r, 0.08, k, y, 0.02), 0.028]);
  }
  for (let k = 0; k < 9; k++) {
    const y = earth - 0.14 - k * 0.12, r = 1.4 - k * 0.1;
    parts.push([(m) => ring(m, R, r, 0.08, k, y, 0.02), 0.022]);
  }
  return combine(n, parts);
}

/** A veil hung before a figure: a sheet in soft folds, the figure dim behind it. */
export function veil(n: number, R: Rand, b: BodyForms | null): Shape {
  const sheet = (m: number) => {
    const out = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) {
      const u = R(), v = R();
      const x = (u - 0.5) * 3.6, y = 0.2 + v * 4.2;
      out.set([x, y, 0.9 + Math.sin(x * 3.2 + y * 0.4) * 0.16 + Math.sin(y * 1.3) * 0.08], i * 3);
    }
    return out;
  };
  if (!b) return sheet(n);
  return combine(n, [[(m) => b.figure(m, R, "Idle_Loop", 0.6, [], FORM_H * 0.72), 0.32], [sheet, 0.68]]);
}

/** A figure inside a shell of light with a few gaps (the chinks), or whole (`whole` 1). */
export function shell(n: number, R: Rand, b: BodyForms, whole = 0): Shape {
  const fig = b.figure(Math.round(n * 0.4), R, "Idle_Loop", 1.2, [], FORM_H * 0.72);
  const out = new Float32Array(n * 3);
  out.set(fig);
  const gaps = [new V(0.6, 0.3, 0.75), new V(-0.8, -0.2, 0.55), new V(0.1, 0.8, -0.6), new V(-0.3, -0.7, 0.6)].map((v) => v.normalize());
  const d = new V();
  for (let i = fig.length / 3; i < n; i++) {
    for (let tries = 0; tries < 12; tries++) {
      d.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
      if (whole || !gaps.some((g) => g.dot(d) > 0.9)) break;
    }
    out.set([d.x * 1.75, FORM_H * 0.4 + d.y * 2.05, d.z * 1.75], i * 3);
  }
  return out;
}

/** A figure and its reflection face to face (the dog barking at its own reflection). */
export function mirror(n: number, R: Rand, b: BodyForms): Shape {
  return combine(n, [
    [(m) => shift(turnY(b.figure(m, R, "Spell_Simple_Idle_Loop", 0.8, [], FORM_H * 0.72), Math.PI / 2), -1.2, 0, 0), 0.5],
    [(m) => shift(turnY(b.figure(m, R, "Spell_Simple_Idle_Loop", 0.8, [], FORM_H * 0.72), -Math.PI / 2), 1.2, 0, 0), 0.5],
  ]);
}

/** Two figures, the one welcoming the other back: arms open, close. */
export function welcome(n: number, R: Rand, b: BodyForms): Shape {
  return combine(n, [
    [(m) => shift(turnY(b.figure(m, R, "Spell_Simple_Idle_Loop", 1.8, [], FORM_H * 0.76), Math.PI / 2.4), -0.55, 0, 0), 0.55],
    [(m) => shift(turnY(b.figure(m, R, "Idle_Loop", 1.4, [], FORM_H * 0.6), -Math.PI / 2.4), 0.6, 0, 0.1), 0.45],
  ]);
}

/** A few figures standing in a loose row: the people you have met. */
export function crowd(n: number, R: Rand, b: BodyForms): Shape {
  const at: [number, number, number][] = [[0, 0.3, 0], [-1.3, -0.2, 0.6], [1.3, -0.1, -0.5], [-2.4, -0.8, 1.2], [2.4, -0.7, -1.0]];
  return combine(n, at.map(([x, z, a], i): [(m: number) => Float32Array, number] => [(m) => shift(turnY(b.figure(m, R, i % 2 ? "Spell_Simple_Idle_Loop" : "Idle_Loop", 0.4 + i * 0.7, [], FORM_H * 0.62), a * 0.25), x, 0, z), 0.2]));
}

/** The earth, and lights round it at a respectful distance, never touching it. */
export function watched(n: number, R: Rand): Shape {
  const parts: [(m: number) => Float32Array, number][] = [[(m) => sphere(m, R, 1.05, FORM_H / 2, 0.85), 0.55]];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU, e = Math.sin(k * 1.7) * 0.6;
    parts.push([(m) => sphere(m, R, 0.09, 0, 0).map((v, j) => v + [Math.cos(a) * 2.2, FORM_H / 2 + e, Math.sin(a) * 2.2][j % 3]) as Float32Array, 0.05]);
  }
  return combine(n, parts);
}

/** A string of beads in a ring round an eye. */
export function beads(n: number, R: Rand, cy = FORM_H * 0.55): Shape {
  const parts: [(m: number) => Float32Array, number][] = [];
  const count = 15;
  for (let k = 0; k < count; k++) {
    const a = (k / count) * TAU;
    parts.push([(m) => shift(sphere(m, R, 0.17, 0, 0.7), Math.cos(a) * 2.0, cy + Math.sin(a) * 2.0, 0), 1 / count]);
  }
  return combine(n, parts);
}

export { ring };
