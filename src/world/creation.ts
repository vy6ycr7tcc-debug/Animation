/* The whole creation, and the light flowing through it.
   The Law of One image this follows: the love and light of the infinite Creator pours through
   everything. Here it is drawn literally, as light that is always moving:
   - Trees of light. Pulses of light run down their veins from the crown into the trunk, and on
     down the roots, which go deep into the earth. The roots are seen through the ground as
     glowing threads, brightest where you stand.
   - The roots of neighbouring trees and crystals join underground in one network, and the same
     pulses travel along it: nothing stands alone.
   - Crystals catch the light. Some take a shaft of it straight down from the sky, and each
     crystal breaks it into a rainbow fan across the ground. They wake as you pass.
   - Rocks, etched with the drawings' fine gold lattice.
   - Spirits: wisps of light with flowing veils. They drift among the trees, and some come to
     keep you company a while.
   Everything is placed by a hash of its cell, so the world is the same on every visit. Nothing
   here makes a sound. */
import * as THREE from "three/webgpu";
import { softPoints, spriteCloud, T, viewDepth, type N, type SpriteCloud } from "../gpu/tsl";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LifeFrame, Sparks } from "./life";
import { etchedStone, vibeUniforms } from "./etching";
import { surface } from "./textures";
import { GROVE_SITES } from "./sites";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { floatAttributes, loadBytes } from "../core/assets";
import { colliders, fbm, groundKind, heightAt, LANDMARK_SITES, SPAWN, smooth, WATER_Y, type Collider } from "./terrain";

/** Shared by every shader here; main.ts copies the scene's fog in. */
export const creationUniforms = {
  uT: T.uniform(0),
  uPlayer: T.uniform(new THREE.Vector3()),
  uStar: T.uniform(new THREE.Vector3(0, 1, 0)),
  uFogC: T.uniform(new THREE.Color()),
  uFogD: T.uniform(0.006),
  uPx: T.uniform(600), // pixels per unit at distance 1 (for point sizes)
  uCommune: T.uniform(0), // 0–1: the wanderer's stillness; the whole network of light shows itself
};
const U = creationUniforms;

const {
  abs, attribute, cameraPosition, clamp, cos, cross, dFdx, dFdy, Discard, distance, dot, exp, float, Fn, fract, fwidth, If,
  inverseSqrt, length, max, mix, normalize, normalWorldGeometry, pointUV, positionGeometry, positionLocal, positionWorld, pow, reflect, screenCoordinate,
  sin, smoothstep, step, texture, varying, vec2, vec3, vec4,
} = T;
/** 0 where a light would come between the camera and the wanderer, or right up against the
    lens; 1 anywhere else. Spirits and their veils fade there, so they never cover the view. */
const outOfTheWay = (p: N): N => {
  const a = cameraPosition, b = U.uPlayer.add(vec3(0, 1.2, 0)), ab = b.sub(a);
  const t = clamp(dot(p.sub(a), ab).div(max(dot(ab, ab), 1e-3)), 0, 1);
  return smoothstep(0.5, 1.8, distance(p, a.add(ab.mul(t)))).mul(smoothstep(2.5, 6, distance(p, a)));
};
const fogF = (d: N): N => float(1).sub(exp(U.uFogD.mul(U.uFogD).mul(d).mul(d).negate()));
const hash1 = (p: N): N => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));
const spectrum = (h: N): N => cos(vec3(h).add(vec3(0, 0.33, 0.67)).mul(6.28318)).mul(0.5).add(0.5);
/** The same hash on the CPU (a tree's seed from where it stands). */
const hash1js = (x: number, z: number) => {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

function cellHash(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function rng(seed: number): () => number {
  let s = Math.floor(seed * 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
/** Keep clear of where the wanderer wakes and of the landmarks' pads. */
function clearOf(x: number, z: number, spawnR: number, padR: number): boolean {
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < spawnR) return false;
  for (const [lx, lz] of LANDMARK_SITES) if (Math.hypot(x - lx, z - lz) < padR) return false;
  for (const g of GROVE_SITES) if (Math.hypot(x - g.x, z - g.z) < padR + 6) return false;
  return true;
}

/* ================================================================ tree growing
   Living things are drawn round (Samuel: "rounder and circular"). Every limb is one smooth
   curve bending in an arc, with no joints. Twigs and the finest roots curl into small spirals
   at their ends: the spiral of the drawings. */
const V = THREE.Vector3;
interface Seg {
  a: THREE.Vector3;
  b: THREE.Vector3;
  ra: number;
  rb: number;
  ua: number;
  ub: number;
}
interface Limb {
  pts: THREE.Vector3[];
  r0: number;
  r1: number;
  u0: number;
  u1: number;
  flare?: boolean;
  curl?: boolean;
}
export interface TreeShape {
  height: number;
  radius: number;
  limbs: number;
  depth: number;
  spread: number;
  limbLen: number;
  bend: number; // how far each limb arcs, in radians
  roots: number;
  rootLen: number;
  leaves: number; // glints in the rosette at each twig tip
}
export const SHAPES: TreeShape[] = [
  { height: 5.2, radius: 0.26, limbs: 3, depth: 2, spread: 0.6, limbLen: 2.8, bend: 0.7, roots: 6, rootLen: 3.4, leaves: 6 }, // graceful
  { height: 7.4, radius: 0.22, limbs: 3, depth: 2, spread: 0.42, limbLen: 2.6, bend: 0.5, roots: 5, rootLen: 3.8, leaves: 5 }, // slender
  { height: 4.2, radius: 0.3, limbs: 4, depth: 2, spread: 0.95, limbLen: 3.4, bend: 0.9, roots: 6, rootLen: 3.2, leaves: 7 }, // spreading, like a tree of life
  { height: 7.8, radius: 0.55, limbs: 5, depth: 2, spread: 0.72, limbLen: 4.2, bend: 0.8, roots: 9, rootLen: 5.8, leaves: 7 }, // the elder
];

const polyLen = (p: THREE.Vector3[]) => p.reduce((s, q, i) => (i ? s + q.distanceTo(p[i - 1]) : 0), 0);
function perpendicular(d: THREE.Vector3, R: () => number): THREE.Vector3 {
  const a = new V().crossVectors(d, new V(R() - 0.5, R() - 0.5, R() - 0.5));
  return a.lengthSq() < 1e-6 ? new V().crossVectors(d, new V(1, 0, 0)).normalize() : a.normalize();
}
/** One limb as a smooth arc. A curling limb turns ever faster toward its end, into a spiral. */
function arc(p: THREE.Vector3, dir: THREE.Vector3, len: number, turn: number, axis: THREE.Vector3, curl: boolean, lift: number): THREE.Vector3[] {
  const n = curl ? 14 : 8;
  const w = Array.from({ length: n }, (_, i) => (curl ? 1 + (i / n) ** 2 * 9 : 1));
  const sw = w.reduce((a, b) => a + b, 0);
  const d = dir.clone().normalize();
  const pts = [p.clone()];
  let c = p.clone();
  for (let i = 0; i < n; i++) {
    d.applyAxisAngle(axis, (turn * w[i]) / sw);
    d.y += lift / n;
    d.normalize();
    // a spiral's steps shorten as it winds in
    c = c.clone().addScaledVector(d, (len / n) * (curl ? 1.35 - (i / n) * 0.8 : 1));
    pts.push(c);
  }
  return pts;
}

export function grow(shape: TreeShape, seed: number): { limbs: Limb[]; roots: Limb[]; tips: THREE.Vector3[] } {
  const R = rng(seed);
  const limbs: Limb[] = [];
  const roots: Limb[] = [];
  const tips: THREE.Vector3[] = [];
  const up = new V(0, 1, 0);
  const branch = (p: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number, u: number) => {
    const curl = depth === 0;
    let axis: THREE.Vector3, turn: number;
    if (curl) {
      // twigs curl mostly upward and inward, like fronds unfurling
      axis = new V().crossVectors(up, dir);
      if (axis.lengthSq() < 1e-4) axis = perpendicular(dir, R);
      axis.normalize();
      turn = (R() < 0.7 ? -1 : 1) * (3.2 + R() * 2.2);
    } else {
      axis = perpendicular(dir, R);
      turn = shape.bend * (0.6 + R() * 0.8) * (R() < 0.5 ? -1 : 1);
    }
    const pts = arc(p, dir, len, turn, axis, curl, curl ? 0 : 0.35);
    const L = polyLen(pts);
    limbs.push({ pts, r0: r, r1: curl ? r * 0.2 : r * 0.6, u0: u, u1: u + L, curl });
    if (curl) {
      tips.push(pts[Math.floor(pts.length * 0.7)].clone());
      return;
    }
    const n = 2 + (R() < 0.6 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const at = Math.min(pts.length - 1, Math.floor(pts.length * (0.5 + (k / n) * 0.45 + R() * 0.1)));
      const tan = new V().subVectors(pts[at], pts[at - 1]).normalize();
      const perp = perpendicular(tan, R);
      const ang = shape.spread * (0.7 + R() * 0.6);
      const cd = tan.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang));
      const t = at / (pts.length - 1);
      branch(pts[at], cd.normalize(), len * (0.62 + R() * 0.14), r * (1 - t * 0.4) * 0.7, depth - 1, u + L * t);
    }
  };
  // The trunk: one gentle curve, flaring at the foot.
  const lean = new V((R() - 0.5) * 0.3, 1, (R() - 0.5) * 0.3).normalize();
  const trunkPts = arc(new V(0, -0.3, 0), lean, shape.height * 0.55 + 0.3, 0.25 + R() * 0.2, perpendicular(lean, R), false, 0);
  const trunkLen = polyLen(trunkPts);
  limbs.push({ pts: trunkPts, r0: shape.radius, r1: shape.radius * 0.72, u0: 0, u1: trunkLen, flare: true });
  for (let k = 0; k < shape.limbs; k++) {
    // most limbs leave from the top; one or two from lower down the trunk
    const at = k < shape.limbs - 1 || shape.limbs < 3 ? trunkPts.length - 1 : Math.floor(trunkPts.length * 0.7);
    const t = at / (trunkPts.length - 1);
    const tan = new V().subVectors(trunkPts[at], trunkPts[at - 1]).normalize();
    const az = (k / shape.limbs) * Math.PI * 2 + R() * 0.8;
    const perp = new V(Math.cos(az), 0, Math.sin(az));
    const ang = shape.spread * (0.75 + R() * 0.5);
    const cd = tan.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang)).normalize();
    branch(trunkPts[at], cd, shape.limbLen * (0.85 + R() * 0.3), shape.radius * 0.72, shape.depth, trunkLen * t);
  }
  // Roots: they flare out, arc down into the earth and divide; the finest end in curls.
  const root = (p: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number, u: number) => {
    const curl = depth === 0;
    const axis = curl ? perpendicular(dir, R) : new V().crossVectors(dir, up).normalize();
    const turn = curl ? (R() < 0.5 ? -1 : 1) * (3 + R() * 2.5) : -(0.5 + R() * 0.6);
    const pts = arc(p, dir, len, turn, axis.lengthSq() > 1e-4 ? axis : perpendicular(dir, R), curl, curl ? 0 : -0.9);
    const L = polyLen(pts);
    roots.push({ pts, r0: r, r1: r * 0.4, u0: -u, u1: -(u + L) });
    if (curl) return;
    for (let k = 0; k < 2; k++) {
      const at = Math.floor(pts.length * (0.45 + k * 0.4));
      const tan = new V().subVectors(pts[at], pts[at - 1]).normalize();
      const cd = tan.clone().multiplyScalar(Math.cos(0.6)).addScaledVector(perpendicular(tan, R), Math.sin(0.6));
      root(pts[at], cd.normalize(), len * 0.62, r * 0.55, depth - 1, u + (L * at) / (pts.length - 1));
    }
  };
  for (let k = 0; k < shape.roots; k++) {
    const az = (k / shape.roots) * Math.PI * 2 + R() * 0.5;
    const out = new V(Math.cos(az), -0.3, Math.sin(az));
    const p = new V(Math.cos(az) * shape.radius * 0.7, 0.1, Math.sin(az) * shape.radius * 0.7);
    root(p, out, shape.rootLen * (0.7 + R() * 0.6), shape.radius * 0.5, 3, 0);
  }
  // Normalise "along" so the crown's tips are 1 and the deepest root tips are -1.
  const maxU = Math.max(...limbs.map((g) => g.u1));
  const minU = Math.min(...roots.map((g) => g.u1));
  for (const g of limbs) {
    g.u0 /= maxU;
    g.u1 /= maxU;
  }
  for (const g of roots) {
    g.u0 /= -minU;
    g.u1 /= -minU;
  }
  return { limbs, roots, tips };
}

/** Smooth, round tubes along each limb: position, normal, aU (along the tree, -1 root tip … 1
    crown tip), aAng (around). Rings stop once aU falls below `minU` (to keep only the roots
    near the surface). */
export function tubes(limbs: Limb[], minU = -Infinity): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], au: number[] = [], ang: number[] = [], idx: number[] = [];
  for (const g of limbs) {
    const curve = new THREE.CatmullRomCurve3(g.pts);
    const L = curve.getLength();
    const segs = g.curl ? 7 : Math.max(3, Math.min(12, Math.round(L / 0.45)));
    const sides = g.curl ? 3 : g.r0 > 0.15 ? 8 : g.r0 > 0.06 ? 5 : 4;
    const fr = curve.computeFrenetFrames(segs, false);
    const base = pos.length / 3;
    let rings = 0;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const u = g.u0 + (g.u1 - g.u0) * t;
      if (u < minU && rings >= 2) break;
      const P = curve.getPointAt(t);
      const r = (g.r0 + (g.r1 - g.r0) * t) * (g.flare ? 1 + 0.9 * (1 - t) ** 6 : 1);
      const N = fr.normals[i], B = fr.binormals[i];
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const n = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, -Math.sin(a));
        pos.push(P.x + n.x * r, P.y + n.y * r, P.z + n.z * r);
        nor.push(n.x, n.y, n.z);
        au.push(u);
        ang.push(k / sides);
      }
      rings++;
    }
    for (let i = 0; i < rings - 1; i++)
      for (let k = 0; k < sides; k++) {
        const i0 = base + i * (sides + 1) + k, i1 = i0 + 1, j0 = i0 + sides + 1, j1 = j0 + 1;
        idx.push(i0, j0, i1, i1, j0, j1);
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("aU", new THREE.Float32BufferAttribute(au, 1));
  geo.setAttribute("aAng", new THREE.Float32BufferAttribute(ang, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/** The roots as fine lines: each root's curve, sampled finely so it reads round. */
function rootLineSegs(roots: Limb[]): Seg[] {
  const out: Seg[] = [];
  for (const g of roots) {
    const curve = new THREE.CatmullRomCurve3(g.pts);
    const n = Math.max(4, Math.round(curve.getLength() / 0.18));
    let prev = curve.getPointAt(0);
    for (let i = 1; i <= n; i++) {
      const q = curve.getPointAt(i / n);
      const ua = g.u0 + ((g.u1 - g.u0) * (i - 1)) / n, ub = g.u0 + ((g.u1 - g.u0) * i) / n;
      out.push({ a: prev, b: q, ra: 0, rb: 0, ua, ub });
      prev = q;
    }
  }
  return out;
}

/** Living bark: willow-bark relief, a thin rim of starlight, fine grain lines of light, and
    light flowing down from the crown. `accent`: the colour of that light (default: gold/silver).
    Instanced meshes carry each tree's seed in `aSeed`; a single tree passes its `seed`. */
export function barkMaterial(accent?: THREE.Color, seed: number | null = null): THREE.MeshBasicNodeMaterial {
  const barkTex = surface("bark");
  const m = new THREE.MeshBasicNodeMaterial({ fog: false });
  const aSeed = seed === null ? attribute("aSeed", "float") : float(seed);
  // the crown sways; the roots stay still (positionLocal is already in the world here)
  const sw0 = max(positionGeometry.y, 0), sway = sw0.mul(sw0).mul(0.002);
  const P = positionLocal;
  m.positionNode = vec3(
    P.x.add(sin(U.uT.mul(0.55).add(aSeed.mul(6.28)).add(P.z.mul(0.05))).mul(sway)),
    P.y,
    P.z.add(cos(U.uT.mul(0.43).add(aSeed.mul(4))).mul(sway).mul(0.6)),
  );
  const vSeed = varying(aSeed), vU = varying(attribute("aU", "float")), vAng = varying(attribute("aAng", "float"));
  const acc = accent ? vec3(accent.r, accent.g, accent.b) : null;
  m.colorNode = Fn(() => {
    const vW = positionWorld;
    const buv = vec2(vAng.mul(2), vU.mul(7).add(vSeed));
    const n0 = normalize(normalWorldGeometry);
    const v = normalize(cameraPosition.sub(vW));
    const dist0 = length(vW.sub(cameraPosition));
    // the bark's relief, from its normal map, oriented by the surface's own derivatives
    const mm = mix(vec3(0, 0, 1), texture(barkTex.nor, buv).xyz.mul(2).sub(1), float(1).sub(smoothstep(25, 60, dist0)));
    const q0 = dFdx(vW), q1 = dFdy(vW), s0 = dFdx(buv), s1 = dFdy(buv);
    const q1p = cross(q1, n0), q0p = cross(n0, q0);
    const Tn = q1p.mul(s0.x).add(q0p.mul(s1.x)), Bn = q1p.mul(s0.y).add(q0p.mul(s1.y));
    const dd = max(dot(Tn, Tn), dot(Bn, Bn));
    const k = dd.equal(0).select(float(0), inverseSqrt(dd));
    const nb = normalize(Tn.mul(mm.x.mul(k)).add(Bn.mul(mm.y.mul(k))).add(n0.mul(mm.z)));
    const n = dist0.lessThan(60).select(nb, n0);
    const bk = texture(barkTex.diff, buv).rgb;
    const hemi = n.y.mul(0.5).add(0.5);
    const c = mix(vec3(0.006, 0.005, 0.014), vec3(0.03, 0.028, 0.06), hemi).mul(bk.mul(2.4).add(0.4)).toVar();
    c.addAssign(vec3(0.09, 0.07, 0.05).mul(max(0, dot(n, U.uStar))));
    c.addAssign(vec3(0.3, 0.38, 0.8).mul(pow(float(1).sub(max(0, dot(n, v))), 5)).mul(0.18)); // a thin rim of starlight
    // the grain spirals up the trunk as fine lines of light
    const f = vAng.mul(4).add(vU.mul(5)).add(vSeed.mul(3));
    const w = fwidth(f);
    const grain = float(1).sub(smoothstep(w.mul(0.4), w.mul(1.4), abs(fract(f).sub(0.5))));
    // light pours down from the crown toward the roots
    const flow = pow(fract(vU.mul(3).add(U.uT.mul(0.11)).add(vSeed)), 14);
    const near = smoothstep(12, 2, distance(vW.xz, U.uPlayer.xz));
    const gold0 = mix(vec3(1.0, 0.78, 0.48), vec3(0.75, 0.85, 1.0), step(0.5, vSeed));
    const gold = acc ?? gold0;
    c.addAssign(gold.mul(grain.mul(near.mul(0.12).add(0.05).add(flow.mul(1.1))).add(flow.mul(0.08))));
    // never a wall of bark in front of the camera: it dissolves as the camera comes close
    If(hash1(screenCoordinate.xy).greaterThan(smoothstep(0.6, 2.2, dist0)), () => {
      Discard();
    });
    return vec4(mix(c, U.uFogC, fogF(dist0)), 1);
  })();
  return m;
}

/* ================================================================ crystals */
function prismGeometry(): THREE.BufferGeometry {
  // A six-sided column with a pointed tip; facets flat-shaded. aY is 0 at the base, 1 at the tip.
  const pos: number[] = [], ys: number[] = [];
  const r = 0.2, body = 0.74;
  const ring = (y: number, rr: number) => Array.from({ length: 6 }, (_, k) => new V(Math.cos((k / 6) * Math.PI * 2) * rr, y, Math.sin((k / 6) * Math.PI * 2) * rr));
  const lo = ring(0, r * 0.92), hi = ring(body, r), tip = new V(0, 1, 0);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    for (const p of [a, b, c]) {
      pos.push(p.x, p.y, p.z);
      ys.push(p.y);
    }
  };
  for (let k = 0; k < 6; k++) {
    const k1 = (k + 1) % 6;
    tri(lo[k], hi[k1], hi[k]);
    tri(lo[k], lo[k1], hi[k1]);
    tri(hi[k], hi[k1], tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aY", new THREE.Float32BufferAttribute(ys, 1));
  g.computeVertexNormals();
  return g;
}

/* ================================================================ placement records */
export interface TreeDef {
  x: number;
  y: number;
  z: number;
  kind: number;
  rot: number;
  scale: number;
  hue: number;
}
interface RockDef {
  x: number;
  y: number;
  z: number;
  kind: number;
  m: THREE.Matrix4;
  r: number;
}
interface ClusterDef {
  key: string;
  x: number;
  y: number;
  z: number;
  great: boolean;
  prisms: { m: THREE.Matrix4; hue: number }[];
  glow: number;
  woke: number; // time it last woke
}

export const TCELL = 12;
const TRING = 8; // trees out to ~100 m (beyond, forest.ts draws their likenesses)
const RCELL = 10, RRING = 6; // rocks out to ~65 m
const CCELL = 23, CRING = 5; // crystals out to ~120 m
const MAX_TREES = 90, MAX_ROCKS = 240, MAX_PRISMS = 900, MAX_BEAMS = 24;

export class Creation {
  group = new THREE.Group();
  /** Things the water's mirror should skip (seen-through-the-ground effects). */
  noReflect: THREE.Object3D[] = [];
  private trees = new Map<string, TreeDef | null>();
  private rocks = new Map<string, RockDef[]>();
  private clusters = new Map<string, ClusterDef | null>();
  private activeTrees: TreeDef[] = [];
  private activeClusters: ClusterDef[] = [];
  private barks: THREE.InstancedMesh[] = [];
  private rootSegs: Seg[][] = [];
  private rootLines!: THREE.LineSegments;
  private tipSets: { p: Float32Array; k: Float32Array }[] = [];
  private leaves: SpriteCloud;
  private rockMeshes: THREE.InstancedMesh[] = [];
  private prisms: THREE.InstancedMesh;
  private prismC: THREE.InstancedBufferAttribute;
  private beamGeo!: THREE.InstancedBufferGeometry;
  private beamBase!: THREE.InstancedBufferAttribute;
  private beamA: THREE.InstancedBufferAttribute;
  private barkSeeds: THREE.InstancedBufferAttribute[] = [];
  private fans: THREE.Mesh;
  private web: THREE.LineSegments;
  private mine: Collider[] = [];
  private stones: { p: THREE.Vector3; r: number; crystal: boolean }[] = [];
  private cx = Infinity;
  private cz = Infinity;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new V();
  private sc = new V();

  constructor(private sparks: Sparks) {
    this.buildTrees();
    this.leaves = this.buildLeaves();
    this.buildRocks();
    const [prisms, prismC] = this.buildPrisms();
    this.prisms = prisms;
    this.prismC = prismC;
    const [, beamA] = this.buildBeams();
    this.beamA = beamA;
    this.fans = this.buildFans();
    this.web = this.buildWeb();
    this.noReflect.push(this.rootLines, this.web, this.fans);
  }

  /* ---------------------------------------------------------------- materials and meshes */
  private buildTrees(): void {
    const bark = barkMaterial();
    // Roots seen through the ground as fine lines of light: drawn only where something (the
    // earth) is in front of them. Rebuilt for the trees near the wanderer as they stream in.
    {
      const mat = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth, blending: THREE.AdditiveBlending, fog: false });
      const vR = attribute("aR", "vec2"); // along (0 at the trunk, -1 at the deepest tip), seed
      const vW = positionWorld;
      const flow = pow(fract(vR.x.mul(3).add(U.uT.mul(0.11)).add(vR.y)), 10);
      const near = smoothstep(14, 1.5, distance(vW.xz, U.uPlayer.xz));
      const d = length(vW.sub(cameraPosition));
      const fade = float(1).sub(smoothstep(mix(5, 30, U.uCommune), mix(16, 60, U.uCommune), d)).mul(float(1).sub(smoothstep(0.4, 1, vR.x.negate()).mul(0.5)));
      const c = mix(vec3(1.0, 0.78, 0.5), vec3(0.72, 0.82, 1.0), step(0.5, vR.y));
      mat.colorNode = vec4(c.mul(near.mul(0.06).add(0.03).add(flow.mul(near.mul(0.5).add(0.35)))).mul(fade).mul(U.uCommune.mul(2.5).add(1)), 1);
      this.rootLines = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
    }
    this.rootLines.frustumCulled = false;
    this.rootLines.renderOrder = 3;
    this.group.add(this.rootLines);
    SHAPES.forEach((shape, kind) => {
      const { limbs, roots, tips } = grow(shape, 0.137 + kind * 0.211);
      const geo = mergeGeometries([tubes(limbs), tubes(roots, -0.2)]);
      const seeds = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TREES), 1);
      seeds.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aSeed", seeds);
      this.barkSeeds.push(seeds);
      const mesh = new THREE.InstancedMesh(geo, bark, MAX_TREES);
      mesh.count = 0;
      mesh.castShadow = true; // the moon casts the trees' shadows near the wanderer
      this.barks.push(mesh);
      this.rootSegs.push(rootLineSegs(roots));
      this.group.add(mesh);
      // a round rosette of glints around each twig's curl, and a soft glow over every other
      const R = rng(0.77 + kind * 0.1);
      const p: number[] = [], k: number[] = [];
      tips.forEach((tp, i) => {
        const tilt = (R() - 0.5) * 0.8, ph = R() * 6.28, rr = 0.35 + R() * 0.25;
        for (let j = 0; j < shape.leaves; j++) {
          const a = ph + (j / shape.leaves) * Math.PI * 2;
          p.push(tp.x + Math.cos(a) * rr, tp.y + Math.sin(a) * rr * tilt + 0.1, tp.z + Math.sin(a) * rr);
          k.push(R() * 0.9); // small glints
        }
        if (i % 2 === 0) {
          p.push(tp.x, tp.y + 0.3, tp.z);
          k.push(1.0 + R() * 0.9); // ≥ 1: a soft canopy glow
        }
      });
      this.tipSets.push({ p: new Float32Array(p), k: new Float32Array(k) });
    });
  }

  private buildLeaves(): SpriteCloud {
    const mat = softPoints();
    const cloud = spriteCloud(MAX_TREES * 420, { base: 3, aK: 1, aHue: 1 }, mat);
    const { base, aK, aHue } = cloud.nodes;
    const big = step(1, aK), k = fract(aK);
    // a few glints come loose and drift down: light descending into the world
    const falling = step(k, 0.07).mul(float(1).sub(big));
    const fall = fract(U.uT.mul(0.035).add(k.mul(37)));
    const p = base.add(vec3(
      sin(U.uT.mul(0.7).add(k.mul(40))).mul(0.08).add(falling.mul(sin(fall.mul(9).add(k.mul(50)))).mul(0.8)),
      sin(U.uT.mul(0.9).add(k.mul(23))).mul(0.06).sub(falling.mul(fall).mul(7)),
      0,
    ));
    mat.positionNode = p;
    const d = distance(p, cameraPosition);
    const near = smoothstep(14, 3, distance(p.xz, U.uPlayer.xz));
    const tw = sin(U.uT.mul(k.mul(2.5).add(1.2)).add(k.mul(60))).mul(0.45).add(0.55);
    // the canopy brightens in slow waves, in step with the light flowing down the trunk
    const wave = sin(U.uT.mul(0.5).sub(p.y.mul(0.4)).add(aHue.mul(6))).mul(0.4).add(0.6);
    const vA = mix(tw.mul(wave).mul(near.mul(1.2).add(1)), near.mul(0.2).add(0.22), big)
      .mul(float(1).sub(falling.mul(fall))).mul(float(1).sub(fogF(d))).mul(float(1).sub(smoothstep(90, 120, d)));
    const vC = mix(mix(vec3(1.0, 0.8, 0.5), vec3(0.7, 0.85, 1.0), step(0.33, aHue)), vec3(1.0, 0.7, 0.88), step(0.72, aHue));
    const size = mix(0.13, 2.4, big);
    mat.sizeNode = clamp(size.mul(U.uPx).div(max(viewDepth(p), 0.5)), 1.5, 90).div(T.screenDPR);
    const r = length(pointUV.sub(0.5)).mul(2);
    const a = mix(smoothstep(1, 0, r).mul(1.6).add(smoothstep(0.3, 0, r).mul(1.5)), exp(r.mul(r).mul(-3.5)).mul(0.3), big);
    mat.colorNode = vec4(vC.mul(a).mul(vA), 1);
    cloud.setCount(0);
    this.group.add(cloud.sprite);
    return cloud;
  }

  private buildRocks(): void {
    const mat = etchedStone("#282338", "#d8b8ff", 1.7);
    mat.flatShading = true;
    for (let v = 0; v < 3; v++) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position as THREE.BufferAttribute;
      const s = [0.3, 1.7, 3.1][v];
      for (let i = 0; i < p.count; i++) {
        this.v.fromBufferAttribute(p, i);
        const n = this.v.clone().normalize();
        const d = 0.72 + fbm(n.x * 1.6 + s, n.z * 1.6 + n.y * 1.3 - s) * 0.55;
        this.v.copy(n).multiplyScalar(d);
        p.setXYZ(i, this.v.x, this.v.y * [0.6, 0.85, 0.5][v], this.v.z);
      }
      g.computeVertexNormals();
      const m = new THREE.InstancedMesh(g, mat, MAX_ROCKS);
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      this.rockMeshes.push(m);
      this.group.add(m);
    }
    void this.loadScannedRocks();
  }

  /** Swap the stand-in rocks for real scanned boulders (CC0, Poly Haven) once they arrive. */
  private async loadScannedRocks(): Promise<void> {
    const bytes = await loadBytes("models/rocks.glb");
    if (!bytes) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    floatAttributes(gltf.scene);
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
    meshes.slice(0, this.rockMeshes.length).forEach((src, k) => {
      // centred, about a metre across, like the stand-ins they replace
      const g = src.geometry.clone();
      g.applyMatrix4(src.matrixWorld);
      g.computeBoundingBox();
      const c = g.boundingBox!.getCenter(new THREE.Vector3()), size = g.boundingBox!.getSize(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z);
      g.scale(2 / Math.max(size.x, size.z), 2 / Math.max(size.x, size.z), 2 / Math.max(size.x, size.z));
      // stand on the ground: the placement sinks rocks by 0.28 of their size; leave only a little buried
      g.computeBoundingBox();
      g.translate(0, 0.18 - g.boundingBox!.min.y, 0);
      g.computeBoundingSphere();
      const old = src.material as THREE.MeshStandardMaterial;
      // the lattice only a whisper on real rock
      const mat = etchedStone("#a3a6c4", "#2a2438", 1.7, { triplanar: false, map: old.map, normalMap: old.normalMap });
      const target = this.rockMeshes[k];
      target.geometry.dispose();
      target.geometry = g;
      target.material = mat;
      target.computeBoundingSphere();
    });
  }

  private buildPrisms(): [THREE.InstancedMesh, THREE.InstancedBufferAttribute] {
    const geo = prismGeometry();
    const c = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PRISMS * 3), 3); // hue, glow, seed
    c.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aC", c);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    mat.colorNode = Fn(() => {
      const vW = positionWorld, vY = attribute("aY", "float"), vCv = attribute("aC", "vec3");
      const n = normalize(normalWorldGeometry), v = normalize(cameraPosition.sub(vW));
      const ndv = abs(dot(n, v));
      const fres = pow(float(1).sub(ndv), 2.2);
      const hue = vCv.x, glow = vCv.y, seed = vCv.z;
      const core = mix(vec3(0.45, 0.55, 1.0), vec3(1.0, 0.72, 0.92), hue);
      // the light is split: a rainbow that shifts as you walk around it
      const split = spectrum(ndv.mul(1.4).add(vY.mul(0.4)).add(hue).add(U.uT.mul(0.02)));
      // light rising through the stone
      const rise = pow(fract(vY.mul(1.3).sub(U.uT.mul(0.22)).add(seed)), 8);
      // the starlight glints off a facet
      const glint = pow(max(0, dot(reflect(v.negate(), n), U.uStar)), 40);
      const c = core.mul(vY.mul(0.3).add(0.08)).add(split.mul(fres).mul(0.8)).add(core.mul(rise).mul(0.7)).add(vec3(1.0, 0.95, 0.9).mul(glint).mul(2.5))
        .mul(glow.mul(1.6).add(1)).toVar();
      // vibrating: light pulses up through the crystal and races out from it
      const vd = distance(vW, vibeUniforms.uVibePos);
      const on = float(1).sub(smoothstep(vibeUniforms.uVibeR.mul(1.1), vibeUniforms.uVibeR.mul(1.6).add(0.8), vd));
      const wave = pow(sin(vd.mul(8).sub(U.uT.mul(10))).mul(0.5).add(0.5), 5);
      c.addAssign(split.mul(1.2).add(core).mul(wave).mul(on).mul(vibeUniforms.uVibeK).mul(1.5));
      const d = length(vW.sub(cameraPosition));
      return vec4(c.mul(float(1).sub(fogF(d).mul(0.85))), 1);
    })();
    const m = new THREE.InstancedMesh(geo, mat, MAX_PRISMS);
    m.count = 0;
    m.renderOrder = 2;
    this.group.add(m);
    return [m, c];
  }

  /** Shafts of light coming down from the sky onto the great crystals. */
  private buildBeams(): [THREE.Mesh, THREE.InstancedBufferAttribute] {
    const plane = new THREE.PlaneGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", plane.attributes.position);
    geo.setIndex(plane.index);
    const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BEAMS), 1);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aA", a);
    this.beamBase = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BEAMS * 3), 3);
    this.beamBase.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aBase", this.beamBase);
    geo.instanceCount = 0;
    this.beamGeo = geo;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const base = attribute("aBase", "vec3"), P = positionLocal;
    const h = 90, wd = 1.6;
    const toCam = cameraPosition.sub(base);
    const right = normalize(vec3(toCam.z, 0, toCam.x.negate()).add(1e-4));
    // it widens a little toward the sky
    mat.positionNode = base.add(right.mul(P.x).mul(wd).mul(P.y.mul(2).add(1))).add(vec3(0, P.y.mul(h), 0));
    const vUv = varying(vec2(positionGeometry.x.mul(2), positionGeometry.y)), vA = varying(attribute("aA", "float")), vD = varying(length(base.sub(cameraPosition)));
    const across = exp(vUv.x.mul(vUv.x).mul(-4));
    const up = smoothstep(0, 0.04, vUv.y).mul(float(1).sub(smoothstep(0.35, 1, vUv.y)));
    // bands of light descending the shaft
    const bands = sin(vUv.y.mul(40).add(U.uT.mul(1.2))).mul(0.3).add(0.7);
    const c = mix(vec3(1.0, 0.9, 0.75), spectrum(vUv.x.mul(0.3).add(0.1)), 0.25);
    const near = smoothstep(8, 30, vD); // don't blind the wanderer standing in it
    mat.colorNode = vec4(c.mul(across).mul(up).mul(bands).mul(vA.mul(0.2).add(0.1)).mul(mix(0.35, 1, near)).mul(float(1).sub(fogF(vD).mul(0.6))), 1);
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    this.group.add(m);
    return [m, a];
  }

  /** Rainbow light thrown across the ground by the crystals. Rebuilt as clusters stream in. */
  private buildFans(): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    {
      const vF = attribute("aF", "vec3"), vW = positionWorld; // across 0..1, out 0..1, strength
      const x = fract(vF.x.mul(3).add(U.uT.mul(0.004)));
      const c = spectrum(x.mul(0.8).add(0.02));
      const edge = smoothstep(0, 0.25, x).mul(smoothstep(1, 0.75, x));
      const along = smoothstep(0.05, 0.2, vF.y).mul(float(1).sub(vF.y)).mul(float(1).sub(vF.y));
      const shimmer = sin(vF.y.mul(30).sub(U.uT.mul(2)).add(vF.x.mul(6))).mul(0.2).add(0.8);
      const d = length(vW.sub(cameraPosition));
      mat.colorNode = vec4(c.mul(edge).mul(along).mul(shimmer).mul(vF.z).mul(0.9).mul(float(1).sub(fogF(d))), 1);
    }
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = 1;
    this.group.add(m);
    return m;
  }

  /** The network under the ground: every tree and crystal is joined to its neighbours. */
  private buildWeb(): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth, blending: THREE.AdditiveBlending, fog: false });
    {
      const vS = attribute("aS", "vec2"), vW = positionWorld;
      const pulse = pow(fract(vS.x.mul(1.5).sub(U.uT.mul(0.09)).add(vS.y)), 16);
      const near = smoothstep(16, 2, distance(vW.xz, U.uPlayer.xz));
      const d = length(vW.sub(cameraPosition));
      const fade = float(1).sub(smoothstep(mix(6, 30, U.uCommune), mix(20, 70, U.uCommune), d));
      const c = mix(vec3(1.0, 0.8, 0.55), vec3(0.8, 0.75, 1.0), vS.y);
      mat.colorNode = vec4(c.mul(near.mul(0.05).add(0.02).add(pulse.mul(near.mul(0.5).add(0.3)))).mul(fade).mul(U.uCommune.mul(3).add(1)), 1);
    }
    const l = new THREE.LineSegments(g, mat);
    l.frustumCulled = false;
    l.renderOrder = 3;
    this.group.add(l);
    return l;
  }

  /* ---------------------------------------------------------------- placement */
  /** The tree in grid cell (i, j), if one grows there (cells are TCELL metres). */
  treeAt(i: number, j: number): TreeDef | null {
    const key = `${i},${j}`;
    if (this.trees.has(key)) return this.trees.get(key)!;
    let t: TreeDef | null = null;
    const x = (i + 0.15 + cellHash(i, j, 41) * 0.7) * TCELL, z = (j + 0.15 + cellHash(i, j, 42) * 0.7) * TCELL;
    const grove = smooth(0.46, 0.64, fbm(x * 0.008 + 71, z * 0.008 - 33));
    if (cellHash(i, j, 40) < 0.08 + grove * 0.62 && clearOf(x, z, 11, 16)) {
      const h = heightAt(x, z);
      const k = groundKind(x, z, h);
      if (h > WATER_Y + 0.7 && h < 28 && k.stone < 0.5) {
        const elder = cellHash(i, j, 43) < 0.05;
        t = {
          x, y: h, z,
          kind: elder ? 3 : Math.floor(cellHash(i, j, 44) * 3),
          rot: cellHash(i, j, 45) * Math.PI * 2,
          scale: elder ? 1.1 + cellHash(i, j, 46) * 0.4 : 0.75 + cellHash(i, j, 46) * 0.55,
          hue: cellHash(i, j, 47),
        };
      }
    }
    this.trees.set(key, t);
    if (this.trees.size > 16000) this.trees.delete(this.trees.keys().next().value!);
    return t;
  }

  private rocksAt(i: number, j: number): RockDef[] {
    const key = `${i},${j}`;
    const known = this.rocks.get(key);
    if (known) return known;
    const out: RockDef[] = [];
    const x0 = (i + 0.5) * RCELL, z0 = (j + 0.5) * RCELL;
    const k0 = groundKind(x0, z0);
    const p = 0.08 + k0.stone * 0.7 + k0.sand * 0.12;
    if (cellHash(i, j, 50) < p) {
      const n = 1 + Math.floor(cellHash(i, j, 51) * 3);
      for (let r = 0; r < n; r++) {
        const x = (i + cellHash(i, j, 52 + r)) * RCELL, z = (j + cellHash(i, j, 55 + r)) * RCELL;
        if (!clearOf(x, z, 6, 12)) continue;
        const h = heightAt(x, z);
        if (h < WATER_Y - 1.5) continue;
        const big = cellHash(i, j, 58 + r) < 0.12;
        const s = big ? 1.8 + cellHash(i, j, 61 + r) * 1.8 : 0.25 + cellHash(i, j, 61 + r) * 0.9;
        const m = new THREE.Matrix4().compose(
          new V(x, h - s * 0.28, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler((cellHash(i, j, 64 + r) - 0.5) * 0.5, cellHash(i, j, 67 + r) * 6.28, 0)),
          new V(s, s, s * (0.8 + cellHash(i, j, 70 + r) * 0.4)),
        );
        out.push({ x, y: h, z, kind: Math.floor(cellHash(i, j, 73 + r) * 3), m, r: s * 0.8 });
      }
    }
    this.rocks.set(key, out);
    if (this.rocks.size > 3000) this.rocks.delete(this.rocks.keys().next().value!);
    return out;
  }

  private clusterAt(i: number, j: number): ClusterDef | null {
    const key = `${i},${j}`;
    if (this.clusters.has(key)) return this.clusters.get(key)!;
    let c: ClusterDef | null = null;
    const x = (i + 0.2 + cellHash(i, j, 81) * 0.6) * CCELL, z = (j + 0.2 + cellHash(i, j, 82) * 0.6) * CCELL;
    const h = heightAt(x, z);
    const k = groundKind(x, z, h);
    // the first cluster, just ahead of where the wanderer wakes
    const first = i === 0 && j === -1;
    if ((first || cellHash(i, j, 80) < 0.2 + k.stone * 0.45 + k.sand * 0.15) && clearOf(x, z, first ? 8 : 12, 15) && h > WATER_Y + 0.2 && h < 40) {
      const great = first || cellHash(i, j, 83) < 0.3;
      const R = rng(cellHash(i, j, 84));
      const prisms: ClusterDef["prisms"] = [];
      const n = great ? 7 + Math.floor(R() * 5) : 3 + Math.floor(R() * 5);
      const hue = R();
      for (let p = 0; p < n; p++) {
        const centre = p === 0;
        const a = R() * Math.PI * 2, rr = centre ? 0 : 0.3 + R() * (great ? 1.2 : 0.7);
        const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        const len = (centre ? 1 : 0.35 + R() * 0.55) * (great ? 3.6 : 1.6);
        const tilt = centre ? R() * 0.15 : 0.2 + R() * 0.5;
        const q = new THREE.Quaternion().setFromAxisAngle(new V(Math.sin(a), 0, -Math.cos(a)), tilt);
        const w = len * (0.28 + R() * 0.12) * (great ? 1.1 : 1);
        const m = new THREE.Matrix4().compose(new V(px, heightAt(px, pz) - 0.12, pz), q, new V(w * 1.6, len, w * 1.6));
        prisms.push({ m, hue: (hue + (R() - 0.5) * 0.25 + 1) % 1 });
      }
      c = { key, x, y: h, z, great, prisms, glow: 0, woke: -100 };
    }
    this.clusters.set(key, c);
    return c;
  }

  /** Rebuild the instance lists when the wanderer moves into a new cell. */
  private restream(px: number, pz: number): void {
    // trees
    const byKind: TreeDef[][] = [[], [], [], []];
    this.activeTrees = [];
    const tcx = Math.floor(px / TCELL), tcz = Math.floor(pz / TCELL);
    for (let i = -TRING; i <= TRING; i++)
      for (let j = -TRING; j <= TRING; j++) {
        const t = this.treeAt(tcx + i, tcz + j);
        if (t && byKind[t.kind].length < MAX_TREES) {
          byKind[t.kind].push(t);
          this.activeTrees.push(t);
        }
      }
    const lp = this.leaves.attrs.base, lk = this.leaves.attrs.aK, lh = this.leaves.attrs.aHue;
    const lpa = lp.array as Float32Array, lka = lk.array as Float32Array, lha = lh.array as Float32Array;
    const maxLeaves = lka.length;
    let nl = 0;
    const rp: number[] = [], ra: number[] = [];
    byKind.forEach((list, kind) => {
      const bark = this.barks[kind], roots = this.rootSegs[kind];
      const seeds = this.barkSeeds[kind].array as Float32Array;
      const tips = this.tipSets[kind];
      list.forEach((t, n) => {
        this.q.setFromAxisAngle(this.v.set(0, 1, 0), t.rot);
        this.m4.compose(this.sc.set(t.x, t.y, t.z), this.q, new V(t.scale, t.scale, t.scale));
        bark.setMatrixAt(n, this.m4);
        seeds[n] = hash1js(t.x, t.z);
        if (Math.hypot(t.x - px, t.z - pz) < 50) {
          const seed = t.hue;
          for (const g of roots) {
            for (const [q, u] of [[g.a, g.ua], [g.b, g.ub]] as const) {
              this.v.copy(q).applyMatrix4(this.m4);
              rp.push(this.v.x, this.v.y, this.v.z);
              ra.push(u, seed);
            }
          }
        }
        for (let k = 0; k < tips.k.length && nl < maxLeaves; k++) {
          this.v.set(tips.p[k * 3], tips.p[k * 3 + 1], tips.p[k * 3 + 2]).applyMatrix4(this.m4);
          lpa[nl * 3] = this.v.x;
          lpa[nl * 3 + 1] = this.v.y;
          lpa[nl * 3 + 2] = this.v.z;
          lka[nl] = tips.k[k];
          lha[nl] = t.hue;
          nl++;
        }
      });
      bark.count = list.length;
      bark.instanceMatrix.needsUpdate = true;
      this.barkSeeds[kind].needsUpdate = true;
      bark.computeBoundingSphere();
    });
    this.leaves.setCount(nl);
    const rg = this.renew(this.rootLines);
    rg.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
    rg.setAttribute("aR", new THREE.Float32BufferAttribute(ra, 2));
    lp.needsUpdate = lk.needsUpdate = lh.needsUpdate = true;

    // rocks
    const rocks: RockDef[][] = [[], [], []];
    const rcx = Math.floor(px / RCELL), rcz = Math.floor(pz / RCELL);
    for (let i = -RRING; i <= RRING; i++)
      for (let j = -RRING; j <= RRING; j++) for (const r of this.rocksAt(rcx + i, rcz + j)) if (rocks[r.kind].length < MAX_ROCKS) rocks[r.kind].push(r);

    // crystals (each sits on a rock or two)
    this.activeClusters = [];
    const ccx = Math.floor(px / CCELL), ccz = Math.floor(pz / CCELL);
    for (let i = -CRING; i <= CRING; i++)
      for (let j = -CRING; j <= CRING; j++) {
        const c = this.clusterAt(ccx + i, ccz + j);
        if (c) this.activeClusters.push(c);
      }
    let np = 0, nb = 0;
    const pc = this.prismC.array as Float32Array;
    const fanPos: number[] = [], fanF: number[] = [], fanIdx: number[] = [];
    // the fans fall away from the star, like light through a prism
    const away = Math.atan2(-U.uStar.value.z, -U.uStar.value.x);
    const bb = this.beamBase.array as Float32Array;
    for (const c of this.activeClusters) {
      for (const p of c.prisms) {
        if (np >= MAX_PRISMS) break;
        this.prisms.setMatrixAt(np, p.m);
        pc[np * 3] = p.hue;
        pc[np * 3 + 2] = cellHash(np, c.x, 90);
        np++;
      }
      if (c.great && nb < MAX_BEAMS) {
        bb.set([c.x, c.y + 1.2, c.z], nb++ * 3);
      }
      const base = rocks[0].length < MAX_ROCKS ? 0 : 1;
      const s = c.great ? 1.5 : 0.8;
      rocks[base].push({ x: c.x, y: c.y, z: c.z, kind: base, r: s, m: new THREE.Matrix4().compose(new V(c.x + 0.4, c.y - s * 0.45, c.z - 0.3), this.q.identity(), new V(s, s * 0.7, s)) });
      // a prism rose: three rainbow petals of split light around each cluster
      const len = c.great ? 8 : 4, spread = Math.PI * 2, cols = 36, rows = 6;
      const a0 = away + (cellHash(c.x, c.z, 91) - 0.5) * 0.8;
      const vi = fanPos.length / 3;
      for (let r = 0; r <= rows; r++)
        for (let q = 0; q <= cols; q++) {
          const out = r / rows, across = q / cols;
          const a = a0 + (across - 0.5) * spread;
          const d = 0.4 + out * len;
          const fx = c.x + Math.cos(a) * d, fz = c.z + Math.sin(a) * d;
          fanPos.push(fx, Math.max(heightAt(fx, fz), WATER_Y) + 0.3, fz);
          fanF.push(across, out, c.great ? 1 : 0.6);
        }
      for (let r = 0; r < rows; r++)
        for (let q = 0; q < cols; q++) {
          const i0 = vi + r * (cols + 1) + q, i1 = i0 + 1, j0 = i0 + cols + 1, j1 = j0 + 1;
          fanIdx.push(i0, j0, i1, i1, j0, j1);
        }
    }
    this.prisms.count = np;
    this.prisms.instanceMatrix.needsUpdate = true;
    this.prisms.computeBoundingSphere();
    this.prismC.needsUpdate = true;
    this.beamGeo.instanceCount = nb;
    this.beamBase.needsUpdate = true;
    const fg = this.renew(this.fans);
    fg.setAttribute("position", new THREE.Float32BufferAttribute(fanPos, 3));
    fg.setAttribute("aF", new THREE.Float32BufferAttribute(fanF, 3));
    fg.setIndex(fanIdx);

    rocks.forEach((list, kind) => {
      const m = this.rockMeshes[kind];
      list.forEach((r, n) => m.setMatrixAt(n, r.m));
      m.count = list.length;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    });

    // colliders: trunks, big rocks, crystal clusters
    for (const c of this.mine) {
      const at = colliders.indexOf(c);
      if (at >= 0) colliders.splice(at, 1);
    }
    this.mine = [];
    for (const t of this.activeTrees) this.mine.push({ x: t.x, z: t.z, r: SHAPES[t.kind].radius * t.scale * 1.1, top: t.y + SHAPES[t.kind].height * t.scale });
    for (const list of rocks) for (const r of list) if (r.r > 0.6) this.mine.push({ x: r.x, z: r.z, r: r.r * 0.9, top: r.y + r.r * 0.8 });
    // the stones that can answer stillness: rocks of some size, and every crystal cluster
    this.stones = [
      ...rocks.flat().filter((r) => r.r > 0.35).map((r) => ({ p: new THREE.Vector3(r.x, r.y + r.r * 0.4, r.z), r: r.r * 1.1, crystal: false })),
      ...this.activeClusters.map((c) => ({ p: new THREE.Vector3(c.x, c.y + (c.great ? 1.6 : 0.8), c.z), r: c.great ? 2.2 : 1.2, crystal: true })),
    ];
    for (const c of this.activeClusters) this.mine.push({ x: c.x, z: c.z, r: c.great ? 1.4 : 0.8, top: c.y + (c.great ? 3.6 : 1.6) });
    colliders.push(...this.mine);

    this.buildWebLines();
  }

  private buildWebLines(): void {
    // Join each tree and crystal to its two nearest neighbours, with a thread that sags underground.
    const nodes = [
      ...this.activeTrees.map((t) => [t.x, t.z, 0] as const),
      ...this.activeClusters.map((c) => [c.x, c.z, 1] as const),
    ].filter(([x, z]) => Math.hypot(x - this.cx * TCELL, z - this.cz * TCELL) < 70);
    const pos: number[] = [], s: number[] = [];
    const seen = new Set<string>();
    nodes.forEach(([x, z, kind], i) => {
      const near = nodes
        .map(([x2, z2], j) => [j, Math.hypot(x2 - x, z2 - z)] as const)
        .filter(([j, d]) => j !== i && d < 30)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2);
      for (const [j, d] of near) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [x2, z2] = nodes[j];
        const steps = Math.max(8, Math.round(d / 0.5));
        const nx = -(z2 - z) / d, nz = (x2 - x) / d;
        const seed = cellHash(i, j, 95);
        let px = 0, py = 0, pz = 0;
        for (let k = 0; k <= steps; k++) {
          const u = k / steps;
          const wig = Math.sin(u * Math.PI * 3 + seed * 20) * 1.2 * Math.sin(u * Math.PI);
          const qx = x + (x2 - x) * u + nx * wig, qz = z + (z2 - z) * u + nz * wig;
          const qy = heightAt(qx, qz) - 0.35 - Math.sin(u * Math.PI) * 1.2;
          if (k > 0) {
            pos.push(px, py, pz, qx, qy, qz);
            s.push((k - 1) / steps * d * 0.06, (kind + seed) % 1, u * d * 0.06, (kind + seed) % 1);
          }
          px = qx;
          py = qy;
          pz = qz;
        }
      }
    });
    const g = this.renew(this.web);
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aS", new THREE.Float32BufferAttribute(s, 2));
  }

  /** A fresh geometry for a mesh whose contents are rebuilt (GPU buffers are sized per geometry). */
  private renew(o: THREE.Mesh | THREE.LineSegments): THREE.BufferGeometry {
    o.geometry.dispose();
    return (o.geometry = new THREE.BufferGeometry());
  }

  /* ---------------------------------------------------------------- per frame */
  update(f: LifeFrame, pxPerUnit: number): void {
    U.uT.value = f.reduced ? f.t * 0.35 : f.t;
    U.uPlayer.value.copy(f.player);
    U.uPx.value = pxPerUnit;
    const cx = Math.floor(f.player.x / TCELL), cz = Math.floor(f.player.z / TCELL);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx;
      this.cz = cz;
      this.restream(f.player.x, f.player.z);
    }
    // crystals wake as you pass, and settle again slowly
    const pc = this.prismC.array as Float32Array;
    const ba = this.beamA.array as Float32Array;
    let np = 0, nb = 0;
    for (const c of this.activeClusters) {
      const d = Math.hypot(c.x - f.player.x, c.z - f.player.z);
      if (d < (c.great ? 7 : 5) && f.t - c.woke > 20) {
        c.woke = f.t;
        const col = new THREE.Color().setHSL((c.prisms[0].hue * 0.4 + 0.55) % 1, 0.6, 0.75);
        this.sparks.emit(this.v.set(c.x, c.y + (c.great ? 2.5 : 1.2), c.z), c.great ? 26 : 12, col, c.great ? 1.2 : 0.7);
      }
      const want = f.t - c.woke < 14 ? 1 : 0;
      c.glow += (want - c.glow) * Math.min(1, f.dt * (want ? 1.5 : 0.2));
      for (let k = 0; k < c.prisms.length && np < MAX_PRISMS; k++) pc[np++ * 3 + 1] = c.glow;
      if (c.great && nb < MAX_BEAMS) ba[nb++] = 0.6 + c.glow * 1.4;
    }
    this.prismC.needsUpdate = true;
    this.beamA.needsUpdate = true;
  }

  /** Trees and crystals near a point, for the spirits to gather around. */
  /** The rock or crystal the wanderer has stopped in front of (near, and ahead), if any. */
  stoneBefore(p: THREE.Vector3, heading: number): { p: THREE.Vector3; r: number; crystal: boolean } | null {
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    let best: (typeof this.stones)[number] | null = null, bd = Infinity;
    for (const s of this.stones) {
      const dx = s.p.x - p.x, dz = s.p.z - p.z;
      const d = Math.hypot(dx, dz) - s.r;
      if (d > 6 || (dx * fx + dz * fz) / Math.max(0.01, Math.hypot(dx, dz)) < 0.1) continue;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Each light this casts on the ground: (x, z, reach in metres, colour, strength). */
  lights(add: (x: number, z: number, r: number, c: THREE.Color, k: number) => void): void {
    for (const c of this.activeClusters) {
      this.lightCol.setHSL((c.prisms[0].hue * 0.4 + 0.55) % 1, 0.55, 0.62);
      add(c.x, c.z, c.great ? 9 : 5, this.lightCol, (c.great ? 0.35 : 0.2) + c.glow * 0.6);
    }
  }
  private lightCol = new THREE.Color();

  anchors(): THREE.Vector3[] {
    return [
      ...this.activeTrees.map((t) => new V(t.x, t.y + SHAPES[t.kind].height * t.scale * 0.8, t.z)),
      ...this.activeClusters.map((c) => new V(c.x, c.y + 2, c.z)),
    ];
  }

  setQuality(tier: number): void {
    // the seen-through-the-ground effects go first when frames run slow
    this.rootLines.visible = tier <= 2;
    this.web.visible = tier <= 2;
  }
}

/* ================================================================ spirits */
const TRAIL = 22;
const VEIL = 64; // points along each veil, smoothed between the remembered ones
/** A point on the smooth curve through b and c (a and d steer it), t from 0 at b to 1 at c. */
function catmull(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const t2 = t * t, t3 = t2 * t;
  const k0 = -0.5 * t3 + t2 - 0.5 * t, k1 = 1.5 * t3 - 2.5 * t2 + 1, k2 = -1.5 * t3 + 2 * t2 + 0.5 * t, k3 = 0.5 * t3 - 0.5 * t2;
  return out.set(a.x * k0 + b.x * k1 + c.x * k2 + d.x * k3, a.y * k0 + b.y * k1 + c.y * k2 + d.y * k3, a.z * k0 + b.z * k1 + c.z * k2 + d.z * k3);
}
interface Spirit {
  p: THREE.Vector3;
  v: THREE.Vector3;
  home: THREE.Vector3;
  curious: number;
  size: number;
  hue: number;
  phase: number;
  hist: THREE.Vector3[];
  lastHist: number;
}

const SPIRIT_BLUE = new THREE.Color(0.8, 0.9, 1.0), SPIRIT_GOLD = new THREE.Color(1.0, 0.86, 0.66), SPIRIT_ROSE = new THREE.Color(1.0, 0.8, 1.0);
/** Wisps of light with flowing veils. They drift among trees and crystals, and now and then
    one comes to keep the wanderer company. */
export class Spirits {
  group = new THREE.Group();
  private list: Spirit[] = [];
  private veil: THREE.Mesh;
  private heads: SpriteCloud;
  private anchorsAt = -100;
  private anchors: THREE.Vector3[] = [];
  private tmp = new V();
  private side = new V();
  private tan = new V();

  constructor(
    private creation: Creation,
    count = 12,
  ) {
    for (let i = 0; i < count; i++) {
      const great = i < 2;
      this.list.push({
        p: new V(), v: new V(), home: new V(),
        curious: 0, size: great ? 1.6 : 0.7 + Math.random() * 0.5, hue: Math.random(), phase: Math.random() * 100,
        hist: Array.from({ length: TRAIL }, () => new V()), lastHist: 0,
      });
    }
    // veils: one unbroken ribbon of soft light along each spirit's recent path, rippling as it
    // flows. The path is smoothed between its remembered points, so a fast spirit never leaves
    // a string of beads behind it.
    const n = count * VEIL;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aTan", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const trail = new Float32Array(n * 2 * 4); // along 0..1, size, hue, side
    const idx: number[] = [];
    for (let s = 0; s < count; s++)
      for (let k = 0; k < VEIL; k++) {
        for (const sd of [0, 1]) trail.set([k / (VEIL - 1), this.list[s].size, this.list[s].hue, sd * 2 - 1], ((s * VEIL + k) * 2 + sd) * 4);
        if (k < VEIL - 1) {
          const v = (s * VEIL + k) * 2;
          idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        }
      }
    g.setAttribute("aTrail", new THREE.BufferAttribute(trail, 4));
    g.setIndex(idx);
    {
      const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
      const aTrail = attribute("aTrail", "vec4"), aTan = attribute("aTan", "vec3"), P = positionLocal;
      const sAl = aTrail.x;
      const d = distance(P, cameraPosition);
      // soft at the spirit, tapering away; never thinner than a couple of pixels
      const w = aTrail.y.mul(mix(0.12, 0.02, pow(sAl, 0.8))), wMin = d.mul(2.5).div(U.uPx);
      const side = normalize(cross(aTan, cameraPosition.sub(P)));
      mat.positionNode = P.add(side.mul(aTrail.w).mul(max(w, wMin)));
      const c0 = mix(mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.8, 0.55), step(0.4, aTrail.z)), vec3(0.95, 0.7, 1.0), step(0.75, aTrail.z));
      const vC = varying(mix(c0, vec3(1), float(1).sub(sAl).mul(0.3)));
      const vA = varying(pow(float(1).sub(sAl), 1.5).mul(0.35).mul(float(1).sub(fogF(d))).mul(w.div(max(w, wMin))).mul(outOfTheWay(P)));
      const vX = varying(aTrail.w);
      mat.colorNode = vec4(vC.mul(exp(vX.mul(vX).mul(-3.5))).mul(vA), 1);
      this.veil = new THREE.Mesh(g, mat);
    }
    this.veil.frustumCulled = false;
    {
      const mat = softPoints();
      this.heads = spriteCloud(count, { position: 3, aSize: 1, aHue: 1 }, mat);
      (this.heads.attrs.aSize.array as Float32Array).set(this.list.map((s) => s.size));
      (this.heads.attrs.aHue.array as Float32Array).set(this.list.map((s) => s.hue));
      const { position, aSize, aHue } = this.heads.nodes;
      const vD = viewDepth(position);
      const vC = mix(mix(vec3(0.8, 0.9, 1.0), vec3(1.0, 0.86, 0.66), step(0.4, aHue)), vec3(1.0, 0.8, 1.0), step(0.75, aHue)).mul(outOfTheWay(position));
      mat.sizeNode = clamp(aSize.mul(0.9).mul(U.uPx).div(max(vD, 0.5)), 2, 120).div(T.screenDPR);
      const r = length(pointUV.sub(0.5)).mul(2);
      const a = exp(r.mul(r).mul(-6)).mul(1.2).add(smoothstep(0.25, 0, r).mul(1.6));
      mat.colorNode = vec4(vC.mul(a).mul(float(1).sub(fogF(vD))), 1);
    }
    this.group.add(this.veil, this.heads.sprite);
  }

  /** Each light this casts on the ground: (x, z, reach in metres, colour, strength). */
  lights(add: (x: number, z: number, r: number, c: THREE.Color, k: number) => void): void {
    for (const s of this.list) {
      const ground = Math.max(heightAt(s.p.x, s.p.z), WATER_Y);
      const k = 0.4 / (1 + Math.max(0, s.p.y - ground - 1) * 0.4); // high in the air, it lights less
      add(s.p.x, s.p.z, 3 + s.size * 2, s.hue > 0.75 ? SPIRIT_ROSE : s.hue > 0.4 ? SPIRIT_GOLD : SPIRIT_BLUE, k);
    }
  }

  /** Stillness calls the spirits: those nearby come to circle the wanderer. */
  gather(p: THREE.Vector3): void {
    for (const s of this.list) if (s.p.distanceTo(p) < 70) s.curious = Math.max(s.curious, 6);
  }

  private placeNear(s: Spirit, player: THREE.Vector3): void {
    const a = this.anchors.length ? this.anchors[Math.floor(Math.random() * this.anchors.length)] : null;
    if (a && a.distanceTo(player) < 60) s.home.copy(a);
    else s.home.set(player.x + (Math.random() - 0.5) * 50, 0, player.z + (Math.random() - 0.5) * 50).setY(heightAt(s.home.x, s.home.z) + 3);
    s.p.copy(s.home).add(this.tmp.set(0, 2, 0));
    for (const h of s.hist) h.copy(s.p);
  }

  update(f: LifeFrame, camera: THREE.Camera): void {
    if (f.t - this.anchorsAt > 3 || this.anchorsAt < 0) {
      this.anchorsAt = f.t;
      this.anchors = this.creation.anchors().filter((a) => Math.hypot(a.x - f.player.x, a.z - f.player.z) < 55);
    }
    const hp = this.heads.attrs.position;
    const vp = this.veil.geometry.attributes.position as THREE.BufferAttribute;
    const tp = this.veil.geometry.attributes.aTan as THREE.BufferAttribute;
    const ha = hp.array as Float32Array, va = vp.array as Float32Array, ta = tp.array as Float32Array;
    const cam = camera.position, t0 = f.t;
    this.list.forEach((s, i) => {
      const far = s.p.distanceTo(f.player);
      if (s.home.lengthSq() === 0 || far > 75) this.placeNear(s, f.player);
      // near the wanderer, one may decide to come along for a while
      if (far < 10 && s.curious <= 0 && Math.random() < f.dt * 0.08) s.curious = 14 + Math.random() * 16;
      s.curious -= f.dt;
      const t = f.t * (0.35 + (i % 5) * 0.06) + s.phase;
      if (s.curious > 0) {
        // keeping company: a slow ring above and around the head, clear of the view
        const a = f.t * 0.35 + i * 2.1;
        this.tmp.set(f.player.x + Math.cos(a) * 3.4, f.player.y + 2.8 + Math.sin(f.t * 0.6 + i) * 0.4, f.player.z + Math.sin(a) * 3.4);
      } else {
        // slow loops around a crown or a crystal
        const r = 2.5 + (i % 3) * 1.5 + s.size;
        this.tmp.set(s.home.x + Math.cos(t) * r, s.home.y + Math.sin(t * 1.7) * 1.2, s.home.z + Math.sin(t * 0.8) * r);
        if (Math.random() < f.dt * 0.01) this.placeNear(s, f.player);
      }
      s.v.addScaledVector(this.tmp.sub(s.p), f.dt * 0.9).multiplyScalar(1 - f.dt * 0.9);
      // they drift, never streak: called from far away, they take their time coming
      const vmax = s.curious > 0 ? 3 : 2.2, vl = s.v.length();
      if (vl > vmax) s.v.multiplyScalar(vmax / vl);
      s.p.addScaledVector(s.v, f.dt);
      s.p.y = Math.max(s.p.y, Math.max(heightAt(s.p.x, s.p.z), WATER_Y) + 0.6);
      // the veil remembers where it has been
      if (f.t - s.lastHist > 0.1) {
        s.lastHist = f.t;
        const last = s.hist.pop()!;
        s.hist.unshift(last.copy(s.p));
      }
      s.hist[0].copy(s.p);
      ha.set([s.p.x, s.p.y, s.p.z], i * 3);
      // a smooth curve through the remembered points; the veil ripples sideways as it trails,
      // like cloth in water. The ribbon's direction is taken from the curve as drawn, so it
      // never folds over itself (a folded ribbon showed as a ladder of bright rungs)
      const h = s.hist;
      for (let j = 0; j < VEIL; j++) {
        const u = (j / (VEIL - 1)) * (TRAIL - 1), k = Math.min(TRAIL - 2, Math.floor(u));
        catmull(h[Math.max(0, k - 1)], h[k], h[k + 1], h[Math.min(TRAIL - 1, k + 2)], u - k, this.tmp);
        this.side.subVectors(h[k + 1], h[k]);
        if (this.side.lengthSq() < 1e-6) this.side.set(0, -1, 0);
        const cross = this.tan.subVectors(cam, this.tmp).cross(this.side).normalize();
        const wave = Math.sin(t0 * 1.6 - u * 0.4 + i) * s.size * 0.08 * (u / TRAIL);
        const v = (i * VEIL + j) * 6;
        va[v] = va[v + 3] = this.tmp.x + cross.x * wave;
        va[v + 1] = va[v + 4] = this.tmp.y + cross.y * wave - u * 0.015;
        va[v + 2] = va[v + 5] = this.tmp.z + cross.z * wave;
      }
      for (let j = 0; j < VEIL; j++) {
        const a = (i * VEIL + Math.max(0, j - 1)) * 6, b = (i * VEIL + Math.min(VEIL - 1, j + 1)) * 6, v = (i * VEIL + j) * 6;
        let tx = va[b] - va[a], ty = va[b + 1] - va[a + 1], tz = va[b + 2] - va[a + 2];
        if (tx * tx + ty * ty + tz * tz < 1e-8) (tx = 0), (ty = -1), (tz = 0);
        ta[v] = ta[v + 3] = tx;
        ta[v + 1] = ta[v + 4] = ty;
        ta[v + 2] = ta[v + 5] = tz;
      }
    });
    hp.needsUpdate = true;
    vp.needsUpdate = true;
    tp.needsUpdate = true;
  }
}
