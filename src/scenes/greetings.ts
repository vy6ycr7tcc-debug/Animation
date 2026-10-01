/* A standalone vision: "Psychic greetings" (public/audio/standalone/psychic_greetings.mp3), enacted
   (scenes/enacted.ts). The great body of light (scenes/standalone/kit.ts) tells it, and the land
   round the seat answers.
   Making the word smaller: a storm cloud that shrinks, spends itself, and is a small seed. Inside
   the house: a figure and its own reflection face to face, then one welcoming the other back. The
   chinks: a figure in a shell of light with gaps in it; a door that opens only from inside; the
   key in an open hand; the shell closes whole. The armour of light: the figure shining in every
   direction ("light is you"), a dome of light rising over the stage. The four steps: four lamps
   on the ground before the stage kindle one after another (an eye: recognise; a heart: send love;
   hands together: give thanks; a broken chain: forgive). The deeper move: the world darkens, a lamp
   held up in it, its circle of light widening. What it cannot do: dark motes blow past the figure
   and through the stage and the figure stays. The blue beads: a ring of blue beads round an eye,
   turning. Steady the heart: a heart; walk on: a figure walking. A laugh is a kind of light: a
   burst of sparks. The benediction: notice, bless, release (a bird let go), and keep shining: a
   sun, the ground lit gold round the seat. Beats at their words (paragraphs at 0, 22.9, 43.8,
   63.2, 72.3, 93.0, 106.4, 114.0, 137.1, 156.5 s). */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { T } from "../gpu/tsl";
import { FORM_H, heart, lantern, point, rng, storm, sun } from "../world/forms";
import { bird, brokenChain, doorway, eye, key, prayerHands } from "../world/symbols";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { cloud, enactedLesson, env, lessonDark, type Stage, type StageCtx } from "./enacted";
import { GOLD, PALE, PEARL, ROSE, type Key, type Maker } from "./visionStage";
import { beads, greatVision, mirror, radiant, shell, welcome } from "./standalone/kit";
import { combine } from "../world/forms";

const { float, fract, mix, pow, sin, smoothstep, uniform, vec3, vec4 } = T;

const SCALE = 3;
const STORM: [number, number, number] = [0.5, 0.5, 0.62];
const SHADOW: [number, number, number] = [0.62, 0.5, 0.72];
const BLUE: [number, number, number] = [0.42, 0.62, 1.0];

const FORMS: Record<string, Maker> = {
  storm: (n, R) => storm(n, R, 0),
  spent: (n, R) => storm(n, R, 1),
  small: (n, R) => point(n, R, FORM_H * 0.3),
  mirror: (n, R, b) => b && mirror(n, R, b),
  welcome: (n, R, b) => b && welcome(n, R, b),
  chinks: (n, R, b) => b && shell(n, R, b, 0),
  door: (n, R) => doorway(n, R, 1),
  key: (n, R) => key(n, R),
  whole: (n, R, b) => b && shell(n, R, b, 1),
  armour: (n, R, b) => b && radiant(n, R, b, "Idle_Loop", 0.8, 0.4),
  eye: (n, R) => eye(n, R, 1),
  heart: (n, R) => heart(n, R, 1.5, FORM_H * 0.5),
  thanks: (n, R) => prayerHands(n, R),
  forgive: (n, R) => brokenChain(n, R),
  lamp: (n, R) => lantern(n, R),
  stays: (n, R, b) => b && b.figure(n, R, "Idle_Loop", 1.1, [], FORM_H * 0.86),
  beads: (n, R) => combine(n, [[(m) => beads(m, R), 0.55], [(m) => eye(m, R, 1), 0.45]]),
  steady: (n, R) => heart(n, R, 1.3, FORM_H * 0.5),
  walk: (n, R, b) => b && b.figure(n, R, "Walk_Loop", 0.4, [], FORM_H * 0.86),
  laugh: (n, R) => sun(n, R, FORM_H * 0.5),
  release: (n, R) => bird(n, R, FORM_H * 0.62, 0.3),
  shining: (n, R, b) => b && radiant(n, R, b, "Spell_Simple_Idle_Loop", 1.6, 0.45),
};

const KEYS: Key[] = [
  { t: 0, form: "storm", tint: STORM, dur: 5 },
  { t: 9, form: "spent", tint: STORM, dur: 5 },
  { t: 16, form: "small", tint: GOLD, dur: 4 },
  { t: 24, form: "mirror", tint: SHADOW, dur: 5 },
  { t: 33, form: "welcome", tint: ROSE, dur: 5 },
  { t: 45, form: "chinks", tint: PALE, dur: 5 },
  { t: 53, form: "door", tint: GOLD, dur: 4 },
  { t: 56.5, form: "key", tint: GOLD, dur: 3 },
  { t: 59.5, form: "whole", tint: PEARL, dur: 3.5 },
  { t: 66, form: "armour", tint: PEARL, dur: 5 },
  { t: 77, form: "eye", tint: PALE, dur: 3 },
  { t: 80.5, form: "heart", tint: ROSE, dur: 3 },
  { t: 84.5, form: "thanks", tint: GOLD, dur: 3 },
  { t: 89.5, form: "forgive", tint: PEARL, dur: 3 },
  { t: 98, form: "lamp", tint: GOLD, dur: 4 },
  { t: 107, form: "stays", tint: PEARL, dur: 4 },
  { t: 115, form: "beads", tint: BLUE, dur: 5, axis: "z", spin: 0.15 },
  { t: 131, form: "steady", tint: ROSE, dur: 3 },
  { t: 133.5, form: "walk", tint: GOLD, dur: 3 },
  { t: 149, form: "laugh", tint: GOLD, dur: 2.5, spin: 0.2 },
  { t: 164, form: "release", tint: PEARL, dur: 3 },
  { t: 168, form: "shining", tint: GOLD, dur: 4 },
];

function stage(ctx: StageCtx): Stage {
  const g = new THREE.Group();
  const t = ctx.clock, gy = ctx.ground;
  const R = rng(2203);
  const ours: { dispose(): void }[] = [];
  const u = {
    on: uniform(0),
    dome: uniform(0), // the armour of light
    gust: uniform(0), // the dark blowing past
    laugh: uniform(0),
    gold: uniform(0), // the ground lit gold at the end
    lampR: uniform(0), // the lamp's circle in the dark room
  };
  const footY = Math.max(0, gy(0, 0));
  const vs = greatVision(FORMS, KEYS, 2203, SCALE, footY);
  g.add(vs.group);
  const CY = footY + FORM_H * 0.45 * SCALE;

  /* ------------- the armour of light: a dome rising over the stage ------------- */
  {
    const n = 5000;
    const D = cloud(n, 0.12, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, e = Math.asin(R());
      D.a.aK.set([Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a), R()], i * 4);
    }
    D.dirty();
    const K = D.c.nodes.aK;
    const r = float(8.5).mul(u.dome.mul(0.3).add(0.7));
    // drawn from the ground up as it rises
    const shown = smoothstep(K.y.sub(0.08), K.y, u.dome.mul(1.1));
    D.m.positionNode = vec3(K.x.mul(r), float(footY).add(K.y.mul(r).mul(1.25)), K.z.mul(r));
    const wave = pow(sin(K.y.mul(9).sub(t.mul(1.2))).mul(0.5).add(0.5), 3);
    D.m.colorNode = vec4(vec3(1, 0.93, 0.8).mul(D.round).mul(shown).mul(wave.mul(0.6).add(0.25)).mul(u.on).mul(0.55), 1);
    g.add(D.c.sprite);
    ours.push(D.m);
  }

  /* ------------- the four steps: four lamps on the ground, kindled in turn ------------- */
  const lamps: { mat: THREE.MeshStandardNodeMaterial; glow: { value: number } }[] = [];
  const lampGlow = [uniform(0), uniform(0), uniform(0), uniform(0)];
  {
    const bowlG = new THREE.CylinderGeometry(0.42, 0.26, 0.28, 18, 1, true);
    const baseG = new THREE.CylinderGeometry(0.3, 0.36, 0.5, 14);
    ours.push(bowlG, baseG);
    for (let k = 0; k < 4; k++) {
      const x = -4.5 + k * 3, z = 6.2 - Math.abs(k - 1.5) * 0.6;
      const y = gy(x, z);
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0.4, side: THREE.DoubleSide });
      m.colorNode = vec3(0.32, 0.24, 0.15);
      m.emissiveNode = vec3(1, 0.7, 0.4).mul(lampGlow[k].mul(0.05));
      ours.push(m);
      const base = new THREE.Mesh(baseG, m);
      base.position.set(x, y + 0.25, z);
      const bowl = new THREE.Mesh(bowlG, m);
      bowl.position.set(x, y + 0.64, z);
      g.add(base, bowl);
      // the flame, a small soft light in the bowl
      const F = cloud(1, 0.9, { aK: 4 });
      F.dirty();
      F.m.colorNode = vec4(vec3(1, 0.8, 0.5).mul(F.round).mul(lampGlow[k]).mul(sin(t.mul(9).add(k * 3)).mul(0.08).add(0.92)).mul(u.on), 1);
      F.c.sprite.position.set(x, y + 0.98, z);
      g.add(F.c.sprite);
      ours.push(F.m);
      lamps.push({ mat: m, glow: lampGlow[k] });
    }
  }

  /* ------------- the dark blowing past, and the lamp's circle on the ground ------------- */
  {
    const n = 2600;
    const G = cloud(n, 0.2, { aK: 4 });
    for (let i = 0; i < n; i++) G.a.aK.set([R(), R(), R(), R()], i * 4);
    G.dirty();
    const K = G.c.nodes.aK;
    const f = fract(K.x.add(t.mul(float(0.08).add(K.y.mul(0.06)))));
    // across the stage from left to right, parting round the figure at its heart
    const x = f.mul(56).sub(28);
    const z0 = K.z.sub(0.5).mul(22);
    const part = smoothstep(4, 0, T.abs(x)).mul(T.sign(z0).mul(3.2));
    G.m.positionNode = vec3(x, float(footY + 0.5).add(K.w.mul(11)).add(sin(f.mul(12).add(K.y.mul(9))).mul(0.6)), z0.add(part));
    // the dark: a dim violet-grey, never a blackness that reads as a hole
    G.m.colorNode = vec4(vec3(0.3, 0.26, 0.4).mul(G.round).mul(sin(f.mul(Math.PI))).mul(u.gust).mul(u.on).mul(0.7), 1);
    g.add(G.c.sprite);
    ours.push(G.m);
  }
  {
    const n = 4000;
    const L = cloud(n, 0.14, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(R()) * 22, a = R() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r + 4;
      L.a.position.set([x, gy(x, z) + 0.07, z], i * 3);
      L.a.aK.set([Math.hypot(x, z - 4), R(), 0, 0], i * 4);
    }
    L.dirty();
    const K = L.c.nodes.aK;
    // the lamp's circle widening, then (at the end) the ground lit gold all round
    const inLamp = smoothstep(u.lampR, u.lampR.sub(3), K.x);
    const lit = mix(inLamp, float(1), u.gold);
    L.m.colorNode = vec4(vec3(1, 0.82, 0.52).mul(L.round).mul(lit).mul(sin(t.mul(0.8).add(K.y.mul(40))).mul(0.2).add(0.8)).mul(u.on).mul(0.55), 1);
    g.add(L.c.sprite);
    ours.push(L.m);
  }

  /* ------------- a laugh is a kind of light: a burst of sparks ------------- */
  {
    const n = 1800;
    const S = cloud(n, 0.12, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
      S.a.aK.set([v.x, v.y, v.z, R()], i * 4);
    }
    S.dirty();
    const K = S.c.nodes.aK;
    const r = u.laugh.mul(float(6).add(K.w.mul(10)));
    S.m.positionNode = vec3(K.x.mul(r), float(CY).add(K.y.mul(r)).sub(u.laugh.mul(u.laugh).mul(2)), K.z.mul(r));
    const fade = smoothstep(0, 0.1, u.laugh).mul(smoothstep(1, 0.6, u.laugh));
    S.m.colorNode = vec4(mix(vec3(1, 0.85, 0.5), vec3(1, 0.7, 0.85), K.w).mul(S.round).mul(fade).mul(sin(t.mul(14).add(K.w.mul(60))).mul(0.3).add(0.7)).mul(u.on).mul(1.1), 1);
    g.add(S.c.sprite);
    ours.push(S.m);
  }

  return {
    group: g,
    update(dt, tt, on) {
      u.on.value = 0.35 + 0.65 * on;
      const T0 = tt;
      vs.update(dt, T0, T0 > 0, true, false);
      u.dome.value = env(T0, [[0, 0], [64, 0], [70, 1], [76, 1], [79, 0.25], [100, 0.25], [104, 0], [107, 0], [110, 0.6], [113, 0.6], [117, 0], [164, 0], [172, 0.8]]);
      const steps = [77, 80.5, 84.5, 89.5];
      steps.forEach((s, k) => (lampGlow[k].value = env(T0, [[0, 0], [s, 0], [s + 1.5, 1], [150, 1], [160, 1]])));
      u.lampR.value = env(T0, [[0, 0], [97, 0], [100, 3], [104, 9], [108, 20], [113, 0]]);
      u.gust.value = env(T0, [[0, 0], [106, 0], [108, 1], [113, 1], [115, 0]]);
      u.laugh.value = env(T0, [[0, 0], [149, 0], [154, 1]]) * (T0 < 156 ? 1 : 0);
      u.gold.value = env(T0, [[0, 0], [168, 0], [174, 1]]);
      // the lamp in a dark room: the room is dark
      if (T0 > 0) lessonDark.k = Math.max(lessonDark.k, env(T0, [[0, 0.25], [93, 0.25], [97, 0.8], [106, 0.8], [110, 0.25], [168, 0.25], [174, 0]]) * on);
    },
    dispose() {
      vs.dispose();
      for (const o of ours) o.dispose();
    },
  };
}

export function createGreetingsScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return enactedLesson(scene, narration, whisper, { id: "greetings", trackId: "audio/standalone/psychic_greetings.mp3", site: SITES.greetings, reach: 12, centreY: 7.5, make: stage });
}
