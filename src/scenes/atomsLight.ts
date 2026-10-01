/* A standalone vision: "Atoms and light" (public/audio/standalone/atoms_and_light.mp3), enacted
   (scenes/enacted.ts). A great body of light stands before the seat and tells it (scenes/standalone/
   kit.ts), and the land round it answers.
   The stone held in a palm; two currents rising round it, gold and pale (love the shaping force,
   light the building block); the creation in its order: one point of desire, a heart, then light
   bursting out over everything and hanging in the sky as stars, then a world; the atom (an orbit
   of light holding a pattern), split as we learned to split it, the star that forged the blood's
   iron, the planet, the galaxy, and the galaxy made of atoms (each portion a hologram of the
   whole); the breath of life rising like sap through a tree, motes climbing; the body of light
   shining in every direction while the ground lights up round the seat (holy ground); the stone
   again and the farthest star joined to it, the sky's stars brightening (look up); the meditation:
   down into one atom grown vast round you, then rising, the stars streaming past, until a galaxy
   turns below; and the return: all the stars drawn back down into the stone in the hand, which
   glows. Every beat is placed at its words in the recording (paragraphs at 0, 8.2, 25.6, 47.5, 85.8,
   100.1, 123.7, 149.1, 163.6 s). */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { T } from "../gpu/tsl";
import { FORM_H, galaxy, point, rng, sphere, sun, tree } from "../world/forms";
import { heart } from "../world/forms";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { cloud, enactedLesson, env, lessonDark, type Stage, type StageCtx } from "./enacted";
import { GOLD, PALE, PEARL, ROSE, EMBER, type Key, type Maker } from "./visionStage";
import { atom, greatVision, hologram, radiant, split, stoneAndStar, stoneInHand } from "./standalone/kit";
import { helix } from "../world/forms";

const { cos, float, fract, mix, pow, sin, smoothstep, uniform, vec3, vec4 } = T;

const STONE: [number, number, number] = [0.86, 0.8, 0.72];
const SCALE = 3;

const FORMS: Record<string, Maker> = {
  stone: (n, R) => stoneInHand(n, R),
  currents: (n, R) => helix(n, R, 1.3, 0.3, 4.4, 3, 2),
  desire: (n, R) => point(n, R, FORM_H * 0.55),
  love: (n, R) => heart(n, R, 1.5, FORM_H * 0.55),
  light: (n, R) => sun(n, R, FORM_H * 0.55),
  world: (n, R) => sphere(n, R, 1.7, FORM_H / 2, 0.85),
  atom: (n, R) => atom(n, R),
  split: (n, R) => split(n, R),
  body: (n, R, b) => b && b.figure(n, R, "Idle_Loop", 0.6, [], FORM_H * 0.86),
  star: (n, R) => sun(n, R, FORM_H * 0.55),
  planet: (n, R) => sphere(n, R, 1.5, FORM_H / 2, 0.92),
  galaxy: (n, R) => galaxy(n, R, 2.4),
  hologram: (n, R) => hologram(n, R),
  sap: (n, R) => tree(n, R, 0.61, FORM_H, 2),
  shining: (n, R, b) => b && radiant(n, R, b),
  practice: (n, R) => stoneInHand(n, R, 0.4),
  starStone: (n, R) => stoneAndStar(n, R),
  inside: (n, R) => atom(n, R, 2.6, FORM_H * 0.55),
  below: (n, R) => galaxy(n, R, 2.6, 0.4),
  home: (n, R) => stoneInHand(n, R, 1),
};

// the recording's own seconds
const KEYS: Key[] = [
  { t: 0, form: "stone", tint: STONE, dur: 5 },
  { t: 9.5, form: "currents", tint: GOLD, dur: 6, spin: 0.35 },
  { t: 27, form: "desire", tint: ROSE, dur: 3 },
  { t: 29.5, form: "love", tint: ROSE, dur: 3.5 },
  { t: 31.5, form: "light", tint: PEARL, dur: 3, spin: 0.1 },
  { t: 34.5, form: "world", tint: GOLD, dur: 5, spin: 0.12 },
  { t: 50, form: "atom", tint: PALE, dur: 5, spin: 0.5 },
  { t: 61, form: "split", tint: PALE, dur: 2.5 },
  { t: 67.5, form: "body", tint: ROSE, dur: 4 },
  { t: 70.5, form: "star", tint: EMBER, dur: 3 },
  { t: 73.5, form: "planet", tint: PALE, dur: 3, spin: 0.2 },
  { t: 76.5, form: "galaxy", tint: PEARL, dur: 3.5, spin: 0.25 },
  { t: 80.5, form: "hologram", tint: GOLD, dur: 4, spin: 0.2 },
  { t: 88, form: "sap", tint: GOLD, dur: 6 },
  { t: 103, form: "shining", tint: PEARL, dur: 5 },
  { t: 124, form: "practice", tint: STONE, dur: 5 },
  { t: 140, form: "starStone", tint: GOLD, dur: 5 },
  { t: 151, form: "inside", tint: PALE, dur: 4, spin: 0.6 },
  { t: 157, form: "below", tint: PEARL, dur: 4, spin: 0.3 },
  { t: 164.5, form: "home", tint: GOLD, dur: 6 },
];

function stage(ctx: StageCtx): Stage {
  const g = new THREE.Group();
  const t = ctx.clock, gy = ctx.ground;
  const R = rng(4417);
  const ours: { dispose(): void }[] = [];
  const u = {
    on: uniform(0),
    cur: uniform(0), // the two currents
    out: uniform(0), // the light gone out over everything (0 held in, 1 the sky)
    sky: uniform(0), // its stars' brightness
    sap: uniform(0),
    holy: uniform(0),
    rise: uniform(0),
  };
  const footY = Math.max(0, gy(0, 0));
  const vs = greatVision(FORMS, KEYS, 4417, SCALE, footY);
  g.add(vs.group);
  const CY = footY + FORM_H * 0.55 * SCALE; // the heart of the forms

  /* ------------- two currents, gold and pale, winding up round the stone ------------- */
  {
    const n = 2400;
    const C = cloud(n, 0.1, { aK: 4 });
    for (let i = 0; i < n; i++) C.a.aK.set([R(), i % 2, R(), R()], i * 4);
    C.dirty();
    const K = C.c.nodes.aK;
    const f = fract(K.x.add(t.mul(0.07)));
    const a = f.mul(Math.PI * 7).add(K.y.mul(Math.PI)).add(t.mul(0.4));
    const r = float(3.6).add(sin(f.mul(9)).mul(0.5)).add(K.z.mul(0.35));
    C.m.positionNode = vec3(cos(a).mul(r), float(footY + 0.4).add(f.mul(13)), sin(a).mul(r));
    const col = mix(vec3(1, 0.78, 0.45), vec3(0.75, 0.86, 1), K.y);
    C.m.colorNode = vec4(col.mul(C.round).mul(sin(f.mul(Math.PI))).mul(u.cur).mul(u.on).mul(0.9), 1);
    g.add(C.c.sprite);
    ours.push(C.m);
  }

  /* ------------- the light that goes out over everything, and hangs as stars ------------- */
  {
    const n = 7000;
    const S = cloud(n, 0.5, { aK: 4 });
    for (let i = 0; i < n; i++) {
      // directions over the upper sky mostly (a few below the horizon would vanish in the ground)
      const a = R() * Math.PI * 2, e = Math.asin(0.05 + R() * 0.95);
      S.a.aK.set([Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a), R()], i * 4);
    }
    S.dirty();
    const K = S.c.nodes.aK;
    const far = float(70).add(K.w.mul(90));
    const rr = pow(u.out, float(0.6).add(K.w.mul(0.8))).mul(far);
    S.m.positionNode = vec3(K.x.mul(rr), float(CY).add(K.y.mul(rr)), K.z.mul(rr));
    const tw = sin(t.mul(float(0.7).add(K.w.mul(2))).add(K.w.mul(80))).mul(0.3).add(0.7);
    // bright as it flies, then a star
    const flight = smoothstep(0.02, 0.2, u.out).mul(smoothstep(1, 0.75, u.out)).mul(1.4);
    const col = mix(vec3(1, 0.92, 0.78), vec3(0.78, 0.86, 1), K.w);
    S.m.colorNode = vec4(col.mul(S.round).mul(tw).mul(flight.add(u.sky)).mul(smoothstep(0.0, 0.04, u.out)).mul(u.on), 1);
    g.add(S.c.sprite);
    ours.push(S.m);
  }

  /* ------------- the breath of life: motes rising like sap ------------- */
  {
    const n = 1600;
    const P = cloud(n, 0.08, { aK: 4 });
    for (let i = 0; i < n; i++) P.a.aK.set([R(), R(), R(), R()], i * 4);
    P.dirty();
    const K = P.c.nodes.aK;
    const f = fract(K.x.add(t.mul(float(0.05).add(K.y.mul(0.05)))));
    // up the trunk, then out along the crown
    const spread = smoothstep(0.45, 1, f).mul(K.z.mul(4.5).add(0.5));
    const a = K.w.mul(Math.PI * 2);
    P.m.positionNode = vec3(cos(a).mul(spread).add(sin(f.mul(17).add(K.w.mul(9))).mul(0.12)), float(footY + 0.2).add(f.mul(FORM_H * SCALE * 0.95)), sin(a).mul(spread));
    P.m.colorNode = vec4(vec3(1, 0.84, 0.5).mul(P.round).mul(sin(f.mul(Math.PI))).mul(u.sap).mul(u.on), 1);
    g.add(P.c.sprite);
    ours.push(P.m);
  }

  /* ------------- holy ground: the land round the seat lit from within ------------- */
  {
    const n = 9000;
    const H = cloud(n, 0.1, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(R()) * 26, a = R() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r + 6;
      H.a.position.set([x, gy(x, z) + 0.07, z], i * 3);
      H.a.aK.set([Math.hypot(x, z), R(), 0, 0], i * 4);
    }
    H.dirty();
    const K = H.c.nodes.aK;
    // from the body of light outward, a ring after ring; the ground stays lit behind
    const reach = u.holy.mul(30);
    const lit = smoothstep(reach, reach.sub(4), K.x);
    const wave = pow(sin(K.x.mul(0.35).sub(t.mul(1.1))).mul(0.5).add(0.5), 4);
    H.m.colorNode = vec4(vec3(1, 0.86, 0.6).mul(H.round).mul(lit).mul(wave.mul(0.7).add(0.3)).mul(sin(t.mul(0.9).add(K.y.mul(40))).mul(0.2).add(0.8)).mul(u.on).mul(0.7), 1);
    g.add(H.c.sprite);
    ours.push(H.m);
  }

  /* ------------- rising: the stars streaming down past you ------------- */
  {
    const n = 3000;
    const S = cloud(n, 0.07, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = 3 + R() * 26;
      S.a.aK.set([Math.cos(a) * r, R(), Math.sin(a) * r + 9, R()], i * 4);
    }
    S.dirty();
    const K = S.c.nodes.aK;
    const f = fract(K.y.sub(t.mul(float(0.45).add(K.w.mul(0.4)))));
    S.m.positionNode = vec3(K.x, float(footY - 6).add(f.mul(44)), K.z);
    S.m.colorNode = vec4(vec3(0.8, 0.88, 1).mul(S.round).mul(sin(f.mul(Math.PI))).mul(u.rise).mul(u.on), 1);
    g.add(S.c.sprite);
    ours.push(S.m);
  }

  return {
    group: g,
    update(dt, tt, on) {
      u.on.value = 0.35 + 0.65 * on;
      const T0 = tt;
      vs.update(dt, T0, T0 > 0, true, false);
      u.cur.value = env(T0, [[0, 0], [9, 0], [13, 1], [24, 1], [28, 0]]);
      // the light bursts out at "love created light", hangs as stars, comes home at the end
      u.out.value = env(T0, [[0, 0], [31.5, 0], [40, 1], [164, 1], [174, 0.02]]);
      u.sky.value = env(T0, [[0, 0], [38, 0.25], [124, 0.25], [134, 0.7], [149, 0.7], [152, 1], [163, 1], [172, 0.3]]);
      u.sap.value = env(T0, [[0, 0], [86, 0], [90, 1], [100, 1], [104, 0]]);
      u.holy.value = env(T0, [[0, 0], [104, 0], [118, 1], [126, 1], [134, 0]]);
      u.rise.value = env(T0, [[0, 0], [154, 0], [156, 1], [161, 1], [164, 0]]);
      if (T0 > 0) lessonDark.k = Math.max(lessonDark.k, env(T0, [[0, 0], [148, 0], [152, 0.55], [162, 0.55], [168, 0]]) * on);
    },
    dispose() {
      vs.dispose();
      for (const o of ours) o.dispose();
    },
  };
}

export function createAtomsScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return enactedLesson(scene, narration, whisper, { id: "atoms", trackId: "audio/standalone/atoms_and_light.mp3", site: SITES.atoms, reach: 12, centreY: 7.5, make: stage });
}
