/* The long descent (the owner's brief and its visual treatment, prompts/opus-wanderer-area-prompt.md
   and opus-wanderer-visual-design.md): the wanderer's own story, walked in the clouds high above
   the world. One path, no gates; the angel of the world after the veil walks it again, here as the
   wanderer's own higher self, close by, and speaks the seven recordings (Aria) at their places.
   The air itself carries the arc: the game's own moods (world/moods.ts, the real sky), forced here
   scene by scene: golden, twilight, dusk draining to grey, night, the deep, dawn, sunrise.
   1 the council: a great circle of twelve pale beams leaning in, three gold rings turning overhead,
     a ground of warm gold, threads joining all of it; the guide waits beside you;
   2 the descent: a ramp of cloud-stone spiralling down past three bands: slow-turning crystals (the
     fifth), lamps whose light runs along them in a wave (the fourth, the singing), then the lamps
     spacing out and the colour going (the thinning);
   3 the veil: thick grey air, cloud drifting through it, small memories (a ring of presences, a name
     in lines of light, a small sun) drifting past and dissolving; your own light dims; at the far
     edge the guide stops, one arm raised, and does not follow;
   4 the life: no centre, no rings, no guide; rain, dark earth, one streetlamp; small warm memories
     along the way (a bright white room, a great hand round a small one, a birthday candle, an empty
     chair) that fade as you come to them; houses dark on the horizon;
   5 the ache: a long road under the deepest sky, one region of it warm and too much like home, a
     silent light crossing far overhead now and then; the lamps return, and the guide walks beside you;
   6 the remembering: dawn; a book floating open, pages of light; a pale stranger who raises a hand
     and is gone; three seconds when everything stops; the still pool, the sky in it and your
     reflection gold; threads joining you and the guide again;
   7 the radiating: an overlook above a sleeping city; rings of warm light going out from you toward
     it, one every twelve seconds, the city warming a little with each; the guide's light and yours
     meeting and parting; far off, the council's ripples, waiting.
   Frame: the room's own, the start at the origin facing −z. */
import * as THREE from "three/webgpu";
import { T, gpuUniforms, vnoise, type N } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { cloudSheet, damp, keepAlpha, pointCloud, roomClock, roomPos, seeded, strands, touch } from "../densities/roomKit";
import { etchedStone } from "../../world/etching";
import { fogUniforms, gradeUniforms } from "../../gpu/tsl";
import { skyUniforms } from "../../world/sky";
import { moodForce } from "../../world/moods";
import { GlassFolk } from "../glassFolk";
import { Angel } from "../afterVeil/angel";
import type { Narration } from "../../core/narration";
import type { Room, Solid } from "../journey";
import { MOBILE } from "../../core/quality";
import { buildLand, type LandPath } from "./land";

const { abs, cameraPosition, exp, float, fract, length, max, mix, normalize, positionWorld, pow, sin, smoothstep, step, uniform, uv, vec2, vec3, vec4 } = T;
const V3 = THREE.Vector3;

export const WANDERER_TRACK = (n: number): string => `audio/wanderer-area/wanderer-cine-${n}.mp3`;

/* ---------------------------------------------------------------- the path and its heights */
type P3 = [number, number, number]; // x, z, height of the way there
const HIGH = 40;
const PTS: P3[] = [[0, 6, HIGH], [0, -12, HIGH], [0, -28, HIGH]];
// the descent: a ramp spiralling outward and down about (0, −64), never over itself
{
  const cx = 0, cz = -64;
  for (let k = 1; k <= 26; k++) {
    const u = k / 26, a = -Math.PI / 2 - u * Math.PI * 2.4, r = 36 * 0 + 34 - u * 0 + 4 + u * 22;
    PTS.push([cx + Math.cos(a) * r * 0.62 + u * 6, cz + Math.sin(a) * r * 0.62 - u * 20, HIGH - u * 18]);
  }
}
{
  const [lx, lz] = PTS[PTS.length - 1];
  const step: [number, number, number][] = [
    [8, -26, 21], [14, -56, 20], [18, -84, 19], // the veil
    [16, -110, 16], [10, -138, 14], [4, -166, 13], [0, -194, 12], // the life
    [-4, -226, 12], [-6, -262, 12], [-4, -298, 12], // the ache
    [2, -322, 12.5], [10, -344, 13], [20, -362, 13], // the remembering, the pool
    [30, -378, 16], [36, -394, 20], [40, -410, 24], // the climb
    [40, -424, 25], [30, -432, 25], [16, -436, 24], [2, -436, 23], // the overlook, and the way back
  ];
  for (const [dx, dz, h] of step) PTS.push([lx + dx, lz + dz, h]);
}
const SEG: { ax: number; az: number; ah: number; dx: number; dz: number; dh: number; len: number; s0: number }[] = [];
{
  let s = 0;
  for (let i = 0; i < PTS.length - 1; i++) {
    const [ax, az, ah] = PTS[i], [bx, bz, bh] = PTS[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    SEG.push({ ax, az, ah, dx: (bx - ax) / len, dz: (bz - az) / len, dh: (bh - ah) / len, len, s0: s });
    s += len;
  }
}
const LEN = SEG[SEG.length - 1].s0 + SEG[SEG.length - 1].len;
function onPath(x: number, z: number): { s: number; d: number; px: number; pz: number; h: number } {
  let best = { s: 0, d: Infinity, px: 0, pz: 0, h: HIGH };
  for (const g of SEG) {
    const u = Math.max(0, Math.min(g.len, (x - g.ax) * g.dx + (z - g.az) * g.dz));
    const px = g.ax + g.dx * u, pz = g.az + g.dz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < Math.abs(best.d)) {
      const side = (x - px) * -g.dz + (z - pz) * g.dx;
      best = { s: g.s0 + u, d: side >= 0 ? d : -d, px, pz, h: g.ah + g.dh * u };
    }
  }
  return best;
}
function along(s: number): [number, number, number] {
  s = Math.max(0, Math.min(LEN, s));
  for (const g of SEG) if (s <= g.s0 + g.len) return [g.ax + g.dx * (s - g.s0), g.az + g.dz * (s - g.s0), g.ah + g.dh * (s - g.s0)];
  const g = SEG[SEG.length - 1];
  return [g.ax + g.dx * g.len, g.az + g.dz * g.len, g.ah + g.dh * g.len];
}
/** The way's length at the nearest point to (x, z). */
const sAt = (x: number, z: number) => onPath(x, z).s;

/** Where the places are (room frame). */
const COUNCIL = new V3(0, HIGH, -12);
const SPIRAL_END = PTS[3 + 25];
const S_SPIRAL0 = sAt(0, -28), S_SPIRAL1 = sAt(SPIRAL_END[0], SPIRAL_END[1]);
const at = (i: number) => PTS[3 + 26 + i]; // the points after the spiral, as listed above
const S_VEIL0 = S_SPIRAL1, S_VEIL1 = sAt(at(2)[0], at(2)[1]);
const S_LIFE1 = sAt(at(6)[0], at(6)[1]);
const S_ACHE1 = sAt(at(9)[0], at(9)[1]);
const POOL = new V3(at(11)[0] + 6, 0, at(11)[1] - 4);
POOL.y = at(11)[2];
const S_POOL = sAt(at(11)[0], at(11)[1]);
const OVERLOOK = new V3(at(16)[0], at(16)[2], at(16)[1]);
const S_OVER = sAt(at(16)[0], at(16)[1]);
const CITY_Y = 3; // a dark land risen just above the cloud sea, its lights seen from the overlook
export const WANDERER_EXIT = { x: at(19)[0], z: at(19)[1] };

/** Beats 1–7 begin as you reach these points of the way. */
const BEATS = [
  { n: 1, s: sAt(0, -8) },
  { n: 2, s: S_SPIRAL0 + (S_SPIRAL1 - S_SPIRAL0) * 0.45 },
  { n: 3, s: S_VEIL0 + 10 },
  { n: 4, s: S_VEIL1 + 22 },
  { n: 5, s: S_LIFE1 + 14 },
  { n: 6, s: S_POOL - 6 },
  { n: 7, s: S_OVER - 2 },
];
/** The guide stops at the veil's far edge, and rejoins you on the road. */
const S_FAREWELL = S_VEIL1 - 2;
const S_REJOIN = BEATS[4].s - 10;

/** The ground: the height of the way, wherever you are on it. */
export function wandererFloor(x: number, z: number): number {
  const o = onPath(x, z);
  // a little roll of cloud underfoot, nothing more
  return o.h + Math.sin(x * 0.21 + z * 0.13) * 0.06;
}
export function wandererConfine(p: { x: number; z: number }): void {
  const o = onPath(p.x, p.z);
  const wide = Math.hypot(p.x - COUNCIL.x, p.z - COUNCIL.z) < 15 ? 13 : Math.hypot(p.x - POOL.x, p.z - POOL.z) < 14 ? 11 : o.s > S_VEIL0 && o.s < S_VEIL1 ? 8 : 3.2;
  if (Math.abs(o.d) > wide) {
    const k = wide / Math.abs(o.d);
    p.x = o.px + (p.x - o.px) * k;
    p.z = o.pz + (p.z - o.pz) * k;
  }
}

/** The moods along the way, by name (world/moods.ts MOOD_NAMES), at points of the way. */
const MOOD_AT: { s: number; w: Partial<Record<string, number>> }[] = [
  { s: 0, w: { golden: 1 } },
  { s: S_SPIRAL0 + 8, w: { golden: 1 } },
  { s: S_SPIRAL0 + (S_SPIRAL1 - S_SPIRAL0) * 0.5, w: { twilight: 1 } },
  { s: S_VEIL0 + 6, w: { dusk: 1 } },
  { s: S_VEIL1, w: { dusk: 0.4, night: 0.6 } },
  { s: S_VEIL1 + 18, w: { night: 1 } },
  { s: S_LIFE1, w: { night: 1 } },
  { s: S_LIFE1 + 24, w: { deep: 1 } },
  { s: S_ACHE1 - 10, w: { deep: 1 } },
  { s: S_POOL - 14, w: { dawn: 1 } },
  { s: S_POOL + 30, w: { dawn: 1 } },
  { s: S_OVER - 18, w: { sunrise: 1 } },
  { s: LEN, w: { sunrise: 1 } },
];
const NAMES = ["night", "sunrise", "sunset", "deep", "twilight", "golden", "dusk", "ember", "dawn"];
const moodNow = NAMES.map(() => 0);
function moodsAt(s: number): number[] {
  let i = 0;
  while (i < MOOD_AT.length - 2 && s > MOOD_AT[i + 1].s) i++;
  const a = MOOD_AT[i], b = MOOD_AT[i + 1];
  let k = Math.min(1, Math.max(0, (s - a.s) / Math.max(1, b.s - a.s)));
  k = k * k * (3 - 2 * k);
  NAMES.forEach((n, j) => (moodNow[j] = (a.w[n] ?? 0) * (1 - k) + (b.w[n] ?? 0) * k));
  return moodNow;
}

/* ---------------------------------------------------------------- the area */
export function createLongDescent(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): Room {
  const g = new THREE.Group();
  g.name = "lesson:long-descent";
  scene.add(g);
  const ours: { dispose(): void }[] = [];
  const R = seeded(9917);
  const clock = roomClock();
  const t = clock.u;
  const fewer = MOBILE ? 0.7 : 1;
  const solids: Solid[] = [];
  const windows: [THREE.Object3D, number, number][] = [];
  const tickers: ((dt: number) => void)[] = [];
  const uProg = uniform(0);
  const uCity = uniform(0); // the city warming, ring by ring
  const uLamps = uniform(1); // the singing lamps (they stutter and stop at the veil)
  const uWake = uniform(0); // the remembering: light returning to everything

  /* ---------------- the way: a band of cloud-stone, the council's floor, the pool's rim ---------------- */
  {
    const pos: number[] = [], idx: number[] = [];
    const W = 3.4;
    let n = 0;
    for (let s = 0; s <= LEN; s += 0.8) {
      const [x, z, h] = along(s);
      const [x2, z2] = along(s + 0.8);
      const dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      // the band widens where the places open
      const w = s > S_VEIL0 && s < S_VEIL1 ? W + 4 : W;
      pos.push(x + nx * w, h - 0.05, z + nz * w, x - nx * w, h - 0.05, z - nz * w);
      if (n) idx.push((n - 1) * 2, (n - 1) * 2 + 1, n * 2, (n - 1) * 2 + 1, n * 2 + 1, n * 2);
      n++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = etchedStone("#1c1a2c", "#e9c37d", 2.2);
    m.side = THREE.DoubleSide; // where it crosses over the ramp below, a bridge seen from beneath
    const band = new THREE.Mesh(geo, m);
    band.receiveShadow = true;
    g.add(band);
    ours.push(geo, m);
    // (it used to hang on a band of soft cloud points; it is cut into the land now: land.ts)
    // the council's floor, and its gold
    const disc = new THREE.CylinderGeometry(15, 13.5, 1.2, 72, 1);
    disc.translate(COUNCIL.x, HIGH - 0.65, COUNCIL.z);
    const dm = new THREE.Mesh(disc, m);
    dm.receiveShadow = true;
    g.add(dm);
    ours.push(disc);
  }

  /* ---------------- the land the way is cut into (land.ts) ---------------- */
  {
    const k = (a: number, b: number, s: number) => Math.min(1, Math.max(0, (s - a) / (b - a)));
    // the arc in the ground's own colour: warm stone high, grey in the veil, dark earth in the
    // life, the deep's blue in the ache, green coming back at dawn, gold-lit rock at the overlook
    const STOPS: [number, [number, number, number]][] = [
      [0, [1.12, 0.96, 0.78]],
      [S_SPIRAL1 - 10, [1.0, 0.86, 0.74]],
      [S_VEIL0 + 10, [0.66, 0.66, 0.7]],
      [S_VEIL1 + 6, [0.5, 0.46, 0.42]],
      [S_LIFE1 + 10, [0.46, 0.5, 0.62]],
      [S_ACHE1, [0.48, 0.54, 0.7]],
      [S_POOL - 10, [0.82, 0.98, 0.72]],
      [S_POOL + 26, [0.92, 1.0, 0.76]],
      [S_OVER - 10, [1.12, 0.94, 0.76]],
      [LEN, [1.12, 0.94, 0.76]],
    ];
    const path: LandPath = {
      onPath,
      along,
      len: LEN,
      wide: (x, z, s) => (Math.hypot(x - COUNCIL.x, z - COUNCIL.z) < 16 ? 14 : Math.hypot(x - POOL.x, z - POOL.z) < 15 ? 12 : s > S_VEIL0 && s < S_VEIL1 ? 8.5 : 3.6),
      tint: (s) => {
        let i = 0;
        while (i < STOPS.length - 2 && s > STOPS[i + 1][0]) i++;
        const [a, ca] = STOPS[i], [b, cb] = STOPS[i + 1];
        const u = k(a, b, s);
        return [ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u];
      },
      carve: (x, z, outside) => {
        // the lower way wins: where the ramp passes under the way it came by, the upper way
        // crosses as a bridge of its own stone (its band) over the cut
        void outside;
        let lim = Infinity;
        for (const sg of SEG) {
          const u = Math.max(0, Math.min(sg.len, (x - sg.ax) * sg.dx + (z - sg.az) * sg.dz));
          const px = sg.ax + sg.dx * u, pz = sg.az + sg.dz * u, d = Math.hypot(x - px, z - pz);
          lim = Math.min(lim, sg.ah + sg.dh * u - 0.12 + Math.max(0, d - 4.2) * 0.5);
        }
        return lim;
      },
      // high in the air the land falls away fast; the country rolls; the overlook is a cliff edge
      steep: (s) => Math.max(1 - k(S_VEIL1 - 4, S_VEIL1 + 24, s), k(S_POOL + 24, S_OVER - 6, s)),
    };
    const land = buildLand(path, { x: 0, z: -64, top: 0, r: 30 }, seeded(4471), t, fewer);
    for (const o of land.objects) g.add(o);
    solids.push(...land.solids);
    ours.push(land);
  }

  /* ---------------- the cloud sea below, curving away; nothing beneath it ---------------- */
  {
    const sea = cloudSheet(2400, 4, t, (_q, cover) => mix(skyUniforms.uMid.mul(0.6), skyUniforms.uHor.add(skyUniforms.uSunCol.mul(skyUniforms.uSunK.mul(0.3))), cover.mul(0.7)).mul(cover.mul(0.7).add(0.3)), { scale: 0.006, cover: [0.25, 0.85], opacity: 0.9, drift: [0.6, 0.3] });
    sea.mesh.position.set(0, 0, -220);
    g.add(sea.mesh);
    ours.push(sea);
  }

  /* ---------------- 1 the council ---------------- */
  {
    // twelve tall pale beams leaning in, breathing
    const beam = new THREE.CylinderGeometry(0.55, 0.8, 22, 18, 1, true);
    beam.translate(0, 11, 0);
    const bm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false }));
    const core = pow(abs(T.dot(T.normalView, vec3(0, 0, 1))), 3);
    const breath = sin(t.mul(0.5).add(T.positionWorld.x.mul(0.3))).mul(0.25).add(0.75);
    const ends = smoothstep(0, 2, T.positionGeometry.y).mul(smoothstep(22, 12, T.positionGeometry.y));
    bm.colorNode = vec4(vec3(0.72, 0.82, 1.0).mul(core).mul(ends).mul(breath).mul(0.32).mul(smoothstep(2, 7, length(cameraPosition.sub(positionWorld)))), 1);
    ours.push(beam, bm);
    const tops: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const m = new THREE.Mesh(beam, bm);
      m.position.set(COUNCIL.x + Math.sin(a) * 12, HIGH, COUNCIL.z + Math.cos(a) * 12);
      m.rotation.set(Math.cos(a) * -0.14, 0, Math.sin(a) * 0.14); // leaning in
      g.add(m);
      windows.push([m, -1, S_SPIRAL1]);
      solids.push({ x: m.position.x, z: m.position.z, r: 0.8, h: 22 });
      tops.push(new V3(COUNCIL.x + Math.sin(a) * 10.5, HIGH + 9, COUNCIL.z + Math.cos(a) * 10.5));
    }
    // three gold rings overhead, turning on long periods
    const rm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    rm.colorNode = vec4(vec3(1, 0.84, 0.3).mul(0.55), 1);
    const rings: THREE.Mesh[] = [];
    for (const [r, y] of [[7, 17], [5, 20], [3.2, 22.5]] as const) {
      const tg = new THREE.TorusGeometry(r, 0.035, 6, 128);
      const m = new THREE.Mesh(tg, rm);
      m.position.set(COUNCIL.x, HIGH + y, COUNCIL.z);
      g.add(m);
      rings.push(m);
      windows.push([m, -1, S_SPIRAL1]);
      ours.push(tg);
    }
    ours.push(rm);
    tickers.push(() => {
      const tt = clock.u.value as number;
      rings.forEach((m, i) => m.rotation.set(Math.PI / 2 + Math.sin(tt * 0.04 + i) * 0.35, (tt * 2 * Math.PI) / (25 + i * 4), Math.cos(tt * 0.05 + i * 2) * 0.3));
    });
    // the ground of gold under the circle
    const gd = new THREE.CircleGeometry(9, 64);
    gd.rotateX(-Math.PI / 2);
    gd.translate(COUNCIL.x, HIGH + 0.02, COUNCIL.z);
    const gm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const r0 = length(uv().sub(0.5)).mul(2);
    gm.colorNode = vec4(vec3(1, 0.82, 0.45).mul(exp(r0.mul(r0).mul(-3))).mul(sin(t.mul(0.35)).mul(0.1).add(0.9)).mul(0.22), 1);
    const gmesh = new THREE.Mesh(gd, gm);
    g.add(gmesh);
    windows.push([gmesh, -1, S_SPIRAL1]);
    ours.push(gd, gm);
    // threads joining the beams to one another and to the heart of the circle
    const segs: number[] = [];
    tops.forEach((a, i) => {
      const b = tops[(i + 1) % 12], c = tops[(i + 5) % 12];
      segs.push(a.x, a.y, a.z, b.x, b.y, b.z, a.x, a.y, a.z, c.x, c.y, c.z, a.x, a.y, a.z, COUNCIL.x, HIGH + 1.2, COUNCIL.z);
    });
    const th = ribbonGeometry(segs);
    const pulse = pow(sin(T.positionGeometry.y.mul(0.5).sub(t.mul(1.1)).add(T.positionGeometry.x.mul(0.2))).mul(0.5).add(0.5), 5);
    const tm = keepAlpha(ribbonMaterial(vec3(1, 0.86, 0.55).mul(pulse.mul(0.4).add(0.08)), 0.45));
    const tmesh = new THREE.Mesh(th, tm);
    tmesh.frustumCulled = false;
    g.add(tmesh);
    windows.push([tmesh, -1, S_SPIRAL1]);
    ours.push(th, tm);
  }

  /* ---------------- 2 the descent: crystals, the singing lamps, the thinning ---------------- */
  const lampList: { x: number; y: number; z: number; s: number }[] = [];
  {
    // the fifth: slow-turning prisms of cold clear light over the first turn; a few rise
    const n = Math.round(46 * fewer);
    const geo = new THREE.OctahedronGeometry(0.5, 0);
    geo.scale(0.5, 1.6, 0.5);
    const m = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.35, 0.42, 0.7), roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, flatShading: true });
    m.emissiveNode = vec3(0.45, 0.55, 1.0).mul(pow(float(1).sub(abs(T.dot(T.normalView, vec3(0, 0, 1)))), 2)).mul(0.6);
    const inst = new THREE.InstancedMesh(geo, m, n);
    const crys: { p: THREE.Vector3; a: number; w: number; rise: number }[] = [];
    for (let i = 0; i < n; i++) {
      const s = S_SPIRAL0 + R() * (S_SPIRAL1 - S_SPIRAL0) * 0.35;
      const [x, z, h] = along(s);
      const side = R() < 0.5 ? -1 : 1;
      const o = onPath(x, z);
      void o;
      const [x2, z2] = along(s + 1);
      const dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1;
      crys.push({ p: new V3(x + (-dz / l) * side * (4.5 + R() * 6), h + 0.8 + R() * 5, z + (dx / l) * side * (4.5 + R() * 6)), a: R() * 6, w: 0.1 + R() * 0.2, rise: R() < 0.2 ? 0.4 + R() * 0.4 : 0 });
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Sc = new V3(1, 1, 1), Pp = new V3();
    tickers.push((dt) => {
      crys.forEach((c, i) => {
        c.a += c.w * dt;
        Pp.copy(c.p);
        if (c.rise) Pp.y += ((((clock.u.value as number) * c.rise + i) % 14));
        Q.setFromEuler(E.set(0.2, c.a, 0.1));
        inst.setMatrixAt(i, M.compose(Pp, Q, Sc));
      });
      inst.instanceMatrix.needsUpdate = true;
    });
    g.add(inst);
    windows.push([inst, S_SPIRAL0 - 40, S_VEIL0 + 10]);
    ours.push(geo, m);
    // the lamps along the ramp's edge: near together, then spacing out as the colour goes
    let s = S_SPIRAL0 + 4;
    while (s < S_VEIL0 + 16) {
      const [x, z, h] = along(s);
      const [x2, z2] = along(s + 1);
      const dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1;
      lampList.push({ x: x + (-dz / l) * 3.6, y: h, z: z + (dx / l) * 3.6, s });
      s += 4 + Math.max(0, (s - (S_SPIRAL0 + (S_SPIRAL1 - S_SPIRAL0) * 0.6))) * 0.12;
    }
  }
  // (the road's own sparse lamps in the ache, and one lone streetlamp in the life)
  const lonePost = along(S_VEIL1 + 40);
  for (let s = S_LIFE1 + 18; s < S_ACHE1; s += 14) {
    const [x, z, h] = along(s);
    lampList.push({ x: x + 3.8, y: h, z, s });
  }
  {
    const n = lampList.length;
    const L = pointCloud(n * 2, 0.32);
    lampList.forEach((l, i) => {
      L.pos.set([l.x, l.y + 1.1, l.z], i * 6);
      L.pos.set([l.x, l.y + 1.1, l.z], i * 6 + 3);
      L.k.set([i, l.s, 0, 0], i * 8);
      L.k.set([i, l.s, 1, 0], i * 8 + 4);
    });
    touch(L.cloud);
    const K = L.cloud.nodes.aK;
    // the singing: a wave of brightness running along the lamps (i·0.6 behind each other)
    const wave = sin(t.mul(2).sub(K.x.mul(0.6))).mul(0.5).add(0.5);
    const singing = mix(float(1), wave.mul(0.8).add(0.2), smoothstep(S_SPIRAL0 + 30, S_SPIRAL0 + 60, K.y)).mul(uLamps.max(step(S_LIFE1, K.y)));
    // the thinning: further down, dimmer and greyer
    const thin = smoothstep(S_SPIRAL1 - 30, S_VEIL0 + 10, K.y);
    const road = step(S_LIFE1, K.y);
    const halo = K.z; // 0 the flame, 1 its soft halo
    L.material.sizeNode = mix(float(1), float(5), halo).mul(L.material.size);
    const col = mix(vec3(1, 0.9, 0.62), vec3(0.75, 0.74, 0.7), thin.mul(float(1).sub(road)));
    L.material.colorNode = vec4(col.mul(L.round).mul(mix(float(1), float(0.12), halo)).mul(singing).mul(mix(float(1), float(0.45), road)).mul(float(1).sub(thin.mul(0.4))), 1);
    g.add(L.cloud.sprite);
    ours.push(L.material);
    // their posts
    const pg = new THREE.CylinderGeometry(0.035, 0.05, 1.1, 6);
    pg.translate(0, 0.55, 0);
    const pm = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.08, 0.075, 0.1), roughness: 0.6, metalness: 0.4 });
    const posts = new THREE.InstancedMesh(pg, pm, n + 1);
    lampList.forEach((l, i) => posts.setMatrixAt(i, new THREE.Matrix4().makeTranslation(l.x, l.y, l.z)));
    // the lone streetlamp of the life: taller
    posts.setMatrixAt(n, new THREE.Matrix4().compose(new V3(lonePost[0] + 3, lonePost[2], lonePost[1]), new THREE.Quaternion(), new V3(1.6, 3.6, 1.6)));
    g.add(posts);
    ours.push(pg, pm);
    const lone = pointCloud(2, 0.5);
    lone.pos.set([lonePost[0] + 3, lonePost[2] + 4, lonePost[1], lonePost[0] + 3, lonePost[2] + 4, lonePost[1]], 0);
    lone.k.set([0, 0, 0, 0, 1, 0, 0, 0], 0);
    touch(lone.cloud);
    lone.material.sizeNode = mix(float(1), float(9), lone.cloud.nodes.aK.x).mul(lone.material.size);
    lone.material.colorNode = vec4(vec3(1, 0.88, 0.6).mul(lone.round).mul(mix(float(1), float(0.08), lone.cloud.nodes.aK.x)), 1);
    g.add(lone.cloud.sprite);
    ours.push(lone.material);
  }

  /* ---------------- 3 the veil: drifting cloud, memories dissolving ---------------- */
  {
    const n = Math.round(160 * fewer);
    const c = pointCloud(n, 9);
    for (let i = 0; i < n; i++) {
      const s = S_VEIL0 - 10 + R() * (S_VEIL1 - S_VEIL0 + 40);
      const [x, z, h] = along(s);
      c.pos.set([x + (R() - 0.5) * 30, h + 0.5 + R() * 4, z + (R() - 0.5) * 16], i * 3);
      c.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    // drifting sideways, slowly; recoiling a little from you, then closing in
    const P = c.cloud.nodes.position.add(vec3(sin(t.mul(0.04).add(K.x.mul(20))).mul(4).add(fract(t.mul(0.01).add(K.y)).mul(6).sub(3)), 0, 0));
    const toMe = P.sub(gpuUniforms.player.sub(vec3(g.position.x, 0, 0)));
    const recoil = normalize(toMe.add(vec3(0.001, 0, 0))).mul(smoothstep(6, 1, length(toMe)).mul(1.5));
    c.material.positionNode = P.add(recoil);
    c.material.colorNode = vec4(vec3(0.42, 0.43, 0.48).mul(c.round).mul(0.1).mul(smoothstep(2.5, 8, length(cameraPosition.sub(positionWorld)))), 1);
    g.add(c.cloud.sprite);
    windows.push([c.cloud.sprite, S_VEIL0 - 30, S_VEIL1 + 40]);
    ours.push(c.material);
  }
  // the memories: a ring of presences, a name written in light, a small sun; drifting toward you
  // through the mist and dissolving as it takes them
  const memories: { mesh: THREE.Mesh; base: THREE.Vector3; ph: number }[] = [];
  const uDis: N[] = [];
  {
    const shapes: number[][] = [];
    const circle = (cx: number, cy: number, r: number, out: number[], n = 20) => {
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
        out.push(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, 0, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, 0);
      }
    };
    { // a ring of presences
      const o: number[] = [];
      for (let i = 0; i < 9; i++) circle(Math.cos((i / 9) * Math.PI * 2) * 0.55, Math.sin((i / 9) * Math.PI * 2) * 0.55, 0.09, o, 10);
      shapes.push(o);
    }
    { // a name, in lines of light (no letters: the hand of it)
      const o: number[] = [];
      let x = -0.7;
      for (let k = 0; k < 7; k++) {
        const pts: [number, number][] = [];
        for (let j = 0; j <= 8; j++) pts.push([x + j * 0.022, Math.sin(j * 1.3 + k * 2) * 0.12 + (j === 4 ? 0.1 : 0)]);
        for (let j = 0; j < pts.length - 1; j++) o.push(pts[j][0], pts[j][1], 0, pts[j + 1][0], pts[j + 1][1], 0);
        x += 0.21;
      }
      shapes.push(o);
    }
    { // a small sun
      const o: number[] = [];
      circle(0, 0, 0.22, o, 24);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        o.push(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0, Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0);
      }
      shapes.push(o);
    }
    for (let i = 0; i < 9; i++) {
      const geo = ribbonGeometry(shapes[i % 3]);
      const u = uniform(0);
      uDis.push(u);
      // dissolving: the light breaks up from its edges as the mist takes it (a noise held against
      // a rising threshold, the way the bark thins near the lens)
      const PG = T.positionGeometry;
      const crumb = smoothstep(u.sub(0.08), u, vnoise(PG.xy.mul(9).add(float(i * 7))));
      const mat = keepAlpha(ribbonMaterial(vec3(1, 0.86, 0.6).mul(crumb).mul(0.75), 0.6));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      const s = S_VEIL0 + 6 + (i / 9) * (S_VEIL1 - S_VEIL0 - 8);
      const [x, z, h] = along(s);
      const base = new V3(x + (i % 2 ? 2.4 : -2.4), h + 1.6 + (i % 3) * 0.3, z);
      mesh.position.copy(base);
      mesh.scale.setScalar(1.6);
      g.add(mesh);
      windows.push([mesh, S_VEIL0 - 20, S_VEIL1 + 10]);
      memories.push({ mesh, base, ph: R() * 6 });
      ours.push(geo, mat);
    }
  }

  /* ---------------- 4 the life: rain, dark earth, warm memories that won't hold still ---------------- */
  {
    // rain, colder and quicker than snow, falling across the way
    const n = Math.round(1400 * fewer);
    const c = pointCloud(n, 0.05);
    for (let i = 0; i < n; i++) {
      const s = S_VEIL1 + R() * (S_LIFE1 - S_VEIL1 + 30);
      const [x, z, h] = along(s);
      c.pos.set([x + (R() - 0.5) * 26, h, z + (R() - 0.5) * 22], i * 3);
      c.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    const fall = fract(K.x.add(t.mul(float(0.55).add(K.y.mul(0.2)))));
    c.material.positionNode = c.cloud.nodes.position.add(vec3(fall.mul(-0.6), float(9).sub(fall.mul(9)), 0));
    c.material.colorNode = vec4(vec3(0.3, 0.38, 0.8).mul(c.round).mul(0.5).mul(smoothstep(1.5, 5, length(cameraPosition.sub(positionWorld)))), 1);
    g.add(c.cloud.sprite);
    windows.push([c.cloud.sprite, S_VEIL1 - 10, S_LIFE1 + 40]);
    ours.push(c.material);
    // the tableaux: small dioramas in lines of warm light beside the way
    const tableaux: [number, number[]][] = [];
    const box = (o: number[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      const P = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) o.push(...P[a], ...P[b]);
    };
    const hand = (o: number[], s: number, ox: number, oy: number) => {
      // a palm and four fingers and a thumb, open, in outline
      const pts: [number, number][] = [[0, 0], [0.5, 0], [0.55, 0.5], [0.62, 1.15], [0.52, 1.2], [0.45, 0.62], [0.4, 1.3], [0.3, 1.32], [0.27, 0.66], [0.2, 1.25], [0.1, 1.22], [0.12, 0.6], [0.02, 1.05], [-0.06, 1.0], [-0.02, 0.45], [-0.3, 0.62], [-0.34, 0.55], [0, 0]];
      for (let k = 0; k < pts.length - 1; k++) o.push(ox + pts[k][0] * s, oy + pts[k][1] * s, 0, ox + pts[k + 1][0] * s, oy + pts[k + 1][1] * s, 0);
    };
    { // a hospital-bright white room: a box of light, a bed in it
      const o: number[] = [];
      box(o, -1.1, 0, -0.8, 1.1, 1.8, 0.8);
      box(o, -0.7, 0.35, -0.35, 0.7, 0.55, 0.35);
      tableaux.push([S_VEIL1 + 30, o]);
    }
    { // a giant hand round a small one
      const o: number[] = [];
      hand(o, 1.1, -0.3, 0.3);
      hand(o, 0.32, 0.05, 0.7);
      tableaux.push([S_VEIL1 + 52, o]);
    }
    { // a birthday candle: a small cake, one candle, its flame
      const o: number[] = [];
      for (const y of [0.5, 0.75]) for (let k = 0; k < 24; k++) {
        const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2;
        o.push(Math.cos(a0) * 0.5, y, Math.sin(a0) * 0.5, Math.cos(a1) * 0.5, y, Math.sin(a1) * 0.5);
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        o.push(Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0.75, Math.sin(a) * 0.5);
      }
      o.push(0, 0.75, 0, 0, 1.05, 0, 0, 1.12, 0, 0.03, 1.2, 0, 0.03, 1.2, 0, 0, 1.3, 0, 0, 1.3, 0, -0.03, 1.2, 0, -0.03, 1.2, 0, 0, 1.12, 0);
      tableaux.push([S_VEIL1 + 76, o]);
    }
    { // an empty chair
      const o: number[] = [];
      box(o, -0.3, 0.45, -0.3, 0.3, 0.5, 0.3);
      for (const [x, z] of [[-0.28, -0.28], [0.28, -0.28], [0.28, 0.28], [-0.28, 0.28]]) o.push(x, 0, z, x, 0.45, z);
      o.push(-0.28, 0.5, -0.28, -0.28, 1.15, -0.28, 0.28, 0.5, -0.28, 0.28, 1.15, -0.28, -0.28, 1.15, -0.28, 0.28, 1.15, -0.28, -0.28, 0.85, -0.28, 0.28, 0.85, -0.28);
      tableaux.push([S_VEIL1 + 98, o]);
    }
    tableaux.forEach(([s, segs], i) => {
      const geo = ribbonGeometry(segs);
      const [x, z, h] = along(s);
      const side = i % 2 ? 1 : -1;
      const p = new V3(x + side * 4.6, h, z);
      // memories that won't hold still: they fade as you come to them
      const toMe = length(positionWorld.sub(gpuUniforms.player));
      const mat = keepAlpha(ribbonMaterial(vec3(1, 0.8, 0.52).mul(0.75).mul(smoothstep(2.5, 9, toMe)).mul(sin(t.mul(0.7).add(float(i))).mul(0.12).add(0.88)), 0.6));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(p);
      mesh.rotation.y = side > 0 ? -0.6 : 0.6;
      mesh.scale.setScalar(1.25);
      mesh.frustumCulled = false;
      g.add(mesh);
      windows.push([mesh, S_VEIL1 - 10, S_LIFE1 + 30]);
      ours.push(geo, mat);
      // a soft warm glow where each stands (a memory's light)
      const glow = pointCloud(1, 4.5);
      glow.pos.set([p.x, p.y + 0.9, p.z], 0);
      touch(glow.cloud);
      glow.material.colorNode = vec4(vec3(1, 0.72, 0.4).mul(glow.round).mul(0.1).mul(smoothstep(2.5, 9, toMe)), 1);
      g.add(glow.cloud.sprite);
      windows.push([glow.cloud.sprite, S_VEIL1 - 10, S_LIFE1 + 30]);
      ours.push(glow.material);
    });
    // houses dark on the horizon, a window or two lit
    const hp: number[] = [];
    const hg = new THREE.BoxGeometry(1, 1, 1);
    const hm = new THREE.MeshBasicNodeMaterial({ fog: true });
    hm.colorNode = vec4(0.012, 0.012, 0.022, 1);
    const houses = new THREE.InstancedMesh(hg, hm, 22);
    for (let i = 0; i < 22; i++) {
      const s = S_VEIL1 + 10 + R() * (S_LIFE1 - S_VEIL1);
      const [x, z, h] = along(s);
      const side = R() < 0.5 ? -1 : 1;
      const w = 4 + R() * 5, hh = 3 + R() * 4;
      const px = x + side * (40 + R() * 30), pz = z + (R() - 0.5) * 20;
      houses.setMatrixAt(i, new THREE.Matrix4().compose(new V3(px, h + hh / 2 - 1, pz), new THREE.Quaternion(), new V3(w, hh, w * 0.8)));
      if (R() < 0.5) hp.push(px - side * w * 0.42, h + hh * 0.55, pz);
    }
    g.add(houses);
    windows.push([houses, S_VEIL1 - 10, S_LIFE1 + 40]);
    ours.push(hg, hm);
    const win = pointCloud(hp.length / 3, 0.5);
    win.pos.set(hp, 0);
    touch(win.cloud);
    win.material.colorNode = vec4(vec3(1, 0.7, 0.35).mul(win.round).mul(0.5), 1);
    g.add(win.cloud.sprite);
    windows.push([win.cloud.sprite, S_VEIL1 - 10, S_LIFE1 + 40]);
    ours.push(win.material);
  }

  /* ---------------- 5 the ache: the warm region of sky, a light crossing ---------------- */
  {
    const n = 7;
    const c = pointCloud(n, 60);
    const home = new V3(-120, 140, -460);
    for (let i = 0; i < n; i++) {
      c.pos.set([home.x + (R() - 0.5) * 40, home.y + (R() - 0.5) * 30, home.z + (R() - 0.5) * 30], i * 3);
      c.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    c.material.sizeNode = float(0.6).add(K.x.mul(0.8)).mul(c.material.size);
    c.material.colorNode = vec4(vec3(1.0, 0.7, 0.88).mul(c.round).mul(float(0.05).add(K.y.mul(0.05))).mul(sin(t.mul(0.1).add(K.z.mul(10))).mul(0.15).add(0.85)), 1);
    g.add(c.cloud.sprite);
    windows.push([c.cloud.sprite, S_LIFE1 - 10, S_ACHE1 + 40]);
    ours.push(c.material);
    // a dense heart of points in it, slightly too complex
    const m = Math.round(600 * fewer);
    const d = pointCloud(m, 1.6);
    for (let i = 0; i < m; i++) {
      const r = Math.pow(R(), 2) * 26, a = R() * Math.PI * 2, b = (R() - 0.5) * Math.PI;
      d.pos.set([home.x + Math.cos(a) * Math.cos(b) * r, home.y + Math.sin(b) * r * 0.6, home.z + Math.sin(a) * Math.cos(b) * r], i * 3);
      d.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(d.cloud);
    const DK = d.cloud.nodes.aK;
    d.material.colorNode = vec4(mix(vec3(1, 0.78, 0.6), vec3(1, 0.65, 0.9), DK.x).mul(d.round).mul(sin(t.mul(float(0.5).add(DK.y))).mul(0.3).add(0.7)).mul(0.6), 1);
    g.add(d.cloud.sprite);
    windows.push([d.cloud.sprite, S_LIFE1 - 10, S_ACHE1 + 40]);
    ours.push(d.material);
    // now and then a small silent light crossing far overhead
    const w = pointCloud(2, 1.2);
    w.pos.set([0, 0, 0, 0, 0, 0], 0);
    w.k.set([0, 0, 0, 0, 1, 0, 0, 0], 0);
    touch(w.cloud);
    const cross = fract(t.mul(1 / 46));
    const [ax, az] = along(S_LIFE1 + 30);
    const path0 = vec3(ax - 260, 120, az - 160), path1 = vec3(ax + 260, 150, az - 220);
    w.material.positionNode = mix(path0, path1, cross).add(w.cloud.nodes.position).add(vec3(w.cloud.nodes.aK.x.mul(-3), 0, 0));
    w.material.colorNode = vec4(vec3(0.95, 0.95, 1).mul(w.round).mul(smoothstep(0, 0.1, cross).mul(smoothstep(1, 0.9, cross))).mul(mix(float(1), float(0.3), w.cloud.nodes.aK.x)), 1);
    w.cloud.sprite.frustumCulled = false;
    g.add(w.cloud.sprite);
    windows.push([w.cloud.sprite, S_LIFE1 - 10, S_ACHE1 + 20]);
    ours.push(w.material);
  }

  /* ---------------- 6 the remembering: the book, the stranger, the still pool ---------------- */
  const stranger = new GlassFolk([{ x: 0, z: 0, face: 0, act: "reach", tint: new THREE.Color(0.85, 0.9, 1.0), glow: { inner: 0.8, edge: 1.1, body: 0.6 } }], 77);
  const S_STRANGER = S_ACHE1 + 8;
  {
    const [sx, sz, sh] = along(S_STRANGER + 6);
    stranger.group.position.set(sx + 3.2, sh, sz);
    stranger.group.rotation.y = Math.PI / 2;
    g.add(stranger.group);
    // the book: two pages open, lines of light written on them (unreadable), floating
    const segs: number[] = [];
    for (const side of [-1, 1]) {
      const page = (x0: number) => {
        const P = [[x0, 0, 0], [x0 + side * 0.62, 0.06, 0], [x0 + side * 0.62, 0.06, 0.86], [x0, 0, 0.86]];
        for (let k = 0; k < 4; k++) segs.push(...P[k], ...P[(k + 1) % 4]);
        for (let r = 0; r < 9; r++) {
          const z = 0.1 + r * 0.075;
          let x = x0 + side * 0.06;
          while (Math.abs(x - x0) < 0.56) {
            const w2 = 0.03 + R() * 0.09;
            segs.push(x, 0.02, z, x + side * w2, 0.02 + Math.abs(x - x0) * 0.08, z);
            x += side * (w2 + 0.025);
          }
        }
      };
      page(0);
    }
    const bg = ribbonGeometry(segs);
    const bmat = keepAlpha(ribbonMaterial(vec3(1, 0.9, 0.7).mul(0.6), 0.55));
    const book = new THREE.Mesh(bg, bmat);
    book.frustumCulled = false;
    const [bx, bz, bh] = along(S_ACHE1 + 2);
    book.position.set(bx - 2.2, bh + 1.4, bz);
    book.rotation.set(-0.5, 0.4, 0);
    book.scale.setScalar(1.5);
    g.add(book);
    windows.push([book, S_ACHE1 - 40, S_POOL + 30]);
    ours.push(bg, bmat);
    tickers.push(() => {
      const tt = clock.u.value as number;
      book.position.y = bh + 1.4 + Math.sin(tt * 0.6) * 0.08;
      book.rotation.y = 0.4 + Math.sin(tt * 0.2) * 0.1;
    });
    // the still pool: water that holds only the sky, its rim of etched stone
    const pg = new THREE.CircleGeometry(7, 64);
    pg.rotateX(-Math.PI / 2);
    pg.translate(POOL.x, POOL.y + 0.05, POOL.z);
    const pm = new THREE.MeshBasicNodeMaterial({ fog: false });
    const view = normalize(positionWorld.sub(cameraPosition));
    const refl = vec3(view.x, view.y.negate(), view.z);
    const up = max(refl.y, 0);
    const skyCol = mix(skyUniforms.uHor, mix(skyUniforms.uMid, skyUniforms.uZen, smoothstep(0.25, 0.8, up)), smoothstep(0.0, 0.25, up));
    const sunGl = pow(max(T.dot(refl, normalize(skyUniforms.uSun)), 0), 80).mul(skyUniforms.uSunK);
    const ripple = vnoise(roomPos.xz.mul(1.6).add(vec2(t.mul(0.05), 0))).mul(0.04);
    pm.colorNode = vec4(skyCol.mul(0.85).add(skyUniforms.uSunCol.mul(sunGl)).add(ripple), 1);
    const pool = new THREE.Mesh(pg, pm);
    g.add(pool);
    windows.push([pool, S_ACHE1 - 30, 1e9]);
    ours.push(pg, pm);
    const rim = new THREE.TorusGeometry(7.15, 0.22, 6, 72);
    rim.rotateX(Math.PI / 2);
    rim.translate(POOL.x, POOL.y + 0.04, POOL.z);
    const rmat = etchedStone("#1c1a2c", "#e9c37d", 2.2);
    g.add(new THREE.Mesh(rim, rmat));
    ours.push(rim, rmat);
    solids.push({ x: POOL.x, z: POOL.z, r: 6.4, h: 0.3 });
  }
  // your reflection in it, luminous: a gold light under the water where you would be mirrored
  const mirror = pointCloud(2, 1.6);
  {
    mirror.pos.set([0, 0, 0, 0, -0.9, 0], 0);
    mirror.k.set([0, 0, 0, 0, 1, 0, 0, 0], 0);
    touch(mirror.cloud);
    const uMe = uniform(new V3());
    const near = length(uMe.xz.sub(vec2(POOL.x, POOL.z)));
    mirror.material.positionNode = vec3(uMe.x, POOL.y - 0.6, uMe.z.add(1.6)).add(mirror.cloud.nodes.position);
    mirror.material.colorNode = vec4(vec3(1, 0.8, 0.42).mul(mirror.round).mul(smoothstep(11, 6, near)).mul(uWake.mul(0.6).add(0.2)).mul(0.5), 1);
    mirror.cloud.sprite.frustumCulled = false;
    g.add(mirror.cloud.sprite);
    windows.push([mirror.cloud.sprite, S_ACHE1 - 10, S_OVER]);
    ours.push(mirror.material);
    tickers.push(() => uMe.value.copy(local));
  }

  /* ---------------- 7 the radiating: the sleeping city, the rings, the council far off ---------------- */
  const ringMeshes: THREE.Mesh[] = [];
  const ringU: { k: N & { value: number } }[] = [];
  {
    const n = Math.round(2400 * fewer);
    const c = pointCloud(n, 1.4);
    const cx = OVERLOOK.x, cz = OVERLOOK.z - 160;
    let i = 0;
    for (let k = 0; k < 14 && i < n; k++) {
      const ox = cx + (R() - 0.5) * 300, oz = cz + (R() - 0.5) * 200;
      const m = Math.round(n / 14);
      for (let j = 0; j < m && i < n; j++, i++) {
        const r = Math.pow(R(), 1.6) * (14 + R() * 26), a = R() * Math.PI * 2;
        c.pos.set([ox + Math.cos(a) * r, CITY_Y, oz + Math.sin(a) * r], i * 3);
        c.k.set([R(), R(), R(), R()], i * 4);
      }
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    c.material.colorNode = vec4(mix(vec3(1, 0.62, 0.28), vec3(1, 0.82, 0.5), K.x).mul(c.round).mul(float(0.35).add(uCity.mul(0.4))).mul(K.y.mul(0.5).add(0.5)), 1);
    g.add(c.cloud.sprite);
    windows.push([c.cloud.sprite, S_POOL, 1e9]);
    ours.push(c.material);
    // the dark plain they lie on
    const plain = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900), new THREE.MeshBasicNodeMaterial({ fog: true }));
    (plain.material as THREE.MeshBasicNodeMaterial).colorNode = vec4(0.006, 0.01, 0.03, 1);
    plain.rotation.x = -Math.PI / 2;
    plain.position.set(cx, CITY_Y - 0.5, cz - 100);
    g.add(plain);
    windows.push([plain, S_POOL, 1e9]);
    ours.push(plain.geometry, plain.material as THREE.Material);
    // the rings going out from you: grown, faded and let go, one every twelve seconds
    const tg = new THREE.TorusGeometry(1, 0.012, 4, 160);
    tg.rotateX(Math.PI / 2);
    for (let k = 0; k < 5; k++) {
      const u = uniform(0);
      const rm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      rm.colorNode = vec4(vec3(1, 0.85, 0.55).mul(smoothstep(0, 0.08, u)).mul(float(1).sub(u)).mul(0.9), 1);
      const m = new THREE.Mesh(tg, rm);
      m.visible = false;
      g.add(m);
      ringMeshes.push(m);
      ringU.push({ k: u as unknown as N & { value: number } });
      ours.push(rm);
    }
    ours.push(tg);
    // the council far off on the horizon: faint concentric ripples, waiting
    const segs: number[] = [];
    for (let r = 1; r <= 4; r++) {
      for (let k = 0; k < 64; k++) {
        const a0 = (k / 64) * Math.PI * 2, a1 = ((k + 1) / 64) * Math.PI * 2;
        segs.push(Math.cos(a0) * r * 9, 0, Math.sin(a0) * r * 9, Math.cos(a1) * r * 9, 0, Math.sin(a1) * r * 9);
      }
    }
    const cg = ribbonGeometry(segs);
    const cm = keepAlpha(ribbonMaterial(vec3(1, 0.88, 0.6).mul(sin(t.mul(0.3).sub(length(T.positionGeometry.xz).mul(0.2))).mul(0.3).add(0.4)).mul(0.35), 0.5));
    const council = new THREE.Mesh(cg, cm);
    council.position.set(OVERLOOK.x - 120, 90, OVERLOOK.z - 520);
    council.frustumCulled = false;
    g.add(council);
    windows.push([council, S_POOL, 1e9]);
    ours.push(cg, cm);
  }

  /* ---------------- the guide: your own higher self ---------------- */
  const [ax0, az0] = along(4);
  const angel = new Angel(ax0 + 1.3, HIGH, az0 - 1, 0);
  g.add(angel.root);
  // threads between you and the guide, reconnecting one by one in the remembering
  const tiePairs = [0, 1, 2, 3, 4].map(() => ({ a: new V3(), b: new V3(), lift: 0.3 }));
  const ties = strands(tiePairs, (U, K) => vec3(1, 0.84, 0.52).mul(pow(sin(U.mul(9).sub(t.mul(2)).add(K.mul(20))).mul(0.5).add(0.5), 3).mul(0.5).add(0.15)), 0.45);
  g.add(ties.mesh);
  ours.push(ties);
  const tieK = [0, 0, 0, 0, 0];

  const loaded = Promise.all([angel.loaded, stranger.loaded]).then(() => undefined);
  let beat = 0, speaking = false, spokeFor = 0, progress = 0;
  let stillFor = 0, stillDone = false;
  let ringT = 0, ringI = 0;
  let joined = false;
  const local = new V3();
  const forward = new V3();

  const room = {
    name: "longDescent",
    seatPos: null,
    seatHeading: 0,
    nearSeat: () => false,
    onSit: () => undefined,
    onStand: () => undefined,
    loaded,
    solids: () => solids,
    /** Your own light: dimmer through the veil and the life, gold again from the pool. */
    presence: (): number => {
      const s = progress;
      if (s < S_VEIL0) return 1;
      if (s < S_POOL - 4) return Math.max(0.5, 1 - (s - S_VEIL0) / 40);
      return Math.min(1, 0.5 + (s - (S_POOL - 4)) / 14);
    },
    centre: (): THREE.Vector3 => {
      const n = BEATS[Math.min(beat, BEATS.length - 1)].n;
      if (n === 1) return COUNCIL.clone().setY(HIGH + 6);
      if (n === 2) return angel.root.position.clone().add(new V3(0, 1.4, 0));
      if (n === 3) {
        const [x, z, h] = along(S_FAREWELL);
        return new V3(x, h + 1.5, z);
      }
      if (n === 4) {
        const [x, z, h] = along(progress + 10);
        return new V3(x, h + 1.2, z);
      }
      if (n === 5) return new V3(-120, 120, -460);
      if (n === 6) return POOL.clone().setY(POOL.y + 0.5);
      return new V3(OVERLOOK.x, CITY_Y + 2, OVERLOOK.z - 160);
    },
    update(dt: number) {
      // the three seconds of stillness: the scene's own clock stops (and so everything in it)
      const visitor = gpuUniforms.player.value as THREE.Vector3;
      local.copy(visitor).sub(g.position);
      const o = onPath(local.x, local.z);
      progress = Math.max(progress, o.s);
      uProg.value = progress;
      if (!stillDone && progress > S_STRANGER + 14) {
        stillFor += dt;
        if (stillFor > 3) stillDone = true;
      } else clock.tick(dt);
      const frozen = !stillDone && stillFor > 0;
      for (const tk of tickers) tk(frozen ? 0 : dt);
      // the air: the moods along the way (the real sky), and the veil's own thick grey
      moodForce.w = moodsAt(progress);
      const veil = THREE.MathUtils.smoothstep(progress, S_VEIL0, S_VEIL0 + 14) * (1 - THREE.MathUtils.smoothstep(progress, S_VEIL1 - 4, S_VEIL1 + 16));
      fogUniforms.density.value = THREE.MathUtils.lerp(fogUniforms.density.value, 0.15, veil);
      gradeUniforms.sat.value *= 1 - 0.55 * veil - 0.3 * THREE.MathUtils.smoothstep(progress, S_VEIL1, S_VEIL1 + 10) * (1 - THREE.MathUtils.smoothstep(progress, S_LIFE1, S_LIFE1 + 20));
      uLamps.value = damp(uLamps.value as number, progress > S_VEIL0 - 6 ? 0 : 1, 0.6, dt);
      uWake.value = damp(uWake.value as number, progress > S_POOL - 8 ? 1 : 0, 0.3, dt);
      // the memories in the mist: drifting toward you, dissolving as the mist takes them
      memories.forEach((m, i) => {
        const d = Math.hypot(local.x - m.base.x, local.z - m.base.z);
        (uDis[i] as unknown as { value: number }).value = THREE.MathUtils.clamp((14 - d) / 10, 0, 1.1);
        m.mesh.position.set(m.base.x + Math.sin(clock.u.value * 0.1 + m.ph) * 0.6, m.base.y + Math.sin(clock.u.value * 0.13 + m.ph) * 0.2, m.base.z);
        m.mesh.lookAt(visitor);
      });
      // the stranger raises a hand as you come, and dissolves after
      const sd = progress - S_STRANGER;
      stranger.group.visible = sd > -40 && sd < 18;
      stranger.group.scale.setScalar(THREE.MathUtils.clamp(1 - (sd - 8) / 6, 0.001, 1));
      if (!frozen) stranger.update(dt);
      // the rings going out from you toward the city, one every twelve seconds, from the climb on
      if (progress > S_OVER - 40) {
        ringT += frozen ? 0 : dt;
        if (ringT > 12) {
          ringT = 0;
          ringI = (ringI + 1) % ringMeshes.length;
          ringMeshes[ringI].position.copy(local).setY(local.y + 1);
          ringMeshes[ringI].userData.age = 0.001;
          ringMeshes[ringI].visible = true;
          uCity.value = Math.min(1, (uCity.value as number) + 0.08);
        }
        ringMeshes.forEach((m, k) => {
          const a = m.userData.age as number | undefined;
          if (!a) return;
          const age = a + dt / 18;
          m.userData.age = age >= 1 ? 0 : age;
          m.visible = age < 1;
          m.scale.setScalar(1 + age * 140);
          m.position.y = local.y + 1 - age * 60;
          ringU[k].k.value = age;
        });
      }
      // the guide
      if (beat < BEATS.length) {
        const b = BEATS[beat];
        if (!speaking && progress >= b.s - 2) {
          speaking = true;
          spokeFor = 0;
          void narration.play(WANDERER_TRACK(b.n));
        }
        if (speaking) {
          spokeFor += dt;
          if (spokeFor > 2 && !narration.progress()) {
            speaking = false;
            beat++;
          }
        }
      }
      const s = progress;
      angel.look = speaking ? local : null;
      if (s < S_FAREWELL - 6) {
        // close: beside you, a little ahead (shoulder to shoulder by the end of the descent)
        const [gx, gz] = along(Math.min(o.s + 2.2, LEN));
        angel.goal.set(gx + 1.3, 0, gz);
        angel.glow = s < S_SPIRAL1 ? 1 : 0.75;
      } else if (s < S_REJOIN) {
        // the veil: it stops at the far edge, one arm raised, and does not follow
        const [fx, fz] = along(S_FAREWELL);
        angel.goal.set(fx, 0, fz);
        if (Math.hypot(local.x - fx, local.z - fz) < 9 && s < S_FAREWELL + 4) angel.gesture(1);
        angel.look = local;
        angel.glow = 0.55;
        // beyond it, you go on alone: it is not there (look back: nothing)
        angel.root.visible = s < S_FAREWELL + 30;
      } else {
        // the ache on: it walks beside you, dimmer but warmer, brightening with the dawn
        if (!joined) {
          joined = true;
          const [jx, jz] = along(s - 6);
          angel.root.position.set(jx + 1.3, wandererFloor(jx, jz), jz);
          angel.appear();
        }
        angel.root.visible = true;
        const [gx, gz] = along(Math.min(o.s + 0.4, LEN));
        const [hx, hz] = along(Math.min(o.s + 1.4, LEN));
        forward.set(hx - gx, 0, hz - gz).normalize();
        angel.goal.set(gx - forward.z * 1.2, 0, gz + forward.x * 1.2);
        angel.glow = s < S_POOL - 10 ? 0.6 : Math.min(1.2, 0.6 + (s - (S_POOL - 10)) / 30);
        // the radiating's end: the two lights meet, then part
        if (beat >= BEATS.length && s > S_OVER - 4) {
          const meet = Math.sin(Math.min(1, (clock.u.value % 30) / 12) * Math.PI);
          angel.goal.lerp(new V3(local.x, 0, local.z), meet * 0.85);
        }
      }
      angel.update(dt, frozen ? 0 : (clock.u.value as number), wandererFloor, local, false);
      // the threads between you, reconnecting one by one at the pool
      const ap = angel.root.position;
      for (let k = 0; k < 5; k++) {
        tieK[k] = damp(tieK[k], s > S_POOL - 6 + k * 3 ? 1 : 0, 0.5, dt);
        const y = 0.9 + k * 0.18;
        tiePairs[k].a.set(local.x, local.y + y, local.z);
        // each grows from you toward the guide as it reconnects
        tiePairs[k].b.set(ap.x, ap.y + y, ap.z).lerp(tiePairs[k].a, 1 - tieK[k]);
      }
      ties.mesh.visible = tieK[0] > 0.01 && angel.root.visible;
      if (ties.mesh.visible) ties.write();
      for (const [m, a, b] of windows) m.visible = progress > a && progress < b;
    },
    dispose() {
      moodForce.w = null;
      g.parent?.remove(g);
      for (const x of ours) x.dispose();
    },
    /** Still frames: stand at beat `n`'s place as it is spoken (room frame: where to stand, where to look). */
    debugPlace(n: number): { at: THREE.Vector3; look: THREE.Vector3 } {
      const i = Math.max(0, BEATS.findIndex((b) => b.n === n));
      beat = i;
      speaking = true;
      spokeFor = -1e9;
      progress = BEATS[i].s + (n === 3 ? 30 : n === 7 ? 4 : 0);
      if (n >= 5) joined = false;
      if (n === 6 || n === 7) stillDone = true;
      uWake.value = n >= 6 ? 1 : 0;
      uLamps.value = n >= 3 ? 0 : 1;
      const [x, z, h] = along(progress);
      angel.root.position.set(x + 1.3, h, z - 1.5);
      return { at: new V3(x, h, z), look: room.centre() };
    },
  };
  void whisper;
  return room as unknown as Room;
}
