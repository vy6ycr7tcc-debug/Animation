/* In flight the wanderer becomes a flame (Samuel: "it becomes a flame instead of the body, and
   just use physics for that to look natural"), as in the water it becomes an orb.
   - A small steady core of warm light where the heart would be.
   - Around and behind it, tongues of flame: particles born at the core that rise on their own
     heat (buoyancy), are held back by the air (drag), stirred by a little turbulence, and keep a
     little of the flier's motion, so they stream out behind as it goes and lick upward as it
     hovers. Each cools as it lives, from white-gold to gold to a rose ember, and shrinks away.
   Contained, as every glow here: only the core is bright enough to bloom. */
import * as THREE from "three/webgpu";
import { softPoints, spriteCloud, T, viewDepth, type SpriteCloud } from "../gpu/tsl";

const { clamp, exp, float, length, max, mix, pointUV, smoothstep, uniform, vec3, vec4 } = T;

const N = 220;

function coreTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,248,230,1)");
  grd.addColorStop(0.25, "rgba(255,214,150,0.55)");
  grd.addColorStop(1, "rgba(255,170,90,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Flame {
  points: THREE.Sprite;
  core: THREE.Sprite;
  private cloud: SpriteCloud;
  private pos: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private vel = new Float32Array(N * 3);
  private rate = new Float32Array(N); // how fast each one burns out
  private next = 0;
  private owed = 0;
  private last = new THREE.Vector3();
  private has = false;
  private uDpr = uniform(1);

  constructor() {
    const mat = softPoints();
    this.cloud = spriteCloud(N, { position: 3, aLife: 1, aSize: 1 }, mat);
    const { position, aLife, aSize } = this.cloud.nodes;
    this.pos = this.cloud.attrs.position.array as Float32Array;
    this.life = this.cloud.attrs.aLife.array as Float32Array;
    this.size = this.cloud.attrs.aSize.array as Float32Array;
    // metres to screen points (a phone's view at 58°), never below a pixel
    mat.sizeNode = clamp(aSize.mul(760).div(max(viewDepth(position), 0.5)), float(1).div(this.uDpr), 90);
    const r = length(pointUV.sub(0.5)).mul(2);
    const soft = exp(r.mul(r).mul(-4.5)).mul(smoothstep(1, 0.6, r));
    // it cools as it lives: white-gold, gold, a rose ember
    const hot = vec3(1.0, 0.9, 0.7), gold = vec3(1.0, 0.62, 0.28), ember = vec3(0.8, 0.3, 0.3);
    const col = mix(mix(ember, gold, smoothstep(0.1, 0.5, aLife)), hot, smoothstep(0.55, 0.95, aLife));
    mat.colorNode = vec4(col.mul(soft).mul(aLife.mul(aLife)).mul(0.32), 1);
    this.points = this.cloud.sprite;
    this.points.frustumCulled = false;
    this.cloud.setCount(N);
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: coreTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    this.core.scale.setScalar(0.001);
  }

  /** Each frame: `at` is where the heart would be, `k` how much of the wanderer is flame (0–1). */
  update(dt: number, at: THREE.Vector3, k: number, t: number, dpr: number, reduced: boolean): void {
    this.uDpr.value = dpr;
    // the flier's own motion, which the young flames keep a little of
    const vx = this.has ? (at.x - this.last.x) / Math.max(dt, 1e-3) : 0;
    const vy = this.has ? (at.y - this.last.y) / Math.max(dt, 1e-3) : 0;
    const vz = this.has ? (at.z - this.last.z) / Math.max(dt, 1e-3) : 0;
    const jump = Math.hypot(vx, vy, vz) > 80; // a journey on the map, not a flight
    this.last.copy(at);
    this.has = true;
    // born at the core, more of them the more it is flame
    this.owed += dt * 110 * k;
    while (this.owed >= 1 && !jump) {
      this.owed -= 1;
      const i = this.next;
      this.next = (this.next + 1) % N;
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.1;
      this.pos.set([at.x + Math.cos(a) * rr, at.y - 0.05 + Math.random() * 0.1, at.z + Math.sin(a) * rr], i * 3);
      this.vel.set([vx * 0.25 + (Math.random() - 0.5) * 0.6, vy * 0.25 + 0.5 + Math.random() * 0.4, vz * 0.25 + (Math.random() - 0.5) * 0.6], i * 3);
      this.life[i] = 1;
      this.rate[i] = 1 / (0.28 + Math.random() * 0.3);
      this.size[i] = 0.15 + Math.random() * 0.12;
    }
    if (jump) this.owed = 0;
    const drag = Math.exp(-2.6 * dt), turb = reduced ? 0.4 : 1.3;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3;
      this.life[i] = Math.max(0, this.life[i] - dt * this.rate[i]);
      // heat lifts it, the air holds it back, eddies stir it
      this.vel[j] = (this.vel[j] + Math.sin(t * 7.1 + i * 1.3) * turb * dt) * drag;
      this.vel[j + 1] = (this.vel[j + 1] + 2.4 * dt) * drag;
      this.vel[j + 2] = (this.vel[j + 2] + Math.cos(t * 6.3 + i * 1.7) * turb * dt) * drag;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] *= Math.exp(-0.9 * dt); // and it shrinks away as it cools
    }
    const A = this.cloud.attrs;
    A.position.needsUpdate = A.aLife.needsUpdate = A.aSize.needsUpdate = true;
    this.points.visible = k > 0.01 || this.life.some((l) => l > 0);
    // the steady heart of it, breathing a little
    this.core.position.copy(at);
    this.core.scale.setScalar(Math.max(0.001, k * (0.3 + (reduced ? 0 : Math.sin(t * 9) * 0.02))));
    this.core.material.opacity = k * 0.6;
  }
}
