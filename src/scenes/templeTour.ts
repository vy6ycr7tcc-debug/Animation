/* The temple tour is the final walk.
   A small orb of light leads the wanderer through the temple's real interior —
   down the hall past the Mind's seven niches, around the sanctuary floor for
   the Body, then up an ephemeral stair of light above the sanctuary for the
   Spirit — pausing at all twenty-six stations, where the tarot kindles as its
   narration speaks. The walk is a dolly: the wanderer's position is a pure
   function of the narration's own clock, so a leap or a hundred small steps
   find the same stone. The camera stays the wanderer's own — look around freely.
   At the end stands the Choice on its dais, and choosing sets off the
   signature creation of light: birds, horses, crystals, rings, beams.
   Tap the orb to leave; rest to be taken to the tree. */
import * as THREE from "three/webgpu";
import type { SceneModule } from "./lessonKit";
import { CreationKit } from "./creationKit";
import { cardMesh, ignite, ignitionGlow, updateCards } from "./tarotTex";
import type { Narration } from "../core/narration";
import { T } from "../gpu/tsl";
import { TEMPLE_ORIGIN } from "../world/temple";

export { TEMPLE_ORIGIN };

export const TRACK_ID = "TEMPLE";
export const FINALE_T = 636.08;
export const DAIS_LOCAL = new THREE.Vector3(0, 0, -44);
export const LANDING_LOCAL = new THREE.Vector3(0, 0, -38);

export interface TourHooks {
  whisper: (text: string, ms?: number) => void;
}
export interface PlayerLike {
  pos: THREE.Vector3;
  heading: number;
  /** The controller's tap-to-walk target (controller.ts:81). The tour writes a
      lead point here while travelling so the controller computes pose="walk"
      and a matching speed, which is what wanderer.animate() reads. The body
      itself stays kinematic on the narration clock; the controller's positional
      displacement is discarded by the tour's own pos write each frame. */
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

/** The narration's own marks. These are timing only — never reworded, never moved. */
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

/* ------------------------------------------------------------------ *
 * Small, safe arithmetic
 * ------------------------------------------------------------------ */

const clamp01 = (x: number): number => (Number.isFinite(x) ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0);
const finite = (x: number, fallback = 0): number => (Number.isFinite(x) ? x : fallback);
const smooth01 = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** Shortest-arc blend between two headings. */
const mixAngle = (a: number, b: number, w: number): number => {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * clamp01(w);
};

/* ------------------------------------------------------------------ *
 * The 26 stops: Mind (door + seven hall niches), a transition,
 * Body (winding the sanctuary floor), a transition, Spirit (the
 * ascending stair of light above the sanctuary), and the landing
 * before the Choice. Each stop knows where the wanderer stands and
 * where its card floats; cards face their stop.
 * ------------------------------------------------------------------ */

export interface StopDef {
  /** where the wanderer stands, temple-local */
  p: THREE.Vector3;
  /** where the station's card floats, temple-local */
  c: THREE.Vector3;
}

/** The hall's niches, door to gateway (matches world/temple). */
const NICHE_Z = [25, 16.8, 8.6, 0.4, -7.8, -16, -24.2];

/** A card set out from the sanctuary's centre, facing a floor point. */
function cardOut(x: number, z: number, radius: number, y: number): THREE.Vector3 {
  const dx = x - DAIS_LOCAL.x;
  const dz = z - DAIS_LOCAL.z;
  const len = Math.sqrt(Math.max(0, dx * dx + dz * dz));
  const k = len > 1e-4 ? radius / len : 0;
  return new THREE.Vector3(DAIS_LOCAL.x + dx * k, finite(y, 3), DAIS_LOCAL.z + dz * k);
}

function buildStops(): StopDef[] {
  const stops: StopDef[] = [];

  // 0 — the door
  stops.push({ p: new THREE.Vector3(0, 0, 28.6), c: new THREE.Vector3(0, 3.4, 31.3) });

  // 1..7 — the Mind's seven niches down the left wall. The walk line runs
  // down the hall's centre (x = 0.6 ± 0.2), clear of both column rows at
  // x = ±5.5; the niche z's interleave the column z's, so a card seen
  // straight-on from its own z never crosses a column.
  for (let i = 0; i < 7; i++) {
    const z = finite(NICHE_Z[i], 25 - i * 8.2);
    const sway = Math.sin(i * 1.9) * 0.2;
    stops.push({
      p: new THREE.Vector3(0.6 + sway, 0, z),
      c: new THREE.Vector3(-10.2, 3.2, z),
    });
  }

  // 8 — the gateway (mind → body)
  stops.push({ p: new THREE.Vector3(0, 0.08, -27.6), c: new THREE.Vector3(0, 3.6, -30.8) });

  // 9..15 — the Body, winding the sanctuary floor around the dais, threading
  // inside the Spirit's plinth ring: every stop keeps clear of the dais
  // (r 4.2), the plinth stubs, and the Choice platform (z > -52.9 here).
  // The cards stand out at radius 15, clear of the Spirit cards and the walls.
  const body: Array<[number, number]> = [
    [5.5, -34.8],
    [10.2, -41.2],
    [6.5, -46.5],
    [2.0, -50.2],
    [-3.0, -49.7],
    [-6.2, -45.9],
    [-9.5, -39.5],
  ];
  for (const [x, z] of body) {
    stops.push({ p: new THREE.Vector3(x, 0.25, z), c: cardOut(x, z, 15, 3.4) });
  }

  // 16 — the foot of the stair of light (body → spirit)
  stops.push({ p: new THREE.Vector3(-8.2, 0.35, -37.6), c: cardOut(-8.2, -37.6, 13.5, 5.0) });

  // 17..24 — the Spirit, a spiral stair rising over the sanctuary.
  // Known limitation (off-limits, documented not worked around): heightAt
  // delegates to temple.floorAt, which knows only the hall floor (y ≈ 1.0–1.3)
  // and the dais steps (up to ≈ 2.2) — NOT this stair. On these stops the
  // controller sees the figure airborne and FORCES pose="air"; the walk clip
  // cannot play there without touching the controller (out of scope).
  for (let i = 0; i < 8; i++) {
    const a = (150 + i * (270 / 7)) * (Math.PI / 180);
    const r = 8.5 - i * 0.4286;
    const y = 1.6 + i * (10.2 / 7);
    const x = r * Math.cos(a);
    const z = DAIS_LOCAL.z + r * Math.sin(a);
    stops.push({ p: new THREE.Vector3(x, y, z), c: cardOut(x, z, 12.5, y + 1.2) });
  }

  // 25 — the landing, before the Choice (four metres kept clear of the dais)
  stops.push({
    p: new THREE.Vector3(0, 0.25, LANDING_LOCAL.z),
    c: new THREE.Vector3(0, 7.2, DAIS_LOCAL.z),
  });

  return stops;
}

export const STOPS: StopDef[] = buildStops();

/** One smooth rail through all 26 stops. */
const PATH = new THREE.CatmullRomCurve3(
  STOPS.map((s) => s.p.clone()),
  false,
  "centripetal",
);

/* ------------------------------------------------------------------ *
 * Timing: one leg of the ride per cue — arrive, hold while the
 * station kindles, glide on. Everything is a pure function of uT.
 * ------------------------------------------------------------------ */

const ARRIVE_LEAD = 2.2; // settle at a station this long before its cue
const HOLD_MIN = 2.0;
const HOLD_MAX = 12.0;

interface Leg {
  arrive: number;
  depart: number;
  travel: number;
}

function buildLegs(): Leg[] {
  const n = STOPS.length;
  const legs: Leg[] = [];
  for (let i = 0; i < n; i++) {
    const cue = CUES[i];
    const t = finite(cue ? cue.t : i * 24);
    legs.push({ arrive: Math.max(0, t - ARRIVE_LEAD), depart: 0, travel: 1 });
  }
  for (let i = 0; i < n - 1; i++) {
    const a = finite(legs[i]!.arrive);
    const b = finite(legs[i + 1]!.arrive, a + 20);
    const gap = Math.max(2.5, b - a);
    const hold = Math.min(HOLD_MAX, Math.max(HOLD_MIN, gap * 0.42));
    const depart = a + Math.min(hold, gap - 1.2);
    legs[i]!.depart = finite(depart, a + 1);
    legs[i]!.travel = Math.max(0.4, b - finite(legs[i]!.depart, a + 1));
  }
  const last = legs[n - 1];
  if (last) {
    last.depart = Number.POSITIVE_INFINITY;
    last.travel = 1;
  }
  return legs;
}

const LEGS: Leg[] = buildLegs();

function legIndex(uT: number): number {
  const t = finite(uT);
  for (let i = LEGS.length - 1; i >= 0; i--) {
    if (t >= finite(LEGS[i]!.arrive)) return i;
  }
  return 0;
}

/** Curve parameter for a narration second: parked at a stop, or eased between two. */
function pathU(uT: number): number {
  const i = legIndex(uT);
  const L = LEGS[i]!;
  const denom = Math.max(1, STOPS.length - 1);
  let u = i / denom;
  const depart = L.depart;
  if (Number.isFinite(depart) && uT > depart && i < STOPS.length - 1) {
    const v = clamp01((uT - depart) / Math.max(0.001, L.travel));
    u += smooth01(v) / denom; // slow in / slow out — never constant velocity
  }
  return clamp01(u);
}

function samplePos(uT: number, out: THREE.Vector3): THREE.Vector3 {
  return PATH.getPoint(pathU(uT), out);
}

const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();

function sampleTangent(uT: number, out: THREE.Vector3): THREE.Vector3 {
  samplePos(uT - 0.5, scratchA);
  samplePos(uT + 0.5, scratchB);
  out.subVectors(scratchB, scratchA);
  const l = Math.sqrt(Math.max(0, out.x * out.x + out.y * out.y + out.z * out.z));
  if (l > 1e-5) out.multiplyScalar(1 / l);
  else out.set(0, 0, -1);
  return out;
}

/** 1 while the wanderer dwells at a stop, easing to 0 along the way to the next. */
function holdWeight(uT: number): number {
  const i = legIndex(uT);
  const L = LEGS[i]!;
  const depart = L.depart;
  if (!Number.isFinite(depart) || !(uT > depart)) return 1;
  const u = clamp01((uT - depart) / Math.max(0.001, L.travel));
  return u < 0.3 ? 1 - smooth01(u / 0.3) : smooth01((u - 0.7) / 0.3);
}

/* ------------------------------------------------------------------ *
 * Shared soft glow (the same warm breath the cards use)
 * ------------------------------------------------------------------ */

let glowTex: THREE.CanvasTexture | null = null;

function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;

  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0.0, "rgba(255,232,186,1)");
    g.addColorStop(0.32, "rgba(255,200,124,0.55)");
    g.addColorStop(0.68, "rgba(224,158,66,0.18)");
    g.addColorStop(1.0, "rgba(180,110,30,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.name = "tour-glow";
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  glowTex = tex;
  return tex;
}

/* ------------------------------------------------------------------ *
 * The stations: a tarot card and a soft lamp of light on the floor.
 * The lamps breathe off the scene-local life clock, each with its own
 * phase and tempo — a field of lights breathing out of sync.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * TEXTURE-SOURCE HOOK — the station cards (the one deliberate seam).
 *
 * createStationCardTexture() is the single place where a station's card
 * imagery is resolved. TODAY it returns the station index itself, so
 * tarotTex.cardMesh() draws its default procedural card texture — that
 * default stays until the real art is wired in.
 *
 * THIS is the slot where the 12 real Egyptian-tarot scans will plug in
 * once the user decides the 12 -> 26 mapping (which scan stands behind
 * which of the 26 stations). Do NOT guess that mapping here. When it is
 * decided, resolve it inside this function; nothing else in this file
 * changes. tarotTex.ts stays untouched — its cardMesh(i, w, h) signature
 * is fixed and takes the deck index it builds its texture from.
 * ------------------------------------------------------------------ */
function createStationCardTexture(stationIndex: number): number {
  return stationIndex;
}

/** Station-card factory — every station card is born here (hook above). */
function createStationCard(stationIndex: number, w: number, h: number): THREE.Group {
  return cardMesh(createStationCardTexture(stationIndex), w, h);
}

interface StationState {
  card: THREE.Group;
  level: { value: number };
  ignited: boolean;
}

/** A TSL node: JS-side `.value` and shader-side `.mul()` — same convention as gpu/tsl. */
type LifeClock = any;

class StationSet {
  readonly group = new THREE.Group();
  private readonly states: StationState[] = [];
  private lastUT = 0;

  constructor(stops: StopDef[], life: LifeClock) {
    this.group.name = "temple-tour-stations";
    const tex = T.texture(glowTexture());

    for (let i = 0; i < stops.length; i++) {
      const s = stops[i]!;

      const card = createStationCard(i, 2.2, 3.4);
      card.position.copy(s.c);
      const dx = s.p.x - s.c.x;
      const dz = s.p.z - s.c.z;
      card.rotation.y = dx * dx + dz * dz > 1e-4 ? Math.atan2(dx, dz) : 0;
      card.visible = false;
      card.scale.setScalar(0.9);
      this.group.add(card);

      const level = T.uniform(0);
      const mat = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        // additiveKeepsAlpha (style rule #3): adds light, leaves alpha alone
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        fog: false,
        side: THREE.DoubleSide,
        // the lamp disc floats 6cm above the stone and 1cm above the way-light
        // thread; additive + depthWrite:false already means no depth writes to
        // fight over, and this pulls it a hair toward the eye as belt-and-braces
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      mat.colorNode = tex.rgb.mul(T.vec3(1.0, 0.86, 0.58));

      // per-station breathing: golden-angle phase spread + a tempo that varies
      // per stop, off the local life clock (never the frozen global one)
      const phase = i * 2.39996323;
      const tempo = 0.42 + 0.09 * Math.sin(i * 1.7);
      const breathe = T.sin(life.mul(tempo).add(phase)).mul(0.14).add(0.86);
      mat.opacityNode = tex.a.mul(level).mul(breathe);

      const marker = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2), mat);
      marker.position.set(s.p.x, s.p.y + 0.06, s.p.z);
      marker.renderOrder = -1;
      this.group.add(marker);

      this.states.push({ card, level, ignited: false });
    }
  }

  update(uT: number, lifeT: number): void {
    const t = finite(uT);
    const lt = finite(lifeT);
    if (t < this.lastUT - 1) this.reset();
    const reveal = smooth01(lt / 2.8); // the thread wakes over ~3s, never at frame 1

    for (let i = 0; i < this.states.length; i++) {
      const st = this.states[i]!;
      const cue = CUES[i];
      const at = finite(cue ? cue.t : 0);
      const leg = LEGS[i];
      const arrive = finite(leg ? leg.arrive : 0);
      const focus = legIndex(t) === i ? 1 : 0.28;

      // staggered, eased reveal — each card unfolds in its own breath
      const revAt = arrive - 3.4 - (i % 5) * 0.24;
      st.card.visible = t >= revAt;
      const grow = 0.9 + 0.1 * smooth01((t - revAt) / 1.8);
      st.card.scale.setScalar(grow);

      if (!st.ignited && t >= at) {
        // ignition is anchored to the cue itself, so any seek finds the same flare
        ignite(st.card, at);
        st.ignited = true;
      }
      st.level.value = reveal * clamp01(0.12 + 1.05 * ignitionGlow(t - at) * (0.32 + 0.68 * focus));
    }

    updateCards(this.group, t);
    this.lastUT = t;
  }

  reset(): void {
    for (const st of this.states) {
      st.ignited = false;
      st.card.visible = false;
      st.card.scale.setScalar(0.9);
      st.level.value = 0.12;
    }
    this.lastUT = 0;
  }
}

/* ------------------------------------------------------------------ *
 * The way is lit: one thread of soft gold discs along the whole ride,
 * which becomes the ephemeral stair where the path rises (the Spirit).
 * Two sines at an irrational ratio keep the flicker from ever being
 * predictable; each disc's phase comes from where it lies in the world.
 * ------------------------------------------------------------------ */

function buildWayLights(life: LifeClock): { mesh: THREE.InstancedMesh; level: LifeClock } {
  const tex = T.texture(glowTexture());
  const level = T.uniform(1);

  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    // additiveKeepsAlpha (style rule #3): adds light, leaves alpha alone
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    fog: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const phase = T.positionWorld.x.mul(0.31).add(T.positionWorld.z.mul(0.19));
  const w1 = T.sin(life.mul(1.1).add(phase)).mul(0.5).add(0.5);
  const w2 = T.sin(life.mul(0.618).add(phase.mul(1.37)).add(2.1)).mul(0.5).add(0.5);
  const wave = w1.mul(0.62).add(w2.mul(0.38));
  mat.colorNode = tex.rgb.mul(T.vec3(1.0, 0.87, 0.6));
  mat.opacityNode = tex.a.mul(level).mul(T.float(0.34).add(wave.mul(0.5)));

  const samples: THREE.Vector3[] = [];
  const n = STOPS.length;
  for (let i = 0; i < n - 1; i++) {
    const steps = i >= 16 ? 4 : 3; // tighter treads on the stair
    for (let k = 0; k < steps; k++) {
      samples.push(PATH.getPoint(clamp01((i + k / steps) / Math.max(1, n - 1)), new THREE.Vector3()));
    }
  }
  samples.push(PATH.getPoint(1, new THREE.Vector3()));

  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, samples.length);
  const m = new THREE.Matrix4();
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    const elevated = finite(p.y) > 0.8;
    const size = elevated ? 1.55 : 1.05;
    m.makeScale(size, 1, size);
    m.setPosition(finite(p.x), finite(p.y) + (elevated ? -0.14 : 0.05), finite(p.z));
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return { mesh, level };
}

/* ------------------------------------------------------------------ *
 * The orb that leads — a light source, so it is the one thing here
 * that is allowed to shine. It breathes on the local life clock.
 * ------------------------------------------------------------------ */

interface OrbRig {
  group: THREE.Group;
  core: THREE.Mesh;
  setDimmed(d: boolean): void;
  setFade(f: number): void;
}

function buildOrbMesh(life: LifeClock): OrbRig {
  const group = new THREE.Group();
  const uLevel = T.uniform(0);
  let dim = 1;
  let fade = 0;
  const apply = (): void => {
    uLevel.value = clamp01(fade) * (dim > 0.5 ? 1 : 0.3);
  };

  const coreMat = new THREE.MeshBasicNodeMaterial({ fog: false });
  coreMat.colorNode = T.Fn(() => {
    // two breaths layered at an irrational ratio, so it never feels metronomic
    const b = T.sin(life.mul(1.5)).mul(0.6).add(T.sin(life.mul(0.83).add(2.1)).mul(0.4));
    const breathe = b.mul(0.08).add(0.92);
    return T.vec3(1.0, 0.76, 0.4).mul(breathe).mul(uLevel);
  })();

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), coreMat);
  group.add(core);

  const haloMat = new THREE.SpriteNodeMaterial({
    map: glowTexture(),
    transparent: true,
    depthWrite: false,
    // additiveKeepsAlpha (style rule #3): adds light, leaves alpha alone
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    fog: false,
  });
  haloMat.opacityNode = T.Fn(() => {
    const b = T.sin(life.mul(1.5).add(0.4)).mul(0.6).add(T.sin(life.mul(0.83).add(2.5)).mul(0.4));
    const breathe = b.mul(0.1).add(0.9);
    return breathe.mul(0.55).mul(uLevel);
  })();

  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(1.1, 1.1, 1);
  group.add(halo);

  // a generous, invisible target so a thumb finds the orb on a phone
  const tapMat = new THREE.MeshBasicNodeMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const tap = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8), tapMat);
  tap.renderOrder = -10;
  group.add(tap);

  return {
    group,
    core,
    setDimmed(d: boolean): void {
      dim = d ? 0 : 1;
      apply();
    },
    setFade(f: number): void {
      fade = finite(f);
      apply();
    },
  };
}

/* ------------------------------------------------------------------ *
 * The Choice
 * ------------------------------------------------------------------ */

function createChoiceOverlay(onChoose: (key: "love" | "rest" | "undecided") => void): {
  show(): void;
  hide(): void;
  dispose(): void;
} {
  const root = document.createElement("div");
  root.id = "tour-choice";
  root.style.position = "fixed";
  root.style.top = "0";
  root.style.left = "0";
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.display = "none";
  root.style.flexDirection = "column";
  root.style.alignItems = "center";
  root.style.justifyContent = "center";
  root.style.zIndex = "9999";
  root.style.background = "rgba(0, 0, 0, 0.72)";
  root.style.color = "#e8c874";

  const prompt = document.createElement("div");
  prompt.textContent = "The road is walked. What is not yet waits on your choosing.";
  prompt.style.fontFamily = "Georgia, 'Times New Roman', serif";
  prompt.style.fontSize = "24px";
  prompt.style.textAlign = "center";
  prompt.style.marginBottom = "24px";
  prompt.style.color = "#e8c874";
  root.appendChild(prompt);

  const keys: Array<"love" | "rest" | "undecided"> = ["love", "rest", "undecided"];
  for (const key of keys) {
    const btn = document.createElement("button");
    btn.textContent = key;
    btn.style.display = "block";
    btn.style.margin = "6px";
    btn.style.padding = "10px 28px";
    btn.style.fontSize = "18px";
    btn.style.fontFamily = "Georgia, 'Times New Roman', serif";
    btn.style.color = "#e8c874";
    btn.style.background = "rgba(20, 16, 8, 0.85)";
    btn.style.border = "1px solid #e8c874";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => onChoose(key));
    root.appendChild(btn);
  }

  document.body.appendChild(root);

  return {
    show(): void {
      root.style.display = "flex";
    },
    hide(): void {
      root.style.display = "none";
    },
    dispose(): void {
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
}

/* ------------------------------------------------------------------ *
 * The finale: the game's signature creation, birds → horses →
 * crystals → rings → beams, around the Choice — staggered over
 * sixteen seconds so one thing happens at a time.
 * ------------------------------------------------------------------ */

class FinaleFX {
  private readonly kit: CreationKit;
  private readonly center: THREE.Vector3;
  private firedBirds = false;
  private firedHorses = false;
  private firedCrystals = false;
  private firedRings = false;
  private firedBeams = false;

  constructor(kit: CreationKit, center: THREE.Vector3) {
    this.kit = kit;
    this.center = center;
  }

  update(ft: number): void {
    const t = finite(ft);
    if (!this.firedBirds && t >= 0) {
      this.firedBirds = true;
      this.kit.birds(60, this.center, 6, 3);
    }
    if (!this.firedHorses && t >= 4) {
      this.firedHorses = true;
      this.kit.horses(this.center, 4);
    }
    if (!this.firedCrystals && t >= 8) {
      this.firedCrystals = true;
      this.kit.crystals(120, this.center, 5);
    }
    if (!this.firedRings && t >= 12) {
      this.firedRings = true;
      this.kit.rings(this.center, 9, 6);
    }
    if (!this.firedBeams && t >= 16) {
      this.firedBeams = true;
      const positions: THREE.Vector3[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        positions.push(
          new THREE.Vector3(
            this.center.x + Math.cos(a) * 2.2,
            this.center.y,
            this.center.z + Math.sin(a) * 2.2,
          ),
        );
      }
      this.kit.beams(positions, 10, 0.5);
    }
  }
}

/* ------------------------------------------------------------------ *
 * The tour
 * ------------------------------------------------------------------ */

export class TempleTour implements SceneModule {
  readonly id = "tour";
  active = false;
  onTapOrb: (() => void) | null = null; // coordinator: exit() + crossTemple(false)
  onRest: (() => void) | null = null; // coordinator: tree + tree.rest()

  /** The coordinator may assign its render camera so taps can be raycast. */
  camera: THREE.Camera | null = null;
  /** Narration seconds the ride is currently living in (for debugging/coordinator reads). */
  lastUT = 0;

  private readonly scene: THREE.Scene;
  private readonly narration: Narration;
  private readonly player: PlayerLike;
  private readonly follow: FollowLike;
  private readonly hooks: TourHooks;

  /**
   * The scene's own life clock, advanced by dt in update(). Ambient motion
   * (breathing lamps, the orb's breath, the way-light flicker) lives here,
   * so it never freezes with the global clock and never depends on the
   * narration's progress. Convention matches CreationKit's private uT.
   */
  private readonly life = T.uniform(0);
  private lifeT = 0;

  private root: THREE.Group | null = null;
  private stations: StationSet | null = null;
  private wayLights: { mesh: THREE.InstancedMesh; level: LifeClock } | null = null;
  private orb: OrbRig | null = null;
  private kit: CreationKit | null = null;

  private released = false;
  private choiceDone = false;
  private finaleT = 0;
  private finaleFx: FinaleFX | null = null;
  private overlay: ReturnType<typeof createChoiceOverlay> | null = null;

  /** The narration clock, with a quiet fallback if the track never starts. */
  private narrT = 0;
  private clockT = 0;
  private stalled = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpT = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  /** One reused lead point for the controller's tap-walk target (never per-frame). */
  private readonly leadTarget = new THREE.Vector2();

  // Bound once; only removed in dispose(). Uses this.camera if the coordinator set it.
  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (!this.active || this.choiceDone) return;
    const cam = this.camera;
    if (!cam) return;
    const el = ev.target as HTMLElement | null;
    const rect = el && typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.tapCheck(x, y, cam);
  };

  constructor(
    scene: THREE.Scene,
    narration: Narration,
    player: PlayerLike,
    follow: FollowLike,
    hooks: TourHooks,
  ) {
    this.scene = scene;
    this.narration = narration;
    this.player = player;
    this.follow = follow;
    this.hooks = hooks;
    window.addEventListener("pointerdown", this.onPointerDown);
  }

  /* ---------- lifecycle ---------- */

  enter(): void {
    if (this.active) return;
    this.active = true;
    this.released = false;
    this.choiceDone = false;
    this.finaleT = 0;
    this.finaleFx = null;
    this.narrT = 0;
    this.clockT = 0;
    this.stalled = 0;
    this.lastUT = 0;
    this.lifeT = 0;
    this.life.value = 0;
    this.overlay?.hide();

    this.root = new THREE.Group();
    this.root.name = "temple-tour";
    this.root.position.copy(TEMPLE_ORIGIN);
    this.scene.add(this.root);

    this.stations = new StationSet(STOPS, this.life);
    this.root.add(this.stations.group);

    this.wayLights = buildWayLights(this.life);
    this.root.add(this.wayLights.mesh);

    this.orb = buildOrbMesh(this.life);
    this.root.add(this.orb.group);

    this.kit = new CreationKit();
    this.root.add(this.kit.group);

    // no stale tap-walk target carried in from a previous scene
    this.player.target = null;

    // Set the wanderer on the rail before the camera is snapped to them.
    // Still-frame debug (?shot=temple-tour&t=) runs exactly one update() after
    // enter(), so the rendered pose/position come from here: seed the rail at
    // the shot's debug clock instead of 0 and snap the heading to the rail
    // direction (one frame never visibly smooths it). Live play: debugTime is
    // null → seedT 0 → byte-identical to the old updateRide(0, 0).
    const seedT = finite(this.narration.debugTime ?? 0, 0);
    this.updateRide(seedT, 0);
    this.updateOrb(seedT, 0);
    if (this.narration.debugTime !== null) {
      sampleTangent(seedT, this.tmpT);
      const hx = finite(this.tmpT.x, 0);
      const hz = finite(this.tmpT.z, -1);
      if (hx * hx + hz * hz > 1e-6) this.player.heading = Math.atan2(hx, hz);
    }

    void this.narration.play(TRACK_ID);
    this.follow.snapTo(this.player.pos);
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.released = false;
    this.choiceDone = false;
    this.player.target = null; // no stale tap-walk target after the tour

    this.narration.stop(1.5);
    this.overlay?.hide();

    this.kit?.dispose();
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
    }

    this.root = null;
    this.stations = null;
    this.wayLights = null;
    this.orb = null;
    this.kit = null;
    this.finaleFx = null;
    this.narrT = 0;
    this.clockT = 0;
    this.stalled = 0;
    this.lastUT = 0;
    this.lifeT = 0;
    this.life.value = 0;
  }

  /* ---------- the clock ---------- */

  /**
   * Narration seconds. `narration.time()` is the master; if it never moves
   * (a track that will not start on a phone) a quiet fallback keeps the walk
   * going so the tour is never a still picture with a voice over it.
   */
  private readClock(dt: number): number {
    const raw = this.narration.time();
    const t = Number.isFinite(raw) && raw >= 0 ? raw : this.narrT;
    const playing = this.narration.current === TRACK_ID;

    if (t > this.narrT + 1e-4) {
      this.narrT = t;
      this.clockT = t;
      this.stalled = 0;
    } else if (t < this.narrT - 1) {
      if (playing) {
        // a seek backwards through our own track: rewind with it
        this.narrT = t;
        this.clockT = t;
        this.stalled = 0;
        this.stations?.reset();
      } else {
        // the track ended (or another is up): hold the last good time
        this.narrT = t;
        this.stalled += dt;
        if (this.stalled > 2.5) this.clockT += dt;
      }
    } else {
      this.narrT = t;
      this.stalled += dt;
      if (this.stalled > 2.5) this.clockT += dt;
      else this.clockT = Math.max(this.clockT, t);
    }

    return finite(this.clockT);
  }

  /* ---------- the ride ---------- */

  /** Dolly the wanderer along the rail; the camera stays their own. */
  private updateRide(uT: number, dt: number): void {
    const pos = this.tmpV;
    const tan = this.tmpT;
    samplePos(uT, pos);
    sampleTangent(uT, tan);

    const i = legIndex(uT);
    const w = holdWeight(uT);
    const stop = STOPS[i] ?? STOPS[0];

    // Dwells stand still — the idle clip breathes on its own (the old
    // Lissajous drift is gone; the heading logic below still uses w).
    this.player.pos.set(
      TEMPLE_ORIGIN.x + finite(pos.x),
      TEMPLE_ORIGIN.y + finite(pos.y),
      TEMPLE_ORIGIN.z + finite(pos.z),
    );

    // the wanderer faces down the rail, and turns toward the station while dwelling
    let want = Math.atan2(finite(tan.x, 0), finite(tan.z, -1));
    if (stop && w > 0.001) {
      const dx = stop.c.x - pos.x;
      const dz = stop.c.z - pos.z;
      if (dx * dx + dz * dz > 1e-3) want = mixAngle(want, Math.atan2(dx, dz), w * 0.85);
    }
    const h = finite(this.player.heading, want);
    const d = Math.atan2(Math.sin(want - h), Math.cos(want - h));
    this.player.heading = h + d * (1 - Math.exp(-4 * Math.max(0, dt)));
    if (!Number.isFinite(this.player.heading)) this.player.heading = want;

    // The walk cycle. The controller recomputes pose/speed every frame from its
    // own displacement, so its tap-walk target is the ONLY channel into
    // wanderer.animate() (controller.ts:144-150: mag = min(1, d/1.2), WALK 1.6).
    // 2D rail speed, pure function of uT (seek-safe), matching the controller's.
    samplePos(uT - 0.25, this.tmpA);
    samplePos(uT + 0.25, this.tmpB);
    const rx = this.tmpB.x - this.tmpA.x;
    const rz = this.tmpB.z - this.tmpA.z;
    const v = Math.sqrt(Math.max(0, rx * rx + rz * rz)) / 0.5;
    if (v > 0.3) {
      // Steady state: min(1, d/1.2)*1.6 ≈ v for v ≥ 0.6 — exact pace match,
      // feet plant. The 0.45 floor keeps d above the 0.35 arrival radius so
      // the walk never stalls mid-leg (mild skate below v ≈ 0.6 is accepted).
      const lead = Math.min(1.15, Math.max(0.45, 0.75 * v));
      // x/z rail tangent (y zeroed), guarded against a degenerate 2D length
      const tx = finite(tan.x, 0);
      const tz = finite(tan.z, -1);
      const tl = Math.sqrt(Math.max(0, tx * tx + tz * tz));
      const k = tl > 1e-5 ? lead / tl : 0;
      // player.pos is world space (TEMPLE_ORIGIN added) — the target is too
      this.leadTarget.set(this.player.pos.x + tx * k, this.player.pos.z + tz * k);
      this.player.target = this.leadTarget;
    } else {
      // dwelling: the figure stands at the stop (idle clip), turned to its card
      this.player.target = null;
    }
  }

  /**
   * The orb leads down the rail, and leans in toward the station while it
   * kindles. Its bob is ambient life — layered sines on the life clock, so it
   * breathes even if the narration stands still.
   */
  private updateOrb(uT: number, lifeT: number): void {
    const orb = this.orb;
    if (!orb) return;

    const i = legIndex(uT);
    const w = holdWeight(uT);
    const stop = STOPS[i] ?? STOPS[0];

    samplePos(uT + 1.4, this.tmpA);
    this.tmpA.y = finite(this.tmpA.y) + 1.55;

    if (stop) {
      this.tmpB.set(stop.p.x, stop.p.y + 1.75, stop.p.z).lerp(stop.c, 0.42);
      this.tmpA.lerp(this.tmpB, clamp01(w));
    }

    const lt = finite(lifeT);
    this.tmpA.y += Math.sin(lt * 1.4) * 0.06 + Math.sin(lt * 0.83 + 2.1) * 0.04;
    this.tmpA.x += Math.sin(lt * 0.61 + 1.1) * 0.03;

    orb.setFade(smooth01(lt / 1.8));
    orb.group.position.set(finite(this.tmpA.x), finite(this.tmpA.y), finite(this.tmpA.z));
  }

  /* ---------- frame ---------- */

  update(dt: number): void {
    if (!this.active) return;

    // frame-rate independent, capped so a tab-resume cannot leap
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0;

    // the ambient life clock: real seconds, independent of narration progress
    this.lifeT = finite(this.lifeT + step);
    this.life.value = this.lifeT;

    const uT = this.readClock(step);

    this.stations?.update(uT, this.lifeT);
    this.updateRide(uT, step);
    this.updateOrb(uT, this.lifeT);

    if (this.wayLights) {
      // a slow reveal on entry, then a long breath the shader flicker rides on
      const reveal = smooth01(this.lifeT / 2.4);
      this.wayLights.level.value = reveal * (0.85 + 0.15 * Math.sin(this.lifeT * 0.27 + 1.3));
    }

    if (!this.choiceDone && uT >= FINALE_T) this.startChoice();

    if (this.choiceDone && this.finaleFx) {
      this.finaleT += step;
      this.finaleFx.update(this.finaleT);
      this.kit?.update(step, this.finaleT);
    } else {
      this.kit?.update(step, uT);
    }

    this.lastUT = uT;
  }

  /* ---------- the choice ---------- */

  startChoice(): void {
    if (this.choiceDone) return;
    this.choiceDone = true;
    this.overlay = createChoiceOverlay((k) => this.choose(k));
    this.overlay.show();
    this.hooks.whisper("The road is walked. What is not yet waits on your choosing.", 9000);
  }

  choose(key: "love" | "rest" | "undecided"): void {
    this.overlay?.hide();

    const line =
      key === "love"
        ? "And so it is — the light you carry is the light you are."
        : key === "rest"
          ? "Then rest. The tree is waiting."
          : "Not choosing is also a choice. The road waits.";
    this.hooks.whisper(line, 9000);

    this.finaleT = 0;
    if (this.kit) this.finaleFx = new FinaleFX(this.kit, new THREE.Vector3(0, 2, DAIS_LOCAL.z));

    if (key === "rest") {
      this.onRest?.();
    } else {
      this.released = true;
      this.orb?.setDimmed(true);
    }
  }

  /* ---------- contract ---------- */

  /**
   * Public tap entry point: the coordinator may call this from its own pointer
   * handler with NDC coords + its camera. The internal pointerdown listener
   * calls it too, using `this.camera` (assign it from the coordinator).
   */
  tapCheck(ndcX: number, ndcY: number, camera: THREE.Camera): void {
    if (!this.active || this.choiceDone) return;
    const group = this.orb?.group;
    if (!group) return;
    const x = finite(ndcX);
    const y = finite(ndcY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.raycaster.setFromCamera(this.ndc.set(x, y), camera);
    const hits = this.raycaster.intersectObject(group, true);
    if (hits.length > 0) this.onTapOrb?.();
  }

  /** The ride holds the wanderer; the camera's look stays entirely their own. */
  holdsMovement(): boolean {
    return this.active && !this.released;
  }

  nearSeat(_p: THREE.Vector3): boolean {
    return false;
  }

  onSit(): void {
    /* no-op: the tour never seats the wanderer */
  }

  onStand(): void {
    /* no-op */
  }

  dispose(): void {
    this.exit();
    this.overlay?.dispose();
    this.overlay = null;
    window.removeEventListener("pointerdown", this.onPointerDown);
  }
}
