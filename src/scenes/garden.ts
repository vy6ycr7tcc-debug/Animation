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
import { glowShader, T } from "../gpu/tsl";
import type { Narration } from "../core/narration";

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

// ── moonlit solid (STYLE): dark blue-black base + pale blue-silver fresnel rim ─
//    subtle vertical gradient; fog ON (solids); opaque (depthWrite on).
//    pow(1 - |dot(n,v)|, 3) via chained .mul(); no raw JS numbers mixed into nodes.
const moonlitColor = () => {
  const n = T.normalize(T.normalWorld);
  const v = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const ndv = T.abs(T.dot(n, v));
  const k = T.float(1.0).sub(ndv); // 1 - |dot(n,v)|
  const fres = k.mul(k).mul(k); // pow(..., 3)
  const grainSeed = T.dot(T.positionWorld, T.vec3(12.9898, 78.233, 37.719));
  const hash = T.fract(T.sin(grainSeed).mul(T.float(43758.5453)));
  const grain = T.vec3(1.0, 0.78, 0.48).mul(hash.sub(T.float(0.5))).mul(T.float(0.03));
  const base = T.vec3(0.008, 0.007, 0.02).add(grain);
  const rim = T.vec3(0.75, 0.85, 1.0).mul(T.float(0.55)).mul(fres);
  const up = T.positionWorld.y.mul(T.float(0.22)).add(T.float(0.55));
  return base.add(rim).add(T.vec3(0.02, 0.025, 0.045).mul(up));
};

const makeMoonlit = (side: THREE.Side): THREE.MeshBasicNodeMaterial => {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = moonlitColor();
  m.side = side;
  m.fog = true;
  return m;
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
  mat: THREE.MeshBasicNodeMaterial,
  geos: PalmGeos,
  ours: Array<{ dispose: () => void }>,
  sways: Array<(t: number) => void>,
): THREE.Group => {
  const palm = new THREE.Group();
  palm.position.copy(base);

  // trunk — CylinderGeometry(top 0.09, bottom 0.16, height), slightly tilted
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.16, height, 14, 8);
  ours.push(trunkGeo);
  const trunk = new THREE.Mesh(trunkGeo, mat);
  trunk.position.y = height * 0.5;
  trunk.rotation.z = (rnd(seed, 1) - 0.5) * 0.14;
  palm.add(trunk);

  // crown at the trunk top — roots stay put, only the crown sways
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
      const frond = new THREE.Mesh(whorl.geo, mat);
      frond.rotation.order = "YZX"; // yaw about Y, then pitch about the frond's own Z
      frond.rotation.set(
        0,
        (k / Math.max(1e-6, whorl.n)) * Math.PI * 2 + whorl.phase + (rnd(seed + k * 5 + w * 31, 2) - 0.5) * 0.3,
        -whorl.pitch,
      );
      frond.position.y = whorl.y + (rnd(seed + k * 17 + w * 23, 6) - 0.5) * 0.06;
      crown.add(frond);
    }
  }

  // crown sway: unhurried, eased (sinusoid), phase-offset — period ≈ 11 s
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

    // moonlit solids (fog ON) — trunk + fronds share one material
    const moonlit = makeMoonlit(THREE.DoubleSide);
    ours.push(moonlit);
    const geos: PalmGeos = {
      upper: makeFrondGeo(1.9, 0.3),
      lower: makeFrondGeo(2.3, 0.3),
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

    kit.group.add(makePalm(palmCenterBase, centreH, 1, moonlit, geos, ours, sways));
    kit.group.add(makePalm(leftPos, leftH, 2, moonlit, geos, ours, sways));
    kit.group.add(makePalm(rightPos, rightH, 3, moonlit, geos, ours, sways));

// ---- PART 2: flame, rings, roads ----

const flameGroup = new THREE.Group();
flameGroup.position.copy(flameAnchor);
ctx.group.add(flameGroup);

const flameCoreMat = glowShader({intensity: 0.95}, (u, _uv) => T.vec3(T.float(1), T.float(0.82), T.float(0.42)).mul(u.intensity), {});
const flameCoreGeo = new THREE.SphereGeometry(0.28, 20, 14);
const flameCore = new THREE.Mesh(flameCoreGeo, flameCoreMat);
flameGroup.add(flameCore);

const flameMidMat = glowShader({intensity: 0.6}, (u, _uv) => T.vec3(T.float(1), T.float(0.5), T.float(0.17)).mul(u.intensity), {});
const flameMidGeo = new THREE.SphereGeometry(0.55, 20, 14);
const flameMid = new THREE.Mesh(flameMidGeo, flameMidMat);
flameGroup.add(flameMid);

const flameHaloMat = glowShader({intensity: 0.18}, (u, _uv) => T.vec3(T.float(1), T.float(0.5), T.float(0.17)).mul(u.intensity), {});
const flameHaloGeo = new THREE.SphereGeometry(1.0, 20, 14);
const flameHalo = new THREE.Mesh(flameHaloGeo, flameHaloMat);
flameGroup.add(flameHalo);

tickers.push(() => {
        const nt = Number.isFinite(ctxU!.value) ? ctxU!.value : 0;
        const heat = sampleKeys(nt);
        const env = fadeU(ctx.uT, 14, 20, 600, 617);
        flameCoreMat.uniforms.intensity.value = 0.95 * (1 + 0.07 * Math.sin(1.1 * lifeT) + 0.05 * Math.sin(2.3 * lifeT + 1.7));
        flameMidMat.uniforms.intensity.value = 0.6 * (1 + 0.07 * Math.sin(1.1 * lifeT + 1.1) + 0.05 * Math.sin(2.3 * lifeT + 1.7 + 1.1));
        flameHaloMat.uniforms.intensity.value = 0.18 * (1 + 0.07 * Math.sin(1.1 * lifeT + 2.2) + 0.05 * Math.sin(2.3 * lifeT + 1.7 + 2.2));
        flameGroup.visible = env > 1e-3;
        flameGroup.position.y = flameAnchor.y + env * 0.06 * Math.sin(lifeT * 0.9 + 0.4);
        const fl = 1 + 0.07 * Math.sin(lifeT * 1.1) + 0.05 * Math.sin(lifeT * 2.3 + 1.7);
        flameGroup.scale.set(env * (0.7 + 0.5 * heat) * fl, env * (0.35 + 0.9 * heat) * fl, env * (0.7 + 0.5 * heat) * fl);
    });

ours.push({
    dispose: () => {
        flameCoreGeo.dispose();
        flameMidGeo.dispose();
        flameHaloGeo.dispose();
        flameCoreMat.dispose();
        flameMidMat.dispose();
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