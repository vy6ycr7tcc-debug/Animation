/* The Adept, the first station: the call. Night, and a long causeway of pale stone across still
   dark water toward a door on a low rise. Behind you, far off, a sleeping town, its windows lit
   and dim, the comfortable life (they go out one by one as you leave it behind). The questions
   arrive the way weather arrives: rings spreading over the water, motes blowing past. Then
   something answers: a seed of light on the causeway splits and a thin gold shoot rises. The
   voice that is totally silent: the water goes still, and the stars stand in it. A great lens
   hangs over the shoot and gathers the starlight onto it (learning consciously, as a lens
   quickens sunlight). One small flame lights by the door (the call is measured in willingness,
   not volume); three steps light in turn (know yourself, accept yourself, become the Creator);
   a stone basin brims with light (the summit is a towel and a basin). At the last, beyond the
   door, the glow of a fire: the crucible is waiting. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, hash2, vnoise, type N } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { landStone } from "../../world/stoneworks";
import { applyAir, damp, keepAlpha, merge, pointCloud, roomClock, scannedGround, seeded, skyDome, touch, type Air } from "../densities/roomKit";

const { abs, cos, exp, float, floor, fract, length, max, mix, normalize, positionWorld, pow, sin, smoothstep, step, uniform, uv, vec2, vec3, vec4 } = T;

/** Room frame: you start at the origin facing −z; the door stands on its rise at z −42. */
export const CALL_DOOR = new THREE.Vector3(0, 0, -42);
const SEED = new THREE.Vector3(0, 0, -12);
const TOWN_Z = 260;
const PATH_W = 3.2;

/** The ground: the causeway level, the shore sloping into the water either side, the rise. */
export function callFloor(x: number, z: number): number {
  const rise = Math.max(0, Math.min(1, (-z - 30) / 8)) * 1.35;
  const edge = Math.max(0, Math.abs(x) - PATH_W) * 0.5;
  return Math.max(-1.4, rise - edge);
}

export function createCallScene(scene: THREE.Scene, narration: LessonCtx["narration"], whisper: (t: string, ms?: number) => void): SceneModule {
  const seatPos = new THREE.Vector3(0, 0, 0);
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const t = clock.u;
  const uAsk = uniform(0.6); // the questions: rings over the water, motes on the wind
  const uStill = uniform(0); // the silent voice: the water goes still and holds the stars
  const uSprout = uniform(0); // the shoot from the split seed
  const uLens = uniform(0); // the lens gathering starlight
  const uFlame = uniform(0); // the one small flame by the door
  const uSteps = uniform(0); // the three steps, lit one by one (0 … 3)
  const uBasin = uniform(0);
  const uTown = uniform(1); // the sleeping town's windows
  const uFire = uniform(0.12); // the crucible's glow beyond the door
  const goal = { ask: 0.6, still: 0, sprout: 0, lens: 0, flame: 0, steps: 0, basin: 0, town: 1, fire: 0.12 };
  const air: Air = {
    color: new THREE.Color(0.012, 0.015, 0.03),
    glow: new THREE.Color(0.08, 0.1, 0.18),
    glowDir: new THREE.Vector3(0, 0.3, -1),
    density: 0.0016,
    shadow: new THREE.Color(0.002, 0.006, 0.02),
    sat: 1,
    contrast: 1.06,
  };
  const R = seeded(311);

  /** The night's stars, for the sky and for the water once it holds them. */
  const starsAt = (d: N) => {
    const sc = floor(d.mul(360));
    return step(0.9962, hash2(sc.xy.add(sc.z.mul(7.1)))).mul(sin(t.mul(0.7).add(hash2(sc.xz).mul(40))).mul(0.3).add(0.7));
  };

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    // the sky: deep night, the Milky Way's faint band, stars
    {
      const sky = skyDome(900, new THREE.Color(0.016, 0.02, 0.042), new THREE.Color(0.003, 0.004, 0.012), {
        glowDir: new THREE.Vector3(0, 0.05, -1),
        glow: new THREE.Color(0.05, 0.06, 0.1),
        glowPow: 3,
        extra: (d, c) => {
          const band = exp(abs(d.x.mul(0.8).add(d.y.mul(0.6)).sub(0.1)).mul(-9)).mul(smoothstep(0.02, 0.3, d.y));
          const dust = vnoise(vec2(d.x.mul(14).add(d.z.mul(9)), d.y.mul(12))).mul(band);
          return c.add(vec3(0.07, 0.07, 0.1).mul(dust)).add(vec3(0.85, 0.88, 1).mul(starsAt(d)).mul(smoothstep(0.0, 0.25, d.y)));
        },
      });
      g.add(sky.mesh);
      ours.push(sky);
    }
    // the land: pale sand on the causeway and its rise, the shore falling into the water
    {
      const geo = new THREE.PlaneGeometry(160, 160, 160, 160);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, -30);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        p.setY(i, callFloor(x, z) + (Math.abs(x) > PATH_W + 1 ? (vnoiseCPU(x * 0.3, z * 0.3) - 0.5) * 0.4 : 0));
      }
      geo.computeVertexNormals();
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
      const scan = scannedGround("sand", 2.4, { hue: 0.3, relief: 1.2, bright: 1.7 });
      m.colorNode = vec3(0.34, 0.32, 0.3).mul(scan.color);
      m.normalNode = scan.normal;
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo, m);
    }
    // the water: dark, glossy only in its own colour; rings of questions; later, the stars in it
    {
      const geo = new THREE.PlaneGeometry(900, 900, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicNodeMaterial({ fog: true });
      const P = positionWorld;
      const view = normalize(P.sub(T.cameraPosition));
      const refl = vec3(view.x, view.y.negate(), view.z);
      const fres = pow(float(1).sub(max(view.y.negate(), 0)), 5).mul(0.9).add(0.05);
      // rings: questions, arriving from anywhere, spreading and fading
      let rings: N = float(0);
      for (let k = 0; k < 5; k++) {
        const cell = floor(t.mul(0.07).add(k * 0.21));
        const c = vec2(hash2(vec2(cell, k)).sub(0.5).mul(70), hash2(vec2(k, cell)).mul(-60).add(8));
        const age = fract(t.mul(0.07).add(k * 0.21));
        const r = length(P.xz.sub(c)).sub(age.mul(26));
        rings = rings.add(smoothstep(0.7, 0.0, abs(r)).mul(float(1).sub(age)).mul(smoothstep(0, 0.06, age)));
      }
      const ripple = vnoise(P.xz.mul(0.6).add(vec2(t.mul(0.2), 0))).mul(float(1).sub(uStill));
      const sky = mix(vec3(0.01, 0.013, 0.026), vec3(0.016, 0.02, 0.042), smoothstep(0, 0.3, refl.y));
      const stars = starsAt(normalize(refl.add(vec3(ripple.mul(0.02), 0, 0)))).mul(uStill).mul(0.85);
      const col = sky.mul(fres.add(0.3)).add(vec3(0.55, 0.65, 0.9).mul(rings).mul(uAsk).mul(0.6).mul(float(1).sub(uStill.mul(0.9)))).add(vec3(0.8, 0.85, 1).mul(stars));
      m.colorNode = vec4(col, 1);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = -0.35;
      mesh.renderOrder = -2;
      g.add(mesh);
      ours.push(geo, m);
    }
    // the sleeping town, far behind: dark blocks, lit windows going out as you leave it
    {
      const blocks: THREE.BufferGeometry[] = [];
      const win: number[] = [];
      for (let i = 0; i < 70; i++) {
        const x = (R() - 0.5) * 360, z = TOWN_Z + R() * 90, w = 8 + R() * 16, d = 8 + R() * 14, h = 6 + R() * R() * 34;
        const b = new THREE.BoxGeometry(w, h, d);
        b.translate(x, h / 2 - 1.5, z);
        blocks.push(b);
        for (let k = 0, n = Math.round(h / 3); k < n; k++)
          for (let j = 0; j < 4; j++) if (R() < 0.3) win.push(x + (j / 3 - 0.5) * w * 0.8, 1.5 + k * 3, z - d / 2 - 0.2, R());
      }
      const bm = new THREE.MeshBasicNodeMaterial({ fog: true });
      bm.colorNode = vec4(0.006, 0.007, 0.012, 1);
      const town = merge(blocks);
      g.add(new THREE.Mesh(town, bm));
      ours.push(town);
      ours.push(bm);
      const n = win.length / 4;
      const w = pointCloud(n, 0.9);
      for (let i = 0; i < n; i++) {
        w.pos.set([win[i * 4], win[i * 4 + 1], win[i * 4 + 2]], i * 3);
        w.k.set([win[i * 4 + 3], R(), R(), 0], i * 4);
      }
      touch(w.cloud);
      const K = w.cloud.nodes.aK;
      // each window has its own hour: when the town "sleeps" below it, it goes out
      const on = smoothstep(0.0, 0.08, uTown.sub(K.x));
      const sq = smoothstep(0.5, 0.35, max(abs(T.pointUV.x.sub(0.5)), abs(T.pointUV.y.sub(0.5))));
      w.material.colorNode = vec4(mix(vec3(1, 0.72, 0.4), vec3(0.95, 0.85, 0.6), K.y).mul(sq).mul(on).mul(0.55), 1);
      g.add(w.cloud.sprite);
      ours.push(w.material);
    }
    // the weather of questions: motes blowing across the causeway
    {
      const n = 900;
      const s = pointCloud(n, 0.08);
      for (let i = 0; i < n; i++) {
        s.pos.set([(R() - 0.5) * 60, 0.3 + R() * 7, 10 - R() * 60], i * 3);
        s.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK, B = s.cloud.nodes.position;
      const drift = vec3(fract(K.x.add(t.mul(0.012).mul(K.y.add(0.5)))).sub(0.5).mul(60), sin(t.mul(0.3).add(K.z.mul(20))).mul(0.4), sin(t.mul(0.2).add(K.w.mul(9))).mul(1.5));
      s.material.positionNode = vec3(drift.x, B.y.add(drift.y), B.z.add(drift.z));
      const near = smoothstep(0.8, 3, length(T.cameraPosition.sub(positionWorld)));
      s.material.colorNode = vec4(vec3(0.75, 0.82, 1).mul(s.round).mul(uAsk.mul(0.35)).mul(float(1).sub(uStill.mul(0.8))).mul(near), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    // the seed and its shoot: a thin gold line that grows in a slow curl
    let shoot: THREE.Mesh;
    {
      const pairs: number[] = [];
      let prev = new THREE.Vector3();
      const N = 60;
      for (let i = 1; i <= N; i++) {
        const f = i / N;
        const p = new THREE.Vector3(Math.sin(f * 7) * 0.12 * f, f * 2.4, Math.cos(f * 5) * 0.08 * f);
        if (f > 0.8) p.add(new THREE.Vector3(Math.sin((f - 0.8) * 20) * 0.25 * (f - 0.8) * 5, 0, 0));
        pairs.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
      }
      const geo = ribbonGeometry(pairs);
      // the shoot shows only as high as it has grown
      const m = ribbonMaterial(vec3(1, 0.82, 0.45).mul(smoothstep(0.02, 0.0, T.positionGeometry.y.div(2.4).sub(uSprout))).mul(1.2), 0.9);
      shoot = new THREE.Mesh(geo, m);
      shoot.position.copy(SEED);
      g.add(shoot);
      ours.push(geo, m);
      // the seed: a soft point that splits in two as the shoot begins
      const s = pointCloud(2, 0.34);
      s.pos.set([0, 0, 0, 0, 0, 0]);
      s.k.set([0, 0, 0, 0, 1, 0, 0, 0]);
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      const apart = smoothstep(0, 0.2, uSprout).mul(0.13);
      s.material.positionNode = vec3(K.x.mul(2).sub(1).mul(apart), float(0.12), 0);
      s.material.colorNode = vec4(vec3(1, 0.9, 0.7).mul(s.round).mul(0.9), 1);
      s.cloud.sprite.position.copy(SEED);
      g.add(s.cloud.sprite);
      ours.push(s.material);
      // the stone it rests on
      const st = new THREE.CylinderGeometry(0.55, 0.65, 0.22, 20);
      st.translate(SEED.x, 0.02, SEED.z);
      const sm = landStone("sandstone_cracks", 0, 1.2, [0.8, 0.8, 0.84]);
      g.add(new THREE.Mesh(st, sm));
      ours.push(st, sm);
    }
    // the lens: a great disc of glass hanging over the shoot, and the cone of light it gathers
    {
      const geo = new THREE.SphereGeometry(3.2, 48, 16);
      geo.scale(1, 0.12, 1);
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const n = normalize(T.normalWorld), v = normalize(T.cameraPosition.sub(positionWorld));
      const rim = pow(float(1).sub(abs(T.dot(n, v))), 3);
      m.colorNode = vec4(vec3(0.7, 0.8, 1).mul(pow(rim, 2).mul(0.35).add(0.006)).mul(uLens), 1);
      const lens = new THREE.Mesh(geo, m);
      lens.position.set(SEED.x, 11, SEED.z);
      g.add(lens);
      const cg = new THREE.CylinderGeometry(0.04, 2.6, 10.6, 32, 1, true);
      cg.translate(0, 5.3, 0);
      const cm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      const y = T.positionGeometry.y.div(10.6);
      const along = smoothstep(0, 0.2, y).mul(0.6).add(smoothstep(0.35, 0.0, y).mul(1.4));
      const mote = vnoise(vec2(T.uv().x.mul(20), y.mul(6).sub(t.mul(0.8)))).mul(0.6).add(0.4);
      cm.colorNode = vec4(vec3(0.85, 0.9, 1).mul(along).mul(mote).mul(uLens).mul(0.022), 1);
      const cone = new THREE.Mesh(cg, cm);
      cone.position.copy(SEED);
      g.add(cone);
      // above the lens, the starlight it takes in: a faint wide column
      const ug = new THREE.CylinderGeometry(3.1, 3.4, 60, 32, 1, true);
      ug.translate(0, 11 + 30, 0);
      const um = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      um.colorNode = vec4(vec3(0.6, 0.7, 1).mul(smoothstep(60, 0, T.positionGeometry.y.sub(41).add(30))).mul(uLens).mul(0.005), 1);
      const up = new THREE.Mesh(ug, um);
      up.position.set(SEED.x, 0, SEED.z);
      g.add(up);
      ours.push(geo, m, cg, cm, ug, um);
    }
    // the rise and the door: three steps, a basin, one small flame, and the fire beyond
    {
      const parts: THREE.BufferGeometry[] = [];
      const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => (geo.translate(x, y, z), parts.push(geo));
      const top = callFloor(0, CALL_DOOR.z);
      for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(5.4 - k * 0.3, 0.3, 1.1), 0, callFloor(0, -36.5 - k * 1.1) + 0.15 * 0 + 0.15, -36.5 - k * 1.1);
      add(new THREE.BoxGeometry(1.4, 7.2, 1.5), -2.7, top + 3.6, CALL_DOOR.z);
      add(new THREE.BoxGeometry(1.4, 7.2, 1.5), 2.7, top + 3.6, CALL_DOOR.z);
      add(new THREE.BoxGeometry(7.4, 1.3, 1.9), 0, top + 7.85, CALL_DOOR.z);
      // the basin, beside the steps
      add(new THREE.CylinderGeometry(0.75, 0.55, 0.9, 24), 3.6, callFloor(3.6, -36) + 0.45, -36);
      // the flame's bowl, the other side
      add(new THREE.CylinderGeometry(0.35, 0.18, 1.1, 16), -3.6, callFloor(-3.6, -36) + 0.55, -36);
      for (const p of parts) for (const k of Object.keys(p.attributes)) if (k !== "position" && k !== "normal") p.deleteAttribute(k);
      const m = landStone("sandstone_blocks_08", 0, 2.2, [0.86, 0.84, 0.82]);
      for (const p of parts) {
        const mesh = new THREE.Mesh(p, m);
        mesh.castShadow = mesh.receiveShadow = true;
        g.add(mesh);
      }
      ours.push(m, ...parts);
      // the steps' gold edges, lit one by one
      const pairs: number[] = [], idx: number[] = [];
      for (let k = 0; k < 3; k++) {
        const z = -36.5 - k * 1.1 + 0.55, y = callFloor(0, -36.5 - k * 1.1) + 0.31, hw = (5.4 - k * 0.3) / 2;
        pairs.push(-hw, y, z, hw, y, z);
        idx.push(k);
      }
      const geo = ribbonGeometry(pairs);
      // which step each vertex belongs to, from its height
      const which = T.positionGeometry.y.sub(callFloor(0, -36.5) + 0.31).div(Math.max(0.01, callFloor(0, -38.7) - callFloor(0, -36.5))).mul(2);
      const sm = ribbonMaterial(vec3(1, 0.8, 0.45).mul(smoothstep(which.sub(0.5), which.add(0.5), uSteps.sub(0.5))).mul(0.8), 0.7);
      g.add(new THREE.Mesh(geo, sm));
      ours.push(geo, sm);
      // the basin's water, brimming with light
      const wg = new THREE.CircleGeometry(0.66, 24);
      wg.rotateX(-Math.PI / 2);
      wg.translate(3.6, callFloor(3.6, -36) + 0.88, -36);
      const wm = new THREE.MeshBasicNodeMaterial({ fog: false });
      wm.colorNode = vec4(mix(vec3(0.01, 0.015, 0.03), vec3(0.75, 0.85, 1.0), uBasin.mul(sin(t.mul(0.9)).mul(0.08).add(0.92))), 1);
      g.add(new THREE.Mesh(wg, wm));
      ours.push(wg, wm);
      // one small flame
      const f = pointCloud(40, 0.14);
      for (let i = 0; i < 40; i++) {
        f.pos.set([0, 0, 0], i * 3);
        f.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(f.cloud);
      const K = f.cloud.nodes.aK;
      const life = fract(K.x.add(t.mul(float(0.5).add(K.y.mul(0.4)))));
      f.material.positionNode = vec3(sin(K.z.mul(40).add(t.mul(3))).mul(0.05).mul(float(1).sub(life)), life.mul(0.55), cos(K.w.mul(40).add(t.mul(2.6))).mul(0.05).mul(float(1).sub(life)));
      f.material.colorNode = vec4(mix(vec3(1, 0.85, 0.5), vec3(1, 0.4, 0.15), life).mul(f.round).mul(float(1).sub(life)).mul(uFlame).mul(1.1), 1);
      f.cloud.sprite.position.set(-3.6, callFloor(-3.6, -36) + 1.15, -36);
      g.add(f.cloud.sprite);
      ours.push(f.material);
      // beyond the door: the crucible's glow, low and warm, never a glare
      const dg = new THREE.PlaneGeometry(4.2, 7.2);
      dg.translate(0, top + 3.6, CALL_DOOR.z - 0.4);
      const dm = new THREE.MeshBasicNodeMaterial({ fog: false });
      const u = uv();
      const heat = smoothstep(0.9, 0.0, length(u.sub(vec2(0.5, 0.0)).mul(vec2(1.6, 1.1)))).mul(sin(t.mul(1.7)).mul(0.06).add(sin(t.mul(3.1)).mul(0.04)).add(0.9));
      dm.colorNode = vec4(mix(vec3(0.004, 0.005, 0.012), vec3(1, 0.42, 0.12), heat.mul(uFire)), 1);
      g.add(new THREE.Mesh(dg, dm));
      ours.push(dg, dm);
    }

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock.tick(d);
      applyAir(air);
      uAsk.value = damp(uAsk.value, goal.ask, 0.3, d);
      uStill.value = damp(uStill.value, goal.still, 0.12, d);
      uSprout.value = damp(uSprout.value, goal.sprout, 0.06, d);
      uLens.value = damp(uLens.value, goal.lens, 0.12, d);
      uFlame.value = damp(uFlame.value, goal.flame, 0.5, d);
      uSteps.value = damp(uSteps.value, goal.steps, 0.6, d);
      uBasin.value = damp(uBasin.value, goal.basin, 0.2, d);
      uTown.value = damp(uTown.value, goal.town, 0.05, d);
      uFire.value = damp(uFire.value, goal.fire, 0.1, d);
      shoot.rotation.y += d * 0.1;
    });
  };

  const opts: LessonOpts = {
    id: "adept_call",
    trackId: "audio/adept/adept_1_the_call.mp3",
    seatPos,
    seatHeading: 0,
    build,
    beats: [
      // "The questions arrive the way weather arrives… They find you at three in the morning"
      { t: 14, apply: () => (goal.ask = 1) },
      // "something in you answers… A decision, quiet as a seed splitting"
      { t: 58, apply: () => ((goal.sprout = 0.35), (goal.town = 0.75)) },
      // "a voice that is totally silent… that silence, finally heard"
      { t: 86, apply: () => ((goal.still = 1), (goal.ask = 0.3)) },
      // "learning consciously accelerates everything, the way a lens accelerates sunlight"
      { t: 146, apply: () => ((goal.lens = 1), (goal.sprout = 0.75), (goal.town = 0.5)) },
      // "You may call upon the light only in the measure of your will to serve"
      { t: 192, apply: () => (goal.flame = 1) },
      // "Know yourself. Accept yourself. Become the Creator."
      { t: 228, apply: () => (goal.steps = 1) },
      { t: 232, apply: () => (goal.steps = 2) },
      { t: 236, apply: () => ((goal.steps = 3), (goal.sprout = 1)) },
      // "It is a towel, a basin, a willingness to kneel."
      { t: 252, apply: () => (goal.basin = 1) },
      // "Behind them, the sleepwalking life, comfortable and dim"
      { t: 262, apply: () => ((goal.town = 0), (goal.lens = 0.5)) },
      // "The crucible is waiting."
      { t: 286, apply: () => (goal.fire = 1) },
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
    for (const d of ours) d.dispose();
    ours.length = 0;
    tickers.length = 0;
  };
  return lesson;
}

/** A small value noise on the CPU, for the shore's unevenness. */
function vnoiseCPU(x: number, z: number): number {
  const h = (a: number, b: number) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
