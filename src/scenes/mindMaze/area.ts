/* The mind's maze (the owner's package, "The Mind's Maze"): an open labyrinth under the night, in
   three terraced rings that rise toward the centre, walled in cut stone low enough, in places, to
   see over: a maze to wander rather than to be lost in.
   - The outer ring's walls stand above the eye; the weaving ring and the inner ring are breast
     high, so the centre and its turning rings of gold can be seen from almost anywhere.
   - Porous stretches are colonnades: pillars a hand's width apart, the starlight coming through.
   - Short walls run across the corridors, so some turns end in quiet pockets.
   - Four beacons of soft light stand at the cardinal points of the outer corridor (you always know
     which way you face).
   - Ten steles of dark stone carry its lore, carved in gold; touch one (or stand by it a moment)
     and it is read in the reading panel (ui/reader.ts). Each read stele's gold thread to the
     centre lights, and stays lit (remembered on the device).
   - At the still centre, on the highest terrace, a round seat of stone under three tilted rings of
     gold turning slowly; sitting there, everything brightens and quiets.
   - The way out: the arch you came in by, behind you at the start.
   The walls are the game's cut masonry (`landStone`), so they are solid by their own shape
   (world/solidity.ts). Frame: the room's own, its centre at the origin; you start at the south
   (+z) facing the centre (−z). */
import * as THREE from "three/webgpu";
import { T, gpuUniforms } from "../../gpu/tsl";
import { keyShadow } from "../../gpu/lightRig";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { landStone, stoneBlock } from "../../world/stoneworks";
import { passable } from "../../world/solidity";
import { damp, keepAlpha, merge, pointCloud, roomClock, seeded, skyDome, touch, type Air } from "../densities/roomKit";
import { starField } from "../past/kit";
import type { Narration } from "../../core/narration";
import type { Room } from "../journey";
import type { Reading } from "../../world/readables";

const { abs, cos, float, fract, mix, positionGeometry, pow, sin, smoothstep, uniform, uv, vec3, vec4 } = T;
const V3 = THREE.Vector3;

/** Where you come in, and the arch that leads out (room frame). */
export const MAZE_START = { x: 0, z: 52, heading: 0 };
export const MAZE_EXIT = { x: 0, z: 57.2 };
/** The outer edge of where you may walk. */
const EDGE = 58;
/** The ground everywhere sits this far over the water line (the place apart's y is 0). */
const BASE = 1.2;

/** The ground: level outside, rising 1.2 m onto the middle terrace (r 27–31) and 1.2 m more onto
    the inner one (r 11.5–15.5). */
export function mazeFloor(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const s = (a: number, b: number) => {
    const k = Math.min(1, Math.max(0, (b - r) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  return BASE + s(27, 31) * 1.2 + s(11.5, 15.5) * 1.2;
}
/** Keep within the maze's outer edge (the walls themselves hold you by their own shape). */
export function mazeConfine(p: { x: number; z: number }): void {
  const r = Math.hypot(p.x, p.z);
  if (r > EDGE) (p.x *= EDGE / r), (p.z *= EDGE / r);
}

/* ---------------------------------------------------------------- the walls */
/** An arc of wall: radius, from angle a0 to a1 (θ = atan2(x, z), 0 toward the start), height. */
interface Arc {
  r: number;
  a0: number;
  a1: number;
  h: number;
  porous: boolean;
}
const ARCS: Arc[] = [
  // the outer ring, above the eye, its way in at the south
  { r: 49, a0: 0.14, a1: 1.42, h: 2.8, porous: true },
  { r: 49, a0: 1.72, a1: 2.98, h: 2.8, porous: false },
  { r: 49, a0: 3.3, a1: 4.55, h: 2.8, porous: true },
  { r: 49, a0: 4.86, a1: 6.14, h: 2.8, porous: false },
  // the weaving ring, breast high
  { r: 39, a0: -0.45, a1: 0.85, h: 1.35, porous: false },
  { r: 39, a0: 1.15, a1: 2.45, h: 1.55, porous: true },
  { r: 39, a0: 2.75, a1: 4.05, h: 1.35, porous: false },
  { r: 39, a0: 4.35, a1: 5.55, h: 1.55, porous: true },
  // the middle terrace's colonnade
  { r: 29, a0: 0.22, a1: 1.85, h: 2.2, porous: true },
  { r: 29, a0: 2.18, a1: 3.65, h: 2.2, porous: true },
  { r: 29, a0: 3.98, a1: 5.92, h: 2.2, porous: true },
  // the inner ring
  { r: 20, a0: -0.2, a1: 1.3, h: 1.15, porous: false },
  { r: 20, a0: 1.65, a1: 2.9, h: 1.8, porous: true },
  { r: 20, a0: 3.4, a1: 5.6, h: 1.15, porous: false },
  // the sanctuary's low frame: a kerb you can step over at its two ways in
  { r: 13.5, a0: 0.3, a1: 2.84, h: 0.75, porous: false },
  { r: 13.5, a0: 3.44, a1: 5.98, h: 0.75, porous: false },
];
/** Walls across the corridors (the pockets): at angle a, from radius r0 to r1. */
const CROSS: { a: number; r0: number; r1: number; h: number }[] = [
  { a: 0.98, r0: 29.4, r1: 38.6, h: 1.6 },
  { a: 2.58, r0: 39.4, r1: 48.6, h: 2.2 },
  { a: 3.82, r0: 29.4, r1: 38.6, h: 1.6 },
  { a: 5.15, r0: 39.4, r1: 48.6, h: 2.2 },
  { a: 1.48, r0: 20.4, r1: 28.6, h: 1.4 },
  { a: 4.52, r0: 20.4, r1: 28.6, h: 1.4 },
];
const polar = (a: number, r: number): [number, number] => [Math.sin(a) * r, Math.cos(a) * r];

/* ---------------------------------------------------------------- the lore */
/** The ten steles' words (the owner's package), each where it stands. */
const NOTES: { title: string; at: [number, number]; text: string }[] = [
  { title: "The entry arch", at: [0, 45], text: "Every thought begins as a threshold. Step lightly; the walls are built only of the questions you have carried here, and every stone remembers the sky." },
  { title: "The first fork", at: [17, 32], text: "Two ways open before the waking mind, yet both belong to the same ground. Choosing a path leaves the other whole, waiting in quiet patience for your return." },
  { title: "The reflecting pool", at: [43.5, 8], text: "A path that ends is an invitation to stand still. In the pause where forward motion ceases, the mind ceases its chasing and sees the breadth of the night." },
  { title: "The wind gap", at: [-43.5, 10], text: "Observe how the stones stand apart to let the starlight through. Certainty builds a fortress; wonder leaves spaces between its pillars so the horizon remains in view." },
  { title: "The mirror turn", at: [-33, -27], text: "When a memory circles back upon itself, meet it with softer eyes. You are standing on higher ground now, and the old turn holds a gentler meaning." },
  { title: "The terrace overlook", at: [-6, 24.5], text: "From this terrace you see the road where you began. The confusion of the lower turn becomes a clear pattern the moment it is held from above." },
  { title: "The resonant columns", at: [20, -16], text: "Listen to the silence between two thoughts. Like the space between these columns, that quiet interval is the true architecture supporting all that you know." },
  { title: "The lantern ramp", at: [-22.5, -9.5], text: "Doubt is merely a corridor that curves out of sight. Keep walking with an open heart; the light ahead belongs to the very center you are seeking." },
  { title: "The gate of convergence", at: [0, -17], text: "All the winding avenues of inquiry gather into one circle. The seeker, the question, and the winding way were one movement from the first step." },
  { title: "The still center", at: [3.4, -2.6], text: "Here at the center, every wall falls below the eye. Sit and rest inside the open sky of your own being; the labyrinth was only the way home." },
];
const READ_KEY = "inward-journey:maze-read";

/** The maze now standing (main.ts reads its steles for taps and the reading panel). */
export let maze: MazeRoom | null = null;

export interface MazeRoom extends Room {
  /** Each stele: its reading and where it stands (world). */
  steles(): { reading: Reading; pos: THREE.Vector3 }[];
  /** A stele has been read: its thread lights. */
  markRead(id: string): void;
  /** Sat at the still centre this visit. */
  sat: boolean;
}

export function createMindMaze(scene: THREE.Scene, _narration: Narration, whisper: (t: string, ms?: number) => void): MazeRoom {
  const g = new THREE.Group();
  g.name = "mind-maze";
  scene.add(g);
  const ours: { dispose(): void }[] = [];
  const clock = roomClock();
  const t = clock.u;
  const R = seeded(4099);
  const uCalm = uniform(0); // seated at the centre
  const uNear = uniform(new V3()); // the visitor, room frame

  // the sky: a deep indigo night, a low warm glow, stars
  {
    const dome = skyDome(420, new THREE.Color(0.05, 0.05, 0.12), new THREE.Color(0.006, 0.008, 0.026), {
      glowDir: new V3(0.5, 0.05, -0.8),
      glow: new THREE.Color(0.32, 0.2, 0.12),
      glowPow: 5,
      extra: (d, c) => c.add(vec3(0.85, 0.9, 1).mul(starField(d, t, 0.006, 360)).mul(0.9)),
    });
    g.add(dome.mesh);
    ours.push(dome);
  }
  // the light: a soft cool sky and a low warm key from the glow, casting the walls' shadows
  {
    const hemi = new THREE.HemisphereLight(0x5f74c0, 0x15131f, 0.75);
    const key = new THREE.DirectionalLight(0xffdcb0, 1.35);
    key.position.set(30, 34, -48);
    key.target.position.set(0, 0, 0);
    keyShadow(key, 62);
    g.add(hemi, key, key.target);
  }

  // the ground: flagstones in staggered rows, rising onto the terraces; far out it fades into the night
  {
    const geo = new THREE.RingGeometry(0.01, 150, 160, 96);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, mazeFloor(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    const m = landStone("red_sandstone_pavement", 0, 3, [0.62, 0.6, 0.7], { flag: 1.15 });
    const mesh = passable(new THREE.Mesh(geo, m)); // the floor is the ground (mazeFloor), not a wall
    mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(geo, m);
  }
  // the terraces' edges: a course of kerb stones where each terrace begins, so the rise reads
  {
    const parts: THREE.BufferGeometry[] = [];
    for (const [r, h] of [[31, 0.25], [15.5, 0.25]] as const) {
      const n = Math.round((Math.PI * 2 * r) / 1.3);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const [x, z] = polar(a, r);
        const b = stoneBlock((Math.PI * 2 * r) / n + 0.04, h + 0.3, 0.55, k);
        b.rotateY(a);
        b.translate(x, mazeFloor(x, z) + h / 2 - 0.15, z);
        parts.push(b);
      }
    }
    const m = landStone("sandstone_blocks_08", 0, 2.2, [0.6, 0.58, 0.68], {});
    const mesh = passable(new THREE.Mesh(merge(parts), m)); // low enough to step up
    mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(mesh.geometry, m);
  }

  // the walls: cut stone in courses; the porous stretches pillars with slits of starlight between
  {
    const parts: THREE.BufferGeometry[] = [];
    let seed = 1;
    const block = (x: number, z: number, a: number, w: number, h: number, d: number) => {
      const b = stoneBlock(w, h, d, seed++);
      b.rotateY(a);
      // set 0.3 m into the ground, which may rise under it
      b.translate(x, Math.min(mazeFloor(x, z), mazeFloor(x - Math.cos(a) * w * 0.5, z + Math.sin(a) * w * 0.5)) + h / 2 - 0.3, z);
      parts.push(b);
    };
    for (const arc of ARCS) {
      const len = (arc.a1 - arc.a0) * arc.r;
      if (arc.porous) {
        // pillars: 0.85 m wide, 0.32 m apart (a slit you can see through, not walk through), a
        // capstone along the top every few
        const n = Math.max(2, Math.round(len / 1.17));
        for (let i = 0; i <= n; i++) {
          const a = arc.a0 + (i / n) * (arc.a1 - arc.a0);
          const [x, z] = polar(a, arc.r);
          const h = arc.h * (0.9 + 0.2 * R());
          block(x, z, a, 0.85, h + 0.3, 0.6);
        }
        // a lintel spanning pairs of pillars here and there (not all: the ruin of an older order)
        for (let i = 0; i < n; i += 3) {
          if (R() < 0.35) continue;
          const a = arc.a0 + ((i + 0.5) / n) * (arc.a1 - arc.a0);
          const [x, z] = polar(a, arc.r);
          const b = stoneBlock(2.1, 0.32, 0.72, seed++);
          b.rotateY(a);
          b.translate(x, mazeFloor(x, z) + arc.h * 1.02 + 0.16, z);
          parts.push(b);
        }
      } else {
        // a wall of blocks in two courses, the joints staggered; its top a little uneven
        const n = Math.max(2, Math.round(len / 1.5));
        for (let i = 0; i < n; i++) {
          const a = arc.a0 + ((i + 0.5) / n) * (arc.a1 - arc.a0);
          const [x, z] = polar(a, arc.r);
          const h = arc.h * (0.94 + 0.12 * R());
          block(x, z, a, len / n + 0.03, h + 0.3, 0.62);
        }
      }
    }
    for (const c of CROSS) {
      const len = c.r1 - c.r0;
      const n = Math.max(2, Math.round(len / 1.5));
      for (let i = 0; i < n; i++) {
        const r = c.r0 + ((i + 0.5) / n) * len;
        const [x, z] = polar(c.a, r);
        block(x, z, c.a + Math.PI / 2, len / n + 0.03, c.h * (0.94 + 0.12 * R()) + 0.3, 0.6);
      }
    }
    const m = landStone("sandstone_blocks_08", 0, 2.4, [0.55, 0.54, 0.66], { course: 0.55, block: 1.2, trim: { base: 0.35 } });
    const mesh = new THREE.Mesh(merge(parts), m);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(mesh.geometry, m);
  }

  // the four beacons: soft columns of light at the cardinal points of the outer corridor, each
  // rising from a low stone ring (warm at the south where you began, cool at the north)
  {
    const geo = new THREE.CylinderGeometry(0.28, 0.42, 14, 16, 1, true);
    geo.translate(0, 7, 0);
    const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const y = positionGeometry.y.div(14);
    const core = pow(abs(T.dot(T.normalView, vec3(0, 0, 1))), 2);
    const rise = sin(y.mul(9).sub(t.mul(0.7))).mul(0.15).add(0.85);
    m.colorNode = vec4(mix(vec3(0.5, 0.62, 1), vec3(1, 0.84, 0.56), y.oneMinus()).mul(core).mul(smoothstep(0, 0.08, y)).mul(smoothstep(1, 0.3, y)).mul(rise).mul(0.38), 1);
    const ring: THREE.BufferGeometry[] = [];
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const [x, z] = polar(a + 0.06, 44);
      const beam = new THREE.Mesh(geo, m);
      beam.position.set(x, mazeFloor(x, z), z);
      g.add(beam);
      for (let k = 0; k < 8; k++) {
        const b = stoneBlock(0.5, 0.26, 0.32, 300 + k);
        const aa = (k / 8) * Math.PI * 2;
        b.rotateY(aa);
        b.translate(x + Math.sin(aa) * 0.75, mazeFloor(x, z) + 0.1, z + Math.cos(aa) * 0.75);
        ring.push(b);
      }
    }
    const rm = landStone("sandstone_cracks", 0, 1.2, [0.6, 0.58, 0.66]);
    const rings = passable(new THREE.Mesh(merge(ring), rm));
    g.add(rings);
    ours.push(geo, m, rings.geometry, rm);
  }

  // the steles: dark stone carved with lines of gold writing, both faces; each turned toward the centre
  const read = new Set<string>();
  try {
    for (const id of JSON.parse(localStorage.getItem(READ_KEY) || "[]") as string[]) read.add(id);
  } catch {
    /* none read yet */
  }
  const stele: { id: string; reading: Reading; local: THREE.Vector3; lit: typeof uCalm; near: typeof uCalm }[] = [];
  {
    const stone = landStone("sandstone_cracks", 0, 1.4, [0.42, 0.42, 0.55]);
    const parts: THREE.BufferGeometry[] = [];
    const face = new THREE.PlaneGeometry(0.62, 1.25);
    ours.push(face);
    NOTES.forEach((n, i) => {
      const [x, z] = n.at;
      const y = mazeFloor(x, z);
      const turn = Math.atan2(-x, -z); // its face toward the centre
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
      const lit = uniform(read.has(id) ? 1 : 0), near = uniform(0);
      // the writing: rows of short strokes, worn in places, gold warming as you come near
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      const q = uv();
      const row = fract(q.y.mul(11)), rowId = T.floor(q.y.mul(11));
      const cell = fract(q.x.mul(7).add(sin(rowId.mul(7.1)).mul(3)));
      const stroke = smoothstep(0.38, 0.48, row).mul(smoothstep(0.66, 0.56, row)).mul(T.step(0.16, cell)).mul(T.step(cell, 0.84));
      const worn = T.step(0.22, fract(sin(rowId.mul(12.9).add(T.floor(q.x.mul(7)).mul(4.1))).mul(437.5)));
      const frame = smoothstep(0.02, 0.06, q.x).mul(smoothstep(0.98, 0.94, q.x)).mul(smoothstep(0.02, 0.05, q.y)).mul(smoothstep(0.98, 0.95, q.y));
      const breathe = sin(t.mul(1.1).add(i)).mul(0.12).add(0.88);
      m.colorNode = vec4(vec3(1, 0.8, 0.46).mul(stroke.mul(worn).mul(frame)).mul(float(0.22).add(near.mul(0.6)).add(lit.mul(0.25))).mul(breathe), 1);
      for (const side of [1, -1]) {
        const plane = new THREE.Mesh(face, m);
        plane.position.set(x + Math.sin(turn) * 0.158 * side, y + 1.25, z + Math.cos(turn) * 0.158 * side);
        plane.rotation.y = turn + (side < 0 ? Math.PI : 0);
        g.add(plane);
      }
      ours.push(m);
      stele.push({
        id,
        reading: { id, title: n.title, pages: [n.text], look: "tablet", place: { x, z } },
        local: new V3(x, y + 1.25, z),
        lit,
        near,
      });
    });
    const mesh = new THREE.Mesh(merge(parts), stone);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(mesh.geometry, stone);
  }
  // each stele's thread of gold to the centre, along the ground: faint, and lit once it is read
  {
    for (const s of stele) {
      const pairs: number[] = [];
      const segs = 24;
      for (let k = 0; k < segs; k++) {
        const f0 = k / segs, f1 = (k + 1) / segs;
        const x0 = s.local.x * (1 - f0), z0 = s.local.z * (1 - f0), x1 = s.local.x * (1 - f1), z1 = s.local.z * (1 - f1);
        pairs.push(x0, mazeFloor(x0, z0) + 0.04, z0, x1, mazeFloor(x1, z1) + 0.04, z1);
      }
      const geo = ribbonGeometry(pairs);
      const along = positionGeometry.xz.length().div(s.local.clone().setY(0).length() + 0.01);
      const run = sin(along.mul(18).add(t.mul(1.6))).mul(0.3).add(0.7);
      const mat = ribbonMaterial(vec3(1, 0.82, 0.5).mul(float(0.05).add(s.lit.mul(0.4)).add(uCalm.mul(0.3))).mul(run), 1.2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      g.add(mesh);
      ours.push(geo, mat);
    }
  }

  // the still centre: a round seat of stone, and above it three tilted rings of gold turning
  const centreY = mazeFloor(0, 0);
  {
    const sg = new THREE.CylinderGeometry(0.72, 0.84, 0.46, 28);
    const sm = landStone("sandstone_cracks", 0, 1.1, [0.7, 0.66, 0.74]);
    const seat = passable(new THREE.Mesh(sg, sm)); // walked onto: it sits you down
    seat.position.set(0, centreY + 0.23, 0);
    seat.castShadow = seat.receiveShadow = true;
    g.add(seat);
    ours.push(sg, sm);
    // a ring of gold set into the floor round it
    const fg = new THREE.RingGeometry(2.6, 2.75, 96);
    fg.rotateX(-Math.PI / 2);
    fg.translate(0, centreY + 0.03, 0);
    const fm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    fm.colorNode = vec4(vec3(1, 0.82, 0.5).mul(float(0.25).add(uCalm.mul(0.45))), 1);
    g.add(new THREE.Mesh(fg, fm));
    ours.push(fg, fm);
  }
  const astro = new THREE.Group();
  astro.position.set(0, centreY + 9, 0);
  g.add(astro);
  {
    const pairs: number[] = [];
    const segs = 96;
    const rings: [number, number][] = [[4.6, 0.35], [6.2, -0.42], [7.8, 0.18]];
    for (const [rad, tilt] of rings) {
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let k = 0; k < segs; k++) {
        const a0 = (k / segs) * Math.PI * 2, a1 = ((k + 1) / segs) * Math.PI * 2;
        const x0 = Math.cos(a0) * rad, z0 = Math.sin(a0) * rad, x1 = Math.cos(a1) * rad, z1 = Math.sin(a1) * rad;
        pairs.push(x0, z0 * st, z0 * ct, x1, z1 * st, z1 * ct);
      }
    }
    const geo = ribbonGeometry(pairs);
    const mat = ribbonMaterial(vec3(1, 0.86, 0.58).mul(float(0.5).add(uCalm.mul(0.5))), 1.1);
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
    const m = landStone("sandstone_blocks_08", 0, 2.2, [0.55, 0.54, 0.66], {});
    const mesh = new THREE.Mesh(merge(parts), m);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    ours.push(mesh.geometry, m);
    const cg = new THREE.PlaneGeometry(3.4, 4.1);
    cg.translate(ex, y + 2.05, ez);
    const cm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    const q = uv();
    const edge = smoothstep(0, 0.2, q.x).mul(smoothstep(1, 0.8, q.x)).mul(smoothstep(1, 0.6, q.y));
    cm.colorNode = vec4(mix(vec3(0.4, 0.45, 1), vec3(1, 0.85, 0.55), q.y).mul(edge).mul(sin(t.mul(0.5)).mul(0.15).add(0.85)).mul(0.22), 1);
    g.add(new THREE.Mesh(cg, cm));
    ours.push(cg, cm);
  }

  // motes drifting low over the maze, warming toward the centre
  {
    const n = 420;
    const c = pointCloud(n, 0.06);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 52;
      const [x, z] = polar(a, r);
      c.pos.set([x, mazeFloor(x, z) + 0.5 + R() * 6, z], i * 3);
      c.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    const drift = vec3(sin(t.mul(0.18).add(K.x.mul(12))), sin(t.mul(0.24).add(K.y.mul(7))).mul(0.6), cos(t.mul(0.15).add(K.z.mul(9))));
    c.material.positionNode = c.cloud.nodes.position.add(drift);
    const pulse = sin(t.mul(1.3).add(K.w.mul(30))).mul(0.35).add(0.65);
    c.material.colorNode = vec4(vec3(1, 0.86, 0.6).mul(c.round).mul(pulse).mul(float(0.35).add(uCalm.mul(0.35))), 1);
    g.add(c.cloud.sprite);
    ours.push(c.material);
  }

  const local = new V3();
  const world = new V3();
  let seated = false;
  let welcomed = false;
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
      whisper("From the still centre, every path is seen as one. Stay as long as you wish; moving stands you up.", 7000);
    },
    onStand() {
      seated = false;
    },
    holdsMovement: () => false,
    /** What the view turns to in contemplation: the centre's turning rings, then the beacons. */
    centre: () => new V3(0, centreY + 6, 0),
    steles: () =>
      stele.map((s) => ({ reading: s.reading, pos: world.copy(s.local).add(g.position).clone() })),
    markRead(id: string) {
      const s = stele.find((q) => q.id === id);
      if (!s) return;
      s.lit.value = 1;
      read.add(id);
      try {
        localStorage.setItem(READ_KEY, JSON.stringify([...read]));
      } catch {
        /* fine */
      }
    },
    update(dt: number) {
      clock.tick(dt);
      local.copy(gpuUniforms.player.value as THREE.Vector3).sub(g.position);
      uNear.value.copy(local);
      uCalm.value = damp(uCalm.value as number, seated ? 1 : 0, 0.8, dt);
      astro.rotation.y += dt * (0.05 + 0.04 * (uCalm.value as number));
      astro.children[0].rotation.x = Math.sin(clock.u.value * 0.07) * 0.08;
      for (const s of stele) {
        const d = Math.hypot(local.x - s.local.x, local.z - s.local.z);
        s.near.value = damp(s.near.value as number, d < 7 ? 1 - Math.max(0, d - 2) / 5 : 0, 2, dt);
      }
      if (!welcomed) {
        welcomed = true;
        whisper("The mind's maze. Wander; touch a stele to read it; the centre is always in sight.", 6500);
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

/** The maze's air: a deep indigo night, a low warm glow, a little haze so the far floor fades. */
export const MAZE_AIR: Air = {
  color: new THREE.Color(0.03, 0.032, 0.07),
  glow: new THREE.Color(0.34, 0.26, 0.18),
  glowDir: new THREE.Vector3(0.5, 0.05, -0.8),
  density: 0.0075,
  shadow: new THREE.Color(0.004, 0.008, 0.03),
  sat: 1.04,
  contrast: 1.06,
};
