/* The shore lesson: L03 "The Untying" (forgiveness), enacted (scenes/enacted.ts). Before the seat,
   two colossal open hands of light stand up out of the sand, and between them a great rope of three
   twisted strands, tied in the middle in a knot pulled tight and glowing like a held grievance.

   It follows the telling. The knot glows as the narration looks at what it is made of; the rope
   sags with the weight of holding it; cords wind round the knot (a room you never leave). A heavy
   stone wheel rises behind and turns, the unforgiven action going round, and slows, and stops the
   moment you stop pushing it. Release belongs to the hands: the fingers open. Then the untying
   itself, slow and large: the loop loosens and widens, the strands fray and slip free, the knot
   runs out of the rope, the way a river lets a leaf go. Small knots along it loosen in their turn.
   The rope goes slack between open hands, falls, and its fibres rise away into the sky. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { T } from "../gpu/tsl";
import { rng } from "../world/forms";
import { landStone } from "../world/stoneworks";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { cloud, enactedLesson, env, handVolume, type Stage, type StageCtx } from "./enacted";

const { abs, cos, exp, float, fract, mix, sin, smoothstep, uniform, vec3, vec4 } = T;

const Y0 = 4.4; // the rope's height
const W = 3.5; // half its span, palm to palm
const HAND_X = 4.0;

function stage(ctx: StageCtx): Stage {
  const g = new THREE.Group();
  const t = ctx.clock;
  const R = rng(3303);
  const u = {
    on: uniform(0),
    tight: uniform(1),
    loose: uniform(0),
    fray: uniform(0),
    sag: uniform(0.1),
    drop: uniform(0),
    rise: uniform(0),
    heat: uniform(0.4),
    bind: uniform(0),
    small: uniform(0),
    open: uniform(0.2),
  };
  const ours: { dispose(): void }[] = [];

  /* ---------------- the rope: three strands twisted round one line, the knot in its middle ---------------- */
  {
    const n = 14000;
    const P = cloud(n, 0.085, { aK: 4 });
    for (let i = 0; i < n; i++) {
      P.a.aK.set([R(), Math.floor(R() * 3), R(), R()], i * 4);
    }
    P.dirty();
    const K = P.c.nodes.aK;
    const s = K.x, ply = K.y, r1 = K.z, r2 = K.w;
    // the knot: a loop the rope makes round itself, passing over and under
    const span = float(0.1).add(u.loose.mul(0.1));
    const q = s.sub(0.5).div(span);
    const w = exp(q.mul(q).mul(-1));
    const th = q.mul(2.7);
    const loopR = float(1.25).add(u.loose.mul(1.3)).mul(u.tight);
    let cx = mix(float(-W), float(W), s).sub(sin(th).mul(loopR).mul(0.85).mul(w));
    let cy = float(Y0).add(float(1).sub(cos(th)).mul(loopR).mul(0.62).mul(w));
    let cz = sin(th.mul(0.5)).mul(loopR).mul(1.1).mul(w);
    // small knots along it, for the small grievances of an ordinary day
    const fs = fract(s.mul(7)), qs = fs.sub(0.5).div(0.06);
    const ws = exp(qs.mul(qs).mul(-1)).mul(float(1).sub(w)).mul(u.small);
    cx = cx.sub(sin(qs.mul(2.6)).mul(0.26).mul(ws));
    cy = cy.add(float(1).sub(cos(qs.mul(2.6))).mul(0.18).mul(ws));
    // the weight of holding it; slack at the end
    cy = cy.sub(sin(s.mul(Math.PI)).mul(u.sag.mul(2.6)));
    // three strands twisted about the line; where the knot loosens they fray apart
    const phi = s.mul(95).add(ply.mul(2.094));
    const rr = float(0.13).add(r1.mul(0.07)).add(u.fray.mul(w).mul(r1).mul(0.9)).add(u.drop.mul(r1).mul(0.5));
    let p = vec3(cx, cy.add(cos(phi).mul(rr)), cz.add(sin(phi).mul(rr)));
    // released, it falls; then its fibres rise away like birds
    const fall = u.drop.mul(float(3.2).add(r2.mul(1.6)));
    p = p.add(vec3(sin(r2.mul(40)).mul(u.drop).mul(0.8), fall.negate(), 0));
    const lift = u.rise.mul(r2.mul(0.8).add(0.2));
    p = p.add(vec3(sin(t.mul(0.6).add(r1.mul(30))).mul(lift).mul(2.5), lift.mul(float(9).add(r1.mul(16))), lift.mul(-6).mul(r2)));
    P.m.positionNode = p;
    const knotHeat = w.mul(u.heat);
    const col = mix(vec3(1.0, 0.8, 0.52), vec3(1.0, 0.45, 0.2), knotHeat.min(1));
    const pulse = sin(t.mul(1.3)).mul(0.25).add(0.75);
    const bright = float(0.55).add(knotHeat.mul(pulse).mul(1.4)).mul(float(1).sub(u.rise.mul(r2).mul(0.9)));
    P.m.colorNode = vec4(col.mul(P.round).mul(bright).mul(u.on).mul(0.55), 1);
    g.add(P.c.sprite);
    ours.push(P.m);
  }

  /* ---------------- the cords: winding round the knot, drawing tighter ---------------- */
  {
    const n = 3000;
    const C = cloud(n, 0.05, { aK: 4 });
    for (let i = 0; i < n; i++) C.a.aK.set([R(), R(), R(), R()], i * 4);
    C.dirty();
    const K = C.c.nodes.aK;
    const a = K.x.mul(Math.PI * 2 * 9).add(t.mul(0.3));
    const x = K.x.sub(0.5).mul(3.2);
    const rad = mix(float(1.6), float(0.95), u.bind).add(K.y.mul(0.06));
    C.m.positionNode = vec3(x, float(Y0).add(0.5).add(cos(a).mul(rad)), sin(a).mul(rad));
    C.m.colorNode = vec4(vec3(1, 0.5, 0.26).mul(C.round).mul(u.bind).mul(u.on).mul(smoothstep(1.6, 1.0, abs(x))).mul(0.55), 1);
    g.add(C.c.sprite);
    ours.push(C.m);
  }

  /* ---------------- the two colossal hands, fingers opening as the telling reaches release ---------------- */
  for (const side of [-1, 1]) {
    const n = 7000;
    const H = cloud(n, 0.085, { aB: 3, aK: 4 });
    const closed = handVolume(n, 71, 0.2, 2.25);
    const open = handVolume(n, 71, 1, 2.25);
    for (let i = 0; i < n; i++) {
      H.a.position.set([closed[i * 3] * side, closed[i * 3 + 1], closed[i * 3 + 2]], i * 3);
      H.a.aB.set([open[i * 3] * side, open[i * 3 + 1], open[i * 3 + 2]], i * 3);
      H.a.aK.set([R(), R(), R(), R()], i * 4);
    }
    H.dirty();
    const K = H.c.nodes.aK;
    const pos = mix(H.c.nodes.position, H.c.nodes.aB, u.open);
    const breath = sin(t.mul(0.5).add(side)).mul(0.03).add(1);
    H.m.positionNode = pos.mul(breath).add(vec3(sin(t.mul(0.4).add(K.x.mul(30))).mul(0.02), 0, 0));
    const tw = sin(t.mul(float(0.7).add(K.y)).add(K.z.mul(40))).mul(0.25).add(0.75);
    H.m.colorNode = vec4(mix(vec3(1, 0.86, 0.62), vec3(0.8, 0.86, 1), K.w.mul(0.4)).mul(H.round).mul(tw).mul(u.on).mul(0.42), 1);
    const hg = new THREE.Group();
    hg.add(H.c.sprite);
    // standing up out of the sand, palm toward you, the rope's end at the palm
    hg.position.set(HAND_X * side, Y0 - 1.6, 0.2);
    hg.rotation.set(0, -side * 0.5, -side * 0.18);
    g.add(hg);
    ours.push(H.m);
  }

  /* ---------------- the wheel of the unforgiven action: heavy stone, turning, slowing, still ---------------- */
  const wheel = new THREE.Group();
  const uWheel = { show: 0, spin: 0, a: 0 };
  {
    // a millstone: a great disc of stone, a thick rounded rim, an axle through its heart
    const parts: THREE.BufferGeometry[] = [];
    const disc = new THREE.CylinderGeometry(3.4, 3.4, 1.0, 72, 1);
    disc.rotateX(Math.PI / 2);
    parts.push(disc);
    const rim = new THREE.TorusGeometry(3.4, 0.5, 12, 72);
    parts.push(rim);
    const hub = new THREE.CylinderGeometry(0.62, 0.62, 1.5, 28);
    hub.rotateX(Math.PI / 2);
    parts.push(hub);
    const m = landStone("sandstone_cracks", -99, 1.6, [0.2, 0.19, 0.19]);
    for (const geo of parts) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      wheel.add(mesh);
      ours.push(geo);
    }
    ours.push(m);
    wheel.position.set(0, 11.6, -7);
    g.add(wheel);
    const light = new THREE.PointLight(0xffc890, 0, 22, 2);
    light.position.set(0, 9, 1);
    g.add(light);
    (wheel.userData as { light: THREE.PointLight }).light = light;
  }

  return {
    group: g,
    update(dt, tt, on) {
      // waiting: the rope and its knot, faint; seated, the telling runs
      u.on.value = 0.35 + 0.65 * on;
      const T0 = tt;
      u.heat.value = env(T0, [[0, 0.45], [42, 1.2], [83, 0.9], [144, 0.55], [241, 1.1], [344, 0.6], [470, 0.3], [560, 0]]);
      u.sag.value = env(T0, [[0, 0.1], [83, 0.1], [100, 0.4], [344, 0.4], [386, 0.18], [560, 0.2], [585, 1]]);
      u.bind.value = env(T0, [[0, 0], [110, 0], [128, 1], [290, 0.8], [344, 0]]);
      u.open.value = env(T0, [[0, 0.15], [344, 0.15], [372, 0.6], [560, 0.6], [585, 1]]);
      // the untying: slow, and large
      u.loose.value = env(T0, [[0, 0], [386, 0], [470, 1]]);
      u.tight.value = env(T0, [[0, 1], [440, 1], [560, 0]]);
      u.fray.value = env(T0, [[0, 0], [420, 0], [500, 1], [600, 0.35]]);
      u.small.value = env(T0, [[0, 0], [455, 0], [470, 1], [510, 1], [527, 0]]);
      u.drop.value = env(T0, [[0, 0], [590, 0], [626, 1]]);
      u.rise.value = env(T0, [[0, 0], [628, 0], [660, 1]]);
      // the wheel rises and turns; it slows; it stops the moment you stop pushing it; it sinks
      uWheel.show = env(T0, [[0, 0], [236, 0], [248, 1], [330, 1], [362, 0]]);
      uWheel.spin = env(T0, [[0, 0.9], [262, 0.9], [286, 0]]);
      uWheel.a += dt * uWheel.spin * (on > 0.5 ? 1 : 0);
      wheel.visible = uWheel.show > 0.01;
      wheel.scale.setScalar(Math.max(0.001, uWheel.show));
      wheel.position.y = 11.6 - (1 - uWheel.show) * 6;
      wheel.rotation.z = uWheel.a;
      (wheel.userData as { light: THREE.PointLight }).light.intensity = 70 * uWheel.show;
    },
    dispose() {
      for (const o of ours) o.dispose();
    },
  };
}

export function createShoreScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return enactedLesson(scene, narration, whisper, { id: "shore", trackId: "L03", site: SITES.shore, reach: 10, make: stage });
}
