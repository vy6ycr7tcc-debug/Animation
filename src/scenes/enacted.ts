/* An enacted lesson (the owner, 2026-09-30: the lessons' little symbols at a distance were "small,
   flat, and disconnected from what the words are saying"). A stone seat, and before it a stage that
   fills the view: one continuous scene at full scale that does what the narration says (a knot
   that unties, a coal that burns, a lantern that lights three steps of the dark), always moving,
   its biggest moments given the most weight. Sitting starts the recording; the stage follows its
   clock (a pure function of narration seconds, eased); standing up it settles back into its
   waiting state. Only drawn within reach of the seat.

   The stage's own frame: its foot on the ground, the seat `reach` metres toward +z (so the one
   seated looks toward −z), x to the seated one's right. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { softPoints, spriteCloud, T, type N, type SpriteCloud } from "../gpu/tsl";
import { heightAt } from "../world/terrain";
import { rng } from "../world/forms";
import { LessonScene, type SceneModule } from "./lessonKit";
import type { SiteDef } from "./sites";
import { seatStone } from "./visionLesson";
import { keepAlpha, roomClock } from "./densities/roomKit";

const { exp, length, smoothstep } = T;

export interface Stage {
  group: THREE.Group;
  /** `t` narration seconds (0 when nobody sits), `on` 0..1 how seated (eased), `dt` real seconds. */
  update(dt: number, t: number, on: number): void;
  dispose(): void;
  loaded?: Promise<void>;
}
export interface StageCtx {
  /** The stage's clock for its shaders (seconds, always running). */
  clock: N;
  /** Where the stage stands in the world, and which way its +z faces (toward the seat). */
  at: THREE.Vector3;
  face: number;
  /** The ground's height in the stage's own frame at local (x, z). */
  ground(x: number, z: number): number;
}

export interface EnactedCfg {
  id: string;
  trackId: string;
  site: SiteDef;
  /** How far before the seat the stage's foot stands (m). */
  reach: number;
  make(ctx: StageCtx): Stage;
}

/** Eased value along a timeline: `pts` are [second, value], held flat before the first and after
    the last; between two, a smooth step. */
export function env(t: number, pts: [number, number][]): number {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i];
    if (t <= t1) {
      const [t0, v0] = pts[i - 1];
      const x = (t - t0) / Math.max(1e-6, t1 - t0);
      return v0 + (v1 - v0) * x * x * (3 - 2 * x);
    }
  }
  return pts[pts.length - 1][1];
}

/** A cloud of soft round points sized in metres, with any per-point attributes the stage wants
    (each a vec of the given size), and `round`, the soft disc to multiply its colour by. */
export function cloud(n: number, size: number, layout: Record<string, number>): { c: SpriteCloud; m: THREE.PointsNodeMaterial; a: Record<string, Float32Array>; round: N; dirty(): void } {
  const m = softPoints();
  m.sizeAttenuation = true;
  m.size = size;
  keepAlpha(m);
  const c = spriteCloud(n, { position: 3, ...layout }, m);
  const a: Record<string, Float32Array> = {};
  for (const [k, v] of Object.entries(c.attrs)) a[k] = v.array as Float32Array;
  const r = length(T.pointUV.sub(0.5)).mul(2);
  const round = exp(r.mul(r).mul(-4)).mul(smoothstep(1, 0.7, r));
  return { c, m, a, round, dirty: () => { for (const v of Object.values(c.attrs)) v.needsUpdate = true; } };
}

export /** A hand as a body of light (not an outline): a palm and four fingers and a thumb filled with
    points, fingers up, the palm toward +z. `open` 0 curls the fingers in toward you, 1 opens them
    wide. The same seed gives the same points in the same order, so two openings can blend. */
function handVolume(n: number, seedN: number, open: number, s: number): Float32Array {
  const R = rng(seedN);
  const out = new Float32Array(n * 3);
  const curl = (1 - open) * 1.5, fan = open * 0.1;
  const fingers: [number, number, number][] = [[-0.46, 0.94, 0.12], [-0.155, 1.1, 0.13], [0.155, 1.02, 0.13], [0.46, 0.8, 0.115]];
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const pick = R();
    if (pick < 0.42) {
      // the palm: a flattened body, a little cupped
      let x = 0, y = 0, z = 0;
      do (x = R() * 2 - 1), (y = R() * 2 - 1), (z = R() * 2 - 1); while (x * x + y * y + z * z > 1);
      v.set(x * 0.64, y * 0.72 + 0.02, z * 0.2 + (x * x) * 0.12);
    } else if (pick < 0.88) {
      const f = fingers[Math.min(3, Math.floor(((pick - 0.42) / 0.46) * 4))];
      const [fx, len, rad] = f;
      const along = R();
      const a0 = (fx < 0 ? -1 : 1) * Math.abs(fx) * fan * 3;
      // the finger bends at its joints: the further along, the more it has turned
      const bend = curl * along * along;
      const L = len * along;
      const px = fx + Math.sin(a0) * L;
      const py = 0.66 + Math.cos(bend) * L * 0.95;
      const pz = Math.sin(bend) * L * 0.9;
      const rr = rad * (1 - along * 0.25) * Math.sqrt(R());
      const aa = R() * Math.PI * 2;
      v.set(px + Math.cos(aa) * rr, py + Math.sin(aa) * rr * 0.4, pz + Math.sin(aa) * rr);
    } else {
      // the thumb, out to the side and across
      const along = R();
      const ang = 0.9 - (1 - open) * 0.9;
      const L = 0.85 * along;
      const px = -0.6 - Math.sin(ang) * L + (1 - open) * along * 0.3;
      const py = -0.15 + Math.cos(ang) * L * 0.8;
      const pz = (1 - open) * along * 0.45;
      const rr = 0.14 * Math.sqrt(R()), aa = R() * Math.PI * 2;
      v.set(px + Math.cos(aa) * rr, py + Math.sin(aa) * rr, pz + Math.sin(aa) * rr * 0.8);
    }
    out.set([v.x * s, v.y * s, v.z * s], i * 3);
  }
  return out;
}

const DRAW_WITHIN = 190;

export function enactedLesson(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void, cfg: EnactedCfg): SceneModule & { loaded?: Promise<void> } {
  const { site } = cfg;
  const seatPos = new THREE.Vector3(site.x, heightAt(site.x, site.z), site.z);
  const sx = site.x - Math.sin(site.heading) * cfg.reach, sz = site.z - Math.cos(site.heading) * cfg.reach;
  const at = new THREE.Vector3(sx, heightAt(sx, sz), sz);
  const clock = roomClock();
  let stage: Stage | null = null;
  let on = 0;
  const lesson = new LessonScene(scene, narration, whisper, {
    id: cfg.id,
    trackId: cfg.trackId,
    seatPos,
    seatHeading: site.heading,
    beats: [],
    build: (ctx) => {
      ctx.group.add(seatStone(seatPos));
      const c = Math.cos(site.heading), sn = Math.sin(site.heading);
      const ground = (x: number, z: number) => heightAt(at.x + x * c + z * sn, at.z - x * sn + z * c) - at.y;
      stage = cfg.make({ clock: clock.u, at, face: site.heading, ground });
      stage.group.position.copy(at);
      stage.group.rotation.y = site.heading;
      ctx.group.add(stage.group);
    },
  });
  const baseUpdate = lesson.update.bind(lesson), baseDispose = lesson.dispose.bind(lesson);
  const eye = new THREE.Vector3();
  lesson.update = (dt: number): void => {
    baseUpdate(dt);
    if (!stage) return;
    const d = Math.min(0.05, Math.max(0, dt));
    const seated = lesson.holdsMovement();
    on += ((seated ? 1 : 0) - on) * Math.min(1, d * (seated ? 0.6 : 0.4));
    if (narration.debugTime !== null && seated) on = 1; // a still frame shows the telling as it stands at T
    // drawn only near the seat (or while a still frame looks at it)
    const cam = (scene.userData.camera as THREE.Camera | undefined) ?? null;
    const near = cam ? cam.getWorldPosition(eye).distanceTo(at) < DRAW_WITHIN : true;
    stage.group.visible = near || on > 0.01;
    if (!stage.group.visible) return;
    clock.tick(d);
    stage.update(d, seated ? narration.time() : 0, on);
  };
  lesson.dispose = (): void => {
    stage?.dispose();
    baseDispose();
  };
  return Object.assign(lesson, { loaded: (stage as Stage | null)?.loaded });
}
