/* Göbekli Tepe (the owner's brief; the telling `GOBEKLI`, Aria, 331.44 s): a hilltop of great
   stone enclosures above a plain, at the golden hour, as it stood when it was built (c. 9500 BCE;
   the owner: "like it was when it was built, not a museum"): no boardwalks, no buried tells, the
   pillars freshly cut. It stands on the world's own highest dry hill toward the low sun
   (terrain.ts `GOBEKLI`).
   - Four enclosures sunk into the hill (D, C, B, A), each a ring of dry-stone wall with
     T-pillars set into it facing in, two taller pillars at its centre. The pillars are figures:
     the T's crossbar the shoulders, arms carved down the sides to hands folded over the belly, a
     belt, a fox pelt hung from it. Some carry animals in low relief (fox, boar, lion, snake,
     scorpion, birds). In D, the vulture stone: the great bird with its wing out, the disc over
     it, the scorpion below, the headless man, three "handbags" along its head.
     A stone bench runs round the inside of each wall between the pillars; a stair of stone slabs
     leads down through the gaps of D and C.
   - The builders' houses on the open hilltop between the rings: rectangular, dry-stone walls
     plastered inside, a flat roof of timber beams under packed earth, a door with a lintel; before
     them hearths of ringed stones with embers, grinding slabs with their handstones, stone bowls.
     A cistern cut into the bedrock, holding rain.
   - The quarry at the hill's edge: a shelf of bedrock with a pillar half cut from it, the trench
     round it, the work stopped mid-stroke.
   - Dry grass in waves of wind, a few wild flowers, dust turning in the low light, seed heads
     blown along the ground; swifts circling high (the game's small bird model, dark); the three
     sister hills out on the plain, each with a pillar head on its crown.
   - Three builders (the temple figures' idiom, undyed wool and ochre): one standing still between
     D's central pillars, facing in with the stones; one walking C's rim, pausing at each pillar;
     one kneeling at a grinding slab before a house. None at the quarry.
   - Its telling begins once, the first time you come onto the hilltop, and plays on wherever you
     go (the owner's rule for these areas). */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T, gpuUniforms, outOfTheWay, softPoints, spriteCloud, viewDepth, withFog, type N, softDot, pointR } from "../../gpu/tsl";
import { GOBEKLI, GOBEKLI_PLAN, GOBEKLI_SISTERS, gobekliAt, heightAt, standHooks, type Collider } from "../terrain";
import { landStone } from "../stoneworks";
import { herdOf, type Animal } from "../creatures";
import { Keeper, Merge, place, rng, roughBlock, solidBox, solidRound } from "./kit";

const { attribute, clamp, cos, dot, float, fract, length, max, mix, positionGeometry, pow, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;
const G = GOBEKLI, P = GOBEKLI_PLAN;
const TOP = G.y, FLOOR = G.y - P.depth;
/** The stairs down into D and C: from this far out from the wall's inner face, on the hilltop,
    to this far in, on the floor, in steps of `RISE`. */
const { out: STAIR_OUT, in: STAIR_IN, rise: RISE, w: STAIR_W } = P.stair;
/** The bench round the inside of each enclosure's wall: its depth and its height. */
const BENCH_D = 0.5, BENCH_H = 0.46;
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

/** A field stone for the walls: a box whose corners are pulled in unevenly and whose faces bulge,
    so no two read alike and none reads as a brick (shared corners move together: no cracks). */
function lumpyStone(w: number, h: number, d: number, R: () => number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const k = [R(), R(), R(), R(), R(), R()].map((v) => v * 0.28 + 0.06);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2), z = p.getZ(i) / (d / 2);
    const corner = Math.abs(x) > 0.99 && Math.abs(y) > 0.99;
    const pull = corner ? k[(x > 0 ? 1 : 0) + (y > 0 ? 2 : 0)] : 0;
    const bulge = Math.abs(x) < 0.01 && Math.abs(y) < 0.01 ? k[4] * 0.12 : Math.abs(x) < 0.01 || Math.abs(y) < 0.01 ? k[5] * 0.05 : 0;
    p.setXYZ(i, p.getX(i) * (1 - pull * 0.6), p.getY(i) * (1 - pull * 0.5), p.getZ(i) + Math.sign(z) * bulge * d);
  }
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------- materials */
/** The pillars and the bedrock: one pale limestone, cut whole (no courses), freshly worked. */
const limestone = () => landStone("sandstone_cracks", FLOOR, 1.7, [1.5, 1.4, 1.17], undefined, "fresh");
/** The enclosure walls: dry stone, small stones laid in rough courses. */
const rubble = () => landStone("sandstone_cracks", FLOOR, 2.2, [0.52, 0.44, 0.34]);
/** The walls' face stones: the same pale limestone, a shade warmer and rougher. */
const faceStone = () => landStone("sandstone_cracks", FLOOR, 1.3, [1.18, 1.06, 0.86]);
/** The roof beams: rough timber, the bark mostly gone, darker toward the ends. */
function timberMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.95 });
  const p = positionGeometry;
  const grain = sin(p.y.mul(40).add(sin(p.x.mul(9)).mul(2))).mul(0.5).add(0.5);
  m.colorNode = vec4(vec3(0.34, 0.25, 0.16).mul(grain.mul(0.18).add(0.86)), 1);
  return m;
}
/** The houses' roofs: earth packed over reeds, dry and pale on top. */
const earth = () => landStone("sandstone_cracks", TOP, 2.4, [0.62, 0.5, 0.37]);
/** Lime plaster on the houses' inner walls, worn at the foot. */
const plaster = () => landStone("sandstone_cracks", TOP, 4, [1.35, 1.27, 1.1], undefined, "fresh");
/** Embers in a hearth: a slow breathing glow under grey ash (unlit: they are the light). */
function emberMaterial(uT: N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ fog: true });
  const q = uv().sub(0.5).mul(2); // the disc's own uv (kept through the merge)
  const n = sin(q.x.mul(9.7).add(uT.mul(1.7))).mul(sin(q.y.mul(8).sub(uT.mul(1.3)))).mul(0.5).add(0.5);
  const r = length(q);
  const hot = smoothstep(1, 0.2, r).mul(n.mul(0.7).add(0.3)).mul(sin(uT.mul(2.3)).mul(0.12).add(0.88));
  m.colorNode = vec4(mix(vec3(0.16, 0.15, 0.14), vec3(1.05, 0.3, 0.06), hot), 1);
  return m;
}
/** The cistern's water: still and dark, the sky's light on it only by its sheen. */
function waterMaterial(): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.035, 0.05, 0.05), metalness: 0, roughness: 0.12 });
}

/* ---------------------------------------------------------------- the lived-in hilltop */
type Parts = "lime" | "wall" | "stones" | "floor" | "timber" | "earth" | "plaster" | "ember" | "water";
/** A builder's house: dry-stone walls plastered inside, a door in the front (+v, the way it
    faces) under a lintel, a flat roof of beams under packed earth; a hearth, a grinding slab and
    a stone bowl before it. Its walls are solid. */
function house(h: (typeof P.houses)[number], m: Merge<Parts>, R: () => number, gy: number, solids: Collider[]): void {
  const at = (u: number, v: number): [number, number] => [h.x + Math.cos(h.face) * u + Math.sin(h.face) * v, h.z - Math.sin(h.face) * u + Math.cos(h.face) * v];
  const W = h.w, D = h.d, H = 1.75, TH = 0.55, DOOR = 0.95;
  // each wall as a run in the house's frame: (u0, v0) → (u1, v1), its outward normal (nu, nv)
  const walls: [number, number, number, number, number, number][] = [
    [-W / 2, -D / 2, W / 2, -D / 2, 0, -1],
    [-W / 2, -D / 2, -W / 2, D / 2, -1, 0],
    [W / 2, -D / 2, W / 2, D / 2, 1, 0],
    [-W / 2, D / 2, -DOOR / 2, D / 2, 0, 1],
    [DOOR / 2, D / 2, W / 2, D / 2, 0, 1],
  ];
  for (const [u0, v0, u1, v1, nu, nv] of walls) {
    const L = Math.hypot(u1 - u0, v1 - v0), du = (u1 - u0) / L, dv = (v1 - v0) / L;
    const ang = h.face + Math.atan2(-dv, du); // the run's direction as a heading about y
    // the core, plastered inside, and the face of field stones in rough courses outside
    const cu = (u0 + u1) / 2 - nu * 0.06, cv = (v0 + v1) / 2 - nv * 0.06;
    const [cx, cz] = at(cu, cv);
    m.add("plaster", new THREE.BoxGeometry(L + (nu ? 0 : TH * 0.9), H, TH - 0.12), place(cx, gy + H / 2, cz, ang));
    for (let y = 0.02; y < H - 0.06; ) {
      const ch = 0.17 + R() * 0.14;
      let a = -(TH / 2) * (nu ? 0 : 1) + R() * 0.12;
      while (a < L + (nu ? 0 : TH / 2) - 0.1) {
        const len = Math.min(0.3 + R() * 0.5, L + TH / 2 - a);
        const su = u0 + du * (a + len / 2) + nu * (TH / 2 - 0.13), sv = v0 + dv * (a + len / 2) + nv * (TH / 2 - 0.13);
        const [sx, sz] = at(su, sv);
        m.add("stones", lumpyStone(len - 0.05, ch - 0.04 - R() * 0.05, 0.3, R), place(sx, gy + y + ch / 2, sz, ang, 1, 1, 1, (R() - 0.5) * 0.08, (R() - 0.5) * 0.15));
        a += len;
      }
      y += ch;
    }
    const [wx, wz] = at((u0 + u1) / 2, (v0 + v1) / 2);
    solidBox(...gobekliAt(wx, wz), L / 2 + 0.1, TH / 2, ang + G.face, gy + H + 0.6, solids);
  }
  // the lintel over the door, and its threshold stone
  {
    const [x, z] = at(0, D / 2);
    m.add("lime", roughBlock(DOOR + 0.9, 0.32, TH + 0.08, R, 0.05), place(x, gy + H - 0.12, z, h.face));
    m.add("lime", roughBlock(DOOR + 0.1, 0.1, TH + 0.2, R, 0.04), place(x, gy + 0.02, z, h.face));
  }
  // the roof: beams across the short way, their ends standing out, under a slab of packed earth
  const nb = Math.round((W - 0.2) / 0.45);
  for (let i = 0; i <= nb; i++) {
    const u = -W / 2 + 0.1 + (i / nb) * (W - 0.2);
    const [x, z] = at(u + (R() - 0.5) * 0.06, 0);
    const g = new THREE.CylinderGeometry(0.075 + R() * 0.03, 0.09 + R() * 0.03, D + TH + 0.5 + R() * 0.3, 7);
    g.rotateX(Math.PI / 2);
    m.add("timber", g, place(x, gy + H + 0.08, z, h.face + (R() - 0.5) * 0.04));
  }
  {
    const [x, z] = at(0, 0);
    const g = new THREE.BoxGeometry(W + TH + 0.15, 0.3, D + TH + 0.15, 6, 1, 4);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) + (R() - 0.5) * 0.08 - (Math.abs(p.getX(i)) / W) * 0.12);
    g.computeVertexNormals();
    m.add("earth", g, place(x, gy + H + 0.3, z, h.face));
  }
  // before the door: a hearth of ringed stones round embers and ash, a grinding slab with its
  // handstone, a stone bowl
  {
    const [hx, hz] = at(-W * 0.22, D / 2 + 2.1);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + R() * 0.3;
      m.add("stones", lumpyStone(0.26 + R() * 0.1, 0.15 + R() * 0.06, 0.2, R), place(hx + Math.sin(a) * 0.52, gy + 0.06, hz + Math.cos(a) * 0.52, a));
    }
    const e = new THREE.CircleGeometry(0.42, 18);
    e.rotateX(-Math.PI / 2);
    m.add("ember", e, place(hx, gy + 0.05, hz), true);
    const [qx, qz] = at(W * 0.25, D / 2 + 1.5);
    m.add("lime", roughBlock(0.75, 0.2, 0.46, R, 0.05), place(qx, gy + 0.08, qz, h.face + 0.3, 1, 1, 1, 0.06));
    m.add("lime", roughBlock(0.26, 0.09, 0.15, R, 0.03), place(qx + 0.1, gy + 0.22, qz, h.face + 0.5));
    const [bx, bz] = at(W * 0.42, D / 2 + 0.8);
    const bowl = new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.17, 0.02), new THREE.Vector2(0.22, 0.14), new THREE.Vector2(0.19, 0.15), new THREE.Vector2(0.15, 0.05), new THREE.Vector2(0.001, 0.05)], 14);
    m.add("lime", bowl, place(bx, gy, bz));
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
    const m = new Merge<Parts>();
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
          const st = lumpyStone(len - 0.05 - R() * 0.1, ch - 0.04 - R() * 0.06, 0.3, R);
          m.add("stones", st, place(e.x + Math.sin(mid) * (e.r + 0.12 - inset), FLOOR + y + ch / 2 + (R() - 0.5) * 0.06, e.z + Math.cos(mid) * (e.r + 0.12 - inset), mid, 1, 1, 1, (R() - 0.5) * 0.1, (R() - 0.5) * 0.22));
          a += da;
        }
        y += ch;
      }
      // its floor: packed earth and the bedrock worn pale where it was cleared
      {
        const fl = new THREE.CircleGeometry(e.r + 0.05, 48);
        fl.rotateX(-Math.PI / 2);
        m.add("floor", fl, place(e.x, FLOOR + 0.03, e.z));
      }
      // the bench round the inside of the wall, between the pillars: dry stone under slabs
      {
        const nS = Math.round((Math.PI * 2 * (e.r - BENCH_D / 2)) / 0.72);
        for (let i = 0; i < nS; i++) {
          const a = phi0 + 0.12 + (i / nS) * (Math.PI * 2 - gapHalf * 2 - 0.24);
          if (!gapped && i === nS - 1) continue;
          const rr = e.r - BENCH_D / 2 + 0.03;
          m.add("wall", roughBlock(0.7, BENCH_H - 0.06, BENCH_D, R, 0.06), place(e.x + Math.sin(a) * rr, FLOOR + (BENCH_H - 0.06) / 2 - 0.03, e.z + Math.cos(a) * rr, a + Math.PI / 2));
          m.add("lime", roughBlock(0.66, 0.1, BENCH_D + 0.06, R, 0.03), place(e.x + Math.sin(a) * rr, FLOOR + BENCH_H - 0.04, e.z + Math.cos(a) * rr, a + Math.PI / 2, 1, 1, 1, (R() - 0.5) * 0.04, (R() - 0.5) * 0.04));
        }
      }
      // the stair down through the gap: slabs of limestone on dry-stone fill, from the hilltop
      // to the floor
      if (gapped) {
        const n = Math.round((TOP - FLOOR) / RISE), tread = (STAIR_OUT + STAIR_IN) / n;
        const sx = Math.sin(e.gap), sz = Math.cos(e.gap);
        for (let i = 0; i < n; i++) {
          const top = TOP - (i + 1) * RISE, mid = e.r + STAIR_OUT - (i + 0.5) * tread;
          const hgt = top - FLOOR + 0.25;
          m.add("stones", roughBlock(STAIR_W, hgt, tread + 0.06, R, 0.05), place(e.x + sx * mid, FLOOR - 0.25 + hgt / 2, e.z + sz * mid, e.gap, 1, 1, 1, (R() - 0.5) * 0.015, (R() - 0.5) * 0.02));
        }
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
    // the builders' houses round the rings, and the cistern cut into the bedrock
    for (const h of P.houses) house(h, m, R, ground(h.x, h.z), this.solids);
    {
      const c = P.cistern, gy = ground(c.x + c.r + 1.5, c.z);
      const rim = [new THREE.Vector2(c.r + 0.55, gy + 0.04), new THREE.Vector2(c.r + 0.2, gy + 0.12), new THREE.Vector2(c.r, gy + 0.04), new THREE.Vector2(c.r - 0.04, gy - 1.3)];
      m.add("lime", new THREE.LatheGeometry(rim, 40), place(c.x, 0, c.z));
      const wd = new THREE.CircleGeometry(c.r, 32);
      wd.rotateX(-Math.PI / 2);
      m.add("water", wd, place(c.x, gy - 0.55, c.z));
      solidRound(...gobekliAt(c.x, c.z), c.r + 0.2, gy + 0.5, this.solids);
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
    // you walk down the stairs and may sit on the benches: their heights, in the site's frame
    standHooks.push((wx, wz) => {
      const lx0 = wx - G.x, lz0 = wz - G.z;
      if (lx0 * lx0 + lz0 * lz0 > 60 * 60) return -Infinity;
      const c = Math.cos(G.face), s = Math.sin(G.face);
      const lx = lx0 * c - lz0 * s, lz = lx0 * s + lz0 * c;
      for (const e of P.enclosures) {
        const dx = lx - e.x, dz = lz - e.z, d = Math.hypot(dx, dz);
        if (d > e.r + STAIR_OUT + 0.2) continue;
        if (e.id === "D" || e.id === "C") {
          const along = dx * Math.sin(e.gap) + dz * Math.cos(e.gap), across = Math.abs(dx * Math.cos(e.gap) - dz * Math.sin(e.gap));
          if (across < STAIR_W / 2 && along > e.r - STAIR_IN && along < e.r + STAIR_OUT) {
            const n = Math.round((TOP - FLOOR) / RISE), tread = (STAIR_OUT + STAIR_IN) / n;
            return Math.max(FLOOR, TOP - Math.ceil((e.r + STAIR_OUT - along) / tread) * RISE);
          }
        }
        if (d > e.r - BENCH_D && d < e.r) return FLOOR + BENCH_H;
      }
      return -Infinity;
    });
    const mats: Record<Parts, THREE.Material> = { lime: limestone(), wall: rubble(), stones: faceStone(), floor: landStone("sandstone_cracks", FLOOR - 3, 3.2, [1.0, 0.9, 0.74]), timber: timberMaterial(), earth: earth(), plaster: plaster(), ember: emberMaterial(this.uT), water: waterMaterial() };
    const built = m.build(mats);
    built.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    this.group.add(built);
    // the grass, kept off the enclosures, the stairs' heads, the houses and their yards, the
    // cistern, the rock and the trodden way across the top
    const inHouse = (lx: number, lz: number) =>
      P.houses.some((h) => {
        const dx = lx - h.x, dz = lz - h.z;
        const u = dx * Math.cos(h.face) - dz * Math.sin(h.face), v = dx * Math.sin(h.face) + dz * Math.cos(h.face);
        return Math.abs(u) < h.w / 2 + 1.2 && v > -h.d / 2 - 1.2 && v < h.d / 2 + 3.4;
      });
    const keep = (lx: number, lz: number) =>
      !P.enclosures.some((e) => Math.hypot(lx - e.x, lz - e.z) < e.r + (e.id === "D" || e.id === "C" ? STAIR_OUT + 0.8 : 1.8)) &&
      !inHouse(lx, lz) && Math.hypot(lx - P.cistern.x, lz - P.cistern.z) > P.cistern.r + 1.6 && Math.hypot(lx - P.quarry.x, lz - P.quarry.z) > 9.5 && Math.abs(lx) > 1.6;
    this.group.add(dryGrass(phone ? 9000 : 16000, keep, this.uT));
    this.group.add(this.dust(phone));
    // the sister hills: each has its own pair of pillars standing on its crown, seen from far
    for (const s of GOBEKLI_SISTERS) {
      const turn = R() * 3;
      for (const k of [-1, 1]) {
        const g = tPillar(3.6, 0.95, 0.46, 1.4, R, [], 0.5);
        const mesh = new THREE.Mesh(g, mats.lime);
        mesh.position.set(s.x + Math.cos(turn) * k * 1.2, heightAt(s.x, s.z), s.z - Math.sin(turn) * k * 1.2);
        mesh.rotation.y = turn;
        mesh.castShadow = true;
        this.far.add(mesh);
      }
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
      this.keepers.push(new Keeper({ recipe: "GOBEKLI_BUILDER", tint: [0.98, 0.84, 0.62], x: x0, z: z0, face: 0, pose: "walk", path, pause: 9 }));
    }
    {
      // kneeling at the grinding slab before the first house
      const h = P.houses[0];
      const u = h.w * 0.25, v = h.d / 2 + 2.2;
      const [x, z] = atW(h.x + Math.cos(h.face) * u + Math.sin(h.face) * v, h.z - Math.sin(h.face) * u + Math.cos(h.face) * v);
      this.keepers.push(new Keeper({ recipe: "GOBEKLI_BUILDER", tint: [0.86, 0.62, 0.42], x, z, face: -(h.face + G.face), pose: "kneel" }));
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
    const soft = softDot(pointR()).mul(1.59);
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
