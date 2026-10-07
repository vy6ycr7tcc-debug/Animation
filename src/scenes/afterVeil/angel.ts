/* The angel of the world after the veil (the owner's brief): a humanoid made wholly of warm gold
   light-dust, the game's own particle character (world/figures.ts, its points skinned to the
   wanderer's skeleton and moved by its recorded clips), so it walks as a body walks and its edges
   loosen and gather as the archetypes' do. It walks a little ahead of you at a slow pace; at each
   of its seven places it stops, turns to you and speaks; then it goes on. At the end it gestures
   toward the way home and comes apart into motes that drift after you a little way, and fade. */
import * as THREE from "three/webgpu";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadBeingModel } from "../../world/beings";
import { Figure, figureBind } from "../../world/figures";

type Act = "idle" | "walk" | "reach";
const CLIPS: Record<Act, string> = { idle: "Idle_Loop", walk: "Walk_Loop", reach: "Spell_Simple_Idle_Loop" };
const TINT: [number, number, number] = [1.0, 0.8, 0.46];

export class Angel {
  readonly root = new THREE.Group();
  readonly loaded: Promise<void>;
  /** Where it means to be, and what it faces once there (null: the way it walks). */
  readonly goal = new THREE.Vector3();
  look: THREE.Vector3 | null = null;
  heading = 0;
  speed = 0;
  /** 1 whole; easing to 0 it comes apart into motes and fades (the end). */
  presence = 1;
  /** How bright its light (1 as made; the long descent dims and warms it along the way). */
  glow = 1;
  private gone = false;
  private figure: Figure | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private acts: Partial<Record<Act, THREE.AnimationAction>> = {};
  private cur: Act | null = null;
  private reaching = 0;
  private drift = new THREE.Vector3();

  constructor(x: number, y: number, z: number, heading: number) {
    this.root.position.set(x, y, z);
    this.goal.set(x, y, z);
    this.heading = heading;
    this.root.rotation.y = heading;
    this.loaded = loadBeingModel("models/wanderer.glb").then((model) => {
      if (!model) return;
      const m = cloneSkinned(model.model);
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.visible = false; // only its light is drawn
          mesh.frustumCulled = false;
        }
      });
      m.rotation.y = Math.PI;
      m.scale.setScalar(model.scale);
      this.root.add(m);
      this.mixer = new THREE.AnimationMixer(m);
      for (const [k, name] of Object.entries(CLIPS) as [Act, string][]) {
        const clip = model.clips.find((c) => c.name === name);
        if (!clip) continue;
        const a = this.mixer.clipAction(clip);
        a.setEffectiveWeight(0);
        a.play();
        this.acts[k] = a;
      }
      this.play("idle");
      this.mixer.update(0.01);
      this.root.updateMatrixWorld(true);
      const bind = figureBind("ANGEL", TINT, m);
      if (bind) this.figure = new Figure(bind, m, this.root, TINT);
    });
  }

  private play(a: Act): void {
    if (a === this.cur) return;
    const next = this.acts[a];
    if (!next) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.cur && this.acts[this.cur]) this.acts[this.cur]!.crossFadeTo(next, 0.7, false);
    this.cur = a;
  }

  /** A gesture toward the way on (its last line), for `secs`. */
  gesture(secs: number): void {
    this.reaching = secs;
  }

  /** Come apart and fade, the motes drifting after `toward` a little way. */
  disperse(): void {
    this.gone = true;
  }
  /** Gather again where it stands, from nothing (its motes come together). */
  appear(): void {
    this.gone = false;
    this.presence = 0;
  }

  /** Each frame: walk toward its goal (never hurried, faster only when far behind), turn to face,
      and keep its light. `floor` gives the ground under it. `follow`: the visitor, whom the motes
      drift after once it has dispersed. */
  update(dt: number, t: number, floor: (x: number, z: number) => number, follow: THREE.Vector3, reduced: boolean): void {
    const p = this.root.position;
    if (!this.gone && this.presence < 1) this.presence = Math.min(1, this.presence + dt / 4);
    if (this.gone) {
      // its form loosens, and the motes drift a little way after you, fading
      this.presence = Math.max(0, this.presence - dt / 9);
      this.drift.set(follow.x - p.x, 0, follow.z - p.z);
      const d = this.drift.length();
      if (d > 2) p.addScaledVector(this.drift.normalize(), Math.min(d - 2, dt * 0.9 * this.presence));
      p.y = floor(p.x, p.z);
    } else {
      const dx = this.goal.x - p.x, dz = this.goal.z - p.z, d = Math.hypot(dx, dz);
      // a slow contemplative pace; if left far behind (you ran), it glides on to catch up
      const want = d < 0.25 ? 0 : Math.min(d * 0.9, d > 14 ? 3.2 : 1.15);
      this.speed += (want - this.speed) * Math.min(1, dt * 1.6);
      if (d > 0.01) {
        const k = Math.min(d, this.speed * dt) / d;
        p.x += dx * k;
        p.z += dz * k;
      }
      p.y += (floor(p.x, p.z) - p.y) * Math.min(1, dt * 8);
      // it faces the way it walks; standing, what it was asked to face
      // (the game's heading: 0 faces −z)
      const face = this.speed > 0.25 ? Math.atan2(-dx, -dz) : this.look ? Math.atan2(-(this.look.x - p.x), -(this.look.z - p.z)) : this.heading;
      let dh = face - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += dh * Math.min(1, dt * 2.2);
      this.root.rotation.y = this.heading;
    }
    this.reaching = Math.max(0, this.reaching - dt);
    this.play(this.reaching > 0 ? "reach" : this.speed > 0.25 && !this.gone ? "walk" : "idle");
    const w = this.acts.walk;
    if (w) w.timeScale = THREE.MathUtils.clamp(this.speed / 1.15, 0.6, 1.6) * 0.85;
    this.mixer?.update(dt);
    if (this.figure) {
      this.root.updateMatrixWorld(true);
      this.figure.update(dt, t, this.presence > 0.55, 0.9 * this.presence * this.glow, reduced);
      this.figure.cloud.sprite.visible = this.presence > 0.01;
    }
  }
}
