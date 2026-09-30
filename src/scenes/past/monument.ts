/* The Monument of Past Choices: four tellings of worlds that chose (Maldek, Mars, Atlantis,
   Egypt), each a room you sit down in. Its front door in the world, its lobby, and the walk.

   Outside, on the levelled ground `PAST_HALL`, in the Atlantean manner (after Plato's rings of
   land and water; an original design): a round platform of three steps; a ring of still water lit
   sea-blue from within, crossed by one bridge; on the island it circles, a peristyle of sixteen
   fluted marble columns about a round cella under a gilded dome, its entablature banded in gold, a
   lantern of small columns at the crown holding a crystal. Four stelae stand on the outer ring,
   each crowned with its telling's light (dim until walked). The door is in the cella, facing home.

   Within, the lobby: a round marble hall under a dome open to the stars at its eye, twelve
   columns, a round pool of dark water lit from below, over it a gilded armillary turning slowly;
   four niches holding the tellings' lights. Ahead the way to Maldek; behind, the way out. */
import * as THREE from "three/webgpu";
import { T, gpuUniforms, vnoise } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { colliders, PAST_HALL } from "../../world/terrain";
import type { SceneModule } from "../lessonKit";
import { box, disc, type Hall, type Room, type Stage } from "../journey";
import { inward, keepAlpha, lamps, merge } from "../densities/roomKit";
import { quartz } from "../adept/monument";
import { flutedColumn, gold, inlayRing, marble } from "./kit";

const { float, length, mix, smoothstep, vec2, vec3, vec4 } = T;

/** The tellings, in the order you walk them, and the colours that mark them. */
export const PAST_ROOMS = ["maldek", "mars", "atlantis", "egypt"];
const ROOM_COLORS = [0xc8b8ff, 0xff6a44, 0x5ad8ff, 0xffc860].map((c) => new THREE.Color(c));
const SEA = new THREE.Color(0.2, 0.75, 0.95);

/** The water in the ring and the pool: dark, lit sea-blue from below, stirring slowly. */
function glowWater(k = 1): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ fog: true });
  const p = T.positionWorld.xz;
  const t = gpuUniforms.time;
  const n = vnoise(p.mul(0.35).add(vec2(t.mul(0.05), t.mul(-0.03)))).mul(0.6).add(vnoise(p.mul(1.3).add(vec2(t.mul(-0.08), 0))).mul(0.4));
  m.colorNode = vec4(mix(vec3(0.01, 0.04, 0.07), vec3(SEA.r, SEA.g, SEA.b).mul(0.45), smoothstep(0.35, 0.9, n)).mul(k), 1);
  return m;
}

/** The monument's front door in the world. */
export class PastMonument implements Hall {
  readonly world = new THREE.Group();
  readonly label = "The monument of past choices";
  readonly door: THREE.Vector3;
  readonly face = PAST_HALL.face;
  private inv = new THREE.Matrix4();
  private lights: ReturnType<typeof lamps>;

  constructor() {
    const S = PAST_HALL, base = S.y;
    this.world.position.set(S.x, S.y, S.z);
    this.world.rotation.y = S.face;
    this.world.name = "past-choices";
    const walls: THREE.BufferGeometry[] = [], cols: THREE.BufferGeometry[] = [], trim: THREE.BufferGeometry[] = [];
    const disk = (r: number, y0: number, y1: number) => {
      const g = new THREE.CylinderGeometry(r, r, y1 - y0, 96, 1, false);
      g.translate(0, (y0 + y1) / 2, 0);
      walls.push(g);
    };
    // the platform's three steps, and the island's floor
    disk(24, -0.6, 0.3);
    disk(23, 0.3, 0.6);
    disk(22, 0.6, 0.9);
    // the stylobate under the peristyle
    disk(12.4, 0.9, 1.3);
    // the ring of water between curbs: its bed sunk, curbs standing
    const curb = (r: number) => {
      const n = 72;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        if (r > 17 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.1) continue; // the bridge
        const b = new THREE.BoxGeometry(0.5, 0.36, (2 * Math.PI * r) / n + 0.03);
        b.rotateY(a + Math.PI / 2);
        b.translate(Math.sin(a + Math.PI / n) * r, 1.08, Math.cos(a + Math.PI / n) * r);
        walls.push(b);
      }
    };
    curb(15.8);
    curb(18.4);
    // the bridge over the water, on the axis of the door
    {
      const b = new THREE.BoxGeometry(3.4, 0.3, 3.4);
      b.translate(0, 0.95, 17.1);
      walls.push(b);
      for (const x of [-1.8, 1.8]) {
        const rail = new THREE.BoxGeometry(0.28, 0.7, 3.4);
        rail.translate(x, 1.3, 17.1);
        trim.push(rail);
      }
    }
    // the cella: a round wall with its door toward home
    {
      const n = 40, r = 8, H = 8.4;
      for (let k = 0; k < n; k++) {
        const a = ((k + 0.5) / n) * Math.PI * 2;
        if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.2) continue;
        const b = new THREE.BoxGeometry((2 * Math.PI * r) / n + 0.05, H, 0.9);
        b.rotateY(a);
        b.translate(Math.sin(a) * r, 1.3 + H / 2, Math.cos(a) * r);
        walls.push(b);
      }
      // the door's gilded jambs and lintel
      for (const x of [-1.75, 1.75]) {
        const j = new THREE.BoxGeometry(0.45, 5.6, 1.2);
        j.translate(x, 1.3 + 2.8, r);
        trim.push(j);
      }
      const l = new THREE.BoxGeometry(4.2, 0.6, 1.3);
      l.translate(0, 1.3 + 5.9, r);
      trim.push(l);
      // above the door, the wall closes over it
      const over = new THREE.BoxGeometry(3.6, H - 6.2, 0.9);
      over.translate(0, 1.3 + 6.2 + (H - 6.2) / 2, r);
      walls.push(over);
    }
    // the peristyle: sixteen fluted columns; the entablature and its cornice
    for (let k = 0; k < 16; k++) {
      const a = ((k + 0.5) / 16) * Math.PI * 2;
      const c = flutedColumn(0.62, 9, 24);
      c.translate(Math.sin(a) * 11.2, 1.3, Math.cos(a) * 11.2);
      cols.push(c);
      colliders.push({ ...this.toWorld(Math.sin(a) * 11.2, Math.cos(a) * 11.2), r: 0.8, top: base + 10.3 });
    }
    {
      const e = new THREE.CylinderGeometry(12.3, 12.3, 1.3, 96, 1, true);
      e.translate(0, 10.3 + 0.65, 0);
      walls.push(e);
      const e2 = new THREE.CylinderGeometry(10.2, 10.2, 1.3, 96, 1, true);
      e2.translate(0, 10.3 + 0.65, 0);
      walls.push(inward(e2));
      const top = new THREE.RingGeometry(8, 12.3, 96, 1);
      top.rotateX(-Math.PI / 2);
      top.translate(0, 11.6, 0);
      walls.push(top);
      const under = new THREE.RingGeometry(10.2, 12.3, 96, 1);
      under.rotateX(Math.PI / 2);
      under.translate(0, 10.3, 0);
      walls.push(under);
      const cornice = new THREE.CylinderGeometry(12.75, 12.4, 0.45, 96);
      cornice.translate(0, 11.85, 0);
      walls.push(cornice);
    }
    // the dome: marble, a drum under it, gilded ribs
    {
      const drum = new THREE.CylinderGeometry(8.4, 8.4, 1.6, 64);
      drum.translate(0, 12.8, 0);
      walls.push(drum);
      const dome = new THREE.SphereGeometry(8.6, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, 0.72, 1);
      dome.translate(0, 13.6, 0);
      walls.push(dome);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 16; i++) {
          const th = (i / 16) * (Math.PI / 2) * 0.92;
          pts.push(new THREE.Vector3(Math.sin(a) * Math.cos(th) * 8.72, 13.6 + Math.sin(th) * 8.72 * 0.72, Math.cos(a) * Math.cos(th) * 8.72));
        }
        trim.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.12, 6, false));
      }
      // the lantern: eight small columns and a cap, a crystal within
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const c = flutedColumn(0.16, 2.4, 10);
        c.translate(Math.sin(a) * 1.5, 19.6, Math.cos(a) * 1.5);
        cols.push(c);
      }
      const cap = new THREE.CylinderGeometry(0.4, 2.1, 1.2, 32);
      cap.translate(0, 22.6, 0);
      trim.push(cap);
    }
    // four stelae on the outer ring, one for each telling
    const stela: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const x = Math.sin(a) * 20.4, z = Math.cos(a) * 20.4;
      const s = new THREE.BoxGeometry(1.3, 3.4, 0.7);
      s.rotateY(a);
      s.translate(x, 0.9 + 1.7, z);
      walls.push(s);
      const c = new THREE.BoxGeometry(1.6, 0.3, 1.0);
      c.rotateY(a);
      c.translate(x, 0.9 + 3.55, z);
      trim.push(c);
      stela.push(new THREE.Vector3(x, 0.9 + 4.2, z));
      colliders.push({ ...this.toWorld(x, z), r: 1.0, top: base + 4.4 });
    }
    const wallMesh = new THREE.Mesh(merge(walls), marble(2.8, { course: 0.72, block: 1.4, flag: 1.2 }));
    const colMesh = new THREE.Mesh(merge(cols), marble(1.8));
    const trimMesh = new THREE.Mesh(merge(trim), gold(0.1));
    for (const m of [wallMesh, colMesh, trimMesh]) {
      m.castShadow = m.receiveShadow = true;
      this.world.add(m);
    }
    // the water in its ring
    {
      const g = new THREE.RingGeometry(16.05, 18.15, 96, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.95, 0);
      this.world.add(new THREE.Mesh(g, glowWater()));
    }
    // the gold band on the entablature, and sea-blue light inlaid along the stylobate's edge
    this.world.add(inlayRing(12.33, 10.95, 0.28, new THREE.Color(1, 0.72, 0.32), float(0.55)).mesh);
    this.world.add(inlayRing(12.42, 1.12, 0.1, SEA, float(0.8)).mesh);
    // the crystal in the lantern
    const q = quartz(0.7, 3.4, 0.05, 0.45);
    q.position.y = 19.7;
    this.world.add(q);
    // warm light deep in the door
    {
      const g = new THREE.PlaneGeometry(3.3, 5.6);
      g.translate(0, 1.3 + 2.8, 7.4);
      const m = new THREE.MeshBasicNodeMaterial({ fog: true });
      const u = T.uv();
      const c = smoothstep(0.95, 0.0, length(u.sub(vec2(0.5, 0.05)).mul(vec2(2.2, 1.15)))).pow(1.6).mul(0.45).add(0.015);
      m.colorNode = vec4(vec3(0.7, 0.85, 1).mul(c), 1);
      this.world.add(new THREE.Mesh(g, m));
    }
    this.lights = lamps(stela, ROOM_COLORS, 1.6, stela.map(() => 0.55));
    this.world.add(this.lights.cloud.sprite);
    // the water stops you, but for the bridge; the cella's wall, but for its door
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > 0.13) colliders.push({ ...this.toWorld(Math.sin(a) * 17.1, Math.cos(a) * 17.1), r: 1.45, top: base + 1.2 });
    }
    for (let k = 0; k < 36; k++) {
      const a = ((k + 0.5) / 36) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > 0.24) colliders.push({ ...this.toWorld(Math.sin(a) * 8, Math.cos(a) * 8), r: 0.9, top: base + 9.7 });
    }
    this.world.updateMatrixWorld(true);
    this.inv.copy(this.world.matrixWorld).invert();
    this.door = new THREE.Vector3(0, 1.3, 8.6).applyMatrix4(this.world.matrixWorld);
  }

  private toWorld(x: number, z: number): { x: number; z: number } {
    const c = Math.cos(PAST_HALL.face), s = Math.sin(PAST_HALL.face);
    return { x: PAST_HALL.x + x * c + z * s, z: PAST_HALL.z - x * s + z * c };
  }
  atDoor(p: THREE.Vector3): boolean {
    if (Math.abs(p.x - PAST_HALL.x) > 30 || Math.abs(p.z - PAST_HALL.z) > 30) return false;
    const l = p.clone().applyMatrix4(this.inv);
    return Math.abs(l.x) < 1.4 && l.z < 8.3 && l.z > 7.2;
  }
  outside(): { x: number; y: number; z: number; heading: number } {
    const p = new THREE.Vector3(0, 0, 13.4).applyMatrix4(this.world.matrixWorld);
    return { x: p.x, y: PAST_HALL.y + 1.3, z: p.z, heading: this.face + Math.PI };
  }
  light(seen: Set<string>): void {
    const k = this.lights.k;
    PAST_ROOMS.forEach((id, i) => (k[i * 4] = seen.has(id) ? 1.5 : 0.55));
    this.lights.cloud.attrs.aK.needsUpdate = true;
  }
}

/** The lobby, in the journey's frame: the way in at +z, the way to Maldek at −z. */
function lobby(scene: THREE.Scene, seen: () => Set<string>): Room {
  const Rr = 12, H = 9;
  const group = new THREE.Group();
  group.name = "journey:past-lobby";
  scene.add(group);
  const own: { dispose(): void }[] = [];
  const add = <M extends THREE.Object3D>(o: M) => (group.add(o), o);
  const floorG = new THREE.CircleGeometry(Rr + 0.6, 96);
  floorG.rotateX(-Math.PI / 2);
  const floorM = marble(2.2, { flag: 1.1 });
  add(new THREE.Mesh(floorG, floorM)).receiveShadow = true;
  const walls: THREE.BufferGeometry[] = [], cols: THREE.BufferGeometry[] = [], trim: THREE.BufferGeometry[] = [];
  // the round wall, two doorways on the axis; four niches
  const n = 48;
  const niche = [Math.PI / 3, (2 * Math.PI) / 3, (4 * Math.PI) / 3, (5 * Math.PI) / 3];
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * Math.PI * 2;
    const door = Math.abs(Math.sin(a)) < 0.12;
    const b = new THREE.BoxGeometry((2 * Math.PI * Rr) / n + 0.05, door ? H - 6.6 : H, 1.1);
    b.rotateY(a);
    b.translate(Math.sin(a) * Rr, door ? 6.6 + (H - 6.6) / 2 : H / 2, Math.cos(a) * Rr);
    walls.push(b);
  }
  for (const a of niche) {
    const s = new THREE.BoxGeometry(1.8, 0.3, 0.8);
    s.rotateY(a);
    s.translate(Math.sin(a) * (Rr - 0.7), 2.4, Math.cos(a) * (Rr - 0.7));
    trim.push(s);
  }
  // twelve columns in a ring within
  for (let k = 0; k < 12; k++) {
    const a = ((k + 0.5) / 12) * Math.PI * 2;
    const c = flutedColumn(0.5, H - 0.2, 20);
    c.translate(Math.sin(a) * 9.4, 0, Math.cos(a) * 9.4);
    cols.push(c);
  }
  // the dome, seen from within, open at its eye
  const dome = new THREE.SphereGeometry(Rr + 0.4, 64, 24, 0, Math.PI * 2, 0.16, Math.PI / 2 - 0.16);
  dome.scale(1, 0.62, 1);
  dome.translate(0, H, 0);
  walls.push(inward(dome));
  // the pool's curb
  {
    const c = new THREE.TorusGeometry(3.3, 0.22, 10, 72);
    c.rotateX(Math.PI / 2);
    c.translate(0, 0.25, 0);
    walls.push(c);
  }
  const wallMesh = add(new THREE.Mesh(merge(walls), marble(2.6, { course: 0.7, block: 1.3 })));
  const colMesh = add(new THREE.Mesh(merge(cols), marble(1.7)));
  const trimMesh = add(new THREE.Mesh(merge(trim), gold(0.1)));
  for (const m of [wallMesh, colMesh, trimMesh]) m.castShadow = m.receiveShadow = true;
  own.push(floorG, floorM, wallMesh.geometry, wallMesh.material as THREE.Material, colMesh.geometry, colMesh.material as THREE.Material, trimMesh.geometry, trimMesh.material as THREE.Material);
  // the pool
  {
    const g = new THREE.CircleGeometry(3.2, 72);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.12, 0);
    const m = glowWater(0.7);
    add(new THREE.Mesh(g, m));
    own.push(g, m);
  }
  // the armillary over the pool: three gilded rings turning
  const arm = new THREE.Group();
  arm.position.y = 2.6;
  add(arm);
  const armM = gold(0.2);
  own.push(armM);
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.2 - k * 0.18, 0.035, 8, 96), armM);
    r.rotation.set(k * 1.05, k * 0.6, 0);
    arm.add(r);
    own.push(r.geometry);
  }
  // the stars through the eye, and the moonlight falling through it on the pool
  {
    const sky = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide }));
    const u = T.uv().mul(70);
    const h = T.fract(T.sin(T.dot(T.floor(u), vec2(12.9898, 78.233))).mul(43758.5453));
    (sky.material as THREE.MeshBasicNodeMaterial).colorNode = vec4(vec3(0.01, 0.014, 0.035).add(vec3(smoothstep(0.992, 1, h).mul(0.8))), 1);
    sky.rotation.x = Math.PI / 2;
    sky.position.y = H + 8;
    add(sky);
    own.push(sky.geometry, sky.material as THREE.Material);
    const moon = new THREE.SpotLight(0xcfe0ff, 90, 30, 0.34, 0.6, 1.4);
    moon.position.set(0, H + 12, 0);
    moon.target.position.set(0, 0, 0);
    add(moon);
    add(moon.target);
    const warm = new THREE.PointLight(0xffd9a0, 18, 26, 1.4);
    warm.position.set(0, 5, 5);
    add(warm);
    const shaft = new THREE.CylinderGeometry(2.3, 3.0, H + 4, 32, 1, true);
    shaft.translate(0, (H + 4) / 2, 0);
    const sm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    const y = T.positionGeometry.y.div(H + 4);
    const dust = vnoise(vec2(T.uv().x.mul(24), y.mul(10).sub(gpuUniforms.time.mul(0.07))));
    sm.colorNode = vec4(vec3(0.7, 0.8, 1).mul(smoothstep(0, 0.4, y)).mul(float(0.018).add(dust.mul(0.022))), 1);
    add(new THREE.Mesh(shaft, sm));
    own.push(shaft, sm);
  }
  // the doorways: night ahead (Maldek), night outside behind
  const doorG = new THREE.PlaneGeometry(2.9, 6.6);
  doorG.translate(0, 3.3, 0);
  const aheadM = new THREE.MeshBasicNodeMaterial({ fog: false });
  aheadM.colorNode = vec4(mix(vec3(0.03, 0.03, 0.07), vec3(0.004, 0.004, 0.015), T.uv().y), 1);
  add(new THREE.Mesh(doorG, aheadM)).position.z = -Rr - 0.4;
  const behindM = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
  behindM.colorNode = vec4(mix(vec3(0.05, 0.06, 0.12), vec3(0.012, 0.015, 0.04), T.uv().y), 1);
  add(new THREE.Mesh(doorG, behindM)).position.z = Rr + 0.4;
  own.push(doorG, aheadM, behindM);
  // the tellings' lights in their niches; a gold hairline round the floor
  const pts = niche.map((a) => new THREE.Vector3(Math.sin(a) * (Rr - 0.75), 2.95, Math.cos(a) * (Rr - 0.75)));
  const roomLights = lamps(pts, ROOM_COLORS, 0.8, pts.map(() => 0.35));
  add(roomLights.cloud.sprite);
  own.push(roomLights.material);
  const pairs: number[] = [];
  for (let k = 0; k < 96; k++) {
    const a0 = (k / 96) * Math.PI * 2, a1 = ((k + 1) / 96) * Math.PI * 2;
    pairs.push(Math.sin(a0) * 5.5, 0.03, Math.cos(a0) * 5.5, Math.sin(a1) * 5.5, 0.03, Math.cos(a1) * 5.5);
  }
  const lg = ribbonGeometry(pairs), lm = ribbonMaterial(vec3(1, 0.8, 0.45).mul(0.4), 0.5);
  add(new THREE.Mesh(lg, lm));
  own.push(lg, lm);

  let t = 0;
  return {
    id: "lobby",
    active: true,
    nearSeat: () => false,
    onSit() {},
    onStand() {},
    holdsMovement: () => false,
    update(dt) {
      t += Math.min(0.05, dt);
      arm.rotation.y = t * 0.05;
      arm.children.forEach((r, i) => (r.rotation.x = i * 1.05 + t * 0.03 * (i + 1)));
      const s = seen();
      PAST_ROOMS.forEach((id, i) => (roomLights.k[i * 4] = s.has(id) ? 1.3 : 0.35));
      roomLights.cloud.attrs.aK.needsUpdate = true;
    },
    dispose() {
      scene.remove(group);
      for (const d of own) d.dispose();
    },
  } satisfies SceneModule;
}

/** The walk: the lobby, the four tellings, and home to the lobby. */
export function pastStages(seen: () => Set<string>): Stage[] {
  const Rr = 12;
  const HOME = { x: 0, z: -9, heading: Math.PI };
  let marsFloor: ((x: number, z: number) => number) | null = null;
  let egyptFloor: ((x: number, z: number) => number) | null = null;
  return [
    {
      id: "lobby",
      focus: [[0, 2.6, 0], [0, 3, -11]],
      title: "",
      make: async (scene) => lobby(scene, seen),
      start: { x: 0, z: 9.5, heading: 0 },
      exits: [
        { x: 0, z: -Rr - 0.1, r: 1.6, to: 1, dark: 1.5 },
        { x: 0, z: Rr + 0.1, r: 1.6, to: "out" },
      ],
      confine: (p) => {
        const d = Math.hypot(p.x, p.z), lim = Math.abs(p.x) < 1.4 ? Rr + 0.6 : Rr - 1;
        if (d > lim) (p.x *= lim / d), (p.z *= lim / d);
        // the pool
        const dp = Math.hypot(p.x, p.z);
        if (dp < 3.6) (p.x *= 3.6 / Math.max(0.01, dp)), (p.z *= 3.6 / Math.max(0.01, dp));
      },
      air: {
        color: new THREE.Color(0.03, 0.035, 0.05),
        glow: new THREE.Color(0.08, 0.09, 0.12),
        glowDir: new THREE.Vector3(0, 1, 0),
        density: 0.004,
        shadow: new THREE.Color(0.004, 0.008, 0.016),
        sat: 1.02,
        contrast: 1.06,
      },
    },
    {
      id: "maldek",
      title: "Maldek",
      seated: true,
      focus: [[0, 36, -118], [0, 60, -150], [-60, 30, -120]],
      make: async (scene, nar, wh) => (await import("./maldek")).createMaldekScene(scene, nar, wh),
      start: { x: 0, z: 5.5, heading: 0 },
      exits: [{ x: -9.8, z: -2, r: 1.3, to: 2, mark: true }],
      confine: disc(0, -2, 9.9),
      ownAir: true,
    },
    {
      id: "mars",
      title: "Mars",
      seated: true,
      focus: [[0, 6, -60], [0, 20, -300], [-30, 10, -120]],
      make: async (scene, nar, wh) => {
        const mod = await import("./mars");
        marsFloor = mod.marsFloor;
        return mod.createMarsScene(scene, nar, wh);
      },
      floor: (x, z) => (marsFloor ? marsFloor(x, z) : 0),
      start: { x: 0, z: 5.5, heading: 0 },
      exits: [{ x: 9, z: 3, r: 1.4, to: 3, mark: true }],
      confine: box(-12, 12, -1.4, 9),
      ownAir: true,
    },
    {
      id: "atlantis",
      title: "Atlantis",
      seated: true,
      focus: [[0, 20, -190], [-300, 20, -300], [300, 60, -330]],
      make: async (scene, nar, wh) => (await import("./atlantis")).createAtlantisScene(scene, nar, wh),
      start: { x: 0, z: 5.5, heading: 0 },
      exits: [{ x: -6, z: 4, r: 1.3, to: 4, mark: true }],
      confine: box(-6.6, 6.6, -6.6, 8.2),
      ownAir: true,
    },
    {
      id: "egypt",
      title: "Egypt",
      seated: true,
      focus: [[0, 18, -86], [0, 44, -86], [-60, 30, -200]],
      make: async (scene, nar, wh) => {
        const mod = await import("./egypt");
        egyptFloor = mod.egyptFloor;
        return mod.createEgyptScene(scene, nar, wh);
      },
      floor: (x, z) => (egyptFloor ? egyptFloor(x, z) : 0),
      start: { x: 0, z: 5.5, heading: 0 },
      exits: [{ x: 8, z: 4, r: 1.4, to: 0, at: HOME, mark: true }],
      confine: box(-14, 14, -20, 10),
      ownAir: true,
    },
  ];
}
