/* Creatures of light: second density, "turning toward the light" (Samuel's handbook, the
   bestiary). Real animated animals drawn in the same clear light as the wanderer. The models
   and their motion are by mirada, from the ROME project, via the three.js examples:
   - Horses: herds that roam the meadows in slow, dreamlike gallops. Rushing at them makes them
     wheel away. When the wanderer turns inward in stillness, they come close and stand.
   - Birds: storks, flamingos and parrots, in flocks wheeling slowly overhead.
   Nothing here can harm or be harmed; they are company. */
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadBytes } from "../core/assets";
import { lightBodyMaterial, tickLightBody } from "../player/lightBody";
import { groundKind, heightAt, WATER_Y } from "./terrain";

function hash(i: number, j: number, s: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

interface Animal {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
}

/** Load a model and its motion; make `n` copies of it in light of the given colours. */
async function herdOf(path: string, n: number, height: number, tints: THREE.Color[], faceZ: 1 | -1): Promise<Animal[]> {
  const bytes = await loadBytes(path);
  if (!bytes) return [];
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  const src = gltf.scene.getObjectByProperty("type", "Mesh") as THREE.Mesh | undefined;
  const clip = gltf.animations[0];
  if (!src || !clip) return [];
  const geo = src.geometry as THREE.BufferGeometry;
  geo.deleteAttribute("color");
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const k = height / Math.max(1e-3, bb.max.y - bb.min.y);
  const mats = tints.map((t) => lightBodyMaterial(t));
  const out: Animal[] = [];
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(geo, mats[i % mats.length]);
    mesh.name = src.name; // the motion finds its target by name
    mesh.morphTargetInfluences = [...(src.morphTargetInfluences ?? [])];
    mesh.morphTargetDictionary = src.morphTargetDictionary;
    mesh.scale.setScalar(k);
    mesh.position.y = -bb.min.y * k;
    if (faceZ === 1) mesh.rotation.y = Math.PI; // the game's creatures face −z
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    const obj = new THREE.Group();
    obj.add(mesh);
    const mixer = new THREE.AnimationMixer(mesh);
    const action = mixer.clipAction(clip);
    action.play();
    mixer.update(Math.random() * clip.duration);
    out.push({ obj, mixer, action });
  }
  return out;
}

interface Horse extends Animal {
  p: THREE.Vector3;
  heading: number;
  home: THREE.Vector3;
  goal: THREE.Vector3;
  speed: number;
  nextGoal: number;
  breathe: number;
}
interface Bird extends Animal {
  p: THREE.Vector3;
  v: THREE.Vector3;
  flock: number;
  phase: number;
}

export class Creatures {
  group = new THREE.Group();
  private horses: Horse[] = [];
  private birds: Bird[] = [];
  private mats = new Set<THREE.Material>();
  private herdAt = new THREE.Vector3(1e9, 0, 0);
  private tmp = new THREE.Vector3();
  private look = new THREE.Vector3();

  constructor(private horseCount = 8, private birdCount = 18) {
    void this.load();
  }

  private async load(): Promise<void> {
    const pale = new THREE.Color(1.05, 1.15, 1.35), gold = new THREE.Color(1.35, 1.1, 0.8), rose = new THREE.Color(1.35, 0.95, 1.1);
    const horses = await herdOf("models/animals/horse.glb", this.horseCount, 2.1, [pale, pale, gold], 1);
    this.horses = horses.map((a) => ({ ...a, p: new THREE.Vector3(), heading: Math.random() * 6.28, home: new THREE.Vector3(), goal: new THREE.Vector3(), speed: 0, nextGoal: 0, breathe: Math.random() * 6 }));
    const per = Math.ceil(this.birdCount / 3);
    const flocks = await Promise.all([
      herdOf("models/animals/stork.glb", per, 0.35, [new THREE.Color(1.0, 0.97, 0.92)], 1),
      herdOf("models/animals/flamingo.glb", per, 0.45, [rose], 1),
      herdOf("models/animals/parrot.glb", per, 0.3, [new THREE.Color(0.7, 1.0, 0.92), gold], 1),
    ]);
    flocks.forEach((f, flock) =>
      f.forEach((a) => {
        a.action.timeScale = 0.55 + Math.random() * 0.2;
        this.birds.push({ ...a, p: new THREE.Vector3(), v: new THREE.Vector3(), flock, phase: Math.random() * 6 });
      }),
    );
    for (const a of [...this.horses, ...this.birds]) {
      this.group.add(a.obj);
      a.obj.traverse((o) => (o as THREE.Mesh).isMesh && this.mats.add((o as THREE.Mesh).material as THREE.Material));
      a.obj.visible = false;
    }
  }

  /** Find open meadow near a point, for a herd to roam. */
  private meadowNear(x: number, z: number, seed: number): THREE.Vector3 | null {
    for (let k = 0; k < 30; k++) {
      const a = hash(seed, k, 1) * 6.28, r = 30 + hash(seed, k, 2) * 70;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const h = heightAt(px, pz);
      if (h > WATER_Y + 0.6 && h < 30 && groundKind(px, pz, h).stone < 0.3) return new THREE.Vector3(px, h, pz);
    }
    return null;
  }

  /** `still`: 0–1, the wanderer's stillness. `rushing`: running or gliding. */
  update(t: number, dt: number, player: THREE.Vector3, still: number, rushing: boolean, reduced: boolean): void {
    for (const m of this.mats) tickLightBody(m, t);
    if (!this.horses.length && !this.birds.length) return;
    // herds settle somewhere new when the wanderer has travelled far
    if (player.distanceTo(this.herdAt) > 160) {
      this.herdAt.copy(player);
      const herds = [0, 1].map((h) => this.meadowNear(player.x, player.z, Math.floor(t) * 7 + h));
      this.horses.forEach((hs, i) => {
        const home = herds[i % 2];
        hs.obj.visible = !!home;
        if (!home) return;
        hs.home.copy(home);
        hs.p.set(home.x + (Math.random() - 0.5) * 14, 0, home.z + (Math.random() - 0.5) * 14);
        hs.goal.copy(hs.p);
      });
    }
    for (const h of this.horses) {
      if (!h.obj.visible) continue;
      const toP = Math.hypot(player.x - h.p.x, player.z - h.p.z);
      h.nextGoal -= dt;
      let pace = 1.3;
      if (still > 0.4 && toP < 55) {
        // drawn to the stillness: come close, and stand facing the wanderer
        const a = Math.atan2(h.p.z - player.z, h.p.x - player.x);
        h.goal.set(player.x + Math.cos(a) * 4.5, 0, player.z + Math.sin(a) * 4.5);
      } else if (rushing && toP < 16) {
        // startled: wheel away in a gallop
        const a = Math.atan2(h.p.z - player.z, h.p.x - player.x) + (Math.random() - 0.5) * 0.6;
        h.goal.set(h.p.x + Math.cos(a) * 26, 0, h.p.z + Math.sin(a) * 26);
        h.nextGoal = 5;
        pace = 6;
      } else if (h.nextGoal <= 0) {
        h.goal.set(h.home.x + (Math.random() - 0.5) * 30, 0, h.home.z + (Math.random() - 0.5) * 30);
        h.nextGoal = 8 + Math.random() * 12;
      }
      const dx = h.goal.x - h.p.x, dz = h.goal.z - h.p.z;
      const dist = Math.hypot(dx, dz);
      const want = dist > 0.6 ? Math.min(pace, dist * 0.5) : 0;
      h.speed += (want - h.speed) * Math.min(1, dt * 1.2);
      if (dist > 0.4) {
        const hd = Math.atan2(-dx, -dz);
        h.heading += Math.atan2(Math.sin(hd - h.heading), Math.cos(hd - h.heading)) * Math.min(1, dt * 1.6);
      } else if (still > 0.4) {
        const hd = Math.atan2(-(player.x - h.p.x), -(player.z - h.p.z));
        h.heading += Math.atan2(Math.sin(hd - h.heading), Math.cos(hd - h.heading)) * Math.min(1, dt);
      }
      h.p.x -= Math.sin(h.heading) * h.speed * dt;
      h.p.z -= Math.cos(h.heading) * h.speed * dt;
      const g = heightAt(h.p.x, h.p.z);
      if (g < WATER_Y + 0.3) {
        h.goal.copy(h.home);
        h.nextGoal = 6;
      }
      h.p.y = Math.max(g, WATER_Y);
      h.obj.position.copy(h.p);
      h.obj.rotation.y = h.heading;
      // the gallop, slowed to a dream; standing, the motion rests and the body only breathes
      h.action.timeScale = reduced ? h.speed * 0.08 : h.speed * 0.17;
      h.breathe += dt;
      h.obj.scale.setScalar(1 + (h.speed < 0.2 && !reduced ? Math.sin(h.breathe * 1.2) * 0.008 : 0));
      if (toP < 140) h.mixer.update(dt);
    }
    // birds: loose flocks wheeling in wide circles above the wanderer
    for (const [i, b] of this.birds.entries()) {
      b.obj.visible = true;
      if (b.p.lengthSq() === 0 || b.p.distanceTo(player) > 300) b.p.set(player.x + (Math.random() - 0.5) * 90, player.y + 26 + Math.random() * 20, player.z + (Math.random() - 0.5) * 90);
      const a = t * (0.07 + b.flock * 0.018) + b.flock * 2.1;
      const r = 45 + b.flock * 24;
      this.tmp.set(
        player.x + Math.cos(a) * r + Math.sin(i * 1.3) * 6,
        Math.max(heightAt(b.p.x, b.p.z), WATER_Y) + 24 + b.flock * 10 + Math.sin(t * 0.3 + b.phase) * 4,
        player.z + Math.sin(a) * r + Math.cos(i * 2.1) * 6,
      );
      b.v.addScaledVector(this.tmp.sub(b.p), dt * 0.3).multiplyScalar(1 - dt * 0.22);
      b.p.addScaledVector(b.v, dt);
      b.obj.position.copy(b.p);
      if (b.v.lengthSq() > 1e-4) b.obj.lookAt(this.look.copy(b.p).sub(b.v)); // the model faces −z after the flip
      b.mixer.update(reduced ? dt * 0.5 : dt);
    }
  }
}
