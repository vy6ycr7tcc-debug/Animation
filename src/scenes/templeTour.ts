/* The temple tour: a walk-through the tour leads (the owner: "the tour should be controlling the
   view and the character"). A small light goes ahead; the wanderer walks after it along the aisle
   to the next shrine, turns to face it, and the view comes round behind to frame it. There the
   shrine is lit (a warm spot on the being, the hall dimming round it; `Temple.setFocus`), the
   archetype wakes into its rite (player/gestures.ts), and its part of the temple's narration
   (TEMPLE, 26 marks) is spoken. When it has been spoken the light glides on by itself to the next
   shrine (no click). Its controls are the shared tour bar (ui/tourBar.ts): ⟲ ten seconds back
   (near a part's start, the stop before), ❚❚/▶, » on to the next, ✕ ends the tour and gives you
   the stick again. The order is the narration's: the door, the Mind down the left wall, the Body
   down the right, the Spirit round the sanctuary, and the Choice at the back; after it, rest at
   the tree of life or stay. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { TEMPLE_ORIGIN } from "../world/temple";
import type { SceneModule } from "./lessonKit";
import { tourBar, type TourBarOwner } from "../ui/tourBar";
import { VisionStage, EMBER, GOLD, PALE, PEARL, type Key, type Maker, type RGB } from "./visionStage";
import { combine, cord, flame, FORM_H, lantern, point, shift, sphere, sun } from "../world/forms";

export { TEMPLE_ORIGIN };

export const TRACK_ID = "TEMPLE";
export const FINALE_T = 636.6;

export interface TourHooks {
  whisper: (text: string, ms?: number) => void;
}
/** What the tour needs of the temple. */
export interface TempleLike {
  standFor(i: number): { x: number; z: number; heading: number };
  setRite(i: number, on: boolean): void;
  /** Light shrine `i` for the tour (−1: none). */
  setFocus?(i: number): void;
  /** The three rooms' signs: where to stand before room `g`'s (0 Mind, 1 Body, 2 Spirit), the
      room the tour is in, the signs dark or lit, and one kindled as it is named. */
  introFor?(g: number): { x: number; z: number; heading: number };
  setGroup?(g: number): void;
  signsLit?(on: boolean): void;
  kindleSign?(g: number): void;
  entry(): { x: number; z: number; heading: number };
  floorAt(x: number, z: number): number;
}
export interface PlayerLike {
  pos: THREE.Vector3;
  heading: number;
  /** The controller's tap-to-walk target (world x, z). */
  target: THREE.Vector2 | null;
}
export interface FollowLike {
  yaw: number;
  pitch: number;
  dist?: number;
  snapTo(p: THREE.Vector3): void;
}
export interface CueDef {
  t: number;
  label: string;
}

/** The narration's own marks: timing only, never reworded. Each sits 0.3 s before its part's
    first word, in the ~2 s pause that opens it, measured from the recording itself (ffmpeg
    silencedetect, −40 dB): the first marks drifted up to 1.2 s late, so a part began mid-word and
    the one before it spoke that word's start. */
export const CUES: CueDef[] = [
  { t: 0.0, label: "opening" },
  { t: 41.67, label: "I — The Magician" },
  { t: 74.17, label: "II — The High Priestess" },
  { t: 104.16, label: "III — The Empress" },
  { t: 128.66, label: "IV — The Emperor" },
  { t: 151.38, label: "V — The Hierophant" },
  { t: 175.57, label: "VI — The Lovers" },
  { t: 205.31, label: "VII — The Chariot" },
  { t: 231.64, label: "transition: mind → body" },
  { t: 239.32, label: "VIII — Strength" },
  { t: 262.35, label: "IX — The Hermit" },
  { t: 286.48, label: "X — The Wheel of Fortune" },
  { t: 312.65, label: "XI — Justice" },
  { t: 336.59, label: "XII — The Hanged Man" },
  { t: 361.18, label: "XIII — Death" },
  { t: 384.46, label: "XIV — Temperance" },
  { t: 410.98, label: "transition: body → spirit" },
  { t: 417.95, label: "XV — The Devil" },
  { t: 444.03, label: "XVI — The Tower" },
  { t: 465.68, label: "XVII — The Star" },
  { t: 488.2, label: "XVIII — The Moon" },
  { t: 510.38, label: "XIX — The Sun" },
  { t: 530.33, label: "XX — Judgement" },
  { t: 550.55, label: "XXI — The World" },
  { t: 578.35, label: "XXII — The Fool (The Choice)" },
  { t: 610.92, label: "landing" },
];

const smooth = (x: number) => {
  const t = Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
  return t * t * (3 - 2 * t);
};

/** The sanctuary's centre and the gateway into it (temple frame). */
const CENTRE = new THREE.Vector2(0, -44);
const GATE_Z = -30;
const ARRIVE_R = 2.4;
const LIGHT_SPEED = 3.4;
/** The view's glide between stops (m/s at its fullest). */
const GLIDE_SPEED = 2.6;
/** After a part has been spoken, a breath of stillness before the light goes on. */
const AUTO_AFTER = 2.2;

/* ---------------------------------------------------------------- the stops */
interface Stop {
  /** The archetype whose shrine this is (0–21), or −1 for the door or a room's sign. */
  shrine: number;
  /** A room's opening (0 the Mind, 1 the Body, 2 the Spirit): you stand before its sign. */
  intro?: number;
  /** Stay at least this long (seconds), voiced or not. */
  hold?: number;
  /** Where to stand, world x, z, and the heading that faces the shrine. */
  x: number;
  z: number;
  heading: number;
  /** Its part of the narration (track seconds). A transition is spoken on arriving at the
      shrine it leads to (the Body's first, the Spirit's first). */
  from: number;
  to: number;
  title: string;
}

/** The cue each shrine's part begins at: the Mind's seven follow the opening; each later room's
    first shrine follows its passage (spoken before that room's sign), which has its own mark. */
function cueFor(shrine: number): number {
  if (shrine < 7) return shrine + 1;
  if (shrine < 14) return shrine + 2;
  return shrine + 3;
}
const groupOf = (shrine: number) => (shrine < 0 ? -1 : shrine < 7 ? 0 : shrine < 14 ? 1 : 2);
/** When, in the opening, each room's sign is named ("a lamp is lit", "a fire is burning", "a
    star"): measured from the recording. */
const NAMED = [8.0, 13.3, 21.5];
/** The opening's line that names the Mind's room: where the tour plays it again at the Mind's lamp
    (measured, ffmpeg silencedetect −40 dB: speech 6.45–10.54 s, pauses before and after). */
const MIND_LINE: [number, number] = [6.15, 11.2];

/* The opening, shown (the owner: at the door "you don't see anything going on"): a vision of
   light in the aisle before you, the format of the vision of creation, gathering into what the
   opening's words name, each at its word (measured from the recording): a house of three rooms
   (2.7 s), the Mind's lamp (6.3), the Body's fire (11.75), the Spirit's star in the dark (16.6),
   the three together (21.5), twenty-two stations along the way (25.3), someone walking them, as
   every life does (30.3), and, "walk with me" (39.3), the figure turned to go on. */
const VIOLET: RGB = [0.82, 0.74, 1.0];
function threeRooms(n: number, R: () => number): Float32Array {
  const V = THREE.Vector3;
  const y0 = 0.4, y1 = 2.6, w = 1.25;
  const wall = (x0: number, x1: number) => [new V(x0, y0, 0), new V(x0, y1, 0), new V(x1, y1, 0), new V(x1, y0, 0)];
  return combine(n, [
    [(m) => cord([new V(-3 * w / 2 - 0.2, y1, 0), new V(0, y1 + 1.5, 0), new V(3 * w / 2 + 0.2, y1, 0)], m, R, 0.04), 0.16],
    [(m) => cord(wall(-1.5 * w, -0.5 * w), m, R, 0.035), 0.2],
    [(m) => cord(wall(-0.5 * w, 0.5 * w), m, R, 0.035), 0.2],
    [(m) => cord(wall(0.5 * w, 1.5 * w), m, R, 0.035), 0.2],
    [(m) => shift(sphere(m, R, 0.16, 0, 0.3), -w, 1.5, 0), 0.08],
    [(m) => shift(sphere(m, R, 0.16, 0, 0.3), 0, 1.5, 0), 0.08],
    [(m) => shift(sphere(m, R, 0.12, 0, 0.3), w, 1.9, 0), 0.08],
  ]);
}
function stations(n: number, R: () => number): Float32Array {
  // twenty-two small lights on a way that winds up and away: the stations of the road
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(R() * 22), u = k / 21;
    const x = Math.sin(u * 5.2) * 1.9 * (1 - u * 0.4), y = 0.4 + u * 3.9, z = -u * 2.5;
    const d = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(0.11 * Math.cbrt(R()));
    out.set([x + d.x, y + d.y, z + d.z], i * 3);
  }
  return out;
}
const OPENING_FORMS: Record<string, Maker> = {
  seed: (n, R) => point(n, R, FORM_H * 0.35),
  house: (n, R) => threeRooms(n, R),
  lamp: (n, R) => lantern(n, R),
  fire: (n, R) => flame(n, R, 0.5, 3.2),
  star: (n, R) => sun(n, R, FORM_H * 0.6),
  three: (n, R) => combine(n, [[(m) => shift(lantern(m, R), -2.1, 0, 0, 0.8), 0.34], [(m) => flame(m, R, 0.5, 2.4), 0.33], [(m) => shift(sun(m, R, 0), 2.1, 3.3, 0, 0.55), 0.33]]),
  stations: (n, R) => stations(n, R),
  walker: (n, R, b) => b && b.figure(n, R, "Walk_Loop", 0.4, [], FORM_H * 0.8),
  withMe: (n, R, b) => b && b.figure(n, R, "Spell_Simple_Idle_Loop", 1.6, [], FORM_H * 0.8),
};
const OPENING_KEYS: Key[] = [
  { t: 0, form: "seed", tint: GOLD, dur: 2 },
  { t: 2.7, form: "house", tint: PEARL, dur: 3 },
  { t: 6.3, form: "lamp", tint: PALE, dur: 2.5 },
  { t: 11.75, form: "fire", tint: EMBER, dur: 2.5 },
  { t: 16.6, form: "star", tint: VIOLET, dur: 3, spin: 0.15, axis: "z" },
  { t: 21.5, form: "three", tint: PEARL, dur: 3 },
  { t: 25.3, form: "stations", tint: GOLD, dur: 3.5, spin: 0.12 },
  { t: 30.3, form: "walker", tint: PEARL, dur: 3.5 },
  { t: 39.3, form: "withMe", tint: GOLD, dur: 2.5 },
];

/** The stops: the door (the opening, where all three signs kindle as they are named); then each
    room in turn: its sign (the Mind's lamp with the opening's own line for it, "In the first room,
    a lamp is lit…"; the Body's fire and the Spirit's star with the recorded passages into them), then
    its seven shrines; then the Choice. */
function buildStops(temple: TempleLike): Stop[] {
  const door = temple.entry();
  const stops: Stop[] = [{ shrine: -1, x: door.x, z: door.z, heading: door.heading, from: 0, to: CUES[1].t, title: "The temple" }];
  const intro = (g: number, from: number, to: number, title: string) => {
    const s = temple.introFor?.(g);
    if (s) stops.push({ shrine: -1, intro: g, x: s.x, z: s.z, heading: s.heading, from, to, title, hold: 6 });
  };
  for (let i = 0; i < 22; i++) {
    // the Mind's own line, from the recording's opening ("In the first room, a lamp is lit. That
    // is the mind.", 6.45–10.54 s), from inside the pauses on either side
    if (i === 0) intro(0, MIND_LINE[0], MIND_LINE[1], "The Mind");
    if (i === 7) intro(1, CUES[8].t, CUES[9].t, "The Body");
    if (i === 14) intro(2, CUES[16].t, CUES[17].t, "The Spirit");
    const s = temple.standFor(i), k = cueFor(i);
    const label = CUES[k].label.replace(" — ", " · ").replace(" (The Choice)", "");
    stops.push({ shrine: i, x: s.x, z: s.z, heading: s.heading, from: CUES[k].t, to: i === 21 ? FINALE_T : CUES[k + 1].t, title: i === 21 ? "XXII · The Choice" : label });
  }
  return stops;
}

/** The light's way from `a` to `b` (temple frame): along the aisle between the columns, through
    the gateway, and round the altar, never through a column. */
function route(a: THREE.Vector2, b: THREE.Vector2): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const inHall = (p: THREE.Vector2) => p.y > GATE_Z;
  const ring = (p: THREE.Vector2) => {
    const ang = Math.atan2(p.y - CENTRE.y, p.x - CENTRE.x);
    return new THREE.Vector2(CENTRE.x + Math.cos(ang) * 6.5, CENTRE.y + Math.sin(ang) * 6.5);
  };
  if (inHall(a)) pts.push(new THREE.Vector2(0, a.y));
  else pts.push(ring(a));
  if (inHall(a) !== inHall(b)) {
    const inner = new THREE.Vector2(0, GATE_Z - 3), outer = new THREE.Vector2(0, GATE_Z + 2);
    if (inHall(a)) pts.push(outer, inner);
    else pts.push(inner, outer);
  }
  if (inHall(b)) pts.push(new THREE.Vector2(0, b.y));
  else {
    // round the altar the short way
    const from = pts[pts.length - 1], r = ring(b);
    let a0 = Math.atan2(from.y - CENTRE.y, from.x - CENTRE.x);
    const a1 = Math.atan2(r.y - CENTRE.y, r.x - CENTRE.x);
    if (a1 - a0 > Math.PI) a0 += Math.PI * 2;
    if (a0 - a1 > Math.PI) a0 -= Math.PI * 2;
    for (let k = 1; k <= 6; k++) {
      const ang = a0 + ((a1 - a0) * k) / 6;
      pts.push(new THREE.Vector2(CENTRE.x + Math.cos(ang) * 6.5, CENTRE.y + Math.sin(ang) * 6.5));
    }
  }
  pts.push(b.clone());
  return pts;
}

/* ---------------------------------------------------------------- the tour */
type Phase = "leading" | "speaking" | "done";

export class TempleTour implements SceneModule {
  readonly id = "tour";
  active = false;
  /** The shrine the tour stands at now (its carving framed in the view), or −1 (on the way, or a
      room's opening). */
  get atShrine(): number {
    if (!this.active || this.phase === "leading") return -1;
    return this.stops[this.index]?.shrine ?? -1;
  }
  /** The whole tour: the wanderer steps out of the view, and the view glides after the light. */
  get watching(): boolean {
    return this.active;
  }
  /** The view's glide to the next stop: a smooth curve along the aisle, how far along it. */
  private glide: { curve: THREE.CatmullRomCurve3; L: number; s: number } | null = null;
  /** This glide runs along one wall, the view held on the wall's shrines. */
  private dolly = false;
  /** Arrived, the part waits until the view has come round to its shrine (seconds waited). */
  private framing = -1;
  /** Paused from the half-moon: the walking and the going on stand still. */
  held = false;
  /** It has come to its end (the Choice spoken; rest or stay offered). */
  completed = false;
  onRest: (() => void) | null = null;
  camera: THREE.Camera | null = null;

  private stops: Stop[] = [];
  private index = 0;
  private phase: Phase = "leading";
  private riteOn = -1;
  private spoke = 0;
  private doneT = 0;
  private lifeT = 0;
  private path: THREE.Vector2[] = [];
  private lightAt = new THREE.Vector2();
  private light: THREE.Sprite;
  private halo: THREE.Sprite;
  private lightMat: THREE.SpriteMaterial;
  private haloMat: THREE.SpriteMaterial;
  private bar: TourBarOwner = {
    back: () => this.back(),
    next: () => this.next(),
    end: () => this.exit(),
    progress: () => this.progress(),
  };
  private choice: HTMLDivElement;
  private goal = new THREE.Vector2();
  private readonly dir = new THREE.Vector2();
  /** The wanderer's own way to the stop (world x, z), walked one point after another. */
  private walk: THREE.Vector2[] = [];
  private view = { dist: 7, pitch: 0.36 };
  private yawVel = 0;
  /** The opening's vision of light, in the aisle before the door (made on the tour's first start). */
  private opening: VisionStage | null = null;
  private scene: THREE.Scene;

  constructor(
    scene: THREE.Scene,
    private narration: Narration,
    private player: PlayerLike,
    private follow: FollowLike,
    _hooks: TourHooks,
    private temple: TempleLike,
  ) {
    this.scene = scene;
    // the guiding light: a small bright core in a soft glow, contained
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,246,228,1)");
    grd.addColorStop(0.2, "rgba(255,214,150,0.55)");
    grd.addColorStop(1, "rgba(255,190,120,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = () => new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 });
    this.lightMat = mat();
    this.haloMat = mat();
    this.light = new THREE.Sprite(this.lightMat);
    this.light.scale.setScalar(0.55);
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.scale.setScalar(2.2);
    this.light.visible = this.halo.visible = false;
    scene.add(this.light, this.halo);

    const btn = (text: string, cls: string, label: string) => Object.assign(document.createElement("button"), { type: "button", textContent: text, className: cls, ariaLabel: label });
    // the end: rest at the tree, or stay
    this.choice = Object.assign(document.createElement("div"), { id: "tour-choice", hidden: true });
    const rest = btn("Rest at the tree of life", "", "Rest at the tree of life");
    const stay = btn("Stay in the temple", "", "Stay in the temple");
    this.choice.append(rest, stay);
    document.body.append(this.choice);
    // on the touch itself (a phone sends no click while the other thumb holds the stick);
    // a keyboard's Enter or Space still clicks
    // (a touch's own click is ignored, or each tap would act twice)
    let downAt = -1e9;
    const act = (b: HTMLButtonElement, fn: () => void) => {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        downAt = performance.now();
        fn();
      });
      b.addEventListener("click", (e) => (e as MouseEvent).detail === 0 && performance.now() - downAt > 700 && fn());
    };
    act(rest, () => this.choose("rest"));
    act(stay, () => this.choose("stay"));
  }

  /* ---------- lifecycle ---------- */
  enter(): void {
    if (this.active) return;
    this.active = true;
    this.view = { dist: this.follow.dist ?? 7, pitch: this.follow.pitch };
    document.body.classList.add("touring");
    this.stops = buildStops(this.temple);
    this.lifeT = 0;
    this.completed = false;
    this.choice.hidden = true;
    tourBar().show(this.bar);
    this.light.visible = this.halo.visible = true;
    this.temple.signsLit?.(false); // the opening kindles them as it names them
    if (!this.opening) {
      const d = this.temple.entry(), fx = -Math.sin(d.heading), fz = -Math.cos(d.heading);
      const x = d.x + fx * 7.5, z = d.z + fz * 7.5;
      this.opening = new VisionStage({ at: new THREE.Vector3(x, this.temple.floorAt(x, z), z), face: d.heading, forms: OPENING_FORMS, keys: OPENING_KEYS, seedNum: 3311, pointSize: 0.05 });
      this.scene.add(this.opening.group);
    }
    const O = TEMPLE_ORIGIN;
    this.lightAt.set(this.player.pos.x - O.x, this.player.pos.z - O.z - 3);
    // a still frame (?shot) lands on the stop that time belongs to, already there
    const dt = this.narration.debugTime;
    if (dt !== null && Number.isFinite(dt)) {
      const k = Math.max(0, this.stops.findIndex((s) => dt >= s.from && dt < s.to));
      const s = this.stops[k];
      this.player.pos.set(s.x, this.temple.floorAt(s.x, s.z), s.z);
      this.player.heading = s.heading;
      this.go(k, true);
      return;
    }
    this.go(0);
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.player.target = null;
    this.walk = [];
    this.temple.setFocus?.(-1);
    this.temple.setGroup?.(-1);
    this.temple.signsLit?.(true);
    document.body.classList.remove("touring");
    if (this.follow.dist !== undefined) this.follow.dist = this.view.dist;
    this.follow.pitch = this.view.pitch;
    if (this.narration.current === TRACK_ID) this.narration.stop(1.5);
    this.light.visible = this.halo.visible = false;
    tourBar().hide(this.bar);
    this.choice.hidden = true;
    this.rite(-1);
  }

  /** Send the light to stop `k` (the door is stop 0); `there`: you are there already. */
  private go(k: number, there = false): void {
    if (k < 0 || k >= this.stops.length) return;
    if (this.narration.current === TRACK_ID) this.narration.stop(1.2);
    this.rite(-1);
    this.index = k;
    this.phase = "leading";
    this.framing = -1;
    if (k > 0) for (let g = 0; g < 3; g++) this.temple.kindleSign?.(g); // past the opening (or skipped): all named
    const s = this.stops[k], O = TEMPLE_ORIGIN;
    this.goal.set(s.x - O.x, s.z - O.z);
    this.path = route(this.lightAt, this.waitPoint(s));
    this.temple.setFocus?.(-1);
    // the wanderer's way: the same aisle, from where it stands to the standing place
    const from = new THREE.Vector2(this.player.pos.x - O.x, this.player.pos.z - O.z);
    // two shrines on the same wall of the hall: straight along the wall, facing it (a slow dolly
    // past the niches), never out to the aisle and back in
    this.dolly = from.y > GATE_Z && this.goal.y > GATE_Z && Math.sign(from.x) === Math.sign(this.goal.x) && Math.abs(from.x) > 3 && Math.abs(this.goal.x) > 3 && s.shrine >= 0;
    const way = this.dolly ? [this.goal.clone()] : route(from, this.goal);
    this.walk = there ? [] : way.map((p) => new THREE.Vector2(p.x + O.x, p.y + O.z));
    this.player.target = null;
    // no walking (the owner: "very artificial and silly"): the view glides on one smooth curve
    // through the same aisle, after the light
    this.glide = null;
    if (!there && k > 0) {
      const pts = [new THREE.Vector3(this.player.pos.x, 0, this.player.pos.z), ...this.walk.map((p) => new THREE.Vector3(p.x, 0, p.y))];
      if (pts[pts.length - 1].distanceTo(new THREE.Vector3(s.x, 0, s.z)) > 0.3) pts.push(new THREE.Vector3(s.x, 0, s.z));
      const kept = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.4);
      if (kept.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(kept, false, "centripetal");
        this.glide = { curve, L: curve.getLength(), s: 0 };
        this.path = [];
      }
    }
    if (there || k === 0) this.arrive();
    this.refresh();
  }

  /** ⟲: ten seconds back in the part being told; near its start (or walking there, or a quiet
      stop), the stop before, told again from its beginning. */
  private back(): void {
    const s = this.stops[this.index];
    const pr = this.narration.current === TRACK_ID || this.narration.paused ? this.narration.progress() : null;
    if (this.phase !== "leading" && Number.isFinite(s.from) && (pr ? pr.t > 3 : this.phase === "done")) {
      if (this.narration.rewind(10, this.held)) {
        this.phase = "speaking";
        this.spoke = Math.max(this.spoke, (s.hold ?? 1.5) + 0.1);
        this.refresh();
        return;
      }
    }
    if (this.phase !== "leading" && !Number.isFinite(s.from) && this.spoke > 3) {
      this.phase = "speaking";
      this.spoke = 0;
      this.refresh();
      return;
    }
    this.go(Math.max(0, this.index - 1));
  }

  /** How far the stop has been told (a quiet stop: its moment). */
  private progress(): number {
    const s = this.stops[this.index];
    if (this.phase === "leading") return 0;
    if (this.phase === "done") return 1;
    if (!Number.isFinite(s.from)) return Math.min(1, this.spoke / (s.hold ?? 6));
    const pr = this.narration.progress();
    return pr && (this.narration.current === TRACK_ID || this.narration.paused) ? pr.t / pr.total : 0;
  }

  private next(): void {
    if (this.index >= this.stops.length - 1) return this.showChoice();
    this.go(this.index + 1);
  }

  /** Where the light waits for a stop: a little before the shrine, above the standing place. */
  private waitPoint(s: Stop): THREE.Vector2 {
    const O = TEMPLE_ORIGIN;
    return new THREE.Vector2(s.x - O.x - Math.sin(s.heading) * 1.4, s.z - O.z - Math.cos(s.heading) * 1.4);
  }

  private arrive(): void {
    const s = this.stops[this.index];
    this.phase = "speaking";
    this.spoke = 0;
    this.player.target = null;
    this.walk = [];
    this.rite(s.shrine);
    this.temple.setFocus?.(s.shrine);
    this.temple.setGroup?.(s.intro ?? groupOf(s.shrine));
    if (s.intro !== undefined) this.temple.kindleSign?.(s.intro);
    // its part of the recording, once the view has come round to it (or at once at the door)
    this.framing = Number.isFinite(s.from) ? 0 : -1;
    if (this.index === 0 || this.narration.debugTime !== null) this.speak();
    this.refresh();
  }
  private speak(): void {
    const s = this.stops[this.index];
    this.framing = -1;
    this.spoke = 0;
    if (Number.isFinite(s.from)) void this.narration.play(TRACK_ID, s.from, s.to);
  }

  private rite(i: number): void {
    if (i === this.riteOn) return;
    if (this.riteOn >= 0) this.temple.setRite(this.riteOn, false);
    if (i >= 0) this.temple.setRite(i, true);
    this.riteOn = i;
  }

  private refresh(): void {
    const s = this.stops[this.index];
    const n = this.stops.length;
    const hint = this.phase === "leading" ? "Going there…" : this.phase === "done" ? (this.index === n - 1 ? "The end of the tour" : "Going on…") : `${this.index + 1} of ${n}`;
    tourBar().set(s.title, hint);
    tourBar().ready(this.phase === "done");
  }

  update(dt: number): void {
    if (this.opening && (!this.active || this.index > 0)) this.opening.update(0, 0, false, false, false);
    if (!this.active) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0;
    if (this.opening && this.index === 0) {
      const speaking = this.phase !== "leading" && (this.narration.current === TRACK_ID || this.narration.debugTime !== null);
      this.opening.update(step, speaking ? this.narration.time() : 0, speaking, true, false);
    }
    this.lifeT += step;
    const O = TEMPLE_ORIGIN, s = this.stops[this.index];
    // the light travels its way, slowing into the last metres, then waits, turning slowly
    let moving = false;
    const held0 = this.held || this.narration.paused;
    if (this.glide && this.phase === "leading") {
      // the view glides along its curve, easing out of the stop and into the next; the light
      // goes a few metres ahead on the same curve, so the view simply follows it
      const g = this.glide;
      if (!held0) {
        const v = GLIDE_SPEED * Math.min(1, 0.18 + g.s / 2.4, 0.15 + (g.L - g.s) / 3.2);
        g.s = Math.min(g.L, g.s + v * step);
      }
      const u = g.L > 0 ? g.s / g.L : 1;
      const p = g.curve.getPointAt(u), tan = g.curve.getTangentAt(Math.min(0.999, u));
      this.player.pos.x = p.x;
      this.player.pos.z = p.z;
      this.player.target = null;
      if (this.dolly) this.player.heading = s.heading;
      else if (tan.lengthSq() > 1e-6) {
        // turned toward the shrine over the last part of the way, so it arrives facing it
        const h = Math.atan2(-tan.x, -tan.z), w = smooth((u - 0.55) / 0.4);
        const d = Math.atan2(Math.sin(s.heading - h), Math.cos(s.heading - h));
        this.player.heading = s.shrine >= 0 || s.intro !== undefined ? h + d * w : h;
      }
      const ahead = g.curve.getPointAt(Math.min(1, (g.s + 3.5) / Math.max(g.L, 1e-3)));
      this.lightAt.lerp(new THREE.Vector2(ahead.x - O.x, ahead.z - O.z), Math.min(1, step * 4));
      moving = true;
      if (g.s >= g.L - 1e-3) {
        this.glide = null;
        this.path = route(this.lightAt, this.waitPoint(s));
        this.arrive();
      }
    } else if (this.path.length) {
      const target = this.path[0], d = this.lightAt.distanceTo(target);
      const v = LIGHT_SPEED * (this.path.length === 1 ? Math.min(1, 0.3 + d / 2.5) : 1) * step;
      if (d <= v || d < 1e-3) {
        this.lightAt.copy(target);
        this.path.shift();
      } else this.lightAt.addScaledVector(this.dir.subVectors(target, this.lightAt).normalize(), v);
      moving = true;
    }
    const lx = O.x + this.lightAt.x + (moving ? 0 : Math.cos(this.lifeT * 0.7) * 0.35), lz = O.z + this.lightAt.y + (moving ? 0 : Math.sin(this.lifeT * 0.7) * 0.35);
    const ly = this.temple.floorAt(lx, lz) + 2.2 + Math.sin(this.lifeT * 1.3) * 0.1;
    this.light.position.set(lx, ly, lz);
    this.halo.position.copy(this.light.position);
    const fade = smooth(this.lifeT / 1.5);
    const breathe = 0.8 + 0.2 * Math.sin(this.lifeT * 1.1);
    // brighter while it leads (it asks to be followed), quiet while a shrine speaks
    const lead = this.phase === "leading" ? 1 : this.phase === "done" ? 0.8 : 0.45;
    this.lightMat.opacity = fade * breathe * (0.55 + 0.45 * lead);
    this.haloMat.opacity = fade * breathe * 0.18 * lead;

    // the wanderer walks its way, point after point, and arrives at the standing place
    const px = this.player.pos.x - O.x, pz = this.player.pos.z - O.z;
    const held = this.held || this.narration.paused;
    if (held) {
      this.player.target = null;
      this.doneT = performance.now();
    } else if (this.phase === "leading" && !this.glide) {
      while (this.walk.length && Math.hypot(this.player.pos.x - this.walk[0].x, this.player.pos.z - this.walk[0].y) < 0.7) this.walk.shift();
      if (this.walk.length) this.player.target = this.walk[0].clone();
      if (!this.walk.length && Math.hypot(px - this.goal.x, pz - this.goal.y) < ARRIVE_R * 0.5) this.arrive();
      else if (!this.walk.length) this.player.target = new THREE.Vector2(this.goal.x + O.x, this.goal.y + O.z);
    }
    // the view: behind the wanderer while it walks; at a shrine it comes round and draws a
    // little closer, framing the archetype over the wanderer's shoulder
    const at = this.phase !== "leading" && (s.shrine >= 0 || s.intro !== undefined);
    if (at) {
      let dh = s.heading - this.player.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.player.heading += dh * Math.min(1, step * 3);
    }
    const yawGoal = at ? s.heading : this.player.heading;
    let dy = yawGoal - this.follow.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    // the view comes round as a camera operator would move it: a critically damped spring,
    // easing in and out (and walls never stand between it and the wanderer: FollowCamera.blockers)
    const kk = at ? 1.5 : 2.2;
    this.yawVel += (dy * kk * kk - 2 * kk * this.yawVel) * step;
    this.follow.yaw += this.yawVel * step;
    this.follow.pitch += ((at ? 0.2 : 0.2) - this.follow.pitch) * Math.min(1, step * 1.5);
    if (this.follow.dist !== undefined) this.follow.dist += ((at ? 4.4 : 4.8) - this.follow.dist) * Math.min(1, step * 1.5);
    // its part spoken to its end (or no voice to speak it): a breath, then the light goes on by
    // itself; never before the part is over, so nothing is cut
    if (held) {
      // paused: nothing goes on
    } else if (this.phase === "speaking" && this.framing >= 0) {
      // waiting for the view to face the shrine before its part begins (at most a few seconds)
      this.framing += step;
      if (Math.abs(dy) < 0.1 || this.framing > 2.5) this.speak();
    } else if (this.phase === "speaking") {
      this.spoke += Math.min(0.25, Math.max(0, dt)); // seconds as they pass, even when frames are slow
      const t = this.narration.time();
      // the opening kindles each room's sign as it names it
      if (this.index === 0 && this.narration.current === TRACK_ID) NAMED.forEach((n, g) => t >= n && this.temple.kindleSign?.(g));
      const ended = this.narration.debugTime === null && this.spoke > (s.hold ?? 1.5) && (this.narration.current !== TRACK_ID || t >= s.to - 0.15);
      if (ended) {
        this.phase = "done";
        this.doneT = performance.now();
        this.refresh();
      }
    } else if (this.phase === "done" && this.choice.hidden && (performance.now() - this.doneT) / 1000 > AUTO_AFTER) this.next();
  }

  private showChoice(): void {
    this.completed = true;
    tourBar().hide(this.bar);
    this.choice.hidden = false;
    this.rite(-1);
  }

  /** The end: rest at the tree of life, or stay in the temple and walk freely. */
  choose(key: "rest" | "stay"): void {
    this.exit();
    if (key === "rest") this.onRest?.();
  }

  /** The tour walks for you: the stick rests while it runs. */
  holdsMovement(): boolean {
    return this.active;
  }
  nearSeat(): boolean {
    return false;
  }
  onSit(): void {}
  onStand(): void {}

  dispose(): void {
    this.exit();
    this.light.removeFromParent();
    this.halo.removeFromParent();
    this.lightMat.map?.dispose();
    this.lightMat.dispose();
    this.haloMat.dispose();
    this.choice.remove();
  }
}
