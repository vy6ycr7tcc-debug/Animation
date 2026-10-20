/* The temple of the spirit: a sanctuary drawn by hand (the owner: "the player draws with their
   finger, and the world answers in geometry… calligraphy, not construction"). After Ōkami's
   celestial brush (the world hushes, the ground becomes a page, a tiny legible vocabulary,
   wobbly strokes forgiven) and Townscaper's soul (you suggest; the world completes; no goals).
   A mirror, not a reward: nothing is counted, nothing unlocks.

   - Hold on open ground: building. The sanctuary's earth shimmers faintly (an irregular,
     breathing weave, never a grid), the world hushes a little, two small glyphs choose the ink.
   - Draw on it with one finger; the stroke is a faint trail of light on the earth as you draw.
     Let go and it is read (resampled as the $1 recogniser does, then judged by its shape: how
     straight, whether it closes, how far it turns, whether it winds inward):
       a line (or any open stroke)  → a low wall along the drawn path;
       a closed loop                → a ring wall if drawn wide (≥ RING_D across), a pillar if small;
       a spiral                     → a spire, taller the wider it was drawn;
       a touch                      → an orb of light, resting in the air.
     What isn't understood sinks quietly back into the earth.
   - Shape: tap a form to choose it (a soft glow, a faint ring at its base); drag it to move it
     (weighted, unhurried); two fingers drawn up or down lift or lower it; two fingers turning
     turn it; tap it again (or the small ◌ by it) and it dissolves back into essence.
     A touch that begins off the sanctuary's earth still looks about.
   - Ink: stone-essence gathers when you sit with a rock through its meditation; gold-essence is
     forged by each note you write in your heart. A form takes essence for its size; if there is
     not enough the stroke fades unforged. A gold form keeps the heart note newest when it was
     drawn: tapped outside building, that note opens again.
   - Forms grow on the breath (the square breathing's own phases): a wall rises as an exhale, a
     ring and a pillar bloom on an inhale, a spire climbs breath by breath, an orb kindles.
   The layout is kept on this device only (localStorage): each form's resampled stroke, kind, ink
   and place; the geometry is grown again from them on load. */
import * as THREE from "three/webgpu";
import { T, fogUniforms, softPoints, spriteCloud, viewDepth, softDot, pointR, glowShader, type SpriteCloud, type N } from "../gpu/tsl";
import { landStone, stoneBlock, contactShade } from "./stoneworks";
import { solid } from "./solidity";
import { SANCTUARY } from "./terrain";
import { heartNotes, type HeartNote } from "../ui/heart";
import { readStroke, type V2 } from "./strokes";
import { Joints, type JointForm } from "./joints";

const { float, vec3, vec4, abs, max, min, smoothstep, sin, pow, dot, normalize, clamp, fract, length, mix, fwidth } = T;

/** The sanctuary's earth: a round terrace PAGE_R from its centre. */
const PAGE_R = 9;
const TOP = 0.3; // its floor above the levelled ground
const WALL_H = 1.3; // walls are low and sheltering, never a fortress
const RING_H = 1.1;
const ORB_Y = 1.6; // where an orb rests
const KEY = "inward-journey:sanctuary";
const SEED_KEY = "inward-journey:sanctuary-seed";
/** the first measure of stone: a few walls and a ring */
const SEED_STONE = 3;
/** Essence each form takes (one rock meditation, or one heart note, is 1). */
const COST = { wallPerM: 0.08, pillar: 0.25, orb: 0.05, spireBase: 0.25, spirePerM: 0.06 };

export type FormKind = "wall" | "ring" | "pillar" | "spire" | "orb";
export type Ink = "stone" | "gold";
export interface SavedForm {
  kind: FormKind;
  ink: Ink;
  /** the drawn path, resampled, relative to the form's origin: x0,z0,x1,z1… (walls) */
  path?: number[];
  closed?: boolean;
  /** a ring's, a pillar's or a spire's radius (metres) */
  r?: number;
  /** a spire's height */
  h?: number;
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
  v: 2;
  stone: number;
  goldSpent: number;
  ink: Ink;
  forms: SavedForm[];
}
interface Form {
  s: SavedForm;
  group: THREE.Group;
  body: THREE.Object3D;
  geo: THREE.BufferGeometry;
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

/** A note that forges gold: written by the person here (not the oracle's answers, not memories
    brought in from elsewhere). */
function forges(n: HeartNote): boolean {
  return !n.scene.startsWith("The oracle") && n.scene !== "Brought from elsewhere";
}

/* ---------------- growing forms ---------------- */
/** The drawn path smoothed and spaced every ~0.22 m. */
function smoothPath(path: V2[], closed: boolean): V2[] {
  const curve = new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, "centripetal");
  const n = Math.max(4, Math.ceil(curve.getLength() / 0.22));
  const pts = curve.getSpacedPoints(n).map((v) => [v.x, v.z] as V2);
  return closed ? pts.slice(0, n) : pts;
}
/** A wall along a path: battered, its top rounded, sunk a little into the earth (it sits in it,
    not on it), its open ends rounded off. */
function wallGeometry(path: V2[], closed: boolean, H: number, w: number): THREE.BufferGeometry {
  const pts = smoothPath(path, closed);
  const prof: V2[] = [[-w, -0.3], [-w, 0], [-w * 0.84, H - 0.16], [-w * 0.58, H - 0.04], [0, H], [w * 0.58, H - 0.04], [w * 0.84, H - 0.16], [w, 0], [w, -0.3]];
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
    // rounded ends on an open wall
    let k = 1;
    if (!closed) {
      const e = Math.min(along[i], total - along[i]);
      if (e < 0.45) k = Math.sqrt(Math.max(0, 1 - Math.pow(1 - e / 0.45, 2)));
    }
    for (const [px, py] of prof) {
      const hy = py > 0 ? py * (0.8 + 0.2 * k) : py;
      const kk = Math.max(k, 0.02);
      pos.push(pts[i][0] + nx * px * kk, hy, pts[i][1] + nz * px * kk);
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
function pillarGeometry(r: number): THREE.BufferGeometry {
  const H = 2.6;
  return turned([[r * 1.45, -0.3], [r * 1.45, 0.12], [r * 1.25, 0.22], [r, 0.3], [r * 0.97, H * 0.5], [r * 0.88, H - 0.32], [r * 1.05, H - 0.22], [r * 1.35, H - 0.08], [r * 1.35, H], [0.001, H]], 18, 0.025, 0);
}
function spireGeometry(r: number, H: number): THREE.BufferGeometry {
  const prof: V2[] = [[r * 1.18, -0.3], [r * 1.18, 0.1], [r, 0.22]];
  for (let k = 1; k <= 14; k++) {
    const t = k / 14;
    prof.push([r * Math.pow(1 - t, 0.9) * (1 + 0.06 * Math.sin(t * Math.PI)) + 0.012, 0.22 + (H - 0.22) * t]);
  }
  prof.push([0.001, H + 0.05]);
  // seven fluted ridges winding up it, the spiral of the hand that drew it
  return turned(prof, 28, 0.07, 1.4);
}

/** The gold of a memory: warm metal in the world's own light, its sheen drawn by hand (the game
    mirrors nothing), hammered, and now and then a slow line of light rising through it (the
    light that moves through everything). */
function goldMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0.6, roughness: 0.3 });
  const ham = T.mx_noise_float(T.positionWorld.mul(9)).mul(0.5).add(0.5);
  m.colorNode = vec3(1, 0.6, 0.17).mul(0.7).mul(float(0.88).add(ham.mul(0.24)));
  m.roughnessNode = float(0.22).add(ham.mul(0.16));
  const v = normalize(T.cameraPosition.sub(T.positionWorld));
  const r = T.reflect(v.negate(), T.normalWorld);
  const sky = mix(vec3(0.16, 0.07, 0.02), vec3(0.95, 0.66, 0.3), smoothstep(-0.35, 0.7, r.y));
  const hi = pow(max(dot(r, fogUniforms.glowDir), 0), 18).mul(0.9);
  const ndv = abs(dot(T.normalView, normalize(T.positionView.negate())));
  const fres = float(0.18).add(pow(float(1).sub(ndv), 3).mul(0.5));
  const rise = pow(fract(T.positionWorld.y.mul(0.22).sub(T.time.mul(0.045)).add(T.positionWorld.x.mul(0.013))), 30).mul(0.35);
  m.emissiveNode = sky.mul(fres.mul(0.55)).add(vec3(1, 0.85, 0.6).mul(hi)).add(vec3(1, 0.62, 0.24).mul(rise.add(0.035)));
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
  set(pts: V2[], y: number, closed = false): void {
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
      this.pos[o] = c[0] - tz * this.w;
      this.pos[o + 1] = y;
      this.pos[o + 2] = c[1] + tx * this.w;
      this.pos[o + 3] = c[0] + tz * this.w;
      this.pos[o + 4] = y;
      this.pos[o + 5] = c[1] - tx * this.w;
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

export class Sanctuary {
  readonly group = new THREE.Group();
  /** the terrace and everything on it, in the sanctuary's own frame (faces the temple) */
  readonly root = new THREE.Group();
  building = false;
  /** where building was begun: at the sanctuary (its earth is a page) or out in the world */
  home = false;
  /** 0..1: how hushed the world is (building: a little; the brush down: a little more) */
  hush = 0;
  ink: Ink = "stone";
  onHome: () => void = () => {};
  private stone = 0;
  private goldSpent = 0;
  private forms: Form[] = [];
  private persist: boolean;
  private notes: HeartNote[] = [];
  private mats: { stone: THREE.Material; gold: THREE.Material; aura: THREE.Material; orbCore: Record<Ink, THREE.Material>; orbHalo: Record<Ink, Halo> };
  private page: THREE.Mesh & { material: Halo };
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
  private aura: THREE.Mesh | null = null;
  // the touch drawing, or shaping a form (and a second finger lifting and turning it)
  private draw: { id: number; ground: V2[]; sx: number; sy: number; screen: number; ink: Ink } | null = null;
  private shape: { id: number; form: Form; was: boolean; moved: boolean; sx: number; sy: number; off: V2 } | null = null;
  private second: { id: number; x: number; y: number; lift0: number; rot0: number; mid0: number; ang0: number } | null = null;
  private firstAt = { x: 0, y: 0 };
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private inv = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private d = new THREE.Vector3();
  private hits: THREE.Intersection[] = [];
  private ui: HTMLElement;
  private letGo: HTMLButtonElement;
  private peekT = 0;
  private gold = -1;
  private forming: Forming;
  private camera: THREE.Camera | null = null;

  constructor(private hooks: SanctuaryHooks, opts: { persist?: boolean } = {}) {
    this.persist = opts.persist !== false;
    const S = SANCTUARY;
    this.root.position.set(S.x, S.y + TOP, S.z);
    this.root.rotation.y = S.face;
    this.group.add(this.root);

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
    const stone = landStone("sandstone_cracks", S.y, 1.6, [0.95, 0.9, 0.84], { course: 0.32, block: 0.66 });
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
    this.mats = { stone, gold: goldMaterial(), aura, orbCore: { stone: core(STONE_LIGHT), gold: core(GOLD_LIGHT) }, orbHalo: { stone: halo(STONE_LIGHT), gold: halo(GOLD_LIGHT) } };

    // the page: an irregular weave (Townscaper's skewed quads, never graph paper) breathing on
    // the earth, faint
    const pm = glowShader({ uK: 0, uT: 0 }, (u, uv) => {
      const q0 = uv.sub(0.5).mul(PAGE_R * 2);
      const q = q0.div(1.35);
      const w = T.vec2(sin(q.y.mul(0.63).add(1.3)).add(sin(q.x.mul(0.31).add(q.y.mul(0.17)))), sin(q.x.mul(0.57).add(0.4)).add(sin(q.y.mul(0.29).sub(q.x.mul(0.21))))).mul(0.22);
      const g = q.add(w);
      const f = fract(g);
      const d = min(min(f.x, float(1).sub(f.x)), min(f.y, float(1).sub(f.y)));
      const aa = fwidth(g.x).add(fwidth(g.y)).mul(0.55).add(0.004);
      const line = smoothstep(aa.mul(1.1), float(0), d).mul(smoothstep(0.3, 0.05, aa));
      const r = length(q0).div(PAGE_R);
      const edge = smoothstep(1.0, 0.82, r);
      const breath = sin(u.uT.mul(0.39).sub(r.mul(2.2))).mul(0.5).add(0.5);
      return vec3(1, 0.8, 0.5).mul(line.mul(edge).mul(u.uK).mul(float(0.035).add(breath.mul(0.05))));
    });
    this.page = new THREE.Mesh(new THREE.PlaneGeometry(PAGE_R * 2, PAGE_R * 2), pm) as typeof this.page;
    this.page.rotation.x = -Math.PI / 2;
    this.page.position.y = 0.012;
    this.page.renderOrder = 3;
    this.page.visible = false;
    this.trail = new Ribbon(512, 0.05, new THREE.Color(1, 0.86, 0.6), true);
    this.trail.mesh.position.y = 0.02;
    this.trail.mesh.visible = false;
    this.base = new Ribbon(130, 0.07, new THREE.Color(1, 0.82, 0.5));
    this.base.mesh.visible = false;
    this.seam = new Ribbon(130, 0.05, new THREE.Color(1, 0.84, 0.56));
    this.seam.mesh.visible = false;
    this.root.add(this.page, this.trail.mesh, this.base.mesh, this.seam.mesh);

    this.joints = new Joints(stone, this.mats.gold);
    this.root.add(this.joints.group);
    this.forming = new Forming(landStone("sandstone_cracks", S.y, 1.6, [0.94, 0.89, 0.83]), hooks);
    this.group.add(this.forming.group);
    [this.ui, this.letGo] = this.buildUi();
    this.load();
    this.joints.set(this.jointForms(), true);
    this.refreshNotes();
    addEventListener("heart-changed", () => this.refreshNotes());
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
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
      if (v && v.v === 2 && Array.isArray(v.forms)) {
        this.stone = Math.max(0, Number(v.stone) || 0);
        this.goldSpent = Math.max(0, Number(v.goldSpent) || 0);
        this.ink = v.ink === "gold" ? "gold" : "stone";
        for (const s of v.forms) if (s && ["wall", "ring", "pillar", "spire", "orb"].includes(s.kind) && Number.isFinite(s.x) && Number.isFinite(s.z)) this.addForm(s, true);
      }
    } catch {
      /* nothing kept yet, or the device won't keep it */
    }
    if (seed) {
      this.stone += SEED_STONE;
      this.save();
    }
  }
  private save(): void {
    if (!this.persist) return;
    try {
      const out: Saved = {
        v: 2,
        stone: round(this.stone),
        goldSpent: round(this.goldSpent),
        ink: this.ink,
        forms: this.forms.filter((f) => f.out === undefined).map((f) => ({ ...f.s, x: round(f.s.x), z: round(f.s.z), y: round(f.s.y), rot: round(f.s.rot) })),
      };
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch {
      /* full or refused: the forms still stand for this visit */
    }
  }
  /** The heart's notes changed: the gold follows them. */
  refreshNotes(): void {
    if (!this.persist) return;
    this.notes = heartNotes().filter(forges);
    const before = this.gold;
    this.gold = this.have("gold");
    this.drawUi();
    if (before >= 0 && this.gold > before + 1e-6) this.peek();
  }
  private have(ink: Ink): number {
    return ink === "stone" ? this.stone : Math.max(0, this.notes.length - this.goldSpent);
  }
  private spend(ink: Ink, c: number): void {
    if (ink === "stone") this.stone = Math.max(0, this.stone - c);
    else this.goldSpent += c;
    this.gold = this.have("gold");
  }
  private refund(ink: Ink, c: number): void {
    if (ink === "stone") this.stone += c;
    else this.goldSpent = Math.max(0, this.goldSpent - c);
    this.gold = this.have("gold");
  }
  /** A rock meditation completed: a measure of stone-essence. */
  addStone(n = 1): void {
    this.stone += n;
    this.save();
    this.drawUi();
    this.peek();
  }

  /* ---------------- the two glyphs ---------------- */
  private buildUi(): [HTMLElement, HTMLButtonElement] {
    const el = document.createElement("div");
    el.id = "essence";
    el.hidden = true;
    el.innerHTML = `
      <button class="ink stone" type="button" aria-label="Stone"><i></i></button>
      <button class="ink gold" type="button" aria-label="Gold, from your heart's notes"><i></i></button>
      <button class="home" type="button" aria-label="To your sanctuary" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 L12 4 L20 11 M6.5 9.5 V19 H17.5 V9.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="14.5" r="1.6" fill="currentColor"/></svg></button>`;
    document.body.appendChild(el);
    const tap = (b: HTMLElement, f: () => void) => {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        f();
      });
      b.addEventListener("click", (e) => e.preventDefault());
    };
    tap(el.querySelector(".ink.stone")!, () => this.choose("stone"));
    tap(el.querySelector(".ink.gold")!, () => this.choose("gold"));
    tap(el.querySelector(".home")!, () => {
      this.close();
      this.onHome();
    });
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    const lg = document.createElement("button");
    lg.id = "let-go";
    lg.type = "button";
    lg.hidden = true;
    lg.setAttribute("aria-label", "Let it go");
    tap(lg, () => this.selected && this.release(this.selected));
    document.body.appendChild(lg);
    return [el, lg];
  }
  private choose(ink: Ink): void {
    this.ink = ink;
    this.hooks.bell(ink === "gold" ? 523.25 : 392, 0.014, 1.8);
    this.drawUi();
    this.save();
  }
  private drawUi(): void {
    // how much there is, as light in each glyph (never a number): fuller as it gathers
    for (const ink of ["stone", "gold"] as const) {
      const b = this.ui.querySelector(`.ink.${ink}`) as HTMLElement;
      b.style.setProperty("--f", Math.min(1, this.have(ink) / 2.5).toFixed(3));
      b.classList.toggle("on", this.ink === ink);
      b.classList.toggle("empty", this.have(ink) < 0.04);
    }
    (this.ui.querySelector(".home") as HTMLElement).hidden = !this.building || this.home;
  }
  private peek(): void {
    if (this.building) return;
    this.ui.hidden = false;
    this.ui.classList.add("peek");
    this.peekT = 3.2;
  }

  /* ---------------- building ---------------- */
  open(near: boolean): void {
    this.building = true;
    this.home = near;
    this.peekT = 0;
    this.ui.hidden = false;
    this.ui.classList.remove("peek");
    this.ui.classList.add("open");
    document.body.classList.add("building");
    this.refreshNotes();
    this.drawUi();
    this.hooks.bell(near ? 440 : 392, 0.016, 2.2);
  }
  close(): void {
    if (!this.building) return;
    this.building = false;
    this.select(null);
    if (this.draw) this.cancelStroke();
    this.shape = null;
    this.second = null;
    this.ui.classList.remove("open");
    this.ui.hidden = true;
    document.body.classList.remove("building");
  }
  distance(p: THREE.Vector3): number {
    return Math.hypot(p.x - SANCTUARY.x, p.z - SANCTUARY.z);
  }
  get centre(): { x: number; y: number; z: number; face: number } {
    return { x: SANCTUARY.x, y: SANCTUARY.y + TOP, z: SANCTUARY.z, face: SANCTUARY.face };
  }

  private rayAt(x: number, y: number): void {
    this.ray.setFromCamera(this.ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), this.camera!);
  }
  /** Where a screen point meets the sanctuary's earth (its own frame); null off it (or, with
      `hold`, held to its edge). */
  private pageAt(x: number, y: number, hold = false): V2 | null {
    if (!this.camera) return null;
    this.rayAt(x, y);
    this.root.updateMatrixWorld();
    this.inv.copy(this.root.matrixWorld).invert();
    const o = this.v.copy(this.ray.ray.origin).applyMatrix4(this.inv);
    const d = this.d.copy(this.ray.ray.direction).transformDirection(this.inv);
    if (d.y > -1e-3 || o.y <= 0) return null;
    const s = -o.y / d.y;
    let lx = o.x + d.x * s, lz = o.z + d.z * s;
    const r = Math.hypot(lx, lz), lim = PAGE_R - 0.3;
    if (r > lim) {
      if (!hold || r > PAGE_R * 3) return null;
      lx *= lim / r;
      lz *= lim / r;
    }
    return [lx, lz];
  }
  /** The form under a screen point. */
  private formAt(x: number, y: number, gold = false): Form | null {
    if (!this.camera) return null;
    this.rayAt(x, y);
    this.hits.length = 0;
    for (const f of this.forms) if (f.out === undefined && (!gold || f.s.ink === "gold")) this.ray.intersectObject(f.body, true, this.hits);
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

  /** For Input.capture: a touch that begins on a form, or on the sanctuary's earth, is building's.
      Anywhere else it is the view's, as ever. */
  readonly capture = {
    down: (e: PointerEvent): boolean => {
      if (!this.building || !this.home) return false;
      // a second finger while one holds a chosen form: lift and turn
      if (this.shape && !this.second) {
        this.second = { id: e.pointerId, x: e.clientX, y: e.clientY, lift0: this.shape.form.s.y, rot0: this.shape.form.s.rot, mid0: (this.firstAt.y + e.clientY) / 2, ang0: Math.atan2(e.clientY - this.firstAt.y, e.clientX - this.firstAt.x) };
        this.shape.moved = true; // it is being shaped, not tapped
        return true;
      }
      if (this.shape) return false;
      if (this.draw) {
        // a second finger while drawing: the stroke is let go (a pinch is not a brush)
        this.cancelStroke();
        return false;
      }
      const f = this.formAt(e.clientX, e.clientY);
      if (f) {
        const was = this.selected === f;
        this.select(f);
        const at = this.pageAt(e.clientX, e.clientY, true) ?? [f.s.x, f.s.z];
        this.shape = { id: e.pointerId, form: f, was, moved: false, sx: e.clientX, sy: e.clientY, off: [f.s.x - at[0], f.s.z - at[1]] };
        this.firstAt = { x: e.clientX, y: e.clientY };
        return true;
      }
      const p = this.pageAt(e.clientX, e.clientY);
      if (!p) return false;
      // a touch on the earth: the brush
      this.draw = { id: e.pointerId, ground: [p], sx: e.clientX, sy: e.clientY, screen: 0, ink: this.ink };
      this.trailFade = 0;
      this.trail.k.value = 0.9;
      this.trail.mesh.visible = true;
      this.trail.set([p], 0);
      return true;
    },
    move: (e: PointerEvent): void => {
      if (this.draw && e.pointerId === this.draw.id) {
        const d = this.draw;
        d.screen += Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
        d.sx = e.clientX;
        d.sy = e.clientY;
        const p = this.pageAt(e.clientX, e.clientY, true);
        const last = d.ground[d.ground.length - 1];
        if (p && Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.06 && d.ground.length < 500) {
          d.ground.push(p);
          this.trail.set(d.ground, 0);
        }
        return;
      }
      if (this.second && e.pointerId === this.second.id) {
        this.second.x = e.clientX;
        this.second.y = e.clientY;
        this.twoFinger();
        return;
      }
      if (this.shape && e.pointerId === this.shape.id) {
        this.firstAt = { x: e.clientX, y: e.clientY };
        if (this.second) return this.twoFinger();
        if (Math.hypot(e.clientX - this.shape.sx, e.clientY - this.shape.sy) > 9) this.shape.moved = true;
        if (!this.shape.moved) return;
        const p = this.pageAt(e.clientX, e.clientY, true);
        if (p) {
          // where the finger is, kept on the earth; the form follows there, unhurried (update)
          let x = p[0] + this.shape.off[0], z = p[1] + this.shape.off[1];
          const r = Math.hypot(x, z), lim = PAGE_R - 0.6;
          if (r > lim) {
            x *= lim / r;
            z *= lim / r;
          }
          this.shape.form.to.set(x, z);
        }
      }
    },
    up: (e: PointerEvent): void => {
      if (this.draw && e.pointerId === this.draw.id) {
        const d = this.draw;
        this.draw = null;
        this.finishStroke(d.ground, d.screen, d.ink);
        return;
      }
      if (this.second && e.pointerId === this.second.id) {
        this.second = null;
        this.jointsDirty = true;
        this.save();
        return;
      }
      if (this.shape && e.pointerId === this.shape.id) {
        const s = this.shape;
        this.shape = null;
        this.second = null;
        // a tap on a form: the first chooses it; on the chosen one, it is let go
        if (!s.moved) {
          if (s.was) this.release(s.form);
        } else {
          this.jointsDirty = true;
          this.save();
        }
      }
    },
  };
  private twoFinger(): void {
    const s = this.second, sh = this.shape;
    if (!s || !sh) return;
    const f = sh.form;
    const my = (this.firstAt.y + s.y) / 2;
    const ang = Math.atan2(s.y - this.firstAt.y, s.x - this.firstAt.x);
    // drawn up lifts, down lowers (orbs may dream higher)
    const orb = f.s.kind === "orb";
    f.s.y = Math.min(orb ? 9 : 6, Math.max(orb ? -1.2 : 0, s.lift0 + (s.mid0 - my) * 0.012));
    const da = ang - s.ang0;
    f.s.rot = s.rot0 - Math.atan2(Math.sin(da), Math.cos(da));
  }

  private cancelStroke(): void {
    this.draw = null;
    this.trailFade = 1.6;
  }
  /** A stroke let go: read it, and grow what it is, or let it sink back into the earth. */
  private finishStroke(ground: V2[], screen: number, ink: Ink): void {
    // a tap on the earth while a form is chosen only lets the choice go
    if (screen < 16 && this.selected) {
      this.select(null);
      this.trail.mesh.visible = false;
      return;
    }
    const r = readStroke(ground, screen);
    let s: SavedForm | null = null;
    if (r?.kind === "dot") {
      const [x, z] = ground[ground.length - 1];
      s = { kind: "orb", ink, x, z, y: 0, rot: 0, cost: COST.orb };
    } else if (r?.kind === "wall") {
      let cx = 0, cz = 0;
      for (const [x, z] of r.path) {
        cx += x / r.path.length;
        cz += z / r.path.length;
      }
      const path = r.path.filter((_, i) => i % 2 === 0 || i === r.path.length - 1).flatMap(([x, z]) => [round(x - cx), round(z - cz)]);
      s = { kind: "wall", ink, path, closed: r.closed, x: cx, z: cz, y: 0, rot: 0, cost: Math.max(0.05, r.length * COST.wallPerM) };
    } else if (r?.kind === "ring") {
      s = { kind: "ring", ink, r: round(r.r), x: r.c[0], z: r.c[1], y: 0, rot: 0, cost: Math.PI * 2 * r.r * COST.wallPerM };
    } else if (r?.kind === "pillar") {
      s = { kind: "pillar", ink, r: round(Math.min(0.42, Math.max(0.2, r.r * 0.35))), x: r.c[0], z: r.c[1], y: 0, rot: 0, cost: COST.pillar };
    } else if (r?.kind === "spire") {
      const h = Math.min(9, Math.max(3, 2.4 + r.r * 2.6));
      s = { kind: "spire", ink, r: round(Math.min(1.1, Math.max(0.3, r.r * 0.42))), h: round(h), x: r.c[0], z: r.c[1], y: 0, rot: 0, cost: COST.spireBase + h * COST.spirePerM };
    }
    if (!s || s.cost > this.have(ink) + 1e-6) {
      // not understood, or not enough essence: the stroke sinks back, unforged, with a quiet word
      // of what would take form (the owner: "it's not clear")
      this.trailFade = 1.6;
      this.hooks.bell(220, 0.008, 2.2);
      if (!s) this.hooks.say("Draw one clear shape: a line raises a wall, a circle a ring, a spiral a spire, a touch an orb.");
      else if (ink === "stone") this.hooks.say(this.have("gold") >= s.cost ? "Not enough stone for that. Tap the gold to build with your heart's notes, or draw smaller." : "Not enough stone for that. Sit with a rock until its meditation ends to gather more, or draw smaller.");
      else this.hooks.say(this.have("stone") >= s.cost ? "Not enough gold for that. Tap the stone to build with it, or draw smaller." : "Not enough gold for that. Each note you write in your heart gives a little.");
      return;
    }
    if (ink === "gold") {
      let n: number | undefined;
      for (const m of this.notes) if (n === undefined || m.createdAt > n) n = m.createdAt;
      if (n !== undefined) s.note = n;
    }
    s.cost = round(s.cost);
    this.spend(ink, s.cost);
    this.trail.mesh.visible = false;
    const f = this.addForm(s, false);
    this.select(null);
    this.hooks.bell(s.kind === "orb" ? 659.25 : ink === "gold" ? 523.25 : 293.66, 0.02, 3.4);
    this.v.set(f.s.x, 0.3, f.s.z);
    this.root.localToWorld(this.v);
    this.hooks.sparks(this.v, 8, ink === "gold" ? GOLD_LIGHT : STONE_LIGHT, 0.8);
    this.save();
    this.drawUi();
  }

  private addForm(s: SavedForm, settled: boolean): Form {
    const group = new THREE.Group();
    let geo: THREE.BufferGeometry;
    let body: THREE.Object3D;
    let line: V2[] = [[0, 0]], half = 0.3, H = 0;
    if (s.kind === "orb") {
      geo = new THREE.SphereGeometry(0.2, 24, 16);
      const g = new THREE.Group();
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), this.mats.orbHalo[s.ink]);
      halo.renderOrder = 3;
      g.add(new THREE.Mesh(geo, this.mats.orbCore[s.ink]), halo);
      g.position.y = ORB_Y;
      body = g;
    } else {
      if (s.kind === "wall") {
        const p: V2[] = [];
        for (let i = 0; i + 1 < (s.path?.length ?? 0); i += 2) p.push([s.path![i], s.path![i + 1]]);
        const path: V2[] = p.length > 1 ? p : [[0, 0], [0.5, 0]];
        geo = wallGeometry(path, !!s.closed, WALL_H, 0.24);
        line = smoothPath(path, !!s.closed);
        half = 0.24;
        H = WALL_H;
      } else if (s.kind === "ring") {
        const R = s.r ?? 1.5, n = Math.max(18, Math.round(R * 10));
        line = Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * R, Math.sin((i / n) * Math.PI * 2) * R] as V2);
        geo = wallGeometry(line, true, RING_H, 0.22);
        half = 0.22;
        H = RING_H;
      } else if (s.kind === "pillar") {
        geo = pillarGeometry(s.r ?? 0.3);
        half = (s.r ?? 0.3) * 1.2;
        H = 2.6;
      } else {
        geo = spireGeometry(s.r ?? 0.6, s.h ?? 5);
        half = (s.r ?? 0.6) * 1.05;
        H = s.h ?? 5;
      }
      const m = new THREE.Mesh(geo, s.ink === "gold" ? this.mats.gold : this.mats.stone);
      m.castShadow = m.receiveShadow = true;
      body = m;
    }
    group.add(body);
    // its soft footprint: a feathered shade along a wall, a round one under a pillar or spire
    let shade: THREE.Mesh, shadeK: { value: number } | null = null;
    if (s.kind === "wall" || s.kind === "ring") {
      const rb = new Ribbon(line.length + 2, 0.62, new THREE.Color(), false, true);
      rb.set(line, 0, s.kind === "ring" || !!s.closed);
      shade = rb.mesh;
      shadeK = rb.k;
    } else {
      shade = contactShade({ r: s.kind === "orb" ? 0.01 : half * 1.05 }, s.kind === "spire" ? 1.1 : 0.8, 0.5);
      shade.visible = s.kind !== "orb";
    }
    shade.position.y = 0.012;
    group.add(shade);
    group.position.set(s.x, s.y, s.z);
    group.rotation.y = s.rot;
    this.root.add(group);
    const f: Form = { s, group, body, geo, age: settled ? 999 : 0, grow: settled ? 1 : 0, to: new THREE.Vector2(s.x, s.z), lift: s.y, line, half, H, shade, shadeK };
    body.userData.form = f;
    this.forms.push(f);
    if (!settled && s.kind !== "orb") this.seamFor(f);
    this.pose(f);
    return f;
  }

  /** The settled forms on the earth, in the sanctuary's frame, for their meeting places. */
  private jointForms(): JointForm[] {
    const out: JointForm[] = [];
    for (const f of this.forms) {
      const s = f.s;
      if (s.kind === "orb" || f.out !== undefined || f.grow < 1 || s.y > 0.35) continue;
      const c = Math.cos(s.rot), sn = Math.sin(s.rot);
      const line = f.line.map(([x, z]) => [x * c + z * sn + s.x, -x * sn + z * c + s.z] as V2);
      out.push({ kind: s.kind, ink: s.ink, line, half: f.half, open: s.kind === "wall" && !s.closed, H: f.H });
    }
    return out;
  }

  /** How far grown a form is at `age` seconds, on the breath: a wall rises over one exhale, a ring
      or a pillar blooms over one inhale, an orb kindles over one, and a spire climbs on each
      inhale and exhale and is still through the holds, until it has climbed three. */
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
    if (f.s.kind !== "orb") {
      // the shade stays on the earth as the form is lifted, and fades with the height
      const out0 = f.out !== undefined ? ease(f.out / 2.2) : 0;
      const kk = f.grow * (1 - out0) * Math.max(0, 1 - f.lift / 0.8);
      f.shade.position.y = 0.012 - f.lift;
      f.shade.visible = kk > 0.01;
      if (f.shadeK) f.shadeK.value = kk;
      else f.shade.scale.setScalar(Math.max(0.001, kk));
    }
    const out = f.out !== undefined ? ease(f.out / 2.2) : 0;
    const k = f.grow * (1 - out);
    if (f.s.kind === "orb") f.body.scale.setScalar(Math.max(0.0001, k));
    else {
      // it rises out of the earth (and sinks back into it when let go)
      const h = f.s.kind === "spire" ? (f.s.h ?? 5) + 0.3 : f.s.kind === "pillar" ? 2.9 : (f.s.kind === "ring" ? RING_H : WALL_H) + 0.3;
      f.body.position.y = -h * (1 - k);
      f.body.visible = k > 0.002;
    }
  }

  private select(f: Form | null): void {
    if (this.selected === f) return;
    if (this.aura) {
      this.aura.parent?.remove(this.aura);
      this.aura = null;
    }
    this.selected = f;
    if (!f) return;
    this.hooks.bell(587.33, 0.012, 2);
    // a soft glow over it, and a faint ring at its base
    if (f.s.kind !== "orb") {
      this.aura = new THREE.Mesh(f.geo, this.mats.aura);
      this.aura.renderOrder = 4;
      this.aura.scale.setScalar(1.025);
      f.body.add(this.aura);
    }
    this.footprint(f);
  }
  private footprint(f: Form): void {
    this.base.set(this.outline(f, 0.6), 0, true);
  }
  /** A form's outline on the earth, `off` metres out from it. */
  private outline(f: Form, off: number): V2[] {
    const s = f.s;
    const pts: V2[] = [];
    if (s.kind === "wall" && s.path && s.path.length > 3) {
      const p: V2[] = [];
      for (let i = 0; i + 1 < s.path.length; i += 2) p.push([s.path[i], s.path[i + 1]]);
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
    } else {
      const R = s.kind === "ring" ? (s.r ?? 1.5) + off - 0.05 : s.kind === "spire" ? (s.r ?? 0.6) * 1.2 + off - 0.1 : s.kind === "pillar" ? (s.r ?? 0.3) * 1.45 + off - 0.15 : off;
      for (let i = 0; i < 64; i++) pts.push([Math.cos((i / 64) * Math.PI * 2) * R, Math.sin((i / 64) * Math.PI * 2) * R]);
    }
    return pts.slice(0, 128);
  }
  private seamFor(f: Form): void {
    this.seamOf = f;
    this.seam.set(this.outline(f, f.s.kind === "wall" ? 0.27 : 0.08), 0, true);
  }
  /** Let a form go: it sinks back into the earth and its essence returns. */
  private release(f: Form): void {
    if (f.out !== undefined) return;
    f.out = 0;
    this.jointsDirty = true;
    if (f.s.kind !== "orb") this.seamFor(f);
    this.select(null);
    this.refund(f.s.ink, f.s.cost);
    this.v.set(f.s.x, 0.5 + f.s.y, f.s.z);
    this.root.localToWorld(this.v);
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

  update(dt: number, t: number, dpr: number, near: boolean, camera: THREE.Camera): void {
    this.camera = camera;
    const hushTo = this.building && this.home ? (this.draw ? 1 : 0.55) : 0;
    this.hush += (hushTo - this.hush) * Math.min(1, dt * 1.6);
    const pu = this.page.material.uniforms;
    pu.uK.value += ((this.building && this.home ? 1 : 0) - pu.uK.value) * Math.min(1, dt * 1.2);
    pu.uT.value = t;
    this.page.visible = pu.uK.value > 0.004;
    this.mats.orbHalo.stone.uniforms.uT.value = t;
    this.mats.orbHalo.gold.uniforms.uT.value = t;
    if (this.peekT > 0) {
      this.peekT -= dt;
      if (this.peekT <= 0 && !this.building) {
        this.ui.classList.remove("peek");
        this.ui.hidden = true;
      }
    }
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
      if (f) {
        this.seam.mesh.position.set(f.group.position.x, 0.015, f.group.position.z);
        this.seam.mesh.rotation.y = f.group.rotation.y;
      }
      if (f && k <= 0.01 && (f.grow >= 1 || (f.out ?? 0) > 2.2)) this.seamOf = null;
    }
    this.forming.update(dt, dpr, camera);
    // the meeting places, once the forms are still (not while one is being carried)
    if (this.jointsDirty && !this.shape && !this.second) {
      this.jointsDirty = false;
      this.joints.set(this.jointForms());
    }
    this.joints.update(dt);
    this.root.visible = near;
    if (!near) return;
    let gone = false;
    const k = Math.min(1, dt * 3.2); // weighted, unhurried
    for (const f of this.forms) {
      if (f.out !== undefined) {
        f.out += dt;
        if (f.out > 2.3) gone = true;
      } else if (f.grow < 1 && !this.held) {
        f.age += dt;
        f.grow = this.growth(f.s.kind, f.age);
        if (f.grow >= 1) this.jointsDirty = true; // grown: the world completes what it meets
      }
      if (this.shape?.form === f && this.shape.moved && !this.second) {
        f.s.x += (f.to.x - f.s.x) * k;
        f.s.z += (f.to.y - f.s.z) * k;
      }
      f.lift += (f.s.y - f.lift) * k;
      f.group.position.set(f.s.x, f.lift + (f.s.kind === "orb" ? Math.sin(t * 0.6 + f.s.x * 3) * 0.06 : 0), f.s.z);
      f.group.rotation.y += (f.s.rot - f.group.rotation.y) * k;
      if (f.s.kind === "orb") {
        // the halo turned to the view
        f.group.updateMatrixWorld();
        f.body.getWorldQuaternion(this.q).invert().multiply(camera.quaternion);
        f.body.children[1].quaternion.copy(this.q);
      }
      this.pose(f);
    }
    if (this.selected) {
      const f = this.selected;
      this.base.mesh.position.set(f.group.position.x, 0.02, f.group.position.z);
      this.base.mesh.rotation.y = f.group.rotation.y;
      // the small ◌ by its base, where it can be seen
      this.v.set(f.group.position.x, f.lift + 0.1, f.group.position.z);
      this.root.localToWorld(this.v).project(camera);
      const sx = (this.v.x * 0.5 + 0.5) * innerWidth, sy = (-this.v.y * 0.5 + 0.5) * innerHeight;
      const show = this.building && this.v.z < 1 && sx > 20 && sx < innerWidth - 60 && sy > 20 && sy < innerHeight - 110;
      this.letGo.hidden = !show;
      if (show) this.letGo.style.transform = `translate(${Math.round(sx + 26)}px, ${Math.round(sy + 6)}px)`;
    } else this.letGo.hidden = true;
    if (gone) {
      for (const f of this.forms)
        if (f.out !== undefined && f.out > 2.3) {
          this.root.remove(f.group);
          f.geo.dispose();
          f.shade.geometry.dispose();
          if (f.s.kind === "orb") (f.body.children[1] as THREE.Mesh).geometry.dispose();
        }
      this.forms = this.forms.filter((f) => !(f.out !== undefined && f.out > 2.3));
    }
  }

  /* ---------------- for still frames ---------------- */
  /** Lay forms without touching what is kept on the device (`grown` holds them part-risen). */
  shotForms(list: SavedForm[], grown = 1): void {
    for (const f of this.forms) this.root.remove(f.group);
    this.forms = [];
    this.held = grown < 1;
    for (const s of list) {
      const f = this.addForm(s, true);
      f.grow = grown;
      f.age = grown < 1 ? 0 : 999;
      if (grown < 1 && s.kind !== "orb") this.seamFor(f);
      this.pose(f);
    }
    this.joints.set(this.jointForms(), true);
  }
  /** Building held open with a stroke mid-draw (the trail of light on the earth). */
  shotTrail(pts: V2[]): void {
    this.trail.mesh.visible = true;
    this.trail.k.value = 0.9;
    this.trail.set(pts, 0);
    this.draw = { id: -1, ground: pts, sx: 0, sy: 0, screen: 999, ink: this.ink };
  }
  /** The tip of the stroke being drawn, on the screen (for a still's fingertip). */
  screenOf(p: V2, camera: THREE.Camera): [number, number] {
    this.v.set(p[0], 0, p[1]);
    this.root.updateMatrixWorld();
    this.root.localToWorld(this.v).project(camera);
    return [(this.v.x * 0.5 + 0.5) * innerWidth, (-this.v.y * 0.5 + 0.5) * innerHeight];
  }
  /** A small sanctuary for a still, its walls meeting: a stone ring with a gold spire at its
      heart; a stone wall and a gold wall running back from it to two stone walls that curve
      forward (stone meets stone, gold meets stone); two pillars at the way in with gold orbs
      over them; a gold threshold; a stone orb resting low. */
  static shotLayout(): SavedForm[] {
    const line = (pts: number[][]): number[] => pts.flatMap(([x, z]) => [round(x), round(z)]);
    const arc = (cx: number, cz: number, r: number, a0: number, a1: number, n: number) =>
      Array.from({ length: n }, (_, i) => {
        const a = a0 + ((a1 - a0) * i) / (n - 1);
        return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
      });
    const W = (ink: Ink, pts: number[][], note?: number): SavedForm => ({ kind: "wall", ink, path: line(pts), x: 0, z: 0, y: 0, rot: 0, cost: 0.4, ...(note ? { note } : {}) });
    return [
      { kind: "ring", ink: "stone", r: 2.4, x: 0, z: -1.5, y: 0, rot: 0, cost: 1.2 },
      { kind: "spire", ink: "gold", r: 0.55, h: 6.2, x: 0, z: -1.5, y: 0, rot: 0, cost: 0.6, note: 1 },
      W("stone", [[-5, -4.6], [-4, -3.9], [-3, -3.1], [-2.15, -2.45]]),
      W("gold", [[2.15, -2.45], [3, -3.1], [4, -3.9], [5, -4.6]], 1),
      W("stone", arc(-1.2, -1.0, 4.0, Math.PI * 1.24, Math.PI * 0.86, 9)),
      W("stone", arc(1.2, -1.0, 4.0, -Math.PI * 0.24, Math.PI * 0.14, 9)),
      { kind: "pillar", ink: "stone", r: 0.32, x: -2.1, z: 3.6, y: 0, rot: 0, cost: 0.25 },
      { kind: "pillar", ink: "stone", r: 0.32, x: 2.1, z: 3.6, y: 0, rot: 0, cost: 0.25 },
      { kind: "orb", ink: "gold", x: -2.1, z: 3.6, y: 1.5, rot: 0, cost: 0.05, note: 1 },
      { kind: "orb", ink: "gold", x: 2.1, z: 3.6, y: 1.5, rot: 0, cost: 0.05, note: 1 },
      { kind: "orb", ink: "stone", x: 4.4, z: 1.6, y: 0.6, rot: 0, cost: 0.05 },
      W("gold", [[-1.0, 5.6], [-0.35, 5.72], [0.35, 5.72], [1.0, 5.6]], 1),
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
