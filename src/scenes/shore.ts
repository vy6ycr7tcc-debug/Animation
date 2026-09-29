/* The shore lesson — L03 "The Untying" (forgiveness).
   At the water's edge a bound figure stands: a dark robe of deep blue cut as a silhouette against
   the glow behind it, wrapped in eight cords of dim amber light, with a wisp-light of soft points
   clinging to its shape. As the telling goes on the cords slip one by one — through the middle of
   the lesson three hang loose and sway while the rest still hold, and the figure is half-risen —
   and at the release the cords dissolve into rising sparks and the figure stands free and warm.
   From the same library as the rest of the world: lamps on the landward side, the wheel that turns
   and then stops, hands that open, a leaf given to the wind, a spent storm settling on the water.
   Foreground reeds by the seat and drifting motes over the moonlit water keep the world alive.
   Every state is a pure function of narration seconds (see tick): seeking and replay are exact. */
import * as THREE from "three/webgpu";
import { LessonScene } from "./lessonKit";
import type { Beat, LessonCtx, LessonOpts } from "./lessonKit";
import type { Narration } from "../core/narration";
import { SITES } from "./sites";
import { heightAt, WATER_Y } from "../world/terrain";
import { gpuUniforms, softPoints, spriteCloud, T, viewDepth, type N } from "../gpu/tsl";

/* the telling's spine, in narration seconds */
const T_TIGHT = 7.94;     // the knot pulls tight
const T_LOOSE = 190.9;    // the loosening begins
const T_WHEEL = 240.77;   // the wheel of the unforgiven action appears
const T_STOP = 286.44;    // the wheel stops
const T_HANDS = 357.79;   // the hands open
const T_LEAF = 387.58;    // the leaf is given to the wind
const T_STORM = 440.63;   // the storm is spent
const T_RELEASE = 562.88; // RELEASE

/* each cord slips at its own moment: three hang loose at the middle of the untying, and all are
   unwrapped before the release */
const RELEASE_AT = [200, 254, 308, 372, 424, 468, 506, 538];

const N_FIG = 1400, N_CORDS = 8, CORD_PTS = 46, N_SPARK = 192, N_HAND = 96, N_LEAF = 7, N_RAIN = 110;
const N_REED = 30, N_MOTE = 90;
/* the two canon lights of this scene: the beams' pale blue (0xb8d1ff) and the bark-grain gold */
const COOL = [0.7216, 0.8196, 1.0];
const WARM = [1.0, 0.78, 0.48];

/* ---------------------------------------------------------------- small pure helpers */
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (x: number, a: number, b: number): number => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const mixN = (a: number, b: number, k: number): number => a + (b - a) * k;
/** easeInOutCubic — the easing of choice; never a linear tween. */
const eic = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
/** A deterministic hash in 0–1. */
const h1 = (i: number, k: number): number => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** Keep alpha untouched on additive materials (mirrors main.ts additiveKeepsAlpha). */
function keepsAlpha(m: THREE.Material): void {
  const b = m as unknown as {
    blending: number; blendEquation: number; blendSrc: number; blendDst: number;
    blendSrcAlpha: number; blendDstAlpha: number;
  };
  b.blending = THREE.CustomBlending;
  b.blendEquation = THREE.AddEquation;
  b.blendSrc = THREE.SrcAlphaFactor;
  b.blendDst = THREE.OneFactor;
  b.blendSrcAlpha = THREE.ZeroFactor;
  b.blendDstAlpha = THREE.OneFactor;
}

/* ---------------------------------------------------------------- the wisp-figure */
/** The robe's silhouette: (height, radius), as the veiled figures of the beings are turned. */
const ROBE: Array<[number, number]> = [[0.0, 0.02], [0.03, 0.24], [0.4, 0.25], [0.8, 0.22], [1.1, 0.17], [1.36, 0.12], [1.5, 0.08], [1.55, 0.02]];

function radiusAt(y: number): number {
  const yy = y < 0 ? 0 : y > 1.55 ? 1.55 : y;
  for (let i = 1; i < ROBE.length; i++) {
    const y1 = ROBE[i - 1][0], r1 = ROBE[i - 1][1];
    const y2 = ROBE[i][0], r2 = ROBE[i][1];
    if (yy <= y2) return mixN(r1, r2, (yy - y1) / (y2 - y1));
  }
  return 0.02;
}

interface Fig {
  hs: number; ws: number; lean: number; droop: number;
  lift: number; warm: number; glow: number; tight: number; rise: number; free: number;
}

/** The pose state, reused — the frame loop never allocates. */
const _f: Fig = { hs: 0, ws: 0, lean: 0, droop: 0, lift: 0, warm: 0, glow: 0, tight: 0, rise: 0, free: 0 };

/** TIED → half-risen → standing free, all from narration seconds (pure in `t`, fills `out`). */
function figureState(t: number, out: Fig): Fig {
  const tight = t > T_TIGHT ? Math.exp(-(t - T_TIGHT) * 1.5) : 0;
  const rise = ss(t, T_LOOSE, T_RELEASE - 22);
  const free = ss(t, T_RELEASE - 18, T_RELEASE + 8);
  out.hs = 0.55 + 0.45 * rise + 0.02 * free + Math.sin(t * 0.85 + 0.6) * 0.01;
  out.ws = 0.92 + 0.08 * rise;
  out.lean = 0.04 + 0.44 * (1 - rise);
  out.droop = 0.05 + 0.36 * (1 - rise);
  out.lift = 0.12 * free;
  out.warm = free;
  out.glow = 0.6 + 0.35 * rise + 0.75 * free + 0.3 * tight;
  out.tight = tight;
  out.rise = rise;
  out.free = free;
  return out;
}

const _pose = new THREE.Vector3();
/** A figure-local point, bowed and bent for the state at `t` (pure). */
function pose(lx: number, ly: number, lz: number, f: Fig, seed: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  let y = ly, z = lz;
  if (ly > 1.3) {
    const a = f.droop * clamp01((ly - 1.3) / 0.35);
    const c = Math.cos(a), s = Math.sin(a), dy = ly - 1.45;
    y = 1.45 + dy * c + lz * s;
    z = lz * c - dy * s;
  }
  y *= f.hs;
  // the rise is an arc, not a straight lift: a sideways drift that settles back as it stands
  const arc = Math.sin(f.rise * Math.PI) * 0.16 + Math.sin(f.free * Math.PI) * 0.12;
  const x = lx * f.ws + arc + Math.sin(t * 1.5 + seed * 41) * 0.012;
  z = z * f.ws + Math.cos(t * 1.25 + seed * 53) * 0.012;
  const hip = 0.6 * f.hs, dy2 = y - hip;
  if (dy2 > 0) {
    const c = Math.cos(f.lean), s = Math.sin(f.lean);
    y = hip + dy2 * c + z * s;
    z = z * c - dy2 * s;
  }
  return out.set(x, y, z);
}

interface Frame { G: THREE.Vector3; right: THREE.Vector3; fwd: THREE.Vector3; footY: number }

function place(fr: Frame, p: THREE.Vector3, lift: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(
    fr.G.x + fr.right.x * p.x + fr.fwd.x * p.z,
    fr.footY + p.y + lift,
    fr.G.z + fr.right.z * p.x + fr.fwd.z * p.z,
  );
}

/* ---------------------------------------------------------------- soft hologram points */
interface Holo {
  sprite: THREE.Sprite;
  pos: Float32Array;
  col: Float32Array;
  seed: Float32Array;
  touch: () => void;
}

/** A cloud of sized soft points with a slow hologram scan and a flicker, as the Vision draws. */
function holoCloud(count: number, sizeWorld: number, y0: number, uT: N, D: { dispose(): void }[]): Holo {
  const mat = softPoints();
  keepsAlpha(mat);
  const cloud = spriteCloud(count, { position: 3, aCol: 3, aSeed: 1 }, mat);
  cloud.sprite.frustumCulled = false;
  const { position, aCol, aSeed } = cloud.nodes;
  const world = T.modelWorldMatrix.mul(T.vec4(position, 1)).xyz;
  mat.sizeNode = T.clamp(
    gpuUniforms.px.mul(sizeWorld).mul(aSeed.mul(0.8).add(0.5)).div(T.max(viewDepth(world), 0.5)),
    T.float(1).div(T.max(gpuUniforms.dpr, 1e-3)),
    8,
  );
  const flick = T.sin(uT.mul(aSeed.mul(2.5).add(1.2)).add(aSeed.mul(60))).mul(0.45).add(0.55);
  const scanY = T.mod(uT.mul(0.3), 3).sub(0.5).add(y0);
  const dy = position.y.sub(scanY);
  const scan = T.exp(dy.mul(dy).mul(-4)).mul(0.7).add(0.65);
  const soft = T.smoothstep(0.5, 0.2, T.length(T.pointUV.sub(0.5)));
  mat.colorNode = T.vec4(aCol.mul(soft).mul(flick).mul(scan), 1);
  D.push(mat);
  return {
    sprite: cloud.sprite,
    pos: cloud.attrs.position.array as Float32Array,
    col: cloud.attrs.aCol.array as Float32Array,
    seed: cloud.attrs.aSeed.array as Float32Array,
    touch: () => {
      cloud.attrs.position.needsUpdate = true;
      cloud.attrs.aCol.needsUpdate = true;
      cloud.attrs.aSeed.needsUpdate = true;
    },
  };
}

let haloTex: THREE.CanvasTexture | null = null;
function haloTexture(): THREE.CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,230,160,1)");
    grd.addColorStop(0.3, "rgba(255,230,160,0.32)");
    grd.addColorStop(1, "rgba(255,230,160,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  haloTex = tex;
  return tex;
}

/* ---------------------------------------------------------------- the cords */
interface Cord { y0: number; phi0: number; turns: number; phase: number; releaseAt: number; dissolveAt: number }

const _cA = new THREE.Vector3(), _cW = new THREE.Vector3(), _cH = new THREE.Vector3();

/** Where a cord lies at `s` along it: wrapped on the body, or slipped off and hanging (pure). */
function cordPoint(fr: Frame, c: Cord, s: number, t: number, f: Fig, out: THREE.Vector3): THREE.Vector3 {
  const band = 0.035 - 0.015 * f.tight;
  // the anchor: where the cord still meets the body
  const yA = c.y0 + 0.03 * Math.sin(c.phase);
  const rA = radiusAt(yA) + band;
  pose(Math.cos(c.phi0) * rA, yA, Math.sin(c.phi0) * rA, f, c.phase, t, _pose);
  place(fr, _pose, f.lift, _cA);
  // the wrapped position at s
  const phi = c.phi0 + s * c.turns * Math.PI * 2;
  const y = c.y0 + 0.03 * Math.sin(s * Math.PI * 2 + c.phase);
  const r = radiusAt(y) + band;
  pose(Math.cos(phi) * r, y, Math.sin(phi) * r, f, c.phase, t, _pose);
  place(fr, _pose, f.lift, _cW);
  // the loose end: falling away from the body, swaying
  let ox = _cA.x - fr.G.x, oz = _cA.z - fr.G.z;
  const ol = Math.sqrt(ox * ox + oz * oz);
  if (ol > 1e-3) { ox /= ol; oz /= ol; } else { ox = fr.right.x; oz = fr.right.z; }
  const tx = -oz, tz = ox;
  const drop = Math.min(1.1, Math.max(0.18, _cA.y - fr.footY - 0.06));
  const sway = Math.sin(t * 0.9 + c.phase + s * 2) * 0.12 * s + Math.sin(t * 0.23 + c.phase) * 0.05 * s;
  _cH.set(
    _cA.x + ox * (0.05 * s + 0.13 * s * s) + tx * sway,
    _cA.y - drop * (0.55 * s + 0.45 * s * s),
    _cA.z + oz * (0.05 * s + 0.13 * s * s) + tz * sway,
  );
  const q = clamp01((t - c.releaseAt) / 9);
  const k = ss(clamp01(q * 1.35 - (1 - s) * 0.35), 0, 1);
  out.lerpVectors(_cW, _cH, k);
  if (out.y < fr.footY + 0.04) out.y = fr.footY + 0.04;
  return out;
}

interface Built {
  fr: Frame;
  fig: Holo; cords: Holo; sparks: Holo; hands: Holo; rain: Holo; motes: Holo;
  figBase: Float32Array;
  spec: Cord[];
  sparkAt: Float32Array; sparkBirth: Float32Array;
  halo: THREE.Sprite;
  ringMat: THREE.MeshBasicMaterial; ring: THREE.Mesh;
  wheelRig: THREE.Group; wheelSpin: THREE.Group; wheelMat: THREE.LineBasicMaterial;
  robeGeo: THREE.BufferGeometry; robePos: THREE.BufferAttribute;
  reeds: THREE.InstancedMesh; reedBase: Float32Array; reedH: Float32Array; reedPh: Float32Array;
  leaves: THREE.InstancedMesh;
}

const _w = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3();

/* ---------------------------------------------------------------- the lesson */
export function createShoreScene(
  scene: THREE.Scene,
  narration: Narration,
  whisper: (text: string, ms?: number) => void,
): LessonScene {
  const S = SITES.shore;
  const seatPos = new THREE.Vector3(S.x, S.y, S.z);
  const seatHeading = S.heading;
  const F = new THREE.Vector3(-Math.sin(seatHeading), 0, -Math.cos(seatHeading));
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), F).normalize();
  const back = F.clone().negate();

  // the figure's footing: the ground (or the water) a little ahead of the seat, off its forward axis
  const G = seatPos.clone().addScaledVector(F, 7.5).addScaledVector(right, 1.35);
  const gy = heightAt(G.x, G.z);
  const footY = Number.isFinite(gy) ? Math.max(gy, WATER_Y) : S.y;
  const fr: Frame = { G, right, fwd: F, footY };

  const disposables: { dispose(): void }[] = [];
  let uTRef: N | null = null;
  let built: Built | null = null;

  function build(ctx: LessonCtx): void {
    uTRef = ctx.uT;
    ctx.group.add(ctx.kit.group);

    /* ---------- the lamps, in an arc on the landward side, framing the seat ---------- */
    const lamps: THREE.Vector3[] = [];
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45;
      const d = 3.2 + (i % 2) * 0.9;
      lamps.push(
        seatPos.clone()
          .addScaledVector(F, -Math.cos(a) * d)
          .addScaledVector(right, Math.sin(a) * (3.0 + (i % 2) * 0.7))
          .setY(S.y + 0.45),
      );
    }
    ctx.kit.pathLights(lamps);

    /* ---------- foreground reeds at the seat's waterline, swaying slowly ---------- */
    const reedGeo = new THREE.CylinderGeometry(0.012, 0.024, 1, 5, 1).translate(0, 0.5, 0);
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x1c1a2c, roughness: 0.96, metalness: 0 });
    const reeds = new THREE.InstancedMesh(reedGeo, reedMat, N_REED);
    const reedBase = new Float32Array(N_REED * 3);
    const reedH = new Float32Array(N_REED), reedPh = new Float32Array(N_REED);
    for (let i = 0; i < N_REED; i++) {
      const cl = i % 3;
      const side = cl === 1 ? 1 : -1;
      const fwdD = 1.7 + cl * 0.8 + h1(i, 51) * 1.5;
      const lat = side * (2.2 + h1(i, 52) * 1.5);
      const x = seatPos.x + F.x * fwdD + right.x * lat;
      const z = seatPos.z + F.z * fwdD + right.z * lat;
      const g = heightAt(x, z);
      reedBase[i * 3] = x;
      reedBase[i * 3 + 1] = (Number.isFinite(g) ? g : S.y) - 0.06;
      reedBase[i * 3 + 2] = z;
      reedH[i] = 0.75 + h1(i, 53) * 0.95;
      reedPh[i] = h1(i, 54) * Math.PI * 2;
    }
    ctx.group.add(reeds);
    disposables.push(reedGeo, reedMat);

    /* ---------- the robe: a dark silhouette the wisp-light clings to ---------- */
    const robeProfile: THREE.Vector2[] = ROBE.map(([y, r]) => new THREE.Vector2(r < 0.02 ? 0.02 : r, y));
    const robeGeo = new THREE.LatheGeometry(robeProfile, 36);
    const robePos = robeGeo.getAttribute("position") as THREE.BufferAttribute;
    // Upgraded from StandardMaterial to NodeMaterial to create a softer, more atmospheric dark silhouette
    // It should feel like a deep blue night, not a plastic primitive.
    const robeMat = new THREE.MeshBasicNodeMaterial({ 
      fog: true 
    });
    
    // Depth-aware subtle fresnel rim lift for materiality
    const viewDir = T.normalize(T.cameraPosition.sub(T.positionWorld));
    // Lathe normal
    const normal = T.normalWorld; 
    const fresnel = T.pow(T.float(1.0).sub(T.max(T.dot(normal, viewDir), 0.0)), 3.0);
    
    // Deep blue black base with a subtle blue lift at the edges to give it dimension
    const baseCol = T.color(0x06080e);
    const rimCol = T.color(0x1a2238).mul(fresnel);
    robeMat.colorNode = baseCol.add(rimCol);

    ctx.group.add(new THREE.Mesh(robeGeo, robeMat));
    disposables.push(robeGeo, robeMat);

    /* ---------- the figure: soft points of wisp-light over the robe and the bowed head ---------- */
    const fig = holoCloud(N_FIG, 0.07, footY, ctx.uT, disposables);
    const figBase = new Float32Array(N_FIG * 3);
    for (let i = 0; i < N_FIG; i++) {
      const j = i * 3;
      fig.seed[i] = h1(i, 1);
      const a = h1(i, 4) * Math.PI * 2;
      if (h1(i, 2) < 0.84) {
        const y = 0.03 + Math.pow(h1(i, 3), 0.85) * 1.5;
        const r = radiusAt(y) * (0.94 + h1(i, 5) * 0.16);
        figBase[j] = Math.cos(a) * r;
        figBase[j + 1] = y;
        figBase[j + 2] = Math.sin(a) * r;
      } else {
        const u = h1(i, 3) * 2 - 1;
        const rr = Math.sqrt(Math.max(0, 1 - u * u));
        const s = 0.1 * (0.8 + h1(i, 5) * 0.5);
        figBase[j] = Math.cos(a) * rr * s;
        figBase[j + 1] = 1.62 + u * s;
        figBase[j + 2] = Math.sin(a) * rr * s + 0.01;
      }
    }
    fig.touch();
    ctx.group.add(fig.sprite);

    /* ---------- the cords: bands of dim amber light, each untied at its own moment ---------- */
    const spec: Cord[] = [];
    for (let i = 0; i < N_CORDS; i++) {
      spec.push({
        y0: 0.22 + i * 0.15,
        phi0: h1(i, 3) * Math.PI * 2,
        turns: 1.1 + h1(i, 4) * 0.35,
        phase: h1(i, 5) * Math.PI * 2,
        releaseAt: RELEASE_AT[i],
        dissolveAt: T_RELEASE - 5 + i * 0.28,
      });
    }
    const cords = holoCloud(N_CORDS * CORD_PTS, 0.055, footY, ctx.uT, disposables);
    ctx.group.add(cords.sprite);

    /* ---------- the sparks each cord becomes at the release ---------- */
    const sparks = holoCloud(N_SPARK, 0.035, footY, ctx.uT, disposables);
    const sparkAt = new Float32Array(N_SPARK * 3);
    const sparkBirth = new Float32Array(N_SPARK);
    const perCord = N_SPARK / N_CORDS;
    for (let i = 0; i < N_SPARK; i++) {
      const ci = Math.floor(i / perCord);
      const s = ((i % perCord) + 0.5) / perCord;
      const birth = spec[ci].dissolveAt + 1.2 + h1(i, 41) * 1.8;
      sparkBirth[i] = birth;
      sparks.seed[i] = h1(i, 42);
      cordPoint(fr, spec[ci], s, birth, figureState(birth, _f), _w);
      sparkAt[i * 3] = _w.x;
      sparkAt[i * 3 + 1] = Math.max(footY + 0.05, _w.y);
      sparkAt[i * 3 + 2] = _w.z;
    }
    sparks.touch();
    ctx.group.add(sparks.sprite);

    /* ---------- the hands that open, the leaves the wind takes, the spent storm ---------- */
    const hands = holoCloud(N_HAND, 0.05, S.y, ctx.uT, disposables);
    ctx.group.add(hands.sprite);

    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, -0.13);
    leafShape.quadraticCurveTo(0.12, -0.02, 0, 0.16);
    leafShape.quadraticCurveTo(-0.12, -0.02, 0, -0.13);
    const leafGeo = new THREE.ShapeGeometry(leafShape);
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0xffcc80, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
    });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, N_LEAF);
    leaves.visible = false;
    ctx.group.add(leaves);
    disposables.push(leafGeo, leafMat);

    const rain = holoCloud(N_RAIN, 0.04, footY, ctx.uT, disposables);
    ctx.group.add(rain.sprite);

    /* ---------- drifting motes over the moonlit water (alive before the telling starts) ---- */
    const motes = holoCloud(N_MOTE, 0.055, footY, ctx.uT, disposables);
    motes.touch();
    ctx.group.add(motes.sprite);

    /* ---------- the glow it is silhouetted against, and the ring of light on the ground ---------- */
    const haloMat = new THREE.SpriteMaterial({
      map: haloTexture(), color: 0xffe6a0, transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    keepsAlpha(haloMat);
    const halo = new THREE.Sprite(haloMat);
    ctx.group.add(halo);
    disposables.push(haloMat);

    const ringGeo = new THREE.RingGeometry(0.85, 1, 72).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd700, transparent: true, opacity: 0.06,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    keepsAlpha(ringMat);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(G.x, footY + 0.04, G.z);
    ctx.group.add(ring);
    disposables.push(ringGeo, ringMat);

    /* ---------- the wheel: it turns while the action is pushed, and settles to a stop ---------- */
    const wheelRig = new THREE.Group();
    wheelRig.position.set(G.x + right.x * 2.7, footY + 1.5, G.z + right.z * 2.7);
    wheelRig.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), F));
    const wheelSpin = new THREE.Group();
    const pts: number[] = [];
    const arcPairs = (r: number, n: number): void => {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        pts.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0);
      }
    };
    arcPairs(1.05, 72);
    arcPairs(0.36, 40);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      pts.push(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0, Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0);
    }
    const wheelGeo = new THREE.BufferGeometry();
    wheelGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const wheelMat = new THREE.LineBasicMaterial({
      color: 0xe9c37d, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    keepsAlpha(wheelMat);
    wheelSpin.add(new THREE.LineSegments(wheelGeo, wheelMat));
    wheelRig.add(wheelSpin);
    wheelRig.visible = false;
    ctx.group.add(wheelRig);
    disposables.push(wheelGeo, wheelMat);

    built = {
      fr, fig, cords, sparks, hands, rain, motes, figBase, spec, sparkAt, sparkBirth,
      halo, ring, ringMat, wheelRig, wheelSpin, wheelMat,
      robeGeo, robePos, reeds, reedBase, reedH, reedPh, leaves,
    };
  }

  /* Every frame: the whole scene as a pure function of narration seconds. */
  function tick(t: number): void {
    const B = built;
    if (!B) return;
    const f = figureState(t, _f);

    /* ---- the robe: the dark silhouette, bowed and bound, half-risen, then standing free ---- */
    const RP = B.robePos.array as Float32Array;
    for (let i = 0, n = B.robePos.count; i < n; i++) {
      const j = i * 3;
      pose(RP[j], RP[j + 1], RP[j + 2], f, 0, t, _pose);
      place(fr, _pose, f.lift, _w);
      RP[j] = _w.x; RP[j + 1] = _w.y; RP[j + 2] = _w.z;
    }
    B.robePos.needsUpdate = true;
    B.robeGeo.computeVertexNormals();

    /* ---- the wisp-light clinging to it ---- */
    const P = B.fig.pos, C = B.fig.col, SB = B.fig.seed, base = B.figBase;
    for (let i = 0; i < N_FIG; i++) {
      const j = i * 3;
      pose(base[j], base[j + 1], base[j + 2], f, SB[i], t, _pose);
      place(fr, _pose, f.lift, _w);
      P[j] = _w.x; P[j + 1] = _w.y; P[j + 2] = _w.z;
      const k = f.glow * (0.45 + 0.55 * SB[i]);
      C[j] = mixN(COOL[0], WARM[0], f.warm) * k;
      C[j + 1] = mixN(COOL[1], WARM[1], f.warm) * k;
      C[j + 2] = mixN(COOL[2], WARM[2], f.warm) * k;
    }
    B.fig.touch();

    /* ---- the glow behind it, and the ring of light it stands in ---- */
    B.halo.position.set(G.x - F.x * 1.15, footY + 1.0 * f.hs + f.lift, G.z - F.z * 1.15);
    const haloS = 1.7 + 0.5 * f.rise + 0.7 * f.free;
    B.halo.scale.set(haloS, haloS * 1.25, 1);
    (B.halo.material as THREE.SpriteMaterial).opacity = 0.1 + 0.1 * f.rise + 0.34 * f.free + 0.16 * f.tight;
    B.ringMat.opacity = 0.06 + 0.3 * f.free + 0.05 * f.tight;
    B.ring.scale.setScalar(1 + 2.2 * f.free);

    /* ---- the cords: taut bands, then loose and hanging one by one, then gone ---- */
    const CP = B.cords.pos, CC = B.cords.col;
    let gi = 0;
    for (let ci = 0; ci < N_CORDS; ci++) {
      const c = B.spec[ci];
      const loose = ss(t, c.releaseAt, c.releaseAt + 9);
      const fade = 1 - ss(t, c.dissolveAt, c.dissolveAt + 4);
      const b = (0.3 + 0.26 * f.tight + 0.16 * (1 - loose)) * fade;
      for (let j = 0; j < CORD_PTS; j++, gi++) {
        const s = j / (CORD_PTS - 1);
        cordPoint(fr, c, s, t, f, _w);
        const g = gi * 3;
        CP[g] = _w.x; CP[g + 1] = _w.y; CP[g + 2] = _w.z;
        const k = b * (0.6 + 0.4 * h1(gi, 7));
        CC[g] = WARM[0] * k; CC[g + 1] = WARM[1] * k; CC[g + 2] = WARM[2] * k;
      }
    }
    B.cords.touch();

    /* ---- the sparks each cord dissolves into, rising on curves ---- */
    const SP = B.sparks.pos, SC = B.sparks.col, SA = B.sparkAt, SBi = B.sparks.seed;
    for (let i = 0; i < N_SPARK; i++) {
      const g = i * 3;
      const age = t - B.sparkBirth[i];
      if (age <= 0 || age >= 32) {
        SP[g] = SA[g]; SP[g + 1] = SA[g + 1]; SP[g + 2] = SA[g + 2];
        SC[g] = 0; SC[g + 1] = 0; SC[g + 2] = 0;
        continue;
      }
      const seed = SBi[i];
      const rise = 1 - Math.exp(-age * 0.14);      // fast off the cord, then carried up and slowing
      const dir = seed * 2 - 1;
      SP[g] = SA[g] + Math.sin(t * 0.55 + seed * 37) * (0.04 + 0.06 * rise) + dir * rise * rise * 1.15;
      SP[g + 1] = Math.max(footY + 0.05, SA[g + 1] + rise * (1.5 + 1.7 * seed) + Math.sin(t * 0.62 + seed * 21) * 0.09);
      SP[g + 2] = SA[g + 2] + Math.cos(t * 0.47 + seed * 53) * (0.05 + 0.06 * rise) + dir * rise * rise * 0.75;
      const fade = ss(age, 0, 1.5) * (1 - ss(age, 10, 32));
      const k = fade * (0.5 + 0.5 * seed);
      SC[g] = WARM[0] * k; SC[g + 1] = WARM[1] * k; SC[g + 2] = WARM[2] * k;
    }
    B.sparks.touch();

    /* ---- the hands of light before the wanderer, opening ---- */
    const handOp = ss(t, T_HANDS, T_HANDS + 5) * (1 - ss(t, T_RELEASE, T_RELEASE + 24));
    const open = ss(t, T_HANDS, T_HANDS + 16);
    const HP = B.hands.pos, HC = B.hands.col;
    const bob = Math.sin(t * 0.95 + 2.1) * 0.03;
    for (let i = 0; i < N_HAND; i++) {
      const g = i * 3;
      const side = i % 2 === 0 ? -1 : 1;
      const rr = Math.sqrt(h1(i, 11));
      const a = h1(i, 12) * Math.PI * 2;
      const spread = 0.05 + 0.09 * open;
      const lx = Math.cos(a) * rr * spread;
      const lz = Math.sin(a) * rr * spread * 0.8;
      const ly = -0.06 * (1 - open) * (1 - rr * rr) + (h1(i, 13) - 0.5) * 0.01;
      const cx = seatPos.x + F.x * 3.4 + right.x * side * 0.5;
      const cz = seatPos.z + F.z * 3.4 + right.z * side * 0.5;
      HP[g] = cx + right.x * lx + back.x * lz;
      HP[g + 1] = S.y + 0.95 + bob + ly;
      HP[g + 2] = cz + right.z * lz + back.z * 0 + right.z * 0 + back.z * lz * 0 + F.z * 0 + back.z * 0 + right.z * 0 + back.z * 0;
      HP[g + 2] = cz + right.z * lx + back.z * lz;
      const k = handOp * (0.4 + 0.6 * h1(i, 14));
      HC[g] = WARM[0] * k; HC[g + 1] = WARM[1] * k; HC[g + 2] = WARM[2] * k;
    }
    B.hands.touch();

    /* ---- the leaves, given to the wind: solid, lit, never glowing ---- */
    const lt = t - T_LEAF;
    const leafOn = lt > 0 && lt < 32;
    B.leaves.visible = leafOn;
    if (leafOn) {
      const dk = ss(lt, 0, 26);
      const sc = ss(lt, 0, 1.2) * (1 - ss(lt, 27, 32));
      for (let i = 0; i < N_LEAF; i++) {
        const ph = h1(i, 71) * Math.PI * 2;
        const side0 = (h1(i, 72) - 0.5) * 1.1;
        const path = 3.4 + dk * 9.5;
        const lateral = side0 + Math.sin(lt * 0.55 + ph) * 0.85 + Math.sin(lt * 0.21 + ph * 1.7) * 0.5;
        _s1.set(
          seatPos.x + F.x * path + right.x * lateral,
          S.y + 0.95 + Math.sin(dk * Math.PI) * 1.15 + Math.sin(lt * 1.15 + ph) * 0.14,
          seatPos.z + F.z * path + right.z * lateral,
        );
        _e.set(Math.sin(lt * 0.5 + ph) * 1.3, Math.sin(lt * 0.31 + ph) * 1.6, Math.sin(lt * 0.42 + ph * 1.3) * 1.1);
        _q.setFromEuler(_e);
        _m4.compose(_s1, _q, _s2.set(sc, sc, sc));
        B.leaves.setMatrixAt(i, _m4);
      }
      B.leaves.instanceMatrix.needsUpdate = true;
    }

    /* ---- the spent storm, settling on the water ---- */
    const stormOp = ss(t, T_STORM, T_STORM + 1.5) * (1 - ss(t, T_STORM + 3, T_STORM + 18)) * 0.6;
    const sink = ss(t, T_STORM, T_STORM + 14);
    const RP2 = B.rain.pos, RC = B.rain.col;
    for (let i = 0; i < N_RAIN; i++) {
      const g = i * 3;
      const out = 3 + h1(i, 31) * 14;
      const side = (h1(i, 32) - 0.5) * 18;
      RP2[g] = G.x + F.x * out + right.x * side;
      RP2[g + 1] = Math.max(footY + 0.04, footY + 0.5 + h1(i, 33) * 3.5 - sink * (1.6 + h1(i, 34) * 1.6));
      RP2[g + 2] = G.z + F.z * out + right.z * side;
      const k = stormOp * (0.3 + 0.7 * h1(i, 35));
      RC[g] = COOL[0] * k; RC[g + 1] = COOL[1] * k; RC[g + 2] = COOL[2] * k;
    }
    B.rain.touch();

    /* ---- the motes drifting over the moonlit water, out of step with one another ---- */
    const MP = B.motes.pos, MC = B.motes.col;
    for (let i = 0; i < N_MOTE; i++) {
      const g = i * 3;
      const ph = i * 0.618;
      const seed = h1(i, 65);
      MP[g] = G.x + (h1(i, 61) - 0.5) * 30 + Math.sin(t * 0.07 + ph) * 1.1;
      MP[g + 1] = footY + 0.5 + h1(i, 62) * 5.5 + Math.sin(t * 0.11 + ph * 1.31) * 0.45;
      MP[g + 2] = G.z + (h1(i, 63) - 0.5) * 30 + Math.cos(t * 0.06 + ph * 0.87) * 1.1;
      const k = 0.22 + 0.18 * seed;
      MC[g] = COOL[0] * k; MC[g + 1] = COOL[1] * k; MC[g + 2] = COOL[2] * k;
    }
    B.motes.touch();

    /* ---- the reeds: a slow layered sway, each on its own phase ---- */
    for (let i = 0; i < N_REED; i++) {
      const ph = B.reedPh[i];
      const a = Math.sin(t * 0.5 + ph) * 0.055 + Math.sin(t * 0.23 + ph * 1.7) * 0.035;
      _e.set(a * 0.7, 0, a);
      _q.setFromEuler(_e);
      const g = i * 3;
      _m4.compose(_s1.set(B.reedBase[g], B.reedBase[g + 1], B.reedBase[g + 2]), _q, _s2.set(1, B.reedH[i], 1));
      B.reeds.setMatrixAt(i, _m4);
    }
    B.reeds.instanceMatrix.needsUpdate = true;

    /* ---- the wheel: pushed around, then eased to a standstill ---- */
    const wDur = T_STOP - T_WHEEL;
    B.wheelSpin.rotation.z = eic(clamp01((t - T_WHEEL) / wDur)) * wDur * 1.1;
    const wOp = ss(t, T_WHEEL, T_WHEEL + 3) * (1 - ss(t, T_STOP + 28, T_STOP + 48)) * 0.5;
    B.wheelMat.opacity = wOp;
    B.wheelRig.visible = wOp > 0.002;
  }

  /* The spine of the telling. The states above are pure functions of narration time, so these
     marks name the moments and hold no state of their own. */
  const beats: Beat[] = [
    { t: 0, apply: () => {} },          // TIED
    { t: T_TIGHT, apply: () => {} },    // the knot pulls tight
    { t: T_LOOSE, apply: () => {} },    // the loosening begins
    { t: T_WHEEL, apply: () => {} },    // the wheel turns
    { t: T_STOP, apply: () => {} },     // the wheel stops
    { t: T_HANDS, apply: () => {} },    // the hands open
    { t: T_LEAF, apply: () => {} },     // the leaf is given to the wind
    { t: T_STORM, apply: () => {} },    // the storm is spent
    { t: T_RELEASE, apply: () => {} },  // RELEASE
  ];

  const opts: LessonOpts = {
    id: "shore",
    trackId: "L03",
    seatPos,
    seatHeading,
    seatRadius: 3,
    build,
    beats,
  };

  const lesson = new LessonScene(scene, narration, whisper, opts);
  const baseUpdate = lesson.update.bind(lesson);
  const baseDispose = lesson.dispose.bind(lesson);

  lesson.update = (dt: number): void => {
    baseUpdate(dt);
    tick(uTRef ? uTRef.value : 0);
  };
  lesson.dispose = (): void => {
    baseDispose();
    for (const d of disposables) d.dispose();
    disposables.length = 0;
    built = null;
  };

  return lesson;
}