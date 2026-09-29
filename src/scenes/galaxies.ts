/* The galaxies lesson: L06 "What Is" (acceptance), told as a vision of light (scenes/visionLesson.ts)
   before a seat under the open night: a seat in the dark, and a galaxy hanging before it, which the
   telling returns to (the owner's concept: "a seat in a dark space, a beautiful galaxy hovering
   around it"). Its moments follow the telling: rain on the window; weather that did not ask; the
   body that aches; pushing away; the posture of allowing; sitting with it in stillness; edges, and
   the river that does not apologise for its banks; space in the chest; a path appearing under
   walking feet; walking out of what harms; a guest at the door, welcomed; this moment, a single
   point; the breath; and the galaxy again. */
import type * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { combine, galaxy, offering, point, rain, river, road, rock, shift, sphere, storm, turnY, FORM_H } from "../world/forms";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { visionLesson } from "./visionLesson";
import { GOLD, PALE, PEARL, ROSE, type Maker } from "./visionStage";

const BOWED: [string, number][] = [["DEF-spine.001", 0.28], ["DEF-spine.003", 0.22], ["DEF-neck", 0.35]];

const forms: Record<string, Maker> = {
  galaxy: (n, R) => galaxy(n, R, 2.6),
  rain: (n, R) => rain(n, R),
  weather: (n, R) => storm(n, R, 0),
  ache: (n, R, b) => b && b.figure(n, R, "Idle_Loop", 0.8, BOWED, FORM_H * 0.72),
  // you cannot hold something you are pushing away
  push: (n, R, b) => b && b.figure(n, R, "Interact", 0.7, [], FORM_H * 0.78),
  // allowing is a posture
  allow: (n, R, b) => b && offering(n, R, b, 0),
  // the stillness wants to sit with it
  still: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Sitting_Idle_Loop", 1.2, [], FORM_H * 0.52), 0.82], [(m) => rock(m, R, 0.75, 0.42, 0.6), 0.18]]),
  // a river does not apologise for its banks
  river: (n, R) => river(n, R),
  // real, felt space in the chest
  space: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Idle_Loop", 2.2, [], FORM_H * 0.8), 0.72], [(m) => sphere(m, R, 0.55, FORM_H * 0.53, 0.45), 0.28]]),
  // a path appears under walking feet
  path: (n, R, b) => b && combine(n, [[(m) => road(m, R), 0.5], [(m) => shift(turnY(b.figure(m, R, "Walk_Loop", 0.2, [], FORM_H * 0.62), Math.PI), 0, 0, -1.5), 0.5]]),
  // not staying where it harms you: walking out
  leave: (n, R, b) => b && shift(turnY(b.figure(n, R, "Walk_Loop", 0.6, [], FORM_H * 0.7), Math.PI * 0.8), 0.6, 0, -0.5),
  // the guest at the door, welcomed because it is here
  guest: (n, R, b) => b && combine(n, [
    [(m) => shift(turnY(offering(m, R, b, 0), Math.PI / 2), -1.1, 0, 0), 0.5],
    [(m) => shift(turnY(b.figure(m, R, "Idle_Loop", 1.8, BOWED, FORM_H * 0.7), -Math.PI / 2), 1.1, 0, 0), 0.5],
  ]),
  // this moment: the only place anything ever happens
  moment: (n, R) => point(n, R, FORM_H * 0.5),
  // the next breath
  breath: (n, R) => sphere(n, R, 1.1, FORM_H * 0.5, 0.9),
};

export function createGalaxiesScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return visionLesson(scene, narration, whisper, {
    id: "galaxies",
    trackId: "L06",
    site: SITES.galaxies,
    seedNum: 606,
    forms,
    keys: [
      { t: 0.5, form: "galaxy", tint: PEARL, dur: 7, spin: 0.06 }, // the galaxy hanging before the seat
      { t: 8, form: "rain", tint: PALE }, // it is raining outside your window
      { t: 20, form: "weather", tint: PALE }, // the clouds did not ask your opinion
      { t: 45, form: "ache", tint: ROSE }, // the body aches
      { t: 70, form: "push", tint: PALE }, // you cannot hold something you are pushing away
      { t: 172, form: "allow", tint: GOLD }, // allowing is a posture
      { t: 210, form: "still", tint: PEARL }, // the stillness wants to sit with it
      { t: 262, form: "river", tint: PALE }, // a river does not apologise for its banks
      { t: 283, form: "space", tint: GOLD }, // real, felt space in the chest
      { t: 300, form: "path", tint: GOLD }, // a path appears under walking feet
      { t: 345, form: "leave", tint: PALE }, // not staying where it harms you
      { t: 500, form: "guest", tint: ROSE }, // the guest is here
      { t: 485, form: "moment", tint: PEARL, dur: 4 }, // this moment
      { t: 548, form: "breath", tint: PEARL }, // the next breath
      { t: 600, form: "galaxy", tint: PEARL, dur: 8, spin: 0.06 }, // and the galaxy again
    ],
  });
}
