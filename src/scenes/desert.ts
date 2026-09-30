/* The desert lesson: L07 "The Dark and the Lantern" (faith), told as a vision of light on the dark
   plain (scenes/visionLesson.ts). Its moments follow the telling: the road past the last
   streetlight; the mind that wants the map unfolded; walking anyway; the weather of feelings; the
   lantern lifted; one small kept promise, then another; worry; the night that is not empty (the
   stars need the dark); faith of the family of love; the careful ledger, and trust with no
   receipt; a quiet signal listened for; walking without knowing; the row of small lights left
   behind each step; a seed (what you can do is smaller, and enough); the lantern set down; the
   road ahead, walkable; the next three steps. */
import type * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { book, combine, heart, lantern, lights, road, shift, sprout, stars, storm, FORM_H } from "../world/forms";
import { ear, footsteps, hand, tangle } from "../world/symbols";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { visionLesson } from "./visionLesson";
import { EMBER, GOLD, PALE, PEARL, ROSE, type Maker } from "./visionStage";

const forms: Record<string, Maker> = {
  // the road outside town, after the last streetlight
  road: (n, R) => combine(n, [[(m) => road(m, R), 0.75], [(m) => shift(lantern(m, R), -1.4, 0, 0.6, 0.9), 0.25]]),
  // the mind wants the map unfolded
  map: (n, R) => shift(book(n, R), 0, 0.9, 0, 1.2),
  walk: (n, R) => combine(n, [[(m) => footsteps(m, R), 0.6], [(m) => shift(lantern(m, R), 0.4, 0, -2.4, 0.6), 0.4]]),
  weather: (n, R) => storm(n, R, 0),
  // you lift the lantern, and something in you steadies
  lift: (n, R) => combine(n, [[(m) => hand(m, R, 1, FORM_H * 0.35, 0.8), 0.55], [(m) => shift(lantern(m, R), 0, FORM_H * 0.45, 0, 0.7), 0.45]]),
  // one small kept promise, and then another
  promises: (n, R) => lights(n, R, 3),
  // worry
  worry: (n, R) => tangle(n, R),
  // the night is not empty
  stars: (n, R) => stars(n, R),
  heart: (n, R) => heart(n, R, 1.1),
  ledger: (n, R) => shift(book(n, R), 0, 0.9, 0, 1.2),
  // real trust has no receipt
  open: (n, R) => hand(n, R, 1, FORM_H * 0.5, 1.2),
  // a quieter signal: listening
  listen: (n, R) => ear(n, R),
  // every step leaves a little light behind
  row: (n, R) => combine(n, [[(m) => lights(m, R, 9), 0.55], [(m) => footsteps(m, R, 8), 0.45]]),
  // what you can do is smaller, and it is enough
  seed: (n, R) => shift(sprout(n, R, 1.6), 0, 0, 0, 1.5),
  lantern: (n, R) => shift(lantern(n, R), 0, 0, 0, 1.3),
};

export function createDesert(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return visionLesson(scene, narration, whisper, {
    id: "desert",
    trackId: "L07",
    site: SITES.desert,
    seedNum: 707,
    forms,
    keys: [
      { t: 1, form: "road", tint: PALE, dur: 7 }, // the road after the last streetlight
      { t: 50, form: "map", tint: PALE }, // it wants the map unfolded
      { t: 78, form: "walk", tint: GOLD }, // when you first learned to ride, or to love, or to begin
      { t: 115, form: "weather", tint: PALE }, // feelings arrive and leave like weather
      { t: 132, form: "lift", tint: GOLD }, // you lift the lantern
      { t: 167, form: "promises", tint: GOLD }, // one small kept promise, and then another
      { t: 186, form: "worry", tint: EMBER }, // worry is faith pointed the wrong way
      { t: 220, form: "stars", tint: PEARL, spin: 0.02 }, // the night is not empty
      { t: 250, form: "heart", tint: ROSE }, // faith belongs to the same family as love
      { t: 288, form: "ledger", tint: PALE }, // the careful kind keeps a ledger
      { t: 302, form: "open", tint: GOLD }, // real trust has no receipt
      { t: 332, form: "listen", tint: PALE }, // a quieter signal
      { t: 400, form: "walk", tint: GOLD }, // walking anyway
      { t: 430, form: "row", tint: GOLD }, // you leave a little light behind you
      { t: 474, form: "seed", tint: GOLD }, // smaller, and enough
      { t: 529, form: "lantern", tint: GOLD }, // here is where we leave the lantern
      { t: 537, form: "road", tint: PALE }, // the road ahead, as walkable as it was
      { t: 572, form: "walk", tint: PEARL }, // the next three steps
    ],
  });
}
