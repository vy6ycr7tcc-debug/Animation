/* Tall flowers of light that rise out of the ground as you come near (Samuel: "more variety of
   elements than just so many trees… more flowers rising above the ground"). Round and curving,
   never stiff: each stem is one smooth S-curve with a leaf curled in a spiral at its foot, and
   at the top a cup of petals opens upward around a small light, like a lotus or a tulip.
   They grow in patches in the meadows. Come within ~18 m and the patch rises, one stem after
   another, the cups opening as they climb and a slow thread of light running up each stem;
   some while after you've gone, it sinks back into the ground to rest. */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T, withFog } from "../gpu/tsl";
import type { LifeFrame } from "./life";
import { fbm, groundKind, heightAt, LANDMARK_SITES, SPAWN, WATER_Y } from "./terrain";

const { attribute, cameraPosition, cos, Discard, float, fract, Fn, If, length, max, mix, normalGeometry, positionGeometry, pow, screenCoordinate, sin, smoothstep, step, uniform, varying, vec2, vec3, vec4, dot } = T;

const PCELL = 11; // metres
const PRING = 6; // cells each way: ~70 m
const MAX = 400;
const WAKE_R = 18; // coming this close raises a patch
const REST_AFTER = 45; // seconds after you've gone, it sinks back
const TOP = new THREE.Vector3(0.03, 1.0, 0); // where the cup sits, in the unit plant

const HUES: [number, number, number][] = [
  [1.0, 0.8, 0.5], // gold
  [0.7, 0.85, 1.0], // pale blue
  [1.0, 0.66, 0.85], // rose
  [0.82, 0.72, 1.0], // lavender
];
const LIGHTS = HUES.map((h) => new THREE.Color(...h));

function hash(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

interface Plant {
  x: number;
  y: number;
  z: number;
  rot: number;
  height: number;
  hue: number;
  phase: number;
  delay: number;
  rise: number;
}
interface Patch {
  key: string;
  x: number;
  z: number;
  hue: number;
  plants: Plant[];
  wokeAt: number; // when it began to rise (−1: resting)
  lastNear: number;
}

/** One plant of unit height: stem, curled leaf, cup of petals and its light, tagged by part. */
function plantGeometry(): THREE.BufferGeometry {
  const tag = (g: THREE.BufferGeometry, part: number, u: (p: THREE.Vector3) => number) => {
    const n = g.attributes.position.count, p = new THREE.Vector3();
    const aPart = new Float32Array(n), aU = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, i);
      aPart[i] = part;
      aU[i] = u(p);
    }
    g.setAttribute("aPart", new THREE.BufferAttribute(aPart, 1));
    g.setAttribute("aU", new THREE.BufferAttribute(aU, 1));
    g.deleteAttribute("uv");
    return g;
  };
  // the stem: rising in a gentle S
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.035, 0.35, 0), new THREE.Vector3(-0.02, 0.7, 0),
    new THREE.Vector3(0.02, 0.92, 0), TOP.clone().add(new THREE.Vector3(0, 0.02, 0)),
  ]);
  const stem = tag(new THREE.TubeGeometry(stemCurve, 20, 0.02, 6), 0, (p) => Math.min(1, p.y));
  // a leaf curled in a spiral at the foot
  const c = new THREE.Vector3(0.12, 0.14, 0.02), base = new THREE.Vector3(0, 0.03, 0);
  const a0 = Math.atan2(base.y - c.y, base.x - c.x), r0 = Math.hypot(base.x - c.x, base.y - c.y);
  const curlPts: THREE.Vector3[] = [];
  for (let k = 0; k <= 14; k++) {
    const s = k / 14, a = a0 + s * Math.PI * 2.3, r = r0 * (1 - s * 0.86);
    curlPts.push(new THREE.Vector3(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, c.z * s));
  }
  const leaf = tag(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curlPts), 16, 0.014, 4), 1, () => 0.1);
  // the cup: six petals opening upward and outward, three more cupped within
  const petals: THREE.BufferGeometry[] = [];
  const petalU = (p: THREE.Vector3) => Math.min(1, Math.max(0, (p.y - TOP.y) / 0.3)); // base to tip
  for (let k = 0; k < 9; k++) {
    const inner = k >= 6;
    const g = new THREE.SphereGeometry(1, 8, 5);
    if (inner) g.scale(0.05, 0.14, 0.022).translate(0, 0.12, 0).rotateZ(-0.22).rotateY(((k - 6) / 3) * Math.PI * 2 + 0.5);
    else g.scale(0.075, 0.19, 0.028).translate(0, 0.16, 0).rotateZ(-0.62).rotateY((k / 6) * Math.PI * 2);
    g.translate(TOP.x, TOP.y, TOP.z);
    petals.push(tag(g, 2, petalU));
  }
  const core = tag(new THREE.SphereGeometry(0.042, 8, 5).translate(TOP.x, TOP.y + 0.06, TOP.z), 3, () => 1);
  return mergeGeometries([stem, leaf, ...petals, core])!;
}

export class RisingFlowers {
  mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private aBase: THREE.InstancedBufferAttribute; // x, y, z, turn
  private aShape: THREE.InstancedBufferAttribute; // height, hue, phase, lean
  private aRise: THREE.InstancedBufferAttribute;
  private uT = uniform(0);
  private patches = new Map<string, Patch | null>();
  private active: Patch[] = [];
  private cx = Infinity;
  private cz = Infinity;

  constructor() {
    const plant = plantGeometry();
    this.geo = new THREE.InstancedBufferGeometry();
    for (const k of ["position", "normal", "aPart", "aU"]) this.geo.setAttribute(k, plant.attributes[k]);
    this.geo.setIndex(plant.index);
    this.aBase = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aShape = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aRise = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("aBase", this.aBase);
    this.geo.setAttribute("aShape", this.aShape);
    this.geo.setAttribute("aRise", this.aRise);
    this.geo.instanceCount = 0;

    const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
    const aBase = attribute("aBase", "vec4"), aShape = attribute("aShape", "vec4"), aRise = attribute("aRise", "float");
    const aPart = attribute("aPart", "float"), aU = attribute("aU", "float");
    const P = positionGeometry;
    const r = smoothstep(0, 1, aRise);
    const H = aShape.x;
    const top = vec3(TOP.x, TOP.y, TOP.z);
    // the stem climbs out of the ground; the bell grows and opens as it rises
    const isBell = step(1.5, aPart);
    const stemP = P.mul(vec3(H, H.mul(r), H));
    const bellP = top.mul(vec3(H, H.mul(r), H)).add(P.sub(top).mul(H).mul(r.mul(r).mul(0.8).add(0.2)));
    const p0 = mix(stemP, bellP, isBell);
    // a slow sway, strongest at the top
    const u2 = mix(aU.mul(aU), 1, isBell);
    const sway = vec3(sin(this.uT.mul(0.9).add(aShape.z)).mul(0.07).add(aShape.w), 0, cos(this.uT.mul(0.7).add(aShape.z.mul(1.3))).mul(0.05)).mul(u2).mul(H).mul(r);
    const p1 = p0.add(sway);
    const cr = cos(aBase.w), sr = sin(aBase.w);
    const w = vec3(p1.x.mul(cr).sub(p1.z.mul(sr)), p1.y, p1.x.mul(sr).add(p1.z.mul(cr))).add(aBase.xyz);
    mat.positionNode = w;
    const vW = varying(w), vPart = varying(aPart), vU = varying(aU), vRise = varying(r), vHue = varying(aShape.y), vPh = varying(aShape.z);
    const vN = varying(normalGeometry);
    const vFade = varying(float(1).sub(smoothstep(48, 64, length(aBase.xz.sub(cameraPosition.xz)))));
    mat.colorNode = Fn(() => {
      // thinned away (dithered) toward the edge of the patches' reach, never a hard line
      If(fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453)).greaterThan(vFade), () => {
        Discard();
      });
      const hue = mix(mix(vec3(...HUES[0]), vec3(...HUES[1]), step(0.25, vHue)), mix(vec3(...HUES[2]), vec3(...HUES[3]), step(0.75, vHue)), step(0.5, vHue));
      const shade = max(vN.y, 0).mul(0.35).add(0.65);
      // the stem and leaf: dark silver, with a thread of light running up as it rises
      const stem = vec3(0.17, 0.16, 0.26).mul(shade);
      const thread = pow(fract(vU.mul(1.4).sub(this.uT.mul(0.22)).add(vPh)), 14).mul(0.5).mul(vRise);
      const stemCol = stem.add(hue.mul(thread.add(vU.mul(0.12).mul(vRise))));
      // the petals: their own colour, lit from within as they open, paler toward the tips; the
      // light inside a little brighter
      const bell = hue.mul(mix(0.18, 0.62, vRise)).mul(shade.mul(0.4).add(0.6)).mul(vU.mul(0.6).add(0.6));
      const light = hue.mul(mix(0.3, 1.35, vRise));
      const c = mix(stemCol, mix(bell, light, step(2.5, vPart)), step(1.5, vPart));
      return vec4(withFog(c, vW), 1);
    })();
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }

  private patchAt(i: number, j: number): Patch | null {
    const key = `${i},${j}`;
    if (this.patches.has(key)) return this.patches.get(key)!;
    let p: Patch | null = null;
    const x = (i + 0.2 + hash(i, j, 1) * 0.6) * PCELL, z = (j + 0.2 + hash(i, j, 2) * 0.6) * PCELL;
    const h = heightAt(x, z);
    const k = groundKind(x, z, h);
    // in the meadows, in drifts: some stretches thick with them, others bare
    const drift = THREE.MathUtils.smoothstep(fbm(x * 0.012 - 41, z * 0.012 + 17), 0.42, 0.62);
    const clear = Math.hypot(x - SPAWN.x, z - SPAWN.z) > 6 && LANDMARK_SITES.every(([lx, lz]) => Math.hypot(x - lx, z - lz) > 13);
    if (clear && h > WATER_Y + 0.4 && h < 40 && k.meadow > 0.3 && hash(i, j, 3) < 0.12 + drift * 0.5) {
      const n = 3 + Math.floor(hash(i, j, 4) * 5);
      const hue = Math.floor(hash(i, j, 5) * 4) / 4 + 0.01;
      const plants: Plant[] = [];
      for (let q = 0; q < n; q++) {
        const a = hash(i, j, 10 + q) * Math.PI * 2, rr = q === 0 ? 0 : 0.5 + hash(i, j, 20 + q) * 2.2;
        const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        plants.push({
          x: px, y: heightAt(px, pz) - 0.02, z: pz,
          rot: hash(i, j, 30 + q) * Math.PI * 2,
          height: (q === 0 ? 2.6 : 1.2 + hash(i, j, 40 + q) * 1.2) * (0.85 + drift * 0.3),
          // most of a patch shares a colour; now and then one of another
          hue: hash(i, j, 50 + q) < 0.8 ? hue : Math.floor(hash(i, j, 60 + q) * 4) / 4 + 0.01,
          phase: hash(i, j, 70 + q) * 6.28,
          delay: q * 0.35 + hash(i, j, 80 + q) * 0.3,
          rise: 0,
        });
      }
      p = { key, x, z, hue, plants, wokeAt: -1, lastNear: -1e9 };
    }
    this.patches.set(key, p);
    if (this.patches.size > 4000) this.patches.delete(this.patches.keys().next().value!);
    return p;
  }

  update(f: LifeFrame): void {
    this.uT.value = f.reduced ? f.t * 0.4 : f.t;
    const cx = Math.floor(f.player.x / PCELL), cz = Math.floor(f.player.z / PCELL);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx;
      this.cz = cz;
      this.active = [];
      for (let i = -PRING; i <= PRING; i++)
        for (let j = -PRING; j <= PRING; j++) {
          const p = this.patchAt(cx + i, cz + j);
          if (p) this.active.push(p);
        }
    }
    const base = this.aBase.array as Float32Array, shape = this.aShape.array as Float32Array, rise = this.aRise.array as Float32Array;
    let n = 0;
    for (const p of this.active) {
      const near = Math.hypot(p.x - f.player.x, p.z - f.player.z) < WAKE_R;
      if (near) {
        p.lastNear = f.t;
        if (p.wokeAt < 0) p.wokeAt = f.t;
      } else if (p.wokeAt >= 0 && f.t - p.lastNear > REST_AFTER) p.wokeAt = -1;
      for (const pl of p.plants) {
        if (n >= MAX) break;
        const want = p.wokeAt >= 0 && (f.reduced || f.t - p.wokeAt > pl.delay) ? 1 : 0;
        // rising takes a couple of seconds; sinking back to rest, longer
        pl.rise += (want - pl.rise) * Math.min(1, f.dt * (want ? 0.9 : 0.2));
        base[n * 4] = pl.x;
        base[n * 4 + 1] = pl.y;
        base[n * 4 + 2] = pl.z;
        base[n * 4 + 3] = pl.rot;
        shape[n * 4] = pl.height;
        shape[n * 4 + 1] = pl.hue;
        shape[n * 4 + 2] = pl.phase;
        shape[n * 4 + 3] = 0.04 * Math.sin(pl.phase * 3); // a slight lean of its own
        rise[n] = pl.rise;
        n++;
      }
    }
    this.geo.instanceCount = n;
    this.aBase.needsUpdate = this.aShape.needsUpdate = this.aRise.needsUpdate = true;
  }

  /** Each light this casts on the ground: a risen patch glows softly around its feet. */
  lights(add: (x: number, z: number, r: number, c: THREE.Color, k: number) => void): void {
    for (const p of this.active) {
      let r = 0;
      for (const pl of p.plants) r += pl.rise;
      if (r > 0.05) add(p.x, p.z, 4.5, LIGHTS[Math.min(3, Math.floor(p.hue * 4))], (r / p.plants.length) * 0.22);
    }
  }
}
