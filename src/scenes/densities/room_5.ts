/* The fifth density: wisdom. The narration is about the solitary seeker ("this part of the
   journey of the seeker must needs be a solitary one"), and the owner's image for the room is the
   connections between people becoming a world: a dark plaza of polished stone where people of cold
   holographic light walk their slow circles, each joined to the others by luminous threads, and
   the threads rise and weave, turn by turn, into a planet of light turning slowly above them. The
   social memory complex made visible, and the seeker's contemplation: one small seated figure set
   apart at the plaza's edge, facing it, fine motes rising from it like released thoughts.

   The warning ("wisdom without love can become a trap"): the threads dim, the planet falters and
   slows; "it is love, being tempered": it rekindles, brighter than before. Cold whites, pale blues,
   silver. The way on: a narrow silver opening beyond the plaza.

   The owner's direction (2026-09-30, "the thread-planet") replaces the columns and the mandala;
   the interface and the recording (`audio/densities/density_5.mp3`, a draft) are kept. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, Beat } from "../lessonKit";
import type { Narration } from "../../core/narration";
import { T, vnoise } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { landStone } from "../../world/stoneworks";
import { GlassFolk } from "../glassFolk";
import { applyAir, damp, keepAlpha, pointCloud, roomClock, seeded, skyDome, strands, touch, type Air } from "./roomKit";

const { float, fract, hash, mix, pow, sin, smoothstep, uniform, vec3, vec4 } = T;

/** Room frame: you begin at the origin facing −z; the seeker sits at the hall's heart. */
export const SEEKER = new THREE.Vector3(0, 0, -12);
/** The plaza's heart, where the people walk, and the planet of light turning over it. */
const PLAZA = new THREE.Vector3(0, 0, -31);
const PLANET = new THREE.Vector3(0, 16, -31), PLANET_R = 10;
const RINGS = 40, RING_SEGS = 96;
/** Where the way on stands, beyond the plaza. */
export const WISDOM_DOOR = new THREE.Vector3(0, 0, -60);

export function createDensity5Scene(scene: THREE.Scene, narration: Narration, whisper: (text: string, ms?: number) => void): LessonScene {
  const seatPos = new THREE.Vector3(0, 0, 0);
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const t = clock.u;
  const uPeople = uniform(0.5); // the walkers' threads to each other
  const uWeave = uniform(0); // how much of the planet the threads have woven
  const uLove = uniform(1); // dims at the warning, rekindles after
  const uThought = uniform(0.4); // the motes rising from the seeker
  const uDoor = uniform(0.2);
  let spin = 0, spinRate = 0.05, time = 0;
  const goal = { people: 0.5, weave: 0, love: 1, thought: 0.4, door: 0.2, spin: 0.05 };
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
  // the seeker, set apart at the plaza's edge, facing it (lowered: the clip sits on a chair)
  const folk = new GlassFolk([{ x: SEEKER.x, y: -0.42, z: SEEKER.z, face: Math.PI, act: "sit", tint: new THREE.Color(0.78, 0.88, 1), glow: { inner: 0.22, edge: 0.75, body: 0.28 }, scale: 0.95 }], 5);
  // the people of the plaza, walking their slow circles round its heart
  const WALK = Array.from({ length: 10 }, (_, i) => ({ r: 5.5 + (i % 5) * 2.2 + R() * 0.8, a: R() * Math.PI * 2, dir: i % 2 ? 1 : -1, v: 0.7 + R() * 0.25 }));
  const walkers = new GlassFolk(WALK.map((w, i) => ({ x: PLAZA.x + Math.cos(w.a) * w.r, z: PLAZA.z + Math.sin(w.a) * w.r, face: 0, act: "walk" as const, tint: new THREE.Color().setHSL(0.55 + (i % 4) * 0.025, 0.35, 0.8), glow: { inner: 0.2, edge: 0.85, body: 0.3 } })), 55);
  const hearts = WALK.map(() => new THREE.Vector3());

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
      const geo = new THREE.CircleGeometry(90, 96);
      geo.rotateX(-Math.PI / 2);
      geo.translate(PLAZA.x, 0, PLAZA.z);
      const m = landStone("red_sandstone_pavement", 0, 3, [0.028, 0.032, 0.045], { flag: 1.4 });
      m.roughnessNode = float(0.42);
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
    // the threads between the people: each to each, heart to heart, following them as they walk
    const pairs: { a: THREE.Vector3; b: THREE.Vector3; lift: number }[] = [];
    for (let i = 0; i < hearts.length; i++) for (let j = i + 1; j < hearts.length; j++) pairs.push({ a: hearts[i], b: hearts[j], lift: 0.4 });
    const between = strands(pairs, (U, K) => {
      const p = pow(fract(U.sub(t.mul(0.12)).add(K.mul(6.1))), 14).mul(1.4);
      const ends = smoothstep(0, 0.08, U).mul(smoothstep(1, 0.92, U));
      return vec3(0.7, 0.85, 1).mul(float(0.14).add(p)).mul(ends).mul(uPeople).mul(uLove).mul(0.5);
    }, 1.0);
    g.add(between.mesh);
    ours.push(between);
    // and from each, a thread rising into the planet, where it is woven in
    const anchors = hearts.map((_, i) => {
      const a = (i / hearts.length) * Math.PI * 2;
      return new THREE.Vector3(PLANET.x + Math.cos(a) * PLANET_R * 0.55, PLANET.y - PLANET_R * 0.83, PLANET.z + Math.sin(a) * PLANET_R * 0.55);
    });
    const rising = strands(hearts.map((h, i) => ({ a: h, b: anchors[i], lift: 1.6 })), (U, K) => {
      // light climbs from the people into the planet
      const p = pow(fract(U.sub(t.mul(0.18)).add(K.mul(3.3))), 10).mul(1.5);
      return vec3(0.75, 0.88, 1).mul(float(0.12).add(p)).mul(smoothstep(0, 0.05, U)).mul(uWeave.min(1)).mul(uLove).mul(0.6);
    }, 1.1);
    g.add(rising.mesh);
    ours.push(rising);
    // the planet: great circles of thread wound one after another into a sphere, turning slowly
    const planet = new THREE.Group();
    planet.position.copy(PLANET);
    g.add(planet);
    {
      const pairs: number[] = [];
      const ringK: number[] = [], alongU: number[] = [];
      const q = new THREE.Quaternion(), ax = new THREE.Vector3(), v0 = new THREE.Vector3(), v1 = new THREE.Vector3();
      for (let k = 0; k < RINGS; k++) {
        // orientations spread evenly over the sphere (a golden spiral of axes), so it closes into a world
        const y = 1 - (2 * (k + 0.5)) / RINGS, rr = Math.sqrt(1 - y * y), phi = k * 2.39996;
        ax.set(Math.cos(phi) * rr, y, Math.sin(phi) * rr);
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax);
        const r = PLANET_R * (0.985 + ((k * 37) % 7) * 0.004);
        for (let i = 0; i < RING_SEGS; i++) {
          const a0 = (i / RING_SEGS) * Math.PI * 2, a1 = ((i + 1) / RING_SEGS) * Math.PI * 2;
          v0.set(Math.cos(a0) * r, 0, Math.sin(a0) * r).applyQuaternion(q);
          v1.set(Math.cos(a1) * r, 0, Math.sin(a1) * r).applyQuaternion(q);
          pairs.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
          for (let c = 0; c < 4; c++) (ringK.push(k / RINGS), alongU.push((i + (c >= 2 ? 1 : 0)) / RING_SEGS));
        }
      }
      const geo = ribbonGeometry(pairs);
      geo.setAttribute("aRing", new THREE.BufferAttribute(new Float32Array(ringK), 1));
      geo.setAttribute("aAlong", new THREE.BufferAttribute(new Float32Array(alongU), 1));
      const K = T.attribute("aRing", "float"), U = T.attribute("aAlong", "float");
      // each circle is drawn round in turn as the weave grows; a pulse runs round it
      const drawn = smoothstep(0, 0.02, uWeave.mul(1.5).sub(K).sub(U.mul(0.35)));
      const pulse = pow(fract(U.sub(t.mul(0.07)).add(K.mul(5.7))), 18).mul(1.6);
      // at the warning the light falters: it gutters along the threads, unevenly
      const gutter = mix(vnoise(T.vec2(U.mul(30).add(K.mul(90)), t.mul(1.7))).mul(0.9).add(0.1), float(1), uLove.min(1));
      const col = mix(vec3(0.62, 0.78, 1), vec3(0.92, 0.96, 1), K);
      const m = keepAlpha(ribbonMaterial(col.mul(float(0.3).add(pulse)).mul(drawn).mul(gutter).mul(uLove).mul(0.55), 1.0));
      planet.add(new THREE.Mesh(geo, m));
      ours.push(geo, m);
      // a soft light within, and fine dust over its surface
      const core = pointCloud(1, PLANET_R * 1.5);
      core.pos.set([0, 0, 0]);
      touch(core.cloud);
      core.material.colorNode = vec4(vec3(0.5, 0.65, 1).mul(core.round).mul(uWeave.min(1)).mul(uLove).mul(0.14), 1);
      planet.add(core.cloud.sprite);
      ours.push(core.material);
      const n = 2600;
      const dust = pointCloud(n, 0.12);
      for (let i = 0; i < n; i++) {
        const y = R() * 2 - 1, a = R() * Math.PI * 2, rr = Math.sqrt(1 - y * y);
        dust.pos.set([Math.cos(a) * rr * PLANET_R, y * PLANET_R, Math.sin(a) * rr * PLANET_R], i * 3);
        dust.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(dust.cloud);
      const DK = dust.cloud.nodes.aK;
      const tw = sin(t.mul(float(0.8).add(DK.x)).add(DK.y.mul(40))).mul(0.4).add(0.6);
      dust.material.colorNode = vec4(vec3(0.85, 0.92, 1).mul(dust.round).mul(tw).mul(smoothstep(0, 0.02, uWeave.mul(1.2).sub(DK.z))).mul(uLove).mul(0.6), 1);
      planet.add(dust.cloud.sprite);
      ours.push(dust.material);
    }
    // a cold light over the plaza, as if from the planet, so the walkers and stone read
    const plazaLight = new THREE.PointLight(0xcfdcff, 200, 40, 2);
    plazaLight.position.set(PLANET.x, PLANET.y - PLANET_R - 1, PLANET.z);
    g.add(plazaLight);
    g.add(walkers.group);
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
      time += d;
      uPeople.value = damp(uPeople.value, goal.people, 0.2, d);
      uWeave.value = damp(uWeave.value, goal.weave, 0.05, d);
      uLove.value = damp(uLove.value, goal.love, goal.love < uLove.value ? 0.12 : 0.25, d);
      uThought.value = damp(uThought.value, goal.thought, 0.2, d);
      uDoor.value = damp(uDoor.value, goal.door, 0.2, d);
      // the planet turns; faltering, it slows and wavers
      spinRate = damp(spinRate, goal.spin * (0.3 + 0.7 * Math.min(1, uLove.value)), 0.3, d);
      spin += d * spinRate;
      planet.rotation.set(0.25 + Math.sin(time * 0.05) * 0.04 * (1.4 - Math.min(1, uLove.value)), spin, 0.1);
      plazaLight.intensity = 30 + 110 * Math.min(1, uWeave.value) * uLove.value;
      // the walkers go round, each at its own pace, and their hearts carry the threads
      WALK.forEach((w, i) => {
        const b = walkers.bodies[i];
        const a = w.a + (time * w.v * w.dir) / w.r;
        const x = PLAZA.x + Math.cos(a) * w.r, z = PLAZA.z + Math.sin(a) * w.r;
        hearts[i].set(x, 1.25, z);
        if (!b) return;
        b.root.position.set(x, 0, z);
        b.root.rotation.y = Math.atan2(-Math.sin(a) * w.dir, Math.cos(a) * w.dir);
      });
      walkers.update(d);
      between.write();
      rising.write();
      folk.update(d);
    });
  };

  const beats: Beat[] = [
    // "The soul arrives here carrying a full heart": the threads between the people wake
    { t: 28, apply: () => (goal.people = 1) },
    // "the native of the fifth density seeks solitude"
    { t: 70, apply: () => (goal.thought = 0.9) },
    // "light… the primary substance of reality": the threads rise and begin to weave
    { t: 104, apply: () => (goal.weave = 0.45) },
    // "The lesson of wisdom is discernment": the planet closes
    { t: 146, apply: () => (goal.weave = 1) },
    // "there is a warning… wisdom without love can become a trap": it dims and falters
    { t: 188, apply: () => Object.assign(goal, { love: 0.22, people: 0.5, spin: 0.02 }) },
    // "It is love, being tempered": it rekindles
    { t: 230, apply: () => Object.assign(goal, { love: 1.15, people: 1.1, spin: 0.06 }) },
    // "Their compassion has gained eyes": brightest; the way on opens
    { t: 254, apply: () => Object.assign(goal, { love: 1.35, door: 1, thought: 0.6 }) },
  ];

  const lesson = new LessonScene(scene, narration, whisper, {
    id: "density-5",
    trackId: "audio/densities/density_5.mp3",
    seatPos,
    seatHeading: Math.PI,
    build,
    authoredSecs: 300, // beats written against the script's length; they follow the recording
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
    walkers.dispose();
    for (let i = 0; i < ours.length; i++) ours[i].dispose();
    ours.length = 0;
    tickers.length = 0;
    baseDispose();
  };
  return Object.assign(lesson, { loaded: Promise.all([folk.loaded, walkers.loaded]).then(() => undefined) });
}
