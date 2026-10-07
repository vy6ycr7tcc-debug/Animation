/* The way into the telling of Egypt from the pyramid itself (the owner: "Egypt reachable from the
   pyramid"). The Monument of Past Choices tells Egypt as a night in the desert before a great
   pyramid; standing beside the real one, a gateway on its plaza, off the north door's right, opens
   on that telling. Walk through it and you are in it (the journey's Egypt room, `Journey.via`);
   its door brings you back out here. The pyramid's own interior stays Ra's chambers and the way
   to the Duat.

   The owner found the first gate "a cartoon" (clean boxes, a regular grid of joints, a flat sheet
   of orange light). It is now an old ruin, after the gateways of Karnak: two battered jambs laid
   in courses of separate, uneven blocks (each its own size, a little out of true), a roll
   moulding up their outer corners, a lintel of three stones (one cracked and sagging) carved with
   a worn winged sun, a cavetto cornice whose right end has fallen and lies broken in the sand,
   rubble, sand drifted against the feet; and in the opening no light but a dark depth, a faint
   warm glow far within, the air in it trembling a little. */
import * as THREE from "three/webgpu";
import { T, vnoise } from "../gpu/tsl";
import { contactShade, doorSpill, landStone, stoneBlock } from "./stoneworks";
import { colliders, heightAt } from "./terrain";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const { smoothstep, uv, vec2, vec3, mix } = T;
/** The opening: 2.2 m wide, 4.4 m high (a tall Egyptian door, twice as high as it is wide). */
const OPEN_W = 2.2, OPEN_H = 4.4;

function rng(seed: number): () => number {
  let s = seed % 2147483647 || 16807;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
/** Place a geometry: rotate (x, y, z radians), then move. */
function put(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  g.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}

/** A cavetto cornice: the Egyptian gorge, flaring out and up from a roll, as a length along x. */
function cavetto(len: number, depth: number, h: number, flare: number): THREE.BufferGeometry {
  // the profile in (z, y), front half; mirrored for the back
  const pts: [number, number][] = [];
  const half = depth / 2;
  pts.push([half, 0]);
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    // a concave quarter curve: slow at first, then sweeping out under the top
    pts.push([half + flare * (1 - Math.cos((t * Math.PI) / 2)), h * 0.82 * Math.sin((t * Math.PI) / 2)]);
  }
  pts.push([half + flare, h], [-(half + flare), h]);
  for (let k = 8; k >= 0; k--) {
    const t = k / 8;
    pts.push([-(half + flare * (1 - Math.cos((t * Math.PI) / 2))), h * 0.82 * Math.sin((t * Math.PI) / 2)]);
  }
  pts.push([-half, 0]);
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 1 });
  // the shape's x is our z, its y our y, the extrusion our x
  g.rotateY(Math.PI / 2);
  g.translate(-len / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

/** A winged sun, worn: a raised disc between two long wings, each a single low relief in three
    stepped rows of feathers (deeper toward the disc), its tip curling up. */
function wingedSun(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  out.push(put(new THREE.CylinderGeometry(0.21, 0.22, 0.07, 32), 0, 0, 0.035, Math.PI / 2));
  for (const s of [1, -1]) {
    for (let f = 0; f < 3; f++) {
      const len = 1.1 - f * 0.22, top = 0.13 - f * 0.075, bot = top - 0.1;
      const w = new THREE.Shape();
      // drawn mirrored for the left wing (a mirrored geometry would turn its faces inside out)
      w.moveTo(0, top);
      w.quadraticCurveTo(s * len * 0.6, top + 0.035, s * len, top + 0.06);
      w.quadraticCurveTo(s * len * 0.7, bot + 0.035, 0, bot);
      w.lineTo(0, top);
      const g = new THREE.ExtrudeGeometry(w, { depth: 0.05 - f * 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 8 });
      out.push(put(g, s * 0.2, 0, 0));
    }
  }
  return out;
}

/** Taper a block (centred, height `h`, its foot at height `y0` in the jamb) so the jamb's outer
    face and its front and back run as one continuous slope, course to course. */
function batter(g: THREE.BufferGeometry, h: number, y0: number, side: number, sx: number, sz: number, zSide = 0): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const gx = p.getX(i), gy = p.getY(i), gz = p.getZ(i);
    const rise = y0 + gy + h / 2;
    const zs = Math.sign(gz);
    p.setXYZ(i, gx * side > 0 ? gx - side * sx * rise : gx, gy, zSide === 0 || zs === zSide ? gz - zs * sz * rise : gz);
  }
  g.computeVertexNormals();
  return g;
}

export class EgyptGate {
  readonly group = new THREE.Group();
  /** Its centre on the ground (world), and the heading that walks in through it. */
  readonly at = new THREE.Vector3();
  readonly heading: number;
  private uT = T.uniform(0);

  /** `door`: the pyramid's entrance (world); the gate stands 16 m to its east and 14 m out from
      the face, square to it, its opening facing the plaza. */
  constructor(door: THREE.Vector3) {
    const x = door.x + 16, z = door.z - 14;
    const y = heightAt(x, z);
    this.at.set(x, y, z);
    this.heading = Math.PI; // walking in: toward +z (toward the pyramid's face)
    this.group.position.copy(this.at);
    const r = rng(7331);
    const J = (a: number) => (r() - 0.5) * a; // a little out of true

    // the stone: the scanned sandstone, rough (no drawn joints: every block is its own)
    const stone = landStone("sandstone_cracks", y, 0.8, [0.96, 0.91, 0.84]);
    // each stone its own tone (quarried apart, weathered apart): a per-stone attribute
    const blocks: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry) => {
      g.setAttribute("tone", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.8 + r() * 0.32), 1));
      blocks.push(g);
    };
    let seed = 11;

    // the jambs: battered on their outer faces, laid in courses of uneven height; each course one
    // or two stones, each a little shifted and turned; the right one's top course broken away
    const BASE_W = 1.85, TOP_W = 1.38, BASE_D = 2.0, TOP_D = 1.62;
    // the jambs stand solid (they had no colliders: you walked through the stone)
    for (const side of [-1, 1]) colliders.push({ x: x + side * (OPEN_W / 2 + BASE_W / 2), z, r: 0, hx: BASE_W / 2, hz: BASE_D / 2, top: y + OPEN_H + 0.3 });
    for (const side of [-1, 1]) {
      let yy = -0.15; // the lowest course sits a little down in the sand
      while (yy < OPEN_H - 0.05) {
        let h = Math.min(OPEN_H - yy, 0.58 + r() * 0.32);
        if (OPEN_H - yy - h < 0.35) h = OPEN_H - yy; // no thin sliver of a course at the top
        const k = yy / OPEN_H;
        const w = BASE_W + (TOP_W - BASE_W) * k, d = BASE_D + (TOP_D - BASE_D) * k;
        const broken = side > 0 && yy + h > OPEN_H - 0.6; // the right jamb's top course: half gone
        const split = r() < 0.55;
        const sx = (BASE_W - TOP_W) / OPEN_H, sz = (BASE_D - TOP_D) / 2 / OPEN_H;
        const B = (g: THREE.BufferGeometry, y0: number, zSide = 0) => batter(g, h - 0.025, y0, side, sx, sz, zSide);
        const cx = side * (OPEN_W / 2 + BASE_W / 2); // battered blocks start at the foot's width
        if (split) {
          // two stones front and back, their joint wandering course to course
          const f = 0.4 + r() * 0.2;
          for (const [dz, dd] of [[(BASE_D * (1 - f)) / 2, BASE_D * f], [-(BASE_D * f) / 2, BASE_D * (1 - f)]] as [number, number][]) {
            if (broken && dz < 0) continue;
            add(put(B(stoneBlock(BASE_W + J(0.03), h - 0.025, dd - 0.02, seed++), yy, Math.sign(dz)), cx + J(0.025), yy + h / 2, dz + J(0.02), J(0.01), J(0.02), J(0.01)));
          }
        } else if (broken) {
          add(put(stoneBlock(w * 0.7, h * 0.8 - 0.025, d * 0.6, seed++), side * (OPEN_W / 2 + w / 2) + side * w * 0.12, yy + h * 0.4, d * 0.15, J(0.04), J(0.08), side * 0.05));
        } else add(put(B(stoneBlock(BASE_W + J(0.03), h - 0.025, BASE_D + J(0.03), seed++), yy), cx + J(0.025), yy + h / 2, J(0.02), J(0.01), J(0.02), J(0.01)));
        yy += h;
      }
      // the roll moulding up the outer corners, following the batter (worn: a little uneven)
      for (const fz of [1, -1]) {
        const x0 = side * (OPEN_W / 2 + BASE_W), x1 = side * (OPEN_W / 2 + TOP_W);
        const z0 = fz * (BASE_D / 2), z1 = fz * (TOP_D / 2);
        const len = Math.hypot(x1 - x0, OPEN_H, z1 - z0);
        const roll = new THREE.CylinderGeometry(0.085, 0.095, len, 10, 6);
        const lean = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, OPEN_H, z1 - z0).normalize());
        roll.applyQuaternion(lean);
        add(put(roll, (x0 + x1) / 2, OPEN_H / 2 - 0.1, (z0 + z1) / 2));
      }
    }
    // the lintel: three stones; the right one cracked through and sagging a little
    const LW = OPEN_W + 2 * TOP_W + 0.3, LH = 0.92, LD = TOP_D + 0.12;
    const third = LW / 3;
    add(put(stoneBlock(third - 0.03, LH, LD, seed++), -third, OPEN_H + LH / 2, 0, 0, 0.01, 0.004));
    add(put(stoneBlock(third - 0.03, LH, LD, seed++), 0, OPEN_H + LH / 2 + 0.005, 0.01));
    add(put(stoneBlock(third * 0.55, LH, LD, seed++), third * 0.78, OPEN_H + LH / 2 - 0.035, 0, 0.01, 0, -0.035));
    add(put(stoneBlock(third * 0.4, LH * 0.92, LD - 0.1, seed++), third * 1.3, OPEN_H + LH / 2 - 0.09, 0.02, -0.02, 0.02, -0.07));
    // the winged sun on both faces of the lintel
    for (const fz of [1, -1]) for (const g of wingedSun()) add(put(g.scale(1.3, 1.3, 1), 0, OPEN_H + LH * 0.48, fz * (LD / 2 + 0.005), 0, fz < 0 ? Math.PI : 0));
    // the cornice: its left two thirds in place, the rest fallen
    const CW = LW * 0.68;
    add(put(cavetto(CW, LD - 0.1, 0.82, 0.46), -LW / 2 + CW / 2 - 0.08, OPEN_H + LH, 0));
    // the roll moulding under it, front and back, along the lintel's top (broken where it fell)
    for (const fz of [1, -1]) add(put(new THREE.CylinderGeometry(0.09, 0.09, CW + 0.04, 10), -LW / 2 + CW / 2 - 0.08, OPEN_H + LH - 0.02, fz * (LD / 2 - 0.02), 0, 0, Math.PI / 2));
    // the fallen piece: on its side in the sand at the right foot, broken short
    add(put(cavetto(LW * 0.24, LD - 0.1, 0.82, 0.46), OPEN_W / 2 + 2.9, 0.5, -1.3, 0.25, 0.6, Math.PI * 0.53));
    // rubble: fallen stones and chips
    const rubble: [number, number, number, number, number, number][] = [
      [OPEN_W / 2 + 1.9, 0.18, 1.4, 0.62, 0.42, 0.55],
      [-(OPEN_W / 2 + 2.3), 0.12, -1.3, 0.75, 0.36, 0.5],
      [OPEN_W / 2 + 3.3, 0.08, 0.2, 0.36, 0.22, 0.3],
      [-(OPEN_W / 2 + 1.5), 0.06, 1.9, 0.28, 0.16, 0.22],
      [OPEN_W / 2 + 1.2, 0.05, -2.4, 0.22, 0.14, 0.2],
    ];
    for (const [rx, ry, rz, w, h, d] of rubble) add(put(stoneBlock(w, h, d, seed++), rx, ry, rz, J(0.5), r() * 3, J(0.4)));
    // the threshold: a worn slab, half under the sand
    add(put(stoneBlock(OPEN_W + 0.3, 0.2, LD, seed++), 0, 0.02, 0, 0.01, 0, 0.006));

    stone.colorNode = (stone.colorNode as ReturnType<typeof vec3>).mul(T.attribute("tone", "float"));
    const mesh = new THREE.Mesh(mergeGeometries(blocks)!, stone);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);

    // the opening: no light standing in it but a dark depth, as if it opened far down into a
    // lit hall; the air in it trembles a little, a faint warm glow low in its heart
    const lm = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
    const q = uv();
    const shimmer = vnoise(vec2(q.x.mul(6).add(this.uT.mul(0.07)), q.y.mul(9).sub(this.uT.mul(0.35)))).sub(0.5).mul(0.05);
    // the floor of a passage far down, faintly lit: warmest low and in the middle, fading upward
    const floorLight = smoothstep(0.38, 0.0, q.y.add(shimmer)).mul(smoothstep(0.5, 0.05, T.abs(q.x.sub(0.5))));
    const breathe = T.sin(this.uT.mul(0.5)).mul(0.12).add(0.88);
    lm.colorNode = mix(vec3(0.01, 0.007, 0.005), vec3(0.55, 0.3, 0.13), floorLight.pow(1.6).mul(0.4).mul(breathe));
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(OPEN_W, OPEN_H, 1, 1), lm);
    veil.position.set(0, OPEN_H / 2 + 0.12, 0);
    this.group.add(veil);
    // the warmth lies faint on the sand at its foot, both ways
    for (const s of [1, -1]) {
      const spill = doorSpill(OPEN_W * 0.8, 3.2, new THREE.Color(1, 0.62, 0.3), 0.07);
      spill.rotation.y = s > 0 ? 0 : Math.PI;
      spill.position.set(0, 0.16, s * 0.8);
      this.group.add(spill);
    }
    const shade = contactShade({ w: LW, d: BASE_D + 0.4 }, 1.6, 0.5);
    shade.position.y = 0.03;
    this.group.add(shade);
  }

  update(t: number): void {
    this.uT.value = t;
  }

  /** Walking in through its opening (from either side). */
  atGate(p: THREE.Vector3): boolean {
    return Math.abs(p.x - this.at.x) < OPEN_W / 2 - 0.2 && Math.abs(p.z - this.at.z) < 0.45 && p.y < this.at.y + 2;
  }

  /** Coming back out: on the plaza side, facing away from the gate (north). */
  outside(): { x: number; y: number; z: number; heading: number } {
    const x = this.at.x, z = this.at.z - 2.6;
    return { x, y: heightAt(x, z), z, heading: 0 };
  }
}
