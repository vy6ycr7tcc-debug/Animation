/* The tree station: "The Catalyst of the Body" (TREE), enacted (scenes/enacted.ts). The subject is
   a tree, so a real one stands before the seat, the biggest thing in the scene: the world's own
   elder kind grown large, in living bark, its crown in leaf.

   It follows the telling. The dry season comes: the leaves let go and fall. A great branch breaks
   and comes down, leaving a notch, a wound that glows. From inside the trunk the spirit of the
   tree comes out through it, a light winding up round the trunk. The mind measures; the spirit
   simply begins to water: light falls like rain over the crown and the tree visibly drinks it, the
   light running down the trunk into the roots. New growth rises in a new shape from the wound, the
   broken places still there. Bare in the dark, the light returns with the morning. Then the spirit
   steps back and paints the tree, wounds and all, in long brushstrokes of light laid along every
   limb; and the crown comes back into leaf while the painting goes on. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { T } from "../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../gpu/ribbons";
import { rng } from "../world/forms";
import { colliders } from "../world/terrain";
import { barkMaterial, grow, SHAPES, tubes } from "../world/creation";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { keepAlpha } from "./densities/roomKit";
import { cloud, enactedLesson, env, type Stage, type StageCtx } from "./enacted";

const { attribute, cos, float, fract, mix, pow, sin, smoothstep, uniform, vec3, vec4 } = T;

type Limb = ReturnType<typeof grow>["limbs"][number];
const S = 1.45; // the tree's scale: about 16 m from its foot to the top of its crown

/** Pairs along each limb's curve, with how far along the tree (0 root … 1 crown tip) and a
    per-limb order, for ribbons drawn progressively. */
function limbStrokes(limbs: Limb[], R: () => number, off = 0): { geo: THREE.BufferGeometry } {
  const pairs: number[] = [], along: number[] = [], order: number[] = [];
  for (const l of limbs) {
    const c = new THREE.CatmullRomCurve3(l.pts);
    const n = l.curl ? 6 : 14;
    const o = R();
    const side = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(off);
    for (let i = 0; i < n; i++) {
      const a = c.getPointAt(i / n).add(side), b = c.getPointAt((i + 1) / n).add(side);
      pairs.push(a.x, a.y, a.z, b.x, b.y, b.z);
      for (let k = 0; k < 4; k++) {
        along.push(l.u0 + (l.u1 - l.u0) * ((i + (k >= 2 ? 1 : 0)) / n));
        order.push(o);
      }
    }
  }
  const geo = ribbonGeometry(pairs);
  geo.setAttribute("aAlong", new THREE.BufferAttribute(new Float32Array(along), 1));
  geo.setAttribute("aOrder", new THREE.BufferAttribute(new Float32Array(order), 1));
  return { geo };
}

function stage(ctx: StageCtx): Stage {
  const g = new THREE.Group();
  const t = ctx.clock, gy = ctx.ground;
  const R = rng(8808);
  const ours: { dispose(): void }[] = [];
  const u = {
    on: uniform(0),
    fall: uniform(0),
    back: uniform(0),
    wound: uniform(0),
    spirit: uniform(0),
    water: uniform(0),
    drink: uniform(0),
    grow: uniform(0),
    paint: uniform(0),
  };

  const tree = new THREE.Group();
  tree.position.set(0, gy(0, -1) - 0.1, -1);
  tree.scale.setScalar(S);
  // its trunk stands solid (stage frame (0, −1), turned with the stage)
  colliders.push({ x: ctx.at.x - Math.sin(ctx.face), z: ctx.at.z - Math.cos(ctx.face), r: 0.75, top: ctx.at.y + 16 });
  g.add(tree);
  const { limbs, roots, tips } = grow(SHAPES[3], 0.2718);
  // the branch that breaks: the first of the great limbs, with everything growing from it
  const main = limbs.map((l, i) => (!l.curl && Math.abs(l.r0 - SHAPES[3].radius * 0.72) < 1e-6 ? i : -1)).filter((i) => i > 0);
  const b0 = main[0], b1 = main[1] ?? limbs.length;
  const broken = limbs.slice(b0, b1), whole = [...limbs.slice(0, b0), ...limbs.slice(b1)];
  const bark = barkMaterial(new THREE.Color(1, 0.8, 0.55), 0.37);
  ours.push(bark);
  {
    const geo = tubes([...whole, ...roots], -0.35);
    const mesh = new THREE.Mesh(geo, bark);
    mesh.castShadow = true;
    tree.add(mesh);
    ours.push(geo);
  }
  // the branch, pivoting at the notch where it leaves the trunk
  const notch = broken[0].pts[0].clone();
  const branch = new THREE.Group();
  branch.position.copy(notch);
  tree.add(branch);
  {
    const geo = tubes(broken);
    geo.translate(-notch.x, -notch.y, -notch.z);
    const mesh = new THREE.Mesh(geo, bark);
    mesh.castShadow = true;
    branch.add(mesh);
    ours.push(geo);
  }
  const fallAxis = new THREE.Vector3().subVectors(broken[0].pts[broken[0].pts.length - 1], notch).setY(0).normalize();
  const fallSide = new THREE.Vector3(-fallAxis.z, 0, fallAxis.x);

  /* ---------------- the crown in leaf; the dry season; the leaves come back ---------------- */
  {
    const per = 110;
    const n = tips.length * per;
    const L = cloud(n, 0.21, { aK: 4 });
    for (let k = 0; k < tips.length; k++)
      for (let j = 0; j < per; j++) {
        const i = k * per + j;
        const a = R() * Math.PI * 2, e = R() * 2 - 1, r = 0.25 + R() * 0.75;
        const rr = Math.sqrt(1 - e * e) * r;
        L.a.position.set([tips[k].x + Math.cos(a) * rr, tips[k].y + e * r * 0.6, tips[k].z + Math.sin(a) * rr], i * 3);
        L.a.aK.set([R(), R(), R(), tips[k].y], i * 4);
      }
    L.dirty();
    const K = L.c.nodes.aK, P = L.c.nodes.position;
    // each leaf lets go at its own moment and drifts down, turning, to the ground
    const own = u.fall.mul(1.6).sub(K.x.mul(0.6)).clamp(0, 1);
    const gone = own.mul(float(1).sub(u.back));
    const drop = gone.mul(K.w.add(0.5));
    const sway = sin(t.mul(float(1.2).add(K.y)).add(K.z.mul(20))).mul(gone).mul(0.9);
    L.m.positionNode = P.add(vec3(sway, drop.negate(), cos(t.mul(0.9).add(K.y.mul(9))).mul(gone).mul(0.6)));
    const col = mix(mix(vec3(0.55, 0.85, 0.45), vec3(1, 0.62, 0.25), own), vec3(0.75, 1, 0.55), u.back);
    const alive = float(1).sub(smoothstep(0.85, 1, gone));
    const tw = sin(t.mul(float(0.9).add(K.y)).add(K.z.mul(30))).mul(0.2).add(0.8);
    L.m.colorNode = vec4(col.mul(L.round).mul(alive).mul(tw).mul(u.on).mul(0.55), 1);
    tree.add(L.c.sprite);
    ours.push(L.m);
  }

  /* ---------------- the wound, and the spirit coming out through it ---------------- */
  {
    const w = cloud(1, 1.3, { aK: 4 });
    w.a.position.set([notch.x, notch.y, notch.z]);
    w.dirty();
    w.m.colorNode = vec4(vec3(1, 0.62, 0.72).mul(w.round).mul(u.wound).mul(sin(t.mul(0.8)).mul(0.2).add(0.8)).mul(u.on), 1);
    tree.add(w.c.sprite);
    ours.push(w.m);
    const n = 900;
    const Sp = cloud(n, 0.09, { aK: 4 });
    for (let i = 0; i < n; i++) Sp.a.aK.set([R(), R(), R(), R()], i * 4);
    Sp.dirty();
    const K = Sp.c.nodes.aK;
    const life = fract(K.x.add(t.mul(float(0.05).add(K.y.mul(0.04)))));
    const a = life.mul(Math.PI * 6).add(K.z.mul(6.28));
    const r = float(0.9).add(sin(life.mul(9)).mul(0.25)).add(K.w.mul(0.3));
    Sp.m.positionNode = vec3(cos(a).mul(r), mix(float(notch.y), float(9.5), life), sin(a).mul(r));
    Sp.m.colorNode = vec4(mix(vec3(1, 0.74, 0.82), vec3(1, 0.95, 0.85), life).mul(Sp.round).mul(smoothstep(0, 0.1, life)).mul(float(1).sub(life)).mul(u.spirit).mul(u.on).mul(0.9), 1);
    tree.add(Sp.c.sprite);
    ours.push(Sp.m);
  }

  /* ---------------- the watering: light falling like rain; the tree drinks it ---------------- */
  {
    const n = 2600;
    const Rn = cloud(n, 0.07, { aK: 4 });
    for (let i = 0; i < n; i++) Rn.a.aK.set([R(), R(), R(), R()], i * 4);
    Rn.dirty();
    const K = Rn.c.nodes.aK;
    const fall = fract(K.x.add(t.mul(float(0.22).add(K.y.mul(0.1)))));
    const ar = K.z.mul(6.28), rr = K.w.mul(5.5);
    Rn.m.positionNode = vec3(cos(ar).mul(rr), float(17).sub(fall.mul(9)), sin(ar).mul(rr));
    Rn.m.colorNode = vec4(vec3(0.75, 0.9, 1).mul(Rn.round).mul(smoothstep(0, 0.1, fall)).mul(float(1).sub(smoothstep(0.8, 1, fall))).mul(u.water).mul(u.on).mul(0.7), 1);
    tree.add(Rn.c.sprite);
    ours.push(Rn.m);
    // drunk: light running down the trunk into the roots
    const m = 700;
    const D = cloud(m, 0.12, { aK: 4 });
    const trunk = new THREE.CatmullRomCurve3(limbs[0].pts);
    for (let i = 0; i < m; i++) {
      const f = R();
      const p = trunk.getPointAt(f);
      D.a.position.set([p.x + (R() - 0.5) * 0.3, p.y, p.z + (R() - 0.5) * 0.3], i * 3);
      D.a.aK.set([f, R(), 0, 0], i * 4);
    }
    D.dirty();
    const DK = D.c.nodes.aK;
    const run = pow(fract(DK.x.mul(2).add(t.mul(0.35)).add(DK.y.mul(0.1))), 8);
    D.m.colorNode = vec4(vec3(0.8, 0.95, 1).mul(D.round).mul(run.mul(1.6).add(0.1)).mul(u.drink).mul(u.on).mul(0.8), 1);
    tree.add(D.c.sprite);
    ours.push(D.m);
  }

  /* ---------------- new growth in a new shape, rising from the wound ---------------- */
  {
    const young = grow(SHAPES[0], 0.6180);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), fallAxis.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 1, 0)).normalize());
    const moved = young.limbs.map((l) => ({ ...l, pts: l.pts.map((p) => p.clone().multiplyScalar(0.55).applyQuaternion(q).add(notch)) }));
    const { geo } = limbStrokes(moved, R);
    const A = attribute("aAlong", "float");
    const shown = smoothstep(A, A.add(0.04), u.grow);
    const m = keepAlpha(ribbonMaterial(vec3(0.7, 1, 0.55).mul(shown).mul(float(0.5).add(sin(t.mul(1.2).sub(A.mul(10))).mul(0.3))).mul(u.on), 2.2));
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    tree.add(mesh);
    ours.push(geo, m);
  }

  /* ---------------- the painting: brushstrokes of light laid along every limb, wounds and all ---------------- */
  {
    const brush = (off: number, col: THREE.Color, px: number) => {
      const { geo } = limbStrokes([...whole, ...broken.map((l) => ({ ...l, pts: l.pts.map((p) => p.clone()) }))], R, off);
      const A = attribute("aAlong", "float"), O = attribute("aOrder", "float");
      // each stroke laid in its turn, root to tip, the brush's bristles uneven along it
      const start = O.mul(0.7);
      const laid = smoothstep(start.add(A.mul(0.3)), start.add(A.mul(0.3)).add(0.03), u.paint);
      const bristle = sin(A.mul(90).add(O.mul(40))).mul(0.25).add(0.75);
      const m = keepAlpha(ribbonMaterial(vec3(col.r, col.g, col.b).mul(laid).mul(bristle).mul(sin(t.mul(0.6).add(O.mul(20))).mul(0.15).add(0.85)).mul(u.on).mul(0.8), px));
      const mesh = new THREE.Mesh(geo, m);
      mesh.frustumCulled = false;
      tree.add(mesh);
      ours.push(geo, m);
      return mesh;
    };
    brush(0.05, new THREE.Color(1, 0.72, 0.8), 3);
    brush(0.12, new THREE.Color(1, 0.86, 0.55), 1.8);
  }
  // the broken branch on the ground is painted too: it lies where it fell, its strokes with it

  // the morning: a warm light rising
  const morning = new THREE.DirectionalLight(0xffc98a, 0);
  morning.position.set(-10, 6, 12);
  morning.target.position.set(0, 6, -1);
  g.add(morning, morning.target);

  return {
    group: g,
    update(dt, tt, on) {
      u.on.value = 0.45 + 0.55 * on;
      const T0 = tt;
      u.fall.value = env(T0, [[0, 0], [11, 0], [40, 1]]);
      u.back.value = env(T0, [[0, 0], [255, 0], [267, 1]]);
      const breakK = env(T0, [[0, 0], [62, 0], [66, 1]]);
      u.wound.value = env(T0, [[0, 0], [63, 0], [68, 1.2], [90, 1], [200, 0.7]]);
      u.spirit.value = env(T0, [[0, 0], [90, 0], [98, 1], [124, 0.6], [211, 1], [267, 1]]);
      u.water.value = env(T0, [[0, 0], [124, 0], [132, 1], [177, 1], [190, 0]]);
      u.drink.value = env(T0, [[0, 0], [130, 0], [140, 1], [185, 1], [200, 0.2]]);
      u.grow.value = env(T0, [[0, 0], [177, 0], [203, 1.05]]);
      u.paint.value = env(T0, [[0, 0], [211, 0], [262, 1.05]]);
      morning.intensity = 2.2 * env(T0, [[0, 0.15], [203, 0.15], [215, 1], [267, 1]]) * u.on.value;
      // the branch comes down: it swings about the notch and lies on the ground
      const fallAng = breakK * breakK * 1.35;
      branch.quaternion.setFromAxisAngle(fallSide, fallAng);
      branch.position.copy(notch).addScaledVector(fallAxis, breakK * 0.8);
      branch.position.y = notch.y - breakK * (notch.y - 0.6);
      void dt;
    },
    dispose() {
      for (const o of ours) o.dispose();
    },
  };
}

export function createTreeStationScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): SceneModule {
  return enactedLesson(scene, narration, whisper, { id: "tree-station", trackId: "TREE", site: SITES["tree-station"], reach: 12, make: stage });
}
