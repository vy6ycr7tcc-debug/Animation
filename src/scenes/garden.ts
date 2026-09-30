/* The garden lesson: L05 "The Fire in the Hand" (anger), told as a vision of light in the night
   garden (scenes/visionLesson.ts). Its moments follow the telling: a figure looking at its hands;
   a coal burning in the palm, unasked for; the heat in the chest; three roads; the coal buried in
   the ground; the coal thrown, and both hands burned; the third road, sitting by the fire as by a
   hearth; one breath wide; the tenderness the fire guards; the heat that shapes the iron, held up
   as fuel; many standing together (what anger aimed has changed); the other also holding a coal;
   a cup in the evening; the coal held up to the light. */
import type * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { combine, flame, heart, road, rock, shift, sphere, turnY, FORM_H } from "../world/forms";
import { crackedHeart, cupped, flames, hand, offeredHand, rings, spiral, steamingBowl } from "../world/symbols";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { visionLesson } from "./visionLesson";
import { EMBER, GOLD, PALE, PEARL, ROSE, type Maker } from "./visionStage";

// the telling in symbols, one at a time
const forms: Record<string, Maker> = {
  // look at your hands
  hands: (n, R) => hand(n, R, 1, FORM_H * 0.5, 1.2),
  // something hot in one of them: a coal on the palm
  coal: (n, R) => offeredHand(n, R, 0.2),
  // the heat in the chest
  chest: (n, R) => combine(n, [[(m) => heart(m, R, 1.0), 0.7], [(m) => sphere(m, R, 0.3, FORM_H / 2, 0.3), 0.3]]),
  // three roads, and you have walked them all
  roads: (n, R) => combine(n, [-0.55, 0, 0.55].map((a): [(m: number) => Float32Array, number] => [(m) => turnY(road(m, R), a), 1 / 3])),
  // the first road: bury it, and smile anyway
  bury: (n, R) => combine(n, [[(m) => rock(m, R, 1.3, 0.35, 1.0), 0.7], [(m) => sphere(m, R, 0.16, 0.25, 0.4), 0.3]]),
  // the second road: aim it back at whoever lit it (the coal's arc, and the hand that threw it)
  thrown: (n, R) => combine(n, [
    [(m) => shift(hand(m, R, 1, 0, 0.7), -1.6, FORM_H * 0.4, 0), 0.5],
    [(m) => {
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const u = R();
        out.set([-1.0 + u * 2.6 + (R() - 0.5) * 0.05, 2.2 + Math.sin(u * Math.PI) * 1.1 + (R() - 0.5) * 0.05, (R() - 0.5) * 0.05], i * 3);
      }
      return out;
    }, 0.3],
    [(m) => shift(sphere(m, R, 0.2, 0, 0.5), 1.6, 2.3, 0), 0.2],
  ]),
  // the third road: watching it as a flame in a hearth
  hearth: (n, R) => combine(n, [[(m) => rock(m, R, 1.1, 0.3, 0.9), 0.3], [(m) => flame(m, R, 0.3, 1.8), 0.7]]),
  // one breath wide
  breath: (n, R) => rings(n, R, 4),
  // under the heat, a tenderness: the fire the guard at its gate
  tender: (n, R) => combine(n, [[(m) => flame(m, R, 0.3, 3.6), 0.62], [(m) => heart(m, R, 0.55, 1.6), 0.38]]),
  // the heat that shapes the iron: a flame held up in an open hand
  fuel: (n, R) => combine(n, [[(m) => offeredHand(m, R, 0, FORM_H * 0.3), 0.6], [(m) => flame(m, R, FORM_H * 0.36, 1.4), 0.4]]),
  // many standing together: many small flames
  many: (n, R) => flames(n, R, 9),
  // they are holding a coal too: two coals, two hands
  both: (n, R) => combine(n, [[(m) => shift(offeredHand(m, R, 0.18), -1.2, 0, 0, 0.75), 0.5], [(m) => shift(offeredHand(m, R, 0.18), 1.2, 0, 0, 0.75), 0.5]]),
  // the coal aimed at yourself: winding inward, and the ache of it
  inward: (n, R) => combine(n, [[(m) => spiral(m, R, 2.6), 0.5], [(m) => crackedHeart(m, R), 0.5]]),
  // the hand that held the coal this morning will hold a cup tonight
  cup: (n, R) => steamingBowl(n, R),
  // cupped hands: see if it cools a little in kind hands
  kind: (n, R) => cupped(n, R, 0.2),
};

export function createGardenScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return visionLesson(scene, narration, whisper, {
    id: "garden",
    trackId: "L05",
    site: SITES.garden,
    seedNum: 505,
    forms,
    keys: [
      { t: 1, form: "hands", tint: PEARL, dur: 6 }, // look at your hands
      { t: 12, form: "coal", tint: EMBER }, // one of them holding something hot
      { t: 38, form: "chest", tint: EMBER }, // maybe the chest, tight and warm
      { t: 96, form: "roads", tint: PALE }, // three roads
      { t: 106, form: "bury", tint: EMBER }, // the first road is to bury it
      { t: 165, form: "thrown", tint: EMBER }, // to aim it back at whoever lit it
      { t: 208, form: "hearth", tint: GOLD }, // the third road: a flame in a hearth
      { t: 257, form: "breath", tint: PALE }, // one breath wide
      { t: 312, form: "tender", tint: ROSE }, // under the heat, a tenderness
      { t: 342, form: "fuel", tint: GOLD }, // the same heat can shape the iron
      { t: 358, form: "many", tint: GOLD }, // it has emptied streets and filled halls
      { t: 395, form: "both", tint: EMBER }, // they are holding a coal too
      { t: 478, form: "inward", tint: EMBER }, // the coal, aimed at yourself
      { t: 527, form: "kind", tint: PALE }, // see if it cools a little in kind hands
      { t: 546, form: "cup", tint: GOLD }, // the same hand will hold a cup tonight
      { t: 592, form: "coal", tint: GOLD }, // one hand
      { t: 609, form: "fuel", tint: PEARL }, // hold the coal up to the light
    ],
  });
}
