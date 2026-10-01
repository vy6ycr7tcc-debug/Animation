/* The Duat's three moments animated (the owner: "animate key moments, beat-timed: the solar
   boat's journey, Apophis coiled about the sun, the heart weighed against Ma'at's feather").
   Each runs on its hour's own clock (duat.ts: it runs only while you are with it and starts again
   when you come back), so every beat lands in the same order for whoever arrives.
   - The barque: the sun's boat of thin gold light sails the dark river through all the hours,
     slowing as it passes each gate, its sun-disc glowing over the cabin.
   - Apophis: a serpent of dark scales rises from the sand, wraps itself round the sun in coils
     that tighten as the sun dims, rears its head; a blade of light cuts it, its halves fall away
     into the sand, and the sun burns free.
   - The weighing: a balance of gold; the heart comes down onto one pan and the beam tips, swings,
     and settles level against Ma'at's feather; a ring of light; the heart rises away as light.
   Only place names are ever spoken in the Duat: these tell themselves in light. */
import * as THREE from "three/webgpu";
import { ribbonGeometry, ribbonMaterial } from "../gpu/ribbons";
import { T } from "../gpu/tsl";

const { exp, mix, smoothstep, uniform, uv, vec3, vec4 } = T;
const V = THREE.Vector3;
const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A soft round glow (additive sprite) of `color`, brightness from `k` (a uniform). */
function glow(color: THREE.Color, k: ReturnType<typeof uniform>, size: number): THREE.Sprite {
  const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const r = T.length(uv().sub(0.5)).mul(2);
  m.colorNode = vec4(vec3(color.r, color.g, color.b).mul(exp(r.mul(r).mul(-4.5)).mul(smoothstep(1, 0.6, r))).mul(k), 1);
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

/** What an hour's story is (duat.ts): its group, and each frame its clock. */
export interface HourScene {
  group: THREE.Group;
  /** Seconds one telling takes before it begins again. */
  readonly cycle: number;
  update(dt: number, clock: number, telling: boolean, near: boolean, reduced: boolean): void;
}

/* ---------------------------------------------------------------- the barque */
export class Barque {
  group = new THREE.Group();
  private s = 0;
  private uK = uniform(1);
  private boat = new THREE.Group();
  private tmp = new V();
  private tan = new V();

  constructor(private curve: THREE.Curve<THREE.Vector3>, private stops: THREE.Vector3[], private floor: (x: number, z: number) => number) {
    const seg: number[] = [];
    const line = (pts: [number, number, number][]) => {
      for (let k = 0; k < pts.length - 1; k++) seg.push(...pts[k], ...pts[k + 1]);
    };
    const L = 1.7;
    // the hull, each side: the rim curving up into tall ends, the keel below
    for (const sx of [-1, 1]) {
      const rim: [number, number, number][] = [], keel: [number, number, number][] = [];
      for (let i = 0; i <= 24; i++) {
        const z = -L + (2 * L * i) / 24, q = z / L;
        const w = 0.34 * (1 - q * q);
        rim.push([sx * w, 0.32 + 0.95 * Math.pow(Math.abs(q), 6), z]);
        keel.push([sx * w * 0.6, 0.02 + 0.5 * Math.pow(Math.abs(q), 4), z]);
      }
      line(rim);
      line(keel);
    }
    // the prow and stern curl over like papyrus umbels
    for (const sz of [-1, 1]) line(Array.from({ length: 14 }, (_, i) => {
      const a = (i / 13) * Math.PI * 1.3;
      return [0, 1.27 + Math.sin(a) * 0.16, sz * (L + 0.02 - (1 - Math.cos(a)) * 0.16)] as [number, number, number];
    }));
    // the cabin (a shrine on the deck)
    for (const [x0, x1] of [[-0.18, 0.18]] as const) {
      line([[x0, 0.3, -0.35], [x0, 0.78, -0.35], [x1, 0.78, -0.35], [x1, 0.3, -0.35]]);
      line([[x0, 0.3, 0.25], [x0, 0.78, 0.25], [x1, 0.78, 0.25], [x1, 0.3, 0.25]]);
      line([[x0, 0.78, -0.35], [x0, 0.78, 0.25]]);
      line([[x1, 0.78, -0.35], [x1, 0.78, 0.25]]);
    }
    // the sun-disc over it, in two rings so it reads from every side
    for (const plane of [0, 1]) line(Array.from({ length: 33 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2, r = 0.3;
      return (plane ? [Math.cos(a) * r, 1.25 + Math.sin(a) * r, -0.05] : [0, 1.25 + Math.sin(a) * r, -0.05 + Math.cos(a) * r]) as [number, number, number];
    }));
    const gold = ribbonMaterial(vec3(1.0, 0.8, 0.45).mul(this.uK), 0.7);
    const lines = new THREE.Mesh(ribbonGeometry(seg), gold);
    lines.frustumCulled = false;
    const sunGlow = glow(new THREE.Color(1.0, 0.7, 0.35), this.uK, 1.6);
    sunGlow.position.set(0, 1.25, -0.05);
    const water = glow(new THREE.Color(0.9, 0.6, 0.3), this.uK, 1.8);
    water.position.set(0, 0.05, 0);
    water.scale.set(3.6, 0.5, 1);
    this.boat.add(lines, sunGlow, water);
    this.group.add(this.boat);
  }

  /** Put it at `f` (0..1) of its way (still frames). */
  seek(f: number): void {
    this.s = ((f % 1) + 1) % 1;
  }
  /** Sails on: slower as it passes each hour, round again from the first hour when it reaches the last. */
  update(dt: number, t: number): void {
    const p = this.curve.getPointAt(this.s, this.tmp);
    let near = Infinity;
    for (const q of this.stops) near = Math.min(near, Math.hypot(p.x - q.x, p.z - q.z));
    const v = 1.5 * (0.3 + 0.7 * sm(2, 12, near));
    this.s += (dt * v) / this.curve.getLength();
    if (this.s >= 1) this.s = 0;
    this.curve.getTangentAt(this.s, this.tan);
    this.boat.position.set(p.x, this.floor(p.x, p.z) + 0.08 + Math.sin(t * 1.3) * 0.04, p.z);
    this.boat.rotation.set(Math.sin(t * 0.9) * 0.03, Math.atan2(this.tan.x, this.tan.z), Math.sin(t * 1.1) * 0.04);
    // it fades in from the first hour and out at the last, so the loop never jumps
    this.uK.value = sm(0, 0.04, this.s) * (1 - sm(0.95, 1, this.s)) * (0.9 + 0.1 * Math.sin(t * 0.7));
  }
}

/* ---------------------------------------------------------------- Apophis */
const AP_N = 180, AP_R = 10;
export class ApophisScene implements HourScene {
  group = new THREE.Group();
  readonly cycle = 30;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private uSun = uniform(1);
  private uBlade = uniform(0);
  private uGlow = uniform(0.6);
  private sun: THREE.Mesh;
  private sunGlow: THREE.Sprite;
  private head: THREE.Mesh;
  private eyes: THREE.Sprite[] = [];
  private pts = Array.from({ length: AP_N }, () => new V());
  private scale = new Float32Array(AP_N);

  constructor(at: THREE.Vector3, face: number) {
    this.group.position.copy(at);
    this.group.rotation.y = face;
    // the body: a tube rebuilt from its centreline each frame (only while you are near)
    this.pos = new Float32Array(AP_N * AP_R * 3);
    const uvs = new Float32Array(AP_N * AP_R * 2), idx: number[] = [];
    for (let i = 0; i < AP_N; i++)
      for (let j = 0; j < AP_R; j++) {
        uvs.set([i / (AP_N - 1), j / AP_R], (i * AP_R + j) * 2);
        if (i < AP_N - 1) {
          const a = i * AP_R + j, b = i * AP_R + ((j + 1) % AP_R), c = a + AP_R, d = b + AP_R;
          idx.push(a, c, b, b, c, d);
        }
      }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    this.geo.setIndex(idx);
    // dark scales, a faint ember light running in bands along it, paler underneath
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide });
    const q = uv();
    // scales as a soft lattice (smooth, so they never alias into a checker at a distance)
    const sa = T.sin(q.x.mul(Math.PI * 2 * 70).add(q.y.mul(Math.PI * 2 * 3))), sb = T.sin(q.x.mul(Math.PI * 2 * 70).sub(q.y.mul(Math.PI * 2 * 3)));
    const scale = sa.mul(sb).mul(0.5).add(0.5).mul(T.smoothstep(0, 1, T.fwidth(q.x).mul(-300).add(1)));
    const band = T.pow(T.sin(q.x.mul(48)).mul(0.5).add(0.5), 8);
    m.colorNode = vec4(mix(vec3(0.025, 0.022, 0.03), vec3(0.075, 0.05, 0.045), scale), 1);
    m.emissiveNode = vec3(1.0, 0.3, 0.08).mul(band.mul(this.uGlow).mul(0.22));
    const body = new THREE.Mesh(this.geo, m);
    body.frustumCulled = false;
    body.castShadow = true;
    // the head, the eyes
    this.head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 10).rotateX(Math.PI / 2), m);
    for (let k = 0; k < 2; k++) {
      const e = glow(new THREE.Color(1.0, 0.35, 0.1), this.uGlow, 0.22);
      this.eyes.push(e);
      this.group.add(e);
    }
    // the sun it would swallow
    const sunM = new THREE.MeshBasicNodeMaterial({ fog: false });
    const n = T.normalView;
    sunM.colorNode = vec4(mix(vec3(1.0, 0.5, 0.18), vec3(1.0, 0.86, 0.55), T.pow(n.z.abs(), 1.5)).mul(this.uSun), 1);
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(1.05, 32, 18), sunM);
    this.sunGlow = glow(new THREE.Color(1.0, 0.62, 0.28), this.uSun, 5.5);
    // the blade of light that cuts it
    const bm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const bu = uv();
    bm.colorNode = vec4(vec3(1.0, 0.95, 0.85).mul(T.smoothstep(0.5, 0.0, T.abs(bu.x.sub(0.5))).pow(4).mul(T.smoothstep(0, 0.2, bu.y)).mul(T.smoothstep(1, 0.8, bu.y)).mul(this.uBlade).mul(1.6)), 1);
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 9), bm);
    blade.position.set(0, 3.2, 0.2);
    blade.rotation.z = 0.35;
    this.group.add(body, this.head, this.sun, this.sunGlow, blade);
    this.group.visible = false;
  }

  /** The centreline at cycle time `tau`, tail (u = 0) to head (u = 1), and each ring's thickness. */
  private shape(tau: number): void {
    const C = new V(0, 3.0, 0);
    const emerge = sm(0, 3.2, tau), wrap = sm(2.6, 9.5, tau);
    const squeeze = tau > 9.5 && tau < 16 ? Math.sin((tau - 9.5) * 2.2) * 0.12 * sm(9.5, 11, tau) : 0;
    const rear = sm(10, 13, tau) * (1 - sm(16, 16.4, tau));
    const cut = tau >= 16.2, fall = sm(16.4, 23, tau), gone = sm(27, 29.5, tau);
    for (let i = 0; i < AP_N; i++) {
      const u = i / (AP_N - 1);
      // on the sand behind the sun, snaking
      const gx = (u - 0.5) * 10, gz = -2.8 + Math.sin(u * 7 + tau * 0.7) * 1.1, gy = 0.3;
      // in coils round the sun, the head over it
      const a = u * 2.6 * Math.PI * 2 + tau * 0.12;
      const r = 2.7 - 1.3 * wrap + squeeze;
      let hx = Math.cos(a) * r, hy = C.y + (u - 0.55) * 2.8, hz = Math.sin(a) * r;
      const top = sm(0.9, 1, u) * rear;
      hy += top * 1.8;
      hx *= 1 - top * 0.6;
      hz = hz * (1 - top * 0.6) + top * 0.9;
      // the head wraps first, the tail last
      const wu = sm(0, 1, Math.min(1, Math.max(0, wrap * 1.6 - (1 - u) * 0.6)));
      const p = this.pts[i].set(gx + (hx - gx) * wu, gy + (hy - gy) * wu, gz + (hz - gz) * wu);
      let th = 0.3 * (0.3 + 0.7 * Math.sqrt(Math.sin(Math.PI * Math.min(1, u * 1.1)))) + (u > 0.97 ? 0.05 : 0);
      // still under the sand
      if (u < 1 - emerge) {
        th = 0;
        p.y = -0.6;
      }
      if (cut) {
        // the halves fall apart and sink into the sand
        const side = u < 0.5 ? -1 : 1;
        p.x += side * 2.4 * fall;
        p.z += 0.8 * fall;
        p.y -= 4.5 * fall * fall;
        th *= Math.min(1, Math.abs(u - 0.5) / 0.03) * (1 - fall * 0.5);
      }
      this.scale[i] = th * (1 - gone);
    }
  }

  update(dt: number, clock: number, telling: boolean, near: boolean, _reduced: boolean): void {
    this.group.visible = near;
    if (!near) return;
    const tau = clock % this.cycle;
    this.shape(tau);
    // the tube about its centreline
    const tg = new V(), nn = new V(), bn = new V(), up = new V(0, 1, 0);
    for (let i = 0; i < AP_N; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(AP_N - 1, i + 1)];
      tg.subVectors(b, a).normalize();
      nn.crossVectors(tg, Math.abs(tg.y) > 0.95 ? new V(1, 0, 0) : up).normalize();
      bn.crossVectors(nn, tg);
      const c = this.pts[i], th = this.scale[i];
      for (let j = 0; j < AP_R; j++) {
        const ang = (j / AP_R) * Math.PI * 2;
        const o = (i * AP_R + j) * 3;
        this.pos[o] = c.x + (nn.x * Math.cos(ang) + bn.x * Math.sin(ang)) * th;
        this.pos[o + 1] = c.y + (nn.y * Math.cos(ang) + bn.y * Math.sin(ang)) * th;
        this.pos[o + 2] = c.z + (nn.z * Math.cos(ang) + bn.z * Math.sin(ang)) * th;
      }
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    // the head at the end, looking along the body
    const h = this.pts[AP_N - 1], hb = this.pts[AP_N - 4];
    this.head.position.copy(h);
    this.head.lookAt(tg.subVectors(h, hb).add(h).applyMatrix4(this.group.matrixWorld));
    this.head.scale.setScalar(this.scale[AP_N - 6] > 0.01 ? 1 : 0.001);
    const side = new V(0.16, 0.12, 0.3).applyQuaternion(this.head.quaternion);
    this.eyes[0].position.copy(h).add(side);
    this.eyes[1].position.copy(h).add(side.set(-0.16, 0.12, 0.3).applyQuaternion(this.head.quaternion));
    for (const e of this.eyes) e.visible = this.scale[AP_N - 6] > 0.01;
    // the sun dims as the coils close, flares at the cut, burns free after
    const wrap = sm(2.6, 9.5, tau), free = sm(17, 23, tau);
    this.uSun.value = (1 - 0.6 * wrap * (1 - free)) * (1 + 0.35 * free) * (1 - sm(28.5, 30, tau) * 0.5);
    this.sun.position.set(0, 3.0 + free * 0.7, 0);
    this.sunGlow.position.copy(this.sun.position);
    this.uBlade.value = sm(15.6, 16.2, tau) * (1 - sm(16.3, 17.4, tau));
    this.uGlow.value = 0.45 + 0.35 * sm(9.5, 12, tau) * (1 - sm(16.2, 18, tau)) + (telling ? 0 : -0.2);
    void dt;
  }
}

/* ---------------------------------------------------------------- the weighing of the heart */
export class WeighingScene implements HourScene {
  group = new THREE.Group();
  readonly cycle = 36;
  private beam = new THREE.Group();
  private pans: THREE.Group[] = [];
  private heart: THREE.Group;
  private uHeart = uniform(1);
  private uRing = uniform(0);
  private uFeather = uniform(0.7);
  private uGold = uniform(0.2);
  private ring: THREE.Mesh;

  constructor(at: THREE.Vector3, face: number) {
    this.group.position.copy(at);
    this.group.rotation.y = face;
    this.group.scale.setScalar(1.4);
    const gold = new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0.5 });
    gold.colorNode = vec4(vec3(0.72, 0.48, 0.16), 1);
    gold.emissiveNode = vec3(1.0, 0.72, 0.35).mul(this.uGold);
    // the post and its foot
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 3.3, 16), gold);
    post.position.y = 1.65;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.25, 24), gold);
    foot.position.y = 0.12;
    // the beam, pivoting at the top; its ends finished in small knops
    this.beam.position.y = 3.3;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 0.07), gold);
    this.beam.add(bar);
    for (const sx of [-1, 1]) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), gold);
      k.position.x = sx * 1.8;
      this.beam.add(k);
    }
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 12), gold);
    crest.position.y = 3.52;
    // the pans, hanging level on their cords
    const dish = new THREE.LatheGeometry([[0.001, 0], [0.42, 0.04], [0.5, 0.14], [0.48, 0.15], [0.001, 0.03]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
    for (let k = 0; k < 2; k++) {
      const g = new THREE.Group();
      const d = new THREE.Mesh(dish, gold);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.4, 4), gold);
      cord.position.y = 0.72;
      g.add(d, cord);
      this.pans.push(g);
      this.group.add(g);
    }
    // the feather of Ma'at, standing on the right pan, in pale light
    const seg: number[] = [];
    const L = (a: [number, number], b: [number, number]) => seg.push(a[0], a[1], 0, b[0], b[1], 0);
    L([0, 0], [0.03, 0.42]);
    L([0.03, 0.42], [0.01, 0.8]);
    L([0.01, 0.8], [-0.07, 0.9]);
    for (let i = 1; i < 9; i++) {
      const y = i * 0.09;
      L([0.025, y], [0.15, y + 0.05]);
      L([0.025, y], [-0.09, y + 0.04]);
    }
    const feather = new THREE.Mesh(ribbonGeometry(seg), ribbonMaterial(vec3(0.85, 0.92, 1.0).mul(this.uFeather), 0.8));
    feather.frustumCulled = false;
    feather.position.y = 0.12;
    this.pans[1].add(feather);
    // the heart: a small warm light in a rose glow
    this.heart = new THREE.Group();
    const hm = new THREE.MeshBasicNodeMaterial({ fog: false });
    hm.colorNode = vec4(vec3(1.0, 0.36, 0.38).mul(this.uHeart), 1);
    const hb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 12), hm);
    hb.scale.set(1, 1.15, 0.85);
    this.heart.add(hb, glow(new THREE.Color(1.0, 0.4, 0.45), this.uHeart, 0.9));
    this.group.add(this.heart);
    // the ring of light when the beam stands level
    const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const rr = T.length(uv().sub(0.5)).mul(2);
    rm.colorNode = vec4(vec3(1.0, 0.85, 0.6).mul(exp(rr.sub(0.92).mul(rr.sub(0.92)).mul(-900)).mul(this.uRing)), 1);
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rm);
    this.ring.position.y = 3.3;
    this.group.add(post, foot, this.beam, crest, this.ring);
    this.group.visible = false;
  }

  update(_dt: number, clock: number, _telling: boolean, near: boolean, _reduced: boolean): void {
    this.group.visible = near;
    if (!near) return;
    const t = clock % this.cycle;
    // the beam: still, then tipped by the heart, swinging, settling level
    const th = t < 8 ? 0 : t < 24 ? 0.3 * Math.exp(-0.24 * (t - 8)) * Math.cos(1.5 * (t - 8)) : 0;
    this.beam.rotation.z = th * sm(8, 8.4, t);
    for (let k = 0; k < 2; k++) {
      const sx = k ? 1 : -1;
      this.pans[k].position.set(sx * 1.8 * Math.cos(this.beam.rotation.z), 3.3 + sx * 1.8 * Math.sin(this.beam.rotation.z) - 1.45, 0);
    }
    // the heart: comes down onto the left pan, rests, then rises away as light
    const down = sm(3.5, 8, t), up = sm(27, 33, t);
    const pan = this.pans[0].position;
    this.heart.position.set(pan.x, pan.y + 0.22 + (1 - down) * 3.2 + up * 4.5, pan.z);
    this.heart.scale.setScalar(1 + up * 1.6);
    this.uHeart.value = sm(3, 4.5, t) * (1 - sm(30, 33.5, t)) * (1 + 0.6 * sm(24, 26, t));
    // level: a ring of light from the fulcrum; the feather and the gold brighten
    const lv = sm(22, 24, t) * (1 - sm(28, 31, t));
    this.uRing.value = lv;
    this.ring.scale.setScalar(0.5 + sm(22, 27, t) * 6);
    (this.ring.material as THREE.Material).opacity = 1;
    this.uFeather.value = 0.6 + lv * 0.8;
    this.uGold.value = (0.06 + lv * 0.12) * sm(0, 3, t);
  }
}
