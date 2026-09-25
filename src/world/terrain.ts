/* The ground of the world as one analytic height function, so collision, the camera and
   the meshes all agree. Water level is y = 0. The lake floor sits well below it.
   Island shapes here are phase-1 blockouts: right size, right place, right colour. */
import * as THREE from "three";
import { contourMaterial } from "./etching";

export const WATER_Y = 0;
const FLOOR_Y = -8;

export type IslandKind = "mind" | "body" | "spirit";

export interface Island {
  kind: IslandKind;
  name: string;
  x: number;
  z: number;
  radius: number; // footprint; the shoreline sits at about 0.72 of it
  height: number;
  /** Colours: shore, low slopes, high ground, and the etched line colour. */
  colors: { shore: string; low: string; high: string; line: string };
}

// Mind ahead-left, Body ahead-right, Spirit behind. The sun rises between Mind and Body.
export const ISLANDS: Island[] = [
  {
    kind: "mind", name: "Island of Mind", x: -78, z: -52, radius: 34, height: 16,
    colors: { shore: "#b9b4ae", low: "#8e9bb0", high: "#d9e0ea", line: "#cfe3ff" },
  },
  {
    kind: "body", name: "Island of Body", x: 80, z: -48, radius: 36, height: 26,
    colors: { shore: "#b8905e", low: "#5d7a4a", high: "#9a4a32", line: "#ffc27a" },
  },
  {
    kind: "spirit", name: "Island of Spirit", x: 6, z: 96, radius: 32, height: 14,
    colors: { shore: "#8d86a8", low: "#4a3f7a", high: "#8c7fc4", line: "#e8c8ff" },
  },
];

/** The stone platform at the lake's centre, where the wanderer begins. */
export const PLATFORM = { radius: 9, top: 0.35 };

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
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function islandHeight(isl: Island, x: number, z: number): number {
  const dx = x - isl.x, dz = z - isl.z;
  const d = Math.hypot(dx, dz) / isl.radius;
  if (d > 1.3) return FLOOR_Y;
  const n = fbm(x * 0.06, z * 0.06);
  // Wobble the outline so the shore isn't a perfect circle.
  const ang = Math.atan2(dz, dx);
  const dd = d * (1 + 0.12 * Math.sin(ang * 3 + isl.x) + 0.08 * Math.sin(ang * 5 + isl.z) + (n - 0.5) * 0.2);
  const dome = Math.pow(smooth(1.0, 0.0, dd), 1.5);
  let h = isl.height * dome - 1.6 + (n - 0.5) * 2.2 * dome;
  if (isl.kind === "body" && h > 1) {
    // Terraced stone: soft steps.
    const step = 2.2;
    const k = h / step;
    const f = k - Math.floor(k);
    h = (Math.floor(k) + smooth(0.55, 0.95, f)) * step;
  }
  if (isl.kind === "spirit") h = Math.min(h, isl.height * 0.62 + (n - 0.5)); // a broad high plateau, open to the sky
  return Math.max(FLOOR_Y, h);
}

/** Ground height at (x, z). Below WATER_Y means water. */
export function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let h = PLATFORM.top - smooth(PLATFORM.radius - 0.3, PLATFORM.radius + 1.2, r) * (PLATFORM.top - FLOOR_Y);
  for (const isl of ISLANDS) h = Math.max(h, islandHeight(isl, x, z));
  return h;
}

/** Circle colliders for solid features (pillars, crystals, mirrors). */
export interface Collider {
  x: number;
  z: number;
  r: number;
  top: number;
}
export const colliders: Collider[] = [];

/** Which island (if any) the point is near, with a 0–1 closeness weight for audio and light. */
export function islandWeights(x: number, z: number): Record<IslandKind, number> {
  const w = { mind: 0, body: 0, spirit: 0 } as Record<IslandKind, number>;
  for (const isl of ISLANDS) {
    const d = Math.hypot(x - isl.x, z - isl.z);
    w[isl.kind] = 1 - smooth(isl.radius * 0.5, isl.radius * 1.7, d);
  }
  return w;
}

/* ---------- meshes ---------- */
export function buildTerrain(scene: THREE.Scene): void {
  for (const isl of ISLANDS) {
    const size = isl.radius * 2.6;
    const seg = isl.kind === "body" ? 150 : 110;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const cShore = new THREE.Color(isl.colors.shore);
    const cLow = new THREE.Color(isl.colors.low);
    const cHigh = new THREE.Color(isl.colors.high);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + isl.x, z = pos.getZ(i) + isl.z;
      const h = heightAt(x, z);
      pos.setY(i, h);
      const t = h / isl.height;
      if (h < 0.8) c.copy(cShore);
      else c.copy(cShore).lerp(cLow, smooth(0.8, 3, h)).lerp(cHigh, smooth(0.35, 0.95, t));
      c.toArray(col, i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, contourMaterial(isl.colors.line, isl.kind === "body" ? 2.2 : 1.6));
    m.position.set(isl.x, 0, isl.z);
    m.receiveShadow = true;
    m.castShadow = false;
    scene.add(m);
  }

  // The central platform: pale stone, the wanderer's first ground.
  const plat = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATFORM.radius, PLATFORM.radius + 1.2, PLATFORM.top - FLOOR_Y + 0.4, 64, 1),
    new THREE.MeshStandardMaterial({ color: "#d8cbbb", roughness: 0.85 }),
  );
  plat.position.y = (PLATFORM.top + FLOOR_Y) / 2 - 0.2;
  plat.receiveShadow = true;
  scene.add(plat);
}
