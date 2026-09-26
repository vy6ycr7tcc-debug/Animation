/* The voices of the archive, present. While an archive narration plays (an orb or a grove's
   fruit), the one it comes from appears beside you as a figure of light, and fades when the voice
   ends. Each has its own colour and its own form of light, drawn from how they described
   themselves in the archive; none is a portrait or an icon:
   - Ra: gold, calm, three fine rings turning slowly around it (the one, many times over);
   - Q'uo: three soft lights circling and meeting in it (a principle of three voices);
   - Hatonn: green and rose, a warm light breathing at the heart;
   - Latwii: pale violet-blue, quick, with bright motes darting and playing around it;
   - Oxal: indigo, a long veil of light drifting behind it;
   - Laitos: teal, slow ripples spreading from its feet;
   - Nona: rose, notes of light rising from its hands as it heals with song;
   - others: a pearl light in their own hue.
   It stands a little ahead and to the side, facing you, never between the camera and you. */
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { floatAttributes, loadBytes } from "../core/assets";
import { lightBodyMaterial, tickLightBody } from "../player/lightBody";
import { HEIGHT } from "../player/wanderer";
import { heightAt, WATER_Y } from "./terrain";

interface Look {
  tint: [number, number, number];
  pose: "Idle_Loop" | "Spell_Simple_Idle_Loop";
  form: "rings" | "three" | "heart" | "motes" | "veil" | "ripples" | "notes" | "none";
}
const LOOKS: Record<string, Look> = {
  Ra: { tint: [1.25, 1.0, 0.62], pose: "Spell_Simple_Idle_Loop", form: "rings" },
  "Q'uo": { tint: [1.0, 0.92, 1.2], pose: "Idle_Loop", form: "three" },
  Hatonn: { tint: [0.8, 1.15, 0.85], pose: "Spell_Simple_Idle_Loop", form: "heart" },
  Latwii: { tint: [0.82, 0.9, 1.3], pose: "Idle_Loop", form: "motes" },
  Oxal: { tint: [0.7, 0.68, 1.25], pose: "Idle_Loop", form: "veil" },
  Laitos: { tint: [0.7, 1.1, 1.1], pose: "Idle_Loop", form: "ripples" },
  Nona: { tint: [1.2, 0.82, 0.95], pose: "Spell_Simple_Idle_Loop", form: "notes" },
};
function lookFor(entity: string): Look {
  const known = LOOKS[entity];
  if (known) return known;
  // anyone else: pearl, in a hue of their own
  let h = 0;
  for (const ch of entity) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const c = new THREE.Color().setHSL(h / 997, 0.35, 0.8);
  return { tint: [c.r * 1.2, c.g * 1.2, c.b * 1.2], pose: "Idle_Loop", form: "none" };
}

function glowTex(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.3)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = glowTex();
const spark = (color: THREE.Color, size: number) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size);
  return s;
};
const lineMat = (color: THREE.Color, opacity = 0.7) =>
  new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const ring = (r: number, mat: THREE.LineBasicMaterial) =>
  new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, (_, i) => new THREE.Vector3(Math.cos((i / 64) * Math.PI * 2) * r, 0, Math.sin((i / 64) * Math.PI * 2) * r))), mat);

export class Presences {
  group = new THREE.Group();
  /** The one now present, or null. */
  entity: string | null = null;
  /** 1 while its voice is sounding: its light shimmers with it. */
  speaking = 0;
  private root = new THREE.Group();
  private body = new THREE.Group();
  private form = new THREE.Group();
  private skin = lightBodyMaterial(new THREE.Color(1, 1, 1));
  private mixer: THREE.AnimationMixer | null = null;
  private acts: Record<string, THREE.AnimationAction> = {};
  private k = 0; // presence, 0–1
  private want = 0;
  private place = new THREE.Vector3();
  private placed = false;
  private animate: ((t: number, k: number) => void) | null = null;

  constructor() {
    this.root.add(this.body, this.form);
    this.group.add(this.root);
    this.group.visible = false;
    this.skin.opacity = 0;
  }

  async load(path: string): Promise<void> {
    const bytes = await loadBytes(path);
    if (!bytes) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    floatAttributes(gltf.scene);
    const m = gltf.scene;
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = this.skin;
        mesh.frustumCulled = false;
      }
    });
    const box = new THREE.Box3().setFromObject(m, true);
    m.scale.setScalar(HEIGHT / (box.max.y - box.min.y || 1.8));
    this.body.add(m);
    this.mixer = new THREE.AnimationMixer(m);
    for (const name of ["Idle_Loop", "Spell_Simple_Idle_Loop"]) {
      const clip = gltf.animations.find((c) => c.name === name);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(0);
      this.acts[name] = a;
    }
  }

  /** Someone's voice begins (or null: it has ended). */
  show(entity: string | null): void {
    this.want = entity ? 1 : 0;
    if (!entity || entity === this.entity) return;
    this.entity = entity;
    this.placed = false;
    const look = lookFor(entity);
    const tint = new THREE.Color(...look.tint);
    this.skin.color.copy(tint).multiplyScalar(0.5);
    this.skin.emissive.copy(tint);
    for (const [name, a] of Object.entries(this.acts)) a.setEffectiveWeight(name === look.pose ? 1 : 0);
    this.buildForm(look.form, tint);
  }

  private buildForm(form: Look["form"], tint: THREE.Color): void {
    this.form.clear();
    this.animate = null;
    const f = this.form;
    if (form === "rings") {
      const rings = [0.55, 0.75, 0.95].map((r, i) => {
        const l = ring(r, lineMat(new THREE.Color(1.0, 0.85, 0.55), 0.55 - i * 0.1));
        l.position.y = 1.1;
        f.add(l);
        return l;
      });
      this.animate = (t) => rings.forEach((l, i) => ((l.rotation.x = Math.sin(t * 0.2 + i * 2.1) * 1.2), (l.rotation.z = t * (0.15 + i * 0.05))));
    } else if (form === "three") {
      const lights = [new THREE.Color(1.1, 0.9, 0.6), new THREE.Color(0.8, 0.9, 1.2), new THREE.Color(0.8, 1.1, 0.85)].map((c) => {
        const s = spark(c, 0.35);
        f.add(s);
        return s;
      });
      this.animate = (t) =>
        lights.forEach((s, i) => {
          const a = t * 0.6 + (i / 3) * Math.PI * 2, r = 0.45 + Math.sin(t * 0.35) * 0.25;
          s.position.set(Math.cos(a) * r, 1.15 + Math.sin(t * 0.8 + i) * 0.15, Math.sin(a) * r);
        });
    } else if (form === "heart") {
      const h = spark(new THREE.Color(1.1, 0.8, 0.85), 0.6);
      h.position.set(0, 1.25, -0.08);
      f.add(h);
      this.animate = (t, k) => h.scale.setScalar((0.45 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.3))) * k + 0.001);
    } else if (form === "motes") {
      const motes = Array.from({ length: 9 }, (_, i) => {
        const s = spark(i % 2 ? new THREE.Color(0.9, 0.95, 1.3) : new THREE.Color(1.2, 1.0, 1.25), 0.12);
        f.add(s);
        return s;
      });
      this.animate = (t) =>
        motes.forEach((s, i) => {
          const a = t * (1.2 + i * 0.13) + i * 1.7;
          s.position.set(Math.cos(a) * (0.5 + (i % 3) * 0.2), 0.6 + ((t * 0.4 + i * 0.29) % 1.3), Math.sin(a * 1.3) * (0.5 + (i % 3) * 0.2));
        });
    } else if (form === "veil") {
      const g = new THREE.PlaneGeometry(0.9, 1.8, 1, 16);
      const mat = new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(0.35), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const veil = new THREE.Mesh(g, mat);
      veil.position.set(0, 1.0, 0.35);
      f.add(veil);
      const base = (g.attributes.position.array as Float32Array).slice();
      this.animate = (t) => {
        const p = g.attributes.position.array as Float32Array;
        for (let i = 0; i < p.length; i += 3) p[i + 2] = base[i + 2] + Math.sin(t * 1.1 + base[i + 1] * 3) * 0.12 * (0.9 - base[i + 1]);
        g.attributes.position.needsUpdate = true;
      };
    } else if (form === "ripples") {
      const rs = [0, 1, 2].map(() => {
        const l = ring(1, lineMat(tint, 0.5));
        l.position.y = 0.05;
        f.add(l);
        return l;
      });
      this.animate = (t) =>
        rs.forEach((l, i) => {
          const u = (t * 0.25 + i / 3) % 1;
          l.scale.setScalar(0.3 + u * 2.2);
          (l.material as THREE.LineBasicMaterial).opacity = (1 - u) * 0.5;
        });
    } else if (form === "notes") {
      const notes = Array.from({ length: 6 }, () => {
        const s = spark(new THREE.Color(1.2, 0.9, 1.0), 0.14);
        f.add(s);
        return s;
      });
      this.animate = (t, k) =>
        notes.forEach((s, i) => {
          const u = (t * 0.3 + i / 6) % 1;
          s.position.set(Math.sin(u * 6 + i) * 0.25, 1.1 + u * 1.4, -0.3);
          s.material.opacity = Math.sin(u * Math.PI) * k;
        });
    }
  }

  /** Each frame. `yaw`: where the camera looks (the presence stands ahead of you, to one side). */
  update(t: number, dt: number, player: THREE.Vector3, yaw: number, underwater: boolean): void {
    this.k += (this.want - this.k) * Math.min(1, dt * (this.want ? 0.8 : 1.2));
    if (this.k < 0.003 && !this.want) {
      this.group.visible = false;
      if (this.entity) this.entity = null;
      return;
    }
    this.group.visible = true;
    // a place a few metres ahead and to the right of where you look; it keeps its place while
    // you stay near, and comes along if you wander on
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const ideal = new THREE.Vector3(player.x + fx * 3.6 + rx * 1.8, 0, player.z + fz * 3.6 + rz * 1.8);
    if (!this.placed || this.place.distanceTo(new THREE.Vector3(player.x, 0, player.z).setY(0)) > 9) {
      this.place.copy(ideal);
      this.placed = true;
    }
    this.place.lerp(ideal, Math.min(1, dt * 0.15));
    const ground = underwater ? player.y : Math.max(heightAt(this.place.x, this.place.z), WATER_Y);
    this.root.position.set(this.place.x, ground + 0.25 + Math.sin(t * 0.8) * 0.06 + (1 - this.k) * 0.6, this.place.z);
    this.root.rotation.y = Math.atan2(player.x - this.place.x, player.z - this.place.z); // it faces you
    this.skin.opacity = this.k;
    this.skin.emissiveIntensity = 0.9 + this.speaking * (0.15 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 3.1));
    tickLightBody(this.skin, t);
    this.form.visible = this.k > 0.05;
    this.form.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material & { opacity?: number; userData: { base?: number } };
      if (!m || m.opacity === undefined) return;
      if (m.userData.base === undefined) m.userData.base = m.opacity;
      m.opacity = m.userData.base * this.k;
    });
    this.animate?.(t, this.k);
    this.mixer?.update(dt);
  }
}
