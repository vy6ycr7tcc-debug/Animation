/* The ancient practices, the third chamber: the daily disciplines. Not a mountaintop: a plain room
   of whitewashed stone at the start of an ordinary morning (a Tuesday), a table, a stone sink with a
   jug, a window going from blue to gold, a figure of light at the sink. Beyond an open archway, a
   quiet courtyard with four alcoves and, along one side, a queue.

   Know yourself, accept yourself, become the Creator: three small clay lamps on the table light one
   after another. The slow brightening from the body up through the heart to the brow: seven small
   lights climb the figure at the sink. The practices everywhere: the alcoves light in turn, each
   with a figure at its practice: a desert hermit sitting with a lamp, breathing; a Sufi turning;
   a Roman at his journal by lamplight at day's end; a Daoist rising early with the season. And
   the advanced course: a line of figures waiting under a cold strip of light, the checkout queue.
   No device replaced the daily work: the earlier instruments (a crystal, a small pyramid, a card)
   hang over the table in thin light and fade. Fish in water: the floor ripples with light like
   water, the sacred as the weather of the day. At the end the morning comes in through the window. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, vnoise } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { landStone, stoneBlock } from "../../world/stoneworks";
import { GlassFolk, type FolkSpec } from "../glassFolk";
import { applyAir, damp, keepAlpha, merge, pointCloud, roomClock, touch, type Air, roomPos } from "../densities/roomKit";

const { abs, exp, length, mix, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;

/** Room frame: you start in the room at z −1.5 facing −z; the courtyard beyond; the door at z −31. */
export const DISC_DOOR = new THREE.Vector3(0, 0, -31);
const WARM = new THREE.Color(1, 0.88, 0.7);

export function createDisciplinesScene(scene: THREE.Scene, narration: LessonCtx["narration"], whisper: (t: string, ms?: number) => void): SceneModule {
  const seatPos = new THREE.Vector3(0, 0, -1.5);
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const t = clock.u;
  const uLamps = uniform(0); // the three movements, 0 … 3
  const uClimb = uniform(0); // the brightening up the body, 0 … 1
  const uAlcoves = uniform(0); // the practices, 0 … 4
  const uQueue = uniform(0);
  const uTools = uniform(0); // the earlier instruments over the table
  const uWater = uniform(0); // the sacred as water
  const uMorning = uniform(0.15);
  const goal = { lamps: 0, climb: 0, alcoves: 0, queue: 0, tools: 0, water: 0, morning: 0.15 };
  const air: Air = {
    color: new THREE.Color(0.07, 0.07, 0.09),
    glow: new THREE.Color(0.25, 0.2, 0.15),
    glowDir: new THREE.Vector3(-1, 0.3, 0),
    density: 0.004,
    shadow: new THREE.Color(0.01, 0.012, 0.03),
    sat: 1,
    contrast: 1.04,
  };
  // the figure at the sink, and the practitioners in the alcoves and the queue
  const alcove = (i: number) => new THREE.Vector3(i % 2 ? 7.2 : -7.2, 0, -16 - Math.floor(i / 2) * 7);
  const specs: FolkSpec[] = [
    { x: 2.6, z: -8.6, face: Math.PI / 2 + 0.2, act: "idle", tint: WARM },
    { x: alcove(0).x + 0.6, z: alcove(0).z, face: Math.PI / 2, act: "sit", tint: new THREE.Color(0.95, 0.8, 0.6) },
    { x: alcove(1).x - 0.8, z: alcove(1).z, face: -Math.PI / 2, act: "reach", tint: new THREE.Color(0.8, 0.9, 1) },
    { x: alcove(2).x + 0.6, z: alcove(2).z, face: Math.PI / 2, act: "sit", tint: new THREE.Color(1, 0.86, 0.7) },
    { x: alcove(3).x - 0.8, z: alcove(3).z, face: -Math.PI / 2, act: "reach", tint: new THREE.Color(0.8, 1, 0.85) },
  ];
  for (let k = 0; k < 4; k++) specs.push({ x: -3.2, z: -18 - k * 1.3, face: Math.PI, act: "idle", tint: new THREE.Color(0.85, 0.88, 0.95), scale: 0.97 + (k % 2) * 0.05 });
  const folk = new GlassFolk(specs, 29);

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    const stone: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const b = stoneBlock(w, h, d);
      b.translate(x, y, z);
      stone.push(b);
    };
    // the room: floor, three walls and a roof; a window on the left; an archway at the back
    box(11, 0.3, 12, 0, -0.15, -6);
    box(0.5, 4.2, 12, -5.25, 2.1, -6 + 0); // left wall (the window cut below)
    box(0.5, 4.2, 12, 5.25, 2.1, -6);
    box(11, 0.4, 12.5, 0, 4.4, -6.2);
    box(3.7, 4.2, 0.5, -3.65, 2.1, -12.2);
    box(3.7, 4.2, 0.5, 3.65, 2.1, -12.2);
    box(3.6, 1.1, 0.5, 0, 3.65, -12.2);
    // the courtyard: its floor, side walls with four alcoves, the far wall with the door
    box(18, 0.3, 20, 0, -0.15, -22.5);
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const z = -16 - k * 7;
        box(0.6, 4.6, 1.2, sx * 8.9, 2.3, z - 2.4);
        box(0.6, 4.6, 1.2, sx * 8.9, 2.3, z + 2.4);
        box(0.6, 1, 6, sx * 8.9, 4.1, z);
        box(0.4, 3.6, 3.8, sx * 9.9, 1.8, z); // the alcove's back
        box(2, 0.25, 4.4, sx * 9, 3.7, z); // its hood
      }
      box(0.6, 4.6, 4, sx * 8.9, 2.3, -30);
    }
    box(7, 4.6, 0.6, -5.5, 2.3, -32.6);
    box(7, 4.6, 0.6, 5.5, 2.3, -32.6);
    box(4, 1, 0.8, 0, 4.1, -32.6);
    // the table and the sink
    box(2.4, 0.12, 1.2, -1.6, 0.95, -6.5);
    for (const [x, z] of [[-2.6, -6], [-0.6, -6], [-2.6, -7], [-0.6, -7]]) box(0.1, 0.9, 0.1, x, 0.45, z);
    box(0.9, 0.9, 1.6, 3.9, 0.45, -8.6);
    const m = landStone("sandstone_blocks_08", 0, 2.2, [1.28, 1.22, 1.14], {});
    const mesh = new THREE.Mesh(merge(stone), m);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(m, mesh.geometry);
    // the window: morning light coming in (blue, then gold), a soft beam on the floor
    {
      const wg = new THREE.PlaneGeometry(1.6, 1.8);
      wg.rotateY(Math.PI / 2);
      wg.translate(-4.98, 2.3, -5);
      const wm = new THREE.MeshBasicNodeMaterial({ fog: false });
      wm.colorNode = vec4(mix(vec3(0.3, 0.42, 0.7), vec3(1.2, 0.95, 0.6), uMorning), 1);
      g.add(new THREE.Mesh(wg, wm));
      ours.push(wg, wm);
      const light = new THREE.SpotLight(0xffe0b0, 0, 18, 0.6, 0.6, 1.2);
      light.position.set(-7, 4.2, -5);
      light.target.position.set(1, 0, -6.5);
      light.castShadow = true;
      g.add(light, light.target);
      const fill = new THREE.PointLight(0xffd9b0, 0, 16, 1.4);
      fill.position.set(0, 3.4, -6);
      g.add(fill);
      const court = new THREE.PointLight(0xc8d4ff, 20, 30, 1.2);
      court.position.set(0, 5, -22);
      g.add(court);
      tickers.push(() => {
        light.intensity = 30 + 220 * uMorning.value;
        light.color.setRGB(0.6, 0.72, 1).lerp(new THREE.Color(1, 0.85, 0.6), uMorning.value);
        fill.intensity = 8 + 10 * uLamps.value / 3 + 18 * uMorning.value;
      });
    }
    // the three clay lamps on the table
    {
      const L = pointCloud(3, 0.28);
      for (let i = 0; i < 3; i++) {
        L.pos.set([-2.3 + i * 0.7, 1.12, -6.5], i * 3);
        L.k.set([i, 0, 0, 0], i * 4);
      }
      touch(L.cloud);
      const K = L.cloud.nodes.aK;
      const on = smoothstep(K.x.add(0.2), K.x.add(0.9), uLamps);
      L.material.colorNode = vec4(vec3(1, 0.72, 0.35).mul(L.round).mul(on).mul(sin(t.mul(3).add(K.x.mul(2))).mul(0.06).add(0.94)), 1);
      g.add(L.cloud.sprite);
      ours.push(L.material);
      const bowls: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i++) {
        const b = new THREE.CylinderGeometry(0.14, 0.09, 0.1, 12);
        b.translate(-2.3 + i * 0.7, 1.06, -6.5);
        bowls.push(b);
      }
      const bm = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
      bm.colorNode = vec3(0.45, 0.25, 0.15);
      const bmesh = new THREE.Mesh(merge(bowls), bm);
      g.add(bmesh);
      ours.push(bm, bmesh.geometry);
    }
    // the slow brightening: seven small lights climbing the figure at the sink
    {
      const n = 7;
      const L = pointCloud(n, 0.1);
      const f = specs[0];
      for (let i = 0; i < n; i++) {
        L.pos.set([f.x + 0.02, 0.85 + i * 0.15, f.z], i * 3);
        L.k.set([i / (n - 1), 0, 0, 0], i * 4);
      }
      touch(L.cloud);
      const K = L.cloud.nodes.aK;
      L.material.colorNode = vec4(vec3(1, 0.9, 0.7).mul(L.round).mul(smoothstep(K.x.sub(0.02), K.x.add(0.1), uClimb)).mul(0.9), 1);
      g.add(L.cloud.sprite);
      ours.push(L.material);
    }
    // each alcove's light, lit in turn; the queue's cold strip of light
    {
      const L = pointCloud(4, 2.4);
      for (let i = 0; i < 4; i++) {
        const a = alcove(i);
        L.pos.set([a.x + (a.x > 0 ? 1.2 : -1.2), 3.1, a.z], i * 3);
        L.k.set([i, 0, 0, 0], i * 4);
      }
      touch(L.cloud);
      const K = L.cloud.nodes.aK;
      L.material.colorNode = vec4(vec3(1, 0.8, 0.5).mul(L.round).mul(smoothstep(K.x.add(0.2), K.x.add(0.9), uAlcoves)).mul(0.3), 1);
      g.add(L.cloud.sprite);
      ours.push(L.material);
      // one warm light for each side's pair of alcoves (lights cost every surface on a phone)
      const lights: THREE.PointLight[] = [];
      for (const sx of [-1, 1]) {
        const p = new THREE.PointLight(0xffc88a, 0, 12, 1.4);
        p.position.set(sx * 7.6, 2.8, -19.5);
        g.add(p);
        lights.push(p);
      }
      // the queue's strip light: cold, fluorescent
      const sg = stoneBlock(0.12, 0.06, 5.2);
      sg.translate(-3.2, 3.6, -20);
      const sm = new THREE.MeshBasicNodeMaterial({ fog: false });
      sm.colorNode = vec4(vec3(0.85, 0.95, 1).mul(uQueue.mul(1.4).add(0.05)), 1);
      g.add(new THREE.Mesh(sg, sm));
      const strip = new THREE.SpotLight(0xdff0ff, 0, 8, 1.0, 0.4, 1.2);
      strip.position.set(-3.2, 3.5, -20);
      strip.target.position.set(-3.2, 0, -20);
      g.add(strip, strip.target);
      ours.push(sg, sm);
      tickers.push(() => {
        const a = uAlcoves.value, lit = (i: number) => Math.min(1, Math.max(0, a - i));
        lights[0].intensity = 45 * Math.max(lit(0), lit(2)); // the left side: alcoves 0 and 2
        lights[1].intensity = 45 * Math.max(lit(1), lit(3));
        strip.intensity = 80 * uQueue.value;
      });
    }
    // the earlier instruments over the table, in thin light
    {
      const pairs: number[] = [];
      const c = new THREE.Vector3(-1.6, 2.2, -6.5);
      // a crystal point
      const q = [[0, 0.5], [0.12, 0.25], [0.12, -0.3], [-0.12, -0.3], [-0.12, 0.25]].map(([x, y]) => new THREE.Vector3(c.x - 0.9 + x, c.y + y, c.z));
      for (let i = 0; i < q.length; i++) pairs.push(...q[i].toArray(), ...q[(i + 1) % q.length].toArray());
      // a small pyramid
      const p = [[0, 0.4], [0.4, -0.3], [-0.4, -0.3]].map(([x, y]) => new THREE.Vector3(c.x + x, c.y + y, c.z));
      for (let i = 0; i < 3; i++) pairs.push(...p[i].toArray(), ...p[(i + 1) % 3].toArray());
      // a card
      const k = [[-0.25, 0.4], [0.25, 0.4], [0.25, -0.4], [-0.25, -0.4]].map(([x, y]) => new THREE.Vector3(c.x + 0.9 + x, c.y + y, c.z));
      for (let i = 0; i < 4; i++) pairs.push(...k[i].toArray(), ...k[(i + 1) % 4].toArray());
      const geo = ribbonGeometry(pairs);
      const rm = ribbonMaterial(vec3(1, 0.85, 0.6).mul(uTools), 0.8);
      g.add(new THREE.Mesh(geo, rm));
      ours.push(geo, rm);
    }
    // the sacred as water: light rippling over the floors
    {
      const geo = new THREE.PlaneGeometry(18, 32);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.02, -16.5);
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const p = roomPos.xz.mul(0.9);
      const w = vnoise(p.add(vec2(t.mul(0.3), t.mul(0.2)))).add(vnoise(p.mul(1.7).sub(vec2(t.mul(0.25), 0))));
      const caustic = smoothstep(0.45, 0.0, abs(w.sub(1))).mul(0.8).add(0.1);
      m.colorNode = vec4(vec3(0.55, 0.8, 1).mul(caustic).mul(uWater).mul(0.18), 1);
      g.add(new THREE.Mesh(geo, m));
      ours.push(geo, m);
    }
    // the door on at the courtyard's far end
    {
      const dg = new THREE.PlaneGeometry(4, 3.6);
      dg.translate(0, 1.8, -32.4);
      const dm = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
      const r = length(uv().sub(vec2(0.5, 0.3)).mul(vec2(1.4, 1)));
      dm.colorNode = vec4(mix(vec3(0.12, 0.14, 0.24), vec3(0.8, 0.85, 1), exp(r.mul(r).mul(-4)).mul(0.6)), 1);
      g.add(new THREE.Mesh(dg, dm));
      ours.push(dg, dm);
    }
    // the courtyard's sky: dawn blue
    {
      const sg = new THREE.PlaneGeometry(40, 40);
      sg.rotateX(Math.PI / 2);
      sg.translate(0, 9, -22);
      const sm = new THREE.MeshBasicNodeMaterial({ fog: false });
      sm.colorNode = vec4(mix(vec3(0.08, 0.12, 0.26), vec3(0.45, 0.55, 0.75), uMorning), 1);
      g.add(new THREE.Mesh(sg, sm));
      ours.push(sg, sm);
    }
    g.add(folk.group);

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock.tick(d);
      applyAir(air);
      uLamps.value = damp(uLamps.value, goal.lamps, 0.8, d);
      uClimb.value = Math.min(goal.climb, uClimb.value + d / 30);
      uAlcoves.value = damp(uAlcoves.value, goal.alcoves, 0.8, d);
      uQueue.value = damp(uQueue.value, goal.queue, 0.6, d);
      uTools.value = damp(uTools.value, goal.tools, 0.25, d);
      uWater.value = damp(uWater.value, goal.water, 0.15, d);
      uMorning.value = damp(uMorning.value, goal.morning, 0.04, d);
      // the Sufi turns
      const sufi = folk.bodies[2];
      if (sufi) sufi.root.rotation.y += d * 0.9 * Math.min(1, Math.max(0, uAlcoves.value - 1));
      folk.update(d);
    });
  };

  const opts: LessonOpts = {
    id: "practice_disciplines",
    trackId: "audio/adept/practice_disciplines.mp3",
    seatPos,
    seatHeading: 0,
    build,
    beats: [
      // "Know yourself. Accept yourself. Become the Creator."
      { t: 40, apply: () => (goal.lamps = 1) },
      { t: 58, apply: () => ((goal.lamps = 2), (goal.morning = 0.25)) },
      { t: 76, apply: () => (goal.lamps = 3) },
      // "a slow brightening, from the ground of the body up through the heart and into the brow"
      { t: 118, apply: () => (goal.climb = 1) },
      // "The desert hermits… The Sufi mystics… A Roman emperor… The Daoist sages"
      { t: 162, apply: () => (goal.alcoves = 1) },
      { t: 167, apply: () => (goal.alcoves = 2) },
      { t: 172, apply: () => (goal.alcoves = 3) },
      { t: 177, apply: () => ((goal.alcoves = 4), (goal.morning = 0.4)) },
      // "standing in the checkout line"
      { t: 183, apply: () => (goal.queue = 1) },
      // "This is why no device… ever replaced the daily work"
      { t: 214, apply: () => (goal.tools = 1) },
      { t: 238, apply: () => (goal.tools = 0) },
      // "The ancients lived inside these questions the way fish live in water"
      { t: 262, apply: () => ((goal.water = 1), (goal.morning = 0.6)) },
      // "The adept is not made in the extraordinary hour"
      { t: 294, apply: () => ((goal.morning = 1), (goal.water = 0.5)) },
    ],
  };
  const lesson = new LessonScene(scene, narration, whisper, opts);
  const baseUpdate = lesson.update.bind(lesson);
  const baseDispose = lesson.dispose.bind(lesson);
  lesson.update = (dt: number): void => {
    baseUpdate(dt);
    for (const ticker of tickers) ticker(dt);
  };
  lesson.dispose = (): void => {
    baseDispose();
    folk.dispose();
    for (const d of ours) d.dispose();
    ours.length = 0;
    tickers.length = 0;
  };
  return Object.assign(lesson, { loaded: folk.loaded });
}
