/* Genesis: a long press on the wanderer's heart (Samuel: "the whole world becomes pitch black and
   then out of the character you start to see lines connecting whole creation slowly, and then
   creation rebuilds itself… a 30 second sort of animation"; then, of beams of light fanning out:
   "awful… it should be like thin geometric shapes bursting out, following the backend geometric
   shapes of the visuals").
   - 0–3 s: the world goes dark, all but a small light at the heart.
   - 1–15 s: thin geometric shapes burst out of the heart one after another (circles, triangles,
     hexagons, the hexagram, the seed of life, the Platonic solids), growing outward and fading.
   - 3–17 s: the world's own geometry, the triangles every form is built of, lights up as fine
     lines in a wave travelling out from the heart: the land, the trees and stones, the crystals,
     the homes, the planets.
   - 18–30 s: creation comes back out of the dark over its lines, nearest first (the air thins
     from the heart outward), then the sky; the lines fade into it. */
import * as THREE from "three/webgpu";
import { softPoints, spriteCloud } from "../gpu/tsl";
import { fbm } from "./terrain";
import { etchedStone } from "./etching";
import { HEART_PERIOD, HEART_START } from "../core/audio";
import { T } from "../gpu/tsl";

const { exp, length, float, normalLocal, smoothstep, uniform, vec3, vec4 } = T;

export const GENESIS_S = 30;

/** How much of the world shows at time `t` of the sequence: veil (the black over everything),
    air (0 = the world's own fog, 1 = thick black air), sky (0 = black, 1 = its own). */
export interface GenesisState {
  veil: number;
  air: number;
  sky: number;
  /** Hide the fog-less lights (lanterns, planets, gliders): they would show through the black air. */
  lightsHidden: boolean;
  /** How far the camera draws back and up to take in the web. */
  lift: number;
}

/** A group of forms whose geometry is drawn in the wave, and the colour of its lines. */
export interface GenesisLayer {
  root: THREE.Object3D;
  color: THREE.Color;
}

// We keep GenesisLayer for compatibility, but genesis no longer loops over them.
const TAU = Math.PI * 2;

/** Unit shapes as segment pairs, flat in the x–z plane (or solids' edges). */
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
const SHAPES: { pairs: number[]; flat: boolean }[] = [
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
const HUES = [new THREE.Color(1.0, 0.8, 0.45), new THREE.Color(0.6, 0.78, 1.0), new THREE.Color(1.0, 0.62, 0.7)];

interface Burst {
  mesh: THREE.Sprite;
  k: ReturnType<typeof uniform>;
  at: number;
  life: number;
  reach: number;
  spin: THREE.Vector3;
  flat: boolean;
}

export class Genesis {
  group = new THREE.Group();
  active = false;
  t = 0;
  private veil: THREE.Mesh;
  private heart: THREE.Mesh;
  private uVeil = uniform(0);
  private uHeart = uniform(0);
  // the wave through the world's geometry
  private uCentre = uniform(new THREE.Vector3());
  private uFront = uniform(0);
  private uWire = uniform(0);
  private bursts: Burst[] = [];
  private centre = new THREE.Vector3();
  private rocks!: THREE.InstancedMesh;

  private buildRocks(): void {
    const mat = etchedStone("#282338", "#d8b8ff", 1.7);
    mat.flatShading = true;
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      const d = 0.72 + fbm(n.x * 1.6 + 0.3, n.z * 1.6 + n.y * 1.3 - 0.3) * 0.55;
      v.copy(n).multiplyScalar(d);
      p.setXYZ(i, v.x, v.y * 0.6, v.z);
    }
    g.computeVertexNormals();
    this.rocks = new THREE.InstancedMesh(g, mat, 12);
    this.rocks.castShadow = true;
    this.rocks.receiveShadow = true;
    this.rocks.visible = false;
    this.group.add(this.rocks);
  }

  constructor() {
    // the veil: a sphere around the camera, drawn over everything but the lines and the heart
    const vm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false });
    vm.colorNode = vec4(0, 0, 0, this.uVeil.mul(smoothstep(-0.2, 0.4, normalLocal.y)));
    this.veil = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 12), vm);
    this.veil.renderOrder = 9000;
    this.veil.frustumCulled = false;

    // the heart: a small warm light, soft at the edge (a quad turned to the camera)
    const hm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const r = length(T.uv().sub(0.5)).mul(2);
    const core = exp(r.mul(r).mul(-26)).mul(1.2).add(exp(r.mul(-5)).mul(0.3)).mul(smoothstep(1, 0.6, r));
    hm.colorNode = vec4(vec3(1.0, 0.86, 0.62).mul(core).mul(this.uHeart), 1);
    this.heart = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), hm);
    this.heart.renderOrder = 9003;
    this.heart.frustumCulled = false;

    // the bursts: each shape once or twice, in turn, alternating gold, pale blue and rose
    for (let i = 0; i < 18; i++) {
      const s = SHAPES[i % SHAPES.length];
      const k = uniform(0);
      const c = HUES[i % HUES.length];
      
      const pts: number[] = [];
      const density = s.flat ? 100 : 250;
      for (let j = 0; j < s.pairs.length; j += 6) {
        const x1 = s.pairs[j], y1 = s.pairs[j+1], z1 = s.pairs[j+2];
        const x2 = s.pairs[j+3], y2 = s.pairs[j+4], z2 = s.pairs[j+5];
        const len = Math.hypot(x2-x1, y2-y1, z2-z1);
        const count = Math.ceil(len * density);
        for (let pt = 0; pt < count; pt++) {
          const t = pt / count;
          // slight drift/scatter
          const rx = (Math.random() - 0.5) * 0.04;
          const ry = (Math.random() - 0.5) * 0.04;
          const rz = (Math.random() - 0.5) * 0.04;
          pts.push(x1 + (x2 - x1) * t + rx, y1 + (y2 - y1) * t + ry, z1 + (z2 - z1) * t + rz);
        }
      }
      
      const mat = softPoints();
      mat.sizeAttenuation = true;
      mat.colorNode = vec4(vec3(c.r, c.g, c.b).mul(k), 1);
      mat.opacityNode = T.materialOpacity.mul(smoothstep(0.5, 0.1, length(T.pointUV.sub(0.5))));
      mat.sizeNode = float(0.18);
      
      const cloud = spriteCloud(pts.length / 3, { position: 3 }, mat);
      (cloud.attrs.position.array as Float32Array).set(pts);
      const mesh = cloud.sprite;
      mesh.renderOrder = 9002;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.bursts.push({
        mesh, k, flat: s.flat,
        at: 1 + i * 0.78,
        life: 5 + (i % 3),
        reach: s.flat ? 60 + (i % 4) * 45 : 14 + (i % 3) * 10,
        spin: new THREE.Vector3(((i * 0.37) % 1) - 0.5, (i % 2 ? 1 : -1) * (0.3 + ((i * 0.61) % 1) * 0.4), ((i * 0.73) % 1) - 0.5),
      });
      this.group.add(mesh);
    }

    this.group.add(this.veil, this.heart);
    this.buildRocks();
    this.group.visible = false;
  }



  /** Begin: `heart` is where the light leaves the wanderer; `layers` the forms drawn in lines. */
  start(heart: THREE.Vector3, _layers: GenesisLayer[]): void {
    this.t = 0;
    this.active = true;
    this.group.visible = true;
    this.heart.position.copy(heart);
    this.centre.copy(heart);
    this.uCentre.value.copy(heart);

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 8 + Math.random() * 8;
      p.set(heart.x + Math.cos(a) * r, heart.y + Math.random() * 2, heart.z + Math.sin(a) * r);
      q.random();
      const scale = 1.0 + Math.random() * 1.5;
      s.set(scale, scale, scale);
      m.compose(p, q, s);
      this.rocks.setMatrixAt(i, m);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    this.rocks.visible = true;
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
    const ss = (a: number, b: number, x: number) => {
      const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    const dark = ss(0, 3, t);
    const veil = dark * (1 - ss(18, 21, t));
    this.uVeil.value = veil;
    // the heart beats (lub-dub), in time with the heartbeat in the music (audio.ts genesisScore),
    // and after the turn it settles into a slow glow
    const ph = t - HEART_START, beating = ph >= 0 && t < 17;
    const m = ((ph % HEART_PERIOD) + HEART_PERIOD) % HEART_PERIOD;
    const beat = beating ? Math.exp(-m * 16) + 0.6 * Math.exp(-Math.max(0, m - 0.26) * 16) * (m > 0.26 ? 1 : 0) : 0;
    const calmK = ss(12, 17, t);
    this.uHeart.value = ss(0.5, 2.5, t) * (1 - ss(22, 28, t)) * (0.62 + 0.5 * beat * (1 - calmK) + calmK * (0.3 + 0.08 * Math.sin(t * 2.2)));
    // the wave: slow near the heart, then faster, out to ~700 m by 17 s
    const u = Math.min(1, Math.max(0, (t - 3) / 14));
    this.uFront.value = 3 + 700 * Math.pow(u, 1.8);
    this.uWire.value = ss(2.5, 4, t) * (1 - ss(20, 27, t));
    const rockScale = ss(3, 17, t) * (1 - ss(18, 28, t));
    this.rocks.scale.setScalar(rockScale);
    // the bursts grow out of the heart and fade as they go
    const spin = reduced ? 0.3 : 1;
    for (const b of this.bursts) {
      const v = (t - b.at) / b.life;
      b.mesh.visible = v > 0 && v < 1;
      if (!b.mesh.visible) continue;
      const grow = 0.4 + b.reach * Math.pow(v, 1.4);
      b.mesh.position.copy(this.centre);
      b.mesh.scale.setScalar(grow);
      if (b.flat) b.mesh.rotation.set(b.spin.x * 0.25, b.spin.y * v * 2 * spin, b.spin.z * 0.25);
      else b.mesh.rotation.set(b.spin.x * v * 1.5 * spin, b.spin.y * v * 1.5 * spin, b.spin.z * v * 1.5 * spin);
      b.k.value = Math.sin(Math.PI * Math.min(1, v * 1.6)) ** 0.6 * (1 - v) * 1.1;
    }
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
