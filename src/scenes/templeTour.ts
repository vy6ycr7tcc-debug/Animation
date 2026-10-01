/* The temple tour: a walk-through the tour leads (the owner: "the tour should be controlling the
   view and the character"). A small light goes ahead; the wanderer walks after it along the aisle
   to the next shrine, turns to face it, and the view comes round behind to frame it. There the
   shrine is lit (a warm spot on the being, the hall dimming round it; `Temple.setFocus`), the
   archetype wakes into its rite (player/gestures.ts), and its part of the temple's narration
   (TEMPLE, 26 marks) is spoken. When it has been spoken the light glides on by itself to the next
   shrine (no click); "Next ›" skips ahead, "‹" goes back, ✕ ends the tour and gives you the stick
   again. The order is the narration's: the door, the Mind down the left wall, the Body
   down the right, the Spirit round the sanctuary, and the Choice at the back; after it, rest at
   the tree of life or stay. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { TEMPLE_ORIGIN } from "../world/temple";
import type { SceneModule } from "./lessonKit";

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

/** The stops: the door (the opening, where all three signs kindle as they are named); then each
    room in turn: its sign (the Mind's lamp a quiet moment, as the recording has no words of its
    own for it; the Body's fire and the Spirit's star with the recorded passages into them), then
    its seven shrines; then the Choice. */
function buildStops(temple: TempleLike): Stop[] {
  const door = temple.entry();
  const stops: Stop[] = [{ shrine: -1, x: door.x, z: door.z, heading: door.heading, from: 0, to: CUES[1].t, title: "The temple" }];
  const intro = (g: number, from: number, to: number, title: string) => {
    const s = temple.introFor?.(g);
    if (s) stops.push({ shrine: -1, intro: g, x: s.x, z: s.z, heading: s.heading, from, to, title, hold: 6 });
  };
  for (let i = 0; i < 22; i++) {
    if (i === 0) intro(0, NaN, NaN, "The Mind");
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
  /** Paused from the half-moon: the walking and the going on stand still. */
  held = false;
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
  private panel: HTMLDivElement;
  private titleEl: HTMLElement;
  private hintEl: HTMLElement;
  private prevBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private choice: HTMLDivElement;
  private goal = new THREE.Vector2();
  private readonly dir = new THREE.Vector2();
  /** The wanderer's own way to the stop (world x, z), walked one point after another. */
  private walk: THREE.Vector2[] = [];
  private view = { dist: 7, pitch: 0.36 };

  constructor(
    scene: THREE.Scene,
    private narration: Narration,
    private player: PlayerLike,
    private follow: FollowLike,
    _hooks: TourHooks,
    private temple: TempleLike,
  ) {
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

    // the guide's panel: back, where you are going, next; and ✕ to end the tour
    const btn = (text: string, cls: string, label: string) => Object.assign(document.createElement("button"), { type: "button", textContent: text, className: cls, ariaLabel: label });
    this.panel = Object.assign(document.createElement("div"), { id: "tour-panel", hidden: true });
    this.prevBtn = btn("‹", "step", "Back");
    this.nextBtn = btn("Next ›", "step next", "Next");
    const end = btn("✕", "end", "End the tour");
    const mid = document.createElement("div");
    mid.className = "mid";
    this.titleEl = Object.assign(document.createElement("p"), { className: "title" });
    this.hintEl = Object.assign(document.createElement("p"), { className: "hint" });
    mid.append(this.titleEl, this.hintEl);
    this.panel.append(this.prevBtn, mid, this.nextBtn, end);
    document.body.append(this.panel);
    // the end: rest at the tree, or stay
    this.choice = Object.assign(document.createElement("div"), { id: "tour-choice", hidden: true });
    const rest = btn("Rest at the tree of life", "", "Rest at the tree of life");
    const stay = btn("Stay in the temple", "", "Stay in the temple");
    this.choice.append(rest, stay);
    document.body.append(this.choice);
    // on the touch itself (a phone sends no click while the other thumb holds the stick);
    // a keyboard's Enter or Space still clicks
    const act = (b: HTMLButtonElement, fn: () => void) => {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
      b.addEventListener("click", (e) => (e as MouseEvent).detail === 0 && fn());
    };
    act(this.prevBtn, () => this.go(this.index - 1));
    act(this.nextBtn, () => this.next());
    act(end, () => this.exit());
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
    this.choice.hidden = true;
    this.panel.hidden = false;
    this.light.visible = this.halo.visible = true;
    this.temple.signsLit?.(false); // the opening kindles them as it names them
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
    this.panel.hidden = true;
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
    if (k > 0) for (let g = 0; g < 3; g++) this.temple.kindleSign?.(g); // past the opening (or skipped): all named
    const s = this.stops[k], O = TEMPLE_ORIGIN;
    this.goal.set(s.x - O.x, s.z - O.z);
    this.path = route(this.lightAt, this.waitPoint(s));
    this.temple.setFocus?.(-1);
    // the wanderer's way: the same aisle, from where it stands to the standing place
    const from = new THREE.Vector2(this.player.pos.x - O.x, this.player.pos.z - O.z);
    this.walk = there ? [] : route(from, this.goal).map((p) => new THREE.Vector2(p.x + O.x, p.y + O.z));
    this.player.target = null;
    if (there || k === 0) this.arrive();
    this.refresh();
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
    // a part of the recording, or (the Mind's sign) a quiet moment
    if (Number.isFinite(s.from)) void this.narration.play(TRACK_ID, s.from, s.to);
    this.refresh();
  }

  private rite(i: number): void {
    if (i === this.riteOn) return;
    if (this.riteOn >= 0) this.temple.setRite(this.riteOn, false);
    if (i >= 0) this.temple.setRite(i, true);
    this.riteOn = i;
  }

  private refresh(): void {
    const s = this.stops[this.index];
    this.titleEl.textContent = s.title;
    this.hintEl.textContent = this.phase === "leading" ? "Walking there…" : this.phase === "speaking" ? "Listen" : this.index === this.stops.length - 1 ? "The end of the tour" : "Going on…";
    this.prevBtn.disabled = this.index === 0;
    this.nextBtn.textContent = this.index === this.stops.length - 1 ? "Finish ›" : "Next ›";
    this.nextBtn.classList.toggle("ready", this.phase === "done");
  }

  update(dt: number): void {
    if (!this.active) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0;
    this.lifeT += step;
    const O = TEMPLE_ORIGIN, s = this.stops[this.index];
    // the light travels its way, slowing into the last metres, then waits, turning slowly
    let moving = false;
    if (this.path.length) {
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
    } else if (this.phase === "leading") {
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
    this.follow.yaw += dy * Math.min(1, step * (at ? 1.4 : 2));
    this.follow.pitch += ((at ? 0.14 : 0.3) - this.follow.pitch) * Math.min(1, step * 1.5);
    if (this.follow.dist !== undefined) this.follow.dist += ((at ? 4.4 : 6) - this.follow.dist) * Math.min(1, step * 1.5);
    // its part spoken to its end (or no voice to speak it): a breath, then the light goes on by
    // itself; never before the part is over, so nothing is cut
    if (held) {
      // paused: nothing goes on
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
    this.panel.hidden = true;
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
    this.panel.remove();
    this.choice.remove();
  }
}
