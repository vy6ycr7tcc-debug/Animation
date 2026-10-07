/* Göbekli Tepe (the owner's brief; the telling `GOBEKLI`, Aria, 331.44 s): a hilltop of great
   stone enclosures above a plain, at the golden hour. The one ancient telling under the open sky,
   after the drowned cities: sun, wind, the stones very old and you very new. It stands on the
   world's own highest dry hill toward the low sun (terrain.ts `GOBEKLI`).
   - Four enclosures dug down into the hill (D, C, B, A), each a ring of dry-stone wall with
     T-pillars set into it facing in, two taller pillars at its centre. The pillars are figures:
     the T's crossbar the shoulders, arms carved down the sides to hands folded over the belly, a
     belt, a fox pelt hung from it. Some carry animals in low relief (fox, boar, lion, snake,
     scorpion, birds). In D, the vulture stone: the great bird with its wing out, the disc over
     it, the scorpion below, the headless man, three "handbags" along its head.
   - Tells not yet dug: grass over the rest of the hill, a few pillar heads breaking the turf
     (no movement: their stillness against the moving grass is the effect).
   - Boardwalks on posts with rope rails: a spine across the site, ramps down into D and C, a ring
     round C's rim, lookouts over B and A.
   - The quarry at the hill's edge: a shelf of bedrock with a pillar half cut from it, the trench
     round it, the work stopped mid-stroke.
   - Dry grass in waves of wind, a few wild flowers, dust turning in the low light, seed heads
     blown along the ground; swifts circling high (the game's small bird model, dark); the three
     sister hills out on the plain, each with a pillar head on its crown.
   - Two builders (the temple figures' idiom, undyed wool and ochre): one standing still between
     D's central pillars, facing in with the stones; one walking C's rim, pausing at each pillar.
     Never on the mounds or at the quarry.
   - Its telling begins once, the first time you come onto the hilltop, and plays on wherever you
     go (the owner's rule for these areas). */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T, gpuUniforms, outOfTheWay, softPoints, spriteCloud, viewDepth, withFog, type N } from "../../gpu/tsl";
import { GOBEKLI, GOBEKLI_PLAN, GOBEKLI_SISTERS, gobekliAt, heightAt, standHooks, type Collider } from "../terrain";
import { landStone } from "../stoneworks";
import { herdOf, type Animal } from "../creatures";
import { Keeper, Merge, place, rng, roughBlock, solidBox, solidRound } from "./kit";

const { attribute, clamp, cos, dot, float, fract, length, max, mix, positionGeometry, pow, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;
const V3 = THREE.Vector3;
const G = GOBEKLI, P = GOBEKLI_PLAN;
const TOP = G.y, FLOOR = G.y - P.depth;
const DECK = TOP + 0.45; // the boardwalk over the hilltop
/** The wind's way (site frame): off the plain, the way the grass leans. */
const WIND = new THREE.Vector2(0.8, -0.6).normalize();

/* ---------------------------------------------------------------- a T-pillar, as a figure */
type Relief = "fox" | "boar" | "lion" | "snake" | "scorpion" | "bird" | "vulture";
/** A pillar in its own frame: foot at y = 0 (sunk `embed` below), +z its front (the narrow face
    toward the circle's centre), its broad sides ±x. `h` the shaft above ground, `hh` the head. */
function tPillar(h: number, hh: number, t: number, b: number, R: () => number, reliefs: { side: 1 | -1; kind: Relief; at: number; size: number }[] = [], embed = 0.5): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, m?: THREE.Matrix4) => {
    const c = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(c.attributes)) if (a !== "position" && a !== "normal") c.deleteAttribute(a);
    if (m) c.applyMatrix4(m);
    parts.push(c);
  };
  // the shaft, a little narrower at its foot; the head, overhanging the front most
  const shaft = roughBlock(t, h + embed, b, R, 0.05);
  {
    const p = shaft.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const k = (p.getY(i) + (h + embed) / 2) / (h + embed);
      p.setZ(i, p.getZ(i) * (0.9 + 0.1 * k));
    }
    shaft.computeVertexNormals();
  }
  add(shaft, place(0, (h - embed) / 2, 0));
  const bh = b + 0.55;
  add(roughBlock(t + 0.03, hh, bh, R, 0.07), place(0, h + hh / 2 - 0.02, 0.18));
  // the arms: down each broad side from the shoulder, the elbow, the forearm forward to the front
  const belt = h * 0.36;
  const strip = (a: [number, number], c: [number, number], side: number, w = 0.1, d = 0.035) => {
    const dz = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dz, dy);
    const g = new THREE.BoxGeometry(d, len + w * 0.6, w);
    g.rotateX(-Math.atan2(dz, dy));
    g.translate(side * (t / 2 + d / 2 - 0.004), (a[1] + c[1]) / 2, (a[0] + c[0]) / 2);
    add(g);
  };
  for (const s of [-1, 1]) {
    const sh: [number, number] = [-b * 0.12, h - 0.12], el: [number, number] = [-b * 0.3, belt + (h - belt) * 0.42], wr: [number, number] = [b * 0.47, belt + 0.16];
    strip(sh, el, s, 0.12);
    strip(el, wr, s, 0.1);
  }
  // the hands, meeting on the front over the belly: four fingers from each side
  for (const s of [-1, 1])
    for (let f = 0; f < 4; f++) {
      const g = new THREE.BoxGeometry(t / 2 - 0.05, 0.034, 0.03);
      g.translate(s * (t / 4 + 0.005), belt + 0.1 + f * 0.045, b / 2 + 0.012);
      add(g);
    }
  // the belt, round the shaft; the fox pelt hanging from it in front
  add(new THREE.BoxGeometry(t + 0.05, 0.11, b * 0.95 + 0.05), place(0, belt, 0));
  {
    const sh = new THREE.Shape();
    sh.moveTo(-0.09, 0);
    sh.lineTo(0.09, 0);
    sh.lineTo(0.07, -0.42);
    sh.quadraticCurveTo(0.0, -0.62, -0.03, -0.5);
    sh.lineTo(-0.07, -0.42);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false });
    g.translate(0, belt - 0.05, b / 2 - 0.004);
    add(g);
  }
  for (const r of reliefs) add(relief(r.kind, R), reliefOn(r.side, t, r.at, r.size));
  return mergeGeometries(parts);
}
/** Lay a relief (drawn in its own u, v plane, raised along +z) on a pillar's broad side: centred
    `at` metres up, `size` metres across. */
function reliefOn(side: 1 | -1, t: number, at: number, size: number): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
  m.premultiply(new THREE.Matrix4().makeTranslation(side * (t / 2 - 0.006), at, 0));
  m.multiply(new THREE.Matrix4().makeScale(size, size, 1));
  return m;
}
const outline = (pts: number[][]): THREE.Shape => {
  const s = new THREE.Shape();
  pts.forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v)));
  s.closePath();
  return s;
};
const ex = (s: THREE.Shape | THREE.Shape[]) => new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
/** The carved animals, in the round flat manner of the pillars, about a unit across. */
function relief(kind: Relief, R: () => number): THREE.BufferGeometry {
  switch (kind) {
    case "fox": // leaping, head down, its long tail streaming up behind
      return ex(outline([[0.5, -0.32], [0.42, -0.2], [0.38, -0.06], [0.42, 0.02], [0.32, 0.0], [0.24, 0.08], [0.0, 0.16], [-0.28, 0.24], [-0.5, 0.44], [-0.56, 0.38], [-0.36, 0.14], [-0.3, 0.02], [-0.4, -0.16], [-0.32, -0.2], [-0.2, -0.04], [0.06, -0.06], [0.16, -0.22], [0.24, -0.24], [0.22, -0.12], [0.3, -0.16]]));
    case "boar": // heavy shoulders, bristled back, tusk and snout down
      return ex(outline([[0.5, -0.06], [0.46, 0.04], [0.36, 0.12], [0.3, 0.24], [0.22, 0.18], [0.12, 0.26], [0.0, 0.22], [-0.14, 0.27], [-0.3, 0.2], [-0.44, 0.1], [-0.52, 0.14], [-0.48, 0.04], [-0.4, -0.04], [-0.4, -0.24], [-0.31, -0.24], [-0.28, -0.08], [0.16, -0.08], [0.18, -0.24], [0.27, -0.24], [0.3, -0.06], [0.42, -0.08], [0.44, -0.16], [0.49, -0.13]]));
    case "lion": // a great cat, jaws open, its tail curled up
      return ex(outline([[0.52, 0.08], [0.44, 0.02], [0.52, -0.04], [0.42, -0.08], [0.36, -0.02], [0.28, -0.06], [0.24, -0.26], [0.16, -0.26], [0.16, -0.08], [-0.22, -0.08], [-0.26, -0.26], [-0.34, -0.26], [-0.34, -0.02], [-0.46, 0.08], [-0.56, 0.28], [-0.5, 0.32], [-0.44, 0.16], [-0.32, 0.16], [0.18, 0.18], [0.28, 0.28], [0.4, 0.26], [0.48, 0.18]]));
    case "snake": { // a long body winding down the stone, head at its foot
      const L: number[][] = [], Rr: number[][] = [];
      for (let i = 0; i <= 40; i++) {
        const v = 0.6 - (i / 40) * 1.2, u = Math.sin(i * 0.5) * 0.1;
        const w = 0.035 + 0.01 * Math.sin((i / 40) * Math.PI);
        L.push([u - w, v]);
        Rr.push([u + w, v]);
      }
      const head = new THREE.Shape();
      head.absellipse(Math.sin(20) * 0.1, -0.64, 0.06, 0.09, 0, Math.PI * 2, false, 0);
      return mergeGeometries([ex(outline([...L, ...Rr.reverse()])), ex(head)].map((g) => g.toNonIndexed()));
    }
    case "scorpion": { // a body of segments, claws forward, the tail curling up over the back
      const gs: THREE.BufferGeometry[] = [];
      const disc = (u: number, v: number, a: number, b2: number) => {
        const s = new THREE.Shape();
        s.absellipse(u, v, a, b2, 0, Math.PI * 2, false, 0);
        gs.push(ex(s).toNonIndexed());
      };
      disc(0, 0, 0.16, 0.1);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 0.9;
        disc(-0.18 - Math.sin(a) * 0.2, Math.cos(a) * 0.06 + (1 - Math.cos(a)) * 0.22, 0.05, 0.045);
      }
      disc(-0.3, 0.42, 0.04, 0.06);
      for (const s of [-1, 1]) {
        gs.push(ex(outline([[0.14, s * 0.04], [0.32, s * 0.14], [0.42, s * 0.1], [0.36, s * 0.16], [0.44, s * 0.22], [0.3, s * 0.2], [0.12, s * 0.08]].map(([u, v]) => (s < 0 ? [u, v] : [u, v])))).toNonIndexed());
        for (let l = 0; l < 3; l++) gs.push(ex(outline([[0.06 - l * 0.08, s * 0.06], [0.1 - l * 0.08, s * 0.2], [0.07 - l * 0.08, s * 0.2], [0.03 - l * 0.08, s * 0.07]])).toNonIndexed());
      }
      return mergeGeometries(gs);
    }
    case "bird": // a small wading bird, standing
      return ex(outline([[0.3, 0.32], [0.18, 0.28], [0.14, 0.18], [0.1, 0.06], [-0.2, 0.02], [-0.32, -0.06], [-0.1, -0.08], [0.0, -0.12], [0.02, -0.4], [0.05, -0.4], [0.06, -0.12], [0.12, -0.04], [0.18, 0.16], [0.22, 0.26]]));
    case "vulture": { // Pillar 43: the bird, one wing out over the disc, the scorpion under it,
      // the headless man to one side, birds about, and three bags along the head above
      const gs: THREE.BufferGeometry[] = [];
      const add = (g: THREE.BufferGeometry, m?: THREE.Matrix4) => {
        const c = g.toNonIndexed();
        if (m) c.applyMatrix4(m);
        gs.push(c);
      };
      add(ex(outline([[0.18, 0.36], [0.12, 0.3], [0.1, 0.16], [0.46, 0.28], [0.62, 0.22], [0.52, 0.16], [0.6, 0.1], [0.44, 0.08], [0.5, 0.02], [0.12, 0.02], [0.08, -0.22], [0.0, -0.32], [-0.08, -0.22], [-0.12, -0.02], [-0.06, 0.2], [0.04, 0.3], [0.1, 0.4]])));
      const disc = new THREE.Shape();
      disc.absarc(0.5, 0.38, 0.08, 0, Math.PI * 2, false);
      add(ex(disc));
      add(relief("scorpion", R), place(0.05, -0.62, 0, 0, 0.55, 0.55, 1));
      add(ex(outline([[-0.42, -0.26], [-0.32, -0.26], [-0.31, -0.44], [-0.35, -0.6], [-0.39, -0.6], [-0.37, -0.46], [-0.42, -0.46], [-0.44, -0.6], [-0.48, -0.6], [-0.45, -0.44], [-0.45, -0.3]])));
      add(relief("bird", R), place(-0.42, 0.18, 0, 0, 0.42, 0.42, 1));
      add(relief("bird", R), place(0.42, -0.3, 0, 0, 0.36, 0.36, 1));
      for (let i = 0; i < 3; i++) {
        const bag = outline([[-0.1, 0], [0.1, 0], [0.11, 0.12], [0.06, 0.13], [0.06, 0.2], [-0.06, 0.2], [-0.06, 0.13], [-0.11, 0.12]]);
        const hole = new THREE.Path();
        hole.absarc(0, 0.165, 0.025, 0, Math.PI * 2, true);
        bag.holes.push(hole);
        add(ex(bag), place(-0.36 + i * 0.36, 0.62, 0));
      }
      return mergeGeometries(gs);
    }
  }
}

/* ---------------------------------------------------------------- materials */
/** The pillars and the bedrock: one pale limestone, cut whole (no courses), weathered. */
const limestone = () => landStone("sandstone_cracks", FLOOR, 1.7, [1.42, 1.32, 1.1]);
/** The enclosure walls: dry stone, small stones laid in rough courses. */
const rubble = () => landStone("sandstone_cracks", FLOOR, 2.2, [0.52, 0.44, 0.34]);
/** The walls' face stones: the same pale limestone, a shade warmer and rougher. */
const faceStone = () => landStone("sandstone_cracks", FLOOR, 1.3, [1.18, 1.06, 0.86]);
function woodMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.92 });
  // the deck's uv in metres (u across, v along): planks across the walk, grain along each plank
  const u = uv();
  const plank = fract(u.y.div(0.19)), id = u.y.div(0.19).floor();
  const tone = fract(sin(id.mul(12.9898)).mul(43758.5453)).mul(0.22).add(0.86);
  const grain = sin(u.x.mul(38).add(sin(u.x.mul(3.1).add(id)).mul(2))).mul(0.5).add(0.5);
  const gap = smoothstep(0.0, 0.06, plank).mul(smoothstep(1.0, 0.94, plank));
  const c = vec3(0.46, 0.36, 0.25).mul(tone).mul(grain.mul(0.12).add(0.9)).mul(gap.mul(0.75).add(0.25));
  m.colorNode = vec4(c, 1);
  return m;
}

/* ---------------------------------------------------------------- the boardwalks */
type Run = { a: [number, number, number]; b: [number, number, number]; w: number; rails: boolean };
function runs(): Run[] {
  const out: Run[] = [];
  const run = (a: [number, number, number], b: [number, number, number], w = 1.7, rails = true) => out.push({ a, b, w, rails });
  // the spine: up from the ground at the near edge, across the top
  run([0, 47, heightAt(...gobekliAt(0, 47)) + 0.05], [0, 42, DECK], 1.7, false);
  run([0, 42, DECK], [0, -34, DECK]);
  // down into D and C, through the gaps in their walls
  run([-0.85, 4, DECK], [-9.2, 4, FLOOR + 0.18]);
  run([0.85, -8, DECK], [9.6, -8, FLOOR + 0.18]);
  // lookouts over B and A, at their rims
  run([-0.85, -25, DECK], [-1.6, -25, DECK], 2.6);
  run([0.85, 20, DECK], [2.8, 20, DECK], 2.6);
  // a ring round C's rim
  const c = P.enclosures[1], rr = c.r + 2.4, n = 18;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    run([c.x + Math.sin(a0) * rr, c.z + Math.cos(a0) * rr, DECK], [c.x + Math.sin(a1) * rr, c.z + Math.cos(a1) * rr, DECK], 1.5);
  }
  return out;
}
/** The deck's height at a point of the site's plan (−Infinity off every deck). */
function deckAt(list: Run[], lx: number, lz: number): number {
  let y = -Infinity;
  for (const r of list) {
    const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], L2 = dx * dx + dz * dz;
    const t = ((lx - r.a[0]) * dx + (lz - r.a[1]) * dz) / L2;
    if (t < -0.02 || t > 1.02) continue;
    const px = r.a[0] + dx * t - lx, pz = r.a[1] + dz * t - lz;
    if (px * px + pz * pz > (r.w / 2) * (r.w / 2)) continue;
    y = Math.max(y, r.a[2] + (r.b[2] - r.a[2]) * THREE.MathUtils.clamp(t, 0, 1) + 0.05);
  }
  return y;
}
function boardwalk(list: Run[], m: Merge<"lime" | "wall" | "stones" | "wood" | "rope">, ground: (lx: number, lz: number) => number): void {
  for (const r of list) {
    const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], dy = r.b[2] - r.a[2];
    const len = Math.hypot(dx, dz), slope = Math.hypot(len, dy);
    const head = Math.atan2(dx, dz), pitch = -Math.atan2(dy, len);
    // the deck: its uv in metres, for the planks
    const g = new THREE.BoxGeometry(r.w, 0.08, slope + 0.05);
    const u = g.attributes.uv as THREE.BufferAttribute, p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < u.count; i++) u.setXY(i, p.getX(i) + r.w / 2, p.getZ(i) + slope / 2);
    g.rotateX(pitch);
    m.add("wood", g, place((r.a[0] + r.b[0]) / 2, (r.a[2] + r.b[2]) / 2 - 0.04, (r.a[1] + r.b[1]) / 2, head), true);
    // posts down to the ground and, along the sides, rail posts with two ropes between them
    const steps = Math.max(1, Math.round(len / 2.2));
    const sx = Math.cos(head), sz = -Math.sin(head);
    let prev: [number, number, number][] | null = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = r.a[0] + dx * t, z = r.a[1] + dz * t, y = r.a[2] + dy * t;
      const tops: [number, number, number][] = [];
      for (const s of [-1, 1]) {
        const px = x + sx * s * (r.w / 2 - 0.06), pz = z + sz * s * (r.w / 2 - 0.06);
        const gy = ground(px, pz), down = y - 0.08 - gy;
        if (down > 0.05) m.add("wood", new THREE.BoxGeometry(0.11, down + 0.3, 0.11), place(px, gy + down / 2 - 0.15, pz, head), true);
        if (r.rails) {
          m.add("wood", new THREE.CylinderGeometry(0.035, 0.04, 1.0, 6), place(px, y + 0.5, pz), true);
          tops.push([px, y + 0.95, pz]);
        }
      }
      if (r.rails && prev)
        for (let s = 0; s < 2; s++)
          for (const hy of [0, -0.42]) {
            const a = prev[s], b = tops[s];
            const ax = new V3(a[0], a[1] + hy, a[2]), bx = new V3(b[0], b[1] + hy, b[2]);
            const L = ax.distanceTo(bx);
            const c = new THREE.CylinderGeometry(0.013, 0.013, L, 4);
            const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), bx.clone().sub(ax).normalize());
            m.add("rope", c, new THREE.Matrix4().compose(ax.clone().add(bx).multiplyScalar(0.5).add(new V3(0, -0.03, 0)), q, new V3(1, 1, 1)));
          }
      if (r.rails) prev = tops;
    }
  }
}

/* ---------------------------------------------------------------- the grass */
/** Dry grass over the hilltop, in tufts, leaning and running in waves with the wind; a few wild
    flowers among it. One draw; it thins to nothing 40–58 m from the eye. */
function dryGrass(n: number, keep: (lx: number, lz: number) => boolean, uT: N): THREE.Mesh {
  const geo = new THREE.InstancedBufferGeometry();
  const v = [-0.5, 0, 0.5, 0, -0.32, 0.5, 0.32, 0.5, 0, 1];
  const pos: number[] = [], uvs: number[] = [];
  for (let i = 0; i < 5; i++) {
    pos.push(v[i * 2] * 0.05, v[i * 2 + 1], 0);
    uvs.push(v[i * 2] + 0.5, v[i * 2 + 1]);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  const base: number[] = [], prm: number[] = [];
  const R = rng(1107);
  let made = 0;
  for (let tries = 0; made < n && tries < n * 4; tries++) {
    const r = Math.sqrt(R()) * 84, a = R() * Math.PI * 2;
    const lx = Math.sin(a) * r, lz = Math.cos(a) * r;
    if (!keep(lx, lz)) continue;
    // a tuft: a few blades from one root
    const tuft = 3 + Math.floor(R() * 4);
    const hgt = 0.35 + R() * 0.55;
    const flower = R() < 0.05 ? 1 + Math.floor(R() * 3) : 0;
    for (let k = 0; k < tuft && made < n; k++, made++) {
      const x = lx + (R() - 0.5) * 0.22, z = lz + (R() - 0.5) * 0.22;
      const [wx, wz] = gobekliAt(x, z);
      base.push(x, heightAt(wx, wz) - 0.02, z);
      prm.push(hgt * (0.7 + R() * 0.5), R() * Math.PI, R() * 6.28, k === 0 ? flower : 0);
    }
  }
  const aB = new THREE.InstancedBufferAttribute(new Float32Array(base), 3);
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(prm), 4);
  geo.setAttribute("aBase", aB);
  geo.setAttribute("aParams", aP);
  geo.instanceCount = made;
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
  const B = attribute("aBase", "vec3"), Pm = attribute("aParams", "vec4");
  const hgt = Pm.x, rot = Pm.y, ph = Pm.z, fl = Pm.w;
  const p0 = positionGeometry.mul(vec3(1, hgt, 1));
  const c = cos(rot), s = sin(rot);
  const w0 = B.add(vec3(p0.x.mul(c).sub(p0.z.mul(s)), p0.y, p0.x.mul(s).add(p0.z.mul(c))));
  const y2 = uv().y.mul(uv().y);
  const wd = vec2(WIND.x, WIND.y);
  // waves of wind running over the hill, and the small restless sway inside them
  const wave = sin(dot(B.xz, wd).mul(0.22).sub(uT.mul(1.5))).mul(0.5).add(0.5);
  const gust = sin(dot(B.xz, wd).mul(0.05).sub(uT.mul(0.31))).mul(0.5).add(0.5);
  const lean = wave.mul(gust.mul(0.6).add(0.4)).mul(0.42).add(0.08);
  const jit = vec2(sin(uT.mul(2.3).add(ph)), cos(uT.mul(1.9).add(ph.mul(1.4)))).mul(0.04);
  const bendV = wd.mul(lean).add(jit).mul(y2).mul(hgt);
  mat.positionNode = vec3(w0.x.add(bendV.x), w0.y.sub(lean.mul(lean).mul(0.25).mul(y2).mul(hgt)), w0.z.add(bendV.y));
  const wWorld = T.modelWorldMatrix.mul(vec4(w0, 1)).xyz;
  const fade = T.varying(float(1).sub(smoothstep(40, 58, length(wWorld.xz.sub(T.cameraPosition.xz)))).mul(smoothstep(1.0, 3.2, length(wWorld.sub(T.cameraPosition)))));
  const vY = T.varying(uv().y), vWave = T.varying(wave), vFl = T.varying(fl), vW = T.varying(wWorld);
  mat.colorNode = T.Fn(() => {
    T.If(fract(sin(dot(T.screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453)).greaterThan(fade), () => {
      T.Discard();
    });
    // straw from a dun root to a pale head lit gold by the low sun; the waves pass as a sheen
    const straw = mix(vec3(0.16, 0.12, 0.06), vec3(0.72, 0.56, 0.3), vY).add(vec3(0.38, 0.26, 0.1).mul(pow(vY, 3)).mul(vWave.mul(0.7).add(0.3)));
    const bloom = vFl.greaterThan(2.5).select(vec3(0.9, 0.78, 0.25), vFl.greaterThan(1.5).select(vec3(0.62, 0.42, 0.8), vec3(0.85, 0.16, 0.1)));
    const col = mix(straw, bloom, vFl.greaterThan(0.5).select(smoothstep(0.8, 0.95, vY), float(0)));
    return vec4(withFog(col, vW), 1);
  })();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/* ---------------------------------------------------------------- the area */
export class Gobekli {
  readonly group = new THREE.Group();
  /** The sister hills' pillar heads, seen from afar. */
  readonly far = new THREE.Group();
  /** What lives in the world's own frame: the builders and the swifts. */
  readonly live = new THREE.Group();
  readonly solids: Collider[] = [];
  readonly loaded: Promise<void>;
  readonly track = "GOBEKLI";
  /** Coming within this of the site's centre (on or over the hilltop) is coming into it. */
  readonly radius = 58;
  private uT = uniform(0);
  private keepers: Keeper[] = [];
  private swifts: (Animal & { r: number; y: number; ph: number; w: number })[] = [];
  private told = false;

  constructor(phone: boolean) {
    const R = rng(5150);
    this.group.position.set(G.x, 0, G.z);
    this.group.rotation.y = G.face;
    const ground = (lx: number, lz: number) => heightAt(...gobekliAt(lx, lz));
    const toW = (lx: number, lz: number) => gobekliAt(lx, lz);
    const m = new Merge<"lime" | "wall" | "stones" | "wood" | "rope">();
    // the enclosures
    for (const e of P.enclosures) {
      const gapped = e.id === "D" || e.id === "C";
      const gapHalf = gapped ? 0.13 : 0;
      const wallH = P.depth + 0.15;
      // the wall: its inner face and its top, round all but the gap (a lathe, outer foot first)
      const prof = [new THREE.Vector2(e.r + 0.85, wallH), new THREE.Vector2(e.r, wallH), new THREE.Vector2(e.r, -0.3)];
      const phi0 = e.gap + gapHalf;
      const wall = new THREE.LatheGeometry(prof, 72, phi0, Math.PI * 2 - gapHalf * 2);
      m.add("wall", wall, place(e.x, FLOOR, e.z));
      // its face: irregular stones laid in rough courses, packed with earth (the core behind is
      // the dark earth they are set in)
      for (let y = 0.02; y < wallH - 0.05; ) {
        const ch = 0.16 + R() * 0.16;
        let a = phi0 + R() * 0.05;
        const end = phi0 + Math.PI * 2 - gapHalf * 2;
        while (a < end - 0.02) {
          const len = 0.3 + R() * 0.55, da = len / e.r;
          if (a + da > end) break;
          const mid = a + da / 2, inset = (R() - 0.3) * 0.05;
          const st = new THREE.BoxGeometry(len - 0.04 - R() * 0.06, ch - 0.03 - R() * 0.04, 0.3);
          m.add("stones", st, place(e.x + Math.sin(mid) * (e.r + 0.12 - inset), FLOOR + y + ch / 2, e.z + Math.cos(mid) * (e.r + 0.12 - inset), mid, 1, 1, 1, (R() - 0.5) * 0.08, (R() - 0.5) * 0.1));
          a += da;
        }
        y += ch;
      }
      // the wall's ends at the gap, and rough stones lying along its top
      if (gapped)
        for (const s of [-1, 1]) {
          const a = e.gap + s * gapHalf;
          m.add("wall", roughBlock(0.9, wallH + 0.3, 0.9, R, 0.1), place(e.x + Math.sin(a) * (e.r + 0.42), FLOOR + wallH / 2 - 0.15, e.z + Math.cos(a) * (e.r + 0.42), a));
        }
      for (let i = 0; i < 26; i++) {
        const a = e.gap + gapHalf + 0.1 + R() * (Math.PI * 2 - gapHalf * 2 - 0.2);
        m.add("wall", roughBlock(0.4 + R() * 0.4, 0.22 + R() * 0.2, 0.35 + R() * 0.3, R, 0.12), place(e.x + Math.sin(a) * (e.r + 0.4 + (R() - 0.5) * 0.3), FLOOR + wallH + 0.06, e.z + Math.cos(a) * (e.r + 0.4), a + R(), 1, 1, 1, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3));
      }
      // held out by the wall all round (but the gap): turned boxes along it
      const segs = Math.round((Math.PI * 2 * (e.r + 0.42)) / 1.5);
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        let da = Math.abs(((a - e.gap + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (gapped && da < gapHalf + 0.04) continue;
        const [wx, wz] = toW(e.x + Math.sin(a) * (e.r + 0.42), e.z + Math.cos(a) * (e.r + 0.42));
        solidBox(wx, wz, 0.8, 0.45, a + G.face, FLOOR + wallH, this.solids);
        void da;
      }
      // the ring of pillars, set into the wall, facing in
      const count = Math.round((Math.PI * 2 * e.r) / 4.6);
      for (let i = 0; i < count; i++) {
        const a = e.gap + Math.PI / count + (i / count) * Math.PI * 2;
        let da = Math.abs(((a - e.gap + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (gapped && da < 0.35) continue;
        const b = 1.15 + R() * 0.2, h = 2.7 + R() * 0.5;
        const rad = e.r - b / 2 + 0.4;
        const kinds: Relief[] = ["fox", "boar", "snake", "lion", "scorpion", "bird"];
        const rel = R() < 0.55 ? [{ side: (R() < 0.5 ? 1 : -1) as 1 | -1, kind: kinds[Math.floor(R() * kinds.length)], at: h * 0.66, size: 0.85 + R() * 0.25 }] : [];
        const g = tPillar(h, 0.75 + R() * 0.15, 0.4, b, R, rel);
        const x = e.x + Math.sin(a) * rad, z = e.z + Math.cos(a) * rad;
        m.add("lime", g, place(x, FLOOR, z, a + Math.PI));
        const [wx, wz] = toW(x, z);
        solidBox(wx, wz, 0.24, b / 2 + 0.05, a + Math.PI + G.face, FLOOR + h + 0.8, this.solids);
        void da;
      }
      // the two at the centre, taller, standing side by side, facing the gap
      for (const s of [-1, 1]) {
        const off = 1.35 * s;
        const x = e.x + Math.cos(e.gap) * off, z = e.z - Math.sin(e.gap) * off;
        const big = e.id === "D" ? 1.18 : 1;
        const rel: { side: 1 | -1; kind: Relief; at: number; size: number }[] = e.id === "D" && s > 0 ? [{ side: 1, kind: "fox", at: 3.0, size: 1.15 }] : e.id === "C" ? [{ side: s as 1 | -1, kind: s > 0 ? "boar" : "lion", at: 2.8, size: 1.1 }] : [];
        const g = tPillar(4.3 * big, 1.05 * big, 0.55, 1.7, R, rel, 0.7);
        m.add("lime", g, place(x, FLOOR, z, e.gap));
        const [wx, wz] = toW(x, z);
        solidBox(wx, wz, 0.32, 0.95, e.gap + G.face, FLOOR + 5.5, this.solids);
      }
    }
    // the vulture stone: in D's ring, just inside the gap on the left, its carved side to the ramp
    {
      const e = P.enclosures[0];
      const a = e.gap + 0.62, b = 1.35, h = 3.0;
      const rad = e.r - b / 2 + 0.4;
      const x = e.x + Math.sin(a) * rad, z = e.z + Math.cos(a) * rad;
      const g = tPillar(h, 0.95, 0.46, b, R, [{ side: 1, kind: "vulture", at: h * 0.6, size: 0.98 }]);
      m.add("lime", g, place(x, FLOOR, z, a + Math.PI));
      const [wx, wz] = toW(x, z);
      solidBox(wx, wz, 0.26, b / 2 + 0.05, a + Math.PI + G.face, FLOOR + h + 0.9, this.solids);
    }
    // the tells: pillar heads breaking the turf, a little askew
    for (const mo of P.mounds)
      for (let i = 0; i < mo.tops; i++) {
        const a = R() * Math.PI * 2, r = mo.r * (0.15 + R() * 0.3);
        const x = mo.x + Math.sin(a) * r, z = mo.z + Math.cos(a) * r;
        const g = tPillar(0.6, 0.8, 0.42, 1.2, R, [], 0.9);
        m.add("lime", g, place(x, ground(x, z) - 0.7 - R() * 0.25, z, R() * Math.PI, 1, 1, 1, (R() - 0.5) * 0.18, (R() - 0.5) * 0.18));
      }
    // the quarry: a shelf of bedrock, a trench round a pillar still joined to the rock at its foot
    {
      const q = P.quarry, gy = ground(q.x, q.z);
      const at = (u: number, v: number): [number, number] => [q.x + Math.cos(q.face) * u + Math.sin(q.face) * v, q.z - Math.sin(q.face) * u + Math.cos(q.face) * v];
      for (const [u, v, w, d, h] of [[0, 0, 15, 8, 1.4], [-6.5, -3.5, 6, 5, 1.9], [6, 2.8, 5, 5, 1.1]] as const) {
        const [x, z] = at(u, v);
        m.add("lime", roughBlock(w, h + 1.2, d, R, 0.4), place(x, gy + h / 2 - 0.6, z, q.face));
      }
      // the half-cut pillar lying in its trench, its foot still part of the rock
      const [px, pz] = at(-0.5, -0.6);
      const g = tPillar(4.2, 0.9, 0.46, 1.25, R, [], 0.05);
      m.add("lime", g, place(px, gy + 0.62, pz, q.face, 1, 1, 1, 0, Math.PI / 2));
      for (const [x, z, r] of [[q.x, q.z, 7.5]]) {
        const [wx, wz] = toW(x, z);
        solidRound(wx, wz, r, gy + 0.9, this.solids);
      }
      // the rock steps you up onto it
      standHooks.push((wx, wz) => {
        const lx0 = wx - G.x, lz0 = wz - G.z, c = Math.cos(G.face), s = Math.sin(G.face);
        const lx = lx0 * c - lz0 * s, lz = lx0 * s + lz0 * c;
        return Math.hypot(lx - q.x, lz - q.z) < 7.4 ? gy + 0.8 : -Infinity;
      });
    }
    // limestone breaking the turf here and there
    for (let i = 0; i < 18; i++) {
      const a = R() * Math.PI * 2, r = 30 + R() * 50;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (P.enclosures.some((e) => Math.hypot(x - e.x, z - e.z) < e.r + 4) || Math.abs(x) < 3) continue;
      m.add("lime", roughBlock(1 + R() * 2.4, 0.5 + R() * 0.5, 0.8 + R() * 1.8, R, 0.3), place(x, ground(x, z) - 0.15, z, R() * 3, 1, 1, 1, (R() - 0.5) * 0.2, (R() - 0.5) * 0.2));
    }
    // the boardwalks
    const list = runs();
    boardwalk(list, m, ground);
    standHooks.push((wx, wz) => {
      const lx0 = wx - G.x, lz0 = wz - G.z;
      if (lx0 * lx0 + lz0 * lz0 > 70 * 70) return -Infinity;
      const c = Math.cos(G.face), s = Math.sin(G.face);
      return deckAt(list, lx0 * c - lz0 * s, lx0 * s + lz0 * c);
    });
    const mats = { lime: limestone(), wall: rubble(), stones: faceStone(), wood: woodMaterial(), rope: new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.32, 0.25, 0.17), roughness: 1 }) };
    const built = m.build(mats);
    built.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    this.group.add(built);
    // the grass, kept off the enclosures' floors, the decks and the rock
    const keep = (lx: number, lz: number) =>
      !P.enclosures.some((e) => Math.hypot(lx - e.x, lz - e.z) < e.r + 1.8) && deckAt(list, lx, lz) === -Infinity && Math.hypot(lx - P.quarry.x, lz - P.quarry.z) > 9.5 && Math.abs(lx) > 1.2;
    this.group.add(dryGrass(phone ? 9000 : 16000, keep, this.uT));
    this.group.add(this.dust(phone));
    // the sister hills: a pillar head on each crown, seen from far
    for (const s of GOBEKLI_SISTERS) {
      const g = tPillar(0.8, 0.85, 0.45, 1.3, R, [], 0.9);
      const mesh = new THREE.Mesh(g, mats.lime);
      mesh.position.set(s.x, heightAt(s.x, s.z) - 0.5, s.z);
      mesh.rotation.set((R() - 0.5) * 0.2, R() * 3, (R() - 0.5) * 0.2);
      mesh.castShadow = true;
      this.far.add(mesh);
    }
    // the builders: undyed wool and ochre, hands rather than priests
    const D = P.enclosures[0], C = P.enclosures[1];
    const wool: [number, number, number] = [1.05, 0.92, 0.72];
    const atW = (lx: number, lz: number) => toW(lx, lz);
    {
      const [x, z] = atW(D.x, D.z);
      this.keepers.push(new Keeper({ recipe: "GOBEKLI_BUILDER", tint: wool, x, z, y: FLOOR, face: -(D.gap + G.face) + Math.PI, pose: "stand" }));
    }
    {
      const rr = C.r + 2.4, path: { x: number; z: number; look?: [number, number] }[] = [];
      const n = Math.round((Math.PI * 2 * C.r) / 4.6);
      for (let i = 0; i < n; i += 2) {
        const a = C.gap + Math.PI / n + (i / n) * Math.PI * 2;
        const [x, z] = atW(C.x + Math.sin(a) * rr, C.z + Math.cos(a) * rr);
        const [lx, lz] = atW(C.x + Math.sin(a) * (C.r - 0.5), C.z + Math.cos(a) * (C.r - 0.5));
        path.push({ x, z, look: [lx, lz] });
      }
      const [x0, z0] = [path[0].x, path[0].z];
      this.keepers.push(new Keeper({ recipe: "GOBEKLI_BUILDER", tint: [0.98, 0.84, 0.62], x: x0, z: z0, face: 0, pose: "walk", path, pause: 9, ground: (x, z) => Math.max(heightAt(x, z), DECK + 0.02) }));
    }
    for (const k of this.keepers) this.live.add(k.root);
    // swifts, high over the hill, circling (the game's small bird, dark against the sky)
    const swifts = herdOf("models/animals/parrot.glb", phone ? 6 : 9, 0.36, [new THREE.Color(0.32, 0.28, 0.26)], 1, { inner: 0.05, edge: 0.25, body: 0.1 }).then((bs) => {
      bs.forEach((a, i) => {
        a.action.timeScale = 1.6;
        this.swifts.push({ ...a, r: 26 + R() * 30, y: TOP + 26 + R() * 22, ph: R() * 6.28, w: (0.24 + R() * 0.12) * (i % 3 ? 1 : -1) });
        a.obj.visible = false;
        this.live.add(a.obj);
      });
    });
    this.loaded = Promise.all([...this.keepers.map((k) => k.loaded), swifts]).then(() => undefined);
  }

  /** Dust turning in the low light over the enclosures, and seed heads blown along the ground. */
  private dust(phone: boolean): THREE.Sprite {
    const n = phone ? 420 : 700;
    const mat = softPoints();
    const c = spriteCloud(n, { aK: 4 }, mat);
    const a = c.attrs.aK.array as Float32Array;
    const R = rng(77);
    for (let i = 0; i < n; i++) a.set([R(), R(), R(), R()], i * 4);
    const K = c.nodes.aK, uT = this.uT;
    // most hang in the air over the four rings, drifting; one in five is a seed blown low across
    const seed = K.w.lessThan(0.2);
    const e = K.x.mul(4).floor();
    const ex2 = e.equal(0).select(float(P.enclosures[0].x), e.equal(1).select(float(P.enclosures[1].x), e.equal(2).select(float(P.enclosures[2].x), float(P.enclosures[3].x))));
    const ez = e.equal(0).select(float(P.enclosures[0].z), e.equal(1).select(float(P.enclosures[1].z), e.equal(2).select(float(P.enclosures[2].z), float(P.enclosures[3].z))));
    const ang = K.y.mul(6.283).add(uT.mul(0.02).mul(K.z.sub(0.5)));
    const rr = K.z.sqrt().mul(9);
    const hang = vec3(ex2.add(sin(ang).mul(rr)), float(FLOOR + 0.6).add(fract(K.w.mul(7.3).add(uT.mul(0.012))).mul(4.5)), ez.add(cos(ang).mul(rr)));
    const life = fract(uT.mul(0.045).add(K.y));
    const blow = vec3(K.x.sub(0.5).mul(120).add(WIND.x * 1).add(life.mul(60).sub(30).mul(WIND.x)), float(TOP + 0.25).add(sin(life.mul(18).add(K.z.mul(9))).abs().mul(0.5)), K.z.sub(0.5).mul(120).add(life.mul(60).sub(30).mul(WIND.y)));
    const p = seed.select(blow, hang.add(vec3(sin(uT.mul(0.3).add(K.x.mul(40))).mul(0.3), 0, 0)));
    mat.positionNode = p;
    const wp = T.modelWorldMatrix.mul(vec4(p, 1)).xyz;
    mat.sizeNode = clamp(gpuUniforms.px.mul(seed.select(float(0.03), float(0.018))).div(max(viewDepth(wp), 0.4)), float(1).div(gpuUniforms.dpr), 5);
    const soft = smoothstep(0.5, 0.1, length(T.pointUV.sub(0.5)));
    const tw = sin(uT.mul(1.3).add(K.x.mul(60))).mul(0.5).add(0.5);
    const k = seed.select(smoothstep(0, 0.1, life).mul(smoothstep(1, 0.8, life)).mul(0.35), tw.mul(0.3).add(0.15));
    mat.colorNode = vec4(vec3(1.0, 0.82, 0.55).mul(soft).mul(k).mul(outOfTheWay(wp)), 1);
    return c.sprite;
  }

  /** Each frame while the site is near. `speak` begins the telling and says whether it could. */
  update(dt: number, t: number, visitor: THREE.Vector3, reduced: boolean, speak: (track: string) => boolean): void {
    const d = Math.hypot(visitor.x - G.x, visitor.z - G.z);
    this.group.visible = d < 420;
    this.far.visible = d < 2600;
    this.live.visible = this.group.visible;
    if (!this.group.visible) return;
    this.uT.value = reduced ? t * 0.5 : t;
    for (const k of this.keepers) k.update(dt, t, visitor, reduced);
    for (const s of this.swifts) {
      const a = s.ph + t * s.w;
      const [x, z] = gobekliAt(Math.sin(a) * s.r, Math.cos(a) * s.r);
      const y = s.y + Math.sin(t * 0.4 + s.ph) * 3;
      s.obj.position.set(x, y, z);
      s.obj.rotation.set(0, Math.atan2(Math.cos(a) * Math.sign(s.w), -Math.sin(a) * Math.sign(s.w)) + G.face + Math.PI, Math.sign(s.w) * 0.35);
      s.obj.visible = d < 300;
      s.mixer.update(dt);
    }
    if (!this.told && d < this.radius && visitor.y < TOP + 25 && speak(this.track)) this.told = true;
  }
}
