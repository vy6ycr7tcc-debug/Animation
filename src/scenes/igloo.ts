/* The igloo lesson: L04 "Without Price" (love given freely), told as a vision of light in the
   cold high country (scenes/visionLesson.ts). Its moments follow the telling: rain on a road and
   someone standing by it; a figure offering a seat; a heart; the ledger that opens at night; soup
   brought to a neighbour, steam rising; the sun that pours itself over the world; a gift waved
   away; a river flowing past a stone; the open hand; a tree whose shade falls on strangers; the
   figure that flinches at being given to; the ledger again (a gift made a loan); the well, and the
   fountain fed from a spring that never stops; the ones you would sit up all night for, round a
   flame; the road of small places; a candle set down in the middle of the room, left to shine. */
import type * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { book, bowl, candle, combine, flame, fountain, heart, offering, rain, river, road, rock, shift, sun, tree, turnY, well, FORM_H } from "../world/forms";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { visionLesson } from "./visionLesson";
import { EMBER, GOLD, PALE, PEARL, ROSE, type Maker } from "./visionStage";

const BOWED: [string, number][] = [["DEF-spine.001", 0.28], ["DEF-spine.003", 0.22], ["DEF-neck", 0.35]];

const forms: Record<string, Maker> = {
  // rain on the road, someone standing at its side
  rain: (n, R, b) => b && combine(n, [[(m) => rain(m, R), 0.45], [(m) => shift(road(m, R), 0, 0, 0, 0.5), 0.2], [(m) => shift(b.figure(m, R, "Idle_Loop", 0.9, BOWED, FORM_H * 0.62), 1.1, 0, 0.3), 0.35]]),
  // offering a seat, a hand held out
  offer: (n, R, b) => b && offering(n, R, b, 0.0, "Interact", 0.9),
  heart: (n, R) => heart(n, R, 1.1),
  // the ledger, open at night
  ledger: (n, R) => shift(book(n, R), 0, 0.9, 0, 1.2),
  // soup brought to a neighbour
  soup: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Spell_Simple_Idle_Loop", 1.4, [], FORM_H * 0.8), 0.72], [(m) => shift(bowl(m, R, 0), 0, 2.05, 0.75, 0.55), 0.28]]),
  sun: (n, R) => sun(n, R),
  // help offered and waved away: one turns toward, one away
  refused: (n, R, b) => b && combine(n, [
    [(m) => shift(turnY(offering(m, R, b, 0.18), Math.PI / 2), -1.1, 0, 0), 0.52],
    [(m) => shift(turnY(b.figure(m, R, "Idle_Loop", 2.0, [], FORM_H * 0.72), Math.PI * 0.85), 1.2, 0, -0.3), 0.48],
  ]),
  // a river does not stop flowing because one stone refuses to get wet
  river: (n, R) => combine(n, [[(m) => river(m, R), 0.82], [(m) => shift(rock(m, R, 0.5, 0.35, 0.45), 0.4, 1.5, -0.1), 0.18]]),
  // the open hand
  open: (n, R, b) => b && offering(n, R, b, 0.35),
  // the tree whose shade falls on strangers
  tree: (n, R) => tree(n, R, 0.44),
  // something in you flinches
  flinch: (n, R, b) => b && b.figure(n, R, "Idle_Loop", 0.3, [["DEF-spine.001", 0.4], ["DEF-spine.003", 0.3], ["DEF-neck", 0.45], ["DEF-upper_arm.L", 0.6], ["DEF-upper_arm.R", 0.6]], FORM_H * 0.66),
  well: (n, R) => well(n, R),
  fountain: (n, R) => fountain(n, R),
  // the ones you would sit up all night for, round a flame
  circle: (n, R, b) => b && combine(n, [
    ...Array.from({ length: 4 }, (_, k): [(m: number) => Float32Array, number] => [(m) => {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      return shift(turnY(b.figure(m, R, "Sitting_Idle_Loop", 0.4 + k, BOWED, FORM_H * 0.42), -a - Math.PI / 2), Math.cos(a) * 1.6, 0, Math.sin(a) * 1.3);
    }, 0.2]),
    [(m) => flame(m, R, 0.1, 1.0), 0.2],
  ]),
  road: (n, R) => road(n, R),
  candle: (n, R) => candle(n, R),
};

export function createIglooScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return visionLesson(scene, narration, whisper, {
    id: "igloo",
    trackId: "L04",
    site: SITES.igloo,
    seedNum: 404,
    forms,
    keys: [
      { t: 1, form: "rain", tint: PALE, dur: 6 }, // a cold evening, rain, someone at the side of the road
      { t: 12, form: "offer", tint: GOLD }, // you offer them a seat
      { t: 40, form: "heart", tint: ROSE }, // a country where love is given without a price tag
      { t: 50, form: "ledger", tint: PALE }, // every kindness gets written down in it
      { t: 86, form: "soup", tint: GOLD }, // you bring soup to a sick neighbour
      { t: 113, form: "sun", tint: GOLD, spin: 0.05, axis: "z" }, // the sun pours itself over the world
      { t: 151, form: "refused", tint: PALE }, // help offered, and waved away
      { t: 178, form: "river", tint: PALE }, // a river does not stop flowing
      { t: 191, form: "open", tint: GOLD }, // look at your own hand
      { t: 244, form: "tree", tint: GOLD, spin: 0.04 }, // there is another way: the tree
      { t: 290, form: "flinch", tint: ROSE }, // something in you may flinch
      { t: 316, form: "ledger", tint: EMBER }, // a gift becomes a loan
      { t: 345, form: "well", tint: PALE }, // a well
      { t: 355, form: "fountain", tint: PEARL }, // and a fountain, fed from a spring that never stops
      { t: 385, form: "circle", tint: GOLD }, // the ones you would sit up all night for
      { t: 421, form: "road", tint: PALE }, // every day, this choice appears in small places
      { t: 476, form: "open", tint: ROSE }, // love given freely comes back, from a stranger
      { t: 521, form: "candle", tint: GOLD }, // one last image: a light set down in the middle of the room
    ],
  });
}
