/* Whispers: seven recorded tellings hidden in the world, found only by being there (the owner's
   brief). No marker, no badge, no toast: something in the world answers a curious visitor, and
   the voice begins. Each plays once, on its finding; the found ones wait in a quiet list under
   the map ("Whispers"), to hear again. Curiosity is the only tutorial.

   How each is met follows how its people met the unseen (the research is in the PR):
   - A door of the unseen: one of the pyramid's eight false doors breathes deeper than the others
     as you come near (the west face's, where the sun goes down). Old Kingdom tombs asked those
     who passed to stop and speak the offering for the one within: a passer-by who stops before
     it in stillness through its long breaths (or touches it) is answered; a small flame then
     burns on its offering table.
   - The count of days: off the way in the drowned Maya city, behind the pyramid's far corner, a
     small vaulted room with a warm light in its door, and in it a round stone carved with the
     twenty days. Its people counted the days, and a daykeeper's prayer keeps their count: rest
     still before it and its days light one by one, about a breath each; when the twenty are
     lit the stone speaks.
   - Worlds: one world among the planets that wanders (all the others hold still), three small
     companions round it, one of them only a ring of broken stone. Tap it.
   - The quartz: in one crystal garden, a clear quartz standing a little apart, its light keeping
     a slower double beat than the others, and it hums (heard only near it). Tap it, or lay your
     hands on it.
   - Look up: one star low in the north, brighter than its neighbours. Hold your gaze on it,
     still, and it brightens as you wait; or tap it.
   - Reaching out: a great old tree alone on a knoll, off every path, its crown's lights drifting
     toward you as you come. Lay your hands on it (hold on it), or tap it.
   - Rapa Nui: its own small area (world/ancient/rapaNui.ts); the telling begins as you arrive.
   Nothing here plays while a tour leads or an archive narration speaks; a stillness-found one
   waits while "Only nature" rests the voices (a tap is your own choice, and still speaks). */
import * as THREE from "three/webgpu";
import { T, gpuUniforms, outOfTheWay, softDot, pointR, softPoints, spriteCloud, viewDepth, worldPoints } from "../gpu/tsl";
import { barkMaterial, grow, prismGeometry, tubes, type TreeShape } from "./creation";
import { GROVE_SITES } from "./sites";
import { CAVE_SITES, GLADES, KEEP_CLEAR, LANDMARK_SITES, SPAWN, WATER_Y, colliders, heightAt, keptClear } from "./terrain";
import { SITES } from "../scenes/sites";
import { halo, planetMaterial } from "./vessels";
import type { FalseDoors } from "./falseDoors";
import type { Area } from "./ancient";

export type WhisperId = "door" | "days" | "rapa" | "worlds" | "sky" | "tree" | "quartz";
export interface WhisperDef {
  id: WhisperId;
  /** Its recording's catalogue id (content/narration.json). */
  track: string;
  title: string;
  /** Where it was found, said quietly in the list. */
  where: string;
}
export const WHISPERS: WhisperDef[] = [
  { id: "door", track: "WHISPER-DOOR", title: "A door of the unseen", where: "a door at the pyramid's foot" },
  { id: "days", track: "WHISPER-DAYS", title: "The count of days", where: "a stone beneath the water" },
  { id: "rapa", track: "WHISPER-RAPA-NUI", title: "Rapa Nui", where: "the ancestors over the sea" },
  { id: "worlds", track: "WHISPER-WORLDS", title: "Worlds", where: "a world that wanders" },
  { id: "sky", track: "WHISPER-SKY", title: "Look up", where: "a star in the north" },
  { id: "tree", track: "WHISPER-TREE", title: "Reaching out", where: "a tree alone" },
  { id: "quartz", track: "WHISPER-QUARTZ", title: "The quartz", where: "among the crystals" },
];
export const whisperOf = (id: WhisperId): WhisperDef => WHISPERS.find((w) => w.id === id)!;
export const whisperForTrack = (track: string | null): WhisperDef | undefined => WHISPERS.find((w) => w.track === track);

const KEY = "inward-journey:whispers";
const { clamp, float, fract, max, mix, normalize, sin, smoothstep, uniform, vec3, vec4 } = T;
const V3 = THREE.Vector3;

/* ---------------------------------------------------------------- where the tree stands alone */
/** A knoll off every path: dry ground 300–900 m from the shore, higher than the land about it,
    far from the homes, the monuments, the groves, the lessons, the caves and the glades. */
export const LONE_TREE = (() => {
  let best = { x: 360, z: -360, y: heightAt(360, -360) }, bestScore = -Infinity;
  const lessons = Object.values(SITES);
  for (let r = 300; r <= 900; r += 20)
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2 + r * 0.001, x = SPAWN.x + Math.sin(a) * r, z = SPAWN.z + Math.cos(a) * r;
      const h = heightAt(x, z);
      if (h < 4 || h > 40) continue;
      if (keptClear(x, z, 70)) continue;
      if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 160)) continue;
      if (GROVE_SITES.some((g) => Math.hypot(x - g.x, z - g.z) < 130)) continue;
      if (lessons.some((s) => Math.hypot(x - s.x, z - s.z) < 150)) continue;
      if (CAVE_SITES.some((c) => Math.hypot(x - c.x, z - c.z) < 90)) continue;
      if (GLADES.some((g) => Math.hypot(x - g.x, z - g.z) < g.r + 50)) continue;
      // a knoll: higher than the ground round it, gentle on top
      let ring = 0, rough = 0;
      for (let j = 0; j < 8; j++) {
        const b = (j / 8) * Math.PI * 2;
        ring += heightAt(x + Math.cos(b) * 30, z + Math.sin(b) * 30) / 8;
        rough = Math.max(rough, Math.abs(heightAt(x + Math.cos(b) * 5, z + Math.sin(b) * 5) - h));
      }
      if (rough > 1.4) continue;
      const score = (h - ring) * 1.5 - rough * 2 - Math.abs(r - 600) * 0.004;
      if (score > bestScore) (bestScore = score), (best = { x, z, y: h });
    }
  // alone: the world's own trees keep their distance
  KEEP_CLEAR.push({ x: best.x, z: best.z, r: 26 });
  return best;
})();

/* ---------------------------------------------------------------- the store */
function load(): Set<WhisperId> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set((Array.isArray(v) ? v : []).filter((x) => WHISPERS.some((w) => w.id === x)));
  } catch {
    return new Set();
  }
}

/** What to tap: where it is now, how big it is, and from how far a tap may reach it. */
interface Tappable {
  id: WhisperId;
  at: () => THREE.Vector3;
  r: number;
  far: number;
}

export class Whispers {
  readonly group = new THREE.Group();
  readonly found: Set<WhisperId> = load();
  /** 0–1: how near the singing quartz is (for its hum). */
  hum = 0;
  private uT = uniform(0);
  private taps: Tappable[] = [];
  // the deepest door
  private doorStill = 0;
  // the stone of days
  private daysLit = 0;
  // the wandering world
  private world = new THREE.Group();
  private worldCentre = new V3();
  private worldAt = new V3();
  private worldMat: ReturnType<typeof planetMaterial>;
  private companions: { mesh: THREE.Object3D; r: number; w: number; ph: number; tilt: number }[] = [];
  // the quartz
  private quartzAt = new V3();
  private quartzStill = 0;
  private uQuartz = uniform(0);
  // the star
  private star = new THREE.Group();
  private starDir = new V3();
  private starCore: THREE.Sprite;
  private starRays: THREE.Sprite;
  private gaze = 0;
  // the tree
  private treeAt = new V3();
  private treeR = 1;
  private uTree = uniform(0);
  private uTreeTo = uniform(new V3());
  private v = new V3();
  private v2 = new V3();

  constructor(
    phone: boolean,
    private doors: FalseDoors,
    private maya: Area | undefined,
  ) {
    void phone;
    this.doors.setOffered(this.found.has("door"));
    this.maya?.secret?.set(this.found.has("days") ? 20 : 0, this.found.has("days"));

    /* the wandering world: among the planets, the one that moves */
    {
      const a = 2.15, r = 520;
      this.worldCentre.set(SPAWN.x + Math.sin(a) * r, 82, SPAWN.z + Math.cos(a) * r);
      this.worldAt.set(this.worldCentre.x + 140, this.worldCentre.y, this.worldCentre.z);
      this.worldMat = planetMaterial(new THREE.Color(0.96, 0.9, 0.78), new THREE.Color(0.66, 0.74, 0.9), 0.73);
      const planet = new THREE.Mesh(new THREE.SphereGeometry(9, 40, 28), this.worldMat);
      const glow = halo(new THREE.Color(1, 0.95, 0.85), 20);
      glow.material.opacity = 0.45;
      this.world.add(planet, glow);
      // a veiled gold world, a red one, and one that is only a ring of broken stone
      const gold = new THREE.Mesh(new THREE.SphereGeometry(1.9, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.6) }));
      gold.add(halo(new THREE.Color(1, 0.88, 0.6), 6.5));
      const red = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.86, 0.38, 0.26) }));
      const shards = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.5, 0.48) }), 70);
      {
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new V3();
        for (let i = 0; i < 70; i++) {
          const b = (i / 70) * Math.PI * 2 + Math.sin(i * 7.1) * 0.05, rr = 34 + Math.sin(i * 3.3) * 2.2;
          q.setFromEuler(e.set(i * 1.3, i * 2.1, i * 0.7));
          const k = 0.5 + ((i * 0.618) % 1) * 1.2;
          m.compose(new V3(Math.cos(b) * rr, Math.sin(i * 5.7) * 0.9, Math.sin(b) * rr), q, s.set(k, k * 0.7, k));
          shards.setMatrixAt(i, m);
        }
      }
      const belt = new THREE.Group();
      belt.add(shards);
      this.world.add(gold, red, belt);
      this.companions.push({ mesh: gold, r: 18, w: 0.09, ph: 0, tilt: 0.25 }, { mesh: red, r: 25, w: 0.06, ph: 2.4, tilt: 0.2 }, { mesh: belt, r: 0, w: 0.012, ph: 0, tilt: 0.32 });
      this.group.add(this.world);
      this.taps.push({ id: "worlds", at: () => this.worldAt, r: 12, far: 420 });
    }

    /* the singing quartz: a little apart in the first crystal garden */
    {
      const g = GROVE_SITES.find((s) => s.crystal) ?? GROVE_SITES[0];
      const a = Math.atan2(g.x - SPAWN.x, g.z - SPAWN.z) + 0.9;
      const x = g.x + Math.sin(a) * 6.5, z = g.z + Math.cos(a) * 6.5, y = heightAt(x, z);
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
      {
        const n = normalize(T.normalWorld), vv = normalize(T.cameraPosition.sub(T.positionWorld));
        const rim = float(1).sub(T.abs(T.dot(n, vv))).pow(2.2);
        // a slow double beat: two soft swells close together, then a long rest (the others burn steady)
        const ph = fract(this.uT.div(6.5));
        const beat = smoothstep(0.0, 0.06, ph).mul(smoothstep(0.2, 0.08, ph)).add(smoothstep(0.18, 0.26, ph).mul(smoothstep(0.42, 0.28, ph)).mul(0.7));
        const inner = T.positionGeometry.y.add(0.5).clamp(0, 1);
        const col = mix(vec3(0.75, 0.86, 0.95), vec3(1, 1, 1), rim).mul(rim.mul(0.55).add(0.1).add(beat.mul(0.35).mul(inner.oneMinus().mul(0.5).add(0.5))).add(this.uQuartz.mul(0.25)));
        m.colorNode = vec4(col, 1);
        m.opacityNode = rim.mul(0.6).add(0.22).add(beat.mul(0.15));
      }
      const crystal = new THREE.Mesh(prismGeometry(), m);
      crystal.position.set(x, y - 0.12, z);
      crystal.scale.set(0.62, 2.6, 0.62);
      crystal.rotation.set(0.12, a, -0.08);
      crystal.renderOrder = 2;
      const light = halo(new THREE.Color(0.85, 0.92, 1), 3.2);
      light.material.opacity = 0.35;
      light.position.set(x, y + 1.3, z);
      this.group.add(crystal, light);
      this.quartzAt.set(x, y + 1.2, z);
      colliders.push({ x, z, r: 0.4, top: y + 2.6 });
      this.taps.push({ id: "quartz", at: () => this.quartzAt, r: 0.8, far: 70 });
    }

    /* the star in the north: brighter than its neighbours, low over the deep night */
    {
      const az = 0.32, el = 0.52;
      this.starDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
      const mk = (c: THREE.Color, size: number, op: number) => {
        const s = halo(c, size);
        s.material.opacity = op;
        s.material.depthTest = true;
        return s;
      };
      this.starCore = mk(new THREE.Color(0.9, 0.95, 1), 9, 0.9);
      this.starRays = new THREE.Sprite(new THREE.SpriteMaterial({ map: raysTexture(), color: new THREE.Color(0.85, 0.92, 1), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.5 }));
      this.starRays.scale.setScalar(26);
      this.star.add(this.starCore, this.starRays);
      this.star.renderOrder = -1;
      this.group.add(this.star);
      this.taps.push({ id: "sky", at: () => this.star.position, r: 6, far: 2000 });
    }

    /* the tree alone */
    {
      const T0 = LONE_TREE;
      const shape: TreeShape = { height: 13, radius: 1.05, limbs: 7, depth: 2, spread: 1.2, limbLen: 7.5, bend: 0.85, roots: 12, rootLen: 9, leaves: 8 };
      const { limbs, roots, tips } = grow(shape, 0.611);
      const tree = new THREE.Group();
      tree.position.set(T0.x, T0.y - 0.1, T0.z);
      tree.rotation.y = 0.7;
      tree.scale.setScalar(1.25);
      const accent = new THREE.Color(1.0, 0.82, 0.62);
      const bark = new THREE.Mesh(tubes(limbs).clone(), barkMaterial(accent, 0.37));
      const rootsMesh = new THREE.Mesh(tubes(roots, -0.2), barkMaterial(accent, 0.37));
      bark.castShadow = true;
      tree.add(bark, rootsMesh);
      this.group.add(tree);
      tree.updateMatrixWorld(true);
      // its crown's lights: they drift toward you as you come near (it reaches out first)
      const pts: number[] = [];
      let s = 4127;
      const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (const tp of tips) for (let k = 0; k < 9; k++) pts.push(...this.v.set(tp.x + (R() - 0.5) * 2.8, tp.y + (R() - 0.3) * 1.9, tp.z + (R() - 0.5) * 2.8).applyMatrix4(tree.matrixWorld).toArray());
      this.group.add(crownLights(new Float32Array(pts), this.uT, this.uTree, this.uTreeTo));
      this.treeAt.set(T0.x, T0.y, T0.z);
      this.treeR = shape.radius * 1.25;
      colliders.push({ x: T0.x, z: T0.z, r: this.treeR * 1.2, top: T0.y + 16 });
      this.taps.push({ id: "tree", at: () => this.v2.set(T0.x, T0.y + 3, T0.z), r: 3, far: 60 });
    }

    /* the door and the stone of days can be tapped too */
    const d = this.doors.doors[this.doors.deepest];
    this.taps.push({ id: "door", at: () => d.at, r: 1.6, far: 40 });
    const sec = this.maya?.secret;
    if (sec) this.taps.push({ id: "days", at: () => sec.at, r: 1.0, far: 14 });
  }

  /** The tree and the quartz, to lay hands on (world/touch.ts). */
  touchables(): { kind: "tree" | "crystal"; x: number; y: number; z: number; r: number; h: number }[] {
    const q = this.quartzAt, t = this.treeAt;
    return [
      { kind: "tree", x: t.x, y: t.y, z: t.z, r: this.treeR, h: 16 },
      { kind: "crystal", x: q.x, y: q.y - 1.2, z: q.z, r: 0.5, h: 2.4 },
    ];
  }

  /** Which whisper a laid-on hand found, if any. */
  touched(at: THREE.Vector3): WhisperId | null {
    if (Math.hypot(at.x - this.treeAt.x, at.z - this.treeAt.z) < this.treeR + 1.5) return "tree";
    if (Math.hypot(at.x - this.quartzAt.x, at.z - this.quartzAt.z) < 1.5) return "quartz";
    return null;
  }

  has(id: WhisperId): boolean {
    return this.found.has(id);
  }
  /** Marks it found (saved on the device). Returns false if it was already. */
  markFound(id: WhisperId): boolean {
    if (this.found.has(id)) return false;
    this.found.add(id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.found]));
    } catch {
      /* private window: found for this visit */
    }
    if (id === "door") this.doors.setOffered(true);
    if (id === "days") this.maya?.secret?.set(20, true);
    return true;
  }
  /** The found ones, in the order they are listed. */
  list(): WhisperDef[] {
    return WHISPERS.filter((w) => this.found.has(w.id));
  }

  /** A tap: which whisper's thing is under it (generous on a phone), if any. */
  pick(x: number, y: number, camera: THREE.PerspectiveCamera): WhisperId | null {
    let best: WhisperId | null = null, bd = Infinity;
    for (const t of this.taps) {
      if (t.id === "sky" && !this.star.visible) continue;
      if (t.id === "worlds" && !this.world.visible) continue;
      const p = t.at(), d = p.distanceTo(camera.position);
      if (d - t.r > t.far) continue;
      this.v.copy(p).project(camera);
      if (this.v.z > 1) continue;
      const sx = (this.v.x * 0.5 + 0.5) * innerWidth, sy = (-this.v.y * 0.5 + 0.5) * innerHeight;
      const pxR = (t.r / d) * (innerHeight / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      const off = Math.hypot(sx - x, sy - y);
      if (off < Math.max(34, pxR * 1.5) && d < bd) (bd = d), (best = t.id);
    }
    return best;
  }

  /** Still frames (`?shot=whisper-<id>&t=<0..1>`): hold a discovery's cue this far along (the
      door's nearness, the days lit, the gaze on the star, the tree reaching), and where to look. */
  hold: { id: WhisperId; k: number } | null = null;
  shotView(id: WhisperId): { eye: THREE.Vector3; look: THREE.Vector3; stand: THREE.Vector3 } {
    const toShore = (p: THREE.Vector3) => new V3(SPAWN.x - p.x, 0, SPAWN.z - p.z).normalize();
    const ground = (x: number, z: number) => new V3(x, heightAt(x, z), z);
    if (id === "door") {
      const d = this.doors.doors[this.doors.deepest], side = new V3(-d.out.z, 0, d.out.x);
      const stand = ground(d.at.x + d.out.x * 3, d.at.z + d.out.z * 3);
      return { eye: d.at.clone().addScaledVector(d.out, 6.5).addScaledVector(side, 1.8).setY(stand.y + 2.0), look: d.at.clone().setY(d.at.y - 0.2), stand };
    }
    if (id === "days" && this.maya?.secret) {
      const { at, door } = this.maya.secret, out = door.clone().sub(at).normalize();
      return { eye: door.clone().addScaledVector(out, 1.2).setY(door.y + 0.5), look: at.clone(), stand: door.clone().addScaledVector(out, 3.2).setY(door.y - 1.3) };
    }
    if (id === "worlds") {
      const u = toShore(this.worldAt), stand = ground(this.worldAt.x + u.x * 150, this.worldAt.z + u.z * 150);
      return { eye: stand.clone().setY(stand.y + 2), look: this.worldAt.clone(), stand };
    }
    if (id === "quartz") {
      const u = toShore(this.quartzAt), stand = ground(this.quartzAt.x + u.x * 7.5, this.quartzAt.z + u.z * 7.5);
      return { eye: this.quartzAt.clone().addScaledVector(u, 5.5).setY(this.quartzAt.y + 1.0), look: this.quartzAt.clone().setY(this.quartzAt.y - 0.2), stand };
    }
    if (id === "sky") {
      // on dry land, the north before you
      let k = 0;
      while (k < 400 && heightAt(SPAWN.x - this.starDir.x * k, SPAWN.z - this.starDir.z * k) < WATER_Y + 1) k += 10;
      const stand = ground(SPAWN.x - this.starDir.x * (k + 10), SPAWN.z - this.starDir.z * (k + 10)), eye = stand.clone().setY(stand.y + 1.7);
      return { eye, look: eye.clone().add(this.v.copy(this.starDir).setY(this.starDir.y - 0.18).multiplyScalar(100)), stand };
    }
    const u = toShore(this.treeAt), stand = ground(this.treeAt.x + u.x * 11, this.treeAt.z + u.z * 11);
    return { eye: this.treeAt.clone().addScaledVector(u, 21).setY(stand.y + 3.2), look: this.treeAt.clone().setY(this.treeAt.y + 6.5), stand };
  }

  /** Each frame in the open world. `still`: the visitor is at rest (not walking, flying or
      swimming about). Returns a whisper found by stillness this frame, if any. */
  update(dt: number, t: number, s: { pos: THREE.Vector3; still: boolean; under: boolean; camera: THREE.Camera; outdoors: boolean; reduced: boolean }): WhisperId | null {
    this.uT.value = s.reduced ? t * 0.6 : t;
    let got: WhisperId | null = null;
    const P = s.pos;

    const H = this.hold;
    // the deepest door: stand before it, still, through its long breaths (about two of them)
    {
      const d = this.doors.doors[this.doors.deepest];
      const dx = P.x - d.at.x, dz = P.z - d.at.z, dist = Math.hypot(dx, dz);
      const before = dist < 4.5 && dx * d.out.x + dz * d.out.z > 0.5;
      this.doorStill = before && s.still ? this.doorStill + dt : Math.max(0, this.doorStill - dt * 2);
      if (H?.id === "door") this.doorStill = 0;
      if (this.doorStill > 22 && !this.found.has("door")) got = "door";
    }

    // the stone of days: rest before it and its days light one by one
    const sec = this.maya?.secret;
    if (sec && !this.found.has("days")) {
      const dist = P.distanceTo(sec.at);
      const before = dist < 5 && this.v.subVectors(sec.door, sec.at).dot(this.v2.subVectors(P, sec.at)) > 0;
      if (before && s.still) this.daysLit = Math.min(20, this.daysLit + dt / 1.1);
      else this.daysLit = Math.max(0, this.daysLit - dt * 1.5);
      if (H?.id === "days") this.daysLit = Math.min(19.9, H.k * 20);
      sec.set(this.daysLit, false);
      if (this.daysLit >= 20 && !H) got = "days";
    }

    // the wandering world: a slow wide circle among the planets, its companions about it
    {
      const a = t * 0.0016;
      this.worldAt.set(this.worldCentre.x + Math.cos(a) * 140, this.worldCentre.y + Math.sin(t * 0.03) * 3, this.worldCentre.z + Math.sin(a) * 140);
      this.world.position.copy(this.worldAt);
      this.world.visible = s.outdoors && this.worldAt.distanceTo(P) < 1800;
      this.worldMat.uniforms.uT.value = t;
      this.worldMat.uniforms.uNear.value = 1 - THREE.MathUtils.smoothstep(this.worldAt.distanceTo(P), 120, 400);
      for (const c of this.companions) {
        const b = c.ph + t * c.w;
        if (c.r > 0) c.mesh.position.set(Math.cos(b) * c.r, Math.sin(b) * c.r * c.tilt, Math.sin(b) * c.r);
        else c.mesh.rotation.set(c.tilt, b, 0);
      }
    }

    // the quartz: its hum near it, and stillness before it (or hands on it) finds it
    {
      const dist = Math.hypot(P.x - this.quartzAt.x, P.z - this.quartzAt.z);
      this.hum = s.outdoors ? 1 - THREE.MathUtils.smoothstep(dist, 2.5, 11) : 0;
      this.uQuartz.value = this.hum;
      this.quartzStill = dist < 3.2 && s.still ? this.quartzStill + dt : Math.max(0, this.quartzStill - dt * 2);
      if (H) this.quartzStill = 0;
      if (this.quartzStill > 14 && !this.found.has("quartz")) got = "quartz";
    }

    // the star: where the sky is, far off along its way; held in the gaze, it brightens
    {
      const cam = s.camera;
      this.star.position.copy(cam.position).addScaledVector(this.starDir, 760);
      this.star.visible = s.outdoors && !s.under;
      cam.getWorldDirection(this.v);
      const on = this.star.visible && s.still && this.v.dot(this.starDir) > Math.cos(THREE.MathUtils.degToRad(8));
      this.gaze = on ? this.gaze + dt : Math.max(0, this.gaze - dt * 0.6);
      if (H?.id === "sky") this.gaze = Math.min(9.9, H.k * 10);
      const k = Math.min(1, this.gaze / 10);
      const tw = 0.85 + 0.15 * Math.sin(t * 1.7) * Math.sin(t * 0.63);
      this.starCore.scale.setScalar((9 + k * 6) * tw);
      this.starCore.material.opacity = 0.75 + k * 0.25;
      this.starRays.scale.setScalar(24 + k * 22);
      this.starRays.material.opacity = 0.35 + k * 0.4;
      this.starRays.material.rotation = t * 0.02;
      if (this.gaze > 10 && !this.found.has("sky") && !H) got = "sky";
    }

    // the tree alone: its crown's lights lean toward you as you come
    {
      const dist = Math.hypot(P.x - this.treeAt.x, P.z - this.treeAt.z);
      this.uTree.value = s.outdoors ? 1 - THREE.MathUtils.smoothstep(dist, 8, 26) : 0;
      if (H?.id === "tree") this.uTree.value = H.k;
      (this.uTreeTo.value as THREE.Vector3).set(P.x, P.y + 1.4, P.z);
    }
    return got;
  }
}

/** The lone tree's crown: soft lights at its twig tips. As you come near, some loosen and drift
    out toward you on long slow paths, and return (the tree reaching out before you do). */
function crownLights(pos: Float32Array, uT: ReturnType<typeof uniform>, uNear: ReturnType<typeof uniform>, uTo: ReturnType<typeof uniform>): THREE.Sprite {
  const n = pos.length / 3;
  const mat = softPoints();
  const c = spriteCloud(n, { position: 3, aK: 1 }, mat);
  (c.attrs.position.array as Float32Array).set(pos);
  const k = c.attrs.aK.array as Float32Array;
  for (let i = 0; i < n; i++) k[i] = fractf(Math.sin(i * 12.9898) * 43758.5453);
  const P0 = c.nodes.position, K = c.nodes.aK;
  // one in four may go: out along a slow arc toward the visitor, then home again
  const goes = K.lessThan(0.25);
  const life = fract(uT.mul(0.035).add(K.mul(7)));
  const out = smoothstep(0, 0.45, life).mul(smoothstep(1, 0.55, life)).mul(uNear).mul(goes.select(float(1), float(0)));
  const to = (uTo as unknown as typeof P0);
  const p = mix(P0, mix(P0, to, 0.82).add(vec3(0, sin(life.mul(6.28)).mul(1.2), 0)), out.mul(0.85));
  mat.positionNode = p;
  mat.sizeNode = clamp(gpuUniforms.px.mul(0.07).div(max(viewDepth(p), 0.4)), float(1).div(gpuUniforms.dpr), 9);
  const soft = softDot(pointR()).mul(1.59);
  const tw = sin(uT.mul(1.3).add(K.mul(40))).mul(0.5).add(0.5);
  mat.colorNode = vec4(vec3(1.0, 0.86, 0.62).mul(soft).mul(tw.mul(0.35).add(0.35).add(out.mul(0.4))).mul(outOfTheWay(p)), 1);
  void worldPoints;
  return c.sprite;
}
const fractf = (x: number) => x - Math.floor(x);

/** Four long soft rays crossing: the star's sparkle. */
function raysTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.translate(64, 64);
  for (let k = 0; k < 4; k++) {
    g.rotate(Math.PI / 4);
    const grd = g.createLinearGradient(-64, 0, 64, 0);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.5, k % 2 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.8)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(-64, -1.1, 128, 2.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
