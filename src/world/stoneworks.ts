/* Stonework for the open world's built places: real structures of cut and standing stone, in the
   temple's photo-scanned sandstone (Poly Haven, CC0), weathered by the open air (lichen on the
   tops, soil and damp at the foot, streaks down the faces). Samuel: "all the other buildings should
   be legit structures made of rocks and realistic".

   `landStone()` lays a scan triplanar in the world, so any shape takes it without stretching;
   `homePlatform()` builds the ground of an archetype's home: a round platform of fitted blocks in
   two courses with a worn step, and a ring of rough standing stones about it, one fallen. */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { T, type N } from "../gpu/tsl";
import { scan, type ScanName } from "./temple";

const { abs, float, mix, smoothstep, vec3 } = T;

/** The scan laid in the world from all three sides, with its occlusion, relief and roughness, and
    the weather of the open air. `base`: the world height of the ground it stands on (the foot
    darkens with soil and damp above it). */
/** Cut masonry laid over the scan (for built walls and floors, not boulders or standing stones):
    `course` is a wall course's height and `block` a block's length, in metres; floors are laid
    as flagstones `flag` metres across. Each block has its own tone and roughness, its arrises a
    little worn, the mortar recessed; each flagstone lies at its own very slight tilt, so a
    flat floor catches the light stone by stone. */
export interface Masonry {
  course?: number;
  block?: number;
  flag?: number;
}
export function landStone(set: ScanName, base: number, tile = 2.4, tint: [number, number, number] = [1, 1, 1], masonry?: Masonry, finish?: "marble"): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.9 });
  const S = scan(set);
  const pw = T.positionWorld, n = T.normalWorldGeometry;
  const wp = T.pow(abs(n), vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tri = (t: THREE.Texture) =>
    T.texture(t, pw.zy.div(tile)).mul(w.x).add(T.texture(t, pw.xz.div(tile)).mul(w.y)).add(T.texture(t, pw.xy.div(tile)).mul(w.z));
  const arm = tri(S.arm);
  let c: N = tri(S.diff).rgb.mul(mix(float(0.35), float(1), arm.r)).mul(vec3(...tint));
  const nz = (p: N) => T.mx_noise_float(p).mul(0.5).add(0.5);
  const marble = finish === "marble";
  if (marble) {
    // pale marble: the scan's grain kept as a quiet variation in a white stone, grey-blue veins
    // wandering through it (warped noise), a warmth where it is thickest
    const lum = T.dot(c, vec3(0.3, 0.5, 0.2)).div(tint[1]);
    const q = pw.mul(0.22);
    const warp = vec3(nz(q.add(1.7)), nz(q.add(8.3)), nz(q.add(4.1))).mul(2.2);
    const v = abs(nz(q.mul(1.4).add(warp)).sub(0.5));
    const vein = smoothstep(0.035, 0.0, v).mul(0.55).add(smoothstep(0.09, 0.0, v).mul(0.2));
    c = mix(vec3(0.86, 0.84, 0.8), vec3(0.97, 0.94, 0.88), smoothstep(0.2, 0.6, lum)).mul(vec3(...tint));
    c = mix(c, vec3(0.5, 0.54, 0.6).mul(tint[1]), vein).mul(mix(float(0.78), float(1), arm.r));
  }
  // lichen and moss on what faces the sky, in patches
  const up = smoothstep(0.45, 0.9, n.y);
  const lichen = up.mul(smoothstep(0.55, 0.78, nz(pw.mul(1.3).add(3.1)))).mul(marble ? 0.12 : 0.7);
  c = mix(c, vec3(0.34, 0.38, 0.24).mul(nz(pw.mul(7)).mul(0.5).add(0.7)), lichen);
  // soil and damp at the foot, streaks where rain runs down the faces
  const foot = smoothstep(0.9, 0.0, pw.y.sub(base)).mul(0.55);
  const streak = smoothstep(0.6, 0.85, nz(vec3(pw.x.mul(3.1), pw.y.mul(0.2), pw.z.mul(3.1)))).mul(float(1).sub(up)).mul(0.3);
  c = c.mul(float(1).sub(foot)).mul(float(1).sub(streak));
  let rough: N = marble ? T.clamp(arm.g.mul(0.5).add(0.12), 0.32, 0.62) : T.clamp(arm.g.add(lichen.mul(0.2)), 0.6, 1);
  // relief from the scan's normal map, turned to each side
  const nm = (t: THREE.Texture) => [T.texture(t, pw.zy.div(tile)), T.texture(t, pw.xz.div(tile)), T.texture(t, pw.xy.div(tile))].map((x: N) => x.xy.mul(2).sub(1));
  const [nx, ny, nzz] = nm(S.nor);
  let dn: N = vec3(0, nx.y, nx.x).mul(w.x).add(vec3(ny.x, 0, ny.y).mul(w.y)).add(vec3(nzz.x, nzz.y, 0).mul(w.z)).mul(0.9);
  if (masonry) {
    const course = masonry.course ?? 0.85, block = masonry.block ?? 1.5, flag = masonry.flag ?? 1.1;
    const h = (v: N) => T.fract(T.sin(T.dot(v, T.vec2(12.9898, 78.233))).mul(43758.5453));
    const mortar = 0.035;
    const wall = float(1).sub(smoothstep(0.55, 0.8, abs(n.y)));
    // walls: courses along the face's own horizontal, each course staggered
    const xFace = w.x.greaterThan(w.z);
    const along = T.select(xFace, pw.z, pw.x);
    const row = T.floor(pw.y.div(course));
    const u = along.div(block).add(row.mul(0.5)).add(h(T.vec2(row, 3.7)).mul(0.35));
    const cellW = T.floor(u);
    const fu = T.fract(u), fv = T.fract(pw.y.div(course));
    const du = T.min(fu, float(1).sub(fu)).mul(block), dv = T.min(fv, float(1).sub(fv)).mul(course);
    // floors: flagstones in staggered rows, two widths
    const frow = T.floor(pw.z.div(flag));
    const fwid = mix(float(flag * 1.1), float(flag * 1.7), h(T.vec2(frow, 9.1)));
    const fu2 = pw.x.div(fwid).add(h(T.vec2(frow, 1.3)));
    const cellF = T.floor(fu2);
    const ffu = T.fract(fu2), ffv = T.fract(pw.z.div(flag));
    const du2 = T.min(ffu, float(1).sub(ffu)).mul(fwid), dv2 = T.min(ffv, float(1).sub(ffv)).mul(flag);
    const e = mix(T.min(du2, dv2), T.min(du, dv), wall);
    const id = mix(h(T.vec2(cellF, frow).add(17.3)), h(T.vec2(cellW, row)), wall);
    const joint = smoothstep(mortar, mortar * 0.35, e);
    const arris = smoothstep(0.1, mortar, e); // the worn edge of each stone
    const tone = mix(float(0.84), float(1.12), id);
    c = c.mul(tone).mul(mix(float(1), float(0.42), joint)).mul(float(1).sub(arris.mul(0.12)));
    rough = T.clamp(rough.add(id.sub(0.5).mul(0.12)).add(joint.mul(0.1)), marble ? 0.3 : 0.55, 1);
    // the mortar lies deeper: the stone's face turns away from it toward each joint
    const sU = T.sign(T.select(wall.greaterThan(0.5), fu, ffu).sub(0.5)), sV = T.sign(T.select(wall.greaterThan(0.5), fv, ffv).sub(0.5));
    const kU = smoothstep(0.08, 0.0, T.select(wall.greaterThan(0.5), du, du2)).mul(0.5), kV = smoothstep(0.08, 0.0, T.select(wall.greaterThan(0.5), dv, dv2)).mul(0.5);
    const hAxis = T.select(xFace, vec3(0, 0, 1), vec3(1, 0, 0));
    const wallBend = hAxis.mul(sU.mul(kU)).add(vec3(0, 1, 0).mul(sV.mul(kV)));
    // each flagstone at its own slight tilt, so the floor never reads as one flat sheet
    const tilt = vec3(h(T.vec2(cellF, frow)).sub(0.5), 0, h(T.vec2(frow, cellF).add(4.2)).sub(0.5)).mul(0.12);
    const floorBend = vec3(sU.mul(kU), 0, sV.mul(kV)).add(tilt);
    dn = dn.add(mix(floorBend, wallBend, wall));
  }
  m.colorNode = T.vec4(c, 1);
  m.roughnessNode = rough;
  m.normalNode = T.normalize(T.normalView.add(T.cameraViewMatrix.mul(T.vec4(dn, 0)).xyz));
  return m;
}

/** A cut stone block: a box with its edges rounded and its faces a little chipped and uneven, so
    no building reads as a stack of perfect boxes. */
export function stoneBlock(w: number, h: number, d: number, seed = 1): THREE.BufferGeometry {
  const r = Math.min(0.12, Math.min(w, h, d) * 0.08);
  const g = new RoundedBoxGeometry(w, h, d, 2, r);
  const p = g.attributes.position as THREE.BufferAttribute;
  const hash = (x: number, y: number, z: number) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // chips near the corners, a slow unevenness over the faces
    const corner = Math.min(1, (Math.abs(x) / (w / 2)) * (Math.abs(y) / (h / 2)) + (Math.abs(y) / (h / 2)) * (Math.abs(z) / (d / 2)) + (Math.abs(x) / (w / 2)) * (Math.abs(z) / (d / 2)));
    const k = 1 - corner * hash(Math.round(x * 20), Math.round(y * 20), Math.round(z * 20)) * 0.035 + Math.sin(x * 1.7 + z * 1.3 + y * 0.9 + seed) * 0.006;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function rng(seed: number): () => number {
  let s = Math.floor(Math.abs(seed)) % 2147483647 || 16807;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A wedge of a ring course: from angle a0 to a1, radii r0..r1, height y0..y1, its top edges a
    little worn (the outer rim lower) so no two blocks sit quite alike. */
function ringBlock(a0: number, a1: number, r0: number, r1: number, y0: number, y1: number, wear: number): THREE.BufferGeometry {
  const seg = Math.max(2, Math.ceil((a1 - a0) * 6));
  const shape = new THREE.Shape();
  for (let k = 0; k <= seg; k++) {
    const a = a0 + ((a1 - a0) * k) / seg;
    const p = [Math.cos(a) * r1, Math.sin(a) * r1];
    if (k === 0) shape.moveTo(p[0], p[1]);
    else shape.lineTo(p[0], p[1]);
  }
  for (let k = seg; k >= 0; k--) {
    const a = a0 + ((a1 - a0) * k) / seg;
    shape.lineTo(Math.cos(a) * r0, Math.sin(a) * r0);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  // wear: the outer top edge sinks a little
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > y1 - 0.01) p.setY(i, y - wear * Math.min(1, Math.max(0, (Math.hypot(x, z) - r0) / (r1 - r0))));
  }
  return g.index ? g.toNonIndexed() : g;
}

/** A rough standing stone: a tapered slab, its faces broken by noise, leaning a little. */
function standingStone(R: () => number, h: number): THREE.BufferGeometry {
  const w = 0.55 + R() * 0.3, d = 0.35 + R() * 0.2;
  const g = new THREE.BoxGeometry(w, h, d, 3, 6, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const ph = R() * 100;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (y + h / 2) / h; // 0 at the foot, 1 at the top
    const taper = 1 - t * 0.35;
    const bump = 1 + 0.12 * Math.sin(x * 7 + ph) * Math.sin(y * 3.1 + ph * 0.7) + 0.08 * Math.sin(z * 9 + y * 5 + ph);
    const top = t > 0.92 ? -(t - 0.92) * h * 0.6 * Math.abs(Math.sin(x * 4 + ph)) : 0; // a rounded, broken crown
    p.setXYZ(i, x * taper * bump, y + top + h / 2, z * taper * bump);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** The ground of a home: a round platform of fitted blocks (radius ~4.5 m, top at 0.12 m, sunk
    into the ground), a lower worn course round it, and a ring of seven standing stones (radius
    ~5.6 m), one of them fallen. Local to the home's centre. Returns the mesh and where its stones
    stand (for colliders). */
export function homePlatform(seed: number, base: number): { mesh: THREE.Group; stones: { x: number; z: number; r: number }[] } {
  const R = rng(seed * 7919 + 13);
  const parts: THREE.BufferGeometry[] = [];
  const monoliths: THREE.BufferGeometry[] = [];
  // the lower course: a ring of large blocks, half sunk, their joints wide
  const n1 = 14;
  for (let k = 0; k < n1; k++) {
    const a0 = (k / n1) * Math.PI * 2 + 0.012, a1 = ((k + 1) / n1) * Math.PI * 2 - 0.012;
    parts.push(ringBlock(a0, a1, 3.6, 4.7, -0.5, -0.06 + (R() - 0.5) * 0.05, 0.05 + R() * 0.06));
  }
  // the upper floor: a ring of paving round a round centre stone
  const n2 = 10;
  for (let k = 0; k < n2; k++) {
    const a0 = (k / n2) * Math.PI * 2 + 0.01 + 0.3, a1 = ((k + 1) / n2) * Math.PI * 2 - 0.01 + 0.3;
    parts.push(ringBlock(a0, a1, 1.5, 3.9, -0.3, 0.12 + (R() - 0.5) * 0.02, 0.02 + R() * 0.03));
  }
  const centre = new THREE.CylinderGeometry(1.46, 1.5, 0.44, 32).toNonIndexed();
  centre.translate(0, -0.1, 0);
  parts.push(centre);
  // the standing stones: seven, one fallen across the ring
  const stones: { x: number; z: number; r: number }[] = [];
  const fallen = Math.floor(R() * 7);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.22 + (R() - 0.5) * 0.12, r = 5.7 + (R() - 0.5) * 0.3;
    const h = 1.6 + R() * 1.1;
    const g = standingStone(R, h);
    const m = new THREE.Matrix4();
    if (k === fallen) {
      // lying where it fell, half in the grass
      m.compose(new THREE.Vector3(Math.cos(a) * (r + 0.6), -0.12, Math.sin(a) * (r + 0.6)), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.08, -a, 0.1)), new THREE.Vector3(1, 1, 1));
      g.translate(0, -h / 2, 0);
    } else {
      m.compose(new THREE.Vector3(Math.cos(a) * r, -0.25, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.12, -a + Math.PI / 2, (R() - 0.5) * 0.12)), new THREE.Vector3(1, 1, 1));
      stones.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: 0.45 });
    }
    g.applyMatrix4(m);
    monoliths.push(g);
  }
  // keep only the attributes all parts share
  const merge = (list: THREE.BufferGeometry[]) => {
    for (const g of list) for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    for (const g of list) if (!g.attributes.normal) g.computeVertexNormals();
    return mergeGeometries(list)!;
  };
  const group = new THREE.Group();
  for (const [list, mat] of [[parts, landStone("red_sandstone_pavement", base, 2.2, [0.92, 0.9, 0.88])], [monoliths, landStone("sandstone_cracks", base, 1.8)]] as const) {
    const mesh = new THREE.Mesh(merge(list as THREE.BufferGeometry[]), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { mesh: group, stones };
}
