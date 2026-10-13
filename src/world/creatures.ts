/* Creatures of light: second density, "turning toward the light" (Samuel's handbook, the
   bestiary). Real animated animals drawn in the same clear light as the wanderer. The models
   and their motion are by mirada, from the ROME project, via the three.js examples:
   - Horses: now spirits of light (world/spiritHorses.ts); `herdOf` still lends the rooms theirs.
   - Birds: storks, flamingos and parrots, in flocks wheeling slowly overhead.
   Nothing here can harm or be harmed; they are company. */
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadBytes } from "../core/assets";
import { lightBodyMaterial, tickLightBody } from "../player/lightBody";
import { heightAt, WATER_Y } from "./terrain";

export interface Animal {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
}

/** Load a model and its motion; make `n` copies of it in light of the given colours. */
export async function herdOf(path: string, n: number, height: number, tints: THREE.Color[], faceZ: 1 | -1, glow?: { inner: number; edge: number; body: number }): Promise<Animal[]> {
  const bytes = await loadBytes(path);
  if (!bytes) return [];
  let gltf: Awaited<ReturnType<GLTFLoader["parseAsync"]>>;
  try {
    gltf = await new GLTFLoader().parseAsync(bytes, "");
  } catch (e) {
    console.warn(`Could not read ${path}:`, e); // never a silent absence
    return [];
  }
  const src = gltf.scene.getObjectByProperty("type", "Mesh") as THREE.Mesh | undefined;
  const clip = gltf.animations[0];
  if (!src || !clip) return [];
  const geo = src.geometry as THREE.BufferGeometry;
  geo.deleteAttribute("color");
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const k = height / Math.max(1e-3, bb.max.y - bb.min.y);
  const mats = tints.map((t) => lightBodyMaterial(t, glow));
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

interface Bird extends Animal {
  p: THREE.Vector3;
  v: THREE.Vector3;
  flock: number;
  phase: number;
  /** The ground under it, refreshed every few frames. */
  ground?: number;
}

export class Creatures {
  group = new THREE.Group();
  private birds: Bird[] = [];
  private mats = new Set<THREE.Material>();
  private tmp = new THREE.Vector3();
  private look = new THREE.Vector3();

  constructor(private birdCount = 18) {
    void this.load();
  }

  private async load(): Promise<void> {
    const gold = new THREE.Color(1.35, 1.1, 0.8), rose = new THREE.Color(1.35, 0.95, 1.1);
    // in the world they glow a little more than the wanderer (glass light at 30 m in the night
    // all but vanished), and the birds are true to size (a stork about a metre, not a hand)
    const seen = { inner: 0.32, edge: 1.0, body: 0.5 };
    const per = Math.ceil(this.birdCount / 3);
    const flocks = await Promise.all([
      herdOf("models/animals/stork.glb", per, 0.9, [new THREE.Color(1.0, 0.97, 0.92)], 1, seen),
      herdOf("models/animals/flamingo.glb", per, 1.0, [rose], 1, seen),
      herdOf("models/animals/parrot.glb", per, 0.55, [new THREE.Color(0.7, 1.0, 0.92), gold], 1, seen),
    ]);
    flocks.forEach((f, flock) =>
      f.forEach((a) => {
        a.action.timeScale = 0.55 + Math.random() * 0.2;
        this.birds.push({ ...a, p: new THREE.Vector3(), v: new THREE.Vector3(), flock, phase: Math.random() * 6 });
      }),
    );
    for (const a of this.birds) {
      this.group.add(a.obj);
      a.obj.traverse((o) => (o as THREE.Mesh).isMesh && this.mats.add((o as THREE.Mesh).material as THREE.Material));
      a.obj.visible = false;
    }
  }

  update(t: number, dt: number, player: THREE.Vector3, reduced: boolean): void {
    for (const m of this.mats) tickLightBody(m, t);
    if (!this.birds.length) return;
    // birds: loose flocks wheeling in wide circles above the wanderer
    this.frameN++;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      b.obj.visible = true;
      const far = b.p.lengthSq() === 0 ? Infinity : b.p.distanceTo(player);
      if (far > 300) b.p.set(player.x + (Math.random() - 0.5) * 90, player.y + 26 + Math.random() * 20, player.z + (Math.random() - 0.5) * 90);
      // the ground under it changes slowly: asked every 8th frame, each bird on its own frame
      if ((this.frameN + i) % 8 === 0 || b.ground === undefined) b.ground = Math.max(heightAt(b.p.x, b.p.z), WATER_Y);
      const a = t * (0.07 + b.flock * 0.018) + b.flock * 2.1;
      const r = 30 + b.flock * 14;
      this.tmp.set(
        player.x + Math.cos(a) * r + Math.sin(i * 1.3) * 6,
        b.ground + 14 + b.flock * 6 + Math.sin(t * 0.3 + b.phase) * 3,
        player.z + Math.sin(a) * r + Math.cos(i * 2.1) * 6,
      );
      b.v.addScaledVector(this.tmp.sub(b.p), dt * 0.3).multiplyScalar(1 - dt * 0.22);
      b.p.addScaledVector(b.v, dt);
      b.obj.position.copy(b.p);
      if (b.v.lengthSq() > 1e-4) b.obj.lookAt(this.look.copy(b.p).sub(b.v)); // the model faces −z after the flip
      if (far < 200) b.mixer.update(reduced ? dt * 0.5 : dt); // beyond, its wingbeat can't be seen
    }
  }
  private frameN = 0;
}
