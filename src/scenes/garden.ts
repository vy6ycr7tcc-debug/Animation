/* The garden lesson: L05 "The Fire in the Hand" (anger), enacted (scenes/enacted.ts). Before the
   seat a colossal hand of light lies open, tilted toward you, and on its palm a coal is burning: a
   rough lump of black crust split by cracks of orange heat that breathe and flicker, sparks
   rising, smoke curling up, its light thrown red on the ground and the hand. The hand endures it.

   It follows the telling. Three roads open from the hand along the ground, three diverging paths
   of fire-light. The first road is to bury it: a coal goes down the left road and sinks, and the
   earth there smoulders. The second is to throw it back: a coal arcs away down the right road and
   bursts. The third is to sit with it: the coal itself travels the middle road into a hearth of
   stones and settles there, warming instead of burning, its light turning from red to gold. The
   hearth flares at the anger aimed inward and quiets in kind hands; many small embers glow round
   it (what anger aimed well has changed). At the end the coal comes back to the palm and the hand
   holds it up to the light, gold. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { T, vnoise } from "../gpu/tsl";
import { rng } from "../world/forms";
import { landStone } from "../world/stoneworks";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { boulderGeometry } from "./densities/roomKit";
import { cloud, enactedLesson, env, handVolume, type Stage, type StageCtx } from "./enacted";

const { abs, exp, float, fract, mix, pow, sin, smoothstep, uniform, vec3, vec4 } = T;

const TILT = 0.55;
const PALM_N = new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT)); // the palm's face, up and toward you
const HEARTH = new THREE.Vector3(0, 0, -6);
const LEFT_END = new THREE.Vector3(-7.5, 0, -17), RIGHT_END = new THREE.Vector3(7.5, 0, -17);

/** A point along a road from the hand's foot to `end`, gently curving. */
function roadAt(end: THREE.Vector3, f: number, out: THREE.Vector3): THREE.Vector3 {
  const start = new THREE.Vector3(0, 0, -0.5);
  out.lerpVectors(start, end, f);
  out.x += Math.sin(f * Math.PI) * end.x * 0.12;
  return out;
}

function stage(ctx: StageCtx): Stage {
  const g = new THREE.Group();
  const t = ctx.clock;
  const R = rng(5505);
  const gy = ctx.ground;
  // the hand stands clear of any rise between it and the seat
  const HAND = new THREE.Vector3(0, Math.max(gy(0, 0.5), gy(0, 4), gy(0, 7)) + 3.8, 0.5);
  const REST = HAND.clone().addScaledVector(PALM_N, 1.35); // where the coal lies on the palm
  HEARTH.y = gy(HEARTH.x, HEARTH.z);
  const ours: { dispose(): void }[] = [];
  const u = {
    on: uniform(0),
    burn: uniform(1), // the coal's heat
    warm: uniform(0), // red harshness → hearth gold
    roadL: uniform(0), roadC: uniform(0), roadR: uniform(0),
    buried: uniform(0), // the earth smouldering where it was buried
    burst: uniform(0), // where it was thrown
    flame: uniform(0), // the hearth's fire
    many: uniform(0),
    hand: uniform(1),
  };

  /* ---------------- the hand, open, tilted toward you ---------------- */
  {
    const n = 11000;
    const H = cloud(n, 0.1, { aK: 4 });
    H.a.position.set(handVolume(n, 505, 0.85, 3.3));
    for (let i = 0; i < n; i++) H.a.aK.set([R(), R(), R(), R()], i * 4);
    H.dirty();
    const K = H.c.nodes.aK, P = H.c.nodes.position;
    // it breathes, and flinches a little with the coal's pulses
    const breath = sin(t.mul(0.45)).mul(0.025).add(1);
    H.m.positionNode = P.mul(breath).add(vec3(0, 0, sin(t.mul(3.1).add(K.x.mul(8))).mul(0.015).mul(u.burn)));
    // its palm lit by the coal: the nearer the palm's centre, the redder
    const d = T.length(P.xy.sub(T.vec2(0, 0.05))).div(1.4);
    const lit = exp(d.mul(d).mul(-0.35)).mul(u.burn).mul(float(1).sub(u.warm.mul(0.6)));
    const base = mix(vec3(1, 0.88, 0.7), vec3(1, 0.5, 0.25), lit.min(1));
    const tw = sin(t.mul(float(0.8).add(K.y)).add(K.z.mul(40))).mul(0.2).add(0.8);
    H.m.colorNode = vec4(base.mul(H.round).mul(tw).mul(float(0.32).add(lit.mul(0.35))).mul(u.on).mul(u.hand), 1);
    const hg = new THREE.Group();
    hg.add(H.c.sprite);
    hg.position.copy(HAND);
    hg.rotation.x = -TILT;
    g.add(hg);
    ours.push(H.m);
  }

  /* ---------------- the coal: black crust, cracks of living heat ---------------- */
  const coalMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  {
    const P = T.positionGeometry;
    const n1 = vnoise(P.xy.mul(2.3).add(P.z.mul(1.7)).add(t.mul(0.03)));
    const n2 = vnoise(P.yz.mul(4.1).sub(P.x.mul(2.2)).add(9.1));
    const ridge = float(1).sub(abs(n1.mul(2).sub(1))).mul(0.7).add(float(1).sub(abs(n2.mul(2).sub(1))).mul(0.3));
    const crack = smoothstep(0.8, 0.96, ridge);
    const flick = sin(t.mul(7.3)).mul(0.08).add(sin(t.mul(2.1)).mul(0.12)).add(0.85);
    const breathe = sin(t.mul(0.9)).mul(0.2).add(0.8);
    const hot = mix(vec3(1.0, 0.32, 0.06), vec3(1.0, 0.7, 0.3), u.warm);
    coalMat.colorNode = mix(vec3(0.03, 0.025, 0.025), vec3(0.09, 0.05, 0.03), n2);
    coalMat.emissiveNode = hot.mul(crack.mul(3.2).add(smoothstep(0.55, 0.8, ridge).mul(0.35))).mul(flick).mul(breathe).mul(u.burn);
  }
  const lump = (r: number, seed: number) => {
    const geo = new THREE.IcosahedronGeometry(r, 3);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const Rr = rng(seed);
    const bumps = Array.from({ length: 9 }, () => new THREE.Vector3(Rr() - 0.5, Rr() - 0.5, Rr() - 0.5).normalize());
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const dir = v.clone().normalize();
      let k = 1;
      for (const b of bumps) k += Math.max(0, dir.dot(b)) ** 6 * 0.25;
      v.multiplyScalar(k * (0.9 + Math.sin(v.x * 7) * 0.03 + Math.cos(v.z * 9) * 0.03));
      v.y *= 0.78;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    ours.push(geo);
    return new THREE.Mesh(geo, coalMat);
  };
  const coal = lump(0.72, 11);
  coal.castShadow = true;
  g.add(coal);
  const other = lump(0.5, 12); // the coal each of the other roads takes
  g.add(other);
  ours.push(coalMat);
  const coalLight = new THREE.PointLight(0xff6a2a, 0, 26, 2);
  g.add(coalLight);

  /* ---------------- sparks and smoke from the coal ---------------- */
  const coalPos = uniform(REST.clone());
  {
    const n = 900;
    const S = cloud(n, 0.06, { aK: 4 });
    for (let i = 0; i < n; i++) S.a.aK.set([R(), R(), R(), R()], i * 4);
    S.dirty();
    const K = S.c.nodes.aK;
    const life = fract(K.x.add(t.mul(float(0.25).add(K.y.mul(0.35)))));
    const drift = vec3(sin(K.z.mul(40).add(t.mul(0.7))).mul(life).mul(0.9), life.mul(float(3).add(K.w.mul(4))), T.cos(K.z.mul(33)).mul(life).mul(0.6));
    S.m.positionNode = coalPos.add(vec3(K.z.sub(0.5).mul(0.9), 0.3, K.w.sub(0.5).mul(0.6))).add(drift);
    const col = mix(vec3(1, 0.45, 0.12), vec3(1, 0.78, 0.4), u.warm);
    S.m.colorNode = vec4(col.mul(S.round).mul(smoothstep(0, 0.08, life)).mul(float(1).sub(life)).mul(u.burn).mul(u.on).mul(0.9), 1);
    g.add(S.c.sprite);
    ours.push(S.m);
    const m = 500;
    const Sm = cloud(m, 0.9, { aK: 4 });
    for (let i = 0; i < m; i++) Sm.a.aK.set([R(), R(), R(), R()], i * 4);
    Sm.dirty();
    Sm.m.blending = THREE.NormalBlending;
    const SK = Sm.c.nodes.aK;
    const sl = fract(SK.x.add(t.mul(float(0.06).add(SK.y.mul(0.05)))));
    Sm.m.positionNode = coalPos.add(vec3(sin(SK.z.mul(30).add(t.mul(0.3))).mul(sl).mul(1.8), float(0.6).add(sl.mul(7)), sin(SK.w.mul(30)).mul(sl).mul(1.2)));
    Sm.m.colorNode = vec4(vec3(0.16, 0.14, 0.15).mul(float(1).add(sl)), Sm.round.mul(smoothstep(0, 0.2, sl)).mul(float(1).sub(sl)).mul(0.22).mul(u.burn.min(1)).mul(float(1).sub(u.warm.mul(0.7))).mul(u.on));
    g.add(Sm.c.sprite);
    ours.push(Sm.m);
  }

  /* ---------------- the three roads of fire-light along the ground ---------------- */
  {
    const per = 2200;
    const Rd = cloud(per * 3, 0.16, { aK: 4 });
    const v = new THREE.Vector3();
    const ends = [LEFT_END, HEARTH, RIGHT_END];
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < per; i++) {
        const f = R();
        roadAt(ends[r], f, v);
        const side = (R() - 0.5) * (1.4 + f * 1.4);
        const dx = ends[r].x, dz = ends[r].z + 0.5, L = Math.hypot(dx, dz);
        const px = v.x + (-dz / L) * side, pz = v.z + (dx / L) * side;
        Rd.a.position.set([px, gy(px, pz) + 0.12 + R() * 0.25, pz], (r * per + i) * 3);
        Rd.a.aK.set([f, r, R(), R()], (r * per + i) * 4);
      }
    Rd.dirty();
    const K = Rd.c.nodes.aK;
    // embers flow outward along each road
    const flow = pow(fract(K.x.mul(4).sub(t.mul(0.12)).add(K.z.mul(0.3))), 6);
    const which = K.y;
    const lit = mix(mix(u.roadL, u.roadC, smoothstep(0.5, 0.6, which)), u.roadR, smoothstep(1.5, 1.6, which));
    const col = mix(vec3(1, 0.4, 0.15), vec3(1, 0.75, 0.38), smoothstep(0.5, 0.6, which).mul(float(1).sub(smoothstep(1.5, 1.6, which))));
    Rd.m.colorNode = vec4(col.mul(Rd.round).mul(float(0.35).add(flow.mul(1.8))).mul(lit).mul(u.on).mul(0.9), 1);
    g.add(Rd.c.sprite);
    ours.push(Rd.m);
  }

  /* ---------------- the buried coal: the earth smoulders; the thrown one bursts ---------------- */
  {
    const n = 700;
    const B = cloud(n, 0.12, { aK: 4 });
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 1.8;
      const bx = LEFT_END.x * 0.8 + Math.cos(a) * r, bz = LEFT_END.z * 0.8 + Math.sin(a) * r;
      B.a.position.set([bx, gy(bx, bz) + 0.05, bz], i * 3);
      B.a.aK.set([R(), R(), R(), R()], i * 4);
    }
    B.dirty();
    const K = B.c.nodes.aK;
    const glow = sin(t.mul(float(1.2).add(K.x)).add(K.y.mul(30))).mul(0.4).add(0.6);
    B.m.colorNode = vec4(vec3(1, 0.3, 0.08).mul(B.round).mul(glow).mul(u.buried).mul(u.on).mul(0.7), 1);
    g.add(B.c.sprite);
    ours.push(B.m);
    const m = 900;
    const X = cloud(m, 0.09, { aK: 4 });
    for (let i = 0; i < m; i++) X.a.aK.set([R(), R(), R(), R()], i * 4);
    X.dirty();
    const XK = X.c.nodes.aK;
    const dir = T.normalize(vec3(XK.x.sub(0.5), XK.y.mul(0.8).add(0.1), XK.z.sub(0.5)));
    const out = u.burst.mul(float(3).add(XK.w.mul(5)));
    X.m.positionNode = vec3(RIGHT_END.x * 0.85, gy(RIGHT_END.x * 0.85, RIGHT_END.z * 0.85) + 1.5, RIGHT_END.z * 0.85).add(dir.mul(out)).sub(vec3(0, u.burst.mul(u.burst).mul(2.5), 0));
    X.m.colorNode = vec4(vec3(1, 0.4, 0.12).mul(X.round).mul(smoothstep(0.02, 0.1, u.burst)).mul(float(1).sub(u.burst)).mul(u.on).mul(1.2), 1);
    g.add(X.c.sprite);
    ours.push(X.m);
  }

  /* ---------------- the hearth: a ring of stones, and the fire that settles there ---------------- */
  {
    const m = landStone("sandstone_cracks", -99, 1.2, [0.34, 0.3, 0.28]);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const geo = boulderGeometry(0.6 + R() * 0.25, 60 + k);
      const mesh = new THREE.Mesh(geo, m);
      const hx = HEARTH.x + Math.cos(a) * 2.1, hz = HEARTH.z + Math.sin(a) * 2.1;
      mesh.position.set(hx, gy(hx, hz) + 0.12, hz);
      mesh.rotation.y = R() * 6;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo);
    }
    ours.push(m);
    const n = 1600;
    const F = cloud(n, 0.22, { aK: 4 });
    for (let i = 0; i < n; i++) F.a.aK.set([R(), R(), R(), R()], i * 4);
    F.dirty();
    const K = F.c.nodes.aK;
    const life = fract(K.x.add(t.mul(float(0.5).add(K.y.mul(0.5)))));
    const r = float(1).sub(life).mul(1.3).mul(K.z.add(0.2));
    const a = K.w.mul(6.283).add(life.mul(3));
    F.m.positionNode = vec3(float(HEARTH.x).add(T.cos(a).mul(r)), float(HEARTH.y + 0.3).add(life.mul(float(3.2).add(K.z.mul(2.2))).mul(u.flame.min(1.4))), float(HEARTH.z).add(sin(a).mul(r)));
    const col = mix(vec3(1, 0.85, 0.5), vec3(1, 0.42, 0.14), life);
    F.m.colorNode = vec4(col.mul(F.round).mul(float(1).sub(life)).mul(u.flame).mul(u.on).mul(0.55), 1);
    g.add(F.c.sprite);
    ours.push(F.m);
    // many small embers round it: what anger, well aimed, has changed
    const e = 1200;
    const E = cloud(e, 0.08, { aK: 4 });
    for (let i = 0; i < e; i++) {
      const aa = R() * Math.PI * 2, rr = 3 + Math.pow(R(), 0.7) * 16;
      const ex = HEARTH.x + Math.cos(aa) * rr, ez = HEARTH.z + Math.sin(aa) * rr * 0.8 - 2;
      E.a.position.set([ex, gy(ex, ez) + 0.08, ez], i * 3);
      E.a.aK.set([R(), rr / 19, R(), R()], i * 4);
    }
    E.dirty();
    const EK = E.c.nodes.aK;
    const shown = smoothstep(EK.y.sub(0.05), EK.y, u.many);
    E.m.colorNode = vec4(vec3(1, 0.72, 0.36).mul(E.round).mul(shown).mul(sin(t.mul(float(0.8).add(EK.z)).add(EK.w.mul(30))).mul(0.3).add(0.7)).mul(u.on).mul(0.8), 1);
    g.add(E.c.sprite);
    ours.push(E.m);
  }
  const hearthLight = new THREE.PointLight(0xffa24a, 0, 24, 2);
  hearthLight.position.set(HEARTH.x, HEARTH.y + 1.6, HEARTH.z);
  g.add(hearthLight);

  const v = new THREE.Vector3();
  let time = 0;
  return {
    group: g,
    update(dt, tt, on) {
      time += dt;
      u.on.value = 0.4 + 0.6 * on;
      const T0 = tt;
      u.roadL.value = env(T0, [[0, 0], [96, 0], [104, 0.7], [106, 1], [160, 1], [175, 0.25], [590, 0.25], [600, 0]]);
      u.roadR.value = env(T0, [[0, 0], [96, 0], [104, 0.7], [165, 1], [205, 1], [215, 0.25], [590, 0.25], [600, 0]]);
      u.roadC.value = env(T0, [[0, 0], [96, 0], [104, 0.7], [208, 1], [245, 1], [260, 0.45], [590, 0.45], [600, 0]]);
      u.buried.value = env(T0, [[0, 0], [150, 0], [160, 1], [200, 0.6], [240, 0.3]]);
      u.burst.value = env(T0, [[0, 0], [188, 0], [198, 1]]);
      // the coal: in the palm; down the middle road into the hearth; back to the palm at the end
      const toHearth = env(T0, [[0, 0], [208, 0], [240, 1], [590, 1], [604, 0]]);
      const lift = env(T0, [[0, 0], [604, 0], [616, 1]]);
      v.copy(REST).lerp(new THREE.Vector3(HEARTH.x, HEARTH.y + 0.7, HEARTH.z), toHearth);
      v.y += Math.sin(toHearth * Math.PI) * 2.2 + lift * 3.2;
      coal.position.copy(v);
      coal.rotation.set(time * 0.05, time * 0.08, 0);
      coalPos.value.copy(v);
      // its heat: burning in the hand; red and harsh at the start; gold in the hearth
      u.warm.value = env(T0, [[0, 0], [208, 0], [245, 1], [312, 1], [330, 0.8], [478, 0.2], [500, 0.3], [527, 0.9], [546, 1]]);
      u.burn.value = env(T0, [[0, 0.9], [12, 1.2], [96, 1], [245, 0.8], [478, 1.3], [527, 0.7], [604, 1], [616, 1.25]]);
      u.flame.value = env(T0, [[0, 0], [230, 0], [250, 1], [342, 1.3], [478, 1.5], [527, 0.8], [590, 0.8], [604, 0.2]]);
      u.many.value = env(T0, [[0, 0], [358, 0], [390, 1], [470, 1], [500, 0.4]]);
      u.hand.value = env(T0, [[0, 1], [240, 1], [260, 0.7], [590, 0.7], [604, 1]]);
      // the coal each other road takes: down the left and under; arcing away to the right
      const bury = env(T0, [[0, 0], [106, 0], [150, 1]]);
      const throwF = env(T0, [[0, 0], [165, 0], [188, 1]]);
      if (T0 > 106 && T0 < 162) {
        roadAt(LEFT_END, bury * 0.8, v);
        v.y = gy(v.x, v.z) + 0.4 - Math.max(0, bury - 0.85) * 6;
        other.position.copy(v);
        other.visible = true;
      } else if (T0 > 165 && T0 < 189) {
        roadAt(RIGHT_END, throwF * 0.85, v);
        v.y = gy(v.x, v.z) + 1.5 + Math.sin(throwF * Math.PI) * 5;
        other.position.copy(v);
        other.visible = true;
      } else other.visible = false;
      other.rotation.y += dt * 2;
      const flick = 0.85 + 0.15 * Math.sin(time * 9.1) * Math.sin(time * 3.3);
      coalLight.position.copy(coal.position).add(new THREE.Vector3(0, 0.8, 0.4));
      coalLight.intensity = 260 * u.burn.value * flick * u.on.value;
      coalLight.color.setRGB(1, 0.42 + 0.3 * u.warm.value, 0.16 + 0.2 * u.warm.value);
      hearthLight.intensity = 240 * Math.min(1.4, u.flame.value) * flick * u.on.value;
    },
    dispose() {
      for (const o of ours) o.dispose();
    },
  };
}

export function createGardenScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return enactedLesson(scene, narration, whisper, { id: "garden", trackId: "L05", site: SITES.garden, reach: 10, make: stage });
}
