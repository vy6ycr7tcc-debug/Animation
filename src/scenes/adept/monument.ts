/* The adept's school: its front door in the world, its lobby, and the walk through its rooms: the
   three stations of the adept's path (the call, the crucible, the radiance) and the four chambers
   of the ancient practices (stones, pyramids and geometry, the daily disciplines, the others), and
   home again.

   Outside, on the levelled ground `ADEPT_HALL`: a stepped tower of three terraces in the temple's
   scanned sandstone, a stair climbing the middle of its face, a great quartz crystal standing at
   its crown; on the terraces' front edges three small lights (the three stations), and at the four
   corners four low shrines, each crowned with its practice's sign in light: a crystal, a small
   pyramid, a lamp's flame, a star. The door is in the tower's foot, warm light deep inside.

   Within, the lobby: a square hall of papyrus columns (the temple's), an opening in the roof, and
   under it a cluster of quartz on a plinth; seven small lights along the walls, one for each room,
   dim until walked. Ahead a door into the night (the call); behind, the way you came in. */
import * as THREE from "three/webgpu";
import { T, gpuUniforms, vnoise } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { colliders, ADEPT_HALL } from "../../world/terrain";
import { landStone } from "../../world/stoneworks";
import { columnGeometry } from "../../world/temple";
import { crystalMaterial, prismGeometry } from "../../world/creation";
import type { SceneModule } from "../lessonKit";
import { box, type Hall, type Room, type Stage } from "../journey";
import { keepAlpha, lamps, merge } from "../densities/roomKit";

const { float, length, smoothstep, vec3, vec4 } = T;

/** The rooms, in the order you walk them, and the colours that mark them. */
export const ADEPT_ROOMS = ["call", "crucible", "radiance", "stones", "pyramids", "disciplines", "others"];
const ROOM_COLORS = [0xf4f0ff, 0xff7a3a, 0xffd479, 0x9fd8ff, 0xf0c060, 0xffb070, 0xe8ecff].map((c) => new THREE.Color(c));
const BASE = 36, TIER = 6.5;

/** A quartz point: the world's own prism in its glassy, rainbow-splitting light. */
export function quartz(radius: number, height: number, hue: number, glow: number): THREE.Mesh {
  const g = prismGeometry();
  g.scale(radius / 0.2, height, radius / 0.2);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([hue, glow, 0.3], i * 3);
  g.setAttribute("aC", new THREE.BufferAttribute(c, 3));
  return new THREE.Mesh(g, crystalMaterial());
}

/** The school's front door in the world. */
export class AdeptMonument implements Hall {
  readonly world = new THREE.Group();
  readonly label = "The school of the adept";
  readonly door: THREE.Vector3;
  readonly face = ADEPT_HALL.face;
  private inv = new THREE.Matrix4();
  private lights: ReturnType<typeof lamps>;

  constructor() {
    const S = ADEPT_HALL, base = S.y;
    this.world.position.set(S.x, S.y, S.z);
    this.world.rotation.y = S.face;
    this.world.name = "adept-school";
    const stone: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number) => (g.translate(x, y, z), stone.push(g));
    // three terraces, each a little battered (narrower at the top), with a cornice
    for (let k = 0; k < 3; k++) {
      const w = BASE - k * 10;
      const t = new THREE.CylinderGeometry((w / 2) * Math.SQRT2 * 0.97, (w / 2) * Math.SQRT2, TIER, 4, 1);
      t.rotateY(Math.PI / 4);
      add(t, 0, k * TIER + TIER / 2 - 0.4, 0);
      add(new THREE.BoxGeometry(w * 0.99 + 0.6, 0.6, w * 0.99 + 0.6), 0, (k + 1) * TIER - 0.4, 0);
    }
    // the stair up the middle of the face, from the first terrace to the crown
    for (let k = 1; k < 3; k++) {
      const z0 = (BASE - (k - 1) * 10) / 2, z1 = (BASE - k * 10) / 2;
      const n = 13;
      for (let i = 0; i < n; i++) {
        const f = (i + 1) / n;
        add(new THREE.BoxGeometry(4.6, TIER * f, (z0 - z1) / n + 0.02), 0, (k - 1) * TIER + (TIER * f) / 2 + 0.2, z0 - ((z0 - z1) * (i + 0.5)) / n);
      }
    }
    // the door in the foot: jambs and a lintel standing proud, a deep reveal
    add(new THREE.BoxGeometry(1.5, 7.2, 2.2), -3.0, 3.6, BASE / 2 + 0.6);
    add(new THREE.BoxGeometry(1.5, 7.2, 2.2), 3.0, 3.6, BASE / 2 + 0.6);
    add(new THREE.BoxGeometry(8.2, 1.5, 2.5), 0, 7.95, BASE / 2 + 0.7);
    // the crown's plinth
    add(new THREE.CylinderGeometry(3.6, 4.2, 1.4, 6), 0, 3 * TIER + 0.3, 0);
    // four corner shrines: a stepped plinth each
    const corners: THREE.Vector3[] = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      const x = sx * (BASE / 2 + 7), z = sz * (BASE / 2 + 7);
      add(new THREE.BoxGeometry(5, 1.2, 5), x, 0.2, z);
      add(new THREE.BoxGeometry(3.4, 1.2, 3.4), x, 1.4, z);
      add(new THREE.BoxGeometry(1.6, 2.2, 1.6), x, 3.1, z);
      corners.push(new THREE.Vector3(x, 5.1, z));
      colliders.push({ ...this.toWorld(x, z), r: 2.9, top: base + 4.2 });
    }
    const mesh = new THREE.Mesh(merge(stone), landStone("sandstone_blocks_05", base, 3.0, [0.96, 0.93, 0.88]));
    mesh.castShadow = mesh.receiveShadow = true;
    this.world.add(mesh);
    // the crystal at the crown
    const q = quartz(2.4, 13, 0.15, 0.25);
    q.position.set(0, 3 * TIER + 1, 0);
    this.world.add(q);
    for (const [a, h] of [[0.9, 7], [2.6, 5.5], [4.2, 6.2]] as const) {
      const s = quartz(1.1, h, 0.25, 0.2);
      s.position.set(Math.cos(a) * 2.2, 3 * TIER + 0.8, Math.sin(a) * 2.2);
      s.rotation.set(Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35);
      this.world.add(s);
    }
    // warm light deep in the door
    {
      const g = new THREE.PlaneGeometry(4.5, 7.2);
      g.translate(0, 3.6, BASE / 2 - 0.25);
      const m = new THREE.MeshBasicNodeMaterial({ fog: true });
      const u = T.uv();
      const c = smoothstep(0.95, 0.0, length(u.sub(T.vec2(0.5, 0.05)).mul(T.vec2(2.2, 1.15)))).pow(1.6).mul(0.4).add(0.012);
      m.colorNode = vec4(vec3(1, 0.66, 0.34).mul(c), 1);
      this.world.add(new THREE.Mesh(g, m));
    }
    // the rooms' lights: the three stations on the terraces' front edges, the practices at the corners
    const pts = [
      new THREE.Vector3(0, TIER + 0.9, BASE / 2 + 0.2),
      new THREE.Vector3(0, 2 * TIER + 0.9, BASE / 2 - 5 + 0.2),
      new THREE.Vector3(0, 3 * TIER + 0.9, BASE / 2 - 10 + 0.2),
      ...corners,
    ];
    this.lights = lamps(pts, ROOM_COLORS, 1.8, pts.map(() => 0.6));
    this.world.add(this.lights.cloud.sprite);
    // the tower's foot stops the wanderer, but for the door
    const half = BASE / 2;
    for (let a = -half; a <= half; a += 2.4)
      for (const [x, z] of [[a, half], [a, -half], [half, a], [-half, a]]) {
        if (z === half && Math.abs(x) < 2.2) continue;
        colliders.push({ ...this.toWorld(x, z), r: 1.5, top: base + TIER });
      }
    for (const x of [-3, 3]) colliders.push({ ...this.toWorld(x, half + 0.6), r: 1.0, top: base + 8 });
    this.world.updateMatrixWorld(true);
    this.inv.copy(this.world.matrixWorld).invert();
    this.door = new THREE.Vector3(0, 0, half + 1.4).applyMatrix4(this.world.matrixWorld);
  }

  private toWorld(x: number, z: number): { x: number; z: number } {
    const c = Math.cos(ADEPT_HALL.face), s = Math.sin(ADEPT_HALL.face);
    return { x: ADEPT_HALL.x + x * c + z * s, z: ADEPT_HALL.z - x * s + z * c };
  }
  atDoor(p: THREE.Vector3): boolean {
    if (Math.abs(p.x - ADEPT_HALL.x) > 40 || Math.abs(p.z - ADEPT_HALL.z) > 40) return false;
    const l = p.clone().applyMatrix4(this.inv);
    return Math.abs(l.x) < 1.9 && l.z < BASE / 2 + 0.4 && l.z > BASE / 2 - 1.6;
  }
  outside(): { x: number; y: number; z: number; heading: number } {
    const p = new THREE.Vector3(0, 0, BASE / 2 + 4).applyMatrix4(this.world.matrixWorld);
    return { x: p.x, y: ADEPT_HALL.y, z: p.z, heading: this.face };
  }
  light(seen: Set<string>): void {
    const k = this.lights.k;
    ADEPT_ROOMS.forEach((id, i) => (k[i * 4] = seen.has(id) ? 1.4 : 0.6));
    this.lights.cloud.attrs.aK.needsUpdate = true;
  }
}

/** The lobby, in the journey's frame: the way in at +z, the door to the call at −z. */
function lobby(scene: THREE.Scene, seen: () => Set<string>): Room {
  const W = 22, H = 9;
  const group = new THREE.Group();
  group.name = "journey:adept-lobby";
  scene.add(group);
  const own: { dispose(): void }[] = [];
  const add = <M extends THREE.Object3D>(o: M) => (group.add(o), o);
  const floorG = new THREE.PlaneGeometry(W + 2, W + 2);
  floorG.rotateX(-Math.PI / 2);
  const floorM = landStone("red_sandstone_pavement", 0, 3.0, [0.95, 0.92, 0.88]);
  add(new THREE.Mesh(floorG, floorM)).receiveShadow = true;
  // walls, doors left open; a flat roof with a square opening over the crystal
  const walls: THREE.BufferGeometry[] = [];
  const wall = (w: number, x: number, z: number, rot: number) => {
    const g = new THREE.BoxGeometry(w, H, 1.2);
    g.translate(0, H / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(rot).setPosition(x, 0, z));
    walls.push(g);
  };
  const half = W / 2, gap = 2.4, side = half - gap;
  for (const z of [half, -half]) {
    wall(side, -(gap + side / 2), z, 0);
    wall(side, gap + side / 2, z, 0);
    const over = new THREE.BoxGeometry(gap * 2, H - 7.2, 1.2);
    over.translate(0, 7.2 + (H - 7.2) / 2, z);
    walls.push(over);
    for (const x of [-gap - 0.5, gap + 0.5]) {
      const j = new THREE.BoxGeometry(1.1, 7.2, 1.7);
      j.translate(x, 3.6, z);
      walls.push(j);
    }
    const l = new THREE.BoxGeometry(gap * 2 + 2.2, 1.1, 1.8);
    l.translate(0, 7.75, z);
    walls.push(l);
  }
  wall(W + 1.2, -half, 0, Math.PI / 2);
  wall(W + 1.2, half, 0, Math.PI / 2);
  // the roof: four slabs round a square opening
  const o = 3.2;
  for (const [w, d, x, z] of [[W + 2, half - o + 1, 0, (half + o) / 2], [W + 2, half - o + 1, 0, -(half + o) / 2], [half - o + 1, o * 2, (half + o) / 2, 0], [half - o + 1, o * 2, -(half + o) / 2, 0]] as const) {
    const g = new THREE.BoxGeometry(w, 0.9, d);
    g.translate(x, H + 0.45, z);
    walls.push(g);
  }
  // the plinth under the crystal
  const pl = new THREE.CylinderGeometry(1.5, 1.8, 0.9, 6);
  pl.translate(0, 0.45, 0);
  walls.push(pl);
  const wallM = landStone("sandstone_blocks_08", 0, 2.6, [0.92, 0.88, 0.82]);
  const wallMesh = add(new THREE.Mesh(merge(walls), wallM));
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  // papyrus columns, two rows of three each side of the way through
  const colG = columnGeometry();
  colG.scale(0.62, 0.8, 0.62);
  const colM = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0, vertexColors: true });
  const cols = new THREE.InstancedMesh(colG, colM, 8);
  const M = new THREE.Matrix4();
  let k = 0;
  for (const x of [-6.2, 6.2]) for (const z of [-7, -2.4, 2.4, 7]) cols.setMatrixAt(k++, M.makeTranslation(x, 0, z));
  cols.castShadow = cols.receiveShadow = true;
  add(cols);
  // the quartz, and the soft light falling on it from the opening
  const cluster = new THREE.Group();
  cluster.position.y = 0.9;
  add(cluster);
  const main = quartz(0.55, 3.2, 0.12, 0.35);
  cluster.add(main);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const s = quartz(0.28, 1.2 + (i % 3) * 0.5, 0.2 + (i % 2) * 0.1, 0.3);
    s.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
    s.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
    cluster.add(s);
  }
  const moon = new THREE.SpotLight(0xd6dcff, 70, 24, 0.38, 0.7, 1.4);
  moon.position.set(0, H + 8, 0);
  moon.target.position.set(0, 0, 0);
  add(moon);
  add(moon.target);
  const warm = new THREE.PointLight(0xffc27a, 26, 24, 1.4);
  warm.position.set(0, 4.5, 3);
  add(warm);
  // a shaft through the opening, soft, with dust in it
  {
    const g = new THREE.CylinderGeometry(2.2, 2.8, H + 2, 32, 1, true);
    g.translate(0, (H + 2) / 2, 0);
    const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    const y = T.positionGeometry.y.div(H + 2);
    const dust = vnoise(T.vec2(T.uv().x.mul(24), y.mul(10).sub(gpuUniforms.time.mul(0.08))));
    m.colorNode = vec4(vec3(0.75, 0.8, 1).mul(smoothstep(0, 0.4, y)).mul(float(0.02).add(dust.mul(0.025))), 1);
    add(new THREE.Mesh(g, m));
    own.push(g, m);
  }
  // beyond the open roof, the night
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide }));
  {
    const u = T.uv().mul(90);
    const h = T.fract(T.sin(T.dot(T.floor(u), T.vec2(12.9898, 78.233))).mul(43758.5453));
    (sky.material as THREE.MeshBasicNodeMaterial).colorNode = vec4(vec3(0.012, 0.016, 0.04).add(vec3(smoothstep(0.994, 1, h).mul(0.8))), 1);
  }
  sky.rotation.x = Math.PI / 2;
  sky.position.y = H + 6;
  add(sky);
  // the doorways: the night of the call ahead, the night outside behind
  const doorG = new THREE.PlaneGeometry(gap * 2, 7.2);
  doorG.translate(0, 3.6, 0);
  const aheadM = new THREE.MeshBasicNodeMaterial({ fog: false });
  aheadM.colorNode = vec4(T.mix(vec3(0.03, 0.04, 0.09), vec3(0.004, 0.006, 0.02), T.uv().y), 1);
  const ahead = add(new THREE.Mesh(doorG, aheadM));
  ahead.position.z = -half - 0.3;
  const behindM = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
  behindM.colorNode = vec4(T.mix(vec3(0.05, 0.06, 0.12), vec3(0.012, 0.015, 0.04), T.uv().y), 1);
  const behind = add(new THREE.Mesh(doorG, behindM));
  behind.position.z = half + 0.3;
  // seven small lights along the side walls, one for each room; a gold hairline under them
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 7; i++) {
    const x = i < 4 ? -half + 0.9 : half - 0.9;
    const z = i < 4 ? -6 + i * 4 : -6 + (i - 4) * 6;
    pts.push(new THREE.Vector3(x, 3.4, z));
  }
  const roomLights = lamps(pts, ROOM_COLORS, 0.7, pts.map(() => 0.35));
  add(roomLights.cloud.sprite);
  const pairs: number[] = [];
  for (const x of [-half + 0.62, half - 0.62]) pairs.push(x, 2.6, -half + 1.5, x, 2.6, half - 1.5);
  const lg = ribbonGeometry(pairs), lm = ribbonMaterial(vec3(1, 0.78, 0.45).mul(0.4), 0.5);
  add(new THREE.Mesh(lg, lm));
  own.push(floorG, floorM, wallM, colG, colM, doorG, aheadM, behindM, lg, lm, sky.geometry, sky.material as THREE.Material);

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
      cluster.rotation.y = t * 0.04;
      const s = seen();
      ADEPT_ROOMS.forEach((id, i) => (roomLights.k[i * 4] = s.has(id) ? 1.2 : 0.35));
      roomLights.cloud.attrs.aK.needsUpdate = true;
    },
    dispose() {
      scene.remove(group);
      for (const d of own) d.dispose();
      wallMesh.geometry.dispose();
      cluster.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  } satisfies SceneModule;
}

/** The walk: the lobby, the stations and chambers built so far, and home to the lobby. */
export function adeptStages(seen: () => Set<string>): Stage[] {
  const R = 11;
  const HOME = { x: 0, z: -8.5, heading: 0 };
  let callFloor: ((x: number, z: number) => number) | null = null;
  let stonesFloor: ((x: number, z: number) => number) | null = null;
  let dunes: ((x: number, z: number) => number) | null = null;
  return [
    {
      id: "lobby",
      title: "",
      make: async (scene) => lobby(scene, seen),
      start: { x: 0, z: 9, heading: Math.PI },
      exits: [
        { x: 0, z: -R - 0.1, r: 1.8, to: 1 },
        { x: 0, z: R + 0.1, r: 1.8, to: "out" },
      ],
      confine: (p) => {
        const lim = Math.abs(p.x) < 2.2 ? R + 0.6 : R - 0.9;
        p.x = Math.max(-(R - 0.9), Math.min(R - 0.9, p.x));
        p.z = Math.max(-lim, Math.min(lim, p.z));
      },
      air: {
        color: new THREE.Color(0.035, 0.03, 0.03),
        glow: new THREE.Color(0.09, 0.08, 0.08),
        glowDir: new THREE.Vector3(0, 1, 0),
        density: 0.004,
        shadow: new THREE.Color(0.006, 0.004, 0.01),
        sat: 1.02,
        contrast: 1.06,
      },
    },
    {
      id: "call",
      title: "The call",
      make: async (scene, nar, wh) => {
        const mod = await import("./call");
        callFloor = mod.callFloor;
        return mod.createCallScene(scene, nar, wh) as Room;
      },
      floor: (x, z) => (callFloor ? callFloor(x, z) : 0),
      start: { x: 0, z: 0, heading: Math.PI },
      exits: [{ x: 0, z: -42.3, r: 2.2, to: 2, dark: 1.5 }], // into the fire
      confine: box(-3, 3, -43, 6),
      ownAir: true,
    },
    {
      id: "crucible",
      title: "The crucible",
      make: async (scene, nar, wh) => (await import("./crucible")).createCrucibleScene(scene, nar, wh) as Room,
      start: { x: 0, z: 4.5, heading: Math.PI },
      exits: [{ x: 0, z: -18.4, r: 1.8, to: 3, dark: 1.5 }], // out of the fire, into the dawn
      confine: (p) => {
        const dx = p.x, dz = p.z + 6, d = Math.hypot(dx, dz), lim = Math.abs(p.x) < 1.5 && p.z < -6 ? 12.8 : 10.4;
        if (d > lim) (p.x = (dx / d) * lim), (p.z = -6 + (dz / d) * lim);
      },
      ownAir: true,
    },
    {
      id: "radiance",
      title: "The radiance",
      make: async (scene, nar, wh) => (await import("./radiance")).createRadianceScene(scene, nar, wh) as Room,
      start: { x: 0, z: 9, heading: Math.PI },
      exits: [{ x: 0, z: -16.6, r: 1.8, to: 4 }], // on to the ancient practices
      confine: (p) => {
        const d = Math.hypot(p.x, p.z), lim = Math.abs(p.x) < 1.6 && p.z < 0 ? 17 : 15.6;
        if (d > lim) (p.x *= lim / d), (p.z *= lim / d);
      },
      ownAir: true,
    },
    {
      id: "stones",
      title: "Stones and crystals",
      make: async (scene, nar, wh) => {
        const mod = await import("./stones");
        stonesFloor = mod.stonesFloor;
        return mod.createStonesScene(scene, nar, wh) as Room;
      },
      floor: (x, z) => (stonesFloor ? stonesFloor(x, z) : 0),
      start: { x: 0, z: 0, heading: Math.PI },
      exits: [{ x: 8, z: -34.3, r: 1.8, to: 5 }],
      confine: box(-9, 14, -35, 6),
      ownAir: true,
    },
    {
      id: "pyramids",
      title: "Pyramids, temples and geometry",
      make: async (scene, nar, wh) => {
        const mod = await import("./pyramids");
        dunes = mod.dunesFloor;
        return mod.createPyramidsScene(scene, nar, wh) as Room;
      },
      floor: (x, z) => (dunes ? dunes(x, z) : 0),
      start: { x: 0, z: 0, heading: Math.PI },
      exits: [{ x: 11, z: -30.3, r: 1.8, to: 0, at: HOME }], // the next chamber is still to come: home for now
      confine: box(-16, 16, -34, 6),
      ownAir: true,
    },
  ];
}
