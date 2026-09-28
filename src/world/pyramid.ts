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
import { T, vnoise, worldPoints, type N } from "../gpu/tsl";
import { scan, type ScanName } from "./temple";
import { PYRAMID } from "./terrain";

const { abs, cos, float, floor, fract, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;
const V = THREE.Vector3;

/** The Duat's own night air. withFog() melts toward the ambient mood's fog uniforms, but the
    mood system never applies inside the pyramid (apart() freezes it while pyramid.isInside),
    so the uniforms sit at the bright FOG defaults and wash every dark surface toward dawn.
    Same distance-cueing shape, but a dark night-air colour. */
const duatAir = (color: N, p: N): N => {
  const d = T.length(p.sub(T.cameraPosition));
  const f = T.clamp(float(1).sub(T.exp(d.mul(-0.006))), 0.0, 1.0);
  return T.mix(color, vec3(0.020, 0.022, 0.045), f);
};

export const PYR_ORIGIN = new THREE.Vector3(50000, 14, 0); // high enough that its lowest chamber (−9) stays above the water line
export const DUAT_ORIGIN = PYR_ORIGIN.clone().add(new THREE.Vector3(-140, -30, 60)); // world origin of the Duat: pyramid-local (−140, −30, 60), clear of the rooms (x ∈ [−34, 47.5])

/* ---------------------------------------------------------------- stone */
function triplanar(set: ScanName, tile: number): { col: N; arm: N; w: N } {
  const S = scan(set);
  const pw = T.positionWorld, n = T.normalWorldGeometry;
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
  const c = col.mul(vec3(...tint)).mul(T.mix(float(0.55), float(1), arm.r));
  m.colorNode = vec4(c, 1);
  m.roughnessNode = T.clamp(arm.g, 0.45, 1);
  const pw = T.positionWorld;
  // courses: level joints every 1.3 m, upright joints staggered every 1.8 m
  const cy = fract(pw.y.div(1.3));
  const row = floor(pw.y.div(1.3));
  const along = pw.x.add(pw.z).add(row.mul(0.9));
  const jH = smoothstep(0.03, 0.0, cy.sub(0.5).abs().sub(0.47).abs());
  const jV = smoothstep(0.02, 0.0, fract(along.div(1.8)).sub(0.5).abs().sub(0.48).abs()).mul(float(1).sub(w.y));
  const joint = jH.max(jV);
  // the light moves upward through the courses, slowly, like a heartbeat carried in stone
  const wave = sin(pw.y.mul(0.35).sub(uT.mul(0.9))).mul(0.5).add(0.5);
  const beat = T.pow(sin(uT.mul(1.1)).mul(0.5).add(0.5), 6);
  m.emissiveNode = vec3(1.0, 0.8, 0.5).mul(joint.mul(wave.mul(0.18).add(beat.mul(0.08)).mul(alive))).add(c.mul(0.05));
  return m;
}
/** Rose granite (the capstone, the King's Chamber, the coffer): dark, flecked, with crystal glints. */
function granite(uT: N): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0.05, roughness: 0.5 });
  const { col } = triplanar("red_sandstone_pavement", 1.6);
  const pw = T.positionWorld;
  const h = (p: N) => fract(sin(T.dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const cell = floor(pw.mul(26));
  const fleck = h(cell);
  const c = col.mul(vec3(0.72, 0.46, 0.44)).mul(fleck.lessThan(0.18).select(float(0.45), fleck.greaterThan(0.9).select(float(1.6), float(1))));
  m.colorNode = vec4(c, 1);
  const glint = smoothstep(0.994, 1.0, h(cell.add(7))).mul(sin(uT.mul(1.7).add(fleck.mul(40))).mul(0.5).add(0.5));
  m.emissiveNode = vec3(1.0, 0.9, 0.8).mul(glint.mul(0.9)).add(c.mul(0.04));
  return m;
}
function crystalGlow(uT: N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
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
  private duatMotes!: { pos: THREE.InstancedBufferAttribute; seed: Float32Array };
  private duatMoteBase!: Float32Array;
  private nunTips: THREE.Sprite[] = [];
  private gallery!: { pos: THREE.InstancedBufferAttribute; seed: Float32Array };
  private uPit = uniform(0);
  private uCrystal = uniform(0);
  private local = new THREE.Vector3();
  /** The seven colours of the King's Chamber, lit one by one on the wanderer (main.ts). */
  seven: THREE.Sprite[] = [];
  uDoor = T.uniform(0);
  doorFound: boolean = false;
  whisperTimer: number = 0;
  doorPos: THREE.Vector3 = new THREE.Vector3(-34, -7.4, 7.7);
  playerPos: THREE.Vector3 | null = null;
  doorSlab: THREE.Mesh | null = null;  /** Duat root group — child of `inside`, so `show()` toggles it with the interior. */
  duat: THREE.Group = new THREE.Group();

  /** Duat-local waypoints (y = 0 floor): hidden-door threshold → stations 1–6 → dawn ascent (last two rise). */
  PATH: THREE.Vector3[] = [
    new THREE.Vector3(0, 0, 0),      // 0 hidden-door threshold
    new THREE.Vector3(18, 0, -14),   // 1
    new THREE.Vector3(34, 0, -6),    // 2
    new THREE.Vector3(30, 0, 16),    // 3
    new THREE.Vector3(8, 0, 26),     // 4
    new THREE.Vector3(-14, 0, 18),   // 5
    new THREE.Vector3(-22, 2, -4),   // 6 last station, dawn ascent begins
    new THREE.Vector3(-8, 5, -20),   // 7 dawn ascent end
  ];

  /** Polyline length of PATH in duat-local units (computed in buildDuatFoundation). */
  pathLen: number = 0;
  nunFeathers: THREE.Sprite[] = [];
  nunFeatherBase: THREE.Vector3[] = [];
  nunWhisperFired = false;
  // Station 2 — Desert of Sokar
  sokarSerpent: THREE.Mesh | null = null;
  sokarGates: { group: THREE.Group; disc: THREE.Mesh; discMat: THREE.MeshBasicNodeMaterial; open: number; name: string }[] = [];
  sokarGateState: number[] = [0, 0];
  sokarGateU: any[] = [];
  sokarGateSaid: boolean[] = [false, false];
  sokarGatePos: THREE.Vector3[] = [];
  sokarGateFacing: THREE.Vector3[] = [];
  // Station 3 — Still Chamber (hour 6): the sacred hinge. Nothing to do but be present.
  stillRa!: THREE.Sprite;
  stillOsiris!: THREE.Sprite;
  stillDisc!: THREE.Mesh;
  stillKings: THREE.Sprite[] = [];
  stillRings: THREE.Mesh[] = [];
  stillLastPos: THREE.Vector3 = new THREE.Vector3();
  stillness = 0;
  stillWhisperFired = false;
  apophis!: THREE.Group;
  apophisCurve!: THREE.CatmullRomCurve3;
  apophisSpears: THREE.Mesh[] = [];
  apophisEyes: THREE.Sprite[] = [];
  apophisU: any = T.uniform(0.8);
  apophisHome = new THREE.Vector3(8, 0, 26);
  apophisMenace = 0;
  apophisStandT = 0;
  apophisLastT = 0;
  apophisFlashT = 0;
  apophisRecoilT = 0;
  apophisWhisperFired = false;
  apophisRecoiling = false;
  hallBeam!: THREE.Mesh;
  hallHeart!: THREE.Sprite;
  hallFeather!: THREE.Sprite;
  hallPanL!: THREE.Group;
  hallPanR!: THREE.Group;
  hallMaat!: THREE.Sprite;
  hallStill = 0;
  hallLastPos = new THREE.Vector3();
  hallWhisperFired = false;
  // Station 6 — Field of Reeds / Dawn
  private reedsTips: THREE.Sprite[] = [];
  private reedsSway: { y: number; phase: number }[] = [];
  private khepri!: THREE.Group;
  private khepriSun!: THREE.Group;
  private reedsBarque!: THREE.Group;
  private reedsEnterT = -1;
  private reedsWhisperFired = false;
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
  anubis: THREE.Group = new THREE.Group();
  anubisTrail: THREE.Sprite[] = [];
  anubisHistory: THREE.Vector3[] = [];
  anubisStation = 0;
  anubisWhisperFired = false;
  anubisDoneFired = false;
  /**
   * Point at arc-length fraction s ∈ [0,1] along PATH (clamped). Writes into `out`, returns it. No allocation.
   */
  pathPoint(s: number, out: THREE.Vector3): THREE.Vector3 {
    const PATH = this.PATH;
    const n = PATH.length;
    if (n === 0) return out.set(0, 0, 0);
    if (n === 1) return out.copy(PATH[0]);
    const u = Number.isFinite(s) ? (s < 0 ? 0 : s > 1 ? 1 : s) : 0;
    const total = this.pathLen > 1e-4 ? this.pathLen : 1e-4; // guarded
    const target = u * total;
    let acc = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = PATH[i];
      const b = PATH[i + 1];
      const seg = a.distanceTo(b);
      if (seg > 1e-4 && acc + seg >= target) {
        return out.copy(a).lerp(b, (target - acc) / seg); // seg > 1e-4
      }
      acc += seg;
    }
    return out.copy(PATH[n - 1]);
  }

  /**
   * Duat foundation: root group under `inside`, the PATH polyline rendered as gold-blue floor
   * ribbons with soft disc pads at every waypoint. Static this increment — no motion, no lights.
   */
  /** Duat atmosphere: opaque near-black night sky dome + gold mote cloud. */
  private buildDuatAtmosphere(): void {
    const domeMat = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
      fog: false,
    });

    const dir = T.normalize(T.positionWorld.sub(vec3(5, 0, 0)));
    const elev = T.clamp(T.positionWorld.y.mul(0.005), -1, 1);

    // base: horizon (fog) -> zenith; elev<0 lands on horizon exactly
    const skyHorizon = vec3(0.018, 0.020, 0.048);
    const skyZenith = vec3(0.003, 0.004, 0.014);
    const base = T.mix(skyHorizon, skyZenith, smoothstep(0.0, 0.65, elev));
    const above = smoothstep(0.0, 0.06, elev);

    // moon
    const moonDir = T.normalize(vec3(-0.42, 0.38, -0.62));
    const sd = T.max(T.dot(dir, moonDir), 0.0);
    const disc = T.pow(sd, 1600).mul(vec3(1.0, 0.92, 0.78)).mul(4);
    const halo = T.pow(sd, 64).mul(0.55).add(T.pow(sd, 6).mul(0.3)).mul(vec3(0.55, 0.42, 0.34));

    // clouds: two vnoise-broken horizontal bands — haze, not blobs
    const n1 = vnoise(dir.xz.mul(2.2));
    const n2 = vnoise(dir.xz.mul(5.3).add(vec2(7.1, 3.3)));
    const broken = smoothstep(0.32, 0.74, n1.mul(0.65).add(n2.mul(0.35)));
    const bandA = smoothstep(0.06, 0.16, elev).mul(smoothstep(0.42, 0.28, elev));
    const bandB = smoothstep(0.30, 0.42, elev).mul(smoothstep(0.80, 0.58, elev));
    const band = bandA.add(bandB).mul(broken);
    const topA = smoothstep(0.26, 0.34, elev).mul(smoothstep(0.44, 0.36, elev));
    const topB = smoothstep(0.52, 0.60, elev).mul(smoothstep(0.78, 0.68, elev));
    const topBand = topA.add(topB).mul(broken);
    const clouds = vec3(0.02, 0.024, 0.045).mul(band).add(vec3(0.28, 0.24, 0.22).mul(topBand));

    domeMat.colorNode = base.add(above.mul(halo.add(disc).add(clouds)));

    const dome = new THREE.Mesh(new THREE.SphereGeometry(200, 48, 24), domeMat);
    dome.position.set(5, 0, 0);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.duat.add(dome);

    const count = 180;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    const base2 = new Float32Array(count * 3);
    let s = 20240517;
    const rnd = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      base2[k] = -30 + rnd() * 70;
      base2[k + 1] = 0.5 + rnd() * 8.5;
      base2[k + 2] = -30 + rnd() * 60;
      pos[k] = base2[k];
      pos[k + 1] = base2[k + 1];
      pos[k + 2] = base2[k + 2];
      seed[k] = rnd();
      seed[k + 1] = rnd();
      seed[k + 2] = rnd();
    }
    const pts = worldPoints(pos, { color: new THREE.Color(0.75, 0.68, 0.5), size: 0.3, opacity: 0.5 });
    pts.sprite.frustumCulled = false;
    this.duatMotes = { pos: pts.position as unknown as THREE.InstancedBufferAttribute, seed };
    this.duatMoteBase = base2;
    this.duat.add(pts.sprite);
  }
  private updateDuatMotes(): void {
    const t = Number.isFinite(this.uT.value) ? this.uT.value : 0;
    const arr = this.duatMotes.pos.array as unknown as Float32Array;
    const base = this.duatMoteBase;
    const seed = this.duatMotes.seed;
    const n = this.duatMotes.pos.count;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      const phase = seed[k] * 6.28;
      arr[k] = base[k] + Math.sin(t * 0.45 + phase) * 1.2;
      arr[k + 1] = base[k + 1] + Math.sin(t * 0.6 + phase * 1.7) * 0.5;
      arr[k + 2] = base[k + 2] + Math.cos(t * 0.5 + phase) * 1.2;
    }
    this.duatMotes.pos.needsUpdate = true;
  }

  /** Duat ground: dark moonlit dune disc that fills the void under the scene. */
  private buildDuatGround(): void {
    const groundMat = new THREE.MeshBasicNodeMaterial({ fog: false });

    const xz = T.positionWorld.xz;
    const relief = T.clamp(vnoise(xz.mul(0.45)).mul(0.6).add(vnoise(xz.mul(0.09)).mul(0.4)), 0, 1);
    const base = T.mix(vec3(0.008, 0.009, 0.020), vec3(0.018, 0.021, 0.040), relief);
    const grain = vnoise(xz.mul(2.6)).mul(0.012);

    const n = T.normalize(T.normalWorld);
    const up = T.normalize(vec3(0.06, 0.5, 0.35));
    const kiss = T.pow(T.max(T.dot(n, up), 0.0), 2).mul(vec3(1.0, 0.78, 0.45)).mul(0.035);

    const view = T.normalize(T.cameraPosition.sub(T.positionWorld));
    const ndv = T.clamp(T.dot(view, n), 0, 1);
    const rim = T.pow(ndv.mul(-1).add(1), 5).mul(0.07).mul(vec3(0.3, 0.38, 0.8));

    const col0 = base.add(grain).add(kiss).add(rim);

    // rim melt into fog so the disc edge never reads as a hard line
    const d = T.length(xz.sub(vec2(5, -2)));
    const col = T.mix(col0, vec3(0.020, 0.022, 0.045), smoothstep(55.0, 95.0, d));

    groundMat.colorNode = duatAir(col, T.positionWorld);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(95, 48), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(5, -0.08, -2);
    ground.frustumCulled = false;
    this.duat.add(ground);
  }

  private buildDuatFoundation(): void {
    const duat = new THREE.Group();
    duat.name = 'duat';
    duat.position.copy(DUAT_ORIGIN).sub(PYR_ORIGIN); // (-140, -30, 60): `inside` already sits at PYR_ORIGIN
    this.duat = duat;
    this.inside.add(duat);
    this.buildDuatGround();

    let len = 0;
    for (let i = 0; i < this.PATH.length - 1; i++) len += this.PATH[i].distanceTo(this.PATH[i + 1]);
    this.pathLen = len;

    // --- palette: dark water, bank melt, gold current, warm pool ---
    const WATER = vec3(0.02, 0.035, 0.075);
    const BANK = vec3(0.02, 0.024, 0.045);
    const GOLD = vec3(1.0, 0.78, 0.45);
    const POOL = vec3(1.0, 0.80, 0.50).mul(0.85);

    // --- C. river ribbon: dark water + thread of gold current, edges melt into ground ---
    // OPAQUE on purpose: softness comes from colour melt, not blending.
    const ribbonMat = new THREE.MeshBasicNodeMaterial({
      transparent: false, depthWrite: true, fog: false, side: THREE.DoubleSide,
    });

    const rp = uv();
    const across = abs(rp.x.sub(0.5)).mul(2.0);                 // 0 centre → 1 edge
    const rWater = T.mix(WATER, BANK, smoothstep(0.55, 1.0, across));
    const rShimmer = vnoise(vec2(rp.x.mul(4.0), rp.y.mul(30.0)).add(this.uT.mul(0.05))).mul(0.015);
    const rCore = T.exp(across.mul(across).mul(-18.0));
    const rPulse = sin(this.uT.mul(0.9).sub(rp.y.mul(25.0))).mul(0.22)
      .add(sin(this.uT.mul(0.53).add(1.7)).mul(0.10))
      .add(0.62);
    const rEnds = smoothstep(0.0, 0.10, rp.y).mul(smoothstep(1.0, 0.90, rp.y));
    const rCol = rWater
      .add(rShimmer)
      .add(GOLD.mul(rCore.mul(rPulse)).mul(0.5))
      .mul(rEnds);
    ribbonMat.colorNode = duatAir(rCol, T.positionWorld);

    // --- D. waypoint pads: pools of light on dark water (not coins) ---
    const padMat = new THREE.MeshBasicNodeMaterial({
      transparent: false, depthWrite: true, fog: false, side: THREE.DoubleSide,
    });

    const pp = uv();
    const pR = T.length(T.vec2(pp.x.sub(0.5), pp.y.sub(0.5))).mul(2.0); // 0 centre → 1 rim
    const pPool = T.exp(pR.mul(pR).mul(-4.0));
    const pBreath = sin(this.uT.mul(0.5).add(vnoise(T.positionWorld.xz.mul(0.5)).mul(6.28))).mul(0.08).add(0.92);
    const pCol = T.mix(T.mix(WATER, POOL, pPool), WATER, smoothstep(0.70, 1.0, pR)).mul(pBreath);
    padMat.colorNode = duatAir(pCol, T.positionWorld);
    // one strip per PATH segment (7 wide), laid in the floor plane at y + 0.0
    for (let i = 0; i < this.PATH.length - 1; i++) {
      const a = this.PATH[i];
      const b = this.PATH[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const seg = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (seg < 1e-4) continue;
      const horiz = Math.sqrt(dx * dx + dz * dz);
      const yaw = horiz > 1e-4 ? Math.atan2(dx, dz) : 0;
      const pitch = -Math.asin(Math.max(-1, Math.min(1, dy / seg)));
      const geo = new THREE.PlaneGeometry(7, seg);
      geo.rotateX(-Math.PI / 2);                           // face +Y, long axis on Z
      const mesh = new THREE.Mesh(geo, ribbonMat);
      mesh.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5 + 0.0, (a.z + b.z) * 0.5);
      mesh.rotation.set(pitch, yaw, 0, 'YXZ');
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      duat.add(mesh);
    }

    // pads sit 0.02 above the river — never coplanar
    for (let i = 0; i < this.PATH.length; i++) {
      const p = this.PATH[i];
      const geo = new THREE.CircleGeometry(2.6, 40);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, padMat);
      mesh.position.set(p.x, p.y + 0.02, p.z);
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      duat.add(mesh);
    }
    this.buildDuatAtmosphere();
    this.buildStationNun();
    this.buildStationSokar();
    this.buildStationStill();
    this.buildStationBattle();
    this.buildStationHall();
    this.buildStationReeds();
    this.buildAnubis();
  }

  private buildStationNun(): void {
    let s = 1234567;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

    // --- E. mirror water disc: dark Nun water, dim gold pool, no rim ---
    const NUN_WATER = vec3(0.014, 0.025, 0.055);
    const NUN_GOLD = vec3(1.0, 0.78, 0.45);

    const nunUV = uv();
    // disc-local XZ (CircleGeometry(16) ⇒ Ø32); uv.y maps to -Z after the -90° X rotation
    const nunXZ = vec2(nunUV.x.sub(0.5).mul(32.0), nunUV.y.sub(0.5).mul(-32.0));
    const nunD = T.length(nunXZ.sub(T.vec2(-9.0, 7.0)));
    const nunRipple = vnoise(nunXZ.mul(0.8).add(this.uT.mul(0.04))).mul(0.02);
    const nunCol = NUN_WATER
      .add(nunRipple)
      .add(NUN_GOLD.mul(0.05).mul(T.exp(nunD.mul(nunD).div(-80.0))));

    const waterMat = new THREE.MeshBasicNodeMaterial({
      transparent: false, depthWrite: true, fog: false, side: THREE.DoubleSide,
    });
    waterMat.colorNode = duatAir(nunCol, T.positionWorld);
    const water = new THREE.Mesh(new THREE.CircleGeometry(16, 48), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(18, -0.02, -14);
    water.renderOrder = 2;
    water.frustumCulled = false;
    this.duat.add(water);
    // dome of stars
    const N = 140;
    const starArr = new Float32Array(N * 3);
    const pts = worldPoints(starArr, {
      color: new THREE.Color(0.75, 0.85, 1.0),
      size: 0.5,
      opacity: 0.9,
    });
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 30 + rnd() * 30;
      starArr[i * 3 + 0] = 18 + Math.cos(a) * r;
      starArr[i * 3 + 1] = 8 + rnd() * 22;
      starArr[i * 3 + 2] = -14 + Math.sin(a) * r;
    }
    pts.position.needsUpdate = true;
    pts.sprite.frustumCulled = false;
    this.duat.add(pts.sprite);

    // dim reflections on the water
    const M = 60;
    const refArr = new Float32Array(M * 3);
    const refs = worldPoints(refArr, {
      color: new THREE.Color(1.0, 0.8, 0.5),
      size: 0.35,
      opacity: 0.5,
    });
    for (let i = 0; i < M; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 14;
      refArr[i * 3 + 0] = 18 + Math.cos(a) * r;
      refArr[i * 3 + 1] = 0.015;
      refArr[i * 3 + 2] = -14 + Math.sin(a) * r;
    }
    refs.position.needsUpdate = true;
    refs.sprite.frustumCulled = false;
    this.duat.add(refs.sprite);

    /* UNCHANGED */ // refs block above (refArr / refs.position.needsUpdate / refs.sprite.frustumCulled / this.duat.add)

    // moonlit reed tufts — additive keeps-alpha: black adds nothing, no quad edges
    const tipMat = new THREE.SpriteMaterial({
      map: dotTexture(),
      color: 0xffd9a0,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      transparent: true,
      opacity: 0.8,
      fog: false,
      depthWrite: false,
    });

    const reedMat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });

    const bUv = uv();
    const colIdx = floor(bUv.x.mul(7.0));
    const fxF = fract(bUv.x.mul(7.0));
    const hj = fract(sin(colIdx.mul(12.9898)).mul(43758.5453));
    const blade = smoothstep(0.5, 0.10, abs(fxF.sub(0.5)).mul(2.0));
    const tipH = hj.mul(0.55).add(0.45);
    const taper = smoothstep(0.0, 0.18, bUv.y).mul(
      smoothstep(tipH, tipH.sub(0.35), bUv.y),
    );
    const moon = T.mix(vec3(0.08, 0.11, 0.18), vec3(0.32, 0.40, 0.58), bUv.y).add(
      vec3(0.3, 0.38, 0.8).mul(T.pow(bUv.y, 2.0)).mul(0.20),
    );
    const warmBase = vec3(1.0, 0.78, 0.45).mul(0.05).mul(float(1.0).sub(bUv.y));
    reedMat.colorNode = moon.add(warmBase).mul(blade).mul(taper);

    // sway lives in the shader, never on CPU per frame
    const ph = vnoise(T.positionWorld.xz.mul(0.35)).mul(6.28);
    const sway = sin(this.uT.mul(0.8).add(ph)).mul(T.pow(uv().y, 2.0)).mul(0.22);
    reedMat.positionNode = T.positionLocal.add(vec3(sway, 0.0, sway.mul(0.6)));

    for (let i = 0; i < 14; i++) {
      const seg = i % 2;                                    /* UNCHANGED placement math */
      const a = this.PATH[seg];                             /* UNCHANGED */
      const b = this.PATH[seg + 1];                         /* UNCHANGED */
      const t = 0.12 + rnd() * 0.76;                        /* UNCHANGED */
      const dx = b.x - a.x;                                 /* UNCHANGED */
      const dz = b.z - a.z;                                 /* UNCHANGED */
      const len = Math.hypot(dx, dz) || 1;                  /* UNCHANGED (guarded) */
      const side = i % 4 < 2 ? 1 : -1;                      /* UNCHANGED */
      const px = a.x + dx * t + (-dz / len) * 2.2 * side;   /* UNCHANGED */
      const pz = a.z + dz * t + (dx / len) * 2.2 * side;    /* UNCHANGED */

      const tuft = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.6), reedMat);
        plane.rotation.y = (k * Math.PI) / 3.0;             // 0 / 60 / 120 deg
        plane.position.set(px, 1.25, pz);
        plane.frustumCulled = false;
        tuft.add(plane);
      }
      this.duat.add(tuft);

      const tip = new THREE.Sprite(tipMat);                 // shared, not cloned
      tip.position.set(px, 2.5, pz);
      tip.scale.setScalar(0.26);
      this.duat.add(tip);
      this.nunTips.push(tip);
    }
    /* UNCHANGED */ // feather lights block (featherMat / this.nunFeathers / this.nunFeatherBase)
    // feather lights
    const featherMat = new THREE.SpriteMaterial({
      map: dotTexture(),
      color: new THREE.Color(1.0, 0.85, 0.55),
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      transparent: true,
      opacity: 0.85,
      fog: false,
      depthWrite: false,
    });
    for (let i = 0; i < 2; i++) {
      const base = new THREE.Vector3(
        18 + (i === 0 ? -5 : 5) + (rnd() - 0.5) * 2,
        2.5 + rnd() * 0.4,
        -14 + (i === 0 ? -3.5 : 3.5) + (rnd() - 0.5) * 2
      );
      const f = new THREE.Sprite(featherMat);
      f.scale.setScalar(1.2);
      f.position.copy(base);
      f.userData.phase = rnd() * Math.PI * 2;
      this.duat.add(f);
      this.nunFeathers.push(f);
      this.nunFeatherBase.push(base);
    }
  }

  private buildStationStill(): void {
    const c = this.PATH[3];
    const cx = c.x;
    const cy = c.y;
    const cz = c.z;

    // Additive glow recipe — SrcAlpha/One + Zero/One. Never plain AdditiveBlending.
    const additive = <M extends THREE.Material>(m: M): M => {
      m.blending = THREE.CustomBlending;
      m.blendSrc = THREE.SrcAlphaFactor;
      m.blendDst = THREE.OneFactor;
      m.blendEquation = THREE.AddEquation;
      m.blendSrcAlpha = THREE.ZeroFactor;
      m.blendDstAlpha = THREE.OneFactor;
      return m;
    };

    const dot = dotTexture();
    const glow = (color: THREE.Color, opacity: number): THREE.SpriteMaterial =>
      additive(
        new THREE.SpriteMaterial({
          map: dot,
          color,
          opacity,
          transparent: true,
          depthWrite: false,
          fog: false,
        }),
      );

    // Seeded, deterministic — no Math.random.
    const rnd = (n: number): number => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    // --- The cavern: a soft dome, darker at the rim, faint blue glow at center-top ---
    const domeMat = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    /* UNCHANGED */ const h = T.positionWorld.y.sub(cy).mul(0.055).add(0.16);
    const col = T.mix(
      vec3(0.010, 0.016, 0.035),
      vec3(0.030, 0.048, 0.088),
      T.smoothstep(0, 1, h),
    );
    const heartD = T.length(T.positionWorld.sub(vec3(cx, cy + 2.0, cz)));
    const heart = T.exp(heartD.mul(heartD).mul(-1.0).div(60.0))
      .mul(vec3(1.0, 0.78, 0.45))
      .mul(0.35);
    domeMat.colorNode = col.add(heart);
    /* UNCHANGED */ // domeMat: BackSide, transparent:true, depthWrite:false, fog:false, renderOrder
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(24, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
      domeMat,
    );
    dome.position.set(cx, cy, cz);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.duat.add(dome);

    // --- The union: ram-headed Ra fused with mummiform Osiris, breathing as one ---
    this.stillRa = new THREE.Sprite(glow(new THREE.Color(0.98, 0.82, 0.48), 0.95));
    this.stillRa.position.set(cx, cy + 2.2, cz);
    this.stillRa.scale.set(3.5, 3.5, 1);
    this.duat.add(this.stillRa);

    this.stillOsiris = new THREE.Sprite(glow(new THREE.Color(0.75, 0.95, 0.85), 0.8));
    this.stillOsiris.position.set(cx, cy + 2.15, cz - 0.85);
    this.stillOsiris.scale.set(2, 4, 1);
    this.duat.add(this.stillOsiris);

    // Sun-disc floating above the union.
    const discMat = additive(
      new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }),
    );
    discMat.colorNode = T.vec3(0.95, 0.72, 0.28);
    this.stillDisc = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 10, 48), discMat);
    this.stillDisc.position.set(cx, cy + 3.8, cz);
    this.stillDisc.rotation.x = -0.26;
    this.duat.add(this.stillDisc);

    // --- Mehen: three coils of protective light, lying flat around the union ---
    const coilMat = additive(
      new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }),
    );
    coilMat.colorNode = T.vec3(0.22, 0.155, 0.055); // faint gold, dimmed in the colorNode

    const radii = [4, 5.2, 6.4];
    for (let i = 0; i < radii.length; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radii[i], 0.08, 8, 72), coilMat);
      ring.position.set(cx, cy + 0.4, cz);
      ring.rotation.x = Math.PI * 0.5;
      this.duat.add(ring);
      this.stillRings.push(ring);
    }

    // --- The past kings: faint gold presences in an arc on the cavern wall ---
    const kingMat = glow(new THREE.Color(0.92, 0.76, 0.38), 0.25);
    const arc = Math.PI * 1.05;
    const a0 = Math.PI * 0.5 - arc * 0.5;
    for (let i = 0; i < 5; i++) {
      const a = a0 + arc * i * 0.25 + (rnd(i + 11) - 0.5) * 0.16;
      const r = 17.2 + rnd(i + 37) * 1.6;
      const king = new THREE.Sprite(kingMat);
      king.position.set(
        cx + Math.cos(a) * r,
        cy + 4.4 + rnd(i + 71) * 3.6,
        cz + Math.sin(a) * r,
      );
      king.scale.set(1.5, 1.5, 1);
      this.duat.add(king);
      this.stillKings.push(king);
    }

    this.stillness = 0;
    this.stillWhisperFired = false;
    if (this.playerPos) this.stillLastPos.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
  }

  private updateStill(): void {
    if (!this.duat || !this.stillRa) return;

    const t = Number.isFinite(this.uT.value) ? this.uT.value : 0;

    // One shared breath — the union is one being.
    const breath = 1 + Math.sin(t * 0.5) * 0.06;
    const r = 3.5 * breath;
    this.stillRa.scale.set(r, r, r);
    this.stillOsiris.scale.set(2 * breath, 4 * breath, 1);

    // Mehen's coils turn so slowly they are nearly still.
    for (let i = 0; i < this.stillRings.length; i++) {
      this.stillRings[i].rotation.z = t * 0.02 * (i % 2 === 0 ? 1 : -1);
    }

    // Stillness is the mechanic: be present, and the kings brighten.
    const p = this.playerPos;
    if (p) {
      const dx = p.x - this.stillLastPos.x;
      const dy = p.y - this.stillLastPos.y;
      const dz = p.z - this.stillLastPos.z;
      const moved = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (Number.isFinite(moved)) {
        if (moved < 0.3) this.stillness += (1 - this.stillness) * 0.02;
        else this.stillness *= 0.98;
      }
      this.stillLastPos.set(p.x, p.y, p.z);
    }

    const kingOpacity = 0.15 + this.stillness * 0.5;
    for (let i = 0; i < this.stillKings.length; i++) {
      this.stillKings[i].material.opacity = kingOpacity;
    }

    if (!this.stillWhisperFired && this.stillness > 0.7) {
      this.stillWhisperFired = true;
      this.say('Be still. The sun is being remade in the dark, and you are allowed to watch.', 5200);
    }
  }

  private buildStationHall(): void {
    const stone = new THREE.MeshStandardNodeMaterial({ color: 0x14141f, roughness: 0.9, fog: false });
    const goldDark = new THREE.MeshStandardNodeMaterial({ color: 0x8a6d2f, roughness: 0.65, fog: false });
    const gold = new THREE.MeshStandardNodeMaterial({ color: 0xc9a227, roughness: 0.55, fog: false });

    const glow = (color: number, opacity: number): THREE.Sprite => {
      const mat = new THREE.SpriteMaterial({
        map: dotTexture(),
        color,
        transparent: true,
        opacity,
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        blendEquation: THREE.AddEquation,
        fog: false,
        depthWrite: false,
      });
      return new THREE.Sprite(mat);
    };

    // Hall of Two Truths — eight pillars, two rows of four, flanking PATH[5].
    const colGeo = new THREE.CylinderGeometry(0.7, 0.85, 9, 10);
    for (const x of [-20, -16, -12, -8]) {
      for (const z of [13, 23]) {
        const col = new THREE.Mesh(colGeo, stone);
        col.position.set(x, 4.5, z);
        this.duat.add(col);
      }
    }
    const lintelGeo = new THREE.BoxGeometry(14, 0.8, 1);
    for (const z of [13, 23]) {
      const lintel = new THREE.Mesh(lintelGeo, stone);
      lintel.position.set(-14, 9.4, z);
      this.duat.add(lintel);
    }

    // The scales of the weighing.
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.4, 10), goldDark);
    pillar.position.set(-14, 1.7, 18);
    this.duat.add(pillar);

    this.hallBeam = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 0.14), gold);
    this.hallBeam.position.set(-14, 3.4, 18);
    this.duat.add(this.hallBeam);

    this.hallHeart = glow(0xd4622c, 0.4);
    this.hallHeart.scale.set(1.2, 1.2, 1);
    this.hallFeather = glow(0xfff0c8, 0.85);
    this.hallFeather.scale.set(1.2, 1.2, 1);

    const pan = (offset: number, content: THREE.Sprite): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(offset, 0, 0);
      const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), gold);
      thread.position.y = -0.6;
      g.add(thread);
      const dish = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18), gold);
      dish.rotation.x = -Math.PI / 2;
      dish.position.y = -1.2;
      g.add(dish);
      content.position.y = -0.95;
      g.add(content);
      return g;
    };

    this.hallPanL = pan(-2.2, this.hallHeart);
    this.hallPanR = pan(2.2, this.hallFeather);
    this.hallBeam.add(this.hallPanL, this.hallPanR);

    // Maat — she watches. She does not judge.
    this.hallMaat = glow(0xffeec6, 0.35);
    this.hallMaat.scale.set(2, 5, 1);
    this.hallMaat.position.set(-14, 0, 14.5);
    this.duat.add(this.hallMaat);
  }

  private updateHall(): void {
    const p = this.playerPos;
    if (p) {
      const moved = this.hallLastPos.distanceTo(p);
      this.hallLastPos.copy(p);
      const target = moved < 0.25 ? 1 : 0;
      this.hallStill += (target - this.hallStill) * 0.05;
      if (!Number.isFinite(this.hallStill)) this.hallStill = 0;
    }
    const still = Number.isFinite(this.hallStill) ? Math.min(Math.max(this.hallStill, 0), 1) : 0;
    const fired =
      (this.nunWhisperFired ? 1 : 0) +
      ((this.sokarGateSaid[0] || this.sokarGateSaid[1]) ? 1 : 0) +
      (this.stillWhisperFired ? 1 : 0) +
      (this.apophisWhisperFired ? 1 : 0);
    const total = 4;
    const journeyProgress = total > 0 ? fired / total : 0;
    const balance = still * 0.7 + journeyProgress * 0.3;

    this.hallBeam.rotation.z = (0.5 - balance) * 0.35;
    this.hallPanL.rotation.x = Math.sin(this.uT.value * 1.1) * 0.06;
    this.hallPanR.rotation.x = Math.sin(this.uT.value * 1.1 + Math.PI) * 0.06;
    (this.hallHeart.material as THREE.SpriteMaterial).opacity = 0.4 + balance * 0.6;

    if (balance > 0.75 && !this.hallWhisperFired) {
      this.hallWhisperFired = true;
      this.say('The feather does not move. Neither, it seems, does your heart.', 5200);
    }
  }

  private buildAnubis(): void {
    const anubis = this.anubis;
    anubis.name = 'anubis';

    // dark heart
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 12),
      new THREE.MeshBasicNodeMaterial({ color: 0x1a1208, fog: false })
    );
    anubis.add(core);

    // complete additive recipe — gold, fog-free, depth-safe
    const spriteMat = (opacity: number): THREE.SpriteMaterial =>
      new THREE.SpriteMaterial({
        map: dotTexture(),
        color: new THREE.Color(0.85, 0.62, 0.28),
        transparent: true,
        opacity,
        depthWrite: false,
        fog: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendEquationAlpha: THREE.AddEquation,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      });

    // glow
    const glow = new THREE.Sprite(spriteMat(0.85));
    glow.scale.setScalar(1.6);
    anubis.add(glow);

    // trail — 5 fading sprites, in duat space, lagging behind him
    const start = this.PATH[0];
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const trail = new THREE.Sprite(spriteMat(0.3 - 0.25 * t));
      trail.scale.setScalar(0.5 - 0.4 * t);
      if (start) trail.position.set(start.x, start.y + 1.6, start.z);
      this.anubisTrail.push(trail);
      this.duat.add(trail);
    }

    if (start) anubis.position.set(start.x, start.y + 1.6, start.z);
    this.duat.add(anubis);
  }

  private updateAnubis(): void {
    if (!this.anubis || !this.playerPos) return;
    const player = this.playerPos;

    // only in the Duat
    const dx = player.x - DUAT_ORIGIN.x;
    const dy = player.y - DUAT_ORIGIN.y;
    const dz = player.z - DUAT_ORIGIN.z;
    const duatDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const nearby = Number.isFinite(duatDist) && duatDist < 80;
    this.anubis.visible = nearby;
    if (!nearby) return;

    if (!this.anubisWhisperFired) {
      this.anubisWhisperFired = true;
      this.say('I am the one who walks between. Follow — there is no hurry.', 5200);
    }

    // hover above the current station
    const idx = Math.min(Math.max(this.anubisStation, 0), this.PATH.length - 1);
    const station = this.PATH[idx];
    if (station) {
      const target = new THREE.Vector3(station.x, station.y + 1.6, station.z);
      this.anubis.position.lerp(target, 0.025);
      this.anubis.position.y = target.y + Math.sin(this.uT.value * 1.7) * 0.15;
    }

    // he advances only when the player comes to him
    const world = new THREE.Vector3();
    this.anubis.getWorldPosition(world);
    const px = player.x - world.x;
    const py = player.y - world.y;
    const pz = player.z - world.z;
    const playerDist = Math.sqrt(px * px + py * py + pz * pz);
    if (Number.isFinite(playerDist) && playerDist < 5) {
      this.anubisStation = Math.min(7, this.anubisStation + 1);
    }
    if (this.anubisStation >= 7 && !this.anubisDoneFired) {
      this.anubisDoneFired = true;
      this.say('You have walked the night. The dawn is yours.', 5200);
    }

    // comet tail — lags to where he was i*6 frames ago
    this.anubisHistory.push(this.anubis.position.clone());
    if (this.anubisHistory.length > 40) this.anubisHistory.shift();
    for (let i = 0; i < this.anubisTrail.length; i++) {
      const h = this.anubisHistory[Math.max(0, this.anubisHistory.length - 1 - i * 6)];
      if (!h) continue;
      this.anubisTrail[i].position.lerp(h, 0.12);
    }
  }

  private updateDuat(): void {
    this.updateNun();
    this.updateSokar();
    this.updateStill();
    this.updateBattle();
    this.updateHall();
    this.updateReeds();
    this.updateAnubis();
    this.updateDuatMotes();
  }

  private updateReeds(): void {
    const t = this.uT.value;
    if (!Number.isFinite(t)) return;

    for (let i = 0; i < this.reedsTips.length; i++) {
      const tip = this.reedsTips[i];
      const sway = this.reedsSway[i];
      if (!tip || !sway) continue;
      tip.position.y = sway.y + Math.sin(t * 1.3 + sway.phase) * 0.12;
    }

    if (this.khepri) this.khepri.position.y = 7.5 + Math.sin(t * 0.9) * 0.3;
    if (this.reedsBarque) {
      this.reedsBarque.position.y = 3.2 + Math.sin(t * 0.7) * 0.15;
      this.reedsBarque.rotation.z = Math.sin(t * 0.7) * 0.02;
    }

    const p = this.playerPos;
    if (this.reedsEnterT < 0 && p) {
      const dx = p.x - DUAT_ORIGIN.x - (-15);
      const dz = p.z - DUAT_ORIGIN.z - (-12);
      if (dx * dx + dz * dz < 400) this.reedsEnterT = t;
    }

    if (this.khepriSun && this.reedsEnterT >= 0) {
      const rise = Math.min(1, Math.max(0, (t - this.reedsEnterT) / 60));
      this.khepriSun.position.y = 4.5 + rise * 6;
      if (rise > 0.9 && !this.reedsWhisperFired) {
        this.reedsWhisperFired = true;
        this.say(
          "The sun rises because you walked through the night. It was never not going to rise — but you came to see it.",
          9000
        );
      }
    }
  }

  private buildStationReeds(): void {
    let seed = 60607;
    const rnd = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const additive = (m: any): void => {
      m.transparent = true;
      m.depthWrite = false;
      m.fog = false;
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.SrcAlphaFactor;
      m.blendDst = THREE.OneFactor;
      m.blendEquationAlpha = THREE.AddEquation;
      m.blendSrcAlpha = THREE.ZeroFactor;
      m.blendDstAlpha = THREE.OneFactor;
      m.needsUpdate = true;
    };

    const mGrain = vnoise(T.positionWorld.xz.mul(0.35)).mul(0.5)
      .add(vnoise(T.positionWorld.xz.mul(1.7)).mul(0.25));
    const mPatch = vnoise(T.positionWorld.xz.mul(0.06));
    const raise = T.smoothstep(0.30, 0.85, mPatch.mul(0.7).add(mGrain.mul(0.5)));
    const vDir = T.cameraPosition.sub(T.positionWorld);
    const ndv = T.clamp(T.dot(vDir.normalize(), T.normalWorld), 0.0, 1.0);
    const upDot = T.clamp(T.normalWorld.y, 0.0, 1.0);
    const base = T.mix(vec3(0.010, 0.018, 0.026), vec3(0.030, 0.052, 0.040), raise);
    const gold = T.pow(upDot, 2.0).mul(vec3(1.0, 0.78, 0.45)).mul(0.05);
    const rim = T.pow(float(1.0).sub(ndv), 5.0).mul(0.10).mul(vec3(0.3, 0.38, 0.8));
    const moonlit = base.add(gold).add(rim);
    const dEdge = T.length(T.positionWorld.xz.sub(vec2(-15.0, -12.0)));
    const col = T.mix(moonlit, vec3(0.020, 0.022, 0.045), smoothstep(17.0, 26.0, dEdge));
    const meadowMat = new THREE.MeshBasicNodeMaterial({ fog: false });
    meadowMat.colorNode = duatAir(col, T.positionWorld);
    const meadow = new THREE.Mesh(new THREE.CircleGeometry(26, 40), meadowMat);
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.set(-15, 0.02, -12);
    this.duat.add(meadow);

    // Reed tufts — annulus r 6..24 around (-15,-12)
    const reedGeo = new THREE.ConeGeometry(0.09, 2.2, 5);
    const reedMat = new THREE.MeshStandardNodeMaterial({ color: 0x14241a, roughness: 1.0, fog: false });
    const tipMat = new THREE.SpriteMaterial({ map: dotTexture(), color: 0xffd27a, opacity: 0.85 });
    additive(tipMat);
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 6 + rnd() * 18;
      const x = -15 + Math.cos(a) * r;
      const z = -12 + Math.sin(a) * r;
      const reed = new THREE.Mesh(reedGeo, reedMat);
      reed.position.set(x, 1.1, z);
      reed.rotation.z = (rnd() - 0.5) * 0.12;
      reed.rotation.x = (rnd() - 0.5) * 0.12;
      this.duat.add(reed);
      const tip = new THREE.Sprite(tipMat);
      tip.position.set(x, 2.35, z);
      tip.scale.setScalar(0.5);
      this.duat.add(tip);
      this.reedsTips.push(tip);
      this.reedsSway.push({ y: 2.35, phase: rnd() * Math.PI * 2 });
    }

    // Horizon — gold dawn band, brightest at bottom-center
    const glowMat = new THREE.MeshBasicNodeMaterial({
      color: 0xffc873,
      transparent: true,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    additive(glowMat);
    const uv = T.uv();
    const grad = T.sub(1.0, uv.y).mul(T.smoothstep(0.5, 0.0, T.abs(uv.x.sub(0.5))));
    glowMat.opacityNode = grad;
    glowMat.colorNode = T.vec3(1.0, 0.78, 0.36);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(90, 14), glowMat);
    glow.position.set(-15, 6, -38);
    this.duat.add(glow);

    // Khepri — the morning scarab
    const khepri = new THREE.Group();
    khepri.position.set(-15, 7.5, -36);
    const shellMat = new THREE.MeshStandardNodeMaterial({ color: 0x191018, roughness: 0.75, metalness: 0.25, fog: false });
    const goldDark = new THREE.MeshStandardNodeMaterial({ color: 0x8a6d2f, roughness: 0.55, metalness: 0.35, fog: false, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), shellMat);
    body.scale.y = 0.6;
    khepri.add(body);
    const wingGeo = new THREE.SphereGeometry(0.78, 16, 10);
    for (let s = -1; s <= 1; s += 2) {
      const wing = new THREE.Mesh(wingGeo, goldDark);
      wing.position.set(0.62 * s, 0.32, 0.1);
      wing.scale.set(0.62, 0.28, 1.35);
      khepri.add(wing);
    }
    const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.7, 6);
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const leg = new THREE.Mesh(legGeo, shellMat);
      leg.position.set(1.15 * side, -0.25, -0.75 + Math.floor(i / 2) * 0.75);
      leg.rotation.z = side * 1.05;
      khepri.add(leg);
    }
    this.duat.add(khepri);
    this.khepri = khepri;

    // The newborn sun
    const sunSpriteMat = new THREE.SpriteMaterial({ map: dotTexture(), color: 0xffd98a, opacity: 0.95 });
    additive(sunSpriteMat);
    const discMat = new THREE.MeshBasicNodeMaterial({ color: 0xffd98a, transparent: true, fog: false, depthWrite: false });
    additive(discMat);
    const khepriSun = new THREE.Group();
    khepriSun.position.set(-15, 4.5, -36.4);
    const sunGlow = new THREE.Sprite(sunSpriteMat);
    sunGlow.scale.setScalar(9);
    khepriSun.add(sunGlow);
    khepriSun.add(new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), discMat));
    this.duat.add(khepriSun);
    this.khepriSun = khepriSun;

    // Barque of the morning
    const barque = new THREE.Group();
    barque.position.set(-15, 3.2, -34);
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 7, 12, 1, true, 0, Math.PI), goldDark);
    hull.rotation.z = -Math.PI / 2;
    barque.add(hull);
    const prowGeo = new THREE.ConeGeometry(0.35, 1.6, 6);
    for (let e = -1; e <= 1; e += 2) {
      const prow = new THREE.Mesh(prowGeo, goldDark);
      prow.position.set(3.5 * e, 0.55, 0);
      prow.rotation.z = -0.5 * e;
      barque.add(prow);
    }
    this.duat.add(barque);
    this.reedsBarque = barque;
  }
  

  private buildStationBattle(): void {
    const home = this.apophisHome;
    const rnd = (i: number): number => {
      const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    // 7 points coiling around duat-local (8, 2, 26) — group-local so the group can lunge
    const raw = [
      new THREE.Vector3(4.2, 1.2, 22.2),
      new THREE.Vector3(11.6, 3.4, 22.8),
      new THREE.Vector3(12.4, 1.6, 29.2),
      new THREE.Vector3(7.0, 4.2, 30.6),
      new THREE.Vector3(2.8, 1.8, 27.2),
      new THREE.Vector3(5.2, 3.0, 22.8),
      new THREE.Vector3(11.2, 2.6, 25.6),
    ];
    this.apophisCurve = new THREE.CatmullRomCurve3(raw.map((p) => p.sub(home)));

    this.apophis = new THREE.Group();
    this.apophis.position.copy(home);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(this.apophisCurve, 64, 0.8, 10, false),
      new THREE.MeshStandardNodeMaterial({ color: 0x0d0d18, roughness: 0.6, metalness: 0.3, fog: false })
    );
    this.apophis.add(tube);

    // red eyes at the head end
    const head = this.apophisCurve.getPoint(1);
    const tan = this.apophisCurve.getTangent(1);
    const side = new THREE.Vector3(-tan.z, 0, tan.x);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    for (const s of [-1, 1]) {
      const eye = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: dotTexture(),
          color: new THREE.Color(1.0, 0.15, 0.1),
          transparent: true,
          depthWrite: false,
          fog: false,
          blending: THREE.CustomBlending,
          blendEquation: THREE.AddEquation,
          blendSrc: THREE.SrcAlphaFactor,
          blendDst: THREE.OneFactor,
          blendSrcAlpha: THREE.ZeroFactor,
          blendDstAlpha: THREE.OneFactor,
        })
      );
      eye.position.copy(head).addScaledVector(side, 0.32 * s).addScaledVector(tan, 0.3);
      eye.position.y += 0.35;
      eye.scale.setScalar(0.8);
      this.apophisEyes.push(eye);
      this.apophis.add(eye);
    }
    this.duat.add(this.apophis);

    // 4 spears of light — gold, additive, piercing the coil
    const spearGeo = new THREE.CylinderGeometry(0.06, 0.06, 8);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      });
      mat.colorNode = T.vec3(1.0, 0.8, 0.34).mul(this.apophisU);
      const spear = new THREE.Mesh(spearGeo, mat);
      const a = i * Math.PI * 0.5 + rnd(i) * 0.7;
      const r = 3.4 + rnd(i + 7) * 1.8;
      spear.position.set(home.x + Math.cos(a) * r, 1.4 + rnd(i + 13) * 1.4, home.z + Math.sin(a) * r);
      const dir = new THREE.Vector3(home.x - spear.position.x, 0.8 + rnd(i + 21) * 1.2, home.z - spear.position.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
      dir.normalize();
      spear.quaternion.setFromUnitVectors(up, dir);
      this.apophisSpears.push(spear);
      this.duat.add(spear);
    }
  }

  private updateBattle(): void {
    if (!this.apophis) return;
    const p = this.playerPos;
    if (!p) return;
    const lx = p.x - DUAT_ORIGIN.x;
    const lz = p.z - DUAT_ORIGIN.z;
    const now = this.uT.value;
    const dt = Math.min(0.1, Math.max(0, now - this.apophisLastT));
    this.apophisLastT = now;
    const home = this.apophisHome;
    const dx = lx - home.x;
    const dz = lz - home.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (this.apophisRecoiling) {
      this.apophisRecoilT = Math.max(0, this.apophisRecoilT - dt);
      this.apophis.position.lerp(home, 0.06);
      const rx = this.apophis.position.x - home.x;
      const rz = this.apophis.position.z - home.z;
      if (this.apophisRecoilT <= 0 || rx * rx + rz * rz < 0.04) {
        this.apophis.position.copy(home);
        this.apophisRecoiling = false;
        this.apophisMenace = 0;
        this.apophisStandT = 0;
      }
    } else if (dist < 12) {
      this.apophisMenace += (1 - this.apophisMenace) * 0.01;
      const step = 0.5 + this.apophisMenace * 2;
      const k = step * 0.02;
      this.apophis.position.x += (lx - this.apophis.position.x) * k;
      this.apophis.position.z += (lz - this.apophis.position.z) * k;
    } else {
      this.apophisMenace *= 0.97;
    }

    // hard safety clamp: the light holds — the serpent never reaches the player
    let cx = this.apophis.position.x - lx;
    let cz = this.apophis.position.z - lz;
    let cd = Math.sqrt(cx * cx + cz * cz);
    if (cd < 4) {
      if (cd < 1e-4) {
        cx = home.x - lx;
        cz = home.z - lz;
        cd = Math.sqrt(cx * cx + cz * cz);
        if (cd < 1e-4) {
          cx = 1;
          cz = 0;
          cd = 1;
        }
      }
      const s = 4 / (cd || 1);
      this.apophis.position.x = lx + cx * s;
      this.apophis.position.z = lz + cz * s;
    }

    if (!this.apophisRecoiling) {
      if (this.apophisMenace > 0.8) this.apophisStandT += dt;
      else this.apophisStandT = 0;
      if (this.apophisStandT >= 3) {
        this.apophisRecoiling = true;
        this.apophisRecoilT = 3;
        this.apophisFlashT = 0.6;
        this.apophisStandT = 0;
        this.say('It recoils. Courage is the oldest magic.', 4200);
      }
    }

    if (!this.apophisWhisperFired && this.apophisMenace > 0.5) {
      this.apophisWhisperFired = true;
      this.say('Stand firm. The serpent tests the heart, not the feet — it cannot touch what the light guards.', 5200);
    }

    if (this.apophisFlashT > 0) {
      this.apophisFlashT = Math.max(0, this.apophisFlashT - dt);
      this.apophisU.value = 2.5;
    } else {
      this.apophisU.value = 0.8 + Math.sin(this.uT.value * 3) * 0.3;
    }

    const eyeScale = 0.8 + this.apophisMenace * 0.8;
    for (const e of this.apophisEyes) e.scale.setScalar(eyeScale);
  }

  
  

  private buildStationSokar(): void {
    // Seeded RNG (deterministic dunes) — never Math.random.
    let seed = 0x5f3a17;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // --- Black sand dunes: 3-sine value-noise bumps baked into the attribute ---
    const duneGeo = new THREE.PlaneGeometry(46, 30, 46, 30);
    duneGeo.rotateX(-Math.PI / 2);
    const p1 = rnd() * Math.PI * 2;
    const p2 = rnd() * Math.PI * 2;
    const p3 = rnd() * Math.PI * 2;
    const dunePos = duneGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dunePos.count; i++) {
      const x = dunePos.getX(i);
      const z = dunePos.getZ(i);
      const w =
        Math.sin(x * 0.22 + p1) * 0.45 +
        Math.sin(z * 0.31 + p2) * 0.33 +
        Math.sin(x * 0.11 + z * 0.14 + p3) * 0.22;
      // amplitude 1.2, clamped so displacement never dips below the base plane
      dunePos.setY(i, Math.min(1.2, Math.max(0, (0.5 + 0.5 * w) * 1.2)));
    }
    dunePos.needsUpdate = true;
    duneGeo.computeVertexNormals();
    const dunes = new THREE.Mesh(duneGeo, duatDunes(this.uT));
    dunes.position.set(34, -0.15, -6);
    this.duat.add(dunes);

    // --- Shared additive glow recipe (CustomBlending, no depth writes) ---
    const glowMat = (colorNode: any): THREE.MeshBasicNodeMaterial =>
      new THREE.MeshBasicNodeMaterial({
        colorNode,
        transparent: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendEquationAlpha: THREE.AddEquation,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        fog: false,
        depthWrite: false
      });

    // --- Fire-serpent barque (local space: spine centered on its own origin) ---
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.4, 0.0, -1.4),
      new THREE.Vector3(-1.7, 0.75, -0.9),
      new THREE.Vector3(0.0, 0.95, 0.0),
      new THREE.Vector3(1.7, 0.75, 0.9),
      new THREE.Vector3(3.4, 0.0, 1.4)
    ]);
    const emberMat = glowMat(
      T.vec3(1.0, 0.36, 0.08).mul(
        T.float(0.55).add(T.float(0.45).mul(T.sin(T.uv().x.mul(20.0).sub(this.uT.mul(2.2)))))
      )
    );
    const serpent = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.35, 8, false), emberMat);
    serpent.position.set(34, 1.5, -6);
    this.sokarSerpent = serpent;

    // Double-headed: cone + glow bead at each tube end.
    for (let e = 0; e < 2; e++) {
      const tEnd = e === 0 ? 0 : 1;
      const tan = curve.getTangent(tEnd);
      const tLen = tan.length() || 1;
      tan.set(tan.x / tLen, tan.y / tLen, tan.z / tLen);
      if (tan.lengthSq() < 1e-6) tan.set(0, 0, 1);
      const dir = tan.multiplyScalar(e === 0 ? -1 : 1);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 8), emberMat);
      head.position.copy(curve.getPoint(tEnd)).addScaledVector(dir, 0.3);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      serpent.add(head);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), emberMat);
      bead.position.copy(curve.getPoint(tEnd)).addScaledVector(dir, 0.55);
      serpent.add(bead);
    }
    this.duat.add(serpent);

    // --- Gates flanking the path ---
    const gateDefs = [
      { x: 30, z: -13, name: 'The gate of the Silent Earth opens — it knows your step.' },
      { x: 38, z: 1, name: 'The gate of the Ember Watch opens — it knows your name.' }
    ];
    const stoneMat = duatStone(this.uT);
    for (let i = 0; i < gateDefs.length; i++) {
      const def = gateDefs[i];
      const group = new THREE.Group();
      group.position.set(def.x, 0, def.z);
      for (let s = 0; s < 2; s++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.5), stoneMat);
        post.position.set(s === 0 ? -1.7 : 1.7, 2.1, 0);
        group.add(post);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.7), stoneMat);
      lintel.position.set(0, 4.5, 0);
      group.add(lintel);

      const discU = T.uniform(0.35);
      const dR = T.length(T.uv().sub(0.5)).mul(2.0);
      const dCore = T.exp(dR.mul(dR).mul(-5.0));
      const dRing = smoothstep(0.05, 0.0, abs(dR.sub(0.78))).mul(0.8);
      const discMat = glowMat(T.vec3(1.0, 0.8, 0.34).mul(dCore.mul(1.2).add(dRing)).mul(discU));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1), discMat);
      disc.position.set(0, 2.1, 0.12);
      group.add(disc);

      this.sokarGates.push({ group, disc, discMat, open: 0, name: def.name });
      this.sokarGateU.push(discU);
      this.sokarGatePos.push(new THREE.Vector3(def.x, 0, def.z));
      this.sokarGateFacing.push(new THREE.Vector3(0, 0, 1));
      this.duat.add(group);
    }
  }

  private updateSokar(): void {
    const t = this.uT.value;
    const serpent = this.sokarSerpent;
    if (serpent) {
      serpent.position.y = 1.5 + Math.sin(t * 0.8) * 0.25;
      serpent.rotation.y = Math.sin(t * 0.23) * 0.12;
    }
    for (let i = 0; i < this.sokarGates.length; i++) {
      const gate = this.sokarGates[i];
      const base = this.sokarGatePos[i];
      const facing = this.sokarGateFacing[i];
      const pp = this.playerPos;
      if (!gate || !base || !facing || !pp) continue;
      const px = pp.x - DUAT_ORIGIN.x - base.x;
      const pz = pp.z - DUAT_ORIGIN.z - base.z;
      const dist = Math.sqrt(px * px + pz * pz);
      const approach = px * facing.x + pz * facing.z;
      if (dist < 6 && approach > 0) {
        gate.open += (1 - gate.open) * 0.03;
      }
      this.sokarGateState[i] = gate.open;
      gate.group.position.x = base.x + gate.open * 2.4;
      const u = this.sokarGateU[i];
      if (u) u.value = (0.35 + gate.open * 1.4) * (0.85 + 0.15 * Math.sin(t * 0.5 + i * 2.1));
      if (!this.sokarGateSaid[i] && gate.open > 0.45) {
        this.sokarGateSaid[i] = true;
        this.say(gate.name, 6000);
      }
    }
  }

  private updateNun(): void {
    const t = this.uT.value;
    for (let i = 0; i < this.nunFeathers.length; i++) {
      const f = this.nunFeathers[i];
      const base = this.nunFeatherBase[i];
      const phase = f.userData.phase || 0;
      f.position.x = base.x + Math.sin(t * 0.7 + phase) * 1.5;
      f.position.z = base.z + Math.cos(t * 0.5 + phase) * 1.5;
      f.position.y = base.y + Math.sin(t * 0.9 + phase) * 0.4;
    }
    for (let i = 0; i < this.nunTips.length; i++) {
      const s = 0.5 + 0.5 * Math.sin(t * 2.0 - i * 0.6);
      const m = this.nunTips[i].material as THREE.SpriteMaterial;
      m.opacity = 0.4 + 0.5 * s;
      this.nunTips[i].scale.setScalar(0.26 * (0.8 + 0.4 * s));
    }
    if (this.isInside && !this.nunWhisperFired && this.playerPos) {
      const dx = this.playerPos.x - (this.PATH[1].x + DUAT_ORIGIN.x);
      const dy = this.playerPos.y - (this.PATH[1].y + DUAT_ORIGIN.y);
      const dz = this.playerPos.z - (this.PATH[1].z + DUAT_ORIGIN.z);
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 10) {
        this.say("Before the first sunrise, there was only water — dark, and waiting.", 8000);
        this.nunWhisperFired = true;
      }
    }
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
    const glowM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const d = uv().sub(vec2(0.5, 0)).mul(vec2(2, 1));
    glowM.colorNode = vec4(vec3(1.0, 0.82, 0.55).mul(smoothstep(1.1, 0.2, T.length(d)).mul(0.35)), 1);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 4.1), glowM);
    glow.position.set(0, 2.05, dz + 1.3);
    this.world.add(glow);
    this.door.set(x, y, z + dz - 0.4);
    // the third spiral: from the apex, like a candle flame (58.24); soft and contained
    const fm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
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

  private buildInside(): void {
    this.inside.position.copy(PYR_ORIGIN);
    const lime = new Shell(), gran = new Shell();
    for (const r of ROOMS) buildRoom(r, r.granite ? gran : lime);
    const limeM = limestone(this.uT, [1.25, 1.2, 1.1], 1.4);
    limeM.side = THREE.FrontSide;
    this.inside.add(new THREE.Mesh(lime.geometry(), limeM), new THREE.Mesh(gran.geometry(), granite(this.uT)));
    // the coffer: a lidless box of granite
    const gm = granite(this.uT);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gm);
      m.position.set(x, y, z);
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
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
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
    // light inside: dim, warm, a little
    const hemi = new THREE.HemisphereLight(0xffe2c0, 0x201810, 0.35);
    this.inside.add(hemi);
    for (const [x, y, z, k] of [[0, 2.8, 4, 10], [-28, -6, 8, 14], [0, 3.6, 42.7, 10], [18, 11, 15.7, 16], [42, 17.4, 15.7, 14]] as const) {
      const l = new THREE.PointLight(0xffc88a, k, 22, 1.6);
      l.position.set(x, y, z);
      this.inside.add(l);
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
      const m = new THREE.SpriteMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, map: dotTexture() });
      const s = new THREE.Sprite(m);
      s.scale.setScalar(0.5);
      s.renderOrder = 20;
      s.visible = false;
      this.seven.push(s);
    }
    this.buildHiddenDoor();
    this.buildDuatFoundation();
  
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
        if (dx * dx + dz * dz < 55 * 55) return DUAT_ORIGIN.y;
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
  }

  /** Each frame. `pit`, `crystal`: 0–1 how awake the pit's light and the crystal are. */
  update(t: number, near: boolean, pit: number, crystal: number, flame: number, reduced: boolean): void {
    this.uT.value = reduced ? t * 0.4 : t;
    if (this.isInside && !this.doorFound && this.playerPos) {
      const dx = this.playerPos.x - (this.doorPos.x + PYR_ORIGIN.x);
      const dy = this.playerPos.y - (this.doorPos.y + PYR_ORIGIN.y);
      const dz = this.playerPos.z - (this.doorPos.z + PYR_ORIGIN.z);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 3.5) {
        this.say("A seam of light in the rock — a door the old priests never opened.", 7000);
        this.doorFound = true;
      }
    }
    this.uDoor.value += ((this.doorFound ? 1 : 0) - this.uDoor.value) * 0.04;
    if (this.doorSlab) this.doorSlab.position.y = this.doorPos.y + this.uDoor.value * 2.2;
    this.updateDuat();

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

function duatStone(uT: N): THREE.MeshBasicNodeMaterial {
  const n = T.normalize(T.normalWorld);
  const v = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const up = T.normalize(vec3(0.06, 0.5, 0.35));
  const hemi = T.clamp(T.dot(n, up).mul(0.5).add(0.5), 0.0, 1.0);
  const base = T.mix(vec3(0.022, 0.02, 0.05), vec3(0.072, 0.08, 0.155), hemi);
  const warm = T.pow(T.max(T.dot(n, up), 0.0), 2.0).mul(vec3(1.0, 0.78, 0.45)).mul(0.11);
  const grain = vnoise(T.positionWorld.xz.mul(0.6).add(uT.mul(0.02))).mul(vec3(0.05, 0.05, 0.05));
  const ndv = T.max(T.dot(n, v), 0.0);
  const rim = T.pow(ndv.mul(-1).add(1.0), 5).mul(0.18).mul(vec3(0.3, 0.38, 0.8));
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  mat.colorNode = duatAir(base.add(rim).add(grain).add(warm), T.positionWorld);
  return mat;
}

function duatDunes(uT: N): THREE.MeshBasicNodeMaterial {
  const n = T.normalize(T.normalWorld);
  const v = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const up = T.normalize(vec3(0.06, 0.5, 0.35));
  const hemi = T.clamp(T.dot(n, up).mul(0.5).add(0.5), 0.0, 1.0);
  const rip = vnoise(T.positionWorld.xz.mul(1.2).add(uT.mul(0.015)));
  const base = T.mix(T.mix(vec3(0.022, 0.02, 0.05), vec3(0.072, 0.08, 0.155), hemi), vec3(0.09, 0.09, 0.17), rip);
  const warm = T.pow(T.max(T.dot(n, up), 0.0), 2.0).mul(vec3(1.0, 0.78, 0.45)).mul(0.11);
  const grain = vnoise(T.positionWorld.xz.mul(0.6).add(uT.mul(0.02))).mul(vec3(0.05, 0.05, 0.05));
  const ndv = T.max(T.dot(n, v), 0.0);
  const rim = T.pow(ndv.mul(-1).add(1.0), 5).mul(0.18).mul(vec3(0.3, 0.38, 0.8));
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  mat.colorNode = duatAir(base.add(rim).add(grain).add(warm), T.positionWorld);
  return mat;
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
