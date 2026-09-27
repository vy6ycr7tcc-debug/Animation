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
import { PYRAMID } from "./terrain";

const { abs, cos, float, floor, fract, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;
const V = THREE.Vector3;

export const PYR_ORIGIN = new THREE.Vector3(50000, 14, 0); // high enough that its lowest chamber (−9) stays above the water line

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
  private gallery!: { pos: THREE.InstancedBufferAttribute; seed: Float32Array };
  private uPit = uniform(0);
  private uCrystal = uniform(0);
  private local = new THREE.Vector3();
  /** The seven colours of the King's Chamber, lit one by one on the wanderer (main.ts). */
  seven: THREE.Sprite[] = [];

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
  }

  /** Which chamber a point inside is in. */
  chamber(p: THREE.Vector3): Chamber {
    const l = this.local.copy(p).sub(PYR_ORIGIN);
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
