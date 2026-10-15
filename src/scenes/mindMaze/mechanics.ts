/* The maze as the archetypal engine (the owner's design: "the maze IS the archetypal engine").
   Each of the mind's functions made a mechanic you live rather than read, all contemplative: no
   score, no timer, no popup, nothing on the screen but the world.
   - The Veil: what is far stays dark (the walls' and floor's shading, in area.ts); it thins
     where you have touched.
   - The Catalyst: a real touch on a wall wakes it (the wall's own answer in area.ts) and the
     touch shimmers through the colours a moment.
   - The Experience: each touch leaves a gilded palm on the stone, lasting the visit, and the
     veil thins round it (`TouchMap`): touched masonry keeps a soft gold edge visible far beyond
     the dark, and the maze's map draws only what you have walked and touched.
   - The Fork: a slow gold breath on the floor at every crossing of three or more ways; the
     first way you take from each is remembered (area.ts), and at the centre the paths you chose
     light first.
   - The Road: the way you walked glows faintly on the ground behind you, a living thread.
   Everything here is bounded (fixed buffers, ring writes) and allocates nothing per frame. */
import * as THREE from "three/webgpu";
import { T, type N, spectrum } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { keepAlpha } from "../densities/roomKit";

const { attribute, float, vec2, vec3, vec4, sin, smoothstep, mix, pow, uniform, uv } = T;
const TAU = Math.PI * 2;

/* ---------------------------------------------------------------- the touch map */
/** Where the wanderer has touched, seen from above: a small texture over the whole maze (about a
    metre a texel) that the walls and the floor read, so the veil thins round every touch. Written
    only when a touch happens; uploaded only then. */
export class TouchMap {
  readonly size = 256;
  readonly data: Uint8Array;
  readonly tex: THREE.DataTexture;
  constructor(readonly ext: number) {
    this.data = new Uint8Array(this.size * this.size * 4);
    this.tex = new THREE.DataTexture(this.data, this.size, this.size, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.needsUpdate = true;
  }
  /** A soft round mark of radius `r` (m) about (x, z), the room's frame. */
  splat(x: number, z: number, r: number): void {
    const s = this.size, m = s / (this.ext * 2);
    const ci = (x / (this.ext * 2) + 0.5) * s, cj = (z / (this.ext * 2) + 0.5) * s, rr = r * m;
    const i0 = Math.max(0, Math.floor(ci - rr)), i1 = Math.min(s - 1, Math.ceil(ci + rr));
    const j0 = Math.max(0, Math.floor(cj - rr)), j1 = Math.min(s - 1, Math.ceil(cj + rr));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i + 0.5 - ci, j + 0.5 - cj) / rr;
        if (d >= 1) continue;
        const v = Math.round(255 * (1 - d * d) * (1 - d * d));
        const o = (j * s + i) * 4;
        if (v > this.data[o]) this.data[o] = v;
      }
    this.tex.needsUpdate = true;
  }
  /** How touched (0–1) a point is, by its place in the room's frame. */
  node(p: N): N {
    const q = p.xz.div(this.ext * 2).add(0.5);
    return T.texture(this.tex, vec2(q.x, q.y)).r;
  }
  clear(): void {
    this.data.fill(0);
    this.tex.needsUpdate = true;
  }
}

/* ---------------------------------------------------------------- the palms */
/** The marks a touch leaves: a palm gilded on the stone, the fingers spread, faint, lasting the
    visit. Born with a shimmer through the colours (the catalyst), settling to quiet gold. A ring
    of `cap` marks; the oldest gives way when it is full. */
export class Palms {
  readonly mesh: THREE.InstancedMesh;
  private readonly born: THREE.InstancedBufferAttribute;
  private readonly dummy = new THREE.Object3D();
  private next = 0;
  count = 0;
  readonly at: Float32Array;
  constructor(readonly cap: number, t: N, ours: { dispose(): void }[]) {
    const geo = new THREE.PlaneGeometry(0.36, 0.46);
    const born = new Float32Array(cap).fill(-1e4);
    this.born = new THREE.InstancedBufferAttribute(born, 1);
    this.at = new Float32Array(cap * 2);
    const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false }));
    const q = uv();
    // the hand, as distances: a palm and five fingers (the thumb low and out), all rounded
    const cap2 = (a: N, b: N, r: number): N => {
      const pa = q.sub(a), ba = b.sub(a);
      const h = T.clamp(T.dot(pa, ba).div(T.dot(ba, ba)), 0, 1);
      return T.length(pa.sub(ba.mul(h))).sub(r);
    };
    const palm = T.length(q.sub(vec2(0.5, 0.36)).div(vec2(0.24, 0.2))).sub(1).mul(0.2);
    let d: N = palm;
    const fingers: [number, number, number, number, number][] = [
      [0.33, 0.52, 0.26, 0.76, 0.045],
      [0.44, 0.55, 0.42, 0.86, 0.048],
      [0.56, 0.55, 0.58, 0.85, 0.047],
      [0.67, 0.52, 0.74, 0.74, 0.043],
      [0.28, 0.32, 0.12, 0.5, 0.05],
    ];
    for (const [ax, ay, bx, by, r] of fingers) d = T.min(d, cap2(vec2(ax, ay), vec2(bx, by), r));
    const fill = smoothstep(0.012, -0.012, d);
    const rim = T.exp(T.abs(d).mul(-90));
    const B = T.instancedBufferAttribute(this.born);
    const age = t.sub(B);
    const appear = smoothstep(0, 1.6, age);
    // the catalyst: a shimmer through the colours as it is made, settling into gold
    const shimmer = T.exp(age.mul(-0.9)).mul(T.step(0, age));
    const gold = vec3(1, 0.76, 0.4);
    const iris = spectrum(q.x.mul(0.8).add(q.y.mul(0.6)).add(t.mul(0.35)));
    const col = mix(gold, iris.mul(1.3), shimmer.mul(0.75));
    const breathe = sin(t.mul(0.5).add(B.mul(3.7))).mul(0.12).add(0.88);
    const bright = fill.mul(0.1).add(rim.mul(0.42)).mul(appear).mul(breathe).add(fill.add(rim).mul(shimmer).mul(0.5));
    m.colorNode = vec4(col.mul(bright), 1);
    this.mesh = new THREE.InstancedMesh(geo, m, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    ours.push(geo, m);
  }
  /** A palm at (x, y, z) on a wall whose face looks along (nx, nz), born at `now`. */
  place(x: number, y: number, z: number, nx: number, nz: number, now: number, roll: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.count = Math.min(this.cap, this.count + 1);
    const d = this.dummy;
    d.position.set(x + nx * 0.025, y, z + nz * 0.025);
    d.rotation.set(0, Math.atan2(nx, nz), roll);
    d.updateMatrix();
    this.mesh.setMatrixAt(i, d.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.born.array[i] = now;
    this.born.needsUpdate = true;
    this.at[i * 2] = x;
    this.at[i * 2 + 1] = z;
    this.mesh.count = this.count;
  }
}

/* ---------------------------------------------------------------- the road */
/** The way walked, glowing faintly on the ground: flat quads from point to point, written into a
    ring of `cap` segments as you go (the farthest behind give way), a slow brightness travelling
    along it toward you, fading far behind. */
export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly sAt: Float32Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly sAttr: THREE.BufferAttribute;
  private readonly across: Float32Array;
  private readonly acrossAttr: THREE.BufferAttribute;
  private next = 0;
  private hasLast = false;
  private lx = 0;
  private ly = 0;
  private lz = 0;
  /** Distance walked (m), the head of the thread. */
  readonly head = uniform(0);
  /** How brightly the whole road shows (the centre's reveal from the eagle's height). */
  readonly reveal = uniform(0);
  length = 0;
  /** The last `pts` points walked (x, z), oldest first from `ptsStart`, for the map. */
  readonly pts: Float32Array;
  ptsCount = 0;
  version = 0;
  constructor(readonly cap: number, readonly step: number, t: N, ours: { dispose(): void }[]) {
    this.pos = new Float32Array(cap * 4 * 3);
    this.sAt = new Float32Array(cap * 4);
    const side = new Float32Array(cap * 4);
    this.across = new Float32Array(cap * 4 * 2);
    const idx = new Uint32Array(cap * 6);
    for (let s = 0; s < cap; s++) {
      side.set([-1, 1, -1, 1], s * 4);
      idx.set([s * 4, s * 4 + 1, s * 4 + 3, s * 4, s * 4 + 3, s * 4 + 2], s * 6);
    }
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.sAttr = new THREE.BufferAttribute(this.sAt, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", this.posAttr);
    g.setAttribute("aS", this.sAttr);
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    this.acrossAttr = new THREE.BufferAttribute(this.across, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aAcross", this.acrossAttr);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    const s = attribute("aS", "float"), sd = attribute("aSide", "float"), ac = attribute("aAcross", "vec2");
    // the points lie on the road's centre line; it is widened here, much wider when revealed from
    // the eagle's height (at 0.28 m it would be under a pixel from 90 m up)
    const halfW = mix(float(0.14), float(1.0), this.reveal);
    m.positionNode = T.positionLocal.add(vec3(ac.x, 0, ac.y).mul(sd.mul(halfW)));
    const behind = this.head.sub(s);
    // the whole road at once when revealed from on high (no fading with distance then)
    const fade = float(1).sub(smoothstep(320, 640, behind)).mul(smoothstep(0.4, 2.2, behind)).max(this.reveal);
    const across = float(1).sub(sd.mul(sd)).max(0);
    const soft = pow(across, 1.6);
    // a slow brightness travelling along the thread toward you
    const flow = sin(s.mul(0.5).sub(t.mul(1.1))).mul(0.25).add(0.75);
    m.colorNode = vec4(vec3(1, 0.78, 0.42).mul(soft).mul(flow).mul(fade).mul(float(0.16).add(this.reveal.mul(0.2))), 1);
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.pts = new Float32Array(cap * 2);
    ours.push(g, m);
  }
  /** The wanderer stands at (x, y, z): every `step` metres walked lays a new stretch. Returns
      true when one was laid. */
  walk(x: number, y: number, z: number): boolean {
    if (!this.hasLast) {
      this.hasLast = true;
      (this.lx = x), (this.ly = y), (this.lz = z);
      return false;
    }
    const dx = x - this.lx, dz = z - this.lz, d = Math.hypot(dx, dz);
    if (d < this.step) return false;
    if (d > 6) {
      // a leap (the map set you down elsewhere): the thread begins again there
      (this.lx = x), (this.ly = y), (this.lz = z);
      return false;
    }
    const ux = -dz / d, uz = dx / d;
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    const s0 = this.length, s1 = this.length + d;
    const p = this.pos, o = i * 12;
    p[o] = p[o + 3] = this.lx; p[o + 1] = p[o + 4] = this.ly; p[o + 2] = p[o + 5] = this.lz;
    p[o + 6] = p[o + 9] = x; p[o + 7] = p[o + 10] = y; p[o + 8] = p[o + 11] = z;
    for (let v = 0; v < 4; v++) (this.across[i * 8 + v * 2] = ux), (this.across[i * 8 + v * 2 + 1] = uz);
    this.acrossAttr.needsUpdate = true;
    this.sAt[i * 4] = this.sAt[i * 4 + 1] = s0;
    this.sAt[i * 4 + 2] = this.sAt[i * 4 + 3] = s1;
    this.posAttr.needsUpdate = true;
    this.sAttr.needsUpdate = true;
    this.length = s1;
    this.head.value = s1;
    this.pts[i * 2] = x;
    this.pts[i * 2 + 1] = z;
    this.ptsCount = Math.min(this.cap, this.ptsCount + 1);
    this.version++;
    (this.lx = x), (this.ly = y), (this.lz = z);
    return true;
  }
  /** Each point walked (x, z) in order, oldest first, for the map. */
  forEachPoint(f: (x: number, z: number, first: boolean) => void): void {
    const n = this.ptsCount, start = n < this.cap ? 0 : this.next;
    let px = 0, pz = 0;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % this.cap, x = this.pts[i * 2], z = this.pts[i * 2 + 1];
      f(x, z, k === 0 || Math.hypot(x - px, z - pz) > 6);
      (px = x), (pz = z);
    }
  }
}

/* ---------------------------------------------------------------- the reach */
/** At every crossing of three or more ways, a slow gold breath on the floor: a fine ring, each
    breathing on its own time, near only (it fades by ~20 m and into the veil). */
export function forkRings(at: { x: number; y: number; z: number }[], t: N, ours: { dispose(): void }[]): THREE.Mesh | null {
  if (!at.length) return null;
  const segs = 28, pairs: number[] = [];
  for (const p of at)
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * TAU, a1 = ((s + 1) / segs) * TAU, r = 0.85;
      pairs.push(p.x + Math.sin(a0) * r, p.y, p.z + Math.cos(a0) * r, p.x + Math.sin(a1) * r, p.y, p.z + Math.cos(a1) * r);
    }
  const geo = ribbonGeometry(pairs);
  const ph = new Float32Array(at.length * segs * 4);
  at.forEach((p, n) => ph.fill(((Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1 + 1) % 1, n * segs * 4, (n + 1) * segs * 4));
  geo.setAttribute("aPh", new THREE.BufferAttribute(ph, 1));
  const P = attribute("aPh", "float");
  const breath = pow(sin(t.mul(0.42).add(P.mul(TAU))).mul(0.5).add(0.5), 2);
  const dist = T.length(T.cameraPosition.sub(T.positionWorld));
  const near = float(1).sub(smoothstep(9, 22, dist)).mul(smoothstep(0.8, 2.5, dist));
  const m = keepAlpha(ribbonMaterial(vec3(1, 0.8, 0.45).mul(breath.mul(0.5).add(0.12)).mul(near).mul(0.55), 1.0));
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  ours.push(geo, m);
  return mesh;
}
