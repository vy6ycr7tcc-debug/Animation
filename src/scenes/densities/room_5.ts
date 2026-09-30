/* The fifth density: wisdom. "The native of fifth density seeks solitude… this part of the journey
   of the seeker must needs be a solitary one." A vast dark hall with no walls, a floor of dark
   polished stone, and at its centre one small seated figure of light, alone: the seeker. Round it
   stand twelve towering columns of pure white-blue light, reaching up out of sight. Nothing else
   moves but the light's slow breath and fine motes rising from the seeker like released thoughts.

   As the narration goes, the columns begin, very slowly, to turn about the seeker and to lean
   inward, until their heads meet far overhead, where their light gathers into a single geometric
   mandala: the grasp of the unity of all things, made visible above the one who seeks it. Cold,
   clear and silent: whites, pale blues, silver. Wisdom is quiet.

   The owner's direction (2026-09-30) replaces the earlier room; its interface is kept, and it now
   names its recording itself (`audio/densities/density_5.mp3`, a draft). */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, Beat } from "../lessonKit";
import type { Narration } from "../../core/narration";
import { T, vnoise } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { landStone } from "../../world/stoneworks";
import { GlassFolk } from "../glassFolk";
import { applyAir, damp, keepAlpha, pointCloud, roomClock, seeded, skyDome, touch, type Air } from "./roomKit";

const { abs, exp, float, fract, hash, mix, normalize, pow, sin, smoothstep, uniform, vec3, vec4 } = T;

/** Room frame: you begin at the origin facing −z; the seeker sits at the hall's heart. */
export const SEEKER = new THREE.Vector3(0, 0, -14);
const COLS = 12, COL_R = 9, COL_H = 46;
/** Where the way on stands, beyond the seeker. */
export const WISDOM_DOOR = new THREE.Vector3(0, 0, -32);

export function createDensity5Scene(scene: THREE.Scene, narration: Narration, whisper: (text: string, ms?: number) => void): LessonScene {
  const seatPos = new THREE.Vector3(0, 0, 0);
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const t = clock.u;
  const uConverge = uniform(0); // the columns leaning in till their heads meet
  const uMandala = uniform(0);
  const uThought = uniform(0.4); // the motes rising from the seeker
  const uDoor = uniform(0.2);
  let spin = 0, spinRate = 0.004;
  const goal = { converge: 0, mandala: 0, thought: 0.4, door: 0.2, spin: 0.004 };
  const air: Air = {
    color: new THREE.Color(0.012, 0.016, 0.03),
    glow: new THREE.Color(0.05, 0.07, 0.12),
    glowDir: new THREE.Vector3(0, 1, 0),
    density: 0.006,
    shadow: new THREE.Color(0.0, 0.004, 0.014),
    sat: 0.85,
    contrast: 1.08,
  };
  const R = seeded(505);
  const folk = new GlassFolk([{ x: SEEKER.x, z: SEEKER.z, face: 0, act: "sit", tint: new THREE.Color(0.78, 0.88, 1), glow: { inner: 0.22, edge: 0.75, body: 0.28 }, scale: 0.95 }], 5);

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    // the dark above, a few far stars
    {
      const sky = skyDome(700, new THREE.Color(0.01, 0.013, 0.025), new THREE.Color(0.002, 0.003, 0.008), {
        extra: (d, c) => {
          const cell = T.floor(d.mul(260));
          const st = smoothstep(0.9975, 1, hash(cell.x.add(cell.y.mul(57)).add(cell.z.mul(131)))).mul(smoothstep(0.1, 0.4, d.y)).mul(0.6);
          return c.add(vec3(0.8, 0.86, 1).mul(st));
        },
      });
      g.add(sky.mesh);
      ours.push(sky);
    }
    // the floor: dark polished stone, flagstones, the columns' light lying on it
    {
      const geo = new THREE.CircleGeometry(80, 96);
      geo.rotateX(-Math.PI / 2);
      geo.translate(SEEKER.x, 0, SEEKER.z);
      const m = landStone("red_sandstone_pavement", 0, 3, [0.16, 0.18, 0.24], { flag: 1.4 });
      m.roughnessNode = float(0.6);
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo, m);
      // a silver ring inlaid round the seeker
      const pairs: number[] = [];
      for (const r of [2.2, 2.4]) {
        const n = 96;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          pairs.push(SEEKER.x + Math.sin(a0) * r, 0.03, SEEKER.z + Math.cos(a0) * r, SEEKER.x + Math.sin(a1) * r, 0.03, SEEKER.z + Math.cos(a1) * r);
        }
      }
      const rg = ribbonGeometry(pairs), rm = ribbonMaterial(vec3(0.7, 0.8, 1).mul(0.35), 0.6);
      g.add(new THREE.Mesh(rg, rm));
      ours.push(rg, rm);
    }
    // the twelve columns: soft volumes of white-blue light, turning, leaning in till they meet
    const colGroup = new THREE.Group();
    colGroup.position.copy(SEEKER);
    g.add(colGroup);
    const columns: THREE.Mesh[] = [];
    {
      const geo = new THREE.CylinderGeometry(0.28, 0.36, COL_H, 20, 1, true);
      geo.translate(0, COL_H / 2, 0);
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      const y = T.positionGeometry.y.div(COL_H);
      const ndv = abs(T.dot(normalize(T.normalWorld), normalize(T.cameraPosition.sub(T.positionWorld))));
      const core = pow(ndv, 7).mul(0.95).add(pow(ndv, 2).mul(0.08));
      const flow = vnoise(T.vec2(T.uv().x.mul(10), y.mul(24).sub(t.mul(0.25)))).mul(0.45).add(0.75);
      const breath = sin(t.mul(0.35).sub(y.mul(4))).mul(0.12).add(0.88);
      const col = mix(vec3(0.55, 0.72, 1), vec3(0.85, 0.92, 1), y);
      m.colorNode = vec4(col.mul(core).mul(flow).mul(smoothstep(0, 0.04, y)).mul(smoothstep(1, 0.75, y)).mul(breath).mul(0.45), 1);
      for (let i = 0; i < COLS; i++) {
        const c = new THREE.Mesh(geo, m);
        colGroup.add(c);
        columns.push(c);
      }
      ours.push(geo, m);
      // where each column meets the floor, its light lies in a soft pool
      const pm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const r = T.length(T.uv().sub(0.5)).mul(2);
      pm.colorNode = vec4(vec3(0.7, 0.8, 1).mul(exp(r.mul(r).mul(-4))).mul(smoothstep(1, 0.7, r)).mul(0.2), 1);
      const pg = new THREE.PlaneGeometry(4, 4);
      pg.rotateX(-Math.PI / 2);
      for (let i = 0; i < COLS; i++) {
        const a = (i / COLS) * Math.PI * 2;
        const p = new THREE.Mesh(pg, pm);
        p.position.set(Math.sin(a) * COL_R, 0.04, Math.cos(a) * COL_R);
        colGroup.add(p);
      }
      ours.push(pm, pg);
    }
    // the mandala, where their heads meet: fine rings and a twelve-petalled figure of light
    const mandala = new THREE.Group();
    mandala.position.set(SEEKER.x, 34, SEEKER.z);
    g.add(mandala);
    {
      const pairs: number[] = [];
      const ring = (r: number, n = 128) => {
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          pairs.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r);
        }
      };
      for (const r of [1.2, 3.2, 5.6, 7.4]) ring(r);
      // twelve petals: arcs from the inner ring out to the outer, each the next one's mirror
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        for (const side of [-1, 1]) {
          let prev: THREE.Vector3 | null = null;
          for (let s = 0; s <= 24; s++) {
            const f = s / 24, rr = 1.2 + f * 6.2, aa = a + side * Math.sin(f * Math.PI) * 0.26;
            const p = new THREE.Vector3(Math.cos(aa) * rr, 0, Math.sin(aa) * rr);
            if (prev) pairs.push(...prev.toArray(), ...p.toArray());
            prev = p;
          }
        }
      }
      // a star of two interlaced hexagons at the heart
      for (const off of [0, Math.PI / 6]) {
        for (let k = 0; k < 6; k++) {
          const a0 = off + (k / 6) * Math.PI * 2, a1 = off + ((k + 2) / 6) * Math.PI * 2;
          pairs.push(Math.cos(a0) * 3.2, 0, Math.sin(a0) * 3.2, Math.cos(a1) * 3.2, 0, Math.sin(a1) * 3.2);
        }
      }
      const geo = ribbonGeometry(pairs);
      const m = ribbonMaterial(vec3(0.85, 0.92, 1).mul(uMandala), 0.9);
      mandala.add(new THREE.Mesh(geo, m));
      ours.push(geo, m);
      // its heart, a single cold point of light
      const s = pointCloud(1, 1.6);
      s.pos.set([0, 0, 0]);
      touch(s.cloud);
      s.material.colorNode = vec4(vec3(0.9, 0.95, 1).mul(s.round).mul(uMandala).mul(0.9), 1);
      mandala.add(s.cloud.sprite);
      ours.push(s.material);
    }
    // thoughts released: fine motes rising slowly from the seeker, far up into the dark
    {
      const n = 700;
      const s = pointCloud(n, 0.06);
      for (let i = 0; i < n; i++) {
        s.pos.set([0, 0, 0], i * 3);
        s.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      const life = fract(K.x.add(t.mul(float(0.006).add(K.y.mul(0.008)))));
      const a = K.z.mul(6.283).add(life.mul(2));
      const r = float(0.2).add(K.w.mul(1.2)).add(life.mul(2.5));
      s.material.positionNode = vec3(T.cos(a).mul(r), float(1.1).add(life.mul(32)), T.sin(a).mul(r));
      s.material.colorNode = vec4(vec3(0.85, 0.92, 1).mul(s.round).mul(smoothstep(0, 0.05, life)).mul(float(1).sub(life)).mul(uThought).mul(0.8), 1);
      s.cloud.sprite.position.copy(SEEKER);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    // the way on: a tall narrow opening of silver light beyond the seeker
    {
      const dg = new THREE.PlaneGeometry(2.4, 6);
      dg.translate(WISDOM_DOOR.x, 3, WISDOM_DOOR.z);
      const dm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      const u = T.uv();
      const inside = smoothstep(0, 0.1, u.x).mul(smoothstep(1, 0.9, u.x)).mul(smoothstep(0, 0.04, u.y)).mul(smoothstep(1, 0.96, u.y));
      dm.colorNode = vec4(vec3(0.85, 0.9, 1).mul(inside).mul(uDoor), 1);
      g.add(new THREE.Mesh(dg, dm));
      ours.push(dg, dm);
    }
    // one cold light from high above, so the seeker and the floor read
    const key = new THREE.SpotLight(0xdfe8ff, 28, 60, 0.3, 0.8, 1.2);
    key.position.set(SEEKER.x, 30, SEEKER.z + 4);
    key.target.position.copy(SEEKER);
    key.castShadow = true;
    g.add(key, key.target);
    g.add(folk.group);

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock.tick(d);
      applyAir(air);
      uConverge.value = damp(uConverge.value, goal.converge, 0.03, d);
      uMandala.value = damp(uMandala.value, goal.mandala, 0.06, d);
      uThought.value = damp(uThought.value, goal.thought, 0.2, d);
      uDoor.value = damp(uDoor.value, goal.door, 0.2, d);
      spinRate = damp(spinRate, goal.spin, 0.1, d);
      spin += d * spinRate;
      // the columns turn about the seeker and lean in until their heads meet over it
      const lean = Math.atan2(COL_R, 34) * uConverge.value;
      columns.forEach((c, i) => {
        const a = (i / COLS) * Math.PI * 2 + spin;
        c.position.set(Math.sin(a) * COL_R, 0, Math.cos(a) * COL_R);
        c.rotation.set(0, 0, 0);
        c.rotateY(a);
        c.rotateX(-lean);
        c.scale.y = 1 - 0.18 * uConverge.value;
      });
      mandala.rotation.y = -spin * 0.5;
      folk.update(d);
    });
  };

  const beats: Beat[] = [
    // "the native of the fifth density seeks solitude"
    { t: 74, apply: () => ((goal.thought = 0.8), (goal.spin = 0.012)) },
    // "light is not just illumination. It is the primary substance"
    { t: 112, apply: () => (goal.converge = 0.45) },
    // "The lesson of wisdom is discernment"
    { t: 158, apply: () => (goal.converge = 0.8) },
    // "It is love, being tempered"
    { t: 240, apply: () => ((goal.converge = 1), (goal.mandala = 1)) },
    // "understand what the magician is doing"
    { t: 276, apply: () => ((goal.door = 1), (goal.thought = 0.5)) },
  ];

  const lesson = new LessonScene(scene, narration, whisper, {
    id: "density-5",
    trackId: "audio/densities/density_5.mp3",
    seatPos,
    seatHeading: Math.PI,
    build,
    beats,
  });
  const baseUpdate = lesson.update.bind(lesson);
  lesson.update = (dt: number) => {
    baseUpdate(dt);
    for (const tick of tickers) tick(dt);
  };
  const baseDispose = lesson.dispose.bind(lesson);
  lesson.dispose = () => {
    folk.dispose();
    for (let i = 0; i < ours.length; i++) ours[i].dispose();
    ours.length = 0;
    tickers.length = 0;
    baseDispose();
  };
  return Object.assign(lesson, { loaded: folk.loaded });
}
