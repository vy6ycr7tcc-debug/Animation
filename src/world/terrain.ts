/* The open world: one analytic height function, so collision, the camera, the grass and the
   meshes all agree. Water level is y = 0; wherever the land dips below it, there is a lake.
   - Rolling hills, soft dunes and hollows that hold lakes.
   - A gentle meadow where the wanderer wakes.
   - Mountains rising far out, so the world has an edge you see but never reach.
   The ground is streamed in square chunks around the wanderer. */
import * as THREE from "three";
import { contourMaterial } from "./etching";

export const WATER_Y = 0;
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
  // mountains far out: the edge of the world
  h += smooth(430, 700, Math.hypot(x, z)) * (40 + n2 * 50);
  return h;
}

/** Landmarks: roughly where each should stand; each settles on the nearest calm, dry ground. */
const WISHED_SITES: [number, number][] = [
  [58, -130], // the beam and ring
  [-150, -70], // pillars and veil
  [-50, 118], // the spiral garden
  [170, 55], // the throne on its square of light
  [-120, -235], // the arch of three stones
  [120, 205], // the crossing rings
];
function settle([x, z]: [number, number]): [number, number] {
  for (let r = 0; r <= 140; r += 7) {
    const steps = r === 0 ? 1 : 16;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const h = rawHeight(px, pz);
      if (h < 2 || h > 14) continue;
      let flat = true;
      for (const [dx, dz] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) if (Math.abs(rawHeight(px + dx, pz + dz) - h) > 2.2) flat = false;
      if (flat) return [px, pz];
    }
  }
  return [x, z];
}
/** Where the landmarks stand. Positions are shared with stations.ts. */
export const LANDMARK_SITES: [number, number][] = WISHED_SITES.map(settle);

const PADS = LANDMARK_SITES.map(([x, z]) => ({ x, z, h: Math.max(1.2, rawHeight(x, z)) }));

/** Ground height at (x, z). Below WATER_Y means water. */
export function heightAt(x: number, z: number): number {
  let h = rawHeight(x, z);
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 11) h = mix(h, p.h, smooth(11, 6.5, d));
  }
  return h;
}

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

/* ---------- streamed chunks ---------- */
const CHUNK = 80;
const SEG = 24;
const RING = 3; // chunks in each direction: a 7 × 7 field, about 280 m out

const C = {
  wet: new THREE.Color("#353450"),
  sand: new THREE.Color("#8a84a2"),
  meadowA: new THREE.Color("#2f4a5c"), // silver-blue
  meadowB: new THREE.Color("#4b3a66"), // violet
  meadowC: new THREE.Color("#5a4450"), // rose
  stone: new THREE.Color("#3a3656"),
  snow: new THREE.Color("#8e8cb4"),
};

export class Terrain {
  group = new THREE.Group();
  private chunks = new Map<string, THREE.Mesh>();
  private pool: THREE.Mesh[] = [];
  private material = contourMaterial("#e2b86e", 2.2);
  private cx = Infinity;
  private cz = Infinity;
  private col = new THREE.Color();
  private tmp = new THREE.Color();

  /** Build or recycle chunks so the wanderer is always in the middle of the field. */
  update(x: number, z: number, force = false): void {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    if (!force && cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;
    const want = new Set<string>();
    for (let i = -RING; i <= RING; i++) for (let j = -RING; j <= RING; j++) want.add(`${cx + i},${cz + j}`);
    for (const [k, m] of this.chunks) {
      if (!want.has(k)) {
        this.group.remove(m);
        this.pool.push(m);
        this.chunks.delete(k);
      }
    }
    for (const k of want) {
      if (this.chunks.has(k)) continue;
      const [i, j] = k.split(",").map(Number);
      const m = this.pool.pop() ?? this.newMesh();
      this.fill(m, i, j);
      this.chunks.set(k, m);
      this.group.add(m);
    }
  }

  private newMesh(): THREE.Mesh {
    const g = new THREE.PlaneGeometry(CHUNK, CHUNK, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    const m = new THREE.Mesh(g, this.material);
    m.receiveShadow = true;
    m.frustumCulled = true;
    return m;
  }

  private fill(m: THREE.Mesh, i: number, j: number): void {
    const ox = (i + 0.5) * CHUNK, oz = (j + 0.5) * CHUNK;
    m.position.set(ox, 0, oz);
    const g = m.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = g.attributes.color as THREE.BufferAttribute;
    // the plane's local vertices are laid out on a fixed grid; recompute from indices
    const n = SEG + 1;
    for (let v = 0; v < pos.count; v++) {
      const lx = ((v % n) / SEG - 0.5) * CHUNK;
      const lz = (Math.floor(v / n) / SEG - 0.5) * CHUNK;
      const x = ox + lx, z = oz + lz;
      const h = heightAt(x, z);
      pos.setXYZ(v, lx, h, lz);
      const k = groundKind(x, z, h);
      const region = fbm(x * 0.004 + 9, z * 0.004 - 4);
      this.col.copy(C.meadowA).lerp(C.meadowB, smooth(0.35, 0.6, region)).lerp(C.meadowC, smooth(0.6, 0.78, region));
      this.col.lerp(this.tmp.copy(C.sand), k.sand).lerp(C.stone, k.stone).lerp(C.snow, smooth(40, 70, h));
      if (h < 0.1) this.col.copy(C.wet);
      col.setXYZ(v, this.col.r, this.col.g, this.col.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
  }
}
