/* A journey: a monument's rooms walked one after another, in a place apart beyond the world's
   edge (x = 22000, as the temple is at 30000). Only one room exists at a time: crossing a door,
   the screen goes pitch black, the room behind is taken down, the next is built in the dark, you
   stand at its start, and its recording begins. Every door is always open: walk through it
   whenever you like, whether the voice has finished or not (the owner: never locked, never gated
   on narration).

   The rooms are the factory modules in scenes/densities (and later the adept's, past choices',
   the visions'), built as they are: each is placed here by moving whatever it added to the scene;
   nothing inside a room is changed. A room that brings no air of its own gets a quiet one. */
import * as THREE from "three/webgpu";
import type { SceneModule } from "./lessonKit";
import type { Narration } from "../core/narration";
import { T, gpuUniforms, gradeUniforms } from "../gpu/tsl";
import { applyAir, keepAlpha, roomOrigin, type Air } from "./densities/roomKit";

export const JOURNEY_ORIGIN = new THREE.Vector3(22000, 0, 0);
/** Is (x, z) inside the journeys' place apart? */
export const inJourney = (x: number): boolean => x > 20500 && x < 26000;

/** A room may say how present the visitor's body is (Room 7 lets it thin toward light). */
export type Room = SceneModule & { loaded?: Promise<void>; presence?: () => number };
export interface Spot { x: number; z: number; heading: number }
export interface Exit {
  x: number;
  z: number;
  r: number;
  /** The stage it leads to, or "out" to the world. */
  to: number | "out";
  /** Seconds of pitch black before the next room lifts (default 1). */
  dark?: number;
  /** Where you arrive there (default: that stage's start). */
  at?: Spot;
  /** A threshold of light marks it (for doors the room itself doesn't draw). */
  mark?: boolean;
}
export interface Stage {
  id: string;
  /** Whispered on arrival: the place's name only. */
  title: string;
  make(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): Promise<Room>;
  start: Spot;
  exits: Exit[];
  /** The ground's height in the room's own frame (default level at 0). */
  floor?: (x: number, z: number) => number;
  /** Keep the wanderer within the room (its own frame; mutates). */
  confine: (p: { x: number; z: number }) => void;
  /** Played on arrival when the room's own seat names no recording. */
  track?: string;
  /** The room's air, for rooms that don't set their own (default a quiet dark). */
  air?: Air;
  /** The room sets its own air each frame. */
  ownAir?: boolean;
  /** The room was drawn around its seat, somewhere else: move it so the seat is at the origin. */
  centreOnSeat?: boolean;
}
/** A monument's front door in the world. */
export interface Hall {
  readonly world: THREE.Object3D;
  /** Its name on the map. */
  readonly label: string;
  /** The door's centre, and the heading that walks out of it. */
  readonly door: THREE.Vector3;
  readonly face: number;
  /** Walking in through the door. */
  atDoor(p: THREE.Vector3): boolean;
  /** Where you stand coming out (before the door, facing away). */
  outside(): { x: number; y: number; z: number; heading: number };
  /** The rooms walked (to light what marks them outside). */
  light(seen: Set<string>): void;
}
export interface JourneyHost {
  scene: THREE.Scene;
  narration: Narration;
  whisper: (t: string, ms?: number) => void;
  /** What stays visible while the world rests (the wanderer, the camera, the lights). */
  keep(o: THREE.Object3D): boolean;
  place(x: number, y: number, z: number, heading: number): void;
  fade(on: boolean): void;
  busy(seconds: number): void;
  /** After a room is built: fix its additive blending, compile its shaders. */
  settle(): Promise<void>;
  /** Sound and the like, entering (true) and leaving (false) the place apart. */
  apart(on: boolean): void;
  /** Where "out" leads, back in the world. */
  outside(): { x: number; y: number; z: number; heading: number };
  /** The visitor's body: how present it is (1 fully). */
  presence?(k: number): void;
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
export const box = (x0: number, x1: number, z0: number, z1: number) => (p: { x: number; z: number }) => {
  p.x = Math.min(x1, Math.max(x0, p.x));
  p.z = Math.min(z1, Math.max(z0, p.z));
};
export const disc = (cx: number, cz: number, r: number) => (p: { x: number; z: number }) => {
  const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
  if (d > r) (p.x = cx + (dx / d) * r), (p.z = cz + (dz / d) * r);
};

/** A threshold of soft light standing across a door the room doesn't draw. */
function threshold(): { mesh: THREE.Mesh; dispose(): void } {
  const geo = new THREE.PlaneGeometry(2.6, 4.2);
  geo.translate(0, 2.1, 0);
  const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  const u = T.uv();
  const edge = T.smoothstep(0, 0.35, u.x).mul(T.smoothstep(1, 0.65, u.x)).mul(T.smoothstep(1, 0.7, u.y)).mul(T.smoothstep(0, 0.06, u.y));
  const breathe = T.sin(gpuUniforms.time.mul(0.8)).mul(0.15).add(0.85);
  m.colorNode = T.vec4(T.vec3(1, 0.93, 0.8).mul(edge).mul(breathe).mul(0.55), 1);
  const mesh = new THREE.Mesh(geo, m);
  return { mesh, dispose: () => (geo.dispose(), m.dispose()) };
}

const QUIET_AIR: Air = {
  color: new THREE.Color(0.012, 0.012, 0.02),
  glow: new THREE.Color(0.03, 0.03, 0.05),
  glowDir: new THREE.Vector3(0, 1, 0),
  density: 0.006,
  shadow: new THREE.Color(0, 0.004, 0.012),
  sat: 1,
  contrast: 1.05,
};

export class Journey {
  inside = false;
  crossing = false;
  /** The stage you are in (−1 outside). */
  at = -1;
  room: Room | null = null;
  /** Stages walked through this time (for the lobby's lamps). */
  readonly seen = new Set<string>();
  private objs: THREE.Object3D[] = [];
  private marks: { dispose(): void }[] = [];
  private hidden: [THREE.Object3D, boolean][] = [];
  private local = new THREE.Vector3();

  constructor(
    readonly name: string,
    readonly stages: Stage[],
    private host: JourneyHost,
  ) {}

  get stage(): Stage | null {
    return this.at >= 0 ? this.stages[this.at] : null;
  }

  /** The floor under (x, z), world coordinates. */
  floorAt(x: number, z: number): number {
    const s = this.stage;
    const o = JOURNEY_ORIGIN;
    return o.y + (s?.floor ? s.floor(x - o.x, z - o.z) : 0);
  }

  /** In through the monument's door (to stage `i`, the lobby by default). */
  enter(i = 0, at?: Spot): Promise<void> {
    return this.go(i, 1, at);
  }
  /** Back out into the world. */
  leave(): Promise<void> {
    return this.go("out", 0.3);
  }

  /** Straight into stage `i`, with no fade (still frames). */
  async jump(i: number): Promise<void> {
    this.takeDown();
    if (!this.inside) this.hideWorld();
    await this.build(i);
  }

  /** Straight out, with no fade (the map took you somewhere else). */
  leaveNow(): void {
    if (!this.inside) return;
    this.takeDown();
    this.restoreWorld();
  }

  /** The room's recording, again from its beginning. */
  replay(): void {
    const r = this.room, s = this.stage;
    if (!r || !s || this.crossing) return;
    r.onStand();
    r.onSit();
    if (s.track) void this.host.narration.play(s.track);
  }
  /** Whether the room you are in has a recording to hear again. */
  get hasVoice(): boolean {
    const s = this.stage;
    return !!s && s.id !== "lobby";
  }

  private async go(to: number | "out", dark: number, at?: Spot): Promise<void> {
    if (this.crossing) return;
    this.crossing = true;
    const h = this.host;
    h.fade(true);
    await wait(650);
    h.busy(1.5);
    await wait(40); // the black and the mark are painted before the heavy work
    this.takeDown();
    if (to === "out") {
      this.restoreWorld();
      const o = h.outside();
      h.place(o.x, o.y, o.z, o.heading);
    } else {
      if (!this.inside) this.hideWorld();
      try {
        await this.build(to, at);
      } catch (e) {
        console.error(e);
      }
    }
    await wait(dark * 1000);
    h.fade(false);
    window.setTimeout(() => (this.crossing = false), 250);
  }

  private hideWorld(): void {
    const h = this.host;
    this.hidden = h.scene.children.filter((o) => !h.keep(o)).map((o) => [o, o.visible] as [THREE.Object3D, boolean]);
    for (const [o] of this.hidden) o.visible = false;
    this.inside = true;
    h.apart(true);
  }
  private restoreWorld(): void {
    for (const [o, v] of this.hidden) o.visible = v;
    this.hidden = [];
    this.inside = false;
    this.at = -1;
    this.host.apart(false);
  }

  private takeDown(): void {
    const r = this.room;
    if (r) {
      r.onStand();
      r.dispose();
    }
    this.host.narration.stop(1);
    for (const o of this.objs) o.parent?.remove(o);
    for (const m of this.marks) m.dispose();
    this.objs = [];
    this.marks = [];
    this.room = null;
    roomOrigin.value.set(0, 0, 0);
    this.host.presence?.(1);
  }

  private async build(i: number, at?: Spot): Promise<void> {
    const h = this.host, s = this.stages[i];
    const before = new Set(h.scene.children);
    const room = await s.make(h.scene, h.narration, h.whisper);
    await room.loaded;
    const shift = JOURNEY_ORIGIN.clone();
    if (s.centreOnSeat && room.seatPos) shift.sub(room.seatPos);
    this.objs = h.scene.children.filter((o) => !before.has(o));
    for (const o of this.objs) o.position.add(shift);
    roomOrigin.value.copy(shift); // the rooms' shading reads its points in the room's own frame
    for (const e of s.exits) {
      if (!e.mark) continue;
      const t = threshold();
      t.mesh.position.set(JOURNEY_ORIGIN.x + e.x, this.floorAt(JOURNEY_ORIGIN.x + e.x, JOURNEY_ORIGIN.z + e.z), JOURNEY_ORIGIN.z + e.z);
      h.scene.add(t.mesh);
      this.objs.push(t.mesh);
      this.marks.push(t);
    }
    await h.settle();
    this.room = room;
    this.at = i;
    this.seen.add(s.id);
    const p = at ?? s.start;
    const x = JOURNEY_ORIGIN.x + p.x, z = JOURNEY_ORIGIN.z + p.z;
    h.place(x, this.floorAt(x, z), z, p.heading);
    this.airNow = s.ownAir ? null : s.air ?? QUIET_AIR;
    gradeUniforms.high.value.setRGB(1, 1, 1);
    if (this.airNow) applyAir(this.airNow);
    room.onSit(); // its recording begins, and its beats with it
    if (s.track) void h.narration.play(s.track);
    if (s.title) h.whisper(s.title, 4200);
  }

  private airNow: Air | null = null;

  /** Each frame, after the world's moods: the room lives, keeps you within it, and its doors
      take you on. Returns false outside. */
  update(dt: number, pos: THREE.Vector3): boolean {
    if (!this.inside) return false;
    const r = this.room, s = this.stage;
    if (!r || !s) return true;
    r.update(dt);
    this.host.presence?.(r.presence ? r.presence() : 1);
    // rooms without air of their own keep this one (the others set theirs in their update)
    if (this.airNow) applyAir(this.airNow);
    if (this.crossing) return true;
    const l = this.local.copy(pos).sub(JOURNEY_ORIGIN);
    s.confine(l);
    pos.x = JOURNEY_ORIGIN.x + l.x;
    pos.z = JOURNEY_ORIGIN.z + l.z;
    for (const e of s.exits)
      if (Math.hypot(l.x - e.x, l.z - e.z) < e.r) {
        if (e.to === "out") void this.leave();
        else void this.go(e.to, e.dark ?? 1, e.at);
        break;
      }
    return true;
  }
}
