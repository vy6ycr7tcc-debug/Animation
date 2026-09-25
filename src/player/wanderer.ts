/* The wanderer: a body of flowing light.
   - Motion: recorded animation from Quaternius's Universal Animation Library (CC0) — idle, walk,
     jog, swim, tread water, jump, land — blended by speed and paced to the ground speed.
   - Form: the skeleton drives a fluid body (see fluidBody.ts): one continuous, seamless shape of
     light, ray-marched from smoothly blended capsules, with rising currents and a soft halo.
   - Motes flow over the body toward the heart and stream behind; ribbons trail from the hands
     and crown.
   - Sitting and reaching gestures are used at the stations. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { loadBytes } from "../core/assets";
import { FluidBody, SEGMENTS } from "./fluidBody";
import { lightBodyMaterial, tickLightBody } from "./lightBody";

export type Pose = "idle" | "walk" | "glide" | "swim" | "air" | "fly" | "hover";
export type Gesture = "none" | "sit" | "reach";

export const HEIGHT = 1.65;
const WALK_NATURAL = 1.35; // metres per second each cycle covers at timeScale 1 (after scaling)
const JOG_NATURAL = 3.2;
const SWIM_NATURAL = 2.4;

const U = {
  uT: { value: 0 },
  uForm: { value: 0 },
  uPulse: { value: 1 },
};

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,236,205,0.8)");
  grd.addColorStop(0.3, "rgba(255,215,170,0.22)");
  grd.addColorStop(1, "rgba(255,200,160,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The glTF loader strips characters like "." from node names; compare names without them. */
export const key = (name: string) => name.replace(/[\s.:/[\]]/g, "");

/* ---------- the body's segments: [from bone, to bone or offset], radii at each end ---------- */
export type End = string | [string, number];
export type Seg = { from: End; to: End; r: [number, number] };
const side = (s: "L" | "R"): Seg[] => [
  { from: "DEF-spine.003", to: `DEF-upper_arm.${s}`, r: [0.075, 0.056] },
  { from: `DEF-upper_arm.${s}`, to: `DEF-forearm.${s}`, r: [0.056, 0.044] },
  { from: `DEF-forearm.${s}`, to: `DEF-hand.${s}`, r: [0.044, 0.032] },
  { from: `DEF-hand.${s}`, to: [`DEF-hand.${s}`, 0.13], r: [0.034, 0.016] },
  { from: `DEF-thigh.${s}`, to: `DEF-shin.${s}`, r: [0.088, 0.062] },
  { from: `DEF-shin.${s}`, to: `DEF-foot.${s}`, r: [0.06, 0.04] },
  { from: `DEF-foot.${s}`, to: [`DEF-toe.${s}`, 0.06], r: [0.042, 0.028] },
];
export const SEGS: Seg[] = [
  { from: ["DEF-head", 0.075], to: ["DEF-head", 0.15], r: [0.088, 0.086] }, // the head: a soft oval
  { from: "DEF-neck", to: ["DEF-head", 0.04], r: [0.05, 0.046] },
  { from: "DEF-spine.003", to: "DEF-neck", r: [0.125, 0.07] }, // chest
  { from: "DEF-spine.001", to: "DEF-spine.003", r: [0.11, 0.13] }, // waist
  { from: "DEF-hips", to: "DEF-spine.001", r: [0.12, 0.11] },
  { from: "DEF-thigh.L", to: "DEF-thigh.R", r: [0.1, 0.1] }, // the pelvis, side to side
  ...side("L"),
  ...side("R"),
];

/* ---------- motes flowing over the body ---------- */
class BodyMotes {
  points: THREE.Points;
  private seg: Int16Array;
  private u: Float32Array;
  private ang: Float32Array;
  private follow: Float32Array;
  private speed: Float32Array;
  private pos: Float32Array;
  private alpha: Float32Array;
  private started = false;
  private mat: THREE.ShaderMaterial;
  private v = new THREE.Vector3();
  private ax = new THREE.Vector3();
  private p1 = new THREE.Vector3();
  private p2 = new THREE.Vector3();

  constructor(private n: number, private body: FluidBody) {
    this.seg = new Int16Array(n);
    this.u = new Float32Array(n);
    this.ang = new Float32Array(n);
    this.follow = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.pos = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    const size = new Float32Array(n);
    const tint = new Float32Array(n);
    // weight segments by surface area, so the light spreads evenly
    const w = SEGS.map((s) => (s.r[0] + s.r[1]) * (typeof s.to === "string" ? 0.35 : 0.15));
    const total = w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) {
      let r = Math.random() * total, k = 0;
      while (k < w.length - 1 && (r -= w[k]) > 0) k++;
      this.seg[i] = k;
      this.u[i] = Math.random();
      this.ang[i] = Math.random() * Math.PI * 2;
      this.follow[i] = Math.random() < 0.28 ? 1.2 + Math.random() * 2.5 : 10 + Math.random() * 14;
      this.speed[i] = 0.25 + Math.random() * 0.4;
      size[i] = 0.4 + Math.pow(Math.random(), 2) * 1.8;
      tint[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uDpr: { value: 1 }, uForm: U.uForm },
      vertexShader: /* glsl */ `attribute float aAlpha,aSize,aTint;uniform float uDpr;varying float vA;varying float vT;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp(aSize*uDpr*26.0/max(-mv.z,0.5),1.0,8.0*uDpr);vA=aAlpha;vT=aTint;}`,
      fragmentShader: /* glsl */ `uniform float uForm;varying float vA;varying float vT;
        void main(){float r=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.0,r)*vA*uForm;
          vec3 c=vT<0.65?vec3(1.0,0.88,0.66):vT<0.9?vec3(0.8,0.93,1.0):vec3(1.0,0.7,0.45);
          gl_FragColor=vec4(c*a*1.5,1.0);}`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }

  update(dt: number, dpr: number, flow: number): void {
    this.mat.uniforms.uDpr.value = dpr;
    const p = this.pos;
    const { a, b, r } = this.body;
    for (let i = 0; i < this.n; i++) {
      const k = this.seg[i];
      // flow along each segment toward the body's centre (limbs are listed outward, so run a→b backwards)
      this.u[i] += dt * this.speed[i] * (1 + flow * 0.25);
      if (this.u[i] > 1) {
        this.u[i] -= 1;
        this.ang[i] = Math.random() * Math.PI * 2;
      }
      const u = k < 6 ? this.u[i] : 1 - this.u[i];
      this.ax.subVectors(b[k], a[k]);
      const len = this.ax.length() || 1;
      this.ax.divideScalar(len);
      // a basis around the segment
      this.p1.set(this.ax.y, -this.ax.x, 0);
      if (this.p1.lengthSq() < 0.01) this.p1.set(0, this.ax.z, -this.ax.y);
      this.p1.normalize();
      this.p2.crossVectors(this.ax, this.p1);
      const rad = (r[k].x + (r[k].y - r[k].x) * u) * 1.08;
      const an = this.ang[i] + u * 2.0;
      this.v.copy(a[k]).addScaledVector(this.ax, len * u).addScaledVector(this.p1, Math.cos(an) * rad).addScaledVector(this.p2, Math.sin(an) * rad);
      const j = i * 3;
      const fresh = this.u[i] < 0.03;
      if (!this.started || fresh) {
        p[j] = this.v.x;
        p[j + 1] = this.v.y;
        p[j + 2] = this.v.z;
      } else {
        const f = Math.min(1, dt * this.follow[i]);
        p[j] += (this.v.x - p[j]) * f;
        p[j + 1] += (this.v.y - p[j + 1]) * f + (this.follow[i] < 5 ? dt * 0.2 : 0);
        p[j + 2] += (this.v.z - p[j + 2]) * f;
      }
      const e = this.u[i];
      this.alpha[i] = Math.min(1, e * 6) * Math.min(1, (1 - e) * 3) * (this.follow[i] < 5 ? 0.6 : 0.9) * (this.v.y < 0 ? 0.3 : 1);
    }
    this.started = true;
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}

/* ---------- ribbons of light ---------- */
class Ribbon {
  mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private ages: number[] = [];
  private pos: Float32Array;
  private a: Float32Array;
  private side = new THREE.Vector3();
  private tan = new THREE.Vector3();
  private view = new THREE.Vector3();

  constructor(private max = 28, private width = 0.07) {
    this.pos = new Float32Array(max * 2 * 3);
    this.a = new Float32Array(max * 2);
    const edge = new Float32Array(max * 2);
    for (let i = 0; i < max; i++) {
      edge[i * 2] = -1;
      edge[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aA", new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aE", new THREE.BufferAttribute(edge, 1));
    const index: number[] = [];
    for (let i = 0; i < max - 1; i++) {
      const k = i * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    g.setIndex(index);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uForm: U.uForm },
        vertexShader: /* glsl */ `attribute float aA,aE;varying float vA;varying float vE;void main(){vA=aA;vE=aE;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`,
        fragmentShader: /* glsl */ `uniform float uForm;varying float vA;varying float vE;void main(){
          float soft=pow(1.0-vE*vE,2.0);  // bright thread in the middle, feathered edges
          gl_FragColor=vec4(vec3(1.0,0.82,0.52)*vA*vA*soft*0.9*uForm,1.0);}`,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  update(dt: number, head: THREE.Vector3, cam: THREE.Vector3, strength: number): void {
    for (let i = 0; i < this.ages.length; i++) this.ages[i] += dt;
    const last = this.pts[0];
    if (last && last.distanceTo(head) > 1.5) {
      this.pts.length = 0; // jumped (a restored save, a teleport): start the trail afresh
      this.ages.length = 0;
    }
    if (!this.pts[0] || this.pts[0].distanceTo(head) > 0.025) {
      this.pts.unshift(head.clone());
      this.ages.unshift(0);
      if (this.pts.length > this.max) {
        this.pts.pop();
        this.ages.pop();
      }
    } else {
      this.pts[0].copy(head);
      this.ages[0] = 0;
    }
    const n = this.pts.length;
    for (let i = 0; i < this.max; i++) {
      const pi = this.pts[Math.min(i, n - 1)];
      const pn = this.pts[Math.min(i + 1, n - 1)];
      this.tan.subVectors(pi, pn);
      if (this.tan.lengthSq() < 1e-8) this.tan.set(0, 1, 0);
      this.view.subVectors(cam, pi);
      this.side.crossVectors(this.tan, this.view).normalize();
      const u = i / (this.max - 1);
      const w = this.width * (1 - u) * (0.4 + 0.6 * strength);
      const alive = i < n ? Math.max(0, 1 - this.ages[i] / 0.9) : 0;
      const a = (1 - u) * alive * strength;
      const k = i * 6;
      this.pos[k] = pi.x + this.side.x * w;
      this.pos[k + 1] = pi.y + this.side.y * w;
      this.pos[k + 2] = pi.z + this.side.z * w;
      this.pos[k + 3] = pi.x - this.side.x * w;
      this.pos[k + 4] = pi.y - this.side.y * w;
      this.pos[k + 5] = pi.z - this.side.z * w;
      this.a[i * 2] = this.a[i * 2 + 1] = a;
    }
    const g = this.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aA as THREE.BufferAttribute).needsUpdate = true;
  }
}

/* ---------- the figure ---------- */
type ActName = "idle" | "walk" | "jog" | "swim" | "tread" | "air" | "land" | "sitIn" | "sit" | "reachIn" | "reach";
const CLIPS: Record<ActName, string> = {
  idle: "Idle_Loop", walk: "Walk_Loop", jog: "Jog_Fwd_Loop", swim: "Swim_Fwd_Loop", tread: "Swim_Idle_Loop",
  air: "Jump_Loop", land: "Jump_Land", sitIn: "Sitting_Enter", sit: "Sitting_Idle_Loop",
  reachIn: "Spell_Simple_Enter", reach: "Spell_Simple_Idle_Loop",
};

export class Wanderer {
  root = new THREE.Group(); // at the feet; rotation.y is the heading
  /** Everything drawn in world space (body, motes, ribbons): add to the scene. */
  fx = new THREE.Group();
  ready = false;
  gesture: Gesture = "none";
  private body = new THREE.Group();
  private bones: Record<string, THREE.Bone> = {};
  private mixer: THREE.AnimationMixer | null = null;
  private act: Partial<Record<ActName, THREE.AnimationAction>> = {};
  private fluid = new FluidBody(U);
  private motes = new BodyMotes(160, this.fluid);
  private skin = lightBodyMaterial();
  private skinMeshes: THREE.Mesh[] = [];
  private orb = new THREE.Group();
  private orbCore: THREE.MeshBasicMaterial;
  private ribbons = [new Ribbon(30, 0.035), new Ribbon(30, 0.035), new Ribbon(22, 0.05)];
  private halo: THREE.Sprite;
  private light: THREE.PointLight;
  private k = { swim: 0, water: 0, glide: 0, move: 0, air: 0, sit: 0, reach: 0 };
  private form = 0;
  private flow = 0;
  private landT = 9;
  private tmp = { a: new THREE.Vector3(), cam: new THREE.Vector3(), off: new THREE.Vector3() };

  constructor(private camera: THREE.Camera) {
    this.root.add(this.body);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 }),
    );
    this.halo.scale.setScalar(2.4);
    this.halo.position.y = 1.1;
    this.root.add(this.halo);
    this.light = new THREE.PointLight(0xffdcb0, 6, 9, 1.6);
    this.light.position.y = 1.2;
    this.root.add(this.light);
    // In water the body becomes an orb of light floating on the surface.
    this.orbCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.35, 1.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
    halo.scale.setScalar(0.95);
    halo.material.depthTest = false; // never sliced by the water's surface
    halo.renderOrder = 12;
    this.orb.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), this.orbCore), halo);
    this.orb.position.y = 1.22;
    this.orb.scale.setScalar(0.001);
    this.root.add(this.orb);
    // the fluid body is no longer drawn; its capsules still guide the motes over the figure
    this.fluid.mesh.visible = false;
    this.fx.add(this.motes.points, ...this.ribbons.map((r) => r.mesh));
  }

  /** Ray-march budget for the body (lower on slow devices). */
  setQuality(steps: number): void {
    this.fluid.setSteps(steps);
  }

  async load(path: string): Promise<void> {
    const bytes = await loadBytes(path);
    if (!bytes) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    const model = gltf.scene;
    model.traverse((o) => {
      // the mesh itself is never drawn: only its skeleton, which moves the fluid body
      if ((o as THREE.Mesh).isMesh) {
        // the figure itself, drawn as clear light
        const mesh = o as THREE.Mesh;
        mesh.material = this.skin;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        this.skinMeshes.push(mesh);
      }
      if ((o as THREE.Bone).isBone) this.bones[key(o.name)] = o as THREE.Bone;
    });
    model.rotation.y = Math.PI; // face -z like the rest of the game
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const h = box.max.y - box.min.y || 1.8;
    model.scale.setScalar(HEIGHT / h);
    this.body.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    for (const [key, clipName] of Object.entries(CLIPS) as [ActName, string][]) {
      const clip = gltf.animations.find((a) => a.name === clipName);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.setEffectiveWeight(key === "idle" ? 1 : 0);
      if (key === "land" || key === "sitIn" || key === "reachIn") {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      a.play();
      this.act[key] = a;
    }
    this.ready = true;
  }

  /** Touch down after a jump: play the landing once. */
  land(): void {
    this.act.land?.reset().play();
    this.landT = 0;
  }

  /** Begin a gesture (sitting, reaching) or return to moving freely. */
  setGesture(g: Gesture): void {
    if (g === this.gesture) return;
    this.gesture = g;
    if (g === "sit") this.act.sitIn?.reset().play();
    if (g === "reach") this.act.reachIn?.reset().play();
  }

  private bonePos(name: string, out: THREE.Vector3, along = 0): THREE.Vector3 {
    const b = this.bones[key(name)];
    if (!b) return out;
    if (along === 0) return b.getWorldPosition(out);
    // a point further along the bone's own axis (bones point along local +y), in metres before scaling
    return out.set(0, along / (this.body.children[0]?.scale.x || 1), 0).applyMatrix4(b.matrixWorld);
  }

  animate(dt: number, pose: Pose, speed: number, t: number, reduced: boolean, dpr = 1): void {
    U.uT.value = reduced ? t * 0.4 : t;
    this.form = Math.min(1, this.form + dt / 2.5);
    const f = THREE.MathUtils.smoothstep(this.form, 0, 1);
    U.uForm.value = f;
    this.halo.material.opacity = 0.3 * f + (1 - f) * 0.8 * this.form;
    this.halo.scale.setScalar(2.4 + (1 - f) * 3);

    const ease = (key: keyof typeof this.k, target: number, rate: number) =>
      (this.k[key] += (target - this.k[key]) * Math.min(1, dt * rate));
    // "swim" blends the swimming clips: used in water, and (without the orb) while flying
    const water = ease("water", pose === "swim" ? 1 : 0, 2.5);
    const swim = ease("swim", pose === "swim" || pose === "fly" || pose === "hover" ? 1 : 0, 2.5);
    const glide = ease("glide", pose === "glide" ? 1 : 0, 3);
    const air = ease("air", pose === "air" ? 1 : 0, 8);
    const sit = ease("sit", this.gesture === "sit" ? 1 : 0, 2.2);
    const reach = ease("reach", this.gesture === "reach" ? 1 : 0, 2.5);
    const moving = pose === "walk" || pose === "glide" || pose === "fly" || (pose === "swim" && speed > 0.2);
    const sp = ease("move", moving ? speed : 0, 6);

    if (this.mixer) {
      this.landT += dt;
      const landing = Math.max(0, 1 - this.landT / 0.55) * (1 - swim);
      const still = (1 - sit) * (1 - reach);
      const ground = (1 - swim) * (1 - air) * (1 - landing);
      const wJog = THREE.MathUtils.smoothstep(sp, 2.0, 3.0);
      const wWalk = THREE.MathUtils.smoothstep(sp, 0.08, 0.8) * (1 - wJog);
      const wIdle = Math.max(0, 1 - wWalk - wJog);
      const swimMove = THREE.MathUtils.smoothstep(sp, 0.3, 1.2);
      const sitIn = this.act.sitIn ? Math.max(0, 1 - this.act.sitIn.time / Math.max(0.01, this.act.sitIn.getClip().duration)) : 0;
      const reachIn = this.act.reachIn ? Math.max(0, 1 - this.act.reachIn.time / Math.max(0.01, this.act.reachIn.getClip().duration)) : 0;
      const W: Partial<Record<ActName, number>> = {
        idle: wIdle * ground * still,
        walk: wWalk * ground,
        jog: wJog * ground,
        air: air * (1 - swim),
        land: landing,
        swim: swim * swimMove,
        tread: swim * (1 - swimMove),
        sitIn: sit * sitIn * ground,
        sit: sit * (1 - sitIn) * ground,
        reachIn: reach * reachIn * ground,
        reach: reach * (1 - reachIn) * ground,
      };
      for (const [key, a] of Object.entries(this.act) as [ActName, THREE.AnimationAction][]) a.setEffectiveWeight(W[key] ?? 0);
      const clamp = THREE.MathUtils.clamp;
      if (this.act.walk) this.act.walk.timeScale = clamp(sp / WALK_NATURAL, 0.55, 1.6);
      if (this.act.jog) this.act.jog.timeScale = clamp(sp / JOG_NATURAL, 0.6, 1.3);
      if (this.act.swim) this.act.swim.timeScale = clamp(sp / SWIM_NATURAL, 0.6, 1.2);
      if (this.act.idle) this.act.idle.timeScale = reduced ? 0.5 : 0.85;
      if (this.act.tread) this.act.tread.timeScale = reduced ? 0.5 : 0.8;
      this.mixer.update(dt);
      this.body.position.y = water * (swimMove * 0.28 + (1 - swimMove) * 0.35);
    }

    const breathe = reduced ? 0 : Math.sin(t * 0.63);
    U.uPulse.value = 1 + 0.08 * breathe + glide * 0.2 + reach * 0.25;
    this.halo.position.y = 1.1 + swim * 0.2 - sit * 0.4;
    this.halo.scale.multiplyScalar(1 - swim * 0.4);
    this.halo.material.opacity *= 1 - water; // the water would slice it into a box
    // the body fades into an orb in the water, and forms again on the shore
    this.skin.opacity = (1 - water) * f;
    for (const m of this.skinMeshes) m.visible = this.skin.opacity > 0.01;
    tickLightBody(this.skin, t);
    const orbK = THREE.MathUtils.smoothstep(water, 0.2, 1);
    this.orb.scale.setScalar(Math.max(0.001, orbK * (1 + (reduced ? 0 : Math.sin(t * 2.2) * 0.05))));
    this.orb.position.y = 1.22 + (reduced ? 0 : Math.sin(t * 1.3) * 0.04);
    this.orbCore.opacity = orbK;
    this.motes.points.visible = water < 0.5;
    this.light.intensity = 6 + glide * 2 + reach * 3;

    // Place the fluid body along the skeleton.
    this.root.updateMatrixWorld(true);
    if (this.ready) {
      SEGS.forEach((s, i) => {
        const put = (e: End, out: THREE.Vector3) => (typeof e === "string" ? this.bonePos(e, out) : this.bonePos(e[0], out, e[1]));
        put(s.from, this.fluid.a[i]);
        put(s.to, this.fluid.b[i]);
        this.fluid.r[i].set(s.r[0], s.r[1]);
      });
      for (let i = SEGS.length; i < SEGMENTS; i++) this.fluid.r[i].set(0.0001, 0.0001);
      this.fluid.commit(this.root.position);
    }
    this.fluid.mesh.visible = false;

    this.flow += ((moving ? speed : 0) - this.flow) * Math.min(1, dt * 2);
    if (this.ready) this.motes.update(dt, dpr, this.flow);

    // Ribbons trail from the hands and the crown, stronger in motion.
    const cam = this.tmp.cam.copy(this.camera.position);
    const strength = Math.min(1, 0.25 + this.flow * 0.4 + reach * 0.5) * f * (1 - water);
    if (this.ready) {
      this.ribbons[0].update(dt, this.bonePos("DEF-hand.L", this.tmp.a, 0.12), cam, strength);
      this.ribbons[1].update(dt, this.bonePos("DEF-hand.R", this.tmp.a, 0.12), cam, strength);
      this.ribbons[2].update(dt, this.bonePos("DEF-head", this.tmp.a, 0.2), cam, strength * 0.7);
    }
  }

  setForm(v: number): void {
    this.form = v;
  }
}
