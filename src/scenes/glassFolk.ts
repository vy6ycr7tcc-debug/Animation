/* The monuments' people: the game's own recorded figure (models/wanderer.glb, its clips) drawn in
   glass light, each in its own colour, as the fourth density's people are. Real models or nothing:
   no figure is ever built from primitives. A room says where each stands, what it does and how
   it glows; it can move them, turn them, brighten or fade them each frame. */
import * as THREE from "three/webgpu";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { lightBodyMaterial, tickLightBody } from "../player/lightBody";
import { loadBeingModel } from "../world/beings";

export type Act = "idle" | "sit" | "walk" | "reach" | "run";
const CLIPS: Record<Act, string> = { idle: "Idle_Loop", sit: "Sitting_Idle_Loop", walk: "Walk_Loop", reach: "Spell_Simple_Idle_Loop", run: "Jog_Fwd_Loop" };

export interface FolkSpec {
  x: number;
  z: number;
  y?: number;
  face: number;
  act: Act;
  tint: THREE.Color;
  scale?: number;
  /** Inner light (default the body's quiet glow). */
  glow?: { inner: number; edge: number; body: number };
}
export interface Body {
  spec: FolkSpec;
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  mat: THREE.MeshStandardNodeMaterial;
  ph: number;
  /** Change what it does (crossfades). */
  act(a: Act, speed?: number): void;
}

export class GlassFolk {
  readonly group = new THREE.Group();
  readonly bodies: Body[] = [];
  readonly loaded: Promise<void>;
  private time = 0;

  constructor(specs: FolkSpec[], seed = 1) {
    let s = seed;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.loaded = loadBeingModel("models/wanderer.glb").then((model) => {
      if (!model) return;
      for (const spec of specs) {
        const root = new THREE.Group();
        const m = cloneSkinned(model.model);
        const mat = lightBodyMaterial(spec.tint, spec.glow);
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.material = mat;
            mesh.castShadow = true;
            mesh.frustumCulled = false;
          }
        });
        m.rotation.y = Math.PI;
        m.scale.setScalar(model.scale * (spec.scale ?? 1));
        root.add(m);
        root.position.set(spec.x, spec.y ?? 0, spec.z);
        root.rotation.y = spec.face;
        this.group.add(root);
        const mixer = new THREE.AnimationMixer(m);
        let cur: THREE.AnimationAction | null = null;
        const act = (a: Act, speed = 0.75) => {
          const clip = model.clips.find((c) => c.name === CLIPS[a]) ?? model.clips.find((c) => c.name === "Idle_Loop");
          if (!clip) return;
          const next = mixer.clipAction(clip);
          next.timeScale = speed;
          if (next === cur) return;
          next.reset().play();
          if (cur) cur.crossFadeTo(next, 0.8, false);
          cur = next;
        };
        act(spec.act);
        mixer.update(R() * 4);
        this.bodies.push({ spec, root, mixer, mat, ph: R() * 6, act });
      }
    });
  }

  update(dt: number): void {
    this.time += dt;
    for (const b of this.bodies) {
      b.mixer?.update(dt);
      tickLightBody(b.mat, this.time + b.ph);
    }
  }

  dispose(): void {
    for (const b of this.bodies) b.mat.dispose();
  }
}
