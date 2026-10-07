/* The vision above the monument (Samuel: "an animation, a dynamic thing… almost like a
   hologram"). Thousands of points of light, one continuous body that never stops moving: they
   hold each form of creation for a while, then swirl loose and gather into the next, each point
   finding its own way (a turning vortex between forms, the far ones last):
     atom → stone → crystal → molecule → plant → animal → primate → human →
     the social memory complex (six in a ring) → unity (a sphere) → one point → the burst → atom.
   It stands on the ground near the shore, in its own loop of 100 s. Hologram in feel (points of
   light, a flicker, a slow scan of brightness rising through it) but contained: no spreading glow. */
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { floatAttributes, loadBytes } from "../core/assets";
import { gpuUniforms, softPoints, spriteCloud, T, viewDepth, type SpriteCloud, softDot, pointR } from "../gpu/tsl";
import { grow, prismGeometry, SHAPES, tubes } from "./creation";

const V = THREE.Vector3;
const H = 6; // the forms' height (metres)

type Shape = Float32Array; // N × xyz, local to the vision (0 at its foot)

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Area-weighted points on a triangle soup (positions already where they should be). */
function onSurface(pos: Float32Array, index: ArrayLike<number> | null, n: number, R: () => number): Float32Array {
  const tri = index ? index.length / 3 : pos.length / 9;
  const vi = (t: number, k: number) => (index ? index[t * 3 + k] : t * 3 + k);
  const area = new Float32Array(tri);
  const a = new V(), b = new V(), c = new V();
  let total = 0;
  for (let t = 0; t < tri; t++) {
    a.fromArray(pos, vi(t, 0) * 3);
    b.fromArray(pos, vi(t, 1) * 3);
    c.fromArray(pos, vi(t, 2) * 3);
    total += area[t] = b.sub(a).cross(c.sub(a)).length() * 0.5;
  }
  const cum = new Float32Array(tri);
  let acc = 0;
  for (let t = 0; t < tri; t++) cum[t] = acc += area[t] / total;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = R();
    let lo = 0, hi = tri - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m] < r) lo = m + 1;
      else hi = m;
    }
    let u = R(), v = R();
    if (u + v > 1) (u = 1 - u), (v = 1 - v);
    a.fromArray(pos, vi(lo, 0) * 3);
    b.fromArray(pos, vi(lo, 1) * 3);
    c.fromArray(pos, vi(lo, 2) * 3);
    a.multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v);
    out.set([a.x, a.y, a.z], i * 3);
  }
  return out;
}

/** Fit points to stand `h` tall, their foot at 0, centred. */
function fit(p: Float32Array, h: number): Float32Array {
  const box = new THREE.Box3();
  const v = new V();
  for (let i = 0; i < p.length; i += 3) box.expandByPoint(v.fromArray(p, i));
  const k = h / Math.max(1e-3, box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  for (let i = 0; i < p.length; i += 3) {
    p[i] = (p[i] - cx) * k;
    p[i + 1] = (p[i + 1] - box.min.y) * k;
    p[i + 2] = (p[i + 2] - cz) * k;
  }
  return p;
}

function geoPoints(g: THREE.BufferGeometry, n: number, R: () => number): Float32Array {
  const pos = (g.attributes.position as THREE.BufferAttribute).array as Float32Array;
  return onSurface(pos, g.index ? g.index.array : null, n, R);
}

/* ---------------------------------------------------------------- the forms */
function atom(n: number, R: () => number): Shape {
  const out = new Float32Array(n * 3), c = H / 2;
  for (let i = 0; i < n; i++) {
    const role = R();
    let x: number, y: number, z: number;
    if (role < 0.22) {
      // the nucleus: a dense ball
      const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(Math.cbrt(R()) * 0.55);
      [x, y, z] = [d.x, d.y, d.z];
    } else if (role < 0.7) {
      // three orbits
      const k = Math.floor(R() * 3), a = R() * Math.PI * 2, r = 2.3 + (R() - 0.5) * 0.08;
      const p = new V(Math.cos(a) * r, 0, Math.sin(a) * r).applyEuler(new THREE.Euler(k * 1.05 + 0.5, k * 0.9, 0));
      [x, y, z] = [p.x, p.y, p.z];
    } else {
      // the cloud where the electron may be
      const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(1.2 + Math.pow(R(), 0.5) * 1.6);
      [x, y, z] = [d.x, d.y * 0.9, d.z];
    }
    out.set([x, y + c, z], i * 3);
  }
  return out;
}
function stone(n: number, R: () => number): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    const nse = Math.sin(d.x * 3.1 + d.y * 1.7) * 0.1 + Math.sin(d.z * 5.3 - d.x * 2.2) * 0.07 + Math.sin(d.y * 9 + d.z * 7) * 0.03;
    const inside = R() < 0.15 ? Math.cbrt(R()) : 1;
    d.multiplyScalar((1 + nse) * inside).multiply(new V(2.6, 1.7, 2.3));
    out.set([d.x, d.y, d.z], i * 3);
  }
  return fit(out, H * 0.55);
}
function crystal(n: number, R: () => number): Shape {
  const parts: THREE.BufferGeometry[] = [];
  const P = rng(7);
  for (let k = 0; k < 9; k++) {
    const p0 = prismGeometry();
    const g = p0.index ? p0.toNonIndexed() : p0;
    const a = k * 2.4, tilt = k === 0 ? 0 : 0.3 + P() * 0.45, len = k === 0 ? 1 : 0.45 + P() * 0.4;
    g.scale(0.9, len * 5.5, 0.9);
    g.rotateZ(-Math.cos(a) * tilt);
    g.rotateX(Math.sin(a) * tilt);
    g.translate(Math.cos(a) * (k ? 0.4 : 0), 0, Math.sin(a) * (k ? 0.4 : 0));
    parts.push(g);
  }
  const pos: number[] = [];
  for (const g of parts) pos.push(...((g.attributes.position as THREE.BufferAttribute).array as Float32Array));
  return fit(onSurface(new Float32Array(pos), null, n, R), H * 0.9);
}
function molecule(n: number, R: () => number): Shape {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = R(), y = u * H * 0.95, a = u * Math.PI * 6;
    const role = R();
    let x: number, z: number, yy = y;
    if (role < 0.7) {
      // the two strands, a little thick
      const s = role < 0.35 ? 0 : Math.PI, r = 1.3;
      const j = new V(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.18);
      x = Math.cos(a + s) * r + j.x;
      z = Math.sin(a + s) * r + j.z;
      yy += j.y;
    } else {
      // the rungs between them
      const step = Math.round(a / 0.55) * 0.55, t = R() * 2 - 1;
      x = Math.cos(step) * 1.3 * t;
      z = Math.sin(step) * 1.3 * t;
      yy = (step / (Math.PI * 6)) * H * 0.95;
    }
    out.set([x, yy, z], i * 3);
  }
  return out;
}
function plant(n: number, R: () => number): Shape {
  const { limbs, roots } = grow({ ...SHAPES[2], height: 4, radius: 0.12, limbLen: 1.8, roots: 5 }, 0.61);
  return fit(geoPoints(tubes([...limbs, ...roots.slice(0, 5)]), n, R), H);
}

/* ---------------------------------------------------------------- the vision */
const STAGES = ["atom", "stone", "crystal", "molecule", "plant", "animal", "primate", "human", "many", "unity", "point"] as const;
type StageName = (typeof STAGES)[number];
// when each form is whole, on the monument's 100 s clock; and how long the gathering into it takes
const KEYS: { t: number; s: StageName; dur: number }[] = [
  { t: 0, s: "atom", dur: 2.6 },
  { t: 8, s: "stone", dur: 4 },
  { t: 16, s: "crystal", dur: 4 },
  { t: 24, s: "molecule", dur: 4 },
  { t: 32, s: "plant", dur: 4 },
  { t: 40, s: "animal", dur: 4 },
  { t: 48, s: "primate", dur: 4 },
  { t: 56, s: "human", dur: 4 },
  { t: 64, s: "many", dur: 4.5 },
  { t: 78, s: "unity", dur: 6 },
  { t: 94, s: "point", dur: 6 },
];
const TINT: Record<StageName, [number, number, number]> = {
  atom: [0.55, 0.85, 1.0], stone: [1.0, 0.72, 0.45], crystal: [0.85, 0.75, 1.0], molecule: [0.45, 1.0, 0.85],
  plant: [0.65, 1.0, 0.5], animal: [1.0, 0.7, 0.4], primate: [1.0, 0.62, 0.55], human: [1.0, 0.85, 0.55],
  many: [1.0, 0.92, 0.78], unity: [1.0, 0.8, 0.4], point: [1.0, 1.0, 1.0],
};

export class Vision {
  group = new THREE.Group();
  private n: number;
  private shapes = new Map<StageName, Shape>();
  private cloud: SpriteCloud;
  private pos: Float32Array;
  private col: Float32Array;
  private seed: Float32Array;
  private uScan = T.uniform(0);
  private uT = T.uniform(0);
  private t = 0;
  /** The form just gathering (for its name), −1 while none is. */
  phase = -1;

  constructor(at: THREE.Vector3, n = 14000) {
    this.n = n;
    this.group.position.copy(at);
    const R = rng(11);
    this.shapes.set("atom", atom(n, R));
    this.shapes.set("stone", stone(n, R));
    this.shapes.set("crystal", crystal(n, R));
    this.shapes.set("molecule", molecule(n, R));
    this.shapes.set("plant", plant(n, R));
    const sphere = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(R() < 0.8 ? 2.2 : 2.2 * Math.cbrt(R()));
      sphere.set([d.x, d.y + H / 2, d.z], i * 3);
    }
    this.shapes.set("unity", sphere);
    const point = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(Math.cbrt(R()) * 0.08);
      point.set([d.x, d.y + H / 2, d.z], i * 3);
    }
    this.shapes.set("point", point);
    // until the living forms are loaded, they borrow the plant's
    for (const s of ["animal", "primate", "human", "many"] as const) this.shapes.set(s, this.shapes.get("plant")!);

    const mat = softPoints();
    this.cloud = spriteCloud(n, { position: 3, aCol: 3, aSeed: 1 }, mat);
    this.pos = this.cloud.attrs.position.array as Float32Array;
    this.col = this.cloud.attrs.aCol.array as Float32Array;
    this.seed = new Float32Array(n);
    for (let i = 0; i < n; i++) this.seed[i] = R();
    (this.cloud.attrs.aSeed.array as Float32Array).set(this.seed);
    {
      const { clamp, float, max, sin, exp, vec4 } = T;
      const { position, aCol, aSeed } = this.cloud.nodes;
      const worldPos = T.modelWorldMatrix.mul(vec4(position, 1)).xyz;
      mat.sizeNode = clamp(gpuUniforms.px.mul(0.05).mul(aSeed.mul(0.8).add(0.6)).div(max(viewDepth(worldPos), 0.5)), float(1).div(gpuUniforms.dpr), 5);
      const flick = sin(this.uT.mul(21).add(aSeed.mul(97))).mul(0.12).add(0.88);
      const scan = exp(position.y.sub(this.uScan).mul(position.y.sub(this.uScan)).mul(-3)).mul(0.9);
      const soft = softDot(pointR()).mul(1.39);
      mat.colorNode = vec4(aCol.mul(soft).mul(flick).mul(scan.add(0.55)).mul(0.62), 1);
    }
    this.cloud.sprite.frustumCulled = false;
    this.group.add(this.cloud.sprite);
    void this.loadLiving();
  }

  /** The animal, the primate, the human, the six: from the horse and the recorded figure. */
  private async loadLiving(): Promise<void> {
    const n = this.n, R = rng(23);
    const hb = await loadBytes("models/animals/horse.glb");
    if (hb) {
      const g = await new GLTFLoader().parseAsync(hb, "");
      const m = g.scene.getObjectByProperty("type", "Mesh") as THREE.Mesh | undefined;
      if (m) this.shapes.set("animal", fit(geoPoints(m.geometry as THREE.BufferGeometry, n, R), H * 0.72));
    }
    const wb = await loadBytes("models/wanderer.glb");
    if (!wb) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(wb, "");
    floatAttributes(gltf.scene);
    const scene = gltf.scene;
    const key = (s: string) => s.replace(/[\s.:/[\]]/g, "");
    const bones: Record<string, THREE.Bone> = {};
    scene.traverse((o) => ((o as THREE.Bone).isBone ? (bones[key(o.name)] = o as THREE.Bone) : 0));
    const mixer = new THREE.AnimationMixer(scene);
    /** The figure's skin, posed by a clip at a moment (and bent further, for the primate). */
    const posed = (clip: string, at: number, bends: [string, number][] = []): Float32Array => {
      mixer.stopAllAction();
      const c = gltf.animations.find((a) => a.name === clip);
      if (c) {
        const a = mixer.clipAction(c);
        a.reset().play();
        mixer.setTime(at);
      }
      for (const [b, ang] of bends) if (bones[key(b)]) bones[key(b)].rotation.x += ang;
      scene.updateMatrixWorld(true);
      const all: number[] = [];
      scene.traverse((o) => {
        const sm = o as THREE.SkinnedMesh;
        if (!sm.isSkinnedMesh) return;
        const g = sm.geometry as THREE.BufferGeometry;
        const p = g.attributes.position as THREE.BufferAttribute, v = new V();
        const skinned = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
          sm.applyBoneTransform(i, v.fromBufferAttribute(p, i));
          v.applyMatrix4(sm.matrixWorld);
          skinned.set([v.x, v.y, v.z], i * 3);
        }
        const idx = g.index ? Array.from(g.index.array) : null;
        // keep each primitive's own surface: triangles are sampled per mesh and merged
        const pts = onSurface(skinned, idx, Math.round(n * (p.count / 2928) * 0.5) + 1, R);
        all.push(...pts);
      });
      // resample the merged points to exactly n
      const arr = new Float32Array(all);
      const out = new Float32Array(n * 3);
      const m = arr.length / 3;
      for (let i = 0; i < n; i++) out.set(arr.subarray(((i * 7919) % m) * 3, ((i * 7919) % m) * 3 + 3), i * 3);
      return out;
    };
    const human = fit(posed("Idle_Loop", 0.6), H);
    const primate = fit(posed("Idle_Loop", 1.2, [["DEF-spine.001", 0.5], ["DEF-spine.003", 0.35], ["DEF-neck", -0.5], ["DEF-thigh.L", -0.7], ["DEF-thigh.R", -0.7], ["DEF-shin.L", 1.0], ["DEF-shin.R", 1.0], ["DEF-upper_arm.L", 0.55], ["DEF-upper_arm.R", 0.55]]), H * 0.72);
    const raised = fit(posed("Spell_Simple_Idle_Loop", 0.8), H * 0.55);
    // the six: in a ring, facing in
    const many = new Float32Array(n * 3), v = new V();
    for (let i = 0; i < n; i++) {
      const k = i % 6, a = (k / 6) * Math.PI * 2;
      v.fromArray(raised, i * 3).applyAxisAngle(new V(0, 1, 0), -a - Math.PI / 2);
      many.set([v.x + Math.cos(a) * 2.2, v.y + H * 0.2, v.z + Math.sin(a) * 2.2], i * 3);
    }
    this.shapes.set("primate", primate);
    this.shapes.set("human", human);
    this.shapes.set("many", many);
  }

  stageName(i: number): string {
    return ["The atom", "The stone", "The crystal", "The molecule", "The plant", "The animal", "The primate", "The human", "The social memory complex", "Unity", "The one point"][i] ?? "";
  }

  /** Each frame near it: its own loop of 100 s. */
  update(dt: number, near: boolean, reduced: boolean): void {
    this.group.visible = near;
    if (!near) return;
    this.t = (this.t + dt * (reduced ? 0.6 : 1)) % 100;
    const t = this.t;
    this.uT.value += dt;
    this.group.rotation.y += dt * (reduced ? 0.05 : 0.12);
    this.uScan.value = ((this.uT.value * 0.9) % (H + 3)) - 1.5;
    // which form is gathering, from which
    let k = KEYS.length - 1;
    for (let i = 0; i < KEYS.length; i++) if (t >= KEYS[i].t) k = i;
    let next = (k + 1) % KEYS.length;
    const tNext = next === 0 ? 100 : KEYS[next].t;
    const into = KEYS[next], from = KEYS[k];
    const p0 = (t - (tNext - into.dur)) / into.dur;
    let A = this.shapes.get(from.s)!, B = this.shapes.get(into.s)!, p = p0;
    this.phase = p0 >= 0 && p0 < 0.25 ? STAGES.indexOf(into.s) : -1;
    if (p0 < 0) {
      // holding the present form
      B = A;
      p = 1;
      next = k;
    }
    const tA = TINT[from.s], tB = TINT[KEYS[next].s];
    const burst = into.s === "atom" && p0 >= 0;
    const P = this.pos, C = this.col, time = this.uT.value;
    for (let i = 0; i < this.n; i++) {
      const s = this.seed[i];
      // each point sets off a little later than the last, and finds its own way
      const q = Math.min(1, Math.max(0, (p - s * 0.35) / 0.65));
      const e = burst ? 1 - Math.pow(1 - q, 4) : q * q * (3 - 2 * q);
      const j = i * 3;
      let x = A[j] + (B[j] - A[j]) * e, y = A[j + 1] + (B[j + 1] - A[j + 1]) * e, z = A[j + 2] + (B[j + 2] - A[j + 2]) * e;
      // between forms, a vortex: turned about the axis and drawn outward, then gathered in
      const sw = Math.sin(e * Math.PI) * (burst ? 0.2 : 1);
      if (sw > 0.001) {
        const ang = sw * (1.4 + s * 1.2), c = Math.cos(ang), sn = Math.sin(ang);
        const out = 1 + sw * (0.25 + s * 0.35);
        const nx = (x * c - z * sn) * out, nz = (x * sn + z * c) * out;
        x = nx;
        z = nz;
        y += sw * (s - 0.3) * 1.2;
      }
      // alive while held: a breath through the form and a quiver in each point
      const br = 1 + Math.sin(time * 0.8 + y * 0.6) * 0.012;
      P[j] = x * br + Math.sin(time * 1.7 + s * 40) * 0.02;
      P[j + 1] = y + Math.sin(time * 1.3 + s * 60) * 0.02;
      P[j + 2] = z * br + Math.cos(time * 1.5 + s * 50) * 0.02;
      C[j] = tA[0] + (tB[0] - tA[0]) * e;
      C[j + 1] = tA[1] + (tB[1] - tA[1]) * e;
      C[j + 2] = tA[2] + (tB[2] - tA[2]) * e;
    }
    this.cloud.attrs.position.needsUpdate = this.cloud.attrs.aCol.needsUpdate = true;
  }
}
