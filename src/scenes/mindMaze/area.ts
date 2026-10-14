/* The mind's maze (the owner's package, "The Mind's Maze", and the owner's notes after walking
   it: "it's meant to be mysterious until you get to the center"). A true labyrinth under the
   night, walled in honed granite above the eye, so nothing ahead can be seen until it is reached.
   - The plan: seven rings of corridor about a sanctuary, cut into cells and joined as one
     winding maze (a seeded backtracker, the same every visit, with a few loops so it is
     wandered rather than solved). Its way in faces the arch you arrive by; its sanctuary's door
     faces away from it, so the way to the centre goes all round.
   - No jumping and no flight here (main.ts holds the wanderer on foot).
   - Along the way stand the twenty-two archetypes from the temple, in their 3D characters (the
     world's beings, their card's objects with them), each in a corridor's end: the Mind's seven
     in the outer rings, the Body's in the middle, the Spirit's nearer the centre, and the Choice
     beside the sanctuary's door; met in their order as you go in, a path through. Meeting one
     opens its rite from the temple (its invitation, what it is, a question to carry), spoken in
     the rite's own recordings, and it makes its gesture.
   - Ten steles carry the package's lore, carved in gold, in the dead ends between.
   - Anything with something to read wears a thin thread of electric light flowing over it;
     once read, it settles to a faint gold.
   - At the still centre, the paths light: from the seat back through the corridors to every
     stele and archetype you have met, spreading outward. Sit, and the view rises to an eagle's
     height above the maze, and motes of light flow along those paths all the way to the seat.
   - The way out: the arch behind you at the start.
   The walls are the game's cut masonry (`landStone`), so they are solid by their own shape
   (world/solidity.ts). Frame: the room's own, its centre at the origin; you start at the south
   (+z) facing the centre (−z). Angles: θ = atan2(x, z), 0 toward the start. */
import * as THREE from "three/webgpu";
import { T, gpuUniforms, type N } from "../../gpu/tsl";
import { keyShadow } from "../../gpu/lightRig";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { landStone, stoneBlock } from "../../world/stoneworks";
import { passable } from "../../world/solidity";
import { Beings, type BeingModel } from "../../world/beings";
import type { Sparks } from "../../world/life";
import type { Station } from "../../world/stations";
import { RITES, riteAudio } from "../../world/rites";
import { damp, keepAlpha, merge, pointCloud, roomClock, roomPos, scannedGround, seeded, skyDome, spireGeometry, touch, type Air } from "../densities/roomKit";
import { ash, stormCeiling, volcano } from "../densities/volcanic";
import { etchedStone } from "../../world/etching";
import { vnoise, hash2, hash3 } from "../../gpu/tsl";
import type { Narration } from "../../core/narration";
import { JOURNEY_ORIGIN, type Room, type Solid } from "../journey";
import type { Reading } from "../../world/readables";

const { attribute, cameraProjectionMatrix, cos, float, fract, mix, modelViewMatrix, normalize, positionGeometry, pow, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;
const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

/* ---------------------------------------------------------------- the plan */
/** The sanctuary's wall; each ring of corridor is `CW` wide; seven rings. */
const RIN = 14;
const CW = 6.5;
const NC = 7;
/** Cells round each ring (about 10 m of corridor each). */
const COUNTS = [12, 16, 20, 24, 28, 32, 36];
/** Ring boundary k (k = 0 the sanctuary's wall … NC the outer wall). */
const RAD = (k: number) => RIN + CW * k;
/** The middle of ring k's corridor. */
const MID = (k: number) => RIN + CW * (k + 0.5);
const OUTER = RAD(NC);
/** The first density's volcano (the owner: "colours and sceneries more like the first density
    room"), far beyond the walls toward the sanctuary's side, high enough to stand over them. */
const VOLC = new THREE.Vector3(70, -2, -215);
const VOLC_H = 84;
/** The walls stand this far above the floor: over the eye, over the following camera. */
const WALL_H = 4.6;
/** A doorway's half width (m). */
const DOOR = 1.35;

/** Where you come in, and the arch that leads out (room frame). */
export const MAZE_START = { x: 0, z: OUTER + 4.6, heading: 0 };
export const MAZE_EXIT = { x: 0, z: OUTER + 9.6 };
/** The outer edge of where you may walk (the forecourt round the outer wall). */
const EDGE = OUTER + 10.5;
/** The ground sits this far over the water line at the edge (the place apart's y is 0)… */
const BASE = 1.2;
/** …and rises this much, gently, toward the sanctuary. */
const RISE = 2.4;

/** The ground: level outside, rising gently through the rings to the sanctuary's level floor. */
export function mazeFloor(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const k = Math.min(1, Math.max(0, (OUTER + 1 - r) / (OUTER + 1 - RIN)));
  return BASE + RISE * k * k * (3 - 2 * k);
}
/** Keep within the forecourt's edge (the walls themselves hold you by their own shape). */
export function mazeConfine(p: { x: number; z: number }): void {
  const r = Math.hypot(p.x, p.z);
  if (r > EDGE) (p.x *= EDGE / r), (p.z *= EDGE / r);
}
const polar = (a: number, r: number): [number, number] => [Math.sin(a) * r, Math.cos(a) * r];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface Cell {
  k: number;
  i: number;
  a0: number;
  a1: number;
  /** Open passages: the cell beyond and the point of the opening (angle, and the boundary radius for a ring door). */
  open: { to: number; a: number; r?: number }[];
}
interface Edge {
  u: number;
  v: number;
  /** A side wall at angle `a` across ring `k`, or a door in boundary `r` at angle `a`. */
  kind: "side" | "door";
  a: number;
  k: number;
  r: number;
  open: boolean;
}
export interface MazePlan {
  cells: Cell[];
  edges: Edge[];
  /** The cell by the way in (outer ring, at θ 0) and the cell by the sanctuary's door (inner ring, at θ π). */
  entry: number;
  heart: number;
  index(k: number, i: number): number;
}

/** The maze, the same every time (exported for the tests and stills). */
export function mazePlan(): MazePlan {
  const R = seeded(90210);
  const first: number[] = [];
  const cells: Cell[] = [];
  COUNTS.forEach((n, k) => {
    first.push(cells.length);
    for (let i = 0; i < n; i++) cells.push({ k, i, a0: ((i - 0.5) / n) * TAU, a1: ((i + 0.5) / n) * TAU, open: [] });
  });
  const index = (k: number, i: number) => first[k] + (((i % COUNTS[k]) + COUNTS[k]) % COUNTS[k]);
  const edges: Edge[] = [];
  for (let k = 0; k < NC; k++) {
    const n = COUNTS[k];
    for (let i = 0; i < n; i++) edges.push({ u: index(k, i), v: index(k, i + 1), kind: "side", a: ((i + 0.5) / n) * TAU, k, r: 0, open: false });
  }
  // the doors between rings: wherever a cell and the one outside it share enough of their arc
  for (let k = 0; k < NC - 1; k++) {
    const rb = RAD(k + 1);
    for (let i = 0; i < COUNTS[k]; i++) {
      const c = cells[index(k, i)];
      for (let j = 0; j < COUNTS[k + 1]; j++) {
        const d = cells[index(k + 1, j)];
        let best: [number, number] | null = null;
        for (const s of [-TAU, 0, TAU]) {
          const lo = Math.max(c.a0, d.a0 + s), hi = Math.min(c.a1, d.a1 + s);
          if (hi - lo > (best ? best[1] - best[0] : 0)) best = [lo, hi];
        }
        if (best && (best[1] - best[0]) * rb >= DOOR * 2 + 0.7) edges.push({ u: index(k, i), v: index(k + 1, j), kind: "door", a: (best[0] + best[1]) / 2, k: k + 1, r: rb, open: false });
      }
    }
  }
  // a backtracker from the sanctuary's door cell: long winding ways
  const adj: number[][] = cells.map(() => []);
  edges.forEach((e, n) => (adj[e.u].push(n), adj[e.v].push(n)));
  const heart = index(0, COUNTS[0] / 2), entry = index(NC - 1, 0);
  const seen = new Set([heart]);
  const stack = [heart];
  while (stack.length) {
    const u = stack[stack.length - 1];
    const next = adj[u].filter((n) => !seen.has(edges[n].u === u ? edges[n].v : edges[n].u));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const n = next[Math.floor(R() * next.length)];
    const e = edges[n], v = e.u === u ? e.v : e.u;
    e.open = true;
    seen.add(v);
    stack.push(v);
  }
  // a few loops, so it is wandered rather than solved (never in the innermost ring: the last
  // way to the centre stays one)
  const shut = edges.filter((e) => !e.open && cells[e.u].k > 0 && cells[e.v].k > 0);
  for (let m = 0; m < 9 && shut.length; m++) shut.splice(Math.floor(R() * shut.length), 1)[0].open = true;
  for (const e of edges) {
    if (!e.open) continue;
    cells[e.u].open.push({ to: e.v, a: e.a, r: e.kind === "door" ? e.r : undefined });
    cells[e.v].open.push({ to: e.u, a: e.a, r: e.kind === "door" ? e.r : undefined });
  }
  return { cells, edges, entry, heart, index };
}

/** Breadth first from a cell: each cell's step toward it (`prev`) and how many steps away. */
function bfs(plan: MazePlan, from: number): { prev: Int32Array; dist: Int32Array } {
  const prev = new Int32Array(plan.cells.length).fill(-1), dist = new Int32Array(plan.cells.length).fill(-1);
  dist[from] = 0;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    for (const o of plan.cells[u].open) {
      if (dist[o.to] >= 0) continue;
      dist[o.to] = dist[u] + 1;
      prev[o.to] = u;
      q.push(o.to);
    }
  }
  return { prev, dist };
}

/** Every wall block (centre, turn, width along it, height, depth), the same every time: the
    rings less their open doors (the outer one less the way in, the sanctuary's less its one
    door), here and there a colonnade of pillars a hand's width apart (starlight through the
    slits, no way through), and the side walls across each ring where the way does not go on. */
export function wallLayout(plan: MazePlan): { x: number; z: number; a: number; w: number; h: number; d: number }[] {
  const R = seeded(4099);
  const out: { x: number; z: number; a: number; w: number; h: number; d: number }[] = [];
  const doorsAt: number[][] = Array.from({ length: NC + 1 }, () => []);
  for (const e of plan.edges) if (e.open && e.kind === "door") doorsAt[e.k].push(e.a);
  doorsAt[0].push(Math.PI);
  doorsAt[NC].push(0);
  for (let k = 0; k <= NC; k++) {
    const r = RAD(k), hw = DOOR / r;
    const gaps = doorsAt[k].map((a) => (a + TAU) % TAU).sort((a, b) => a - b);
    for (let n = 0; n < gaps.length; n++) {
      const a0 = gaps[n] + hw, a1 = (n + 1 < gaps.length ? gaps[n + 1] : gaps[0] + TAU) - hw;
      if (a1 - a0 < 0.05) continue;
      const len = (a1 - a0) * r;
      if (k > 0 && k < NC && R() < 0.22 && len > 6) {
        const m = Math.max(2, Math.round(len / 1.17));
        for (let i = 0; i <= m; i++) {
          const a = a0 + (i / m) * (a1 - a0);
          const [x, z] = polar(a, r);
          out.push({ x, z, a, w: 0.85, h: WALL_H * (0.96 + 0.08 * R()) + 0.3, d: 0.7 });
        }
      } else {
        const m = Math.max(1, Math.ceil(len / 2.6));
        for (let i = 0; i < m; i++) {
          const a = a0 + ((i + 0.5) / m) * (a1 - a0);
          const [x, z] = polar(a, r);
          out.push({ x, z, a, w: (len / m) * (1 + 0.6 / r) + 0.06, h: WALL_H * (0.97 + 0.06 * R()) + 0.3, d: 0.8 });
        }
      }
    }
  }
  for (const e of plan.edges) {
    if (e.open || e.kind !== "side") continue;
    for (let i = 0; i < 3; i++) {
      const r = RAD(e.k) + ((i + 0.5) / 3) * CW;
      const [x, z] = polar(e.a, r);
      out.push({ x, z, a: e.a + Math.PI / 2, w: CW / 3 + 0.1, h: WALL_H * (0.97 + 0.06 * R()) + 0.3, d: 0.8 });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- the lore */
/** The ten steles' words (the owner's package). The first stands before the way in, the last two
    in the sanctuary; the rest wait in the maze's dead ends, met in this order going in. */
const NOTES: { title: string; text: string }[] = [
  { title: "The entry arch", text: "Every thought begins as a threshold. Step lightly; the walls are built only of the questions you have carried here, and every stone remembers the sky." },
  { title: "The first fork", text: "Two ways open before the waking mind, yet both belong to the same ground. Choosing a path leaves the other whole, waiting in quiet patience for your return." },
  { title: "The reflecting pool", text: "A path that ends is an invitation to stand still. In the pause where forward motion ceases, the mind ceases its chasing and sees the breadth of the night." },
  { title: "The wind gap", text: "Observe how the stones stand apart to let the starlight through. Certainty builds a fortress; wonder leaves spaces between its pillars so the horizon remains in view." },
  { title: "The mirror turn", text: "When a memory circles back upon itself, meet it with softer eyes. You are standing on higher ground now, and the old turn holds a gentler meaning." },
  { title: "The terrace overlook", text: "From this terrace you see the road where you began. The confusion of the lower turn becomes a clear pattern the moment it is held from above." },
  { title: "The resonant columns", text: "Listen to the silence between two thoughts. Like the space between these columns, that quiet interval is the true architecture supporting all that you know." },
  { title: "The lantern ramp", text: "Doubt is merely a corridor that curves out of sight. Keep walking with an open heart; the light ahead belongs to the very center you are seeking." },
  { title: "The gate of convergence", text: "All the winding avenues of inquiry gather into one circle. The seeker, the question, and the winding way were one movement from the first step." },
  { title: "The still center", text: "Here at the center, every wall falls below the eye. Sit and rest inside the open sky of your own being; the labyrinth was only the way home." },
];
const READ_KEY = "inward-journey:maze-read";

/** The maze now standing (main.ts reads its artifacts for taps and the reading panel). */
export let maze: MazeRoom | null = null;

/** Something in the maze to read: a stele, or an archetype's rite. */
export interface MazeArtifact {
  reading: Reading;
  pos: THREE.Vector3;
  /** Where to stand before it, facing it (world). */
  front?: THREE.Vector3;
}
export interface MazeRoom extends Room {
  /** Each thing to read and where it stands (world). */
  steles(): MazeArtifact[];
  /** A reading has been opened: its thread settles and its path will light. */
  markRead(id: string): void;
  /** A reading is open (or closed: null): an archetype's makes its gesture. */
  reading(id: string | null): void;
  /** Where the eagle's view looks down, while seated at the centre (world), else null. */
  eagle(): THREE.Vector3 | null;
  /** Sat at the still centre this visit. */
  sat: boolean;
  /** Still frames: everything met, the paths lit, seated (the motes flowing). */
  debugAll(): void;
  /** Walking through one of the forecourt's doors: its destination's id, else null. */
  portalAt(p: THREE.Vector3): string | null;
}
export interface MazeDeps {
  /** The figure the beings wear (shared with the world's), once it has loaded. */
  model: () => BeingModel | null;
  sparks: Sparks;
  reduced: () => boolean;
  /** A wall touched: a soft tone as its wave of light goes out. */
  chime?: () => void;
  /** The worlds' own buildings out in the world, to stand round the maze behind their doors (the
      owner: "there is beauty and value in seeing the actual buildings"): each its door's id, its
      object, and which way its door opens in its own frame (+1 toward +z, −1 toward −z). */
  buildings?: () => { id: string; obj: THREE.Object3D; door: 1 | -1; far?: number }[];
}
/** The doors round the forecourt to the worlds reached through buildings (the ids of main.ts's
    destinations), each in its world's own light. */
export const MAZE_PORTALS: { id: string; label: string; col: [number, number, number] }[] = [
  { id: "temple", label: "The temple", col: [1, 0.78, 0.45] },
  { id: "duat", label: "The pyramid and the Duat", col: [1, 0.62, 0.38] },
  { id: "densities", label: "The monument of the densities", col: [0.7, 0.62, 1] },
  { id: "adept", label: "The school of the adept", col: [0.6, 0.9, 1] },
  { id: "past", label: "Past choices", col: [0.5, 0.78, 1] },
  { id: "veil", label: "The world after the veil", col: [1, 0.92, 0.75] },
  { id: "descent", label: "The long descent", col: [0.95, 0.85, 0.65] },
];
/** Where the doors stand: round the forecourt, clear of the way in at the south. */
const PORTAL_R = OUTER + 6.2;
const portalAngle = (n: number) => 0.62 + (n / (MAZE_PORTALS.length - 1)) * (TAU - 1.24);
/** A name in glowing letters, for over a door. */
function nameplate(text: string, col: [number, number, number]): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 160;
  const x = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  if (x) {
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = "500 64px Georgia, 'Times New Roman', serif";
    const label = text.toUpperCase().split("").join(String.fromCharCode(8202));
    x.shadowColor = `rgba(${Math.round(col[0] * 255)},${Math.round(col[1] * 255)},${Math.round(col[2] * 255)},0.95)`;
    x.shadowBlur = 24;
    x.fillStyle = "rgba(255,220,160,0.5)";
    x.fillText(label, 512, 84);
    x.shadowBlur = 6;
    x.fillStyle = "rgba(255,240,214,1)";
    x.fillText(label, 512, 84);
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const tx = T.texture(tex);
  m.colorNode = vec4(tx.rgb.mul(tx.a).mul(1.1), 1);
  return new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.125), m);
}

/* ---------------------------------------------------------------- the thread of electric light */
/** Polylines (each a list of [x, y, z]) as hairline ribbons carrying, at each end of each
    segment, its distance along its line (`aS` here, `aSO` at the far end). */
function threadGeometry(lines: [number, number, number][][]): { geo: THREE.BufferGeometry; length: number } {
  const pairs: number[] = [], s: number[] = [];
  let length = 0;
  for (const line of lines) {
    let acc = 0;
    for (let k = 0; k + 1 < line.length; k++) {
      const [a, b] = [line[k], line[k + 1]];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      pairs.push(...a, ...b);
      s.push(acc, acc + d);
      acc += d;
    }
    length = Math.max(length, acc);
  }
  const geo = ribbonGeometry(pairs);
  const segs = s.length / 2;
  const aS = new Float32Array(segs * 4), aSO = new Float32Array(segs * 4);
  for (let k = 0; k < segs; k++) {
    const A = s[k * 2], B = s[k * 2 + 1];
    aS.set([A, A, B, B], k * 4);
    aSO.set([B, B, A, A], k * 4);
  }
  geo.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
  geo.setAttribute("aSO", new THREE.BufferAttribute(aSO, 1));
  return { geo, length };
}
/** A thread of electric light: a hairline that quivers (each point jittering on its own, fast),
    sparks flickering along it, and slow bright pulses flowing up it. `lit` 1 once read: it
    settles into a faint, slow gold. */
function electricMaterial(t: N, lit: N, near: N, length: number, px = 1.05): THREE.MeshBasicNodeMaterial {
  const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  const sA = attribute("aS", "float"), sB = attribute("aSO", "float");
  const live = float(1).sub(lit.mul(0.8));
  const jit = (s: N) => vec3(sin(s.mul(41).add(t.mul(23))), sin(s.mul(33).sub(t.mul(19))), sin(s.mul(37).add(t.mul(17)))).mul(sin(s.mul(7).add(t.mul(3.1))).mul(0.5).add(0.5)).mul(live.mul(0.028));
  const vA = modelViewMatrix.mul(vec4(positionGeometry.add(jit(sA)), 1)), vB = modelViewMatrix.mul(vec4(attribute("aO", "vec3").add(jit(sB)), 1));
  const dir = normalize(vB.xy.div(vB.z.negate()).sub(vA.xy.div(vA.z.negate())).add(vec2(1e-6, 0)));
  const sd = attribute("aSide", "float");
  const off = vec2(dir.y.negate(), dir.x).mul(sd).mul(vA.z.negate().mul(px).div(gpuUniforms.px));
  m.vertexNode = cameraProjectionMatrix.mul(vec4(vA.xy.add(off), vA.z, 1));
  const soft = float(1).sub(sd.mul(sd)).mul(1.8).min(1);
  // pulses flowing up the line, two at a time; sparks crackling along it
  const f = sA.div(length);
  const p1 = pow(smoothstep(0.72, 1, fract(f.mul(1.5).sub(t.mul(0.32)))), 3);
  const p2 = pow(smoothstep(0.82, 1, fract(f.mul(2.3).sub(t.mul(0.21)).add(0.4))), 3);
  const spark = smoothstep(0.88, 1, fract(sin(T.floor(sA.mul(9)).mul(12.9898).add(T.floor(t.mul(13)).mul(78.233))).mul(43758.5453)));
  const flick = sin(t.mul(31).add(sA.mul(17))).mul(0.15).add(0.85);
  const electric = vec3(0.62, 0.84, 1).mul(float(0.22).add(p1.add(p2).mul(1.1)).add(spark.mul(0.7))).mul(flick).mul(near.mul(0.5).add(0.6));
  const settled = vec3(1, 0.8, 0.48).mul(float(0.1).add(p1.mul(0.25)));
  m.colorNode = vec4(mix(electric, settled, lit).mul(soft), 1);
  return m;
}

/* ---------------------------------------------------------------- the maze */
export function createMindMaze(scene: THREE.Scene, _narration: Narration, whisper: (t: string, ms?: number) => void, deps?: MazeDeps): MazeRoom {
  const g = new THREE.Group();
  g.name = "mind-maze";
  scene.add(g);
  const ours: { dispose(): void }[] = [];
  const clock = roomClock();
  const t = clock.u;
  const R = seeded(4099);
  const plan = mazePlan();
  const uCalm = uniform(0); // seated at the centre
  const uSanct = uniform(0); // within the sanctuary (its rings of gold show only there)
  const uReveal = uniform(0); // how far out from the centre the paths have lit (m along them)
  const origin = JOURNEY_ORIGIN;

  // the sky: the first density's, a storm-dark dome ember-lit low toward the volcano; over it the
  // storm ceiling that lights from within but never breaks, the volcano pouring slow fire beyond
  // the walls, towers of basalt on the horizon, and ash drifting down the corridors
  {
    const dome = skyDome(420, new THREE.Color(0.075, 0.06, 0.1), new THREE.Color(0.012, 0.014, 0.034), {
      glowDir: VOLC.clone().setY(8),
      glow: new THREE.Color(0.55, 0.16, 0.05),
      glowPow: 5,
    });
    g.add(dome.mesh);
    ours.push(dome);
    const uLava = uniform(1.15), uStorm = uniform(1);
    volcano(g, t, VOLC, VOLC_H, uLava, R, ours, [-30, 90]);
    stormCeiling(g, t, VOLC, uStorm, ours);
    for (const c of [[-30, 2, 40], [30, 2, 40], [-30, 2, -20], [30, 2, -20]] as [number, number, number][]) ash(g, t, R, ours, c, 200);
    // two more volcanoes far off on the horizon, in the gaps between the buildings
    volcano(g, t, new THREE.Vector3(-300, -2, -150), 105, uLava, R, ours, [40, 60]);
    volcano(g, t, new THREE.Vector3(330, -2, 120), 92, uLava, R, ours, [-60, -20]);
    // basalt towers and sea stacks standing round the maze beyond its forecourt, as in the first density
    const stone = etchedStone("#15121c", "#6e5238", 3.4);
    ours.push(stone);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + (R() - 0.5) * 0.3, d = 96 + R() * 60;
      if (Math.abs(wrap(a)) < 0.35) continue; // the way you came in stays open
      if (MAZE_PORTALS.some((_, n) => Math.abs(wrap(a - portalAngle(n))) < 0.3)) continue; // nor stand before a building
      const r = 2.6 + R() * 4, h = 16 + R() * 34;
      const geo = spireGeometry(r, h, 300 + i * 7, 7, (R() - 0.5) * 2);
      const mesh = new THREE.Mesh(geo, stone);
      const [x, z] = polar(a, d);
      mesh.position.set(x, BASE - 0.8, z);
      mesh.rotation.y = R() * TAU;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo);
    }
  }
  // the light: dark, ember from the volcano casting the walls' long shadows, a dim cold sky above
  {
    const hemi = new THREE.HemisphereLight(0x5a4a6c, 0x1c100c, 1.1);
    const key = new THREE.DirectionalLight(0xff9a5c, 1.25);
    key.position.copy(VOLC).normalize().multiplyScalar(80).setY(34);
    key.target.position.set(0, 0, 0);
    keyShadow(key, OUTER + 12);
    g.add(hemi, key, key.target);
  }

  // the ground: the first density's black volcanic sand, streaked with ash, glittering near with
  // grains of obsidian; rising gently toward the centre, far out into the dark
  {
    const geo = new THREE.RingGeometry(0.01, 400, 220, 150);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, mazeFloor(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 });
    const P = roomPos;
    const streak = vnoise(P.xz.mul(vec2(0.06, 0.2))).mul(0.04).add(0.05);
    const grain = vnoise(P.xz.mul(2.2)).mul(0.5).add(vnoise(P.xz.mul(vec2(0.35, 1.4))).mul(0.6)).add(0.45);
    const scan = scannedGround("sand", 2.6, { hue: 0.15, relief: 1.8, bright: 2.0 });
    m.colorNode = vec3(0.95, 0.93, 1.12).mul(streak).mul(grain.mul(0.5).add(0.5)).mul(scan.color);
    m.normalNode = scan.normal;
    const cell = T.floor(P.xz.mul(16));
    const view = T.normalize(T.cameraPosition.sub(T.positionWorld));
    const tw = hash2(cell.add(T.floor(view.xz.mul(20))));
    const near = float(1).sub(smoothstep(6, 26, T.length(T.cameraPosition.sub(T.positionWorld))));
    const dot_ = smoothstep(0.24, 0.0, T.length(fract(P.xz.mul(16)).sub(0.5)));
    m.emissiveNode = vec3(1.0, 0.8, 0.6).mul(T.step(0.986, hash2(cell)).mul(T.step(0.55, tw)).mul(dot_).mul(near).mul(0.9));
    const mesh = passable(new THREE.Mesh(geo, m)); // the floor is the ground (mazeFloor), not a wall
    mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(geo, m);
  }

  const walls = wallLayout(plan);
  // waves of light where a wall is touched: up to four at once, each (where, when) in the room's frame
  const rips = [0, 1, 2, 3].map(() => uniform(new THREE.Vector4(0, -100, 0, -100)));
  let ripNext = 0;
  {
    const SECTORS = 8;
    const parts: THREE.BufferGeometry[][] = Array.from({ length: SECTORS }, () => []);
    walls.forEach((w, n) => {
      const b = stoneBlock(w.w, w.h, w.d, n + 1);
      b.rotateY(w.a);
      // set 0.3 m into the ground, which rises under it
      const f = Math.min(mazeFloor(w.x - Math.cos(w.a) * w.w * 0.5, w.z + Math.sin(w.a) * w.w * 0.5), mazeFloor(w.x + Math.cos(w.a) * w.w * 0.5, w.z - Math.sin(w.a) * w.w * 0.5));
      b.translate(w.x, f + w.h / 2 - 0.3, w.z);
      parts[Math.floor(((Math.atan2(w.x, w.z) + TAU) % TAU) / (TAU / SECTORS)) % SECTORS].push(b);
    });
    const m = landStone("sandstone_blocks_08", 0, 2.4, [0.62, 0.56, 0.56], { course: 0.62, block: 1.4, origin }, "granite");
    // the maze's walls never thin away: what is beyond stays unseen (the view comes in before a wall instead)
    m.maskNode = null;
    // touched, a wall answers (the owner, after the series Invasion: not rings): the stone wakes
    // into a sheet of turbulent cyan energy spreading from the touch, nebulous clouds flowing
    // upward, fine bright filaments like lightning veining through them, a dust of sparks; its
    // edge torn by the cloud itself; then it settles back into stone. Computed once per pixel for
    // all four touches, and only where one is glowing.
    {
      const energy = T.Fn(() => {
        const pr = T.positionWorld.sub(vec3(origin.x, origin.y, origin.z));
        const out = vec3(0).toVar();
        let mask: N = float(0), core: N = float(0);
        for (const u of rips) {
          const d = T.length(pr.sub(u.xyz)), age = t.sub(u.w), live = T.step(0, age);
          const r = float(5.5).mul(float(1).sub(T.exp(age.mul(-1.1))));
          mask = T.max(mask, smoothstep(r.add(0.3), r.sub(1.8), d).mul(smoothstep(5.5, 1.8, age)).mul(live));
          core = T.max(core, T.exp(d.mul(d).mul(-2)).mul(smoothstep(2.2, 0, age)).mul(live));
        }
        T.If(mask.add(core).greaterThan(0.003), () => {
          const n = (p: N) => T.mx_noise_float(p).mul(0.5).add(0.5);
          const q = pr.mul(0.55).add(vec3(0, t.mul(-0.4), 0));
          const warp = vec3(n(q.add(1.7)), n(q.add(5.2)), n(q.mul(1.1).add(9.1))).mul(1.8);
          const cloud = n(q.mul(1.4).add(warp)).mul(0.65).add(n(q.mul(3.1).add(warp.mul(0.5))).mul(0.35));
          // a few hairline filaments, only in patches (lightning veining the cloud, not a net)
          const patch = smoothstep(0.5, 0.74, n(q.mul(0.8).add(4.4)));
          const vein = pow(float(1).sub(T.abs(T.mx_noise_float(q.mul(2.2).add(warp.mul(1.3))))), 60).mul(patch);
          const vein2 = pow(float(1).sub(T.abs(T.mx_noise_float(q.mul(4.6).add(warp)))), 90).mul(patch).mul(0.7);
          // a dust of small round sparks drifting in it
          const sp = pr.mul(13).add(vec3(0, t.mul(-0.6), 0));
          const cell = T.floor(sp);
          const dot_ = smoothstep(0.22, 0.0, T.length(fract(sp).sub(0.5)));
          const spark = T.step(0.955, hash3(cell)).mul(dot_).mul(sin(t.mul(6).add(hash3(cell.add(3)).mul(60))).mul(0.4).add(0.6));
          // the nebula carries the light: deep blue in its hollows, bright cyan where it thickens
          const grain = n(q.mul(7.5).add(warp.mul(0.3)));
          const neb = smoothstep(0.18, 0.85, cloud.mul(0.85).add(grain.mul(0.15)));
          const k = smoothstep(0.08, 0.6, mask.mul(cloud.add(0.65)));
          const sheet = mix(vec3(0.03, 0.18, 0.4), vec3(0.3, 0.75, 1), neb).mul(neb.mul(1.05).add(0.3)).add(vec3(0.6, 0.92, 1).mul(vein.add(vein2)).mul(0.8)).add(vec3(0.85, 0.96, 1).mul(spark).mul(0.7));
          out.assign(sheet.mul(k).mul(0.6).add(vec3(0.5, 0.85, 1).mul(core.mul(0.35))));
        });
        return out;
      });
      m.emissiveNode = (m.emissiveNode as N).add(energy());
    }
    for (const list of parts) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(merge(list), m);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = "maze-wall";
      g.add(mesh);
      ours.push(mesh.geometry);
    }
    ours.push(m);
  }

  // the way in: two tall granite posts and a lintel at the outer wall's opening
  {
    const parts: THREE.BufferGeometry[] = [];
    const y = mazeFloor(0, OUTER);
    for (const sx of [-1, 1]) {
      const b = stoneBlock(1.3, WALL_H + 1.5, 1.3, 40 + sx);
      b.translate(sx * (DOOR + 0.55), y + (WALL_H + 1.5) / 2 - 0.3, OUTER);
      parts.push(b);
    }
    const lin = stoneBlock(DOOR * 2 + 2.6, 0.8, 1.4, 44);
    lin.translate(0, y + WALL_H + 1.5, OUTER);
    parts.push(lin);
    const m = landStone("sandstone_blocks_08", 0, 2.2, [1, 1, 1.02], { origin }, "granite");
    const mesh = new THREE.Mesh(merge(parts), m);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(mesh.geometry, m);
  }

  /* ---- the worlds' own buildings, standing beyond their doors and facing the maze: the very
     exteriors out in the world (their geometry and materials shared, not copied), seen over the
     walls and from the forecourt; the pyramid far off, a great landmark ---- */
  {
    const list = deps?.buildings?.() ?? [];
    for (const b of list) {
      const n = MAZE_PORTALS.findIndex((q) => q.id === b.id);
      if (n < 0) continue;
      const src = b.obj;
      const box = new THREE.Box3().setFromObject(src);
      const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      const r = b.far ?? PORTAL_R + 14 + Math.min(70, size) * 0.5;
      const a = portalAngle(n);
      const [x, z] = polar(a, r);
      const c = src.clone(true);
      c.visible = true; // (its parts keep their own: what the original hides stays hidden)
      const lights: THREE.Object3D[] = [];
      c.traverse((o) => (o as THREE.Light).isLight && lights.push(o));
      for (const l of lights) l.removeFromParent(); // its lamps light the world, not the maze
      c.position.set(x, BASE - 0.15, z);
      // its door toward the maze's heart
      c.rotation.set(0, b.door > 0 ? a + Math.PI : a, 0);
      c.name = `maze-view-${b.id}`;
      g.add(c);
    }
  }

  /* ---- the doors to the other worlds, round the forecourt: two granite posts and a lintel, its
     world's light hanging in the opening, its name glowing over it on both sides ---- */
  {
    const parts: THREE.BufferGeometry[] = [];
    const curtain = new THREE.PlaneGeometry(2.6, 3.9);
    curtain.translate(0, 1.95, 0);
    ours.push(curtain);
    MAZE_PORTALS.forEach((p, n) => {
      const a = portalAngle(n);
      const [x, z] = polar(a, PORTAL_R);
      const y = mazeFloor(x, z);
      const cx = Math.cos(a), cz = -Math.sin(a); // along the door
      for (const sx of [-1, 1]) {
        const b = stoneBlock(0.9, 4.6, 0.9, 900 + n * 2 + sx);
        b.translate(x + cx * sx * 1.75, y + 2.0, z + cz * sx * 1.75);
        parts.push(b);
      }
      const lin = stoneBlock(4.6, 0.7, 1.1, 950 + n);
      lin.rotateY(a);
      lin.translate(x, y + 4.5, z);
      parts.push(lin);
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      const q = uv();
      const edge = smoothstep(0, 0.2, q.x).mul(smoothstep(1, 0.8, q.x)).mul(smoothstep(1, 0.75, q.y)).mul(smoothstep(0, 0.05, q.y));
      const folds = sin(q.x.mul(30).add(sin(q.y.mul(4).add(t.mul(0.5).add(n))).mul(1.4))).mul(0.5).add(0.5);
      const near = smoothstep(0.8, 3.5, T.length(T.cameraPosition.sub(T.positionWorld)));
      m.colorNode = vec4(vec3(...p.col).mul(edge).mul(folds.mul(0.35).add(0.65)).mul(sin(t.mul(0.45).add(n)).mul(0.15).add(0.85)).mul(near).mul(0.7), 1);
      const c = new THREE.Mesh(curtain, m);
      c.position.set(x, y, z);
      c.rotation.y = a;
      g.add(c);
      ours.push(m);
      const plate = nameplate(p.label, p.col);
      plate.position.set(x, y + 5.35, z);
      plate.rotation.y = a + Math.PI; // read from within the forecourt (facing the maze)
      g.add(plate);
      ours.push(plate.geometry, plate.material as THREE.Material);
    });
    const m = landStone("sandstone_blocks_08", 0, 2.2, [1, 1, 1.02], { origin }, "granite");
    const mesh = new THREE.Mesh(merge(parts), m);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(mesh.geometry, m);
  }

  /* ---- where each thing stands: a cell's closed end, facing the way it opens ---- */
  const fromEntry = bfs(plan, plan.entry).dist;
  const toHeart = bfs(plan, plan.heart);
  const used = new Set<number>([plan.entry, plan.heart]);
  const spotIn = (c: number) => {
    const cell = plan.cells[c];
    const ac = (cell.a0 + cell.a1) / 2, rm = MID(cell.k);
    const [cx, cz] = polar(ac, rm);
    // toward the opening (the one way in, for a dead end)
    const o = cell.open[0];
    const [ox, oz] = o.r ? polar(o.a, o.r) : polar(o.a, rm);
    let dx = ox - cx, dz = oz - cz;
    const l = Math.hypot(dx, dz) || 1;
    (dx /= l), (dz /= l);
    // stand back from it, toward the closed end
    const back = cell.open.length === 1 ? Math.min(2.6, l * 0.55) : 0;
    const x = cx - dx * back, z = cz - dz * back;
    return { x, z, face: Math.atan2(dx, dz) };
  };
  /** Cells of rings ks, dead ends first, spread over the walk in; `n` of them. */
  const pick = (ks: number[], n: number): number[] => {
    const all = plan.cells.map((_, c) => c).filter((c) => ks.includes(plan.cells[c].k) && !used.has(c));
    const dead = all.filter((c) => plan.cells[c].open.length === 1);
    const pool = (dead.length >= n + 2 ? dead : all).sort((a, b) => fromEntry[a] - fromEntry[b]);
    const out: number[] = [];
    for (let j = 0; j < n && pool.length; j++) {
      const c = pool[Math.min(pool.length - 1, Math.floor(((j + 0.5) / n) * pool.length))];
      if (used.has(c)) continue;
      used.add(c);
      out.push(c);
    }
    return out;
  };

  /* ---- the read ones (remembered on the device) ---- */
  const read = new Set<string>();
  try {
    for (const id of JSON.parse(localStorage.getItem(READ_KEY) || "[]") as string[]) read.add(id);
  } catch {
    /* none read yet */
  }
  interface Art {
    id: string;
    reading: Reading;
    local: THREE.Vector3;
    cell: number;
    lit: ReturnType<typeof uniform>;
    near: ReturnType<typeof uniform>;
    /** Before it, along the way it faces (room frame). */
    front: THREE.Vector3;
    being?: { beings: Beings; pivot: THREE.Group };
  }
  const arts: Art[] = [];
  const newArt = (id: string, reading: Reading, local: THREE.Vector3, cell: number, face: number, ahead: number): Art => {
    const fx = local.x + Math.sin(face) * ahead, fz = local.z + Math.cos(face) * ahead;
    const a: Art = { id, reading, local, cell, lit: uniform(read.has(id) ? 1 : 0), near: uniform(0), front: new V3(fx, mazeFloor(fx, fz), fz) };
    arts.push(a);
    return a;
  };
  const threads: [number, number, number][][] = [];
  const threadArt: Art[] = [];

  // the archetypes: the Mind in the outer rings, the Body in the middle, the Spirit nearer the
  // centre, the Choice by the sanctuary's door; each in order as you go in
  const solids: Solid[] = [];
  {
    const realms: [number[], number[]][] = [
      [[5, 6], [0, 1, 2, 3, 4, 5, 6]],
      [[3, 4], [7, 8, 9, 10, 11, 12, 13]],
      [[1, 2], [14, 15, 16, 17, 18, 19, 20]],
    ];
    const place: [number, number][] = [];
    for (const [ks, list] of realms) pick(ks, list.length).forEach((c, j) => place.push([list[j], c]));
    // the Choice: in the sanctuary door's own cell, to one side of the door
    place.push([21, plan.heart]);
    for (const [i, c] of place) {
      let s = spotIn(c);
      if (i === 21) {
        // to the side of the sanctuary's door away from the way in from the next ring, facing that way
        const d = plan.cells[plan.heart].open.find((o) => o.r) ?? plan.cells[plan.heart].open[0];
        const side = wrap(d.a - Math.PI) > 0 ? -1 : 1;
        const [x, z] = polar(Math.PI + side * 0.15, MID(0) - 0.5);
        const [dx, dz] = d.r ? polar(d.a, d.r) : polar(d.a, MID(0));
        s = { x, z, face: Math.atan2(dx - x, dz - z) };
      }
      const pivot = new THREE.Group();
      pivot.position.set(s.x, mazeFloor(s.x, s.z), s.z);
      pivot.rotation.y = s.face;
      const stations: Station[] = [];
      stations[i] = { center: new V3(0, 0, 0) } as unknown as Station;
      const beings = new Beings(stations, deps?.sparks ?? ({ emit() {} } as unknown as Sparks), { within: 42 });
      const b = beings.list[0];
      if (!b) continue;
      beings.onMeet = (spec) => whisper(`${spec.numeral} · ${spec.name}`, 3200);
      b.spec.under = false;
      // stood off-centre in its landmark: here in the middle of its place, as on its card
      const [ox, , oz] = b.spec.at;
      beings.group.position.set(-ox, 0, -oz);
      pivot.add(beings.group);
      g.add(pivot);
      const n = b.spec.numeral, rite = RITES[n];
      const id = `maze-arch-${n}`;
      const reading: Reading = {
        id,
        title: `${n} · ${b.spec.name}`,
        pages: rite ? [rite.invite, rite.line, rite.ask] : [b.spec.name],
        voices: rite ? [riteAudio(n, 1), riteAudio(n, 2), riteAudio(n, 3)] : undefined,
        autoVoice: true,
        look: "stone",
        place: { x: s.x, z: s.z },
      };
      const art = newArt(id, reading, new V3(s.x, pivot.position.y + 1.3, s.z), c, s.face, 2.8);
      art.being = { beings, pivot };
      solids.push({ x: s.x, z: s.z, r: 0.85, h: 3 });
      // its thread: a slow helix of electric light round it, and a ring at its feet
      const line: [number, number, number][] = [];
      const turns = 2.5, steps = 160, rad = 0.95, y0 = pivot.position.y;
      for (let k = 0; k <= steps; k++) {
        const f = k / steps, a = f * turns * TAU + i;
        line.push([s.x + Math.sin(a) * rad * (1 - f * 0.25), y0 + 0.08 + f * 2.5, s.z + Math.cos(a) * rad * (1 - f * 0.25)]);
      }
      threads.push(line);
      threadArt.push(art);
      const ring: [number, number, number][] = [];
      for (let k = 0; k <= 64; k++) {
        const a = (k / 64) * TAU;
        ring.push([s.x + Math.sin(a) * 1.15, y0 + 0.05, s.z + Math.cos(a) * 1.15]);
      }
      threads.push(ring);
      threadArt.push(art);
    }
  }

  // the steles: dark granite carved with gold writing, both faces, each facing the way it opens
  {
    const spots: { x: number; z: number; face: number; cell: number }[] = [];
    // the first before the way in, in the forecourt
    spots.push({ x: 3.6, z: OUTER + 2.6, face: Math.PI + 0.35, cell: plan.entry });
    for (const c of pick([1, 2, 3, 4, 5, 6], 7)) spots.push({ ...spotIn(c), cell: c });
    // the last two in the sanctuary: by its door, and by the seat
    spots.push({ x: 3.2, z: -(RIN - 2.4), face: -0.3, cell: plan.heart });
    spots.push({ x: 3.4, z: -2.6, face: Math.atan2(-3.4, 2.6), cell: plan.heart });
    const stone = landStone("sandstone_cracks", 0, 1.4, [0.7, 0.7, 0.78], { origin }, "granite");
    const parts: THREE.BufferGeometry[] = [];
    const face = new THREE.PlaneGeometry(0.62, 1.25);
    ours.push(face);
    NOTES.forEach((n, i) => {
      const sp = spots[i];
      if (!sp) return;
      const { x, z, face: turn } = sp;
      const y = mazeFloor(x, z);
      const b = stoneBlock(0.9, 2.3, 0.3, 500 + i);
      // a gently rounded crown: the top corners drawn in
      const p = b.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) {
        const py = p.getY(k);
        if (py > 0.75) p.setX(k, p.getX(k) * (1 - Math.pow((py - 0.75) / 0.4, 2) * 0.35));
      }
      b.computeVertexNormals();
      b.rotateY(turn);
      b.translate(x, y + 1.05, z);
      parts.push(b);
      const id = `maze-${i + 1}`;
      const art = newArt(id, { id, title: n.title, pages: [n.text], look: "tablet", place: { x, z } }, new V3(x, y + 1.25, z), sp.cell, turn, 2);
      // the writing: rows of short strokes, worn in places, gold warming as you come near
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      const q = uv();
      const row = fract(q.y.mul(11)), rowId = T.floor(q.y.mul(11));
      const cell = fract(q.x.mul(7).add(sin(rowId.mul(7.1)).mul(3)));
      const stroke = smoothstep(0.38, 0.48, row).mul(smoothstep(0.66, 0.56, row)).mul(T.step(0.16, cell)).mul(T.step(cell, 0.84));
      const worn = T.step(0.22, fract(sin(rowId.mul(12.9).add(T.floor(q.x.mul(7)).mul(4.1))).mul(437.5)));
      const frame = smoothstep(0.02, 0.06, q.x).mul(smoothstep(0.98, 0.94, q.x)).mul(smoothstep(0.02, 0.05, q.y)).mul(smoothstep(0.98, 0.95, q.y));
      const breathe = sin(t.mul(1.1).add(i)).mul(0.12).add(0.88);
      m.colorNode = vec4(vec3(1, 0.8, 0.46).mul(stroke.mul(worn).mul(frame)).mul(float(0.22).add(art.near.mul(0.6)).add(art.lit.mul(0.25))).mul(breathe), 1);
      for (const side of [1, -1]) {
        const plane = new THREE.Mesh(face, m);
        plane.position.set(x + Math.sin(turn) * 0.158 * side, y + 1.25, z + Math.cos(turn) * 0.158 * side);
        plane.rotation.y = turn + (side < 0 ? Math.PI : 0);
        g.add(plane);
      }
      ours.push(m);
      // its thread: the stele's outline, a hand's breadth out, drawn round both faces
      const line: [number, number, number][] = [];
      const cx = Math.cos(turn), cz = -Math.sin(turn); // along its width
      const out = (u: number, v: number): [number, number, number] => [x + cx * u, y + v, z + cz * u];
      for (let k = 0; k <= 20; k++) line.push(out(-0.53, 0.05 + (k / 20) * 1.8));
      for (let k = 1; k <= 24; k++) {
        const a = Math.PI - (k / 24) * Math.PI;
        line.push(out(Math.cos(a) * 0.53, 1.85 + Math.sin(a) * 0.42));
      }
      for (let k = 1; k <= 20; k++) line.push(out(0.53, 1.85 - (k / 20) * 1.8));
      threads.push(line);
      threadArt.push(art);
    });
    const mesh = new THREE.Mesh(merge(parts), stone);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(mesh.geometry, stone);
  }

  // the electric threads (one mesh each, so each can settle when it is read)
  {
    threads.forEach((line, n) => {
      const art = threadArt[n];
      const { geo, length } = threadGeometry([line]);
      const mat = electricMaterial(t, art.lit, art.near, length);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      g.add(mesh);
      ours.push(geo, mat);
    });
  }

  /* ---- the paths of light: from the seat out through the corridors to each thing met ---- */
  /** Polar waypoints along the corridors from a cell to the seat (sampled every half metre). */
  const pathOf = (art: Art): Float32Array => {
    const pts: [number, number][] = [];
    const arc = (r: number, a0: number, a1: number) => {
      const d = wrap(a1 - a0), n = Math.max(1, Math.ceil((Math.abs(d) * r) / 0.8));
      for (let k = 1; k <= n; k++) pts.push(polar(a0 + (d * k) / n, r));
    };
    const line = (x0: number, z0: number, x1: number, z1: number) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.8));
      for (let k = 1; k <= n; k++) pts.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
    };
    // from the thing itself, to its corridor's middle
    const c0 = plan.cells[art.cell];
    pts.push([art.local.x, art.local.z]);
    let sx = art.local.x, sz = art.local.z;
    // from the forecourt: in through the way in
    if (Math.hypot(sx, sz) > OUTER) {
      line(sx, sz, 0, OUTER + 1.5);
      (sx = 0), (sz = OUTER + 1.5);
    }
    let r = MID(c0.k), a = Math.atan2(sx, sz);
    if (art.cell === plan.heart && Math.hypot(art.local.x, art.local.z) < RIN) {
      // already in the sanctuary
    } else {
      line(sx, sz, ...polar(a, r));
      let u = art.cell;
      while (u !== plan.heart && toHeart.prev[u] >= 0) {
        const v = toHeart.prev[u];
        const o = plan.cells[u].open.find((q) => q.to === v)!;
        arc(r, a, o.a);
        a = o.a;
        if (o.r) {
          const r1 = MID(plan.cells[v].k);
          line(...polar(a, r), ...polar(a, r1));
          r = r1;
        }
        u = v;
      }
      // round to the sanctuary's door, and in
      arc(r, a, Math.PI);
      a = Math.PI;
      line(...polar(a, r), ...polar(a, RIN - 1.5));
    }
    const [lx, lz] = pts[pts.length - 1];
    line(lx, lz, 0, -1.1);
    // resampled evenly, every half metre, with the floor's height
    const len: number[] = [0];
    for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const L = len[len.length - 1], n = Math.max(2, Math.ceil(L / 0.5) + 1);
    const out = new Float32Array(n * 3);
    let j = 0;
    for (let k = 0; k < n; k++) {
      const s = (k / (n - 1)) * L;
      while (j < len.length - 2 && len[j + 1] < s) j++;
      const f = (s - len[j]) / Math.max(1e-6, len[j + 1] - len[j]);
      const x = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, z = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f;
      out.set([x, mazeFloor(x, z) + 0.06, z], k * 3);
    }
    return out;
  };
  const paths = arts.map((art) => {
    const pts = pathOf(art);
    const n = pts.length / 3;
    const line: [number, number, number][] = [];
    for (let k = 0; k < n; k++) line.push([pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]]);
    const { geo, length } = threadGeometry([line]);
    // lit from the seat outward as it is revealed (distance from the seat: length − s), a slow
    // brightness flowing toward the seat along it
    const sA = attribute("aS", "float");
    const fromSeat = float(length).sub(sA);
    const shown = smoothstep(uReveal, uReveal.sub(6), fromSeat).mul(art.lit);
    const flow = sin(sA.mul(0.55).sub(t.mul(2.4))).mul(0.3).add(0.7);
    // laid over (not added): where many paths share a corridor they read as one line, not a blaze
    const mat = ribbonMaterial(vec3(0), 1.4);
    mat.blending = THREE.NormalBlending;
    const sd = attribute("aSide", "float");
    const soft = float(1).sub(sd.mul(sd)).mul(1.8).min(1);
    mat.colorNode = vec4(vec3(1, 0.84, 0.52).mul(flow.mul(0.35).add(0.55)).mul(float(0.75).add(uCalm.mul(0.25))), shown.mul(soft).mul(0.9));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    g.add(mesh);
    ours.push(geo, mat);
    return { art, pts, n, length };
  });
  // the motes flowing along the lit paths to the seat (placed each frame while you sit)
  const MOTES = 900;
  const motes = pointCloud(MOTES, 0.62);
  {
    for (let i = 0; i < MOTES; i++) motes.k.set([R(), R(), R(), R()], i * 4);
    touch(motes.cloud);
    const K = motes.cloud.nodes.aK;
    const tw = sin(t.mul(3.1).add(K.w.mul(40))).mul(0.3).add(0.7);
    motes.material.colorNode = vec4(mix(vec3(1, 0.86, 0.6), vec3(1, 0.97, 0.88), K.z).mul(motes.round).mul(tw).mul(uCalm).mul(1.0), 1);
    motes.cloud.sprite.frustumCulled = false;
    g.add(motes.cloud.sprite);
    ours.push(motes.material);
  }
  const placeMotes = () => {
    const lit = paths.filter((p) => p.art.lit.value === 1);
    const time = clock.u.value as number;
    for (let i = 0; i < MOTES; i++) {
      if (!lit.length) {
        motes.pos.set([0, -50, 0], i * 3);
        continue;
      }
      const k0 = motes.k[i * 4], k1 = motes.k[i * 4 + 1], k2 = motes.k[i * 4 + 2];
      const p = lit[i % lit.length];
      const u = (k0 + (time * (3.2 + k1 * 2.4)) / p.length) % 1; // 0 at the thing, 1 at the seat
      const f = u * (p.n - 1), j = Math.min(p.n - 2, Math.floor(f)), w = f - j;
      const o = j * 3;
      const wob = 0.25 * (1 - u);
      motes.pos.set(
        [
          p.pts[o] + (p.pts[o + 3] - p.pts[o]) * w + Math.sin(time * 1.3 + k2 * 40) * wob,
          p.pts[o + 1] + (p.pts[o + 4] - p.pts[o + 1]) * w + 0.25 + k2 * 0.5 + Math.sin(time * 2 + k1 * 30) * 0.12,
          p.pts[o + 2] + (p.pts[o + 5] - p.pts[o + 2]) * w + Math.cos(time * 1.1 + k2 * 50) * wob,
        ],
        i * 3,
      );
    }
    motes.cloud.attrs.position.needsUpdate = true;
  };

  /* ---- the still centre: a round seat, a ring of gold in the floor, and over it three tilted
     rings of gold, seen only once you are within the sanctuary ---- */
  const centreY = mazeFloor(0, 0);
  {
    const sg = new THREE.CylinderGeometry(0.72, 0.84, 0.46, 28);
    const sm = landStone("sandstone_cracks", 0, 1.1, [0.85, 0.85, 0.9], { origin }, "granite");
    const seat = passable(new THREE.Mesh(sg, sm)); // walked onto: it sits you down
    seat.position.set(0, centreY + 0.23, 0);
    seat.castShadow = seat.receiveShadow = true;
    g.add(seat);
    ours.push(sg, sm);
    const fg = new THREE.RingGeometry(2.6, 2.75, 96);
    fg.rotateX(-Math.PI / 2);
    fg.translate(0, centreY + 0.03, 0);
    const fm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    fm.colorNode = vec4(vec3(1, 0.82, 0.5).mul(float(0.25).add(uCalm.mul(0.45))), 1);
    g.add(new THREE.Mesh(fg, fm));
    ours.push(fg, fm);
  }
  const astro = new THREE.Group();
  astro.position.set(0, centreY + 6.2, 0);
  g.add(astro);
  {
    const pairs: number[] = [];
    const segs = 96;
    const rings: [number, number][] = [[2.6, 0.35], [3.5, -0.42], [4.4, 0.18]];
    for (const [rad, tilt] of rings) {
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let k = 0; k < segs; k++) {
        const a0 = (k / segs) * TAU, a1 = ((k + 1) / segs) * TAU;
        const x0 = Math.cos(a0) * rad, z0 = Math.sin(a0) * rad, x1 = Math.cos(a1) * rad, z1 = Math.sin(a1) * rad;
        pairs.push(x0, z0 * st, z0 * ct, x1, z1 * st, z1 * ct);
      }
    }
    const geo = ribbonGeometry(pairs);
    const mat = ribbonMaterial(vec3(1, 0.86, 0.58).mul(float(0.5).add(uCalm.mul(0.5))).mul(uSanct), 1.1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    astro.add(mesh);
    ours.push(geo, mat);
  }

  // the way out: the arch you came in by, behind you, a soft light standing in it
  {
    const parts: THREE.BufferGeometry[] = [];
    const { x: ex, z: ez } = MAZE_EXIT;
    const y = mazeFloor(ex, ez);
    for (const sx of [-2.25, 2.25]) {
      const b = stoneBlock(1.1, 4.4, 1.1, 70 + sx);
      b.translate(ex + sx, y + 2.0, ez);
      parts.push(b);
    }
    const lin = stoneBlock(5.8, 0.75, 1.25, 77);
    lin.translate(ex, y + 4.5, ez);
    parts.push(lin);
    const m = landStone("sandstone_blocks_08", 0, 2.2, [1, 1, 1.02], { origin }, "granite");
    const mesh = new THREE.Mesh(merge(parts), m);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(mesh.geometry, m);
    const cg = new THREE.PlaneGeometry(3.4, 4.1);
    cg.translate(ex, y + 2.05, ez);
    const cm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    const q = uv();
    const edge = smoothstep(0, 0.2, q.x).mul(smoothstep(1, 0.8, q.x)).mul(smoothstep(1, 0.6, q.y));
    // it thins as the camera comes near (the view starts just behind it), never a veil over the screen
    const nearCam = smoothstep(1.5, 9, T.length(T.cameraPosition.sub(T.positionWorld)));
    cm.colorNode = vec4(mix(vec3(0.4, 0.45, 1), vec3(1, 0.85, 0.55), q.y).mul(edge).mul(sin(t.mul(0.5)).mul(0.15).add(0.85)).mul(nearCam).mul(0.22), 1);
    g.add(new THREE.Mesh(cg, cm));
    ours.push(cg, cm);
  }

  // motes drifting low in the corridors, warming toward the centre
  {
    const n = 380;
    const c = pointCloud(n, 0.06);
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, r = Math.sqrt(R()) * (OUTER + 6);
      const [x, z] = polar(a, r);
      c.pos.set([x, mazeFloor(x, z) + 0.5 + R() * 3.6, z], i * 3);
      c.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    const drift = vec3(sin(t.mul(0.18).add(K.x.mul(12))), sin(t.mul(0.24).add(K.y.mul(7))).mul(0.6), cos(t.mul(0.15).add(K.z.mul(9))));
    c.material.positionNode = c.cloud.nodes.position.add(drift);
    const pulse = sin(t.mul(1.3).add(K.w.mul(30))).mul(0.35).add(0.65);
    c.material.colorNode = vec4(vec3(1, 0.86, 0.6).mul(c.round).mul(pulse).mul(float(0.3).add(uCalm.mul(0.3))), 1);
    g.add(c.cloud.sprite);
    ours.push(c.material);
  }

  const local = new V3();
  const tmp = new V3();
  let seated = false;
  let welcomed = false;
  let revealed = false;
  let hadModel = false;
  const lastP = new V3(), lastRip = new V3(1e5, 0, 0);
  let lastRipT = -10;
  const room: MazeRoom = {
    id: "mindMaze",
    active: true,
    seatPos: new V3(0, centreY, 0),
    seatHeading: 0,
    nearSeat: (p: THREE.Vector3) => Math.hypot(p.x, p.z) < 0.9,
    sat: false,
    onSit() {
      seated = true;
      room.sat = true;
      const n = arts.filter((a) => a.lit.value === 1).length;
      whisper(n ? "From the still centre, every path you walked comes home. Stay as long as you wish; moving stands you up." : "The still centre. Nothing you met walks with you yet: read the steles, meet the archetypes, and their paths will light to here.", 7500);
    },
    onStand() {
      seated = false;
    },
    holdsMovement: () => false,
    solids: () => solids,
    /** What the view turns to in contemplation: the centre's turning rings, once there. */
    centre: () => (Math.hypot(local.x, local.z) < RIN ? new V3(0, centreY + 5, 0) : null),
    steles: () => arts.map((a) => ({ reading: a.reading, pos: a.local.clone().add(g.position), front: a.front.clone().add(g.position) })),
    markRead(id: string) {
      const a = arts.find((q) => q.id === id);
      if (!a) return;
      a.lit.value = 1;
      read.add(id);
      try {
        localStorage.setItem(READ_KEY, JSON.stringify([...read]));
      } catch {
        /* fine */
      }
    },
    reading(id: string | null) {
      for (const a of arts) if (a.being) a.being.beings.list[0].rite = a.id === id ? 1 : 0;
    },
    eagle: () => (seated ? new V3(0, centreY, 0).add(g.position) : null),
    portalAt(p: THREE.Vector3) {
      const x = p.x - g.position.x, z = p.z - g.position.z;
      for (let n = 0; n < MAZE_PORTALS.length; n++) {
        const a = portalAngle(n), [px, pz] = polar(a, PORTAL_R);
        const along = (x - px) * Math.cos(a) - (z - pz) * Math.sin(a);
        const through = (x - px) * Math.sin(a) + (z - pz) * Math.cos(a);
        if (Math.abs(along) < 1.1 && Math.abs(through) < 0.5) return MAZE_PORTALS[n].id;
      }
      return null;
    },
    debugAll() {
      for (const a of arts) a.lit.value = 1;
      revealed = true;
      uReveal.value = 900;
      seated = true;
      uCalm.value = 1;
      uSanct.value = 1;
      placeMotes();
    },
    update(dt: number) {
      clock.tick(dt);
      local.copy(gpuUniforms.player.value as THREE.Vector3).sub(g.position);
      const rc = Math.hypot(local.x, local.z);
      uCalm.value = damp(uCalm.value as number, seated ? 1 : 0, 0.8, dt);
      uSanct.value = damp(uSanct.value as number, rc < RIN + 0.5 ? 1 : 0, 0.7, dt);
      // arrived at the centre: the paths light, spreading out from the seat, and stay lit
      if (rc < RIN - 0.5) revealed = true;
      if (revealed) uReveal.value = Math.min(900, (uReveal.value as number) + dt * (seated ? 40 : 22));
      astro.rotation.y += dt * (0.05 + 0.04 * (uCalm.value as number));
      astro.children[0].rotation.x = Math.sin(clock.u.value * 0.07) * 0.08;
      for (const a of arts) {
        const d = Math.hypot(local.x - a.local.x, local.z - a.local.z);
        a.near.value = damp(a.near.value as number, d < 7 ? 1 - Math.max(0, d - 2) / 5 : 0, 2, dt);
      }
      // the archetypes: given their figure once it has loaded; each sees you in its own frame
      const model = deps?.model() ?? null;
      const red = deps?.reduced() ?? false;
      for (const a of arts) {
        if (!a.being) continue;
        if (model && !hadModel) a.being.beings.attach(model);
        tmp.copy(gpuUniforms.player.value as THREE.Vector3);
        a.being.beings.group.worldToLocal(tmp);
        a.being.beings.update(clock.u.value as number, dt, tmp, red);
      }
      if (model) hadModel = true;
      if ((uCalm.value as number) > 0.01) placeMotes();
      // touching a wall: the nearest point of the nearest block within reach, and a wave from it
      // (one a moment, and again as you go along the wall)
      {
        const now = clock.u.value as number;
        const moved = Math.hypot(local.x - lastP.x, local.z - lastP.z);
        lastP.copy(local);
        let best = 0.62, bx = 0, bz = 0;
        for (const w of walls) {
          const dx = local.x - w.x, dz = local.z - w.z;
          if (dx * dx + dz * dz > 9) continue;
          const ca = Math.cos(w.a), sa = Math.sin(w.a);
          const u = dx * ca - dz * sa, v = dx * sa + dz * ca;
          const cu = Math.max(-w.w / 2, Math.min(w.w / 2, u)), cv = Math.max(-w.d / 2, Math.min(w.d / 2, v));
          const d = Math.hypot(u - cu, v - cv);
          if (d < best) (best = d), (bx = w.x + ca * cu + sa * cv), (bz = w.z - sa * cu + ca * cv);
        }
        if (best < 0.62 && moved > 0.002 && now - lastRipT > 0.9 && (Math.hypot(bx - lastRip.x, bz - lastRip.z) > 1.4 || now - lastRipT > 2.6)) {
          rips[ripNext].value.set(bx, local.y + 1.15, bz, now);
          ripNext = (ripNext + 1) % rips.length;
          lastRipT = now;
          lastRip.set(bx, 0, bz);
          deps?.chime?.();
        }
      }
      if (!welcomed) {
        welcomed = true;
        whisper("The mind's maze. Its walls hide the way; what glints has something to tell you. The centre waits within.", 7000);
      }
    },
    dispose() {
      if (maze === room) maze = null;
      scene.remove(g);
      for (const d of ours) d.dispose();
      ours.length = 0;
      room.active = false;
    },
  };
  maze = room;
  return room;
}

/** The maze's air: the first density's, dark and clear enough to see the far fire, glowing ember
    toward the volcano, a little more haze so the far corridors fade. */
export const MAZE_AIR: Air = {
  color: new THREE.Color(0.045, 0.04, 0.062),
  glow: new THREE.Color(0.42, 0.16, 0.07),
  glowDir: VOLC.clone().setY(10),
  density: 0.004,
  shadow: new THREE.Color(0.004, 0.004, 0.018),
  sat: 1.05,
  contrast: 1.08,
};
