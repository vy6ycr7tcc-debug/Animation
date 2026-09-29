/* The shore lesson: L03 "The Untying" (forgiveness), told as a vision of light standing at the
   water's edge (scenes/visionLesson.ts). Its moments follow the telling: a rope held between two
   hands with a knot pulled tight; the knot close; a figure bent under what it carries, then bound
   in cords; two figures face to face (the fear that wears another's face); the wheel of the
   unforgiven action turning, and still; a figure curled on a stone (the first untying is your own
   name); hands opening; a river taking a leaf; a storm spent over the sea; many small knots; a
   figure walking on; the hands open and the rope gone slack; the space between the palms; the
   road; a figure standing open. */
import type * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { combine, helix, offering, rock, rope, ropeBetween, river, road, shift, storm, turnY, wheel, FORM_H, type BodyForms, type Rand } from "../world/forms";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { visionLesson } from "./visionLesson";
import { EMBER, GOLD, PALE, PEARL, ROSE, type Maker } from "./visionStage";

const OFFER = "Spell_Simple_Idle_Loop";
// bent under a weight: the spine and neck bowed
const BOWED: [string, number][] = [["DEF-spine.001", 0.28], ["DEF-spine.003", 0.22], ["DEF-neck", 0.35]];

/** A figure holding out its arms, and a rope between its hands (slack 0: the knot pulled tight). */
function holdingRope(n: number, R: Rand, b: BodyForms, slack: number, at = 0.8): Float32Array {
  const f = b.holding(Math.round(n * 0.62), R, OFFER, at, [], FORM_H * 0.8);
  const out = new Float32Array(n * 3);
  out.set(f.shape);
  out.set(ropeBetween(n - f.shape.length / 3, R, f.hl, f.hr, slack), f.shape.length);
  return out;
}

const forms: Record<string, Maker> = {
  // the rope between the hands, the knot pulled tight
  rope: (n, R, b) => b && holdingRope(n, R, b, 0),
  // the knot, close: the middle of the rope, larger
  knot: (n, R) => shift(rope(n, R, 1.9, 0, 0), 0, 2.3, 0, 1.6),
  // bent under what it carries, the rope coiled at its feet
  burden: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Idle_Loop", 0.6, BOWED, FORM_H * 0.72), 0.78], [(m) => shift(rope(m, R, 0.9, 0, 0.6), 0, 0.3, 0.6), 0.22]]),
  // bound in cords
  bound: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Idle_Loop", 1.2, BOWED, FORM_H * 0.72), 0.72], [(m) => helix(m, R, 0.55, 0.4, 3.0, 5, 3), 0.28]]),
  // two facing each other: the fear that wears someone else's face
  mirror: (n, R, b) => b && combine(n, [
    [(m) => shift(turnY(b.figure(m, R, "Idle_Loop", 0.4, [], FORM_H * 0.62), Math.PI / 2), -1.1, 0, 0), 0.5],
    [(m) => shift(turnY(b.figure(m, R, "Idle_Loop", 1.4, [], FORM_H * 0.62), -Math.PI / 2), 1.1, 0, 0), 0.5],
  ]),
  // the wheel of the unforgiven action (turning or still: the key says)
  wheel: (n, R) => wheel(n, R),
  // curled on a stone: the knot tied closest to the skin
  curled: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Sitting_Idle_Loop", 0.5, BOWED, FORM_H * 0.5), 0.8], [(m) => rock(m, R, 0.75, 0.42, 0.6), 0.2]]),
  // hands opening, a small light between them
  open: (n, R, b) => b && offering(n, R, b, 0.28),
  // a river takes the leaf
  river: (n, R) => river(n, R),
  storm: (n, R) => storm(n, R, 0),
  spent: (n, R) => storm(n, R, 1),
  // the small knots of an ordinary day
  small: (n, R) => combine(n, Array.from({ length: 7 }, (_, k) => [(m: number) => {
    const a = (k / 7) * Math.PI * 2;
    return shift(rope(m, R, 0.5, 0, 0), Math.cos(a) * 1.8, 1.4 + Math.sin(k * 2.3) * 0.9 + (k % 2) * 0.6, Math.sin(a) * 0.9, 0.9);
  }, 1 / 7] as [(m: number) => Float32Array, number])),
  // setting down the rope and walking on
  walk: (n, R, b) => b && combine(n, [[(m) => shift(turnY(b.figure(m, R, "Walk_Loop", 0.3, [], FORM_H * 0.62), Math.PI), 0.9, 0, -0.8), 0.8], [(m) => shift(rope(m, R, 0.9, 0, 0.9), -1.2, 0.15, 0.9), 0.2]]),
  // the hands open, the rope slack between them
  slack: (n, R, b) => b && holdingRope(n, R, b, 1, 1.6),
  // the space between the palms
  space: (n, R, b) => b && offering(n, R, b, 0.7),
  road: (n, R) => road(n, R),
  // standing, open
  free: (n, R, b) => b && b.figure(n, R, OFFER, 1.0, [], FORM_H * 0.78),
};

export function createShoreScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return visionLesson(scene, narration, whisper, {
    id: "shore",
    trackId: "L03",
    site: SITES.shore,
    seedNum: 303,
    forms,
    keys: [
      { t: 1, form: "rope", tint: GOLD, dur: 6 }, // take a piece of rope in your hands
      { t: 42, form: "knot", tint: EMBER }, // what the knot is made of
      { t: 83, form: "burden", tint: GOLD }, // the knot is in your hands now; what holding it has cost
      { t: 110, form: "bound", tint: EMBER }, // resentment: a room you never leave
      { t: 144, form: "knot", tint: PALE }, // look closer at the knot itself
      { t: 164, form: "mirror", tint: PALE }, // a fear, now wearing someone else's face
      { t: 223, form: "rope", tint: GOLD }, // the only hands in this scene are yours
      { t: 241, form: "wheel", tint: EMBER, spin: 0.6, axis: "z" }, // it keeps turning
      { t: 286, form: "wheel", tint: PALE, dur: 3 }, // the wheel stops the moment you stop pushing it
      { t: 291, form: "curled", tint: ROSE }, // who have you refused to forgive most fiercely
      { t: 344, form: "open", tint: GOLD }, // release belongs to the hands
      { t: 386, form: "river", tint: PALE }, // the way a river lets a leaf go
      { t: 441, form: "storm", tint: PALE, dur: 3 }, // a storm spent over the sea
      { t: 447, form: "spent", tint: PALE, dur: 7 },
      { t: 455, form: "small", tint: GOLD, spin: 0.08 }, // begin small
      { t: 527, form: "walk", tint: PALE }, // set down the rope and still walk away
      { t: 560, form: "slack", tint: GOLD }, // open your hands; feel the rope go slack
      { t: 576, form: "space", tint: PEARL }, // the space between your palms
      { t: 624, form: "road", tint: PALE }, // set those down, gently, beside the road
      { t: 631, form: "free", tint: PEARL }, // what would be possible
    ],
  });
}
