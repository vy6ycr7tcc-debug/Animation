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
import { combine, galaxy, heart, point, rain, river, road, rock, shift, sphere, storm, FORM_H } from "../world/forms";
import { crackedHeart, doorway, footsteps, letGo, offeredHand, pushing, rings } from "../world/symbols";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { visionLesson } from "./visionLesson";
import { GOLD, PALE, PEARL, ROSE, type Maker } from "./visionStage";

const forms: Record<string, Maker> = {
  galaxy: (n, R) => galaxy(n, R, 2.6),
  rain: (n, R) => rain(n, R),
  weather: (n, R) => storm(n, R, 0),
  ache: (n, R) => crackedHeart(n, R),
  // you cannot hold something you are pushing away
  push: (n, R) => pushing(n, R),
  // allowing is a posture
  allow: (n, R) => letGo(n, R),
  // the stillness wants to sit with it
  still: (n, R) => combine(n, [[(m) => rock(m, R, 1.2, 0.4, 0.9), 0.55], [(m) => sphere(m, R, 0.3, 1.3, 0.5), 0.45]]),
  // a river does not apologise for its banks
  river: (n, R) => river(n, R),
  // real, felt space in the chest
  space: (n, R) => combine(n, [[(m) => heart(m, R, 1.3), 0.6], [(m) => rings(m, R, 2), 0.4]]),
  // a path appears under walking feet
  path: (n, R) => combine(n, [[(m) => road(m, R), 0.5], [(m) => footsteps(m, R), 0.5]]),
  // not staying where it harms you: walking out
  leave: (n, R) => combine(n, [[(m) => doorway(m, R, 0.2), 0.5], [(m) => footsteps(m, R, 4), 0.5]]),
  // the guest at the door, welcomed because it is here
  guest: (n, R) => combine(n, [[(m) => doorway(m, R, 1), 0.7], [(m) => shift(offeredHand(m, R, 0), 0, -0.3, 1.2, 0.6), 0.3]]),
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
