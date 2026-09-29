// ─────────────────────────────────────────────────────────────────────────────
//  src/scenes/garden.ts — PART 1 of 2
//  module skeleton + narration data (beats + heat keys) + 3 moonlit palm
//  silhouettes. PART 2 (flame + roads + ring) drops into the
//  // __PART2_FLAME_ROADS_RING__ anchor at the end of build().
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three/webgpu";
import { LessonScene } from "./lessonKit";
import type { LessonCtx, LessonOpts, Beat } from "./lessonKit";
import { CreationKit } from "./creationKit";
import { SITES } from "./sites";
import { heightAt } from "../world/terrain";
import { glowShader, softPoints, spriteCloud, viewDepth, gpuUniforms, T } from "../gpu/tsl";
import type { Narration } from "../core/narration";

// pixel size helper for soft leaf points
/* eslint-disable @typescript-eslint/no-explicit-any */
const pxSize = (size: any, p: any): any =>
  T.clamp(T.mul(size, gpuUniforms.px).div(T.max(viewDepth(p), 0.5)), 1.5, 90).div(T.screenDPR);

// ── helpers (defined once; PART 2 reuses them) ───────────────────────────────

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

// narration heat, [s, heat] (verbatim)
const heatKeys: ReadonlyArray<readonly [number, number]> = [
  [0,0],[16.11,0],[19.11,0.55],[29.93,0.65],[33.93,0.8],[83.41,0.85],[86.41,0.6],[106.28,0.55],[109.28,0.3],
  [155.29,0.3],[158.29,0.3],[161.46,0.3],[164.46,0.55],[194.66,0.6],[197.66,0.5],[207.99,0.5],[210.99,0.65],
  [244.37,0.65],[247.37,0.55],[279.17,0.55],[282.17,0.65],[291.00,0.65],[294.00,0.72],[338.13,0.75],[341.13,0.9],
  [386.94,1.0],[389.94,0.8],[431.48,0.78],[434.48,0.7],[474.93,0.68],[477.93,0.45],[537.46,0.42],[540.46,0.25],
  [546.21,0.24],[590.55,0.22],[598.90,0.18],[617.00,0.15],[620.98,0.08]
];

// smoothstep-interpolated heat lookup; division guarded with Math.max(1e-6, t1 - t0)
const sampleKeys = (t: number): number => {
  let out = 0;
  let prev: readonly [number, number] | null = null;
  for (const key of heatKeys) {
    const t1 = key[0];
    const h1 = key[1];
    if (prev === null) {
      if (t <= t1) return h1;
      prev = key;
      out = h1;
      continue;
    }
    const t0 = prev[0];
    const h0 = prev[1];
    if (t <= t1) {
      const u = (t - t0) / Math.max(1e-6, t1 - t0);
      return h0 + (h1 - h0) * smooth01(u);
    }
    prev = key;
    out = h1;
  }
  return out;
};

// additive materials keep their alpha channel:
// CustomBlending / AddEquation / SrcAlphaFactor / OneFactor / ZeroFactor / OneFactor
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

// ── garden ground: deep mossy green-blue base + animated dappled canopy light ─
/* eslint-disable @typescript-eslint/no-explicit-any */
const makeGardenGround = (uLife: any, seatPos: THREE.Vector3, palmCenterBase: THREE.Vector3): THREE.MeshBasicNodeMaterial => {
  const m = new THREE.MeshBasicNodeMaterial();
  m.fog = true;
  const pos = T.positionWorld;
  const rel = pos.sub(T.vec3(seatPos.x, seatPos.y, seatPos.z));

  // Per-pixel hash grain & moss noise
  const grainSeed = T.dot(pos, T.vec3(12.9898, 78.233, 37.719));
  const hash = T.fract(T.sin(grainSeed).mul(T.float(43758.5453)));
  const grain = hash.sub(T.float(0.5)).mul(T.float(0.02));

  // Dappled light filtering through leaves onto ground
  const dappledUV = pos.xz.mul(0.65);
  const wave1 = T.sin(dappledUV.x.mul(1.8).add(dappledUV.y.mul(2.2)).add(uLife.mul(0.35)));
  const wave2 = T.cos(dappledUV.x.mul(2.7).sub(dappledUV.y.mul(1.5)).add(uLife.mul(0.25)));
  const wave3 = T.sin(dappledUV.x.mul(4.1).add(dappledUV.y.mul(3.8)).sub(uLife.mul(0.45)));
  const dappled = T.smoothstep(0.25, 0.85, wave1.add(wave2).add(wave3).mul(0.33).add(0.5));

  // Golden-green dappled light color
  const dappleColor = T.vec3(0.58, 0.5, 0.2).mul(dappled).mul(0.38);

  // Deep mossy emerald-blue base
  const mossBase = T.vec3(0.012, 0.038, 0.028).add(grain);

  // Warm central glow near palm/flame center
  const distFlame = T.length(pos.xz.sub(T.vec2(palmCenterBase.x, palmCenterBase.z)));
  const centerWarmth = T.exp(distFlame.mul(distFlame).mul(-0.06)).mul(T.vec3(0.12, 0.095, 0.04));

  // Outer radial falloff to edge of clearing
  const rClearing = T.length(rel.xz);
  const edgeFalloff = T.float(1.0).sub(T.smoothstep(12.0, 18.0, rClearing).mul(0.7));

  const finalCol = mossBase.add(dappleColor).add(centerWarmth).mul(edgeFalloff);
  m.colorNode = T.vec4(finalCol, 1.0);
  return m;
};

// ── bark material: organic ridges + mossy undertones + gold grain + silver rim ─
const makeBark = (): THREE.MeshBasicNodeMaterial => {
  const m = new THREE.MeshBasicNodeMaterial();
  m.fog = true;
  const n = T.normalize(T.normalWorld);
  const v = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const k = T.pow(T.float(1.0).sub(T.abs(T.dot(n, v))), 4.0);
  const rim = T.vec3(0.7, 0.82, 1.0).mul(0.28).mul(k);
  const hemi = T.vec3(0.3, 0.5, 0.35).mul(0.2).mul(n.y.mul(0.5).add(0.5));
  const base = T.vec3(0.008, 0.016, 0.014).add(hemi);
  const ang = T.atan(T.positionLocal.z, T.positionLocal.x);
  const lines = T.sin(ang.mul(18).add(T.sin(T.positionLocal.y.mul(4)).mul(1.5)))
    .mul(0.5)
    .add(0.5);
  const grain = T.vec3(0.9, 0.72, 0.42).mul(lines).mul(0.032);
  m.colorNode = T.vec4(base.add(grain).add(rim), 1.0);
  return m;
};

// ── frond material: living green-gold with sunlight translucency and rim glow ─
const makeFrondMaterial = (): THREE.MeshBasicNodeMaterial => {
  const m = new THREE.MeshBasicNodeMaterial();
  m.fog = true;
  m.side = THREE.DoubleSide;
  const n = T.normalize(T.normalWorld);
  const v = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const ndv = T.abs(T.dot(n, v));
  const fres = T.pow(T.float(1.0).sub(ndv), 3.0);

  const uFrond = T.uv().x; // along length
  const baseCol = T.vec3(0.12, 0.28, 0.15); // stem deep emerald
  const tipCol = T.vec3(0.68, 0.58, 0.22);  // tip golden-green
  const leafCol = T.mix(baseCol, tipCol, uFrond);

  const sunRim = T.vec3(0.95, 0.88, 0.55).mul(fres).mul(0.4);
  m.colorNode = T.vec4(leafCol.add(sunRim), 1.0);
  return m;
};

// ── canopy leaf cloud: soft points in "living green-gold" volume ─────────────
const buildCanopyCloud = (
  treeCenters: THREE.Vector3[],
  uLife: any,
  ours: Array<{ dispose: () => void }>
): THREE.Sprite => {
  const count = 800;
  const leafMat = softPoints();
  ours.push(leafMat);

  const cloud = spriteCloud(count, { base: 3, aK: 1, aHue: 1 }, leafMat);
  const baseA = cloud.attrs.base.array as Float32Array;
  const kA = cloud.attrs.aK.array as Float32Array;
  const hueA = cloud.attrs.aHue.array as Float32Array;

  for (let k = 0; k < count; k++) {
    const treeIdx = k % treeCenters.length;
    const center = treeCenters[treeIdx];
    const u = rnd(k, 101) * 2 - 1;
    const th = rnd(k, 102) * Math.PI * 2;
    const rr = 1.8 * Math.cbrt(rnd(k, 103));
    const sp = Math.sqrt(Math.max(0, 1 - u * u));

    baseA[k * 3] = center.x + Math.cos(th) * sp * rr;
    baseA[k * 3 + 1] = center.y + u * rr * 0.7 + 0.3;
    baseA[k * 3 + 2] = center.z + Math.sin(th) * sp * rr;

    kA[k] = rnd(k, 104);
    hueA[k] = rnd(k, 105);
  }

  cloud.attrs.base.needsUpdate = true;
  cloud.attrs.aK.needsUpdate = true;
  cloud.attrs.aHue.needsUpdate = true;

  const { base, aK, aHue } = cloud.nodes;
  const sway = T.vec3(
    T.sin(uLife.mul(0.85).add(aK.mul(37))).mul(0.09),
    T.sin(uLife.mul(1.1).add(aK.mul(23))).mul(0.06),
    T.cos(uLife.mul(0.75).add(aK.mul(19))).mul(0.08)
  );
  const lp = base.add(sway);
  leafMat.positionNode = lp;

  const goldAmber = T.vec3(0.75, 0.62, 0.22);
  const emeraldLeaf = T.vec3(0.22, 0.42, 0.18);
  const sunHighlight = T.vec3(0.95, 0.85, 0.48);

  const baseC = T.mix(goldAmber, emeraldLeaf, T.step(0.4, aHue));
  const finalC = T.mix(baseC, sunHighlight, T.step(0.8, aHue));

  const tw = T.sin(uLife.mul(aK.mul(2.2).add(1.0)).add(aK.mul(50))).mul(0.35).add(0.65);
  const r = T.length(T.pointUV.sub(0.5)).mul(2.0);
  const mask = T.smoothstep(1.0, 0.0, r).mul(0.6).add(T.smoothstep(0.35, 0.0, r).mul(0.4));

  leafMat.colorNode = T.vec4(finalC.mul(tw).mul(mask).mul(0.14), 1.0);
  leafMat.sizeNode = pxSize(T.mix(0.5, 1.1, aK), lp);

  cloud.setCount(count);
  return cloud.sprite;
};

// ── frond = curved tapered strip with a drooping tip (NOT a cone/sprite) ─────
const makeFrondGeo = (len: number, wid: number): THREE.BufferGeometry => {
  const g = new THREE.PlaneGeometry(len, wid, 8, 1);
  g.translate(len * 0.5, 0, 0); // base at x = 0, tip at x = len
  g.rotateX(-Math.PI * 0.5); // lay flat: length +X, width +Z, up +Y
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const u = Math.min(1, Math.max(0, x / Math.max(1e-6, len))); // guarded
    const y = pos.getY(i) - 0.38 * u * u; // droop: y -= 0.38*(x/len)^2
    const z = pos.getZ(i) * (1 - 0.75 * u); // taper: width *= 1 - 0.75*x/len
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
};

interface PalmGeos {
  upper: THREE.BufferGeometry;
  lower: THREE.BufferGeometry;
}

const DEG = Math.PI / 180;

// ── one palm: tapered trunk + crown of 2 whorls (8 upper + 9 lower fronds) ───
const makePalm = (
  base: THREE.Vector3,
  height: number,
  seed: number,
  barkMat: THREE.MeshBasicNodeMaterial,
  frondMat: THREE.MeshBasicNodeMaterial,
  geos: PalmGeos,
  ours: Array<{ dispose: () => void }>,
  sways: Array<(t: number) => void>,
): THREE.Group => {
  const palm = new THREE.Group();
  palm.position.copy(base);

  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.16, height, 14, 8);
  ours.push(trunkGeo);
  const trunk = new THREE.Mesh(trunkGeo, barkMat);
  trunk.position.y = height * 0.5;
  trunk.rotation.z = (rnd(seed, 1) - 0.5) * 0.14;
  palm.add(trunk);

  const crown = new THREE.Group();
  crown.position.y = height * 0.5;
  trunk.add(crown);

  const whorls = [
    { n: 8, geo: geos.upper, pitch: 25 * DEG, y: 0.14, phase: rnd(seed, 3) * Math.PI * 2 },
    { n: 9, geo: geos.lower, pitch: 45 * DEG, y: -0.06, phase: rnd(seed, 4) * Math.PI * 2 },
  ];

  for (let w = 0; w < whorls.length; w++) {
    const whorl = whorls[w];
    for (let k = 0; k < whorl.n; k++) {
      const frond = new THREE.Mesh(whorl.geo, frondMat);
      frond.rotation.order = "YZX";
      frond.rotation.set(
        0,
        (k / Math.max(1e-6, whorl.n)) * Math.PI * 2 + whorl.phase + (rnd(seed + k * 5 + w * 31, 2) - 0.5) * 0.3,
        -whorl.pitch,
      );
      frond.position.y = whorl.y + (rnd(seed + k * 17 + w * 23, 6) - 0.5) * 0.06;
      crown.add(frond);
    }
  }

  const phase = rnd(seed, 21) * Math.PI * 2;
  sways.push((t: number): void => {
    crown.rotation.z = 0.02 * Math.sin(t * 0.55 + phase);
  });

  return palm;
};

// ── narration data (verbatim) ────────────────────────────────────────────────
const beats: Beat[] = [0.00,11.53,16.11,29.93,83.41,95.84,106.28,155.29,161.46,194.66,207.99,244.37,279.17,291.00,338.13,386.94,431.48,474.93,537.46,546.21,590.55,598.90,617.00].map(t => ({ t, apply: () => {} }));

// ── layout (exact names) ─────────────────────────────────────────────────────
const site = SITES.garden;
const seatPos = new THREE.Vector3(site.x, site.y, site.z);
const heading = site.heading;
const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
const right = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
const palmGroundX = seatPos.x + forward.x * 2.5;
const palmGroundZ = seatPos.z + forward.z * 2.5;
const palmGroundY = heightAt(palmGroundX, palmGroundZ);
const maxH = (cx: number, cz: number, r: number): number => {
    let m = heightAt(cx, cz);
    for (let a = 0; a < 12; a++) {
        const th = (a / 12) * Math.PI * 2;
        m = Math.max(m, heightAt(cx + r * Math.cos(th), cz + r * Math.sin(th)));
    }
    return m;
};
const ringClearY = maxH(palmGroundX, palmGroundZ, 2.4) + 0.12;
const palmCenterBase = new THREE.Vector3(palmGroundX, palmGroundY, palmGroundZ);
const flameAnchor = palmCenterBase.clone().add(new THREE.Vector3(0, 4.8, 0));
const roadsOrigin = new THREE.Vector3(palmCenterBase.x, ringClearY, palmCenterBase.z);
const ringCenter = roadsOrigin.clone();

// ── scene ────────────────────────────────────────────────────────────────────
export function createGardenScene(scene: THREE.Scene, narration: Narration, whisper: (text: string, ms?: number) => void): LessonScene {
  const tickers: Array<() => void> = [];
  const ours: Array<{ dispose: () => void }> = [];
  let ctxU: { value: number } | null = null;
  let root: THREE.Object3D | null = null;
  // Scene-local life clock for ambient motion (desert/tree precedent): ctx.uT is the
  // narration clock and freezes when narration isn't playing; living stillness must not.
  let lifeT = 0;

  const build = (ctx: LessonCtx): void => {
    const kit: CreationKit = ctx.kit;
    ctx.group.add(kit.group);
    ctxU = ctx.uT;
    root = ctx.group;

    const sways: Array<(t: number) => void> = [];

    const barkMat = makeBark();
    const frondMat = makeFrondMaterial();
    ours.push(barkMat, frondMat);

    const geos: PalmGeos = {
      upper: makeFrondGeo(2.2, 0.35),
      lower: makeFrondGeo(2.6, 0.38),
    };
    ours.push(geos.upper, geos.lower);

    // three palms: centre tallest (~4.2 m), flanks at ±right*1.6, staggered in depth
    const centreH = 4.2;
    const leftH = 3.35 + 0.25 * rnd(21, 5);
    const rightH = 3.1 + 0.22 * rnd(22, 5);
    const leftPos = palmCenterBase
      .clone()
      .addScaledVector(right, -1.6)
      .addScaledVector(forward, 0.62 + 0.5 * rnd(23, 7));
    const rightPos = palmCenterBase
      .clone()
      .addScaledVector(right, 1.6)
      .addScaledVector(forward, -(0.55 + 0.55 * rnd(24, 7)));

    const uLife = T.uniform(0);
    tickers.push(() => {
      uLife.value = lifeT;
    });

    // ── terrain-conforming mossy dappled ground carpet ───────────────────────
    const groundMat = makeGardenGround(uLife, seatPos, palmCenterBase);
    ours.push(groundMat);
    const groundGeo = new THREE.RingGeometry(0.05, 18, 72, 24);
    groundGeo.rotateX(-Math.PI / 2);
    {
      const pos = groundGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const wx = seatPos.x + pos.getX(i);
        const wz = seatPos.z + pos.getZ(i);
        pos.setY(i, heightAt(wx, wz) - seatPos.y + 0.05);
      }
      pos.needsUpdate = true;
      groundGeo.computeVertexNormals();
    }
    ours.push(groundGeo);
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.copy(seatPos);
    ctx.group.add(groundMesh);

    // ── understory flora: soft glowing flowers in clearing ───────────────────
    kit.flowers(35, palmCenterBase.x, palmCenterBase.z, 6.5);
    kit.flowers(25, seatPos.x, seatPos.z, 7.5);

    kit.group.add(makePalm(palmCenterBase, centreH, 1, barkMat, frondMat, geos, ours, sways));
    kit.group.add(makePalm(leftPos, leftH, 2, barkMat, frondMat, geos, ours, sways));
    kit.group.add(makePalm(rightPos, rightH, 3, barkMat, frondMat, geos, ours, sways));

    const treeCrownCenters = [
      palmCenterBase.clone().add(new THREE.Vector3(0, centreH, 0)),
      leftPos.clone().add(new THREE.Vector3(0, leftH, 0)),
      rightPos.clone().add(new THREE.Vector3(0, rightH, 0)),
    ];
    const canopySprite = buildCanopyCloud(treeCrownCenters, uLife, ours);
    kit.group.add(canopySprite);

    // ── ambient life: floating seed pods/pollen + distant soaring birds ──────
    kit.floatingVegetation(palmCenterBase, 16);
    kit.birds(8, new THREE.Vector3(palmCenterBase.x, palmCenterBase.y + 14, palmCenterBase.z), 24, 8);

// ---- PART 2: flame, filtering light beams, rings, roads ----

// ── soft light beams filtering through leaves ───────────────────────────────
kit.beams([
  palmCenterBase.clone().add(new THREE.Vector3(-0.6, 0, -0.5)),
  palmCenterBase.clone().add(new THREE.Vector3(0.8, 0, 0.6)),
  seatPos.clone().add(new THREE.Vector3(1.2, 0, 1.5)),
], 9, 0.65);

// ── sacred ground disc ──────────────────────────────────────────────────────
kit.groundDisc(3.8, 0xffd700, 0.45, palmGroundY + 0.08);

const flameGroup = new THREE.Group();
flameGroup.position.copy(flameAnchor);
ctx.group.add(flameGroup);

const flameCoreMat = glowShader({intensity: 0.95}, (u, uv) => {
  const dist = T.length(uv.sub(0.5).mul(2.0));
  const core = T.exp(dist.mul(dist).mul(-12.0));
  const halo = T.exp(dist.mul(dist).mul(-3.0)).mul(T.float(1).sub(T.smoothstep(0.8, 1.0, dist)));
  const coreCol = T.vec3(1.0, 0.98, 0.92);
  const auraCol = T.vec3(1.0, 0.78, 0.35);
  return T.mix(auraCol, coreCol, core).mul(halo).mul(u.intensity).mul(2.2);
});
const flameCoreGeo = new THREE.SphereGeometry(0.35, 20, 14);
const flameCore = new THREE.Mesh(flameCoreGeo, flameCoreMat);
flameGroup.add(flameCore);

const flameHaloMat = glowShader({intensity: 0.25}, (u, uv) => {
  const dist = T.length(uv.sub(0.5).mul(2.0));
  const halo = T.exp(dist.mul(dist).mul(-2.5)).mul(T.float(1).sub(T.smoothstep(0.7, 1.0, dist)));
  return T.vec3(1.0, 0.68, 0.25).mul(halo).mul(u.intensity);
});
const flameHaloGeo = new THREE.SphereGeometry(1.2, 20, 14);
const flameHalo = new THREE.Mesh(flameHaloGeo, flameHaloMat);
flameGroup.add(flameHalo);

// Floating flame embers rising
const emberMat = softPoints();
ours.push(emberMat);
const emberCloud = spriteCloud(30, { position: 3, aK: 1 }, emberMat);
{
  const posA = emberCloud.attrs.position.array as Float32Array;
  const kA = emberCloud.attrs.aK.array as Float32Array;
  for (let k = 0; k < 30; k++) {
    posA[k * 3] = (rnd(k, 121) - 0.5) * 1.2;
    posA[k * 3 + 1] = rnd(k, 122) * 2.5;
    posA[k * 3 + 2] = (rnd(k, 123) - 0.5) * 1.2;
    kA[k] = rnd(k, 124);
  }
  emberCloud.attrs.position.needsUpdate = true;
  emberCloud.attrs.aK.needsUpdate = true;
}
{
  const { position, aK } = emberCloud.nodes;
  const riseY = T.mod(position.y.add(uLife.mul(0.6).mul(aK.add(0.5))), T.float(3.0));
  const driftX = T.sin(uLife.mul(1.2).add(aK.mul(10))).mul(0.25);
  const driftZ = T.cos(uLife.mul(1.1).add(aK.mul(15))).mul(0.25);
  const ep = T.vec3(position.x.add(driftX), riseY, position.z.add(driftZ));
  emberMat.positionNode = ep;
  const fade = T.float(1.0).sub(riseY.div(3.0));
  const dist = T.length(T.pointUV.sub(0.5)).mul(2.0);
  const falloff = T.exp(dist.mul(dist).mul(-3.5));
  emberMat.colorNode = T.vec4(T.vec3(1.0, 0.8, 0.35).mul(falloff).mul(fade).mul(1.5), 1.0);
  emberMat.sizeNode = pxSize(T.mix(0.3, 0.7, aK), ep);
}
emberCloud.setCount(30);
flameGroup.add(emberCloud.sprite);

tickers.push(() => {
        const nt = Number.isFinite(ctxU!.value) ? ctxU!.value : 0;
        const heat = sampleKeys(nt);
        const env = fadeU(ctx.uT, 14, 20, 600, 617);
        flameCoreMat.uniforms.intensity.value = 0.95 * (1 + 0.07 * Math.sin(1.1 * lifeT) + 0.05 * Math.sin(2.3 * lifeT + 1.7));
        flameHaloMat.uniforms.intensity.value = 0.25 * (1 + 0.07 * Math.sin(1.1 * lifeT + 2.2) + 0.05 * Math.sin(2.3 * lifeT + 1.7 + 2.2));
        flameGroup.visible = env > 1e-3;
        flameGroup.position.y = flameAnchor.y + env * 0.06 * Math.sin(lifeT * 0.9 + 0.4);
        const fl = 1 + 0.07 * Math.sin(lifeT * 1.1) + 0.05 * Math.sin(lifeT * 2.3 + 1.7);
        flameGroup.scale.set(env * (0.7 + 0.5 * heat) * fl, env * (0.35 + 0.9 * heat) * fl, env * (0.7 + 0.5 * heat) * fl);
    });

ours.push({
    dispose: () => {
        flameCoreGeo.dispose();
        flameHaloGeo.dispose();
        flameCoreMat.dispose();
        flameHaloMat.dispose();
    }
});

const ringGroup = new THREE.Group();
ringGroup.position.copy(ringCenter);
ctx.group.add(ringGroup);

const ringInnerMat = glowShader({intensity: 0.85}, (u, _uv) => T.vec3(T.float(0.75), T.float(0.85), T.float(1)).mul(u.intensity), {});
const ringInnerGeo = new THREE.RingGeometry(1.5, 1.58, 96);
const ringInner = new THREE.Mesh(ringInnerGeo, ringInnerMat);
ringInner.rotation.x = -Math.PI / 2;
ringGroup.add(ringInner);

const ringOuterMat = glowShader({intensity: 0.85}, (u, _uv) => T.vec3(T.float(0.75), T.float(0.85), T.float(1)).mul(u.intensity), {});
const ringOuterGeo = new THREE.RingGeometry(2.1, 2.16, 96);
const ringOuter = new THREE.Mesh(ringOuterGeo, ringOuterMat);
ringOuter.rotation.x = -Math.PI / 2;
ringGroup.add(ringOuter);

tickers.push(() => {
        const env = fadeU(ctx.uT, 25, 35, 600, 617);
        ringGroup.visible = env > 1e-3;
        const BW = (2 * Math.PI) / 4.5;
        ringInnerMat.uniforms.intensity.value = 0.85 + 0.25 * Math.sin(BW * lifeT);
        ringOuterMat.uniforms.intensity.value = 0.85 - 0.25 * Math.sin(BW * lifeT);
        const s = env * (1 + 0.07 * Math.sin(BW * lifeT));
        ringGroup.scale.set(s, 1, s);
        ringGroup.rotation.y = 0.1 * lifeT;
    });

ours.push({
    dispose: () => {
        ringInnerGeo.dispose();
        ringOuterGeo.dispose();
        ringInnerMat.dispose();
        ringOuterMat.dispose();
    }
});

const roadAngles = [-26, 0, 26];
for (let r = 0; r < roadAngles.length; r++) {
    const dirVec = new THREE.Vector3().copy(forward).applyAxisAngle(new THREE.Vector3(0, 1, 0), (roadAngles[r] * Math.PI) / 180);
    if (dirVec.lengthSq() > 1e-10) {
        dirVec.normalize();
    } else {
        dirVec.set(0, 0, 1);
    }
    const dx = dirVec.x;
    const dz = dirVec.z;
    const right = new THREE.Vector3(dz, 0, -dx);
    if (right.lengthSq() > 1e-10) {
        right.normalize();
    } else {
        right.set(1, 0, 0);
    }
    const roadGroup = new THREE.Group();
    roadGroup.position.copy(roadsOrigin);
    roadGroup.rotation.y = Math.atan2(dx, dz);
    ctx.group.add(roadGroup);

    const stripGeo = new THREE.PlaneGeometry(0.9, 7.8, 1, 16);
    stripGeo.rotateX(-Math.PI / 2);
    {
        const sp = stripGeo.attributes.position as THREE.BufferAttribute;
        const ox = roadsOrigin.x, oz = roadsOrigin.z, oy = roadsOrigin.y;
        for (let vi = 0; vi < sp.count; vi++) {
            const d = sp.getZ(vi) + 3.9;
            sp.setY(vi, heightAt(ox + dx * d, oz + dz * d) + 0.045 - oy);
        }
        sp.needsUpdate = true;
    }
    const stripMat = new THREE.MeshBasicNodeMaterial({fog: true});
    stripMat.colorNode = T.vec3(0.01, 0.012, 0.03).mul(
      T.float(0.8).add(T.normalLocal.y.mul(T.float(0.4)))
    );
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.set(0, 0, 3.9);
    roadGroup.add(strip);

    const pts = [];
    for (let i = 0; i < 6; i++) {
        const p = roadsOrigin.clone()
            .addScaledVector(dirVec, 1.3 * (i + 1))
            .addScaledVector(right, (rnd(r * 13 + i, 37) - 0.5) * 0.8);
        p.y = heightAt(p.x, p.z) + 0.12;
        pts.push(p);
    }
    kit.pathLights(pts);

    ours.push({
        dispose: () => {
            stripGeo.dispose();
            stripMat.dispose();
        }
    });
}
// END OF PART 2



    // Crown sway is ambient life: it reads the scene-local life clock (lifeT),
    // not the narration clock. Narration-driven envelopes stay on ctx.uT.
    const upd = (t: number): void => {
      for (const sway of sways) sway(t);
    };
    upd(lifeT);
    tickers.push(() => upd(lifeT));

    keepsAlpha(ctx.group);
  };

  const opts: LessonOpts = { id: "garden", trackId: "L05", seatPos, seatHeading: heading, seatRadius: 3, build, beats };

  class GardenSceneImpl extends LessonScene {
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
      if (root) {
        root.removeFromParent();
        root = null;
      }
      ctxU = null;
      super.dispose();
    }
  }

  return new GardenSceneImpl(scene, narration, whisper, opts);
}
// END OF FILE