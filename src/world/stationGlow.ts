/* The oracle working at an archetype (seated in the world, or at a temple shrine), where its own
   sun would crowd the screen: the archetype's light does it instead. Motes of its colour drift
   about it while the oracle is with you; while it thinks they gather, spiralling in to its heart;
   when the answer comes, and as each sentence is read, they pour back out in a soft ring.
   Contained: small soft points, out of the way of the lens, a few hundred at most. It implements
   the oracle's presence (`OraclePresenceLike`), so the oracle drives it as it drives its sun. */
import * as THREE from "three/webgpu";
import { softPoints, spriteCloud, T, viewDepth, softDot, pointR, type SpriteCloud } from "../gpu/tsl";
import type { OraclePresenceLike, PresenceState } from "../ui/oracle";

const { clamp, float, max, uniform, vec4 } = T;
const N = 260;

export class StationGlow implements OraclePresenceLike {
  readonly points: THREE.Object3D;
  private cloud: SpriteCloud;
  private pos: Float32Array;
  private life: Float32Array;
  private tint: Float32Array;
  private vel = new Float32Array(N * 3);
  private age = new Float32Array(N);
  private mode = new Uint8Array(N); // 0 drift, 1 gather, 2 burst
  private uDpr = uniform(1);
  private next = 0;
  private on = false;
  private state: PresenceState = "quiet";
  private acc = 0;
  private uploaded = true;
  /** Where the archetype's heart is, and its colour; set by the game when the oracle opens. */
  readonly at = new THREE.Vector3();
  readonly color = new THREE.Color(1, 0.85, 0.6);
  /** How far round it the motes keep (a carving is larger than a being). */
  radius = 1.4;

  constructor() {
    const mat = softPoints();
    this.cloud = spriteCloud(N, { position: 3, aLife: 1, aTint: 3 }, mat);
    const { position, aLife, aTint } = this.cloud.nodes;
    this.pos = this.cloud.attrs.position.array as Float32Array;
    this.life = this.cloud.attrs.aLife.array as Float32Array;
    this.tint = this.cloud.attrs.aTint.array as Float32Array;
    mat.sizeNode = clamp(aLife.add(0.35).mul(22).div(max(viewDepth(position), 0.5)), float(1).div(this.uDpr), 7);
    mat.colorNode = vec4(aTint.mul(softDot(pointR())).mul(aLife).mul(1.25), 1);
    this.points = this.cloud.sprite;
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  summon(): void {
    this.on = true;
    this.state = "quiet";
    this.points.visible = true;
  }
  dismiss(): void {
    this.on = false; // what is alive fades out on its own
  }
  setState(s: PresenceState): void {
    if (s === "quiet" && this.state === "thinking") this.burst(70); // the answer has come
    this.state = s;
  }
  pulse(): void {
    this.burst(this.state === "speaking" ? 34 : 60);
  }

  private spawn(mode: number): number {
    const i = this.next;
    this.next = (this.next + 1) % N;
    this.mode[i] = mode;
    this.age[i] = 0;
    this.life[i] = 0.001;
    this.tint.set([this.color.r, this.color.g, this.color.b], i * 3);
    return i;
  }
  /** A soft ring of light pouring out from its heart. */
  private burst(n: number): void {
    if (!this.on) return;
    for (let k = 0; k < n; k++) {
      const i = this.spawn(2);
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 0.9, s = 0.9 + Math.random() * 1.1;
      this.pos.set([this.at.x, this.at.y, this.at.z], i * 3);
      this.vel.set([Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 0.25, Math.sin(a) * Math.cos(e) * s], i * 3);
    }
  }

  update(dt: number, dpr: number): void {
    this.uDpr.value = dpr;
    if (this.on) {
      // a few drifting about it always; many gathering in while it thinks
      const rate = this.state === "thinking" ? 70 : 9;
      this.acc += dt * rate;
      while (this.acc >= 1) {
        this.acc -= 1;
        const gather = this.state === "thinking";
        const i = this.spawn(gather ? 1 : 0);
        const a = Math.random() * Math.PI * 2;
        const r = this.radius * (gather ? 1.6 + Math.random() * 0.9 : 0.5 + Math.random() * 0.9);
        const y = (Math.random() - 0.4) * this.radius * (gather ? 1.6 : 1.2);
        this.pos.set([this.at.x + Math.cos(a) * r, this.at.y + y, this.at.z + Math.sin(a) * r], i * 3);
        this.vel.set(gather ? [0, 0, 0] : [(Math.random() - 0.5) * 0.12, 0.12 + Math.random() * 0.15, (Math.random() - 0.5) * 0.12], i * 3);
      }
    }
    let alive = 0;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      alive++;
      const j = i * 3;
      this.age[i] += dt;
      const t = this.age[i];
      if (this.mode[i] === 1) {
        // spiral in to the heart, faster as it comes, and go out there
        const dx = this.at.x - this.pos[j], dy = this.at.y - this.pos[j + 1], dz = this.at.z - this.pos[j + 2];
        const d = Math.hypot(dx, dy, dz) || 1;
        const pull = 0.9 + 2.2 / (0.4 + d);
        this.pos[j] += (dx / d * pull + (-dz / d) * 1.1) * dt;
        this.pos[j + 1] += (dy / d) * pull * dt;
        this.pos[j + 2] += (dz / d * pull + (dx / d) * 1.1) * dt;
        this.life[i] = d < 0.18 ? 0 : Math.min(1, t * 2.5) * Math.min(1, d * 1.6);
      } else {
        this.pos[j] += this.vel[j] * dt;
        this.pos[j + 1] += this.vel[j + 1] * dt;
        this.pos[j + 2] += this.vel[j + 2] * dt;
        const k = Math.max(0, 1 - dt * (this.mode[i] === 2 ? 1.3 : 0.2));
        this.vel[j] *= k;
        this.vel[j + 1] *= k;
        this.vel[j + 2] *= k;
        const span = this.mode[i] === 2 ? 1.8 : 3.2;
        this.life[i] = t > span ? 0 : Math.min(1, t * 3) * (1 - t / span) * (this.mode[i] === 2 ? 1 : 0.55);
      }
    }
    if (alive || this.uploaded) {
      const A = this.cloud.attrs;
      A.position.needsUpdate = A.aLife.needsUpdate = A.aTint.needsUpdate = true;
    }
    this.uploaded = alive > 0;
    if (!alive && !this.on) this.points.visible = false;
  }
}
