/* The garden lesson: L05 "The Fire in the Hand" (anger), told as a vision of light in the night
   garden (scenes/visionLesson.ts). Its moments follow the telling: a figure looking at its hands;
   a coal burning in the palm, unasked for; the heat in the chest; three roads; the coal buried in
   the ground; the coal thrown, and both hands burned; the third road, sitting by the fire as by a
   hearth; one breath wide; the tenderness the fire guards; the heat that shapes the iron, held up
   as fuel; many standing together (what anger aimed has changed); the other also holding a coal;
   a cup in the evening; the coal held up to the light. */
import type * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { bowl, combine, flame, heart, offering, road, rock, shift, sphere, turnY, FORM_H, type BodyForms, type Rand } from "../world/forms";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { visionLesson } from "./visionLesson";
import { EMBER, GOLD, PALE, PEARL, ROSE, type Maker } from "./visionStage";

const BOWED: [string, number][] = [["DEF-spine.001", 0.28], ["DEF-spine.003", 0.22], ["DEF-neck", 0.35]];

/** A figure with a coal (a small hot light) in its hands. */
function withCoal(n: number, R: Rand, b: BodyForms, at = 2.2, r = 0.2): Float32Array {
  return offering(n, R, b, r, "Spell_Simple_Idle_Loop", at);
}

const forms: Record<string, Maker> = {
  // look at your hands
  hands: (n, R, b) => b && offering(n, R, b, 0),
  // something hot in one of them
  coal: (n, R, b) => b && withCoal(n, R, b),
  // the heat in the chest
  chest: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Idle_Loop", 1.0, [], FORM_H * 0.8), 0.78], [(m) => sphere(m, R, 0.32, FORM_H * 0.52, 0.3), 0.22]]),
  // three roads, and you have walked them all
  roads: (n, R) => combine(n, [-0.55, 0, 0.55].map((a): [(m: number) => Float32Array, number] => [(m) => turnY(road(m, R), a), 1 / 3])),
  // the first road: bury it, and smile anyway
  bury: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Sitting_Idle_Loop", 0.6, BOWED, FORM_H * 0.52), 0.7], [(m) => shift(rock(m, R, 0.8, 0.3, 0.7), 0, 0, 0.9), 0.3]]),
  // the second road: aim it back at whoever lit it
  thrown: (n, R, b) => b && combine(n, [
    [(m) => shift(turnY(b.figure(m, R, "Interact", 0.6, [], FORM_H * 0.72), Math.PI / 2), -1.4, 0, 0), 0.44],
    [(m) => shift(turnY(b.figure(m, R, "Idle_Loop", 2.0, BOWED, FORM_H * 0.68), -Math.PI / 2), 1.5, 0, 0), 0.4],
    [(m) => {
      // the coal's arc between them
      const out = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const u = R();
        out.set([-1.0 + u * 2.1 + (R() - 0.5) * 0.05, 2.6 + Math.sin(u * Math.PI) * 0.9 + (R() - 0.5) * 0.05, (R() - 0.5) * 0.05], i * 3);
      }
      return out;
    }, 0.16],
  ]),
  // the third road: watching it as a flame in a hearth
  hearth: (n, R, b) => b && combine(n, [[(m) => shift(turnY(b.figure(m, R, "Sitting_Idle_Loop", 1.1, [], FORM_H * 0.5), Math.PI / 2), -1.2, 0, 0), 0.5], [(m) => shift(rock(m, R, 0.6, 0.35, 0.5), -1.2, 0, 0), 0.1], [(m) => shift(flame(m, R, 0.05, 1.3), 0.9, 0, 0), 0.4]]),
  // one breath wide: standing, the shoulders dropping
  breath: (n, R, b) => b && b.figure(n, R, "Idle_Loop", 2.4, [], FORM_H * 0.8),
  // under the heat, a tenderness: the fire the guard at its gate
  tender: (n, R) => combine(n, [[(m) => flame(m, R, 0.3, 3.6), 0.62], [(m) => heart(m, R, 0.55, 1.6), 0.38]]),
  // the heat that shapes the iron: fire held up as fuel, not a weapon
  fuel: (n, R, b) => b && combine(n, [[(m) => offering(m, R, b, 0), 0.72], [(m) => flame(m, R, FORM_H * 0.46, 1.2), 0.28]]),
  // many standing together: this will not stand
  many: (n, R, b) => b && combine(n, Array.from({ length: 5 }, (_, k): [(m: number) => Float32Array, number] => [(m) => {
    const x = (k - 2) * 1.05, z = -Math.abs(k - 2) * 0.35;
    return shift(b.figure(m, R, "Idle_Loop", 0.3 + k * 0.7, [], FORM_H * (0.62 - Math.abs(k - 2) * 0.04)), x, 0, z);
  }, 0.2])),
  // they are holding a coal too
  both: (n, R, b) => b && combine(n, [
    [(m) => shift(turnY(withCoal(m, R, b, 1.2, 0.16), Math.PI / 2.6), -1.1, 0, 0), 0.5],
    [(m) => shift(turnY(withCoal(m, R, b, 2.6, 0.16), -Math.PI / 2.6), 1.1, 0, 0), 0.5],
  ]),
  // the coal aimed at yourself: curled round it
  inward: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Sitting_Idle_Loop", 0.2, BOWED, FORM_H * 0.5), 0.72], [(m) => rock(m, R, 0.7, 0.4, 0.6), 0.14], [(m) => sphere(m, R, 0.18, FORM_H * 0.33, 0.3), 0.14]]),
  // the hand that held the coal this morning will hold a cup tonight
  cup: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Spell_Simple_Idle_Loop", 1.4, [], FORM_H * 0.8), 0.76], [(m) => shift(bowl(m, R, 0), 0, 2.05, 0.75, 0.45), 0.24]]),
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
      { t: 527, form: "hands", tint: PALE }, // see if it cools a little in kind hands
      { t: 546, form: "cup", tint: GOLD }, // the same hand will hold a cup tonight
      { t: 592, form: "coal", tint: GOLD }, // one hand
      { t: 609, form: "fuel", tint: PEARL }, // hold the coal up to the light
    ],
  });
}
