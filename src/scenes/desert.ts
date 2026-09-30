/* The desert lesson: L07 "The Dark and the Lantern" (faith), enacted (scenes/enacted.ts). A road
   runs out from beside the seat into the desert, streetlights along its first stretch. One by one
   they go out, and the road goes on past the last of them into real darkness: while you sit here
   the night around is made truly dark (`lessonDark`). Someone walks that road carrying a lantern,
   and the lantern lights: a real light, a small circle that shows three steps ahead and no more,
   travelling with them. Behind each step a footprint of light stays glowing on the road: a little
   light left behind. The lantern is lifted and its circle widens; worry presses the dark in and the
   flame gutters; the night is not empty (a faint light returns to the dark). Promises kept, one
   and then another, leave the steps brighter. Near the end the lantern is set down on the road
   and left burning, and the walker goes on into the dark; the row of steps glows on. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { T, vnoise } from "../gpu/tsl";
import { rng } from "../world/forms";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { GlassFolk } from "./glassFolk";
import { keepAlpha } from "./densities/roomKit";
import { cloud, enactedLesson, env, lessonDark, type Stage, type StageCtx } from "./enacted";

const { exp, float, mix, sin, smoothstep, uniform, vec2, vec3, vec4 } = T;

const WALK_Z = -1.5; // where the walker keeps, the road moving under their feet
const LAMPS = 6;
const PRINTS = 70;

function stage(ctx: StageCtx): Stage {
  const g = new THREE.Group();
  const t = ctx.clock, gy = ctx.ground;
  const R = rng(7707);
  const ours: { dispose(): void }[] = [];
  const u = {
    on: uniform(0),
    scroll: uniform(0), // how far the walker has come: the road passes under them
    lamps: uniform(1),
    lantern: uniform(0),
    reach: uniform(3.2), // the lantern's circle, metres
    rose: uniform(0),
  };

  /* ---------------- the road: packed pale sand running on into the dark ---------------- */
  {
    const L = 110, W = 3.4;
    const geo = new THREE.PlaneGeometry(W, L, 6, 110);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, 8 - L / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, gy(p.getX(i), p.getZ(i)) + 0.04);
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
    const P = T.positionGeometry;
    const q = vec2(P.x.mul(1.6), P.z.add(u.scroll).mul(0.9));
    const grain = vnoise(q.mul(3)).mul(0.5).add(vnoise(q.mul(11)).mul(0.25));
    const ruts = exp(P.x.abs().sub(0.9).pow(2).mul(-40)).mul(0.25);
    const edge = smoothstep(1.7, 1.2, P.x.abs());
    m.colorNode = mix(vec3(0.22, 0.19, 0.15), vec3(0.34, 0.3, 0.24), grain).mul(float(1).sub(ruts)).mul(edge.mul(0.5).add(0.5));
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(geo, m);
  }

  /* ---------------- the streetlights along its first stretch, going out one by one ---------------- */
  const lampLights: THREE.PointLight[] = [];
  const lampZ = (k: number) => 5 - k * 5.5;
  {
    const pm = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.4 });
    pm.colorNode = vec3(0.12, 0.12, 0.13);
    const pole = new THREE.CylinderGeometry(0.06, 0.08, 4.6, 8);
    pole.translate(0, 2.3, 0);
    const arm = new THREE.BoxGeometry(0.7, 0.06, 0.06);
    arm.translate(-0.3, 4.55, 0);
    ours.push(pm, pole, arm);
    const glowPts = cloud(LAMPS, 0.9, { aK: 4 });
    for (let k = 0; k < LAMPS; k++) {
      const x = 2.4, z = lampZ(k), y = gy(x, z);
      for (const geo of [pole, arm]) {
        const mesh = new THREE.Mesh(geo, pm);
        mesh.position.set(x, y, z);
        g.add(mesh);
      }
      glowPts.a.position.set([x - 0.62, y + 4.45, z], k * 3);
      glowPts.a.aK.set([k / LAMPS, 0, 0, 0], k * 4);
      if (k % 2 === 0) {
        const L = new THREE.PointLight(0xffd29a, 0, 12, 2);
        L.position.set(x - 0.6, y + 4.2, z - 2.5);
        g.add(L);
        lampLights.push(L);
      }
    }
    glowPts.dirty();
    const K = glowPts.c.nodes.aK;
    // the far ones go out first, then nearer, until none is left
    const lit = smoothstep(K.x.sub(0.02), K.x.add(0.02), u.lamps);
    glowPts.m.colorNode = vec4(vec3(1, 0.84, 0.58).mul(glowPts.round).mul(lit).mul(u.on).mul(0.9), 1);
    g.add(glowPts.c.sprite);
    ours.push(glowPts.m);
  }

  /* ---------------- the walker, and the lantern ---------------- */
  const wy = gy(0, WALK_Z);
  const folk = new GlassFolk([{ x: 0, y: wy, z: WALK_Z, face: Math.PI, act: "walk", tint: new THREE.Color(0.9, 0.86, 0.8), glow: { inner: 0.14, edge: 0.55, body: 0.22 } }], 77);
  g.add(folk.group);
  const lantern = new THREE.Group();
  {
    const frame = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.6 });
    frame.colorNode = vec3(0.2, 0.15, 0.1);
    const cage = new THREE.CylinderGeometry(0.11, 0.13, 0.3, 6, 1, true);
    const cap = new THREE.ConeGeometry(0.15, 0.12, 6);
    cap.translate(0, 0.21, 0);
    const handle = new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI);
    handle.translate(0, 0.3, 0);
    for (const geo of [cage, cap, handle]) lantern.add(new THREE.Mesh(geo, frame));
    ours.push(frame, cage, cap, handle);
    const fl = cloud(1, 0.5, { aK: 4 });
    fl.m.colorNode = vec4(vec3(1, 0.8, 0.45).mul(fl.round).mul(u.lantern).mul(sin(t.mul(9)).mul(0.08).add(0.92)).mul(1.5), 1);
    lantern.add(fl.c.sprite);
    ours.push(fl.m);
    g.add(lantern);
  }
  const lanternLight = new THREE.PointLight(0xffc27a, 0, 7, 2);
  g.add(lanternLight);
  // its circle on the ground: the three steps it shows
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));
  {
    const m = pool.material as THREE.MeshBasicNodeMaterial;
    const r = T.length(T.uv().sub(0.5)).mul(2);
    m.colorNode = vec4(vec3(1, 0.75, 0.42).mul(exp(r.mul(r).mul(-2.2))).mul(smoothstep(1, 0.8, r)).mul(u.lantern).mul(0.22), 1);
    g.add(pool);
    ours.push(pool.geometry, m);
  }

  /* ---------------- the footprints of light it leaves behind ---------------- */
  const prints = cloud(PRINTS, 0.32, { aK: 4 });
  const printAt: { x: number; s: number }[] = [];
  {
    for (let i = 0; i < PRINTS; i++) prints.a.aK.set([0, 0, R(), 0], i * 4);
    const K = prints.c.nodes.aK;
    // aK.x: how bright it was left; aK.y: its age in metres behind
    const fade = float(1).sub(smoothstep(4, 26, K.y)).mul(0.9).add(0.1);
    prints.m.colorNode = vec4(mix(vec3(1, 0.8, 0.5), vec3(1, 0.62, 0.72), u.rose).mul(prints.round).mul(K.x).mul(fade).mul(u.on).mul(0.8), 1);
    g.add(prints.c.sprite);
    ours.push(prints.m);
  }

  // the night is not empty: a faint field of light returns to the dark far off
  {
    const n = 1400;
    const S = cloud(n, 0.16, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI - Math.PI / 2, rr = 40 + R() * 60, h = 6 + R() * 40;
      S.a.position.set([Math.sin(a) * rr, h, -Math.cos(a) * rr - 10], i * 3);
      S.a.aK.set([R(), R(), 0, 0], i * 4);
    }
    S.dirty();
    const K = S.c.nodes.aK;
    const shown = uniform(0);
    (g.userData as { stars: typeof shown }).stars = shown;
    S.m.colorNode = vec4(vec3(0.85, 0.88, 1).mul(S.round).mul(sin(t.mul(float(0.7).add(K.x)).add(K.y.mul(40))).mul(0.35).add(0.65)).mul(shown).mul(u.on).mul(0.7), 1);
    g.add(S.c.sprite);
    ours.push(S.m);
  }

  let walked = 0, time = 0;
  const hand = new THREE.Vector3();
  return {
    group: g,
    loaded: folk.loaded,
    update(dt, tt, on) {
      time += dt;
      u.on.value = 0.45 + 0.55 * on;
      const T0 = tt;
      // how dark the world is made: truly dark while you sit here
      const dark = on * env(T0, [[0, 0.4], [20, 0.4], [48, 1], [220, 1], [240, 0.85], [580, 0.85]]);
      lessonDark.k = Math.max(lessonDark.k, dark);
      u.lamps.value = env(T0, [[0, 1.05], [10, 1.05], [45, -0.05]]);
      for (const [i, L] of lampLights.entries()) L.intensity = 150 * (u.lamps.value > (i * 2) / LAMPS ? 1 : 0) * u.on.value;
      u.lantern.value = env(T0, [[0, 0.55], [30, 0.55], [48, 1], [186, 1], [200, 0.55], [220, 1], [580, 1]]);
      u.reach.value = env(T0, [[0, 3], [132, 3], [142, 4.4], [186, 4.4], [200, 2.4], [220, 4], [580, 4]]);
      u.rose.value = env(T0, [[0, 0], [250, 0], [262, 1], [288, 1], [300, 0]]);
      ((g.userData as { stars: { value: number } }).stars).value = env(T0, [[0, 0], [220, 0], [240, 1]]);
      // the walk: they keep their place; the road passes under them
      const walking = on > 0.5 && T0 > 20 ? 1 : 0;
      const setDown = env(T0, [[0, 0], [529, 0], [535, 1]]);
      // how far they have come, a pure function of the telling's seconds (replays and stills agree)
      walked = Math.max(0, Math.min(T0, 529) - 20) * 0.95;
      u.scroll.value = walked;
      const body = folk.bodies[0];
      if (body) {
        // after the lantern is set down, the walker walks on into the dark
        const away = Math.max(0, T0 - 535) * 0.9;
        body.root.position.set(0, gy(0, WALK_Z - away) + Math.sin(time * 0.55) * 0.02, WALK_Z - away);
        body.act(walking ? "walk" : "idle", 0.75);
        folk.group.visible = away < 30;
      }
      folk.update(dt);
      // the lantern: at the hand, lifted when the telling lifts it; set down on the road at the end
      const lift = env(T0, [[0, 0], [132, 0], [140, 1], [186, 1], [196, 0.3], [220, 0.6]]);
      const bob = Math.sin(walked * 3.3) * 0.04 * walking;
      hand.set(0.36, gy(0, WALK_Z) + 0.95 + lift * 0.9 + bob, WALK_Z + 0.1);
      const down = new THREE.Vector3(0.3, gy(0.3, WALK_Z) + 0.18, WALK_Z);
      lantern.position.copy(hand).lerp(down, setDown);
      lanternLight.position.copy(lantern.position).add(new THREE.Vector3(0, 0.1, -0.4));
      const gutter = 1 - env(T0, [[0, 0], [186, 0], [192, 0.35], [215, 0.35], [220, 0]]) * (0.5 + 0.5 * Math.sin(time * 13));
      lanternLight.intensity = 180 * u.lantern.value * gutter * u.on.value;
      lanternLight.distance = u.reach.value * 2.2;
      pool.position.set(lantern.position.x - 0.3, gy(0, lantern.position.z - 1.2) + 0.07, lantern.position.z - 1.2);
      pool.scale.setScalar(u.reach.value);
      // the footprints: one left at each step, carried back toward you as the road passes
      printAt.length = 0;
      for (let k = Math.floor(walked / 0.72); k >= 0 && printAt.length < PRINTS; k--) printAt.push({ x: (k % 2 ? 1 : -1) * 0.16, s: k * 0.72 });
      const kept = env(T0, [[0, 0.5], [167, 0.5], [180, 1], [430, 1], [440, 1.4]]);
      for (let i = 0; i < PRINTS; i++) {
        const pr = printAt[i];
        if (!pr) {
          prints.a.position.set([0, -99, 0], i * 3);
          continue;
        }
        const behind = walked - pr.s;
        const z = WALK_Z + 0.35 + behind;
        prints.a.position.set([pr.x, gy(pr.x, z) + 0.06, z], i * 3);
        prints.a.aK.set([kept, behind, prints.a.aK[i * 4 + 2], 0], i * 4);
      }
      prints.dirty();
    },
    dispose() {
      lessonDark.k = 0;
      folk.dispose();
      for (const o of ours) o.dispose();
    },
  };
}

export function createDesert(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return enactedLesson(scene, narration, whisper, { id: "desert", trackId: "L07", site: SITES.desert, reach: 7, make: stage });
}
