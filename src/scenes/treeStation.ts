/* The tree station: "The Catalyst of the Body" (TREE), told as a vision of light in a forest
   clearing (scenes/visionLesson.ts). Its moments follow the telling: a tree growing tall and green;
   the dry season, leaves gone, a branch broken on the ground; the body speaking in flesh (a figure,
   a hand to the chest); the notch where the branch broke, an opening; from inside the trunk, through
   the notches, the spirit of the tree coming out; the mind measuring (a ledger); the spirit
   watering, asking nothing; new growth rising in a new shape, the broken branches still there; the
   tree bare in the dark, and the light returning; the spirit stepping back to paint the tree,
   wounds and all; a hand laid on the chest; the tree, and the spirit still painting. */
import type * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { book, combine, offering, rain, shift, sphere, sprout, sun, tree, turnY, FORM_H, type Rand } from "../world/forms";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { visionLesson } from "./visionLesson";
import { EMBER, GOLD, PALE, PEARL, ROSE, type Maker } from "./visionStage";

const SEED = 0.52;
/** The crown in leaf: a soft cloud about the upper limbs. */
function crown(m: number, R: Rand): Float32Array {
  const out = new Float32Array(m * 3);
  for (let i = 0; i < m; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 1.9, y = FORM_H * 0.72 + (R() - 0.4) * 1.3 * (1 - r / 2.4);
    out.set([Math.cos(a) * r, y, Math.sin(a) * r * 0.85], i * 3);
  }
  return out;
}
/** Leaves and a broken branch lying on the ground. */
function fallen(m: number, R: Rand): Float32Array {
  const out = new Float32Array(m * 3);
  for (let i = 0; i < m; i++) {
    const branch = R() < 0.4, u = R();
    if (branch) out.set([0.9 + u * 1.3, 0.08 + u * 0.12, 0.7 - u * 0.5 + (R() - 0.5) * 0.06], i * 3);
    else out.set([(R() - 0.5) * 4.5, 0.03, (R() - 0.5) * 3], i * 3);
  }
  return out;
}

const forms: Record<string, Maker> = {
  green: (n, R) => combine(n, [[(m) => tree(m, R, SEED), 0.55], [(m) => crown(m, R), 0.45]]),
  dry: (n, R) => combine(n, [[(m) => tree(m, R, SEED), 0.82], [(m) => fallen(m, R), 0.18]]),
  // it speaks in flesh what we have not said aloud
  body: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Idle_Loop", 1.4, [["DEF-spine.001", 0.2], ["DEF-neck", 0.3]], FORM_H * 0.8), 0.78], [(m) => sphere(m, R, 0.3, FORM_H * 0.52, 0.2), 0.22]]),
  // through the notches the spirit of the tree comes out
  spirit: (n, R) => combine(n, [[(m) => tree(m, R, SEED), 0.72], [(m) => sphere(m, R, 0.45, FORM_H * 0.45, 0.35), 0.1], [(m) => shift(sphere(m, R, 0.35, 0, 0.3), 0.9, FORM_H * 0.6, 0.6), 0.18]]),
  // the mind turns it into a project of measurements
  ledger: (n, R) => shift(book(n, R), 0, 0.9, 0, 1.2),
  // the spirit waters, asking nothing, keeping no score
  water: (n, R, b) => b && combine(n, [
    [(m) => shift(tree(m, R, SEED, FORM_H * 0.9), 0.9, 0, -0.4), 0.52],
    [(m) => shift(turnY(offering(m, R, b, 0), Math.PI / 2.4), -1.4, 0, 0.3, 0.8), 0.33],
    [(m) => shift(rain(m, R), -0.2, -1.2, 0.2, 0.35), 0.15],
  ]),
  // new growth rises in a new shape; the broken branches stay
  growth: (n, R) => combine(n, [[(m) => tree(m, R, SEED), 0.58], [(m) => shift(sprout(m, R, 1.3), 1.4, 0, 0.8), 0.14], [(m) => shift(sprout(m, R, 1.0), -1.2, 0, 1.0), 0.12], [(m) => crown(m, R), 0.16]]),
  // bare in the dark; every morning the light returns
  morning: (n, R) => combine(n, [[(m) => tree(m, R, SEED), 0.7], [(m) => shift(sun(m, R, 0), 2.2, FORM_H * 0.95, -1.5, 0.45), 0.3]]),
  // the spirit steps back and paints the tree, broken branches and all
  paint: (n, R, b) => b && combine(n, [
    [(m) => shift(tree(m, R, SEED, FORM_H * 0.9), 1.0, 0, -0.6), 0.55],
    [(m) => shift(turnY(b.figure(m, R, "Spell_Simple_Idle_Loop", 0.6, [], FORM_H * 0.62), Math.PI / 2.2), -1.6, 0, 0.6), 0.45],
  ]),
  // a hand laid on the chest
  chest: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Idle_Loop", 2.2, [], FORM_H * 0.8), 0.76], [(m) => sphere(m, R, 0.4, FORM_H * 0.53, 0.35), 0.24]]),
};

export function createTreeStationScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return visionLesson(scene, narration, whisper, {
    id: "tree-station",
    trackId: "TREE",
    site: SITES["tree-station"],
    seedNum: 808,
    forms,
    keys: [
      { t: 1, form: "green", tint: GOLD, dur: 6 }, // picture a tree, tall and green
      { t: 11, form: "dry", tint: EMBER }, // then the dry season comes
      { t: 40, form: "body", tint: ROSE }, // the body shapes itself around what the mind hasn't finished saying
      { t: 62, form: "dry", tint: PALE }, // when a branch breaks, it leaves a notch
      { t: 90, form: "spirit", tint: PEARL }, // from inside the trunk, the spirit of the tree
      { t: 114, form: "ledger", tint: PALE }, // the mind tries to manage it
      { t: 124, form: "water", tint: PALE }, // the spirit simply begins to water
      { t: 177, form: "growth", tint: GOLD }, // what was broken becomes seed; new branches grow
      { t: 203, form: "morning", tint: GOLD }, // bare in the dark; every morning the light returns
      { t: 211, form: "paint", tint: ROSE }, // it steps back, and begins to paint
      { t: 252, form: "chest", tint: GOLD }, // lay your hand on your chest
      { t: 260, form: "green", tint: PEARL }, // the spirit is still painting
    ],
  });
}
