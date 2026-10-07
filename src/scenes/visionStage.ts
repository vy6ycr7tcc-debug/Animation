/* A vision stage: the lessons told as the vision of creation is told (world/vision.ts; Samuel:
   "rely more on the format of animation you used for the monument, it's awesome"). One body of
   thousands of points of light stands on the ground before the seat. Nobody seated: it waits as a
   small glow low on the ground. Seated: on the narration's own clock it gathers into each form of
   the telling (a rope with its knot, a bound figure, a wheel, open hands, a river with its leaf…),
   holds it alive (a breath, a quiver, a band of brightness rising through it), and when the next
   moment comes it swirls loose and gathers into the next, every point on its own delay and path.
   While seated, what it shows is a pure function of narration seconds, so seeking and replay are
   exact. Standing up, it settles back into its waiting glow.
   Contained: small soft points, no spreading glow (docs/style). */
import * as THREE from "three/webgpu";
import { MOBILE } from "../core/quality";
import { gpuUniforms, softPoints, spriteCloud, T, viewDepth, type SpriteCloud, softDot, pointR } from "../gpu/tsl";
import { bodyForms, FORM_H, rng, seed, type BodyForms, type Rand, type Shape } from "../world/forms";

export type RGB = [number, number, number];
/** One moment of the telling: from narration second `t`, gather (over `dur` s) into `form`. */
export interface Key {
  t: number;
  form: string;
  tint: RGB;
  dur?: number;
  /** Turning while held: radians a second about the form's own axis. */
  spin?: number;
  /** The axis: "y" upright (default), "z" facing you (a wheel). */
  axis?: "y" | "z";
}
/** Makes a form of `n` points; body forms get the recorded figure (null until it has loaded). */
export type Maker = (n: number, R: Rand, body: BodyForms | null) => Shape | null;

export interface StageOpts {
  /** Where it stands (its foot on the ground). */
  at: THREE.Vector3;
  /** Which way its front (+z) turns: toward the seat. */
  face: number;
  forms: Record<string, Maker>;
  keys: Key[];
  seedNum: number;
  /** A point's size in metres at 1 m (default 0.042): a stage drawn larger wants larger points. */
  pointSize?: number;
  /** A calmer change between forms (the Duat's hours): points set off over a longer spread, and
      the vortex between forms turns and widens far less. */
  calm?: boolean;
}

// the game's canon (docs/style/STYLE_GUIDE.md §1)
export const GOLD: RGB = [1.0, 0.78, 0.48];
export const PALE: RGB = [0.72, 0.82, 1.0];
export const ROSE: RGB = [1.0, 0.7, 0.8];
export const EMBER: RGB = [1.0, 0.55, 0.32];
export const PEARL: RGB = [1.0, 0.94, 0.86];
const IDLE_TINT: RGB = [0.95, 0.82, 0.62];

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class VisionStage {
  group = new THREE.Group();
  private n: number;
  private shapes = new Map<string, Shape>();
  private idle: Shape;
  private cloud: SpriteCloud;
  private P: Float32Array;
  private C: Float32Array;
  private seedA: Float32Array;
  private uT = T.uniform(0);
  private uScan = T.uniform(0);
  private uGlow = T.uniform(1);
  private keys: Key[];
  private life = 0;

  constructor(private opts: StageOpts) {
    this.n = MOBILE ? 8000 : 12000;
    this.keys = [...opts.keys].sort((a, b) => a.t - b.t);
    this.group.position.copy(opts.at);
    this.group.rotation.y = opts.face;
    const R = rng(opts.seedNum);
    this.idle = seed(this.n, R);
    void bodyForms().then((b) => (this.body = b));
    const mat = softPoints();
    this.cloud = spriteCloud(this.n, { position: 3, aCol: 3, aSeed: 1 }, mat);
    this.P = this.cloud.attrs.position.array as Float32Array;
    this.C = this.cloud.attrs.aCol.array as Float32Array;
    this.P.set(this.idle);
    for (let i = 0; i < this.n; i++) this.C.set(IDLE_TINT, i * 3);
    this.seedA = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) this.seedA[i] = R();
    (this.cloud.attrs.aSeed.array as Float32Array).set(this.seedA);
    {
      const { clamp, float, max, sin, smoothstep, exp, vec4 } = T;
      const { position, aCol, aSeed } = this.cloud.nodes;
      const worldPos = T.modelWorldMatrix.mul(vec4(position, 1)).xyz;
      const depth = viewDepth(worldPos);
      mat.sizeNode = clamp(gpuUniforms.px.mul(opts.pointSize ?? 0.042).mul(aSeed.mul(0.8).add(0.6)).div(max(depth, 1.2)), float(1).div(gpuUniforms.dpr), 5);
      const flick = sin(this.uT.mul(aSeed.mul(9).add(12)).add(aSeed.mul(97))).mul(0.12).add(0.88);
      const dy = position.y.sub(this.uScan);
      const scan = exp(dy.mul(dy).mul(-2.5)).mul(0.7);
      const soft = softDot(pointR()).mul(1.39);
      // near the lens a point fades rather than swelling
      const nearK = smoothstep(1.2, 3.5, depth);
      mat.colorNode = vec4(aCol.mul(soft).mul(flick).mul(scan.add(0.62)).mul(this.uGlow).mul(nearK).mul(0.7), 1);
    }
    this.cloud.sprite.frustumCulled = false;
    this.group.add(this.cloud.sprite);
  }

  /** Make every form; those of the body once the recorded figure has come. */
  private body: BodyForms | null = null;

  /** A form, made the first time the telling reaches it (making them all at once is heavy). */
  private shape(name: string): Shape {
    let s = this.shapes.get(name);
    if (!s) {
      const make = this.opts.forms[name];
      const made = make ? make(this.n, rng(this.opts.seedNum * 31 + name.length * 7 + name.charCodeAt(0)), this.body) : null;
      if (!made) return this.idle;
      s = made;
      this.shapes.set(name, s);
    }
    return s;
  }

  /** Each frame near it. `t`: narration seconds (while seated). */
  update(dt: number, t: number, seated: boolean, near: boolean, reduced: boolean): void {
    this.group.visible = near;
    if (!near) return;
    this.life += dt;
    const L = this.life;
    this.uT.value = L;
    this.uScan.value = ((L * 0.8) % (FORM_H + 2.5)) - 1.2;
    this.group.rotation.y = this.opts.face + (reduced ? 0 : Math.sin(L * 0.09) * 0.14);
    const P = this.P, C = this.C, n = this.n;
    if (!seated) {
      // back to the waiting glow, gently
      const k = Math.min(1, dt * 0.5), I = this.idle;
      for (let j = 0; j < n * 3; j++) P[j] += (I[j] - P[j]) * k;
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        C[j] += (IDLE_TINT[0] - C[j]) * k;
        C[j + 1] += (IDLE_TINT[1] - C[j + 1]) * k;
        C[j + 2] += (IDLE_TINT[2] - C[j + 2]) * k;
      }
      this.uGlow.value = 0.7 + 0.2 * Math.sin(L * 0.7);
      this.cloud.attrs.position.needsUpdate = this.cloud.attrs.aCol.needsUpdate = true;
      return;
    }
    this.uGlow.value = 1;
    // which moment is gathering, from which
    const K = this.keys;
    let k = -1;
    for (let i = 0; i < K.length; i++) if (t >= K[i].t) k = i;
    const into = k >= 0 ? K[k] : null, from = k > 0 ? K[k - 1] : null;
    const A = from ? this.shape(from.form) : this.idle, B = into ? this.shape(into.form) : this.idle;
    const p = into ? (t - into.t) / (into.dur ?? 5) : 1;
    const tA = from?.tint ?? IDLE_TINT, tB = into?.tint ?? IDLE_TINT;
    // turning while held
    const angA = from?.spin ? from.spin * (t - from.t) : 0, angB = into?.spin ? into.spin * (t - into.t) : 0;
    const cA = Math.cos(angA), sA = Math.sin(angA), cB = Math.cos(angB), sB = Math.sin(angB);
    const zA = from?.axis === "z", zB = into?.axis === "z", cy = FORM_H / 2;
    const S = this.seedA;
    // how the points set off (spread of delays) and how far the vortex carries them
    const calm = !!this.opts.calm;
    const lag = calm ? 0.55 : 0.35, turn = calm ? 0.35 : 1.2, turnS = calm ? 0.3 : 1.1, wide = calm ? 0.06 : 0.2, wideS = calm ? 0.08 : 0.3, lift = calm ? 0.3 : 0.9;
    for (let i = 0; i < n; i++) {
      const s = S[i], j = i * 3;
      // each point sets off a little later than the last, and finds its own way
      const q = Math.min(1, Math.max(0, (p - s * lag) / (1 - lag)));
      const e = ease(q);
      let ax = A[j], ay = A[j + 1], az = A[j + 2];
      if (angA) {
        if (zA) [ax, ay] = [ax * cA - (ay - cy) * sA, cy + ax * sA + (ay - cy) * cA];
        else [ax, az] = [ax * cA - az * sA, ax * sA + az * cA];
      }
      let bx = B[j], by = B[j + 1], bz = B[j + 2];
      if (angB) {
        if (zB) [bx, by] = [bx * cB - (by - cy) * sB, cy + bx * sB + (by - cy) * cB];
        else [bx, bz] = [bx * cB - bz * sB, bx * sB + bz * cB];
      }
      let x = ax + (bx - ax) * e, y = ay + (by - ay) * e, z = az + (bz - az) * e;
      // between forms, a vortex: turned about the axis and drawn outward, then gathered in
      const sw = Math.sin(e * Math.PI);
      if (sw > 0.001) {
        const ang = sw * (turn + s * turnS), c = Math.cos(ang), sn = Math.sin(ang);
        const out = 1 + sw * (wide + s * wideS);
        const nx = (x * c - z * sn) * out;
        z = (x * sn + z * c) * out;
        x = nx;
        y += sw * (s - 0.35) * lift;
      }
      // alive while held: a breath through the form and a quiver in each point
      const br = reduced ? 1 : 1 + Math.sin(L * 0.8 + y * 0.6) * 0.012;
      const qv = reduced ? 0 : 0.018;
      P[j] = x * br + Math.sin(L * 1.7 + s * 40) * qv;
      P[j + 1] = y + Math.sin(L * 1.3 + s * 60) * qv;
      P[j + 2] = z * br + Math.cos(L * 1.5 + s * 50) * qv;
      C[j] = tA[0] + (tB[0] - tA[0]) * e;
      C[j + 1] = tA[1] + (tB[1] - tA[1]) * e;
      C[j + 2] = tA[2] + (tB[2] - tA[2]) * e;
    }
    this.cloud.attrs.position.needsUpdate = this.cloud.attrs.aCol.needsUpdate = true;
  }

  dispose(): void {
    this.cloud.sprite.removeFromParent();
    (this.cloud.sprite.material as THREE.Material).dispose();
    this.cloud.sprite.geometry.dispose();
  }
}
