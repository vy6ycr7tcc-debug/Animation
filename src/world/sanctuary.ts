/* Building, by hand, anywhere (the owner: "a building mode is activated and a whole screen with
   more features is launched… anywhere in the map… activated by holding tap to the ground and
   avatar starts meditating"). After Ōkami's celestial brush (the ground becomes a page, a small
   legible vocabulary, wobbly strokes forgiven) and Townscaper (you suggest; the world completes).
   A mirror, not a reward: nothing is counted, nothing unlocks.

   - Hold on open ground: the wanderer goes there and kneels, a palm on the earth (world/touch.ts),
     and the build screen opens round that spot (main.ts): the view rises over it and circles it,
     the controls of walking rest, the earth shimmers faintly as a page (an irregular, breathing
     weave, never a grid), and the screen holds what building needs: the two inks, undo, Done, a
     legend of the shapes, and, once a form is chosen, its tools.
   - One finger draws on the earth (a faint trail of light); let go and it is read (strokes.ts):
       a line → a wall along it;      a closed shape with corners → a wall round it;
       a circle → a ring wall (wide) or a pillar (small);   a spiral → a spire;
       a U → an arch standing on its two ends;   a zigzag → a flight of steps rising along it;
       a touch → an orb of light.
     What isn't understood sinks back with a quiet word of what would take form.
   - Two fingers move the view: turn them (or slide them sideways) to go round, slide up or down
     to look from higher or lower, pinch to come closer. A mouse: the right button (or Shift)
     drags the view round, the wheel comes closer.
   - A tap on a form chooses it (a soft glow, a ring at its base) and its tools show: turn, size,
     height, raise, its ink, a dome or a floor (a ring; a floor in a closed wall), copy, let go.
     A drag carries it over the earth. ↶ takes back the last change. Done stands the wanderer up.
   - Ink: stone-essence gathers when you sit with a rock through its meditation; gold-essence is
     forged by each note you write in your heart. A form takes essence for its size; with not
     enough the stroke fades unforged. A gold form keeps the heart note newest when it was drawn:
     tapped outside building, that note opens again.
   - Forms grow on the breath (the square breathing's own phases), out of the earth.
   The forms are kept on this device only (localStorage), each by its place in the world, its kind,
   ink and drawn path; the geometry is grown again from them on load. */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T, fogUniforms, softPoints, spriteCloud, viewDepth, softDot, pointR, glowShader, type SpriteCloud, type N } from "../gpu/tsl";
import { landStone, stoneBlock, contactShade } from "./stoneworks";
import { solid } from "./solidity";
import { SANCTUARY, heightAt } from "./terrain";
import { heartNotes, type HeartNote } from "../ui/heart";
import { readStroke, type V2 } from "./strokes";
import { Joints, type JointForm } from "./joints";

const { float, vec3, vec4, abs, max, min, smoothstep, sin, pow, dot, normalize, clamp, fract, length, mix, fwidth } = T;

/** The sanctuary's terrace (the place on the map, where the first forms were drawn). */
const PAGE_R = 9;
const TOP = 0.3; // its floor above the levelled ground
/** The page round where building opens: forms are drawn and carried within it. */
const PLOT_R = 14;
const KEY = "inward-journey:sanctuary";
const SEED_KEY = "inward-journey:sanctuary-seed";
const TOLD_KEY = "inward-journey:build-told";
/** the first measure of stone: a few walls and a ring */
const SEED_STONE = 3;
/** Essence each form takes (one rock meditation, or one heart note, is 1). */
const COST = { wallPerM: 0.08, pillar: 0.25, orb: 0.05, spireBase: 0.25, spirePerM: 0.06, domePerM2: 0.012, floorPerM2: 0.008 };
/** Each kind's height as first drawn, and how far it may be changed. */
const HEIGHT: Record<FormKind, [number, number, number]> = {
  wall: [1.3, 0.5, 4.5],
  ring: [1.1, 0.5, 4],
  pillar: [2.6, 1, 7],
  spire: [5, 2, 14],
  arch: [2.2, 1.6, 6],
  stairs: [1.6, 0.4, 5],
  orb: [0, 0, 0],
};

export type FormKind = "wall" | "ring" | "pillar" | "spire" | "orb" | "arch" | "stairs";
export type Ink = "stone" | "gold";
export interface SavedForm {
  kind: FormKind;
  ink: Ink;
  /** the drawn path, resampled, relative to the form's origin: x0,z0,x1,z1… (walls) */
  path?: number[];
  closed?: boolean;
  /** a ring's, a pillar's or a spire's radius (metres) */
  r?: number;
  /** its height (a spire's, an arch's opening, the steps' rise; walls, rings, pillars once changed) */
  h?: number;
  /** an arch's span, the steps' width */
  w?: number;
  /** the steps' length */
  l?: number;
  /** its size, as drawn = 1 */
  sc?: number;
  /** a ring's dome or floor; a closed wall's floor */
  top?: "dome" | "floor";
  /** where it stands in the world */
  x: number;
  z: number;
  /** lifted above the earth */
  y: number;
  rot: number;
  cost: number;
  /** a gold form's heart note (its createdAt) */
  note?: number;
}
interface Saved {
  v: 3;
  stone: number;
  goldSpent: number;
  ink: Ink;
  forms: SavedForm[];
}
interface Form {
  s: SavedForm;
  group: THREE.Group;
  body: THREE.Group;
  meshes: THREE.Mesh[];
  geos: THREE.BufferGeometry[];
  /** the earth under its origin */
  base: number;
  /** seconds since it was drawn (growing) */
  age: number;
  grow: number;
  /** dissolving: seconds since */
  out?: number;
  /** where a drag is taking it */
  to: THREE.Vector2;
  lift: number;
  /** its centre line (walls, rings) or centre, in its own frame; half its thickness; its height */
  line: V2[];
  half: number;
  H: number;
  /** its soft footprint on the earth: it sits into the stone, not on it */
  shade: THREE.Mesh;
  shadeK: { value: number } | null;
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outCubic = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const round = (x: number) => Math.round(x * 100) / 100;
const clampN = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** A note that forges gold: written by the person here (not the oracle's answers, not memories
    brought in from elsewhere). */
function forges(n: HeartNote): boolean {
  return !n.scene.startsWith("The oracle") && n.scene !== "Brought from elsewhere";
}

/** The earth a form stands on: the terrace's floor on it, the land elsewhere. */
export function groundAt(x: number, z: number): number {
  const S = SANCTUARY, d = Math.hypot(x - S.x, z - S.z);
  if (d < PAGE_R + 0.05) return S.y + TOP;
  if (d < PAGE_R + 0.95) return Math.max(heightAt(x, z), S.y + TOP - 0.25);
  return heightAt(x, z);
}
/** A form drawn on the terrace before forms could stand anywhere (its frame): into the world. */
function fromTerrace(s: SavedForm, v2 = false): SavedForm {
  const S = SANCTUARY, c = Math.cos(S.face), sn = Math.sin(S.face);
  // (an orb's resting height was apart from its lift then)
  return { ...s, x: S.x + s.x * c + s.z * sn, z: S.z - s.x * sn + s.z * c, rot: s.rot + S.face, y: v2 && s.kind === "orb" ? s.y + 1.6 : s.y };
}
function pathOf(s: SavedForm): V2[] {
  const p: V2[] = [];
  const sc = s.sc ?? 1;
  for (let i = 0; i + 1 < (s.path?.length ?? 0); i += 2) p.push([s.path![i] * sc, s.path![i + 1] * sc]);
  return p.length > 1 ? p : [[0, 0], [0.5, 0]];
}
function lengthOf(p: V2[], closed = false): number {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  if (closed && p.length > 2) L += Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]);
  return L;
}
function areaOf(p: V2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
}
const heightOf = (s: SavedForm) => s.h ?? HEIGHT[s.kind][0];
/** What a form takes, for its size. */
export function costOf(s: SavedForm): number {
  const sc = s.sc ?? 1, h = heightOf(s), k = h / HEIGHT[s.kind][0];
  switch (s.kind) {
    case "wall": {
      const p = pathOf(s);
      return lengthOf(p, s.closed) * COST.wallPerM * k + (s.closed && s.top === "floor" ? areaOf(p) * COST.floorPerM2 : 0);
    }
    case "ring": {
      const R = (s.r ?? 1.5) * sc;
      return Math.PI * 2 * R * COST.wallPerM * k + (s.top === "dome" ? 2 * Math.PI * R * R * COST.domePerM2 : s.top === "floor" ? Math.PI * R * R * COST.floorPerM2 : 0);
    }
    case "pillar":
      return COST.pillar * sc * k;
    case "spire":
      return (COST.spireBase + h * COST.spirePerM) * sc;
    case "arch":
      return (0.15 + (s.w ?? 2) * sc * 0.1) * k;
    case "stairs":
      return 0.06 * (s.l ?? 3) * (s.w ?? 1.6) * sc * sc + 0.05 * h;
    default:
      return COST.orb * sc;
  }
}

/* ---------------- growing forms ---------------- */
/** The drawn path smoothed and spaced every ~0.22 m. */
function smoothPath(path: V2[], closed: boolean): V2[] {
  const curve = new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, "centripetal");
  const n = Math.max(4, Math.ceil(curve.getLength() / 0.22));
  const pts = curve.getSpacedPoints(n).map((v) => [v.x, v.z] as V2);
  return closed ? pts.slice(0, n) : pts;
}
type Lay = (x: number, z: number) => number;
/** A wall along a path: battered, its top rounded, sunk into the earth (it sits in it, not on it),
    following the land under each point (`lay`), its open ends rounded off. */
function wallGeometry(path: V2[], closed: boolean, H: number, w: number, lay: Lay): THREE.BufferGeometry {
  const pts = smoothPath(path, closed);
  const prof: V2[] = [[-w, -0.9], [-w, 0], [-w * 0.84, H - 0.16], [-w * 0.58, H - 0.04], [0, H], [w * 0.58, H - 0.04], [w * 0.84, H - 0.16], [w, 0], [w, -0.9]];
  const pos: number[] = [];
  const idx: number[] = [];
  const n = pts.length, m = prof.length;
  let total = 0;
  const along: number[] = [0];
  for (let i = 1; i < n; i++) along.push((total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])));
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const nx = -tz, nz = tx;
    const dy = lay(pts[i][0], pts[i][1]);
    // rounded ends on an open wall
    let k = 1;
    if (!closed) {
      const e = Math.min(along[i], total - along[i]);
      if (e < 0.45) k = Math.sqrt(Math.max(0, 1 - Math.pow(1 - e / 0.45, 2)));
    }
    for (const [px, py] of prof) {
      const hy = py > 0 ? py * (0.8 + 0.2 * k) : py;
      const kk = Math.max(k, 0.02);
      pos.push(pts[i][0] + nx * px * kk, hy + dy, pts[i][1] + nz * px * kk);
    }
  }
  const rows = closed ? n : n - 1;
  for (let i = 0; i < rows; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j, b = i2 * m + j, c = i2 * m + j + 1, d = i * m + j + 1;
      idx.push(a, d, b, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** A turned form (a pillar, a spire): rings of `seg` sides through a profile of [radius, height],
    `flute` ridges winding up by `twist`. */
function turned(profile: V2[], seg: number, flute = 0, twist = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const [r, y] of profile)
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const rr = r * (1 + flute * Math.cos(a * 7 + y * twist));
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
    }
  for (let j = 0; j < profile.length - 1; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function pillarGeometry(r: number, H: number): THREE.BufferGeometry {
  return turned([[r * 1.45, -0.9], [r * 1.45, 0.12], [r * 1.25, 0.22], [r, 0.3], [r * 0.97, H * 0.5], [r * 0.88, H - 0.32], [r * 1.05, H - 0.22], [r * 1.35, H - 0.08], [r * 1.35, H], [0.001, H]], 18, 0.025, 0);
}
function spireGeometry(r: number, H: number): THREE.BufferGeometry {
  const prof: V2[] = [[r * 1.18, -0.9], [r * 1.18, 0.1], [r, 0.22]];
  for (let k = 1; k <= 14; k++) {
    const t = k / 14;
    prof.push([r * Math.pow(1 - t, 0.9) * (1 + 0.06 * Math.sin(t * Math.PI)) + 0.012, 0.22 + (H - 0.22) * t]);
  }
  prof.push([0.001, H + 0.05]);
  // seven fluted ridges winding up it, the spiral of the hand that drew it
  return turned(prof, 28, 0.07, 1.4);
}
/** An arch on two piers: its opening `span` wide and `clear` high (a round head), a moulded
    cornice over it, its feet sunk deep enough for sloping ground. Across local x; depth along z. */
function archGeometry(span: number, clear: number): THREE.BufferGeometry {
  const r = span / 2, pier = Math.max(0.45, span * 0.16), depth = 0.66;
  const spring = Math.max(0.3, clear - r), top = clear + Math.max(0.42, span * 0.12), W = r + pier;
  const shape = new THREE.Shape();
  shape.moveTo(-W, -1.2);
  shape.lineTo(W, -1.2);
  shape.lineTo(W, top);
  shape.lineTo(-W, top);
  shape.lineTo(-W, -1.2);
  const hole = new THREE.Path();
  hole.moveTo(-r, -0.25);
  hole.lineTo(r, -0.25);
  hole.lineTo(r, spring);
  hole.absarc(0, spring, r, 0, Math.PI, false);
  hole.lineTo(-r, -0.25);
  shape.holes.push(hole);
  const body = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 28 });
  body.translate(0, 0, -depth / 2);
  const cornice = new THREE.BoxGeometry(W * 2 + 0.24, 0.16, depth + 0.2).toNonIndexed();
  cornice.translate(0, top + 0.08, 0);
  const imposts = [-1, 1].map((sd) => {
    const b = new THREE.BoxGeometry(pier + 0.16, 0.12, depth + 0.12).toNonIndexed();
    b.translate(sd * (r + pier / 2), spring, 0);
    return b;
  });
  for (const g of [body, cornice, ...imposts]) g.deleteAttribute("uv");
  const g = mergeGeometries([body, cornice, ...imposts])!;
  g.computeVertexNormals();
  return g;
}
/** A flight of steps `l` long along local z (rising toward +z), `w` wide, `h` high, each step a
    cut stone, their feet deep in the earth. */
function stairsGeometry(l: number, w: number, h: number): THREE.BufferGeometry {
  const n = Math.max(2, Math.round(h / 0.19)), run = l / n, rise = h / n;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const H = (i + 1) * rise + 1.0;
    const b = stoneBlock(w, H, run + 0.04, i + 3);
    b.translate(0, (i + 1) * rise - H / 2, -l / 2 + run * (i + 0.5));
    for (const a of Object.keys(b.attributes)) if (a !== "position" && a !== "normal") b.deleteAttribute(a);
    parts.push(b.index ? b.toNonIndexed() : b);
  }
  return mergeGeometries(parts)!;
}
/** A dome over a ring: a low hemisphere resting on its wall's top. */
function domeGeometry(R: number, at: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(R, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.78, 1);
  g.translate(0, at - 0.05, 0);
  return g;
}
/** A paved floor filling a closed outline (its own frame), its top just above the earth. */
function floorGeometry(outline: V2[]): THREE.BufferGeometry {
  const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.62, 0);
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  return g;
}

/** The gold of a memory: warm bright metal in the world's own light, its sheen drawn by hand (the
    game mirrors nothing), hammered, glowing a little from within so it reads as gold even by
    night (it was mistaken for stone), and now and then a slow line of light rising through it. */
function goldMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0.85, roughness: 0.26 });
  const ham = T.mx_noise_float(T.positionWorld.mul(9)).mul(0.5).add(0.5);
  m.colorNode = vec3(1, 0.68, 0.22).mul(float(0.86).add(ham.mul(0.24)));
  m.roughnessNode = float(0.2).add(ham.mul(0.14));
  const v = normalize(T.cameraPosition.sub(T.positionWorld));
  const r = T.reflect(v.negate(), T.normalWorld);
  const sky = mix(vec3(0.3, 0.14, 0.03), vec3(1, 0.74, 0.34), smoothstep(-0.35, 0.7, r.y));
  const hi = pow(max(dot(r, fogUniforms.glowDir), 0), 18).mul(1.1);
  const ndv = abs(dot(T.normalView, normalize(T.positionView.negate())));
  const fres = float(0.32).add(pow(float(1).sub(ndv), 3).mul(0.7));
  const rise = pow(fract(T.positionWorld.y.mul(0.22).sub(T.time.mul(0.045)).add(T.positionWorld.x.mul(0.013))), 30).mul(0.4);
  m.emissiveNode = sky.mul(fres.mul(0.62)).add(vec3(1, 0.85, 0.6).mul(hi)).add(vec3(1, 0.6, 0.2).mul(rise.add(0.09)));
  return solid(m);
}

/* ---------------- light on the earth (the trail, the base ring) ---------------- */
/** A ribbon of light laid on the earth along points; its own buffers, rewritten only when set. */
class Ribbon {
  readonly mesh: THREE.Mesh;
  readonly k: { value: number };
  private pos: Float32Array;
  private uv: Float32Array;
  constructor(private max: number, private w: number, color: THREE.Color, tip = false, dark = false) {
    this.pos = new Float32Array(max * 2 * 3);
    this.uv = new Float32Array(max * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i < max - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    let mat: THREE.Material;
    if (dark) {
      // a feathered shade (the form settles into the earth): darkness, never light
      const uK = T.uniform(0);
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const across = float(1).sub(abs(T.uv().y.mul(2).sub(1)));
      m.colorNode = vec4(0, 0, 0.012, 1);
      m.opacityNode = pow(across, 1.6).mul(uK).mul(0.5);
      this.k = uK as unknown as { value: number };
      mat = m;
    } else {
      const gm = glowShader({ uK: 0 }, (u, uv) => {
        const across = float(1).sub(abs(uv.y.mul(2).sub(1)));
        const lead = tip ? float(0.45).add(smoothstep(0.82, 1, uv.x).mul(0.9)) : float(1);
        return vec3(color.r, color.g, color.b).mul(across.mul(across).mul(lead).mul(u.uK));
      }, { side: THREE.DoubleSide });
      this.k = gm.uniforms.uK;
      mat = gm;
    }
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }
  /** Lay it along `pts` (x, z), at `y`, or at the height `yAt` gives under each point. */
  set(pts: V2[], y: number, closed = false, yAt?: Lay): void {
    const n = Math.min(this.max - 1, pts.length);
    if (n < 2) {
      this.mesh.geometry.setDrawRange(0, 0);
      return;
    }
    let L = 0;
    for (let i = 1; i < n; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (closed) L += Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]);
    const count = closed ? n + 1 : n;
    let s = 0;
    for (let i = 0; i < count; i++) {
      const c = pts[i % n];
      if (i > 0) s += Math.hypot(c[0] - pts[(i - 1) % n][0], c[1] - pts[(i - 1) % n][1]);
      const p = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
      const q = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
      let tx = q[0] - p[0], tz = q[1] - p[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const o = i * 6;
      const ax = c[0] - tz * this.w, az = c[1] + tx * this.w, bx = c[0] + tz * this.w, bz = c[1] - tx * this.w;
      this.pos[o] = ax;
      this.pos[o + 1] = yAt ? yAt(ax, az) : y;
      this.pos[o + 2] = az;
      this.pos[o + 3] = bx;
      this.pos[o + 4] = yAt ? yAt(bx, bz) : y;
      this.pos[o + 5] = bz;
      const u = L > 0 ? s / L : 0;
      this.uv[i * 4] = u;
      this.uv[i * 4 + 1] = 0;
      this.uv[i * 4 + 2] = u;
      this.uv[i * 4 + 3] = 1;
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    g.setDrawRange(0, (count - 1) * 6);
  }
}

export interface SanctuaryHooks {
  sparks(at: THREE.Vector3, n: number, c: THREE.Color, spread: number): void;
  bowl(f: number, gain: number): void;
  bell(f: number, gain: number, dur: number): void;
  /** the square breathing's phases (seconds): the forms' metronome */
  breath(): readonly { name: string; secs: number }[];
  /** a quiet line of guidance (a stroke not understood, or not enough essence) */
  say(text: string): void;
}

const STONE_LIGHT = new THREE.Color(0.78, 0.84, 1.0);
const GOLD_LIGHT = new THREE.Color(1, 0.74, 0.36);
type Halo = ReturnType<typeof glowShader<"uK" | "uT">>;
const ICON: Record<string, string> = {
  wall: `<path d="M4 17 C9 13 15 15 20 8"/>`,
  ring: `<circle cx="12" cy="12" r="7"/>`,
  pillar: `<circle cx="12" cy="12" r="3"/>`,
  spire: `<path d="M12 12 m0 0 a1.5 1.5 0 1 1 1.5 1.5 a3 3 0 1 1 -3 -3 a4.6 4.6 0 1 1 4.6 4.6 a6.2 6.2 0 1 1 -6.2 -6.2"/>`,
  arch: `<path d="M6 19 V11 a6 6 0 0 1 12 0 V19"/>`,
  stairs: `<path d="M4 18 L8 8 L12 17 L16 7 L20 16"/>`,
  orb: `<circle cx="12" cy="12" r="1.6" fill="currentColor"/>`,
};
const SHAPES: [string, string, string][] = [
  ["wall", "Line", "Wall"],
  ["ring", "Circle", "Ring"],
  ["pillar", "Small circle", "Pillar"],
  ["spire", "Spiral", "Spire"],
  ["arch", "U", "Arch"],
  ["stairs", "Zigzag", "Steps"],
  ["orb", "Tap", "Orb"],
];

export class Sanctuary {
  readonly group = new THREE.Group();
  /** the terrace (the sanctuary on the map), in its own frame (faces the temple) */
  readonly root = new THREE.Group();
  /** every form, wherever it stands, in the world's frame */
  private world = new THREE.Group();
  /** the build screen is open */
  building = false;
  /** 0..1: how hushed the world is (building: a little; the brush down: a little more) */
  hush = 0;
  ink: Ink = "stone";
  private stone = 0;
  private goldSpent = 0;
  private forms: Form[] = [];
  private persist: boolean;
  private notes: HeartNote[] = [];
  private mats: { stone: THREE.Material; gold: THREE.Material; floor: THREE.Material; aura: THREE.Material; orbCore: Record<Ink, THREE.Material>; orbHalo: Record<Ink, Halo> };
  /** the page: the earth round where building opened, conforming to the land */
  private page: THREE.Mesh & { material: Halo };
  private plot = new THREE.Vector3();
  private trail: Ribbon;
  private base: Ribbon;
  private baseK = 0;
  /** a seam of light round the foot of a form rising out of the earth (or sinking back) */
  private seam: Ribbon;
  private seamOf: Form | null = null;
  /** a still holds its forms part-grown */
  private held = false;
  private joints: Joints;
  private jointsDirty = false;
  private trailFade = 0;
  private selected: Form | null = null;
  private auras: THREE.Mesh[] = [];
  // the touch drawing, or carrying a form, or two fingers moving the view
  private draw: { id: number; ground: V2[]; sx: number; sy: number; screen: number; ink: Ink } | null = null;
  private shape: { id: number; form: Form; was: boolean; moved: boolean; sx: number; sy: number; off: V2; snap: boolean } | null = null;
  private fingers = new Map<number, { x: number; y: number }>();
  private view: { a: number; b: number; d0: number; ang0: number; my0: number; mx0: number; yaw0: number; pitch0: number; dist0: number } | null = null;
  private mouseView: { id: number; x: number; y: number } | null = null;
  // the view over the page: it circles round, looks from higher or lower, comes closer
  private orbit = { yaw: 0, pitch: 0.9, dist: 18, yawT: 0, pitchT: 0.9, distT: 18, k: 0, on: false, use: true };
  private eye = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private dummy = new THREE.Object3D();
  private qA = new THREE.Quaternion();
  private undo: string[] = [];
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private hits: THREE.Intersection[] = [];
  private ui: HTMLElement;
  private forming: Forming;
  private camera: THREE.Camera | null = null;

  constructor(private hooks: SanctuaryHooks, opts: { persist?: boolean } = {}) {
    this.persist = opts.persist !== false;
    const S = SANCTUARY;
    this.root.position.set(S.x, S.y + TOP, S.z);
    this.root.rotation.y = S.face;
    this.group.add(this.root, this.world);

    // the terrace: a round floor of flagstones and a low step round it, in the temple's stone
    const floorStone = landStone("sandstone_cracks", S.y, 2.4, [0.92, 0.88, 0.84], { flag: 1.2 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(PAGE_R, PAGE_R + 0.12, 0.7, 72, 1), floorStone);
    floor.position.y = -0.35;
    const step = new THREE.Mesh(new THREE.CylinderGeometry(PAGE_R + 0.9, PAGE_R + 1.05, 0.5, 72, 1), floorStone);
    step.position.y = -0.55;
    floor.receiveShadow = step.receiveShadow = true;
    const shade = contactShade({ r: PAGE_R + 1.05 }, 1.6, 0.45);
    shade.position.y = -TOP + 0.02;
    this.root.add(floor, step, shade);

    // the inks
    const stone = landStone("sandstone_cracks", 0, 1.6, [0.95, 0.9, 0.84], { course: 0.32, block: 0.66 });
    const paving = landStone("sandstone_cracks", 0, 2.4, [0.9, 0.86, 0.8], { flag: 0.9 });
    const aura = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    {
      const ndv = abs(dot(T.normalView, normalize(T.positionView.negate())));
      const breath = sin(T.time.mul(0.9)).mul(0.25).add(0.75);
      aura.colorNode = vec4(vec3(1, 0.82, 0.55).mul(pow(float(1).sub(ndv), 2.2).mul(0.55).mul(breath)), 1);
    }
    const core = (c: THREE.Color) => {
      const m = new THREE.MeshBasicNodeMaterial({ fog: false });
      const ndv = abs(dot(T.normalView, normalize(T.positionView.negate())));
      m.colorNode = vec4(vec3(c.r, c.g, c.b).mul(float(0.55).add(ndv.mul(0.6))), 1);
      return m;
    };
    const halo = (c: THREE.Color): Halo =>
      glowShader({ uK: 1, uT: 0 }, (u, uv) => {
        const f = float(1).sub(clamp(length(uv.sub(0.5)).mul(2), 0, 1));
        const breath = sin(u.uT.mul(0.39)).mul(0.12).add(0.88);
        return vec3(c.r, c.g, c.b).mul(f.mul(f).mul(f).mul(0.75).mul(u.uK).mul(breath));
      });
    this.mats = { stone, gold: goldMaterial(), floor: paving, aura, orbCore: { stone: core(STONE_LIGHT), gold: core(GOLD_LIGHT) }, orbHalo: { stone: halo(STONE_LIGHT), gold: halo(GOLD_LIGHT) } };

    // the page: an irregular weave (Townscaper's skewed quads, never graph paper) breathing on
    // the earth, faint; laid over the land round where building opened
    const pm = glowShader({ uK: 0, uT: 0 }, (u, uv) => {
      const q0 = uv.sub(0.5).mul(PLOT_R * 2);
      const q = q0.div(1.35);
      const w = T.vec2(sin(q.y.mul(0.63).add(1.3)).add(sin(q.x.mul(0.31).add(q.y.mul(0.17)))), sin(q.x.mul(0.57).add(0.4)).add(sin(q.y.mul(0.29).sub(q.x.mul(0.21))))).mul(0.22);
      const g = q.add(w);
      const f = fract(g);
      const d = min(min(f.x, float(1).sub(f.x)), min(f.y, float(1).sub(f.y)));
      const aa = fwidth(g.x).add(fwidth(g.y)).mul(0.55).add(0.004);
      const line = smoothstep(aa.mul(1.1), float(0), d).mul(smoothstep(0.3, 0.05, aa));
      const r = length(q0).div(PLOT_R);
      const edge = smoothstep(1.0, 0.82, r);
      // the page's edge: a fine ring, so where you can draw is seen
      const rim = smoothstep(0.035, 0, abs(r.sub(0.985))).mul(0.5);
      const breath = sin(u.uT.mul(0.39).sub(r.mul(2.2))).mul(0.5).add(0.5);
      return vec3(1, 0.8, 0.5).mul(line.mul(edge).mul(float(0.05).add(breath.mul(0.06))).add(rim.mul(0.16)).mul(u.uK));
    });
    this.page = new THREE.Mesh(new THREE.BufferGeometry(), pm) as typeof this.page;
    this.page.renderOrder = 3;
    this.page.visible = false;
    this.page.frustumCulled = false;
    this.trail = new Ribbon(512, 0.05, new THREE.Color(1, 0.86, 0.6), true);
    this.trail.mesh.visible = false;
    this.base = new Ribbon(130, 0.07, new THREE.Color(1, 0.82, 0.5));
    this.base.mesh.visible = false;
    this.seam = new Ribbon(130, 0.05, new THREE.Color(1, 0.84, 0.56));
    this.seam.mesh.visible = false;
    this.group.add(this.page, this.trail.mesh, this.base.mesh, this.seam.mesh);

    this.joints = new Joints(stone, this.mats.gold, groundAt);
    this.group.add(this.joints.group);
    this.forming = new Forming(landStone("sandstone_cracks", S.y, 1.6, [0.94, 0.89, 0.83]), hooks);
    this.group.add(this.forming.group);
    this.ui = this.buildUi();
    this.load();
    this.joints.set(this.jointForms(), true);
    this.refreshNotes();
    addEventListener("heart-changed", () => this.refreshNotes());
    // the build screen's own keys (everything else rests while it is open)
    addEventListener("keydown", (e) => this.key(e), { capture: true });
    addEventListener("wheel", (e) => {
      if (!this.building || (e.target as HTMLElement)?.closest?.("#build")) return;
      this.orbit.distT = clampN(this.orbit.distT * Math.exp(e.deltaY * 0.0012), 5, 36);
    }, { passive: true });
    addEventListener("contextmenu", (e) => this.building && e.preventDefault());
  }

  /* ---------------- keeping ---------------- */
  private load(): void {
    if (!this.persist) return;
    // a first measure of stone, so the first strokes take form (the owner: "nothing happened")
    let seed = false;
    try {
      seed = !localStorage.getItem(SEED_KEY);
      if (seed) localStorage.setItem(SEED_KEY, "1");
    } catch {
      /* no storage: no seed */
    }
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as (Omit<Saved, "v"> & { v: number }) | null;
      if (v && (v.v === 2 || v.v === 3) && Array.isArray(v.forms)) {
        this.stone = Math.max(0, Number(v.stone) || 0);
        this.goldSpent = Math.max(0, Number(v.goldSpent) || 0);
        this.ink = v.ink === "gold" ? "gold" : "stone";
        for (const s of v.forms)
          if (s && s.kind in HEIGHT && Number.isFinite(s.x) && Number.isFinite(s.z)) this.addForm(v.v === 2 ? fromTerrace(s, true) : s, true);
        if (v.v === 2) this.save(); // drawn on the terrace before: now kept by their place in the world
      }
    } catch {
      /* nothing kept yet, or the device won't keep it */
    }
    if (seed) {
      this.stone += SEED_STONE;
      this.save();
    }
  }
  private snapshot(): string {
    return JSON.stringify({ stone: round(this.stone), goldSpent: round(this.goldSpent), forms: this.live().map((f) => f.s) });
  }
  private save(): void {
    if (!this.persist) return;
    try {
      const out: Saved = {
        v: 3,
        stone: round(this.stone),
        goldSpent: round(this.goldSpent),
        ink: this.ink,
        forms: this.live().map((f) => ({ ...f.s, x: round(f.s.x), z: round(f.s.z), y: round(f.s.y), rot: round(f.s.rot) })),
      };
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch {
      /* full or refused: the forms still stand for this visit */
    }
  }
  private live(): Form[] {
    return this.forms.filter((f) => f.out === undefined);
  }
  /** The heart's notes changed: the gold follows them. */
  refreshNotes(): void {
    if (!this.persist) return;
    this.notes = heartNotes().filter(forges);
    this.drawUi();
  }
  private have(ink: Ink): number {
    return ink === "stone" ? this.stone : Math.max(0, this.notes.length - this.goldSpent);
  }
  private spend(ink: Ink, c: number): void {
    if (ink === "stone") this.stone = Math.max(0, this.stone - c);
    else this.goldSpent += c;
  }
  private refund(ink: Ink, c: number): void {
    if (ink === "stone") this.stone += c;
    else this.goldSpent = Math.max(0, this.goldSpent - c);
  }
  /** A rock meditation completed: a measure of stone-essence. */
  addStone(n = 1): void {
    this.stone += n;
    this.save();
    this.drawUi();
    if (!this.building) this.hooks.say("Stone gathered. Hold on open ground to build with it.");
  }
  private notEnough(ink: Ink, what: string): void {
    this.hooks.bell(220, 0.008, 2.2);
    if (ink === "stone") this.hooks.say(`Not enough stone ${what}. Sit with a rock until its meditation ends to gather more${this.have("gold") > 0.1 ? ", or build in gold" : ""}.`);
    else this.hooks.say(`Not enough gold ${what}. Each note you write in your heart (double tap your heart, or H) gives gold${this.have("stone") > 0.1 ? "; or build in stone" : ""}.`);
  }

  /* ---------------- the build screen ---------------- */
  private buildUi(): HTMLElement {
    const el = document.createElement("div");
    el.id = "build";
    el.hidden = true;
    const ico = (k: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
    el.innerHTML = `
      <div class="b-top">
        <div class="b-inks" role="radiogroup" aria-label="Build with">
          <button class="ink stone" type="button" role="radio"><i></i><span>Stone</span><b><s></s></b></button>
          <button class="ink gold" type="button" role="radio"><i></i><span>Gold</span><b><s></s></b></button>
        </div>
        <div class="b-acts">
          <button class="undo" type="button" aria-label="Undo" title="Undo"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7 L4.5 11 L9 15"/><path d="M5 11 H14 a5 5 0 0 1 0 10 H11"/></svg></button>
          <button class="done" type="button">Done</button>
        </div>
      </div>
      <p class="b-hint">Draw on the ground with one finger. Two fingers turn and tilt the view; pinch to come closer.</p>
      <div class="b-shapes" aria-label="What each stroke makes">
        ${SHAPES.map(([k, d, n]) => `<button type="button" class="chip" data-k="${k}">${ico(k)}<span><em>${d}</em>${n}</span></button>`).join("")}
      </div>
      <div class="b-tools" hidden>
        <div class="b-name"></div>
        <div class="b-row">
          <span class="grp turn"><button type="button" data-t="turn-" aria-label="Turn left">⟲</button><label>Turn</label><button type="button" data-t="turn+" aria-label="Turn right">⟳</button></span>
          <span class="grp"><button type="button" data-t="size-" aria-label="Smaller">−</button><label>Size</label><button type="button" data-t="size+" aria-label="Larger">+</button></span>
          <span class="grp tall"><button type="button" data-t="tall-" aria-label="Lower">−</button><label>Height</label><button type="button" data-t="tall+" aria-label="Taller">+</button></span>
          <span class="grp"><button type="button" data-t="lift-" aria-label="Down">↓</button><label>Raise</label><button type="button" data-t="lift+" aria-label="Up">↑</button></span>
        </div>
        <div class="b-row">
          <button type="button" class="wide" data-t="ink">In gold</button>
          <button type="button" class="wide topb" data-t="top">Add a dome</button>
          <button type="button" class="wide" data-t="copy">Copy</button>
          <button type="button" class="wide warn" data-t="del">Let go</button>
          <button type="button" class="wide x" data-t="none" aria-label="Done with this">✓</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const tap = (b: HTMLElement, f: () => void) => {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        f();
      });
      b.addEventListener("click", (e) => {
        e.preventDefault();
        if (e.detail === 0) f(); // the keyboard
      });
    };
    tap(el.querySelector(".ink.stone")!, () => this.choose("stone"));
    tap(el.querySelector(".ink.gold")!, () => this.choose("gold"));
    tap(el.querySelector(".undo")!, () => this.takeBack());
    tap(el.querySelector(".done")!, () => this.onDone());
    for (const c of el.querySelectorAll<HTMLElement>(".chip")) {
      const k = c.dataset.k!, sh = SHAPES.find((x) => x[0] === k)!;
      const how: Record<string, string> = {
        wall: "Draw a line, straight or curving: a wall rises along it. A closed shape with corners walls it round.",
        ring: "Draw a circle, two strides or more across: a ring wall. Choose it to add a dome or a floor.",
        pillar: "Draw a small circle: a pillar.",
        spire: "Draw a spiral, winding in or out: a spire, taller the wider you draw it.",
        arch: "Draw a U, a horseshoe: an arch standing on its two ends, the way through it across them.",
        stairs: "Draw a zigzag: steps rising from where you began toward where you end.",
        orb: "Touch the ground: an orb of light. Choose it and raise it to hang it higher.",
      };
      tap(c, () => this.hooks.say(how[k] ?? sh[2]));
    }
    for (const b of el.querySelectorAll<HTMLElement>("[data-t]")) tap(b, () => this.tool(b.dataset.t!));
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    return el;
  }
  private choose(ink: Ink): void {
    if (this.selected && this.selected.s.ink !== ink) {
      // with a form chosen, an ink is a change of its ink
      this.tool("ink");
      return;
    }
    this.ink = ink;
    this.hooks.bell(ink === "gold" ? 523.25 : 392, 0.014, 1.8);
    if (this.have(ink) < 0.05) this.notEnough(ink, "yet");
    this.drawUi();
    this.save();
  }
  private drawUi(): void {
    // how much there is, as light (never a number): a glyph fuller as it gathers, a bar beneath
    for (const ink of ["stone", "gold"] as const) {
      const b = this.ui.querySelector(`.ink.${ink}`) as HTMLElement;
      const f = Math.min(1, this.have(ink) / 3);
      b.style.setProperty("--f", f.toFixed(3));
      b.classList.toggle("on", this.ink === ink);
      b.setAttribute("aria-checked", String(this.ink === ink));
      b.classList.toggle("empty", this.have(ink) < 0.04);
    }
    (this.ui.querySelector(".undo") as HTMLButtonElement).disabled = !this.undo.length;
    const f = this.selected;
    this.ui.classList.toggle("sel", !!f);
    (this.ui.querySelector(".b-tools") as HTMLElement).hidden = !f;
    (this.ui.querySelector(".b-shapes") as HTMLElement).hidden = !!f;
    (this.ui.querySelector(".b-hint") as HTMLElement).textContent = f
      ? "Drag it to move it. A tap on the ground puts it down."
      : "Draw on the ground with one finger. Two fingers turn and tilt the view; pinch to come closer.";
    if (!f) return;
    const names: Record<FormKind, string> = { wall: "Wall", ring: "Ring", pillar: "Pillar", spire: "Spire", orb: "Orb", arch: "Arch", stairs: "Steps" };
    (this.ui.querySelector(".b-name") as HTMLElement).textContent = `${names[f.s.kind]} · ${f.s.ink === "gold" ? "gold" : "stone"}`;
    (this.ui.querySelector("[data-t=ink]") as HTMLElement).textContent = f.s.ink === "gold" ? "In stone" : "In gold";
    const top = this.ui.querySelector(".topb") as HTMLElement;
    const canTop = f.s.kind === "ring" || (f.s.kind === "wall" && !!f.s.closed);
    top.hidden = !canTop;
    top.textContent = f.s.kind === "ring" ? (f.s.top === "dome" ? "A floor instead" : f.s.top === "floor" ? "Leave it open" : "Add a dome") : f.s.top === "floor" ? "No floor" : "Add a floor";
    (this.ui.querySelector(".grp.tall") as HTMLElement).hidden = f.s.kind === "orb";
    (this.ui.querySelector(".grp.turn") as HTMLElement).hidden = f.s.kind === "orb";
  }

  /** Open the build screen round `at` (where the wanderer kneels). `orbit`: the view rises over it
      (a still keeps its own view). */
  open(at: THREE.Vector3, opts: { orbit?: boolean; yaw?: number } = {}): void {
    this.building = true;
    this.plot.set(at.x, groundAt(at.x, at.z), at.z);
    this.layPage();
    this.orbit.use = opts.orbit !== false;
    this.orbit.on = true;
    const yaw = opts.yaw ?? 0;
    const tall = innerHeight > innerWidth;
    this.orbit.yaw = this.orbit.yawT = yaw;
    this.orbit.pitch = 0.6;
    this.orbit.pitchT = 0.92;
    this.orbit.dist = 12;
    this.orbit.distT = tall ? 22 : 17;
    this.ui.hidden = false;
    document.body.classList.add("building");
    this.refreshNotes();
    this.drawUi();
    this.hooks.bell(440, 0.016, 2.2);
    let told = 0;
    try {
      told = Number(localStorage.getItem(TOLD_KEY)) || 0;
      if (told < 3 && this.persist) localStorage.setItem(TOLD_KEY, String(told + 1));
    } catch {
      /* no storage: say it */
    }
    if (told < 3 && this.persist) this.hooks.say("Draw a shape on the ground: the strip below shows what each stroke makes. Tap anything you built to shape it.");
  }
  close(): void {
    if (!this.building) return;
    this.building = false;
    this.orbit.on = false;
    this.select(null);
    if (this.draw) this.cancelStroke();
    this.shape = null;
    this.view = null;
    this.mouseView = null;
    this.fingers.clear();
    this.ui.hidden = true;
    document.body.classList.remove("building");
  }
  /** Done: what main does after (the wanderer stands). */
  onDone: () => void = () => this.close();
  distance(p: THREE.Vector3): number {
    return Math.hypot(p.x - SANCTUARY.x, p.z - SANCTUARY.z);
  }
  get centre(): { x: number; y: number; z: number; face: number } {
    return { x: SANCTUARY.x, y: SANCTUARY.y + TOP, z: SANCTUARY.z, face: SANCTUARY.face };
  }
  /** The page over the land round the plot: rings of points laid on the earth. */
  private layPage(): void {
    const R = PLOT_R, rings = 22, seg = 72, P = this.plot;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    pos.push(0, groundAt(P.x, P.z) + 0.05, 0);
    uv.push(0.5, 0.5);
    for (let j = 1; j <= rings; j++) {
      const r = (j / rings) * R;
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
        pos.push(x, groundAt(P.x + x, P.z + z) + 0.05, z);
        uv.push(x / (2 * R) + 0.5, z / (2 * R) + 0.5);
      }
    }
    for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
    for (let j = 1; j < rings; j++)
      for (let i = 0; i < seg; i++) {
        const a = 1 + (j - 1) * seg + i, b = 1 + (j - 1) * seg + ((i + 1) % seg), c = a + seg, d = b + seg;
        idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.page.geometry.dispose();
    this.page.geometry = g;
    this.page.position.set(P.x, 0, P.z);
    this.page.updateMatrixWorld();
  }

  private rayAt(x: number, y: number): void {
    this.ray.setFromCamera(this.ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), this.camera!);
  }
  /** Where a screen point meets the page (x, z in the world); null off it (or, with `hold`, held
      to its edge). */
  private pageAt(x: number, y: number, hold = false): V2 | null {
    if (!this.camera) return null;
    this.rayAt(x, y);
    this.hits.length = 0;
    this.page.raycast(this.ray, this.hits);
    let px: number, pz: number;
    if (this.hits.length) {
      let h = this.hits[0];
      for (const k of this.hits) if (k.distance < h.distance) h = k;
      px = h.point.x;
      pz = h.point.z;
    } else {
      if (!hold) return null;
      const o = this.ray.ray.origin, d = this.ray.ray.direction;
      if (d.y > -1e-3) return null;
      const s = (this.plot.y - o.y) / d.y;
      px = o.x + d.x * s;
      pz = o.z + d.z * s;
    }
    const dx = px - this.plot.x, dz = pz - this.plot.z, r = Math.hypot(dx, dz), lim = PLOT_R - 0.3;
    if (r > lim) {
      if (!hold || r > PLOT_R * 4) return null;
      px = this.plot.x + (dx * lim) / r;
      pz = this.plot.z + (dz * lim) / r;
    }
    return [px, pz];
  }
  /** The form under a screen point. */
  private formAt(x: number, y: number, gold = false): Form | null {
    if (!this.camera) return null;
    this.rayAt(x, y);
    this.hits.length = 0;
    for (const f of this.forms) if (f.out === undefined && f.group.visible && (!gold || f.s.ink === "gold")) this.ray.intersectObject(f.body, true, this.hits);
    let best: Form | null = null, bd = Infinity;
    for (const h of this.hits) {
      if (h.distance >= bd) continue;
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.form) o = o.parent;
      if (o) {
        best = o.userData.form as Form;
        bd = h.distance;
      }
    }
    return best;
  }

  /** For Input.capture (with `captureAll` while the screen is open): every touch is building's. */
  readonly capture = {
    down: (e: PointerEvent): boolean => {
      if (!this.building) return false;
      this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // a mouse's right (or middle) button, or Shift: the view round
      if (e.pointerType === "mouse" && (e.button !== 0 || e.shiftKey)) {
        this.mouseView = { id: e.pointerId, x: e.clientX, y: e.clientY };
        return true;
      }
      // a second finger: the view (a stroke under way is let go; a form being carried stays put)
      if (this.fingers.size >= 2) {
        if (this.draw) this.cancelStroke();
        if (this.shape) this.endShape();
        const [a, b] = [...this.fingers.keys()];
        const A = this.fingers.get(a)!, B = this.fingers.get(b)!;
        this.view = { a, b, d0: Math.max(20, Math.hypot(A.x - B.x, A.y - B.y)), ang0: Math.atan2(B.y - A.y, B.x - A.x), my0: (A.y + B.y) / 2, mx0: (A.x + B.x) / 2, yaw0: this.orbit.yawT, pitch0: this.orbit.pitchT, dist0: this.orbit.distT };
        return true;
      }
      const f = this.formAt(e.clientX, e.clientY);
      if (f) {
        const was = this.selected === f;
        this.select(f);
        const at = this.pageAt(e.clientX, e.clientY, true) ?? [f.s.x, f.s.z];
        this.shape = { id: e.pointerId, form: f, was, moved: false, sx: e.clientX, sy: e.clientY, off: [f.s.x - at[0], f.s.z - at[1]], snap: false };
        return true;
      }
      const p = this.pageAt(e.clientX, e.clientY);
      if (!p) return true; // off the page: nothing (it is still building's touch)
      // a touch on the earth: the brush
      this.draw = { id: e.pointerId, ground: [p], sx: e.clientX, sy: e.clientY, screen: 0, ink: this.ink };
      this.trailFade = 0;
      this.trail.k.value = 0.9;
      this.trail.mesh.visible = true;
      this.trail.set([p], 0, false, (x, z) => groundAt(x, z) + 0.07);
      return true;
    },
    move: (e: PointerEvent): void => {
      const fp = this.fingers.get(e.pointerId);
      if (fp) {
        fp.x = e.clientX;
        fp.y = e.clientY;
      }
      if (this.mouseView && e.pointerId === this.mouseView.id) {
        const dx = e.clientX - this.mouseView.x, dy = e.clientY - this.mouseView.y;
        this.mouseView.x = e.clientX;
        this.mouseView.y = e.clientY;
        this.orbit.yawT -= dx * 0.008;
        this.orbit.pitchT = clampN(this.orbit.pitchT + dy * 0.005, 0.32, 1.42);
        return;
      }
      if (this.view && (e.pointerId === this.view.a || e.pointerId === this.view.b)) {
        const A = this.fingers.get(this.view.a), B = this.fingers.get(this.view.b);
        if (!A || !B) return;
        const v = this.view;
        const d = Math.max(20, Math.hypot(A.x - B.x, A.y - B.y));
        const ang = Math.atan2(B.y - A.y, B.x - A.x);
        const my = (A.y + B.y) / 2, mx = (A.x + B.x) / 2;
        let da = ang - v.ang0;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        // turn them, or slide them sideways: round; up or down: higher or lower; pinch: nearer
        this.orbit.yawT = v.yaw0 - da - ((mx - v.mx0) / innerWidth) * 3.2;
        this.orbit.pitchT = clampN(v.pitch0 + ((my - v.my0) / innerHeight) * 2.4, 0.32, 1.42);
        this.orbit.distT = clampN((v.dist0 * v.d0) / d, 5, 36);
        return;
      }
      if (this.draw && e.pointerId === this.draw.id) {
        const d = this.draw;
        d.screen += Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
        d.sx = e.clientX;
        d.sy = e.clientY;
        const p = this.pageAt(e.clientX, e.clientY, true);
        const last = d.ground[d.ground.length - 1];
        if (p && Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.06 && d.ground.length < 500) {
          d.ground.push(p);
          this.trail.set(d.ground, 0, false, (x, z) => groundAt(x, z) + 0.07);
        }
        return;
      }
      if (this.shape && e.pointerId === this.shape.id) {
        if (Math.hypot(e.clientX - this.shape.sx, e.clientY - this.shape.sy) > 9) this.shape.moved = true;
        if (!this.shape.moved) return;
        if (!this.shape.snap) {
          this.shape.snap = true;
          this.remember();
        }
        const p = this.pageAt(e.clientX, e.clientY, true);
        // where the finger is, on the page; the form follows there, unhurried (update)
        if (p) this.shape.form.to.set(p[0] + this.shape.off[0], p[1] + this.shape.off[1]);
      }
    },
    up: (e: PointerEvent): void => {
      this.fingers.delete(e.pointerId);
      if (this.mouseView && e.pointerId === this.mouseView.id) {
        this.mouseView = null;
        return;
      }
      if (this.view && (e.pointerId === this.view.a || e.pointerId === this.view.b)) {
        if (this.fingers.size < 2) this.view = null;
        return;
      }
      if (this.draw && e.pointerId === this.draw.id) {
        const d = this.draw;
        this.draw = null;
        this.finishStroke(d.ground, d.screen, d.ink);
        return;
      }
      if (this.shape && e.pointerId === this.shape.id) {
        const s = this.shape;
        // a tap on the chosen form puts it down; a carry ends where it is
        if (!s.moved && s.was) this.select(null);
        this.endShape();
      }
    },
  };
  private endShape(): void {
    const s = this.shape;
    this.shape = null;
    if (!s || !s.moved) return;
    const f = s.form;
    f.s.x = f.to.x;
    f.s.z = f.to.y;
    this.rebuild(f);
    this.jointsDirty = true;
    this.save();
  }

  /* ---------------- keys ---------------- */
  private key(e: KeyboardEvent): void {
    if (!this.building || (e.target as HTMLElement)?.closest?.("input, textarea, #menu")) return;
    const k = e.key.toLowerCase();
    e.stopImmediatePropagation();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(k)) e.preventDefault();
    if (k === "escape") this.selected ? this.select(null) : this.onDone();
    else if (k === "enter") this.onDone();
    else if (k === "z" && (e.ctrlKey || e.metaKey)) this.takeBack();
    else if ((k === "delete" || k === "backspace") && this.selected) this.tool("del");
    else if (k === "arrowleft" || k === "a") this.orbit.yawT += 0.18;
    else if (k === "arrowright" || k === "d") this.orbit.yawT -= 0.18;
    else if (k === "arrowup" || k === "w") this.orbit.pitchT = clampN(this.orbit.pitchT + 0.1, 0.32, 1.42);
    else if (k === "arrowdown" || k === "s") this.orbit.pitchT = clampN(this.orbit.pitchT - 0.1, 0.32, 1.42);
    else if (k === "+" || k === "=") this.orbit.distT = clampN(this.orbit.distT * 0.85, 5, 36);
    else if (k === "-" || k === "_") this.orbit.distT = clampN(this.orbit.distT / 0.85, 5, 36);
    else if (this.selected && (k === "q" || k === "e")) this.tool(k === "q" ? "turn-" : "turn+");
  }

  /* ---------------- shaping ---------------- */
  /** Before a change: what it was, for ↶. */
  private remember(): void {
    this.undo.push(this.snapshot());
    if (this.undo.length > 40) this.undo.shift();
  }
  private takeBack(): void {
    const last = this.undo.pop();
    if (!last) return;
    const v = JSON.parse(last) as { stone: number; goldSpent: number; forms: SavedForm[] };
    this.select(null);
    for (const f of this.forms) this.dispose(f);
    this.forms = [];
    this.stone = v.stone;
    this.goldSpent = v.goldSpent;
    for (const s of v.forms) this.addForm(s, true);
    this.joints.set(this.jointForms(), true);
    this.hooks.bell(349.23, 0.012, 1.6);
    this.save();
    this.drawUi();
  }
  /** One of the chosen form's tools. */
  private tool(t: string): void {
    const f = this.selected;
    if (t === "none") return this.select(null);
    if (!f) return;
    const s = f.s;
    if (t === "del") return this.release(f);
    if (t === "copy") {
      const c: SavedForm = JSON.parse(JSON.stringify(s));
      const off = 1.4 + (s.kind === "ring" ? (s.r ?? 1.5) * (s.sc ?? 1) * 2 : s.kind === "arch" ? (s.w ?? 2) * (s.sc ?? 1) : 0.6);
      c.x += Math.cos(s.rot) * off;
      c.z -= Math.sin(s.rot) * off;
      c.cost = round(costOf(c));
      if (c.cost > this.have(s.ink) + 1e-6) return this.notEnough(s.ink, "for a copy");
      this.remember();
      this.spend(s.ink, c.cost);
      const n = this.addForm(c, false);
      this.select(n);
      this.hooks.bell(392, 0.016, 2.4);
      this.save();
      this.drawUi();
      return;
    }
    if (t === "ink") {
      const to: Ink = s.ink === "gold" ? "stone" : "gold";
      const c = costOf(s);
      if (c > this.have(to) + 1e-6) return this.notEnough(to, `to make this ${to === "gold" ? "gold" : "stone"}`);
      this.remember();
      this.refund(s.ink, s.cost);
      this.spend(to, c);
      s.cost = round(c);
      s.ink = to;
      delete s.note;
      if (to === "gold") s.note = this.newestNote();
      this.ink = to;
      this.rebuild(f);
      this.after(f, to === "gold" ? 523.25 : 392);
      return;
    }
    // a change of shape: what it takes is weighed again, the difference spent or given back
    const snap = this.snapshot(), before = JSON.stringify(s);
    const H = HEIGHT[s.kind];
    if (t === "turn-" || t === "turn+") s.rot += t === "turn-" ? 0.2618 : -0.2618;
    else if (t === "size-" || t === "size+") s.sc = round(clampN((s.sc ?? 1) * (t === "size-" ? 0.85 : 1 / 0.85), 0.4, 3));
    else if (t === "tall-" || t === "tall+") s.h = round(clampN(heightOf(s) * (t === "tall-" ? 0.85 : 1 / 0.85), H[1], H[2]));
    else if (t === "lift-" || t === "lift+") s.y = round(clampN(s.y + (t === "lift-" ? -0.3 : 0.3), s.kind === "orb" ? -1.2 : 0, s.kind === "orb" ? 9 : 6));
    else if (t === "top") {
      if (s.kind === "ring") s.top = s.top === "dome" ? "floor" : s.top === "floor" ? undefined : "dome";
      else if (s.kind === "wall" && s.closed) s.top = s.top === "floor" ? undefined : "floor";
      if (!s.top) delete s.top;
    } else return;
    const d = costOf(s) - costOf(JSON.parse(before) as SavedForm);
    if (d > this.have(s.ink) + 1e-6) {
      f.s = JSON.parse(before) as SavedForm;
      return this.notEnough(s.ink, "for that");
    }
    this.undo.push(snap);
    if (this.undo.length > 40) this.undo.shift();
    if (d > 0) this.spend(s.ink, d);
    else this.refund(s.ink, -d);
    s.cost = round(Math.max(0, s.cost + d));
    if (!t.startsWith("lift")) this.rebuild(f); // turned, the land under it changes too
    this.after(f, t === "top" ? 587.33 : 440);
  }
  private after(f: Form, note: number): void {
    this.hooks.bell(note, 0.012, 1.6);
    this.jointsDirty = true;
    this.select(f, true);
    this.save();
    this.drawUi();
  }
  private newestNote(): number | undefined {
    let n: number | undefined;
    for (const m of this.notes) if (n === undefined || m.createdAt > n) n = m.createdAt;
    return n;
  }

  private cancelStroke(): void {
    this.draw = null;
    this.trailFade = 1.6;
  }
  /** A stroke let go: read it, and grow what it is, or let it sink back into the earth. */
  private finishStroke(ground: V2[], screen: number, ink: Ink): void {
    // a tap on the earth while a form is chosen only puts it down
    if (screen < 16 && this.selected) {
      this.select(null);
      this.trail.mesh.visible = false;
      return;
    }
    const r = readStroke(ground, screen);
    let s: SavedForm | null = null;
    if (r?.kind === "dot") {
      const [x, z] = ground[ground.length - 1];
      s = { kind: "orb", ink, x, z, y: 1.6, rot: 0, cost: 0 };
    } else if (r?.kind === "wall") {
      let cx = 0, cz = 0;
      for (const [x, z] of r.path) {
        cx += x / r.path.length;
        cz += z / r.path.length;
      }
      const path = r.path.filter((_, i) => i % 2 === 0 || i === r.path.length - 1).flatMap(([x, z]) => [round(x - cx), round(z - cz)]);
      s = { kind: "wall", ink, path, closed: r.closed, x: cx, z: cz, y: 0, rot: 0, cost: 0 };
    } else if (r?.kind === "ring") {
      s = { kind: "ring", ink, r: round(r.r), x: r.c[0], z: r.c[1], y: 0, rot: 0, cost: 0 };
    } else if (r?.kind === "pillar") {
      s = { kind: "pillar", ink, r: round(Math.min(0.42, Math.max(0.2, r.r * 0.35))), x: r.c[0], z: r.c[1], y: 0, rot: 0, cost: 0 };
    } else if (r?.kind === "spire") {
      const h = Math.min(9, Math.max(3, 2.4 + r.r * 2.6));
      s = { kind: "spire", ink, r: round(Math.min(1.1, Math.max(0.3, r.r * 0.42))), h: round(h), x: r.c[0], z: r.c[1], y: 0, rot: 0, cost: 0 };
    } else if (r?.kind === "arch") {
      const [ax, az] = r.a, [bx, bz] = r.b;
      const span = clampN(Math.hypot(bx - ax, bz - az), 1.2, 6);
      // the arch stands across the line between its ends; its way through goes across that line
      s = { kind: "arch", ink, w: round(span), h: round(clampN(1.4 + span * 0.45, 1.8, 4.5)), x: (ax + bx) / 2, z: (az + bz) / 2, y: 0, rot: Math.atan2(-(bz - az), bx - ax), cost: 0 };
    } else if (r?.kind === "stairs") {
      const [ax, az] = r.a, [bx, bz] = r.b;
      const l = clampN(Math.hypot(bx - ax, bz - az), 1.2, 9);
      s = { kind: "stairs", ink, l: round(l), w: round(clampN(r.w, 1, 3.2)), h: round(clampN(l * 0.5, 0.6, 3)), x: (ax + bx) / 2, z: (az + bz) / 2, y: 0, rot: Math.atan2(bx - ax, bz - az), cost: 0 };
    }
    if (s) s.cost = round(Math.max(0.02, costOf(s)));
    if (!s || s.cost > this.have(ink) + 1e-6) {
      // not understood, or not enough essence: the stroke sinks back, unforged, with a quiet word
      this.trailFade = 1.6;
      if (!s) {
        this.hooks.bell(220, 0.008, 2.2);
        this.hooks.say("Draw one clear shape: a line, a circle, a spiral, a U, a zigzag, or a touch.");
      } else this.notEnough(ink, "for that; draw it smaller");
      return;
    }
    if (ink === "gold") {
      const n = this.newestNote();
      if (n !== undefined) s.note = n;
    }
    this.remember();
    this.spend(ink, s.cost);
    this.trail.mesh.visible = false;
    const f = this.addForm(s, false);
    this.select(null);
    this.hooks.bell(s.kind === "orb" ? 659.25 : ink === "gold" ? 523.25 : 293.66, 0.02, 3.4);
    this.v.set(f.s.x, f.base + 0.3, f.s.z);
    this.hooks.sparks(this.v, 8, ink === "gold" ? GOLD_LIGHT : STONE_LIGHT, 0.8);
    this.save();
    this.drawUi();
  }

  /** The height of the land under a point of a form's own frame, over the earth at its origin. */
  private layOf(s: SavedForm, base: number): Lay {
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    return (lx, lz) => groundAt(s.x + lx * c + lz * sn, s.z - lx * sn + lz * c) - base;
  }
  private addForm(s: SavedForm, settled: boolean): Form {
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    this.world.add(group);
    const f: Form = { s, group, body, meshes: [], geos: [], base: 0, age: settled ? 999 : 0, grow: settled ? 1 : 0, to: new THREE.Vector2(s.x, s.z), lift: s.y, line: [[0, 0]], half: 0.3, H: 0, shade: new THREE.Mesh(), shadeK: null };
    body.userData.form = f;
    this.make(f);
    this.forms.push(f);
    if (!settled && s.kind !== "orb") this.seamFor(f);
    this.pose(f);
    return f;
  }
  /** Grow a form's shapes from what is kept of it (again, after it changes). */
  private make(f: Form): void {
    const s = f.s, sc = s.sc ?? 1, mat = s.ink === "gold" ? this.mats.gold : this.mats.stone;
    f.base = groundAt(s.x, s.z);
    const lay = this.layOf(s, f.base);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = x.receiveShadow = true;
      f.body.add(x);
      f.meshes.push(x);
      f.geos.push(g);
      return x;
    };
    let line: V2[] = [[0, 0]], half = 0.3, H = heightOf(s);
    if (s.kind === "orb") {
      const g = new THREE.SphereGeometry(0.2 * sc, 24, 16);
      const hg = new THREE.PlaneGeometry(1.6 * sc, 1.6 * sc);
      const halo = new THREE.Mesh(hg, this.mats.orbHalo[s.ink]);
      halo.renderOrder = 3;
      const core = new THREE.Mesh(g, this.mats.orbCore[s.ink]);
      f.body.add(core, halo);
      f.meshes.push(core);
      f.geos.push(g, hg);
      H = 0;
    } else if (s.kind === "wall") {
      const path = pathOf(s);
      mesh(wallGeometry(path, !!s.closed, H, 0.24, lay), mat);
      line = smoothPath(path, !!s.closed);
      half = 0.24;
      if (s.closed && s.top === "floor") mesh(floorGeometry(line), s.ink === "gold" ? mat : this.mats.floor);
    } else if (s.kind === "ring") {
      const R = (s.r ?? 1.5) * sc, n = Math.max(18, Math.round(R * 10));
      line = Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * R, Math.sin((i / n) * Math.PI * 2) * R] as V2);
      mesh(wallGeometry(line, true, H, 0.22, lay), mat);
      half = 0.22;
      if (s.top === "dome") mesh(domeGeometry(R + 0.2, H + Math.max(0, lay(0, 0))), mat);
      else if (s.top === "floor") mesh(floorGeometry(line.map(([x, z]) => [x * 0.96, z * 0.96] as V2)), s.ink === "gold" ? mat : this.mats.floor);
    } else if (s.kind === "pillar") {
      mesh(pillarGeometry((s.r ?? 0.3) * sc, H), mat);
      half = (s.r ?? 0.3) * sc * 1.2;
    } else if (s.kind === "spire") {
      mesh(spireGeometry((s.r ?? 0.6) * sc, H), mat);
      half = (s.r ?? 0.6) * sc * 1.05;
    } else if (s.kind === "arch") {
      const span = (s.w ?? 2) * sc;
      mesh(archGeometry(span, H), mat);
      const pier = Math.max(0.45, span * 0.16);
      line = [[-(span / 2 + pier / 2), 0], [span / 2 + pier / 2, 0]];
      half = pier / 2;
      H = H + Math.max(0.42, span * 0.12);
    } else {
      mesh(stairsGeometry((s.l ?? 3) * sc, (s.w ?? 1.6) * sc, H), mat);
      half = ((s.w ?? 1.6) * sc) / 2;
    }
    f.line = line;
    f.half = half;
    f.H = H;
    // its soft footprint: a feathered shade along a wall, a round one under the others
    if (s.kind === "wall" || s.kind === "ring") {
      const rb = new Ribbon(line.length + 2, 0.62, new THREE.Color(), false, true);
      rb.set(line, 0, s.kind === "ring" || !!s.closed, (x, z) => lay(x, z) + 0.012);
      f.shade = rb.mesh;
      f.shadeK = rb.k;
    } else {
      const ext = s.kind === "stairs" ? Math.max((s.l ?? 3) * sc, (s.w ?? 1.6) * sc) * 0.5 : s.kind === "arch" ? ((s.w ?? 2) * sc) / 2 + half : half * 1.05;
      f.shade = contactShade({ r: s.kind === "orb" ? 0.01 : ext }, s.kind === "spire" ? 1.1 : 0.8, 0.5);
      f.shade.visible = s.kind !== "orb";
      f.shade.position.y = 0.012;
      f.shadeK = null;
    }
    f.geos.push(f.shade.geometry);
    f.group.add(f.shade);
  }
  /** A form changed shape: grown again where it stands. */
  private rebuild(f: Form): void {
    const sel = this.selected === f;
    if (sel) this.clearAura();
    for (const m of f.meshes) m.parent?.remove(m);
    f.body.clear();
    f.shade.parent?.remove(f.shade);
    for (const g of f.geos) g.dispose();
    f.meshes = [];
    f.geos = [];
    this.make(f);
    this.pose(f);
    if (sel) this.select(f, true);
  }
  private dispose(f: Form): void {
    this.world.remove(f.group);
    for (const g of f.geos) g.dispose();
  }

  /** The settled forms on the earth, in the world, for their meeting places. */
  private jointForms(): JointForm[] {
    const out: JointForm[] = [];
    for (const f of this.forms) {
      const s = f.s;
      if (s.kind === "orb" || s.kind === "stairs" || f.out !== undefined || f.grow < 1 || s.y > 0.35) continue;
      const c = Math.cos(s.rot), sn = Math.sin(s.rot);
      const line = f.line.map(([x, z]) => [x * c + z * sn + s.x, -x * sn + z * c + s.z] as V2);
      out.push({ kind: s.kind === "arch" ? "wall" : s.kind, ink: s.ink, line, half: f.half, open: s.kind === "wall" && !s.closed, H: f.H });
    }
    return out;
  }

  /** How far grown a form is at `age` seconds, on the breath: a wall rises over one exhale, a ring,
      a pillar, an arch or steps bloom over one inhale, an orb kindles over one, and a spire climbs
      on each inhale and exhale and is still through the holds, until it has climbed three. */
  growth(kind: FormKind, age: number): number {
    const ph = this.hooks.breath();
    const secs = (name: string) => ph.find((p) => p.name === name)?.secs ?? 4;
    if (kind === "wall") return ease(age / secs("out"));
    if (kind !== "spire") return outCubic(age / secs("in"));
    let t = age, done = 0;
    for (let i = 0; i < 16 && t > 0; i++) {
      const p = ph[i % ph.length];
      if (p.name === "in" || p.name === "out") {
        const k = Math.min(1, t / p.secs);
        done += ease(k);
        if (k < 1 || done >= 3) break;
      }
      t -= p.secs;
    }
    return Math.min(1, done / 3);
  }
  private pose(f: Form): void {
    const out = f.out !== undefined ? ease(f.out / 2.2) : 0;
    if (f.s.kind !== "orb") {
      // the shade stays on the earth as the form is lifted, and fades with the height
      const kk = f.grow * (1 - out) * Math.max(0, 1 - f.lift / 0.8);
      f.shade.position.y = (f.shadeK ? 0 : 0.012) - f.lift;
      f.shade.visible = kk > 0.01;
      if (f.shadeK) f.shadeK.value = kk;
      else f.shade.scale.setScalar(Math.max(0.001, kk));
    }
    const k = f.grow * (1 - out);
    if (f.s.kind === "orb") f.body.scale.setScalar(Math.max(0.0001, k));
    else {
      // it rises out of the earth (and sinks back into it when let go)
      f.body.position.y = -(f.H + 1.2) * (1 - k);
      f.body.visible = k > 0.002;
    }
  }

  private clearAura(): void {
    for (const a of this.auras) a.parent?.remove(a);
    this.auras = [];
  }
  private select(f: Form | null, quiet = false): void {
    if (this.selected === f && !quiet) return;
    this.clearAura();
    const was = this.selected;
    this.selected = f;
    if (f) {
      if (!quiet && was !== f) this.hooks.bell(587.33, 0.012, 2);
      // a soft glow over it, and a faint ring at its base
      if (f.s.kind !== "orb")
        for (const m of f.meshes) {
          const a = new THREE.Mesh(m.geometry, this.mats.aura);
          a.renderOrder = 4;
          a.scale.setScalar(1.02);
          m.add(a);
          this.auras.push(a);
        }
    }
    this.drawUi();
  }
  /** A form's outline on the earth, `off` metres out from it, in the world. */
  private outline(f: Form, off: number): V2[] {
    const s = f.s, sc = s.sc ?? 1;
    const pts: V2[] = [];
    if (s.kind === "wall" && s.path && s.path.length > 3) {
      const p = pathOf(s);
      if (s.closed) {
        for (const [x, z] of p) {
          const l = Math.hypot(x, z) || 1;
          pts.push([x + (x / l) * off, z + (z / l) * off]);
        }
      } else {
        // out along one side and back along the other
        const side = (list: V2[]) =>
          list.map((q, i) => {
            const a = list[Math.max(0, i - 1)], b = list[Math.min(list.length - 1, i + 1)];
            const tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
            return [q[0] - (tz / tl) * off, q[1] + (tx / tl) * off] as V2;
          });
        pts.push(...side(p), ...side([...p].reverse()));
      }
    } else if (s.kind === "arch" || s.kind === "stairs") {
      const hw = (s.kind === "arch" ? ((s.w ?? 2) * sc) / 2 + Math.max(0.45, (s.w ?? 2) * sc * 0.16) : ((s.w ?? 1.6) * sc) / 2) + off;
      const hl = (s.kind === "arch" ? 0.33 : ((s.l ?? 3) * sc) / 2) + off;
      for (const [x, z] of [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]] as V2[]) pts.push([x, z]);
    } else {
      const R = s.kind === "ring" ? (s.r ?? 1.5) * sc + off - 0.05 : s.kind === "spire" ? (s.r ?? 0.6) * sc * 1.2 + off - 0.1 : s.kind === "pillar" ? (s.r ?? 0.3) * sc * 1.45 + off - 0.15 : off;
      for (let i = 0; i < 64; i++) pts.push([Math.cos((i / 64) * Math.PI * 2) * R, Math.sin((i / 64) * Math.PI * 2) * R]);
    }
    const c = Math.cos(f.group.rotation.y), sn = Math.sin(f.group.rotation.y), X = f.group.position.x, Z = f.group.position.z;
    return pts.slice(0, 128).map(([x, z]) => [X + x * c + z * sn, Z - x * sn + z * c] as V2);
  }
  private seamFor(f: Form): void {
    this.seamOf = f;
    this.seam.set(this.outline(f, f.s.kind === "wall" ? 0.27 : 0.08), 0, true, (x, z) => groundAt(x, z) + 0.03);
  }
  /** Let a form go: it sinks back into the earth and its essence returns. */
  private release(f: Form): void {
    if (f.out !== undefined) return;
    this.remember();
    f.out = 0;
    this.jointsDirty = true;
    if (f.s.kind !== "orb") this.seamFor(f);
    this.select(null);
    this.refund(f.s.ink, f.s.cost);
    this.v.set(f.s.x, f.base + 0.5 + f.s.y, f.s.z);
    this.hooks.sparks(this.v, 10, f.s.ink === "gold" ? GOLD_LIGHT : STONE_LIGHT, 0.9);
    this.hooks.bell(f.s.ink === "gold" ? 659.25 : 349.23, 0.016, 3);
    this.save();
    this.drawUi();
  }

  /** Outside building: a gold form under the tap gives its note (null: that note was let go). */
  pickNote(x: number, y: number, camera: THREE.Camera): { note: HeartNote | null } | null {
    if (this.building) return null;
    this.camera = camera;
    const f = this.formAt(x, y, true);
    if (!f) return null;
    return { note: heartNotes().find((m) => m.createdAt === f.s.note) ?? null };
  }

  /* ---------------- a stone from a rock ---------------- */
  /** A rock meditation completed: a stone gathers out of the rock and comes to you. */
  formStone(contact: THREE.Vector3, rock: THREE.Vector3, r: number, chest: () => THREE.Vector3): void {
    this.forming.begin(contact, rock, r, chest, () => {
      this.addStone(1);
      this.hooks.bowl(392, 0.026);
    });
  }
  get formingNow(): boolean {
    return this.forming.active;
  }

  /** After the follow camera: while building, the view rises over the page and circles it (eased
      in from wherever the view was, and back out to it after). */
  cameraFrame(camera: THREE.PerspectiveCamera, dt: number): void {
    const o = this.orbit;
    o.k += ((o.on && o.use ? 1 : 0) - o.k) * Math.min(1, dt * (o.on ? 1.6 : 2.4));
    if (o.k < 0.002) {
      o.k = 0;
      return;
    }
    const e = Math.min(1, dt * 4);
    let dy = o.yawT - o.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    o.yaw += dy * e;
    o.pitch += (o.pitchT - o.pitch) * e;
    o.dist += (o.distT - o.dist) * e;
    this.aim.set(this.plot.x, this.plot.y + 0.8, this.plot.z);
    const cp = Math.cos(o.pitch);
    this.eye.set(this.aim.x + Math.sin(o.yaw) * cp * o.dist, this.aim.y + Math.sin(o.pitch) * o.dist, this.aim.z + Math.cos(o.yaw) * cp * o.dist);
    // never under the land
    this.eye.y = Math.max(this.eye.y, heightAt(this.eye.x, this.eye.z) + 1.2);
    this.dummy.position.copy(this.eye);
    this.dummy.lookAt(this.aim);
    const k = ease(o.k);
    camera.position.lerp(this.eye, k);
    this.qA.copy(camera.quaternion).slerp(this.dummy.quaternion, k);
    camera.quaternion.copy(this.qA);
    camera.updateMatrixWorld();
  }
  /** The view's heading over the page (a still sets it). */
  view0(yaw: number): void {
    this.orbit.yaw = this.orbit.yawT = yaw;
  }

  update(dt: number, t: number, dpr: number, at: THREE.Vector3, camera: THREE.Camera): void {
    this.camera = camera;
    const hushTo = this.building ? (this.draw ? 0.7 : 0.25) : 0;
    this.hush += (hushTo - this.hush) * Math.min(1, dt * 1.6);
    const pu = this.page.material.uniforms;
    pu.uK.value += ((this.building ? 1 : 0) - pu.uK.value) * Math.min(1, dt * 1.2);
    pu.uT.value = t;
    this.page.visible = pu.uK.value > 0.004;
    this.mats.orbHalo.stone.uniforms.uT.value = t;
    this.mats.orbHalo.gold.uniforms.uT.value = t;
    // a stroke not taken sinks back into the earth
    if (this.trailFade > 0) {
      this.trailFade -= dt;
      this.trail.k.value = Math.max(0, (this.trailFade / 1.6) * 0.9);
      if (this.trailFade <= 0) this.trail.mesh.visible = false;
    }
    this.baseK += ((this.selected ? 1 : 0) - this.baseK) * Math.min(1, dt * 3);
    this.base.k.value = this.baseK * (0.5 + 0.12 * Math.sin(t * 1.6));
    this.base.mesh.visible = this.baseK > 0.01;
    // the seam glows while its form moves through the earth, most at the middle of the way
    {
      const f = this.seamOf;
      const k = !f ? 0 : f.out !== undefined ? Math.sin(Math.min(1, f.out / 2.2) * Math.PI) : f.grow < 1 ? Math.sin(f.grow * Math.PI) : 0;
      this.seam.k.value = k * 0.55;
      this.seam.mesh.visible = k > 0.01;
      if (f && k <= 0.01 && (f.grow >= 1 || (f.out ?? 0) > 2.2)) this.seamOf = null;
    }
    this.forming.update(dt, dpr, camera);
    // the meeting places, once the forms are still (not while one is being carried)
    if (this.jointsDirty && !this.shape) {
      this.jointsDirty = false;
      this.joints.set(this.jointForms());
    }
    this.joints.update(dt);
    this.root.visible = Math.hypot(at.x - SANCTUARY.x, at.z - SANCTUARY.z) < 420;
    let gone = false;
    const k = Math.min(1, dt * 3.2); // weighted, unhurried
    for (const f of this.forms) {
      const near = Math.hypot(f.s.x - at.x, f.s.z - at.z) < 480;
      f.group.visible = near;
      if (!near && f.out === undefined && f.grow >= 1) continue;
      if (f.out !== undefined) {
        f.out += dt;
        if (f.out > 2.3) gone = true;
      } else if (f.grow < 1 && !this.held) {
        f.age += dt;
        f.grow = this.growth(f.s.kind, f.age);
        if (f.grow >= 1) this.jointsDirty = true; // grown: the world completes what it meets
      }
      let px = f.s.x, pz = f.s.z;
      if (this.shape?.form === f && this.shape.moved) {
        // carried: it follows the finger over the land
        f.group.position.x += (f.to.x - f.group.position.x) * k;
        f.group.position.z += (f.to.y - f.group.position.z) * k;
        px = f.group.position.x;
        pz = f.group.position.z;
        f.base += (groundAt(px, pz) - f.base) * k;
      }
      f.lift += (f.s.y - f.lift) * k;
      f.group.position.set(px, f.base + f.lift + (f.s.kind === "orb" ? Math.sin(t * 0.6 + f.s.x * 3) * 0.06 : 0), pz);
      f.group.rotation.y += (f.s.rot - f.group.rotation.y) * k;
      if (f.s.kind === "orb") {
        // the halo turned to the view
        f.group.updateMatrixWorld();
        f.body.getWorldQuaternion(this.q).invert().multiply(camera.quaternion);
        f.body.children[1].quaternion.copy(this.q);
      }
      this.pose(f);
    }
    if (this.selected && this.base.mesh.visible) this.base.set(this.outline(this.selected, 0.6), 0, true, (x, z) => groundAt(x, z) + 0.06);
    if (gone) {
      for (const f of this.forms) if (f.out !== undefined && f.out > 2.3) this.dispose(f);
      this.forms = this.forms.filter((f) => !(f.out !== undefined && f.out > 2.3));
    }
  }

  /* ---------------- for still frames ---------------- */
  /** Lay forms (drawn in the terrace's frame) without touching what is kept on the device
      (`grown` holds them part-risen). */
  shotForms(list: SavedForm[], grown = 1): void {
    for (const f of this.forms) this.dispose(f);
    this.forms = [];
    this.held = grown < 1;
    for (const s0 of list) {
      const f = this.addForm(fromTerrace(s0), true);
      f.grow = grown;
      f.age = grown < 1 ? 0 : 999;
      f.group.position.set(f.s.x, f.base + f.s.y, f.s.z);
      f.group.rotation.y = f.s.rot;
      if (grown < 1 && f.s.kind !== "orb") this.seamFor(f);
      this.pose(f);
    }
    this.joints.set(this.jointForms(), true);
  }
  /** Building held open with a stroke mid-draw (the trail of light on the earth; terrace frame). */
  shotTrail(pts: V2[]): void {
    const w = pts.map(([x, z]) => {
      const s = fromTerrace({ kind: "orb", ink: "stone", x, z, y: 0, rot: 0, cost: 0 });
      return [s.x, s.z] as V2;
    });
    this.trail.mesh.visible = true;
    this.trail.k.value = 0.9;
    this.trail.set(w, 0, false, (x, z) => groundAt(x, z) + 0.07);
    this.draw = { id: -1, ground: w, sx: 0, sy: 0, screen: 999, ink: this.ink };
  }
  /** A point of the terrace's frame, on the screen (for a still's fingertip). */
  screenOf(p: V2, camera: THREE.Camera): [number, number] {
    const s = fromTerrace({ kind: "orb", ink: "stone", x: p[0], z: p[1], y: 0, rot: 0, cost: 0 });
    this.v.set(s.x, groundAt(s.x, s.z), s.z).project(camera);
    return [(this.v.x * 0.5 + 0.5) * innerWidth, (-this.v.y * 0.5 + 0.5) * innerHeight];
  }
  /** The view over the page as it settles (a still of the build screen): eye and aim. */
  shotOrbit(): { eye: THREE.Vector3; aim: THREE.Vector3 } {
    const o = this.orbit;
    o.yaw = o.yawT;
    o.pitch = o.pitchT;
    o.dist = o.distT;
    o.k = 1;
    const cam = new THREE.PerspectiveCamera();
    this.cameraFrame(cam, 0);
    return { eye: this.eye.clone(), aim: this.aim.clone() };
  }
  /** Choose a laid form (a still of its tools). */
  shotSelect(i: number): void {
    const f = this.forms[i];
    if (f) this.select(f, true);
  }
  /** A small sanctuary for a still, its walls meeting: a stone ring under a gold dome with a gold
      spire beside it; a stone wall and a gold wall running back to two stone walls that curve
      forward; an arch at the way in between two pillars with gold orbs over them; steps up to the
      ring; a stone orb resting low. */
  static shotLayout(): SavedForm[] {
    const line = (pts: number[][]): number[] => pts.flatMap(([x, z]) => [round(x), round(z)]);
    const arc = (cx: number, cz: number, r: number, a0: number, a1: number, n: number) =>
      Array.from({ length: n }, (_, i) => {
        const a = a0 + ((a1 - a0) * i) / (n - 1);
        return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
      });
    const W = (ink: Ink, pts: number[][], note?: number): SavedForm => ({ kind: "wall", ink, path: line(pts), x: 0, z: 0, y: 0, rot: 0, cost: 0.4, ...(note ? { note } : {}) });
    return [
      { kind: "ring", ink: "stone", r: 2.4, x: 0, z: -1.5, y: 0, rot: 0, cost: 1.2, top: "dome" },
      { kind: "spire", ink: "gold", r: 0.5, h: 6.2, x: 3.6, z: -5.2, y: 0, rot: 0, cost: 0.6, note: 1 },
      W("stone", [[-5, -4.6], [-4, -3.9], [-3, -3.1], [-2.15, -2.45]]),
      W("gold", [[2.15, -2.45], [3, -3.1], [4, -3.9], [5, -4.6]], 1),
      W("stone", arc(-1.2, -1.0, 4.0, Math.PI * 1.24, Math.PI * 0.86, 9)),
      W("stone", arc(1.2, -1.0, 4.0, -Math.PI * 0.24, Math.PI * 0.14, 9)),
      { kind: "arch", ink: "stone", w: 2.6, h: 2.6, x: 0, z: 3.6, y: 0, rot: 0, cost: 0.5 },
      { kind: "pillar", ink: "stone", r: 0.32, x: -2.9, z: 3.6, y: 0, rot: 0, cost: 0.25 },
      { kind: "pillar", ink: "stone", r: 0.32, x: 2.9, z: 3.6, y: 0, rot: 0, cost: 0.25 },
      { kind: "orb", ink: "gold", x: -2.9, z: 3.6, y: 3, rot: 0, cost: 0.05, note: 1 },
      { kind: "orb", ink: "gold", x: 2.9, z: 3.6, y: 3, rot: 0, cost: 0.05, note: 1 },
      { kind: "stairs", ink: "gold", l: 2.2, w: 1.4, h: 0.9, x: 0, z: 1.6, y: 0, rot: Math.PI, cost: 0.3, note: 1 },
      { kind: "orb", ink: "stone", x: 4.4, z: 1.6, y: 0.6, rot: 0, cost: 0.05 },
    ];
  }
}

/* A stone gathering out of a rock: fine motes drawn up out of the rock's face, a small stone
   forming where they meet in a soft light, a moment held, then it comes to the wanderer. */
class Forming {
  readonly group = new THREE.Group();
  active = false;
  readonly length = 7.2;
  private t = 0;
  private stone: THREE.Mesh;
  private shell: THREE.Mesh & { material: ReturnType<typeof glowShader<"uK">> };
  private uGlow = T.uniform(0);
  private cloud: SpriteCloud;
  private pos: Float32Array;
  private alpha: Float32Array;
  private from: Float32Array;
  private seed: Float32Array;
  private uDpr = T.uniform(1);
  private at = new THREE.Vector3();
  private chest: () => THREE.Vector3 = () => this.at;
  private done: () => void = () => {};
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();
  private static N = 140;

  constructor(material: THREE.MeshStandardNodeMaterial, private hooks: SanctuaryHooks) {
    // the stone warms from within while it forms, and cools as it comes to you
    material.emissiveNode = vec3(1, 0.7, 0.4).mul(this.uGlow.mul(0.32));
    material.maskNode = null; // the stone in the hands never thins away (the walls' see-through)
    this.stone = new THREE.Mesh(stoneBlock(0.26, 0.18, 0.26, 7), material);
    this.stone.castShadow = true;
    const shell = glowShader({ uK: 0 }, (u, uv) => {
      const c = float(1).sub(clamp(length(uv.sub(0.5)).mul(2), 0, 1));
      return vec3(1, 0.8, 0.52).mul(c.mul(c).mul(u.uK).mul(0.9));
    });
    // a round soft light, turned to the view
    this.shell = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), shell) as typeof this.shell;
    this.shell.renderOrder = 3;
    const N = Forming.N;
    const mat = softPoints();
    this.cloud = spriteCloud(N, { position: 3, aAlpha: 1 }, mat);
    this.pos = this.cloud.attrs.position.array as Float32Array;
    this.alpha = this.cloud.attrs.aAlpha.array as Float32Array;
    this.from = new Float32Array(N * 3);
    this.seed = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) this.seed[i] = Math.random();
    const { position, aAlpha } = this.cloud.nodes as Record<string, N>;
    mat.sizeNode = clamp(float(18).div(max(viewDepth(position), 0.4)), float(1).div(this.uDpr), 6);
    mat.colorNode = vec4(vec3(1, 0.86, 0.6).mul(softDot(pointR()).mul(1.3)).mul(aAlpha), 1);
    this.group.add(this.stone, this.shell, this.cloud.sprite);
    this.group.visible = false;
  }

  begin(contact: THREE.Vector3, rock: THREE.Vector3, rr: number, chest: () => THREE.Vector3, done: () => void): void {
    this.at.copy(contact);
    this.chest = chest;
    this.done = done;
    this.t = 0;
    this.active = true;
    this.group.visible = true;
    for (let i = 0; i < Forming.N; i++) {
      // out of the rock itself: points over its upper surface (a dome of its radius)
      const a = this.seed[i * 3] * Math.PI * 2, e = Math.acos(1 - this.seed[i * 3 + 1] * 0.9);
      const R = Math.max(0.35, rr * 0.85);
      this.from[i * 3] = rock.x + Math.sin(e) * Math.cos(a) * R;
      this.from[i * 3 + 1] = rock.y + Math.cos(e) * R * 0.55 + (this.seed[i * 3 + 2] - 0.5) * 0.1;
      this.from[i * 3 + 2] = rock.z + Math.sin(e) * Math.sin(a) * R;
    }
    this.hooks.bell(523.25, 0.014, 4);
  }
  seek(t: number, camera: THREE.Camera): void {
    this.t = t;
    this.update(0, 1, camera);
  }

  update(dt: number, dpr: number, camera: THREE.Camera): void {
    if (!this.active) return;
    this.uDpr.value = dpr;
    this.t += dt;
    const t = this.t;
    const C = this.v.set(this.at.x, this.at.y + 0.42, this.at.z);
    for (let i = 0; i < Forming.N; i++) {
      const s = this.seed[i * 3], s2 = this.seed[i * 3 + 1];
      const p = Math.min(1, Math.max(0, (t - s * 1.6) / (1.5 + s2 * 0.8)));
      const e = ease(p);
      const sw = Math.sin(p * Math.PI) * (0.18 + s2 * 0.2);
      const ang = s * 9 + p * 2.2;
      const fx = this.from[i * 3], fy = this.from[i * 3 + 1], fz = this.from[i * 3 + 2];
      this.pos[i * 3] = fx + (C.x - fx) * e + Math.cos(ang) * sw;
      this.pos[i * 3 + 1] = fy + (C.y - fy) * e + Math.sin(p * Math.PI) * 0.25;
      this.pos[i * 3 + 2] = fz + (C.z - fz) * e + Math.sin(ang) * sw;
      this.alpha[i] = p <= 0 || p >= 1 ? 0 : Math.min(1, p * 5) * (1 - Math.pow(p, 6)) * 0.55;
    }
    this.cloud.attrs.position.needsUpdate = true;
    this.cloud.attrs.aAlpha.needsUpdate = true;
    const grow = outCubic((t - 1.3) / 2.4);
    const glow = Math.max(0, Math.min(1, (t - 1.0) / 1.6)) * (1 - Math.max(0, Math.min(1, (t - 3.6) / 1.4)));
    const go = ease((t - 5.4) / 1.6);
    const ch = this.chest();
    const bob = Math.sin(t * 1.3) * 0.03 * (1 - go);
    this.w.set(C.x + (ch.x - C.x) * go, C.y + (ch.y - C.y) * go + Math.sin(go * Math.PI) * 0.45 + bob, C.z + (ch.z - C.z) * go);
    this.stone.position.copy(this.w);
    this.stone.scale.setScalar(Math.max(0.0001, grow * (1 - go * 0.7)));
    this.stone.rotation.set(0.12 * Math.sin(t * 0.7), t * 0.35, 0.08 * Math.cos(t * 0.6));
    this.stone.visible = grow > 0.001;
    this.shell.position.copy(this.w);
    this.shell.quaternion.copy(camera.quaternion);
    this.shell.scale.setScalar(0.6 + grow * 0.5);
    this.shell.material.uniforms.uK.value = glow;
    this.uGlow.value = glow;
    this.shell.visible = glow > 0.002;
    if (t >= this.length) {
      this.active = false;
      this.group.visible = false;
      this.hooks.sparks(this.w, 6, new THREE.Color(1, 0.85, 0.6), 0.25);
      this.done();
    }
  }
}
