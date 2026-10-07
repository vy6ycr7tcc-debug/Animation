/* What the drowned cities of the ancient tellings share (world/ancient): their stone, the light
   that comes down to them, their keepers, and the fish that live about them.
   - Stone: the temple's photo-scanned sandstone laid from three sides, its relief and occlusion,
     then what the sea has done (silt on every upward face, soft growth, stains), and the light
     from the surface playing over it as caustics (slow, faint, only on what faces up). Carved
     faces read their carving from a canvas (cut dark, lip pale) and can warm with a little gold
     when you come near (the Maya stelae).
   - Shafts: soft volumes of light from the surface to the floor, breathing slowly, melting near
     the lens and out of the line between the camera and the wanderer.
   - Keepers: ambient presences in the temple archetypes' idiom (world/figures.ts: thousands of
     points of light skinned to the wanderer's skeleton, moved by its recorded clips). They never
     come toward you; near, they turn their head to you. No words, no prompts, never solid.
   - Swimmers: the world's own fish and mantas (Quaternius's Animated Fish Pack, CC0), in the same
     glass light, on loops about a city (round it, never through it). */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadBytes } from "../../core/assets";
import { outOfTheWay, T, type N } from "../../gpu/tsl";
import { lightBodyMaterial, tickLightBody } from "../../player/lightBody";
import { loadBeingModel, type BeingModel } from "../beings";
import { Figure, figureBind } from "../figures";
import { scan, type ScanName } from "../temple";
import { landStone, type Masonry } from "../stoneworks";
import { surface } from "../textures";
import { colliders, heightAt, WATER_Y, type Collider } from "../terrain";

const { abs, cameraPosition, float, length, max, mix, positionWorld, pow, sin, smoothstep, uv, vec2, vec3, vec4 } = T;
export type RGB = [number, number, number];
const V3 = THREE.Vector3;

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------------------------------------------------------------- stone */
export interface StoneOpts {
  set: ScanName;
  /** Its own colour, multiplied into the scan's. */
  tint?: RGB;
  /** How strongly the surface's light plays over upward faces (0 none). */
  caustic?: N;
  causticCol?: RGB;
  /** Silt and growth (1 as the lake ruins). */
  sea?: number;
  /** Growth colour: green weed, or coral. */
  growth?: RGB;
  /** A carving on the geometry's ±z faces, read through its UVs: R the cut, G the lip. With
      `cols` variants side by side, chosen per instance by `aVar`. */
  carve?: { tex: THREE.Texture; cols: number; variant?: THREE.InstancedBufferAttribute };
  /** Per instance (0…1): warms the carving with gold (instanced meshes only). */
  near?: THREE.InstancedBufferAttribute;
  nearCol?: RGB;
  /** A little of its own light, so forms read in the murk. */
  lift?: number;
}

/** The sea's stone. `uT` is the area's clock. */
export function seaStone(o: StoneOpts, uT: N): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.9 });
  const S = scan(o.set);
  const pw = positionWorld, n = T.normalWorldGeometry;
  const wp = T.pow(abs(n), vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tile = 2.6;
  const tri = (t: THREE.Texture) =>
    T.texture(t, pw.zy.div(tile)).mul(w.x).add(T.texture(t, pw.xz.div(tile)).mul(w.y)).add(T.texture(t, pw.xy.div(tile)).mul(w.z));
  const arm = tri(S.arm);
  let c: N = tri(S.diff).rgb.mul(mix(float(0.4), float(1), arm.r)).mul(vec3(...(o.tint ?? [1, 1, 1])));
  const nz = (p: N) => T.mx_noise_float(p).mul(0.5).add(0.5);
  const up = smoothstep(0.35, 0.85, n.y);
  const sea = o.sea ?? 1;
  const silt = up.mul(smoothstep(0.35, 0.65, nz(pw.mul(0.9)))).mul(sea);
  const growth = up.mul(smoothstep(0.5, 0.75, nz(pw.mul(1.7).add(7)))).mul(0.8 * sea);
  const stain = smoothstep(0.55, 0.8, nz(vec3(pw.x.mul(2.2), pw.y.mul(0.25), pw.z.mul(2.2)))).mul(float(1).sub(up)).mul(0.3 * sea);
  const sand = T.texture(surface("sand").diff, pw.xz.div(2.2)).rgb.mul(vec3(1.05, 1.0, 0.9)).mul(1.6);
  c = mix(c, sand, silt.mul(0.7));
  const gc = o.growth ?? [0.16, 0.26, 0.14];
  c = mix(c, vec3(...gc).mul(nz(pw.mul(6)).mul(0.5).add(0.6)), growth);
  c = c.mul(float(1).sub(stain));
  // the carving, on the faces it was cut into
  let cut: N = float(0), lip: N = float(0);
  if (o.carve) {
    const face = smoothstep(0.6, 0.8, abs(T.normalGeometry.z));
    const q = o.carve.variant ? vec2(uv().x.add(T.instancedBufferAttribute(o.carve.variant)).div(o.carve.cols), uv().y) : uv();
    const k = T.texture(o.carve.tex, q);
    cut = k.r.mul(face).mul(float(1).sub(silt.mul(0.6)));
    lip = k.g.mul(face).mul(float(1).sub(silt.mul(0.6)));
    c = c.mul(float(1).sub(cut.mul(0.68))).add(c.mul(lip.mul(0.35)));
  }
  m.colorNode = vec4(c.mul(1.1), 1);
  m.roughnessNode = T.clamp(arm.g, 0.55, 1);
  const nm = (t: THREE.Texture) => [T.texture(t, pw.zy.div(tile)), T.texture(t, pw.xz.div(tile)), T.texture(t, pw.xy.div(tile))].map((x: N) => x.xy.mul(2).sub(1));
  const [nx, ny, nzz] = nm(S.nor);
  const dn = vec3(0, nx.y, nx.x).mul(w.x).add(vec3(ny.x, 0, ny.y).mul(w.y)).add(vec3(nzz.x, nzz.y, 0).mul(w.z)).mul(float(1).sub(silt.mul(0.7)));
  m.normalNode = T.normalize(T.normalView.add(T.cameraViewMatrix.mul(vec4(dn.mul(1.5), 0)).xyz));
  // light from the surface: two drifting ripple fields crossing, sharpened into a moving web,
  // only on what faces up (and a little on the sides near the top), soft with depth
  let em: N = c.mul(o.lift ?? 0.12);
  if (o.caustic) {
    const p2 = pw.xz.mul(0.42);
    const a1 = nz(vec3(p2.x, p2.y, uT.mul(0.16)));
    const a2 = nz(vec3(p2.x.mul(1.37).add(3.1), p2.y.mul(1.37).sub(1.7), uT.mul(0.13).add(5)));
    const web = pow(float(1).sub(abs(a1.sub(a2))), 9);
    const depthK = T.exp(max(float(WATER_Y).sub(pw.y), 0).mul(-0.03));
    const facing = smoothstep(-0.1, 0.9, n.y);
    em = em.add(vec3(...(o.causticCol ?? [0.55, 0.85, 0.8])).mul(web).mul(facing).mul(depthK).mul(o.caustic));
  }
  if (o.near) {
    const nearK = T.instancedBufferAttribute(o.near);
    const breathe = sin(uT.mul(0.7)).mul(0.15).add(0.85);
    em = em.add(vec3(...(o.nearCol ?? [1.0, 0.72, 0.32])).mul(cut.add(lip.mul(0.3))).mul(nearK).mul(breathe).mul(0.55));
  }
  m.emissiveNode = em;
  return m;
}

/** The game's cut masonry (`landStone`: courses, recessed joints, worn arrises, each stone its
    own tone) with the sea's work over it (silt on what faces up) and the surface's light playing
    over it as caustics, and a little of its own light so forms read in the murk. */
export function seaMasonry(set: ScanName, tint: RGB, masonry: Masonry, uT: N, caustic = 0.5, causticCol: RGB = [0.6, 0.9, 0.78], lift = 0.12, finish?: "marble"): THREE.MeshStandardNodeMaterial {
  const m = landStone(set, -1e4, 2.4, tint, masonry, finish);
  const pw = positionWorld, n = T.normalWorldGeometry;
  const nz = (p: N) => T.mx_noise_float(p).mul(0.5).add(0.5);
  const up = smoothstep(0.45, 0.9, n.y);
  const silt = up.mul(smoothstep(0.4, 0.7, nz(pw.mul(0.7))));
  const sand = T.texture(surface("sand").diff, pw.xz.div(2.2)).rgb.mul(vec3(1.05, 1.0, 0.9)).mul(1.5);
  const c0 = (m.colorNode as N).rgb;
  const c = mix(c0, sand, silt.mul(0.6));
  m.colorNode = vec4(c, 1);
  const p2 = pw.xz.mul(0.42);
  const a1 = nz(vec3(p2.x, p2.y, uT.mul(0.16)));
  const a2 = nz(vec3(p2.x.mul(1.37).add(3.1), p2.y.mul(1.37).sub(1.7), uT.mul(0.13).add(5)));
  const web = pow(float(1).sub(abs(a1.sub(a2))), 9);
  const depthK = T.exp(max(float(WATER_Y).sub(pw.y), 0).mul(-0.03));
  m.emissiveNode = c.mul(lift).add(vec3(...causticCol).mul(web).mul(smoothstep(-0.1, 0.9, n.y)).mul(depthK).mul(caustic));
  return m;
}

/* ---------------------------------------------------------------- geometry */
/** Pieces gathered per material and merged: one draw per material for a whole city. */
export class Merge<K extends string> {
  parts = new Map<K, THREE.BufferGeometry[]>();
  add(k: K, g: THREE.BufferGeometry, m?: THREE.Matrix4, keepUv = false): void {
    const c = g.index ? g.toNonIndexed() : g.clone();
    for (const a of Object.keys(c.attributes)) if (a !== "position" && a !== "normal" && !(keepUv && a === "uv")) c.deleteAttribute(a);
    if (m) c.applyMatrix4(m);
    (this.parts.get(k) ?? this.parts.set(k, []).get(k)!).push(c);
  }
  build(mats: Record<K, THREE.Material>): THREE.Group {
    const g = new THREE.Group();
    for (const [k, list] of this.parts) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), mats[k]);
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3();
/** A placement matrix: at (x, y, z), turned (rx, ry, rz), scaled (sx, sy, sz). */
export function place(x: number, y: number, z: number, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0): THREE.Matrix4 {
  return _m.compose(new V3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)).clone();
}

/** A block whose sides lean in (a talud): `w` × `d` at the foot, `inset` less on each side at the
    top, `h` tall, its foot at y = 0; corners a little worn. */
export function talud(w: number, d: number, h: number, inset: number, R?: () => number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 2, 1, 2);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = y / h;
    let x = p.getX(i), z = p.getZ(i);
    x -= Math.sign(x) * inset * k * (Math.abs(x) > w * 0.49 ? 1 : 0);
    z -= Math.sign(z) * inset * k * (Math.abs(z) > d * 0.49 ? 1 : 0);
    if (R) (x += (R() - 0.5) * 0.06), (z += (R() - 0.5) * 0.06);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** A rough stone: a box with its corners chipped and faces a little uneven. */
export function roughBlock(w: number, h: number, d: number, R: () => number, chip = 0.08): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const corner = (Math.abs(x) > w * 0.49 ? 1 : 0) + (Math.abs(y) > h * 0.49 ? 1 : 0) + (Math.abs(z) > d * 0.49 ? 1 : 0);
    const k = corner === 3 ? chip : chip * 0.3;
    p.setXYZ(i, x * (1 - (R() * k) / Math.max(0.3, w)), y * (1 - (R() * k) / Math.max(0.3, h)), z * (1 - (R() * k) / Math.max(0.3, d)));
  }
  g.computeVertexNormals();
  return g;
}

/** Hold the wanderer out of a box (turned `ang`), up to `top`. */
export function solidBox(x: number, z: number, hx: number, hz: number, ang: number, top: number, list: Collider[]): void {
  const c: Collider = { x, z, r: 0, hx, hz, ang, top };
  colliders.push(c);
  list.push(c);
}
export function solidRound(x: number, z: number, r: number, top: number, list: Collider[]): void {
  const c: Collider = { x, z, r, top };
  colliders.push(c);
  list.push(c);
}

/* ---------------------------------------------------------------- shafts of light */
/** Soft volumes of light from the surface down to the floor at `spots` (world x, z, floor y),
    each breathing on its own slow time. One draw. */
export function shafts(spots: { x: number; z: number; y: number; r: number }[], col: RGB, k: N, uT: N): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  spots.forEach((s, i) => {
    const h = WATER_Y - s.y;
    const g = new THREE.CylinderGeometry(s.r * 0.75, s.r * 1.25, h, 24, 1, true);
    g.translate(s.x, s.y + h / 2, s.z);
    const ph = new Float32Array(g.attributes.position.count).fill(i * 1.73);
    g.setAttribute("aPh", new THREE.BufferAttribute(ph, 1));
    const yb = new Float32Array(g.attributes.position.count);
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) yb[j] = (p.getY(j) - s.y) / h;
    g.setAttribute("aY", new THREE.BufferAttribute(yb, 1));
    parts.push(g);
  });
  const geo = mergeGeometries(parts);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false });
  const core = pow(abs(T.dot(T.normalView, vec3(0, 0, 1))), 2.2);
  const ph = T.attribute("aPh", "float"), y = T.attribute("aY", "float");
  const breath = sin(uT.mul(0.31).add(ph)).mul(0.3).add(0.7);
  const ends = smoothstep(0, 0.12, y).mul(smoothstep(1, 0.75, y));
  const motes = T.mx_noise_float(vec3(positionWorld.x.mul(1.4), positionWorld.y.mul(0.5).sub(uT.mul(0.2)), positionWorld.z.mul(1.4))).mul(0.25).add(0.85);
  const near = smoothstep(2.5, 9, length(cameraPosition.sub(positionWorld)));
  m.colorNode = vec4(vec3(...col).mul(core).mul(breath).mul(ends).mul(motes).mul(near).mul(outOfTheWay(positionWorld)).mul(k).mul(0.12), 1);
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

/* ---------------------------------------------------------------- keepers */
let modelP: Promise<BeingModel | null> | null = null;
const wandererModel = () => (modelP ??= loadBeingModel("models/wanderer.glb"));

type Act = "idle" | "walk" | "sit" | "reach";
const CLIPS: Record<Act, string> = { idle: "Idle_Loop", walk: "Walk_Loop", sit: "Sitting_Idle_Loop", reach: "Spell_Simple_Idle_Loop" };
/** The sitting clip sits on a chair: lowered this far, it sits (or kneels) on the ground. */
const SIT_Y = 0.42;

export interface KeeperSpec {
  /** Its look, a recipe of world/figures.ts. */
  recipe: string;
  tint: RGB;
  /** Where it stands (world), and the way it faces (the game's heading: 0 faces −z). */
  x: number;
  z: number;
  y?: number;
  face: number;
  pose: "stand" | "sit" | "kneel" | "walk" | "bless";
  /** A slow round: the points it walks between (world x, z), pausing at each, facing `look`. */
  path?: { x: number; z: number; look?: [number, number] }[];
  pause?: number;
  scale?: number;
  /** Under the water: buoyant, slower. */
  water?: boolean;
  /** Its gesture comes and goes on a long loop (seconds). */
  every?: number;
  /** The ground it stands on (default the world's floor): a raised ring, a platform. */
  ground?: (x: number, z: number) => number;
}

/** One ambient presence. Its light gathers into the figure as you come within ~45 m, fades out by
    ~110 m; within ~16 m it turns its head toward you. It never moves toward you or away. */
export class Keeper {
  readonly root = new THREE.Group();
  readonly loaded: Promise<void>;
  private figure: Figure | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private acts: Partial<Record<Act, THREE.AnimationAction>> = {};
  private cur: Act | null = null;
  private head: THREE.Bone | null = null;
  private turn = 0;
  private applied = 0;
  private leg = 0;
  private wait = 0;
  private heading: number;
  private since = 0;
  private lastFig = 0;
  private glow = 0;
  private baseY: number;

  constructor(readonly spec: KeeperSpec) {
    this.heading = spec.face;
    this.baseY = spec.y ?? (spec.ground ?? heightAt)(spec.x, spec.z);
    this.root.position.set(spec.x, this.baseY, spec.z);
    this.root.rotation.y = spec.face;
    this.since = Math.random() * 30;
    this.loaded = wandererModel().then((model) => {
      if (!model) return;
      const m = cloneSkinned(model.model);
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.visible = false; // only its light is drawn
          mesh.frustumCulled = false;
        }
        if ((o as THREE.Bone).isBone && /head/i.test(o.name) && !/top|end/i.test(o.name) && !this.head) this.head = o as THREE.Bone;
      });
      m.rotation.y = Math.PI;
      m.scale.setScalar(model.scale * (spec.scale ?? 1));
      this.root.add(m);
      this.mixer = new THREE.AnimationMixer(m);
      for (const [k, name] of Object.entries(CLIPS) as [Act, string][]) {
        const clip = model.clips.find((c) => c.name === name);
        if (!clip) continue;
        const a = this.mixer.clipAction(clip);
        a.setEffectiveWeight(0);
        a.play();
        a.time = Math.random() * clip.duration;
        this.acts[k] = a;
      }
      this.play(this.rest());
      this.mixer.update(0.01);
      this.root.updateMatrixWorld(true);
      const bind = figureBind(spec.recipe, spec.tint, m);
      if (bind) this.figure = new Figure(bind, m, this.root, spec.tint);
    });
  }

  private rest(): Act {
    const p = this.spec.pose;
    return p === "sit" || p === "kneel" ? "sit" : "idle";
  }

  private play(a: Act): void {
    if (a === this.cur) return;
    const next = this.acts[a];
    if (!next) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.cur && this.acts[this.cur]) this.acts[this.cur]!.crossFadeTo(next, 1.2, false);
    this.cur = a;
  }

  update(dt: number, t: number, visitor: THREE.Vector3, reduced: boolean): void {
    const s = this.spec, p = this.root.position;
    const d = Math.hypot(visitor.x - p.x, visitor.z - p.z);
    const want = d < 110 ? 1 - THREE.MathUtils.smoothstep(d, 60, 110) : 0;
    this.glow += (want - this.glow) * Math.min(1, dt * 0.8);
    this.root.visible = this.glow > 0.01;
    if (!this.root.visible || !this.mixer) return;
    const slow = s.water ? 0.7 : 1;
    let act = this.rest();
    // a slow round, pausing at each place
    if (s.path && s.path.length) {
      const goal = s.path[this.leg];
      const dx = goal.x - p.x, dz = goal.z - p.z, gd = Math.hypot(dx, dz);
      if (this.wait > 0) {
        this.wait -= dt;
        if (this.wait <= 0) this.leg = (this.leg + 1) % s.path.length;
        const look = goal.look;
        if (look) this.face(Math.atan2(-(look[0] - p.x), -(look[1] - p.z)), dt);
      } else if (gd < 0.3) this.wait = s.pause ?? 8;
      else {
        const v = Math.min(gd, 0.42 * slow * dt);
        p.x += (dx / gd) * v;
        p.z += (dz / gd) * v;
        this.face(Math.atan2(-dx, -dz), dt);
        act = "walk";
      }
      this.baseY = (s.ground ?? heightAt)(p.x, p.z);
    }
    // a gesture, on its own long loop
    this.since += dt;
    if (s.every && act !== "walk") {
      const ph = this.since % s.every;
      if (s.pose === "bless" || s.pose === "stand") act = ph < 7 ? "reach" : "idle";
      else if (s.pose === "kneel" && ph < 9) act = "idle"; // rises from kneeling a while, then kneels again
    }
    this.play(act);
    const sitting = this.cur === "sit";
    const bob = s.water && !reduced ? Math.sin(t * 0.5 + p.x) * 0.06 : 0;
    p.y += (this.baseY - (sitting ? SIT_Y * (s.scale ?? 1) : 0) + bob - p.y) * Math.min(1, dt * 1.5);
    const w = this.acts.walk;
    if (w) w.timeScale = 0.6 * slow;
    for (const k of ["idle", "sit", "reach"] as Act[]) if (this.acts[k]) this.acts[k]!.timeScale = 0.75 * slow;
    if (this.head) this.head.rotation.y -= this.applied; // the clip may not set the head: undo our own turn first
    this.mixer.update(dt);
    // acknowledgement: the head turns toward you when you are near (never the body, never a step)
    if (this.head) {
      let tgt = 0;
      if (d < 16 && d > 0.5) {
        let a = Math.atan2(-(visitor.x - p.x), -(visitor.z - p.z)) - this.heading;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        tgt = Math.abs(a) < 1.6 ? THREE.MathUtils.clamp(a, -0.9, 0.9) : 0;
      }
      this.turn += (tgt - this.turn) * Math.min(1, dt * 0.9);
      this.head.rotation.y += this.turn;
      this.applied = this.turn;
    }
    // the light: every frame when near, less often far off (its points are skinned on the CPU)
    if (this.figure && (d < 50 || t - this.lastFig > (d < 90 ? 0.25 : 0.6))) {
      this.lastFig = t;
      this.root.updateMatrixWorld(true);
      this.figure.update(dt, t, d < 45, 0.85 * this.glow, reduced);
    }
  }

  private face(h: number, dt: number): void {
    let dh = h - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * Math.min(1, dt * 0.8);
    this.root.rotation.y = this.heading;
  }
}

/* ---------------------------------------------------------------- swimmers */
export interface SwimSpec {
  file: "fish1" | "fish2" | "fish3" | "manta";
  length: number;
  tint: RGB;
  count: number;
  /** A loop about the city: centre (world), radii, height over the floor, how fast round (rad/s). */
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  y: number;
  speed: number;
  /** Spread of the school about its leader (m). */
  spread?: number;
  phase?: number;
}

/** Schools and mantas on loops about a city: they flow round it, slow, never startled. */
export class Swimmers {
  readonly group = new THREE.Group();
  private list: { obj: THREE.Group; mixer: THREE.AnimationMixer; spec: SwimSpec; off: THREE.Vector3; lag: number }[] = [];
  private mats: THREE.Material[] = [];
  private p = new V3();
  private q = new V3();

  constructor(specs: SwimSpec[]) {
    void this.load(specs);
  }

  private async load(specs: SwimSpec[]): Promise<void> {
    const loader = new GLTFLoader();
    const cache = new Map<string, Promise<THREE.Object3D & { animations?: THREE.AnimationClip[] } | null>>();
    for (const sp of specs) {
      const file = `models/sea/${sp.file}.glb`;
      if (!cache.has(file))
        cache.set(file, loadBytes(file).then(async (b) => {
          if (!b) return null;
          const gl = await loader.parseAsync(b, "");
          return Object.assign(gl.scene, { animations: gl.animations });
        }));
      const scene = await cache.get(file)!;
      if (!scene) continue;
      const mat = lightBodyMaterial(new THREE.Color(...sp.tint).multiplyScalar(1.6), { inner: 0.55, edge: 1.3, body: 0.6 });
      this.mats.push(mat);
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene, true);
      const len = box.max.z - box.min.z || 1, centre = box.getCenter(new V3());
      for (let i = 0; i < sp.count; i++) {
        const model = cloneSkinned(scene);
        model.traverse((o) => {
          const m = o as THREE.SkinnedMesh;
          if (m.isMesh) {
            m.material = mat;
            m.frustumCulled = false;
          }
        });
        const holder = new THREE.Group();
        const s = sp.length / len;
        model.scale.setScalar(s);
        model.position.copy(centre).multiplyScalar(-s);
        holder.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const clip = scene.animations?.[0];
        if (clip) {
          const a = mixer.clipAction(clip);
          a.timeScale = 0.7 + Math.random() * 0.3;
          a.play();
          mixer.update(Math.random() * clip.duration);
        }
        this.group.add(holder);
        const sprd = sp.spread ?? 2.5;
        this.list.push({ obj: holder, mixer, spec: sp, off: new V3((Math.random() - 0.5) * sprd * 2, (Math.random() - 0.5) * sprd * 0.6, (Math.random() - 0.5) * sprd * 2), lag: i * 0.012 });
      }
    }
  }

  update(dt: number, t: number): void {
    for (const m of this.mats) tickLightBody(m, t);
    for (const f of this.list) {
      const s = f.spec, a = t * s.speed + (s.phase ?? 0) - f.lag;
      const at = (u: number, out: THREE.Vector3) => {
        const x = s.cx + Math.cos(u) * s.rx, z = s.cz + Math.sin(u) * s.rz;
        const floor = heightAt(x, z);
        return out.set(x, Math.min(WATER_Y - 1.5, floor + s.y + Math.sin(u * 2.3) * 1.2), z);
      };
      at(a, this.p).add(f.off);
      at(a + 0.02 * Math.sign(s.speed), this.q).add(f.off);
      f.obj.position.copy(this.p);
      f.obj.lookAt(this.q);
      f.mixer.update(dt);
    }
  }
}
