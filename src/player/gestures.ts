/* The archetypes' own movements (Samuel: "time to really work on the animations for all of
   them"). Each of the twenty-two has a signature, drawn from its card and what the archive says
   of it, laid over the recorded clip as procedural motion of the skeleton: arms reach by two-bone
   IK to targets set around the shoulders and heart, the spine turns and bends, the head looks at
   what matters to it. Everything moves in slow, round curves (living things are never stiff).
   The same signatures drive the wanderer when, in a temple rite, it mirrors an archetype: an
   embodied contemplation, learning a gesture by making it.
   Frame: x the figure's right, y its up, z its front; metres for a figure of HEIGHT. */
import * as THREE from "three/webgpu";
/** Bone names as the loader keeps them (as `key` in wanderer.ts; not imported, to keep the two apart). */
const key = (name: string) => name.replace(/[\s.:/[\]]/g, "");

type Side = "L" | "R";
/** How the signature is being played. */
export interface Moment {
  /** Seconds, the figure's own clock. */
  t: number;
  /** 0–1: someone is near. */
  wake: number;
  /** 0–1: the rite is under way (the gesture opens fully). */
  rite: number;
  /** Seconds since the rite began. */
  rt: number;
  /** Where the one it meets is (world), if anyone. */
  other: THREE.Vector3 | null;
  reduced: boolean;
}

export class Rig {
  fwd = new THREE.Vector3();
  up = new THREE.Vector3();
  right = new THREE.Vector3();
  /** World metres per figure metre. */
  s = 1;
  private q = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  private v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private pool: THREE.Vector3[] = Array.from({ length: 64 }, () => new THREE.Vector3());
  private pi = 0;
  private sc = new THREE.Vector3();

  /** `frame`: the group the figure stands in (its front is local −z; its world scale is the
      figure's, over HEIGHT). */
  constructor(
    public bones: Record<string, THREE.Bone>,
    public frame: THREE.Object3D,
  ) {}

  /** Once a frame, after the clip has posed the skeleton. */
  begin(): void {
    this.pi = 0;
    this.frame.updateMatrixWorld(true);
    const q = this.frame.getWorldQuaternion(this.q[3]);
    this.fwd.set(0, 0, -1).applyQuaternion(q);
    this.up.set(0, 1, 0).applyQuaternion(q);
    this.right.set(1, 0, 0).applyQuaternion(q);
    this.s = this.frame.getWorldScale(this.sc).y;
  }

  private tmp(): THREE.Vector3 {
    const v = this.pool[this.pi++ % this.pool.length];
    return v.set(0, 0, 0);
  }

  has(name: string): boolean {
    return !!this.bones[key(name)];
  }

  /** A bone's place in the world. */
  P(name: string): THREE.Vector3 {
    const out = this.tmp();
    this.bones[key(name)]?.getWorldPosition(out);
    return out;
  }

  /** A point offset from `base` in the figure's frame (right, up, front), in figure metres. */
  at(base: THREE.Vector3, x: number, y: number, z: number): THREE.Vector3 {
    return this.tmp().copy(base).addScaledVector(this.right, x * this.s).addScaledVector(this.up, y * this.s).addScaledVector(this.fwd, z * this.s);
  }

  /** A direction in the figure's frame. */
  dir(x: number, y: number, z: number): THREE.Vector3 {
    return this.tmp().set(0, 0, 0).addScaledVector(this.right, x).addScaledVector(this.up, y).addScaledVector(this.fwd, z).normalize();
  }

  shoulder(side: Side, x: number, y: number, z: number): THREE.Vector3 {
    return this.at(this.P(`DEF-upper_arm.${side}`), x, y, z);
  }
  heart(x: number, y: number, z: number): THREE.Vector3 {
    return this.at(this.P("DEF-spine.003"), x, y, z);
  }
  hips(x: number, y: number, z: number): THREE.Vector3 {
    return this.at(this.P("DEF-hips"), x, y, z);
  }

  /** Rotate a bone by a world rotation, blended by k. */
  turn(name: string, rot: THREE.Quaternion, k: number): void {
    const b = this.bones[key(name)];
    if (!b || !b.parent || k <= 0) return;
    const w = b.getWorldQuaternion(this.q[0]);
    const pw = b.parent.getWorldQuaternion(this.q[1]);
    const r = this.q[2].identity().slerp(rot, Math.min(1, k));
    b.quaternion.copy(pw.invert().multiply(r.multiply(w)));
    b.updateMatrixWorld(true);
  }

  /** Bend about the figure's own axis: "right" nods forward/back (negative bows), "up" turns
      (positive turns to its left), "fwd" leans sideways. */
  bend(name: string, axis: "right" | "up" | "fwd", angle: number, k = 1): void {
    if (Math.abs(angle) < 1e-4) return;
    this.turn(name, this.q[3].setFromAxisAngle(this[axis], angle), k);
  }

  /** Point a bone (along its own +y) in a world direction. */
  aim(name: string, dir: THREE.Vector3, k: number): void {
    const b = this.bones[key(name)];
    if (!b || k <= 0) return;
    const cur = this.v[5].set(0, 1, 0).applyQuaternion(b.getWorldQuaternion(this.q[0]));
    this.turn(name, this.q[3].setFromUnitVectors(cur, this.tmp().copy(dir).normalize()), k);
  }

  /** Two bones bend so the third's root arrives at the target; the middle joint toward `pole`. */
  twoBone(upper: string, lower: string, end: string, target: THREE.Vector3, pole: THREE.Vector3, k: number): void {
    const U = this.bones[key(upper)], F = this.bones[key(lower)], H = this.bones[key(end)];
    if (!U || !F || !H || k <= 0) return;
    const [s, e, w, d, p] = this.v;
    U.getWorldPosition(s);
    F.getWorldPosition(e);
    H.getWorldPosition(w);
    const a = s.distanceTo(e), b = e.distanceTo(w);
    d.subVectors(target, s);
    const c = Math.min(Math.max(d.length(), 0.01), a + b - 0.002);
    d.normalize();
    const cosA = THREE.MathUtils.clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1);
    p.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
    const elbow = this.tmp().copy(s).addScaledVector(d, a * cosA).addScaledVector(p, a * Math.sqrt(1 - cosA * cosA));
    const from = this.tmp().subVectors(e, s).normalize(), to = this.tmp().subVectors(elbow, s).normalize();
    this.turn(upper, this.q[3].setFromUnitVectors(from, to), k);
    F.getWorldPosition(e);
    H.getWorldPosition(w);
    const from2 = this.tmp().subVectors(w, e).normalize(), to2 = this.tmp().subVectors(target, e).normalize();
    this.turn(lower, this.q[3].setFromUnitVectors(from2, to2), k);
  }

  /** A hand to a place; the elbow falls soft, out and down. */
  reach(side: Side, target: THREE.Vector3, k: number, pole?: THREE.Vector3): void {
    const sg = side === "R" ? 1 : -1;
    this.twoBone(`DEF-upper_arm.${side}`, `DEF-forearm.${side}`, `DEF-hand.${side}`, target, pole ?? this.dir(0.8 * sg, -0.6, -0.2), k);
  }

  /** Fingers pointing along a direction in the figure's frame. */
  point(side: Side, x: number, y: number, z: number, k: number): void {
    this.aim(`DEF-hand.${side}`, this.dir(x, y, z), k);
  }

  /** Neck and head turn toward a place (or a direction in the figure's frame). */
  look(target: THREE.Vector3 | [number, number, number], k: number): void {
    const head = this.P("DEF-head");
    const d = Array.isArray(target) ? this.dir(...target) : this.tmp().subVectors(target, head).normalize();
    const x = d.dot(this.right), y = d.dot(this.up), z = d.dot(this.fwd);
    const yaw = THREE.MathUtils.clamp(-Math.atan2(x, Math.max(0.05, z)), -1.0, 1.0);
    const pitch = THREE.MathUtils.clamp(Math.atan2(y, Math.hypot(x, z)), -0.7, 0.8);
    this.bend("DEF-neck", "up", yaw * 0.45, k);
    this.bend("DEF-head", "up", yaw * 0.55, k);
    this.bend("DEF-neck", "right", pitch * 0.45, k);
    this.bend("DEF-head", "right", pitch * 0.55, k);
  }
}

/* ---------------------------------------------------------------- the signatures */
const S = Math.sin, C = Math.cos;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** A slow wave 0–1. */
const wave = (t: number, rate: number, ph = 0) => 0.5 + 0.5 * S(t * rate + ph);
const mixN = (a: number, b: number, k: number) => a + (b - a) * k;

export type Signature = (r: Rig, m: Moment, k: number) => void;

/** Breath, for everyone: the chest rises a little, the head settles. */
function breathe(r: Rig, m: Moment, k: number, rate = 0.55): void {
  if (m.reduced) return;
  const b = S(m.t * rate);
  r.bend("DEF-spine.002", "right", 0.02 * b, k);
  r.bend("DEF-neck", "right", -0.015 * b, k);
}

export const SIGNATURES: Record<string, Signature> = {
  /* I, the Magician: consciousness, attention. The sphere of light is carried in a slow
     figure of eight before him and his gaze never leaves it; the other hand points to the earth.
     In the rite the sphere lifts high: as above, so below. */
  I(r, m, k) {
    breathe(r, m, k);
    const w = m.t * 0.32, lift = ease(m.rite);
    const orb = r.shoulder("R", mixN(0.16 + 0.13 * S(w), 0.04, lift), mixN(0.18 + 0.1 * S(w) * C(w) * 2, 0.62, lift), mixN(0.42, 0.18, lift));
    r.reach("R", orb, k);
    r.point("R", 0.1, 1, 0.3, k * 0.6);
    r.reach("L", r.shoulder("L", -0.2, -0.55, 0.2), k);
    r.point("L", -0.1, -1, 0.15, k * 0.8);
    r.look(orb, k * (0.6 + 0.4 * m.wake));
  },

  /* II, the High Priestess: the unconscious, the veil. Hands at rest in her lap, she is almost
     wholly still; her head turns slowly aside, as if listening past you. In the rite she lifts her
     face to you: the veil answers stillness. */
  II(r, m, k) {
    breathe(r, m, k, 0.35);
    for (const [side, sg] of [["L", -1], ["R", 1]] as const) {
      r.reach(side, r.hips(0.09 * sg, 0.14, 0.26), k, r.dir(0.9 * sg, -0.2, -0.3));
      r.point(side, -0.4 * sg, -0.2, 1, k * 0.6);
    }
    const lift = ease(m.rite);
    r.bend("DEF-head", "fwd", 0.14 * S(m.t * 0.17) * (1 - lift), k);
    r.look(m.other && lift > 0 ? m.other : [0.25 * S(m.t * 0.11), -0.25, 1], k * (0.5 + 0.5 * lift));
  },

  /* III, the Empress: catalyst, all that comes to you. Seated, she opens her arms, palms up, as if
     to rain, and gathers them in again; the face lifts with the opening. */
  III(r, m, k) {
    breathe(r, m, k);
    const open = mixN(wave(m.t, 0.3), 1, ease(m.rite));
    for (const [side, sg] of [["L", -1], ["R", 1]] as const) {
      r.reach(side, r.shoulder(side, (0.14 + 0.32 * open) * sg, -0.3 + 0.16 * open, 0.3 - 0.06 * open), k);
      r.point(side, 0.5 * sg, 0.25, 1, k * 0.5);
    }
    r.look([0, -0.1 + 0.4 * open, 1], k * 0.7);
  },

  /* IV, the Emperor: experience, order held. Upright, the sphere steady before his chest, the
     other hand on his knee; his gaze moves slowly and deliberately across his domain. In the rite
     he raises the sphere to the height of his eyes, and lowers it. */
  IV(r, m, k) {
    breathe(r, m, k, 0.4);
    const raise = S(Math.min(1, m.rt / 14) * Math.PI) * ease(m.rite);
    const orb = r.heart(0.1, 0.02 + 0.03 * S(m.t * 0.25) + 0.36 * raise, 0.34);
    r.reach("R", orb, k);
    r.point("R", 0, 1, 0.4, k * 0.4);
    r.reach("L", r.hips(-0.2, 0.1, 0.42), k, r.dir(-1, 0, 0));
    r.point("L", 0, -0.6, 1, k * 0.5);
    r.look(raise > 0.1 ? orb : [0.45 * S(m.t * 0.1), -0.05, 1], k * 0.7);
  },

  /* V, the Hierophant: the will to know. His right hand holds the staff of three rings, his left
     is raised, open; his gaze goes from one kneeling light to the other, and in the rite to you:
     why do you seek? */
  V(r, m, k) {
    breathe(r, m, k, 0.4);
    r.reach("R", r.at(r.hips(0, 0, 0), 0.52, 0.55, 0.05), k, r.dir(1, -0.3, -0.5));
    r.point("R", 0, 1, 0, k * 0.5);
    r.reach("L", r.shoulder("L", -0.12, 0.18 + 0.03 * S(m.t * 0.4), 0.26), k);
    r.point("L", 0, 1, 0.25, k * 0.8);
    const side = S(m.t * 0.09) > 0 ? 1 : -1;
    const kneel = r.at(r.hips(0, 0, 0), 0.75 * side, -0.2, 1.05);
    r.look(m.other && m.rite > 0.3 ? m.other : kneel, k * 0.6);
  },

  /* VI, the Lovers: transformation by choosing. Between two companions, the body turns to one and
     then the other; the hands hang open, undecided. In the rite they come to the heart. */
  VI(r, m, k) {
    breathe(r, m, k);
    const c = ease(m.rite);
    const sway = S(m.t * 0.16);
    r.bend("DEF-spine.001", "up", -0.18 * sway * (1 - c), k);
    r.bend("DEF-spine.002", "up", -0.14 * sway * (1 - c), k);
    for (const [side, sg] of [["L", -1], ["R", 1]] as const) {
      const hang = r.shoulder(side, 0.24 * sg, -0.52, 0.12);
      const heart = r.heart(0.035 * sg, 0.1, 0.2);
      r.reach(side, hang.lerp(heart, c), k, r.dir(0.9 * sg, -0.5, c * -0.3));
      r.point(side, 0.2 * sg, -1 + 1.8 * c, 0.4 + 0.3 * c, k * 0.5);
    }
    r.look([0.8 * sway * (1 - c), -0.05, 1], k * 0.8);
  },

  /* VII, the Chariot: the way, will as quiet mastery. Hands forward as if on reins that are not
     pulled; the body rides a slow swell; the gaze is far ahead. */
  VII(r, m, k) {
    breathe(r, m, k, 0.4);
    const ride = m.reduced ? 0 : S(m.t * 0.8) * (0.4 + 0.6 * ease(m.rite));
    r.bend("DEF-spine.001", "fwd", 0.03 * ride, k);
    r.bend("DEF-spine.001", "right", -0.03 - 0.02 * ride, k);
    for (const [side, sg] of [["L", -1], ["R", 1]] as const) {
      r.reach(side, r.shoulder(side, 0.16 * sg, -0.36 + 0.02 * ride, 0.4), k, r.dir(0.8 * sg, -0.6, 0));
      r.point(side, 0.1 * sg, -0.2, 1, k * 0.5);
    }
    r.look([0, 0.02, 1], k * 0.7);
  },

  /* VIII, Strength: the body's ceaseless, balanced work, and gentleness. She leans to the lion and
     rests a hand on its mane; the other hand is at her heart. They breathe together. */
  VIII(r, m, k) {
    breathe(r, m, k, 0.45);
    const lean = 0.18 + 0.1 * ease(m.rite);
    r.bend("DEF-spine.001", "right", -lean * 0.6, k);
    r.bend("DEF-spine.002", "right", -lean * 0.4, k);
    r.bend("DEF-spine.001", "up", -0.2, k);
    const mane = r.at(r.hips(0, 0, 0), 0.6, -0.05 + 0.03 * S(m.t * 0.45), 0.9);
    r.reach("R", mane, k, r.dir(1, -0.2, 0));
    r.point("R", 0.2, -0.7, 0.6, k * 0.6);
    r.reach("L", r.heart(-0.04, 0.08, 0.2), k, r.dir(-1, -0.5, 0));
    r.look(mane, k * 0.7);
  },

  /* IX, the Hermit: wisdom, the lamp that is not his own. The lamp is raised and slowly carried
     forward to light a way; he looks down the path it shows. */
  IX(r, m, k) {
    breathe(r, m, k, 0.35);
    const raise = 0.2 + 0.08 * S(m.t * 0.2) + 0.2 * ease(m.rite);
    r.bend("DEF-spine.001", "right", -0.08, k);
    r.bend("DEF-neck", "right", -0.1, k);
    const lamp = r.shoulder("R", 0.1, raise, 0.36 + 0.05 * S(m.t * 0.13));
    r.reach("R", lamp, k);
    r.point("R", 0, 1, 0.2, k * 0.5);
    r.reach("L", r.shoulder("L", -0.14, -0.3, 0.28), k);
    r.look(r.at(lamp, 0, -1.2, 2.4), k * 0.6);
  },

  /* X, the Wheel of Fortune: others, catalyst turning. One hand turns a great slow circle before
     him, in time with the wheel behind; the other is open, palm out. The head follows the rim. */
  X(r, m, k) {
    breathe(r, m, k);
    const w = m.t * (0.12 + 0.18 * ease(m.rite)) * 4;
    const rim = r.shoulder("R", 0.16 + 0.16 * C(w), 0.04 + 0.16 * S(w), 0.42);
    r.reach("R", rim, k);
    r.point("R", C(w) * 0.6, S(w) * 0.6, 0.6, k * 0.5);
    r.reach("L", r.shoulder("L", -0.36, -0.28, 0.14), k);
    r.point("L", -0.6, 0.4, 0.5, k * 0.5);
    r.look(rim, k * 0.4);
  },

  /* XI, Justice: experience weighed, a seed for growth. Seated, the scales held out in one hand,
     rising and falling a little as they tip; the sword upright in the other. The face does not
     move. In the rite the scales come level and are still. */
  XI(r, m, k) {
    breathe(r, m, k, 0.3);
    const tip = S(m.t * 0.55) * (1 - ease(m.rite));
    r.reach("L", r.shoulder("L", -0.12, -0.1 + 0.035 * tip, 0.44), k);
    r.point("L", 0, 0.2, 1, k * 0.5);
    r.reach("R", r.shoulder("R", 0.16, -0.22, 0.3), k);
    r.point("R", 0, 1, 0.05, k * 0.7);
    r.look([0, 0, 1], k * 0.7);
  },

  /* XII, the Hanged Man: surrender (the archive leaves him open). Head down from one foot, the
     other leg folded behind, hands behind the back; he turns like a slow pendulum. In the rite
     even that stops. */
  XII(r, m, k) {
    breathe(r, m, k, 0.3);
    for (const [side, sg] of [["L", -1], ["R", 1]] as const) {
      r.reach(side, r.hips(0.06 * sg, 0.12, -0.22), k, r.dir(0.8 * sg, 0.2, -0.6));
    }
    r.bend("DEF-thigh.L", "right", 0.35, k);
    r.bend("DEF-shin.L", "right", -1.5, k);
    r.look([0, -0.1, 1], k * 0.4);
  },

  /* XIII, Death: the daily death and rebirth. Both hands on the scythe, a long slow sweep low over
     the ground, the body turning with it: what is finished is cut, gently. */
  XIII(r, m, k) {
    breathe(r, m, k, 0.4);
    const w = S(m.t * (0.35 + 0.1 * ease(m.rite)));
    r.bend("DEF-spine.001", "up", -0.22 * w, k);
    r.bend("DEF-spine.002", "up", -0.14 * w, k);
    r.bend("DEF-spine.001", "right", -0.12, k);
    const grip = r.hips(0.12 + 0.3 * w, 0.28, 0.4);
    r.reach("R", grip, k);
    r.reach("L", r.at(grip, -0.04, 0.3, -0.06), k);
    r.point("R", 0.1, 1, 0.1, k * 0.4);
    r.look(r.at(r.hips(0, 0, 0), 0.6 * w, -1, 1.6), k * 0.5);
  },

  /* XIV, Temperance: the body as the athanor. Light poured from cup to cup: the hands rise and fall
     in turn, the higher tilting toward the lower, and change places. The gaze follows the pour. */
  XIV(r, m, k) {
    breathe(r, m, k, 0.45);
    const p = S(m.t * (0.3 + 0.15 * ease(m.rite)));
    const L = r.shoulder("L", -0.1, -0.2 + 0.14 * p, 0.36), R = r.shoulder("R", 0.1, -0.2 - 0.14 * p, 0.36);
    r.reach("L", L, k);
    r.reach("R", R, k);
    r.point("L", 0.5 + 0.4 * p, 0.6, 0.6, k * 0.6);
    r.point("R", -0.5 + 0.4 * p, 0.6, 0.6, k * 0.6);
    r.look(p > 0 ? R : L, k * 0.5);
  },

  /* XV, the Devil: the spirit's dark matrix, which is not evil: the light-bringer. The torch held
     high, the other hand points to the earth, the gaze on the two below. In the rite the torch comes
     down to the heart: the cords were always loose. */
  XV(r, m, k) {
    breathe(r, m, k, 0.4);
    const down = ease(m.rite);
    r.reach("R", r.shoulder("R", 0.14 - 0.1 * down, 0.46 - 0.62 * down, 0.1 + 0.2 * down), k);
    r.point("R", 0, 1, 0.1 + 0.3 * down, k * 0.5);
    r.reach("L", r.shoulder("L", -0.22, -0.55, 0.16), k);
    r.point("L", -0.15, -1, 0.2, k * 0.8);
    r.look(m.other && down > 0.5 ? m.other : [0, -0.35, 1], k * 0.6);
  },

  /* XVI, the Tower: lightning, sudden seeing. The face turned up to the struck tower; at each flash
     the arms open wide, then fall slowly: not terror, release. */
  XVI(r, m, k) {
    breathe(r, m, k);
    const flash = Math.max(0, S(m.t * 0.9) - 0.9) * 10; // in time with the bolt
    const open = Math.min(1, flash + ease(m.rite) * 0.6);
    for (const [side, sg] of [["L", -1], ["R", 1]] as const) {
      r.reach(side, r.shoulder(side, (0.2 + 0.3 * open) * sg, -0.45 + 0.6 * open, 0.2), k);
      r.point(side, 0.5 * sg, 0.3 + 0.5 * open, 0.4, k * 0.5);
    }
    r.bend("DEF-spine.002", "right", 0.08 * open, k);
    r.look([-0.5, 0.9, 0.4], k * 0.8);
  },

  /* XVII, the Star: faith, the pouring regardless. Kneeling by the water, she pours from both
     vessels, one then the other; her face lifts to the star between pourings. */
  XVII(r, m, k) {
    breathe(r, m, k, 0.4);
    const p = S(m.t * 0.28);
    for (const [side, sg] of [["L", -1], ["R", 1]] as const) {
      const pour = Math.max(0, p * sg);
      r.reach(side, r.shoulder(side, 0.2 * sg, -0.3 - 0.06 * pour, 0.46), k);
      r.point(side, 0.3 * sg, -0.2 - 0.6 * pour, 1, k * 0.6);
    }
    const up = mixN(wave(m.t, 0.14), 1, ease(m.rite));
    r.look([0, -0.5 + 1.4 * up, 1], k * 0.7);
  },

  /* XVIII, the Moon: the spirit's experience, the light that deceives or uncovers. She feels her
     way: weight moves from foot to foot, the hands forward in the half-light, the head turning
     between the pale form and the dark. In the rite she stands still and looks up. */
  XVIII(r, m, k) {
    breathe(r, m, k, 0.35);
    const c = ease(m.rite), sw = S(m.t * 0.22) * (1 - c);
    r.bend("DEF-spine.001", "fwd", 0.06 * sw, k);
    r.bend("DEF-hips", "fwd", -0.04 * sw, k);
    for (const [side, sg] of [["L", -1], ["R", 1]] as const) {
      r.reach(side, r.shoulder(side, 0.2 * sg, -0.32 + 0.04 * S(m.t * 0.5 + sg), 0.36 + 0.08 * sw * sg), k);
      r.point(side, 0.2 * sg, 0.1, 1, k * 0.5);
    }
    r.look([0.7 * sw, 0.1 + 0.8 * c, 1], k * 0.8);
  },

  /* XIX, the Sun: the self that radiates or absorbs. The arms open wide and high, offering, and
     come back to the heart, receiving; a slow tide of the two. In the rite they stay open. */
  XIX(r, m, k) {
    breathe(r, m, k);
    const o = mixN(wave(m.t, 0.26), 1, ease(m.rite));
    for (const [side, sg] of [["L", -1], ["R", 1]] as const) {
      const open = r.shoulder(side, 0.55 * sg, 0.3, 0.2);
      const heart = r.heart(0.04 * sg, 0.1, 0.2);
      r.reach(side, heart.lerp(open, o), k, r.dir(0.8 * sg, -0.6, -0.2));
      r.point(side, 0.7 * sg * o, 0.6 * o + 0.4, 0.5, k * 0.5);
    }
    r.bend("DEF-spine.002", "right", 0.06 * o, k);
    r.look([0, 0.15 + 0.5 * o, 1], k * 0.6);
  },

  /* XX, Judgement: the sarcophagus, matter transformed into the infinite. The arms rise slowly from
     low to high, the face with them, answering a call; and fall, and rise again. */
  XX(r, m, k) {
    breathe(r, m, k, 0.4);
    const u = mixN(wave(m.t, 0.22, -1.5), 1, ease(m.rite));
    for (const [side, sg] of [["L", -1], ["R", 1]] as const) {
      r.reach(side, r.shoulder(side, (0.16 + 0.2 * u) * sg, -0.42 + 0.95 * u, 0.26 - 0.08 * u), k);
      r.point(side, 0.2 * sg, 0.4 + 0.6 * u, 0.3, k * 0.5);
    }
    r.bend("DEF-spine.002", "right", 0.1 * u, k);
    r.look([0, -0.1 + 0.9 * u, 1], k * 0.7);
  },

  /* XXI, the World (the archive leaves it open): the dancer. Seated at the harp, one hand plays
     slow strokes, the other drifts in a circle; the body sways as if it could dance. */
  XXI(r, m, k) {
    breathe(r, m, k);
    const d = m.reduced ? 0 : S(m.t * 0.5) * (1 + ease(m.rite));
    r.bend("DEF-spine.001", "fwd", 0.07 * d, k);
    r.bend("DEF-spine.002", "fwd", 0.05 * d, k);
    const harp = r.at(r.hips(0, 0, 0), 0.3, 0.2 + 0.18 * S(m.t * 1.1), 0.55);
    r.reach("R", harp, k);
    r.point("R", -0.3, -0.2, 1, k * 0.5);
    const a = m.t * 0.45;
    r.reach("L", r.shoulder("L", -0.3 + 0.1 * C(a), 0.05 + 0.14 * S(a), 0.24), k);
    r.point("L", -0.5, 0.6, 0.4, k * 0.5);
    r.bend("DEF-head", "fwd", -0.1 * d, k);
  },

  /* XXII, the Choice: the one who steps off in trust. The bindle over the shoulder, the flowering
     staff in the other hand; he leans a little forward, weight on the front foot, face lifted to the
     eclipse: about to step. */
  XXII(r, m, k) {
    breathe(r, m, k);
    const lean = 0.05 + 0.03 * S(m.t * 0.4) + 0.06 * ease(m.rite);
    r.bend("DEF-spine.001", "right", -lean, k);
    r.reach("L", r.shoulder("L", 0.04, 0.12, -0.02), k, r.dir(-1, -0.3, 0.3));
    r.reach("R", r.shoulder("R", 0.2, -0.32, 0.3), k);
    r.point("R", 0, 1, 0.2, k * 0.5);
    r.look([0, 0.55 + 0.2 * ease(m.rite), 1], k * 0.7);
  },
};
