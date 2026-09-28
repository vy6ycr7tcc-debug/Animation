// ─────────────────────────────────────────────────────────────────────────────
//  src/scenes/treeStation.ts — the Tree Station ("The Catalyst of the Body")
//  A great tree in a forest clearing: the dry season browns and breaks its
//  branches (they stay broken), the spirit of the tree comes through the
//  notches from INSIDE the trunk, waters the roots, new growth rises in new
//  shapes, and the spirit paints the tree — wounds included.
//  Everything is a pure function of narration time (ctx.uT); ambient life
//  rides the scene-local lifeT clock (garden.ts precedent).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three/webgpu";
import { T, glowShader, softPoints, spriteCloud, worldPoints, viewDepth, gpuUniforms } from "../gpu/tsl";
import { LessonScene } from "./lessonKit";
import type { LessonCtx, LessonOpts, Beat } from "./lessonKit";
import { CreationKit } from "./creationKit";
import { heightAt } from "../world/terrain";
import type { Narration } from "../core/narration";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── helpers (garden.ts idiom: seeded, guarded, seek-safe) ────────────────────

// seeded hash — every random placement in this scene comes from rnd(), never Math.random
const rnd = (i: number, s: number): number => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// smoothstep(0.0, 1.0, x) — ordered edges only
const smooth01 = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

// 0 → 1 → 1 → 0 envelope over [t0,t1,t2,t3]; every division guarded
const fadeU = (uT: { value: number }, t0: number, t1: number, t2: number, t3: number): number => {
  const t = uT.value;
  const rise = (t - t0) / Math.max(1e-6, t1 - t0);
  const fall = (t3 - t) / Math.max(1e-6, t3 - t2);
  return Math.min(smooth01(rise), smooth01(fall));
};

// 0 → 1 ramp over [t0,t1]; division guarded
const ramp = (uT: { value: number }, t0: number, t1: number): number =>
  smooth01((uT.value - t0) / Math.max(1e-6, t1 - t0));

// additive materials keep their alpha channel (CustomBlending — STYLE_GUIDE §2.3)
const keepsAlpha = (root: THREE.Object3D): void => {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    const list = Array.isArray(mat) ? mat : [mat];
    for (const m of list) {
      if (m.blending === THREE.AdditiveBlending) {
        m.blending = THREE.CustomBlending;
        m.blendEquation = THREE.AddEquation;
        m.blendSrc = THREE.SrcAlphaFactor;
        m.blendDst = THREE.OneFactor;
        m.blendSrcAlpha = THREE.ZeroFactor;
        m.blendDstAlpha = THREE.OneFactor;
      }
    }
  });
};

// pixel size of a soft point from its world size (creation.ts buildLeaves idiom)
const pxSize = (size: any, p: any): any =>
  T.clamp(T.mul(size, gpuUniforms.px).div(T.max(viewDepth(p), 0.5)), 1.5, 90).div(T.screenDPR);

// ── site (PROPOSED SITE — harness: move into SITES.treeStation) ──────────────
const SITE = { x: -1200, z: 1600, heading: 0.303 };
const seatPos = new THREE.Vector3(SITE.x, heightAt(SITE.x, SITE.z), SITE.z);
const seatHeading = SITE.heading; // ≈ atan2(2.5, 8): faces the tree

// ── local layout (seat at local origin; root is NOT rotated — seatHeading
//    already looks toward the tree) ───────────────────────────────────────────
const TREE = new THREE.Vector3(2.5, 0, 8); // tree base — off-center (rule of thirds)
const PAINT_POS = new THREE.Vector3(-4.2, 2.3, 6.2); // painting, facing the seat
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const SPIRIT_FROM = new THREE.Vector3(2.5, 4.0, 8); // trunk interior
const SPIRIT_HOVER = new THREE.Vector3(1.3, 2.6, 6.4);
const SPIRIT_PAINT = new THREE.Vector3(-3.0, 2.4, 6.0);

// narration beats (pure no-ops — all choreography rides the clock in update())
const beats: Beat[] = [5, 40, 75, 115, 150, 190, 225].map((t) => ({ t, apply: () => {} }));

// ── bark: near-black blue base + hemisphere lift + gold grain + starlight rim ─
const makeBark = (): THREE.MeshBasicNodeMaterial => {
  const m = new THREE.MeshBasicNodeMaterial();
  m.fog = true;
  const n = T.normalize(T.normalWorld);
  const v = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const k = T.float(1).sub(T.abs(T.dot(n, v)));
  const rim = T.pow(k, 5).mul(T.vec3(0.3, 0.38, 0.8)).mul(0.18);
  const hemi = T.vec3(0.48, 0.53, 0.82).mul(0.25).mul(n.y.mul(0.5).add(0.5));
  const base = T.mix(T.vec3(0.006, 0.005, 0.014), T.vec3(0.03, 0.028, 0.06), hemi);
  const ang = T.atan(T.positionLocal.z, T.positionLocal.x);
  // vertical bark ridges (not horizontal barcode stripes) with a slight wobble
  const lines = T.sin(ang.mul(24).add(T.sin(T.positionLocal.y.mul(3)).mul(2)))
    .mul(0.5)
    .add(0.5);
  const grain = T.vec3(1.0, 0.78, 0.48).mul(lines).mul(0.035);
  m.colorNode = T.vec4(base.add(grain).add(rim), 1);
  return m;
};

// ── clearing floor: near-black blue + hash grain + edge falloff + tree warmth ─
const makeGround = (): THREE.MeshBasicNodeMaterial => {
  const m = new THREE.MeshBasicNodeMaterial();
  m.fog = true;
  const px = T.positionLocal;
  // per-pixel hash grain (garden idiom): the old 8-cells/m cell hash quilted
  // into visible squares. Subtle, centered, warm-gray.
  const h = T.fract(T.sin(T.dot(px.xz, T.vec2(12.9898, 78.233))).mul(43758.5453));
  const grain = h.sub(T.float(0.5)).mul(T.float(0.022));
  const r = T.length(px.xz);
  const edge = T.smoothstep(11, 17, r).mul(0.65);
  const d = px.sub(T.vec3(TREE.x, 0, TREE.z));
  const warm = T.exp(T.dot(d.xz, d.xz).mul(-0.0555556)).mul(T.vec3(0.1, 0.07, 0.03));
  // dim warm lift so the clearing reads like the garden floor — dark and
  // textured, never a void. Night mood kept: a lift, not a flood.
  const lift = T.vec3(0.038, 0.034, 0.052);
  const base = T.vec3(0.02, 0.018, 0.038).add(grain).add(lift).add(warm).mul(T.float(1).sub(edge));
  m.colorNode = T.vec4(base, 1);
  return m;
};

// ── the painting: dark canvas, gold trunk, five BROKEN branch strokes with
//    gaps + notch dots, leaf dabs, slow shimmer (all vec3 — additive canvas) ──
const paintingColor = (uv: any, uT: any, uPaint: any): any => {
  const vig = T.float(1).sub(T.smoothstep(0.45, 1.05, T.length(uv.sub(0.5)).mul(1.8)));
  const ground = T.vec3(0.025, 0.028, 0.07).mul(vig);
  const trunk = T.smoothstep(0.055, 0.028, T.abs(uv.x.sub(0.5)))
    .mul(T.smoothstep(0.06, 0.16, uv.y))
    .mul(T.smoothstep(0.94, 0.84, uv.y))
    .mul(T.vec3(1.0, 0.78, 0.48).mul(1.15));
  // one broken branch stroke: stub from the trunk, gap at the break, notch dot
  const stroke = (y0: number, slope: number, gx: number, side: number): any => {
    const ly = uv.y.sub(y0).sub(uv.x.sub(0.5).mul(slope));
    const bandK = T.smoothstep(0.05, 0.022, T.abs(ly));
    const sideK = side > 0 ? T.smoothstep(0.47, 0.53, uv.x) : T.float(1).sub(T.smoothstep(0.47, 0.53, uv.x));
    const reach = T.smoothstep(gx + 0.02, gx - 0.02, uv.x); // the stub stops at the break
    const gap = T.smoothstep(0.05, 0.02, T.abs(uv.x.sub(gx))); // the gap window
    const dx = uv.x.sub(gx);
    const notch = T.exp(dx.mul(dx).add(ly.mul(ly)).mul(-800)).mul(T.vec3(1.0, 0.9, 0.6));
    return bandK.mul(sideK).mul(reach).mul(T.float(1).sub(gap.mul(0.85))).mul(T.vec3(1.0, 0.78, 0.48)).add(notch);
  };
  let branches = T.vec3(0);
  branches = branches.add(stroke(0.34, 0.55, 0.72, 1));
  branches = branches.add(stroke(0.47, -0.6, 0.28, -1));
  branches = branches.add(stroke(0.6, 0.5, 0.76, 1));
  branches = branches.add(stroke(0.72, -0.65, 0.24, -1));
  branches = branches.add(stroke(0.84, 0.45, 0.7, 1));
  const g = uv.mul(T.vec2(36, 44));
  const cell = T.floor(g);
  const h = T.fract(T.sin(T.dot(cell, T.vec2(12.9898, 78.233))).mul(43758.5453));
  const f = T.fract(g).sub(0.5);
  const dab = T.smoothstep(0.34, 0.12, T.length(f)).mul(T.step(0.62, h));
  const hh = T.fract(h.mul(7));
  const dabC = T.mix(T.mix(T.vec3(1.0, 0.8, 0.5), T.vec3(0.7, 0.85, 1.0), T.step(0.33, hh)), T.vec3(1.0, 0.7, 0.88), T.step(0.72, hh))
    .mul(dab)
    .mul(0.8);
  const shimmer = T.pow(T.fract(uv.x.add(uv.y).mul(0.4).sub(T.mul(uT, 0.045))), 10)
    .mul(0.35)
    .mul(T.vec3(1.0, 0.9, 0.7));
  return ground.add(trunk).add(branches).add(dabC).add(shimmer).mul(0.45).mul(uPaint);
};

// ── scene ────────────────────────────────────────────────────────────────────
export function createTreeStationScene(
  scene: THREE.Scene,
  narration: Narration,
  whisper: (text: string, ms?: number) => void,
): LessonScene {
  const tickers: Array<() => void> = [];
  const ours: Array<{ dispose: () => void }> = [];
  let lessonGroup: THREE.Group | null = null;
  // Scene-local life clock for ambient motion: ctx.uT freezes when narration
  // isn't playing; living stillness must not (garden.ts precedent).
  let lifeT = 0;

  const build = (ctx: LessonCtx): void => {
    const kit: CreationKit = ctx.kit;
    // ctx.uT is the narration clock; at runtime it is a TSL uniform node
    const uT = ctx.uT as any;
    lessonGroup = ctx.group;

    // root at the seat, local coords per §2; kit makers take seat-local coords
    const root = new THREE.Group();
    root.position.copy(seatPos);
    ctx.group.add(root);
    // the site is a steep slope: the tree stands ~5m above the seat. Lift the
    // whole tree cluster so the trunk base sits on the terrain at the tree.
    const TREE_LIFT = heightAt(SITE.x + TREE.x, SITE.z + TREE.z) - seatPos.y;
    const treeG = new THREE.Group();
    treeG.position.y = TREE_LIFT;
    root.add(treeG);
    ctx.group.add(kit.group);
    kit.group.position.copy(seatPos);

    // shared choreography uniforms — one uniform() per value (STYLE_GUIDE)
    const uLife = T.uniform(0);
    const uInner = T.uniform(0);
    const uSpirit = T.uniform(0);
    const uWater = T.uniform(0);
    const uPaint = T.uniform(0);

    tickers.push(() => {
      uLife.value = lifeT;
    });

    // ── the great tree: trunk (seeded jitter, slight lean) ───────────────────
    const bark = makeBark();
    ours.push(bark);
    const trunkGeo = new THREE.CylinderGeometry(0.55, 0.95, 7, 14, 6);
    {
      const pos = trunkGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(
          i,
          pos.getX(i) + (rnd(i, 1) - 0.5) * 0.12,
          pos.getY(i) + (rnd(i, 2) - 0.5) * 0.12,
          pos.getZ(i) + (rnd(i, 3) - 0.5) * 0.12,
        );
      }
      pos.needsUpdate = true;
      trunkGeo.computeVertexNormals();
    }
    ours.push(trunkGeo);
    const trunk = new THREE.Mesh(trunkGeo, bark);
    trunk.position.set(TREE.x, 3.5, TREE.z);
    trunk.rotation.z = 0.03;
    treeG.add(trunk);

    // ── 7 primary branches: stubs stay, distal parts break at tB_i and land ──
    const A0 = Math.atan2(-TREE.z, -TREE.x); // branch 0 points from the trunk toward the seat
    const branchTips: THREE.Vector3[] = [];
    const branchB: THREE.Vector3[] = [];
    const branchDirH: THREE.Vector3[] = [];
    const distalGrp: THREE.Group[] = [];
    const distalB: THREE.Vector3[] = [];
    const distalLand: THREE.Vector3[] = [];
    const distalRotX: number[] = [];
    const distalRotZ: number[] = [];
    const notchMats: Array<{ uniforms: { op: { value: number } } }> = [];
    const taper = (h: number): number => 0.95 + (0.55 - 0.95) * (h / 7); // trunk radius at height h

    for (let i = 0; i < 7; i++) {
      const h = 3.4 + i * 0.42;
      const a = A0 + i * ((Math.PI * 2) / 7) + (rnd(i, 11) - 0.5) * 0.5;
      const dir = new THREE.Vector3(Math.cos(a) * 0.75, 0.55 + rnd(i, 12) * 0.2, Math.sin(a) * 0.75).normalize();
      const L = 2.4 + rnd(i, 13) * 0.9;
      const rH = taper(h) * 1.02;
      const S = new THREE.Vector3(TREE.x + Math.cos(a) * rH, h, TREE.z + Math.sin(a) * rH);
      const B = S.clone().addScaledVector(dir, L * 0.35);
      const tip = S.clone().addScaledVector(dir, L).add(new THREE.Vector3(0, 0.35, 0));
      const dirH = new THREE.Vector3(dir.x, 0, dir.z);
      if (dirH.lengthSq() > 1e-6) dirH.normalize();
      else dirH.set(0, 0, 1);
      branchTips.push(tip);
      branchB.push(B);
      branchDirH.push(dirH);

      // stub — stays forever
      const stubCurve = new THREE.CatmullRomCurve3([
        S,
        S.clone().lerp(B, 0.5).add(new THREE.Vector3(0, 0.08, 0)),
        B,
      ]);
      const stubGeo = new THREE.TubeGeometry(stubCurve, 12, 0.085, 8);
      ours.push(stubGeo);
      treeG.add(new THREE.Mesh(stubGeo, bark));

      // distal part — breaks off and lands; group origin at the break point
      const distal = new THREE.Group();
      distal.position.copy(B);
      treeG.add(distal);
      const relTip = tip.clone().sub(B);
      const distalCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        relTip.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0.1, 0)),
        relTip,
      ]);
      const distalGeo = new THREE.TubeGeometry(distalCurve, 12, 0.05, 7);
      ours.push(distalGeo);
      distal.add(new THREE.Mesh(distalGeo, bark));
      distalGrp.push(distal);
      distalB.push(B.clone());
      distalLand.push(new THREE.Vector3(B.x + dirH.x * 1.1, 0.14, B.z + dirH.z * 1.1));
      distalRotX.push(2.0 + rnd(i, 14) * 0.8);
      distalRotZ.push(1.4 + rnd(i, 15) * 0.6);

      // notch — the opening the spirit comes through: dark torus + pale gold disc
      const notch = new THREE.Group();
      notch.position.copy(B);
      notch.quaternion.setFromUnitVectors(Z_AXIS, dir);
      treeG.add(notch);
      const torusGeo = new THREE.TorusGeometry(0.1, 0.028, 8, 20);
      ours.push(torusGeo);
      notch.add(new THREE.Mesh(torusGeo, bark));
      const notchMat = glowShader({ op: 0 }, (u, _uv) => T.vec3(1.0, 0.85, 0.55).mul(u.op), {});
      ours.push(notchMat);
      const discGeo = new THREE.CircleGeometry(0.075, 16);
      ours.push(discGeo);
      notch.add(new THREE.Mesh(discGeo, notchMat));
      notchMats.push(notchMat);
    }

    // breaks + notches + inner glow: one pure ticker over uT
    tickers.push(() => {
      const nt = ctx.uT.value;
      const innerK = fadeU(ctx.uT, 106, 114, 128, 140);
      uInner.value = innerK;
      for (let i = 0; i < 7; i++) {
        const tB = 70 + i * 2.2;
        let q = smooth01((nt - tB) * 0.25);
        q = q * q * (3 - 2 * q);
        const p = Math.pow(q, 1.6); // accelerating fall
        distalGrp[i].position.lerpVectors(distalB[i], distalLand[i], p);
        distalGrp[i].rotation.x = p * distalRotX[i];
        distalGrp[i].rotation.z = p * distalRotZ[i];
        notchMats[i].uniforms.op.value = ramp(ctx.uT, tB, tB + 2) * (0.35 + 0.8 * innerK);
      }
    });

    // ── canopy: 750 leaves hung around the branch tips (creation.ts idiom) ───
    const leafMat = softPoints();
    ours.push(leafMat);
    const canopy = spriteCloud(750, { base: 3, aK: 1, aHue: 1, aLand: 3, aFall: 1 }, leafMat);
    {
      const baseA = canopy.attrs.base.array as Float32Array;
      const kA = canopy.attrs.aK.array as Float32Array;
      const hueA = canopy.attrs.aHue.array as Float32Array;
      const landA = canopy.attrs.aLand.array as Float32Array;
      const fallA = canopy.attrs.aFall.array as Float32Array;
      for (let k = 0; k < 750; k++) {
        const b = k % 7;
        const tip = branchTips[b];
        let bx = tip.x;
        let by = tip.y;
        let bz = tip.z;
        if (rnd(k, 34) < 0.15) {
          // 15% sit along the branch itself
          const s = 0.5 + 0.5 * rnd(k, 35);
          const Bv = branchB[b];
          bx = Bv.x + (tip.x - Bv.x) * s;
          by = Bv.y + (tip.y - Bv.y) * s;
          bz = Bv.z + (tip.z - Bv.z) * s;
        }
        const u = rnd(k, 31) * 2 - 1;
        const th = rnd(k, 32) * Math.PI * 2;
        const rr = 0.95 * Math.cbrt(rnd(k, 33));
        const sp = Math.sqrt(Math.max(0, 1 - u * u));
        bx += Math.cos(th) * sp * rr;
        by += u * rr;
        bz += Math.sin(th) * sp * rr;
        baseA[k * 3] = bx;
        baseA[k * 3 + 1] = by;
        baseA[k * 3 + 2] = bz;
        kA[k] = rnd(k, 36);
        hueA[k] = rnd(k, 37);
        // if the branch breaks, the leaf lands beside the fallen wood
        const dh = branchDirH[b];
        landA[k * 3] = bx + dh.x * 1.1;
        landA[k * 3 + 1] = 0.12;
        landA[k * 3 + 2] = bz + dh.z * 1.1;
        // ~1/8 of the leaves shed early in the dry season (fallen leaves at t=60)
        fallA[k] = rnd(k, 38) < 0.125 ? 40 + rnd(k, 39) * 16 : 70 + b * 2.2;
      }
      canopy.attrs.base.needsUpdate = true;
      canopy.attrs.aK.needsUpdate = true;
      canopy.attrs.aHue.needsUpdate = true;
      canopy.attrs.aLand.needsUpdate = true;
      canopy.attrs.aFall.needsUpdate = true;
    }
    {
      const { base, aK, aHue, aLand, aFall } = canopy.nodes;
      const dry = T.smoothstep(35, 55, uT).mul(T.float(1).sub(T.smoothstep(150, 190, uT)));
      const fallP = T.smoothstep(aFall, aFall.add(4), uT);
      const keep = T.float(1).sub(fallP);
      const sway = T.vec3(
        T.sin(uT.mul(0.7).add(aK.mul(40))).mul(0.08),
        T.sin(uT.mul(0.9).add(aK.mul(23))).mul(0.06),
        0,
      );
      const lp = T.mix(base, aLand, fallP)
        .add(sway.mul(keep))
        .add(T.vec3(0, dry.mul(keep).mul(-0.25), 0)); // dry droop, only while still up
      leafMat.positionNode = lp;
      // deep green-gold foliage: the old near-white bands stacked additively over
      // 750 sprites and clipped to white. Each leaf now carries only K of its
      // green-gold band colour through a 0–1 soft mask (the old mask peaked at
      // 2.7), so the canopy accumulates to painterly mid-tones, unclipped.
      const bandC = T.mix(
        T.mix(T.vec3(0.62, 0.52, 0.22), T.vec3(0.26, 0.4, 0.16), T.step(0.33, aHue)),
        T.vec3(0.52, 0.38, 0.15),
        T.step(0.72, aHue),
      );
      const vC = T.mix(bandC, T.vec3(0.34, 0.22, 0.1), dry.mul(0.85));
      const tw = T.sin(uT.mul(aK.mul(2.5).add(1.2)).add(aK.mul(60))).mul(0.45).add(0.55);
      const wave = T.sin(uT.mul(0.5).sub(lp.y.mul(0.4))).mul(0.4).add(0.6);
      const vA = T.mix(1.0, 0.55, fallP).mul(T.mix(1.0, 0.8, dry));
      const r = T.length(T.pointUV.sub(0.5)).mul(2);
      const mask = T.smoothstep(1, 0, r).mul(0.6).add(T.smoothstep(0.35, 0, r).mul(0.4));
      leafMat.colorNode = T.vec4(vC.mul(tw).mul(wave).mul(vA).mul(mask).mul(0.12), 1);
      leafMat.sizeNode = pxSize(T.mix(0.45, 0.95, aK).mul(T.float(1).sub(dry.mul(0.4))), lp);
    }
    canopy.setCount(750);
    treeG.add(canopy.sprite);

    // ── new growth (rebirth, NOT restoration): 5 upward branches + fresh leaves
    const newGrowth = new THREE.Group();
    treeG.add(newGrowth);
    const newTips: THREE.Vector3[] = [];
    const newGrp: THREE.Group[] = [];
    for (let j = 0; j < 5; j++) {
      const nh = 2.6 + j * 0.55;
      const na = j * ((Math.PI * 2) / 5) + 0.63;
      const dirN = new THREE.Vector3(Math.cos(na) * 0.5, 0.8, Math.sin(na) * 0.5).normalize();
      const Ln = 1.8 + rnd(j, 21) * 0.8;
      const rH = taper(nh) * 1.02;
      const S = new THREE.Vector3(TREE.x + Math.cos(na) * rH, nh, TREE.z + Math.sin(na) * rH);
      const grp = new THREE.Group();
      grp.position.copy(S);
      grp.scale.setScalar(0.001);
      newGrowth.add(grp);
      newGrp.push(grp);
      const relTip = dirN.clone().multiplyScalar(Ln);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        relTip.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0.12, 0)),
        relTip,
      ]);
      const geo = new THREE.TubeGeometry(curve, 12, 0.05, 7);
      ours.push(geo);
      grp.add(new THREE.Mesh(geo, bark));
      newTips.push(S.add(relTip));
    }
    tickers.push(() => {
      const nt = ctx.uT.value;
      for (let j = 0; j < 5; j++) {
        const p = smooth01((nt - (162 + j * 3)) / 34);
        newGrp[j].scale.setScalar(Math.max(1e-3, 1 - (1 - p) * (1 - p) * (1 - p)));
      }
    });

    // fresh leaves around the new tips, in the leaves group's local space
    const leafCenter = new THREE.Vector3();
    for (const tp of newTips) leafCenter.add(tp);
    leafCenter.multiplyScalar(1 / Math.max(1e-6, newTips.length));
    const newLeaves = new THREE.Group();
    newLeaves.position.copy(leafCenter);
    newLeaves.scale.setScalar(0.001);
    newGrowth.add(newLeaves);
    tickers.push(() => {
      const p = smooth01((ctx.uT.value - 164) / 34);
      newLeaves.scale.setScalar(Math.max(1e-3, 1 - (1 - p) * (1 - p) * (1 - p)));
    });

    const leafMat2 = softPoints();
    ours.push(leafMat2);
    const canopy2 = spriteCloud(300, { base: 3, aK: 1, aHue: 1 }, leafMat2);
    {
      const baseA = canopy2.attrs.base.array as Float32Array;
      const kA = canopy2.attrs.aK.array as Float32Array;
      const hueA = canopy2.attrs.aHue.array as Float32Array;
      for (let k = 0; k < 300; k++) {
        const j = k % 5;
        const anchor = newTips[j].clone().sub(leafCenter);
        const u = rnd(k, 41) * 2 - 1;
        const th = rnd(k, 42) * Math.PI * 2;
        const rr = 0.55 * Math.cbrt(rnd(k, 43));
        const sp = Math.sqrt(Math.max(0, 1 - u * u));
        baseA[k * 3] = anchor.x + Math.cos(th) * sp * rr;
        baseA[k * 3 + 1] = anchor.y + u * rr;
        baseA[k * 3 + 2] = anchor.z + Math.sin(th) * sp * rr;
        kA[k] = rnd(k, 44);
        hueA[k] = rnd(k, 45);
      }
      canopy2.attrs.base.needsUpdate = true;
      canopy2.attrs.aK.needsUpdate = true;
      canopy2.attrs.aHue.needsUpdate = true;
    }
    {
      const { base, aK, aHue } = canopy2.nodes;
      const sway2 = T.vec3(
        T.sin(uT.mul(0.8).add(aK.mul(31))).mul(0.05),
        T.sin(uT.mul(0.9).add(aK.mul(19))).mul(0.04),
        0,
      );
      const lp2 = base.add(sway2);
      leafMat2.positionNode = lp2;
      // fresh green-gold, a touch brighter than the old canopy (new growth is the
      // luminous beat) but the same unclipped discipline: 0–1 mask × K
      const vC2 = T.mix(T.vec3(0.78, 0.64, 0.24), T.vec3(0.34, 0.52, 0.2), T.step(0.5, aHue));
      const tw2 = T.sin(uT.mul(aK.mul(2.2).add(1.1)).add(aK.mul(52))).mul(0.35).add(0.65);
      const r2 = T.length(T.pointUV.sub(0.5)).mul(2);
      const mask2 = T.smoothstep(1, 0, r2).mul(0.6).add(T.smoothstep(0.35, 0, r2).mul(0.4));
      leafMat2.colorNode = T.vec4(vC2.mul(tw2).mul(mask2).mul(0.16), 1);
      leafMat2.sizeNode = pxSize(T.mix(0.45, 1.0, aK), lp2);
    }
    canopy2.setCount(300);
    newLeaves.add(canopy2.sprite);

    // ── ground: soft clearing disc + gold ring around the tree ───────────────
    const groundMat = makeGround();
    ours.push(groundMat);
    // terrain-conforming disc: the old flat CircleGeometry sat at local y=0 and
    // was buried wherever the slope rises, so the "black ground" in the stills
    // was raw world terrain, not the disc. A dense ring-disc hugs
    // heightAt + 7cm instead.
    const groundGeo = new THREE.RingGeometry(0.02, 17, 72, 20);
    groundGeo.rotateX(-Math.PI / 2);
    {
      const pos = groundGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const wx = SITE.x + pos.getX(i);
        const wz = SITE.z + pos.getZ(i);
        pos.setY(i, heightAt(wx, wz) - seatPos.y + 0.07);
      }
      pos.needsUpdate = true;
      groundGeo.computeVertexNormals();
    }
    ours.push(groundGeo);
    root.add(new THREE.Mesh(groundGeo, groundMat));

    kit.groundDisc(4.2, 0xffd700, 0.5, 0.02);
    // the kit parks its ring at the kit origin — move it around the tree
    const goldRing = kit.group.children[kit.group.children.length - 1] as THREE.Mesh;
    treeG.add(goldRing);
    goldRing.position.set(TREE.x, 0.02, TREE.z);

    // path lights lead from behind the seat toward the tree (seat-local coords)
    kit.pathLights([
      new THREE.Vector3(0, 0.12, -3),
      new THREE.Vector3(0.4, 0.12, -1),
      new THREE.Vector3(0.9, 0.12, 1),
      new THREE.Vector3(1.3, 0.12, 3),
      new THREE.Vector3(1.7, 0.12, 5),
    ]);

    // ── forest ring: 14 dark trunk silhouettes (seeded) ──────────────────────
    const forestGeo = new THREE.CylinderGeometry(0.3, 0.55, 1, 8, 1);
    ours.push(forestGeo);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (rnd(i, 5) - 0.5) * 0.45;
      const r = 17 + rnd(i, 6) * 8;
      const h = 8 + rnd(i, 7) * 6;
      const m = new THREE.Mesh(forestGeo, bark);
      m.position.set(Math.cos(a) * r, h * 0.5, Math.sin(a) * r);
      m.scale.set(0.8 + rnd(i, 8) * 0.7, h, 0.8 + rnd(i, 9) * 0.7);
      m.rotation.y = rnd(i, 10) * Math.PI;
      root.add(m);
    }

    // distant birds so the sky is never empty
    kit.birds(7, new THREE.Vector3(TREE.x, 9, TREE.z), 22, 10);

    // ── fireflies drifting in the clearing (lifeT — ambient life) ────────────
    const flyMat = softPoints();
    ours.push(flyMat);
    const flies = spriteCloud(40, { position: 3, aK: 1 }, flyMat);
    {
      const pA = flies.attrs.position.array as Float32Array;
      const kA = flies.attrs.aK.array as Float32Array;
      for (let k = 0; k < 40; k++) {
        const a = rnd(k, 51) * Math.PI * 2;
        const r = 2 + Math.sqrt(rnd(k, 52)) * 11;
        pA[k * 3] = Math.cos(a) * r;
        pA[k * 3 + 1] = 0.3 + rnd(k, 53) * 2.7;
        pA[k * 3 + 2] = Math.sin(a) * r;
        kA[k] = rnd(k, 54);
      }
      flies.attrs.position.needsUpdate = true;
      flies.attrs.aK.needsUpdate = true;
    }
    {
      const { position, aK } = flies.nodes;
      const drift = T.vec3(
        T.sin(uLife.mul(0.11).add(aK.mul(17))).mul(0.6),
        T.sin(uLife.mul(0.13).add(aK.mul(23))).mul(0.35),
        T.cos(uLife.mul(0.09).add(aK.mul(29))).mul(0.6),
      );
      const fp = position.add(drift);
      flyMat.positionNode = fp;
      const tw3 = T.sin(uLife.mul(aK.mul(1.8).add(0.9)).add(aK.mul(71))).mul(0.3).add(0.55);
      const r3 = T.length(T.pointUV.sub(0.5)).mul(2);
      const mask3 = T.smoothstep(1, 0, r3).mul(1.4).add(T.smoothstep(0.35, 0, r3).mul(1.1));
      flyMat.colorNode = T.vec4(T.vec3(1.0, 0.85, 0.55).mul(tw3).mul(mask3), 1);
      flyMat.sizeNode = pxSize(T.mix(0.35, 0.8, aK), fp);
    }
    flies.setCount(40);
    treeG.add(flies.sprite);

    // ── inner glow inside the trunk (t 106–140) ──────────────────────────────
    const innerMat = glowShader(
      { intensity: 0 },
      (u, _uv) =>
        T.vec3(1.0, 0.85, 0.55)
          .mul(u.intensity)
          .mul(T.float(1).sub(T.smoothstep(0.1, 0.55, T.length(T.positionLocal)))),
      {},
    );
    ours.push(innerMat);
    const innerGeo = new THREE.SphereGeometry(0.55, 20, 14);
    ours.push(innerGeo);
    const innerGlow = new THREE.Mesh(innerGeo, innerMat);
    innerGlow.position.set(2.5, 4.2, 8);
    treeG.add(innerGlow);
    tickers.push(() => {
      innerMat.uniforms.intensity.value = 0.9 * fadeU(ctx.uT, 106, 114, 128, 140);
    });

    // ── spirit: emerges FROM WITHIN the trunk (t 115–138) ────────────────────
    const spirit = new THREE.Group();
    spirit.position.copy(SPIRIT_FROM);
    treeG.add(spirit);
    const shellGeo = new THREE.SphereGeometry(1, 20, 14);
    ours.push(shellGeo);
    const mkShell = (sx: number, sy: number, sz: number, w: number): void => {
      const mat = glowShader({}, () => T.vec3(1.0, 0.9, 0.7).mul(uSpirit).mul(w), {});
      ours.push(mat);
      const m = new THREE.Mesh(shellGeo, mat);
      m.scale.set(sx, sy, sz);
      spirit.add(m);
    };
    mkShell(0.34, 0.58, 0.34, 1.0); // core ellipsoid
    mkShell(0.425, 0.725, 0.425, 0.25); // shells — 1.25×, 1.6× of the core
    mkShell(0.544, 0.928, 0.544, 0.12);
    const headGeo = new THREE.SphereGeometry(0.17, 16, 12);
    ours.push(headGeo);
    const headMat = glowShader({}, () => T.vec3(1.0, 0.9, 0.7).mul(uSpirit), {});
    ours.push(headMat);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.72;
    spirit.add(head);

    // two orbiting trail wisps
    const wispGeo = new THREE.SphereGeometry(0.1, 12, 8);
    ours.push(wispGeo);
    const wispMat = glowShader({}, () => T.vec3(1.0, 0.9, 0.7).mul(uSpirit).mul(0.55), {});
    ours.push(wispMat);
    const wispA = new THREE.Mesh(wispGeo, wispMat);
    const wispB = new THREE.Mesh(wispGeo, wispMat);
    spirit.add(wispA, wispB);

    tickers.push(() => {
      const nt = ctx.uT.value;
      uSpirit.value = ramp(ctx.uT, 115, 128);
      spirit.visible = uSpirit.value > 1e-3;
      const e = smooth01((nt - 115) * (1 / 23)); // easeInOut of (uT-115)/23
      const d = smooth01((nt - 225) * (1 / 15)); // drifts toward the painting
      spirit.position.lerpVectors(SPIRIT_FROM, SPIRIT_HOVER, e);
      spirit.position.lerp(SPIRIT_PAINT, d);
      spirit.position.y += 0.12 * Math.sin(nt * 0.9) * smooth01((nt - 138) * (1 / 6));
      const ang = nt * ((Math.PI * 2) / 9); // period ~9 s
      wispA.position.set(Math.cos(ang) * 0.5, Math.sin(nt * 0.7) * 0.2, Math.sin(ang) * 0.5);
      wispB.position.set(Math.cos(ang + 2.4) * 0.5, Math.sin(nt * 0.7 + 1.9) * 0.2, Math.sin(ang + 2.4) * 0.5);
    });

    // ── water: 3 streams from the spirit to the roots (t 146–212) + root mist ─
    const streamMat = glowShader(
      {},
      (_u, uv) => {
        const flow = T.pow(T.fract(uv.x.mul(3).sub(uT.mul(0.7))), 6);
        const col = T.mix(T.vec3(0.72, 0.85, 1.0), T.vec3(1.0, 0.85, 0.55), uv.x);
        return col.mul(T.float(0.25).add(flow)).mul(uWater);
      },
      {},
    );
    ours.push(streamMat);
    const pours: Array<[number, number]> = [
      [0.4, 0.2],
      [-0.5, 0.3],
      [0.1, -0.5],
    ];
    for (const [dx, dz] of pours) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(1.3, 2.2, 6.4),
        new THREE.Vector3(1.8, 1.1, 7.0),
        new THREE.Vector3(TREE.x + dx, 0.15, TREE.z + dz),
      );
      const geo = new THREE.TubeGeometry(curve, 20, 0.055, 6);
      ours.push(geo);
      treeG.add(new THREE.Mesh(geo, streamMat));
    }
    tickers.push(() => {
      uWater.value = fadeU(ctx.uT, 146, 156, 198, 212);
    });

    // root mist — worldPoints with a TSL rise driven by the narration clock
    const mistPos = new Float32Array(60 * 3);
    for (let k = 0; k < 60; k++) {
      const a = rnd(k, 61) * Math.PI * 2;
      const r = 0.4 + rnd(k, 62) * 1.4;
      mistPos[k * 3] = TREE.x + Math.cos(a) * r;
      mistPos[k * 3 + 1] = 0.15;
      mistPos[k * 3 + 2] = TREE.z + Math.sin(a) * r;
    }
    const mist = worldPoints(mistPos, { size: 0.5, opacity: 0.5 });
    ours.push(mist.material);
    {
      const mp = T.instancedBufferAttribute(mist.position);
      const seed = T.fract(mp.x.mul(12.9898).add(mp.z.mul(78.233)));
      const y = T.float(0.15).add(T.fract(seed.add(uT.mul(0.06))).mul(1.1));
      mist.material.positionNode = T.vec3(mp.x, y, mp.z);
      mist.material.colorNode = T.vec4(T.vec3(0.72, 0.85, 1.0).mul(uWater).mul(0.6), 1);
      mist.sprite.frustumCulled = false;
      treeG.add(mist.sprite);
    }

    // ── the painting (t 222+): a luminous canvas of the tree, wounds included ─
    const painting = new THREE.Group();
    painting.position.copy(PAINT_POS);
    treeG.add(painting);
    const canvasMat = glowShader({}, (_u, uv) => paintingColor(uv, uT, uPaint), { side: THREE.DoubleSide });
    ours.push(canvasMat);
    const canvasGeo = new THREE.PlaneGeometry(2.2, 2.8);
    ours.push(canvasGeo);
    painting.add(new THREE.Mesh(canvasGeo, canvasMat));

    const frameMat = glowShader({}, () => T.vec3(1.0, 0.843, 0.0).mul(uPaint).mul(0.5), {});
    ours.push(frameMat);
    const frameLongGeo = new THREE.BoxGeometry(2.44, 0.07, 0.05);
    const frameShortGeo = new THREE.BoxGeometry(0.07, 2.94, 0.05);
    ours.push(frameLongGeo, frameShortGeo);
    const frameBars: Array<[THREE.BufferGeometry, number, number]> = [
      [frameLongGeo, 0, 1.435],
      [frameLongGeo, 0, -1.435],
      [frameShortGeo, 1.185, 0],
      [frameShortGeo, -1.185, 0],
    ];
    for (const [geo, x, y] of frameBars) {
      const bar = new THREE.Mesh(geo, frameMat);
      bar.position.set(x, y, 0);
      painting.add(bar);
    }
    painting.lookAt(new THREE.Vector3(seatPos.x, seatPos.y + 1.3, seatPos.z));
    tickers.push(() => {
      const pv = smooth01((ctx.uT.value - 222) * 0.1);
      uPaint.value = pv;
      painting.visible = pv > 1e-3;
      painting.scale.setScalar(0.92 + 0.08 * pv);
      painting.position.y = PAINT_POS.y + 0.05 * Math.sin(ctx.uT.value * 0.7) * pv;
    });

    keepsAlpha(ctx.group);
  };

  const opts: LessonOpts = {
    id: "tree-station",
    trackId: "TREE",
    seatPos,
    seatHeading,
    seatRadius: 3,
    build,
    beats,
  };

  class TreeStationSceneImpl extends LessonScene {
    update(dt: number): void {
      super.update(dt);
      const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0;
      lifeT += step;
      for (const tick of tickers) tick();
    }

    dispose(): void {
      for (let i = 0; i < ours.length; i++) ours[i].dispose();
      ours.length = 0;
      tickers.length = 0;
      if (lessonGroup) {
        lessonGroup.removeFromParent();
        lessonGroup = null;
      }
      super.dispose();
    }
  }

  return new TreeStationSceneImpl(scene, narration, whisper, opts);
}
// END OF FILE
