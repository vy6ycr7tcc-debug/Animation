/* A standalone vision: "Other worlds" (public/audio/standalone/other_worlds.mp3), enacted
   (scenes/enacted.ts). The night deepens round the seat and the sky becomes a depth: stars at
   every distance drifting slowly toward you, so that you fall upward into it. The great body of
   light (scenes/standalone/kit.ts) tells it: a forest, mostly out of sight; distant suns with their
   own earths; the Maya's world-tree through thirteen heavens and nine underworlds; a star that
   falls and is born as someone who stands up (the wanderer); people met and recognised; the veil
   drawn before a figure, the fire that tempers iron, the open book; a seed planted and the
   gardener's waiting; a hand held open, never forcing; the earth with lights round it at a
   distance, never landing; someone asleep, and the morning; the garden again; looking up.
   Round it: lights falling from the sky in three waves (the wanderers arriving when the need is
   greatest), a ring of older worlds rising in an arc over the stage (the fellowship) that stays
   and watches, and at the end the dark between the stars filling with soft warm lights: the
   witnesses. Beats at their words (paragraphs at 0, 12.5, 24.8, 41.1, 54.5, 71.6, 91.6, 103.5,
   111.8, 122.8, 143.9, 155.3, 167.4 s). */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { T } from "../gpu/tsl";
import { FORM_H, point, rng, sprout, stars, sun } from "../world/forms";
import { book, flame, tree } from "../world/forms";
import { offeredHand } from "../world/symbols";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { cloud, enactedLesson, env, lessonDark, type Stage, type StageCtx } from "./enacted";
import { EMBER, GOLD, PALE, PEARL, ROSE, type Key, type Maker } from "./visionStage";
import { crowd, forest, greatVision, systems, veil, watched, worldTree } from "./standalone/kit";

const { cos, float, fract, max, mix, pow, sin, smoothstep, uniform, vec3, vec4 } = T;

const SCALE = 3;
const GREEN: [number, number, number] = [0.72, 0.95, 0.75];

const FORMS: Record<string, Maker> = {
  stars: (n, R) => stars(n, R),
  forest: (n, R) => forest(n, R),
  systems: (n, R) => systems(n, R),
  maya: (n, R) => worldTree(n, R),
  star: (n, R) => point(n, R, FORM_H * 0.95),
  born: (n, R, b) => b && b.figure(n, R, "Sitting_Idle_Loop", 0.5, [], FORM_H * 0.5),
  stands: (n, R, b) => b && b.figure(n, R, "Idle_Loop", 0.9, [], FORM_H * 0.86),
  people: (n, R, b) => b && crowd(n, R, b),
  veil: (n, R, b) => veil(n, R, b),
  fire: (n, R) => flame(n, R, 0.6, 3.4),
  book: (n, R) => book(n, R),
  seed: (n, R) => point(n, R, 0.4),
  sprout: (n, R) => sprout(n, R, 3.2),
  hand: (n, R) => offeredHand(n, R, 0.35, FORM_H * 0.45),
  watched: (n, R) => watched(n, R),
  sleep: (n, R, b) => b && b.figure(n, R, "Sitting_Idle_Loop", 1.4, [["DEF-spine.003", 0.5]], FORM_H * 0.55),
  morning: (n, R) => sun(n, R, FORM_H * 0.45),
  garden: (n, R) => tree(n, R, 0.71, FORM_H, 0),
  lookUp: (n, R, b) => b && b.figure(n, R, "Idle_Loop", 0.3, [["DEF-neck", -0.35], ["DEF-head", -0.35]], FORM_H * 0.86),
};

const KEYS: Key[] = [
  { t: 0, form: "stars", tint: PALE, dur: 6, spin: 0.04 },
  { t: 14, form: "forest", tint: GREEN, dur: 6 },
  { t: 26, form: "systems", tint: GOLD, dur: 5, spin: 0.15 },
  { t: 33, form: "maya", tint: PEARL, dur: 5, spin: 0.08 },
  { t: 42, form: "star", tint: PEARL, dur: 3 },
  { t: 47, form: "born", tint: ROSE, dur: 4 },
  { t: 51, form: "stands", tint: ROSE, dur: 4 },
  { t: 64, form: "people", tint: GOLD, dur: 5 },
  { t: 72.5, form: "veil", tint: PALE, dur: 5 },
  { t: 80.5, form: "fire", tint: EMBER, dur: 3.5 },
  { t: 86, form: "book", tint: PEARL, dur: 3.5 },
  { t: 96, form: "seed", tint: GOLD, dur: 3 },
  { t: 99, form: "sprout", tint: GREEN, dur: 4 },
  { t: 104, form: "hand", tint: GOLD, dur: 4 },
  { t: 112, form: "watched", tint: PALE, dur: 5, spin: 0.15 },
  { t: 123.5, form: "sleep", tint: ROSE, dur: 5 },
  { t: 136.5, form: "morning", tint: GOLD, dur: 4 },
  { t: 145, form: "garden", tint: GREEN, dur: 5 },
  { t: 156, form: "lookUp", tint: PEARL, dur: 5 },
];

function stage(ctx: StageCtx): Stage {
  const g = new THREE.Group();
  const t = ctx.clock, gy = ctx.ground;
  const R = rng(9113);
  const ours: { dispose(): void }[] = [];
  const u = {
    on: uniform(0),
    depth: uniform(0), // the sky as a depth
    waves: uniform(0), // seconds into the waves of the wanderers (0 none)
    fellow: uniform(0), // the older worlds
    witness: uniform(0),
  };
  const footY = Math.max(0, gy(0, 0));
  const vs = greatVision(FORMS, KEYS, 9113, SCALE, footY);
  g.add(vs.group);

  /* ------------- the sky as a depth: stars at every distance, drifting toward you ------------- */
  {
    const n = 6000;
    const S = cloud(n, 0.35, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, e = 0.12 + Math.pow(R(), 0.7) * 1.35;
      S.a.aK.set([Math.cos(a), e, Math.sin(a), R()], i * 4);
    }
    S.dirty();
    const K = S.c.nodes.aK;
    // each star on its own distance, closing slowly; a closed one is born again far away
    const d = fract(K.w.add(t.mul(0.006)));
    const r = mix(float(260), float(30), pow(d, 1.6));
    const ce = cos(K.y), se = sin(K.y);
    S.m.positionNode = vec3(K.x.mul(ce).mul(r), float(footY).add(se.mul(r)), K.z.mul(ce).mul(r));
    const tw = sin(t.mul(float(0.5).add(K.w.mul(2))).add(K.w.mul(90))).mul(0.3).add(0.7);
    const fade = smoothstep(0, 0.15, d).mul(smoothstep(1, 0.85, d));
    S.m.colorNode = vec4(mix(vec3(0.75, 0.85, 1), vec3(1, 0.9, 0.78), K.w).mul(S.round).mul(tw).mul(fade).mul(u.depth).mul(u.on), 1);
    g.add(S.c.sprite);
    ours.push(S.m);
  }

  /* ------------- the wanderers: lights falling from the sky in three waves ------------- */
  {
    const n = 900;
    const W = cloud(n, 0.3, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const r = 6 + Math.sqrt(R()) * 34, a = R() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 8;
      W.a.position.set([x, gy(x, z), z], i * 3);
      W.a.aK.set([i % 3, R(), R(), 0], i * 4);
    }
    W.dirty();
    const K = W.c.nodes.aK, P = W.c.nodes.position;
    // each wave sets out at its own second (0, 5, 10 s in) and each light on its own delay
    const local = u.waves.sub(K.x.mul(5)).sub(K.y.mul(3));
    const f = smoothstep(0, 6, local);
    const y = mix(float(70).add(K.z.mul(30)), float(0.4), pow(f, 1.4));
    W.m.positionNode = vec3(P.x, P.y.add(y), P.z);
    // a trail of brightness as it falls, then it settles on the ground as a small glow
    const lit = smoothstep(0, 0.4, local).mul(mix(float(1.2), float(0.45), f));
    W.m.colorNode = vec4(vec3(1, 0.86, 0.66).mul(W.round).mul(lit).mul(sin(t.mul(1.3).add(K.y.mul(30))).mul(0.2).add(0.8)).mul(u.on), 1);
    g.add(W.c.sprite);
    ours.push(W.m);
  }

  /* ------------- the fellowship: older worlds in an arc over the stage ------------- */
  const worlds = new THREE.Group();
  {
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (0.12 + (0.76 * k) / (n - 1));
      const x = Math.cos(a) * 30, y = footY + 9 + Math.sin(a) * 22, z = -18 - Math.sin(a) * 6;
      const size = 1.4 + ((k * 7) % 5) * 0.35;
      const hue = new THREE.Color().setHSL(0.08 + ((k * 0.37) % 1) * 0.6, 0.45, 0.6);
      const W = cloud(1, size * 1.7, { aK: 4 });
      W.a.aK.set([k / n, 0, 0, 0], 0);
      W.dirty();
      const K = W.c.nodes.aK;
      // each rises into its place one after another
      const show = smoothstep(K.x.mul(0.6), K.x.mul(0.6).add(0.3), u.fellow);
      const br = sin(t.mul(0.4).add(K.x.mul(17))).mul(0.15).add(0.85);
      W.m.colorNode = vec4(vec3(hue.r, hue.g, hue.b).mul(W.round).mul(show).mul(br).mul(u.on).mul(0.9), 1);
      W.c.sprite.position.set(x, y, z);
      worlds.add(W.c.sprite);
      ours.push(W.m);
    }
    g.add(worlds);
  }

  /* ------------- the witnesses: the dark between the stars filling with soft warm lights ------------- */
  {
    const n = 5000;
    const S = cloud(n, 1.1, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, e = 0.18 + Math.pow(R(), 0.8) * 1.25, r = 60 + R() * 120;
      S.a.position.set([Math.cos(a) * Math.cos(e) * r, footY + Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
      S.a.aK.set([R(), R(), 0, 0], i * 4);
    }
    S.dirty();
    const K = S.c.nodes.aK;
    const show = smoothstep(K.x, K.x.add(0.15), u.witness.mul(1.15));
    const br = max(0, sin(t.mul(float(0.3).add(K.y.mul(0.5))).add(K.y.mul(70)))).mul(0.6).add(0.4);
    S.m.colorNode = vec4(vec3(1, 0.82, 0.6).mul(S.round).mul(show).mul(br).mul(u.on).mul(0.85), 1);
    g.add(S.c.sprite);
    ours.push(S.m);
  }

  return {
    group: g,
    update(dt, tt, on) {
      u.on.value = 0.35 + 0.65 * on;
      const T0 = tt;
      vs.update(dt, T0, T0 > 0, true, false);
      u.depth.value = env(T0, [[0, 0.25], [2, 0.25], [10, 1], [150, 1], [157, 1.3]]);
      u.waves.value = T0 > 56 ? T0 - 56 : 0;
      u.fellow.value = env(T0, [[0, 0], [92, 0], [101, 1], [175, 1]]);
      u.witness.value = env(T0, [[0, 0], [170, 0], [176, 1]]);
      worlds.visible = u.fellow.value > 0.001;
      if (T0 > 0) lessonDark.k = Math.max(lessonDark.k, env(T0, [[0, 0], [3, 0.5], [170, 0.5], [176, 0.3]]) * on);
    },
    dispose() {
      vs.dispose();
      for (const o of ours) o.dispose();
    },
  };
}

export function createOtherWorldsScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return enactedLesson(scene, narration, whisper, { id: "other-worlds", trackId: "audio/standalone/other_worlds.mp3", site: SITES["other-worlds"], reach: 12, centreY: 7.5, make: stage });
}
