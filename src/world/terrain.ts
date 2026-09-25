/* The ground as one analytic height function, so collision, the camera and the meshes all
   agree. Water level is y = 0.
   - The home shore: a wide, gently curving beach where the wanderer wakes.
   - The island: across the water, with seven stations inland (milestone 2). */
import * as THREE from "three";
import stationCatalogue from "../../content/stations.json";
import { contourMaterial } from "./etching";

export const WATER_Y = 0;
const FLOOR_Y = -8;

export const ISLAND = { x: 0, z: -150, radius: 54, height: 11 };
/** Where the wanderer wakes, and faces. */
export const SPAWN = { x: 0, z: 34, heading: 0 };

/* ---------- noise ---------- */
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number): number {
  return vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 17, z * 2.1 - 9) * 0.3 + vnoise(x * 4.3 - 5, z * 4.3 + 3) * 0.15;
}
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The home shore: the waterline curves away at the sides like a bay. */
function shoreHeight(x: number, z: number): number {
  const zz = z + x * x * 0.0035 - 18; // 0 at the waterline
  const n = fbm(x * 0.05, z * 0.05);
  const beach = zz * 0.09;
  const dunes = smooth(12, 40, zz) * (1.2 + n * 2.2);
  return Math.max(FLOOR_Y, beach + dunes + (n - 0.5) * 0.3);
}

function islandHeightRaw(x: number, z: number): number {
  const dx = x - ISLAND.x, dz = z - ISLAND.z;
  const d = Math.hypot(dx, dz) / ISLAND.radius;
  if (d > 1.3) return FLOOR_Y;
  const n = fbm(x * 0.05, z * 0.05);
  const ang = Math.atan2(dz, dx);
  const dd = d * (1 + 0.1 * Math.sin(ang * 3 + 1.3) + 0.07 * Math.sin(ang * 5 + 0.4) + (n - 0.5) * 0.18);
  // A broad, low island: a sand rim, then a gentle rise to a wide plateau for the stations.
  const rise = Math.pow(smooth(1.0, 0.25, dd), 1.3);
  return Math.max(FLOOR_Y, ISLAND.height * rise * 0.55 - 1.4 + (n - 0.5) * 1.6 * rise);
}

/** The ground is levelled gently under each station, so its floor sits true. */
const PADS = (stationCatalogue.stations as { position: number[] }[]).map((s) => {
  const [x, z] = s.position;
  return { x, z, h: Math.max(0.6, islandHeightRaw(x, z)) };
});
function islandHeight(x: number, z: number): number {
  let h = islandHeightRaw(x, z);
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 8) h = h + (p.h - h) * smooth(8, 4.9, d);
  }
  return h;
}

/** Ground height at (x, z). Below WATER_Y means water. */
export function heightAt(x: number, z: number): number {
  return Math.max(shoreHeight(x, z), islandHeight(x, z));
}

export function onIsland(x: number, z: number): boolean {
  return Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.radius * 1.2 && islandHeight(x, z) > WATER_Y + 0.05;
}

/** Circle colliders for solid features (pillars, stones). */
export interface Collider {
  x: number;
  z: number;
  r: number;
  top: number;
}
export const colliders: Collider[] = [];

/* ---------- meshes ---------- */
function heightMesh(cx: number, cz: number, w: number, d: number, sx: number, sz: number, colorAt: (h: number, x: number, z: number) => THREE.Color): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, d, sx, sz);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    const h = heightAt(x, z);
    pos.setY(i, h);
    colorAt(h, x, z).toArray(col, i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, contourMaterial("#e2b86e", 1.1));
  m.position.set(cx, 0, cz);
  m.receiveShadow = true;
  return m;
}

export function buildTerrain(scene: THREE.Scene): void {
  const wet = new THREE.Color("#3b3a52");
  const sand = new THREE.Color("#8d86a0");
  const dune = new THREE.Color("#4b4668");
  const stone = new THREE.Color("#3a3656");
  const c = new THREE.Color();
  // Home shore: wide, running off into the fog at both sides.
  scene.add(
    heightMesh(0, 70, 420, 120, 140, 50, (h) =>
      c.copy(wet).lerp(sand, smooth(0.0, 0.6, h)).lerp(dune, smooth(1.5, 4, h)),
    ),
  );
  // The island.
  const s = ISLAND.radius * 2.7;
  scene.add(
    heightMesh(ISLAND.x, ISLAND.z, s, s, 130, 130, (h) =>
      c.copy(wet).lerp(sand, smooth(0.0, 0.5, h)).lerp(stone, smooth(1.2, 3.5, h)),
    ),
  );
}
