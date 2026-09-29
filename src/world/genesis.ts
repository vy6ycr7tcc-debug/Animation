/* Genesis: a long press on the wanderer's heart (Samuel: "the whole world becomes pitch black and
   then out of the character you start to see lines connecting whole creation slowly, and then
   creation rebuilds itself… a 30 second sort of animation"; of what bursts out: "thin geometric
   shapes bursting out, following the backend geometric shapes of the visuals").
   Rebuilt in the soft idiom (docs/style): nothing hard-edged, nothing hovering.
   - 0–3 s: the night deepens. The veil is not a black dome: it is a deep night blue that warms to
     an ember glow in the direction of the heart, so the dark always has depth and a centre.
   - 0.5–28 s: the heart, nested soft glows that beat with the music, then settle.
   - 1–16 s: the forms of creation leave the heart one after another (circle, triangle, hexagon,
     the hexagram, the seed of life, the Platonic solids), each a stroke of fine dust, not a line:
     easing out, turning slowly, loosening into dust as they grow, every mote twinkling on its own
     clock. Gold, pale blue and rose, in turn.
   - 20–26 s, as the dark lifts and the ground is there again: stones rise out of the earth around
     the heart (the stone idiom: displaced icosahedra, flat shaded, etched; planted at the ground's
     own height and pushing up from beneath it, shedding dust), each on its own time; before the
     end they settle back into the ground.
   - Throughout the dark: a slow drift of motes in the air around you, so the dark is a space.
   - 18–30 s: creation comes back out of the dark (main.ts thins the black air from the heart
     outward, then the sky). */
import * as THREE from "three/webgpu";
import { gpuUniforms, softPoints, spriteCloud, T, viewDepth } from "../gpu/tsl";
import { fbm, heightAt } from "./terrain";
import { etchedStone } from "./etching";
import { HEART_PERIOD, HEART_START } from "../core/audio";

const { cameraPosition, clamp, dot, exp, float, length, max, normalize, positionWorld, pow, sin, smoothstep, uniform, vec3, vec4 } = T;

export const GENESIS_S = 30;

/** How much of the world shows at time `t` of the sequence: veil (the dark over everything),
    air (0 = the world's own fog, 1 = thick dark air), sky (0 = dark, 1 = its own). */
export interface GenesisState {
  veil: number;
  air: number;
  sky: number;
  /** Hide the fog-less lights (lanterns, planets, gliders): they would show through the dark air. */
  lightsHidden: boolean;
  /** How far the camera draws back and up to take in the forms. */
  lift: number;
}

/** A group of forms (kept for main.ts's call; the sequence no longer draws their geometry). */
export interface GenesisLayer {
  root: THREE.Object3D;
  color: THREE.Color;
}

const TAU = Math.PI * 2;
/** Seeded, so every genesis is the same composition. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
const ss = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / Math.max(1e-4, b - a)));
  return k * k * (3 - 2 * k);
};
const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/* ---------------------------------------------------------------- the forms, as segments */
function polygon(n: number, r = 1, rot = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU, b = rot + ((i + 1) / n) * TAU;
    out.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r);
  }
  return out;
}
function circle(r = 1, cx = 0, cz = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU, b = ((i + 1) / 72) * TAU;
    out.push(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r, cx + Math.cos(b) * r, 0, cz + Math.sin(b) * r);
  }
  return out;
}
function solid(g: THREE.BufferGeometry): number[] {
  return Array.from(new THREE.EdgesGeometry(g).attributes.position.array as Float32Array);
}
const FORMS: { pairs: number[]; flat: boolean }[] = [
  { pairs: circle(), flat: true },
  { pairs: polygon(3, 1, -Math.PI / 2), flat: true },
  { pairs: polygon(6), flat: true },
  { pairs: solid(new THREE.OctahedronGeometry(1, 0)), flat: false },
  { pairs: [...polygon(3, 1, -Math.PI / 2), ...polygon(3, 1, Math.PI / 2)], flat: true }, // the hexagram
  // the seed of life: a circle ringed by six, each through the centre
  { pairs: [...circle(0.5), ...Array.from({ length: 6 }, (_, i) => circle(0.5, Math.cos((i / 6) * TAU) * 0.5, Math.sin((i / 6) * TAU) * 0.5)).flat()], flat: true },
  { pairs: solid(new THREE.IcosahedronGeometry(1, 0)), flat: false },
  { pairs: polygon(4, 1, Math.PI / 4), flat: true },
  { pairs: [...circle(1), ...polygon(12, 1)], flat: true },
  { pairs: solid(new THREE.DodecahedronGeometry(1, 0)), flat: false },
  { pairs: polygon(8), flat: true },
  { pairs: solid(new THREE.TetrahedronGeometry(1, 0)), flat: false },
];
// the game's canon: gold, pale blue, rose (docs/style/STYLE_GUIDE.md §1)
const HUES: [number, number, number][] = [[1.0, 0.78, 0.46], [0.66, 0.8, 1.0], [1.0, 0.66, 0.74]];

interface Burst {
  sprite: THREE.Sprite;
  k: ReturnType<typeof uniform>;
  spread: ReturnType<typeof uniform>;
  size: ReturnType<typeof uniform>;
  at: number;
  life: number;
  reach: number;
  spin: THREE.Vector3;
  flat: boolean;
}

interface Stone {
  x: number;
  z: number;
  ground: number;
  scale: number;
  sink: number;
  at: number;
  rot: THREE.Quaternion;
}

export class Genesis {
  group = new THREE.Group();
  active = false;
  t = 0;
  private veil: THREE.Mesh;
  private heart: THREE.Mesh;
  private uVeil = uniform(0);
  private uHeart = uniform(0);
  private uHeartDir = uniform(new THREE.Vector3(0, 0, -1));
  private uT = uniform(0);
  private bursts: Burst[] = [];
  private centre = new THREE.Vector3();
  private stones!: THREE.InstancedMesh;
  private stoneList: Stone[] = [];
  private stoneDust!: { sprite: THREE.Sprite; pos: Float32Array; attr: THREE.InstancedBufferAttribute; k: ReturnType<typeof uniform> };
  private air!: { sprite: THREE.Sprite; k: ReturnType<typeof uniform> };
  private m4 = new THREE.Matrix4();
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3();

  constructor() {
    // The veil: a sphere about the camera. Deep night blue, warming toward the heart; its strength
    // is one soft uniform, so it never draws an edge.
    const vm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false });
    const dir = normalize(positionWorld.sub(cameraPosition));
    const toward = max(dot(dir, this.uHeartDir), 0);
    const warm = pow(toward, 14).mul(0.3).add(pow(toward, 90).mul(0.5));
    const deep = vec3(0.004, 0.006, 0.022).add(vec3(0.008, 0.011, 0.036).mul(smoothstep(-0.3, 0.8, dir.y)));
    vm.colorNode = vec4(deep.add(vec3(0.12, 0.05, 0.022).mul(warm)), this.uVeil.mul(0.975));
    this.veil = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 24), vm);
    this.veil.renderOrder = 9000;
    this.veil.frustumCulled = false;

    // The heart: three nested soft glows (a quad turned to the camera), gold into ember.
    const hm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const r = length(T.uv().sub(0.5)).mul(2);
    const core = exp(r.mul(r).mul(-90)).mul(1.4);
    const inner = exp(r.mul(r).mul(-9)).mul(0.45);
    const outer = exp(r.mul(-3.2)).mul(0.16).mul(smoothstep(1, 0.5, r));
    const col = vec3(1.0, 0.93, 0.8).mul(core).add(vec3(1.0, 0.72, 0.42).mul(inner)).add(vec3(0.95, 0.45, 0.25).mul(outer));
    hm.colorNode = vec4(col.mul(this.uHeart), 1);
    this.heart = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), hm);
    this.heart.renderOrder = 9003;
    this.heart.frustumCulled = false;

    this.buildBursts();
    this.buildStones();
    this.buildAir();
    this.group.add(this.veil, this.heart);
    this.group.visible = false;
  }

  /** Each form as a stroke of fine dust: motes along its edges, each with its own scatter
      direction and its own twinkle. */
  private buildBursts(): void {
    const R = rng(97);
    for (let i = 0; i < 18; i++) {
      const f = FORMS[i % FORMS.length];
      const pts: number[] = [], jit: number[] = [], seed: number[] = [];
      const density = f.flat ? 160 : 260;
      for (let j = 0; j < f.pairs.length; j += 6) {
        const [x1, y1, z1, x2, y2, z2] = f.pairs.slice(j, j + 6);
        const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1, z2 - z1) * density);
        for (let q = 0; q < n; q++) {
          const u = (q + R()) / n;
          pts.push(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, z1 + (z2 - z1) * u);
          const d = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(Math.pow(R(), 0.6));
          jit.push(d.x, d.y, d.z);
          seed.push(R());
        }
      }
      const k = uniform(0), spread = uniform(0), size = uniform(0.05);
      const mat = softPoints();
      const cloud = spriteCloud(pts.length / 3, { position: 3, aJit: 3, aSeed: 1 }, mat);
      (cloud.attrs.position.array as Float32Array).set(pts);
      (cloud.attrs.aJit.array as Float32Array).set(jit);
      (cloud.attrs.aSeed.array as Float32Array).set(seed);
      const { position, aJit, aSeed } = cloud.nodes;
      // the stroke loosens into dust as the form grows
      mat.positionNode = position.add(aJit.mul(spread));
      const world = T.modelWorldMatrix.mul(vec4(mat.positionNode, 1)).xyz;
      mat.sizeNode = clamp(gpuUniforms.px.mul(size).mul(aSeed.mul(0.9).add(0.55)).div(max(viewDepth(world), 1.5)), float(1).div(gpuUniforms.dpr), 7);
      const soft = exp(length(T.pointUV.sub(0.5)).mul(length(T.pointUV.sub(0.5))).mul(-18));
      const twinkle = sin(this.uT.mul(aSeed.mul(2.2).add(0.9)).add(aSeed.mul(61))).mul(0.35).add(0.65);
      const c = HUES[i % HUES.length];
      mat.colorNode = vec4(vec3(c[0], c[1], c[2]).mul(soft).mul(twinkle).mul(k), 1);
      const sprite = cloud.sprite;
      sprite.renderOrder = 9002;
      sprite.frustumCulled = false;
      sprite.visible = false;
      this.bursts.push({
        sprite, k, spread, size, flat: f.flat,
        at: 1 + i * 0.82 + (R() - 0.5) * 0.3,
        life: 5.5 + (i % 3) * 0.8,
        reach: f.flat ? 40 + (i % 4) * 30 : 12 + (i % 3) * 8,
        spin: new THREE.Vector3(R() - 0.5, (i % 2 ? 1 : -1) * (0.25 + R() * 0.35), R() - 0.5),
      });
      this.group.add(sprite);
    }
  }

  /** Stones of the first creation: rough, flat-shaded, etched in gold, rising from the earth. */
  private buildStones(): void {
    const mat = etchedStone("#221e30", "#e9c37d", 1.4);
    mat.flatShading = true;
    // drawn after the veil (which darkens everything drawn before it), still depth-tested so the
    // ground hides what is buried
    mat.transparent = true;
    mat.depthWrite = true;
    // the dark air would swallow them into black shapes: they keep the star's light and their gold
    mat.fog = false;
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const d = 0.7 + fbm(v.x * 1.7 + 0.3, v.z * 1.7 + v.y * 1.4 - 0.3) * 0.55 + fbm(v.x * 5 + 2, v.y * 5 - v.z * 3) * 0.08;
      p.setXYZ(i, v.x * d, v.y * d * 0.72, v.z * d);
    }
    g.computeVertexNormals();
    this.stones = new THREE.InstancedMesh(g, mat, 9);
    this.stones.castShadow = true;
    this.stones.receiveShadow = true;
    this.stones.frustumCulled = false;
    this.stones.renderOrder = 9001;
    this.stones.visible = false;
    this.group.add(this.stones);
    // the dust each stone sheds as it breaks the ground
    const n = 9 * 40;
    const mat2 = softPoints();
    const cloud = spriteCloud(n, { position: 3, aSeed: 1 }, mat2);
    const seeds = new Float32Array(n);
    const R = rng(13);
    for (let i = 0; i < n; i++) seeds[i] = R();
    (cloud.attrs.aSeed.array as Float32Array).set(seeds);
    const k = uniform(0);
    const { position, aSeed } = cloud.nodes;
    mat2.sizeNode = clamp(gpuUniforms.px.mul(0.07).mul(aSeed.add(0.5)).div(max(viewDepth(position), 0.5)), float(1).div(gpuUniforms.dpr), 14);
    const soft = exp(length(T.pointUV.sub(0.5)).mul(length(T.pointUV.sub(0.5))).mul(-16));
    mat2.colorNode = vec4(vec3(0.85, 0.62, 0.4).mul(soft).mul(k).mul(0.55), 1);
    cloud.sprite.frustumCulled = false;
    cloud.sprite.renderOrder = 9001;
    this.stoneDust = { sprite: cloud.sprite, pos: cloud.attrs.position.array as Float32Array, attr: cloud.attrs.position, k };
    this.group.add(cloud.sprite);
  }

  /** Motes adrift in the dark around the heart: the dark is a space, not a void. */
  private buildAir(): void {
    const n = 700, R = rng(29);
    const mat = softPoints();
    const cloud = spriteCloud(n, { position: 3, aSeed: 1 }, mat);
    const pos = cloud.attrs.position.array as Float32Array, seed = cloud.attrs.aSeed.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(R() - 0.5, (R() - 0.3) * 0.6, R() - 0.5).normalize().multiplyScalar(2 + Math.pow(R(), 0.7) * 26);
      pos.set([d.x, d.y, d.z], i * 3);
      seed[i] = R();
    }
    const k = uniform(0);
    const { position, aSeed } = cloud.nodes;
    // each mote drifts on its own slow orbit and rises a little, never in step with the others
    const ph = aSeed.mul(TAU);
    const drift = vec3(sin(this.uT.mul(0.11).add(ph)).mul(0.6), sin(this.uT.mul(0.07).add(ph.mul(3))).mul(0.4), sin(this.uT.mul(0.09).add(ph.mul(2))).mul(0.6));
    mat.positionNode = position.add(drift);
    const world = T.modelWorldMatrix.mul(vec4(mat.positionNode, 1)).xyz;
    mat.sizeNode = clamp(gpuUniforms.px.mul(0.018).mul(aSeed.add(0.4)).div(max(viewDepth(world), 2)), float(1).div(gpuUniforms.dpr), 4);
    const soft = exp(length(T.pointUV.sub(0.5)).mul(length(T.pointUV.sub(0.5))).mul(-18));
    const tw = sin(this.uT.mul(aSeed.add(0.6)).add(aSeed.mul(40))).mul(0.4).add(0.6);
    const hue = T.mix(vec3(0.62, 0.72, 1.0), vec3(1.0, 0.78, 0.5), smoothstep(0.55, 0.95, aSeed));
    // near the lens a mote fades rather than swelling into a disc
    const nearK = smoothstep(1.5, 5, viewDepth(world));
    mat.colorNode = vec4(hue.mul(soft).mul(tw).mul(k).mul(nearK).mul(0.45), 1);
    cloud.sprite.frustumCulled = false;
    cloud.sprite.renderOrder = 9001;
    this.air = { sprite: cloud.sprite, k };
    this.group.add(cloud.sprite);
  }

  /** Begin: `heart` is where the light leaves the wanderer. */
  start(heart: THREE.Vector3, _layers: GenesisLayer[]): void {
    this.t = 0;
    this.active = true;
    this.group.visible = true;
    this.heart.position.copy(heart);
    this.centre.copy(heart);
    this.air.sprite.position.copy(heart);
    // nine stones in a loose ring, each planted where the ground is (never over water)
    const R = rng(Math.floor(heart.x * 7 + heart.z * 13) & 0xffff);
    this.stoneList = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + (R() - 0.5) * 0.5;
      const d = 6 + R() * 7;
      const x = heart.x + Math.cos(a) * d, z = heart.z + Math.sin(a) * d;
      const scale = 0.7 + R() * 1.1;
      this.stoneList.push({
        x, z, ground: heightAt(x, z), scale,
        sink: scale * (0.35 + R() * 0.2), // always partly buried
        at: 20.5 + i * 0.55 + R() * 0.5, // as creation comes back and the ground is there again
        rot: new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.5, R() * TAU, (R() - 0.5) * 0.5)),
      });
    }
    this.stones.visible = true;
  }

  stop(): void {
    this.active = false;
    this.group.visible = false;
    this.uVeil.value = 0;
  }

  /** Each frame while active; returns how much of the world shows. */
  update(dt: number, camera: THREE.PerspectiveCamera, reduced: boolean): GenesisState {
    this.t += dt;
    const t = this.t;
    this.uT.value = t;
    const dark = ss(0, 3, t);
    const veil = dark * (1 - ss(18, 21.5, t));
    this.uVeil.value = veil;
    this.uHeartDir.value.copy(this.centre).sub(camera.position).normalize();
    // the heart beats (lub-dub) in time with the music (audio.ts genesisScore), then settles
    const ph = t - HEART_START, beating = ph >= 0 && t < 17;
    const m = ((ph % HEART_PERIOD) + HEART_PERIOD) % HEART_PERIOD;
    const beat = beating ? Math.exp(-m * 12) + 0.55 * (m > 0.26 ? Math.exp(-(m - 0.26) * 12) : 0) : 0;
    const calm = ss(12, 17, t);
    this.uHeart.value = ss(0.5, 3, t) * (1 - ss(22, 28.5, t)) * (0.7 + 0.35 * beat * (1 - calm) + calm * (0.35 + 0.08 * Math.sin(t * 1.9) + 0.04 * Math.sin(t * 0.67)));
    this.air.k.value = ss(1, 5, t) * (1 - ss(19, 26, t));

    // the forms: ease out of the heart, turn, loosen into dust, fade
    const spin = reduced ? 0.3 : 1;
    for (const b of this.bursts) {
      const v = (t - b.at) / b.life;
      b.sprite.visible = v > 0 && v < 1;
      if (!b.sprite.visible) continue;
      const grow = 0.5 + b.reach * easeOut(v * 1.05);
      b.sprite.position.copy(this.centre);
      b.sprite.scale.setScalar(grow);
      const turn = easeOut(v) * spin;
      if (b.flat) b.sprite.rotation.set(b.spin.x * 0.3, b.spin.y * turn * 2.2, b.spin.z * 0.3);
      else b.sprite.rotation.set(b.spin.x * turn * 1.6, b.spin.y * turn * 1.6, b.spin.z * turn * 1.6);
      // the stroke keeps a steady width on screen as it grows, and comes apart into dust
      b.size.value = 0.05 * Math.sqrt(grow);
      b.spread.value = 0.012 + 0.09 * v * v;
      b.k.value = ss(0, 0.18, v) * (1 - ss(0.45, 1, v)) * 0.95;
    }

    // the stones rise out of the ground (eased, each in its own time) and settle back at the end
    const P = this.stoneDust.pos;
    let dustK = 0;
    this.stoneList.forEach((s, i) => {
      const up = easeOut((t - s.at) / 3.5) * (1 - ss(27.2, 29.8, t));
      const y = s.ground - s.scale * 1.1 + (s.scale * 1.1 - s.sink) * up;
      this.m4.compose(this.v3.set(s.x, y, s.z), s.rot, this.s3.setScalar(s.scale));
      this.stones.setMatrixAt(i, this.m4);
      // dust rises from where it breaks the ground while it moves
      const moving = ss(0, 0.5, t - s.at) * (1 - ss(2.5, 4.5, t - s.at)) + ss(27.2, 27.8, t) * (1 - ss(29.2, 29.9, t));
      dustK = Math.max(dustK, moving);
      for (let j = 0; j < 40; j++) {
        const q = (i * 40 + j) * 3, h = ((j * 0.618 + t * 0.12) % 1);
        const a = j * 2.4 + i, rr = s.scale * (0.7 + h * 0.8);
        P[q] = s.x + Math.cos(a) * rr;
        P[q + 1] = s.ground + h * s.scale * 1.6 * moving;
        P[q + 2] = s.z + Math.sin(a) * rr;
      }
    });
    this.stones.instanceMatrix.needsUpdate = true;
    this.stoneDust.attr.needsUpdate = true;
    this.stoneDust.k.value = dustK;

    this.veil.position.copy(camera.position);
    this.heart.quaternion.copy(camera.quaternion);
    if (t >= GENESIS_S) this.stop();
    return {
      veil,
      air: dark * (1 - ss(18, 28, t)),
      sky: 1 - dark * (1 - ss(22, 29, t)),
      lightsHidden: t > 18 && t < 24,
      lift: ss(2, 11, t) * (1 - ss(21, 29, t)),
    };
  }
}
