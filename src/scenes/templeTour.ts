/* The temple tour: one guided walk through the real temple (world/temple.ts) on the narration's own
   clock (TEMPLE, 26 marks). A small light goes ahead; the wanderer follows it from shrine to shrine
   and, at each, the archetype itself wakes into its rite (its own movement opening fully, its
   card's objects coming alive; player/gestures.ts): the Mind down the left wall from the door, then
   a passage of light across to the Body's first shrine by the door and down the right wall, then
   through the gateway into the sanctuary, round the Spirit's ring, and to the Choice at the back.
   Between shrines the walk sways out toward the aisle and back in to the next (a slow S), and round
   the sanctuary it follows the ring. Where the wanderer is, is a pure function of narration time,
   so a seek or a stalled track lands on the same stone. The camera stays the wanderer's own.
   Nothing is drawn for the tour but its guiding light: the temple and its beings are the tour.
   Tap the light to leave; at the end, rest at the tree of life or stay. */
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
  /** The controller's tap-to-walk target: the tour sets a lead point here while walking so the
      walk clip plays at a matching pace; the tour's own position write wins each frame. */
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

const clamp01 = (x: number) => (Number.isFinite(x) ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0);
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const finite = (x: number, f = 0) => (Number.isFinite(x) ? x : f);

/* ---------------------------------------------------------------- the stations */
/** The sanctuary's centre (temple frame), around which the Spirit's ring is walked. */
const CENTRE = new THREE.Vector2(0, -44);

interface Stop {
  /** Temple-local ground position and the heading to face while there. */
  x: number;
  z: number;
  heading: number;
  /** The archetype whose shrine this is (0–21), or −1. */
  shrine: number;
  /** How the leg INTO this stop is walked. */
  way: "hall" | "ring" | "passage" | "straight";
  /** Waypoints on the way in (temple-local x, z), for walking round the columns. */
  via?: [number, number][];
}

function buildStops(temple: TempleLike): Stop[] {
  const O = TEMPLE_ORIGIN;
  const local = (p: { x: number; z: number; heading: number }, shrine: number, way: Stop["way"], via?: [number, number][]): Stop => ({ x: p.x - O.x, z: p.z - O.z, heading: p.heading, shrine, way, via });
  const stops: Stop[] = [];
  const door = temple.entry();
  stops.push(local(door, -1, "straight"));
  for (let i = 0; i < 7; i++) stops.push(local(temple.standFor(i), i, "hall")); // the Mind, down the left wall
  // the passage of light: across to the Body's first shrine, by the door on the right
  const viii = temple.standFor(7);
  stops.push({ x: viii.x - O.x - 1.2, z: viii.z - O.z + 2.5, heading: Math.PI + 0.4, shrine: -1, way: "passage" });
  for (let i = 7; i < 14; i++) stops.push(local(temple.standFor(i), i, "hall")); // the Body, down the right wall
  // through the gateway, round between the columns
  stops.push({ x: 0, z: -31.5, heading: 0, shrine: -1, way: "straight", via: [[3, -24.6]] });
  for (let i = 14; i < 21; i++) stops.push(local(temple.standFor(i), i, "ring")); // the Spirit's ring
  stops.push(local(temple.standFor(21), 21, "ring")); // the Choice
  const c = temple.standFor(21);
  stops.push({ x: c.x - O.x, z: c.z - O.z - 1.2, heading: c.heading, shrine: 21, way: "straight" }); // the landing, a step nearer
  return stops;
}

/* ---------------------------------------------------------------- the timing */
const ARRIVE_LEAD = 2.2; // settle at a station this long before its cue
const HOLD_MIN = 2.0, HOLD_MAX = 12.0;
interface Leg {
  arrive: number;
  depart: number;
  travel: number;
}
function buildLegs(n: number): Leg[] {
  const legs: Leg[] = [];
  for (let i = 0; i < n; i++) legs.push({ arrive: Math.max(0, finite(CUES[i]?.t ?? i * 24) - ARRIVE_LEAD), depart: Infinity, travel: 1 });
  for (let i = 0; i < n - 1; i++) {
    const a = legs[i].arrive, b = legs[i + 1].arrive;
    const gap = Math.max(2.5, b - a);
    const hold = Math.min(HOLD_MAX, Math.max(HOLD_MIN, gap * 0.42));
    legs[i].depart = a + Math.min(hold, gap - 1.2);
    legs[i].travel = Math.max(0.4, b - legs[i].depart);
  }
  return legs;
}

/* ---------------------------------------------------------------- the tour */
export class TempleTour implements SceneModule {
  readonly id = "tour";
  active = false;
  onTapOrb: (() => void) | null = null;
  onRest: (() => void) | null = null;
  camera: THREE.Camera | null = null;
  lastUT = 0;

  private stops: Stop[] | null = null;
  private legs: Leg[] = [];
  private light: THREE.Sprite;
  private lightMat: THREE.SpriteMaterial;
  private veil: HTMLDivElement;
  private choice: HTMLDivElement;
  private choiceShown = false;
  private released = false;
  private riteOn = -1;
  private lifeT = 0;
  private narrT = 0;
  private clockT = 0;
  private stalled = 0;
  private readonly lead = new THREE.Vector2();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (!this.active || !this.camera || this.choiceShown) return;
    const x = (ev.clientX / innerWidth) * 2 - 1, y = -(ev.clientY / innerHeight) * 2 + 1;
    this.tapCheck(x, y, this.camera);
  };

  constructor(
    scene: THREE.Scene,
    private narration: Narration,
    private player: PlayerLike,
    private follow: FollowLike,
    _hooks: TourHooks,
    private temple: TempleLike,
  ) {
    // the guiding light: a small soft glow, contained
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,244,222,1)");
    grd.addColorStop(0.18, "rgba(255,214,150,0.55)");
    grd.addColorStop(1, "rgba(255,190,120,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.lightMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 });
    this.light = new THREE.Sprite(this.lightMat);
    this.light.scale.setScalar(0.7);
    this.light.visible = false;
    scene.add(this.light);
    // the passage of light between the Mind and the Body
    this.veil = Object.assign(document.createElement("div"), { id: "tour-passage" });
    document.body.append(this.veil);
    // the end: rest at the tree, or stay
    this.choice = Object.assign(document.createElement("div"), { id: "tour-choice", hidden: true });
    const rest = Object.assign(document.createElement("button"), { type: "button", textContent: "Rest at the tree of life" });
    const stay = Object.assign(document.createElement("button"), { type: "button", textContent: "Stay in the temple" });
    const act = (fn: () => void) => (e: Event) => {
      e.preventDefault();
      fn();
    };
    rest.addEventListener("pointerdown", act(() => this.choose("rest")));
    stay.addEventListener("pointerdown", act(() => this.choose("stay")));
    for (const b of [rest, stay]) b.addEventListener("click", (e) => (e as MouseEvent).detail === 0 && b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })));
    this.choice.append(rest, stay);
    document.body.append(this.choice);
    window.addEventListener("pointerdown", this.onPointerDown);
  }

  /* ---------- lifecycle ---------- */
  enter(): void {
    if (this.active) return;
    this.active = true;
    this.released = false;
    this.choiceShown = false;
    this.choice.hidden = true;
    this.stops = buildStops(this.temple);
    this.legs = buildLegs(this.stops.length);
    this.lifeT = this.narrT = this.clockT = this.stalled = 0;
    this.player.target = null;
    this.light.visible = true;
    const seedT = finite(this.narration.debugTime ?? 0);
    this.ride(seedT, 1);
    void this.narration.play(TRACK_ID);
    this.follow.yaw = this.player.heading;
    this.follow.snapTo(this.player.pos);
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.player.target = null;
    this.narration.stop(1.5);
    this.light.visible = false;
    this.choice.hidden = true;
    this.veil.style.opacity = "0";
    if (this.riteOn >= 0) this.temple.setRite(this.riteOn, false);
    this.riteOn = -1;
  }

  /** Narration seconds; if the track never moves (a phone that will not start it), a quiet
      fallback keeps the walk going. */
  private readClock(dt: number): number {
    const raw = this.narration.time();
    const t = Number.isFinite(raw) && raw >= 0 ? raw : this.narrT;
    if (t > this.narrT + 1e-4) {
      this.narrT = this.clockT = t;
      this.stalled = 0;
    } else if (t < this.narrT - 1 && this.narration.current === TRACK_ID) {
      this.narrT = this.clockT = t; // a seek backwards
      this.stalled = 0;
    } else {
      this.narrT = t;
      this.stalled += dt;
      if (this.stalled > 2.5) this.clockT += dt;
      else this.clockT = Math.max(this.clockT, t);
    }
    return finite(this.clockT);
  }

  private legIndex(uT: number): number {
    for (let i = this.legs.length - 1; i >= 0; i--) if (uT >= this.legs[i].arrive) return i;
    return 0;
  }

  /** Where the wanderer is at narration second `uT` (temple-local, into `out`), the heading it
      would face, whether it is walking, and how far through a passage of light it is. */
  private place(uT: number, out: THREE.Vector3): { heading: number; walking: boolean; passage: number } {
    const S = this.stops!;
    const i = this.legIndex(uT), L = this.legs[i], a = S[i];
    if (!(uT > L.depart) || i >= S.length - 1) {
      out.set(a.x, 0, a.z);
      return { heading: a.heading, walking: false, passage: 0 };
    }
    const b = S[i + 1];
    const v = clamp01((uT - L.depart) / L.travel), e = smooth(v);
    let heading: number;
    if (b.way === "passage") {
      // a passage of light: the crossing happens while the light is full
      const p = e < 0.5 ? a : b;
      out.set(p.x, 0, p.z);
      return { heading: e < 0.5 ? a.heading : b.heading, walking: false, passage: Math.sin(v * Math.PI) };
    }
    if (b.way === "ring") {
      // round the sanctuary's centre, radius and angle eased together
      const ra = Math.hypot(a.x - CENTRE.x, a.z - CENTRE.y), rb = Math.hypot(b.x - CENTRE.x, b.z - CENTRE.y);
      const aa = Math.atan2(a.z - CENTRE.y, a.x - CENTRE.x);
      let ab = Math.atan2(b.z - CENTRE.y, b.x - CENTRE.x);
      if (ab - aa > Math.PI) ab -= Math.PI * 2;
      if (aa - ab > Math.PI) ab += Math.PI * 2;
      const ang = aa + (ab - aa) * e, r = ra + (rb - ra) * e + Math.sin(e * Math.PI) * 0.8;
      out.set(CENTRE.x + Math.cos(ang) * r, 0, CENTRE.y + Math.sin(ang) * r);
    } else {
      // along the hall: from shrine to shrine, swaying out toward the aisle between them
      const pts: [number, number][] = [[a.x, a.z], ...(b.via ?? []), [b.x, b.z]];
      const seg = e * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(seg)), f = seg - k;
      out.set(pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, 0, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f);
      if (b.way === "hall") out.x += -Math.sign(out.x) * Math.sin(e * Math.PI) * 1.6;
    }
    // facing the way it walks, turning to the shrine as it arrives
    const ahead = this.tmp2;
    this.placeRaw(Math.min(uT + 0.4, L.depart + L.travel), ahead);
    heading = Math.atan2(-(ahead.x - out.x), -(ahead.z - out.z));
    if (!Number.isFinite(heading) || Math.hypot(ahead.x - out.x, ahead.z - out.z) < 1e-3) heading = b.heading;
    const turn = smooth((v - 0.7) / 0.3);
    const d = Math.atan2(Math.sin(b.heading - heading), Math.cos(b.heading - heading));
    return { heading: heading + d * turn, walking: true, passage: 0 };
  }

  /** `place` without the heading (for looking a little ahead). */
  private placeRaw(uT: number, out: THREE.Vector3): void {
    const S = this.stops!;
    const i = this.legIndex(uT), L = this.legs[i], a = S[i];
    if (!(uT > L.depart) || i >= S.length - 1) return void out.set(a.x, 0, a.z);
    const b = S[i + 1], e = smooth(clamp01((uT - L.depart) / L.travel));
    if (b.way === "ring") {
      const ra = Math.hypot(a.x - CENTRE.x, a.z - CENTRE.y), rb = Math.hypot(b.x - CENTRE.x, b.z - CENTRE.y);
      const aa = Math.atan2(a.z - CENTRE.y, a.x - CENTRE.x);
      let ab = Math.atan2(b.z - CENTRE.y, b.x - CENTRE.x);
      if (ab - aa > Math.PI) ab -= Math.PI * 2;
      if (aa - ab > Math.PI) ab += Math.PI * 2;
      const ang = aa + (ab - aa) * e, r = ra + (rb - ra) * e + Math.sin(e * Math.PI) * 0.8;
      return void out.set(CENTRE.x + Math.cos(ang) * r, 0, CENTRE.y + Math.sin(ang) * r);
    }
    const pts: [number, number][] = [[a.x, a.z], ...(b.via ?? []), [b.x, b.z]];
    const seg = e * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(seg)), f = seg - k;
    out.set(pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, 0, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f);
    if (b.way === "hall") out.x += -Math.sign(out.x) * Math.sin(e * Math.PI) * 1.6;
  }

  /** Put the wanderer where the narration says, walking or standing; wake the shrine it is at. */
  private ride(uT: number, dt: number): void {
    const O = TEMPLE_ORIGIN, p = this.tmp;
    const s = this.place(uT, p);
    const wx = O.x + p.x, wz = O.z + p.z;
    this.player.pos.set(wx, this.temple.floorAt(wx, wz), wz);
    const h = finite(this.player.heading, s.heading), d = Math.atan2(Math.sin(s.heading - h), Math.cos(s.heading - h));
    this.player.heading = dt >= 1 ? s.heading : h + d * (1 - Math.exp(-3 * Math.max(0, dt)));
    // the walk clip plays through the controller's tap-walk target, a little ahead
    if (s.walking) {
      this.lead.set(wx - Math.sin(this.player.heading) * 0.9, wz - Math.cos(this.player.heading) * 0.9);
      this.player.target = this.lead;
    } else this.player.target = null;
    this.veil.style.opacity = String(s.passage);
    // the archetype of the station wakes into its rite while you are with it
    const i = this.legIndex(uT), st = this.stops![i];
    const want = !s.walking && st.shrine >= 0 ? st.shrine : -1;
    if (want !== this.riteOn) {
      if (this.riteOn >= 0) this.temple.setRite(this.riteOn, false);
      if (want >= 0) this.temple.setRite(want, true);
      this.riteOn = want;
    }
    // the guiding light waits ahead, at the next place
    const next = this.stops![Math.min(this.stops!.length - 1, i + 1)];
    const lx = O.x + (s.walking ? next.x : p.x - Math.sin(this.player.heading) * 1.6), lz = O.z + (s.walking ? next.z : p.z - Math.cos(this.player.heading) * 1.6);
    const target = this.tmp2.set(lx, this.temple.floorAt(lx, lz) + 2.1 + Math.sin(this.lifeT * 1.3) * 0.08, lz);
    if (dt >= 1) this.light.position.copy(target);
    else this.light.position.lerp(target, 1 - Math.exp(-1.6 * dt));
  }

  update(dt: number): void {
    if (!this.active) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0;
    this.lifeT += step;
    this.lightMat.opacity = smooth(this.lifeT / 2) * (0.75 + 0.2 * Math.sin(this.lifeT * 1.1));
    const uT = this.readClock(step);
    if (!this.released) this.ride(uT, step);
    if (!this.choiceShown && uT >= FINALE_T) this.showChoice();
    this.lastUT = uT;
  }

  private showChoice(): void {
    this.choiceShown = true;
    this.choice.hidden = false;
  }

  /** The end: rest at the tree of life, or stay in the temple and walk freely. */
  choose(key: "rest" | "stay"): void {
    this.choice.hidden = true;
    this.released = true;
    this.player.target = null;
    if (this.riteOn >= 0) this.temple.setRite(this.riteOn, false);
    this.riteOn = -1;
    this.light.visible = false;
    if (key === "rest") this.onRest?.();
  }

  tapCheck(ndcX: number, ndcY: number, camera: THREE.Camera): void {
    if (!this.active || this.choiceShown || !this.light.visible) return;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    // a generous reach round the small light
    if (this.raycaster.ray.distanceToPoint(this.light.position) < 0.7) this.onTapOrb?.();
  }

  holdsMovement(): boolean {
    return this.active && !this.released;
  }
  nearSeat(): boolean {
    return false;
  }
  onSit(): void {}
  onStand(): void {}

  dispose(): void {
    this.exit();
    this.light.removeFromParent();
    this.lightMat.map?.dispose();
    this.lightMat.dispose();
    this.veil.remove();
    this.choice.remove();
    window.removeEventListener("pointerdown", this.onPointerDown);
  }
}
