/* The igloo lesson: L04 "Without Price" (love given freely), enacted (scenes/enacted.ts). The sun is
   the main character. It begins with a cold evening: rain falling on the road, someone sitting at
   its side, and another who comes and offers a seat. The ledger opens, a great book hanging in the
   air, and kindnesses are written into it line by line, but every line fades as it is written:
   love that refuses to be recorded. Then the sun rises, vast and low, and pours itself out: light
   falls from it in endless streams over everything, never less for what it gives. When a gift
   becomes a loan the ledger's lines stay, ember, and then the book closes and is gone. The well
   and the fountain: water leaping from a spring that never stops, never lower for pouring. The
   ones you would sit up all night for, a ring of small lights round it. At the end, a candle set
   down in the middle of the room, left to shine. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { T } from "../gpu/tsl";
import { rng } from "../world/forms";
import { landStone } from "../world/stoneworks";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { GlassFolk } from "./glassFolk";
import { cloud, enactedLesson, env, type Stage, type StageCtx } from "./enacted";

const { float, fract, mix, pow, sin, smoothstep, step, uniform, vec3, vec4 } = T;

const SUN = new THREE.Vector3(0, 9.5, -34);
const SUN_R = 6.5;
const FOUNT = new THREE.Vector3(2.4, 0, -3.5);
const BOOK = new THREE.Vector3(-1.6, 5.4, -3);
const SIT_Y = -0.42;

function stage(ctx: StageCtx): Stage {
  const g = new THREE.Group();
  const t = ctx.clock, gy = ctx.ground;
  const R = rng(4404);
  const ours: { dispose(): void }[] = [];
  const u = {
    on: uniform(0),
    rain: uniform(1),
    ledger: uniform(0),
    debt: uniform(0),
    sunUp: uniform(0),
    pour: uniform(0),
    fount: uniform(0),
    circle: uniform(0),
    candle: uniform(0),
    head: uniform(0), // the ledger's pen: how far through its pages (narration seconds)
  };
  FOUNT.y = gy(FOUNT.x, FOUNT.z);
  // on a slope the seat may stand well above the stage's foot: what hangs in the air is placed from the seat's height
  const seatY = Math.max(0, gy(0, 8));
  SUN.y = seatY + 8.5;
  BOOK.set(-2.1, seatY + 2.6, -0.5);

  /* ---------------- the sun, vast and low, pouring itself out ---------------- */
  const sunAt = uniform(SUN.clone());
  const sunY = SUN.y;
  {
    // its body: a disc of light turning slowly, brighter at the heart, its rim alive
    const n = 5000;
    const S = cloud(n, 0.7, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(R()) * SUN_R, a = R() * Math.PI * 2;
      S.a.position.set([Math.cos(a) * r, Math.sin(a) * r, 0], i * 3);
      S.a.aK.set([r / SUN_R, R(), R(), R()], i * 4);
    }
    S.dirty();
    const K = S.c.nodes.aK;
    const P = S.c.nodes.position;
    const boil = sin(t.mul(float(0.6).add(K.y)).add(K.z.mul(40))).mul(0.15).mul(K.x);
    S.m.positionNode = sunAt.add(P.mul(float(1).add(boil)));
    const col = mix(vec3(1, 0.92, 0.7), vec3(1, 0.62, 0.3), pow(K.x, 2));
    S.m.colorNode = vec4(col.mul(S.round).mul(float(0.7).add(float(1).sub(K.x).mul(0.9))).mul(u.sunUp).mul(u.on).mul(0.8), 1);
    g.add(S.c.sprite);
    ours.push(S.m);
    const halo = cloud(1, SUN_R * 5.5, { aK: 4 });
    halo.m.positionNode = sunAt;
    halo.m.colorNode = vec4(vec3(1, 0.66, 0.36).mul(halo.round).mul(u.sunUp).mul(u.on).mul(0.3), 1);
    g.add(halo.c.sprite);
    ours.push(halo.m);
    // what it gives: streams of light falling from it over everything, never ending
    const m = 10000;
    const F = cloud(m, 0.13, { aK: 4 });
    for (let i = 0; i < m; i++) F.a.aK.set([R(), R(), R(), R()], i * 4);
    F.dirty();
    const FK = F.c.nodes.aK;
    const life = fract(FK.x.add(t.mul(float(0.035).add(FK.y.mul(0.03)))));
    const ang = FK.z.mul(Math.PI * 2);
    const from = sunAt.add(vec3(T.cos(ang).mul(SUN_R * 0.9), sin(ang).mul(SUN_R * 0.9), 0));
    const to = vec3(FK.z.sub(0.5).mul(18), float(seatY - 1), FK.w.mul(-10).add(7));
    const along = mix(from, to, life);
    const arc = sin(life.mul(Math.PI)).mul(float(4).add(FK.w.mul(5)));
    F.m.positionNode = along.add(vec3(sin(t.mul(0.3).add(FK.x.mul(20))).mul(0.4), arc, 0));
    F.m.colorNode = vec4(mix(vec3(1, 0.86, 0.55), vec3(1, 0.7, 0.42), life).mul(F.round).mul(smoothstep(0, 0.05, life)).mul(smoothstep(1, 0.8, life)).mul(u.pour).mul(u.on).mul(1.3), 1);
    g.add(F.c.sprite);
    ours.push(F.m);
  }
  const sunLight = new THREE.DirectionalLight(0xffc27a, 0);
  sunLight.position.set(0, 6, -30);
  sunLight.target.position.set(0, 0, 0);
  g.add(sunLight, sunLight.target);

  /* ---------------- the rain, and someone by the road; another offers a seat ---------------- */
  {
    const n = 3500;
    const Rn = cloud(n, 0.035, { aK: 4 });
    for (let i = 0; i < n; i++) Rn.a.aK.set([R(), R(), R(), R()], i * 4);
    Rn.dirty();
    const K = Rn.c.nodes.aK;
    const fall = fract(K.x.add(t.mul(float(0.45).add(K.y.mul(0.2)))));
    Rn.m.positionNode = vec3(K.z.sub(0.5).mul(14), float(seatY - 2).add(float(12).mul(float(1).sub(fall))), K.w.mul(-12).add(5));
    Rn.m.colorNode = vec4(vec3(0.65, 0.75, 0.95).mul(Rn.round).mul(u.rain).mul(u.on).mul(0.6), 1);
    g.add(Rn.c.sprite);
    ours.push(Rn.m);
  }
  const folk = new GlassFolk([
    { x: 1.4, y: gy(1.4, -3.4) + SIT_Y, z: -3.4, face: 0.4, act: "sit", tint: new THREE.Color(0.7, 0.8, 1), glow: { inner: 0.16, edge: 0.6, body: 0.24 } },
    { x: -0.2, y: gy(-0.2, -2.5), z: -2.5, face: 1.9, act: "reach", tint: new THREE.Color(1, 0.84, 0.6), glow: { inner: 0.2, edge: 0.7, body: 0.3 } },
  ], 44);
  g.add(folk.group);

  /* ---------------- the ledger: lines written, and each line fading as it is written ---------------- */
  const book = new THREE.Group();
  book.position.copy(BOOK);
  book.rotation.x = -0.32;
  book.scale.setScalar(0.95);
  g.add(book);
  {
    const pm = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false });
    pm.colorNode = vec4(vec3(0.11, 0.1, 0.09).add(vec3(0.5, 0.42, 0.3).mul(0.06)), u.ledger.min(1).mul(0.8));
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(1.7, 2.3, 8, 1);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + 0.9;
        p.setXYZ(i, x * side, p.getY(i), -Math.sin((x / 1.8) * Math.PI) * 0.12 - x * 0.18);
      }
      geo.computeVertexNormals();
      book.add(new THREE.Mesh(geo, pm));
      ours.push(geo);
    }
    ours.push(pm);
    // the writing: twelve lines a page
    const LINES = 24, PER = 90;
    const n = LINES * PER;
    const W = cloud(n, 0.085, { aK: 4 });
    for (let l = 0; l < LINES; l++)
      for (let j = 0; j < PER; j++) {
        const i = l * PER + j;
        const side = l < 12 ? -1 : 1, row = l % 12;
        const x = 0.15 + (j / PER) * 1.45 * (0.7 + R() * 0.3);
        const y = 0.95 - row * 0.17 + Math.sin(j * 0.9 + l) * 0.02;
        W.a.position.set([x * side, y, -Math.sin((x / 1.8) * Math.PI) * 0.12 - x * 0.18 + 0.01], i * 3);
        W.a.aK.set([(l + j / PER) / LINES, R(), 0, 0], i * 4);
      }
    W.dirty();
    const K = W.c.nodes.aK;
    const head = u.head;
    const age = head.sub(K.x);
    const written = mix(step(0, age), float(1), u.debt);
    // unrecorded: it fades as soon as it is written; a loan: it stays, ember
    const keep = mix(float(1).sub(smoothstep(0.0, 0.12, age)), float(1), u.debt);
    const col = mix(vec3(1, 0.9, 0.7), vec3(1, 0.42, 0.16), u.debt);
    W.m.colorNode = vec4(col.mul(W.round).mul(written).mul(keep).mul(u.ledger).mul(u.on).mul(1.8), 1);
    book.add(W.c.sprite);
    ours.push(W.m);
    // the pen of light moving across the page
    const pen = cloud(1, 0.35, { aK: 4 });
    const l = T.floor(head.mul(LINES)), f = fract(head.mul(LINES));
    const side = step(12, l).mul(2).sub(1);
    const px = float(0.15).add(f.mul(1.4));
    pen.m.positionNode = vec3(px.mul(side), float(0.95).sub(T.mod(l, 12).mul(0.17)), px.mul(-0.2).add(0.05));
    pen.m.colorNode = vec4(vec3(1, 0.9, 0.7).mul(pen.round).mul(u.ledger).mul(u.on), 1);
    book.add(pen.c.sprite);
    ours.push(pen.m);
  }

  /* ---------------- the fountain, fed from a spring that never stops ---------------- */
  {
    const m = landStone("sandstone_blocks_05", -99, 1.4, [0.5, 0.46, 0.42]);
    const rim = new THREE.TorusGeometry(1.7, 0.28, 10, 48);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, 0.45, 0);
    const bowl = new THREE.CylinderGeometry(1.8, 1.5, 0.5, 40);
    bowl.translate(0, 0.2, 0);
    const pillar = new THREE.CylinderGeometry(0.22, 0.3, 1.4, 16);
    pillar.translate(0, 0.9, 0);
    const fg = new THREE.Group();
    for (const geo of [rim, bowl, pillar]) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = mesh.receiveShadow = true;
      fg.add(mesh);
      ours.push(geo);
    }
    ours.push(m);
    fg.position.copy(FOUNT);
    g.add(fg);
    (g.userData as { fount: THREE.Group }).fount = fg;
    const n = 5000;
    const Wt = cloud(n, 0.06, { aK: 4 });
    for (let i = 0; i < n; i++) Wt.a.aK.set([R(), R(), R(), R()], i * 4);
    Wt.dirty();
    const K = Wt.c.nodes.aK;
    const life = fract(K.x.add(t.mul(float(0.5).add(K.y.mul(0.3)))));
    const a = K.z.mul(Math.PI * 2);
    const v0 = float(5).add(K.w.mul(2)).mul(u.fount.min(1.3));
    const out = float(0.8).add(K.w.mul(0.6));
    const tt = life.mul(1.9);
    const x = T.cos(a).mul(out).mul(tt), z = sin(a).mul(out).mul(tt);
    const y = float(1.6).add(v0.mul(tt)).sub(tt.mul(tt).mul(4.2));
    Wt.m.positionNode = vec3(float(FOUNT.x).add(x), T.max(float(FOUNT.y + 0.45), float(FOUNT.y).add(y)), float(FOUNT.z).add(z));
    Wt.m.colorNode = vec4(vec3(0.75, 0.88, 1).mul(Wt.round).mul(smoothstep(0, 0.05, life)).mul(float(1).sub(life.mul(0.6))).mul(u.fount.min(1)).mul(u.on).mul(0.6), 1);
    g.add(Wt.c.sprite);
    ours.push(Wt.m);
    // the ones you would sit up all night for: a ring of small lights round it
    const c = 14;
    const Cr = cloud(c, 0.5, { aK: 4 });
    for (let i = 0; i < c; i++) {
      const aa = (i / c) * Math.PI * 2, rr = 3.1;
      const cx = FOUNT.x + Math.cos(aa) * rr, cz = FOUNT.z + Math.sin(aa) * rr * 0.8;
      Cr.a.position.set([cx, gy(cx, cz) + 0.9, cz], i * 3);
      Cr.a.aK.set([i / c, R(), 0, 0], i * 4);
    }
    Cr.dirty();
    const CK = Cr.c.nodes.aK;
    Cr.m.colorNode = vec4(vec3(1, 0.8, 0.5).mul(Cr.round).mul(smoothstep(CK.x, CK.x.add(0.08), u.circle)).mul(sin(t.mul(0.9).add(CK.y.mul(20))).mul(0.2).add(0.8)).mul(u.on).mul(0.9), 1);
    g.add(Cr.c.sprite);
    ours.push(Cr.m);
  }

  /* ---------------- the candle, set down in the middle of the room ---------------- */
  const candle = new THREE.Group();
  {
    const wax = new THREE.CylinderGeometry(0.16, 0.18, 0.7, 20);
    wax.translate(0, 0.35, 0);
    const wm = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
    wm.colorNode = vec3(0.85, 0.8, 0.7);
    wm.emissiveNode = vec3(1, 0.7, 0.4).mul(u.candle).mul(0.25);
    candle.add(new THREE.Mesh(wax, wm));
    ours.push(wax, wm);
    const n = 260;
    const Fl = cloud(n, 0.08, { aK: 4 });
    for (let i = 0; i < n; i++) Fl.a.aK.set([R(), R(), R(), R()], i * 4);
    Fl.dirty();
    const K = Fl.c.nodes.aK;
    const life = fract(K.x.add(t.mul(float(1.4).add(K.y))));
    const r = float(1).sub(life).mul(0.06).mul(K.z.add(0.3));
    Fl.m.positionNode = vec3(T.cos(K.w.mul(6.28)).mul(r).add(sin(t.mul(3)).mul(0.01)), float(0.78).add(life.mul(0.32)), sin(K.w.mul(6.28)).mul(r));
    Fl.m.colorNode = vec4(mix(vec3(1, 0.95, 0.8), vec3(1, 0.55, 0.2), life).mul(Fl.round).mul(float(1).sub(life)).mul(u.candle).mul(u.on).mul(1.4), 1);
    candle.add(Fl.c.sprite);
    ours.push(Fl.m);
    candle.position.set(0, gy(0, 4), 4);
    candle.scale.setScalar(1.6);
    g.add(candle);
  }
  const candleLight = new THREE.PointLight(0xffb060, 0, 12, 2);
  candleLight.position.set(0, gy(0, 4) + 2, 4);
  g.add(candleLight);

  let time = 0;
  return {
    group: g,
    loaded: folk.loaded,
    update(dt, tt, on) {
      time += dt;
      u.on.value = 0.4 + 0.6 * on;
      const T0 = tt;
      u.rain.value = env(T0, [[0, 0.3], [1, 1], [36, 1], [46, 0]]);
      u.ledger.value = env(T0, [[0, 0], [48, 0], [56, 1], [110, 1], [125, 0], [314, 0], [322, 1], [345, 1], [360, 0]]);
      book.visible = u.ledger.value > 0.02;
      u.debt.value = env(T0, [[0, 0], [314, 0], [322, 1], [345, 1], [350, 0]]);
      u.sunUp.value = env(T0, [[0, 0.15], [105, 0.15], [135, 1], [476, 1], [490, 1.2], [560, 1.2]]);
      u.pour.value = env(T0, [[0, 0], [113, 0], [140, 1], [151, 0.7], [178, 1], [476, 1.3], [570, 1.3]]);
      u.fount.value = env(T0, [[0, 0], [345, 0], [355, 0.6], [368, 1.2], [570, 1.2]]);
      u.circle.value = env(T0, [[0, 0], [385, 0], [405, 1.1], [570, 1.1]]);
      u.candle.value = env(T0, [[0, 0], [521, 0], [530, 1], [570, 1]]);
      u.head.value = (T0 * 0.021) % 1;
      sunAt.value.set(SUN.x, sunY - (1 - Math.min(1, u.sunUp.value)) * 14, SUN.z);
      sunLight.intensity = 1.6 * Math.min(1.2, u.sunUp.value) * u.on.value;
      const fg = (g.userData as { fount: THREE.Group }).fount;
      fg.visible = u.fount.value > 0.01;
      fg.scale.setScalar(Math.max(0.001, Math.min(1, u.fount.value * 1.4)));
      candle.visible = u.candle.value > 0.01;
      candleLight.intensity = 90 * u.candle.value * (0.9 + 0.1 * Math.sin(time * 7));
      // the figures belong to the rainy road at the start
      const fk = env(T0, [[0, 1], [110, 1], [125, 0]]);
      folk.group.visible = fk > 0.02;
      folk.update(dt);
    },
    dispose() {
      folk.dispose();
      for (const o of ours) o.dispose();
    },
  };
}

export function createIglooScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return enactedLesson(scene, narration, whisper, { id: "igloo", trackId: "L04", site: SITES.igloo, reach: 8, make: stage });
}
