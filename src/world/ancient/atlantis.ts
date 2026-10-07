/* Atlantis under the sea (the owner's brief, SPEC 2; the telling `ATLANTIS`, Aria, 269.71 s):
   melancholy grandeur, the sea keeping it the way a museum keeps a tragedy, intact enough to
   understand, broken enough to ache. Scale is the feeling: everything a little bigger than you
   expect. After Plato's city of rings.
   - The rings: alternating rings of land (raised, faced in pale marble masonry) and water (the
     canals, lower) about a central islet; you swim ring to ring.
   - The acropolis: a raised round platform of three steps; a ruined temple on it (a ring of great
     fluted columns, some standing, some fallen, a broken pediment lying across the floor, massive
     lintel blocks), and a throne-like seat facing the way you come.
   - The colonnade: an avenue of great columns from the outer ring toward the centre, half still
     standing, half toppled in sequence like dominoes, capitals scattered.
   - The crystals: four great dim crystals in broken stone housings, dead power sources, a faint
     inner light breathing on a slow ~20 s cycle (never flashy).
   - The bridges: arched spans over the canals, some whole, some broken mid-arch.
   - The harbour: stone quays on the outer ring, mooring rings, the ribs of great hulls half buried
     in the silt.
   - Silt over everything; pottery and worked blocks for close discovery; small debris tumbling
     slowly past; a gentle current of motes along the canals.
   - Light: colder and deeper than the Maya city (blue-green, fewer shafts), with pockets of gold
     that swell at the telling's turning moments.
   - Life: fish keep to the outer rings (the centre feels emptied); one great ray circles the
     acropolis wide.
   - Wanderers: tall robed figures of pale blue light walking slowly along the canals and the
     colonnade; one stands still on the acropolis facing the sea; and, on the acropolis's far side,
     a larger still presence (a memorial more than a character). */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T, outOfTheWay, softPoints, spriteCloud, type N } from "../../gpu/tsl";
import { heightAt, SPAWN, standHooks, type Collider } from "../terrain";
import type { RuinSite } from "../depths";
import { flutedColumn } from "../../scenes/past/kit";
import { Keeper, Merge, place, rng, roughBlock, seaMasonry, seaStone, shafts, solidBox, solidRound, Swimmers } from "./kit";
import type { Area } from "./index";

const { cameraPosition, float, length, positionWorld, pow, sin, smoothstep, uniform, vec3, vec4 } = T;
const V3 = THREE.Vector3;

/** The rings (local radii, m): land rings stand 1.6 m above the canals' floor. */
const ISLE = 11; // the central islet
const RINGS: { r0: number; r1: number; land: boolean }[] = [
  { r0: ISLE, r1: 19, land: false },
  { r0: 19, r1: 29, land: true },
  { r0: 29, r1: 38, land: false },
  { r0: 38, r1: 49, land: true },
  { r0: 49, r1: 57, land: false },
];
const LAND_H = 2.3;
const ACRO_H = 4.3; // the acropolis platform's top

/** A ring of land: a flat top between r0 and r1, its faces battered a little, 2 m courses. */
function ringGeo(r0: number, r1: number, h: number, seg = 96): THREE.BufferGeometry {
  // outer foot → outer top → inner top → inner foot: the faces turn outward and up
  const pts = [new THREE.Vector2(r1 - 0.35, 0), new THREE.Vector2(r1, h), new THREE.Vector2(r0, h), new THREE.Vector2(r0 + 0.35, 0)];
  return new THREE.LatheGeometry(pts, seg);
}

/** A round-headed arch spanning `span`, `w` wide (along the canal), its springing at y = 0. */
function archSpan(span: number, rise: number, w: number, deck: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const r = span / 2;
  sh.moveTo(-r - 1.2, -0.4);
  sh.lineTo(-r, -0.4);
  sh.absarc(0, -0.4, r, Math.PI, 0, true);
  sh.lineTo(r + 1.2, -0.4);
  sh.lineTo(r + 1.2, rise + deck);
  sh.lineTo(-r - 1.2, rise + deck);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 20 });
  g.translate(0, 0, -w / 2);
  return g;
}

/** A long crystal: a hexagonal prism with a pointed head. */
function crystalGeo(r: number, h: number): THREE.BufferGeometry {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r, 0.2), new THREE.Vector2(r * 0.92, h * 0.78), new THREE.Vector2(0, h)];
  return new THREE.LatheGeometry(pts, 6);
}

export function buildAtlantis(site: RuinSite, cues: { t: number }[] = []): Area {
  const uT = uniform(0), uGold = uniform(0), uPulse = uniform(0);
  const group = new THREE.Group();
  const face = Math.atan2(SPAWN.x - site.x, SPAWN.z - site.z); // the throne and the avenue look toward the shore
  group.position.set(site.x, site.y, site.z);
  group.rotation.y = face;
  const cs = Math.cos(face), sn = Math.sin(face);
  const W = (lx: number, lz: number): [number, number] => [site.x + lx * cs + lz * sn, site.z - lx * sn + lz * cs];
  const solids: Collider[] = [];
  const box = (lx: number, lz: number, hx: number, hz: number, ang: number, top: number) => {
    const [x, z] = W(lx, lz);
    solidBox(x, z, hx, hz, face + ang, site.y + top, solids);
  };
  const round = (lx: number, lz: number, r: number, top: number) => {
    const [x, z] = W(lx, lz);
    solidRound(x, z, r, site.y + top, solids);
  };
  const R = rng(2207);
  /** The height of what stands at (x, z) in the world: a land ring, the acropolis, else none. */
  const raised = (x: number, z: number): number => {
    const dx = x - site.x, dz = z - site.z, d = Math.hypot(dx, dz);
    if (d > 60) return -Infinity;
    if (d < ISLE - 4.5) return site.y + ACRO_H;
    if (d < ISLE) return site.y + LAND_H;
    if (RINGS.some((rg) => rg.land && d > rg.r0 && d < rg.r1) || (d > 57 && d < 60)) return site.y + LAND_H;
    return -Infinity;
  };
  standHooks.push(raised);
  const ground = (x: number, z: number) => Math.max(heightAt(x, z), raised(x, z));
  const cold: [number, number, number] = [0.55, 0.78, 0.95];
  const wall = seaMasonry("sandstone_blocks_05", [1.1, 1.12, 1.16], { course: 1.0, block: 2.1, flag: 2.2 }, uT, 0.12, cold, 0.1, "marble");
  const stone = seaMasonry("sandstone_blocks_08", [1.0, 1.04, 1.1], { course: 0.9, block: 1.6, flag: 1.6 }, uT, 0.12, cold, 0.1);
  const colM = seaStone({ set: "sandstone_cracks", tint: [1.34, 1.34, 1.38], caustic: float(0.1), causticCol: cold, sea: 0.8, growth: [0.2, 0.3, 0.26], lift: 0.12 }, uT);
  const mg = new Merge<"wall" | "stone" | "col">();

  // the rings of land, faced in pale stone
  for (const rg of RINGS) if (rg.land) mg.add("wall", ringGeo(rg.r0, rg.r1, LAND_H));
  // the outer shore of the city, a low battered wall beyond the last canal
  mg.add("wall", ringGeo(57, 60, LAND_H * 0.8));
  // the acropolis: three steps up to its round platform
  mg.add("wall", ringGeo(0, ISLE, LAND_H, 64));
  for (let k = 0; k < 3; k++) mg.add("stone", ringGeo(0, ISLE - 1.2 - k * 1.1, LAND_H + 0.65 * (k + 1), 64));
  round(0, 0, ISLE - 0.4, LAND_H);
  // the ruined temple: a ring of great fluted columns, some standing, some fallen
  const colGeo = flutedColumn(0.62, 9.5, 20);
  const cols: { lx: number; lz: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, lx = Math.cos(a) * 6.6, lz = Math.sin(a) * 6.6;
    const standing = [0, 1, 2, 4, 7, 9, 10].includes(i);
    if (standing) {
      mg.add("col", colGeo, place(lx, ACRO_H, lz, R(), 1, 1, 1, (R() - 0.5) * 0.04, (R() - 0.5) * 0.04));
      round(lx, lz, 0.75, ACRO_H + 9.5);
      cols.push({ lx, lz });
    } else {
      // fallen outward, broken in two
      const out = a + (R() - 0.5) * 0.4;
      for (let k = 0; k < 2; k++) {
        const d = 6.6 + 1.5 + k * 4.6;
        mg.add("col", colGeo, place(Math.cos(out) * d, ACRO_H + 0.6, Math.sin(out) * d, -out + Math.PI / 2, 1, 0.48, 1, Math.PI / 2, 0));
      }
    }
  }
  // lintels still spanning standing neighbours (0–1, 1–2, 9–10), and great blocks fallen
  for (const [a, b] of [[0, 1], [1, 2], [9, 10]] as const) {
    const ca = cols.find((_, i) => i === [0, 1, 2, 4, 7, 9, 10].indexOf(a)), cb = cols.find((_, i) => i === [0, 1, 2, 4, 7, 9, 10].indexOf(b));
    if (!ca || !cb) continue;
    const mx = (ca.lx + cb.lx) / 2, mz = (ca.lz + cb.lz) / 2, len = Math.hypot(cb.lx - ca.lx, cb.lz - ca.lz) + 1.6;
    mg.add("stone", roughBlock(len, 1.3, 1.5, R, 0.15), place(mx, ACRO_H + 9.5 + 0.65, mz, -Math.atan2(cb.lz - ca.lz, cb.lx - ca.lx)));
  }
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI * 2, d = 3 + R() * 6;
    mg.add("stone", roughBlock(3 + R() * 2.5, 1.2, 1.4, R, 0.25), place(Math.cos(a) * d, ACRO_H + 0.55, Math.sin(a) * d, R() * 3, 1, 1, 1, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3));
  }
  // the broken pediment, lying across the floor at the back
  {
    const sh = new THREE.Shape();
    sh.moveTo(-6, 0);
    sh.lineTo(6, 0);
    sh.lineTo(0, 2.6);
    sh.closePath();
    const ped = new THREE.ExtrudeGeometry(sh, { depth: 1.1, bevelEnabled: false });
    mg.add("stone", ped, place(-1.2, ACRO_H + 0.05, -4.4, 0.35, 1, 1, 1, -Math.PI / 2 + 0.08, 0.1));
    box(-1.2, -4, 5.5, 1.6, 0.35, ACRO_H + 1.2);
  }
  // the throne: a great seat with a high back, facing the way you come (+z)
  mg.add("stone", roughBlock(2.6, 1.3, 2.2, R, 0.06), place(0, ACRO_H + 0.65, 1.5));
  mg.add("stone", roughBlock(2.6, 3.6, 0.6, R, 0.06), place(0, ACRO_H + 1.8, 0.5));
  for (const sx of [-1.15, 1.15]) mg.add("stone", roughBlock(0.4, 0.9, 2.0, R, 0.05), place(sx, ACRO_H + 1.75, 1.5));
  box(0, 1.2, 1.4, 1.4, 0, ACRO_H + 3.6);

  // the colonnade avenue: from the outer ring toward the centre along +z, on the land ring
  // 38–49 and across it; half standing, half toppled in sequence, capitals scattered
  const avenue: [number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const lz = 39.5 + i * 1.15; // along the ring's width
    for (const sx of [-5, 5]) {
      const k = i * 2 + (sx > 0 ? 1 : 0);
      if (lz > 48) continue;
      avenue.push([sx, lz]);
      void k;
    }
  }
  const colAv = flutedColumn(0.55, 8.2, 20);
  for (let i = 0; i < 6; i++) {
    for (const sx of [-5, 5]) {
      const lz = 22 + i * 4.6; // through the ring 19–29 and the bridge over the canal, onto 38–49
      const onLand = (lz > 19.5 && lz < 28.5) || (lz > 38.5 && lz < 48.5);
      if (!onLand) continue;
      const fallen = (sx > 0 && i % 2 === 0) || (sx < 0 && i === 3);
      if (!fallen) {
        mg.add("col", colAv, place(sx, LAND_H, lz, R()));
        round(sx, lz, 0.7, LAND_H + 8.2);
      } else {
        // toppled outward along the avenue, the one before leaning on it, drums apart
        mg.add("col", colAv, place(sx + Math.sign(sx) * 4.2, LAND_H + 0.55, lz + 0.6, 0.12 * Math.sign(sx), 1, 1, 1, 0, -Math.sign(sx) * Math.PI / 2));
        mg.add("stone", roughBlock(1.5, 0.55, 1.5, R, 0.2), place(sx + Math.sign(sx) * 8.6, LAND_H + 0.3, lz + 1.8, R()));
      }
    }
  }
  // the bridges over the canals along the avenue: one whole (inner), one broken mid-arch (outer)
  {
    const span1 = 8, span2 = 9;
    mg.add("stone", archSpan(span1, 1.4, 4.2, 0.7), place(0, LAND_H - 0.2, (19 + ISLE) / 2, Math.PI / 2));
    // the broken one: two halves, the middle fallen into the canal
    const half = archSpan(span2, 1.6, 4.2, 0.7);
    const keep = (g: THREE.BufferGeometry, side: number) => {
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) if (p.getX(i) * side < 0.9) p.setX(i, side * 0.9);
      g.computeVertexNormals();
      return g;
    };
    mg.add("stone", keep(half.clone(), -1), place(0, LAND_H - 0.2, (29 + 38) / 2, Math.PI / 2));
    mg.add("stone", keep(half.clone(), 1), place(0, LAND_H - 0.2, (29 + 38) / 2, Math.PI / 2));
    mg.add("stone", roughBlock(3.4, 1.2, 4.0, R, 0.25), place(0.6, 0.45, (29 + 38) / 2 + 0.5, 0.3, 1, 1, 1, 0.2, 0.15));
    // and two more whole bridges across the rings elsewhere
    for (const a of [Math.PI * 0.75, -Math.PI * 0.6]) {
      const m = (29 + 38) / 2;
      mg.add("stone", archSpan(span2, 1.6, 4.0, 0.7), place(Math.sin(a) * m, LAND_H - 0.2, Math.cos(a) * m, a + Math.PI / 2));
    }
  }
  // the harbour on the outer ring's far side: quays, mooring rings, hull ribs in the silt
  const HX = -44, HZ = -26;
  for (let i = 0; i < 3; i++) {
    const g = roughBlock(16, 1.6, 3.2, R, 0.1);
    mg.add("wall", g, place(HX + i * 1.5, LAND_H * 0.5, HZ - i * 7, 0.6));
    box(HX + i * 1.5, HZ - i * 7, 8, 1.6, 0.6, LAND_H);
    for (let k = -2; k <= 2; k++) mg.add("stone", new THREE.TorusGeometry(0.35, 0.08, 6, 16), place(HX + i * 1.5 + Math.cos(0.6) * k * 3, LAND_H + 0.1, HZ - i * 7 - Math.sin(0.6) * k * 3 + 1.7, 0.6, 1, 1, 1, Math.PI / 2 - 0.4, 0));
  }
  const ribs = new Merge<"wood">();
  for (let s = 0; s < 2; s++) {
    const cx = HX - 10 - s * 9, cz = HZ + 4 - s * 12, rot = 0.5 + s * 0.3;
    // the keel, half sunk, and its ribs curving up out of the silt
    ribs.add("wood", new THREE.BoxGeometry(0.4, 0.4, 18), place(cx, 0.05, cz, rot));
    for (let k = 0; k < 9; k++) {
      const along = -7.5 + k * 1.9;
      for (const side of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([new V3(0, 0, 0), new V3(side * 1.9, 0.9, 0), new V3(side * 2.4, 2.4 - Math.abs(along) * 0.12, 0)]);
        const tube = new THREE.TubeGeometry(curve, 8, 0.12, 5, false);
        ribs.add("wood", tube, place(cx + Math.sin(rot) * along, -0.2, cz + Math.cos(rot) * along, rot + Math.PI / 2, 1, 1, 1, 0, (R() - 0.5) * 0.25));
      }
    }
  }
  // pottery and worked blocks scattered for discovery
  const pot = new THREE.LatheGeometry([0, 0.18, 0.32, 0.36, 0.3, 0.12, 0.1, 0.14].map((r, i) => new THREE.Vector2(r, i * 0.14)), 14);
  for (let i = 0; i < 40; i++) {
    const a = R() * Math.PI * 2, d = 12 + R() * 46;
    const lx = Math.cos(a) * d, lz = Math.sin(a) * d;
    const onLand = RINGS.some((rg) => rg.land && d > rg.r0 + 0.5 && d < rg.r1 - 0.5);
    const y = onLand ? LAND_H : 0;
    if (i % 3 === 0) mg.add("stone", pot, place(lx, y + 0.05, lz, R() * 6, 1, 1, 1, Math.PI / 2 * (R() > 0.4 ? 1 : 0), 0));
    else mg.add("stone", roughBlock(0.6 + R() * 1.2, 0.5 + R() * 0.5, 0.6 + R() * 0.9, R, 0.2), place(lx, y + 0.2, lz, R() * 3, 1, 1, 1, (R() - 0.5) * 0.4, (R() - 0.5) * 0.4));
  }
  const woodM = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  woodM.colorNode = vec4(vec3(0.16, 0.13, 0.1).mul(T.mx_noise_float(positionWorld.mul(3)).mul(0.25).add(0.85)), 1);
  woodM.emissiveNode = vec3(0.02, 0.03, 0.035);
  group.add(mg.build({ wall, stone, col: colM }), ribs.build({ wood: woodM }));

  // the crystals: dead power sources in broken housings, a faint light breathing (~20 s)
  const crystM = new THREE.MeshStandardNodeMaterial({ color: 0x6f8f9c, metalness: 0.05, roughness: 0.3, transparent: true, opacity: 0.88 });
  {
    const V = T.normalize(cameraPosition.sub(positionWorld));
    const ndv = T.max(T.dot(T.normalWorld, V), 0);
    const flick = sin(uT.mul(3.1).add(positionWorld.y.mul(1.3))).mul(0.06).add(0.94);
    const inner = uPulse.mul(0.55).add(0.12).mul(flick);
    crystM.emissiveNode = vec3(0.4, 0.68, 0.85).mul(pow(float(1).sub(ndv), 2).mul(0.25).add(inner.mul(0.32)));
  }
  const cg: THREE.BufferGeometry[] = [];
  const housings = new Merge<"stone">();
  for (const [lx, lz, h, lean] of [[-24, 8, 7.5, 0.18], [24, -10, 6, -0.25], [14, 33, 8.5, 0.1], [-33, -18, 5.5, 0.4]] as const) {
    const y = Math.hypot(lx, lz) > 19 && Math.hypot(lx, lz) < 29 ? LAND_H : Math.hypot(lx, lz) > 38 && Math.hypot(lx, lz) < 49 ? LAND_H : 0;
    cg.push(crystalGeo(1.1, h).applyMatrix4(place(lx, y + 0.4, lz, R(), 1, 1, 1, lean, lean * 0.5)));
    cg.push(crystalGeo(0.55, h * 0.55).applyMatrix4(place(lx + 1.3, y + 0.3, lz + 0.6, R(), 1, 1, 1, -0.4, 0.3)));
    // the housing: a broken collar of stone, a third of it gone
    const collar = new THREE.CylinderGeometry(2.2, 2.4, 1.6, 20, 1, true, 0.3, Math.PI * 1.35);
    housings.add("stone", collar, place(lx, y + 0.8, lz, R() * 3));
    housings.add("stone", roughBlock(1.6, 0.9, 1.0, R, 0.25), place(lx + 2.6, y + 0.4, lz - 1.2, R() * 3, 1, 1, 1, 0.2, 0.1));
    round(lx, lz, 1.6, y + h);
  }
  const crystals = new THREE.Mesh(mergeGeometries(cg), crystM);
  group.add(crystals, housings.build({ stone }));

  // a gentle current along the canals: motes drifting round the rings
  const current = currentMotes(uT);
  group.add(current);
  // debris tumbling slowly past (small worked stones and sherds, on long slow arcs)
  const debris = new THREE.InstancedMesh(roughBlock(0.35, 0.22, 0.3, R, 0.2), stone, 10);
  debris.frustumCulled = false;
  const drift = Array.from({ length: 10 }, (_, i) => ({ r: 14 + R() * 40, a: R() * 6.28, y: 3 + R() * 9, w: (0.01 + R() * 0.012) * (i % 2 ? 1 : -1), spin: 0.2 + R() * 0.3 }));
  group.add(debris);

  // light: few cold shafts; two of warm gold (the telling's turning moments)
  const coldSpots = [[0, 0, 5], [-34, 14, 3.4], [30, 26, 3.2]].map(([lx, lz, r]) => {
    const [x, z] = W(lx, lz);
    return { x, z, y: site.y, r };
  });
  const goldSpots = [[0, 2, 3.2], [0, 43, 2.8]].map(([lx, lz, r]) => {
    const [x, z] = W(lx, lz);
    return { x, z, y: site.y + (lz > 30 ? LAND_H : ACRO_H), r };
  });
  const coldShafts = shafts(coldSpots, [0.6, 0.82, 0.98], float(0.55), uT);
  const goldShafts = shafts(goldSpots, [1.0, 0.78, 0.4], uGold.mul(0.9), uT);

  // the wanderers, the one who keeps watch, and the still presence
  const tint: [number, number, number] = [0.62, 0.82, 1.0];
  const ringPath = (r: number, n: number, a0: number, dir: number) =>
    Array.from({ length: n }, (_, k) => {
      const a = a0 + dir * (k / n) * Math.PI * 2;
      const [x, z] = W(Math.cos(a) * r, Math.sin(a) * r);
      return { x, z };
    });
  const p1 = ringPath(33.5, 14, 0.4, 1), p2 = ringPath(53, 18, 2.6, -1);
  const avenuePath = [W(0, 46), W(0, 22)].map(([x, z]) => ({ x, z }));
  const [wx, wz] = W(0, -5.2);
  const [gx, gz] = W(-2.6, -7.6);
  const keepers = [
    new Keeper({ recipe: "ATLANTEAN", tint, x: p1[0].x, z: p1[0].z, face, pose: "walk", path: p1, pause: 4, water: true, scale: 1.12, ground }),
    new Keeper({ recipe: "ATLANTEAN", tint, x: p2[0].x, z: p2[0].z, face, pose: "walk", path: p2, pause: 3, water: true, scale: 1.12, ground }),
    new Keeper({ recipe: "ATLANTEAN", tint, x: avenuePath[0].x, z: avenuePath[0].z, face, pose: "walk", path: avenuePath, pause: 14, water: true, scale: 1.12, ground }),
    new Keeper({ recipe: "ATLANTEAN", tint, x: wx, z: wz, y: site.y + ACRO_H, face: face + Math.PI, pose: "stand", water: true, scale: 1.12 }),
    new Keeper({ recipe: "ATLANTEAN_PRESENCE", tint: [0.85, 0.92, 1.0], x: gx, z: gz, y: site.y + ACRO_H, face: face + Math.PI * 0.85, pose: "stand", water: true, scale: 1.6 }),
  ];
  const keeperGroup = new THREE.Group();
  for (const k of keepers) keeperGroup.add(k.root);

  // fish keep to the outer rings; one great ray circles the acropolis wide
  const swim = new Swimmers([
    { file: "fish1", length: 0.45, tint: [0.7, 0.9, 1.1], count: 10, cx: site.x, cz: site.z, rx: 52, rz: 52, y: 5, speed: 0.03, spread: 2.8 },
    { file: "fish2", length: 0.5, tint: [0.8, 0.85, 1.1], count: 8, cx: site.x, cz: site.z, rx: 44, rz: 44, y: 8, speed: -0.025, spread: 2.4, phase: 1.5 },
    { file: "manta", length: 4.2, tint: [0.75, 0.82, 1.15], count: 1, cx: site.x, cz: site.z, rx: 26, rz: 22, y: 13, speed: 0.03, spread: 0 },
  ]);

  const world = new THREE.Group();
  world.add(group, coldShafts, goldShafts, keeperGroup, swim.group);
  const m4 = new THREE.Matrix4();
  // the gold swells where the telling turns (seconds of its recording)
  const turns = cues.length ? cues : [];
  return {
    id: "atlantis",
    track: "ATLANTIS",
    site,
    radius: 64,
    group: world,
    solids,
    water: { tint: [0.82, 0.96, 1.18], shaft: 0.6, shaftCol: [0.3, 0.5, 0.7] },
    loaded: Promise.all(keepers.map((k) => k.loaded)).then(() => undefined),
    update(dt: number, t: number, visitor: THREE.Vector3, reduced: boolean, telling?: { id: string | null; t: number }) {
      uT.value = t;
      // the crystals breathe once every ~20 s, slow in, slower out
      const ph = (t % 20) / 20;
      uPulse.value = Math.pow(Math.sin(Math.PI * Math.min(1, ph * 1.4)), 2);
      // gold: while the telling speaks, at its turns
      let gold = 0;
      if (telling && telling.id === "ATLANTIS") for (const c of turns) gold = Math.max(gold, Math.exp(-Math.pow((telling.t - c.t - 6) / 7, 2)));
      uGold.value += (gold - (uGold.value as number)) * Math.min(1, dt * 0.4);
      for (let i = 0; i < drift.length; i++) {
        const d = drift[i];
        d.a += d.w * dt * (reduced ? 0.4 : 1);
        m4.compose(new V3(Math.cos(d.a) * d.r, d.y + Math.sin(t * 0.13 + i) * 1.2, Math.sin(d.a) * d.r), new THREE.Quaternion().setFromEuler(new THREE.Euler(t * d.spin, t * d.spin * 0.7, i)), new V3(1, 1, 1));
        debris.setMatrixAt(i, m4);
      }
      debris.instanceMatrix.needsUpdate = true;
      for (const k of keepers) k.update(dt, t, visitor, reduced);
      swim.update(dt, reduced ? t * 0.5 : t);
    },
  };
}

/** Motes carried round the canals by a slow current (one draw), in the city's local frame. */
function currentMotes(uT: N): THREE.Sprite {
  const n = 900;
  const R = rng(931);
  const mat = softPoints();
  const c = spriteCloud(n, { aP: 3 }, mat);
  const arr = c.attrs.aP.array as Float32Array;
  const canals = RINGS.filter((r) => !r.land);
  for (let i = 0; i < n; i++) {
    const canal = canals[i % canals.length];
    arr.set([R() * Math.PI * 2, canal.r0 + 1 + R() * (canal.r1 - canal.r0 - 2), 0.4 + R() * 3.5], i * 3); // angle, radius, height
  }
  const P = c.nodes.aP;
  const a = P.x.add(uT.mul(float(0.9).div(P.y))); // ~0.9 m/s along its canal
  mat.positionNode = vec3(T.cos(a).mul(P.y), P.z.add(sin(uT.mul(0.3).add(P.x.mul(7))).mul(0.3)), sin(a).mul(P.y));
  mat.sizeNode = float(2.2);
  const fade = smoothstep(2, 8, length(cameraPosition.sub(positionWorld)));
  mat.colorNode = vec4(vec3(0.55, 0.75, 0.9).mul(0.28).mul(fade).mul(outOfTheWay(positionWorld)), 1);
  return c.sprite;
}
