/* The temple tour: a guide, not a ride. You walk as you like; a small light goes ahead to the next
   shrine and waits there, turning slowly. Come to it and the archetype wakes into its rite (its own
   movement opening fully, its card's objects coming alive; player/gestures.ts) while its part of
   the temple's narration (TEMPLE, 26 marks) is spoken; then "Next" sends the light on. "‹" goes
   back, a tap on the light walks you to it, ✕ ends the tour and leaves you in the temple. The
   order is the narration's: the door, the Mind down the left wall, the Body down the right, the
   Spirit round the sanctuary, and the Choice at the back; after it, rest at the tree of life or
   stay. Nothing is drawn for the tour but its light: the temple and its beings are the tour. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { TEMPLE_ORIGIN } from "../world/temple";
import type { SceneModule } from "./lessonKit";

export { TEMPLE_ORIGIN };

export const TRACK_ID = "TEMPLE";
export const FINALE_T = 636.08;

export interface TourHooks {
  whisper: (text: string, ms?: number) => void;
}
/** What the tour needs of the temple. */
export interface TempleLike {
  standFor(i: number): { x: number; z: number; heading: number };
  setRite(i: number, on: boolean): void;
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
  snapTo(p: THREE.Vector3): void;
}
export interface CueDef {
  t: number;
  label: string;
}

/** The narration's own marks: timing only, never reworded, never moved. */
export const CUES: CueDef[] = [
  { t: 0.0, label: "opening" },
  { t: 41.84, label: "I — The Magician" },
  { t: 74.41, label: "II — The High Priestess" },
  { t: 104.45, label: "III — The Empress" },
  { t: 129.0, label: "IV — The Emperor" },
  { t: 151.74, label: "V — The Hierophant" },
  { t: 175.93, label: "VI — The Lovers" },
  { t: 205.81, label: "VII — The Chariot" },
  { t: 232.16, label: "transition: mind → body" },
  { t: 239.85, label: "VIII — Strength" },
  { t: 262.93, label: "IX — The Hermit" },
  { t: 287.05, label: "X — The Wheel of Fortune" },
  { t: 313.3, label: "XI — Justice" },
  { t: 337.3, label: "XII — The Hanged Man" },
  { t: 361.92, label: "XIII — Death" },
  { t: 385.29, label: "XIV — Temperance" },
  { t: 411.83, label: "transition: body → spirit" },
  { t: 418.82, label: "XV — The Devil" },
  { t: 444.95, label: "XVI — The Tower" },
  { t: 466.62, label: "XVII — The Star" },
  { t: 489.2, label: "XVIII — The Moon" },
  { t: 511.42, label: "XIX — The Sun" },
  { t: 531.38, label: "XX — Judgement" },
  { t: 551.68, label: "XXI — The World" },
  { t: 579.54, label: "XXII — The Fool (The Choice)" },
  { t: 612.14, label: "landing" },
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

/* ---------------------------------------------------------------- the stops */
interface Stop {
  /** The archetype whose shrine this is (0–21), or −1 for the door. */
  shrine: number;
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

/** The cue each shrine's part begins at: the Mind's seven follow the opening; the Body's first
    begins with the passage from the Mind, the Spirit's first with the passage from the Body. */
function cueFor(shrine: number): number {
  if (shrine < 7) return shrine + 1;
  if (shrine < 14) return shrine === 7 ? 8 : shrine + 2;
  return shrine === 14 ? 16 : shrine + 3;
}

function buildStops(temple: TempleLike): Stop[] {
  const door = temple.entry();
  const stops: Stop[] = [{ shrine: -1, x: door.x, z: door.z, heading: door.heading, from: 0, to: CUES[1].t, title: "The temple" }];
  for (let i = 0; i < 22; i++) {
    const s = temple.standFor(i), k = cueFor(i);
    const label = CUES[i === 7 ? 9 : i === 14 ? 17 : k].label.replace(" — ", " · ").replace(" (The Choice)", "");
    stops.push({ shrine: i, x: s.x, z: s.z, heading: s.heading, from: CUES[k].t, to: i === 21 ? FINALE_T : CUES[cueFor(i + 1)].t, title: i === 21 ? "XXII · The Choice" : label });
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
  onRest: (() => void) | null = null;
  camera: THREE.Camera | null = null;

  private stops: Stop[] = [];
  private index = 0;
  private phase: Phase = "leading";
  private riteOn = -1;
  private spoke = 0;
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
  private readonly raycaster = new THREE.Raycaster();
  private readonly dir = new THREE.Vector2();

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (!this.active || !this.camera || !this.light.visible) return;
    if ((ev.target as HTMLElement | null)?.closest?.("#tour-panel, #tour-choice")) return;
    const x = (ev.clientX / innerWidth) * 2 - 1, y = -(ev.clientY / innerHeight) * 2 + 1;
    this.tapCheck(x, y, this.camera);
  };

  constructor(
    scene: THREE.Scene,
    private narration: Narration,
    private player: PlayerLike,
    _follow: FollowLike,
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
    window.addEventListener("pointerdown", this.onPointerDown);
  }

  /* ---------- lifecycle ---------- */
  enter(): void {
    if (this.active) return;
    this.active = true;
    this.stops = buildStops(this.temple);
    this.lifeT = 0;
    this.choice.hidden = true;
    this.panel.hidden = false;
    this.light.visible = this.halo.visible = true;
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
    const s = this.stops[k], O = TEMPLE_ORIGIN;
    this.goal.set(s.x - O.x, s.z - O.z);
    this.path = route(this.lightAt, this.waitPoint(s));
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
    this.rite(s.shrine);
    void this.narration.play(TRACK_ID, s.from, s.to);
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
    this.hintEl.textContent = this.phase === "leading" ? "Follow the light, or tap it to walk there" : this.phase === "speaking" ? "Listen, and look around" : this.index === this.stops.length - 1 ? "The end of the tour" : "Next when you are ready";
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

    // arriving: come within reach of the standing place
    const px = this.player.pos.x - O.x, pz = this.player.pos.z - O.z;
    if (this.phase === "leading" && Math.hypot(px - this.goal.x, pz - this.goal.y) < ARRIVE_R) this.arrive();
    // its part spoken (or no voice to speak it): the light asks for Next
    if (this.phase === "speaking") {
      this.spoke += step;
      const t = this.narration.time();
      const ended = this.narration.debugTime === null && this.spoke > 1.5 && (this.narration.current !== TRACK_ID || t >= s.to - 0.15);
      if (ended) {
        this.phase = "done";
        this.refresh();
      }
    }
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

  /** A tap on the light walks you to where it waits. */
  tapCheck(ndcX: number, ndcY: number, camera: THREE.Camera): void {
    if (!this.active || !this.light.visible) return;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    if (this.raycaster.ray.distanceToPoint(this.light.position) > 0.9) return;
    const s = this.stops[this.index];
    this.player.target = new THREE.Vector2(s.x, s.z);
  }

  holdsMovement(): boolean {
    return false;
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
    window.removeEventListener("pointerdown", this.onPointerDown);
  }
}
