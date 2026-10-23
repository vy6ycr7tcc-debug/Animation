/* The open world: one analytic height function, so collision, the camera, the grass and the
   meshes all agree. Water level is y = 0; wherever the land dips below it, there is a lake.
   - Rolling hills, soft dunes and hollows that hold lakes.
   - A gentle meadow where the wanderer wakes.
   - Mountains rising far out, so the world has an edge you see but never reach, and five
     snow-capped massifs standing within it.
   The ground is streamed in square chunks around the wanderer. */
import * as THREE from "three/webgpu";
import { fogUniforms, T, type N } from "../gpu/tsl";
import { setWet, wetUniforms } from "../gpu/wet";
import { starDirection } from "./fog";
import { regionScans, REGION_LAYERS, surface } from "./textures";

export const WATER_Y = 0;
/** The world's radius: mountains rise at its edge, about 4 km out. */
export const WORLD_R = 4000;
/** Where the wanderer wakes, and faces. */
export const SPAWN = { x: 0, z: 0, heading: 0 };


/* ---------- noise ---------- */
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function vnoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, z: number): number {
  return vnoise(x, z) * 0.5 + vnoise(x * 2.03 + 17, z * 2.03 - 9) * 0.28 + vnoise(x * 4.1 - 5, z * 4.1 + 3) * 0.14 + vnoise(x * 8.3 + 11, z * 8.3 + 7) * 0.08;
}
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Rectangular level grounds (`levelRect`), declared first: `heightAt` reads them from the start. */
const RECTS: { x: number; z: number; h: number; c: number; s: number; hx: number; hz: number; blend: number; reach: number }[] = [];

/** Snow-capped mountains standing within the world (Samuel: "mountains with snow"), each a
    massif of ridges running down from its summit, well away from the archetypes' homes. */
export const PEAKS: { x: number; z: number; r: number; h: number }[] = [
  { x: 1650, z: -1550, r: 720, h: 330 },
  { x: -950, z: 1550, r: 640, h: 260 },
  { x: 2650, z: 650, r: 700, h: 300 },
  { x: -2650, z: -1600, r: 760, h: 380 },
  { x: 350, z: 2250, r: 620, h: 240 },
];
function peaks(x: number, z: number): number {
  let h = 0;
  for (const p of PEAKS) {
    const dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx) > p.r || Math.abs(dz) > p.r) continue;
    const d = Math.hypot(dx, dz) / p.r;
    if (d >= 1) continue;
    // a massif, not a cone: sharp ridges and gullies at three scales (ridged noise, each scale
    // cut into by the one above), secondary summits, crags, and a steeper upper third
    const rid = (n: number) => 1 - Math.abs(n * 2 - 1);
    const r1 = rid(vnoise(x * 0.0045 + p.x * 0.001, z * 0.0045));
    const r2 = rid(vnoise(x * 0.011 - 7, z * 0.011 + 3));
    const r3 = rid(vnoise(x * 0.027 + 11, z * 0.027 - 5));
    const ridged = r1 * r1 * 0.5 + r1 * r2 * r2 * 0.33 + r2 * r3 * 0.17;
    const ca = dx / (d * p.r + 1e-6), sa = dz / (d * p.r + 1e-6);
    const spur = 1 - Math.abs(vnoise(ca * 2.6 + p.x * 0.01, sa * 2.6 + d * 5) * 2 - 1);
    const t = 1 - d;
    const shape = Math.pow(t, 1.45) * (0.45 + 0.55 * ridged) * (0.8 + 0.3 * spur);
    h += p.h * shape * 1.15 + (vnoise(x * 0.06, z * 0.06) - 0.5) * 7 * t + (vnoise(x * 0.025, z * 0.025) - 0.5) * 12 * t;
    // eroded ridgelines up high: towers and notches along the crests (50 m and 15 m), so a summit
    // breaks the sky as rock does, never as a smooth cone
    const hi = Math.pow(t, 1.3) * (0.4 + 0.6 * ridged);
    h += (rid(vnoise(x * 0.021 + 3, z * 0.021 - 9)) - 0.55) * p.h * 0.075 * hi + (rid(vnoise(x * 0.068 - 5, z * 0.068 + 2)) - 0.55) * p.h * 0.022 * hi;
  }
  return h;
}

/** How far onto a massif (0 off it, 1 from about halfway up toward its summit): the regions' soils
    give way there to alpine ground, scree and rock. */
export function massifAt(x: number, z: number): number {
  let k = 0;
  for (const p of PEAKS) {
    const dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx) > p.r || Math.abs(dz) > p.r) continue;
    k = Math.max(k, smooth(0.95, 0.6, Math.hypot(dx, dz) / p.r));
  }
  return k;
}

function rawHeight(x: number, z: number): number {
  const n1 = fbm(x * 0.0035, z * 0.0035);
  const n2 = fbm(x * 0.012 + 31, z * 0.012 - 17);
  const n3 = vnoise(x * 0.07, z * 0.07);
  let h = (n1 - 0.43) * 40 + (n2 - 0.5) * 9 + (n3 - 0.5) * 0.9;
  // soft dunes on the higher ground
  const r = 1 - Math.abs(vnoise(x * 0.018 + 5, z * 0.018 - 3) * 2 - 1);
  h += r * r * 3.2 * smooth(0.42, 0.62, n1);
  // the waking meadow: a gentle rise beside the water
  const ds = Math.hypot(x - SPAWN.x, z - SPAWN.z);
  h = mix(h, 2.4 + (n2 - 0.5) * 1.6, smooth(70, 18, ds));
  // broad highlands and lowlands, a kilometre or two across, with great lakes between
  h += (fbm(x * 0.0005 + 3, z * 0.0005 - 7) - 0.5) * 36 * smooth(60, 250, ds);
  // mountains far out: the edge of the world; and the snowy massifs within it
  h += smooth(WORLD_R - 700, WORLD_R + 300, Math.hypot(x, z)) * (60 + n2 * 70);
  h += peaks(x, z);
  // deep water: the shallows by the shore stay gentle, and the lakes fall away to real depths
  if (h < 0) h *= 1 + 1.6 * smooth(0.5, 6, -h);
  return h;
}

/* ---------- regions: each direction from the shore its own country, under its own sky ----------
   The shore keeps its moonlit meadow; walking out, the land turns into the country of the sky
   above it (moods.ts): east frost tundra under the sunrise, north-east an autumn forest in the
   golden hour, north black volcanic ash under the deep night, north-west heather moor at dusk,
   west ochre dunes at sunset, south-west red rock in the ember light, south a deep green mossland
   in the blue hour, south-east pale chalk downs at the pink dawn. The borders wander (the bearing
   is bent by slow noise), and here and there a pocket of the home meadow remains. */
interface Region {
  dir: number; // bearing, radians (atan2(z, x): east 0, south +π/2, north −π/2)
  col: THREE.Color; // the ground's colour there
  sand: number; // how much of it is the sand scan
  rock: number; // how much the rock scan (outcrops, ash, chalk)
  trees: number; // tree density against the home meadow's
  leaf: number; // the leaves' hue there (−1: their own; 0.86 gold; 0.97 silvered)
}
const Q = Math.PI / 4;
const REGIONS: Region[] = [
  { dir: 0, col: new THREE.Color("#b4bfd6"), sand: 0.6, rock: 0.25, trees: 0.3, leaf: 0.97 }, // E tundra
  { dir: -Q, col: new THREE.Color("#a8582a"), sand: 0, rock: 0.08, trees: 1.9, leaf: 0.87 }, // NE autumn forest
  { dir: -2 * Q, col: new THREE.Color("#25252b"), sand: 0.15, rock: 0.85, trees: 0.08, leaf: 0.97 }, // N volcanic ash
  { dir: -3 * Q, col: new THREE.Color("#7c4a74"), sand: 0, rock: 0.2, trees: 0.45, leaf: -1 }, // NW heather moor
  { dir: 4 * Q, col: new THREE.Color("#c88a4c"), sand: 0.95, rock: 0.05, trees: 0.04, leaf: 0.87 }, // W ochre dunes
  { dir: 3 * Q, col: new THREE.Color("#b44a2c"), sand: 0.15, rock: 0.85, trees: 0.15, leaf: -1 }, // SW red rock
  { dir: 2 * Q, col: new THREE.Color("#4e8c3f"), sand: 0, rock: 0, trees: 1.5, leaf: -1 }, // S mossland
  { dir: Q, col: new THREE.Color("#e2dad2"), sand: 0.1, rock: 0.8, trees: 0.3, leaf: 0.97 }, // SE chalk downs
];
/** The blend of regions at a point: `away` (0 the home meadow … 1 wholly the regions), and the
    regions' own colour, scans, tree density and leaf hue mixed by weight. One shared result:
    read it before calling again. */
export const regionHere = { away: 0, col: new THREE.Color(), sand: 0, rock: 0, trees: 1, leaf: -1 };
const _rw = new Float64Array(REGIONS.length);
/** Each region's weight at a point into `out` (summing to 1), and how far out of the home meadow
    it is (the returned `away`, 0 … 1). */
function regionWeights(x: number, z: number, out: Float64Array): number {
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 140) return 0;
  // they change only over hundreds of metres: read from a lattice every 16 m (bilinear), each
  // corner reckoned once
  const fx = x / RG, fz = z / RG, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
  const a = rgCorner(ix, iz), b = rgCorner(ix + 1, iz), c = rgCorner(ix, iz + 1), d = rgCorner(ix + 1, iz + 1);
  const wa = (1 - u) * (1 - v), wb = u * (1 - v), wc = (1 - u) * v, wd = u * v;
  for (let i = 0; i < REGIONS.length; i++) out[i] = a[i + 1] * wa + b[i + 1] * wb + c[i + 1] * wc + d[i + 1] * wd;
  // the Nile's floodplain is green: the dunes give way to the meadow along it
  return (a[0] * wa + b[0] * wb + c[0] * wc + d[0] * wd) * (1 - nileGreen(x, z));
}
const RG = 16;
const rgCache = new Map<number, Float32Array>();
const _rc = new Float64Array(REGIONS.length);
function rgCorner(ix: number, iz: number): Float32Array {
  const key = (ix + 50000) * 100003 + (iz + 50000);
  let e = rgCache.get(key);
  if (!e) {
    if (rgCache.size > 60000) rgCache.clear();
    e = new Float32Array(REGIONS.length + 1);
    e[0] = regionExact(ix * RG, iz * RG, _rc);
    for (let i = 0; i < REGIONS.length; i++) e[i + 1] = _rc[i];
    rgCache.set(key, e);
  }
  return e;
}
function regionExact(x: number, z: number, out: Float64Array): number {
  out.fill(0);
  const dist = Math.hypot(x - SPAWN.x, z - SPAWN.z);
  if (dist < 160) return 0;
  // pockets of the home meadow remain out in the regions
  const pocket = smooth(0.64, 0.76, fbm(x * 0.0026 - 41, z * 0.0026 + 19));
  const away = smooth(160, 650, dist) * (1 - pocket * 0.75);
  if (away <= 0) return 0;
  const a = Math.atan2(z - SPAWN.z, x - SPAWN.x) + (fbm(x * 0.0011 + 5, z * 0.0011 - 8) - 0.5) * 1.1;
  let sum = 0;
  for (let i = 0; i < REGIONS.length; i++) sum += out[i] = smooth(0.62, 1, Math.cos(a - REGIONS[i].dir));
  for (let i = 0; i < REGIONS.length; i++) out[i] /= sum || 1;
  return away;
}
/** The region holding most sway at a point (0 E … 7 SE; −1 the home meadow) and how far out of
    the home meadow it is (0 … 1). */
const _ri = new Float64Array(8);
export function regionIndex(x: number, z: number): { i: number; away: number } {
  const away = regionWeights(x, z, _ri);
  if (away <= 0.05) return { i: -1, away };
  let best = 0;
  for (let i = 1; i < 8; i++) if (_ri[i] > _ri[best]) best = i;
  return { i: best, away };
}
export function regionAt(x: number, z: number): typeof regionHere {
  const r = regionHere;
  r.away = regionWeights(x, z, _rw);
  if (r.away <= 0) {
    r.col.setRGB(0, 0, 0), (r.sand = r.rock = 0), (r.trees = 1), (r.leaf = -1);
    return r;
  }
  r.col.setRGB(0, 0, 0), (r.sand = r.rock = r.trees = 0);
  let best = 0;
  for (let i = 0; i < REGIONS.length; i++) {
    const w = _rw[i], g = REGIONS[i];
    r.col.r += g.col.r * w, r.col.g += g.col.g * w, r.col.b += g.col.b * w;
    r.sand += g.sand * w, r.rock += g.rock * w, r.trees += g.trees * w;
    if (_rw[i] > _rw[best]) best = i;
  }
  r.leaf = REGIONS[best].leaf;
  return r;
}

/* ---------- the regions' landforms: shapes for the light to rake across ----------
   Each region has its own relief, laid over the land after the world's own sites are chosen (so
   nothing built moves), never on the shore, the shallows or under the water, and levelled again
   under every site's pad: frost polygons, kettle holes and pingos on the tundra; ravines cut
   through the autumn forest; lava ridges, craters and fissures in the ash; peat banks on the moor;
   sharp-crested dunes with slip faces; mesas and buttes in stepped red cliffs; sinkholes in the
   mossland; chalk scarps. Steep faces wear the cliff scan by themselves (the ground's shader). */
let reliefOn = false;
const _fw = new Float64Array(REGIONS.length);
const ridge = (n: number) => 1 - Math.abs(n * 2 - 1);
/** Cellular noise: the distance to the nearest feature point (f1), the gap to the second
    (edge, 0 on a cell's border), and the nearest point's own hash; cells `s` metres across. */
const _cell = { f1: 0, edge: 0, id: 0 };
function ihash(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function cellular(x: number, z: number, s: number, seed: number): typeof _cell {
  const fx = x / s, fz = z / s, ix = Math.floor(fx), iz = Math.floor(fz);
  let d1 = 81, d2 = 81, id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cz = iz + j;
      const ex = cx + 0.1 + ihash(cx, cz, seed) * 0.8 - fx, ez = cz + 0.1 + ihash(cx, cz, seed + 1) * 0.8 - fz;
      const d = ex * ex + ez * ez;
      if (d < d1) (d2 = d1), (d1 = d), (id = ihash(cx, cz, seed + 2));
      else if (d < d2) d2 = d;
    }
  const r1 = Math.sqrt(d1);
  _cell.f1 = r1, _cell.edge = Math.sqrt(d2) - r1, _cell.id = id;
  return _cell;
}
/** A bowl with a raised rim (craters, kettle holes, sinkholes): `f1` in cell units, `r` its radius. */
const bowl = (f1: number, r: number, depth: number, rim: number) =>
  f1 > r * 1.6 ? 0 : -depth * smooth(r, r * 0.25, f1) + rim * Math.exp(-(((f1 - r) / (r * 0.28)) ** 2));
function relief(x: number, z: number, h: number): number {
  const land = smooth(1.4, 4.5, h) * smooth(70, 30, h); // not on the shore, nor on the high massifs
  if (land <= 0) return 0;
  const away = regionWeights(x, z, _fw);
  if (away <= 0.02) return 0;
  let k = land * away;
  for (const c of CAVE_SITES) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < 70) k *= smooth(40, 70, d);
  }
  if (k <= 0) return 0;
  const w = _fw;
  let d = 0;
  // E: the tundra's frost polygons (shallow troughs along the cells' borders), kettle holes, pingos
  if (w[0] > 0.01) {
    let t = -0.8 * smooth(0.14, 0, cellular(x, z, 11, 3).edge);
    const c = cellular(x, z, 70, 7);
    t += c.id < 0.35 ? bowl(c.f1, 0.16 + c.id * 0.3, 3.2, 0.6) : c.id > 0.9 ? 6 * smooth(0.22, 0, c.f1) ** 1.5 : 0;
    d += t * w[0];
  }
  // NE: ravines cut through the forest floor, their banks steep, the land rolling between
  if (w[1] > 0.01) {
    const r = ridge(vnoise(x * 0.008 + 3, z * 0.008 - 6));
    const r2 = ridge(vnoise(x * 0.019 - 11, z * 0.019 + 2));
    d += (-6 * smooth(0.86, 0.985, r) - 2.5 * smooth(0.9, 0.99, r2) + (vnoise(x * 0.03, z * 0.03) - 0.5) * 2.5) * w[1];
  }
  // N: the ash: ropes of old lava standing in ridges, craters with raised rims, fissures
  if (w[2] > 0.01) {
    const f = ridge(fbm(x * 0.006 + 13, z * 0.006 - 21));
    let t = Math.pow(f, 4) * 7;
    const c = cellular(x, z, 90, 11);
    if (c.id < 0.55) t += bowl(c.f1, 0.12 + c.id * 0.35, 6, 2.2);
    t -= 2.2 * smooth(0.95, 0.995, ridge(vnoise(x * 0.016 - 4, z * 0.05 + 9)));
    d += t * w[2];
  }
  // NW: the moor's peat banks, a step a man's height, and hummocks
  if (w[3] > 0.01) {
    const b = fbm(x * 0.012 + 29, z * 0.012 - 3);
    d += (smooth(0.5, 0.515, b) * 1.8 + smooth(0.6, 0.615, b) * 1.4 + (vnoise(x * 0.18, z * 0.18) - 0.5) * 0.7) * w[3];
  }
  // W: dunes, sharp crested, a long windward slope and a short slip face, bending with the wind
  if (w[4] > 0.01) {
    const s = (x * 0.8 + z * 0.6) * 0.022 + fbm(x * 0.004 - 7, z * 0.004 + 1) * 3.5;
    const t = s - Math.floor(s);
    const prof = t < 0.78 ? smooth(0, 0.78, t) : smooth(1, 0.78, t);
    d += prof * (3 + 6 * fbm(x * 0.005 + 40, z * 0.005)) * w[4];
  }
  // SW: mesas and buttes of red rock, their sides broken into ledges (strata) by stepped cliffs
  if (w[5] > 0.01) {
    const m = fbm(x * 0.0045 + 77, z * 0.0045 - 31);
    let t = smooth(0.55, 0.575, m) * 16 + smooth(0.64, 0.66, m) * 10;
    const c = cellular(x, z, 120, 17);
    if (c.id > 0.75) t += 22 * smooth(0.13, 0.1, c.f1); // a lone butte
    // the strata: the land itself stepped into ledges, 3.2 m a step
    const H = h + t, f = H / 3.2, lo = Math.floor(f);
    t += ((lo + smooth(0.55, 0.9, f - lo)) * 3.2 - H) * 0.85;
    d += t * w[5];
  }
  // S: the mossland's soft hummocks, and sinkholes with steep green sides
  if (w[6] > 0.01) {
    const c = cellular(x, z, 60, 23);
    let t = (vnoise(x * 0.11, z * 0.11) - 0.5) * 1.2;
    if (c.id < 0.4) t += bowl(c.f1, 0.12 + c.id * 0.25, 5, 0.5);
    d += t * w[6];
  }
  // SE: chalk scarps: the downs rise gently and break off in a white face, twice over
  if (w[7] > 0.01) {
    const c = fbm(x * 0.003 - 9, z * 0.003 + 4);
    d += (smooth(0.5, 0.512, c) * 9 + smooth(0.58, 0.592, c) * 7 + Math.max(0, c - 0.5) * 30) * w[7];
  }
  // never into the water: a hollow stops a little above it
  return Math.max(d * k, Math.min(0, 1.1 - h));
}

/* ---------- water on the land: rivers, craters, waterfalls ----------
   Laid over the land with the regions' relief (after this module's sites are chosen), never in the
   home meadow by the shore, and levelled again under every site's pad. The world's water is one
   sheet at WATER_Y, so whatever is carved below it fills by itself:
   - rivers: an isoline of a slow, warped noise, measured in metres by the noise's own slope, so a
     channel keeps its width; a flat bed below the water in a valley whose sides open wider the
     higher the land it cuts (gorges in the uplands, gentle banks in the lowlands);
   - craters, here and there (one in every few 300 m cells): bowls with raised, torn rims; the deep
     ones hold a lake;
   - waterfalls (WATERFALLS, below): a raised shelf of land with a stream along it, breaking off
     in a cliff into a plunge pool. */
const RIV_F = 0.0008;
/** Value noise on the integer hash (cheaper than the sine hash; for the newer fields only, the
    world's older noise is left as it is so nothing that stands moves). */
function qnoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = ihash(xi, zi, 77), b = ihash(xi + 1, zi, 77), c = ihash(xi, zi + 1, 77), d = ihash(xi + 1, zi + 1, 77);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// two smooth octaves only (finer ones make the isoline break into many small loops), gently warped
const riverQ = (x: number, z: number) => {
  const wx = x * RIV_F + (qnoise(x * 0.004 + 3, z * 0.004) - 0.5) * 0.15, wz = z * RIV_F + (qnoise(x * 0.004, z * 0.004 - 7) - 0.5) * 0.15;
  return qnoise(wx, wz) * 0.72 + qnoise(wx * 2.03 + 17, wz * 2.03 - 9) * 0.28;
};
const RIVER_BED = -1.6;
const _ww = new Float64Array(8);
/** How far (m) from the nearest river's middle, or Infinity well away from any. Two families of
    rivers, each the isoline of its own field (the second the same field shifted far away). */
export function riverDist(x: number, z: number): number {
  return Math.min(riverOne(x, z), riverOne(x + 7300, z - 4100));
}
function riverOne(x: number, z: number): number {
  const q = riverQ(x, z) - 0.5;
  if (Math.abs(q) > 0.07) return Infinity;
  const g = Math.max(0.0011, Math.hypot(riverQ(x + 1, z) - 0.5 - q, riverQ(x, z + 1) - 0.5 - q));
  return Math.abs(q) / g;
}
function waterways(x: number, z: number, h: number): number {
  const ds = Math.hypot(x - SPAWN.x, z - SPAWN.z);
  if (ds < 220 || h < 0.4) return falls(x, z, h);
  let near = 1;
  for (const c of CAVE_SITES) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < 80) near *= smooth(45, 80, d);
  }
  let out = h;
  if (near > 0) {
    // craters
    const k = smooth(260, 420, ds) * smooth(1.2, 3, h) * smooth(55, 35, h) * near;
    if (k > 0) {
      const c = cellular(x, z, 300, 41);
      if (c.id < 0.14) {
        const r = 22 + (c.id / 0.14) * 55, f = c.f1 * 300;
        const torn = 1 + (qnoise(x * 0.05 + 7, z * 0.05) - 0.5) * 0.25;
        out += bowl(f * torn, r, r * 0.32, r * 0.1 * (0.6 + qnoise(x * 0.09, z * 0.09 + 5) * 0.8)) * k;
      }
    }
    // rivers
    // the dunes and the ash stay dry
    const dry = regionWeights(x, z, _ww) > 0 ? _ww[2] + _ww[4] : 0;
    const kr = smooth(220, 380, ds) * smooth(50, 32, out) * near * (1 - 0.95 * Math.min(1, dry));
    if (kr > 0) {
      const d = riverDist(x, z);
      if (d < 140) {
        const cw = 4 + qnoise(x * 0.01 + 31, z * 0.01) * 3.5;
        const vw = cw + 18 + Math.max(0, out) * 0.8;
        if (d < vw) {
          const target = RIVER_BED + (out - RIVER_BED) * Math.pow(smooth(cw * 0.7, vw, d), 1.25);
          out = out + (Math.min(out, target) - out) * kr;
        }
      }
    }
  }
  return falls(x, z, out);
}

/** The waterfalls. Each is a notch in an escarpment: the land raised `top` metres high upstream
    of the lip, rising gently from behind, a stream along it, and a cliff that curves forward on
    either side round a plunge pool below (an amphitheatre, as falls cut back into their cliffs).
    A tiered fall has a ledge at `mid` between two drops, with a pool of its own. `dx, dz` points
    downstream; `w` is the curtain's half-width at the lip; `sc` scales the height of land (the
    great falls stand on broader ground). */
export type FallKind = "single" | "ribbon" | "tiered" | "great";
export interface Fall { x: number; z: number; dx: number; dz: number; top: number; seed: number; w: number; mid: number; sc: number; kind: FallKind; rl: number; bend: number; reach: number }
export let WATERFALLS: Fall[] = [];
/* The river that feeds each fall (the owner: "rivers leading to those waterfalls"): it rises in a
   spring pool on a hill head `rl` metres upstream of the old spring, and runs down a long tongue of
   upland to the lip, its water falling `RIVER_GRADE` a metre, meandering, bending away by `bend`
   (the slope of its course at its head, chosen so it keeps to dry, open land). Its line is a curve
   of s (it never doubles back), so its distance is cheap: |u − u(s)| / √(1 + u′²). */
export const RIVER_GRADE = 0.03;
/** The river's middle across the fall's frame at s (and its slope du/ds). */
export function fallRiverU(f: Fall, s: number): { u: number; du: number } {
  const st = fallStream(f), m = st - s;
  if (m <= 0 || f.rl <= 0) return { u: 0, du: 0 };
  const t = m / f.rl;
  const A = 7 * f.sc, ramp = Math.min(1, m / 50);
  const ph = m * 0.042 + f.seed;
  // u grows as s falls, so du/ds is minus du/dm
  const u = f.bend * f.rl * 0.5 * t * t + Math.sin(ph) * A * ramp + Math.sin(m * 0.017 + f.seed * 2.3) * A * 0.6 * ramp;
  const dm = f.bend * t + Math.cos(ph) * 0.042 * A * ramp + (m < 50 ? (Math.sin(ph) * A) / 50 : 0) + Math.cos(m * 0.017 + f.seed * 2.3) * 0.017 * A * 0.6 * ramp;
  return { u, du: -dm };
}
/** The river's water level at s (level over the escarpment, rising upstream of the old spring). */
export const fallRiverY = (f: Fall, s: number) => f.top - 0.45 + RIVER_GRADE * Math.max(0, fallStream(f) - s);
/** Its half-width at s: as wide as the stream at the lip, narrowing toward the spring. */
export const fallRiverW = (f: Fall, s: number) => (f.w * 0.75 + 0.7) * (0.6 + 0.4 * smooth(fallSource(f), fallSource(f) + 70, s));
/** Where it rises (s of the spring pool). */
export const fallSource = (f: Fall) => fallStream(f) - f.rl;
/** A waterfall's frame: s along the stream (0 at the cliff's foot line, + downstream), u across. */
export const fallLocal = (f: Fall, x: number, z: number) => {
  const px = x - f.x, pz = z - f.z;
  return { s: px * f.dx + pz * f.dz, u: -px * f.dz + pz * f.dx };
};
export const FALL_LIP = -1.6, FALL_POOL = 10;
/** Where a fall's stream rises (its spring), and a tiered fall's upper cliff (its foot line). */
export const fallStream = (f: Fall) => -26 * f.sc;
export const fallLedge = (f: Fall) => -14 * f.sc;
/** A fall's drops, highest first: where the water leaves its lip (s), the water's height there,
    and the height of the water it falls into. */
export interface FallDrop { lip: number; from: number; to: number }
export function fallDrops(f: Fall): FallDrop[] {
  return f.mid > 0
    ? [{ lip: fallLedge(f) + FALL_LIP, from: f.top - 0.45, to: f.mid - 0.3 }, { lip: FALL_LIP, from: f.mid - 0.45, to: WATER_Y }]
    : [{ lip: FALL_LIP, from: f.top - 0.45, to: WATER_Y }];
}
function falls(x: number, z: number, h: number): number {
  for (const f of WATERFALLS) {
    if (Math.abs(x - f.x) > f.reach || Math.abs(z - f.z) > f.reach) continue;
    const { s, u } = fallLocal(f, x, z);
    // the river's upland first, then the escarpment, then the river's channel cut through both
    if (f.rl > 0) h = fallRiver(f, s, u, x, z, h, false);
    const R = 110 * f.sc;
    if (Math.abs(x - f.x) <= R && Math.abs(z - f.z) <= R) h = escarp(f, s, u, x, z, h);
    if (f.rl > 0) h = fallRiver(f, s, u, x, z, h, true);
  }
  return h;
}
/** The river that feeds a fall. Raising (`carve` false): a long tongue of upland carrying it, a
    little above its water and falling gently away to either side over ~55 m, and a hill head where
    it rises. Carving: its channel (half a metre deep, as wide as the stream at the lip) in a valley
    that opens wider where it cuts higher ground, and the spring pool at its head. */
function fallRiver(f: Fall, s: number, u: number, x: number, z: number, h: number, carve: boolean): number {
  const st = fallStream(f), sf = st - f.rl;
  if (s > st + 6 || s < sf - 90 * f.sc) return h;
  const yw = fallRiverY(f, s);
  const src = fallRiverU(f, sf);
  const dSrc = Math.hypot(s - sf, u - src.u);
  if (!carve) {
    if (s < st + 2) {
      const c = fallRiverU(f, Math.max(s, sf));
      const d = Math.abs(u - c.u) / Math.sqrt(1 + c.du * c.du);
      const rw = fallRiverW(f, Math.max(s, sf));
      const hw = 18 * f.sc + rw;
      const along = smooth(st + 2, st - 22, s) * smooth(sf - 40, sf - 4, s);
      // its sides fall away broad and lumpy, as a spur of the hills does
      const lump = (qnoise(x * 0.02 + f.seed, z * 0.02) - 0.5) * 26 + (qnoise(x * 0.008 - f.seed, z * 0.008 + 3) - 0.5) * 40;
      const k = smooth(hw + 85, hw, d + lump) * along;
      if (k > 0) {
        // level with the escarpment where it meets it, a little higher upstream
        const lift = 0.45 + 0.7 * smooth(st, st - 45, s);
        const bank = yw + lift + Math.max(0, d - rw) * 0.04 + (qnoise(x * 0.06, z * 0.06 - f.seed) - 0.5) * 1.4 * smooth(rw + 4, rw + 14, d);
        h = Math.max(h, h + (bank - h) * k);
      }
    }
    // the hill head it rises from
    const R = 62 * f.sc;
    if (dSrc < R) {
      const head = fallRiverY(f, sf) + 6.5 * f.sc * (1 - (dSrc / R) ** 2) + (qnoise(x * 0.04 - f.seed, z * 0.04) - 0.5) * 2.5;
      h = Math.max(h, h + (head - h) * smooth(R, R * 0.45, dSrc));
    }
    return h;
  }
  // the spring pool
  const pr = fallRiverW(f, sf) * 2.2 + 3.5;
  if (dSrc < pr + 8) {
    const bed = fallRiverY(f, sf) - 1.3;
    const target = bed + Math.max(0, h - bed) * Math.pow(smooth(pr * 0.55, pr + 8, dSrc), 1.25);
    h = Math.min(h, target);
  }
  if (s < sf || s > st + 4) return h;
  const c = fallRiverU(f, s);
  const d = Math.abs(u - c.u) / Math.sqrt(1 + c.du * c.du);
  const rw = fallRiverW(f, s);
  // a bed broad enough for the ground's 2 m grid to draw (the water reaches over it and up onto the
  // banks, its edge where they rise out of it)
  const bankW = 3.5 + Math.max(0, h - yw) * 1.2;
  const flat = rw + 1.6;
  if (d > flat + bankW) return h;
  const bed = yw - 0.55;
  const target = bed + Math.max(0, h - bed) * Math.pow(smooth(flat, flat + bankW, d), 1.25);
  const k = smooth(st + 4, st - 4, s);
  return Math.min(h, h + (target - h) * k);
}
/** The escarpment of a fall (see Fall). */
function escarp(f: Fall, s: number, u: number, x: number, z: number, h: number): number {
  {
    const sc = f.sc;
    const au = Math.abs(u);
    // the escarpment: wide across, fading toward its ends, rising gently from behind, its front a
    // cliff (its line broken by noise, so it is crags rather than a smooth wall)
    const ends = smooth(1, 0.6, au / (64 * sc) + (qnoise(x * 0.03 + f.seed, z * 0.03) - 0.5) * 0.18);
    const behind = smooth(-80 * sc, -30 * sc, s);
    // where the water falls the lip runs straight; beside it the cliff curves forward round the
    // pool (an amphitheatre), its line crags
    const open = f.w + 2.5;
    const curve = au < open ? 0 : Math.min(9 * sc, (0.02 * (au - open) ** 2) / sc);
    // its line: broad buttresses and recesses with crags in them (never a saw's teeth)
    const jag = ((qnoise(u * 0.055 + f.seed, f.seed * 0.7) - 0.5) * 9 + (qnoise(u * 0.11 - f.seed, f.seed + 9) - 0.5) * 1.4) * smooth(open, open + 6, au);
    const sl = s - jag - curve;
    // the cliff: steep where the water falls (the water hides it), broader along the wall, so the
    // ground's 2 m grid draws its edge as a line, not a row of teeth; at its foot a skirt of fallen rock
    const side = smooth(f.w + 0.5, f.w + 8, au), rw = 4 + 4.5 * side;
    const front = Math.max(smooth(0.5 + rw / 2, 0.5 - rw / 2, sl), smooth(10 + rw / 2, -1.5, sl) * 0.32 * side);
    const mask = ends * behind * front;
    // the plunge pool, in front of the cliff (its soft edge never eats into the lip above)
    const dp = Math.hypot(s - FALL_POOL, u * 0.9) * (1 + (qnoise(x * 0.11 + f.seed, z * 0.11) - 0.5) * 0.45);
    const pool = dp < 16 * Math.sqrt(sc) ? smooth(15 * Math.sqrt(sc), 7, dp) * smooth(-1.5 + rw / 2 - 2, 1.5 + rw / 2 - 2, sl) : 0;
    if (mask <= 0) {
      if (pool > 0) h = Math.min(h, h + (-2.8 - h) * pool);
      return h;
    }
    // a tiered fall: the land steps down at its upper cliff onto a ledge, then falls again
    let level = f.top;
    if (f.mid > 0) {
      const jagU = ((qnoise(u * 0.07 - f.seed, f.seed + 3) - 0.5) * 6 + (qnoise(u * 0.13 + f.seed, f.seed - 4) - 0.5) * 1.2) * smooth(open, open + 5, au);
      const rwU = 4 + 3.5 * smooth(open, open + 5, au);
      level = f.mid + (f.top - f.mid) * smooth(0.5 + rwU / 2, 0.5 - rwU / 2, s - fallLedge(f) - jagU - curve * 0.6);
    }
    const top = level * (1 - 0.3 * (au / (64 * sc)) ** 2) + (qnoise(x * 0.07, z * 0.07 + f.seed) - 0.5) * 1.6 * smooth(4, 12, -s) * smooth(4, 12, au);
    h = Math.max(h, h + (top - h) * mask);
    // the stream along the top, a hand deeper than the lip, from its spring
    const upperLip = f.mid > 0 ? fallLedge(f) : 0;
    const st = fallStream(f);
    const ch = smooth(2.8, 1.6, au - (f.w - 1.6) * 0.6) * smooth(st - 4, st + 4, s) * smooth(0.5, -1.5, s - upperLip) * mask;
    if (ch > 0) h = Math.min(h, h + (f.top - 0.9 - h) * ch);
    // a tiered fall's ledge: a shallow pool where the upper water lands, running on to the lower lip
    if (f.mid > 0) {
      const L = fallLedge(f);
      const pool = Math.hypot(s - (L + 2.5), u * 0.8);
      const lane = smooth(f.w + 1.6, f.w + 0.6, au) * smooth(L - 0.5, L + 1, s) * smooth(0.5, -1.5, s);
      const k = Math.max(lane, smooth(f.w + 3.2, f.w + 1.4, pool) * smooth(L - 0.5, L + 1, s)) * mask;
      if (k > 0) h = Math.min(h, h + (f.mid - 1.1 - h) * k);
    }
    if (pool > 0) h = Math.min(h, h + (-2.8 - h) * pool);
  }
  return h;
}
/** How wet the ground is at the foot of a waterfall's cliff, behind and beside its falling water
    (0–1): the rock there darkens, with moss at its edges. */
export function fallWet(x: number, z: number, h: number): number {
  let w = 0;
  for (const f of WATERFALLS) {
    if (Math.abs(x - f.x) > 40 * f.sc || Math.abs(z - f.z) > 40 * f.sc) continue;
    const { s, u } = fallLocal(f, x, z);
    for (const d of fallDrops(f)) {
      if (h < d.to - 0.6 || h > d.from + 1) continue;
      const near = smooth(f.w + 6, f.w + 1.5, Math.abs(u)) * smooth(d.lip - 5, d.lip - 1.5, s) * smooth(d.lip + 9, d.lip + 3, s);
      w = Math.max(w, near);
    }
  }
  return w;
}

/** Where each archetype's home should stand, roughly, and on what kind of ground; each
    settles on the nearest place that suits it.
    - land: calm, dry, level ground;   high: a height with a view;
    - shore: level ground at the water's edge;   deep: the floor of deep water;
    - island: open water, where a small island rises for it. */
export type SiteKind = "land" | "high" | "shore" | "deep" | "island";
const WISHED_SITES: { at: [number, number]; kind: SiteKind }[] = [
  // the Mind, around the shore where the wanderer wakes (a journey on foot, a short flight)
  { at: [232, -520], kind: "land" }, // I    the beam and ring
  { at: [-600, -280], kind: "land" }, // II   pillars and veil
  { at: [-200, 472], kind: "land" }, // III  the spiral garden
  { at: [680, 220], kind: "land" }, // IV   the throne on its square of light
  { at: [-480, -940], kind: "land" }, // V    the arch of three stones
  { at: [480, 820], kind: "land" }, // VI   the crossing rings
  { at: [900, -380], kind: "land" }, // VII  the chariot, with its road to the horizon
  // the Body, out to the east
  { at: [1350, 150], kind: "land" }, // VIII  Strength, the lion at rest
  { at: [1700, -500], kind: "high" }, // IX   the Hermit, on the heights with his lamp
  { at: [2050, -50], kind: "land" }, // X    the Wheel
  { at: [1450, 700], kind: "land" }, // XI   Justice, the scales and the sword
  { at: [1150, 1300], kind: "shore" }, // XII the Hanged Man, above still water
  { at: [1850, 950], kind: "land" }, // XIII Death, under the rainbow
  { at: [2050, 1250], kind: "shore" }, // XIV Temperance, between water and land
  // the Spirit, out to the west
  { at: [-1100, 350], kind: "land" }, // XV   the Devil
  { at: [-1400, -1350], kind: "high" }, // XVI the Tower, on the heights
  { at: [-1350, 50], kind: "shore" }, // XVII the Star, pouring into the lake
  { at: [-1900, 250], kind: "deep" }, // XVIII the Moon, in the deep
  { at: [-1000, -750], kind: "land" }, // XIX the Sun, in a ring of flowers
  { at: [-1800, -350], kind: "deep" }, // XX  Judgement, rising from the deep
  { at: [-2050, -1100], kind: "high" }, // XXI the World
  // the Choice, on a small island in the northern lake
  { at: [150, -1650], kind: "island" }, // XXII
];
function flatAround(x: number, z: number, h: number, r: number, tol: number): boolean {
  for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (Math.abs(rawHeight(x + dx, z + dz) - h) > tol) return false;
  return true;
}
function suits(kind: SiteKind, x: number, z: number): boolean {
  const h = rawHeight(x, z);
  switch (kind) {
    case "land":
      return h >= 2 && h <= 14 && flatAround(x, z, h, 8, 2.2);
    case "high":
      return h >= 18 && h <= 70 && flatAround(x, z, h, 8, 3);
    case "shore": {
      if (h < 1.5 || h > 4 || !flatAround(x, z, h, 6, 1.8)) return false;
      for (let a = 0; a < 6.28; a += 0.5) if (rawHeight(x + Math.cos(a) * 16, z + Math.sin(a) * 16) < -1) return true;
      return false;
    }
    case "deep":
      return h < -16 && flatAround(x, z, h, 9, 3.5);
    case "island": {
      if (h > -8) return false;
      for (let a = 0; a < 6.28; a += 0.785) if (rawHeight(x + Math.cos(a) * 40, z + Math.sin(a) * 40) > -3) return false;
      return true;
    }
  }
}
function settle({ at: [x, z], kind }: { at: [number, number]; kind: SiteKind }): [number, number] {
  // the Mind's homes keep their places; the others may look further for the ground they need
  const reach = kind === "land" && Math.hypot(x, z) < 1200 ? 140 : 520;
  const step = reach > 140 ? 10 : 7;
  for (let r = 0; r <= reach; r += step) {
    const steps = r === 0 ? 1 : reach === 140 ? 16 : Math.max(16, Math.round((r * Math.PI * 2) / 25));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (suits(kind, px, pz)) return [px, pz];
    }
  }
  return [x, z];
}
/** Where the landmarks stand, and on what. Positions are shared with stations.ts. */
export const LANDMARK_SITES: [number, number][] = WISHED_SITES.map(settle);
export const LANDMARK_KINDS: SiteKind[] = WISHED_SITES.map((w) => w.kind);

// each home's ground is levelled: dry homes a little above the water, deep ones on the floor,
// and the island raised out of the lake
/** The pyramid (world/pyramid.ts), after the Great Pyramid as Ra describes it: its proportions
    (faces at 51.84°, an apex angle near 76° 18′, Ra 56.4), one side parallel to north (58.8,
    north here is −z), on broad level ground 380–900 m from the shore, away from the homes. */
/** Where the pyramid stood before it went to the Nile (2026-10-22). Every site chosen after it
    still keeps clear of this place, as it did, so moving the pyramid moved nothing else. */
export const PYRAMID_FORMER = (() => {
  const HALF = 55, HEIGHT = 70;
  const GA = Math.PI * (3 - Math.sqrt(5));
  let best: { x: number; z: number; h: number } | null = null, bestScore = Infinity;
  for (let i = 0; i < 400; i++) {
    const r = 380 + ((i * 0.618034) % 1) * 520, a = i * GA + 1.1;
    const x = SPAWN.x + Math.cos(a) * r, z = SPAWN.z + Math.sin(a) * r;
    const h = rawHeight(x, z);
    if (h < 3 || h > 18) continue;
    if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 170)) continue;
    let dev = 0;
    for (let k = 0; k < 12; k++) {
      const b = (k / 12) * Math.PI * 2;
      for (const rr of [40, 75]) dev = Math.max(dev, Math.abs(rawHeight(x + Math.cos(b) * rr, z + Math.sin(b) * rr) - h));
    }
    if (dev < bestScore) {
      bestScore = dev;
      best = { x, z, h };
    }
  }
  const b = best ?? { x: 520, z: 260, h: 6 };
  return { x: b.x, z: b.z, y: Math.max(2.5, b.h), half: HALF, height: HEIGHT };
})();
/** Where the vision of creation stands (world/vision.ts): near the shore, in the middle of
    things, on dry level ground you see soon after waking. */
export const MONUMENT = (() => {
  let best = { x: SPAWN.x + 70, z: SPAWN.z - 40, h: 3 }, bestScore = -Infinity;
  for (let r = 55; r <= 150; r += 8)
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2, x = SPAWN.x + Math.sin(a) * r, z = SPAWN.z + Math.cos(a) * r;
      const h = rawHeight(x, z);
      if (h < 1.6 || h > 14) continue;
      if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 45)) continue;
      if (Math.hypot(x - PYRAMID_FORMER.x, z - PYRAMID_FORMER.z) < PYRAMID_FORMER.half * 2.5) continue;
      let rough = 0;
      for (let j = 0; j < 8; j++) {
        const b = (j / 8) * Math.PI * 2;
        rough = Math.max(rough, Math.abs(rawHeight(x + Math.cos(b) * 14, z + Math.sin(b) * 14) - h));
      }
      const score = -rough * 3 - r * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z, h };
      }
    }
  return { x: best.x, z: best.z, y: Math.max(1.8, best.h), r: 12 };
})();

/** The great monuments' grounds (the densities, the adept, past choices, the visions): each on
    broad dry level ground `r0`–`r1` m from the shore, looked for first toward `bearing`
    (radians, x = sin, z = cos), clear of the homes, the pyramid, the vision and one another. */
export interface MonumentSite { x: number; z: number; y: number; r: number; face: number }
const MONUMENT_SITES: MonumentSite[] = [];
export function monumentSite(bearing: number, r0: number, r1: number, flat: number): MonumentSite {
  let best = { x: SPAWN.x + Math.sin(bearing) * r0, z: SPAWN.z + Math.cos(bearing) * r0, h: 4 }, bestScore = -Infinity;
  for (let r = r0; r <= r1; r += 16)
    for (let k = -8; k <= 8; k++) {
      const a = bearing + k * 0.16, x = SPAWN.x + Math.sin(a) * r, z = SPAWN.z + Math.cos(a) * r;
      const h = rawHeight(x, z);
      if (h < 2.5 || h > 20) continue;
      if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < flat + 60)) continue;
      if (Math.hypot(x - PYRAMID_FORMER.x, z - PYRAMID_FORMER.z) < PYRAMID_FORMER.half * 2 + flat) continue;
      if (Math.hypot(x - MONUMENT.x, z - MONUMENT.z) < flat + 50) continue;
      if (MONUMENT_SITES.some((m) => Math.hypot(x - m.x, z - m.z) < m.r + flat + 60)) continue;
      let rough = 0;
      for (let j = 0; j < 10; j++) {
        const b = (j / 10) * Math.PI * 2;
        for (const rr of [flat * 0.5, flat]) rough = Math.max(rough, Math.abs(rawHeight(x + Math.cos(b) * rr, z + Math.sin(b) * rr) - h));
      }
      const score = -rough * 2 - Math.abs(k) * 0.6 - (r - r0) * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z, h };
      }
    }
  // its door faces home, toward the shore where you wake
  const site = { x: best.x, z: best.z, y: Math.max(2.5, best.h), r: flat, face: Math.atan2(SPAWN.x - best.x, SPAWN.z - best.z) };
  MONUMENT_SITES.push(site);
  PADS.push({ x: site.x, z: site.z, h: site.y, outer: flat * 1.9, inner: flat * 1.2 });
  KEEP_CLEAR.push({ x: site.x, z: site.z, r: flat * 1.35 });
  return site;
}

/** Places the growing things keep clear of (the pyramid's plaza, the vision's ground). */
const FORMER_CLEAR = { x: PYRAMID_FORMER.x, z: PYRAMID_FORMER.z, r: PYRAMID_FORMER.half * 1.5 };
export const KEEP_CLEAR: { x: number; z: number; r: number }[] = [
  FORMER_CLEAR,
  { x: MONUMENT.x, z: MONUMENT.z, r: MONUMENT.r + 4 },
];
/** The flower glades (the owner: "spots that are special with them… really well done, not
    everywhere"): a glade beside each archetype's home, out of its stone ring, and three near the
    shore where you begin. Only here do flowers grow; elsewhere the land is soil, stone and grass. */
export const GLADES: { x: number; z: number; r: number }[] = (() => {
  const out: { x: number; z: number; r: number }[] = [];
  LANDMARK_SITES.forEach(([x, z], i) => {
    if (LANDMARK_KINDS[i] === "deep") return;
    const a = i * 2.39996;
    out.push({ x: x + Math.cos(a) * 17, z: z + Math.sin(a) * 17, r: 11 });
  });
  for (const [dx, dz] of [[26, -18], [-30, -12], [8, -38]]) out.push({ x: SPAWN.x + dx, z: SPAWN.z + dz, r: 13 });
  return out;
})();
/** 0 outside every glade, 1 at a glade's heart. */
export const gladeAt = (x: number, z: number): number => {
  let k = 0;
  for (const g of GLADES) {
    const d = Math.hypot(x - g.x, z - g.z);
    if (d < g.r) k = Math.max(k, 1 - d / g.r);
  }
  return k;
};

/** Lines the growing things keep off as well (none now: the railway's track is gone): each answers
    whether (x, z) is within its reach, with `pad` more. */
export const CLEAR_LINES: ((x: number, z: number, pad: number) => boolean)[] = [];
export const keptClear = (x: number, z: number, pad = 0) => KEEP_CLEAR.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + pad) || CLEAR_LINES.some((f) => f(x, z, pad));

const PADS = LANDMARK_SITES.map(([x, z], i) => {
  const kind = LANDMARK_KINDS[i], raw = rawHeight(x, z);
  const h = kind === "deep" ? raw : kind === "island" ? 1.6 : Math.max(1.2, raw);
  const [outer, inner] = kind === "island" ? [26, 12] : kind === "deep" ? [15, 9] : [11, 6.5];
  return { x, z, h, outer, inner };
});
// the pyramid's plaza, levelled
const FORMER_PAD = { x: PYRAMID_FORMER.x, z: PYRAMID_FORMER.z, h: PYRAMID_FORMER.y, outer: PYRAMID_FORMER.half * 2.1, inner: PYRAMID_FORMER.half * 1.45 };
PADS.push(FORMER_PAD);
PADS.push({ x: MONUMENT.x, z: MONUMENT.z, h: MONUMENT.y, outer: MONUMENT.r * 2.2, inner: MONUMENT.r * 1.3 });
/** The monument of the densities (scenes/densities/monument.ts): a round of eight standing stones
    about a domed hall, on a stepped platform, its door toward the shore. */
export const DENSITY_HALL = monumentSite(2.3, 200, 520, 30);
/** The adept's school (scenes/adept/monument.ts): a stepped tower of three terraces crowned
    with a crystal, a small shrine at each corner, its door toward the shore. */
export const ADEPT_HALL = monumentSite(-1.9, 220, 560, 34);
/** The monument of past choices (scenes/past/monument.ts): a round Atlantean temple on an island
    ringed by water, on a stepped platform, its door toward the shore. */
export const PAST_HALL = monumentSite(0.9, 240, 620, 30);
/** The one door into the world after the veil (scenes/afterVeil): a standing door in the forest,
    on a small level ground (the trees keep close round it), its face toward home. */
export const VEIL_HALL = monumentSite(3.0, 260, 640, 8);
/** The way into the long descent (scenes/wanderer): a shaft of white-gold light rising from a
    quiet meadow out of a broken ring of etched stones, seen from far away. */
export const WANDERER_HALL = monumentSite(-0.7, 240, 640, 10);
/** Level the ground round (x, z) to height `h`, flat within `inner` m and blending out by `outer`
    (the drowned cities on the lake floors, world/ancient). Called while the world is being made,
    before any ground is built. */
export function levelGround(x: number, z: number, h: number, inner: number, outer: number): void {
  PADS.push({ x, z, h, outer, inner });
  coarse.clear();
}
/** Rectangular level grounds (the temple's precinct): flat to `h` within a rectangle `hx` × `hz`
    (half-sizes) about (x, z), turned by heading `ang` (its local z along the heading), blending out
    over `blend` metres. Called while the world is being made, before any ground is built. */
export function levelRect(x: number, z: number, h: number, ang: number, hx: number, hz: number, blend: number): void {
  RECTS.push({ x, z, h, c: Math.cos(ang), s: Math.sin(ang), hx, hz, blend, reach: Math.hypot(hx, hz) + blend });
  coarse.clear();
}
/** Göbekli Tepe (world/ancient/gobekli.ts): the highest dry hill toward the golden hour (east by
    north-east, 1–1.9 km out, where the sky is the low warm sun), its ground above the plain all
    round and clear of every home, monument, the pyramid and the peaks. Its top is levelled, its
    four enclosures dug down into it, its unexcavated tells raised over it; three sister hills
    stand out on the plain. `face`: the heading from it toward the shore (the way you come). */
export const GOBEKLI = (() => {
  let best = { x: 1680, z: -610, h: 21 }, bestScore = -Infinity;
  for (let r = 1000; r <= 1900; r += 20)
    for (let k = -14; k <= 14; k++) {
      const a = 1.95 + k * 0.03, x = SPAWN.x + Math.sin(a) * r, z = SPAWN.z + Math.cos(a) * r;
      const h = rawHeight(x, z);
      if (h < 8 || h > 60) continue;
      if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 160)) continue;
      if (MONUMENT_SITES.some((m) => Math.hypot(x - m.x, z - m.z) < m.r + 160)) continue;
      if (Math.hypot(x - PYRAMID_FORMER.x, z - PYRAMID_FORMER.z) < 320) continue;
      if (PEAKS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 60)) continue;
      let ring = 0, low = Infinity, rough = 0;
      for (let j = 0; j < 12; j++) {
        const b = (j / 12) * Math.PI * 2;
        const hh = rawHeight(x + Math.cos(b) * 170, z + Math.sin(b) * 170);
        ring += hh / 12;
        low = Math.min(low, hh);
        for (const rr of [15, 32]) rough = Math.max(rough, Math.abs(rawHeight(x + Math.cos(b) * rr, z + Math.sin(b) * rr) - h));
      }
      if (low < 1) continue; // dry ground all round: a plain below, not a lake
      const score = h - ring - rough * 1.5;
      if (score > bestScore) (bestScore = score), (best = { x, z, h });
    }
  return { x: best.x, z: best.z, y: best.h, face: Math.atan2(SPAWN.x - best.x, SPAWN.z - best.z) };
})();
/** The site's plan in its own frame (+z toward the shore, the way you arrive), metres. */
export const GOBEKLI_PLAN = {
  /** How deep the enclosures are dug below the hilltop. */
  depth: 2.5,
  /** The enclosures: centre, radius of the wall's inner face, and the way its gap opens (radians,
      the game's heading in the site's frame). D holds the vulture stone. */
  enclosures: [
    { id: "D", x: -13.5, z: 4, r: 10, gap: Math.PI / 2 },
    { id: "C", x: 14.5, z: -8, r: 11, gap: -Math.PI / 2 },
    { id: "B", x: -11, z: -25, r: 8, gap: Math.PI / 2 },
    { id: "A", x: 11.5, z: 20, r: 7.5, gap: -Math.PI / 2 },
  ],
  /** The houses of those who built it, round the enclosures on the open hilltop (as it stood
      when built, c. 9500 BCE: rectangular dry-stone houses, flat roofs of timber and earth):
      centre, size, and the way the door faces (radians, in the site's frame). */
  houses: [
    { x: 24, z: 31, w: 6, d: 4.4, face: Math.PI * 1.15 },
    { x: -27, z: 21, w: 5.4, d: 4, face: Math.PI * 0.75 },
    { x: -28, z: -7, w: 5, d: 4, face: Math.PI * 0.5 },
    { x: 29, z: -29, w: 6.2, d: 4.6, face: -Math.PI * 0.3 },
  ],
  /** The stairs down into D and C, through their gaps, down the bank the enclosure is sunk in:
      from `out` metres beyond the wall's inner face (the hilltop's edge) to `in` metres inside
      it, in steps of `rise`. */
  stair: { out: 1.8, in: 1.6, rise: 0.25, w: 1.7 },
  /** The cistern cut into the bedrock, where the rain was kept. */
  cistern: { x: 5, z: -40, r: 2.6 },
  /** The quarry: a shelf of bedrock at the hill's edge with a pillar half cut from it. */
  quarry: { x: -38, z: -36, face: Math.PI * 0.25 },
};
/** A point of the site's plan in the world. */
export function gobekliAt(lx: number, lz: number): [number, number] {
  const c = Math.cos(GOBEKLI.face), s = Math.sin(GOBEKLI.face);
  return [GOBEKLI.x + lx * c + lz * s, GOBEKLI.z - lx * s + lz * c];
}
/** The sister hills: three tells out on the plain, 380–700 m off (the eleven other sites). */
export const GOBEKLI_SISTERS: { x: number; z: number; y: number }[] = (() => {
  const out: { x: number; z: number; y: number }[] = [];
  for (let i = 0; i < 24 && out.length < 3; i++) {
    const a = GOBEKLI.face + Math.PI + (i % 2 ? 1 : -1) * (0.35 + (i >> 1) * 0.21), r = 380 + ((i * 0.618) % 1) * 320;
    const x = GOBEKLI.x + Math.sin(a) * r, z = GOBEKLI.z + Math.cos(a) * r;
    const h = rawHeight(x, z);
    if (h < 4 || h > 70) continue;
    if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 120)) continue;
    if (MONUMENT_SITES.some((m) => Math.hypot(x - m.x, z - m.z) < m.r + 120)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 200)) continue;
    out.push({ x, z, y: h + 9 });
  }
  return out;
})();
{
  const G = GOBEKLI, P = GOBEKLI_PLAN;
  PADS.push({ x: G.x, z: G.z, h: G.y, inner: 46, outer: 90 });
  // the enclosures dug down into it: the earth stands steep behind each wall
  for (const e of P.enclosures) {
    const [x, z] = gobekliAt(e.x, e.z);
    PADS.push({ x, z, h: G.y - P.depth, inner: e.r + 0.7, outer: e.r + 1.6 });
  }
  // the cistern cut into the bedrock
  {
    const [x, z] = gobekliAt(P.cistern.x, P.cistern.z);
    PADS.push({ x, z, h: G.y - 1.3, inner: P.cistern.r - 0.1, outer: P.cistern.r + 0.25 });
  }
  for (const s of GOBEKLI_SISTERS) PADS.push({ x: s.x, z: s.z, h: s.y, inner: 8, outer: 70 });
  KEEP_CLEAR.push({ x: G.x, z: G.z, r: 72 });
  for (const s of GOBEKLI_SISTERS) KEEP_CLEAR.push({ x: s.x, z: s.z, r: 20 });
}
/** Nan Madol (world/ancient/nanMadol.ts): a shore toward the dawn (south-east, 0.9–1.9 km out)
    where dry land meets a great lake falling away to real depths, the open sea beyond the
    seawall. `x, z`: the lagoon's centre, ~40 m out from the shore; `face`: the heading out to
    the open water (the site's +z). */
export const NAN_MADOL = (() => {
  let best = { x: 1318, z: 1181, ox: 0.65, oz: 0.76 }, bestScore = -Infinity;
  for (let r = 900; r <= 1900; r += 15)
    for (let k = -20; k <= 20; k++) {
      const a = Math.PI / 4 + k * 0.025, x = SPAWN.x + Math.sin(a) * r, z = SPAWN.z + Math.cos(a) * r;
      const h = rawHeight(x, z);
      if (h < -0.6 || h > 1.2) continue;
      const gx = rawHeight(x + 4, z) - rawHeight(x - 4, z), gz = rawHeight(x, z + 4) - rawHeight(x, z - 4), g = Math.hypot(gx, gz);
      if (g < 1e-3) continue;
      const ox = -gx / g, oz = -gz / g; // downhill: out to the water
      let lake = -Infinity;
      for (const d of [110, 170, 250]) lake = Math.max(lake, rawHeight(x + ox * d, z + oz * d));
      const land = Math.min(rawHeight(x - ox * 50, z - oz * 50), rawHeight(x - ox * 90, z - oz * 90));
      if (lake > -3 || land < 1.2) continue;
      if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 200)) continue;
      if (MONUMENT_SITES.some((m) => Math.hypot(x - m.x, z - m.z) < m.r + 200)) continue;
      if (Math.hypot(x - PYRAMID_FORMER.x, z - PYRAMID_FORMER.z) < 350 || Math.hypot(x - GOBEKLI.x, z - GOBEKLI.z) < 400) continue;
      if (PEAKS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 100)) continue;
      let side = 0;
      for (const s of [-50, 50]) side = Math.max(side, Math.abs(rawHeight(x - oz * s, z + ox * s)));
      // a straight shore, deep water beyond, toward the dawn
      const score = -side - Math.abs(k) * 0.04 + Math.min(4, -lake) * 0.1;
      if (score > bestScore) (bestScore = score), (best = { x, z, ox, oz });
    }
  return { x: best.x + best.ox * 40, z: best.z + best.oz * 40, face: Math.atan2(best.ox, best.oz) };
})();
/** A point of Nan Madol's plan (+z out to the open water) in the world. */
export function nanMadolAt(lx: number, lz: number): [number, number] {
  const c = Math.cos(NAN_MADOL.face), s = Math.sin(NAN_MADOL.face);
  return [NAN_MADOL.x + lx * c + lz * s, NAN_MADOL.z - lx * s + lz * c];
}
/** Its lagoon floor: shallow enough to wade the canals (not swim: the controller swims below
    1 m), the land behind it a beach, the reef outside the seawall falling away. */
export const NAN_FLOOR = -0.72;
{
  const N = NAN_MADOL;
  PADS.push({ x: N.x, z: N.z, h: NAN_FLOOR, inner: 56, outer: 84 });
  KEEP_CLEAR.push({ x: N.x, z: N.z, r: 90 });
}
/** Rapa Nui (world/ancient/rapaNui.ts): a grassy headland over deep water toward the red sunset
    (south-west, 0.9–1.9 km out), its ahu near the cliff's edge with its back to the sea, a
    volcano inland behind it with a crater in its top, a small islet offshore. `x, z`: the ahu's
    middle; `face`: the heading out to sea (the site's +z). */
export const RAPA_NUI = (() => {
  let best = { x: -1100, z: 1100, ox: -0.7, oz: 0.7 }, bestScore = -Infinity;
  for (let r = 900; r <= 1900; r += 15)
    for (let k = -24; k <= 24; k++) {
      const a = -Math.PI / 4 + k * 0.025, x = SPAWN.x + Math.sin(a) * r, z = SPAWN.z + Math.cos(a) * r;
      const h = rawHeight(x, z);
      if (h < -0.8 || h > 1.5) continue;
      const gx = rawHeight(x + 4, z) - rawHeight(x - 4, z), gz = rawHeight(x, z + 4) - rawHeight(x, z - 4), g = Math.hypot(gx, gz);
      if (g < 1e-3) continue;
      const ox = -gx / g, oz = -gz / g; // downhill: out to the sea
      let sea = -Infinity;
      for (const d of [70, 120, 200]) sea = Math.max(sea, rawHeight(x + ox * d, z + oz * d));
      const land = Math.min(rawHeight(x - ox * 60, z - oz * 60), rawHeight(x - ox * 120, z - oz * 120));
      const vx = x - ox * 250, vz = z - oz * 250; // the volcano, inland behind
      if (sea > -4 || land < 1 || rawHeight(vx, vz) < 0.5) continue;
      const clear = (px: number, pz: number, m: number) =>
        !LANDMARK_SITES.some(([lx, lz]) => Math.hypot(px - lx, pz - lz) < m) &&
        !MONUMENT_SITES.some((s) => Math.hypot(px - s.x, pz - s.z) < s.r + m) &&
        Math.hypot(px - PYRAMID_FORMER.x, pz - PYRAMID_FORMER.z) > 350 + m &&
        Math.hypot(px - GOBEKLI.x, pz - GOBEKLI.z) > 300 + m &&
        Math.hypot(px - NAN_MADOL.x, pz - NAN_MADOL.z) > 300 + m &&
        !PEAKS.some((p) => Math.hypot(px - p.x, pz - p.z) < p.r + m);
      if (!clear(x, z, 200) || !clear(vx, vz, 160)) continue;
      let side = 0;
      for (const s of [-40, 40]) side = Math.max(side, Math.abs(rawHeight(x - oz * s, z + ox * s)));
      const score = -side - Math.abs(k) * 0.04 + Math.min(6, -sea) * 0.1;
      if (score > bestScore) (bestScore = score), (best = { x, z, ox, oz });
    }
  const { x, z, ox, oz } = best;
  return {
    x: x + ox * 8,
    z: z + oz * 8,
    face: Math.atan2(ox, oz),
    /** The headland's top. */
    y: 12,
    volcano: { x: x - ox * 250, z: z - oz * 250, y: 46, crater: 35 },
    islet: { x: x + ox * 210 - oz * 50, z: z + oz * 210 + ox * 50 },
  };
})();
/** A point of Rapa Nui's plan (+z out to sea, the ahu's middle at the origin) in the world. */
export function rapaNuiAt(lx: number, lz: number): [number, number] {
  const c = Math.cos(RAPA_NUI.face), s = Math.sin(RAPA_NUI.face);
  return [RAPA_NUI.x + lx * c + lz * s, RAPA_NUI.z - lx * s + lz * c];
}
{
  const N = RAPA_NUI;
  // the headland: flat on top about a point a little inland of the ahu, falling to the sea in a cliff
  const [hx, hz] = rapaNuiAt(0, -8);
  PADS.push({ x: hx, z: hz, h: N.y, inner: 30, outer: 48 });
  // the volcano: a broad cone, and its crater sunk in the top
  PADS.push({ x: N.volcano.x, z: N.volcano.z, h: N.volcano.y, inner: 26, outer: 150 });
  PADS.push({ x: N.volcano.x, z: N.volcano.z, h: N.volcano.crater, inner: 15, outer: 30 });
  // the islet offshore, where the sea birds come
  PADS.push({ x: N.islet.x, z: N.islet.z, h: 5, inner: 6, outer: 19 });
  KEEP_CLEAR.push({ x: hx, z: hz, r: 52 }, { x: N.volcano.x, z: N.volcano.z, r: 60 }, { x: N.islet.x, z: N.islet.z, r: 18 });
}
/** The mind's maze (scenes/mindMaze): its door, two leaning monoliths of stone holding a curtain
    of light, on level ground south-west of the shore. Declared after every other site, so adding
    it moved none of them. */
export const MAZE_HALL = monumentSite(-2.55, 250, 620, 10);
/** Its platform's rise at distance `d` from its centre (walked up; scenes/past/monument.ts). */
const pastRise = (d: number): number => (d < 12.4 ? 1.3 : d < 22 ? 0.9 : d < 23 ? 0.6 : d < 24 ? 0.3 : 0);
/** The stepped platform's rise at distance `d` from a monument's centre (three steps of 0.45 m). */
export const platformRise = (d: number): number => (d < 19.6 ? 1.35 : d < 20.8 ? 0.9 : d < 22 ? 0.45 : 0);

/** Ground height at (x, z). Below WATER_Y means water. */
/** A place apart, beyond the world's edge (the temple): its own floor. */
export const floorHook: { fn: ((x: number, z: number) => number) | null } = { fn: null };
/** The Nile is in the land (wakeTheNile, at the end of this module; read from the first height on). */
let nileOn = false;

/** The ground's height from a coarse cache (corners every 4 m, bilinear between; bounded): for
    the many queries that need only the lie of the land (the camera's ray against the ground,
    autofly's look ahead, the shadow's target), not the exact ground under a foot. Places apart
    answer exactly (their floors change). */
const COARSE = 4;
/** The eight taps of the sky-seen shading (pairs: across, along), with the border of four cells. */
const SKY_TAPS = [-4, 0, 4, 0, 0, -4, 0, 4, -2, -2, 2, 2, -2, 2, 2, -2];
const coarse = new Map<number, number>();
function corner(ix: number, iz: number): number {
  const key = (ix + 50000) * 100003 + (iz + 50000);
  let h = coarse.get(key);
  if (h === undefined) {
    if (coarse.size > 20000) coarse.clear();
    h = heightAt(ix * COARSE, iz * COARSE);
    coarse.set(key, h);
  }
  return h;
}
export function heightCoarse(x: number, z: number): number {
  if (x > 20000) return heightAt(x, z);
  const fx = x / COARSE, fz = z / COARSE, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
  const a = corner(ix, iz), b = corner(ix + 1, iz), c = corner(ix, iz + 1), d = corner(ix + 1, iz + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
export function heightAt(x: number, z: number): number {
  if (x > 20000 && floorHook.fn) return floorHook.fn(x, z);
  let h = rawHeight(x, z);
  if (reliefOn) {
    h += relief(x, z, h);
    h = waterways(x, z, h);
  }
  if (nileOn) h = nileLand(x, z, h);
  for (const p of PADS) {
    if (Math.abs(x - p.x) > p.outer || Math.abs(z - p.z) > p.outer) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.outer) h = mix(h, p.h, smooth(p.outer, p.inner, d));
  }
  for (const q of RECTS) {
    const dx = x - q.x, dz = z - q.z;
    if (Math.abs(dx) > q.reach || Math.abs(dz) > q.reach) continue;
    const ex = Math.abs(dx * q.c - dz * q.s) - q.hx, ez = Math.abs(dx * q.s + dz * q.c) - q.hz;
    const d = Math.hypot(Math.max(ex, 0), Math.max(ez, 0));
    if (d < q.blend) h = mix(h, q.h, smooth(q.blend, 0, d));
  }
  return h;
}

/** What stands raised above the floor in the world, to stand on (the rings of drowned Atlantis):
    each answers its height at (x, z), or −Infinity where it doesn't stand. */
export const standHooks: ((x: number, z: number) => number)[] = [];
/** Where the wanderer stands: the ground, or the pyramid's faces (you can climb to its apex). */
export function standAt(x: number, z: number): number {
  let h = heightAt(x, z);
  if (x > 20000) return h;
  for (const f of standHooks) h = Math.max(h, f(x, z));
  const m = Math.max(Math.abs(x - PYRAMID.x), Math.abs(z - PYRAMID.z));
  if (m < PYRAMID.half) return Math.max(h, PYRAMID.y + PYRAMID.height * (1 - m / PYRAMID.half));
  const dm = Math.hypot(x - DENSITY_HALL.x, z - DENSITY_HALL.z);
  if (dm < 22) return Math.max(h, DENSITY_HALL.y + platformRise(dm));
  const dp = Math.hypot(x - PAST_HALL.x, z - PAST_HALL.z);
  return dp < 24 ? Math.max(h, PAST_HALL.y + pastRise(dp)) : h;
}

/** Caves in the steep hillsides (Samuel: "caves"): where the ground climbs sharply, away from
    the homes, the shore and each other. `face` is the direction the mouth opens, downhill. */
export const CAVE_SITES: { x: number; z: number; y: number; face: number }[] = (() => {
  const out: { x: number; z: number; y: number; face: number }[] = [];
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 14 && out.length < 7; i++) {
    const a = i * GA * 2.9 + 0.4, r = 320 + ((i * 0.618) % 1) * 1150;
    const hx = Math.cos(a) * r, hz = Math.sin(a) * r;
    search: for (let rr = 0; rr <= 320; rr += 20) {
      const n = rr === 0 ? 1 : Math.round((rr * 2 * Math.PI) / 30);
      for (let k = 0; k < n; k++) {
        const b = (k / n) * Math.PI * 2;
        const x = hx + Math.cos(b) * rr, z = hz + Math.sin(b) * rr;
        const h = heightAt(x, z);
        if (h < 5 || h > 45 || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 150) continue;
        const gx = heightAt(x + 8, z) - heightAt(x - 8, z), gz = heightAt(x, z + 8) - heightAt(x, z - 8);
        if (Math.hypot(gx, gz) < 5) continue; // a real slope: the cave runs into the hill
        if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 80)) continue;
        if (Math.hypot(x - GOBEKLI.x, z - GOBEKLI.z) < 180) continue;
        if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 400)) continue;
        out.push({ x, z, y: h, face: Math.atan2(-gz, -gx) });
        break search;
      }
    }
  }
  return out;
})();
/** Your sanctuary (world/sanctuary.ts): a quiet terrace of your own, built stone by stone from
    what you gather. It stands within sight of the great temple's pylon (found here as the pylon
    finds its ground, near the shore), a little above and apart from it, on even dry ground, away
    from every home and monument. Declared after every other site, so adding it moved none of
    them, and far enough from the pylon that the pylon's own search can't be turned by it. */
export const SANCTUARY = (() => {
  // the pylon's ground (the same search the temple makes for it)
  let g = { x: SPAWN.x, z: SPAWN.z - 70, score: -Infinity };
  for (let r = 50; r <= 320; r += 15)
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2, x = SPAWN.x + Math.sin(a) * r, z = SPAWN.z + Math.cos(a) * r;
      const h = heightAt(x, z);
      if (h < WATER_Y + 1.2) continue;
      let rough = 0;
      for (const [dx, dz] of [[8, 0], [-8, 0], [0, 8], [0, -8], [8, 8], [-8, -8]]) rough = Math.max(rough, Math.abs(heightAt(x + dx, z + dz) - h));
      const clear = Math.min(...LANDMARK_SITES.map(([lx, lz]) => Math.hypot(lx - x, lz - z)));
      if (clear < 30 || keptClear(x, z, 25)) continue;
      const score = -rough * 3 - r * 0.03;
      if (score > g.score) g = { x, z, score };
    }
  const gy = heightAt(g.x, g.z);
  let best = { x: g.x + 70, z: g.z, h: gy + 2 }, bestScore = -Infinity;
  for (let r = 55; r <= 130; r += 6)
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2, x = g.x + Math.sin(a) * r, z = g.z + Math.cos(a) * r;
      const h = rawHeight(x, z);
      if (h < WATER_Y + 1.5 || h > 24) continue;
      if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 45)) continue;
      if (keptClear(x, z, 16)) continue;
      let rough = 0;
      for (let j = 0; j < 8; j++) {
        const b = (j / 8) * Math.PI * 2;
        for (const rr of [5, 10]) rough = Math.max(rough, Math.abs(rawHeight(x + Math.cos(b) * rr, z + Math.sin(b) * rr) - h));
      }
      // a terrace: level, a little raised above the pylon's ground, farther from the shore
      const lift = Math.min(6, h - gy);
      const score = -rough * 3 + lift * 0.5 + Math.hypot(x - SPAWN.x, z - SPAWN.z) * 0.006 - Math.abs(r - 85) * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z, h };
      }
    }
  const y = Math.max(WATER_Y + 1.5, best.h);
  // (no longer a place: building is anywhere now; this only places forms drawn here in older saves,
  // and the sanctuary's stills. It levels and keeps clear nothing.)
  // it faces the pylon
  return { x: best.x, z: best.z, y, face: Math.atan2(g.x - best.x, g.z - best.z), gate: { x: g.x, z: g.z } };
})();

/** Which kind of ground this is, 0–1 each: meadow (for grass and flowers), sand, stone. */
export function groundKind(x: number, z: number, h = heightAt(x, z)): { meadow: number; sand: number; stone: number } {
  let sand = smooth(1.2, 0.2, h);
  let stone = smooth(9, 16, h) * smooth(0.35, 0.65, fbm(x * 0.01 + 50, z * 0.01));
  // the region's own ground: dunes, ash and chalk with outcrops breaking through
  const rg = regionAt(x, z);
  if (rg.away > 0) {
    const outcrop = smooth(0.42, 0.62, fbm(x * 0.018 + 7, z * 0.018 - 13));
    sand = Math.max(sand, rg.sand * rg.away * (1 - outcrop * 0.5));
    stone = Math.max(stone, Math.min(1 - sand, rg.rock * rg.away * (0.35 + outcrop * 0.65)));
  }
  let meadow = Math.max(0, 1 - sand - stone) * smooth(0.25, 0.5, fbm(x * 0.02 - 20, z * 0.02 + 40));
  // the Nile's floodplain: fields, not sand
  const fk = nileFloodK(x, z);
  if (fk > 0) {
    sand *= 1 - fk;
    stone *= 1 - fk;
    meadow = Math.max(meadow, fk * 0.9);
  }
  // Göbekli Tepe's hill: dry soil over the top and its slopes (the stone shows only in its works)
  const gk = smooth(150, 90, Math.hypot(x - GOBEKLI.x, z - GOBEKLI.z));
  if (gk > 0) return { meadow: meadow + (1 - sand - meadow) * gk * 0.9, sand, stone: stone * (1 - gk * 0.9) };
  return { meadow, sand, stone };
}

/** Solid features: a circle (pillars, stones, basins) or, with `hx`/`hz`, a box turned by `ang`
    about its centre (walls, plinths, houses, tables); `r` is then unused. Below `top` it holds
    you out; `bottom` (default none) lets you pass under something raised (a lintel, a bridge). */
export interface Collider {
  x: number;
  z: number;
  r: number;
  top: number;
  bottom?: number;
  hx?: number;
  hz?: number;
  ang?: number;
}
export const colliders: Collider[] = [];

/** Push a body of radius `body` at (p.x, p.z), its feet at `y`, out of collider `c` (mutates p). */
export function pushOut(p: { x: number; z: number }, y: number, body: number, c: Collider): void {
  if (y > c.top || (c.bottom !== undefined && y + 1.6 < c.bottom)) return;
  if (c.hx === undefined || c.hz === undefined) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + body;
    if (d < min && d > 1e-4) (p.x = c.x + (dx / d) * min), (p.z = c.z + (dz / d) * min);
    return;
  }
  // into the box's own frame
  const a = c.ang ?? 0, cs = Math.cos(a), sn = Math.sin(a);
  const wx = p.x - c.x, wz = p.z - c.z;
  let lx = wx * cs - wz * sn, lz = wx * sn + wz * cs;
  const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
  const ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
  if (d > 1e-4) {
    if (d >= body) return;
    lx = qx + (ex / d) * body;
    lz = qz + (ez / d) * body;
  } else {
    // inside: out by the nearest face
    const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
    if (px < pz) lx = Math.sign(lx || 1) * (c.hx + body);
    else lz = Math.sign(lz || 1) * (c.hz + body);
  }
  p.x = c.x + lx * cs + lz * sn;
  p.z = c.z - lx * sn + lz * cs;
}

/* ---------- streamed ground, in three levels of detail ----------
   Near the wanderer: fine 64 m tiles (a vertex every 2 m). Around them, out to ~640 m: coarse
   256 m tiles (every 8 m). Beyond, out to ~2.5 km: broad 1 km tiles (every 32 m), which you see
   when you fly high above the haze. Where a finer level covers the ground, the coarser level's
   vertices are sunk out of sight. Normals come from the height function itself, so tiles meet without seams,
   and hollows are shaded by how much sky they see. */
interface Level {
  chunk: number;
  seg: number;
  ring: number;
}
const LEVELS: Level[] = [
  { chunk: 64, seg: 32, ring: 2 }, // near: a vertex every 2 m, ±160 m
  { chunk: 256, seg: 32, ring: 2 }, // far: every 8 m, ±640 m
  { chunk: 1024, seg: 32, ring: 2 }, // horizon: every 32 m, ±2.5 km (seen from the air)
];

const C = {
  wet: new THREE.Color("#35334f"),
  sand: new THREE.Color("#a79dc0"),
  // the home meadow in greens and earth (the owner: "make greener"; it was silver-blue, violet, rose)
  meadowA: new THREE.Color("#4b6a46"), // moss green
  meadowB: new THREE.Color("#5c6c3c"), // olive grass
  meadowC: new THREE.Color("#5e4c37"), // brown earth
  stone: new THREE.Color("#58514a"), // warm grey stone
  hollow: new THREE.Color("#4a3a2b"), // the brown earth gathered in hollows
  snow: new THREE.Color("#bcb9da"),
  granite: new THREE.Color("#3b3942"), // the mountains' bare rock, dark under the snow
  alpine: new THREE.Color("#3e3f31"), // a massif's lower slopes: thin tussock
  scree: new THREE.Color("#4a4846"), // and the scree between
  snowHigh: new THREE.Color("#e2e4f2"), // the high snowfields, whiter
  earth: new THREE.Color("#5e4a3c"), // bare, warm earth
  loam: new THREE.Color("#46382f"),
};

/** The ground's material: real scanned sand, grass and rock (tinted to the moonlit palette),
    with glitter in the sand and no drawn lines. */
/** Shared with the game loop: the time, for the caustics that dance on the floor of the lakes. */
export const groundUniforms = { uT: T.uniform(0) };

const tmix = T.mix;
const {
  abs, attribute, cameraPosition, If, cameraViewMatrix, dFdx, dFdy, dot, float, floor, Fn, fract, length, max, normalize, normalView,
  fwidth, normalWorld, positionWorld, pow, sin, smoothstep, step, texture, vec2, vec3, vec4,
} = T;
const gH = (p: N): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
const gN = Fn(([p]: N[]) => {
  const i = floor(p), f0 = fract(p), f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return tmix(tmix(gH(i), gH(i.add(vec2(1, 0))), f.x), tmix(gH(i.add(vec2(0, 1))), gH(i.add(vec2(1, 1))), f.x), f.y);
});
/** Which layer of the regions' texture array each region (E, NE, N, NW, W, SW, S, SE) wears (−1:
    none; the dunes keep the sand scan), how large a repeat is, and each scan's gain (to bring
    their brightness level with the home scans'). */
const REGION_SCAN = [0, 1, 2, 3, -1, 4, 5, 6];
const REGION_SC = 2.6;
const REGION_GAIN = [3.2, 3.6, 2.2, 3.6, 5.0, 2.4, 1.9];
function groundMaterial(): THREE.MeshStandardNodeMaterial {
  // matte earth: no sheen of sky or moon sliding over it as the camera moves (Samuel: "you
  // don't need to be ray tracing the floor")
  // (the vertex colours are applied in colorNode, so the snow can cover them)
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  m.envMapIntensity = 0.35;
  const [sand, meadow, rock, cliff] = [surface("sand"), surface("meadow"), surface("rock"), surface("cliff")];
  const moon = vec3(...starDirection().toArray());
  // x: sky seen (1 open … darker in hollows), y: how sandy, z: how rocky
  const gr = attribute("aGround", "vec4"); // w: how thick the forest stands (the far canopy)
  const regA = attribute("aRegA", "vec4"), regB = attribute("aRegB", "vec4");
  const regTex = regionScans();
  const vGW = positionWorld;
  const w = vec3(gr.y, gr.z, max(0, float(1).sub(gr.y).sub(gr.z))); // sand, rock, meadow
  const q = vGW.xz;
  const camD = length(vGW.sub(cameraPosition));
  const nW = normalize(normalWorld);
  // steep ground, and the mountains (their gentle slopes too): rock
  const mtn = smoothstep(22, 60, vGW.y);
  const steep = max(smoothstep(0.14, 0.42, float(1).sub(nW.y)), mtn).mul(step(0.5, vGW.y));
  const sea = smoothstep(-0.6, -3.5, vGW.y);
  // the scans' detail reaches far (mipmapped, it doesn't shimmer), and cliffs to the mountains
  const fade = float(1).sub(smoothstep(tmix(float(300), float(1400), steep), tmix(float(1100), float(2400), steep), camD));
  const CS = 7; // metres a repeat of the cliff scan
  const L = 0.004; // a layer weighing less than this isn't sampled at all

  /* Power: every texture is read only where it shows. Each layer (sand, rock, meadow, cliff, the
     lake floor, the fine grit close by) is sampled inside its own branch, so a patch of meadow
     reads the meadow scans and nothing else (about a quarter of what it used to), and the far
     land, beyond the scans' reach, reads none. Derivatives are taken before any branch (they
     must be) and every read inside one is a `grad` read. */
  const setup = () => {
    const W = w.toVar(), ST = steep.toVar(), CD = camD.toVar(), SEA = sea.toVar(), FD = fade.toVar();
    const N_ = nW.toVar();
    const dqx = dFdx(q).toVar(), dqy = dFdy(q).toVar(), dwx = dFdx(vGW).toVar(), dwy = dFdy(vGW).toVar();
    // No repeat ever shows (after Inigo Quilez's texture-repetition trick): a slow noise picks, for
    // each stretch of ground, one of eight offsets of the scan, and neighbouring stretches blend
    // into each other; both samples share the ground's own derivatives, so no seam shows either.
    const pick = gN(q.mul(0.045)).mul(8).toVar();
    const pa = floor(pick);
    const pf = smoothstep(0.25, 0.75, fract(pick)).toVar();
    const offA = sin(vec2(3, 7).mul(pa)).toVar(), offB = sin(vec2(3, 7).mul(pa.add(1))).toVar();
    const samp = (t: THREE.Texture, sc: number) => {
      const u = q.div(sc), dx = dqx.div(sc), dy = dqy.div(sc);
      return tmix(texture(t, u.add(offA)).grad(dx, dy), texture(t, u.add(offB)).grad(dx, dy), pf);
    };
    // the rock seen from all three sides (the gentle slopes from above): a scan projected only from
    // the sides stretched into streaks across the mountains' shoulders
    const bx = pow(abs(N_.x), 4).toVar(), bz = pow(abs(N_.z), 4).toVar(), by = pow(abs(N_.y), 4).toVar();
    const bsum = max(bx.add(bz).add(by), 1e-4).toVar();
    const side = (t: THREE.Texture, sc: number, a: "zy" | "xy" | "xz") =>
      texture(t, vGW[a].div(sc)).grad(dwx[a].div(sc), dwy[a].div(sc));
    const tri = (t: THREE.Texture, sc: number) =>
      side(t, sc, "zy").mul(bx).add(side(t, sc, "xy").mul(bz)).add(side(t, sc, "xz").mul(by)).div(bsum);
    // the regions' own soils, from one texture array (layer, then its normals REGION_LAYERS on)
    const sampR = (layer: number, sc: number) => {
      const u = q.div(sc), dx = dqx.div(sc), dy = dqy.div(sc);
      return tmix(texture(regTex, u.add(offA)).depth(float(layer)).grad(dx, dy), texture(regTex, u.add(offB)).depth(float(layer)).grad(dx, dy), pf);
    };
    // how much of the soil each region's scan takes (its share of the non-sand ground), and what
    // the home scans keep
    const RA = regA.toVar(), RB = regB.toVar();
    const soil = W.y.add(W.z).mul(0.85);
    const regW = [RA.x, RA.y, RA.z, RA.w, float(0), RB.y, RB.z, RB.w].map((r) => r.mul(soil).toVar());
    const keep = float(1).sub(RA.x.add(RA.y).add(RA.z).add(RA.w).add(RB.y).add(RB.z).add(RB.w).mul(0.85)).toVar();
    return { W, ST, CD, SEA, FD, N_, dqx, dqy, samp, tri, side, bx, bz, by, bsum, sampR, regW, keep };
  };

  // Crags: the mountains' faces broken into ridges and gullies in the light (ridged noise at two
  // scales, its slope turned into the surface's tilt), finer than the land's triangles can carry.
  // Only on the mountains: x the crag's height (for the crevices), yz the tilt.
  const cragN = Fn(() => {
    const out = vec3(0.5, 0, 0).toVar();
    If(mtn.greaterThan(L), () => {
      const ridge = (p: N) => float(1).sub(abs(gN(p).mul(2).sub(1)));
      const crag = (p: N) => ridge(p.mul(0.025)).mul(0.7).add(ridge(p.mul(0.08).add(17)).mul(0.22)).add(gN(p.mul(0.35).add(5)).mul(0.08));
      const E = 0.7;
      const c0 = crag(q), cx = crag(q.add(vec2(E, 0))), cz = crag(q.add(vec2(0, E)));
      out.assign(vec3(c0, c0.sub(cx).mul(mtn.mul(5.5 / E)), c0.sub(cz).mul(mtn.mul(5.5 / E))));
    });
    return out;
  })();
  const dCrag = vec3(cragN.y, 0, cragN.z);
  const nP = normalize(nW.add(dCrag));
  // Snow, decided for every point rather than at the land's corners (which painted soft blobs):
  // it lies where the ground (crags and all) is gentle enough, above a ragged line, with wind-cut
  // edges; drifts carry the fine grain of the sand scan
  // (only on the mountains: its three noises aren't read on the land below)
  const snow = Fn(() => {
    const out = float(0).toVar();
    If(mtn.greaterThan(L), () => {
      const snowLine = gN(q.mul(0.01).add(3)).sub(0.5).mul(60).add(95);
      // it gathers in the hollows and leaves the ribs between them bare (the crags' height), and
      // its lower edge breaks into tongues and patches rather than fading as a haze
      const lieN = gN(q.mul(0.09).add(11)).sub(0.5).mul(0.22).add(gN(q.mul(0.6)).sub(0.5).mul(0.08)).add(float(0.45).sub(cragN.x).mul(0.32));
      const fringe = gN(q.mul(0.035).add(17)).sub(0.5).mul(22).add(gN(q.mul(0.15)).sub(0.5).mul(7));
      out.assign(smoothstep(snowLine, snowLine.add(4), vGW.y.add(fringe)).mul(smoothstep(0.6, 0.66, nP.y.add(lieN))).mul(mtn));
    });
    return out;
  })();

  // Hillside creases, as rain cuts them (the realism of eroded land): on gentle-to-steep slopes, fine
  // gullies run straight down the fall line, a few metres apart and wandering a little, their
  // floors darker and damper; drawn into the light by tilting the surface across them (xyz) and
  // shading their floors (w). Near only, on dry land, never on the snow or the sand.
  const gully = Fn(() => {
    const out = vec4(0, 0, 0, 1).toVar();
    const slope = float(1).sub(nW.y);
    const k = smoothstep(0.05, 0.16, slope).mul(float(1).sub(smoothstep(0.55, 0.8, slope))).mul(float(1).sub(smoothstep(250, 600, camD)))
      .mul(step(0.8, vGW.y)).mul(float(1).sub(w.x)).toVar();
    If(k.greaterThan(L), () => {
      const down = normalize(nW.xz.add(vec2(1e-4, 0))), across = vec2(down.y.negate(), down.x);
      const u = dot(q, across), v = dot(q, down);
      const wob = gN(vec2(v.mul(0.05), u.mul(0.02)).add(13)).sub(0.5).mul(6);
      const cr = (uu: N) => {
        const r = float(1).sub(abs(gN(vec2(uu.add(wob).mul(0.14), v.mul(0.01)).add(41)).mul(2).sub(1)));
        return pow(r, 4);
      };
      const E = 0.6;
      const c0 = cr(u), cA = cr(u.add(E)), cB = cr(u.sub(E));
      const tilt = cA.sub(cB).div(2 * E).mul(0.4).mul(k);
      out.assign(vec4(across.x.mul(tilt), 0, across.y.mul(tilt), float(1).sub(c0.mul(0.2).mul(k))));
    });
    return out;
  })();

  // Wet ground (gpu/wet.ts reflects it on the Best and High levels): the shore's band just above the
  // water, always; and as rain soaks the land, all the open ground a little and puddles in its
  // flat hollows (lying level, as water does), fewer on sand. Near only; never on snow or under
  // the water. The wet is darker, the puddles darker still (what they show is mostly reflection).
  const shoreWet = smoothstep(0.55, 0.05, vGW.y).mul(step(0, vGW.y)).mul(0.32);
  const flatK = smoothstep(0.9, 0.975, nW.y);
  // (puddles are few and small, in the hollows: the owner saw the old ones as a cow's hide, big
  // mirror-blotches over half the ground. Each has a dark rim of wet mud fading out into the soil.)
  const puddleRim = Fn(() => {
    const out = vec2(0).toVar();
    If(wetUniforms.rain.greaterThan(0.01).and(camD.lessThan(140)), () => {
      const pn = gN(q.mul(0.33).add(5)).mul(0.65).add(gN(q.mul(1.1).add(17)).mul(0.35)).add(smoothstep(1.0, 0.85, gr.x).mul(0.08));
      const thr = float(0.84).sub(wetUniforms.rain.mul(0.06));
      const k = flatK.mul(float(1).sub(w.x.mul(0.8)));
      out.assign(vec2(smoothstep(thr, thr.add(0.03), pn).mul(k), smoothstep(thr.sub(0.07), thr, pn).mul(k).mul(wetUniforms.rain)));
    });
    return out;
  })();
  const puddle = puddleRim.x;
  const wetK = max(max(max(shoreWet, wetUniforms.rain.mul(0.22).mul(flatK.mul(0.5).add(0.5))), puddle), puddleRim.y.mul(0.55))
    .mul(float(1).sub(snow)).mul(float(1).sub(sea)).mul(float(1).sub(smoothstep(90, 140, camD)));
  setWet(m, wetK, puddle);
  const wetDark = float(1).sub(wetK.mul(0.42)).sub(puddle.mul(0.2)).sub(puddleRim.y.mul(0.12));

  m.colorNode = Fn(() => {
    const { W, ST, CD, SEA, FD, N_, samp, tri, side, bx, bz, bsum, sampR, regW, keep } = setup();
    void sampR;
    const SN = snow.toVar();
    const det0 = vec3(0).toVar(), ao0 = float(0).toVar(), grain = float(1).toVar();
    const withAo = CD.lessThan(260);
    If(FD.greaterThan(0.001), () => {
      const flat = float(1).sub(ST);
      // each scan at two scales, so no repeat reads as a grid across the ground; its occlusion at one
      const layer = (wt: N, t: { diff: THREE.Texture; arm: THREE.Texture }, sc: number, gain: number) => {
        If(wt.greaterThan(L), () => {
          det0.addAssign(samp(t.diff, sc).rgb.mul(0.6).add(samp(t.diff, sc * 2.618).rgb.mul(0.4)).mul(gain).mul(wt).mul(flat));
          If(withAo, () => {
            ao0.addAssign(samp(t.arm, sc).r.mul(wt).mul(flat));
          });
        });
      };
      If(flat.greaterThan(L), () => {
        layer(W.x, sand, 3, 1.9);
        layer(W.y.mul(keep), rock, 4, 2.2);
        layer(W.z.mul(keep), meadow, 2.2, 2.6);
        // each region's own soil, read only where that region holds sway (its colour is stored
        // as is: squared, about, into light)
        REGION_SCAN.forEach((k, ri) => {
          if (k < 0) return;
          const wt = regW[ri];
          If(wt.greaterThan(L), () => {
            const c = sampR(k, REGION_SC).rgb.mul(0.6).add(sampR(k, REGION_SC * 2.618).rgb.mul(0.4));
            det0.addAssign(c.mul(c).mul(REGION_GAIN[k]).mul(wt).mul(flat));
            If(withAo, () => {
              // no occlusion map of their own: their darker grains stand in for it
              ao0.addAssign(smoothstep(0.0, 0.5, dot(c, vec3(0.3, 0.5, 0.2))).mul(0.5).add(0.5).mul(wt).mul(flat));
            });
          });
        });
      });
      // steep ground is a cliff: the cliff scan wrapped round it (triplanar), near at its own
      // scale, far much larger so its strata still read from a kilometre away
      If(ST.greaterThan(L), () => {
        const farK = smoothstep(120, 600, CD);
        const cl = tmix(tri(cliff.diff, CS).rgb, tri(cliff.diff, CS * 9).rgb, farK);
        // strata: the faces banded by the rock's layers (a hand to a man's height each, wavering
        // with the beds), each band its own tone, a dark seam under every ledge
        const by = vGW.y.add(gN(q.mul(0.04)).mul(5)).add(gN(q.mul(0.3).add(9)).mul(0.5));
        const bed = fract(by.div(1.6)), bedId = floor(by.div(1.6));
        const strata = tmix(float(0.74), float(1.18), gH(vec2(bedId, 3))).mul(smoothstep(0.0, 0.12, bed).mul(0.35).add(0.65));
        // on the mountains, beds of a massif's own: tilted (they dip across the range), a few metres
        // thick with finer layers within, and dark streaks where water and lichen run down the faces
        const byM = vGW.y.add(dot(q, vec2(0.6, 0.8)).mul(0.17)).add(gN(q.mul(0.011)).mul(16)).add(gN(q.mul(0.08).add(3)).mul(1.4));
        const bedM = fract(byM.div(6.5)), idM = floor(byM.div(6.5));
        const fineM = tmix(float(0.9), float(1.08), gH(vec2(floor(byM.div(1.3)), 5)));
        const strataM = tmix(float(0.68), float(1.25), gH(vec2(idM, 11))).mul(smoothstep(0.0, 0.07, bedM).mul(0.42).add(0.58)).mul(fineM);
        const faceU = dot(q, normalize(vec2(N_.z.negate(), N_.x).add(vec2(1e-4, 0))));
        const streak = smoothstep(0.55, 0.82, gN(vec2(faceU.mul(0.42), vGW.y.mul(0.011)).add(19)).mul(0.75).add(gN(vec2(faceU.mul(1.7), vGW.y.mul(0.05))).mul(0.25)));
        const runK = smoothstep(0.35, 0.7, float(1).sub(N_.y));
        const sM = strataM.mul(float(1).sub(streak.mul(runK).mul(0.42)));
        // the cliff scan where the ground is truly steep; on a mountain's gentler ground (rock by
        // its height, not its slope) the scree scan instead (the cliff's strata, seen from above,
        // streaked the low light into crescents across whole slopes)
        const cW = ST.mul(tmix(float(0.2), float(1), smoothstep(0.12, 0.4, float(1).sub(N_.y)))).toVar();
        const gW = ST.sub(cW).toVar();
        det0.addAssign(cl.mul(2.3).mul(cW).mul(tmix(tmix(float(1), strata, 0.85), sM, mtn)));
        If(gW.greaterThan(L), () => {
          det0.addAssign(samp(rock.diff, 4).rgb.mul(0.6).add(samp(rock.diff, 10.5).rgb.mul(0.4)).mul(2.2).mul(gW));
        });
        If(withAo, () => {
            ao0.addAssign(side(cliff.arm, CS, "zy").r.mul(bx).add(side(cliff.arm, CS, "xy").r.mul(bz)).div(bsum).mul(cW));
            If(gW.greaterThan(L), () => {
              ao0.addAssign(samp(rock.arm, 4).r.mul(gW));
            });
          });
      });
      If(SN.greaterThan(L), () => {
        grain.assign(dot(side(sand.diff, 2.4, "xz").rgb, vec3(0.3, 0.5, 0.2)).mul(0.5).add(0.8));
      });
    });
    // the scans' own occlusion: every pebble, crack and hollow darkens as in the temple's stone
    const ao = tmix(float(1), tmix(float(0.3), float(1.08), ao0), float(1).sub(smoothstep(40, 260, CD)));
    // keep the moonlit palette: mostly the scan's light and shade, a little of its colour
    const det = tmix(vec3(dot(det0, vec3(0.3, 0.5, 0.2))), det0, 0.72).mul(ao);
    // broad variation over the land, so the far country is never one flat colour
    const macro = tmix(float(0.86), float(1.1), gN(q.mul(0.0035))).mul(tmix(float(0.93), float(1.05), gN(q.mul(0.021).add(7))));
    const ground = tmix(vec3(1), det, FD).mul(macro).toVar();
    // Soil, close by: dark humus in the meadow's hollows, scattered pebbles and flecks of litter,
    // and the shore's wet band (darker, richer) just above the water; all procedural, near only
    If(CD.lessThan(48).and(SEA.lessThan(0.5)).and(ST.lessThan(0.5)), () => {
      const nearK = float(1).sub(smoothstep(14, 48, CD));
      const land = float(1).sub(W.x);
      const humus = smoothstep(0.52, 0.74, gN(q.mul(0.16).add(51))).mul(smoothstep(0.3, 0.7, gN(q.mul(0.9).add(8)))).mul(W.z).mul(0.5);
      ground.assign(ground.mul(tmix(vec3(1), vec3(0.62, 0.52, 0.45), humus.mul(nearK))));
      const pc2 = floor(q.mul(5)), pf2 = fract(q.mul(5)).sub(0.5);
      const off2 = vec2(gH(pc2.add(11)), gH(pc2.add(17))).sub(0.5).mul(0.5);
      const stone = step(0.8, gH(pc2)).mul(smoothstep(0.2, 0.09, length(pf2.sub(off2)))).mul(land);
      const tone = tmix(vec3(0.42, 0.38, 0.33), vec3(0.64, 0.6, 0.54), gH(pc2.add(5)));
      ground.assign(tmix(ground, tone.mul(0.9), stone.mul(nearK).mul(0.8)));
      const lc = floor(q.mul(11)), lf = fract(q.mul(11)).sub(0.5);
      const leaf = step(0.9, gH(lc.add(29))).mul(smoothstep(0.17, 0.06, length(lf.mul(vec2(1, 2.2))))).mul(W.z);
      ground.assign(tmix(ground, vec3(0.3, 0.2, 0.1), leaf.mul(nearK).mul(0.6)));
      const wet = smoothstep(1.7, 0.1, vGW.y).mul(step(0, vGW.y)).mul(0.5).mul(nearK.mul(0.6).add(0.4));
      ground.assign(ground.mul(tmix(vec3(1), vec3(0.55, 0.5, 0.46), wet)));
    });
    // The lake floors (after the drowned tombs of Jedi: Fallen Order's Zeffo): fine grey-green
    // silt settled over the sand, dark patches of growth, pebbles and shell-grit scattered, and
    // the deeper, the more of it; a floor you'd want to swim low over, not a plain of sand.
    If(SEA.greaterThan(L), () => {
      const siltN = gN(q.mul(0.35)).mul(0.6).add(gN(q.mul(1.3).add(9)).mul(0.4));
      const silt = tmix(vec3(0.62, 0.66, 0.6), vec3(0.45, 0.5, 0.47), siltN).mul(samp(sand.diff, 1.6).rgb.mul(1.7));
      const growth = smoothstep(0.58, 0.72, gN(q.mul(0.18).add(31))).mul(smoothstep(0.35, 0.65, gN(q.mul(0.9).add(4))));
      const pc = floor(q.mul(2.4)), pbf = fract(q.mul(2.4)).sub(0.5);
      const pebble = step(0.86, gH(pc)).mul(smoothstep(0.26, 0.12, length(pbf.add(vec2(gH(pc.add(3)), gH(pc.add(7))).sub(0.5).mul(0.4)))));
      const floorC = tmix(tmix(silt, vec3(0.12, 0.2, 0.13), growth.mul(0.8)), vec3(0.78, 0.74, 0.66), pebble.mul(0.7)).mul(ao);
      ground.assign(tmix(ground, floorC, SEA.mul(float(1).sub(ST.mul(0.6)))));
    });
    // the rock darkens into its crevices (the crags' hollows), the snow keeps its white
    const crev = tmix(float(1), smoothstep(0.15, 0.7, cragN.x).mul(0.5).add(0.62), mtn);
    // snow is bluer where it lies deep in a hollow out of the light, whiter on what stands up
    const hollow = smoothstep(0.55, 0.15, cragN.x);
    const snowC = tmix(vec3(0.5, 0.49, 0.7), vec3(0.76, 0.78, 0.89), smoothstep(150, 230, vGW.y)).mul(grain).mul(tmix(vec3(1.03), vec3(0.8, 0.86, 1.02), hollow));
    const base = ground.mul(T.vertexColor().rgb).toVar();
    // Each region's own ground at a scale the eye reads walking (the scans alone are a fine grain
    // that reads as the same noise everywhere). Broad patches (frost, chalk) lighten the ground
    // under them, keeping its grain: laid as a flat colour they read as grey stains from above.
    // Frost crusts and lichen on the tundra, drifts of
    // fallen leaves in the autumn forest, pale ash blown over black, heather mottling the moor,
    // the red rock's cracked plates, moss cushions, chalk showing white through the downs.
    If(CD.lessThan(160).and(SEA.lessThan(0.5)), () => {
      const nk = float(1).sub(smoothstep(60, 160, CD)).mul(float(1).sub(ST)).toVar();
      const ptc = (sc: number, a: number, b: number, o: number) => smoothstep(a, b, gN(q.mul(sc).add(o)).mul(0.7).add(gN(q.mul(sc * 3.1).add(o + 3)).mul(0.3)));
      const g0 = base;
      // E: frost crusts, pale and blue; lichen spots, yellow-green
      If(regW[0].greaterThan(L), () => {
        const frost = ptc(0.35, 0.55, 0.7, 11);
        const lc = floor(q.mul(3)), lf = fract(q.mul(3)).sub(0.5);
        const lichen = step(0.72, gH(lc.add(3))).mul(smoothstep(0.32, 0.12, length(lf)));
        g0.assign(g0.mul(tmix(vec3(1), vec3(1.35, 1.45, 1.7), frost.mul(0.6).mul(regW[0]).mul(nk))));
        g0.assign(tmix(g0, vec3(0.2, 0.22, 0.06), lichen.mul(0.6).mul(regW[0]).mul(nk)));
      });
      // NE: fallen leaves, gathered in drifts, each its own colour
      If(regW[1].greaterThan(L), () => {
        const drift = ptc(0.3, 0.42, 0.62, 23);
        const lc = floor(q.mul(4)), lf = fract(q.mul(4)).sub(0.5);
        const rot = gH(lc.add(9)).mul(6.283);
        const lv = vec2(lf.x.mul(T.cos(rot)).sub(lf.y.mul(T.sin(rot))), lf.x.mul(T.sin(rot)).add(lf.y.mul(T.cos(rot))));
        const leaf = step(0.35, gH(lc)).mul(smoothstep(0.24, 0.12, length(lv.mul(vec2(1, 1.9)))));
        const lcol = tmix(tmix(vec3(0.32, 0.07, 0.015), vec3(0.42, 0.2, 0.025), gH(lc.add(5))), vec3(0.2, 0.035, 0.02), step(0.8, gH(lc.add(7))));
        g0.assign(tmix(g0, lcol, leaf.mul(drift.mul(0.75).add(0.2)).mul(regW[1]).mul(nk)));
      });
      // N: pale ash blown over black, in long drifts
      If(regW[2].greaterThan(L), () => {
        const ash = smoothstep(0.5, 0.75, gN(vec2(q.x.mul(0.25), q.y.mul(0.8)).add(31)));
        g0.assign(tmix(g0, vec3(0.16, 0.16, 0.17), ash.mul(0.7).mul(regW[2]).mul(nk)));
      });
      // NW: heather, purple and brown in mottled cushions
      If(regW[3].greaterThan(L), () => {
        const h1 = ptc(0.9, 0.45, 0.62, 41), h2 = ptc(2.6, 0.5, 0.7, 47);
        g0.assign(tmix(g0, tmix(vec3(0.11, 0.035, 0.09), vec3(0.2, 0.08, 0.15), h2), h1.mul(0.7).mul(regW[3]).mul(nk)));
      });
      // SW: the red ground cracked into plates
      If(regW[5].greaterThan(L), () => {
        const pc = q.mul(0.9).add(vec2(gN(q.mul(0.7)), gN(q.mul(0.7).add(5))).mul(0.8));
        const cf = fract(pc).sub(0.5), crack = smoothstep(0.44, 0.49, max(abs(cf.x), abs(cf.y)));
        g0.assign(g0.mul(tmix(float(1), float(0.45), crack.mul(regW[5]).mul(nk))));
      });
      // S: moss cushions, deep and bright green
      If(regW[6].greaterThan(L), () => {
        const moss = ptc(0.6, 0.45, 0.6, 61);
        g0.assign(tmix(g0, tmix(vec3(0.03, 0.09, 0.015), vec3(0.07, 0.17, 0.025), ptc(3, 0.3, 0.7, 63)), moss.mul(0.75).mul(regW[6]).mul(nk)));
      });
      // SE: chalk showing white through thin turf
      If(regW[7].greaterThan(L), () => {
        const chalk = ptc(0.45, 0.6, 0.74, 71);
        g0.assign(g0.mul(tmix(vec3(1), vec3(1.45, 1.42, 1.32), chalk.mul(0.6).mul(regW[7]).mul(nk))));
      });
    });
    // The far canopy (for the view from the air): where the trees' likenesses end (~480 m), the
    // forest goes on as the ground's own cover: clumps of crowns as thick as the groves stand, each
    // lit on the side toward the moon or the low sun and darker in the gaps, green, gold in the
    // autumn wood, silvered in the frost and the ash. Seen only far off.
    If(CD.greaterThan(360).and(gr.w.greaterThan(0.03)).and(SEA.lessThan(0.5)), () => {
      const cq = q.mul(0.12);
      const n = gN(cq).mul(0.62).add(gN(q.mul(0.37).add(5)).mul(0.38));
      const thr = float(1).sub(gr.w.mul(0.8)).sub(0.08);
      const cover = smoothstep(thr, thr.add(0.1), n).mul(smoothstep(380, 470, CD)).mul(float(1).sub(ST));
      const lit = gN(cq.add(fogUniforms.glowDir.xz.mul(0.35))).sub(gN(cq)).mul(-2.2).add(0.8).clamp(0.45, 1.25);
      const crown = smoothstep(thr, thr.add(0.35), n).mul(0.55).add(0.55).mul(lit);
      const gold = regW[1], silver = regW[0].add(regW[2]).add(regW[7]).min(1);
      const leafC = tmix(tmix(vec3(0.045, 0.085, 0.035), vec3(0.2, 0.11, 0.035), gold), vec3(0.09, 0.11, 0.1), silver);
      base.assign(tmix(base, leafC.mul(crown), cover));
    });
    return vec4(tmix(base.mul(crev).mul(gully.w), snowC, SN).mul(gr.x).mul(wetDark), 1);
  })();

  // Sand, as in Journey: ripples the wind combs across it (two wavelengths, bent by slow noise),
  // tilting its surface so the light catches their crests; each set fades where it grows finer
  // than the pixels can show (it aliased into a diamond moiré). fwidth before any branch.
  const WIND = vec2(0.8, 0.6);
  const ripPh = dot(q, WIND).mul(6.3).add(gN(q.mul(0.25)).mul(7)), ripPh2 = dot(q, vec2(0.6, -0.8)).mul(15).add(gN(q.mul(0.9)).mul(4));
  const aa = (ph: N) => float(1).sub(smoothstep(0.6, 1.6, fwidth(ph)));
  const ripK = w.x.mul(float(1).sub(smoothstep(12, 45, camD))).mul(float(1).sub(steep));
  const dRip = vec3(WIND.x, 0, WIND.y).mul(sin(ripPh).mul(0.13).mul(aa(ripPh))).add(vec3(0.6, 0, -0.8).mul(sin(ripPh2).mul(0.06).mul(aa(ripPh2)))).mul(ripK);

  // the scans' relief: each surface's normal map, blended as the ground is, and only near
  const dW = Fn(() => {
    const { W, ST, CD, N_, dqx, dqy, samp, side, bx, bz, by, bsum, sampR, regW, keep } = setup();
    const SN = snow.toVar();
    const d = vec3(0).toVar();
    const nm = (t: THREE.Texture, sc: number) => samp(t, sc).xy.mul(2).sub(1);
    const flat = float(1).sub(ST);
    If(CD.lessThan(160).and(flat.greaterThan(L)), () => {
      const near = float(1).sub(smoothstep(30, 160, CD)).mul(flat).mul(1.8);
      // and close by, the same scans again at a finer scale: grit under the feet, never a blur
      const close = float(1).sub(smoothstep(4, 16, CD)).mul(0.55);
      const layer = (wt: N, t: THREE.Texture, sc: number, gain: number, fine: number) => {
        If(wt.greaterThan(L), () => {
          const n = nm(t, sc).mul(gain).toVar();
          If(CD.lessThan(16), () => {
            n.addAssign(nm(t, fine).mul(close));
          });
          d.addAssign(vec3(n.x, 0, n.y.negate()).mul(wt).mul(near));
        });
      };
      layer(W.x, sand.nor, 3, 0.9, 0.9);
      layer(W.y.mul(keep), rock.nor, 4, 1.2, 1.1);
      layer(W.z.mul(keep), meadow.nor, 2.2, 0.8, 0.7);
      REGION_SCAN.forEach((k, ri) => {
        if (k < 0) return;
        const wt = regW[ri];
        If(wt.greaterThan(L), () => {
          const n = sampR(k + REGION_LAYERS, REGION_SC).xy.mul(2).sub(1).mul(0.85);
          d.addAssign(vec3(n.x, 0, n.y.negate()).mul(wt).mul(near));
        });
      });
    });
    // on a cliff, each side's normal map turns about its own plane (x-facing: z and y; z-facing: x and y)
    If(CD.lessThan(400).and(ST.greaterThan(L)), () => {
      const nX = side(cliff.nor, CS, "zy").xy.mul(2).sub(1), nZ = side(cliff.nor, CS, "xy").xy.mul(2).sub(1), nY = side(cliff.nor, CS, "xz").xy.mul(2).sub(1);
      const sK = smoothstep(0.12, 0.4, float(1).sub(N_.y));
      const dc = vec3(0, nX.y, nX.x).mul(bx).add(vec3(nZ.x, nZ.y, 0).mul(bz)).add(vec3(nY.x, 0, nY.y.negate()).mul(by)).div(bsum)
        .mul(float(1).sub(smoothstep(60, 400, CD))).mul(tmix(float(1.6), float(0.5), SN));
      d.addAssign(dc.mul(ST).mul(tmix(float(0.2), float(1), sK)));
      // the mountain's gentler ground: the scree scan's relief, near only
      If(CD.lessThan(160), () => {
        const gn = nm(rock.nor, 4).mul(ST).mul(float(1).sub(sK)).mul(float(1).sub(smoothstep(30, 160, CD))).mul(float(1).sub(SN));
        d.addAssign(vec3(gn.x, 0, gn.y.negate()));
      });
    });
    // wind-carved snow (sastrugi): ridges across the wind, wandering, near only
    If(SN.greaterThan(L).and(CD.lessThan(400)), () => {
      const sp = dot(q, vec2(0.6, -0.8)).mul(1.6).add(gN(q.mul(0.07).add(29)).mul(9)).add(gN(q.mul(0.4)).mul(1.5));
      // (its fineness on screen from the derivatives taken before any branch)
      const fq = vec2(0.6 * 1.6, -0.8 * 1.6);
      const aaS = float(1).sub(smoothstep(0.6, 1.6, abs(dot(dqx, fq)).add(abs(dot(dqy, fq)))));
      d.addAssign(vec3(0.6, 0, -0.8).mul(sin(sp).mul(0.1).mul(aaS)).mul(SN).mul(float(1).sub(smoothstep(80, 400, CD))));
    });
    return d;
  })().add(dRip).add(dCrag).add(gully.xyz);
  m.normalNode = normalize(normalView.add(cameraViewMatrix.mul(vec4(dW, 0)).xyz));

  m.emissiveNode = Fn(() => {
    const gv = normalize(cameraPosition.sub(vGW));
    // glitter: grains of sand that catch the light as you move
    const gq = vGW.xz.mul(22), cell = floor(gq);
    const tw = gH(cell.mul(1.7).add(floor(gv.xz.mul(24).add(gv.y.mul(11)))));
    const dot_ = smoothstep(0.22, 0, length(fract(gq).sub(0.5))); // a point of light, not a fleck
    const glit = step(0.975, gH(cell)).mul(step(0.6, tw)).mul(dot_).mul(gr.y).mul(float(1).sub(smoothstep(4, 30, camD))).mul(step(0, vGW.y));
    const e = vec3(1.0, 0.93, 0.82).mul(glit).mul(2.2).toVar();
    // and crystals of snow, as you move over it
    const sq = vGW.xz.mul(30), sc2 = floor(sq);
    const tw2 = gH(sc2.mul(1.3).add(floor(gv.xz.mul(30).add(gv.y.mul(13)))));
    const sglit = step(0.982, gH(sc2.add(7))).mul(step(0.65, tw2)).mul(smoothstep(0.2, 0, length(fract(sq).sub(0.5)))).mul(snow).mul(float(1).sub(smoothstep(3, 25, camD)));
    e.addAssign(vec3(0.85, 0.9, 1.0).mul(sglit).mul(1.6));
    // a soft sheen where the ground faces away toward the moon (light through the haze)
    // Journey's sand: a liquid sheen toward the low sun or the moon, off the rippled surface (soft,
    // broad and faint: never a glare sliding over the ground), and a pale rim at grazing angles
    const nS = normalize(nW.add(dRip.mul(1.2)));
    const sheen = pow(max(dot(T.reflect(gv.negate(), nS), fogUniforms.glowDir), 0), 24).mul(0.16);
    const rim = pow(float(1).sub(max(dot(nS, gv), 0)), 5).mul(0.05);
    e.addAssign(fogUniforms.glow.mul(sheen.add(rim)).mul(gr.y).mul(float(1).sub(steep)).mul(float(1).sub(smoothstep(60, 220, camD))));
    const back = pow(max(dot(gv.negate(), moon), 0), 3);
    e.addAssign(vec3(0.32, 0.26, 0.24).mul(back).mul(gr.y.mul(0.7).add(0.3)).mul(0.18));
    return e;
  })();
  void abs;
  return m;
}

const _fillW = new Float64Array(8);
const NEUTRAL = new THREE.Color(0.5, 0.5, 0.54);

export class Terrain {
  group = new THREE.Group();
  private tiles = LEVELS.map(() => new Map<string, THREE.Mesh>());
  private pools = LEVELS.map(() => [] as THREE.Mesh[]);
  private centre = LEVELS.map(() => [Infinity, Infinity]);
  private material = groundMaterial();
  private col = new THREE.Color();
  private tmp = new THREE.Color();

  /** Keep the wanderer in the middle of every level. `force` builds everything now.
      Each level's ground sinks out of sight only where the finer level's tiles already stand,
      and a tile left behind goes only after the coarser ground under it has risen again: done
      the other way round, flying fast left holes with straight edges, splits across the land. */
  update(x: number, z: number, force = false): void {
    LEVELS.forEach((L, li) => {
      const cx = Math.floor(x / L.chunk), cz = Math.floor(z / L.chunk);
      if (!force && cx === this.centre[li][0] && cz === this.centre[li][1]) return;
      this.centre[li] = [cx, cz];
      for (let i = -L.ring; i <= L.ring; i++)
        for (let j = -L.ring; j <= L.ring; j++) {
          const k = `${cx + i},${cz + j}`;
          if (!this.tiles[li].has(k)) this.push(li, k, false);
        }
      for (const k of this.tiles[li].keys()) if (!this.wanted(li, k)) this.retire(li, k);
    });
    if (force) {
      while (this.queue.length) this.runNext();
      return;
    }
    // about a tile a frame (~10 ms of work each on a phone), so walking never stutters; while
    // much is waiting (flying fast), a little more
    const t0 = performance.now(), budget = this.queue.length > 12 ? 7 : 3;
    let built = 0;
    while (this.queue.length && (built === 0 || performance.now() - t0 < budget)) if (this.runNext()) built++;
  }

  private queue: { li: number; k: string }[] = [];
  /** Tiles still to build (for the loading mark). */
  get pending(): number {
    return this.queue.length;
  }
  private queued = new Set<string>();

  /** Queue building (or rebuilding) a tile; `last` moves it behind everything already waiting. */
  private push(li: number, k: string, last: boolean): void {
    const key = `${li}:${k}`;
    if (this.queued.has(key)) {
      if (!last) return;
      this.queue.splice(this.queue.findIndex((q) => q.li === li && q.k === k), 1);
    }
    this.queued.add(key);
    this.queue.push({ li, k });
  }

  private runNext(): boolean {
    const { li, k } = this.queue.shift()!;
    this.queued.delete(`${li}:${k}`);
    if (!this.wanted(li, k)) return false; // passed by before its turn came
    const L = LEVELS[li], tiles = this.tiles[li];
    const [i, j] = k.split(",").map(Number);
    const fresh = !tiles.has(k);
    const m = tiles.get(k) ?? this.pools[li].pop() ?? this.newMesh(L, li === 0);
    this.fill(m, li, i, j);
    if (fresh) {
      tiles.set(k, m);
      this.group.add(m);
    }
    // the finer tiles left behind here can go now: this ground has risen under them
    if (li > 0) for (const fk of this.children(li, k)) if (!this.wanted(li - 1, fk)) this.drop(li - 1, fk);
    // a new tile: the coarser ground beneath it can sink
    if (fresh && li < LEVELS.length - 1) this.push(li + 1, this.parent(li, i, j), true);
    return true;
  }

  private wanted(li: number, k: string): boolean {
    const L = LEVELS[li], [cx, cz] = this.centre[li];
    const [i, j] = k.split(",").map(Number);
    return Math.abs(i - cx) <= L.ring && Math.abs(j - cz) <= L.ring;
  }

  private parent(li: number, i: number, j: number): string {
    const r = LEVELS[li + 1].chunk / LEVELS[li].chunk;
    return `${Math.floor(i / r)},${Math.floor(j / r)}`;
  }

  /** The finer tiles standing inside a tile. */
  private children(li: number, k: string): string[] {
    const r = LEVELS[li].chunk / LEVELS[li - 1].chunk;
    const [i, j] = k.split(",").map(Number);
    const out: string[] = [];
    for (const fk of this.tiles[li - 1].keys()) {
      const [a, b] = fk.split(",").map(Number);
      if (Math.floor(a / r) === i && Math.floor(b / r) === j) out.push(fk);
    }
    return out;
  }

  /** A tile no longer wanted: it goes once the ground beneath it is rebuilt (or at once, if it
      is the coarsest, or if the ground beneath is going too). */
  private retire(li: number, k: string): void {
    if (li === LEVELS.length - 1) return this.drop(li, k);
    const [i, j] = k.split(",").map(Number);
    const pk = this.parent(li, i, j);
    if (this.wanted(li + 1, pk) && this.tiles[li + 1].has(pk)) this.push(li + 1, pk, true);
    else if (!this.wanted(li + 1, pk)) {
      /* the parent is leaving too: its own retirement takes this one with it */
    } else this.drop(li, k); // nothing beneath yet (it's being built): nothing to wait for
  }

  private drop(li: number, k: string): void {
    const m = this.tiles[li].get(k);
    if (!m) return;
    if (li > 0) for (const fk of this.children(li, k)) if (!this.wanted(li - 1, fk)) this.drop(li - 1, fk);
    this.group.remove(m);
    this.pools[li].push(m);
    this.tiles[li].delete(k);
  }

  /** Whether the finer level stands (and stays) over this spot, so this level may sink here. */
  private coveredBelow(li: number, x: number, z: number): boolean {
    // integer keys, remembered for the tile being filled (it asks four times for each vertex,
    // mostly about the same few finer tiles): no strings built per vertex
    const L = LEVELS[li - 1], [cx, cz] = this.centre[li - 1];
    for (let c = 0; c < 4; c++) {
      const i = Math.floor((x + (c & 1 ? 0.01 : -0.01)) / L.chunk), j = Math.floor((z + (c & 2 ? 0.01 : -0.01)) / L.chunk);
      if (Math.abs(i - cx) > L.ring || Math.abs(j - cz) > L.ring) return false; // not wanted
      const key = (i + 50000) * 100003 + (j + 50000);
      let has = this.coverMemo.get(key);
      if (has === undefined) this.coverMemo.set(key, (has = this.tiles[li - 1].has(`${i},${j}`)));
      if (!has) return false;
    }
    return true;
  }
  private coverMemo = new Map<number, boolean>();

  private newMesh(L: Level, isNear: boolean): THREE.Mesh {
    const g = new THREE.PlaneGeometry(L.chunk, L.chunk, L.seg, L.seg);
    g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count;
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aGround", new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    // each region's weight there (away × its share): E, NE, N, NW | W, SW, S, SE
    g.setAttribute("aRegA", new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    g.setAttribute("aRegB", new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    const m = new THREE.Mesh(g, this.material);
    m.receiveShadow = isNear;
    m.frustumCulled = true;
    return m;
  }

  private fill(m: THREE.Mesh, li: number, i: number, j: number): void {
    const L = LEVELS[li];
    const ox = (i + 0.5) * L.chunk, oz = (j + 0.5) * L.chunk;
    m.position.set(ox, 0, oz);
    const g = m.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const col = g.attributes.color as THREE.BufferAttribute;
    const gr = g.attributes.aGround as THREE.BufferAttribute;
    const rA = g.attributes.aRegA as THREE.BufferAttribute, rB = g.attributes.aRegB as THREE.BufferAttribute;
    const n = L.seg + 1, B = 4; // a border of four cells, for normals and the sky-seen shading
    const W = n + 2 * B;
    const step = L.chunk / L.seg;
    const H = new Float32Array(W * W);
    this.coverMemo.clear();
    for (let b = 0; b < W; b++)
      for (let a = 0; a < W; a++) {
        const hx = ox + ((a - B) - L.seg / 2) * step, hz = oz + ((b - B) - L.seg / 2) * step;
        // the far levels' vertices fall on the coarse lattice (every 8 or 32 m): read them through its
        // cache (exactly heightAt there), shared with the camera's ray, autofly and the next tile's border
        H[b * W + a] = li > 0 && hx < 20000 && hx % COARSE === 0 && hz % COARSE === 0 ? corner(hx / COARSE, hz / COARSE) : heightAt(hx, hz);
      }
    for (let v = 0; v < pos.count; v++) {
      const a = (v % n) + B, b = Math.floor(v / n) + B;
      const lx = (a - B - L.seg / 2) * step, lz = (b - B - L.seg / 2) * step;
      const x = ox + lx, z = oz + lz;
      const h = H[b * W + a];
      // hidden beneath the near tiles?
      const sunk = li > 0 && this.coveredBelow(li, x, z);
      pos.setXYZ(v, lx, sunk ? h - 40 : h, lz);
      const dx = H[b * W + a - 1] - H[b * W + a + 1], dz = H[(b - 1) * W + a] - H[(b + 1) * W + a];
      const inv = 1 / Math.hypot(dx, 2 * step, dz);
      nor.setXYZ(v, dx * inv, 2 * step * inv, dz * inv);
      // how much sky this spot sees: hollows darker, crests a little brighter
      let avg = 0;
      for (let o = 0; o < 16; o += 2) avg += H[(b + SKY_TAPS[o + 1]) * W + a + SKY_TAPS[o]];
      avg /= 8;
      const sky = Math.min(1.12, Math.max(0.5, 1 - ((avg - h) * 0.9) / Math.max(4, step * B)));
      // talus: where a cliff stands just above (the land rising steeply within a few metres) and the
      // ground here has eased off, the rock that fell lies in a skirt of scree round its foot
      let rise = 0;
      for (let o = 0; o < 16; o += 2) rise = Math.max(rise, H[(b + SKY_TAPS[o + 1]) * W + a + SKY_TAPS[o]] - h);
      const talus = smooth(2.5, 7, rise / Math.max(1, step * 2) * 4) * smooth(0.55, 0.85, nor.getY(v)) * (h > 0.6 ? 1 : 0);
      const k = groundKind(x, z, h);
      const region = fbm(x * 0.004 + 9, z * 0.004 - 4);
      this.col.copy(C.meadowA).lerp(C.meadowB, smooth(0.35, 0.6, region)).lerp(C.meadowC, smooth(0.6, 0.78, region));
      // out from the shore, the country of the sky above (its colour, shaded within by slow noise)
      const ms = massifAt(x, z);
      const away = regionWeights(x, z, _fillW) * (1 - ms);
      rA.setXYZW(v, away * _fillW[0], away * _fillW[1], away * _fillW[2], away * _fillW[3]);
      rB.setXYZW(v, away * _fillW[4], away * _fillW[5], away * _fillW[6], away * _fillW[7]);
      const rg = regionAt(x, z);
      // the region's own tint, eased toward a neutral moonlit grey where its own soil scan carries
      // the colour (all but the dunes, which keep the sand scan and their ochre)
      if (away > 0)
        this.col.lerp(this.tmp.copy(rg.col).lerp(NEUTRAL, 0.15 * (1 - _fillW[4])).multiplyScalar(0.82 + 0.36 * fbm(x * 0.012 - 3, z * 0.012 + 8)), away * 0.96);
      this.col.lerp(this.tmp.copy(C.sand), k.sand * (1 - away * 0.85)).lerp(C.stone, k.stone * (1 - away * 0.85));
      // the mountains: bare dark rock on their steep faces (the snow is laid by the ground's shader)
      const up = nor.getY(v);
      // on a massif's lower slopes alpine ground: thin tussock over scree, olive and grey in patches
      if (ms > 0) this.col.lerp(this.tmp.copy(C.alpine).lerp(C.scree, smooth(0.35, 0.7, fbm(x * 0.02 + 41, z * 0.02 - 13))), ms * 0.85);
      const mount = smooth(25, 60, h);
      this.col.lerp(C.granite, mount * smooth(0.9, 0.62, up));
      // broad stretches of bare earth, warm and deeply textured
      const earth = smooth(0.42, 0.62, fbm(x * 0.005 + 123, z * 0.005 - 7)) * (1 - k.sand) * smooth(0.6, 2.5, h) * (1 - away * 0.8);
      this.tmp.copy(C.earth).lerp(C.loam, smooth(0.3, 0.7, fbm(x * 0.03 - 9, z * 0.03 + 4)));
      this.col.lerp(this.tmp, earth * 0.8);
      if (talus > 0) this.col.lerp(this.tmp.copy(C.stone).lerp(C.granite, 0.5), talus * 0.45);
      // the hollows hold brown earth (soil washed down into them), the crests keep their green
      const dip = smooth(0.98, 0.7, sky) * (1 - k.sand) * (1 - ms) * smooth(0.3, 1.2, h);
      if (dip > 0) this.col.lerp(C.hollow, dip * 0.7);
      // the Nile's floodplain: a patchwork of fields along the river
      const fk = nileFields(x, z, this.tmp);
      if (fk > 0) this.col.lerp(this.tmp, fk * 0.9);
      if (h < 0.1) this.col.lerp(C.wet, smooth(0.1, -0.6, h));
      // the rock behind and beside a waterfall: dark with wet, and moss along its edges
      const wetK = fallWet(x, z, h);
      if (wetK > 0) this.col.lerp(this.tmp.setRGB(0.045, 0.055, 0.06), wetK * 0.7).lerp(this.tmp.setRGB(0.06, 0.1, 0.045), wetK * (1 - wetK) * 1.2);
      col.setXYZ(v, this.col.r, this.col.g, this.col.b);
      const sandy = Math.min(1, k.sand + smooth(0.45, 0.62, fbm(x * 0.01 - 30, z * 0.01 + 12)) * (1 - k.stone) * 0.6 * (1 - away * 0.7)) * (1 - fk);
      // the earth takes the rock scan's grit and the sand's grain
      const rocky = Math.min(1 - sandy * (1 - talus), k.stone + smooth(0.5, 1.0, 1 - nor.getY(v)) * 0.8 + earth * 0.55 + talus * 0.85 + ms * 0.55);
      // how thick the forest stands here (the same groves and densities the trees are placed by), for
      // the far canopy the ground draws where the trees' likenesses end
      let forest = 0;
      if (h > WATER_Y + 0.7 && h < 28 && k.stone < 0.5 && up > 0.8) {
        const grove = smooth(0.46, 0.64, fbm(x * 0.008 + 71, z * 0.008 - 33));
        forest = Math.min(1, (0.035 + grove * 0.36) * (1 + (rg.trees - 1) * rg.away) * 1.7) * (1 - fk) * (1 - ms);
        if (forest > 0.03 && keptClear(x, z)) forest = 0;
      }
      gr.setXYZW(v, sky, Math.max(0, Math.min(1 - rocky, sandy * (1 - talus) + earth * 0.3)), rocky, forest);
    }
    pos.needsUpdate = nor.needsUpdate = col.needsUpdate = gr.needsUpdate = rA.needsUpdate = rB.needsUpdate = true;
    g.computeBoundingSphere();
    g.computeBoundingBox();
  }
}

// the waterfalls: low land by the water (its plunge pool fills from the lakes' level), with room
// upstream for the height of land, clear of every site, cave, glade and each other. Two within an
// easy walk of the shore, the rest out across the land; of those, one great fall, tiered ones,
// slender ribbons, and single drops of every width.
WATERFALLS = (() => {
  const out: Fall[] = [];
  const GA = Math.PI * (3 - Math.sqrt(5));
  // [nearest, farthest, how many, the kinds they take in turn]
  const passes: [number, number, number, FallKind[]][] = [
    [170, 460, 2, ["single", "tiered"]],
    [460, 1900, 11, ["great", "single", "ribbon", "tiered", "single", "ribbon", "single", "tiered", "single", "ribbon", "single"]],
  ];
  let i = 0;
  for (const [r0, r1, want, kinds] of passes) {
    let got = 0;
    for (let k = 0; k < 1600 && got < want; k++, i++) {
      const kind = kinds[got];
      const sc = kind === "great" ? 1.55 : 1;
      const r = r0 + ((k * 0.6180339) % 1) * (r1 - r0), a = k * GA + r0 * 0.01;
      const x = SPAWN.x + Math.cos(a) * r, z = SPAWN.z + Math.sin(a) * r;
      const h = rawHeight(x, z);
      if (h < 1.8 || h > 6) continue;
      if (out.some((f) => Math.hypot(f.x - x, f.z - z) < 300 + 60 * (f.sc + sc))) continue;
      if (PADS.some((p) => Math.hypot(p.x - x, p.z - z) < p.outer + 100 * sc)) continue;
      if (keptClear(x, z, 80 * sc) || CAVE_SITES.some((c) => Math.hypot(c.x - x, c.z - z) < 130 * sc)) continue;
      if (GLADES.some((g) => Math.hypot(g.x - x, g.z - z) < g.r + 80 * sc)) continue;
      // downstream: toward the lowest land 50 m out, the ground behind dry
      let best = -1, bh = Infinity;
      for (let q = 0; q < 16; q++) {
        const b = (q / 16) * Math.PI * 2, dx = Math.cos(b), dz = Math.sin(b);
        const dn = rawHeight(x + dx * 50, z + dz * 50), up = rawHeight(x - dx * 34 * sc, z - dz * 34 * sc);
        if (up < 1 || up > 22 || dn < -6) continue;
        if (dn < bh) (bh = dn), (best = b);
      }
      if (best < 0) continue;
      const seed = ihash(i, out.length, 5) * 100, roll = ihash(i, 2, 13);
      const top = h + (kind === "great" ? 27 + roll * 6 : kind === "tiered" ? 19 + roll * 6 : kind === "ribbon" ? 15 + roll * 6 : 10 + roll * 7);
      const w = kind === "great" ? 3.4 : kind === "ribbon" ? 0.75 + roll * 0.3 : kind === "tiered" ? 1.5 : 1.2 + ihash(i, 3, 17) * 2.2;
      const mid = kind === "tiered" ? h + (top - h) * 0.48 : 0;
      const f: Fall = { x, z, dx: Math.cos(best), dz: Math.sin(best), top, seed, w, mid, sc, kind, rl: 0, bend: 0, reach: 110 * sc };
      riverFor(f, out);
      out.push(f);
      got++;
    }
  }
  for (const f of out) {
    const at = (s: number) => ({ x: f.x + f.dx * s, z: f.z + f.dz * s });
    for (const [s, r] of [[FALL_POOL, 18], [0, 10 + f.w], [-12, 6], [-26, 6], [-40, 6]] as const) KEEP_CLEAR.push({ ...at(s * f.sc), r: r * f.sc });
    // trees and stones keep off the river and its spring
    const st = fallStream(f);
    for (let s = st - 12; s > st - f.rl - 1; s -= 13) {
      const { u } = fallRiverU(f, s);
      KEEP_CLEAR.push({ x: f.x + f.dx * s - f.dz * u, z: f.z + f.dz * s + f.dx * u, r: fallRiverW(f, s) + 5.5 });
    }
    if (f.rl > 0) {
      const sf = st - f.rl, { u } = fallRiverU(f, sf);
      KEEP_CLEAR.push({ x: f.x + f.dx * sf - f.dz * u, z: f.z + f.dz * sf + f.dx * u, r: fallRiverW(f, sf) * 2.2 + 9 });
    }
  }
  return out;
})();
/** Find the course for a fall's river: the longest (up to ~210 m, more for the great fall) and
    straightest that keeps to dry, open land, clear of every site, cave, glade, the shore, the
    world's rivers and the other falls. None fits: the stream rises from its spring as before. */
function riverFor(f: Fall, others: Fall[]): void {
  const want = f.kind === "great" ? 260 : 210;
  const bends = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.25, -1.25];
  const flip = ihash(Math.floor(f.x), Math.floor(f.z), 23) < 0.5 ? -1 : 1;
  for (const [len, clear] of [want, want * 0.8, want * 0.62, want * 0.46, 75, 55, want * 0.62, 110, 75, 55].map((l, i) => [l, i < 6 ? 34 : 15])) {
    for (const b of bends) {
      f.rl = len;
      f.bend = b * flip;
      let ok = true;
      const st = fallStream(f);
      for (let s = st - 8; s >= st - len - 30 && ok; s -= 10) {
        const { u } = fallRiverU(f, Math.max(s, st - len));
        const x = f.x + f.dx * s - f.dz * u, z = f.z + f.dz * s + f.dx * u;
        const h = rawHeight(x, z);
        if (h < 0.9 || h > fallRiverY(f, s) + 26) ok = false;
        else if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 210) ok = false;
        else if (riverDist(x, z) < clear) ok = false;
        else if (PADS.some((p) => Math.hypot(p.x - x, p.z - z) < p.outer + 45)) ok = false;
        else if (keptClear(x, z, 26) || CAVE_SITES.some((c) => Math.hypot(c.x - x, c.z - z) < 90)) ok = false;
        else if (GLADES.some((g) => Math.hypot(g.x - x, g.z - z) < g.r + 30)) ok = false;
        else if (others.some((o) => Math.hypot(o.x - x, o.z - z) < 140 * o.sc || (o.rl > 0 && riverNear(o, x, z, 90)))) ok = false;
      }
      if (ok) {
        f.reach = Math.max(110 * f.sc, len + 26 * f.sc + 100 * f.sc, Math.abs(f.bend) * len * 0.5 + 12 * f.sc + 110);
        return;
      }
    }
  }
  f.rl = 0;
  f.bend = 0;
}
/** Whether a point lies within `r` of a fall's river. */
function riverNear(f: Fall, x: number, z: number, r: number): boolean {
  const st = fallStream(f);
  for (let s = st; s >= st - f.rl; s -= 15) {
    const { u } = fallRiverU(f, s);
    if (Math.hypot(f.x + f.dx * s - f.dz * u - x, f.z + f.dz * s + f.dx * u - z) < r) return true;
  }
  return false;
}

// the regions' landforms, now that every site of this module has been chosen on the land as it was
reliefOn = true;
coarse.clear();

/** More caves, here and there (the owner: "add caves here and there"): chosen last, on the land
    as it now stands (its regions' landforms and waterways in), so nothing chosen before moved.
    Steep hillsides above the water, clear of every site, waterfall, river, glade, the massifs'
    snow and the other caves; a few near enough the shore to come upon on foot. */
export const MORE_CAVES: { x: number; z: number; y: number; face: number }[] = (() => {
  const out: { x: number; z: number; y: number; face: number }[] = [];
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 900 && out.length < 12; i++) {
    const a = i * GA + 1.1, r = 200 + ((i * 0.7548776) % 1) * 1800;
    const x = SPAWN.x + Math.cos(a) * r, z = SPAWN.z + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 3 || h > 70 || massifAt(x, z) > 0.2) continue;
    const gx = heightAt(x + 8, z) - heightAt(x - 8, z), gz = heightAt(x, z + 8) - heightAt(x, z - 8);
    if (Math.hypot(gx, gz) < 3.6) continue; // a real slope: the hollow runs into the hill
    // the ground before the mouth (downhill) is dry, and there is hill behind it
    const fx = -gx / Math.hypot(gx, gz), fz = -gz / Math.hypot(gx, gz);
    if (heightAt(x + fx * 9, z + fz * 9) < WATER_Y + 0.6 || heightAt(x - fx * 9, z - fz * 9) < h + 1.6) continue;
    if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 90)) continue;
    if (keptClear(x, z, 30) || GLADES.some((g) => Math.hypot(x - g.x, z - g.z) < g.r + 30)) continue;
    if (riverDist(x, z) < 40 || WATERFALLS.some((f) => Math.hypot(x - f.x, z - f.z) < 120 || riverNear(f, x, z, 40))) continue;
    if ([...CAVE_SITES, ...out].some((c) => Math.hypot(c.x - x, c.z - z) < 240)) continue;
    out.push({ x, z, y: h, face: Math.atan2(-gz, -gx) });
  }
  return out;
})();
/** Every cave in the world: the first ones and those found here and there since. */
export const CAVES = [...CAVE_SITES, ...MORE_CAVES];

/** Gold mines (the owner: "add gold mines"): adits driven into steep dry hillsides, most of them in
    the red hills of the west and south-west where gold would be sought, clear of every site, cave,
    river, fall and each other. Chosen last, on the finished land, so nothing else moved. `face` is
    the way the adit's mouth looks (downhill). */
export const MINE_SITES: { x: number; z: number; y: number; face: number }[] = (() => {
  const out: { x: number; z: number; y: number; face: number }[] = [];
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 1400 && out.length < 3; i++) {
    // bearings toward the west (π) first: the red rocks, the dunes' edge, the moor
    const a = Math.PI + (((i * GA) % (Math.PI * 2)) - Math.PI) * (i < 700 ? 0.45 : 1), r = 260 + ((i * 0.7548776) % 1) * 1500;
    const x = SPAWN.x + Math.cos(a) * r, z = SPAWN.z + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 4 || h > 70 || massifAt(x, z) > 0.2) continue;
    const gx = heightAt(x + 8, z) - heightAt(x - 8, z), gz = heightAt(x, z + 8) - heightAt(x, z - 8);
    if (Math.hypot(gx, gz) < 3.6) continue;
    const fx = -gx / Math.hypot(gx, gz), fz = -gz / Math.hypot(gx, gz);
    // level enough before the mouth for its rails and spoil heap, and hill behind it
    if (heightAt(x + fx * 14, z + fz * 14) < WATER_Y + 0.8 || heightAt(x - fx * 9, z - fz * 9) < h + 1.6) continue;
    if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 110)) continue;
    if (keptClear(x, z, 40) || GLADES.some((g) => Math.hypot(x - g.x, z - g.z) < g.r + 40)) continue;
    if (riverDist(x, z) < 45 || WATERFALLS.some((f) => Math.hypot(x - f.x, z - f.z) < 140 || riverNear(f, x, z, 45))) continue;
    if (CAVES.some((c) => Math.hypot(c.x - x, c.z - z) < 200) || out.some((c) => Math.hypot(c.x - x, c.z - z) < 400)) continue;
    out.push({ x, z, y: h, face: Math.atan2(fz, fx) });
  }
  // (trees and rocks keep off each mouth, its rails and its spoil heap: creation.ts `clearOf`;
  // not by KEEP_CLEAR, which the sites chosen after this module read, so none of them moved)
  // a level bench before each adit, as at any mine: cut into the foot of the hill at the mouth's
  // height, so the way in is walked on level ground (the hill rose too steeply to the door)
  for (const m of out) levelGround(m.x + Math.cos(m.face) * 5, m.z + Math.sin(m.face) * 5, m.y, 7, 13);
  // (and a little way into the hill, where the adit runs: no slope of the hill rises in it)
  for (const m of out) levelGround(m.x - Math.cos(m.face) * 2, m.z - Math.sin(m.face) * 2, m.y, 3.4, 5.5);
  return out;
})();

/* ---------- the Nile (the owner: "a Nile desert type of scene for the pyramid, and move there") ----------
   Far out in the west, under the sunset, the ochre dunes open into a valley: the Nile running
   north to south through it, its floodplain a strip of green either side, then a step up to the
   desert, the dunes rising beyond. The pyramid stands on the desert plateau west of the river,
   as at Giza, its north face square to the north. Chosen last, and woken (`wakeTheNile`) only
   after every module has chosen its own sites, so nothing else moved. */
const NILE_LEN = 660, NILE_HALF = 380; // the valley's half-length (north–south) and half-width
export const NILE = (() => {
  let best = { x: -2500, z: 250 }, bestScore = -Infinity;
  for (let r = 2000; r <= 2900; r += 50)
    for (let k = -12; k <= 12; k++) {
      const a = Math.PI + k * 0.03, x = SPAWN.x + Math.cos(a) * r, z = SPAWN.z + Math.sin(a) * r;
      // clear of everything that stands, by the valley's whole rectangle and a margin
      const inValley = (px: number, pz: number, m: number) => Math.abs(px - x) < NILE_HALF + 100 + m && Math.abs(pz - z) < NILE_LEN + 250 + m;
      if (LANDMARK_SITES.some(([lx, lz]) => inValley(lx, lz, 60))) continue;
      if (CAVES.some((c) => inValley(c.x, c.z, 40)) || MINE_SITES.some((c) => inValley(c.x, c.z, 60))) continue;
      if (WATERFALLS.some((f) => inValley(f.x, f.z, 120))) continue;
      if (MONUMENT_SITES.some((m) => inValley(m.x, m.z, m.r + 40))) continue;
      if (inValley(RAPA_NUI.x, RAPA_NUI.z, 300) || inValley(NAN_MADOL.x, NAN_MADOL.z, 300) || inValley(GOBEKLI.x, GOBEKLI.z, 300)) continue;
      if (PEAKS.some((p) => Math.hypot(Math.max(0, Math.abs(p.x - x) - NILE_HALF), Math.max(0, Math.abs(p.z - z) - NILE_LEN)) < p.r + 150)) continue;
      if (Math.hypot(x, z) + NILE_HALF > WORLD_R - 500) continue;
      const score = -Math.abs(r - 2350) - Math.abs(k) * 20;
      if (score > bestScore) (bestScore = score), (best = { x, z });
    }
  return best;
})();
/** The river's middle, in the valley's frame (x across, east +; z along, south +). */
const nileRx = (lz: number) => 120 + 22 * Math.sin(lz * 0.006) + 10 * Math.sin(lz * 0.017 + 1);
/** How much of the valley is here (0 outside it … 1 within), and the river's middle near it. The
    valley's edge wanders (a slow noise moves it ±90 m) and its corners are round, so it meets the
    land and the lakes round it as country does, never along a ruled line. */
function nileFrame(x: number, z: number): { lx: number; lz: number; wv: number; d: number } | null {
  const lx = x - NILE.x, lz = z - NILE.z;
  if (Math.abs(lz) > NILE_LEN + 360 || Math.abs(lx - 40) > NILE_HALF + 260) return null;
  const ex = (Math.abs(lx - 40) - NILE_HALF) / 150, ez = (Math.abs(lz) - NILE_LEN) / 250;
  const e = Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) + Math.min(Math.max(ex, ez), 0) + (vnoise(x * 0.005 + 41, z * 0.005 - 13) - 0.5) * 1.1;
  const wv = smooth(1, 0, e);
  return { lx, lz, wv, d: Math.abs(lx - nileRx(lz)) };
}
/** Where the Nile goes beyond its valley: at each end it runs on, curving, to the nearest lake (it
    flows from the one and into the other: it no longer begins and ends in the sand). Each reach a
    polyline (world x, z), found when the valley wakes. */
let NILE_REACHES: { x: number; z: number }[][] = [];
function nileReaches(): { x: number; z: number }[][] {
  const out: { x: number; z: number }[][] = [];
  const near = (x: number, z: number) =>
    LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 120) ||
    MONUMENT_SITES.some((m) => Math.hypot(x - m.x, z - m.z) < m.r + 70) ||
    CAVES.some((c) => Math.hypot(x - c.x, z - c.z) < 80) ||
    MINE_SITES.some((c) => Math.hypot(x - c.x, z - c.z) < 120) ||
    WATERFALLS.some((f) => Math.hypot(x - f.x, z - f.z) < 160) ||
    [RAPA_NUI, NAN_MADOL, GOBEKLI].some((q) => Math.hypot(x - q.x, z - q.z) < 320);
  for (const end of [-1, 1]) {
    const lz0 = end * (NILE_LEN - 60), ax = NILE.x + nileRx(lz0), az = NILE.z + lz0;
    let best: { x: number; z: number }[] | null = null, bestL = Infinity;
    for (let k = -14; k <= 14; k++) {
      const a = (k / 14) * 1.25; // up to ±72° off the valley's axis
      const dx = Math.sin(a), dz = Math.cos(a) * end;
      // the first water (deep enough to be a lake, not a puddle) along this bearing
      for (let r = 120; r <= 1500; r += 20) {
        const bx = ax + dx * r, bz = az + dz * r;
        if (heightAt(bx, bz) > -1.4 || heightAt(bx + dx * 30, bz + dz * 30) > -1.4) continue;
        const len = r * (1 + Math.abs(a) * 0.35);
        if (len >= bestL) break;
        // a gentle curve: out along the valley's axis first, then round to the water
        const cx = ax, cz = az + end * Math.min(r * 0.5, 260);
        const pts: { x: number; z: number }[] = [];
        for (let i = 0; i <= 40; i++) {
          const t = i / 40, u = 1 - t;
          pts.push({ x: u * u * ax + 2 * u * t * cx + t * t * (bx + dx * 30), z: u * u * az + 2 * u * t * cz + t * t * (bz + dz * 30) });
        }
        if (pts.some((q) => near(q.x, q.z))) break;
        best = pts;
        bestL = len;
        break;
      }
    }
    if (best) out.push(best);
  }
  return out;
}
let REACH_BOX = { x0: 0, x1: 0, z0: 0, z1: 0 };
/** How far from a reach's middle (Infinity when there is none near). */
function reachDist(x: number, z: number): number {
  if (x < REACH_BOX.x0 || x > REACH_BOX.x1 || z < REACH_BOX.z0 || z > REACH_BOX.z1) return Infinity;
  let d = Infinity;
  for (const R of NILE_REACHES)
    for (let i = 0; i < R.length - 1; i++) {
      const a = R[i], b = R[i + 1];
      if (Math.abs(x - a.x) > 400 && Math.abs(x - b.x) > 400) continue;
      if (Math.abs(z - a.z) > 400 && Math.abs(z - b.z) > 400) continue;
      const vx = b.x - a.x, vz = b.z - a.z, L = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / L));
      d = Math.min(d, Math.hypot(x - a.x - vx * t, z - a.z - vz * t));
    }
  return d;
}
/** How much of the valley is here (0 … 1), for the map. */
export function nileValley(x: number, z: number): number {
  if (!nileOn) return 0;
  const f = nileFrame(x, z);
  return f ? f.wv : 0;
}
/** The pyramid, on the desert plateau west of the river, its north face square to the north. */
export const PYRAMID = { x: NILE.x - 90, z: NILE.z - 40, y: 7, half: 55, height: 70 };
/** The valley's land: the river (its bed 3.4 m under the water), the floodplain a little above
    it, the step up to the desert (higher on the west, where the pyramid's plateau is), and the
    dunes rising farther out. Blended into the world's land at the valley's edges. */
function nileLand(x: number, z: number, h: number): number {
  // the reaches to the lakes: the river's bed and a strip of floodplain, cut into whatever land is
  // there (its banks rising at 1 in 3), never raising it
  if (NILE_REACHES.length) {
    const rd = reachDist(x, z);
    if (rd < 400) {
      const fl = 0.85 + (vnoise(x * 0.02, z * 0.02) - 0.5) * 0.3;
      const prof = rd < 24 ? -3.4 + (fl + 3.4) * smooth(12, 24, rd) : fl + Math.max(0, rd - 60) / 3;
      h = Math.min(h, prof);
    }
  }
  const f = nileFrame(x, z);
  if (!f || f.wv <= 0) return h;
  const { d, lx, lz } = f;
  const flood = 0.85 + (vnoise(x * 0.02, z * 0.02) - 0.5) * 0.4;
  const west = lx < nileRx(lz);
  const r = 1 - Math.abs(vnoise(x * 0.012 + 3, z * 0.02 - 5) * 2 - 1); // ridged: dune crests
  const desert = (west ? 7 : 4.5) + r * r * 6 * smooth(170, 300, d) + (vnoise(x * 0.06, z * 0.06) - 0.5) * 0.5;
  let v = flood + (desert - flood) * smooth(85, 165, d);
  if (d < 26) v = -3.4 + (flood + 3.4) * smooth(13, 26, d);
  const out = h + (v - h) * f.wv;
  // (where a reach leaves the valley, its channel runs on through the valley's own edge)
  return NILE_REACHES.length && reachDist(x, z) < 60 ? Math.min(out, h) : out;
}
/** How much of the floodplain's green is here (0 … 1): the regions give way to the meadow there. */
export function nileGreen(x: number, z: number): number {
  if (!nileOn) return 0;
  const f = nileFrame(x, z);
  return f ? f.wv * smooth(150, 70, f.d) : 0;
}
/** How far from the Nile's middle (Infinity away from it), for the reeds and palms on its banks. */
export function nileDist(x: number, z: number): number {
  if (!nileOn) return Infinity;
  const f = nileFrame(x, z);
  return f && f.wv > 0.6 ? f.d : Infinity;
}
/** How much of the floodplain's fields is here (0 … 1): from just above the bank out to where the
    desert begins. */
export function nileFloodK(x: number, z: number): number {
  if (!nileOn) return 0;
  const f = nileFrame(x, z);
  return f && f.wv > 0 ? f.wv * smooth(24, 34, f.d) * smooth(150, 100, f.d) : 0;
}
// the fields: crops in leaf, young green, flax and wheat, and dark tilled earth
const FIELDS = ["#4f8a3a", "#6f9a3c", "#4a3a2a", "#a3954a", "#3f7a34", "#5d7f36"].map((c) => new THREE.Color(c));
/** The floodplain's fields, laid square to the river (strips along it, divided across): the colour
    of the one this point lies in, and how much of it is here. */
export function nileFields(x: number, z: number, out: THREE.Color): number {
  const k = nileFloodK(x, z);
  if (k <= 0) return 0;
  const lz = z - NILE.z, ac = x - NILE.x - nileRx(lz);
  const i = Math.floor(lz / 34 + vnoise(x * 0.01, z * 0.01) * 0.6), j = Math.floor(Math.abs(ac) / 22) * Math.sign(ac);
  const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  out.copy(FIELDS[Math.floor((v - Math.floor(v)) * FIELDS.length)]);
  return k;
}
/** The river's middle (world x) at a world z, and how far along it the valley runs (±NILE_REACH
    from NILE.z), for the boats. */
export const nileCourse = (z: number): number => NILE.x + nileRx(z - NILE.z);
export const NILE_REACH = NILE_LEN;
/** Wake the Nile: called once by main.ts after every module has chosen its sites. The pyramid's
    old plaza is let go (its levelled ground and its clearing), the new one is levelled and kept
    clear, and the valley's land comes into the world. */
export function wakeTheNile(): void {
  if (nileOn) return;
  // (the reaches look for the lakes as the land is without the valley)
  NILE_REACHES = nileReaches();
  const all = NILE_REACHES.flat();
  if (all.length) REACH_BOX = { x0: Math.min(...all.map((q) => q.x)) - 400, x1: Math.max(...all.map((q) => q.x)) + 400, z0: Math.min(...all.map((q) => q.z)) - 400, z1: Math.max(...all.map((q) => q.z)) + 400 };
  nileOn = true;
  const pi = PADS.indexOf(FORMER_PAD);
  if (pi >= 0) PADS.splice(pi, 1);
  const ki = KEEP_CLEAR.indexOf(FORMER_CLEAR);
  if (ki >= 0) KEEP_CLEAR.splice(ki, 1);
  PADS.push({ x: PYRAMID.x, z: PYRAMID.z, h: PYRAMID.y, outer: PYRAMID.half * 2.1, inner: PYRAMID.half * 1.45 });
  KEEP_CLEAR.push({ x: PYRAMID.x, z: PYRAMID.z, r: PYRAMID.half * 1.5 });
  coarse.clear();
  rgCache.clear();
}
