/* All twenty-two archetypes as beings you meet, recreated from Samuel's Ra tarot cards. The
   cards themselves are never shown. Each archetype is a body of flowing light like the
   wanderer's, in its own colour, posed as on its card and holding the card's objects.
   The Mind, around the shore:
     I   the Magician: standing, a sphere of light held out; beside him a cube with a bird inside
     II  the High Priestess: seated before her veil, between the pillars
     III the Empress: seated on a cube in her garden, a great halo of rays behind her, a sphere in hand
     IV  the Emperor: seated on his throne on the square of light, a sphere in hand
     V   the Hierophant: seated beyond the arch, a staff of three rings, two small kneeling lights
     VI  the Lovers: one figure between two veiled companions, a bow of light above
     VII the Chariot: standing in the vessel under a canopy, two reclining sphinx forms before it
   The Body, to the east (VIII–XIV), the Spirit, to the west (XV–XXI), and the Choice (XXII)
   on its island: see ARCHETYPES below. Where a card and Samuel's recorded voice differ, the
   being follows the voice (VIII rests a hand on a lion; XI holds the scales and the sword).
   The archive leaves XII and XXI open, so their forms are drawn dashed and unfinished.
   Two live on the floor of deep water (XVIII, XX): you meet them by diving.
   Meeting one (coming near) wakes it: it turns toward you and brightens, the standing ones
   greet you with a gesture, and its narration begins. The narration carries on as you walk
   away; nobody has to wait anywhere. Nothing is religious iconography: the forms are light,
   circles and lines. */
import * as THREE from "three/webgpu";
import { T, worldPoints } from "../gpu/tsl";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { floatAttributes, loadBytes } from "../core/assets";
import { lightBodyMaterial, tickLightBody } from "../player/lightBody";
import { HEIGHT, key } from "../player/wanderer";
import type { Sparks } from "./life";
import { etchedStone } from "./etching";
import type { Station } from "./stations";
import { heightAt, LANDMARK_KINDS, WATER_Y } from "./terrain";

type Pose = "stand" | "sit" | "offer";
export type Realm = "Mind" | "Body" | "Spirit" | "Choice";
interface Spec {
  numeral: string;
  name: string;
  /** What it says when you arrive: the Mind's journey narrations, or "Who are you?". */
  narration: string;
  realm: Realm;
  /** Hangs head down from its beam (XII). */
  hang?: boolean;
  /** Lives on the floor of deep water (set from its home's ground). */
  under?: boolean;
  at: [number, number, number]; // feet, in the landmark's frame
  pose: Pose;
  tint: [number, number, number];
  /** Stone seat under a seated being, in the landmark's frame (centre). */
  seat?: [number, number, number];
}

export const ARCHETYPES: Spec[] = [
  { numeral: "I", name: "The Magician", narration: "J04", realm: "Mind", at: [-1.9, 0.12, -1.2], pose: "offer", tint: [1.05, 0.95, 0.75] },
  { numeral: "II", name: "The High Priestess", narration: "J05", realm: "Mind", at: [0, 0.12, -0.3], pose: "sit", tint: [0.72, 0.85, 1.25], seat: [0, 0.2, -0.7] },
  { numeral: "III", name: "The Empress", narration: "J06", realm: "Mind", at: [0, 0.12, -3.55], pose: "sit", tint: [0.85, 1.1, 0.82], seat: [0, 0.2, -3.95] },
  { numeral: "IV", name: "The Emperor", narration: "J07", realm: "Mind", at: [0, 0.26, 0.12], pose: "sit", tint: [1.2, 0.86, 0.62] },
  { numeral: "V", name: "The Hierophant", narration: "J08", realm: "Mind", at: [0, 0.12, -2.4], pose: "sit", tint: [0.98, 0.86, 1.18], seat: [0, 0.2, -2.8] },
  { numeral: "VI", name: "The Lovers", narration: "J09", realm: "Mind", at: [0, 0.12, -3.4], pose: "stand", tint: [1.18, 0.82, 0.95] },
  { numeral: "VII", name: "The Chariot", narration: "J10", realm: "Mind", at: [0, 0.5, -1.5], pose: "stand", tint: [1.0, 1.0, 1.08] },
  // the Body: amber, green and earth red
  { numeral: "VIII", name: "Strength", narration: "A-VIII-who", realm: "Body", at: [-0.5, 0.12, -1.0], pose: "offer", tint: [1.2, 0.9, 0.62] },
  { numeral: "IX", name: "The Hermit", narration: "A-IX-who", realm: "Body", at: [0, 0.12, -0.8], pose: "stand", tint: [0.88, 0.95, 1.2] },
  { numeral: "X", name: "The Wheel of Fortune", narration: "A-X-who", realm: "Body", at: [0, 0.12, -0.4], pose: "offer", tint: [1.1, 1.0, 0.7] },
  { numeral: "XI", name: "Justice", narration: "A-XI-who", realm: "Body", at: [0, 0.12, -1.0], pose: "sit", tint: [1.18, 0.82, 0.72], seat: [0, 0.2, -1.4] },
  { numeral: "XII", name: "The Hanged Man", narration: "A-XII-who", realm: "Body", at: [0, 3.55, -0.8], pose: "stand", tint: [0.85, 1.08, 0.9], hang: true },
  { numeral: "XIII", name: "Death", narration: "A-XIII-who", realm: "Body", at: [0, 0.12, -0.8], pose: "stand", tint: [0.95, 0.95, 1.08] },
  { numeral: "XIV", name: "Temperance", narration: "A-XIV-who", realm: "Body", at: [0, 0.12, -0.8], pose: "offer", tint: [1.12, 0.9, 1.0] },
  // the Spirit: violet, gold and indigo
  { numeral: "XV", name: "The Devil", narration: "A-XV-who", realm: "Spirit", at: [0, 0.12, -1.2], pose: "stand", tint: [0.95, 0.6, 0.9] },
  { numeral: "XVI", name: "The Tower", narration: "A-XVI-who", realm: "Spirit", at: [0.9, 0.12, -0.6], pose: "stand", tint: [0.8, 0.86, 1.25] },
  { numeral: "XVII", name: "The Star", narration: "A-XVII-who", realm: "Spirit", at: [0, 0.12, -0.8], pose: "sit", tint: [0.8, 0.92, 1.25], seat: [0, 0.2, -1.2] },
  { numeral: "XVIII", name: "The Moon", narration: "A-XVIII-who", realm: "Spirit", at: [0, 0.12, 0.4], pose: "stand", tint: [0.76, 0.82, 1.22] },
  { numeral: "XIX", name: "The Sun", narration: "A-XIX-who", realm: "Spirit", at: [-0.4, 0.12, -0.6], pose: "offer", tint: [1.25, 1.02, 0.66] },
  { numeral: "XX", name: "Judgement", narration: "A-XX-who", realm: "Spirit", at: [0, 0.12, -1.9], pose: "offer", tint: [0.95, 0.92, 1.2] },
  { numeral: "XXI", name: "The World", narration: "A-XXI-who", realm: "Spirit", at: [0, 0.12, -0.8], pose: "sit", tint: [0.92, 1.1, 0.98], seat: [0, 0.2, -1.2] },
  // the Choice
  { numeral: "XXII", name: "The Choice", narration: "A-XXII-who", realm: "Choice", at: [0, 0.12, -0.6], pose: "stand", tint: [1.1, 1.06, 1.0] },
];

/* ---------------------------------------------------------------- materials */
function glow(color: THREE.Color | string, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
function lines(color: THREE.Color | string, opacity = 0.85): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
/** A line drawn dashed: the archive leaves this archetype open. */
function dashed(points: THREE.Vector3[], color: THREE.Color, opacity = 0.8, dash = 0.14): THREE.Line {
  const l = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: dash * 0.8, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  l.computeLineDistances();
  return l;
}
function polyline(points: THREE.Vector3[], mat: THREE.LineBasicMaterial): THREE.Line {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
}
/** Soft forms of light: bright at the silhouette, faint in the middle, with slow rising threads. */
function rimGlow(color: THREE.Color, strength = 1): THREE.MeshBasicNodeMaterial & { uniforms: { uS: { value: number }; uT: { value: number } } } {
  const { abs, cameraPosition, dot, normalize, normalWorldGeometry, positionWorld, pow, sin, uniform, vec3, vec4 } = T;
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const uS = uniform(strength), uT = uniform(0);
  const vW = positionWorld;
  const f = abs(dot(normalize(normalWorldGeometry), normalize(cameraPosition.sub(vW)))).oneMinus();
  const threads = sin(vW.y.mul(18).sub(uT.mul(1.5)).add(sin(vW.x.mul(7).add(vW.z.mul(5))).mul(1.5))).mul(0.5).add(0.5);
  m.colorNode = vec4(vec3(color.r, color.g, color.b).mul(pow(f, 2).mul(0.8).add(0.06).add(threads.mul(0.05))).mul(uS), 1);
  return Object.assign(m, { uniforms: { uS, uT } });
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
  skin: THREE.MeshStandardNodeMaterial;
  private meshes: THREE.Mesh[] = [];
  held: { obj: THREE.Object3D; bone: string; along: number; lift: number }[] = [];
  met = false;
  /** Stepped close ("the Walk") and sat with ("the Heart"): each spoken once per journey. */
  walked = false;
  hearted = false;
  wake = 0;
  lastPlayer = new THREE.Vector3(1e9, 0, 0);
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
    this.halo.position.y = spec.hang ? -0.9 : spec.pose === "sit" ? 0.9 : 1.15;
    if (spec.hang) this.body.rotation.z = Math.PI; // head down, hanging by one foot
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

  /** How far the wanderer is. Under water it counts in three dimensions: swimming on the surface
      far above is not meeting it. */
  distanceTo(p: THREE.Vector3): number {
    const r = this.root.position;
    return Math.hypot(p.x - r.x, p.z - r.z, this.spec.under ? p.y - (r.y + 1) : 0);
  }

  update(dt: number, t: number, player: THREE.Vector3, reduced: boolean, show: boolean): void {
    this.lastPlayer.copy(player);
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
    const limit = this.spec.pose === "sit" || this.spec.hang ? 0.3 : 1.1;
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
        halo.scale.setScalar(r * (6 + wake * 3 + greet * 4));
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

/* ------------------------------------------------ the Body, the Spirit and the Choice */
/** The card objects of VIII–XXII. The being's front is its local −z. */
function buildMoreProps(b: Being, world: THREE.Group, stone: THREE.Material): void {
  const n = b.spec.numeral;
  const tint = new THREE.Color(...b.spec.tint);
  const pearl = new THREE.Color(1.0, 0.95, 0.88), gold = new THREE.Color(1.0, 0.8, 0.5);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const add = (o: THREE.Object3D, x = 0, y = 0, z = 0) => {
    o.position.set(x, y, z);
    b.props.add(o);
    return o;
  };
  const station = b.station.center;
  if (b.spec.seat) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.42, 0.55), stone);
    const [x, y, z] = b.spec.seat;
    seat.position.set(station.x + x, station.y + y, station.z + z);
    seat.castShadow = true;
    world.add(seat);
  }
  /** Something held in a hand, following it. */
  const hold = (o: THREE.Object3D, hand: "L" | "R", along = 0.12, lift = 0) => {
    world.add(o);
    b.held.push({ obj: o, bone: `DEF-hand.${hand}`, along, lift });
    return o;
  };
  /** A staff hanging from the hand to the ground. */
  const staff = (hand: "L" | "R", len: number, top?: THREE.Object3D) => {
    const g = new THREE.Group();
    g.add(polyline([V(0, 0.35, 0), V(0, 0.35 - len, 0)], lines(pearl, 0.85)));
    if (top) g.add(top);
    return hold(g, hand, 0.1);
  };
  /** A soft figure of light: a round veil and a head, no edges (the companions and the small ones). */
  const figure = (c: THREE.Color, h = 1.55) => {
    const f = new THREE.Group();
    const m = rimGlow(c, 1.0);
    const k = h / 1.55;
    const profile = [[0.001, 0], [0.24, 0.03], [0.25, 0.4], [0.22, 0.8], [0.17, 1.1], [0.12, 1.36], [0.08, 1.5], [0.001, 1.55]];
    f.add(new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * k, y * k)), 24), m));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1 * k, 16, 12), m);
    head.position.y = 1.62 * k;
    f.add(head);
    b.animated.push({ update: (t, wake) => ((m.uniforms.uT.value = t), (m.uniforms.uS.value = 0.8 + wake * 0.7)) });
    return f;
  };
  /** A reclining creature of light (the Chariot's sphinx forms, the lion). */
  const reclining = (c: THREE.Color, s = 1) => {
    const f = new THREE.Group();
    const m = rimGlow(c, 1.1);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 24, 16).scale(0.95, 0.72, 2.0), m);
    body.position.y = 0.22 * s;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.24 * s, 20, 14).scale(1, 1.2, 1), m);
    chest.position.set(0, 0.36 * s, -0.36 * s);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 20, 14), m);
    head.position.set(0, 0.62 * s, -0.5 * s);
    f.add(body, chest, head);
    b.animated.push({ update: (t, wake) => ((m.uniforms.uT.value = t), (m.uniforms.uS.value = 0.9 + wake * 0.6)) });
    return { f, head };
  };
  /** Wings of light: fans of curved feathers. */
  const wings = (c: THREE.Color, span = 1.2, bat = false) => {
    const g = new THREE.Group();
    const mat = lines(c, 0.55);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 9; k++) {
        const a = 0.25 + k * 0.13;
        const len = span * (1 - k * 0.06);
        const pts = Array.from({ length: 14 }, (_, i) => {
          const u = i / 13;
          const droop = bat ? Math.sin(u * Math.PI) * 0.08 : -Math.sin(u * Math.PI) * 0.05;
          return V(side * Math.cos(a) * len * u, Math.sin(a) * len * u * 0.9 + droop - u * u * 0.25, 0.1 * u);
        });
        g.add(polyline(pts, mat));
      }
    }
    return { g, mat };
  };
  /** A disc of rays behind the head (the Empress's halo, and Temperance's). */
  const rayHalo = (r0: number, r1: number, c: THREE.Color, count = 48) => {
    const rays: number[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const e = r1 * (0.85 + (i % 2) * 0.15);
      rays.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * e, Math.sin(a) * e, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(rays, 3));
    const mat = lines(c, 0.45);
    const disc = new THREE.Group();
    disc.add(new THREE.LineSegments(g, mat), polyline(circle(r0, 40).map((p) => V(p.x, p.z, 0)), lines(gold, 0.8)));
    return { disc, mat };
  };
  /** A stream of light falling or arcing between two points, as motes. */
  const stream = (from: () => THREE.Vector3, to: () => THREE.Vector3, c: THREE.Color, count = 28, arc = 0.35) => {
    const wp = worldPoints(new Float32Array(count * 3), { color: c, size: 0.05, opacity: 0.8 });
    const pos = wp.position.array as Float32Array, mat = wp.material;
    world.add(wp.sprite);
    const a = new THREE.Vector3(), z = new THREE.Vector3();
    b.animated.push({
      update: (t, wake) => {
        if (b.distanceTo(b.lastPlayer) > 60) return;
        a.copy(from());
        z.copy(to());
        for (let i = 0; i < count; i++) {
          const u = (i / count + t * (0.25 + wake * 0.2)) % 1;
          pos[i * 3] = a.x + (z.x - a.x) * u;
          pos[i * 3 + 1] = a.y + (z.y - a.y) * u + Math.sin(u * Math.PI) * arc;
          pos[i * 3 + 2] = a.z + (z.z - a.z) * u;
        }
        wp.position.needsUpdate = true;
        mat.opacity = 0.45 + wake * 0.45;
      },
    });
  };
  const hand = (side: "L" | "R", along = 0.12) => () => b.bonePos(`DEF-hand.${side}`, new THREE.Vector3(), along);

  if (n === "VIII") {
    // Strength: one gentle hand, and the lion at rest; its mane a ring of curling light
    const { f: lion, head } = reclining(new THREE.Color(1.15, 0.9, 0.6), 1.25);
    add(lion, 0.55, 0, -0.95).rotation.y = -0.5;
    const mane = new THREE.Group();
    const maneMat = lines(gold, 0.7);
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      const pts = Array.from({ length: 12 }, (_, i) => {
        const u = i / 11, r = 0.12 + u * 0.22, curl = a + u * 1.6;
        return V(Math.cos(curl) * r, Math.sin(curl) * r, 0);
      });
      mane.add(polyline(pts, maneMat));
    }
    head.add(mane);
    mane.position.z = 0.05;
    b.animated.push({ update: (t, wake) => ((mane.rotation.z = Math.sin(t * 0.3) * 0.1), (maneMat.opacity = 0.45 + wake * 0.45)) });
  }

  if (n === "IX") {
    // the Hermit: a staff, and a lamp whose light is not his own
    staff("L", 1.85);
    const lamp = new THREE.Group();
    lamp.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.1, 0)), lines(pearl, 0.9)));
    const flame = orb(new THREE.Color(1.0, 0.88, 0.6), 0.045);
    lamp.add(flame);
    lamp.add(polyline([V(0, 0.1, 0), V(0, 0.22, 0)], lines(pearl, 0.7)));
    hold(lamp, "R", 0.1, -0.18);
    const glowS = flame.children[1] as THREE.Sprite;
    b.animated.push({ update: (t, wake) => glowS.scale.setScalar(0.4 + wake * 0.5 + Math.sin(t * 5.3) * 0.03) });
    // two small spirals of life at his feet, as on the card
    for (const x of [0.35, 0.55]) {
      const pts = Array.from({ length: 40 }, (_, i) => {
        const u = i / 39, r = 0.02 + u * 0.08, a = u * Math.PI * 5;
        return V(Math.cos(a) * r, 0.02 + u * 0.12, Math.sin(a) * r * 0.3);
      });
      add(polyline(pts, lines(tint, 0.8)), x, 0, -0.5);
    }
  }

  if (n === "X") {
    // the Wheel: eight spokes of light turning slowly behind him; two small lights ride it,
    // one rising, one falling; a winged light keeps watch above
    const wheel = new THREE.Group();
    const R = 1.5;
    wheel.add(polyline(circle(R, 96).map((p) => V(p.x, p.z, 0)), lines(gold, 0.9)));
    wheel.add(polyline(circle(R * 0.35, 48).map((p) => V(p.x, p.z, 0)), lines(pearl, 0.8)));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      wheel.add(polyline([V(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0), V(Math.cos(a) * R, Math.sin(a) * R, 0)], lines(pearl, 0.6)));
    }
    const riders = [orb(tint, 0.07), orb(new THREE.Color(0.8, 0.7, 1.0), 0.07)];
    for (const r of riders) wheel.add(r);
    const frame = add(new THREE.Group(), 0, 0, 1.0);
    frame.add(polyline([V(0, 0, 0), V(0, R + 1.9, 0)], lines(pearl, 0.7)));
    frame.add(wheel);
    wheel.position.y = R + 0.4;
    const watcher = wings(pearl, 0.45).g;
    watcher.add(orb(pearl, 0.06));
    frame.add(watcher);
    watcher.position.y = R * 2 + 0.6;
    b.animated.push({
      update: (t, wake) => {
        const a = t * (0.12 + wake * 0.15);
        riders[0].position.set(Math.cos(a) * R, Math.sin(a) * R, 0.02);
        riders[1].position.set(Math.cos(a + Math.PI) * R, Math.sin(a + Math.PI) * R, 0.02);
      },
    });
  }

  if (n === "XI") {
    // Justice: the scales in one hand, the sword upright in the other, the star of the card above
    const scales = new THREE.Group();
    const sm = lines(gold, 0.9);
    scales.add(polyline([V(-0.28, 0, 0), V(0.28, 0, 0)], sm));
    for (const x of [-0.28, 0.28]) {
      scales.add(polyline([V(x, 0, 0), V(x - 0.07, -0.22, 0)], sm), polyline([V(x, 0, 0), V(x + 0.07, -0.22, 0)], sm));
      const pan = polyline(circle(0.08, 24, 0).map((p) => V(x + p.x, -0.22, p.z)), sm);
      scales.add(pan);
    }
    hold(scales, "L", 0.12, 0.05);
    const sword = new THREE.Group();
    const blade = Array.from({ length: 16 }, (_, i) => V(Math.sin((i / 15) * 1.2) * 0.12, (i / 15) * 0.85, 0));
    sword.add(polyline(blade, lines(pearl, 0.95)), polyline([V(-0.1, 0, 0), V(0.1, 0, 0)], lines(gold, 0.9)));
    hold(sword, "R", 0.1);
    const star = new THREE.Group();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      star.add(polyline([V(0, 0, 0), V(Math.cos(a) * (k % 2 ? 0.25 : 0.45), Math.sin(a) * (k % 2 ? 0.25 : 0.45), 0)], lines(gold, 0.6)));
    }
    star.add(polyline(circle(0.2, 40, 0, Math.PI * 0.2, Math.PI * 1.1).map((p) => V(p.x + 0.07, p.z, 0)), lines(pearl, 0.9)));
    add(star, -0.2, 2.6, 0.2);
    b.animated.push({ update: (t) => (star.rotation.z = t * 0.05) });
  }

  if (n === "XII") {
    // the Hanged Man: by one foot from a beam between two living pillars, above still water.
    // The archive leaves him open: his frame is drawn dashed.
    const c = new THREE.Color(0.8, 1.0, 0.85);
    const top = 0.35;
    for (const x of [-1.35, 1.35]) {
      b.props.add(Object.assign(dashed([V(x, -3.45, 0), V(x, top + 0.2, 0)], c, 0.75), {}));
      // vines curling round the pillar
      const pts = Array.from({ length: 60 }, (_, i) => {
        const u = i / 59, a = u * Math.PI * 9;
        return V(x + Math.cos(a) * 0.1, -3.45 + u * 3.8, Math.sin(a) * 0.1);
      });
      b.props.add(dashed(pts, tint, 0.45, 0.08));
    }
    b.props.add(dashed([V(-1.6, top, 0), V(1.6, top, 0)], c, 0.85));
    b.props.add(polyline([V(0, top, 0), V(0, 0.02, 0)], lines(pearl, 0.8)));
    for (let k = 0; k < 6; k++) {
      const o = orb(pearl, 0.025);
      o.position.set(-0.6 + k * 0.25 + Math.sin(k * 2.1) * 0.1, top + 0.4 + Math.cos(k * 1.7) * 0.25, 0);
      b.props.add(o);
    }
  }

  if (n === "XIII") {
    // Death: a long scythe of light, and a rainbow over the field
    const scythe = new THREE.Group();
    scythe.add(polyline([V(0, 0.4, 0), V(0, -1.6, 0)], lines(pearl, 0.85)));
    const blade = Array.from({ length: 20 }, (_, i) => {
      const u = i / 19;
      return V(-Math.sin(u * 1.9) * 0.55, 0.4 + Math.cos(u * 1.9) * 0.2 - 0.2, 0);
    });
    scythe.add(polyline(blade, lines(new THREE.Color(0.85, 0.9, 1.1), 0.95)));
    hold(scythe, "R", 0.1);
    const bow = new THREE.Group();
    const hues = [[1, 0.45, 0.45], [1, 0.7, 0.4], [1, 0.95, 0.5], [0.5, 1, 0.6], [0.45, 0.75, 1], [0.6, 0.5, 1], [0.85, 0.5, 1]];
    hues.forEach((h, k) => bow.add(polyline(circle(4.2 - k * 0.12, 64, 0, 0, Math.PI).map((p) => V(p.x, p.z, 0)), lines(new THREE.Color(...(h as [number, number, number])), 0.28))));
    add(bow, 0, 0.3, 1.6);
  }

  if (n === "XIV") {
    // Temperance: wings, a disc of rays, and light poured from cup to cup, never spilling
    const w = wings(new THREE.Color(1.0, 0.9, 1.0), 1.25);
    add(w.g, 0, 1.25, 0.2);
    const h = rayHalo(0.22, 0.55, new THREE.Color(1.0, 0.9, 0.75), 40);
    add(h.disc, 0, 1.55, 0.25);
    const cup = () => {
      const c = new THREE.Group();
      const prof = [[0.001, -0.08], [0.03, -0.08], [0.02, -0.03], [0.05, 0.0], [0.06, 0.06]].map(([r, y]) => new THREE.Vector2(r, y));
      c.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 16), glow(new THREE.Color(1.0, 0.85, 0.6), 0.35)));
      return c;
    };
    hold(cup(), "L", 0.1, 0.02);
    hold(cup(), "R", 0.1, 0.02);
    stream(hand("L", 0.14), hand("R", 0.14), new THREE.Color(1.0, 0.85, 0.7), 26, 0.3);
    b.animated.push({ update: (t, wake) => ((h.disc.rotation.z = t * 0.04), (h.mat.opacity = 0.3 + wake * 0.4), (w.mat.opacity = 0.35 + wake * 0.35)) });
  }

  if (n === "XV") {
    // the Devil: great wings, a raised torch, and two small figures held by a cord that is
    // loose enough to slip off, if they only looked
    const w = wings(new THREE.Color(0.75, 0.45, 0.85), 1.7, true);
    add(w.g, 0, 1.3, 0.25);
    const torch = new THREE.Group();
    torch.add(polyline([V(0, 0, 0), V(0, 0.45, 0)], lines(pearl, 0.8)));
    const flame = orb(new THREE.Color(1.0, 0.6, 0.4), 0.06);
    flame.position.y = 0.5;
    torch.add(flame);
    hold(torch, "R", 0.1);
    for (const x of [-0.7, 0.7]) {
      const f = figure(new THREE.Color(0.85, 0.7, 1.0), 0.8);
      add(f, x, 0, -1.2).rotation.y = x > 0 ? 0.5 : -0.5;
      const cord = Array.from({ length: 20 }, (_, i) => {
        const u = i / 19;
        return V(x * u, 0.55 * (1 - u) + 0.1 - Math.sin(u * Math.PI) * 0.2, -1.2 * (1 - u) - 0.05);
      });
      b.props.add(dashed(cord, new THREE.Color(0.7, 0.55, 0.85), 0.5, 0.06));
    }
    b.animated.push({ update: (t, wake) => ((w.mat.opacity = 0.3 + wake * 0.3), (flame.scale.setScalar(1 + Math.sin(t * 6.1) * 0.12))) });
  }

  if (n === "XVI") {
    // the Tower: a tall tower of light whose capstone the lightning has lifted away; two small
    // lights fall slowly beside it, and are caught
    const tw = new THREE.Group();
    tw.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.1, 5.2, 1.1)), lines(new THREE.Color(0.8, 0.85, 1.1), 0.6)));
    tw.children[0].position.y = 2.6;
    tw.add(polyline([V(-0.25, 0, -0.56), V(-0.25, 1.1, -0.56), V(0.25, 1.1, -0.56), V(0.25, 0, -0.56)], lines(gold, 0.8)));
    const cap = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ConeGeometry(0.8, 0.9, 4)), lines(gold, 0.9));
    cap.position.set(0.35, 6.2, 0);
    cap.rotation.z = 0.5;
    tw.add(cap);
    const boltPts = [V(-1.6, 9, 0), V(-0.9, 8.1, 0), V(-1.1, 7.9, 0), V(-0.2, 6.9, 0), V(-0.45, 6.75, 0), V(0.25, 6.0, 0)];
    const boltMat = lines(new THREE.Color(0.9, 0.95, 1.2), 0);
    tw.add(polyline(boltPts, boltMat));
    add(tw, -1.3, 0, 0.6);
    const falling = [orb(pearl, 0.06), orb(tint, 0.06)];
    falling.forEach((o) => tw.add(o));
    b.animated.push({
      update: (t, wake) => {
        const flash = Math.max(0, Math.sin(t * 0.9) - 0.9) * 10;
        boltMat.opacity = Math.min(1, flash + wake * 0.15);
        cap.rotation.y = t * 0.1;
        falling.forEach((o, k) => {
          const u = (t * 0.08 + k * 0.5) % 1;
          o.position.set((k ? 1 : -1) * (0.9 + u * 0.6), 5.8 - u * 5.4, 0.2);
        });
      },
    });
  }

  if (n === "XVII") {
    // the Star: kneeling by the water, pouring from two vessels; the great star of eight points
    // above her, and seven small ones
    const star = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2 + Math.PI / 2, r = k % 2 ? 0.35 : 0.8;
      pts.push(V(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    star.add(polyline(pts, lines(pearl, 0.9)), orb(new THREE.Color(0.85, 0.9, 1.2), 0.08));
    add(star, 0, 4.2, 0.2);
    for (let k = 0; k < 7; k++) add(orb(pearl, 0.03 + (k % 3) * 0.008), 1.2 + Math.cos(k * 1.3) * 0.9, 3.4 + Math.sin(k * 2.1) * 0.7, 0.3);
    const vessel = () => {
      const c = new THREE.Group();
      const prof = [[0.001, -0.07], [0.04, -0.06], [0.06, 0.0], [0.04, 0.07]].map(([r, y]) => new THREE.Vector2(r, y));
      c.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 16), glow(new THREE.Color(0.8, 0.9, 1.2), 0.35)));
      return c;
    };
    hold(vessel(), "L", 0.1);
    hold(vessel(), "R", 0.1);
    const below = (side: "L" | "R") => () => b.bonePos(`DEF-hand.${side}`, new THREE.Vector3(), 0.12).setY(station.y + 0.1).add(new THREE.Vector3(0, 0, 0));
    stream(hand("L", 0.14), below("L"), new THREE.Color(0.75, 0.85, 1.2), 20, -0.02);
    stream(hand("R", 0.14), below("R"), new THREE.Color(0.75, 0.85, 1.2), 20, -0.02);
    b.animated.push({ update: (t, wake) => ((star.rotation.z = Math.sin(t * 0.2) * 0.05), star.scale.setScalar(1 + wake * 0.2)) });
  }

  if (n === "XVIII") {
    // the Moon: two pyramids, one pale and one dark, a dim path between them, and the moon
    // above, in the deep
    const pyramid = (c: THREE.Color, x: number) => {
      const p = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ConeGeometry(1.5, 2.8, 4)), lines(c, 0.7));
      p.position.set(x, 1.4, 1.6);
      p.rotation.y = Math.PI / 4;
      b.props.add(p);
    };
    pyramid(new THREE.Color(0.95, 0.95, 1.1), -2.3);
    pyramid(new THREE.Color(0.35, 0.35, 0.7), 2.3);
    b.props.add(dashed([V(0, 0.05, -3.5), V(0.2, 0.05, -1.5), V(-0.15, 0.05, 0), V(0, 0.05, 1.8)], pearl, 0.6, 0.2));
    const moon = orb(new THREE.Color(0.85, 0.88, 1.1), 0.35);
    moon.add(polyline(circle(0.42, 48, 0, -1.2, 1.2).map((p) => V(p.x - 0.12, p.z, 0.02)), lines(pearl, 0.9)));
    add(moon, 0, 4.6, 1.6);
    b.animated.push({ update: (t, wake) => (moon.position.y = 4.6 + Math.sin(t * 0.3) * 0.15 + wake * 0.3) });
  }

  if (n === "XIX") {
    // the Sun: two figures hand in hand in a ring of flowers, under a sun with curling rays
    const friend = figure(new THREE.Color(1.1, 0.95, 0.75), 1.55);
    add(friend, 0.8, 0, -0.1).rotation.y = -0.3;
    const sun = new THREE.Group();
    sun.add(orb(new THREE.Color(1.2, 1.0, 0.7), 0.3));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const pts = Array.from({ length: 14 }, (_, i) => {
        const u = i / 13, r = 0.45 + u * 0.55, w = Math.sin(u * Math.PI * 2) * 0.06;
        return V(Math.cos(a) * r - Math.sin(a) * w, Math.sin(a) * r + Math.cos(a) * w, 0);
      });
      sun.add(polyline(pts, lines(gold, 0.7)));
    }
    add(sun, 0.4, 4.4, 0.4);
    const ring = new THREE.Group();
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const bloom = orb(k % 2 ? new THREE.Color(1.1, 0.9, 0.6) : new THREE.Color(1.1, 0.75, 0.85), 0.035);
      bloom.position.set(Math.cos(a) * 1.9, 0.12, Math.sin(a) * 1.9);
      ring.add(bloom, polyline([V(Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9), V(Math.cos(a) * 1.9, 0.1, Math.sin(a) * 1.9)], lines(tint, 0.6)));
    }
    add(ring, 0.4, 0, 0);
    b.animated.push({ update: (t, wake) => ((sun.rotation.z = t * 0.03), sun.scale.setScalar(1 + wake * 0.15)) });
  }

  if (n === "XX") {
    // Judgement: from the sarcophagus on the floor of the deep, three figures of light rise
    // toward the surface, answering; a long horn of light calls from above
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 0.8, 1.0)), lines(gold, 0.7));
    add(box, 0, 0.4, -1.1);
    const risers = [0, 1, 2].map((k) => add(figure(new THREE.Color(0.9, 0.95, 1.2), 0.9 + k * 0.15), -0.7 + k * 0.7, 0.4, -1.1));
    const horn = Array.from({ length: 16 }, (_, i) => V(-1.4 + (i / 15) * 1.6, 5.2 - (i / 15) * 0.9, 0.3));
    add(polyline(horn, lines(gold, 0.85)));
    add(polyline(circle(0.18, 24).map((p) => V(0.2 + p.x * 0.3, 4.3 + p.z, 0.3)), lines(gold, 0.85)));
    b.animated.push({
      update: (t, wake) => {
        risers.forEach((r, k) => {
          const u = (t * 0.035 + k / 3) % 1;
          r.position.y = 0.4 + u * 9;
          r.scale.setScalar(Math.sin(u * Math.PI) * (0.8 + wake * 0.2) + 0.001);
        });
      },
    });
  }

  if (n === "XXI") {
    // the World: a wreath with a dove of light at its heart, the four guardians at the corners,
    // and a harp before her. The archive leaves the World open: the wreath is unfinished.
    const wreath = new THREE.Group();
    wreath.add(dashed(circle(1.05, 72, 0, 0.3, Math.PI * 2 - 0.3).map((p) => V(p.x, p.z, 0)), new THREE.Color(0.85, 1.05, 0.8), 0.8, 0.09));
    for (let k = 0; k < 14; k++) {
      const a = 0.4 + (k / 14) * (Math.PI * 2 - 0.8);
      const leaf = Array.from({ length: 8 }, (_, i) => {
        const u = i / 7;
        return V(Math.cos(a) * (1.05 + u * 0.14), Math.sin(a) * (1.05 + u * 0.14) + Math.sin(u * Math.PI) * 0.04, 0);
      });
      wreath.add(polyline(leaf, lines(new THREE.Color(0.8, 1.0, 0.75), 0.6)));
    }
    const dove = wings(pearl, 0.35).g;
    dove.add(orb(pearl, 0.05));
    wreath.add(dove);
    add(wreath, 0, 3.4, 0.5);
    for (const [x, z] of [[-2.6, -2.2], [2.6, -2.2], [-2.6, 2.2], [2.6, 2.2]]) add(orb(new THREE.Color(0.9, 0.95, 1.1), 0.08), x, 2.8, z);
    const harp = new THREE.Group();
    const frame = Array.from({ length: 20 }, (_, i) => {
      const u = i / 19;
      return V(-0.15 + u * 0.3 + Math.sin(u * Math.PI) * 0.12, u * 1.1, 0);
    });
    harp.add(polyline(frame, lines(gold, 0.85)));
    for (let k = 1; k < 7; k++) harp.add(polyline([V(-0.15 + k * 0.04, 0.05, 0), V(-0.15 + k * 0.04, 0.2 + k * 0.13, 0)], lines(pearl, 0.5)));
    add(harp, 0.3, 0.2, -0.55);
    b.animated.push({ update: (t, wake) => ((wreath.rotation.z = Math.sin(t * 0.15) * 0.04), (dove.position.y = Math.sin(t * 0.8) * 0.05 + wake * 0.05)) });
  }

  if (n === "XXII") {
    // the Choice: a bindle over the shoulder and a flowering staff, and above, the eclipse
    // (a dark sun passing a bright one)
    const bindle = new THREE.Group();
    bindle.add(polyline([V(-0.5, 0, 0.25), V(0.55, 0, -0.35)], lines(pearl, 0.85)));
    for (const [x, z] of [[-0.5, 0.25], [0.55, -0.35]]) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10).scale(1, 1.2, 1), rimGlow(new THREE.Color(1.0, 0.9, 0.75), 1.0));
      bag.position.set(x, -0.14, z);
      bindle.add(bag);
    }
    add(bindle, 0.1, 1.5, 0);
    const blossom = orb(new THREE.Color(1.0, 0.85, 0.9), 0.05);
    blossom.position.y = 0.4;
    staff("R", 1.6, blossom);
    const bright = orb(new THREE.Color(1.15, 1.0, 0.8), 0.4);
    const dark = new THREE.Mesh(new THREE.CircleGeometry(0.38, 40), new THREE.MeshBasicMaterial({ color: 0x0b0a1c, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }));
    const ecl = new THREE.Group();
    ecl.add(bright, dark);
    add(ecl, -0.3, 4.3, 0.5);
    b.animated.push({ update: (t, wake) => (dark.position.set(Math.sin(t * 0.07) * 0.45 - 0.1, Math.cos(t * 0.05) * 0.08, 0.05), ecl.scale.setScalar(1 + wake * 0.15)) });
  }
}

/* ---------------------------------------------------------------- all twenty-two */
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
      const b = new Being({ ...spec, under: LANDMARK_KINDS[i] === "deep" }, st);
      buildProps(b, this.group, stone);
      buildMoreProps(b, this.group, stone);
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
    floatAttributes(gltf.scene);
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

  /** Where to wake near a being, facing it: in front of it if that is dry ground, else the
      nearest dry ground around it; for those in the deep, on the water right above them. */
  approach(i: number): { x: number; z: number; heading: number } {
    const b = this.list[i];
    const p = b.root.position;
    if (b.spec.under) return { x: p.x, z: p.z + 3, heading: 0 };
    for (let k = 0; k < 16; k++) {
      const a = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
      const x = p.x + Math.sin(a) * 6.5, z = p.z + Math.cos(a) * 6.5;
      if (heightAt(x, z) > WATER_Y + 0.3) return { x, z, heading: a };
    }
    return { x: p.x, z: p.z + 6.5, heading: 0 };
  }

  update(t: number, dt: number, player: THREE.Vector3, reduced: boolean): void {
    // only the two nearest beings are drawn in full; the rest keep just their objects
    const order = this.list.map((b, i) => [i, b.distanceTo(player)] as const).sort((a, b) => a[1] - b[1]);
    const shown = new Set(order.filter(([, d], k) => k < 2 && d < 90).map(([i]) => i));
    this.list.forEach((b, i) => {
      b.update(dt, t, player, reduced, shown.has(i));
      if (!b.met && b.distanceTo(player) < (b.spec.under ? 9 : 7)) {
        b.met = true;
        b.greet();
        this.sparks.emit(this.tmp.copy(b.root.position).setY(b.root.position.y + 1.2), 24, new THREE.Color(...b.spec.tint).multiplyScalar(0.9), 1.1);
        this.onMeet?.(b.spec);
      }
    });
  }

  /** Arriving somewhere new: each greets you again (what they have told you stays told). */
  reset(): void {
    for (const b of this.list) b.met = false;
  }
}
