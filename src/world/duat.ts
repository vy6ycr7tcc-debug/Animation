/* The Duat: the night the sun travels through under the world, entered by the hidden door in the
   pyramid's pit (pyramid.ts). The owner: "you can put the deities, they explain a story". Built as
   the rest of the game is built: a gorge of real stone (the scanned sandstone, weathered; world/
   stoneworks.ts) under the night of Nut, starry, with a dark river of slow gold running beside the
   way, stone lamps along it; six gates of stone, each with its emblem carved in thin gold light
   on its lintel (a winged sun) and posts, and beyond each gate the story of that hour told as a
   vision of light (scenes/visionStage.ts, the vision-of-creation format): the vision of Nun and
   the first mound; the land of Sokar and its serpent; Ra and Osiris meeting in the deepest hour;
   Apophis coiled about the sun, and cut; the heart weighed against the feather of Ma'at in the
   Hall of the Two Truths; the Field of Reeds, and Khepri rolling the sun up into the dawn. A stair
   of stone climbs from the last gate to the dawn, and out onto the apex (main.ts).
   Coordinates are Duat-local (floor y = 0); `heightAt` answers the ground (dunes away from the
   way, the stair). Only the names of places are spoken: no invented narration. */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ribbonGeometry, ribbonMaterial } from "../gpu/ribbons";
import { T } from "../gpu/tsl";
import { GOLD, PALE, PEARL, ROSE, EMBER, VisionStage, type Key, type Maker } from "../scenes/visionStage";
import { combine, cord, FORM_H, rock, shift, sphere, sun, turnY, type Rand } from "./forms";
import { landStone } from "./stoneworks";
import { surface } from "./textures";
import { ApophisScene, Barque, WeighingScene, type HourScene } from "./duatScenes";

const { exp, float, fract, mix, sin, smoothstep, uv, vec2, vec3, vec4 } = T;
const V = THREE.Vector3;

/** The way through the night (Duat-local): the hidden door, the six hours, the dawn. */
export const DUAT_PATH: THREE.Vector3[] = [
  new V(0, 0, 0),
  new V(18, 0, -14),
  new V(34, 0, -6),
  new V(30, 0, 16),
  new V(8, 0, 26),
  new V(-14, 0, 18),
  new V(-22, 2, -4),
  new V(-8, 5, -20),
];
const RIM = 50; // the gorge's walls stand beyond this

/* The Duat's narration (catalogue ids or recording paths). The owner's recording is one telling of
   the whole night (Aria, 279 s, `DUAT` in content/narration.json, trigger "duat-landfall"): it
   begins as you come into the Duat, once each time you enter, and carries on as you walk the
   hours. The hours' and the dawn's slots stay for any later recordings of their own; null is
   silence. */
export const DUAT_TRACKS: { entry: string | null; hours: (string | null)[]; dawn: string | null } = {
  entry: "DUAT",
  hours: [null, null, null, null, null, null],
  dawn: null,
};

/* ---------------------------------------------------------------- the ground */
/** Distance (x, z) from the way, and the way's height there. */
function nearWay(x: number, z: number): { d: number; y: number } {
  let best = Infinity, y = 0;
  for (let i = 0; i < DUAT_PATH.length - 1; i++) {
    const a = DUAT_PATH[i], b = DUAT_PATH[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / L2));
    const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
    if (d < best) (best = d), (y = a.y + (b.y - a.y) * t);
  }
  return { d: best, y };
}
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** The ground of the Duat (Duat-local): the way flat (and its stair rising to the dawn), dunes
    swelling away from it toward the gorge's walls. */
export function duatHeight(x: number, z: number): number {
  const w = nearWay(x, z);
  const dune = (noise(x * 0.09, z * 0.09) * 0.7 + noise(x * 0.23 + 4, z * 0.23) * 0.3) * 2.4;
  const away = THREE.MathUtils.smoothstep(w.d, 5, 16);
  const rim = THREE.MathUtils.smoothstep(Math.hypot(x, z), 34, RIM) * 5;
  const ground = away * dune + rim;
  // on the way itself its own height (the stair to the dawn), easing into the sand beside it
  const onWay = 1 - THREE.MathUtils.smoothstep(w.d, 2.2, 4);
  return THREE.MathUtils.lerp(ground, w.y, onWay);
}

/* ---------------------------------------------------------------- the forms of the hours */
/** A serpent: a long body winding on the ground, rising at the head. */
function serpent(n: number, R: Rand, len = 7, rear = 0, coil = 0): Float32Array {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const u = i / 60;
    if (coil > 0) {
      // coiled about the middle, the head raised above the coils
      const a = u * Math.PI * 2 * (2.2 + coil), r = 2.2 - u * 1.3;
      const y = 0.3 + u * 0.8 + Math.max(0, u - 0.85) * 18 * (0.4 + rear);
      pts.push(new V(Math.cos(a) * r, y, Math.sin(a) * r));
    } else {
      const x = -len / 2 + u * len;
      pts.push(new V(x, 0.25 + Math.max(0, u - 0.8) * 10 * rear, Math.sin(u * Math.PI * 3.2) * 0.9));
    }
  }
  return cord(pts, n, R, 0.18);
}
/** A barque: a crescent hull with a cabin, riding level. */
function barque(n: number, R: Rand, y = 1.2): Float32Array {
  const hull: THREE.Vector3[] = [];
  for (let i = 0; i <= 30; i++) {
    const u = i / 30, x = -2.4 + u * 4.8;
    hull.push(new V(x, y + Math.pow(Math.abs(x) / 2.4, 3) * 1.1, 0));
  }
  return combine(n, [
    [(m) => cord(hull, m, R, 0.16), 0.7],
    [(m) => shift(sphere(m, R, 0.45, 0, 0.9), 0, y + 0.8, 0), 0.3],
  ]);
}
/** A balance: post, beam and two pans. `tilt` −1..1. */
function scales(n: number, R: Rand, tilt = 0): Float32Array {
  const beamY = 3.1, a = tilt * 0.25;
  const L = new V(-1.3 * Math.cos(a), beamY - 1.3 * Math.sin(a), 0), Rt = new V(1.3 * Math.cos(a), beamY + 1.3 * Math.sin(a), 0);
  const pan = (c: THREE.Vector3) => (m: number) => {
    const out = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) {
      const k = R();
      if (k < 0.45) {
        const t = R();
        const s = R() < 0.5 ? -1 : 1;
        out.set([c.x + s * 0.3 * t, c.y - t * 1.1, 0], i * 3);
      } else {
        const ang = R() * Math.PI * 2, r = 0.45 * Math.sqrt(R());
        out.set([c.x + Math.cos(ang) * r, c.y - 1.1 - (1 - (r / 0.45) ** 2) * 0.15, Math.sin(ang) * r], i * 3);
      }
    }
    return out;
  };
  return combine(n, [
    [(m) => cord([new V(0, 0, 0), new V(0, beamY + 0.2, 0)], m, R, 0.06), 0.25],
    [(m) => cord([L, new V(0, beamY, 0), Rt], m, R, 0.05), 0.25],
    [pan(L), 0.25],
    [pan(Rt), 0.25],
  ]);
}
/** The feather of Ma'at: a tall curved quill and its vanes. */
function feather(n: number, R: Rand, h = 3.2, x = 0, y = 0.4): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = R(), bend = Math.sin(t * Math.PI * 0.8) * 0.35;
    const w = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.42 * (t > 0.08 ? 1 : 0);
    const side = R() < 0.5 ? -1 : 1, across = R() < 0.25 ? 0 : side * R() * w;
    out.set([x + bend + across * 0.2, y + t * h, across], i * 3);
  }
  return out;
}
/** The scarab: an oval body, its head, six legs, holding up a sun. */
function scarab(n: number, R: Rand, lift = 0): Float32Array {
  const body = (m: number) => {
    const out = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) {
      const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
      out.set([d.x * 0.9, 1.0 + d.y * 0.55, d.z * 1.2], i * 3);
    }
    return out;
  };
  const legs = (m: number) => {
    const parts: Float32Array[] = [];
    for (let k = 0; k < 6; k++) {
      const s = k < 3 ? -1 : 1, z = -0.6 + (k % 3) * 0.6;
      parts.push(cord([new V(s * 0.7, 0.9, z), new V(s * 1.4, 0.8, z * 1.3), new V(s * 1.6, 0.05, z * 1.6)], Math.floor(m / 6), R, 0.04));
    }
    const out = new Float32Array(m * 3);
    let o = 0;
    for (const p of parts) out.set(p, o), (o += p.length);
    return out;
  };
  return combine(n, [
    [body, 0.45],
    [(m) => shift(sphere(m, R, 0.35, 0, 0.9), 0, 1.0, 1.35), 0.1],
    [legs, 0.2],
    [(m) => shift(sphere(m, R, 0.8, 0, 0.85), 0, 2.6 + lift, 1.4), 0.25],
  ]);
}
/** Reeds: a field of tall stems with plumed heads. */
function reeds(n: number, R: Rand): Float32Array {
  const out = new Float32Array(n * 3);
  const stems = Array.from({ length: 40 }, () => [(R() - 0.5) * 6, (R() - 0.5) * 3, 1.8 + R() * 1.6, (R() - 0.5) * 0.5] as const);
  for (let i = 0; i < n; i++) {
    const [x, z, h, lean] = stems[Math.floor(R() * stems.length)];
    const t = R() < 0.25 ? 0.85 + R() * 0.15 : R() * 0.85, wide = t > 0.85 ? 0.12 : 0.015;
    out.set([x + lean * t * t + (R() - 0.5) * wide, t * h, z + (R() - 0.5) * wide], i * 3);
  }
  return out;
}
/** Still water, rippling in rings. */
function waters(n: number, R: Rand): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 3.2 * Math.sqrt(R()), a = R() * Math.PI * 2;
    out.set([Math.cos(a) * r, 0.15 + Math.sin(r * 4) * 0.06, Math.sin(a) * r], i * 3);
  }
  return out;
}
/** The first mound rising out of the waters. */
function mound(n: number, R: Rand): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = Math.sqrt(R()), a = R() * Math.PI * 2, r = (1 - t) * 2.4;
    out.set([Math.cos(a) * r, 0.1 + t * 3.0, Math.sin(a) * r], i * 3);
  }
  return out;
}

/** The six hours: where on the way, the place's name, and its story as forms and keys (one cycle,
    repeated while you are near). */
interface Hour {
  at: number;
  name: string;
  emblem: "water" | "serpent" | "ankh" | "coils" | "feather" | "scarab";
  forms: Record<string, Maker>;
  cycle: Omit<Key, "t">[];
}
const HOURS: Hour[] = [
  {
    at: 1,
    // the first mound rising from the primordial waters, seen as a vision: the Duat itself is dry
    // ground (the owner); this name is the batch's proposal, awaiting the owner's word
    name: "The First Mound (Vision of Nun)",
    emblem: "water",
    forms: {
      waters: (n, R) => waters(n, R),
      mound: (n, R) => combine(n, [[(m) => waters(m, R), 0.4], [(m) => mound(m, R), 0.6]]),
      barque: (n, R) => combine(n, [[(m) => waters(m, R), 0.3], [(m) => barque(m, R, 1.4), 0.7]]),
      nun: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Spell_Simple_Idle_Loop", 1.5, [], FORM_H * 0.7), 0.6], [(m) => barque(m, R, FORM_H * 0.78), 0.4]]),
    },
    cycle: [
      { form: "waters", tint: PALE },
      { form: "mound", tint: PEARL },
      { form: "barque", tint: GOLD },
      { form: "nun", tint: PALE },
    ],
  },
  {
    at: 2,
    name: "The land of Sokar",
    emblem: "serpent",
    forms: {
      sand: (n, R) => combine(n, [[(m) => rock(m, R, 3, 0.4, 2), 1]]),
      serpent: (n, R) => serpent(n, R, 7, 0.3),
      bearing: (n, R) => combine(n, [[(m) => serpent(m, R, 7, 0), 0.6], [(m) => barque(m, R, 1.1), 0.4]]),
    },
    cycle: [
      { form: "sand", tint: EMBER },
      { form: "serpent", tint: EMBER },
      { form: "bearing", tint: GOLD },
    ],
  },
  {
    at: 3,
    name: "Ra and Osiris, in the deepest hour",
    emblem: "ankh",
    forms: {
      osiris: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Idle_Loop", 0.4, [], FORM_H * 0.8), 0.85], [(m) => shift(sphere(m, R, 0.22, 0, 0.3), 0, FORM_H * 0.86, 0), 0.15]]),
      ra: (n, R, b) => b && combine(n, [[(m) => b.figure(m, R, "Idle_Loop", 1.8, [], FORM_H * 0.8), 0.7], [(m) => sun(m, R, FORM_H * 0.98), 0.3]]),
      meeting: (n, R, b) => b && combine(n, [
        [(m) => shift(turnY(b.figure(m, R, "Idle_Loop", 0.4, [], FORM_H * 0.72), Math.PI / 2), -1.3, 0, 0), 0.38],
        [(m) => shift(turnY(b.figure(m, R, "Idle_Loop", 1.8, [], FORM_H * 0.72), -Math.PI / 2), 1.3, 0, 0), 0.38],
        [(m) => sun(m, R, FORM_H * 0.62), 0.24],
      ]),
      one: (n, R) => sun(n, R, FORM_H * 0.55),
    },
    cycle: [
      { form: "osiris", tint: PALE },
      { form: "ra", tint: GOLD },
      { form: "meeting", tint: PEARL },
      { form: "one", tint: GOLD, spin: 0.05, axis: "z" },
    ],
  },
  {
    at: 4,
    name: "Apophis",
    emblem: "coils",
    forms: {
      coil: (n, R) => serpent(n, R, 7, 0, 1.2),
      rears: (n, R) => combine(n, [[(m) => serpent(m, R, 7, 1, 1.2), 0.75], [(m) => sun(m, R, 3.4), 0.25]]),
      cut: (n, R) => combine(n, [
        [(m) => shift(serpent(m, R, 3, 0), -2.2, 0, 0.8), 0.3],
        [(m) => shift(serpent(m, R, 3, 0), 2.0, 0, -0.6), 0.3],
        [(m) => sun(m, R, 3.2), 0.4],
      ]),
    },
    cycle: [
      { form: "coil", tint: ROSE },
      { form: "rears", tint: EMBER },
      { form: "cut", tint: GOLD },
    ],
  },
  {
    at: 5,
    name: "The Hall of the Two Truths",
    emblem: "feather",
    forms: {
      scales: (n, R) => scales(n, R, 0.6),
      weighed: (n, R) => combine(n, [
        [(m) => scales(m, R, 0), 0.7],
        [(m) => shift(sphere(m, R, 0.28, 0, 0.9), -1.3, 2.3, 0), 0.12],
        [(m) => feather(m, R, 1.2, 1.3, 2.05), 0.18],
      ]),
      feather: (n, R) => feather(n, R),
      heart: (n, R) => combine(n, [[(m) => shift(sphere(m, R, 0.6, 0, 0.8), 0, 2.2, 0), 1]]),
    },
    cycle: [
      { form: "scales", tint: PEARL },
      { form: "weighed", tint: GOLD },
      { form: "feather", tint: PALE },
      { form: "heart", tint: ROSE },
    ],
  },
  {
    at: 6,
    name: "The Field of Reeds",
    emblem: "scarab",
    forms: {
      reeds: (n, R) => reeds(n, R),
      scarab: (n, R) => scarab(n, R, 0),
      rising: (n, R) => scarab(n, R, 1.4),
      dawn: (n, R) => sun(n, R, FORM_H * 0.7),
    },
    cycle: [
      { form: "reeds", tint: PALE },
      { form: "scarab", tint: GOLD },
      { form: "rising", tint: GOLD },
      { form: "dawn", tint: EMBER },
    ],
  },
];
// seconds from one moment of an hour to the next (9 left a still form on screen ~13 s: "dead
// stretches"; 6 with a 3.5 s turn read as "all over the place"): a long, calm gathering (MORPH)
// and a short hold, so something is always slowly becoming
const HOLD = 8.5;
const MORPH = 6;

/** Keys for many turns of an hour's cycle (its clock runs only while you are near). */
function keysFor(h: Hour): Key[] {
  const keys: Key[] = [];
  for (let k = 0; k < 40; k++) h.cycle.forEach((c, i) => keys.push({ ...c, t: 0.5 + (k * h.cycle.length + i) * HOLD, dur: MORPH }));
  return keys;
}

/* ---------------------------------------------------------------- the emblems, in gold light */
function emblemSegments(kind: Hour["emblem"] | "wingedSun", s: number): number[] {
  const seg: number[] = [];
  const line = (pts: [number, number][]) => {
    for (let k = 0; k < pts.length - 1; k++) seg.push(pts[k][0] * s, pts[k][1] * s, 0, pts[k + 1][0] * s, pts[k + 1][1] * s, 0);
  };
  const circle = (cx: number, cy: number, r: number, a0 = 0, a1 = Math.PI * 2, nn = 28) =>
    line(Array.from({ length: nn + 1 }, (_, k) => [cx + Math.cos(a0 + ((a1 - a0) * k) / nn) * r, cy + Math.sin(a0 + ((a1 - a0) * k) / nn) * r] as [number, number]));
  switch (kind) {
    case "wingedSun":
      circle(0, 0, 0.3);
      for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) line([[sx * 0.34, 0.05 - k * 0.07], [sx * (1.6 - k * 0.22), 0.14 - k * 0.1], [sx * (1.75 - k * 0.25), 0.02 - k * 0.1]]);
      break;
    case "water":
      for (let r = 0; r < 3; r++) line(Array.from({ length: 9 }, (_, k) => [-0.5 + k * 0.125, r * 0.22 + (k % 2 ? 0.08 : 0)] as [number, number]));
      break;
    case "serpent":
      line(Array.from({ length: 24 }, (_, k) => [Math.sin(k * 0.55) * 0.18, k * 0.05] as [number, number]));
      circle(0.05, 1.2, 0.07);
      break;
    case "ankh":
      circle(0, 0.95, 0.18, -Math.PI / 2 - 2.6, -Math.PI / 2 + 2.6 + Math.PI * 2 - 5.2 + 0.0001);
      line([[0, 0.78], [0, 0]]);
      line([[-0.3, 0.72], [0.3, 0.72]]);
      break;
    case "coils":
      line(Array.from({ length: 60 }, (_, k) => [Math.cos(k * 0.3) * (0.4 - k * 0.006), 0.5 + Math.sin(k * 0.3) * (0.4 - k * 0.006)] as [number, number]));
      break;
    case "feather":
      line([[0, 0], [0.06, 0.6], [0.02, 1.2], [-0.1, 1.35]]);
      for (let k = 1; k < 10; k++) line([[0.04, k * 0.12], [0.2, k * 0.12 + 0.05]]);
      break;
    case "scarab":
      circle(0, 0.5, 0.26, 0, Math.PI * 2, 24);
      circle(0, 0.86, 0.1);
      circle(0, 1.25, 0.2);
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) line([[sx * 0.24, 0.35 + k * 0.15], [sx * 0.45, 0.3 + k * 0.18]]);
      break;
  }
  return seg;
}

/* ---------------------------------------------------------------- the Duat */
export class Duat {
  /** For still frames (?shot=duat-<k>&t=): every hour's clock reads this. */
  static clockOverride: number | null = null;
  /** Plays a recording (main.ts sets it to the narration's play); see DUAT_TRACKS. */
  static voice: ((track: string) => void) | null = null;
  group = new THREE.Group();
  private stages: { stage: VisionStage | HourScene; at: THREE.Vector3; stand: THREE.Vector3; face: number; cycle: number; clock: number; named: boolean; name: string }[] = [];
  private river: THREE.CatmullRomCurve3 | null = null;
  private barque: Barque | null = null;
  private flames: { sprite: THREE.Sprite; base: number; phase: number }[] = [];
  private uT = T.uniform(0);
  /** What stands solid (Duat-local): the gates' posts, the stone lamps. The pyramid makes them
      colliders while the Duat stands. */
  readonly solids: { x: number; z: number; y: number; r: number; h: number; hx?: number; hz?: number; ang?: number }[] = [];

  constructor(private say: (text: string, ms: number) => void) {
    this.buildSky();
    this.buildGround();
    this.buildGorge();
    this.buildRiver();
    this.buildStair();
    this.buildLamps();
    this.buildHours();
    // the sun's barque, sailing the river through the hours
    if (this.river) {
      this.barque = new Barque(this.river, this.stages.map((s) => s.at), (x, z) => duatHeight(x, z));
      this.group.add(this.barque.group);
    }
    // the light of the night: faint and blue from above, warm from the lamps; a dawn in the east
    this.group.add(new THREE.HemisphereLight(0x5a6aa8, 0x2a1c10, 0.7));
    const moon = new THREE.DirectionalLight(0x9fb0e0, 0.6);
    moon.position.set(-20, 40, 10);
    this.group.add(moon, moon.target);
    const dawn = new THREE.PointLight(0xffb070, 30, 40, 1.6);
    dawn.position.copy(DUAT_PATH[7]).add(new V(0, 4, -6));
    this.group.add(dawn);
  }

  /** The night of Nut: deep blue to black, dense stars, and her body a band of light across it. */
  private buildSky(): void {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
    const d = T.normalize(T.positionLocal);
    const el = T.clamp(d.y, -0.2, 1);
    const base = mix(vec3(0.02, 0.025, 0.06), vec3(0.002, 0.003, 0.012), smoothstep(0, 0.7, el));
    const g = d.mul(520), cell = T.floor(g);
    const h = fract(sin(T.dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
    const round = smoothstep(0.32, 0.0, T.length(fract(g).sub(0.5)));
    const star = T.step(0.985, h).mul(fract(h.mul(97)).mul(0.8).add(0.2)).mul(round);
    // Nut's body: an arch of light and stars from east to west
    const band = exp(d.z.mul(d.z).mul(-18)).mul(smoothstep(0.05, 0.4, el));
    const bandStars = T.step(0.955, h).mul(band).mul(round);
    const dawnGlow = exp(T.length(d.xz.sub(vec2(-0.3, -0.9))).mul(-3)).mul(smoothstep(0.35, -0.05, el)).mul(0.25);
    m.colorNode = vec4(base.add(vec3(0.5, 0.45, 0.6).mul(band.mul(0.06))).add(vec3(1, 0.95, 0.85).mul(star.add(bandStars).mul(0.9))).add(vec3(1, 0.6, 0.35).mul(dawnGlow)), 1);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(170, 48, 24), m);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);
  }

  /** Sand in the night: the scan's grain and relief, the dunes from `duatHeight`. */
  private buildGround(): void {
    const g = new THREE.PlaneGeometry(RIM * 2 + 12, RIM * 2 + 12, 120, 120).rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, duatHeight(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    // The sand: the scan read in the Duat's own frame (its world position is ~50 km out, where
    // lookups lose their fine digits), at two scales so no tile repeats, a fine third layer near,
    // its occlusion, and its relief at the same scales. (Its normal map used to be read through the
    // plane's own UVs, one tile stretched over the whole 112 m: the dunes read as mud.)
    const S = surface("sand");
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const P = T.positionGeometry.xz;
    const u1 = P.div(2.6), u2 = P.div(6.8).add(vec2(0.37, 0.71)), u3 = P.div(0.9).add(vec2(0.13, 0.52));
    const camD = T.length(T.cameraPosition.sub(T.positionWorld));
    const near = float(1).sub(smoothstep(6, 22, camD));
    const d = T.texture(S.diff, u1).rgb.mul(0.55).add(T.texture(S.diff, u2).rgb.mul(0.45));
    const ao = mix(T.texture(S.arm, u1).r.mul(0.6).add(T.texture(S.arm, u2).r.mul(0.4)), T.texture(S.arm, u3).r, near.mul(0.35));
    // broad drifts of lighter and darker sand over the dunes, so far ground is never one flat tone
    const drift = T.sin(P.x.mul(0.11).add(T.sin(P.y.mul(0.07)).mul(2.1))).mul(0.5).add(0.5);
    m.colorNode = d.mul(vec3(0.62, 0.58, 0.6)).mul(mix(float(0.45), float(1.02), ao)).mul(mix(float(0.86), float(1.1), drift));
    const n1 = T.texture(S.nor, u1).xy.mul(2).sub(1), n2 = T.texture(S.nor, u2).xy.mul(2).sub(1), n3 = T.texture(S.nor, u3).xy.mul(2).sub(1);
    const n = n1.mul(0.55).add(n2.mul(0.45)).mul(1.5).add(n3.mul(near.mul(0.8)));
    m.normalNode = T.normalize(T.normalView.add(T.cameraViewMatrix.mul(vec4(n.x, 0, n.y.negate(), 0)).xyz));
    const ground = new THREE.Mesh(g, m);
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  /** The gorge: a ring of broken cliffs round it all, in the scanned stone. */
  private buildGorge(): void {
    const g = new THREE.CylinderGeometry(RIM + 4, RIM + 9, 30, 200, 44, true); // (14 rows made 2 m facets: flat, blurry walls)
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const r = Math.hypot(x, z) + (noise(a * 9, y * 0.18) - 0.5) * 7 + (noise(a * 31, y * 0.6) - 0.5) * 1.6;
      p.setXYZ(i, Math.cos(a) * r, y + 12, Math.sin(a) * r);
    }
    g.computeVertexNormals();
    const cliff = new THREE.Mesh(g, landStone("sandstone_cracks", 2, 3.2, [0.75, 0.72, 0.78]));
    cliff.material.side = THREE.BackSide;
    this.group.add(cliff);
  }

  /** A dark river beside the way (on its inner side), slow gold moving on it. */
  private buildRiver(): void {
    const c = new V();
    for (const q of DUAT_PATH.slice(0, 7)) c.add(q);
    c.multiplyScalar(1 / 7);
    const left: number[] = [], idx: number[] = [], along: number[] = [];
    this.river = new THREE.CatmullRomCurve3(DUAT_PATH.slice(0, 7).map((q) => q.clone().lerp(c, 0.28).setY(0)), false, "centripetal");
    const pts = this.river.getSpacedPoints(160);
    pts.forEach((q, i) => {
      const nxt = pts[Math.min(pts.length - 1, i + 1)], prv = pts[Math.max(0, i - 1)];
      const dir = new V().subVectors(nxt, prv).normalize(), side = new V(-dir.z, 0, dir.x);
      for (const s of [-1.6, 1.6]) {
        const x = q.x + side.x * s, z = q.z + side.z * s;
        left.push(x, duatHeight(x, z) + 0.06, z);
        along.push(i / 160, s > 0 ? 1 : 0);
      }
      if (i < pts.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(left, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(along, 2));
    g.setIndex(idx);
    const m = new THREE.MeshBasicNodeMaterial({ fog: false, transparent: true, depthWrite: false });
    const u = uv();
    const edge = smoothstep(0, 0.25, u.y).mul(smoothstep(1, 0.75, u.y));
    const flow = sin(u.x.mul(420).sub(this.uT.mul(1.4)).add(sin(u.y.mul(9)).mul(2))).mul(0.5).add(0.5);
    const glint = T.pow(flow, 18).mul(0.5);
    m.colorNode = vec4(vec3(0.01, 0.015, 0.035).add(vec3(1.0, 0.75, 0.4).mul(glint.mul(edge))), edge.mul(0.92));
    this.group.add(new THREE.Mesh(g, m));
  }

  /** The stair from the last gate up to the dawn: blocks of stone, one course a step. */
  private buildStair(): void {
    const parts: THREE.BufferGeometry[] = [];
    for (let seg = 5; seg < 7; seg++) {
      const a = DUAT_PATH[seg], b = DUAT_PATH[seg + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.round(Math.abs(b.y - a.y) / 0.25));
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps, y = a.y + (b.y - a.y) * t1;
        if (y <= 0.05) continue;
        const cx = a.x + (b.x - a.x) * (t0 + t1) / 2, cz = a.z + (b.z - a.z) * (t0 + t1) / 2;
        const box = new THREE.BoxGeometry(4.4, y + 0.3, (L / steps) * 1.02).toNonIndexed();
        box.translate(0, (y - 0.3) / 2, 0);
        box.rotateY(ang);
        box.translate(cx, 0, cz);
        box.deleteAttribute("uv");
        parts.push(box);
      }
    }
    if (!parts.length) return;
    const stair = new THREE.Mesh(mergeGeometries(parts)!, landStone("sandstone_blocks_08", 0, 2.2));
    stair.castShadow = stair.receiveShadow = true;
    this.group.add(stair);
  }

  /** Stone lamps along the way, every few metres, a small flame in each. */
  private buildLamps(): void {
    const curve = new THREE.CatmullRomCurve3(DUAT_PATH, false, "centripetal");
    const len = curve.getLength(), count = Math.floor(len / 7);
    const tex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, "rgba(255,240,210,1)");
      grd.addColorStop(0.25, "rgba(255,190,110,0.5)");
      grd.addColorStop(1, "rgba(255,150,80,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const bowlGeo = new THREE.CylinderGeometry(0.28, 0.2, 0.5, 12);
    const bowls = new THREE.InstancedMesh(bowlGeo, landStone("sandstone_cracks", 0, 1.2), count * 2);
    let n = 0;
    const p = new V(), tg = new V();
    for (let i = 1; i <= count; i++) {
      curve.getPointAt(i / (count + 1), p);
      curve.getTangentAt(i / (count + 1), tg);
      for (const s of [-1, 1]) {
        const x = p.x - tg.z * 2.6 * s, z = p.z + tg.x * 2.6 * s, y = duatHeight(x, z);
        bowls.setMatrixAt(n++, new THREE.Matrix4().makeTranslation(x, y + 0.25, z));
        this.solids.push({ x, z, y, r: 0.32, h: 0.6 });
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
        sp.position.set(x, y + 0.72, z);
        sp.scale.setScalar(0.55);
        this.group.add(sp);
        this.flames.push({ sprite: sp, base: 0.55, phase: i * 1.7 + s });
      }
    }
    bowls.count = n;
    bowls.castShadow = true;
    this.group.add(bowls);
  }

  /** The six gates and the story beyond each. */
  private buildHours(): void {
    const stone = landStone("sandstone_blocks_08", 0, 2.4);
    const gold = ribbonMaterial(vec3(1.0, 0.8, 0.46).mul(0.9), 0.6);
    for (const h of HOURS) {
      const at = DUAT_PATH[h.at], prev = DUAT_PATH[h.at - 1];
      const dir = new V().subVectors(at, prev).setY(0).normalize();
      const face = Math.atan2(dir.x, dir.z);
      // the gate: two battered posts and a lintel, across the way 7 m before the place
      const gp = at.clone().addScaledVector(dir, -7);
      const gate = new THREE.Group();
      gate.position.set(gp.x, duatHeight(gp.x, gp.z), gp.z);
      gate.rotation.y = face;
      const parts: THREE.BufferGeometry[] = [];
      for (const sx of [-1, 1]) {
        // its two posts stand solid (local x of the gate, turned by `face`)
        const px = gp.x + Math.cos(face) * sx * 2.3, pz = gp.z - Math.sin(face) * sx * 2.3;
        this.solids.push({ x: px, z: pz, y: duatHeight(px, pz), r: 0.0, hx: 0.85, hz: 0.7, ang: face, h: 5.2 });
      }
      for (const sx of [-1, 1]) {
        const post = new THREE.CylinderGeometry(0.7, 0.95, 5.2, 4, 1).toNonIndexed();
        post.rotateY(Math.PI / 4);
        post.scale(1, 1, 0.8);
        post.translate(sx * 2.3, 2.6, 0);
        parts.push(post);
      }
      const lintel = new THREE.BoxGeometry(6.8, 1.0, 1.6).toNonIndexed();
      lintel.translate(0, 5.6, 0);
      parts.push(lintel);
      // faceted, as cut stone is: each face its own normal
      const cut = parts.map((q) => {
        const f = q.index ? q.toNonIndexed() : q;
        f.deleteAttribute("uv");
        f.computeVertexNormals();
        return f;
      });
      const mesh = new THREE.Mesh(mergeGeometries(cut)!, stone);
      mesh.castShadow = mesh.receiveShadow = true;
      gate.add(mesh);
      // carved in light: the winged sun on the lintel (both faces), the hour's emblem on the posts
      for (const zf of [-0.82, 0.82]) {
        const ws = new THREE.Mesh(ribbonGeometry(emblemSegments("wingedSun", 1)), gold);
        ws.position.set(0, 5.6, zf);
        ws.rotation.y = zf < 0 ? Math.PI : 0;
        ws.frustumCulled = false;
        gate.add(ws);
        for (const sx of [-1, 1]) {
          const em = new THREE.Mesh(ribbonGeometry(emblemSegments(h.emblem, 1)), gold);
          em.position.set(sx * 2.3, 2.0, zf * 0.75);
          em.rotation.y = zf < 0 ? Math.PI : 0;
          em.frustumCulled = false;
          gate.add(em);
        }
      }
      this.group.add(gate);
      // the story, standing on the way beyond the gate, facing whoever comes through
      const sp = at.clone();
      // the last hour stands where the stair climbs: its reeds were laid over the stair's blocks and
      // grew up through the steps. It is told beside the stair instead, on the sand, outward from
      // the gorge's heart (the river runs on the inner side)
      if (h.at === 6) {
        const side = new V(dir.z, 0, -dir.x);
        if (side.x * sp.x + side.z * sp.z < 0) side.negate();
        sp.addScaledVector(side, 6.5);
      }
      sp.y = duatHeight(sp.x, sp.z);
      // Apophis and the weighing are told as animated scenes (duatScenes.ts); the others in light
      const stage: VisionStage | HourScene =
        h.at === 4 ? new ApophisScene(sp, face + Math.PI) : h.at === 5 ? new WeighingScene(sp, face + Math.PI) : new VisionStage({ at: sp, face: face + Math.PI, forms: h.forms, keys: keysFor(h), seedNum: 700 + h.at * 13, calm: true });
      this.group.add(stage.group);
      const cycle = "cycle" in stage ? stage.cycle : h.cycle.length * HOLD;
      // where to stand to watch it: on the way, past the gate, 6 m before it
      const stand = sp.clone().addScaledVector(dir, -6);
      stand.y = duatHeight(stand.x, stand.z);
      this.stages.push({ stage, at: sp, stand, face, cycle, clock: 0, named: false, name: h.name });
      // a warm light on the gate's stone
      const lamp = new THREE.PointLight(0xffb070, 8, 14, 1.8);
      lamp.position.set(gp.x, gate.position.y + 3, gp.z).addScaledVector(dir, -2);
      this.group.add(lamp);
    }
  }

  /** The hours, for the tour (Duat-local): where to stand and which way to face, the story's
      place, one telling's length, the place's name. */
  hours(): { stand: THREE.Vector3; heading: number; at: THREE.Vector3; cycle: number; name: string }[] {
    // turned to the story itself (one hour's story stands beside the way)
    return this.stages.map((s) => ({ stand: s.stand, heading: Math.atan2(-(s.at.x - s.stand.x), -(s.at.z - s.stand.z)), at: s.at, cycle: s.cycle, name: s.name }));
  }

  /** Hour `k`'s story from its beginning (the tour arrives, and it begins for you). */
  restart(k: number): void {
    const s = this.stages[k];
    if (s) s.clock = 0;
  }

  /** Each frame, with the wanderer's position (Duat-local). */
  update(t: number, dt: number, local: THREE.Vector3, reduced: boolean): void {
    this.uT.value = reduced ? t * 0.4 : t;
    for (const f of this.flames) {
      const k = reduced ? 1 : 0.85 + 0.1 * Math.sin(t * 9 + f.phase) + 0.05 * Math.sin(t * 23 + f.phase * 2);
      f.sprite.scale.setScalar(f.base * k);
    }
    if (Duat.clockOverride !== null) this.barque?.seek(0.08 + Duat.clockOverride / 400);
    this.barque?.update(Duat.clockOverride !== null ? 0 : Math.min(0.1, dt), t);
    for (const s of this.stages) {
      const d = Math.hypot(local.x - s.at.x, local.z - s.at.z);
      const near = d < 30;
      const telling = d < 16;
      // its clock runs while you are with it, and rests (from the start again) once you have gone
      if (telling) s.clock += dt;
      else if (d > 30) s.clock = 0;
      if (Duat.clockOverride !== null) s.clock = Duat.clockOverride;
      s.stage.update(Math.min(0.05, dt), s.clock, telling, near, reduced);
      if (!s.named && d < 12) {
        s.named = true;
        this.say(s.name, 5000);
        const tr = DUAT_TRACKS.hours[this.stages.indexOf(s)];
        if (tr) Duat.voice?.(tr);
      }
    }
  }
}
