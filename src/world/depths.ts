/* The deep (Samuel: "the underwater world needs ruins, stuff reflective spots, stillness and
   access thru caves to archives of the deeper self").
   - Ruins on the lake floors: a ring of columns around a stepped floor, a gateway standing over
     nothing, a stair climbing to a platform; standing and fallen, in the world's etched stone.
     Soft lights have settled on them.
   - Stillness spots: a pale ring inlaid in the floor beside each ruin. Come to rest inside one
     (let go: under the water you sink gently) and the sea hushes, the ring brightens and a
     question to sit with rises (written for the game; Samuel's own may replace them).
   - Caves: arches of stone in the steep underwater slopes, light at their back. Swim through
     one and you come into the Archive of the Deeper Self, a place apart (like the temple):
     a great grotto under the water, its walls a spiral of tablets, one for each narration of
     the archive (those you have heard glow, and a touch plays them again), and twenty-two
     alcoves, one for each archetype (those you have met hold their light, and a touch lets them
     speak again). At its centre, a ring of stillness. Swim back out through the way you came. */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T, worldPoints, type N } from "../gpu/tsl";
import { etchedStone } from "./etching";
import { columnGeometry, scan, type ScanName } from "./temple";
import { surface } from "./textures";
import { colliders, heightAt, LANDMARK_KINDS, LANDMARK_SITES, levelGround, SPAWN, WATER_Y } from "./terrain";

const { abs, atan, cos, float, fract, length, max, mix, positionGeometry, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;
const V = THREE.Vector3;

function hash(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function rng(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/* ---------------------------------------------------------------- where */
export type RuinKind = "rotunda" | "terraces" | "tower" | "arcade" | "portals";
export interface RuinSite {
  x: number;
  z: number;
  y: number;
  kind: RuinKind;
  rot: number;
  /** A drowned city stands here instead of a ruin (world/ancient), under its own name. */
  area?: AreaId;
  name?: string;
}
/** The drowned cities of the ancient tellings (world/ancient), each at one of the ruin sites. */
export type AreaId = "mayan";
export interface SpotSite { x: number; z: number; y: number; r: number }
export interface MouthSite { x: number; z: number; y: number; face: number }

const deepHomes = LANDMARK_SITES.filter((_, i) => LANDMARK_KINDS[i] === "deep" || LANDMARK_KINDS[i] === "island");

/** Their names on the map. */
export const RUIN_NAMES: Record<RuinKind, string> = {
  rotunda: "The drowned rotunda",
  tower: "The leaning tower",
  arcade: "The arcade by the sunken pool",
  terraces: "The stepped temple",
  portals: "The cloister of arches",
};

/** How tall each kind stands (metres), to keep it under the surface. */
const RUIN_HEIGHT: Record<RuinKind, number> = { tower: 20, rotunda: 17, terraces: 12.5, arcade: 9, portals: 8.5 };

/** Ruins on flat stretches of lake floor, well under the water, apart from each other and the
    homes in the deep; nearer ones first, so the first lake you swim holds one. */
export const RUIN_SITES: RuinSite[] = (() => {
  const out: RuinSite[] = [];
  const kinds: RuinKind[] = ["rotunda", "terraces", "arcade", "tower", "portals"];
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 900 && out.length < 9; i++) {
    const r = 40 + Math.sqrt(i) * 70, a = i * GA;
    const x = SPAWN.x + Math.cos(a) * r, z = SPAWN.z + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h > -9 || h < -60) continue;
    let flat = true;
    for (const [dx, dz] of [[9, 0], [-9, 0], [0, 9], [0, -9]]) if (Math.abs(heightAt(x + dx, z + dz) - h) > 2.2) flat = false;
    if (!flat) continue;
    if (deepHomes.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 70)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 220)) continue;
    out.push({ x, z, y: h, kind: kinds[out.length % kinds.length], rot: hash(i, 3, 11) * Math.PI * 2 });
  }
  // each site gets a kind that fits under its water, the least used of those, so all appear
  const used: Record<RuinKind, number> = { rotunda: 0, terraces: 0, tower: 0, arcade: 0, portals: 0 };
  for (const o of out) {
    const room = -o.y - 3;
    const fits = kinds.filter((k) => RUIN_HEIGHT[k] <= room).sort((a, b) => RUIN_HEIGHT[b] - RUIN_HEIGHT[a]); // a tie goes to the taller
    const pool = fits.length ? fits : (["portals", "arcade"] as RuinKind[]);
    o.kind = pool.reduce((a, b) => (used[b] < used[a] ? b : a));
    used[o.kind]++;
  }
  return out;
})();

/** Which ruin sites hold a drowned city, and how much floor each levels round it. The owner's
    brief: the cities stand at the world's own ruin sites (no new geography). The Maya city takes
    the deepest (its nine-terraced pyramid stands ~17 m and wants the most water over it). */
export const AREA_SIZE: Record<AreaId, { inner: number; outer: number; name: string }> = {
  mayan: { inner: 50, outer: 78, name: "The drowned Maya city" },
};
export const AREA_SITES: Partial<Record<AreaId, RuinSite>> = (() => {
  const out: Partial<Record<AreaId, RuinSite>> = {};
  const free = () => RUIN_SITES.filter((r) => !r.area);
  const take = (id: AreaId, r: RuinSite | undefined) => {
    if (!r) return;
    r.area = id;
    r.name = AREA_SIZE[id].name;
    out[id] = r;
    levelGround(r.x, r.z, r.y, AREA_SIZE[id].inner, AREA_SIZE[id].outer);
  };
  take("mayan", free().sort((a, b) => a.y - b.y)[0]);
  return out;
})();

/** A ring of stillness beside each ruin (on the floor, a little way off). */
export const SPOT_SITES: SpotSite[] = RUIN_SITES.map((r, i) => {
  const a = r.rot + 2.2 + hash(i, 1, 12);
  const d = r.kind === "rotunda" ? 0 : r.kind === "terraces" ? 18 : 13; // the rotunda holds its own at the centre, under the dome
  const x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d;
  return { x, z, y: heightAt(x, z), r: 2.6 };
}).filter((_, i) => !RUIN_SITES[i].area);

/** Cave mouths in the steep slopes under the water, facing down the slope into open water. */
export const MOUTH_SITES: MouthSite[] = (() => {
  const out: MouthSite[] = [];
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 1400 && out.length < 4; i++) {
    const r = 60 + Math.sqrt(i) * 55, a = i * GA * 1.3 + 0.7;
    const x = SPAWN.x + Math.cos(a) * r, z = SPAWN.z + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h > -8 || h < -40) continue;
    const gx = heightAt(x + 6, z) - heightAt(x - 6, z), gz = heightAt(x, z + 6) - heightAt(x, z - 6);
    if (Math.hypot(gx, gz) < 2.5) continue; // a real slope to run into
    const face = Math.atan2(-gz, -gx); // downhill: the mouth opens that way
    // room before it: open water, and still under the surface above it
    const fx = x + Math.cos(face) * 8, fz = z + Math.sin(face) * 8;
    if (heightAt(fx, fz) > h - 0.5 || heightAt(fx, fz) > -7) continue;
    if (deepHomes.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 60)) continue;
    if (RUIN_SITES.some((o) => Math.hypot(o.x - x, o.z - z) < (o.area ? AREA_SIZE[o.area].outer + 10 : 40))) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 300)) continue;
    out.push({ x, z, y: h, face });
  }
  return out;
})();

/* ---------------------------------------------------------------- stillness rings */
const REFLECTIONS = [
  "What are you carrying that was never yours to carry?",
  "Where in you is it already quiet?",
  "What would you do today if you trusted yourself completely?",
  "Who taught you to be afraid of the dark?",
  "What in you is asking to be forgiven?",
  "When did you last feel entirely at home?",
  "What do you love that you have not yet said aloud?",
  "What gift is hidden in what hurts?",
  "If nothing needed to change, what would you notice?",
  "Which part of you have you been waiting to meet?",
  "Let the water hold you. What do you hear?",
  "What is the oldest thing you know about yourself?",
];

function ringMaterial(glow: { value: number }, tint: THREE.Color): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const uG = uniform(0), uT = uniform(0);
  (m as unknown as { glowU: typeof uG; timeU: typeof uT }).glowU = uG;
  (m as unknown as { timeU: typeof uT }).timeU = uT;
  void glow;
  const p = uv().sub(0.5).mul(2), r = length(p), a = atan(p.y, p.x);
  const w = float(0.012);
  const ring = smoothstep(w.mul(3), 0, abs(r.sub(0.92))).add(smoothstep(w.mul(2), 0, abs(r.sub(0.8))).mul(0.6));
  // twelve fine marks between the two circles, turning very slowly
  const ticks = smoothstep(0.035, 0, abs(fract(a.div(6.28318).mul(12).add(uT.mul(0.01))).sub(0.5)).mul(0.5)).mul(step2(r, 0.8, 0.92));
  const disc = smoothstep(0.8, 0.0, r).mul(0.08).mul(uG);
  const breath = sin(uT.mul(0.6)).mul(0.15).add(0.85);
  const k = ring.mul(0.5).add(ticks.mul(0.4)).mul(uG.mul(1.6).add(0.35)).mul(breath).add(disc);
  m.colorNode = vec4(vec3(tint.r, tint.g, tint.b).mul(k).mul(smoothstep(1.0, 0.95, r)), 1);
  return m;
}
const step2 = (r: ReturnType<typeof float>, a: number, b: number) => smoothstep(a - 0.01, a + 0.01, r).mul(smoothstep(b + 0.01, b - 0.01, r));

class Ring {
  mesh: THREE.Mesh;
  glow = 0;
  constructor(public site: SpotSite, tint = new THREE.Color(0.75, 0.92, 1.0)) {
    const m = ringMaterial({ value: 0 }, tint);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(site.r * 2.2, site.r * 2.2), m);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(site.x, site.y + 0.08, site.z);
    this.mesh.renderOrder = 4;
  }
  set(t: number, glow: number): void {
    const m = this.mesh.material as unknown as { glowU: { value: number }; timeU: { value: number } };
    m.glowU.value = glow;
    m.timeU.value = t;
  }
}

/* ---------------------------------------------------------------- stone: Egypt and Atlantis */

/** Real sunken stone (Samuel: the iridescent ruins "look like shit"; he loves the temple's
    texture and light): the temple's scanned sandstone, laid from three sides, with its own relief
    (normal map) and occlusion, then what the water has done to it: silt and sand settled on
    every upward face, a soft green growth on tops and ledges, darker stains where water ran, the
    base buried in the floor's sand. A little of its own colour is lifted as light (the moonlight
    scattered in the water), so the forms still read through the murk, but nothing glows. */
function ruinStone(set: ScanName, _inlay: "bands" | "grid" | "none", uT: N, painted = false, tint: [number, number, number] = [1, 1, 1]): THREE.MeshStandardNodeMaterial {
  void _inlay;
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.9, side: THREE.DoubleSide });
  if (painted) m.vertexColors = true;
  const S = scan(set);
  const pw = T.positionWorld, n = T.normalWorldGeometry;
  const wp = T.pow(abs(n), vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tile = 2.6;
  const tri = (t: THREE.Texture) =>
    T.texture(t, pw.zy.div(tile)).mul(w.x).add(T.texture(t, pw.xz.div(tile)).mul(w.y)).add(T.texture(t, pw.xy.div(tile)).mul(w.z));
  const arm = tri(S.arm);
  let c: N = tri(S.diff).rgb.mul(T.mix(float(0.4), float(1), arm.r));
  if (painted) c = c.mul(T.vertexColor().rgb.div(vec3(0.77, 0.64, 0.45)).mix(vec3(1), 0.55));
  c = c.mul(vec3(...tint));
  // the water's work
  const nz = (p: N) => T.mx_noise_float(p).mul(0.5).add(0.5);
  const up = smoothstep(0.35, 0.85, n.y);
  const silt = up.mul(smoothstep(0.35, 0.65, nz(pw.mul(0.9))));
  const growth = up.mul(smoothstep(0.5, 0.75, nz(pw.mul(1.7).add(7)))).mul(0.8);
  const stain = smoothstep(0.55, 0.8, nz(vec3(pw.x.mul(2.2), pw.y.mul(0.25), pw.z.mul(2.2)))).mul(float(1).sub(up)).mul(0.35);
  const sand = T.texture(surface("sand").diff, pw.xz.div(2.2)).rgb.mul(vec3(1.05, 1.0, 0.9)).mul(1.6);
  c = T.mix(c, sand, silt.mul(0.75));
  c = T.mix(c, vec3(0.16, 0.26, 0.14).mul(nz(pw.mul(6)).mul(0.5).add(0.6)), growth);
  c = c.mul(float(1).sub(stain));
  m.roughnessNode = T.clamp(arm.g, 0.55, 1);
  // its relief, from the scan's normal map, oriented per side (as the cliffs outside)
  const nm = (t: THREE.Texture) => [T.texture(t, pw.zy.div(tile)), T.texture(t, pw.xz.div(tile)), T.texture(t, pw.xy.div(tile))].map((x: N) => x.xy.mul(2).sub(1));
  const [nx, ny, nzz] = nm(S.nor);
  const dn = vec3(0, nx.y, nx.x).mul(w.x).add(vec3(ny.x, 0, ny.y).mul(w.y)).add(vec3(nzz.x, nzz.y, 0).mul(w.z)).mul(float(1).sub(silt.mul(0.7)));
  // Carved friezes (after the Zeffo tombs of Jedi: Fallen Order, which Samuel pointed to):
  // on the upright faces, bands of deep-cut geometric glyphs every few metres (circles, chevrons,
  // stepped spirals, cells of a script), their cuts shadowed, and in the deepest a faint cold
  // light, as if the stone remembered what it was for. Faint; never a line of neon.
  const side = float(1).sub(up);
  const along = pw.x.mul(w.z).add(pw.z.mul(w.x)); // along the face
  const bandY = pw.y.div(3.4).add(0.3);
  const inBand = smoothstep(0.03, 0.06, fract(bandY)).mul(smoothstep(0.33, 0.3, fract(bandY)));
  const cellU = along.div(0.36), cellV = fract(bandY).div(0.32);
  const cell = T.floor(cellU);
  const q = vec2(fract(cellU).sub(0.5), cellV.sub(0.5).mul(1.6));
  const kind = fract(sin(cell.mul(12.9898).add(T.floor(bandY).mul(78.233))).mul(43758.5453));
  const rr = length(q);
  const ring = abs(rr.sub(0.28)).sub(0.03);
  const chevron = abs(abs(q.x).sub(q.y.mul(0.8)).sub(0.05)).sub(0.03);
  const bar = abs(q.y).sub(0.06).max(abs(q.x).sub(0.34));
  const dotC = rr.sub(0.1);
  const glyph = kind.lessThan(0.3).select(ring, kind.lessThan(0.55).select(chevron, kind.lessThan(0.8).select(bar.min(dotC), ring.min(bar))));
  // some cells carved, some worn away to blank stone
  const cut = smoothstep(0.015, -0.01, glyph).mul(inBand).mul(side).mul(T.step(0.3, fract(kind.mul(7.1))));
  // the band's ruled edges
  const rule = smoothstep(0.012, 0.0, abs(fract(bandY).sub(0.02))).add(smoothstep(0.012, 0.0, abs(fract(bandY).sub(0.34)))).mul(side);
  const cutK = cut.max(rule.mul(0.8)).mul(float(1).sub(silt));
  m.colorNode = vec4(c.mul(1.1).mul(float(1).sub(cutK.mul(0.38))), 1);
  m.normalNode = T.normalize(T.normalView.add(T.cameraViewMatrix.mul(vec4(dn.mul(1.6), 0)).xyz));
  const remember = sin(uT.mul(0.35).add(pw.x.mul(0.07)).add(pw.z.mul(0.05))).mul(0.5).add(0.5);
  m.emissiveNode = c.mul(0.14).add(vec3(0.45, 0.8, 0.9).mul(cut.mul(float(1).sub(silt)).mul(remember.mul(0.05).add(0.012))));
  return m;
}

/** Crystals left on the stones: clear, faintly lit from within; never a rainbow. */
function iridescent(uT: N, k = 1): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ color: 0x9fc3c8, metalness: 0.1, roughness: 0.25, transparent: true, opacity: 0.85 });
  const V = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const ndv = T.max(T.dot(T.normalWorld, V), 0);
  m.emissiveNode = vec3(0.55, 0.85, 0.9).mul(T.pow(float(1).sub(ndv), 2).mul(0.35).add(0.06)).mul(sin(uT.mul(0.6)).mul(0.15).add(0.85)).mul(k * 0.6);
  return m;
}

/** A wall pierced by one round-headed arch, standing on y = 0, centred on x, `t` thick. */
function archSlab(w: number, h: number, t: number, ow: number, oh: number, bevel = 0): THREE.BufferGeometry {
  const r = ow / 2, spring = Math.max(0.1, oh - r);
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(-r, 0);
  sh.lineTo(-r, spring);
  sh.absarc(0, spring, r, Math.PI, 0, true);
  sh.lineTo(r, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(w / 2, h);
  sh.lineTo(-w / 2, h);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 18 });
  g.translate(0, 0, -t / 2);
  return g;
}

/** A solid ring (entablature, a drum's lip): inner and outer radius, height. */
const ringGeo = (ri: number, ro: number, h: number, seg = 40) =>
  new THREE.LatheGeometry([new THREE.Vector2(ri, 0), new THREE.Vector2(ro, 0), new THREE.Vector2(ro, h), new THREE.Vector2(ri, h), new THREE.Vector2(ri, 0)], seg);
/** A dome, open where `gap` of it has fallen in (0 = whole). */
const domeGeo = (r: number, gap = 0) => new THREE.SphereGeometry(r, 40, 14, 0, Math.PI * 2 * (1 - gap), 0, Math.PI / 2);

type Mat = "stone" | "terracotta" | "pearl";
/** Geometry gathered per material and merged: one draw each for all the ruins. */
class Merge {
  parts: Record<Mat, THREE.BufferGeometry[]> = { stone: [], terracotta: [], pearl: [] };
  add(mat: Mat, g: THREE.BufferGeometry, m: THREE.Matrix4): void {
    const c = g.index ? g.toNonIndexed() : g.clone();
    for (const a of Object.keys(c.attributes)) if (a !== "position" && a !== "normal") c.deleteAttribute(a);
    c.applyMatrix4(m);
    this.parts[mat].push(c);
  }
}

type Kind = "drum" | "block" | "beam" | "column" | "shaft" | "cap" | "crystal";

/* What rests on the lake floor holds you out (the ruins had no colliders: the orb and the walker
   passed through columns, drums and blocks). From each stone's own placement: its box in the
   world; if it rests on the floor and stands taller than a step, a collider. Upright stones keep
   their own shape and turn; fallen ones their footprint. Pieces held up high (lintels, beams)
   don't. */
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(), _box = new THREE.Box3();
const UNIT: Partial<Record<Kind, THREE.Box3>> = {
  drum: new THREE.Box3(new THREE.Vector3(-1, -0.5, -1), new THREE.Vector3(1, 0.5, 1)),
  block: new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)),
  beam: new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)),
  column: new THREE.Box3(new THREE.Vector3(-0.56, 0, -0.56), new THREE.Vector3(0.56, 4.2, 0.56)),
  shaft: new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)),
};
function solidFrom(kind: Kind, m: THREE.Matrix4): void {
  const unit = UNIT[kind];
  if (!unit) return;
  _box.copy(unit).applyMatrix4(m);
  m.decompose(_p, _q, _s);
  const cx = (_box.min.x + _box.max.x) / 2, cz = (_box.min.z + _box.max.z) / 2;
  const floor = heightAt(cx, cz);
  if (_box.min.y > floor + 0.9 || _box.max.y - Math.max(_box.min.y, floor) < 0.35) return;
  _up.set(0, 1, 0).applyQuaternion(_q);
  const top = _box.max.y;
  if (_up.y > 0.95) {
    const ang = Math.atan2(_up.set(1, 0, 0).applyQuaternion(_q).z, _up.x) * -1;
    if (kind === "drum" || kind === "column") colliders.push({ x: _p.x, z: _p.z, r: (kind === "drum" ? 1 : 0.5) * Math.max(_s.x, _s.z), top });
    else colliders.push({ x: _p.x, z: _p.z, r: 0, hx: (_s.x * (kind === "shaft" ? 0.8 : 1)) / 2, hz: (_s.z * (kind === "shaft" ? 0.8 : 1)) / 2, ang, top });
  } else colliders.push({ x: cx, z: cz, r: 0, hx: ((_box.max.x - _box.min.x) / 2) * 0.85, hz: ((_box.max.z - _box.min.z) / 2) * 0.85, top });
}
class Stones {
  meshes: Record<Kind, THREE.InstancedMesh>;
  private n: Record<Kind, number> = { drum: 0, block: 0, beam: 0, column: 0, shaft: 0, cap: 0, crystal: 0 };
  constructor(uT: N) {
    const col = columnGeometry();
    col.scale(0.4, 0.4, 0.4); // the temple's papyrus column, 4.2 m tall
    const shaft = new THREE.CylinderGeometry(0.62 * Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
    const cap = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
    const blocks = ruinStone("sandstone_blocks_05", "grid", uT), drums = ruinStone("sandstone_cracks", "bands", uT);
    const columns = ruinStone("sandstone_cracks", "none", uT, true);
    const white = ruinStone("sandstone_blocks_05", "none", uT, false, [1.55, 1.5, 1.45]);
    const mk = (g: THREE.BufferGeometry, mat: THREE.Material, max: number) => {
      const im = new THREE.InstancedMesh(g, mat, max);
      im.count = 0;
      im.frustumCulled = false;
      im.receiveShadow = true;
      return im;
    };
    this.meshes = {
      drum: mk(new THREE.CylinderGeometry(1, 1.02, 1, 24), drums, 500),
      block: mk(new THREE.BoxGeometry(1, 1, 1), blocks, 400),
      beam: mk(new THREE.BoxGeometry(1, 1, 1), white, 500),
      column: mk(col, columns, 120),
      shaft: mk(shaft, blocks, 20),
      cap: mk(cap, iridescent(uT, 1.2), 20),
      crystal: mk(new THREE.OctahedronGeometry(1, 0), iridescent(uT, 1.6), 40),
    };
  }
  put(kind: Kind, m: THREE.Matrix4): void {
    const im = this.meshes[kind];
    if (this.n[kind] >= im.instanceMatrix.count) return;
    im.setMatrixAt(this.n[kind]++, m);
    im.count = this.n[kind];
    solidFrom(kind, m);
  }
  done(): void {
    for (const im of Object.values(this.meshes)) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
}

/** One ruin (Samuel's pictures: Atlantean domes, arcades, towers; the Aether's flowing terraces,
    polished arches and lattices), in Egyptian stone, laid out around its centre. */
function buildRuin(s: Stones, mg: Merge, site: RuinSite, lights: number[]): void {
  const R = rng(Math.abs(Math.round(site.x * 7 + site.z * 13)) % 1000 + 1);
  // shrunk if need be, so it never breaks the surface
  const k = Math.min(1, Math.max(0.45, (-site.y - 2.5) / RUIN_HEIGHT[site.kind]));
  const base = new THREE.Matrix4().compose(new V(site.x, heightAt(site.x, site.z) - 0.35, site.z), new THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), site.rot), new V(k, k, k));
  const e = new THREE.Euler(), q = new THREE.Quaternion();
  /** A local placement → world matrix. */
  const L = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1, frame = base) =>
    frame.clone().multiply(new THREE.Matrix4().compose(new V(x, y, z), q.setFromEuler(e.set(rx, ry, rz, "YXZ")), new V(sx, sy, sz)));
  const light = (m: THREE.Matrix4) => {
    const p = new V().setFromMatrixPosition(m);
    lights.push(p.x, p.y, p.z);
  };
  /** Stones fallen about a spot. */
  const rubble = (cx: number, cz: number, spread: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const x = cx + (R() - 0.5) * spread, z = cz + (R() - 0.5) * spread;
      s.put("block", L(x, 0.35, z, R() * 3, (R() - 0.5) * 0.5, (R() - 0.5) * 0.5, 0.8 + R() * 1.2, 0.5 + R() * 0.5, 0.7 + R() * 0.8));
    }
  };
  /** An arcade of arches round a circle (between columns), some fallen. */
  const arcadeRing = (Rr: number, n: number, colH: number, fallen: number, frame = base) => {
    const chord = 2 * Rr * Math.sin(Math.PI / n);
    const ow = chord - 1.1, top = colH + ow / 2 + 0.9;
    const slab = archSlab(chord + 0.2, top, 0.8, ow, colH + ow / 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      s.put("column", L(Math.cos(a) * Rr, 0, Math.sin(a) * Rr, R() * 6, 0, 0, 1, colH / 4.2, 1, frame));
      if (R() < fallen) {
        rubble(Math.cos(a + 0.3) * (Rr + 2.5), Math.sin(a + 0.3) * (Rr + 2.5), 3, 3);
        continue;
      }
      const am = a + Math.PI / n, rm = Rr * Math.cos(Math.PI / n);
      mg.add("stone", slab, L(Math.cos(am) * rm, 0, Math.sin(am) * rm, -am - Math.PI / 2, 0, 0, 1, 1, 1, frame));
    }
    return top;
  };
  if (site.kind === "rotunda") {
    // a round temple: steps, an arcade of papyrus columns and arches, a drum, and a ribbed dome
    // of terracotta half fallen in; its lantern lies on the floor where the dome broke
    s.put("drum", L(0, 0.3, 0, 0, 0, 0, 9, 0.6, 9));
    s.put("drum", L(0, 0.75, 0, 0, 0, 0, 8.1, 0.4, 8.1));
    const f0 = new THREE.Matrix4().copy(base).multiply(new THREE.Matrix4().makeTranslation(0, 0.95, 0));
    const Rr = 6.4, top = arcadeRing(Rr, 10, 4.2, 0.2, f0);
    mg.add("stone", ringGeo(Rr - 0.7, Rr + 0.9, 1.0), L(0, 0.95 + top, 0));
    mg.add("stone", ringGeo(Rr - 0.2, Rr + 0.4, 1.6), L(0, 0.95 + top + 1.0, 0));
    const dy = 0.95 + top + 2.6, gap = 0.22;
    mg.add("terracotta", domeGeo(Rr + 0.4, gap), L(0, dy, 0));
    // the ribs, where the dome still stands
    const rib = new THREE.TorusGeometry(Rr + 0.45, 0.16, 6, 22, Math.PI / 2);
    for (let k = 0; k < 16; k++) {
      const b = (k / 16) * Math.PI * 2; // world angle of the rib
      const phi = ((Math.PI - b) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (phi > Math.PI * 2 * (1 - gap) - 0.1) continue;
      mg.add("terracotta", rib, L(0, dy, 0, -b));
    }
    // the fallen lantern and the dome's broken pieces
    const la = Math.PI - Math.PI * 2 * (1 - gap / 2);
    const lx = Math.cos(la) * 3.5, lz = Math.sin(la) * 3.5;
    mg.add("terracotta", domeGeo(1.6), L(lx, 1.6, lz, R() * 3, 1.1, 0.3));
    mg.add("stone", ringGeo(1.1, 1.6, 1.4, 16), L(lx + 1.8, 1.0, lz - 0.6, 0, 1.4, 0.4));
    rubble(lx, lz, 5, 6);
    s.put("crystal", L(lx, 2.8, lz, 0, 0.5, 0.2, 0.4, 0.8, 0.4));
    light(L(0, dy + Rr * 0.6, 0));
    light(L(lx, 3.5, lz));
  } else if (site.kind === "tower") {
    // a tall round tower, leaning a little: a battered base, a loggia of arches, a drum with
    // blind arches, a ribbed dome and its cupola; a stump of its twin beside it
    const lean = new THREE.Matrix4().copy(base).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.07, 0, 0.05)));
    mg.add("stone", new THREE.CylinderGeometry(3.1, 3.5, 8, 32, 1), L(0, 4, 0, 0, 0, 0, 1, 1, 1, lean));
    mg.add("stone", ringGeo(2.2, 3.6, 0.7), L(0, 8, 0, 0, 0, 0, 1, 1, 1, lean));
    const f1 = new THREE.Matrix4().copy(lean).multiply(new THREE.Matrix4().makeTranslation(0, 8.7, 0));
    const top = arcadeRing(2.8, 8, 2.6, 0, f1);
    mg.add("stone", ringGeo(2.0, 3.4, 0.8), L(0, 8.7 + top, 0, 0, 0, 0, 1, 1, 1, lean));
    const y3 = 9.5 + top;
    mg.add("stone", new THREE.CylinderGeometry(2.1, 2.1, 3, 28, 1), L(0, y3 + 1.5, 0, 0, 0, 0, 1, 1, 1, lean));
    const blind = archSlab(1.3, 2.6, 0.25, 0.8, 2.2);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      mg.add("stone", blind, L(Math.cos(a) * 2.15, y3 + 0.2, Math.sin(a) * 2.15, -a - Math.PI / 2, 0, 0, 1, 1, 1, lean));
    }
    mg.add("terracotta", domeGeo(2.4), L(0, y3 + 3, 0, 0, 0, 0, 1, 1, 1, lean));
    const rib = new THREE.TorusGeometry(2.45, 0.1, 5, 16, Math.PI / 2);
    for (let k = 0; k < 12; k++) mg.add("terracotta", rib, L(0, y3 + 3, 0, (k / 12) * Math.PI * 2, 0, 0, 1, 1, 1, lean));
    mg.add("stone", new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12, 1), L(0, y3 + 5.9, 0, 0, 0, 0, 1, 1, 1, lean));
    mg.add("terracotta", domeGeo(0.75), L(0, y3 + 6.5, 0, 0, 0, 0, 1, 1, 1, lean));
    s.put("crystal", L(0, y3 + 7.9, 0, 0, 0, 0, 0.35, 0.7, 0.35, lean));
    light(L(0, y3 + 8.6, 0, 0, 0, 0, 1, 1, 1, lean));
    mg.add("stone", new THREE.CylinderGeometry(2.2, 2.5, 3.2, 28, 1), L(8, 1.6, 3));
    rubble(9, 5, 7, 8);
  } else if (site.kind === "arcade") {
    // two arcades facing each other across a long pool, domed pavilions at its ends, and an
    // obelisk standing at the far end of the water
    const slab = archSlab(3.8, 6.4, 0.9, 2.6, 5.2);
    for (const side of [-1, 1])
      for (let k = 0; k < 7; k++) {
        const x = (k - 3) * 3.8;
        if (R() < 0.22) {
          rubble(x, side * 7.5, 3, 3);
          continue;
        }
        mg.add("stone", slab, L(x, 0, side * 6.5, 0));
        if (R() < 0.7) s.put("block", L(x, 6.75, side * 6.5, 0, 0, 0, 3.8, 0.7, 1.3));
      }
    // the pool's rim
    for (const side of [-1, 1]) {
      s.put("block", L(0, 0.3, side * 3.6, 0, 0, 0, 22, 0.6, 0.6));
      s.put("block", L(side * 11.2, 0.3, 0, 0, 0, 0, 0.6, 0.6, 7.8));
    }
    for (const side of [-1, 1]) {
      const px = side * 15;
      for (const [cx, cz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) s.put("column", L(px + cx, 0, cz, R() * 6, 0, 0, 1, 1, 1));
      mg.add("stone", ringGeo(2.0, 3.0, 0.8, 24), L(px, 4.2, 0));
      mg.add("terracotta", domeGeo(2.6, side > 0 ? 0.3 : 0), L(px, 5.0, 0));
      light(L(px, 7.2, 0));
    }
    s.put("shaft", L(0, 4.2, -1.8 + 0, 0, 0, 0, 1.0, 8.4, 1.0));
    s.put("cap", L(0, 8.85, -1.8, 0, 0, 0, 0.7, 0.9, 0.7));
    light(L(0, 10, -1.8));
  } else if (site.kind === "terraces") {
    // a stepped temple platform, four great courses of blocks, a stair up its front, and on its
    // top a court of papyrus columns, some fallen; a shrine's doorway at the back
    const steps = [[13, 1.6], [10.5, 1.6], [8, 1.6], [6, 1.4]] as const;
    let y = 0;
    steps.forEach(([half, h]) => {
      for (const [sx, sz, lx, lz] of [[0, -1, half * 2, 1.4], [0, 1, half * 2, 1.4], [-1, 0, 1.4, half * 2], [1, 0, 1.4, half * 2]] as const)
        s.put("block", L(sx * (half - 0.7), y + h / 2, sz * (half - 0.7), 0, 0, 0, lx, h, lz));
      s.put("block", L(0, y + h / 2 - 0.05, 0, 0, 0, 0, half * 2 - 2.6, h - 0.1, half * 2 - 2.6));
      y += h;
    });
    // the stair, up the front
    for (let k = 0; k < 12; k++) s.put("block", L(0, 0.3 + k * 0.52, 14.2 - k * 0.62, 0, 0, 0, 3.6, 0.52, 0.7));
    // the court
    for (const [cx, cz] of [[-3.8, -3.8], [3.8, -3.8], [-3.8, 0], [3.8, 0], [-3.8, 3.8], [3.8, 3.8]]) {
      if (R() < 0.3) {
        s.put("column", L(cx + 2, y + 0.55, cz, R() * 3, 0, Math.PI / 2 - 0.05));
        continue;
      }
      s.put("column", L(cx, y, cz, R() * 6));
    }
    const door = archSlab(4.2, 5.2, 1.0, 1.8, 3.4);
    mg.add("stone", door, L(0, y, -5.6));
    s.put("crystal", L(0, y + 1.2, -3.6, 0.3, 0, 0, 0.5, 1.0, 0.5));
    light(L(0, y + 5, 0));
  } else {
    // a colonnade of tall arches along a gentle curve (a cloister's walk), one fallen, and before
    // it a row of papyrus columns, most of them broken
    const slab = archSlab(4.2, 7.6, 0.9, 2.8, 6.2);
    for (let k = 0; k < 6; k++) {
      const a = -0.6 + k * 0.24;
      const x = Math.sin(a) * 22, z = -Math.cos(a) * 22 + 22;
      if (k === 4) {
        mg.add("stone", slab, L(x + 1.5, 0.5, z + 2, a + 0.3, Math.PI / 2 - 0.08, 0));
        continue;
      }
      mg.add("stone", slab, L(x, 0, z, -a + (R() - 0.5) * 0.05));
    }
    for (let k = 0; k < 6; k++) {
      const x = -8 + k * 3.2, z = 6.5;
      const h = R();
      if (h < 0.35) s.put("column", L(x, 0, z, R() * 6));
      else if (h < 0.7) for (let d = 0; d < 1 + Math.floor(R() * 2); d++) s.put("drum", L(x, 0.5 + d * 1.0, z, R() * 3, 0, 0, 0.5, 1.0, 0.5));
      else s.put("column", L(x + 1.8, 0.5, z + 1, R() * 3, 0, Math.PI / 2 - 0.05));
    }
    rubble(2, 9, 10, 8);
    light(L(0, 8.5, 0));
    light(L(0, 5, 6.5));
  }
}

/* ---------------------------------------------------------------- cave mouths */
function buildMouth(site: MouthSite, stone: THREE.Material): { group: THREE.Group; portal: THREE.Vector3; door: THREE.MeshBasicNodeMaterial } {
  const g = new THREE.Group();
  // the arch stands upright facing down the slope; its foot a little sunk in the floor
  // on a slope: stand on the ground at the doorway (a little into the hill), so it isn't buried
  const y = Math.max(heightAt(site.x, site.z), heightAt(site.x - Math.cos(site.face) * 1.5, site.z - Math.sin(site.face) * 1.5));
  g.position.set(site.x, y - 0.35, site.z);
  g.rotation.y = -site.face + Math.PI / 2; // local +z points out of the mouth
  // A cave set into the slope (the owner: "an embedded cave"): a rough arch of rock half buried
  // among great boulders, a tunnel running into the hill, and far inside a warm light to go toward.
  const rough = (geo: THREE.BufferGeometry, amp: number, seed: number) => {
    const p = geo.attributes.position as THREE.BufferAttribute, v = new V();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 1.7 + seed) * Math.sin(v.y * 1.3 + seed * 2) * Math.sin(v.z * 1.9 + seed * 3);
      const n2 = Math.sin(v.x * 4.1 + seed * 5) * Math.sin(v.y * 3.7) * Math.sin(v.z * 4.3 + seed);
      v.addScaledVector(v.clone().normalize(), (n * 0.7 + n2 * 0.3) * amp);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  };
  // the arch: half a ring of rock standing over the way in
  const arch = new THREE.Mesh(rough(new THREE.TorusGeometry(4.3, 1.6, 12, 30, Math.PI), 0.45, site.x * 0.01), stone);
  arch.position.set(0, -0.6, 0);
  g.add(arch);
  // boulders heaped about it, bedding the arch into the hill
  const heap: [number, number, number, number][] = [[-5.6, 0.4, -1.2, 2.4], [5.8, 0.2, -1.4, 2.6], [-3.2, 5.0, -1.8, 2.0], [3.4, 5.2, -2.2, 2.3], [0, 6.2, -3.0, 2.6], [-6.4, 3.0, -3.4, 2.2], [6.6, 2.8, -3.6, 2.1]];
  heap.forEach(([x, y0, z, r], k) => {
    const bld = new THREE.Mesh(rough(new THREE.IcosahedronGeometry(r, 2), r * 0.18, k * 1.7 + site.z * 0.01), stone);
    bld.position.set(x, y0, z);
    bld.scale.set(1, 0.8, 1.1);
    g.add(bld);
  });
  // the tunnel into the hill, its walls rough, open at its mouth
  const tunnel = new THREE.Mesh(rough(new THREE.CylinderGeometry(3.3, 2.6, 12, 22, 6, true), 0.4, site.x * 0.02 + 1), stone);
  tunnel.rotation.x = Math.PI / 2;
  tunnel.position.set(0, 2.2, -6.2);
  (tunnel.material as THREE.Material).side = THREE.DoubleSide;
  g.add(tunnel);
  // far inside, a warm light: the way to the deep archive
  const door = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const uT = uniform(0);
  (door as unknown as { timeU: typeof uT }).timeU = uT;
  const p = uv().sub(0.5).mul(2), r = length(p);
  const breathe = sin(uT.mul(0.6)).mul(0.12).add(0.88);
  door.colorNode = vec4(mix(vec3(0.35, 0.7, 0.9), vec3(1.0, 0.85, 0.6), smoothstep(0.8, 0.1, r)).mul(smoothstep(1, 0.1, r).mul(breathe).mul(1.4)), 1);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), door);
  plane.position.set(0, 2.2, -11);
  plane.renderOrder = 5;
  g.add(plane);
  g.updateMatrixWorld(true);
  // a few metres into the tunnel, at a walker's height or a swimmer's
  const portal = new V(0, 1.4, -5).applyMatrix4(g.matrixWorld);
  return { group: g, portal, door };
}

/* ---------------------------------------------------------------- the grotto */
export const ARCHIVE_ORIGIN = new THREE.Vector3(40000, -26, 0);
const GR = 24; // the grotto's radius
const GH = 15; // its height

export interface ArchiveItem { id: string; title: string }
export interface Being { numeral: string; name: string; tint: THREE.Color }

export class Depths {
  /** In the lakes: ruins, rings, cave mouths (drawn only near or under the water). */
  group = new THREE.Group();
  /** The Archive of the Deeper Self, beyond the world's edge. */
  grotto = new THREE.Group();
  inside = false;
  rings: Ring[] = [];
  mouths: { site: MouthSite; portal: THREE.Vector3; door: THREE.MeshBasicNodeMaterial }[] = [];
  centreRing: Ring;
  private tablets!: THREE.InstancedMesh;
  private tabletIds: string[] = [];
  private alcoveOrbs: THREE.Mesh[] = [];
  private exitDoor!: THREE.MeshBasicNodeMaterial;
  readonly exitAt = new THREE.Vector3();
  private local = new THREE.Vector3();
  private col = new THREE.Color();
  private ray = new THREE.Raycaster();
  private lastReflection = -1;
  private uT = uniform(0);
  /** Each ruin's merged stone, shown only within `RUIN_SEEN` of the wanderer. */
  private ruinParts: { x: number; z: number; group: THREE.Group }[] = [];

  constructor(items: ArchiveItem[], beings: Being[]) {
    const s = new Stones(this.uT);
    const lights: number[] = [];
    const mats: Record<Mat, THREE.Material> = {
      stone: ruinStone("sandstone_cracks", "bands", this.uT),
      terracotta: ruinStone("red_sandstone_pavement", "none", this.uT, false, [1.2, 0.82, 0.62]),
      pearl: ruinStone("sandstone_blocks_08", "none", this.uT),
    };
    // each ruin's own pieces merged apart from the others, so only the ruins near you are drawn
    // (merged together, all nine were drawn whenever you were in the water)
    for (const r of RUIN_SITES) {
      if (r.area) continue; // a drowned city stands here (world/ancient)
      const mg = new Merge();
      buildRuin(s, mg, r, lights);
      const g = new THREE.Group();
      for (const k of Object.keys(mats) as Mat[]) {
        if (!mg.parts[k].length) continue;
        const mesh = new THREE.Mesh(mergeGeometries(mg.parts[k]), mats[k]);
        mesh.receiveShadow = true;
        g.add(mesh);
      }
      this.ruinParts.push({ x: r.x, z: r.z, group: g });
      this.group.add(g);
    }
    s.done();
    this.group.add(...Object.values(s.meshes));
    // soft lights settled on the stones
    if (lights.length) {
      const pts = worldPoints(new Float32Array(lights), { color: new THREE.Color(0.75, 0.95, 1.0), size: 1.1, opacity: 0.55 });
      this.group.add(pts.sprite);
    }
    for (const sp of SPOT_SITES) {
      const ring = new Ring(sp);
      this.rings.push(ring);
      this.group.add(ring.mesh);
    }
    const mouthStone = ruinStone("sandstone_blocks_08", "grid", this.uT);
    for (const m of MOUTH_SITES) {
      const b = buildMouth(m, mouthStone);
      this.group.add(b.group);
      this.mouths.push({ site: m, portal: b.portal, door: b.door });
    }
    this.group.visible = false;
    this.centreRing = new Ring({ x: ARCHIVE_ORIGIN.x, z: ARCHIVE_ORIGIN.z, y: ARCHIVE_ORIGIN.y, r: 3.4 }, new THREE.Color(1.0, 0.88, 0.66));
    this.buildGrotto(items, beings);
    this.grotto.visible = false;
  }

  private buildGrotto(items: ArchiveItem[], beings: Being[]): void {
    const O = ARCHIVE_ORIGIN;
    this.grotto.position.copy(O);
    // the dome: dark water-worn stone, veins of light running through it
    const domeM = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false });
    const uT = uniform(0);
    (domeM as unknown as { timeU: typeof uT }).timeU = uT;
    {
      const p = positionGeometry;
      const n = sin(p.x.mul(0.37).add(sin(p.y.mul(0.51)).mul(2.1))).add(sin(p.z.mul(0.29).add(sin(p.x.mul(0.43)).mul(1.7)))).add(sin(p.y.mul(0.22).add(p.z.mul(0.31))));
      const vein = smoothstep(0.025, 0, abs(fract(n.mul(0.7)).sub(0.5)).sub(0.004)).mul(0.5);
      const flow = sin(n.mul(3).sub(uT.mul(0.4))).mul(0.5).add(0.5);
      const h = p.y.div(GH).clamp(0, 1);
      const rock = mix(vec3(0.03, 0.035, 0.05), vec3(0.012, 0.018, 0.035), h);
      domeM.colorNode = vec4(rock.add(vec3(0.45, 0.62, 0.8).mul(vein).mul(flow.mul(0.7).add(0.15)).mul(0.22)), 1);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(GR, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeM);
    dome.scale.set(1, GH / GR, 1);
    this.grotto.add(dome);
    // the floor: fine sand, a great mandala of pale lines inlaid in it
    const floorM = new THREE.MeshBasicNodeMaterial({ fog: false });
    {
      const q = uv().sub(0.5).mul(GR * 2), r = length(q), a = atan(q.y, q.x);
      const line = (d: ReturnType<typeof float>, w: number) => smoothstep(w, 0, abs(d));
      const rings = line(fract(r.div(3)).sub(0.5).mul(3), 0.05).mul(smoothstep(4.5, 5, r)).mul(smoothstep(GR - 2, GR - 4, r));
      const spokes = line(fract(a.div(6.28318).mul(22)).sub(0.5).mul(r).mul(0.285), 0.04).mul(smoothstep(4, 6, r)).mul(smoothstep(GR - 3, GR - 6, r));
      const sand = vec3(0.05, 0.05, 0.06).mul(sin(q.x.mul(1.3).add(sin(q.y.mul(0.7)).mul(2))).mul(0.15).add(0.9));
      floorM.colorNode = vec4(sand.add(vec3(0.7, 0.62, 0.45).mul(rings.add(spokes.mul(0.6)).mul(0.22))), 1);
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(GR, 64), floorM);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    this.grotto.add(floor);
    // the tablets: a spiral band round the wall, one per narration of the archive
    const tabM = new THREE.MeshBasicNodeMaterial({ fog: false });
    const n = items.length;
    this.tablets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.9, 0.08), tabM, Math.max(1, n));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    items.forEach((it, i) => {
      const turns = 2.2, u = (i + 0.5) / Math.max(1, n);
      const a = u * turns * Math.PI * 2 + 0.6;
      const y = 3.2 + u * 6.5;
      // on the dome at that height (an ellipsoid), a little in from the wall
      const rr = GR * Math.sqrt(Math.max(0.05, 1 - (y / GH) ** 2)) - 0.9;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      q.setFromAxisAngle(new V(0, 1, 0), Math.atan2(-x, -z));
      m4.compose(new V(x, y, z), q, new V(1, 1, 1));
      this.tablets.setMatrixAt(i, m4);
      this.tablets.setColorAt(i, this.col.setRGB(0.05, 0.05, 0.07));
      this.tabletIds.push(it.id);
    });
    this.tablets.instanceMatrix.needsUpdate = true;
    if (this.tablets.instanceColor) this.tablets.instanceColor.needsUpdate = true;
    this.tablets.computeBoundingSphere();
    this.grotto.add(this.tablets);
    // the alcoves: twenty-two, low round the wall, an arch of stone and a light within
    const alcoveStone = etchedStone("#23262f", "#e9c37d", 2.2);
    const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 2.4, 0.35), alcoveStone, 44);
    const lintels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.3, 0.45), alcoveStone, 22);
    beings.forEach((b, i) => {
      const a = (i / beings.length) * Math.PI * 2 + Math.PI / 22;
      const rr = GR - 2.4;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const face = Math.atan2(-x, -z);
      q.setFromAxisAngle(new V(0, 1, 0), face);
      const side = new V(Math.cos(face), 0, -Math.sin(face));
      for (const sgn of [-1, 1]) pillars.setMatrixAt(i * 2 + (sgn > 0 ? 1 : 0), m4.compose(new V(x + side.x * 0.7 * sgn, 1.2, z + side.z * 0.7 * sgn), q, new V(1, 1, 1)));
      lintels.setMatrixAt(i, m4.compose(new V(x, 2.55, z), q, new V(1, 1, 1)));
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), new THREE.MeshBasicMaterial({ color: b.tint.clone().multiplyScalar(0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      orb.position.set(x, 1.3, z);
      orb.userData = { numeral: b.numeral, name: b.name, tint: b.tint.clone() };
      this.alcoveOrbs.push(orb);
      this.grotto.add(orb);
      // its numeral, carved above
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 64;
      const g = c.getContext("2d")!;
      g.fillStyle = "rgba(233,195,125,0.85)";
      g.font = "40px Georgia, serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(b.numeral, 64, 34);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 }));
      label.position.set(x - Math.sin(face) * 0.25, 3.05, z - Math.cos(face) * 0.25);
      label.rotation.y = face;
      this.grotto.add(label);
    });
    pillars.instanceMatrix.needsUpdate = lintels.instanceMatrix.needsUpdate = true;
    pillars.computeBoundingSphere();
    lintels.computeBoundingSphere();
    this.grotto.add(pillars, lintels);
    // the way out: a soft light in the wall, where you came in
    this.exitDoor = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    {
      const p = uv().sub(vec2(0.5, 0)).mul(vec2(2, 1)), r = length(p);
      this.exitDoor.colorNode = vec4(vec3(0.4, 0.78, 1.0).mul(smoothstep(1, 0.4, r).mul(smoothstep(0, 0.1, uv().y)).mul(0.45)), 1);
    }
    const exit = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4), this.exitDoor);
    const ea = Math.PI; // due west in the grotto (between two alcoves)
    exit.position.set(Math.cos(ea) * (GR - 0.6), 2, Math.sin(ea) * (GR - 0.6));
    exit.rotation.y = Math.PI / 2;
    this.grotto.add(exit);
    this.exitAt.copy(exit.position).add(O);
    // the centre's ring of stillness, and motes drifting in the still water
    this.centreRing.mesh.position.set(0, 0.08, 0);
    this.grotto.add(this.centreRing.mesh);
    const motes = new Float32Array(360 * 3);
    const R = rng(5);
    for (let i = 0; i < 360; i++) {
      const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * (GR - 2), y = 0.5 + R() * (GH - 3);
      motes.set([Math.cos(a) * rr, y, Math.sin(a) * rr], i * 3);
    }
    this.grotto.add(worldPoints(motes, { color: new THREE.Color(0.7, 0.9, 1.0), size: 0.07, opacity: 0.6 }).sprite);
  }

  /** The tablets and alcoves reflect what you have heard and whom you have met. */
  refresh(heard: Set<string>, met: (numeral: string) => boolean): void {
    this.tabletIds.forEach((id, i) => this.tablets.setColorAt(i, heard.has(id) ? this.col.setRGB(1.0, 0.78, 0.48).multiplyScalar(1.2) : this.col.setRGB(0.05, 0.05, 0.07)));
    if (this.tablets.instanceColor) this.tablets.instanceColor.needsUpdate = true;
    for (const o of this.alcoveOrbs) {
      const d = o.userData as { numeral: string; tint: THREE.Color };
      (o.material as THREE.MeshBasicMaterial).color.copy(d.tint).multiplyScalar(met(d.numeral) ? 1.1 : 0.1);
    }
  }

  /** A tap in the grotto: a tablet (its narration) or an alcove's light (its archetype). */
  pick(x: number, y: number, camera: THREE.Camera): { tablet: string } | { numeral: string } | null {
    if (!this.inside) return null;
    this.ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
    const hits = this.ray.intersectObjects([this.tablets, ...this.alcoveOrbs], false);
    const h = hits.find((k) => k.distance < 30);
    if (!h) return null;
    if (h.object === this.tablets && h.instanceId !== undefined) return { tablet: this.tabletIds[h.instanceId] };
    const d = h.object.userData as { numeral?: string };
    return d.numeral ? { numeral: d.numeral } : null;
  }

  /** A cave mouth the wanderer is swimming through, if any. */
  atMouth(p: THREE.Vector3): MouthSite | null {
    for (const m of this.mouths) if (m.portal.distanceTo(p) < 3.2) return m.site;
    return null;
  }

  /** Just outside a cave's mouth, facing out into the lake. */
  outside(m: MouthSite): { x: number; y: number; z: number; heading: number } {
    const x = m.x + Math.cos(m.face) * 6, z = m.z + Math.sin(m.face) * 6;
    return { x, z, y: Math.max(heightAt(x, z) + 2, heightAt(m.x, m.z) + 1.5), heading: Math.atan2(-Math.cos(m.face), -Math.sin(m.face)) };
  }

  /** Coming in: by the way in, looking toward the centre. */
  entry(): { x: number; y: number; z: number; heading: number } {
    const e = this.exitAt;
    const x = e.x + 4.5, z = e.z;
    return { x, y: ARCHIVE_ORIGIN.y + 2.2, z, heading: -Math.PI / 2 };
  }

  floorAt(): number {
    return ARCHIVE_ORIGIN.y;
  }

  /** Keep the wanderer within the dome; true when they swim back into the way out. */
  confine(p: THREE.Vector3): boolean {
    if (p.distanceTo(this.exitAt) < 1.8) return true;
    const l = this.local.copy(p).sub(ARCHIVE_ORIGIN);
    l.y = THREE.MathUtils.clamp(l.y, 0.25, GH - 2.5);
    const lim = GR * Math.sqrt(Math.max(0.05, 1 - ((l.y + 1.2) / GH) ** 2)) - 1.2;
    const d = Math.hypot(l.x, l.z);
    if (d > lim) {
      l.x *= lim / d;
      l.z *= lim / d;
    }
    p.copy(l).add(ARCHIVE_ORIGIN);
    return false;
  }

  /** Near the way out, inside. */
  nearExit(p: THREE.Vector3): boolean {
    return p.distanceTo(this.exitAt) < 7;
  }

  /** Each frame. Returns the ring of stillness the wanderer rests in, if any. */
  update(t: number, player: THREE.Vector3, inWater: boolean, near: boolean): Ring | null {
    this.group.visible = !this.inside && (inWater || near);
    // the water swallows everything past a few tens of metres: farther ruins aren't drawn
    for (const r of this.ruinParts) r.group.visible = Math.hypot(player.x - r.x, player.z - r.z) < 140;
    this.uT.value = t;
    for (const m of this.mouths) (m.door as unknown as { timeU: { value: number } }).timeU.value = t;
    let inRing: Ring | null = null;
    const rings = this.inside ? [this.centreRing] : this.group.visible ? this.rings : [];
    for (const r of rings) {
      const d = Math.hypot(player.x - (this.inside ? ARCHIVE_ORIGIN.x : r.site.x), player.z - (this.inside ? ARCHIVE_ORIGIN.z : r.site.z));
      const floorY = this.inside ? ARCHIVE_ORIGIN.y : r.site.y;
      if (d < r.site.r && player.y - floorY < 7) inRing = r;
    }
    for (const r of [...this.rings, this.centreRing]) r.set(t, r.glow);
    const dome = this.grotto.children[0] as THREE.Mesh;
    (dome.material as unknown as { timeU: { value: number } }).timeU.value = t;
    return inRing;
  }

  /** A question to sit with, not the one just asked. */
  reflection(): string {
    let i = Math.floor(Math.random() * REFLECTIONS.length);
    if (i === this.lastReflection) i = (i + 1) % REFLECTIONS.length;
    this.lastReflection = i;
    return REFLECTIONS[i];
  }

  show(inside: boolean): void {
    this.inside = inside;
    this.grotto.visible = inside;
  }
}
void cos;
void max;
void WATER_Y;
