/* Laying hands on the world (Samuel: "a way to sort of channel and interact with the world
   around us, hugging trees, kneeling and touching the ground, rocks… triggered when you hold tap
   on an element. And the hand transfers subtle energy, almost like talking to it").

   Hold a finger (or the mouse) on a tree, a rock, a crystal or open ground. The wanderer walks
   there and takes the posture that belongs to it: arms around the trunk; kneeling, a palm on the
   earth; both palms on a stone. Then a slow conversation, one breath at a time:
   - the giving (in-breath): fine light flows from the palms into the thing, gold;
   - the answer: the thing replies in its own light and its own note (a tree's light rises into
     the crown and runs out along the roots, a stone's rings of light race over it, a crystal
     rings bright, the earth gathers light from all around toward the palm);
   - the receiving (out-breath): its light, in its own colour, flows back into the hands.
   The stick, the button or a tap elsewhere lets go. Nothing is asked, nothing is scored. */
import * as THREE from "three/webgpu";
import { softPoints, spriteCloud, T, viewDepth, type SpriteCloud, softDot, pointR } from "../gpu/tsl";
import { heightAt, WATER_Y } from "./terrain";
import { creationUniforms, type Creation } from "./creation";
import type { Controller } from "../player/controller";
import type { TouchPose, Wanderer } from "../player/wanderer";

export type TouchKind = "tree" | "rock" | "crystal" | "ground";
interface Target {
  kind: TouchKind;
  pose: TouchPose;
  centre: THREE.Vector3; // the thing's axis at its foot (the earth: the touched point)
  r: number; // its radius where the hands go
  contact: THREE.Vector3; // where the palms rest
  stand: THREE.Vector2; // where the wanderer stands (or kneels)
  face: number; // heading toward it
  hue: THREE.Color; // its own light
}

const PERIOD = 6.4; // one breath of the conversation (seconds)
const GIVE = [0.2, 2.6] as const; // the hands give
const ANSWER = 2.9; // it answers
const RECEIVE = [3.2, 5.8] as const; // its light comes back into the hands
const N = 90;
// the notes: each thing answers in its own voice, stepping through a pentatonic as the talk goes
// on (all above ~200 Hz, for a phone's speaker)
const VOICE: Record<TouchKind, number> = { tree: 220, rock: 246.94, crystal: 659.25, ground: 261.63 };
const STEPS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];

export interface TouchHooks {
  bell(f: number, gain: number, dur: number): void;
  sparks(at: THREE.Vector3, n: number, c: THREE.Color, spread: number): void;
}

export class Touch {
  points: THREE.Sprite;
  phase: "none" | "going" | "touching" = "none";
  target: Target | null = null;
  /** For main.ts: a stone or crystal being touched vibrates with light (etching.ts vibe). */
  vibe = 0;
  /** How far the body leans in toward a trunk it holds (metres). */
  lean = 0;
  private t = 0;
  private cycle = 0;
  private answers = 0;
  private going = 0;
  private cloud: SpriteCloud;
  private pos: Float32Array;
  private alpha: Float32Array;
  private tint: Float32Array;
  private seed = new Float32Array(N * 4);
  private uDpr = T.uniform(1);
  private hands = [new THREE.Vector3(), new THREE.Vector3()];
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor(private creation: Creation, private wanderer: Wanderer, private player: Controller, private hooks: TouchHooks) {
    const mat = softPoints();
    this.cloud = spriteCloud(N, { position: 3, aAlpha: 1, aTint: 3 }, mat);
    this.pos = this.cloud.attrs.position.array as Float32Array;
    this.alpha = this.cloud.attrs.aAlpha.array as Float32Array;
    this.tint = this.cloud.attrs.aTint.array as Float32Array;
    for (let i = 0; i < N * 4; i++) this.seed[i] = Math.random();
    const { clamp, float, max, vec4 } = T;
    const { position, aAlpha, aTint } = this.cloud.nodes;
    // fine, soft motes: a subtle current, never a beam
    mat.sizeNode = clamp(float(20).div(max(viewDepth(position), 0.4)), float(1).div(this.uDpr), 6);
    mat.colorNode = vec4(aTint.mul(softDot(pointR()).mul(1.22)).mul(aAlpha).mul(1.0), 1);
    this.points = this.cloud.sprite;
    this.points.visible = false;
  }

  get active(): boolean {
    return this.phase !== "none";
  }

  /** A long press at a screen point: what is there to touch? Begins walking to it. */
  pick(sx: number, sy: number, camera: THREE.Camera, ground: THREE.Vector3 | null): boolean {
    const p = this.player.pos;
    const s = new THREE.Vector3();
    let best: ReturnType<Creation["touchables"]>[number] | null = null, bd = Infinity;
    for (const c of this.creation.touchables()) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 36) continue;
      // a trunk: anywhere along it from the foot to well above the head; a stone: on its face
      const lifts = c.kind === "tree" ? [0.4, 1.2, 2.0, 2.8] : [0];
      const reach = c.kind === "tree" ? Math.max(40, innerHeight * 0.05) : 14 + (c.r * 0.8 * innerHeight) / Math.max(1, d);
      for (const lift of lifts) {
        s.set(c.x, (c.kind === "tree" ? heightAt(c.x, c.z) : c.y) + lift, c.z).project(camera);
        if (s.z > 1) continue;
        const px = (s.x * 0.5 + 0.5) * innerWidth, py = (-s.y * 0.5 + 0.5) * innerHeight;
        const sd = Math.hypot(px - sx, py - sy);
        if (sd < reach && sd / reach < bd) {
          bd = sd / reach;
          best = c;
        }
      }
    }
    let t: Target | null = null;
    if (best) t = this.shape(best.kind, new THREE.Vector3(best.x, best.y, best.z), best.r, best.h);
    else if (ground && ground.distanceTo(p) < 36 && heightAt(ground.x, ground.z) > WATER_Y + 0.05) t = this.shape("ground", ground, 0, 0);
    if (!t) return false;
    this.target = t;
    this.phase = "going";
    this.going = 0;
    this.player.target = t.stand.clone();
    return true;
  }

  /** Where to stand and where the hands go, for each kind of thing. */
  private shape(kind: TouchKind, at: THREE.Vector3, r: number, h: number): Target {
    const p = this.player.pos;
    const away = new THREE.Vector2(p.x - at.x, p.z - at.z);
    if (away.lengthSq() < 1e-4) away.set(0, 1);
    away.normalize();
    const hue = new THREE.Color();
    let pose: TouchPose, standD: number;
    const centre = at.clone();
    const contact = new THREE.Vector3();
    if (kind === "tree") {
      // the trunk where the arms go (at chest height; trunks lean, so not over the foot)
      centre.y = heightAt(at.x, at.z);
      const tr = this.creation.trunkAt(at.x, at.z, 1.2);
      const chest = tr?.centre ?? new THREE.Vector3(at.x, centre.y + 1.2, at.z);
      const R = tr?.r ?? r * 0.95;
      away.set(p.x - chest.x, p.z - chest.z);
      if (away.lengthSq() < 1e-4) away.set(0, 1);
      away.normalize();
      pose = "hug";
      // stand just clear of the trunk's foot (its collider holds the body off), the chest near it
      const clear = r * 1.1 + 0.31;
      let d = R + 0.3;
      while (Math.hypot(chest.x + away.x * d - at.x, chest.z + away.y * d - at.z) < clear && d < 3) d += 0.05;
      standD = d;
      contact.set(chest.x + away.x * R, chest.y, chest.z + away.y * R);
      centre.set(chest.x, chest.y, chest.z);
      hue.setRGB(1.0, 0.8, 0.5);
      r = R;
      const stand = new THREE.Vector2(chest.x + away.x * standD, chest.z + away.y * standD);
      const face = Math.atan2(-(chest.x - stand.x), -(chest.z - stand.y));
      // how far the body may lean in: until the chest meets the bark, no further
      this.lean = THREE.MathUtils.clamp(standD - (R + 0.24), 0, 0.35);
      return { kind, pose, centre, r, contact, stand, face, hue };
    } else if (kind === "ground") {
      pose = "ground";
      standD = 0.55;
      centre.y = heightAt(at.x, at.z);
      contact.copy(centre);
      hue.setRGB(0.75, 1.0, 0.7);
    } else {
      const foot = heightAt(at.x, at.z);
      const top = kind === "crystal" ? at.y + h * 0.5 : at.y + r * 0.45;
      const low = top - foot < 0.8;
      centre.y = foot;
      pose = low ? "low" : "palms";
      const rr = kind === "crystal" ? r * 0.55 : r * 0.8;
      const hy = low ? top : Math.min(top - 0.15, foot + 1.15);
      contact.set(at.x + away.x * (low ? rr * 0.55 : rr), hy, at.z + away.y * (low ? rr * 0.55 : rr));
      standD = Math.max(rr + (low ? 0.55 : 0.42), (kind === "crystal" ? r * 0.65 : r > 0.66 ? r * 0.82 : 0) + 0.31);
      if (kind === "crystal") hue.setHSL(Math.random(), 0.55, 0.75);
      else hue.setRGB(1.0, 0.86, 0.62);
      r = rr;
    }
    const stand = new THREE.Vector2(at.x + away.x * standD, at.z + away.y * standD);
    const face = Math.atan2(-(at.x - stand.x), -(at.z - stand.y));
    return { kind, pose, centre, r, contact, stand, face, hue };
  }

  /** Let go (the stick, the button, a tap elsewhere, the map). */
  stop(): void {
    if (this.phase === "none") return;
    this.phase = "none";
    this.target = null;
    if (this.wanderer.gesture === "touch") this.wanderer.setGesture("none");
    if (this.player.target) this.player.target = null;
  }

  update(dt: number, dpr: number, moved: boolean, reduced: boolean): void {
    const U = creationUniforms;
    this.uDpr.value = dpr;
    const T0 = this.target;
    if (T0 && (moved || this.player.flying || this.player.swimming)) this.stop();
    if (this.phase === "going" && T0) {
      this.going += dt;
      const d = Math.hypot(this.player.pos.x - T0.stand.x, this.player.pos.z - T0.stand.y);
      // arrived, or as near as the thing allows (a trunk or a stone holds the body off)
      if (d < 0.45 || (this.going > 0.8 && d < 1.3 && this.player.speed < 0.3)) {
        this.phase = "touching";
        this.t = 0;
        this.cycle = 0;
        this.answers = 0;
        this.player.target = null;
        this.wanderer.setGesture("touch");
        const W = this.wanderer.touching;
        W.pose = T0.pose;
        W.contact.copy(T0.contact);
        W.centre.copy(T0.centre);
        W.r = T0.r;
        W.lean = T0.pose === "hug" ? this.lean : 0;
      } else if (!this.player.target) {
        // the walk was cut short (something else took the course): let go
        if (this.going > 0.3) this.stop();
      }
    }
    const touching = this.phase === "touching" && !!T0;
    if (touching && T0) {
      this.t += dt;
      // settle into place: face it, stand where the pose wants
      const p = this.player.pos;
      const k = Math.min(1, dt * 3);
      p.x += (T0.stand.x - p.x) * k;
      p.z += (T0.stand.y - p.z) * k;
      let dh = T0.face - this.player.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.player.heading += dh * Math.min(1, dt * 4);
      this.player.vel.set(0, 0, 0);
      const c = (this.t - 1.2) % PERIOD; // the first breath begins once the body has settled
      this.wanderer.touching.breath = ((this.t - 1.2) / PERIOD) * Math.PI * 2 - Math.PI / 2;
      if (this.t > 1.2) {
        const n = Math.floor((this.t - 1.2) / PERIOD); // which breath
        if (c >= GIVE[0] && n >= this.cycle) {
          // the hands give: one soft note
          this.cycle = n + 1;
          this.hooks.bell(392 * (n % 2 ? 9 / 8 : 1), 0.022, 3.2);
        }
        if (c >= ANSWER && n >= this.answers) {
          this.answers = n + 1;
          this.answer(T0);
        }
      }
    }
    // the tree's own light (creation.ts bark and roots): held, and each answer a rising wave
    U.uTouchK.value += ((touching && T0?.kind === "tree" ? 1 : 0) - U.uTouchK.value) * Math.min(1, dt * 1.5);
    U.uTouchWave.value += dt;
    if (T0 && touching) U.uTouchPos.value.copy(T0.contact);
    this.vibe += ((touching && (T0?.kind === "rock" || T0?.kind === "crystal") ? 1 : 0) - this.vibe) * Math.min(1, dt * 1.2);
    this.motes(touching, reduced);
  }

  /** It answers: its own note, its own light. */
  private answer(t: Target): void {
    const step = STEPS[(this.answers - 1) % STEPS.length];
    const f = VOICE[t.kind] * step;
    this.hooks.bell(f, t.kind === "crystal" ? 0.035 : 0.05, t.kind === "crystal" ? 5 : 6);
    if (t.kind !== "crystal") this.hooks.bell(f * 1.5, 0.018, 4);
    creationUniforms.uTouchWave.value = 0;
    const c = t.hue;
    if (t.kind === "tree") {
      // light rises into the crown and falls as glints
      for (let k = 0; k < 4; k++) this.hooks.sparks(this.v.set(t.centre.x, t.centre.y + 2.5 + k * 0.9, t.centre.z), 5, c, 0.9);
    } else if (t.kind === "ground") {
      // the earth: glints rise in a ring around the palm, spreading outward
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2, rr = 1.2 + Math.random() * 2.2;
        const x = t.contact.x + Math.cos(a) * rr, z = t.contact.z + Math.sin(a) * rr;
        this.hooks.sparks(this.v.set(x, heightAt(x, z) + 0.1, z), 2, c, 0.25);
      }
    } else this.hooks.sparks(this.v.copy(t.contact).setY(t.contact.y + 0.3), 10, c, 0.6);
  }

  /** The current between hands and thing: out from the palms while giving, back while receiving. */
  private motes(on: boolean, reduced: boolean): void {
    const t0 = this.target;
    this.points.visible = on;
    if (!on || !t0) return;
    this.wanderer.handPos("L", this.hands[0]);
    this.wanderer.handPos("R", this.hands[1]);
    const c = (this.t - 1.2) % PERIOD;
    const settle = THREE.MathUtils.smoothstep(this.t, 0.8, 2.2);
    const giveK = settle * THREE.MathUtils.smoothstep(c, GIVE[0], GIVE[0] + 0.5) * (1 - THREE.MathUtils.smoothstep(c, GIVE[1] - 0.4, GIVE[1] + 0.2));
    const recvK = settle * THREE.MathUtils.smoothstep(c, RECEIVE[0], RECEIVE[0] + 0.5) * (1 - THREE.MathUtils.smoothstep(c, RECEIVE[1] - 0.5, RECEIVE[1]));
    const both = t0.pose !== "ground";
    const time = this.t * (reduced ? 0.4 : 1);
    for (let i = 0; i < N; i++) {
      const s0 = this.seed[i * 4], s1 = this.seed[i * 4 + 1], s2 = this.seed[i * 4 + 2], s3 = this.seed[i * 4 + 3];
      const giving = i < N / 2;
      const hand = this.hands[both ? i % 2 : 1];
      const u = (time * (0.35 + s0 * 0.3) + s1) % 1;
      // where its light comes from, receiving: the tree's heights, the earth around, the stone's face
      if (giving) {
        this.from.copy(hand);
        this.to.copy(t0.contact).add(this.v.set((s2 - 0.5) * 0.35, (s3 - 0.5) * 0.3, (s1 - 0.5) * 0.35));
      } else {
        if (t0.kind === "tree") this.from.set(t0.centre.x + (s2 - 0.5) * 0.5, t0.centre.y + 1.6 + s3 * 3.5, t0.centre.z + (s1 - 0.5) * 0.5);
        else if (t0.kind === "ground") {
          const a = s2 * Math.PI * 2, rr = 0.8 + s3 * 3;
          const x = t0.contact.x + Math.cos(a) * rr, z = t0.contact.z + Math.sin(a) * rr;
          this.from.set(x, heightAt(x, z) + 0.05, z);
        } else this.from.copy(t0.contact).add(this.v.set((s2 - 0.5) * t0.r * 1.4, (s3 - 0.3) * t0.r, (s1 - 0.5) * t0.r * 1.4));
        this.to.copy(hand);
      }
      // a gentle arc with a slow spiral about the line
      const x = this.from.x + (this.to.x - this.from.x) * u, y = this.from.y + (this.to.y - this.from.y) * u, z = this.from.z + (this.to.z - this.from.z) * u;
      const a = s0 * 6.28 + u * 5 + time * 0.8, sw = Math.sin(u * Math.PI) * (giving ? 0.05 : 0.12);
      const j = i * 3;
      this.pos[j] = x + Math.cos(a) * sw;
      this.pos[j + 1] = y + Math.sin(u * Math.PI) * (giving ? 0.04 : 0.15) + Math.sin(a) * sw * 0.5;
      this.pos[j + 2] = z + Math.sin(a) * sw;
      this.alpha[i] = Math.sin(u * Math.PI) * (giving ? giveK : recvK) * (0.5 + s3 * 0.5);
      const col = giving ? GOLD : t0.hue;
      this.tint[j] = col.r;
      this.tint[j + 1] = col.g;
      this.tint[j + 2] = col.b;
    }
    this.cloud.attrs.position.needsUpdate = this.cloud.attrs.aAlpha.needsUpdate = this.cloud.attrs.aTint.needsUpdate = true;
  }
}
const GOLD = new THREE.Color(1.0, 0.84, 0.55);
