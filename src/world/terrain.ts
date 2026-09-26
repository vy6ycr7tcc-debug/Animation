/* The open world: one analytic height function, so collision, the camera, the grass and the
   meshes all agree. Water level is y = 0; wherever the land dips below it, there is a lake.
   - Rolling hills, soft dunes and hollows that hold lakes.
   - A gentle meadow where the wanderer wakes.
   - Mountains rising far out, so the world has an edge you see but never reach, and five
     snow-capped massifs standing within it.
   The ground is streamed in square chunks around the wanderer. */
import * as THREE from "three/webgpu";
import { fogUniforms, T, type N } from "../gpu/tsl";
import { starDirection } from "./fog";
import { groundLight } from "./lightfield";
import { surface } from "./textures";

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
    // ridges and gullies running down from the summit, and a craggy surface
    const ca = dx / (d * p.r + 1e-6), sa = dz / (d * p.r + 1e-6);
    const ridge = 1 - Math.abs(vnoise(ca * 2.6 + p.x * 0.01, sa * 2.6 + d * 5) * 2 - 1);
    const t = 1 - d;
    h += p.h * t * t * (0.7 + 0.42 * ridge) + (vnoise(x * 0.025, z * 0.025) - 0.5) * 16 * t;
  }
  return h;
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
const PADS = LANDMARK_SITES.map(([x, z], i) => {
  const kind = LANDMARK_KINDS[i], raw = rawHeight(x, z);
  const h = kind === "deep" ? raw : kind === "island" ? 1.6 : Math.max(1.2, raw);
  const [outer, inner] = kind === "island" ? [26, 12] : kind === "deep" ? [15, 9] : [11, 6.5];
  return { x, z, h, outer, inner };
});

/** Ground height at (x, z). Below WATER_Y means water. */
/** A place apart, beyond the world's edge (the temple): its own floor. */
export const floorHook: { fn: ((x: number, z: number) => number) | null } = { fn: null };

export function heightAt(x: number, z: number): number {
  if (x > 20000 && floorHook.fn) return floorHook.fn(x, z);
  let h = rawHeight(x, z);
  for (const p of PADS) {
    if (Math.abs(x - p.x) > p.outer || Math.abs(z - p.z) > p.outer) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.outer) h = mix(h, p.h, smooth(p.outer, p.inner, d));
  }
  return h;
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
        if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 400)) continue;
        out.push({ x, z, y: h, face: Math.atan2(-gz, -gx) });
        break search;
      }
    }
  }
  return out;
})();

/** Which kind of ground this is, 0–1 each: meadow (for grass and flowers), sand, stone. */
export function groundKind(x: number, z: number, h = heightAt(x, z)): { meadow: number; sand: number; stone: number } {
  const sand = smooth(1.2, 0.2, h);
  const stone = smooth(9, 16, h) * smooth(0.35, 0.65, fbm(x * 0.01 + 50, z * 0.01));
  const meadow = Math.max(0, 1 - sand - stone) * smooth(0.25, 0.5, fbm(x * 0.02 - 20, z * 0.02 + 40));
  return { meadow, sand, stone };
}

/** Circle colliders for solid features (pillars, stones). */
export interface Collider {
  x: number;
  z: number;
  r: number;
  top: number;
}
export const colliders: Collider[] = [];

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
  meadowA: new THREE.Color("#3f5f73"), // silver-blue
  meadowB: new THREE.Color("#58497e"), // violet
  meadowC: new THREE.Color("#6d5268"), // rose
  stone: new THREE.Color("#4b4563"),
  snow: new THREE.Color("#bcb9da"),
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
  abs, attribute, cameraPosition, cameraViewMatrix, dFdx, dFdy, dot, exp, float, floor, Fn, fract, length, max, min, normalize, normalView,
  normalWorld, positionWorld, pow, sin, smoothstep, step, texture, vec2, vec3, vec4,
} = T;
const gH = (p: N): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
const cH2 = (p: N): N => fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))).mul(43758.5453));
const gN = Fn(([p]: N[]) => {
  const i = floor(p), f0 = fract(p), f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return tmix(tmix(gH(i), gH(i.add(vec2(1, 0))), f.x), tmix(gH(i.add(vec2(0, 1))), gH(i.add(vec2(1, 1))), f.x), f.y);
});
/** Caustics: light through the moving surface, gathered into a slowly shifting web of cell edges. */
const cWeb = Fn(([p, t]: N[]) => {
  const i = floor(p), f = fract(p);
  const d1 = float(8).toVar(), d2 = float(8).toVar();
  for (let y = -1; y <= 1; y++)
    for (let x = -1; x <= 1; x++) {
      const g = vec2(x, y);
      const o = sin(t.add(cH2(i.add(g)).mul(6.2831))).mul(0.42).add(0.5);
      const d = length(g.add(o).sub(f));
      d2.assign(min(d2, max(d1, d)));
      d1.assign(min(d1, d));
    }
  return d2.sub(d1);
});

function groundMaterial(): THREE.MeshStandardNodeMaterial {
  // matte earth: no sheen of sky or moon sliding over it as the camera moves (Samuel: "you
  // don't need to be ray tracing the floor")
  const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.envMapIntensity = 0.35;
  const [sand, meadow, rock, cliff] = [surface("sand"), surface("meadow"), surface("rock"), surface("cliff")];
  const uT = groundUniforms.uT;
  const moon = vec3(...starDirection().toArray());
  // x: sky seen (1 open … darker in hollows), y: how sandy, z: how rocky
  const gr = attribute("aGround", "vec3");
  const vGW = positionWorld;
  const w = vec3(gr.y, gr.z, max(0, float(1).sub(gr.y).sub(gr.z))); // sand, rock, meadow
  const q = vGW.xz;
  // No repeat ever shows (after Inigo Quilez's texture-repetition trick): a slow noise picks, for
  // each stretch of ground, one of eight offsets of the scan, and neighbouring stretches blend
  // into each other; both samples share the ground's own derivatives, so no seam shows either.
  const pick = gN(q.mul(0.045)).mul(8);
  const pa = floor(pick), pf = smoothstep(0.25, 0.75, fract(pick));
  const offA = sin(vec2(3, 7).mul(pa)), offB = sin(vec2(3, 7).mul(pa.add(1)));
  const samp = (t: THREE.Texture, s: number) => {
    const u = q.div(s), dx = dFdx(u), dy = dFdy(u);
    return tmix(texture(t, u.add(offA)).grad(dx, dy), texture(t, u.add(offB)).grad(dx, dy), pf);
  };
  const camD = length(vGW.sub(cameraPosition));

  // Steep ground is a cliff: the cliff scan wrapped around it from the side (triplanar), not
  // smeared down its face from above as the flat layers would be.
  const nW = normalize(normalWorld);
  // steep ground, and the mountains (their gentle slopes too): rock
  const steep = max(smoothstep(0.14, 0.42, float(1).sub(nW.y)), smoothstep(22, 60, vGW.y)).mul(step(0.5, vGW.y));
  const bx = pow(abs(nW.x), 3), bz = pow(abs(nW.z), 3), bsum = max(bx.add(bz), 1e-4);
  const CS = 7; // metres a repeat of the cliff scan
  // near, the scan at its own scale; far, the same scan much larger, so its strata still read
  // from a kilometre away (a small pattern averages to flat grey at that distance)
  const farK = smoothstep(120, 600, camD);
  const tri = (s: number) => texture(cliff.diff, vGW.zy.div(s)).rgb.mul(bx).add(texture(cliff.diff, vGW.xy.div(s)).rgb.mul(bz)).div(bsum);
  const cliffC = tmix(tri(CS), tri(CS * 9), farK);

  const flat0 = samp(sand.diff, 3).rgb.mul(1.9).mul(w.x).add(samp(rock.diff, 4).rgb.mul(2.2).mul(w.y)).add(samp(meadow.diff, 2.2).rgb.mul(2.6).mul(w.z));
  // snowfields keep their white: only a trace of the rock beneath shows through
  const snowK = smoothstep(0.32, 0.6, dot(T.vertexColor().rgb, vec3(0.3, 0.5, 0.2)));
  const det0 = tmix(flat0, tmix(cliffC.mul(2.3), tmix(vec3(1), cliffC.mul(2.3), 0.25), snowK), steep);
  // keep the moonlit palette: mostly the scan's light and shade, a little of its colour
  const det = tmix(vec3(dot(det0, vec3(0.3, 0.5, 0.2))), det0, 0.5);
  // the scans' detail reaches far now (mipmapped, it doesn't shimmer), and cliffs to the mountains
  const fade = float(1).sub(smoothstep(tmix(float(300), float(1400), steep), tmix(float(1100), float(2400), steep), camD));
  // broad variation over the land, so the far country is never one flat colour
  const macro = tmix(float(0.86), float(1.1), gN(q.mul(0.0035))).mul(tmix(float(0.93), float(1.05), gN(q.mul(0.021).add(7))));
  m.colorNode = vec4(tmix(vec3(1), det, fade).mul(macro).mul(gr.x), 1);

  // the scans' relief: each surface's normal map, blended as the ground is
  const near = float(1).sub(smoothstep(30, 160, camD));
  const nm = (t: THREE.Texture, s: number) => samp(t, s).xy.mul(2).sub(1);
  const pn = nm(sand.nor, 3).mul(w.x).mul(0.9).add(nm(rock.nor, 4).mul(w.y).mul(1.2)).add(nm(meadow.nor, 2.2).mul(w.z).mul(0.7));
  const dFlat = vec3(pn.x, 0, pn.y.negate()).mul(near).mul(1.35);
  // on a cliff, each side's normal map turns about its own plane (x-facing: z and y; z-facing: x and y)
  const nX = texture(cliff.nor, vGW.zy.div(CS)).xy.mul(2).sub(1), nZ = texture(cliff.nor, vGW.xy.div(CS)).xy.mul(2).sub(1);
  const dCliff = vec3(0, nX.y, nX.x).mul(bx).add(vec3(nZ.x, nZ.y, 0).mul(bz)).div(bsum).mul(float(1).sub(smoothstep(60, 400, camD))).mul(1.6);
  // Sand, as in Journey: ripples the wind combs across it (two wavelengths, bent by slow noise),
  // tilting its surface so the light catches their crests
  const WIND = vec2(0.8, 0.6);
  const ripPh = dot(q, WIND).mul(6.3).add(gN(q.mul(0.25)).mul(7)), ripPh2 = dot(q, vec2(0.6, -0.8)).mul(15).add(gN(q.mul(0.9)).mul(4));
  const ripK = w.x.mul(float(1).sub(smoothstep(12, 45, camD))).mul(float(1).sub(steep));
  const dRip = vec3(WIND.x, 0, WIND.y).mul(sin(ripPh).mul(0.13)).add(vec3(0.6, 0, -0.8).mul(sin(ripPh2).mul(0.06))).mul(ripK);
  const dW = tmix(dFlat, dCliff, steep).add(dRip);
  m.normalNode = normalize(normalView.add(cameraViewMatrix.mul(vec4(dW, 0)).xyz));

  m.emissiveNode = Fn(() => {
    const gv = normalize(cameraPosition.sub(vGW));
    // glitter: grains of sand that catch the light as you move
    const gq = vGW.xz.mul(22), cell = floor(gq);
    const tw = gH(cell.mul(1.7).add(floor(gv.xz.mul(24).add(gv.y.mul(11)))));
    const dot_ = smoothstep(0.22, 0, length(fract(gq).sub(0.5))); // a point of light, not a fleck
    const glit = step(0.975, gH(cell)).mul(step(0.6, tw)).mul(dot_).mul(gr.y).mul(float(1).sub(smoothstep(4, 30, camD))).mul(step(0, vGW.y));
    const e = vec3(1.0, 0.93, 0.82).mul(glit).mul(2.2).toVar();
    // caustics on the floor of the lakes; the web is warped by slow noise, so no cell is ever regular
    const dep = vGW.y.negate();
    const cq0 = vGW.xz.mul(0.32);
    const cq = cq0.add(vec2(gN(cq0.mul(0.9).add(uT.mul(0.05))), gN(cq0.mul(0.9).sub(uT.mul(0.04)).add(5))).mul(1.4));
    const web = min(cWeb(cq, uT.mul(0.5)), cWeb(cq.mul(1.37).add(7.3), uT.mul(-0.4)));
    const cau = pow(float(1).sub(smoothstep(0, 0.32, web)), 2.2).mul(gN(cq.mul(0.35).add(uT.mul(0.03))).mul(0.45).add(0.55));
    const k = exp(dep.mul(-0.08)).mul(smoothstep(0.3, 1.5, dep)).mul(float(1).sub(smoothstep(12, 40, camD)));
    // (left out: Samuel found the moving web on the floor "annoying", like a reflection)
    void cau, k;
    // a soft sheen where the ground faces away toward the moon (light through the haze)
    // the lights of the world, pooling on the ground (lanterns, beings, crystals, your own)
    e.addAssign(groundLight(vGW).mul(T.vertexColor().rgb.mul(1.6).add(0.12)).mul(gr.x));
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
    const L = LEVELS[li - 1], tiles = this.tiles[li - 1];
    for (const dx of [-0.01, 0.01])
      for (const dz of [-0.01, 0.01]) {
        const k = `${Math.floor((x + dx) / L.chunk)},${Math.floor((z + dz) / L.chunk)}`;
        if (!tiles.has(k) || !this.wanted(li - 1, k)) return false;
      }
    return true;
  }

  private newMesh(L: Level, isNear: boolean): THREE.Mesh {
    const g = new THREE.PlaneGeometry(L.chunk, L.chunk, L.seg, L.seg);
    g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count;
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aGround", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
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
    const n = L.seg + 1, B = 4; // a border of four cells, for normals and the sky-seen shading
    const W = n + 2 * B;
    const step = L.chunk / L.seg;
    const H = new Float32Array(W * W);
    for (let b = 0; b < W; b++)
      for (let a = 0; a < W; a++) H[b * W + a] = heightAt(ox + ((a - B) - L.seg / 2) * step, oz + ((b - B) - L.seg / 2) * step);
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
      for (const [da, db] of [[-B, 0], [B, 0], [0, -B], [0, B], [-2, -2], [2, 2], [-2, 2], [2, -2]]) avg += H[(b + db) * W + a + da];
      avg /= 8;
      const sky = Math.min(1.12, Math.max(0.5, 1 - ((avg - h) * 0.9) / Math.max(4, step * B)));
      const k = groundKind(x, z, h);
      const region = fbm(x * 0.004 + 9, z * 0.004 - 4);
      this.col.copy(C.meadowA).lerp(C.meadowB, smooth(0.35, 0.6, region)).lerp(C.meadowC, smooth(0.6, 0.78, region));
      this.col.lerp(this.tmp.copy(C.sand), k.sand).lerp(C.stone, k.stone).lerp(C.snow, smooth(40, 70, h)).lerp(C.snowHigh, smooth(110, 190, h));
      // broad stretches of bare earth, warm and deeply textured
      const earth = smooth(0.42, 0.62, fbm(x * 0.005 + 123, z * 0.005 - 7)) * (1 - k.sand) * smooth(0.6, 2.5, h);
      this.tmp.copy(C.earth).lerp(C.loam, smooth(0.3, 0.7, fbm(x * 0.03 - 9, z * 0.03 + 4)));
      this.col.lerp(this.tmp, earth * 0.8);
      if (h < 0.1) this.col.lerp(C.wet, smooth(0.1, -0.6, h));
      col.setXYZ(v, this.col.r, this.col.g, this.col.b);
      const sandy = Math.min(1, k.sand + smooth(0.45, 0.62, fbm(x * 0.01 - 30, z * 0.01 + 12)) * (1 - k.stone) * 0.6);
      // the earth takes the rock scan's grit and the sand's grain
      const rocky = Math.min(1 - sandy, k.stone + smooth(0.5, 1.0, 1 - nor.getY(v)) * 0.8 + earth * 0.55);
      gr.setXYZ(v, sky, Math.min(1 - rocky, sandy + earth * 0.3), rocky);
    }
    pos.needsUpdate = nor.needsUpdate = col.needsUpdate = gr.needsUpdate = true;
    g.computeBoundingSphere();
    g.computeBoundingBox();
  }
}
