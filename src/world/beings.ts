/* The archetypes of the Mind as beings you meet, recreated from Samuel's Ra tarot cards. The
   cards themselves are never shown. Each archetype is a body of flowing light like the
   wanderer's, in its own colour, posed as on its card and holding the card's objects:
     I   the Magician: standing, a sphere of light held out; beside him a cube with a bird inside
     II  the High Priestess: seated before her veil, between the pillars
     III the Empress: seated on a cube in her garden, a great halo of rays behind her, a sphere in hand
     IV  the Emperor: seated on his throne on the square of light, a sphere in hand
     V   the Hierophant: seated beyond the arch, a staff of three rings, two small kneeling lights
     VI  the Lovers: one figure between two veiled companions, a bow of light above
     VII the Chariot: standing in the vessel under a canopy, two reclining sphinx forms before it
   Meeting one (coming near) wakes it: it turns toward you and brightens, the standing ones
   greet you with a gesture, and its narration begins. The narration carries on as you walk
   away; nobody has to wait anywhere. Nothing is religious iconography: the forms are light,
   circles and lines. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadBytes } from "../core/assets";
import { lightBodyMaterial, tickLightBody } from "../player/lightBody";
import { HEIGHT, key } from "../player/wanderer";
import type { Sparks } from "./life";
import { etchedStone } from "./etching";
import type { Station } from "./stations";

type Pose = "stand" | "sit" | "offer";
interface Spec {
  numeral: string;
  name: string;
  narration: string;
  at: [number, number, number]; // feet, in the landmark's frame
  pose: Pose;
  tint: [number, number, number];
  /** Stone seat under a seated being, in the landmark's frame (centre). */
  seat?: [number, number, number];
}

export const ARCHETYPES: Spec[] = [
  { numeral: "I", name: "The Magician", narration: "J04", at: [-1.9, 0.12, -1.2], pose: "offer", tint: [1.05, 0.95, 0.75] },
  { numeral: "II", name: "The High Priestess", narration: "J05", at: [0, 0.12, -0.3], pose: "sit", tint: [0.72, 0.85, 1.25], seat: [0, 0.2, -0.7] },
  { numeral: "III", name: "The Empress", narration: "J06", at: [0, 0.12, -3.55], pose: "sit", tint: [0.85, 1.1, 0.82], seat: [0, 0.2, -3.95] },
  { numeral: "IV", name: "The Emperor", narration: "J07", at: [0, 0.26, 0.12], pose: "sit", tint: [1.2, 0.86, 0.62] },
  { numeral: "V", name: "The Hierophant", narration: "J08", at: [0, 0.12, -2.4], pose: "sit", tint: [0.98, 0.86, 1.18], seat: [0, 0.2, -2.8] },
  { numeral: "VI", name: "The Lovers", narration: "J09", at: [0, 0.12, -3.4], pose: "stand", tint: [1.18, 0.82, 0.95] },
  { numeral: "VII", name: "The Chariot", narration: "J10", at: [0, 0.5, -1.5], pose: "stand", tint: [1.0, 1.0, 1.08] },
];

/* ---------------------------------------------------------------- materials */
function glow(color: THREE.Color | string, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
function lines(color: THREE.Color | string, opacity = 0.85): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
/** Soft forms of light: bright at the silhouette, faint in the middle, with slow rising threads. */
function rimGlow(color: THREE.Color, strength = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uC: { value: color }, uS: { value: strength }, uT: { value: 0 } },
    vertexShader: `varying vec3 vN;varying vec3 vV;varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;
      vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `varying vec3 vN;varying vec3 vV;varying vec3 vW;uniform vec3 uC;uniform float uS,uT;void main(){
      float f=1.0-abs(dot(normalize(vN),vV));
      float threads=0.5+0.5*sin(vW.y*18.0-uT*1.5+sin(vW.x*7.0+vW.z*5.0)*1.5);
      gl_FragColor=vec4(uC*(0.06+pow(f,2.0)*0.8+threads*0.05)*uS,1.0);}`,
  });
}
function circle(r: number, n = 64, y = 0, a0 = 0, a1 = Math.PI * 2): THREE.Vector3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });
}
function haloTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,240,215,1)");
  grd.addColorStop(0.3, "rgba(255,220,180,0.3)");
  grd.addColorStop(1, "rgba(255,210,170,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const HALO = haloTexture();
function sprite(color: THREE.Color, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size);
  return s;
}

/** A sphere of light: a bright core in a soft halo. */
function orb(color: THREE.Color, r = 0.1): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), glow(color)), sprite(color, r * 9));
  return g;
}

/* ---------------------------------------------------------------- one being */

class Being {
  root = new THREE.Group(); // at the feet
  props = new THREE.Group(); // in the being's frame
  skin: THREE.MeshStandardMaterial;
  private meshes: THREE.Mesh[] = [];
  held: { obj: THREE.Object3D; bone: string; along: number; lift: number }[] = [];
  met = false;
  wake = 0;
  /** 1 while its answer is being spoken: its light shimmers with the voice. */
  speaking = 0;
  private speakK = 0;
  greetT = 99;
  private body = new THREE.Group();
  private bones: Record<string, THREE.Bone> = {};
  private scale = 1;
  private mixer: THREE.AnimationMixer | null = null;
  private acts: Record<string, THREE.AnimationAction> = {};
  private U = { uT: { value: 0 }, uForm: { value: 0 }, uPulse: { value: 1 }, uTint: { value: new THREE.Vector3() } };
  private halo: THREE.Sprite;
  private baseYaw = Math.PI; // facing +z, out of the landmark
  private yaw = Math.PI;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  animated: { update(t: number, wake: number, greet: number): void }[] = [];

  constructor(public spec: Spec, public station: Station) {
    this.U.uTint.value.set(...spec.tint);
    this.skin = lightBodyMaterial(new THREE.Color(...spec.tint).multiplyScalar(0.9));
    const [x, y, z] = spec.at;
    this.root.position.set(station.center.x + x, station.center.y + y, station.center.z + z);
    this.root.rotation.y = this.yaw;
    this.root.add(this.body, this.props);
    const tint = new THREE.Color(...spec.tint).multiplyScalar(0.8);
    this.halo = sprite(tint, 2.6);
    this.halo.position.y = spec.pose === "sit" ? 0.9 : 1.15;
    this.root.add(this.halo);
    // a ring that spreads over the ground when it greets you
    this.ringMat = glow(tint, 0);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.0, 72).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.position.y = 0.04;
    this.root.add(this.ring);
  }

  attach(model: THREE.Object3D, clips: THREE.AnimationClip[], scale: number): void {
    const m = cloneSkinned(model);
    m.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        mesh.material = this.skin;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        this.meshes.push(mesh);
      }
      if ((o as THREE.Bone).isBone) this.bones[key(o.name)] = o as THREE.Bone;
    });
    m.rotation.y = Math.PI;
    m.scale.setScalar(scale);
    this.scale = scale;
    this.body.add(m);
    this.mixer = new THREE.AnimationMixer(m);
    const want: Record<string, string> = { idle: "Idle_Loop", sit: "Sitting_Idle_Loop", offer: "Spell_Simple_Idle_Loop", greet: "Interact" };
    for (const [k, name] of Object.entries(want)) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (k === "greet") {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      a.setEffectiveWeight(0);
      a.play();
      this.acts[k] = a;
    }
    // each being breathes at its own pace
    this.mixer.update(Math.random() * 3);
  }

  bonePos(name: string, out: THREE.Vector3, along = 0): THREE.Vector3 {
    const b = this.bones[key(name)];
    if (!b) return out.copy(this.root.position);
    if (along === 0) return b.getWorldPosition(out);
    return out.set(0, along / this.scale, 0).applyMatrix4(b.matrixWorld);
  }

  distanceTo(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.root.position.x, p.z - this.root.position.z);
  }

  update(dt: number, t: number, player: THREE.Vector3, reduced: boolean, show: boolean): void {
    const d = this.distanceTo(player);
    const near = d < 9;
    this.wake += ((near ? 1 : 0) - this.wake) * Math.min(1, dt * (near ? 1.2 : 0.3));
    this.greetT += dt;
    const d0 = this.distanceTo(player);
    for (const m of this.meshes) m.visible = d0 < 90;
    this.U.uT.value = reduced ? t * 0.4 : t;
    this.U.uForm.value = Math.min(1, this.U.uForm.value + dt / 2);
    const breathe = reduced ? 0 : Math.sin(t * 0.55 + this.spec.at[0]);
    const greet = Math.exp(-this.greetT * 0.8);
    this.speakK += (this.speaking - this.speakK) * Math.min(1, dt * 2);
    const voice = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
    this.U.uPulse.value = 0.95 + 0.05 * breathe + this.wake * 0.3 + greet * 0.5 + this.speakK * (0.15 + voice * 0.25);
    this.halo.material.opacity = 0.18 + this.wake * 0.25 + greet * 0.4;
    this.ringMat.opacity = greet * 0.6;
    this.ring.scale.setScalar(1 + (1 - greet) * 7);

    // It turns toward you as you come near; seated ones only a little.
    const want = near ? Math.atan2(-(player.x - this.root.position.x), -(player.z - this.root.position.z)) : this.baseYaw;
    const limit = this.spec.pose === "sit" ? 0.3 : 1.1;
    let off = Math.atan2(Math.sin(want - this.baseYaw), Math.cos(want - this.baseYaw));
    off = Math.max(-limit, Math.min(limit, off));
    const target = this.baseYaw + off;
    this.yaw += Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw)) * Math.min(1, dt * 1.5);
    this.root.rotation.y = this.yaw;

    this.skin.emissiveIntensity = this.U.uPulse.value * Math.min(1, this.U.uForm.value);
    tickLightBody(this.skin, t);
    for (const a of this.animated) a.update(t, this.wake, greet);
    if (!show || !this.mixer) return; // only the nearest two keep moving

    // the recorded pose, and for the standing ones a greeting when you arrive
    const g = this.acts.greet;
    const gw = g && this.spec.pose === "stand" ? Math.max(0, Math.sin(Math.min(1, this.greetT / g.getClip().duration) * Math.PI)) : 0;
    const base = this.spec.pose === "sit" ? "sit" : this.spec.pose === "offer" ? "offer" : "idle";
    for (const [k, a] of Object.entries(this.acts)) a.setEffectiveWeight(k === base ? 1 - gw : k === "greet" ? gw : 0);
    if (this.acts.idle) this.acts.idle.timeScale = reduced ? 0.4 : 0.7;
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    // what it holds follows its hand
    for (const h of this.held) {
      this.bonePos(h.bone, h.obj.position, h.along);
      h.obj.position.y += h.lift;
    }
  }

  greet(): void {
    this.greetT = 0;
    this.acts.greet?.reset().play();
  }
}

/* ---------------------------------------------------------------- the cards' objects */
function buildProps(b: Being, world: THREE.Group, stone: THREE.Material): void {
  const n = b.spec.numeral;
  const tint = new THREE.Color(...b.spec.tint);
  const pearl = new THREE.Color(1.0, 0.95, 0.88), gold = new THREE.Color(1.0, 0.8, 0.5);
  const seat = (at: [number, number, number]) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.42, 0.55), stone);
    s.position.set(b.station.center.x + at[0], b.station.center.y + at[1], b.station.center.z + at[2]);
    s.castShadow = true;
    world.add(s);
  };
  if (b.spec.seat) seat(b.spec.seat);
  const holdOrb = (color: THREE.Color, r = 0.09) => {
    const o = orb(color, r);
    world.add(o);
    b.held.push({ obj: o, bone: "DEF-hand.R", along: 0.14, lift: 0.06 });
    const core = o.children[0] as THREE.Mesh, halo = o.children[1] as THREE.Sprite;
    b.animated.push({
      update: (_t, wake, greet) => {
        (core.material as THREE.MeshBasicMaterial).opacity = 0.7 + wake * 0.3;
        halo.material.opacity = 0.5 + wake * 0.4 + greet * 0.6;
        halo.scale.setScalar(r * (9 + wake * 5 + greet * 10));
      },
    });
  };

  if (n === "I") {
    // The sphere held out, and the cube with the bird of light inside it.
    holdOrb(new THREE.Color(1.0, 0.92, 0.75), 0.1);
    const cube = new THREE.Group();
    cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.62, 0.62, 0.62)), lines(pearl, 0.9)));
    cube.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), glow(new THREE.Color(0.25, 0.22, 0.3), 0.35)));
    // the bird: a round body and two curved wings, lifting slowly
    const bird = new THREE.Group();
    bird.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8).scale(1, 0.8, 1.6), glow(gold)));
    const wing = (s: number) => {
      const pts = Array.from({ length: 20 }, (_, i) => {
        const u = i / 19;
        return new THREE.Vector3(s * u * 0.2, Math.sin(u * Math.PI) * 0.06, -u * 0.04);
      });
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lines(gold, 1));
      bird.add(l);
      return l;
    };
    const wl = wing(-1), wr = wing(1);
    cube.add(bird);
    cube.position.set(0.75, 0.31, -0.35); // in front, at his right (the being's front is local −z)
    b.props.add(cube);
    b.animated.push({
      update: (t, wake, greet) => {
        const flap = Math.sin(t * (2 + wake * 4)) * (0.3 + wake * 0.5);
        wl.rotation.z = flap;
        wr.rotation.z = -flap;
        bird.position.y = Math.sin(t * 0.8) * 0.04 + wake * 0.08 + greet * 0.1;
      },
    });
  }

  if (n === "II") {
    // a thin circlet of silver light above her head
    const c = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circle(0.16, 48)), lines(tint, 0.9));
    c.position.set(0, 1.28, -0.05);
    b.props.add(c);
    b.animated.push({ update: (t, wake) => ((c.material as THREE.LineBasicMaterial).opacity = 0.5 + wake * 0.5 + Math.sin(t) * 0.1) });
  }

  if (n === "III") {
    // The great halo of rays behind her head, and a sphere in her hand.
    holdOrb(new THREE.Color(0.9, 1.0, 0.8), 0.085);
    const rays: number[] = [];
    const N = 72;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r0 = 0.3, r1 = 0.8 + (i % 2) * 0.22;
      rays.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(rays, 3));
    const rayMat = lines(new THREE.Color(1.0, 0.92, 0.7), 0.5);
    const halo = new THREE.LineSegments(g, rayMat);
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circle(0.3, 48).map((p) => new THREE.Vector3(p.x, p.z, 0))), lines(gold, 0.9));
    const disc = new THREE.Group();
    disc.add(halo, ring);
    disc.position.set(0, 1.12, 0.28); // behind her head
    b.props.add(disc);
    b.animated.push({
      update: (t, wake, greet) => {
        disc.rotation.z = t * 0.03;
        disc.scale.setScalar(1 + wake * 0.25 + greet * 0.3);
        rayMat.opacity = 0.35 + wake * 0.4;
      },
    });
  }

  if (n === "IV") holdOrb(new THREE.Color(1.0, 0.85, 0.6), 0.1);

  if (n === "V") {
    // A staff of light with three rings, and two small kneeling lights before him.
    const staff = new THREE.Group();
    staff.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.2, 0)]), lines(pearl, 0.9)));
    const rings: THREE.Line[] = [];
    for (let k = 0; k < 3; k++) {
      const r = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circle(0.16 - k * 0.035, 40)), lines(gold, 0.9));
      r.position.y = 1.75 + k * 0.17;
      staff.add(r);
      rings.push(r);
    }
    staff.position.set(0.6, 0, 0.1);
    b.props.add(staff);
    const kneel = (x: number) => {
      const f = new THREE.Group();
      const m = rimGlow(tint.clone().multiplyScalar(0.9), 1.0);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14).scale(1, 1.3, 0.9), m);
      body.position.y = 0.3;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), m);
      head.position.set(0, 0.68, 0.02);
      f.add(body, head);
      f.position.set(x, 0, -1.05);
      f.rotation.y = x > 0 ? 0.4 : -0.4;
      b.props.add(f);
      b.animated.push({ update: (t, wake) => ((m.uniforms.uT.value = t), (m.uniforms.uS.value = 0.8 + wake * 0.8)) });
    };
    kneel(-0.75);
    kneel(0.75);
    b.animated.push({ update: (t, wake) => rings.forEach((r, k) => (r.rotation.y = t * (0.3 + k * 0.2) * (1 + wake))) });
  }

  if (n === "VI") {
    // Two veiled companions, one at each side, and a bow of light above.
    const veiled = (x: number, c: THREE.Color) => {
      const f = new THREE.Group();
      const m = rimGlow(c, 1.1);
      // a long veil falling from the head, widening to the ground: round, no edges
      const profile = [[0.001, 0], [0.26, 0.03], [0.27, 0.4], [0.24, 0.8], [0.19, 1.1], [0.14, 1.36], [0.09, 1.5], [0.001, 1.55]];
      const veil = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 28), m);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12), m);
      head.position.y = 1.62;
      f.add(veil, head);
      f.position.set(x, 0, 0.1);
      f.rotation.y = x > 0 ? -0.35 : 0.35;
      b.props.add(f);
      b.animated.push({
        update: (t, wake, greet) => {
          m.uniforms.uT.value = t;
          m.uniforms.uS.value = 0.9 + wake * 0.7 + greet * 0.6;
          f.position.y = Math.sin(t * 0.7 + x) * 0.03;
        },
      });
    };
    veiled(-0.95, new THREE.Color(0.8, 0.85, 1.1));
    veiled(0.95, new THREE.Color(1.1, 0.8, 0.9));
    // the bow above them, drawn and aimed down across them, as on the card
    const bow = new THREE.Group();
    const arcPts = circle(0.7, 40, 0, -Math.PI / 3, Math.PI / 3).map((p) => new THREE.Vector3(p.x, p.z, 0));
    bow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), lines(gold, 0.95)));
    const top = arcPts[arcPts.length - 1], bot = arcPts[0], nock = new THREE.Vector3(0.05, 0, 0);
    bow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([top, nock, bot]), lines(pearl, 0.7)));
    const tip = new THREE.Vector3(1.25, 0, 0);
    bow.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([nock, tip, new THREE.Vector3(1.1, 0.07, 0), tip, new THREE.Vector3(1.1, -0.07, 0)]),
        lines(pearl, 0.95),
      ),
    );
    bow.position.set(-0.5, 3.6, 0);
    bow.rotation.z = -0.6;
    b.props.add(bow);
    b.animated.push({ update: (t, wake) => (bow.position.y = 3.6 + Math.sin(t * 0.5) * 0.1 + wake * 0.3) });
  }

  if (n === "VII") {
    // A canopy of light over the vessel: four posts and two arches, and two reclining sphinx
    // forms before it, one of light and one of shadow.
    const canopy = new THREE.Group();
    const mat = lines(pearl, 0.75);
    for (const [x, z] of [[-0.65, -0.8], [0.65, -0.8], [-0.65, 0.8], [0.65, 0.8]])
      canopy.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 2.3, z)]), mat));
    for (const z of [-0.8, 0.8]) {
      const arch = circle(0.65, 32, 0, 0, Math.PI).map((p) => new THREE.Vector3(p.x, 2.3 + p.z * 0.45, z));
      canopy.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arch), lines(gold, 0.9)));
    }
    // a star at the canopy's heart, as on the card
    const star = orb(new THREE.Color(1.0, 0.95, 0.85), 0.07);
    star.position.y = 2.55;
    canopy.add(star);
    b.props.add(canopy);
    const sphinx = (x: number, light: boolean) => {
      const f = new THREE.Group();
      const m = light ? rimGlow(new THREE.Color(1.0, 0.95, 0.85), 1.2) : rimGlow(new THREE.Color(0.35, 0.3, 0.55), 1.0);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16).scale(0.9, 0.7, 2.0), m);
      body.position.y = 0.2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), m);
      head.position.set(0, 0.55, -0.45);
      const chest = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14).scale(1, 1.2, 1), m);
      chest.position.set(0, 0.32, -0.35);
      f.add(body, chest, head);
      f.position.set(x, -0.38, -1.8);
      b.props.add(f);
      b.animated.push({
        update: (t, wake) => {
          m.uniforms.uT.value = t;
          m.uniforms.uS.value = (light ? 1.0 : 0.8) + wake * 0.6;
          head.position.y = 0.55 + wake * 0.08;
        },
      });
    };
    sphinx(-0.75, true);
    sphinx(0.75, false);
  }
}

/* ---------------------------------------------------------------- all seven */
export class Beings {
  group = new THREE.Group();
  list: Being[] = [];
  /** Called the first time the wanderer comes near a being. */
  onMeet: ((spec: Spec) => void) | null = null;
  private tmp = new THREE.Vector3();

  constructor(stations: Station[], private sparks: Sparks) {
    const stone = etchedStone();
    ARCHETYPES.forEach((spec, i) => {
      const st = stations[i];
      if (!st) return;
      const b = new Being(spec, st);
      buildProps(b, this.group, stone);
      this.group.add(b.root);
      this.list.push(b);
    });
  }

  async load(path: string): Promise<void> {
    const bytes = await loadBytes(path);
    if (!bytes) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    const model = gltf.scene;
    model.rotation.y = Math.PI;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const scale = HEIGHT / (box.max.y - box.min.y || 1.8);
    model.rotation.y = 0;
    for (const b of this.list) b.attach(model, gltf.animations, scale);
  }

  /** Where to sit with a being: in front of it, facing it. `stone`: a seat rises from the
      ground (the High Priestess has her own bench already). */
  seatFor(i: number): { x: number; z: number; heading: number; stone: boolean } {
    const p = this.list[i].root.position;
    const n = this.list[i].spec.numeral;
    const d = n === "II" ? 1.65 : n === "VII" ? 3.0 : 2.3;
    return { x: p.x, z: p.z + d, heading: 0, stone: n !== "II" };
  }

  /** The nearest being and how far it is. */
  nearest(p: THREE.Vector3): { i: number; d: number } {
    let i = -1, d = Infinity;
    this.list.forEach((b, k) => {
      const dk = b.distanceTo(p);
      if (dk < d) (d = dk), (i = k);
    });
    return { i, d };
  }

  /** Where to wake in front of a being, facing it. */
  approach(i: number): { x: number; z: number; heading: number } {
    const b = this.list[i];
    const p = b.root.position;
    return { x: p.x, z: p.z + 6.5, heading: 0 };
  }

  update(t: number, dt: number, player: THREE.Vector3, reduced: boolean): void {
    // only the two nearest beings are drawn in full; the rest keep just their objects
    const order = this.list.map((b, i) => [i, b.distanceTo(player)] as const).sort((a, b) => a[1] - b[1]);
    const shown = new Set(order.filter(([, d], k) => k < 2 && d < 90).map(([i]) => i));
    this.list.forEach((b, i) => {
      b.update(dt, t, player, reduced, shown.has(i));
      if (!b.met && b.distanceTo(player) < 7) {
        b.met = true;
        b.greet();
        this.sparks.emit(this.tmp.copy(b.root.position).setY(b.root.position.y + 1.2), 24, new THREE.Color(...b.spec.tint).multiplyScalar(0.9), 1.1);
        this.onMeet?.(b.spec);
      }
    });
  }

  /** Forget who has been met (a new start). */
  reset(): void {
    for (const b of this.list) b.met = false;
  }
}
