/* The pyramid (Samuel: "we need a pyramid!!! research ra material pyramid, purposes,
   significance, composition"). Built after what Ra says of the Great Pyramid, paraphrased,
   never quoted (L/L Research, the Ra contact):
   - It was thought/built by Ra's social memory complex from thought-forms, "everlasting rock";
     the stones are alive (2.4, 3.11–3.13). Its casing here is pale limestone whose courses
     carry a slow living light, and its capstone rose granite, chosen for its crystalline
     properties (3.6).
   - Its purposes were one: healing and initiation, to prepare mind, body and spirit for
     service; pyramids were to ring the Earth, balancing the energy coming in (2.4, 3.15). The
     technology was later kept by those with power, which Ra did not intend (2.2, 57.17).
   - The shape: light is drawn in at the base, as water into a funnel, and spirals upward to the
     apex (58.12, 58.15); three spirals: one within for study and healing, one to the apex for
     building, one out of the apex like a candle flame for energizing (58.23–24). One side
     faces north (58.8); faces at 51.84°, an apex angle near 76° 18′ (56.4).
   - Within (a place apart, like the temple): the subterranean chamber, a resonating chamber
     open at its bottom (55.13); the Queen's Chamber, the place of initiation and resurrection,
     where the senses rest so that, in a sense, another life begins (3.16, 56.3); the Grand
     Gallery; the King's Chamber, the place of healing, where light moves through in seven
     colours (56.3, 57.12), with the coffer and a crystal (2.4).
   - Ra later called such shapes training wheels, no longer needed (60.13, 60.16).
   Outside you can climb its faces to the apex (terrain.ts `standAt`). */
import * as THREE from "three/webgpu";
import { T, worldPoints, type N } from "../gpu/tsl";
import { scan, type ScanName } from "./temple";
import { landStone } from "./stoneworks";
import { release } from "../core/residency";
import { PYRAMID } from "./terrain";
import { Duat, DUAT_PATH, duatHeight } from "./duat";

const { abs, cos, float, floor, fract, mix, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;
const V = THREE.Vector3;

export const PYR_ORIGIN = new THREE.Vector3(50000, 14, 0); // high enough that its lowest chamber (−9) stays above the water line
export const DUAT_ORIGIN = PYR_ORIGIN.clone().add(new THREE.Vector3(-140, -4, 60)); // world origin of the Duat: pyramid-local (−140, −4, 60), clear of the rooms (x ∈ [−34, 47.5]) and above the world's water line (y 10; its lowest dune ~2.4 m below): at −30 it stood at y −16, so the controller took its sand for a lake and the wanderer swam through it

/* ---------------------------------------------------------------- stone */
function triplanar(set: ScanName, tile: number, origin?: THREE.Vector3): { col: N; arm: N; w: N } {
  const S = scan(set);
  const pw = origin ? T.positionWorld.sub(vec3(origin.x, origin.y, origin.z)) : T.positionWorld, n = T.normalWorldGeometry;
  const wp = T.pow(abs(n), vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tri = (t: THREE.Texture) =>
    T.texture(t, pw.zy.div(tile)).mul(w.x).add(T.texture(t, pw.xz.div(tile)).mul(w.y)).add(T.texture(t, pw.xy.div(tile)).mul(w.z));
  return { col: tri(S.diff).rgb, arm: tri(S.arm), w };
}
/** Pale limestone, its block courses breathing a slow living light ("the stones are alive"). */
function limestone(uT: N, tint: [number, number, number], alive = 1, tile = 2.4): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.8 });
  const { col, arm, w } = triplanar("sandstone_blocks_05", tile);
  const pw = T.positionWorld;
  // courses: level joints every 1.3 m, upright joints staggered every 1.8 m, drawn as fine dark
  // hairlines (never glowing: a grid of light read as a wireframe, "Minecraft"), and each block
  // its own tone, so the faces read as laid stone rather than a pattern
  const cy = fract(pw.y.div(1.3));
  const row = floor(pw.y.div(1.3));
  const along = pw.x.add(pw.z).add(row.mul(0.9));
  const jH = smoothstep(0.03, 0.0, cy.sub(0.5).abs().sub(0.47).abs());
  const jV = smoothstep(0.02, 0.0, fract(along.div(1.8)).sub(0.5).abs().sub(0.48).abs()).mul(float(1).sub(w.y));
  const joint = jH.max(jV);
  const block = floor(along.div(1.8)).add(row.mul(17.3));
  const tone = fract(sin(block.mul(12.9898)).mul(43758.5453)).mul(0.18).add(0.9);
  const c = col.mul(vec3(...tint)).mul(T.mix(float(0.55), float(1), arm.r)).mul(tone).mul(float(1).sub(joint.mul(0.3)));
  m.colorNode = vec4(c, 1);
  m.roughnessNode = T.clamp(arm.g, 0.45, 1);
  // "the stones are alive": a slow swell of warm light rising through the stone, not lines
  const wave = sin(pw.y.mul(0.35).sub(uT.mul(0.9))).mul(0.5).add(0.5);
  const beat = T.pow(sin(uT.mul(1.1)).mul(0.5).add(0.5), 6);
  m.emissiveNode = vec3(1.0, 0.8, 0.5).mul(wave.mul(0.045).add(beat.mul(0.02)).mul(alive)).add(c.mul(0.05));
  return m;
}
/** The chambers' limestone: the game's cut masonry (courses, flagstones, recessed joints seen in
    depth, worn arrises), laid in the pyramid's own frame and dry (no lichen, no streaks). The
    stones are alive: a slow swell of warm light rises through them, never drawn as lines. */
function innerStone(uT: N, alive = 1): THREE.MeshStandardNodeMaterial {
  const m = landStone("sandstone_blocks_05", -1e4, 2.4, [1.22, 1.16, 1.05], { course: 1.3, block: 1.8, flag: 1.5, origin: PYR_ORIGIN, interior: true });
  const pw = T.positionWorld.sub(vec3(PYR_ORIGIN.x, PYR_ORIGIN.y, PYR_ORIGIN.z));
  const wave = sin(pw.y.mul(0.35).sub(uT.mul(0.9))).mul(0.5).add(0.5);
  const beat = T.pow(sin(uT.mul(1.1)).mul(0.5).add(0.5), 6);
  m.emissiveNode = vec3(1.0, 0.78, 0.5).mul(wave.mul(0.035).add(beat.mul(0.02)).mul(alive));
  return m;
}
/** Rose granite (the capstone, the King's Chamber, the coffer): dark, flecked, with crystal glints. */
function granite(uT: N, origin?: THREE.Vector3): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0.05, roughness: 0.5 });
  // laid in its own frame (inside, 50 km out, world positions broke the hashes into blocky squares)
  const { col } = triplanar("red_sandstone_pavement", 1.6, origin);
  const pw = origin ? T.positionWorld.sub(vec3(origin.x, origin.y, origin.z)) : T.positionWorld;
  const h = (p: N) => fract(sin(T.dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  // the crystals in granite: round grains (pale feldspar, dark mica), not square cells
  const g = T.mx_noise_float(pw.mul(34)), g2 = T.mx_noise_float(pw.mul(61).add(3.3));
  const tone = mix(float(1), float(1.5), smoothstep(0.32, 0.5, g)).mul(mix(float(1), float(0.45), smoothstep(0.38, 0.55, g2)));
  const c = col.mul(vec3(0.72, 0.46, 0.44)).mul(tone);
  m.colorNode = vec4(c, 1);
  const cell = floor(pw.mul(26));
  const fleck = h(cell);
  const glint = smoothstep(0.994, 1.0, h(cell.add(7))).mul(sin(uT.mul(1.7).add(fleck.mul(40))).mul(0.5).add(0.5));
  m.emissiveNode = vec3(1.0, 0.9, 0.8).mul(glint.mul(0.9)).add(c.mul(0.04));
  return m;
}
function crystalGlow(uT: N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, fog: false });
  const V0 = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const ndv = T.max(T.dot(T.normalWorld, V0), 0);
  const film = cos(vec3(ndv.mul(1.5).add(uT.mul(0.05))).add(vec3(0, 0.33, 0.67)).mul(6.28)).mul(0.5).add(0.5);
  m.colorNode = vec4(film.mul(T.pow(float(1).sub(ndv), 1.5).mul(0.8).add(0.15)), 1);
  return m;
}

/* ---------------------------------------------------------------- rooms, from the inside */
interface Room {
  name: string;
  x0: number; x1: number; z0: number; z1: number;
  /** floor at x0 and at x1 (rooms slope only along x) */
  f0: number; f1: number;
  h: number;
  /** openings: wall ("n" z0, "s" z1, "w" x0, "e" x1), span along the wall [a, b], top above the floor */
  open: { wall: "n" | "s" | "w" | "e"; a: number; b: number; top: number }[];
  granite?: boolean;
  gable?: number;
  corbel?: boolean;
}
const ROOMS: Room[] = [
  { name: "entry", x0: -1.6, x1: 1.6, z0: 0, z1: 22, f0: 0, f1: 0, h: 3.6, open: [
    { wall: "n", a: -1.2, b: 1.2, top: 3 }, { wall: "w", a: 6, b: 9.4, top: 3 }, { wall: "e", a: 13.8, b: 17.6, top: 3.4 }, { wall: "s", a: -1.2, b: 1.2, top: 2.6 }] },
  { name: "descent", x0: -22, x1: -1.6, z0: 6, z1: 9.4, f0: -9, f1: 0, h: 3.2, open: [
    { wall: "e", a: 6, b: 9.4, top: 3 }, { wall: "w", a: 6, b: 9.4, top: 3 }] },
  { name: "pit", x0: -34, x1: -22, z0: 0, z1: 15.4, f0: -9, f1: -9, h: 5.2, open: [{ wall: "e", a: 6, b: 9.4, top: 3 }] },
  { name: "queen-passage", x0: -1.2, x1: 1.2, z0: 22, z1: 40, f0: 0, f1: 0, h: 2.6, open: [
    { wall: "n", a: -1.2, b: 1.2, top: 2.6 }, { wall: "s", a: -1.2, b: 1.2, top: 2.6 }] },
  { name: "queen", x0: -3, x1: 3, z0: 40, z1: 45.4, f0: 0, f1: 0, h: 4.6, gable: 2.3, open: [{ wall: "n", a: -1.2, b: 1.2, top: 2.6 }] },
  { name: "gallery", x0: 1.6, x1: 34, z0: 13.8, z1: 17.6, f0: 0, f1: 13, h: 8.6, corbel: true, open: [
    { wall: "w", a: 13.8, b: 17.6, top: 3.4 }, { wall: "e", a: 14.2, b: 17.2, top: 3 }] },
  { name: "ante", x0: 34, x1: 37, z0: 14.2, z1: 17.2, f0: 13, f1: 13, h: 3.6, granite: true, open: [
    { wall: "w", a: 14.2, b: 17.2, top: 3 }, { wall: "e", a: 14.2, b: 17.2, top: 3 }] },
  { name: "king", x0: 37, x1: 47.5, z0: 12.6, z1: 18.8, f0: 13, f1: 13, h: 5.8, granite: true, open: [{ wall: "w", a: 14.2, b: 17.2, top: 3 }] },
];
const floorOf = (r: Room, x: number) => r.f0 + (r.f1 - r.f0) * THREE.MathUtils.clamp((x - r.x0) / (r.x1 - r.x0), 0, 1);
const COFFER = new V(39.6, 13, 15.7); // local, in the King's Chamber, toward its west end
const PIT = new V(-28, -9, 7.7); // the open floor of the resonating chamber
const QUEEN = new V(0, 0, 42.7);

/** Quads facing into the room (drawn from inside, so from outside they vanish: the camera sees in). */
class Shell {
  pos: number[] = [];
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, inward: THREE.Vector3): void {
    const n = new V().subVectors(b, a).cross(new V().subVectors(d, a));
    const [p, q, r, s] = n.dot(inward) >= 0 ? [a, b, c, d] : [a, d, c, b];
    this.pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z, p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.computeVertexNormals();
    return g;
  }
}
function buildRoom(r: Room, sh: Shell): void {
  const f = (x: number) => floorOf(r, x);
  const P = (x: number, y: number, z: number) => new V(x, y, z);
  // floor and ceiling (in strips along x, as the floor may slope)
  const n = r.f0 === r.f1 ? 1 : Math.max(2, Math.round((r.x1 - r.x0) / 2));
  for (let i = 0; i < n; i++) {
    const a = r.x0 + ((r.x1 - r.x0) * i) / n, b = r.x0 + ((r.x1 - r.x0) * (i + 1)) / n;
    sh.quad(P(a, f(a), r.z0), P(b, f(b), r.z0), P(b, f(b), r.z1), P(a, f(a), r.z1), new V(0, 1, 0));
    if (!r.gable) {
      const inset = r.corbel ? 1.1 : 0; // the gallery's roof is narrow over its corbelled walls
      sh.quad(P(a, f(a) + r.h, r.z0 + inset), P(b, f(b) + r.h, r.z0 + inset), P(b, f(b) + r.h, r.z1 - inset), P(a, f(a) + r.h, r.z1 - inset), new V(0, -1, 0));
    }
  }
  // walls along x (north z0, south z1), with openings along x
  for (const [wall, z, inZ] of [["n", r.z0, 1], ["s", r.z1, -1]] as const) {
    const ops = r.open.filter((o) => o.wall === wall).sort((p, q) => p.a - q.a);
    let x = r.x0;
    const seg = (a: number, b: number, lo: number) => {
      if (b - a < 0.01) return;
      const m = Math.max(1, Math.round((b - a) / 2));
      for (let i = 0; i < m; i++) {
        const u = a + ((b - a) * i) / m, v = a + ((b - a) * (i + 1)) / m;
        if (r.corbel) {
          // corbelled: the wall steps inward as it rises, seven courses
          for (let k = 0; k < 7; k++) {
            const y0 = k === 0 ? lo : 2.4 + (k - 1) * 0.95, y1 = k === 6 ? r.h : 2.4 + k * 0.95, inset = k * 0.16 * inZ;
            if (y1 <= lo) continue;
            sh.quad(P(u, f(u) + Math.max(y0, lo), z + inset), P(v, f(v) + Math.max(y0, lo), z + inset), P(v, f(v) + y1, z + inset), P(u, f(u) + y1, z + inset), new V(0, 0, inZ));
            if (k < 6) sh.quad(P(u, f(u) + y1, z + inset), P(v, f(v) + y1, z + inset), P(v, f(v) + y1, z + inset + 0.16 * inZ), P(u, f(u) + y1, z + inset + 0.16 * inZ), new V(0, -1, 0));
          }
        } else sh.quad(P(u, f(u) + lo, z), P(v, f(v) + lo, z), P(v, f(v) + r.h, z), P(u, f(u) + r.h, z), new V(0, 0, inZ));
      }
    };
    for (const o of ops) {
      seg(x, o.a, 0);
      seg(o.a, o.b, o.top);
      x = o.b;
    }
    seg(x, r.x1, 0);
    // a gable's end, a triangle over the wall
    if (r.gable) {
      const mid = (r.x0 + r.x1) / 2;
      const a = P(r.x0, r.h, z), b = P(r.x1, r.h, z), c = P(mid, r.h + r.gable, z);
      const nrm = new V().subVectors(b, a).cross(new V().subVectors(c, a));
      const tri = nrm.z * inZ >= 0 ? [a, b, c] : [a, c, b];
      for (const p of tri) sh.pos.push(p.x, p.y, p.z);
    }
  }
  // walls along z (west x0, east x1), with openings along z
  for (const [wall, x, inX] of [["w", r.x0, 1], ["e", r.x1, -1]] as const) {
    const ops = r.open.filter((o) => o.wall === wall).sort((p, q) => p.a - q.a);
    const fy = f(x);
    let z = r.z0;
    const top = r.h;
    const seg = (a: number, b: number, lo: number) => {
      if (b - a < 0.01 || lo >= top) return;
      sh.quad(P(x, fy + lo, a), P(x, fy + lo, b), P(x, fy + top, b), P(x, fy + top, a), new V(inX, 0, 0));
    };
    for (const o of ops) {
      seg(z, o.a, 0);
      seg(o.a, o.b, o.top);
      z = o.b;
    }
    seg(z, r.z1, 0);
  }
  if (r.gable) {
    const mid = (r.x0 + r.x1) / 2;
    for (const [xa, inX] of [[r.x0, 1], [r.x1, -1]] as const)
      sh.quad(P(xa, r.h, r.z0), P(mid, r.h + r.gable, r.z0), P(mid, r.h + r.gable, r.z1), P(xa, r.h, r.z1), new V(inX * 0.5, -1, 0));
  }
}

/* ---------------------------------------------------------------- the pyramid */
export type Chamber = "none" | "entry" | "pit" | "queen" | "gallery" | "king";

export class Pyramid {
  /** Outside, in the world. */
  world = new THREE.Group();
  /** Inside, beyond the world's edge. */
  inside = new THREE.Group();
  isInside = false;
  readonly door = new THREE.Vector3(); // the entrance, outside (world)
  readonly apex = new THREE.Vector3();
  private uT = uniform(0);
  private uFlame = uniform(0.6);
  private motes!: { pos: THREE.InstancedBufferAttribute; seed: Float32Array };
  private gallery!: { pos: THREE.InstancedBufferAttribute; seed: Float32Array };
  private uPit = uniform(0);
  private lamps: { light: THREE.PointLight; base: number; phase: number }[] = [];
  private kingLight: THREE.PointLight | null = null;
  private uCrystal = uniform(0);
  private local = new THREE.Vector3();
  /** The seven colours of the King's Chamber, lit one by one on the wanderer (main.ts). */
  seven: THREE.Sprite[] = [];
  uDoor = T.uniform(0);
  doorFound: boolean = false;
  whisperTimer: number = 0;
  doorPos: THREE.Vector3 = new THREE.Vector3(-34, -7.4, 7.7);
  playerPos: THREE.Vector3 | null = null;
  doorSlab: THREE.Mesh | null = null;
  roomsGroup: THREE.Group = new THREE.Group();
  /** The Duat (duat.ts), in its own group: child of `inside`, shown with the interior. */
  duat: THREE.Group = new THREE.Group();
  /** The Duat: built on going into the pyramid, freed on coming out (residency). */
  private night: Duat | null = null;
  /** Its way (Duat-local): the hidden door, the six hours, the dawn (main.ts reads it). */
  readonly PATH = DUAT_PATH;
  private lastT = 0;
  duatActive = false;

  inDuat(p: THREE.Vector3): boolean {
    const dx = p.x - DUAT_ORIGIN.x, dy = p.y - DUAT_ORIGIN.y, dz = p.z - DUAT_ORIGIN.z;
    return dx * dx + dy * dy + dz * dz < 55 * 55;
  }

  shouldEnterDuat(): boolean {
    if (this.duatActive) return false;
    const p = this.playerPos, d = this.doorPos, u = this.uDoor;
    if (!p || !d || !u || !(u.value > 0.7)) return false;
    const wx = p.x - (PYR_ORIGIN.x + d.x);
    const wy = p.y - (PYR_ORIGIN.y + d.y);
    const wz = p.z - (PYR_ORIGIN.z + d.z);
    return wx * wx + wy * wy + wz * wz < 2.5 * 2.5;
  }

  duatEntryPoint(): THREE.Vector3 {
    const q = this.PATH[0] ?? new THREE.Vector3();
    return new THREE.Vector3(
      DUAT_ORIGIN.x + q.x,
      DUAT_ORIGIN.y + q.y + 1.0,
      DUAT_ORIGIN.z + q.z
    );
  }

  exitDuatPoint(): THREE.Vector3 {
    const d = this.doorPos ?? new THREE.Vector3();
    return new THREE.Vector3(
      PYR_ORIGIN.x + d.x,
      PYR_ORIGIN.y + d.y + 1.0,
      PYR_ORIGIN.z + d.z + 2.0
    );
  }
  private say(text: string, ms: number): void {
    const w = document.querySelector("#whisper") as HTMLElement | null;
    if (!w) return;
    w.textContent = text;
    w.classList.add("on");
    window.clearTimeout(this.whisperTimer);
    this.whisperTimer = window.setTimeout(() => w.classList.remove("on"), ms);
  }

  private buildHiddenDoor(): void {
    // Station 0 — the threshold to the Duat: a seam of light in the west wall of the pit.
    const glowMat = new THREE.MeshBasicNodeMaterial({
      color: 0xffd700,
      transparent: true,
      fog: false,
      depthWrite: false,
    });
    glowMat.blending = THREE.CustomBlending;
    glowMat.blendSrc = THREE.SrcAlphaFactor;
    glowMat.blendDst = THREE.OneFactor;
    glowMat.blendSrcAlpha = THREE.ZeroFactor;
    glowMat.blendDstAlpha = THREE.OneFactor;

    const duv = T.uv();
    const x01 = T.abs(duv.x.sub(0.5)).mul(2.0);
    const y01 = T.abs(duv.y.sub(0.5)).mul(2.0);
    const prof = T.float(1).sub(x01.mul(0.45));
    const yProf = T.float(1).sub(y01.mul(y01).mul(0.35));
    const breath = T.sin(this.uT.mul(0.5)).mul(0.12).add(0.88);
    const open = this.uDoor.mul(0.55).add(0.62);
    const k = prof.mul(yProf).mul(breath).mul(open);
    glowMat.colorNode = T.vec4(T.vec3(1.0, 0.78, 0.45).mul(k), 1);

    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.6), glowMat);
    glow.position.set(-33.98, -7.4, 7.7);
    glow.rotation.y = Math.PI / 2;
    glow.renderOrder = 3;
    glow.frustumCulled = false;

    const slabMat = new THREE.MeshStandardNodeMaterial({
      color: 0x1c1a2c,
      roughness: 0.78,
      metalness: 0.05,
    });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 2.35), slabMat);
    slab.position.set(-33.55, -7.4, 7.7);
    slab.castShadow = true;
    slab.receiveShadow = true;

    this.doorSlab = slab;
    this.inside.add(glow, slab);
  }


  constructor() {
    this.buildOutside();
    this.buildInside();
    this.inside.visible = false;
  }

  private buildOutside(): void {
    const { x, y, z, half: H, height: Ht } = PYRAMID;
    this.world.position.set(x, y, z);
    this.apex.set(x, y + Ht, z);
    const capK = 0.9; // the capstone: the top tenth
    const at = (k: number) => ({ h: Ht * k, r: H * (1 - k) });
    const faces = (k0: number, k1: number) => {
      const a = at(k0), b = at(k1);
      const pos: number[] = [];
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
        const p0 = [ax * a.r, a.h, az * a.r], p1 = [bx * a.r, a.h, bz * a.r], p2 = [bx * b.r, b.h, bz * b.r], p3 = [ax * b.r, b.h, az * b.r];
        // outward winding: corners run clockwise seen from above (−z to +x), so this faces out
        pos.push(...p0, ...p2, ...p1, ...p0, ...p3, ...p2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    };
    const casing = new THREE.Mesh(faces(0, capK), limestone(this.uT, [1.45, 1.4, 1.3], 1, 3.2));
    casing.receiveShadow = casing.castShadow = true;
    const cap = new THREE.Mesh(faces(capK, 0.9999), granite(this.uT));
    cap.castShadow = true;
    this.world.add(casing, cap);
    // the entrance, on the north face: a doorway of granite blocks standing out from the casing
    const gm = granite(this.uT);
    const dz = -H - 1.0;
    for (const sx of [-1.6, 1.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.2, 2.2), gm);
      post.position.set(sx, 2.1, dz + 0.6);
      this.world.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.1, 2.4), gm);
    lintel.position.set(0, 4.7, dz + 0.6);
    this.world.add(lintel);
    const glowM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, side: THREE.DoubleSide, fog: false });
    const d = uv().sub(vec2(0.5, 0)).mul(vec2(2, 1));
    glowM.colorNode = vec4(vec3(1.0, 0.82, 0.55).mul(smoothstep(1.1, 0.2, T.length(d)).mul(0.35)), 1);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 4.1), glowM);
    glow.position.set(0, 2.05, dz + 1.3);
    this.world.add(glow);
    this.door.set(x, y, z + dz - 0.4);
    // the third spiral: from the apex, like a candle flame (58.24); soft and contained
    const fm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, fog: false });
    {
      const p = uv().sub(vec2(0.5, 0.0)).mul(vec2(2, 1));
      const flick = sin(this.uT.mul(1.3)).mul(0.04).add(sin(this.uT.mul(2.9)).mul(0.03));
      // a teardrop: wide at its root, drawn to a point above
      const width = T.max(float(0.02), float(1).sub(p.y).mul(p.y.mul(3.2).min(1)).mul(0.9));
      const k = smoothstep(width, width.mul(0.2), abs(p.x.add(flick.mul(p.y)))).mul(smoothstep(0, 0.06, p.y)).mul(smoothstep(1, 0.6, p.y));
      const core = smoothstep(width.mul(0.5), 0, abs(p.x)).mul(smoothstep(0.55, 0.05, p.y));
      fm.colorNode = vec4(vec3(1.0, 0.78, 0.45).mul(k.mul(0.35)).add(vec3(1.0, 0.95, 0.85).mul(core.mul(0.4))).mul(this.uFlame), 1);
    }
    const flame = new THREE.Sprite(fm);
    flame.center.set(0.5, 0); // it rises from the apex
    flame.scale.set(5, 16, 1);
    flame.position.set(0, Ht - 0.3, 0);
    this.world.add(flame);
    // light drawn in at the base and spiralling up the faces to the apex, as water into a funnel
    const N = 280;
    const seed = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) seed[i] = Math.random();
    const pts = worldPoints(new Float32Array(N * 3), { color: new THREE.Color(1.0, 0.86, 0.6), size: 0.22, opacity: 0.7 });
    this.world.add(pts.sprite);
    pts.sprite.frustumCulled = false;
    this.motes = { pos: pts.position, seed };
  }

  /** The Duat's hours (Duat-local), for the tour; and one hour's story told again from its start. */
  duatHours(): ReturnType<Duat["hours"]> {
    return this.night?.hours() ?? [];
  }
  duatRestart(k: number): void {
    this.night?.restart(k);
  }

  /** The ceiling over (x, z), pyramid-local (the room's floor there and its height). */
  private ceilingAt(x: number, z: number): number {
    const r = ROOMS.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
    return r ? floorOf(r, x) + r.h : 3;
  }

  private buildInside(): void {
    this.inside.position.copy(PYR_ORIGIN);
    const lime = new Shell(), gran = new Shell();
    for (const r of ROOMS) buildRoom(r, r.granite ? gran : lime);
    const limeM = innerStone(this.uT, 1.4);
    limeM.side = THREE.FrontSide;
    this.roomsGroup = new THREE.Group();
    const limeMesh = new THREE.Mesh(lime.geometry(), limeM), granMesh = new THREE.Mesh(gran.geometry(), granite(this.uT, PYR_ORIGIN));
    limeMesh.receiveShadow = granMesh.receiveShadow = true;
    this.roomsGroup.add(limeMesh, granMesh);
    this.inside.add(this.roomsGroup);
    // the coffer: a lidless box of granite
    const gm = granite(this.uT, PYR_ORIGIN);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gm);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      this.inside.add(m);
    };
    const C = COFFER;
    box(2.3, 0.15, 1.0, C.x, C.y + 0.075, C.z);
    for (const s of [-1, 1]) box(2.3, 1.05, 0.15, C.x, C.y + 0.52, C.z + s * 0.43);
    for (const s of [-1, 1]) box(0.15, 1.05, 0.72, C.x + s * 1.075, C.y + 0.52, C.z);
    // the crystal over the place of healing
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), crystalGlow(this.uT));
    cr.scale.set(1, 2, 1);
    cr.position.set(C.x, C.y + 3.4, C.z);
    this.inside.add(cr);
    // the pit: the resonating chamber's open floor, light far below
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, fog: false });
    {
      const p = uv().sub(0.5).mul(2), r = T.length(p);
      const rings = sin(r.mul(22).sub(this.uT.mul(1.2))).mul(0.5).add(0.5);
      pm.colorNode = vec4(vec3(0.95, 0.7, 0.42).mul(smoothstep(1, 0.1, r).mul(rings.mul(0.4).add(0.3)).mul(this.uPit.mul(0.8).add(0.25))), 1);
    }
    const pit = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), pm);
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(PIT.x, PIT.y + 0.03, PIT.z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.14, 8, 40), limeM);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(PIT.x, PIT.y + 0.05, PIT.z);
    this.inside.add(pit, rim);
    // light inside: dim and warm. Every pool of light has its source: an oil lamp hanging on a
    // fine chain, its small flame licking and its light flickering with it (`lamps`); the one in
    // the Grand Gallery throws moving shadows. The King's Chamber's light is rose-gold, and a
    // pale beam falls through its air-shaft.
    const hemi = new THREE.HemisphereLight(0xffe2c0, 0x201810, 0.28);
    this.inside.add(hemi);
    const bronze = new THREE.MeshStandardNodeMaterial({ color: 0x7a5a30, roughness: 0.45, metalness: 0.75 });
    const bowlGeo = new THREE.LatheGeometry([[0.001, -0.06], [0.1, -0.05], [0.14, 0.0], [0.13, 0.04], [0.001, 0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
    const flameMat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    {
      const q = uv(), y = q.y;
      const sway = sin(this.uT.mul(6.1).add(y.mul(5))).mul(0.06).mul(y);
      const xx = q.x.sub(0.5).sub(sway);
      const w = T.pow(float(1).sub(y), float(0.8)).mul(0.28).add(0.02);
      const body = T.exp(xx.div(w).mul(xx.div(w)).negate()).mul(smoothstep(0, 0.16, y)).mul(smoothstep(1, 0.5, y.add(sin(this.uT.mul(9.3)).mul(0.05))));
      const core = T.exp(xx.div(w.mul(0.45)).pow(2).negate()).mul(smoothstep(0.6, 0.1, y));
      flameMat.colorNode = vec4(mix(vec3(1.0, 0.45, 0.14), vec3(1.0, 0.9, 0.65), core).mul(body).mul(1.4), 1);
    }
    const lampAt: [number, number, number, number, number][] = [[0, 2.6, 4, 9, 0], [-28, -6.2, 8, 12, 1.3], [0, 3.2, 42.7, 9, 2.1], [18, 10.6, 15.7, 15, 0.7], [-8, -0.5, 7.7, 6, 3.4]];
    for (const [x, y, z, k, ph] of lampAt) {
      const ceil = this.ceilingAt(x, z);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, Math.max(0.1, ceil - y), 4), bronze);
      chain.position.set(x, (ceil + y) / 2, z);
      const bowl = new THREE.Mesh(bowlGeo, bronze);
      bowl.position.set(x, y, z);
      const f = new THREE.Sprite(flameMat);
      f.scale.set(0.16, 0.3, 1);
      f.position.set(x, y + 0.17, z);
      const l = new THREE.PointLight(0xffb870, k, 20, 1.6);
      l.position.set(x, y + 0.25, z);
      if (x === 18) {
        // the Gallery's lamp throws moving shadows along its corbelled walls
        l.castShadow = true;
        l.shadow.mapSize.set(512, 512);
        l.shadow.bias = -0.004;
      }
      this.inside.add(chain, bowl, f, l);
      this.lamps.push({ light: l, base: k, phase: ph });
    }
    {
      // the King's Chamber: rose-gold, breathing slowly over the coffer
      const l = new THREE.PointLight(0xffb49a, 12, 18, 1.5);
      l.position.set(42, 17.2, 15.7);
      this.inside.add(l);
      this.kingLight = l;
      // its air-shaft: a small square of daylight high in the south wall, a pale beam slanting down
      const sm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false });
      const vdir = T.normalize(T.cameraPosition.sub(T.positionWorld));
      const through = T.pow(abs(T.dot(T.normalWorld, vdir)), 1.5);
      const along = smoothstep(0, 0.15, uv().y).mul(smoothstep(1, 0.55, uv().y).mul(0.6).add(0.4));
      const dust = T.mx_noise_float(vec3(uv().x.mul(8), uv().y.mul(6).sub(this.uT.mul(0.04)), 0)).mul(0.3).add(0.7);
      sm.colorNode = vec4(vec3(1.0, 0.9, 0.72).mul(through.mul(along).mul(dust).mul(0.32)), 1);
      const len = 6.2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, len, 18, 1, true), sm);
      const top = new THREE.Vector3(44.5, 18.3, 18.75), foot = new THREE.Vector3(43.4, 13.05, 15.2);
      beam.position.copy(top).add(foot).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
      beam.scale.y = top.distanceTo(foot) / len;
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(1.0, 0.92, 0.75), fog: false }));
      hole.position.set(44.5, 18.3, 18.78);
      hole.rotation.y = Math.PI;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(0.55, 28), new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      (pool.material as THREE.MeshBasicNodeMaterial).colorNode = vec4(vec3(1.0, 0.86, 0.66).mul(smoothstep(1, 0.2, T.length(uv().sub(0.5)).mul(2)).mul(0.22)), 1);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(foot.x, 13.03, foot.z);
      pool.scale.set(1, 1.6, 1);
      this.inside.add(beam, hole, pool);
    }
    // motes rising along the gallery (light spiralling upward), and around the coffer
    const N = 160;
    const seed = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) seed[i] = Math.random();
    const g = worldPoints(new Float32Array(N * 3), { color: new THREE.Color(1.0, 0.85, 0.6), size: 0.06, opacity: 0.7 });
    g.sprite.frustumCulled = false;
    this.inside.add(g.sprite);
    this.gallery = { pos: g.position, seed };
    // the seven colours, lit on the wanderer in the King's Chamber (placed by main.ts)
    const cols = [0xff3a2e, 0xff8a24, 0xffd83a, 0x4fe07a, 0x3aa8ff, 0x5a4dff, 0xb45cff];
    for (const c of cols) {
      const m = new THREE.SpriteMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false, depthTest: false, map: dotTexture() });
      const s = new THREE.Sprite(m);
      s.scale.setScalar(0.5);
      s.renderOrder = 20;
      s.visible = false;
      this.seven.push(s);
    }
    this.buildHiddenDoor();
    // the Duat: its own place below the pyramid (duat.ts), built when you go in (`show`)
    this.duat.position.copy(DUAT_ORIGIN).sub(PYR_ORIGIN);
    this.inside.add(this.duat);
  
  }

  /** Which chamber a point inside is in. */
  chamber(p: THREE.Vector3): Chamber {
    const l = this.local.copy(p).sub(PYR_ORIGIN);
        if (this.inDuat(p)) return "none";
    for (const r of ROOMS)
      if (l.x >= r.x0 - 0.01 && l.x <= r.x1 + 0.01 && l.z >= r.z0 - 0.01 && l.z <= r.z1 + 0.01)
        return r.name === "king" || r.name === "ante" ? "king" : r.name === "queen" || r.name === "queen-passage" ? "queen" : r.name === "pit" || r.name === "descent" ? "pit" : r.name === "gallery" ? "gallery" : "entry";
    return "none";
  }
  /** Where the wanderer is in the healing place, the initiation place, or at the pit. */
  inCoffer(p: THREE.Vector3): boolean {
    const l = this.local.copy(p).sub(PYR_ORIGIN);
    return Math.abs(l.x - COFFER.x) < 1.6 && Math.abs(l.z - COFFER.z) < 1.2;
  }
  atQueenCentre(p: THREE.Vector3): boolean {
    const l = this.local.copy(p).sub(PYR_ORIGIN);
    return Math.hypot(l.x - QUEEN.x, l.z - QUEEN.z) < 1.8;
  }
  nearPit(p: THREE.Vector3): number {
    const l = this.local.copy(p).sub(PYR_ORIGIN);
    return THREE.MathUtils.smoothstep(6, 1.5, Math.hypot(l.x - PIT.x, l.z - PIT.z)) * (l.x < -20 ? 1 : 0);
  }
  cofferTop(): THREE.Vector3 {
    return COFFER.clone().add(PYR_ORIGIN);
  }

  /** The floor inside. */
  floorAt(x: number, z: number): number {
    const lx = x - PYR_ORIGIN.x, lz = z - PYR_ORIGIN.z;
    const dx = x - DUAT_ORIGIN.x, dz = z - DUAT_ORIGIN.z;
    if (dx * dx + dz * dz < 55 * 55) return DUAT_ORIGIN.y + duatHeight(dx, dz);
    let best: Room | null = null, bd = Infinity;
    for (const r of ROOMS) {
      const dx = Math.max(r.x0 - lx, 0, lx - r.x1), dz = Math.max(r.z0 - lz, 0, lz - r.z1);
      const d = Math.hypot(dx, dz);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return PYR_ORIGIN.y + (best ? floorOf(best, lx) : 0);
  }

  /** Keep the wanderer within the rooms; true when they walk out of the entrance. */
  confine(p: THREE.Vector3): boolean {
    const l = this.local.copy(p).sub(PYR_ORIGIN);
        if (this.inDuat(p)) {
          const dx = p.x - DUAT_ORIGIN.x, dz = p.z - DUAT_ORIGIN.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (Number.isFinite(dist) && dist > 50) {
            const s = 50 / dist;
            p.x = DUAT_ORIGIN.x + dx * s;
            p.z = DUAT_ORIGIN.z + dz * s;
          }
          return false;
        }
    if (l.z < -0.2 && Math.abs(l.x) < 1.4) return true;
    const m = 0.35;
    let inside = false;
    for (const r of ROOMS) if (l.x >= r.x0 + m - 0.4 && l.x <= r.x1 - m + 0.4 && l.z >= r.z0 + m - 0.4 && l.z <= r.z1 - m + 0.4) inside = true;
    if (!inside) {
      // back to the nearest point of the nearest room
      let bx = l.x, bz = l.z, bd = Infinity;
      for (const r of ROOMS) {
        const cx = THREE.MathUtils.clamp(l.x, r.x0 + m, r.x1 - m), cz = THREE.MathUtils.clamp(l.z, r.z0 + m, r.z1 - m);
        const d = Math.hypot(cx - l.x, cz - l.z);
        if (d < bd) {
          bd = d;
          bx = cx;
          bz = cz;
        }
      }
      l.x = bx;
      l.z = bz;
    }
    p.copy(l).add(PYR_ORIGIN);
    return false;
  }

  /** Coming in: just inside the entrance, facing the passage. */
  entry(): { x: number; z: number; heading: number } {
    return { x: PYR_ORIGIN.x, z: PYR_ORIGIN.z + 2.5, heading: Math.PI };
  }
  /** Going out: before the entrance, facing away from it (north). */
  outside(): { x: number; z: number; heading: number } {
    return { x: this.door.x, z: this.door.z - 4, heading: 0 };
  }
  /** At the entrance, outside. */
  atDoor(p: THREE.Vector3): boolean {
    return Math.abs(p.x - this.door.x) < 1.5 && p.z > this.door.z - 1.2 && p.z < this.door.z + 2.2 && p.y < PYRAMID.y + 4;
  }
  /** Near the apex, outside. */
  atApex(p: THREE.Vector3): boolean {
    return p.distanceTo(this.apex) < 6;
  }

  show(inside: boolean): void {
    this.isInside = inside;
    this.inside.visible = inside;
    if (inside && !this.night) {
      this.night = new Duat((text, ms) => this.say(text, ms));
      this.duat.add(this.night.group);
    } else if (!inside && this.night) {
      // its stages, scenes, forms and stone are freed with it
      const g = this.night.group;
      this.duat.remove(g);
      const scene = this.world.parent as THREE.Scene | null;
      if (scene) release(scene, [g]);
      this.night = null;
    }
  }

  /** Each frame. `pit`, `crystal`: 0–1 how awake the pit's light and the crystal are. */
  update(t: number, near: boolean, pit: number, crystal: number, flame: number, reduced: boolean): void {
    this.uT.value = reduced ? t * 0.4 : t;
    if (this.isInside) {
      // the lamps flicker with their flames; the King's Chamber breathes
      for (const l of this.lamps) l.light.intensity = l.base * (0.86 + Math.sin(t * 9.3 + l.phase) * 0.05 + Math.sin(t * 6.1 + l.phase * 2.3) * 0.06 + Math.sin(t * 17.7 + l.phase) * 0.03);
      if (this.kingLight) this.kingLight.intensity = 12 * (0.85 + 0.15 * Math.sin(t * 0.55));
    }
    if (this.isInside && !this.doorFound && this.playerPos) {
      const dx = this.playerPos.x - (this.doorPos.x + PYR_ORIGIN.x);
      const dy = this.playerPos.y - (this.doorPos.y + PYR_ORIGIN.y);
      const dz = this.playerPos.z - (this.doorPos.z + PYR_ORIGIN.z);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 3.5) {
        this.say("A door into the Duat.", 5000);
        this.doorFound = true;
      }
    }
    this.uDoor.value += ((this.doorFound ? 1 : 0) - this.uDoor.value) * 0.04;
    if (this.doorSlab) this.doorSlab.position.y = this.doorPos.y + this.uDoor.value * 2.2;

    // in the Duat the rooms rest (none of their quads may float in its sky), and the Duat only there
    const inDuatSpace = this.duatActive || (!!this.playerPos && this.inDuat(this.playerPos));
    this.roomsGroup.visible = !inDuatSpace;
    this.duat.visible = inDuatSpace;
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    if (inDuatSpace && this.playerPos) this.night?.update(t, dt, this.local.copy(this.playerPos).sub(DUAT_ORIGIN), reduced);

    this.uPit.value += (pit - this.uPit.value) * 0.05;
    this.uCrystal.value = crystal;
    this.uFlame.value += (flame - this.uFlame.value) * 0.03;
    const tt = reduced ? t * 0.3 : t;
    if (near && !this.isInside) {
      const { half: H, height: Ht } = PYRAMID;
      const a = this.motes.pos.array as Float32Array, s = this.motes.seed;
      for (let i = 0; i < a.length / 3; i++) {
        const u = (tt * (0.012 + s[i * 3] * 0.01) + s[i * 3 + 1]) % 1;
        // across the plaza to the base, then up the face, turning as it climbs
        const r = u < 0.45 ? THREE.MathUtils.lerp(H * 2.0, H, u / 0.45) : H * (1 - (u - 0.45) / 0.55);
        const ang = s[i * 3 + 2] * Math.PI * 2 + u * 3.2;
        const cx = Math.cos(ang), cz = Math.sin(ang);
        const sq = Math.max(Math.abs(cx), Math.abs(cz)); // onto the square
        const px = (cx / sq) * r * 0.98, pz = (cz / sq) * r * 0.98;
        const m = Math.max(Math.abs(px), Math.abs(pz));
        const py = m < H ? Ht * (1 - m / H) + 0.5 : 0.4;
        a[i * 3] = px;
        a[i * 3 + 1] = py;
        a[i * 3 + 2] = pz;
      }
      this.motes.pos.needsUpdate = true;
    }
    if (this.isInside) {
      const a = this.gallery.pos.array as Float32Array, s = this.gallery.seed;
      const n = a.length / 3;
      for (let i = 0; i < n; i++) {
        if (i < n * 0.6) {
          // up the gallery toward the King's Chamber
          const u = (tt * (0.02 + s[i * 3] * 0.02) + s[i * 3 + 1]) % 1;
          const x = 2 + u * 34;
          a[i * 3] = x;
          a[i * 3 + 1] = Math.min(13, (x - 1.6) * (13 / 32.4)) + 1 + s[i * 3 + 2] * 5.5 + Math.sin(u * 20 + i) * 0.2;
          a[i * 3 + 2] = 14.3 + ((s[i * 3 + 2] * 7.3) % 1) * 2.8;
        } else {
          // the first spiral: round and up about the coffer
          const u = (tt * (0.05 + s[i * 3] * 0.03) + s[i * 3 + 1]) % 1;
          const ang = u * 12 + s[i * 3 + 2] * 6.28, rr = 1.4 * (1 - u * 0.6);
          a[i * 3] = COFFER.x + Math.cos(ang) * rr;
          a[i * 3 + 1] = COFFER.y + 0.2 + u * 5.2;
          a[i * 3 + 2] = COFFER.z + Math.sin(ang) * rr;
        }
      }
      this.gallery.pos.needsUpdate = true;
    }
  }
}

function dotTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
