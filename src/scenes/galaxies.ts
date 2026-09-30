/* The galaxies lesson: L06 "What Is" (acceptance), enacted (scenes/enacted.ts). A spiral galaxy
   hangs before the seat, vast, tilted toward you, turning and breathing the whole time, and the
   telling happens to it. It rains, the rain you did not want falls through it, and it does not
   flinch. Pushed away, its arms scatter outward, restless; allowing is a posture, and they settle
   and brighten; in stillness it turns more slowly. A river of light carves its real course along
   the ground beside it and does not apologise for its banks. Space opens at its heart; a path of
   light appears under walking feet. Then everything is drawn into one single point of light: this
   moment. A door opens beside it and light spills out across the ground: the guest is here. And
   with the next breath the point expands again into the whole galaxy. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { T } from "../gpu/tsl";
import { rng } from "../world/forms";
import { landStone } from "../world/stoneworks";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { cloud, enactedLesson, env, type Stage, type StageCtx } from "./enacted";

const { cos, float, fract, mix, pow, sin, smoothstep, uniform, vec3, vec4 } = T;

const R_GAL = 9.5;

function stage(ctx: StageCtx): Stage {
  const g = new THREE.Group();
  const t = ctx.clock, gy = ctx.ground;
  const R = rng(6606);
  const ours: { dispose(): void }[] = [];
  const u = {
    on: uniform(0),
    rain: uniform(0),
    push: uniform(0),
    bright: uniform(0.8),
    point: uniform(0), // 1: all drawn into one point
    space: uniform(0),
    river: uniform(0),
    path: uniform(0),
    door: uniform(0),
    turn: uniform(0), // its angle, advanced on the CPU so stillness can slow it
  };
  const seatY = Math.max(0, gy(0, 9));
  const CENTER = new THREE.Vector3(0, seatY + 8.5, -6);

  /* ---------------- the galaxy ---------------- */
  const gal = new THREE.Group();
  gal.position.copy(CENTER);
  gal.rotation.set(1.05, 0, 0.18); // tilted toward you, a little aslant
  g.add(gal);
  {
    const n = 26000;
    const G = cloud(n, 0.12, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const role = R();
      const core = role < 0.16, disk = role > 0.66;
      const arm = disk ? 2 : Math.floor(R() * 2);
      const f = core ? R() * 0.18 : disk ? Math.sqrt(R()) : Math.pow(R(), 0.8);
      G.a.aK.set([f, arm, R(), R()], i * 4);
      // the core as a soft ball of light (a gaussian, from three random numbers)
      const gz = () => (R() + R() + R() - 1.5) * 1.2;
      G.a.position.set([core ? 1 : 0, core ? gz() : 0, core ? gz() : 0], i * 3);
    }
    G.dirty();
    const K = G.c.nodes.aK;
    const f = K.x, arm = K.y, j1 = K.z, j2 = K.w;
    const isCore = G.c.nodes.position.x;
    // a logarithmic spiral with scatter; the inner parts turn faster
    const isDisk = T.step(1.5, arm);
    const r = f.mul(R_GAL).add(j1.sub(0.5).mul(f.mul(3.4).add(0.6)).mul(float(1).sub(isDisk)));
    const a0 = mix(arm.mul(Math.PI).add(T.log(r.add(0.6)).mul(2.6)).add(j2.sub(0.5).mul(0.9)), j2.mul(Math.PI * 2), isDisk);
    const a = a0.add(u.turn.mul(float(1.6).sub(f)));
    // pushed away, the arms scatter outward; drawn to the point, everything falls in
    const push = float(1).add(u.push.mul(j1.mul(0.22).add(0.06)).mul(sin(t.mul(0.9).add(j2.mul(20))).mul(0.5).add(0.5)));
    const rr = r.mul(push).mul(float(1).sub(u.point.mul(0.999))).mul(sin(t.mul(0.25)).mul(0.02).add(1));
    const h = j2.sub(0.5).mul(float(0.8).sub(f.mul(0.6))).mul(float(1).sub(u.point));
    const coreP = vec3(G.c.nodes.position.y, j2.sub(0.5).mul(0.9), G.c.nodes.position.z).mul(float(0.9).add(u.space.mul(1.2))).mul(float(1).sub(u.point.mul(0.999)));
    G.m.positionNode = mix(vec3(cos(a).mul(rr), h, sin(a).mul(rr)), coreP, isCore);
    const col = mix(mix(vec3(1, 0.9, 0.72), vec3(0.72, 0.8, 1), smoothstep(0.15, 0.6, f)), vec3(1, 0.72, 0.85), smoothstep(0.7, 1, j2).mul(f));
    const tw = sin(t.mul(float(0.6).add(j1)).add(j2.mul(60))).mul(0.25).add(0.75);
    const lum = mix(mix(float(0.55).add(float(1).sub(f).mul(0.5)), float(0.28), isDisk), float(1.3), isCore).mul(u.bright).mul(float(1).add(u.point.mul(2)));
    G.m.colorNode = vec4(col.mul(G.round).mul(tw).mul(lum).mul(u.on).mul(0.75), 1);
    gal.add(G.c.sprite);
    ours.push(G.m);
    const heart = cloud(1, 3.4, { aK: 4 });
    heart.m.colorNode = vec4(vec3(1, 0.88, 0.7).mul(heart.round).mul(float(0.35).add(u.point.mul(0.9)).add(u.space.mul(0.2))).mul(u.on), 1);
    gal.add(heart.c.sprite);
    ours.push(heart.m);
  }

  /* ---------------- the rain it does not flinch from ---------------- */
  {
    const n = 4000;
    const Rn = cloud(n, 0.04, { aK: 4 });
    for (let i = 0; i < n; i++) Rn.a.aK.set([R(), R(), R(), R()], i * 4);
    Rn.dirty();
    const K = Rn.c.nodes.aK;
    const fall = fract(K.x.add(t.mul(float(0.4).add(K.y.mul(0.2)))));
    Rn.m.positionNode = vec3(K.z.sub(0.5).mul(18), float(seatY + 20).sub(fall.mul(22)), K.w.mul(-18).add(4));
    Rn.m.colorNode = vec4(vec3(0.6, 0.72, 0.95).mul(Rn.round).mul(u.rain).mul(u.on).mul(0.6), 1);
    g.add(Rn.c.sprite);
    ours.push(Rn.m);
  }

  /* ---------------- the river, carving its course along the ground ---------------- */
  const riverX = (z: number) => 4.2 + Math.sin(z * 0.16) * 2.2;
  {
    const n = 9000;
    const Rv = cloud(n, 0.09, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const f = R(), z = 8 - f * 50, x = riverX(z) + (R() - 0.5) * 2.2;
      Rv.a.position.set([x, gy(x, z) + 0.08, z], i * 3);
      Rv.a.aK.set([f, R(), R(), R()], i * 4);
    }
    Rv.dirty();
    const K = Rv.c.nodes.aK;
    const P = Rv.c.nodes.position;
    const flow = fract(K.x.mul(3).add(t.mul(0.05)).add(K.y.mul(0.2)));
    // it carves its course: drawn from far to near as the telling reaches it
    const shown = smoothstep(K.x.sub(0.04), K.x, u.river.mul(1.1));
    Rv.m.positionNode = P.add(vec3(0, 0, flow.sub(0.5).mul(1.2)));
    Rv.m.colorNode = vec4(vec3(0.62, 0.8, 1).mul(Rv.round).mul(pow(flow, 3).mul(1.4).add(0.3)).mul(shown).mul(u.on).mul(0.55), 1);
    g.add(Rv.c.sprite);
    ours.push(Rv.m);
  }

  /* ---------------- a path of light under walking feet ---------------- */
  {
    const n = 22;
    const Pt = cloud(n, 0.9, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const f = i / n, z = 8 - f * 16, x = Math.sin(f * 4) * 0.8 - 1;
      Pt.a.position.set([x, gy(x, z) + 0.12, z], i * 3);
      Pt.a.aK.set([f, R(), 0, 0], i * 4);
    }
    Pt.dirty();
    const K = Pt.c.nodes.aK;
    Pt.m.colorNode = vec4(vec3(1, 0.84, 0.55).mul(Pt.round).mul(smoothstep(K.x, K.x.add(0.05), u.path)).mul(sin(t.mul(1.1).add(K.y.mul(20))).mul(0.15).add(0.85)).mul(u.on).mul(0.8), 1);
    g.add(Pt.c.sprite);
    ours.push(Pt.m);
  }

  /* ---------------- the door the guest stands at: it opens, light spills out ---------------- */
  const door = new THREE.Group();
  const leaf = new THREE.Group();
  {
    const dx = -4.4, dz = -2;
    door.position.set(dx, gy(dx, dz), dz);
    door.rotation.y = 0.5;
    const m = landStone("sandstone_blocks_08", -99, 1.4, [0.42, 0.38, 0.35]);
    const post = (x: number) => {
      const geo = new THREE.BoxGeometry(0.5, 4.4, 0.6);
      geo.translate(x, 2.2, 0);
      return geo;
    };
    const lintel = new THREE.BoxGeometry(2.9, 0.55, 0.7);
    lintel.translate(0, 4.6, 0);
    for (const geo of [post(-1.2), post(1.2), lintel]) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      door.add(mesh);
      ours.push(geo);
    }
    // the door itself, swinging in on its hinge
    const lg = new THREE.BoxGeometry(1.9, 4.3, 0.12);
    lg.translate(0.95, 2.15, 0);
    const lm = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
    lm.colorNode = vec3(0.16, 0.11, 0.08);
    leaf.add(new THREE.Mesh(lg, lm));
    leaf.position.set(-0.95, 0, -0.05);
    door.add(leaf);
    ours.push(m, lg, lm);
    // the light beyond it, and spilling out across the ground toward you
    const bg = new THREE.PlaneGeometry(1.9, 4.3);
    bg.translate(0, 2.15, -0.2);
    const bm = new THREE.MeshBasicNodeMaterial({ fog: false });
    bm.colorNode = vec3(1, 0.9, 0.72).mul(u.door).mul(1.4);
    door.add(new THREE.Mesh(bg, bm));
    const sg = new THREE.PlaneGeometry(4, 9);
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, 0.06, 4.6);
    const sm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const U = T.uv();
    const fan = smoothstep(0.55, 0.0, T.abs(U.x.sub(0.5)).div(U.y.oneMinus().mul(0.9).add(0.22))).mul(pow(U.y, 1.4));
    sm.colorNode = vec4(vec3(1, 0.85, 0.6).mul(fan).mul(u.door).mul(0.5), 1);
    door.add(new THREE.Mesh(sg, sm));
    ours.push(bg, bm, sg, sm);
    g.add(door);
  }
  const doorLight = new THREE.PointLight(0xffd9a0, 0, 16, 2);
  door.add(doorLight);
  doorLight.position.set(0, 2, 1.2);

  let turn = 0;
  return {
    group: g,
    update(dt, tt, on) {
      u.on.value = 0.4 + 0.6 * on;
      const T0 = tt;
      u.rain.value = env(T0, [[0, 0], [8, 0], [14, 1], [58, 1], [70, 0]]);
      u.push.value = env(T0, [[0, 0], [70, 0], [95, 1], [165, 1], [185, 0]]);
      u.bright.value = env(T0, [[0, 0.8], [172, 0.8], [190, 1.2], [480, 1.2]]);
      u.space.value = env(T0, [[0, 0], [283, 0], [300, 1], [345, 0.6]]);
      u.river.value = env(T0, [[0, 0], [262, 0], [290, 1]]);
      u.path.value = env(T0, [[0, 0], [300, 0], [330, 1], [480, 1], [490, 0]]);
      u.point.value = env(T0, [[0, 0], [485, 0], [492, 1], [548, 1], [572, 0]]);
      u.door.value = env(T0, [[0, 0], [500, 0], [512, 1], [600, 1]]);
      // stillness slows the turning; the point holds still
      const rate = env(T0, [[0, 0.05], [210, 0.05], [230, 0.018], [480, 0.018], [600, 0.04]]) * (1 - u.point.value);
      turn += dt * rate * (0.4 + 0.6 * on);
      u.turn.value = turn;
      door.visible = u.door.value > 0.005 || T0 > 480;
      leaf.rotation.y = -u.door.value * 1.7;
      doorLight.intensity = 90 * u.door.value;
    },
    dispose() {
      for (const o of ours) o.dispose();
    },
  };
}

export function createGalaxiesScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return enactedLesson(scene, narration, whisper, { id: "galaxies", trackId: "L06", site: SITES.galaxies, reach: 9, make: stage });
}
