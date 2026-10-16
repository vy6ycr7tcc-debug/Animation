/* The oracle, summoned in the world (the owner: "the oracle is summoned in the game and then you see
   the beautiful animations… you type and send, then the rest gets working"). A body of light in
   the vision of creation's format (scenes/visionStage.ts: thousands of points, each on its own
   delay and path between forms), called up out of a single point a little way ahead of the view
   and facing it, above the question bar at the foot of the screen.
   - quiet: a six-pointed star (two triangles' edges and their spokes) in a ring, a bright heart,
     dust about it, breathing and turning slowly.
   - thinking: it swirls loose into a turning vortex, quicker.
   - speaking: each sentence as it begins gathers it into the next form (the seed of life, a sun of
     rays, the star), with a breath through it.
   - closing: it draws into a point and is gone.
   Contained (docs/style): small soft points, no spreading glow. */
import * as THREE from "three/webgpu";
import { VisionStage, GOLD, PEARL, ROSE, type Maker, type RGB } from "../scenes/visionStage";
import { FORM_H, point, type Rand, type Shape } from "./forms";

export type PresenceState = "quiet" | "thinking" | "speaking";

const CY = FORM_H / 2;
/** How far ahead of the view it is summoned (less where something stands nearer). */
const AHEAD = 9;
/** …and ahead of the wanderer, when the view is close behind it. */
const NEAR = 8;
const LAVENDER: RGB = [0.82, 0.8, 1.0];

/** A point in the form's plane (facing +z), with a little depth. */
function put(out: Float32Array, i: number, x: number, y: number, z: number): void {
  out[i * 3] = x;
  out[i * 3 + 1] = CY + y;
  out[i * 3 + 2] = z;
}

/** Dust about the form: a thin disc of scattered lights. */
function dust(out: Float32Array, i: number, R: Rand, r0: number, r1: number, depth = 0.5): void {
  const a = R() * Math.PI * 2, d = r0 + Math.sqrt(R()) * (r1 - r0);
  put(out, i, Math.cos(a) * d, Math.sin(a) * d, (R() - 0.5) * depth);
}

function core(out: Float32Array, i: number, R: Rand, r = 0.26): void {
  const a = R() * Math.PI * 2, b = Math.acos(R() * 2 - 1), d = r * R() * R();
  put(out, i, Math.sin(b) * Math.cos(a) * d, Math.sin(b) * Math.sin(a) * d, Math.cos(b) * d);
}

/** The star: two triangles' edges and six spokes, a ring, a heart, dust. */
const star: Maker = (n, R) => {
  const out = new Float32Array(n * 3), S = 1.9;
  const pts: [number, number][] = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 3;
    pts.push([Math.cos(a) * S, Math.sin(a) * S]);
  }
  const segs: [number, number, number, number][] = [];
  for (const tri of [[0, 2, 4], [1, 3, 5]])
    for (let i = 0; i < 3; i++) {
      const a = pts[tri[i]], b = pts[tri[(i + 1) % 3]];
      segs.push([a[0], a[1], b[0], b[1]]);
    }
  for (const p of pts) segs.push([0, 0, p[0], p[1]]);
  for (let i = 0; i < n; i++) {
    const u = R();
    if (u < 0.5) {
      const s = segs[i % segs.length], t = R(), w = (R() - 0.5) * 0.035;
      put(out, i, s[0] + (s[2] - s[0]) * t + w, s[1] + (s[3] - s[1]) * t + w, (R() - 0.5) * 0.06);
    } else if (u < 0.66) {
      const a = R() * Math.PI * 2, r = 2.18 + (R() - 0.5) * 0.04;
      put(out, i, Math.cos(a) * r, Math.sin(a) * r, (R() - 0.5) * 0.05);
    } else if (u < 0.76) core(out, i, R);
    else dust(out, i, R, 0.3, 2.8);
  }
  return out;
};

/** Thinking: a vortex of three arms, drawn in toward its heart. */
const vortex: Maker = (n, R) => {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    if (R() < 0.14) {
      core(out, i, R, 0.32);
      continue;
    }
    const u = Math.pow(R(), 0.8), arm = Math.floor(R() * 3) * ((Math.PI * 2) / 3);
    const a = arm + u * 5.2 + (R() - 0.5) * 0.45 * (0.4 + u), r = 0.18 + u * 1.55;
    put(out, i, Math.cos(a) * r, Math.sin(a) * r, (R() - 0.5) * 0.3 * (1 - u) - u * 0.5);
  }
  return out;
};

/** The seed of life: seven circles, and the circle that holds them. */
const bloom: Maker = (n, R) => {
  const out = new Float32Array(n * 3), r = 0.82;
  const cs: [number, number, number][] = [[0, 0, r]];
  for (let k = 0; k < 6; k++) cs.push([Math.cos((k * Math.PI) / 3 + Math.PI / 2) * r, Math.sin((k * Math.PI) / 3 + Math.PI / 2) * r, r]);
  cs.push([0, 0, r * 2]);
  for (let i = 0; i < n; i++) {
    const u = R();
    if (u < 0.78) {
      const c = cs[i % cs.length], a = R() * Math.PI * 2, rr = c[2] + (R() - 0.5) * 0.03;
      put(out, i, c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr, (R() - 0.5) * 0.06);
    } else if (u < 0.86) core(out, i, R, 0.2);
    else dust(out, i, R, 0.4, 2.6);
  }
  return out;
};

/** A sun of rays: a bright disc and sixteen rays. */
const rays: Maker = (n, R) => {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = R(), a = R() * Math.PI * 2;
    if (u < 0.36) {
      const r = Math.sqrt(R()) * 0.72;
      put(out, i, Math.cos(a) * r, Math.sin(a) * r, (R() - 0.5) * 0.12);
    } else if (u < 0.86) {
      const k = Math.round(a / (Math.PI / 8)) * (Math.PI / 8), long = Math.round(k / (Math.PI / 8)) % 2 ? 1.7 : 2.5;
      const r = 0.9 + Math.pow(R(), 1.4) * (long - 0.9);
      put(out, i, Math.cos(k) * r, Math.sin(k) * r, (R() - 0.5) * 0.05);
    } else dust(out, i, R, 0.8, 2.7);
  }
  return out;
};

const FORMS: Record<string, Maker> = {
  star,
  vortex,
  bloom,
  rays,
  point: (n, R): Shape => point(n, R, CY),
};
const SPEAK: [string, RGB][] = [
  ["bloom", PEARL],
  ["rays", GOLD],
  ["star", ROSE],
];

export class OracleVision {
  /** Where it stands and faces; its spin turns the form in its own plane. */
  private root = new THREE.Group();
  private spinG = new THREE.Group();
  private stage: VisionStage | null = null;
  private t = 0;
  private state: PresenceState = "quiet";
  private spin = 0;
  private spinVel = 0.05;
  private kick = 0;
  private said = 0;
  /** Seconds left before a closing presence is gone (−1 while open). */
  private going = -1;
  private dir = new THREE.Vector3();
  private right = new THREE.Vector3();
  private centre_ = new THREE.Vector3();

  /** `clearAhead`: how far along a direction before something solid (between near and max). */
  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private clearAhead: (from: THREE.Vector3, dir: THREE.Vector3, near: number, max: number) => number,
    private wanderer: () => THREE.Vector3,
  ) {
    this.root.add(this.spinG);
  }

  get open(): boolean {
    return !!this.stage && this.going < 0;
  }

  /** Its heart in the world, while it is here. */
  centre(): THREE.Vector3 | null {
    return this.stage ? this.root.getWorldPosition(this.centre_) : null;
  }

  /** Summoned: out of a point a little ahead of the view (raised over the question bar), facing it. */
  /** `above`: the view looks steeply down on the wanderer (the maze), whatever it shows this moment. */
  summon(above = false): void {
    if (this.stage && this.going >= 0) {
      // called back while it was going: it gathers again where it is
      this.going = -1;
      this.stage.retarget(this.t, "star", GOLD, 2.6);
      return;
    }
    if (this.stage) return;
    const cam = this.camera, at = this.wanderer();
    cam.updateMatrixWorld();
    if (cam.position.y - at.y > 40) {
      cam.getWorldDirection(this.dir);
      // a view from high above (the maze's eagle): in the air ahead of the view, a little above its middle
      this.right.crossVectors(this.dir, cam.up).normalize();
      this.dir.applyAxisAngle(this.right, 0.12).normalize();
      const d = Math.max(3.5, Math.min(AHEAD, this.clearAhead(cam.position, this.dir, 0, AHEAD + 1.4) - 1.4));
      this.root.position.copy(cam.position).addScaledVector(this.dir, d);
      this.root.scale.setScalar(d / AHEAD);
    } else if (above || cam.getWorldDirection(this.dir).y < -0.6) {
      // a steep view from above (the maze): hovering over the wanderer, a little up the screen
      this.dir.subVectors(at, cam.position).setY(0);
      if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 0, -1);
      this.root.position.copy(at).addScaledVector(this.dir.normalize(), 2.2).setY(at.y + 4.2);
      this.root.scale.setScalar(0.62);
    } else {
      // before the wanderer, the way the view looks (from the view through the wanderer), a little
      // over it in the air
      this.dir.subVectors(at, cam.position).setY(0);
      if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 0, -1);
      this.dir.normalize();
      const from = this.right.copy(at).setY(at.y + 1.5);
      const d = Math.max(3.5, Math.min(NEAR, this.clearAhead(from, this.dir, 0.6, NEAR + 1.4) - 1.4));
      this.root.position.copy(at).addScaledVector(this.dir, d).setY(at.y + 2.9);
      this.root.scale.setScalar(Math.max(0.55, d / NEAR));
    }
    // turned to the view (from above, it looks up at it)
    this.root.lookAt(cam.position);
    this.t = 0;
    this.spin = 0;
    this.spinVel = 0.05;
    this.going = -1;
    const st = new VisionStage({ at: new THREE.Vector3(0, -CY, 0), face: 0, forms: FORMS, keys: [], seedNum: 9091, pointSize: 0.034 });
    st.setKeys([
      { t: -1, form: "point", tint: GOLD, dur: 0.01 },
      { t: 0.15, form: "star", tint: GOLD, dur: 3.4 },
    ]);
    this.stage = st;
    this.spinG.add(st.group);
    this.scene.add(this.root);
    this.state = "quiet";
  }

  /** Let go: it draws into a point and is gone. */
  dismiss(): void {
    if (!this.stage || this.going >= 0) return;
    this.going = 2.2;
    this.stage.retarget(this.t, "point", PEARL, 1.7);
  }

  setState(s: PresenceState): void {
    if (s === this.state || !this.stage || this.going >= 0) return void (this.state = s);
    this.state = s;
    if (s === "thinking") this.stage.retarget(this.t, "vortex", LAVENDER, 1.8);
    else if (s === "speaking") {
      this.said = 0;
      this.stage.retarget(this.t, SPEAK[0][0], SPEAK[0][1], 2);
    } else this.stage.retarget(this.t, "star", GOLD, 2.8);
  }

  /** A sentence begins (or the answer arrives): a breath, and while speaking the next form. */
  pulse(): void {
    this.kick = 1;
    if (this.state === "speaking" && this.stage && this.going < 0) {
      const [f, c] = SPEAK[++this.said % SPEAK.length];
      this.stage.retarget(this.t, f, c, 2.2);
    }
  }

  update(dt: number, reduced: boolean): void {
    const st = this.stage;
    if (!st) return;
    this.t += dt;
    if (this.going >= 0) {
      this.going -= dt;
      if (this.going < 0) {
        st.dispose();
        this.stage = null;
        this.root.removeFromParent();
        this.going = -1;
        return;
      }
    }
    const want = this.state === "thinking" ? 0.85 : this.state === "speaking" ? 0.16 : 0.05;
    this.spinVel += (want - this.spinVel) * Math.min(1, dt * 1.1);
    if (!reduced) this.spin += this.spinVel * dt;
    this.spinG.rotation.z = this.spin;
    this.kick = Math.max(0, this.kick - dt * 0.8);
    const breath = reduced ? 1 : 1 + Math.sin(this.t * 0.9) * 0.025 + this.kick * 0.07 * Math.sin((1 - this.kick) * Math.PI);
    this.spinG.scale.setScalar(breath);
    st.update(dt, this.t, true, true, reduced);
  }
}
