/* The shore lesson: L03 "The Untying" (forgiveness), told as a vision of light standing at the
   water's edge (scenes/visionLesson.ts). Its moments follow the telling: a rope held between two
   hands with a knot pulled tight; the knot close; a figure bent under what it carries, then bound
   in cords; two figures face to face (the fear that wears another's face); the wheel of the
   unforgiven action turning, and still; a figure curled on a stone (the first untying is your own
   name); hands opening; a river taking a leaf; a storm spent over the sea; many small knots; a
   figure walking on; the hands open and the rope gone slack; the space between the palms; the
   road; a figure standing open. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { combine, rock, rope, ropeBetween, river, road, shift, storm, wheel, FORM_H, type Rand } from "../world/forms";
import { bird, boundHand, cupped, eye, fist, footsteps, hand, offeredHand, spiral } from "../world/symbols";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { visionLesson } from "./visionLesson";
import { EMBER, GOLD, PALE, PEARL, ROSE, type Maker } from "./visionStage";

/** Two hands, a rope between them (slack 0: the knot pulled tight; 1: loose, the hands open). */
function handsWithRope(n: number, R: Rand, slack: number): Float32Array {
  const y = FORM_H * 0.5, gap = 1.6;
  const one = (x: number, flip: boolean) => (m: number) => {
    const h = slack > 0.5 ? hand(m, R, 1, y, 0.75) : fist(m, R);
    for (let i = 0; i < h.length; i += 3) {
      if (slack <= 0.5) h[i + 1] += y - FORM_H * 0.5; // the fist at the rope's height
      h[i] = (flip ? -h[i] : h[i]) * 0.8 + x;
    }
    return h;
  };
  return combine(n, [
    [one(-gap, false), 0.32],
    [one(gap, true), 0.32],
    [(m) => ropeBetween(m, R, new THREE.Vector3(-gap + 0.3, y, 0), new THREE.Vector3(gap - 0.3, y, 0), slack), 0.36],
  ]);
}

// the telling in symbols, one at a time (the owner: "an open hand… don't focus on the character")
const forms: Record<string, Maker> = {
  // the rope between the hands, the knot pulled tight
  rope: (n, R) => handsWithRope(n, R, 0),
  // the knot, close: the middle of the rope, larger
  knot: (n, R) => shift(rope(n, R, 1.9, 0, 0), 0, 2.3, 0, 1.6),
  // what holding it has cost: a stone carried in an open hand
  burden: (n, R) => combine(n, [[(m) => offeredHand(m, R, 0, FORM_H * 0.32), 0.6], [(m) => rock(m, R, 0.9, 0.6, 0.8, FORM_H * 0.36), 0.4]]),
  // bound in cords
  bound: (n, R) => boundHand(n, R),
  // the fear that wears someone else's face: an eye and its reflection
  mirror: (n, R) => combine(n, [
    [(m) => eye(m, R, 1, FORM_H * 0.72), 0.42],
    [(m) => shift(eye(m, R, 1, 0), 0, FORM_H * 0.28, 0), 0.42],
    [(m) => combine(m, [[(k) => rope(k, R, 1.6, FORM_H * 0.5, 0), 1]]), 0.16],
  ]),
  // the wheel of the unforgiven action (turning or still: the key says)
  wheel: (n, R) => wheel(n, R),
  // the knot tied closest to the skin: winding inward
  curled: (n, R) => spiral(n, R, 3.2),
  // hands opening, a small light on the palm
  open: (n, R) => offeredHand(n, R, 0.28),
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
  walk: (n, R) => combine(n, [[(m) => footsteps(m, R), 0.75], [(m) => shift(rope(m, R, 0.9, 0, 0.9), -1.2, 0.15, 1.6), 0.25]]),
  // the hands open, the rope slack between them
  slack: (n, R) => handsWithRope(n, R, 1),
  // the space between the palms
  space: (n, R) => cupped(n, R, 0.04),
  road: (n, R) => road(n, R),
  // free: a bird
  free: (n, R) => bird(n, R, FORM_H * 0.6, 0.3),
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
