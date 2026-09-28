/* The lesson kit: a tarot card come alive as a small room of light.
   The wanderer sits at a seat, a narration track begins, and beats —
   timed cues in narration seconds — build the scene around them:
   a knot that loosens, a wheel that turns, hands that open.
   Every lesson borrows the same CreationKit for its lights, crystals,
   rings and creatures, and the same clock, so that each beat is a pure
   function of narration time — seeking and replay are safe, and the
   scene can be lived again exactly as it was. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";
import type { Narration } from "../core/narration";
import { CreationKit } from "./creationKit";

const { uniform } = T;

export interface SceneModule {
  id: string; active: boolean;
  seatPos?: THREE.Vector3; seatHeading?: number;
  nearSeat(p: THREE.Vector3): boolean;
  onSit(): void; onStand(): void;
  update(dt: number): void; dispose(): void;
  holdsMovement(): boolean;
}
export interface Beat { t: number; apply: (ctx: LessonCtx) => void; }
export interface LessonCtx {
  group: THREE.Group; kit: CreationKit; uT: { value: number };
  narration: Narration; whisper: (text: string, ms?: number) => void;
}
export interface LessonOpts {
  id: string; trackId: string;
  seatPos: THREE.Vector3; seatHeading: number; seatRadius?: number;
  build: (ctx: LessonCtx) => void; beats: Beat[]; onEnd?: () => void;
}

const DEFAULT_SEAT_RADIUS = 3;

export class LessonScene implements SceneModule {
  readonly id: string;
  active = true;

  readonly seatPos: THREE.Vector3;
  readonly seatHeading: number;
  readonly seatRadius: number;

  private readonly scene: THREE.Scene;
  private readonly narration: Narration;
  private readonly whisperFn: (text: string, ms?: number) => void;
  private readonly opts: LessonOpts;

  private readonly group: THREE.Group;
  private readonly kit: CreationKit;
  private readonly uT = uniform(0);
  private readonly ctx: LessonCtx;

  private beatIndex = 0;
  private seated = false;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    narration: Narration,
    whisper: (t: string, ms?: number) => void,
    opts: LessonOpts,
  ) {
    this.scene = scene;
    this.narration = narration;
    this.whisperFn = whisper;
    this.opts = opts;

    this.id = opts.id;
    this.seatPos = opts.seatPos.clone();
    this.seatHeading = opts.seatHeading;
    this.seatRadius = opts.seatRadius ?? DEFAULT_SEAT_RADIUS;

    this.group = new THREE.Group();
    this.group.name = `lesson:${opts.id}`;
    this.kit = new CreationKit();

    this.ctx = {
      group: this.group,
      kit: this.kit,
      uT: this.uT,
      narration: this.narration,
      whisper: this.whisperFn,
    };

    this.scene.add(this.group);
    this.opts.build(this.ctx);
  }

  /** Flat (XZ) proximity to the seat anchor; the seat anchor sits on the floor. */
  nearSeat(p: THREE.Vector3): boolean {
    const dx = p.x - this.seatPos.x;
    const dz = p.z - this.seatPos.z;
    return dx * dx + dz * dz <= this.seatRadius * this.seatRadius;
  }

  onSit(): void {
    if (this.disposed || this.seated) return;
    this.seated = true;
    this.beatIndex = 0;
    this.uT.value = 0;
    void this.narration.play(this.opts.trackId);
  }

  onStand(): void {
    if (!this.seated) return;
    this.seated = false;
    this.narration.stop();
    this.beatIndex = 0;
    this.opts.onEnd?.();
  }

  update(dt: number): void {
    if (this.disposed) return;

    this.uT.value = this.narration.time();

    if (this.seated) {
      const beats = this.opts.beats;
      while (this.beatIndex < beats.length && beats[this.beatIndex].t <= this.uT.value) {
        beats[this.beatIndex].apply(this.ctx);
        this.beatIndex++;
      }
    }

    this.kit.update(dt, this.uT);
  }

  holdsMovement(): boolean {
    return this.seated;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.seated) {
      this.seated = false;
      this.narration.stop();
    }

    this.scene.remove(this.group);
    this.kit.dispose();
    this.active = false;
  }
}
