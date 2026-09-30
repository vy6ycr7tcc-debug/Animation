/* The monument of the densities: its front door in the world, its lobby, and the walk through
   its eight rooms (the beginning, then the first density to the seventh) and home again.

   Outside, on the levelled ground `DENSITY_HALL`, a stepped round platform carries a ring of
   eight great standing stones, rising in height one after another round the ring as an octave
   rises, each crowned with a small light of its own colour (the beginning's white, then red to
   violet); within the ring a domed hall of the temple's scanned stone, an octagonal lantern
   burning softly at its crown, its door toward the shore, warm light inside.

   Within, the lobby: a round hall under a dome open to the stars; eight steles in a ring, each
   with a small bowl of its room's light, dim until you have walked that room; a basin of still
   dark water at the centre, and over it a slow spiral of thin gold, eight turns, a bead of each
   colour on its turns. Ahead a door of pitch black (the beginning); behind, the night you came
   in by. The rooms themselves are the factory modules beside this file, placed as they are. */
import * as THREE from "three/webgpu";
import { T, gpuUniforms } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { colliders, DENSITY_HALL, platformRise } from "../../world/terrain";
import { landStone } from "../../world/stoneworks";
import type { SceneModule } from "../lessonKit";
import { box, type Room, type Stage } from "../journey";
import { inward, keepAlpha, lamps, merge, ringWall, roughBlock } from "./roomKit";

const { float, length, mix, smoothstep, vec3, vec4 } = T;

/** The eight rooms' colours: the beginning's white, then the densities red to violet. */
export const DENSITY_COLORS = [0xfff4e0, 0xe0473a, 0xef8a34, 0xf2cf4a, 0x5fcf72, 0x4f8fe8, 0x5d4fcf, 0xa86ee0].map((c) => new THREE.Color(c));
const HALL_R = 10, HALL_H = 12, RING_R = 16, TOP = 1.35;

/** The monument's front door in the world. */
export class DensityMonument {
  readonly world = new THREE.Group();
  /** The door's centre in the world, and the heading that walks out of it. */
  readonly door: THREE.Vector3;
  readonly face = DENSITY_HALL.face;
  private inv = new THREE.Matrix4();
  private lamp: ReturnType<typeof lamps>;

  constructor() {
    const S = DENSITY_HALL, base = S.y;
    this.world.position.set(S.x, S.y, S.z);
    this.world.rotation.y = S.face;
    this.world.name = "density-monument";
    // the stepped platform: three courses of cut stone
    const steps: THREE.BufferGeometry[] = [];
    [22, 20.8, 19.6].forEach((r, i) => {
      const g = new THREE.CylinderGeometry(r, r + 0.05, 0.45 + (i === 0 ? 0.6 : 0), 96, 1);
      g.translate(0, 0.225 + i * 0.45 - (i === 0 ? 0.3 : 0), 0);
      steps.push(g);
    });
    const plinth = new THREE.Mesh(merge(steps), landStone("sandstone_blocks_05", base, 3.2, [0.95, 0.92, 0.88]));
    plinth.receiveShadow = true;
    this.world.add(plinth);
    // eight great stones, rising round the ring as an octave rises; none on the door's axis
    const stones: THREE.BufferGeometry[] = [];
    const tops: THREE.Vector3[] = [];
    for (let k = 0; k < 8; k++) {
      const th = Math.PI + Math.PI / 8 + (k * Math.PI) / 4; // from beside the far side, round
      const H = 10.5 + k * 1.1;
      const g = roughBlock(2.5, H, 1.5, 0.28, k * 5.3 + 1);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(th).setPosition(Math.sin(th) * RING_R, TOP, Math.cos(th) * RING_R));
      stones.push(g);
      tops.push(new THREE.Vector3(Math.sin(th) * RING_R, TOP + H + 0.9, Math.cos(th) * RING_R));
      colliders.push({ ...this.toWorld(Math.sin(th) * RING_R, Math.cos(th) * RING_R), r: 1.5, top: base + TOP + H });
    }
    const ring = new THREE.Mesh(merge(stones), landStone("sandstone_cracks", base + TOP, 3.4, [0.6, 0.66, 0.76]));
    ring.castShadow = ring.receiveShadow = true;
    this.world.add(ring);
    // the hall: a drum of fitted blocks, a cornice, a dome, the lantern at its crown
    const hall: THREE.BufferGeometry[] = ringWall(HALL_R, HALL_H, 1.1, 18, [0]);
    for (const g of hall) g.translate(0, TOP, 0);
    const cornice = new THREE.CylinderGeometry(HALL_R + 0.75, HALL_R + 0.55, 0.9, 72, 1);
    cornice.translate(0, TOP + HALL_H + 0.2, 0);
    const band = new THREE.CylinderGeometry(HALL_R + 0.62, HALL_R + 0.62, 0.5, 72, 1);
    band.translate(0, TOP + 0.25, 0);
    const dome = new THREE.SphereGeometry(HALL_R + 0.4, 64, 20, 0, Math.PI * 2, 0.12, Math.PI / 2 - 0.12);
    dome.translate(0, TOP + HALL_H + 0.5, 0);
    const lanternCap = new THREE.ConeGeometry(2.1, 1.8, 8);
    lanternCap.translate(0, TOP + HALL_H + 0.5 + HALL_R + 0.4 + 2.9, 0);
    const posts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const g = new THREE.BoxGeometry(0.35, 2.2, 0.35);
      g.translate(Math.sin(a) * 1.55, TOP + HALL_H + 0.5 + HALL_R + 0.4 + 0.9, Math.cos(a) * 1.55);
      posts.push(g);
    }
    // the door: two great jambs and a lintel standing proud of the wall
    const jambL = new THREE.BoxGeometry(1.4, 8.4, 2.2);
    jambL.translate(-3.0, TOP + 4.2, HALL_R + 0.2);
    const jambR = jambL.clone();
    jambR.translate(6.0, 0, 0);
    const lintel = new THREE.BoxGeometry(7.8, 1.5, 2.5);
    lintel.translate(0, TOP + 8.4 + 0.75, HALL_R + 0.25);
    // pilasters down the drum and ribs up the dome, eight of each, so its form reads at night
    const ribs: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 8; k++) {
      const th = Math.PI / 8 + (k * Math.PI) / 4;
      const pil = new THREE.BoxGeometry(1.0, HALL_H, 0.5);
      pil.translate(0, TOP + HALL_H / 2, HALL_R + 0.45);
      pil.applyMatrix4(new THREE.Matrix4().makeRotationY(th));
      ribs.push(pil);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 14; i++) {
        const a = 0.12 + (i / 14) * (Math.PI / 2 - 0.2);
        pts.push(new THREE.Vector3(Math.sin(th) * Math.sin(Math.PI / 2 - a) * (HALL_R + 0.6), TOP + HALL_H + 0.5 + Math.cos(Math.PI / 2 - a) * (HALL_R + 0.6), Math.cos(th) * Math.sin(Math.PI / 2 - a) * (HALL_R + 0.6)));
      }
      ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.32, 6, false));
    }
    const hallMesh = new THREE.Mesh(merge([...hall, cornice, band, dome, lanternCap, ...posts, jambL, jambR, lintel, ...ribs]), landStone("sandstone_blocks_08", base + TOP, 2.6));
    hallMesh.castShadow = hallMesh.receiveShadow = true;
    this.world.add(hallMesh);
    // warm light within the door, and the lantern's glow
    {
      const g = new THREE.PlaneGeometry(4.6, 8.4);
      g.translate(0, TOP + 4.2, HALL_R - 0.35);
      const m = new THREE.MeshBasicNodeMaterial({ fog: true });
      const u = T.uv();
      // light from deep within: a warm glow low in the doorway, falling to dark at its head and sides
      const c = smoothstep(0.95, 0.0, length(u.sub(T.vec2(0.5, 0.05)).mul(T.vec2(2.2, 1.15)))).pow(1.6).mul(0.42).add(0.012);
      m.colorNode = vec4(vec3(1, 0.62, 0.3).mul(c), 1);
      this.world.add(new THREE.Mesh(g, m));
      const lg = new THREE.CylinderGeometry(1.35, 1.35, 2.1, 16, 1, true);
      lg.translate(0, TOP + HALL_H + 0.5 + HALL_R + 0.4 + 0.9, 0);
      const lm = new THREE.MeshBasicNodeMaterial({ fog: true, side: THREE.DoubleSide });
      lm.colorNode = vec4(vec3(1, 0.9, 0.72).mul(T.sin(gpuUniforms.time.mul(0.5)).mul(0.08).add(0.82)), 1);
      this.world.add(new THREE.Mesh(lg, lm));
    }
    this.lamp = lamps(tops, DENSITY_COLORS, 2.2, tops.map(() => 0.7));
    this.world.add(this.lamp.cloud.sprite);
    // the drum's wall stops the wanderer, but for the door
    for (let a = 0; a < 360; a += 7) {
      const th = (a * Math.PI) / 180;
      if (Math.abs(Math.atan2(Math.sin(th), Math.cos(th))) < 0.26) continue;
      colliders.push({ ...this.toWorld(Math.sin(th) * HALL_R, Math.cos(th) * HALL_R), r: 0.95, top: base + TOP + HALL_H + HALL_R });
    }
    for (const x of [-3, 3]) colliders.push({ ...this.toWorld(x, HALL_R + 0.2), r: 0.9, top: base + TOP + 9 });
    this.world.updateMatrixWorld(true);
    this.inv.copy(this.world.matrixWorld).invert();
    this.door = new THREE.Vector3(0, TOP, HALL_R + 1.2).applyMatrix4(this.world.matrixWorld);
  }

  private toWorld(x: number, z: number): { x: number; z: number } {
    const c = Math.cos(DENSITY_HALL.face), s = Math.sin(DENSITY_HALL.face);
    return { x: DENSITY_HALL.x + x * c + z * s, z: DENSITY_HALL.z - x * s + z * c };
  }

  /** Walking in through the door. */
  atDoor(p: THREE.Vector3): boolean {
    if (Math.abs(p.x - DENSITY_HALL.x) > 30 || Math.abs(p.z - DENSITY_HALL.z) > 30) return false;
    const l = p.clone().applyMatrix4(this.inv);
    return Math.abs(l.x) < 1.9 && l.z < HALL_R + 0.5 && l.z > HALL_R - 1.2;
  }
  /** Where you stand coming out (a few steps before the door, facing away). */
  outside(): { x: number; y: number; z: number; heading: number } {
    const p = new THREE.Vector3(0, 0, HALL_R + 4).applyMatrix4(this.world.matrixWorld);
    return { x: p.x, y: DENSITY_HALL.y + platformRise(HALL_R + 4), z: p.z, heading: this.face };
  }
  /** The rooms walked light their stones' crowns fully. */
  light(seen: Set<string>): void {
    const k = this.lamp.k;
    ROOM_IDS.forEach((id, i) => (k[i * 4] = seen.has(id) ? 1.4 : 0.75));
    this.lamp.cloud.attrs.aK.needsUpdate = true;
  }
}

const ROOM_IDS = ["room0", "room1", "room2", "room3", "room4", "room5", "room6", "room7"];

/** The lobby, in the journey's own frame: the door in at +z, the dark door to the beginning at −z. */
function lobby(scene: THREE.Scene, seen: () => Set<string>): Room {
  const R = 13, H = 10;
  const group = new THREE.Group();
  group.name = "journey:density-lobby";
  scene.add(group);
  const own: { dispose(): void }[] = [];
  const add = <M extends THREE.Object3D>(o: M) => (group.add(o), o);
  // the floor: a round of paving
  const floorG = new THREE.CircleGeometry(R + 0.8, 72);
  floorG.rotateX(-Math.PI / 2);
  const floorM = landStone("red_sandstone_pavement", 0, 3.2, [0.95, 0.9, 0.86]);
  add(new THREE.Mesh(floorG, floorM)).receiveShadow = true;
  // the walls (the two doors left open), their doorframes, a band, and the dome open to the stars
  const walls = ringWall(R, H, 1.2, 16, [0, 8]);
  for (const z of [R, -R]) {
    for (const x of [-2.9, 2.9]) {
      const j = new THREE.BoxGeometry(1.3, 7.4, 1.9);
      j.translate(x, 3.7, z * 0.985);
      walls.push(j);
    }
    const l = new THREE.BoxGeometry(7.2, 1.3, 2.1);
    l.translate(0, 8.05, z * 0.985);
    walls.push(l);
    const over = new THREE.BoxGeometry(5.2, H - 8.7, 1.2);
    over.translate(0, 8.7 + (H - 8.7) / 2, z);
    walls.push(over);
  }
  const band = inward(new THREE.CylinderGeometry(R - 0.5, R - 0.5, 0.6, 72, 1, true));
  band.translate(0, H - 0.3, 0);
  walls.push(band);
  const dome = inward(new THREE.SphereGeometry(R, 72, 20, 0, Math.PI * 2, 0.2, Math.PI / 2 - 0.2));
  dome.translate(0, H, 0);
  walls.push(dome);
  const wallM = landStone("sandstone_blocks_08", 0, 2.6, [0.92, 0.88, 0.84]);
  const wallMesh = add(new THREE.Mesh(merge(walls), wallM));
  wallMesh.receiveShadow = true;
  // beyond the dome's eye, the night: a small field of stars
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 12, 0, Math.PI * 2, 0, 0.5), new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false }));
  {
    const d = T.normalize(T.positionLocal);
    const cell = T.floor(d.mul(180));
    const h = T.fract(T.sin(T.dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
    const star = smoothstep(0.996, 1.0, h).mul(0.9);
    (sky.material as THREE.MeshBasicNodeMaterial).colorNode = vec4(vec3(0.015, 0.02, 0.045).add(vec3(star)), 1);
  }
  sky.position.y = H;
  add(sky);
  // the two doorways: pitch black ahead (the beginning), the blue night behind
  const doorG = new THREE.PlaneGeometry(4.6, 7.4);
  doorG.translate(0, 3.7, 0);
  const blackM = new THREE.MeshBasicNodeMaterial({ fog: false });
  blackM.colorNode = vec4(0, 0, 0, 1);
  const ahead = add(new THREE.Mesh(doorG, blackM));
  ahead.position.z = -R - 0.4;
  const nightM = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
  nightM.colorNode = vec4(mix(vec3(0.05, 0.06, 0.12), vec3(0.012, 0.015, 0.04), T.uv().y), 1);
  const behind = add(new THREE.Mesh(doorG, nightM));
  behind.position.z = R + 0.4;
  // a faint rim of light round the dark door, so it reads as a way
  {
    const g = new THREE.PlaneGeometry(5.2, 7.9);
    g.translate(0, 3.95, 0);
    const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
    const u = T.uv();
    const inner = smoothstep(0.02, 0.09, u.x).mul(smoothstep(0.98, 0.91, u.x)).mul(smoothstep(0.96, 0.9, u.y));
    const outer = smoothstep(0, 0.05, u.x).mul(smoothstep(1, 0.95, u.x)).mul(smoothstep(1, 0.97, u.y));
    m.colorNode = vec4(vec3(1, 0.95, 0.85).mul(outer.sub(inner).max(0)).mul(0.5), 1);
    const rim = add(new THREE.Mesh(g, m));
    rim.position.z = -R - 0.3;
    own.push(g, m);
  }
  // eight steles, each with a bowl of its room's light
  const steles: THREE.BufferGeometry[] = [];
  const bowls: THREE.Vector3[] = [];
  for (let k = 0; k < 8; k++) {
    const th = Math.PI + Math.PI / 8 + (k * Math.PI) / 4;
    const g = roughBlock(1.0, 2.6, 0.55, 0.12, k * 2.7 + 9);
    const b = new THREE.CylinderGeometry(0.42, 0.22, 0.28, 16);
    b.translate(0, 2.74, 0);
    for (const x of [g, b]) x.applyMatrix4(new THREE.Matrix4().makeRotationY(th).setPosition(Math.sin(th) * (R - 3.2), 0, Math.cos(th) * (R - 3.2)));
    steles.push(g, b);
    bowls.push(new THREE.Vector3(Math.sin(th) * (R - 3.2), 3.05, Math.cos(th) * (R - 3.2)));
  }
  // the basin at the centre
  const basin = new THREE.CylinderGeometry(1.9, 2.15, 0.62, 48, 1, true);
  basin.translate(0, 0.31, 0);
  const lip = new THREE.TorusGeometry(1.8, 0.14, 8, 48);
  lip.rotateX(Math.PI / 2);
  lip.translate(0, 0.62, 0);
  steles.push(basin, lip);
  const steleM = landStone("sandstone_cracks", 0, 1.8);
  add(new THREE.Mesh(merge(steles), steleM)).castShadow = true;
  const waterG = new THREE.CircleGeometry(1.7, 48);
  waterG.rotateX(-Math.PI / 2);
  waterG.translate(0, 0.5, 0);
  const waterM = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0 });
  waterM.colorNode = vec4(0.004, 0.006, 0.012, 1);
  add(new THREE.Mesh(waterG, waterM));
  const bowlLights = lamps(bowls, DENSITY_COLORS, 0.95, bowls.map(() => 0.35));
  add(bowlLights.cloud.sprite);
  // the spiral: eight turns of thin gold rising over the water, a bead of each colour on its turns
  const spiral = new THREE.Group();
  spiral.position.y = 0.95;
  add(spiral);
  const pairs: number[] = [], beads: THREE.Vector3[] = [];
  const TURNS = 8, SEG = 36 * TURNS;
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= SEG; i++) {
    const f = i / SEG, a = f * TURNS * Math.PI * 2, r = 1.05 - f * 0.45;
    const p = new THREE.Vector3(Math.sin(a) * r, f * 3.4, Math.cos(a) * r);
    if (prev) pairs.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
    prev = p;
    if (i % 36 === 18) beads.push(p.clone());
  }
  const spiralG = ribbonGeometry(pairs);
  const spiralM = ribbonMaterial(vec3(1, 0.8, 0.45).mul(float(0.55)), 0.5);
  spiral.add(new THREE.Mesh(spiralG, spiralM));
  const beadLights = lamps(beads, DENSITY_COLORS, 0.2, beads.map(() => 0.8));
  spiral.add(beadLights.cloud.sprite);
  // two hairlines of gold inlaid round the wall, the old etched-light way (no lettering)
  {
    const pairs: number[] = [];
    for (const y of [2.2, 7.3]) {
      const n = 160;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        if (Math.abs(Math.sin(a0)) < 0.2 || Math.abs(Math.sin(a1)) < 0.2) continue; // not across the doors
        const r = R - 0.62;
        pairs.push(Math.sin(a0) * r, y, Math.cos(a0) * r, Math.sin(a1) * r, y, Math.cos(a1) * r);
      }
    }
    const g = ribbonGeometry(pairs), m = ribbonMaterial(vec3(1, 0.78, 0.45).mul(float(0.4)), 0.5);
    add(new THREE.Mesh(g, m));
    own.push(g, m);
  }
  // light: soft from the dome's eye onto the basin, and a warm glow low in the hall
  const moon = new THREE.SpotLight(0xcfd8ff, 60, 30, 0.42, 0.8, 1.4);
  moon.position.set(0, H + R - 1, 0);
  moon.target.position.set(0, 0, 0);
  add(moon);
  add(moon.target);
  const warm = new THREE.PointLight(0xffc98a, 30, 26, 1.4);
  warm.position.set(0, 3.2, 0);
  add(warm);
  own.push(floorG, floorM, wallM, doorG, blackM, nightM, steleM, waterG, waterM, spiralG, spiralM, sky.geometry, sky.material as THREE.Material);

  let t = 0;
  const room: SceneModule = {
    id: "lobby",
    active: true,
    nearSeat: () => false,
    onSit() {},
    onStand() {},
    holdsMovement: () => false,
    update(dt) {
      t += Math.min(0.05, dt);
      spiral.rotation.y = t * 0.06;
      const s = seen();
      ROOM_IDS.forEach((id, i) => (bowlLights.k[i * 4] = s.has(id) ? 1.15 : 0.35));
      bowlLights.cloud.attrs.aK.needsUpdate = true;
    },
    dispose() {
      scene.remove(group);
      for (const d of own) d.dispose();
      for (const m of [wallMesh.geometry]) m.dispose();
    },
  };
  return room;
}

/** The walk: the lobby, the beginning, the seven densities, and home to the lobby. */
export function densityStages(seen: () => Set<string>): Stage[] {
  const LOBBY_BACK = { x: 0, z: -9.5, heading: 0 };
  const mk = <K extends string>(load: () => Promise<Record<K, unknown>>, name: K, extra: unknown[] = []) =>
    async (scene: THREE.Scene, nar: unknown, wh: unknown): Promise<Room> => {
      const mod = await load();
      return (mod[name] as (...a: unknown[]) => Room)(scene, nar, wh, ...extra);
    };
  let sand: ((x: number, z: number) => number) | null = null, meadow: ((x: number, z: number) => number) | null = null;
  return [
    {
      id: "lobby",
      title: "",
      make: async (scene) => lobby(scene, seen),
      start: { x: 0, z: 10.5, heading: Math.PI },
      exits: [
        { x: 0, z: -R_LOBBY - 0.2, r: 1.9, to: 1 },
        { x: 0, z: R_LOBBY + 0.2, r: 1.9, to: "out" },
      ],
      confine: (p) => {
        const d = Math.hypot(p.x, p.z), lim = Math.abs(p.x) < 1.9 ? R_LOBBY + 0.6 : R_LOBBY - 1;
        if (d > lim) (p.x *= lim / d), (p.z *= lim / d);
      },
      air: {
        color: new THREE.Color(0.03, 0.028, 0.035),
        glow: new THREE.Color(0.08, 0.07, 0.09),
        glowDir: new THREE.Vector3(0, 1, 0),
        density: 0.004,
        shadow: new THREE.Color(0.004, 0.004, 0.012),
        sat: 1.02,
        contrast: 1.06,
      },
    },
    {
      id: "room0",
      title: "The beginning",
      make: mk(() => import("./room_0"), "createDensityRoom0Scene"),
      start: { x: 0, z: 1.5, heading: Math.PI },
      exits: [
        { x: 0, z: -24, r: 2.2, to: 2, dark: 3, mark: true }, // into the first density, through pitch black
        { x: 0, z: 5, r: 1.6, to: 0, at: LOBBY_BACK },
      ],
      confine: box(-24, 24, -27, 6),
    },
    {
      id: "room1",
      title: "The first density",
      make: async (scene, nar, wh) => {
        const mod = await import("./room_1");
        sand = mod.sandHeight;
        return mod.createDensityRoom1Scene(scene, nar, wh) as Room;
      },
      floor: (x, z) => (sand ? sand(x, z) : 0),
      start: { x: 0, z: 0, heading: Math.PI },
      exits: [{ x: 0, z: -44, r: 2.6, to: 3 }], // the illuminated tree-door
      confine: box(-15, 22, -47, 10),
      ownAir: true,
    },
    {
      id: "room2",
      title: "The second density",
      make: async (scene, nar, wh) => {
        const mod = await import("./room_2");
        meadow = mod.meadowHeight;
        return mod.createDensityRoom2Scene(scene, nar, wh) as Room;
      },
      floor: (x, z) => (meadow ? meadow(x, z) : 0),
      start: { x: 0, z: 0, heading: Math.PI },
      exits: [{ x: 0, z: -46, r: 2.6, to: 4 }],
      confine: box(-26, 26, -49, 10),
      ownAir: true,
    },
    {
      id: "room3",
      title: "The third density",
      make: mk(() => import("./room_3"), "createRoom3Scene"),
      start: { x: 0, z: 3.4, heading: Math.PI },
      exits: [{ x: 0, z: -15, r: 2.2, to: 5 }],
      confine: box(-8, 8, -17, 7),
    },
    {
      id: "room4",
      title: "The fourth density",
      make: mk(() => import("./room_4"), "createDensityRoom4Scene"),
      start: { x: 0, z: 0, heading: Math.PI },
      exits: [{ x: 0, z: -40, r: 2.6, to: 6 }],
      confine: box(-30, 30, -43, 10),
      ownAir: true,
    },
    {
      id: "room5",
      title: "The fifth density",
      make: mk(() => import("./room_5"), "createDensity5Scene"),
      centreOnSeat: true, // drawn round its own seat out in the world: brought here
      track: "audio/densities/density_5.mp3", // its seat names none yet
      start: { x: 0, z: 0, heading: 0 },
      exits: [{ x: 0, z: 22, r: 2.2, to: 7 }],
      confine: box(-16, 16, -6, 24),
      air: {
        color: new THREE.Color(0.01, 0.014, 0.03),
        glow: new THREE.Color(0.05, 0.08, 0.14),
        glowDir: new THREE.Vector3(0, 1, 1),
        density: 0.006,
      },
    },
    {
      id: "room6",
      title: "The sixth density",
      make: mk(() => import("./room_6"), "createDensityRoom6Scene"),
      start: { x: 0, z: 0, heading: Math.PI },
      exits: [{ x: 15, z: -36, r: 2.4, to: 8, dark: 1.5 }], // the door of white light
      confine: box(-20, 24, -40, 12),
      ownAir: true,
    },
    {
      id: "room7",
      title: "The seventh density",
      make: mk(() => import("./room_7"), "createDensity7", [new THREE.Vector3(0, 0, 0), 0]),
      start: { x: 0, z: -1, heading: Math.PI },
      exits: [{ x: 0, z: -117, r: 3, to: 0, at: LOBBY_BACK, mark: true }], // home to the lobby
      confine: box(-3.6, 3.6, -119.5, 3),
      air: {
        color: new THREE.Color(0.3, 0.28, 0.24),
        glow: new THREE.Color(0.5, 0.45, 0.36),
        glowDir: new THREE.Vector3(0, 0.2, -1),
        density: 0.012,
        shadow: new THREE.Color(0.02, 0.018, 0.012),
        sat: 0.95,
        contrast: 1,
      },
    },
  ];
}
const R_LOBBY = 13;
