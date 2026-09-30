/* A lesson told as a vision (scenes/visionStage.ts): a stone seat at the clearing, and before it,
   8.5 m ahead where the seated wanderer looks, the vision standing on the ground. Sitting starts
   the lesson's narration (lessonKit.ts) and the vision follows it; standing ends both. The world
   itself is the setting: nothing is built around it but the seat. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { etchedStone } from "../world/etching";
import { fbm, heightAt } from "../world/terrain";
import { LessonScene, type SceneModule } from "./lessonKit";
import type { SiteDef } from "./sites";
import { VisionStage, type Key, type Maker } from "./visionStage";
import { LEXICON, withLexicon } from "./lexicon";

export interface VisionLessonCfg {
  id: string;
  trackId: string;
  site: SiteDef;
  forms: Record<string, Maker>;
  keys: Key[];
  seedNum: number;
  /** How far before the seat the vision stands (m). */
  reach?: number;
}

/** A seat of rough stone (the world's stone idiom: displaced, flat shaded, etched gold). */
export function seatStone(at: THREE.Vector3): THREE.Mesh {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const d = 0.82 + fbm(v.x * 1.5 + 4.1, v.z * 1.5 + v.y * 1.2) * 0.3;
    p.setXYZ(i, v.x * d, v.y * d, v.z * d);
  }
  g.computeVertexNormals();
  const mat = etchedStone("#221e30", "#e9c37d", 1.6);
  mat.flatShading = true;
  const m = new THREE.Mesh(g, mat);
  m.scale.set(0.62, 0.42, 0.5);
  m.position.copy(at).setY(at.y + 0.14); // part-buried: it rests in the ground, never on it
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function visionLesson(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void, cfg: VisionLessonCfg): SceneModule {
  const { site } = cfg;
  const seatPos = new THREE.Vector3(site.x, heightAt(site.x, site.z), site.z);
  // the wanderer seated faces the site's heading; the vision stands ahead, facing back
  const reach = cfg.reach ?? 6.5;
  const sx = site.x - Math.sin(site.heading) * reach, sz = site.z - Math.cos(site.heading) * reach;
  let stage: VisionStage | null = null;
  const lesson = new LessonScene(scene, narration, whisper, {
    id: cfg.id,
    trackId: cfg.trackId,
    seatPos,
    seatHeading: site.heading,
    beats: [],
    build: (ctx) => {
      ctx.group.add(seatStone(seatPos));
      // the moments placed by hand, and between them more images called up by the narration's words
      stage = new VisionStage({ at: new THREE.Vector3(sx, heightAt(sx, sz), sz), face: site.heading, forms: { ...LEXICON, ...cfg.forms }, keys: withLexicon(cfg.trackId, cfg.keys), seedNum: cfg.seedNum });
      ctx.group.add(stage.group);
    },
  });
  const baseUpdate = lesson.update.bind(lesson), baseDispose = lesson.dispose.bind(lesson);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  lesson.update = (dt: number): void => {
    baseUpdate(dt);
    stage?.update(Math.min(0.05, dt), narration.time(), lesson.holdsMovement(), true, reduced);
  };
  lesson.dispose = (): void => {
    stage?.dispose();
    baseDispose();
  };
  return lesson;
}
