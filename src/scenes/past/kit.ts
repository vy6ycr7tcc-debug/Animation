/* What the Monument of Past Choices shares: its Atlantean architecture (pale veined marble laid in
   cut courses, gilded trim, fluted columns, fine inlays of sea-blue light) and its seated rooms.

   A seated room is a telling you sit down for: a stone seat faces the stage; sitting starts the
   recording and the stage follows it, every change a pure function of how much of the telling has
   been heard (0..1), eased; standing up stops it and the stage settles back into its waiting
   state. The owner: "sitting plays, standing stops". */
import * as THREE from "three/webgpu";
import { T, vnoise, type N } from "../../gpu/tsl";
import { landStone, type Masonry } from "../../world/stoneworks";
import type { Narration } from "../../core/narration";
import { LessonScene } from "../lessonKit";
import { seatStone } from "../visionLesson";
import { env } from "../enacted";
import { damp, merge, roomClock } from "../densities/roomKit";
import type { Room } from "../journey";

const { float, vec3, vec4 } = T;

/** Pale veined marble in cut courses (walls) or flagstones (floors). */
export function marble(tile = 2.6, masonry: Masonry = {}): THREE.MeshStandardNodeMaterial {
  return landStone("sandstone_cracks", 0, tile, [1, 1, 1], masonry, "marble");
}

/** Gilded trim: warm, a little worn, catching the light (never a mirror: nothing here reflects). */
export function gold(glow = 0.08): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0.25, roughness: 0.36 });
  const n = vnoise(T.positionWorld.xz.mul(3.1).add(T.positionWorld.y.mul(1.7)));
  m.colorNode = vec3(0.78, 0.56, 0.22).mul(n.mul(0.25).add(0.85));
  m.emissiveNode = vec3(1, 0.7, 0.3).mul(glow);
  return m;
}

/** A fluted column after the Ionic order: a moulded base, a shaft of `flutes` concave channels
    with a slight swelling (entasis), a rounded echinus and a square abacus. Its foot at 0. */
export function flutedColumn(r: number, h: number, flutes = 20): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const baseH = h * 0.05, capH = h * 0.07, shaftH = h - baseH - capH;
  const plinth = new THREE.BoxGeometry(r * 2.7, baseH * 0.45, r * 2.7);
  plinth.translate(0, baseH * 0.225, 0);
  const torus = new THREE.CylinderGeometry(r * 1.22, r * 1.3, baseH * 0.55, 40);
  torus.translate(0, baseH * 0.45 + baseH * 0.275, 0);
  parts.push(plinth, torus);
  const shaft = new THREE.CylinderGeometry(r * 0.86, r, shaftH, flutes * 4, 16, true);
  const p = shaft.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x), t = y / shaftH + 0.5;
    const channel = Math.pow(0.5 + 0.5 * Math.cos(a * flutes), 2) * 0.07;
    const swell = 1 + Math.sin(t * Math.PI) * 0.025;
    p.setXYZ(i, x * (1 - channel) * swell, y, z * (1 - channel) * swell);
  }
  shaft.computeVertexNormals();
  shaft.translate(0, baseH + shaftH / 2, 0);
  parts.push(shaft);
  const echinus = new THREE.CylinderGeometry(r * 1.2, r * 0.88, capH * 0.5, 40);
  echinus.translate(0, h - capH + capH * 0.25, 0);
  const abacus = new THREE.BoxGeometry(r * 2.6, capH * 0.5, r * 2.6);
  abacus.translate(0, h - capH * 0.25, 0);
  parts.push(echinus, abacus);
  return merge(parts);
}

/** A soft glow of sea-blue light inlaid in marble along a ring (the Atlantean touch): a thin
    band of radius `r` at height `y`, `w` metres tall. */
export function inlayRing(r: number, y: number, w: number, color: THREE.Color, k: N = float(1)): { mesh: THREE.Mesh; dispose(): void } {
  const g = new THREE.CylinderGeometry(r, r, w, 96, 1, true);
  g.translate(0, y, 0);
  const m = new THREE.MeshBasicNodeMaterial({ fog: true, side: THREE.DoubleSide });
  const edge = T.smoothstep(0, 0.35, T.uv().y).mul(T.smoothstep(1, 0.65, T.uv().y));
  m.colorNode = vec4(vec3(color.r, color.g, color.b).mul(edge.mul(0.7).add(0.3)).mul(k), 1);
  return { mesh: new THREE.Mesh(g, m), dispose: () => (g.dispose(), m.dispose()) };
}

/** Values that follow the telling: each a timeline of [fraction heard, value], eased; standing
    up, each settles back to where it began. */
export class Tells<K extends string> {
  readonly u = {} as Record<K, N>;
  readonly v = {} as Record<K, number>;
  constructor(private defs: Record<K, [number, number][]>, private k = 1.4) {
    for (const key of Object.keys(defs) as K[]) {
      this.v[key] = defs[key][0][1];
      this.u[key] = T.uniform(this.v[key]);
    }
  }
  step(f: number, dt: number, still: boolean): void {
    for (const key of Object.keys(this.defs) as K[]) {
      const goal = env(f, this.defs[key]);
      this.v[key] = still ? goal : damp(this.v[key], goal, this.k, dt);
      this.u[key].value = this.v[key];
    }
  }
}

export interface PastStage {
  /** `f` how much of the telling has been heard (0 when nobody sits), `on` 0..1 how seated,
      `still` a still frame (no easing: the telling as it stands at T). */
  update(dt: number, f: number, on: number, still: boolean): void;
  dispose(): void;
  loaded?: Promise<void>;
}
export interface SeatedCfg {
  id: string;
  /** The recording (a path under public/). */
  track: string;
  /** Its length, seconds (the still frames' measure; live, the recording's own). */
  len: number;
  seat: THREE.Vector3;
  /** Which way the seated one faces. */
  heading: number;
  make(group: THREE.Group, clock: N): PastStage;
}

/** A room with a seat: sitting starts the recording, standing stops it. */
export function seatedRoom(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void, cfg: SeatedCfg): Room {
  const clock = roomClock();
  let stage: PastStage | null = null;
  let on = 0;
  const lesson = new LessonScene(scene, narration, whisper, {
    id: cfg.id,
    trackId: cfg.track,
    seatPos: cfg.seat,
    seatHeading: cfg.heading,
    seatRadius: 1.3,
    beats: [],
    build: (ctx) => {
      ctx.group.add(seatStone(cfg.seat));
      stage = cfg.make(ctx.group, clock.u);
    },
  });
  const baseUpdate = lesson.update.bind(lesson), baseDispose = lesson.dispose.bind(lesson);
  lesson.update = (dt: number): void => {
    baseUpdate(dt);
    if (!stage) return;
    const d = Math.min(0.05, Math.max(0, dt));
    const seated = lesson.holdsMovement();
    const still = narration.debugTime !== null;
    on = still && seated ? 1 : on + ((seated ? 1 : 0) - on) * Math.min(1, d * (seated ? 0.6 : 0.4));
    const len = narration.progress()?.total ?? cfg.len;
    const f = seated ? Math.min(1, Math.max(0, narration.time() / len)) : 0;
    clock.tick(d);
    stage.update(d, f, on, still);
  };
  lesson.dispose = (): void => {
    stage?.dispose();
    baseDispose();
  };
  return Object.assign(lesson, { loaded: (stage as PastStage | null)?.loaded });
}

/** Stars on a sky dome: a sparse hash field (`density` of cells lit), twinkling a little. */
export function starField(d: N, t: N, density = 0.004, scale = 420): N {
  const c = T.floor(d.mul(scale));
  const h = T.fract(T.sin(T.dot(c, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const tw = T.sin(t.mul(float(0.8).add(h.mul(2))).add(h.mul(40))).mul(0.25).add(0.75);
  return T.smoothstep(1 - density, 1, h).mul(tw).mul(T.smoothstep(-0.05, 0.25, d.y));
}
