/* The temple's precinct (the owner: "now it's just a door outside, I want a full size Egyptian temple
   with walls, garden and fountain and gate"). The pylon by the shore was a gate standing alone in
   the meadow; now it is the front of a whole temple, after Karnak and Edfu, laid out on its own
   levelled ground:
   - behind the pylon the temple itself: the hypostyle hall's mass with its raised clerestory, then
     the lower sanctuary, battered walls under cavetto cornices, roll mouldings at the corners (the
     interior is still the place apart, entered through the pylon's door);
   - round it all a temenos wall, battered, under its cornice, and in its front, toward the shore,
     a gateway (a tall propylon with a winged sun on its lintel, both faces); before it a paved
     landing with steps down to the bank, a fire bowl either side;
   - between the gateway and the pylon the forecourt garden: the processional way, a round plaza
     with a fountain at its heart (a stepped stone basin; a papyrus column whose open capital is a
     bowl, water spilling over its rim all round in a thin curtain, foam where it lands), two long
     lotus pools in stone copings with papyrus at their corners, beds of flowers (cornflower, poppy,
     chamomile, mandrake), date palms along the walls, fire bowls round the plaza;
   - before the pylon two obelisks of rose granite with electrum caps, incised with columns of
     signs, and four cedar flagpoles in its face with pennants in the wind;
   - down either side of the temple and round its back, gardens of palms in rows with hedged beds.
   All of it is local to the pylon (`temple.gate`: +z toward the shore, the pylon's door at the
   origin); the stone is the shared masonry, so it is solid where it stands. Nothing here glows
   past the bloom's threshold; the pools mirror only the sky (and, wet, the scene on Best/High). */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { instanceSeed, T, vnoise, type N } from "../gpu/tsl";
import { setWet } from "../gpu/wet";
import { cavetto, put, wingedSun } from "./egyptGate";
import { papyrusGeometry, papyrusMaterial } from "./nile";
import { mirroredStars, skyColor } from "./sky";
import { contactShade, landStone } from "./stoneworks";
import { colliders, heightAt, KEEP_CLEAR, levelRect } from "./terrain";
import { palmGeometry, palmMaterial } from "./wilds";

const { abs, attribute, clamp, dot, float, Fn, fract, length, max, mix, normalize, pow, sin, smoothstep, uv, vec2, vec3, vec4 } = T;

/* ---------------------------------------------------------------- the plan (the pylon's frame, metres) */
/** The temenos wall: outer faces at x ±WX, front (centre line) at z FZ, back at z BZ; height, thickness. */
const WX = 27, FZ = 24, BZ = -50, WH = 6.2, WT = 1.8, WT_TOP = 1.25;
/** The gateway in the front wall: half-width, depth, height; its door. */
const GX = 6, GD = 3.2, GH = 9.6, DX = 1.7, DH = 6.6;
/** The hall behind the pylon and the sanctuary behind it. */
const HALL = { x: 9, z0: -2.25, z1: -32, h: 11.5 }, SANCT = { x: 7, z0: -32, z1: -45, h: 8.6 };
/** The fountain's plaza, the pools. */
const PLAZA = { z: 12.5, r: 6.3 }, POOL = { x0: 11.5, x1: 22, z0: 6, z1: 19, coping: 0.5, h: 0.62, water: 0.42 };
const BASIN = { r: 3.4, rim: 0.78, water: 0.56 }, BOWL = { y: 3.14, r: 0.98 };
/** The way's half-width; the obelisks' place. */
const WAY = 3.6, OBELISK = { x: 8.6, z: 4.7, h: 12.6 };

function rng(seed: number): () => number {
  let s = seed % 2147483647 || 16807;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
/** A box standing on y = 0, its upright faces leaning in as they rise (a batter, metres per side). */
function battered(w: number, h: number, d: number, inX: number, inZ: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(0, h / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > h - 1e-3) p.setXYZ(i, p.getX(i) - Math.sign(p.getX(i)) * inX, h, p.getZ(i) - Math.sign(p.getZ(i)) * inZ);
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  return g;
}
/** A roll moulding (the torus) from a to b. */
function roll(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 10, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return put(g, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
/** A cornice capping a block w (x) × d (z) at height y: two cavetto slabs crossed, flaring on all four sides. */
function capping(w: number, d: number, y: number, z: number, h: number, flare: number): THREE.BufferGeometry[] {
  return [put(cavetto(w, d, h, flare), 0, y, z), put(cavetto(d, w, h, flare), 0, y, z, 0, Math.PI / 2)];
}
/** Lathe a profile (r, y) into a solid of revolution, as plain triangles. */
function lathe(pts: [number, number][], seg = 48): THREE.BufferGeometry {
  return put(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), 0, 0, 0);
}

/** A flowering clump (a bed's plant): a fan of narrow arching leaves, and a few stalks, each topped
    by a small open flower of five petals. `aY` 0 at the ground … 1 at the top, `aKind` 0 leaf, 1 stalk, 2 petal. */
function flowerClump(): THREE.BufferGeometry {
  const pos: number[] = [], ys: number[] = [], kinds: number[] = [];
  const V3 = THREE.Vector3;
  const strip = (a: THREE.Vector3, dir: THREE.Vector3, side: THREE.Vector3, len: number, w: number, bend: THREE.Vector3, segs: number, y0: number, y1: number, k: number, taper = 0.9) => {
    let prev: [THREE.Vector3, THREE.Vector3] | null = null;
    for (let i = 0; i <= segs; i++) {
      const f = i / segs;
      const c = a.clone().addScaledVector(dir, len * f).addScaledVector(bend, len * f * f);
      const ww = w * (1 - f * taper) * (k === 2 ? Math.sin(Math.PI * (0.15 + 0.85 * f)) + 0.2 : 1);
      const l = c.clone().addScaledVector(side, -ww), r = c.clone().addScaledVector(side, ww);
      if (prev) {
        const yy = (q: number) => y0 + (y1 - y0) * q, fp = (i - 1) / segs;
        pos.push(...prev[0].toArray(), ...prev[1].toArray(), ...l.toArray(), ...prev[1].toArray(), ...r.toArray(), ...l.toArray());
        ys.push(yy(fp), yy(fp), yy(f), yy(fp), yy(f), yy(f));
        kinds.push(k, k, k, k, k, k);
      }
      prev = [l, r];
    }
  };
  for (let k = 0; k < 13; k++) {
    const a = (k / 13) * Math.PI * 2 + Math.sin(k * 5.3) * 0.5, out = new V3(Math.cos(a), 0, Math.sin(a));
    const dir = new V3(0, 1, 0).addScaledVector(out, 0.35 + ((k * 0.37) % 1) * 0.4).normalize();
    strip(out.clone().multiplyScalar(0.03), dir, new V3(-out.z, 0, out.x), 0.32 + ((k * 0.61) % 1) * 0.22, 0.03, out.clone().multiplyScalar(0.6).add(new V3(0, -0.55, 0)), 4, 0, 0.75, 0, 0.85);
  }
  for (let s = 0; s < 4; s++) {
    const a = s * 2.39996 + 0.4, r0 = 0.04 + (s % 2) * 0.05, out = new V3(Math.cos(a), 0, Math.sin(a));
    const top = out.clone().multiplyScalar(r0 + 0.08).add(new V3(0, 0.42 + s * 0.06, 0));
    const foot = out.clone().multiplyScalar(r0);
    const d = top.clone().sub(foot);
    strip(foot, d.clone().normalize(), new V3(-out.z, 0, out.x), d.length(), 0.006, new V3(0, 0, 0), 2, 0, 0.9, 1, 0.3);
    for (let p = 0; p < 5; p++) {
      const b = (p / 5) * Math.PI * 2 + s, po = new V3(Math.cos(b), 0, Math.sin(b));
      strip(top, po.clone().add(new V3(0, 0.45, 0)).normalize(), new V3(-po.z, 0, po.x), 0.065, 0.022, new V3(0, -0.12, 0), 2, 0.9, 1, 2, 0.4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aY", new THREE.Float32BufferAttribute(ys, 1));
  g.setAttribute("aKind", new THREE.Float32BufferAttribute(kinds, 1));
  g.computeVertexNormals();
  return g;
}

export class TempleComplex {
  readonly group = new THREE.Group();
  /** How near the fountain's water is (0 … 1), for its sound. */
  trickle = 0;
  private uT = T.uniform(0);
  private fountainAt = new THREE.Vector3();

  /** `gate`: the pylon's group (placed and turned); `heading`: its turn. Levels the precinct's ground
      and keeps the growing things off it: call while the world is being made (before any ground is built). */
  constructor(gate: THREE.Group, heading: number) {
    const o = gate.position, h0 = o.y;
    const cs = Math.cos(heading), sn = Math.sin(heading);
    const W = (lx: number, lz: number) => ({ x: o.x + lx * cs + lz * sn, z: o.z - lx * sn + lz * cs });
    // the precinct's ground, level with the pylon's foot, and nothing growing wild on it
    {
      const c = W(0, -12.5);
      levelRect(c.x, c.z, h0, heading, WX + 2.5, 39, 9);
      for (const lz of [16, -4, -24, -44]) KEEP_CLEAR.push({ ...W(0, lz), r: 31 });
    }
    gate.add(this.group);
    const f = W(0, PLAZA.z);
    this.fountainAt.set(f.x, h0, f.z);
    const R = rng(4242);

    /* ------------------------------------------------ stone: walls, gateway, temple */
    const wallG: THREE.BufferGeometry[] = [], hallG: THREE.BufferGeometry[] = [], carved: THREE.BufferGeometry[] = [], pave: THREE.BufferGeometry[] = [];
    const inset = (WT - WT_TOP) / 2;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // the temenos: front (either side of the gateway), back, and the two sides, each under its cornice
    const run = (len: number, x: number, z: number, along: "x" | "z") => {
      const ry = along === "x" ? 0 : Math.PI / 2;
      wallG.push(put(battered(len, WH, WT, 0, inset), x, -0.4, z, 0, ry));
      wallG.push(put(cavetto(len + 0.3, WT_TOP + 0.05, 0.55, 0.3), x, WH - 0.4, z, 0, ry));
      for (const s of [-1, 1]) {
        const a = along === "x" ? V(x - len / 2, WH - 0.42, z + s * (WT_TOP / 2)) : V(x + s * (WT_TOP / 2), WH - 0.42, z - len / 2);
        const b = along === "x" ? V(x + len / 2, WH - 0.42, z + s * (WT_TOP / 2)) : V(x + s * (WT_TOP / 2), WH - 0.42, z + len / 2);
        wallG.push(roll(a, b, 0.12));
      }
    };
    const sideX = WX - WT / 2, frontLen = WX - GX + 0.2;
    for (const s of [-1, 1]) run(frontLen, s * (GX - 0.2 + frontLen / 2), FZ, "x");
    run(2 * WX, 0, BZ, "x");
    for (const s of [-1, 1]) run(FZ - BZ + WT, s * sideX, (FZ + BZ) / 2, "z");
    // the corners: a roll moulding up each, following the batter
    for (const sx of [-1, 1])
      for (const z of [FZ + WT / 2, BZ - WT / 2]) {
        const sz = Math.sign(z);
        wallG.push(roll(V(sx * WX, -0.4, z), V(sx * WX, WH - 0.4, z - sz * inset), 0.14));
      }
    // the gateway: two great jambs and a lintel over the door, the cornice and its roll; a winged sun both faces
    for (const s of [-1, 1]) wallG.push(put(battered(GX - DX, GH + 0.4, GD, 0, 0.12), s * (DX + (GX - DX) / 2), -0.4, FZ));
    wallG.push(put(battered(2 * DX, GH - DH, GD, 0, 0.12), 0, DH, FZ));
    wallG.push(put(cavetto(2 * GX + 0.4, GD - 0.1, 0.9, 0.55), 0, GH, FZ));
    for (const s of [-1, 1]) {
      wallG.push(roll(V(-GX, GH - 0.05, FZ + s * (GD / 2 - 0.12)), V(GX, GH - 0.05, FZ + s * (GD / 2 - 0.12)), 0.14));
      wallG.push(roll(V(s * GX, GH - 0.05, FZ - GD / 2 + 0.12), V(s * GX, GH - 0.05, FZ + GD / 2 - 0.12), 0.14));
      for (const t of [-1, 1]) wallG.push(roll(V(s * GX, -0.4, FZ + t * (GD / 2)), V(s * GX, GH, FZ + t * (GD / 2 - 0.12)), 0.15));
    }
    for (const fz of [1, -1]) for (const g of wingedSun()) carved.push(put(g.scale(1.9, 1.9, 1.4), 0, DH + 1.45, FZ + fz * (GD / 2 - 0.1), 0, fz < 0 ? Math.PI : 0));
    // the temple behind the pylon: the hall (its walls battered), the clerestory over its middle,
    // the sanctuary lower behind, each capped by its cornice; roll mouldings up their corners
    const hd = HALL.z0 - HALL.z1, hz = (HALL.z0 + HALL.z1) / 2;
    hallG.push(put(battered(2 * HALL.x, HALL.h + 0.4, hd, 0.45, 0), 0, -0.4, hz));
    hallG.push(...capping(2 * HALL.x - 0.8, hd - 0.2, HALL.h, hz, 0.75, 0.42));
    hallG.push(put(battered(8.4, 2.4, hd - 3, 0.1, 0.1), 0, HALL.h + 0.6, hz));
    hallG.push(...capping(8.2, hd - 3.1, HALL.h + 3.0, hz, 0.45, 0.25));
    const sd = SANCT.z0 - SANCT.z1, sz = (SANCT.z0 + SANCT.z1) / 2;
    hallG.push(put(battered(2 * SANCT.x, SANCT.h + 0.4, sd, 0.35, 0.2), 0, -0.4, sz));
    hallG.push(...capping(2 * SANCT.x - 0.6, sd - 0.3, SANCT.h, sz, 0.6, 0.36));
    for (const sx of [-1, 1]) {
      for (const z of [HALL.z0 - 0.02, HALL.z1 + 0.02]) hallG.push(roll(V(sx * HALL.x, -0.4, z), V(sx * (HALL.x - 0.45), HALL.h, z), 0.17));
      hallG.push(roll(V(sx * SANCT.x, -0.4, SANCT.z1), V(sx * (SANCT.x - 0.35), SANCT.h, SANCT.z1 + 0.2), 0.15));
    }
    // a doorway in the sanctuary's back wall, sealed: a false door (a frame and a recess)
    carved.push(put(new THREE.BoxGeometry(2.6, 4.6, 0.3), 0, 2.3, SANCT.z1 - 0.1));

    // the paving: the apron before the pylon, the plaza, the way to the gateway, through it, the landing
    pave.push(put(new THREE.BoxGeometry(22.4, 0.3, 4.7), 0, -0.02, HALL.z0 + 2.25 + 2.35 + 2.2));
    pave.push(put(new THREE.CylinderGeometry(PLAZA.r, PLAZA.r, 0.32, 64), 0, -0.01, PLAZA.z));
    pave.push(put(new THREE.BoxGeometry(2 * WAY, 0.3, FZ - GD / 2 - (PLAZA.z + PLAZA.r) + 0.6), 0, -0.02, (FZ - GD / 2 + PLAZA.z + PLAZA.r - 0.6) / 2));
    pave.push(put(new THREE.BoxGeometry(2 * DX + 0.4, 0.3, GD + 0.2), 0, -0.02, FZ));
    // a walk round the temple's flanks and behind the sanctuary
    for (const sx of [-1, 1]) {
      pave.push(put(new THREE.BoxGeometry(3, 0.3, HALL.z0 - SANCT.z1 + 3.4), sx * (HALL.x + 1.5), -0.03, (HALL.z0 + SANCT.z1 - 3.4) / 2));
      pave.push(put(new THREE.BoxGeometry(HALL.x - SANCT.x, 0.3, SANCT.z0 - SANCT.z1 + 3.4), sx * (SANCT.x + (HALL.x - SANCT.x) / 2), -0.03, (SANCT.z0 + SANCT.z1 - 3.4) / 2));
    }
    pave.push(put(new THREE.BoxGeometry(2 * SANCT.x, 0.3, 3), 0, -0.03, SANCT.z1 - 1.5));
    // the landing beyond the gateway, down to the bank by steps (the ground falls away there)
    {
      const L0 = FZ + GD / 2, L1 = L0 + 4.6;
      // the landing's own block reaches well down; steps go on down until they meet the bank
      pave.push(put(new THREE.BoxGeometry(10, 3.2, L1 - L0), 0, 0.13 - 1.6, (L0 + L1) / 2));
      for (let k = 1; k <= 20; k++) {
        const z = L1 + (k - 0.5) * 0.42, w = W(0, z), ground = heightAt(w.x, w.z) - h0, top = 0.13 - k * 0.3;
        if (top < ground + 0.06) break;
        pave.push(put(new THREE.BoxGeometry(10 - k * 0.25, top + 3.2, 0.42), 0, (top - 3.2) / 2, z));
      }
    }

    /* ------------------------------------------------ carved stone: the fountain, pools, plinths, pedestals */
    // the fountain's basin: a moulded rim round a shallow floor, its column standing in the water
    // (each profile runs up the outside and back in over the top, so its faces look out)
    carved.push(lathe([[0, -0.1], [BASIN.r + 0.12, -0.1], [BASIN.r + 0.12, 0.14], [BASIN.r - 0.02, 0.22], [BASIN.r, BASIN.rim - 0.16], [BASIN.r + 0.1, BASIN.rim - 0.1], [BASIN.r + 0.08, BASIN.rim], [BASIN.r - 0.45, BASIN.rim], [BASIN.r - 0.45, 0.05], [0, 0.05]], 72).translate(0, 0, PLAZA.z));
    carved.push(lathe([[0, 0], [0.78, 0], [0.78, 0.5], [0.62, 0.62], [0.36, 0.7], [0.34, 1.6], [0.31, 2.4], [0.36, 2.44], [0.36, 2.54], [0.3, 2.58], [0.42, 2.75], [0.7, 2.95], [0.95, 3.1], [BOWL.r + 0.04, BOWL.y + 0.07], [BOWL.r - 0.1, BOWL.y + 0.07], [0.6, BOWL.y - 0.12], [0, BOWL.y - 0.16]], 40).translate(0, 0, PLAZA.z));
    // the fountain is walked round, not waded through
    colliders.push({ ...W(0, PLAZA.z), r: BASIN.r + 0.85, top: h0 + BOWL.y + 0.2 });
    // a ring of low steps round the basin on the plaza
    carved.push(lathe([[BASIN.r + 0.1, 0.1], [BASIN.r + 0.78, 0.1], [BASIN.r + 0.78, 0.29], [BASIN.r + 0.75, 0.32], [BASIN.r + 0.1, 0.32]], 72).translate(0, 0, PLAZA.z));
    // the pools' copings: a frame of stone round each, the water within
    for (const s of [-1, 1]) {
      const cx = (s * (POOL.x0 + POOL.x1)) / 2, cz = (POOL.z0 + POOL.z1) / 2, w = POOL.x1 - POOL.x0, d = POOL.z1 - POOL.z0, c = POOL.coping;
      carved.push(put(new THREE.BoxGeometry(w, POOL.h, c), cx, POOL.h / 2, POOL.z0 + c / 2));
      carved.push(put(new THREE.BoxGeometry(w, POOL.h, c), cx, POOL.h / 2, POOL.z1 - c / 2));
      carved.push(put(new THREE.BoxGeometry(c, POOL.h, d - 2 * c), s * POOL.x0 + s * (c / 2), POOL.h / 2, cz));
      carved.push(put(new THREE.BoxGeometry(c, POOL.h, d - 2 * c), s * POOL.x1 - s * (c / 2), POOL.h / 2, cz));
      carved.push(put(new THREE.BoxGeometry(w - 2 * c, 0.1, d - 2 * c), cx, 0.05, cz));
      // you walk round them, not into them
      const pc = W(cx, cz);
      colliders.push({ x: pc.x, z: pc.z, r: 0, hx: w / 2, hz: d / 2, ang: heading, top: h0 + POOL.h });
    }
    // the obelisks' plinths
    for (const s of [-1, 1]) carved.push(put(new THREE.BoxGeometry(2.3, 0.95, 2.3), s * OBELISK.x, 0.35, OBELISK.z));

    /* ------------------------------------------------ the obelisks: rose granite, incised, capped in electrum */
    const obG: THREE.BufferGeometry[] = [], cap: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(1.32, OBELISK.h, 1.32, 1, 12, 1).toNonIndexed();
      g.translate(0, OBELISK.h / 2, 0);
      const p = g.attributes.position as THREE.BufferAttribute;
      const gu = new Float32Array(p.count), gv = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), k = 1 - 0.34 * (y / OBELISK.h);
        p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k);
      }
      g.computeVertexNormals();
      const n = g.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        // each face's own across (−1 … 1) and up, for its column of signs
        const ax = Math.abs(n.getX(i)) > Math.abs(n.getZ(i));
        const half = 0.66 * (1 - 0.34 * (p.getY(i) / OBELISK.h));
        gu[i] = Math.abs(n.getY(i)) > 0.5 ? 9 : (ax ? p.getZ(i) : p.getX(i)) / half;
        gv[i] = p.getY(i);
      }
      g.setAttribute("aGU", new THREE.BufferAttribute(gu, 1));
      g.setAttribute("aGV", new THREE.BufferAttribute(gv, 1));
      g.deleteAttribute("uv");
      g.translate(s * OBELISK.x, 0.82, OBELISK.z);
      obG.push(g);
      const c = new THREE.ConeGeometry(0.62, 1.0, 4, 1).toNonIndexed();
      c.rotateY(Math.PI / 4);
      cap.push(put(c, s * OBELISK.x, 0.82 + OBELISK.h + 0.5, OBELISK.z));
      const oc = W(s * OBELISK.x, OBELISK.z);
      colliders.push({ x: oc.x, z: oc.z, r: 0, hx: 1.15, hz: 1.15, ang: heading, top: h0 + OBELISK.h });
    }
    const granite = landStone("sandstone_cracks", h0, 1.4, [1.32, 0.88, 0.8], undefined, "granite");
    {
      const gu = attribute("aGU", "float"), gv = attribute("aGV", "float");
      const strip = smoothstep(0.42, 0.36, abs(gu));
      const row = gv.div(0.34), cell = T.floor(row), fy = fract(row);
      const sub = T.floor(gu.mul(1.6).add(8)), fx = fract(gu.mul(1.6));
      const hsh = (a: N, b: N) => fract(sin(a.mul(12.9898).add(b.mul(78.233))).mul(43758.5453));
      const on = T.step(0.38, hsh(cell, sub));
      // a sign: a small cut figure in the cell (bars, rings, a seated shape), its edges soft
      const shape = max(smoothstep(0.32, 0.26, length(vec2(fx.sub(0.5), fy.sub(0.5)))).mul(T.step(0.5, hsh(cell.add(3), sub))), smoothstep(0.42, 0.34, abs(fx.sub(0.5))).mul(smoothstep(0.24, 0.16, abs(fy.sub(0.5)))));
      const cut = strip.mul(on).mul(shape).mul(smoothstep(0.6, 1.4, gv)).mul(0.42);
      const base = granite.colorNode as N;
      granite.colorNode = vec4(base.rgb.mul(float(1).sub(cut)), 1);
    }
    const obelisks = new THREE.Mesh(mergeGeometries(obG)!, granite);
    obelisks.castShadow = obelisks.receiveShadow = true;
    this.group.add(obelisks);

    /* ------------------------------------------------ meshes of stone */
    const wallM = landStone("sandstone_blocks_05", h0, 3.2, [0.96, 0.9, 0.82], { trim: { base: h0 - 0.4 } });
    const hallM = landStone("sandstone_blocks_08", h0, 2.6, [1, 0.96, 0.9], { trim: { base: h0 - 0.4, every: 5.8 } });
    const paveM = landStone("red_sandstone_pavement", h0, 3.2, [0.98, 0.92, 0.86], { flag: 1.15 });
    const carvedM = landStone("sandstone_cracks", h0, 1.6, [1.02, 0.96, 0.88]);
    for (const [list, m] of [[wallG, wallM], [hallG, hallM], [pave, paveM], [carved, carvedM]] as [THREE.BufferGeometry[], THREE.Material][]) {
      const mesh = new THREE.Mesh(mergeGeometries(list)!, m);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    for (const [shape, x, z, s] of [[{ w: 2 * HALL.x, d: hd + sd }, 0, (HALL.z0 + SANCT.z1) / 2, 3], [{ w: 2 * GX, d: GD }, 0, FZ, 2.4]] as [{ w: number; d: number }, number, number, number][]) {
      const shade = contactShade(shape, s, 0.45);
      shade.position.set(x, 0.03, z);
      this.group.add(shade);
    }

    /* ------------------------------------------------ metal: electrum caps, bronze bowls and finials */
    const electrum = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.78, 0.6, 0.3), metalness: 0.35, roughness: 0.38 });
    electrum.emissiveNode = vec3(0.05, 0.035, 0.012);
    const bronze = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.3, 0.19, 0.1), metalness: 0.4, roughness: 0.5 });

    /* ------------------------------------------------ flagpoles in the pylon's face, pennants in the wind */
    const poles: THREE.BufferGeometry[] = [];
    const POLES = [-8.3, -3.7, 3.7, 8.3];
    for (const x of POLES) {
      poles.push(put(new THREE.CylinderGeometry(0.13, 0.2, 20.5, 10), x, 10.25 - 0.4, 2.75));
      for (const y of [6.5, 12.5]) poles.push(put(new THREE.BoxGeometry(0.3, 0.18, 1.3), x, y, 2.25 - 0.045 * y + 0.2));
      const pc = W(x, 2.75);
      colliders.push({ x: pc.x, z: pc.z, r: 0.25, top: h0 + 20 });
    }
    const wood = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.25, 0.17, 0.11), roughness: 0.85, metalness: 0 });
    const poleMesh = new THREE.Mesh(mergeGeometries(poles)!, wood);
    poleMesh.castShadow = true;
    this.group.add(poleMesh);
    const tips: THREE.BufferGeometry[] = POLES.map((x) => put(new THREE.ConeGeometry(0.2, 0.7, 8), x, 20.35, 2.75));
    {
      const pg = new THREE.PlaneGeometry(4.6, 0.62, 18, 1);
      pg.translate(2.3, -0.31, 0);
      const pm = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
      const u = uv().x, ph = instanceSeed().mul(6.28);
      const wave = sin(u.mul(7.5).sub(this.uT.mul(3.4)).add(ph)).mul(u).mul(0.32).add(sin(u.mul(13).sub(this.uT.mul(5.1)).add(ph.mul(2))).mul(u).mul(0.08));
      pm.positionNode = T.positionLocal.add(vec3(0, u.mul(u).mul(-0.55), wave));
      const pal = T.floor(instanceSeed().mul(3.99));
      const col = mix(mix(vec3(0.5, 0.1, 0.06), vec3(0.72, 0.68, 0.6), T.step(0.5, pal)), vec3(0.09, 0.22, 0.4), T.step(1.5, pal)).toVar();
      pm.colorNode = vec4(mix(col, vec3(0.62, 0.5, 0.2), T.step(2.5, pal)).mul(mix(0.85, 1, smoothstep(0.02, 0.06, abs(uv().y.sub(0.5))))), 1);
      const pens = new THREE.InstancedMesh(pg, pm, POLES.length);
      const mtx = new THREE.Matrix4();
      POLES.forEach((x, i) => pens.setMatrixAt(i, mtx.makeTranslation(x + 0.12, 19.6, 2.75)));
      pens.castShadow = true;
      this.group.add(pens);
    }

    /* ------------------------------------------------ fire bowls: round the plaza, and either side of the landing */
    const bowlsAt: [number, number, number][] = [];
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      bowlsAt.push([Math.cos(a) * (PLAZA.r - 0.9), PLAZA.z + Math.sin(a) * (PLAZA.r - 0.9), 0.17]);
    }
    for (const s of [-1, 1]) bowlsAt.push([s * 3.9, FZ + GD / 2 + 1.4, 0.13]);
    const ped: THREE.BufferGeometry[] = [], bowls: THREE.BufferGeometry[] = [];
    for (const [x, z, y] of bowlsAt) {
      ped.push(lathe([[0, 0], [0.42, 0], [0.42, 0.14], [0.3, 0.22], [0.2, 0.3], [0.17, 0.95], [0.26, 1.05], [0.26, 1.12], [0, 1.12]], 20).translate(x, y - 0.02, z));
      bowls.push(lathe([[0, 1.1], [0.2, 1.1], [0.42, 1.2], [0.56, 1.36], [0.6, 1.42], [0.54, 1.42], [0.5, 1.37], [0, 1.3]], 24).translate(x, y - 0.02, z));
      const bc = W(x, z);
      colliders.push({ x: bc.x, z: bc.z, r: 0.5, top: h0 + 1.4 });
    }
    const pedMesh = new THREE.Mesh(mergeGeometries(ped)!, carvedM);
    pedMesh.castShadow = true;
    this.group.add(pedMesh);
    const metal = new THREE.Mesh(mergeGeometries([...bowls, ...tips])!, bronze);
    const caps = new THREE.Mesh(mergeGeometries(cap)!, electrum);
    metal.castShadow = caps.castShadow = true;
    this.group.add(metal, caps);
    this.flames(bowlsAt);

    /* ------------------------------------------------ water: the pools, the basin, the bowl; the spilling curtain */
    this.water(h0);

    /* ------------------------------------------------ living things: palms, papyrus, lotus, beds of flowers */
    const palmsAt: [number, number][] = [];
    for (const s of [-1, 1]) {
      for (const z of [4.6, 10.6, 16.6]) palmsAt.push([s * 24.1, z]);
      palmsAt.push([s * 9.6, 21.3]);
      for (const z of [-7, -16, -25, -34, -43]) palmsAt.push([s * 14, z], [s * 21.4, z + 4.5]);
    }
    {
      const pm = palmMaterial(this.uT);
      const palms = new THREE.InstancedMesh(palmGeometry(0.9), pm, palmsAt.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      palmsAt.forEach(([x, z], i) => {
        const k = 0.95 + R() * 0.32;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * Math.PI * 2);
        palms.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0, z), q, sc.set(k, k * (0.92 + R() * 0.2), k)));
        const pc = W(x, z);
        colliders.push({ x: pc.x, z: pc.z, r: 0.35, top: h0 + 6 });
      });
      palms.castShadow = true;
      this.group.add(palms);
    }
    {
      const pm = papyrusMaterial(this.uT);
      const spots: [number, number][] = [];
      for (const s of [-1, 1]) {
        const x0 = s * (POOL.x0 + 1.1), x1 = s * (POOL.x1 - 1.1);
        spots.push([x0, POOL.z0 + 1.1], [x1, POOL.z0 + 1.1], [x0, POOL.z1 - 1.1], [x1, POOL.z1 - 1.1], [x1, (POOL.z0 + POOL.z1) / 2 - 1.5], [x1, (POOL.z0 + POOL.z1) / 2 + 1.5]);
      }
      const pap = new THREE.InstancedMesh(papyrusGeometry(7), pm, spots.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      spots.forEach(([x, z], i) => {
        const k = 0.75 + R() * 0.3;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
        pap.setMatrixAt(i, m.compose(new THREE.Vector3(x, POOL.water, z), q, sc.set(k, k, k)));
      });
      this.group.add(pap);
    }
    this.lotus(R);
    this.beds(R);
  }

  /** The flames in the bronze bowls: two crossed sheets of flickering fire each, and a warm pool on the stone. */
  private flames(at: [number, number, number][]): void {
    const g = mergeGeometries([new THREE.PlaneGeometry(0.62, 1.0, 1, 4), new THREE.PlaneGeometry(0.62, 1.0, 1, 4).rotateY(Math.PI / 2)])!;
    g.translate(0, 0.5, 0);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const q = uv(), ph = instanceSeed().mul(40);
    const lick = vnoise(vec2(q.x.mul(3).add(ph), q.y.mul(2.6).sub(this.uT.mul(2.6)))).sub(0.5).mul(0.38);
    const x = abs(q.x.sub(0.5).add(lick.mul(q.y))).mul(2);
    const width = mix(float(0.95), float(0.05), pow(q.y, 0.85));
    const body = smoothstep(width, width.mul(0.35), x).mul(smoothstep(0, 0.12, q.y)).mul(smoothstep(1, 0.55, q.y.add(lick.mul(0.5))));
    const flick = sin(this.uT.mul(9.1).add(ph)).mul(0.08).add(sin(this.uT.mul(13.7).add(ph.mul(2))).mul(0.06)).add(0.86);
    const heat = smoothstep(0.75, 0.0, q.y);
    m.colorNode = vec4(mix(vec3(0.7, 0.2, 0.04), vec3(0.95, 0.66, 0.3), heat).mul(body).mul(flick).mul(0.85), 1);
    const flames = new THREE.InstancedMesh(g, m, at.length);
    const gm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const r = length(uv().sub(0.5)).mul(2);
    gm.colorNode = vec4(vec3(1, 0.6, 0.28).mul(smoothstep(1, 0.1, r).pow(1.8)).mul(sin(this.uT.mul(7.3).add(instanceSeed().mul(9))).mul(0.06).add(0.2)), 1);
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.4, 4.4).rotateX(-Math.PI / 2), gm, at.length);
    const mtx = new THREE.Matrix4();
    at.forEach(([x, z, y], i) => {
      flames.setMatrixAt(i, mtx.makeTranslation(x, y + 1.3, z));
      pool.setMatrixAt(i, mtx.makeTranslation(x, y + 0.012, z));
    });
    flames.frustumCulled = pool.frustumCulled = false;
    flames.renderOrder = 6;
    pool.renderOrder = 2;
    this.group.add(flames, pool);
  }

  /** The water: the pools, the basin and the bowl (dark, holding the sky, rippled; wet, so on Best
      and High it mirrors the scene as well), the curtain spilling from the bowl, foam where it lands. */
  private water(h0: number): void {
    const geos: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(POOL.x1 - POOL.x0 - 2 * POOL.coping + 0.02, POOL.z1 - POOL.z0 - 2 * POOL.coping + 0.02).rotateX(-Math.PI / 2);
      geos.push(put(g, (s * (POOL.x0 + POOL.x1)) / 2, POOL.water, (POOL.z0 + POOL.z1) / 2));
    }
    geos.push(put(new THREE.CircleGeometry(BASIN.r - 0.44, 64).rotateX(-Math.PI / 2), 0, BASIN.water, PLAZA.z));
    geos.push(put(new THREE.CircleGeometry(BOWL.r - 0.08, 32).rotateX(-Math.PI / 2), 0, BOWL.y, PLAZA.z));
    const m = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.012, 0.022, 0.026), roughness: 0.12, metalness: 0 });
    const pw = T.positionWorld, F = vec3(this.fountainAt.x, h0, this.fountainAt.z);
    const df = length(pw.xz.sub(F.xz));
    // ripples: a slow wind over the pools; rings running out from where the curtain falls
    const t = this.uT;
    const rings = sin(df.mul(9).sub(t.mul(5.5))).mul(smoothstep(2.8, 1.3, df)).mul(smoothstep(0.6, 1.2, df)).mul(0.09);
    const wind = vec2(sin(pw.x.mul(1.7).add(pw.z.mul(0.6)).add(t.mul(1.1))), sin(pw.z.mul(2.1).sub(pw.x.mul(0.8)).add(t.mul(0.9)))).mul(0.025);
    const fine = vec2(vnoise(pw.xz.mul(3).add(t.mul(0.4))), vnoise(pw.xz.mul(3).sub(t.mul(0.35)).add(9))).sub(0.5).mul(0.05);
    const dir = normalize(pw.xz.sub(F.xz).add(vec2(1e-4, 0)));
    const slope = wind.add(fine).add(dir.mul(rings));
    const n = normalize(vec3(slope.x, 1, slope.y));
    const v = normalize(pw.sub(T.cameraPosition));
    const Rr = T.reflect(v, n);
    const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(clamp(dot(v.negate(), n), 0, 1)), 5)));
    const sky = skyColor(normalize(vec3(Rr.x, max(Rr.y, 0.04), Rr.z))).add(T.min(mirroredStars(normalize(vec3(Rr.x, max(Rr.y, 0.04), Rr.z))).mul(0.8), 0.7));
    m.emissiveNode = sky.mul(fres.mul(0.9).add(0.05));
    setWet(m, float(0.95), float(1));
    this.group.add(new THREE.Mesh(mergeGeometries(geos)!, m));

    // the curtain: falling from the bowl's rim in a parabola (carried out a little, then falling ever faster)
    const pts: THREE.Vector2[] = [];
    const drop = BOWL.y + 0.02 - BASIN.water, tf = Math.sqrt((2 * drop) / 9.8);
    for (let i = 0; i <= 16; i++) {
      const tt = (i / 16) * tf;
      pts.push(new THREE.Vector2(BOWL.r + 0.02 + 0.55 * tt, BOWL.y + 0.04 - 4.9 * tt * tt));
    }
    const cg = new THREE.LatheGeometry(pts, 64);
    cg.translate(0, 0, PLAZA.z);
    const cm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const q = uv();
    // fall time ~ √(distance fallen): the pattern rides the water, faster lower down
    const ft = T.sqrt(q.y);
    const streak = vnoise(vec2(q.x.mul(160), ft.mul(5).sub(t.mul(2.6))));
    const sheet = smoothstep(0.25, 0.75, streak);
    const white = smoothstep(0.35, 1, q.y);
    const rim = smoothstep(0.08, 0, q.y);
    cm.colorNode = vec4(mix(vec3(0.26, 0.33, 0.38), vec3(0.62, 0.66, 0.7), white.mul(sheet)).add(rim.mul(0.25)), 1);
    cm.opacityNode = clamp(sheet.mul(mix(0.28, 0.6, white)).add(rim.mul(0.4)).add(0.08), 0, 0.75);
    const curtain = new THREE.Mesh(cg, cm);
    curtain.renderOrder = 4;
    this.group.add(curtain);
    // foam where it lands, rings spreading
    const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const fp = T.positionGeometry;
    const fr = length(fp.xy);
    const land = BOWL.r + 0.02 + 0.55 * tf;
    const froth = vnoise(vec2(T.atan(fp.y, fp.x).mul(14), fr.mul(5).sub(t.mul(1.2))));
    fm.colorNode = vec4(vec3(0.6, 0.64, 0.66), 1);
    fm.opacityNode = smoothstep(0.35, 0.8, froth).mul(smoothstep(land + 0.9, land, fr)).mul(smoothstep(land - 0.25, land, fr)).mul(0.5);
    const foam = new THREE.Mesh(new THREE.RingGeometry(land - 0.3, land + 1.0, 64, 3).rotateX(-Math.PI / 2), fm);
    foam.geometry.rotateX(Math.PI / 2);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, BASIN.water + 0.01, PLAZA.z);
    foam.renderOrder = 3;
    this.group.add(foam);
    // the little rising swell in the bowl's middle, where the water comes up
    const sm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: true });
    const sr = length(uv().sub(0.5)).mul(2);
    sm.colorNode = vec4(vec3(0.55, 0.6, 0.64), 1);
    sm.opacityNode = smoothstep(1, 0.2, sr).mul(sin(sr.mul(18).sub(t.mul(6))).mul(0.5).add(0.5)).mul(0.28);
    const swell = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), sm);
    swell.position.set(0, BOWL.y + 0.012, PLAZA.z);
    this.group.add(swell);
  }

  /** Lotus on the pools and in the basin: leaves lying on the water, a notch cut in each, and cups of petals. */
  private lotus(R: () => number): void {
    const spots: [number, number, number][] = [], blooms: [number, number, number][] = [];
    for (const s of [-1, 1]) {
      for (let k = 0; k < 40; k++) {
        const x = s * (POOL.x0 + 0.9 + R() * (POOL.x1 - POOL.x0 - 1.8)), z = POOL.z0 + 0.9 + R() * (POOL.z1 - POOL.z0 - 1.8);
        spots.push([x, POOL.water + 0.01, z]);
        if (k % 5 === 0) blooms.push([x + 0.1, POOL.water + 0.02, z - 0.08]);
      }
    }
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + R() * 0.4, r = 2.0 + R() * 0.7;
      spots.push([Math.cos(a) * r, BASIN.water + 0.01, PLAZA.z + Math.sin(a) * r]);
      if (k % 4 === 1) blooms.push([Math.cos(a) * r, BASIN.water + 0.02, PLAZA.z + Math.sin(a) * r]);
    }
    const pad = new THREE.CircleGeometry(0.3, 14, 0.22, Math.PI * 2 - 0.44).rotateX(-Math.PI / 2);
    const pm = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
    const pr = length(T.positionGeometry.xz).div(0.3);
    pm.colorNode = vec4(mix(vec3(0.03, 0.075, 0.03), vec3(0.06, 0.12, 0.04), instanceSeed()).mul(mix(0.75, 1.05, pr)), 1);
    const pads = new THREE.InstancedMesh(pad, pm, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    spots.forEach(([x, y, z], i) => {
      const k = 0.7 + R() * 0.7;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
      pads.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, sc.set(k, 1, k)));
    });
    // the flower: a cup of eight petals, pointed, opening upward, a pale blush
    const cup = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.05, 0.02), new THREE.Vector2(0.11, 0.08), new THREE.Vector2(0.14, 0.16), new THREE.Vector2(0.15, 0.24)], 32);
    {
      const p = cup.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), up = y / 0.24;
        const tip = Math.pow(Math.max(0, Math.cos(a * 4)), 3) * up;
        const k = 1 - 0.35 * up * (1 - Math.pow(Math.max(0, Math.cos(a * 4)), 0.5));
        p.setXYZ(i, x * k, y + tip * 0.08, z * k);
      }
      cup.computeVertexNormals();
    }
    const fm = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
    const fy = T.positionGeometry.y.div(0.3);
    fm.colorNode = vec4(mix(vec3(0.5, 0.48, 0.32), mix(vec3(0.82, 0.74, 0.72), vec3(0.85, 0.5, 0.58), instanceSeed()), smoothstep(0.1, 0.6, fy)), 1);
    fm.emissiveNode = vec3(0.03, 0.025, 0.026);
    const fl = new THREE.InstancedMesh(cup, fm, blooms.length);
    blooms.forEach(([x, y, z], i) => {
      const k = 0.9 + R() * 0.5;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
      fl.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, sc.set(k, k, k)));
    });
    this.group.add(pads, fl);
  }

  /** The beds: low rounded clumps of leaves dotted with flowers (cornflower, poppy, chamomile, mandrake). */
  private beds(R: () => number): void {
    const at: [number, number, number][] = [];
    const scatter = (x0: number, x1: number, z0: number, z1: number, step: number, keep: (x: number, z: number) => boolean) => {
      for (let z = z0; z <= z1; z += step)
        for (let x = x0; x <= x1; x += step) {
          const jx = x + (R() - 0.5) * step * 0.6, jz = z + (R() - 0.5) * step * 0.6;
          if (keep(jx, jz)) at.push([jx, jz, 0.9 + R() * 0.8]);
        }
    };
    const offPlaza = (x: number, z: number) => Math.hypot(x, z - PLAZA.z) > PLAZA.r + 0.5;
    for (const s of [-1, 1]) {
      // between the way and the pools
      scatter(WAY + 0.6, POOL.x0 - 0.6, 7.6, FZ - WT / 2 - 0.8, 0.85, (x, z) => offPlaza(s * x, z) && !(x > 8.6 && z > 20.3));
      // along the front wall, and before the pylon's ends
      scatter(POOL.x0 + 0.4, WX - WT - 2.2, POOL.z1 + 0.8, FZ - WT / 2 - 0.7, 0.85, () => true);
      scatter(POOL.x0 + 0.4, WX - WT - 2.2, 3.0, POOL.z0 - 0.7, 0.85, () => true);
      // the side gardens: a hedge along the temple's flank, and clumps round the palms
      scatter(HALL.x + 3.5, HALL.x + 4.1, HALL.z1 - 12, HALL.z0 - 1.5, 0.8, () => true);
      for (const z of [-7, -16, -25, -34, -43]) for (const [cx, cz] of [[14, z], [21.4, z + 4.5]]) for (let k = 0; k < 4; k++) {
        const a = (k / 4) * 6.28 + R();
        at.push([cx + Math.cos(a) * 1.2, cz + Math.sin(a) * 1.2, 0.9 + R() * 0.6]);
      }
      // mirror whatever this side added
      if (s < 0) for (let i = 0; i < at.length; i++) if (!(at[i] as unknown as { m?: boolean }).m) at[i][0] = -at[i][0];
      for (const a of at) (a as unknown as { m?: boolean }).m = true;
    }
    scatter(-SANCT.x + 0.5, SANCT.x - 0.5, BZ + WT / 2 + 0.5, SANCT.z1 - 3.4, 0.85, () => true);
    const g = flowerClump();
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
    const y = attribute("aY", "float"), kind = attribute("aKind", "float");
    // the wind, strongest at the tops; each clump on its own time
    const ph = instanceSeed().mul(6.28);
    m.positionNode = T.positionLocal.add(vec3(sin(this.uT.mul(1.4).add(ph)), 0, sin(this.uT.mul(1.1).add(ph.mul(1.7)))).mul(y.mul(y).mul(0.05)));
    m.colorNode = Fn(() => {
      const leaf = mix(vec3(0.02, 0.045, 0.02), mix(vec3(0.07, 0.12, 0.045), vec3(0.09, 0.11, 0.04), instanceSeed()), y);
      const stalk = vec3(0.06, 0.09, 0.035);
      // cornflower, poppy, chamomile, mandrake gold; the petals paler at their tips
      const pal = T.floor(instanceSeed().mul(3.99));
      const fl = mix(mix(vec3(0.17, 0.26, 0.6), vec3(0.58, 0.09, 0.05), T.step(0.5, pal)), mix(vec3(0.66, 0.64, 0.58), vec3(0.6, 0.48, 0.12), T.step(2.5, pal)), T.step(1.5, pal));
      const petal = mix(fl.mul(0.7), fl, y.sub(0.9).mul(10).clamp(0, 1));
      return vec4(mix(mix(leaf, stalk, T.step(0.5, kind)), petal, T.step(1.5, kind)), 1);
    })();
    m.emissiveNode = mix(vec3(0), vec3(0.02, 0.02, 0.02), T.step(1.5, kind));
    const beds = new THREE.InstancedMesh(g, m, at.length);
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    at.forEach(([x, z, k], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
      beds.setMatrixAt(i, mt.compose(new THREE.Vector3(x, 0, z), q, sc.set(k, k * (0.8 + R() * 0.5), k)));
    });
    beds.receiveShadow = true;
    this.group.add(beds);
  }

  /** `near`: the wanderer's place (world); `out`: false while in a place apart. */
  update(t: number, near: THREE.Vector3, out: boolean): void {
    this.uT.value = t;
    const d = near.distanceTo(this.fountainAt);
    this.group.visible = out && d < 1600;
    this.trickle = out ? 1 - THREE.MathUtils.smoothstep(d, 4, 30) : 0;
  }
}
