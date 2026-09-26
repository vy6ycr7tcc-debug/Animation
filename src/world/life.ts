/* The world answers the wanderer as they pass. Nothing waits to be used; everything reacts.
   - Grass of light bends away and brightens along the path just walked.
   - Flowers of light bloom as you brush past, each with a note; walking makes a melody.
   - Lanterns kindle silently as you come near and stay lit (remembered on this device).
   - Butterflies of light drift near flowers and follow you a while.
   - Great gliders of light pass slowly overhead.
   - Sparks rise whenever something opens. */
import * as THREE from "three/webgpu";
import type { AudioEngine } from "../core/audio";
import { softPoints, spriteCloud, T, viewDepth, withFog, type N, type SpriteCloud } from "../gpu/tsl";
import { fbm, groundKind, heightAt, WATER_Y } from "./terrain";

export interface LifeFrame {
  t: number;
  dt: number;
  player: THREE.Vector3;
  speed: number;
  reduced: boolean;
  dpr: number;
}

// A gentle pentatonic scale (D major), all above the phone speaker's low end.
const SCALE = [440, 493.88, 587.33, 659.25, 739.99, 880, 987.77, 1174.66];

const {
  abs, attribute, cameraPosition, clamp, cos, Discard, dot, exp, float, fract, Fn, If, length, Loop, max, min, mix, pointUV, positionLocal,
  pow, screenCoordinate, sin, smoothstep, step, uniform, uniformArray, varying, vec2, vec3, vec4,
} = T;
const tuv = T.uv;

function cellHash(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ---------------------------------------------------------------- sparks */
export class Sparks {
  points: THREE.Sprite;
  private n = 260;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private tint: Float32Array;
  private next = 0;
  private cloud: SpriteCloud;
  private uDpr = uniform(1);
  constructor() {
    const mat = softPoints();
    this.cloud = spriteCloud(this.n, { position: 3, aLife: 1, aTint: 3 }, mat);
    const { position, aLife, aTint } = this.cloud.nodes;
    this.pos = this.cloud.attrs.position.array as Float32Array;
    this.life = this.cloud.attrs.aLife.array as Float32Array;
    this.tint = this.cloud.attrs.aTint.array as Float32Array;
    this.vel = new Float32Array(this.n * 3);
    mat.sizeNode = clamp(aLife.add(0.4).mul(30).div(max(viewDepth(position), 0.5)), float(1).div(this.uDpr), 9);
    mat.colorNode = vec4(aTint.mul(smoothstep(0.5, 0, length(pointUV.sub(0.5)))).mul(aLife).mul(1.8), 1);
    this.points = this.cloud.sprite;
  }
  emit(at: THREE.Vector3, count: number, color: THREE.Color, spread = 1): void {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const a = Math.random() * Math.PI * 2;
      const s = (0.4 + Math.random() * 0.9) * spread;
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([Math.cos(a) * s, 0.8 + Math.random() * 1.6, Math.sin(a) * s], i * 3);
      this.life[i] = 1;
      this.tint.set([color.r, color.g, color.b], i * 3);
    }
  }
  update(dt: number, dpr: number): void {
    this.uDpr.value = dpr;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] = Math.max(0, this.life[i] - dt * 0.7);
      const j = i * 3;
      this.vel[j + 1] -= dt * 0.35;
      this.vel[j] *= 1 - dt * 0.9;
      this.vel[j + 2] *= 1 - dt * 0.9;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
    }
    const A = this.cloud.attrs;
    A.position.needsUpdate = A.aLife.needsUpdate = A.aTint.needsUpdate = true;
  }
}

/* ---------------------------------------------------------------- grass of light */
const TILE = 16;
const BLADES_PER_TILE = 240;
const GRASS_RING = 2; // 5 × 5 tiles around the wanderer
const TRAIL = 20;

export class LightGrass {
  mesh: THREE.Mesh;
  private tiles = new Map<string, Float32Array>();
  private cx = Infinity;
  private cz = Infinity;
  private base: THREE.InstancedBufferAttribute;
  private params: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private trail: THREE.Vector4[] = [];
  private trailNext = 0;
  private lastMark = new THREE.Vector3(1e9, 0, 0);
  private uniforms = { uT: uniform(0), uPlayer: uniform(new THREE.Vector3()) };

  constructor() {
    for (let i = 0; i < TRAIL; i++) this.trail.push(new THREE.Vector4(0, 0, -100, 0));
    const max = BLADES_PER_TILE * (GRASS_RING * 2 + 1) ** 2;
    this.geo = new THREE.InstancedBufferGeometry();
    // one blade: a thin tapering triangle strip (5 vertices), uv.y = 0 at the root, 1 at the tip
    const v = [-0.5, 0, 0.5, 0, -0.35, 0.45, 0.35, 0.45, 0, 1];
    const pos: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < 5; i++) {
      pos.push(v[i * 2] * 0.06, v[i * 2 + 1], 0);
      uv.push(v[i * 2] + 0.5, v[i * 2 + 1]);
    }
    this.geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    this.geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    this.base = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.params = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.geo.setAttribute("aBase", this.base);
    this.geo.setAttribute("aParams", this.params);
    this.geo.instanceCount = 0;
    // Solid, softly lit blades (they catch the moon at their tips), not lines of light.
    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
    const U = this.uniforms, uTrail = uniformArray(this.trail, "vec4");
    const aBase = attribute("aBase", "vec3"), aParams = attribute("aParams", "vec3"); // height, rotation, phase
    const hgt = aParams.x, rot = aParams.y, ph = aParams.z;
    const p0 = positionLocal.mul(vec3(1, hgt, 1));
    const c = cos(rot), sn = sin(rot);
    const w0 = aBase.add(vec3(p0.x.mul(c).sub(p0.z.mul(sn)), p0.y, p0.x.mul(sn).add(p0.z.mul(c))));
    const y2 = tuv().y.mul(tuv().y);
    // wind, in slow travelling gusts
    const gust = sin(U.uT.mul(0.9).add(aBase.x.mul(0.15)).add(aBase.z.mul(0.1))).mul(0.5).add(0.5);
    const wind = vec2(sin(U.uT.mul(1.7).add(ph)), cos(U.uT.mul(1.3).add(ph.mul(1.3)))).mul(0.05).mul(y2).add(vec2(0.12, 0.05).mul(gust).mul(y2));
    // bend away from the wanderer
    const d = aBase.xz.sub(U.uPlayer.xz), dl = length(d).add(1e-3);
    const bend = d.div(dl).mul(smoothstep(1.5, 0, dl)).mul(0.45).mul(y2);
    const w = vec3(w0.x.add(wind.x).add(bend.x), w0.y.sub(smoothstep(1.2, 0, dl).mul(0.15).mul(y2).mul(hgt)), w0.z.add(wind.y).add(bend.y));
    mat.positionNode = w;
    // brighten where the wanderer has just walked
    const glowV = varying(Fn(() => {
      const g = float(0).toVar();
      Loop(TRAIL, ({ i }: N) => {
        const tr = uTrail.element(i);
        const age = U.uT.sub(tr.z);
        const e = aBase.xz.sub(tr.xy);
        g.addAssign(age.greaterThanEqual(0).select(exp(dot(e, e).mul(-0.9)).mul(exp(age.mul(-0.28))), 0));
      });
      return min(g, 1.5);
    })());
    const camD = length(w.sub(cameraPosition));
    const fadeV = varying(float(1).sub(smoothstep(22, 34, length(aBase.xz.sub(cameraPosition.xz)))).mul(smoothstep(1.2, 4, camD))); // never a blade in your face
    const wV = varying(w);
    const vY = tuv().y;
    mat.colorNode = Fn(() => {
      // fade out by dissolving, so the blades stay solid and sort correctly
      If(fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453)).greaterThan(fadeV), () => {
        Discard();
      });
      const base = mix(vec3(0.07, 0.075, 0.14), vec3(0.36, 0.4, 0.6), vY).add(vec3(0.35, 0.28, 0.24).mul(pow(vY, 4)).mul(0.35)); // moonlight on the tips
      const glow = vec3(1.0, 0.82, 0.52).mul(glowV).mul(vY).mul(1.2);
      return vec4(withFog(base.add(glow), wV), 1);
    })();
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }

  private tile(i: number, j: number): Float32Array {
    const key = `${i},${j}`;
    let d = this.tiles.get(key);
    if (d) return d;
    // [x, y, z, height, rotation, phase] per blade, only where the ground is meadow
    const out: number[] = [];
    let s = (i * 73856093) ^ (j * 19349663);
    const R = () => ((s = (s * 16807 + 12345) % 2147483647) / 2147483647 + 1) % 1;
    // in tufts: a few blades leaning out from one root, like real grass
    for (let k = 0; k < BLADES_PER_TILE / 5; k++) {
      const x = (i + R()) * TILE, z = (j + R()) * TILE;
      const h = heightAt(x, z);
      if (h < WATER_Y + 0.25) continue;
      const m = groundKind(x, z, h).meadow;
      if (R() > m * 1.6 + 0.08) continue;
      const tall = 0.3 + R() * 0.3;
      for (let b = 0; b < 5; b++) {
        const a = R() * 6.28, r = R() * 0.12;
        out.push(x + Math.cos(a) * r, h, z + Math.sin(a) * r, tall * (0.7 + R() * 0.5), R() * Math.PI, R() * 6.28);
      }
    }
    d = new Float32Array(out);
    this.tiles.set(key, d);
    if (this.tiles.size > 200) this.tiles.delete(this.tiles.keys().next().value!);
    return d;
  }

  update(f: LifeFrame): void {
    this.uniforms.uT.value = f.t;
    this.uniforms.uPlayer.value.copy(f.player);
    if (f.player.distanceToSquared(this.lastMark) > 0.8 * 0.8) {
      this.lastMark.copy(f.player);
      this.trail[this.trailNext].set(f.player.x, f.player.z, f.t, 0);
      this.trailNext = (this.trailNext + 1) % TRAIL;
    }
    const cx = Math.floor(f.player.x / TILE), cz = Math.floor(f.player.z / TILE);
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;
    const b = this.base.array as Float32Array, p = this.params.array as Float32Array;
    let n = 0;
    for (let i = -GRASS_RING; i <= GRASS_RING; i++)
      for (let j = -GRASS_RING; j <= GRASS_RING; j++) {
        const d = this.tile(cx + i, cz + j);
        for (let k = 0; k < d.length; k += 6) {
          b[n * 3] = d[k];
          b[n * 3 + 1] = d[k + 1];
          b[n * 3 + 2] = d[k + 2];
          p[n * 3] = d[k + 3];
          p[n * 3 + 1] = d[k + 4];
          p[n * 3 + 2] = d[k + 5];
          n++;
        }
      }
    this.geo.instanceCount = n;
    this.base.needsUpdate = true;
    this.params.needsUpdate = true;
  }
}

/* ---------------------------------------------------------------- flowers of light */
const CELL = 7;
const FLOWER_RING = 9; // cells in each direction (~63 m)
interface Flower {
  x: number;
  y: number;
  z: number;
  note: number;
  hue: number;
  open: number;
  openedAt: number;
}

export class Flowers {
  mesh: THREE.Mesh;
  private list: Flower[] = [];
  private known = new Map<string, Flower | null>();
  private cx = Infinity;
  private cz = Infinity;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute;
  private aState: THREE.InstancedBufferAttribute;
  private uT = uniform(0);
  private tmp = new THREE.Vector3();
  constructor(private sparks: Sparks, private audio: AudioEngine) {
    // Six petals, each a flattened ellipsoid lying along +y from the centre.
    const petal = new THREE.SphereGeometry(0.5, 10, 6);
    petal.scale(0.32, 1, 0.06).translate(0, 0.5, 0);
    const pp = petal.attributes.position.array as Float32Array;
    const pos: number[] = [], pet: number[] = [];
    const idx: number[] = [];
    const pIdx = petal.index!.array;
    for (let k = 0; k < 6; k++) {
      const off = pos.length / 3;
      for (let i = 0; i < pp.length; i += 3) {
        pos.push(pp[i], pp[i + 1], pp[i + 2]);
        pet.push(k);
      }
      for (let i = 0; i < pIdx.length; i++) idx.push(pIdx[i] + off);
    }
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.geo.setAttribute("aPetal", new THREE.Float32BufferAttribute(pet, 1));
    this.geo.setIndex(idx);
    const max = (FLOWER_RING * 2 + 1) ** 2;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // x, y, z, hue
    this.aState = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); // open 0..1
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aState.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("aPos", this.aPos);
    this.geo.setAttribute("aOpen", this.aState);
    this.geo.instanceCount = 0;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    {
      const uT = this.uT;
      const aPetal = attribute("aPetal", "float"), aPos = attribute("aPos", "vec4"), aOpen = attribute("aOpen", "float");
      const a = aPetal.mul(1.0472).add(aPos.w.mul(6));
      const tilt = mix(0.18, 1.25, aOpen).add(sin(uT.mul(1.3).add(aPos.w.mul(20))).mul(0.04)); // folded bud → open bloom
      const p = positionLocal.mul(mix(0.55, 1, aOpen)).mul(0.34);
      // tilt the petal away from vertical, then turn it around the stem
      const ct = cos(tilt), st = sin(tilt);
      const p1 = vec3(p.x, p.y.mul(ct).sub(p.z.mul(st)), p.y.mul(st).add(p.z.mul(ct)));
      const ca = cos(a), sa = sin(a);
      const p2 = vec3(p1.x.mul(ca).add(p1.z.mul(sa)), p1.y, p1.x.negate().mul(sa).add(p1.z.mul(ca)));
      mat.positionNode = aPos.xyz.add(vec3(0, sin(uT.mul(0.8).add(aPos.w.mul(9))).mul(0.02).add(0.32), 0)).add(p2);
      const vTip = varying(length(positionLocal.xy).div(0.5));
      const vFade = varying(float(1).sub(smoothstep(45, 62, length(aPos.xz.sub(cameraPosition.xz)))));
      const hue = aPos.w;
      const c = mix(mix(vec3(1.0, 0.78, 0.55), vec3(0.75, 0.85, 1.0), step(0.5, hue)), vec3(1.0, 0.65, 0.85), step(0.8, hue));
      const b = aOpen.mul(0.9).add(0.12);
      mat.colorNode = vec4(c.mul(b).mul(vTip.mul(0.8).add(0.5)).mul(vFade), 1);
    }
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }

  private flowerAt(i: number, j: number): Flower | null {
    const key = `${i},${j}`;
    if (this.known.has(key)) return this.known.get(key)!;
    let f: Flower | null = null;
    if (cellHash(i, j, 1) < 0.62) {
      const x = (i + 0.2 + cellHash(i, j, 2) * 0.6) * CELL, z = (j + 0.2 + cellHash(i, j, 3) * 0.6) * CELL;
      const h = heightAt(x, z);
      const k = groundKind(x, z, h);
      if (h > WATER_Y + 0.3 && k.meadow > 0.15) {
        // neighbouring flowers share nearby notes, so paths sing in phrases
        const note = Math.floor(fbm(x * 0.03, z * 0.03) * 10 + cellHash(i, j, 4) * 3) % SCALE.length;
        f = { x, y: h, z, note, hue: cellHash(i, j, 5), open: 0, openedAt: -100 };
      }
    }
    this.known.set(key, f);
    if (this.known.size > 4000) this.known.delete(this.known.keys().next().value!);
    return f;
  }

  update(f: LifeFrame): void {
    this.uT.value = f.t;
    const cx = Math.floor(f.player.x / CELL), cz = Math.floor(f.player.z / CELL);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx;
      this.cz = cz;
      this.list = [];
      for (let i = -FLOWER_RING; i <= FLOWER_RING; i++)
        for (let j = -FLOWER_RING; j <= FLOWER_RING; j++) {
          const fl = this.flowerAt(cx + i, cz + j);
          if (fl) this.list.push(fl);
        }
    }
    const pos = this.aPos.array as Float32Array, st = this.aState.array as Float32Array;
    this.list.forEach((fl, n) => {
      const d = Math.hypot(fl.x - f.player.x, fl.z - f.player.z);
      if (d < 1.7 && fl.open < 0.2 && f.t - fl.openedAt > 8) {
        // brushing past: it blooms, sings its note, and lets go a few sparks
        fl.openedAt = f.t;
        this.audio.bell(SCALE[fl.note], 0.035, 3.5);
        this.sparks.emit(this.tmp.set(fl.x, fl.y + 0.4, fl.z), 7, new THREE.Color(1, 0.85, 0.6), 0.5);
      }
      const want = f.t - fl.openedAt < 22 ? 1 : 0;
      fl.open += (want - fl.open) * Math.min(1, f.dt * (want ? 3 : 0.25));
      pos[n * 4] = fl.x;
      pos[n * 4 + 1] = fl.y;
      pos[n * 4 + 2] = fl.z;
      pos[n * 4 + 3] = fl.hue;
      st[n] = fl.open;
    });
    this.geo.instanceCount = this.list.length;
    this.aPos.needsUpdate = true;
    this.aState.needsUpdate = true;
  }

  /** Where the nearest flowers are (for the butterflies). */
  near(p: THREE.Vector3, out: THREE.Vector3): boolean {
    let best = 1e9;
    for (const fl of this.list) {
      const d = (fl.x - p.x) ** 2 + (fl.z - p.z) ** 2;
      if (d < best) {
        best = d;
        out.set(fl.x, fl.y + 0.6, fl.z);
      }
    }
    return best < 1e9;
  }
}

/* ---------------------------------------------------------------- lanterns */
const LCELL = 46;
const LANTERN_KEY = "inward-journey:lanterns";
interface Cluster {
  key: string;
  x: number;
  z: number;
  orbs: THREE.Vector3[];
  lit: number;
  target: number;
}
export class Lanterns {
  points: THREE.Sprite;
  private clusters = new Map<string, Cluster | null>();
  private active: Cluster[] = [];
  private cx = Infinity;
  private cz = Infinity;
  private litKeys: Set<string>;
  private pos: Float32Array;
  private glow: Float32Array;
  private cloud: SpriteCloud;
  private uDpr = uniform(1);
  onKindle: ((x: number, z: number) => void) | null = null;
  constructor(private sparks: Sparks) {
    let saved: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(LANTERN_KEY) || "[]");
    } catch {
      saved = [];
    }
    this.litKeys = new Set(saved);
    const mat = softPoints();
    this.cloud = spriteCloud(400, { position: 3, aGlow: 1 }, mat);
    this.pos = this.cloud.attrs.position.array as Float32Array;
    this.glow = this.cloud.attrs.aGlow.array as Float32Array;
    const { position, aGlow } = this.cloud.nodes;
    mat.sizeNode = clamp(aGlow.mul(80).add(26).div(max(viewDepth(position), 0.5)).mul(6), float(3).div(this.uDpr), 160);
    const r = length(pointUV.sub(0.5)).mul(2);
    const core = smoothstep(0.18, 0, r), halo = exp(r.mul(r).mul(-5)).mul(0.35);
    mat.colorNode = vec4(vec3(1.0, 0.78, 0.48).mul(core.mul(aGlow.mul(2.4).add(0.4)).add(halo.mul(aGlow.mul(1.3).add(0.12)))), 1);
    this.points = this.cloud.sprite;
    this.cloud.setCount(0);
  }

  private cluster(i: number, j: number): Cluster | null {
    const key = `${i},${j}`;
    if (this.clusters.has(key)) return this.clusters.get(key)!;
    let c: Cluster | null = null;
    if (cellHash(i, j, 11) < 0.42) {
      const x = (i + 0.25 + cellHash(i, j, 12) * 0.5) * LCELL, z = (j + 0.25 + cellHash(i, j, 13) * 0.5) * LCELL;
      const h = heightAt(x, z);
      if (h > WATER_Y + 0.4 && h < 30) {
        const orbs: THREE.Vector3[] = [];
        const n = 3 + Math.floor(cellHash(i, j, 14) * 4);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + cellHash(i, j, 15 + k);
          const r = 1.2 + cellHash(i, j, 20 + k) * 2.2;
          const ox = x + Math.cos(a) * r, oz = z + Math.sin(a) * r;
          orbs.push(new THREE.Vector3(ox, heightAt(ox, oz) + 1.3 + cellHash(i, j, 30 + k) * 1.8, oz));
        }
        const lit = this.litKeys.has(key) ? 1 : 0;
        c = { key, x, z, orbs, lit, target: lit };
      }
    }
    this.clusters.set(key, c);
    return c;
  }

  update(f: LifeFrame): void {
    this.uDpr.value = f.dpr;
    const cx = Math.floor(f.player.x / LCELL), cz = Math.floor(f.player.z / LCELL);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx;
      this.cz = cz;
      this.active = [];
      for (let i = -3; i <= 3; i++)
        for (let j = -3; j <= 3; j++) {
          const c = this.cluster(cx + i, cz + j);
          if (c) this.active.push(c);
        }
    }
    let n = 0;
    for (const c of this.active) {
      const d = Math.hypot(c.x - f.player.x, c.z - f.player.z);
      if (d < 6 && c.target === 0) {
        // coming near kindles them, one after another
        c.target = 1;
        this.litKeys.add(c.key);
        try {
          localStorage.setItem(LANTERN_KEY, JSON.stringify([...this.litKeys]));
        } catch {
          /* not remembered */
        }
        // silently: Samuel didn't like the bells here
        c.orbs.forEach((o, k) => window.setTimeout(() => this.sparks.emit(o, 10, new THREE.Color(1, 0.8, 0.5), 0.7), k * 220));
        this.onKindle?.(c.x, c.z);
      }
      c.lit += (c.target - c.lit) * Math.min(1, f.dt * 0.8);
      for (const [k, o] of c.orbs.entries()) {
        if (n >= 400) break;
        const bob = f.reduced ? 0 : Math.sin(f.t * 0.7 + k * 1.7 + c.x) * 0.12;
        this.pos.set([o.x, o.y + bob + c.lit * 0.4, o.z], n * 3);
        this.glow[n] = c.lit * (0.85 + 0.15 * Math.sin(f.t * 2.1 + k));
        n++;
      }
    }
    this.cloud.setCount(n);
    this.cloud.attrs.position.needsUpdate = this.cloud.attrs.aGlow.needsUpdate = true;
  }

  get litCount(): number {
    return this.litKeys.size;
  }
}

/* ---------------------------------------------------------------- butterflies of light */
export class Butterflies {
  points: THREE.Sprite;
  private n = 36;
  private pos: Float32Array;
  private vel: Float32Array;
  private follow: Float32Array;
  private cloud: SpriteCloud;
  private U = { uDpr: uniform(1), uT: uniform(0) };
  private tmp = new THREE.Vector3();
  private target = new THREE.Vector3();
  constructor(private flowers: Flowers) {
    const mat = softPoints();
    this.cloud = spriteCloud(this.n, { position: 3, aK: 1 }, mat);
    this.pos = this.cloud.attrs.position.array as Float32Array;
    this.vel = new Float32Array(this.n * 3);
    this.follow = new Float32Array(this.n);
    const k = this.cloud.attrs.aK.array as Float32Array;
    for (let i = 0; i < this.n; i++) k[i] = Math.random();
    const { position, aK } = this.cloud.nodes, U = this.U;
    const vF = abs(sin(U.uT.mul(aK.mul(4).add(9)).add(aK.mul(30)))); // wing beats
    mat.sizeNode = clamp(vF.mul(8).add(10).div(max(viewDepth(position), 0.5)).mul(3), float(1.5).div(U.uDpr), 24);
    mat.colorNode = Fn(() => {
      // two wings: an ellipse pinched at the middle, opening and closing
      const q0 = pointUV.sub(0.5);
      const q = vec2(q0.x.div(max(0.15, vF)), q0.y);
      const r = length(q.mul(vec2(1, 1.6)));
      const wing = smoothstep(0.5, 0.1, r).mul(smoothstep(0, 0.06, abs(q.x.mul(vF))));
      const c = mix(vec3(0.7, 0.9, 1.0), vec3(1.0, 0.8, 0.95), step(0.5, aK));
      return vec4(c.mul(wing.mul(0.9).add(smoothstep(0.15, 0, length(q0)).mul(0.8))), 1);
    })();
    this.points = this.cloud.sprite;
  }
  private started = false;
  update(f: LifeFrame): void {
    this.U.uDpr.value = f.dpr;
    this.U.uT.value = f.t;
    const p = this.pos, v = this.vel;
    if (!this.started) {
      for (let i = 0; i < this.n; i++) p.set([f.player.x + (Math.random() - 0.5) * 30, f.player.y + 1 + Math.random() * 2, f.player.z + (Math.random() - 0.5) * 30], i * 3);
      this.started = true;
    }
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      this.tmp.set(p[j], p[j + 1], p[j + 2]);
      const d = this.tmp.distanceTo(f.player);
      // Near the wanderer, some decide to follow a while.
      if (d < 6 && this.follow[i] <= 0 && Math.random() < f.dt * 0.4) this.follow[i] = 20 + Math.random() * 20;
      this.follow[i] -= f.dt;
      if (this.follow[i] > 0) {
        const a = f.t * 0.9 + i;
        this.target.set(f.player.x + Math.cos(a) * 1.4, f.player.y + 1.3 + Math.sin(f.t * 1.3 + i) * 0.4, f.player.z + Math.sin(a) * 1.4);
      } else if (d > 40) {
        // wandered too far: drift back toward flowers near the wanderer
        this.flowers.near(f.player, this.target);
        this.target.x += (Math.random() - 0.5) * 20;
        this.target.z += (Math.random() - 0.5) * 20;
      } else {
        this.flowers.near(this.tmp, this.target);
        this.target.y += Math.sin(f.t + i) * 0.5;
      }
      // soft, fluttering steering
      const ax = (this.target.x - p[j]) * 0.6 + Math.sin(f.t * 3.1 + i * 7) * 1.5;
      const ay = (this.target.y - p[j + 1]) * 0.8 + Math.sin(f.t * 4.3 + i * 3) * 1.2;
      const az = (this.target.z - p[j + 2]) * 0.6 + Math.cos(f.t * 2.7 + i * 5) * 1.5;
      v[j] += (ax - v[j] * 1.2) * f.dt;
      v[j + 1] += (ay - v[j + 1] * 1.2) * f.dt;
      v[j + 2] += (az - v[j + 2] * 1.2) * f.dt;
      p[j] += v[j] * f.dt;
      p[j + 1] = Math.max(heightAt(p[j], p[j + 2]) + 0.3, p[j + 1] + v[j + 1] * f.dt);
      p[j + 2] += v[j + 2] * f.dt;
    }
    this.cloud.attrs.position.needsUpdate = true;
  }
}

/* ---------------------------------------------------------------- gliders overhead */
export class Gliders {
  group = new THREE.Group();
  private items: { mesh: THREE.Mesh; r: number; h: number; speed: number; phase: number }[] = [];
  private uT = uniform(0);
  constructor() {
    // A broad, soft diamond with long trailing tips: a manta of light.
    const s = new THREE.Shape();
    s.moveTo(0, 1.6);
    s.bezierCurveTo(1.2, 1.2, 3.4, 0.2, 4.2, -0.6);
    s.bezierCurveTo(2.6, -0.4, 1.0, -0.9, 0.25, -1.5);
    s.lineTo(0, -4.5);
    s.lineTo(-0.25, -1.5);
    s.bezierCurveTo(-1.0, -0.9, -2.6, -0.4, -4.2, -0.6);
    s.bezierCurveTo(-3.4, 0.2, -1.2, 1.2, 0, 1.6);
    const geo = new THREE.ShapeGeometry(s, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    {
      const uT = this.uT, P = positionLocal;
      const lift = sin(uT.mul(1.1).add(abs(P.x).mul(0.5))).mul(abs(P.x)).mul(0.35) // slow wing strokes
        .add(sin(uT.mul(1.1).sub(P.z.mul(0.6))).mul(0.25).mul(step(P.z, -1.4))); // the tail follows
      mat.positionNode = P.add(vec3(0, lift, 0));
      const vP = varying(P);
      const edge = smoothstep(3.6, 4.2, abs(vP.x)).add(smoothstep(-3.5, -4.4, vP.z).mul(0.5));
      const body = exp(vP.x.mul(vP.x).mul(-0.6)).mul(0.5);
      const lines = smoothstep(0.92, 1, sin(vP.x.mul(6).add(vP.z.mul(2))).mul(0.5).add(0.5)).mul(0.35);
      mat.colorNode = vec4(vec3(0.7, 0.85, 1.0).mul(body.mul(0.18).add(0.02).add(lines.mul(0.12)).add(edge.mul(0.9))), 1);
    }
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.scale.setScalar(1.6 + i * 0.5);
      this.group.add(m);
      this.items.push({ mesh: m, r: 60 + i * 45, h: 34 + i * 12, speed: 0.05 - i * 0.008, phase: i * 2.1 });
    }
  }
  update(f: LifeFrame): void {
    this.uT.value = f.reduced ? f.t * 0.4 : f.t;
    for (const it of this.items) {
      const a = f.t * it.speed + it.phase;
      const x = f.player.x * 0.6 + Math.cos(a) * it.r, z = f.player.z * 0.6 + Math.sin(a) * it.r;
      it.mesh.position.set(x, it.h + Math.sin(f.t * 0.2 + it.phase) * 4, z);
      it.mesh.rotation.y = Math.PI - a; // nose along the circle
    }
  }
}
