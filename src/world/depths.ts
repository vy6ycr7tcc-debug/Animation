/* The deep (Samuel: "the underwater world needs ruins, stuff reflective spots, stillness and
   access thru caves to archives of the deeper self").
   - Ruins on the lake floors: a ring of columns around a stepped floor, a gateway standing over
     nothing, a stair climbing to a platform; standing and fallen, in the world's etched stone.
     Soft lights have settled on them.
   - Stillness spots: a pale ring inlaid in the floor beside each ruin. Come to rest inside one
     (let go: under the water you sink gently) and the sea hushes, the ring brightens and a
     question to sit with rises (written for the game; Samuel's own may replace them).
   - Caves: arches of stone in the steep underwater slopes, light at their back. Swim through
     one and you come into the Archive of the Deeper Self, a place apart (like the temple):
     a great grotto under the water, its walls a spiral of tablets, one for each narration of
     the archive (those you have heard glow, and a touch plays them again), and twenty-two
     alcoves, one for each archetype (those you have met hold their light, and a touch lets them
     speak again). At its centre, a ring of stillness. Swim back out through the way you came. */
import * as THREE from "three/webgpu";
import { T, worldPoints, type N } from "../gpu/tsl";
import { etchedStone } from "./etching";
import { columnGeometry, scan, type ScanName } from "./temple";
import { heightAt, LANDMARK_KINDS, LANDMARK_SITES, SPAWN, WATER_Y } from "./terrain";

const { abs, atan, cos, float, fract, length, max, mix, positionGeometry, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;
const V = THREE.Vector3;

function hash(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function rng(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/* ---------------------------------------------------------------- where */
export type RuinKind = "ring" | "gate" | "stair";
export interface RuinSite { x: number; z: number; y: number; kind: RuinKind; rot: number }
export interface SpotSite { x: number; z: number; y: number; r: number }
export interface MouthSite { x: number; z: number; y: number; face: number }

const deepHomes = LANDMARK_SITES.filter((_, i) => LANDMARK_KINDS[i] === "deep" || LANDMARK_KINDS[i] === "island");

/** Ruins on flat stretches of lake floor, well under the water, apart from each other and the
    homes in the deep; nearer ones first, so the first lake you swim holds one. */
export const RUIN_SITES: RuinSite[] = (() => {
  const out: RuinSite[] = [];
  const kinds: RuinKind[] = ["ring", "gate", "stair"];
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 900 && out.length < 9; i++) {
    const r = 40 + Math.sqrt(i) * 70, a = i * GA;
    const x = SPAWN.x + Math.cos(a) * r, z = SPAWN.z + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h > -9 || h < -60) continue;
    let flat = true;
    for (const [dx, dz] of [[9, 0], [-9, 0], [0, 9], [0, -9]]) if (Math.abs(heightAt(x + dx, z + dz) - h) > 2.2) flat = false;
    if (!flat) continue;
    if (deepHomes.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 70)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 220)) continue;
    out.push({ x, z, y: h, kind: kinds[out.length % 3], rot: hash(i, 3, 11) * Math.PI * 2 });
  }
  return out;
})();

/** A ring of stillness beside each ruin (on the floor, a little way off). */
export const SPOT_SITES: SpotSite[] = RUIN_SITES.map((r, i) => {
  const a = r.rot + 2.2 + hash(i, 1, 12);
  const d = r.kind === "ring" ? 0 : 11; // the ring of columns holds its own at the centre
  const x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d;
  return { x, z, y: heightAt(x, z), r: 2.6 };
});

/** Cave mouths in the steep slopes under the water, facing down the slope into open water. */
export const MOUTH_SITES: MouthSite[] = (() => {
  const out: MouthSite[] = [];
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 1400 && out.length < 4; i++) {
    const r = 60 + Math.sqrt(i) * 55, a = i * GA * 1.3 + 0.7;
    const x = SPAWN.x + Math.cos(a) * r, z = SPAWN.z + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h > -8 || h < -40) continue;
    const gx = heightAt(x + 6, z) - heightAt(x - 6, z), gz = heightAt(x, z + 6) - heightAt(x, z - 6);
    if (Math.hypot(gx, gz) < 2.5) continue; // a real slope to run into
    const face = Math.atan2(-gz, -gx); // downhill: the mouth opens that way
    // room before it: open water, and still under the surface above it
    const fx = x + Math.cos(face) * 8, fz = z + Math.sin(face) * 8;
    if (heightAt(fx, fz) > h - 0.5 || heightAt(fx, fz) > -7) continue;
    if (deepHomes.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 60)) continue;
    if (RUIN_SITES.some((o) => Math.hypot(o.x - x, o.z - z) < 40)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 300)) continue;
    out.push({ x, z, y: h, face });
  }
  return out;
})();

/* ---------------------------------------------------------------- stillness rings */
const REFLECTIONS = [
  "What are you carrying that was never yours to carry?",
  "Where in you is it already quiet?",
  "What would you do today if you trusted yourself completely?",
  "Who taught you to be afraid of the dark?",
  "What in you is asking to be forgiven?",
  "When did you last feel entirely at home?",
  "What do you love that you have not yet said aloud?",
  "What gift is hidden in what hurts?",
  "If nothing needed to change, what would you notice?",
  "Which part of you have you been waiting to meet?",
  "Let the water hold you. What do you hear?",
  "What is the oldest thing you know about yourself?",
];

function ringMaterial(glow: { value: number }, tint: THREE.Color): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const uG = uniform(0), uT = uniform(0);
  (m as unknown as { glowU: typeof uG; timeU: typeof uT }).glowU = uG;
  (m as unknown as { timeU: typeof uT }).timeU = uT;
  void glow;
  const p = uv().sub(0.5).mul(2), r = length(p), a = atan(p.y, p.x);
  const w = float(0.012);
  const ring = smoothstep(w.mul(3), 0, abs(r.sub(0.92))).add(smoothstep(w.mul(2), 0, abs(r.sub(0.8))).mul(0.6));
  // twelve fine marks between the two circles, turning very slowly
  const ticks = smoothstep(0.035, 0, abs(fract(a.div(6.28318).mul(12).add(uT.mul(0.01))).sub(0.5)).mul(0.5)).mul(step2(r, 0.8, 0.92));
  const disc = smoothstep(0.8, 0.0, r).mul(0.08).mul(uG);
  const breath = sin(uT.mul(0.6)).mul(0.15).add(0.85);
  const k = ring.mul(0.5).add(ticks.mul(0.4)).mul(uG.mul(1.6).add(0.35)).mul(breath).add(disc);
  m.colorNode = vec4(vec3(tint.r, tint.g, tint.b).mul(k).mul(smoothstep(1.0, 0.95, r)), 1);
  return m;
}
const step2 = (r: ReturnType<typeof float>, a: number, b: number) => smoothstep(a - 0.01, a + 0.01, r).mul(smoothstep(b + 0.01, b - 0.01, r));

class Ring {
  mesh: THREE.Mesh;
  glow = 0;
  constructor(public site: SpotSite, tint = new THREE.Color(0.75, 0.92, 1.0)) {
    const m = ringMaterial({ value: 0 }, tint);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(site.r * 2.2, site.r * 2.2), m);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(site.x, site.y + 0.08, site.z);
    this.mesh.renderOrder = 4;
  }
  set(t: number, glow: number): void {
    const m = this.mesh.material as unknown as { glowU: { value: number }; timeU: { value: number } };
    m.glowU.value = glow;
    m.timeU.value = t;
  }
}

/* ---------------------------------------------------------------- stone: Egypt and Atlantis */
const film = (h: N): N => cos(vec3(h).add(vec3(0, 0.33, 0.67)).mul(6.28318)).mul(0.5).add(0.5);

/** Scanned sandstone (the temple's own, Poly Haven CC0) laid in the world from three sides, so no
    scaled block stretches it; worn by the water. Over it, Atlantis (Samuel: "Egyptian rock made
    and Atlantean iridescent style"): a thin-film sheen like mother-of-pearl where the stone turns
    from you, and fine inlaid channels of the same shifting colour (bands at the drums' joints, a
    lattice of glyph-lines on the blocks), glowing enough to read through the water. */
function ruinStone(set: ScanName, inlay: "bands" | "grid" | "none", uT: N, painted = false): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.85 });
  if (painted) m.vertexColors = true;
  const S = scan(set);
  const pw = T.positionWorld, n = T.normalWorldGeometry;
  const wp = T.pow(abs(n), vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tile = 2.6;
  const tri = (t: THREE.Texture) =>
    T.texture(t, pw.zy.div(tile)).mul(w.x).add(T.texture(t, pw.xz.div(tile)).mul(w.y)).add(T.texture(t, pw.xy.div(tile)).mul(w.z));
  const arm = tri(S.arm);
  let c: N = tri(S.diff).rgb.mul(T.mix(float(0.5), float(1), arm.r));
  if (painted) c = c.mul(T.vertexColor().rgb.div(vec3(0.77, 0.64, 0.45)).mix(vec3(1), 0.45));
  m.colorNode = vec4(c.mul(1.15), 1);
  m.roughnessNode = T.clamp(arm.g, 0.4, 1);
  const V = T.normalize(T.cameraPosition.sub(pw));
  const ndv = T.max(T.dot(T.normalWorld, V), 0);
  const drift = sin(pw.x.mul(0.21).add(sin(pw.z.mul(0.17)).mul(2))).mul(0.5).add(sin(pw.y.mul(0.4).add(pw.z.mul(0.13))).mul(0.5));
  const f = film(ndv.mul(1.3).add(drift.mul(0.35)).add(uT.mul(0.015)));
  // the pearl: strongest at grazing angles, faint face-on
  const pearl = f.mul(T.pow(float(1).sub(ndv), 3).mul(0.3).add(0.025)).mul(float(1).sub(w.y.mul(0.85))); // on the sides, not across a floor
  let lines: N = float(0);
  if (inlay === "bands") {
    const y = fract(pw.y.div(1.1).add(0.5)).sub(0.5).abs();
    lines = smoothstep(0.03, 0.0, y).mul(float(1).sub(w.y)); // on the sides only, never a whole top
  } else if (inlay === "grid") {
    const g = (a: N) => smoothstep(0.018, 0.0, fract(a.div(0.9)).sub(0.5).abs().sub(0.48).abs());
    const gx = g(pw.x).max(g(pw.z)).mul(float(1).sub(w.y)).add(g(pw.x).max(g(pw.z)).mul(w.y));
    const gy = g(pw.y).mul(float(1).sub(w.y));
    // only some channels are lit: the glyph-lines of a script no one reads now
    const lit = smoothstep(0.8, 0.95, sin(T.floor(pw.x.div(0.9)).mul(12.9).add(T.floor(pw.y.div(0.9)).mul(7.1)).add(T.floor(pw.z.div(0.9)).mul(4.3))).mul(0.5).add(0.5));
    lines = gx.max(gy).mul(lit);
  }
  const breath = sin(uT.mul(0.5).add(pw.x.mul(0.05))).mul(0.2).add(0.8);
  m.emissiveNode = pearl.add(f.mul(lines).mul(inlay === "grid" ? 0.4 : 0.6).mul(breath)).add(c.mul(0.12));
  return m;
}

/** Electrum capstones and crystals: all colour, shifting with the angle. */
function iridescent(uT: N, k = 1): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ fog: false });
  const V = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const ndv = T.max(T.dot(T.normalWorld, V), 0);
  const f = film(ndv.mul(1.8).add(uT.mul(0.03)).add(T.positionWorld.y.mul(0.08)));
  m.colorNode = vec4(f.mul(float(0.25).add(T.pow(float(1).sub(ndv), 1.5).mul(0.9))).mul(k), 1);
  return m;
}

type Kind = "drum" | "block" | "column" | "shaft" | "tower" | "cap" | "crystal";
class Stones {
  meshes: Record<Kind, THREE.InstancedMesh>;
  private n: Record<Kind, number> = { drum: 0, block: 0, column: 0, shaft: 0, tower: 0, cap: 0, crystal: 0 };
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  constructor(uT: N) {
    const col = columnGeometry();
    col.scale(0.5, 0.5, 0.5); // the temple's papyrus column at half its size: 5.25 m
    const shaft = new THREE.CylinderGeometry(0.62 * Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
    shaft.computeVertexNormals();
    const tower = new THREE.CylinderGeometry(0.78 * Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
    const cap = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
    const crystal = new THREE.OctahedronGeometry(1, 0);
    const blocks = ruinStone("sandstone_blocks_05", "grid", uT), drums = ruinStone("sandstone_cracks", "bands", uT);
    const columns = ruinStone("sandstone_cracks", "none", uT, true), walls = ruinStone("sandstone_blocks_08", "grid", uT);
    const mk = (g: THREE.BufferGeometry, mat: THREE.Material, max: number) => {
      const im = new THREE.InstancedMesh(g, mat, max);
      im.count = 0;
      im.frustumCulled = false;
      im.receiveShadow = true;
      return im;
    };
    this.meshes = {
      drum: mk(new THREE.CylinderGeometry(1, 1.02, 1, 24), drums, 400),
      block: mk(new THREE.BoxGeometry(1, 1, 1), blocks, 300),
      column: mk(col, columns, 80),
      shaft: mk(shaft, blocks, 20),
      tower: mk(tower, walls, 20),
      cap: mk(cap, iridescent(uT, 1.2), 20),
      crystal: mk(crystal, iridescent(uT, 1.6), 40),
    };
  }
  put(kind: Kind, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): void {
    this.q.setFromEuler(new THREE.Euler(rx, ry, rz));
    const im = this.meshes[kind];
    if (this.n[kind] >= im.instanceMatrix.count) return;
    im.setMatrixAt(this.n[kind]++, this.m.compose(new V(x, y, z), this.q, new V(sx, sy, sz)));
    im.count = this.n[kind];
  }
  drum(x: number, y: number, z: number, r: number, h: number, rx = 0, ry = 0, rz = 0): void {
    this.put("drum", x, y, z, r, h, r, rx, ry, rz);
  }
  block(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0): void {
    this.put("block", x, y, z, sx, sy, sz, rx, ry, rz);
  }
  done(): void {
    for (const im of Object.values(this.meshes)) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
}

/** One ruin, laid out around its centre (local x along `rot`). */
function buildRuin(s: Stones, site: RuinSite, lights: number[]): void {
  const R = rng(Math.abs(site.x * 7 + site.z * 13) % 1000);
  const cs = Math.cos(site.rot), sn = Math.sin(site.rot);
  const at = (lx: number, lz: number) => [site.x + lx * cs - lz * sn, site.z + lx * sn + lz * cs] as const;
  const floor = (x: number, z: number) => heightAt(x, z);
  const light = (x: number, y: number, z: number) => lights.push(x, y, z);
  /** An obelisk: standing, leaning, or fallen along the floor; its pyramidion of electrum. */
  const obelisk = (x: number, z: number, h: number, fate: number, dir: number) => {
    const fy = floor(x, z);
    if (fate < 0.5) {
      const lean = fate < 0.25 ? 0 : 0.14;
      s.put("shaft", x, fy + h / 2 - 0.3, z, 1.1, h, 1.1, lean, dir, 0);
      s.put("cap", x + Math.sin(lean) * h * Math.sin(dir), fy + h - 0.3 + 0.45, z + Math.sin(lean) * h * Math.cos(dir), 0.7, 0.9, 0.7, lean, dir, 0);
      light(x, fy + h + 1.2, z);
    } else {
      const cx = x + Math.cos(dir) * h * 0.5, cz = z + Math.sin(dir) * h * 0.5;
      s.put("shaft", cx, floor(cx, cz) + 0.5, cz, 1.1, h, 1.1, Math.PI / 2 - 0.05, 0, -dir + Math.PI / 2);
      const tx = x + Math.cos(dir) * (h + 0.4), tz = z + Math.sin(dir) * (h + 0.4);
      s.put("cap", tx, floor(tx, tz) + 0.4, tz, 0.7, 0.9, 0.7, 0.3, dir, 1.2);
    }
  };
  if (site.kind === "ring") {
    // a stepped round floor; papyrus columns around it: some standing whole, some broken, some fallen
    const [cx, cz] = at(0, 0);
    const fy = floor(cx, cz);
    s.drum(cx, fy + 0.1, cz, 9.2, 0.6);
    s.drum(cx, fy + 0.5, cz, 7.9, 0.4);
    const n = 10, R0 = 7.2;
    const whole: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const [x, z] = at(Math.cos(a) * R0, Math.sin(a) * R0);
      const base = fy + 0.7;
      const fate = R();
      if (fate < 0.5) {
        s.put("column", x, base, z, 1, 1, 1, 0, R() * 6, 0);
        whole.push(true);
        if (R() < 0.35) s.put("crystal", x, base + 6.3, z, 0.35, 0.6, 0.35, 0, R() * 3, 0); // a crystal left on the capital
      } else if (fate < 0.8) {
        const k0 = 1 + Math.floor(R() * 2);
        for (let k = 0; k < k0; k++) s.drum(x, base + 0.5 + k * 1.02, z, 0.6, 1.0, 0, R() * 3, 0);
        const out = a + (R() - 0.5) * 0.8;
        for (let k = 0; k < 4 - k0; k++) {
          const d = 1.6 + k * 1.05 + R() * 0.3;
          const fx = x + Math.cos(out) * d, fz = z + Math.sin(out) * d;
          s.drum(fx, floor(fx, fz) + 0.5, fz, 0.6, 1.0, Math.PI / 2, 0, -out + (R() - 0.5) * 0.3);
        }
        whole.push(false);
      } else {
        // fallen whole across the floor
        const out = a + Math.PI / 2 + (R() - 0.5);
        const cxx = x + Math.cos(out) * 2.6, czz = z + Math.sin(out) * 2.6;
        s.put("column", cxx - Math.cos(out) * 2.6, Math.max(floor(cxx, czz), base - 0.4) + 0.55, czz - Math.sin(out) * 2.6, 1, 1, 1, 0, 0, 0);
        const im = s.meshes.column;
        // lay the one just placed on its side, pointing along `out`
        const m4 = new THREE.Matrix4().compose(new V(x, Math.max(floor(cxx, czz), base - 0.4) + 0.55, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -out, -Math.PI / 2 + 0.04, "YXZ")), new V(1, 1, 1));
        im.setMatrixAt(im.count - 1, m4);
        whole.push(false);
      }
    }
    for (let i = 0; i < n; i++) {
      if (!whole[i] || !whole[(i + 1) % n]) continue;
      const a = ((i + 0.5) / n) * Math.PI * 2;
      const [x, z] = at(Math.cos(a) * R0, Math.sin(a) * R0);
      s.block(x, fy + 0.7 + 5.6, z, 4.6, 0.7, 1.2, -a + Math.PI / 2);
    }
    light(cx, fy + 7, cz);
  } else if (site.kind === "gate") {
    // a pylon gateway: two battered towers (one broken lower), the lintel between, a threshold;
    // an obelisk fallen before it and an electrum crystal hanging in the doorway
    for (const side of [-1, 1]) {
      const [x, z] = at(side * 4.4, 0);
      const fy = floor(x, z);
      const h = side < 0 ? 10 : 6.5 + R() * 1.5;
      s.put("tower", x, fy + h / 2 - 0.4, z, 4.6, h, 2.8, 0, -site.rot, 0);
      light(x, fy + h + 0.6, z);
    }
    const [gx, gz] = at(0, 0);
    const gy = floor(gx, gz);
    s.block(gx, gy + 6.6, gz, 4.8, 1.2, 2.2, -site.rot);
    s.block(gx, gy + 0.15, gz, 3.6, 0.3, 2.2, -site.rot);
    s.put("crystal", gx, gy + 3.6, gz, 0.6, 1.1, 0.6, 0, R() * 3, 0);
    const [ox, oz] = at(-3, 7);
    obelisk(ox, oz, 9, 0.8, site.rot + 0.4);
    for (let k = 0; k < 6; k++) {
      const [x, z] = at((R() - 0.5) * 16, (R() - 0.5) * 12);
      s.block(x, floor(x, z) + 0.4, z, 1.2 + R(), 0.8 + R() * 0.4, 1.0 + R() * 0.6, R() * 3, (R() - 0.5) * 0.4, (R() - 0.5) * 0.4);
    }
  } else {
    // a stair up to a platform where an obelisk still stands, capped in electrum; papyrus
    // column stumps at its corners
    const [px, pz] = at(0, -4.5);
    const py = floor(px, pz);
    s.block(px, py + 2.6, pz, 7, 0.5, 6, -site.rot);
    s.block(px, py + 1.2, pz, 6.6, 2.4, 5.6, -site.rot);
    for (let k = 0; k < 7; k++) {
      const [x, z] = at(0, -1.2 + k * 0.75);
      s.block(x, py + 2.4 - k * 0.36 - 0.18, z, 4.2, 0.36, 0.75, -site.rot);
    }
    const [ox, oz] = at(0, -5.2);
    s.put("shaft", ox, py + 2.85 + 4.5, oz, 1.2, 9, 1.2, 0, -site.rot, 0);
    s.put("cap", ox, py + 2.85 + 9 + 0.45, oz, 0.84, 0.9, 0.84, 0, -site.rot, 0);
    light(ox, py + 13.6, oz);
    for (const [sx, sz] of [[-2.8, -2.2], [2.8, -2.2], [-2.8, -6.8], [2.8, -6.8]]) {
      const [x, z] = at(sx, sz);
      const h = 1 + Math.floor(R() * 2);
      for (let k = 0; k < h; k++) s.drum(x, py + 2.85 + 0.5 + k * 1.0, z, 0.5, 1.0, 0, R() * 3, 0);
    }
    const [fx, fz] = at(5, 3);
    obelisk(fx, fz, 7, 0.9, site.rot - 0.8);
  }
}

/* ---------------------------------------------------------------- cave mouths */
function buildMouth(site: MouthSite, stone: THREE.Material): { group: THREE.Group; portal: THREE.Vector3; door: THREE.MeshBasicNodeMaterial } {
  const g = new THREE.Group();
  // the arch stands upright facing down the slope; its foot a little sunk in the floor
  // on a slope: stand on the ground at the doorway (a little into the hill), so it isn't buried
  const y = Math.max(heightAt(site.x, site.z), heightAt(site.x - Math.cos(site.face) * 1.5, site.z - Math.sin(site.face) * 1.5));
  g.position.set(site.x, y - 0.35, site.z);
  g.rotation.y = -site.face + Math.PI / 2; // local +z points out of the mouth
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.6, 1.35, 10, 28, Math.PI), stone);
  arch.position.y = 0;
  g.add(arch);
  // the hollow behind: a half tube running into the hill, closed at its back
  const hollow = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 9, 20, 1, true, Math.PI / 2, Math.PI), stone);
  hollow.rotation.x = Math.PI / 2;
  hollow.position.set(0, 0, -4.5);
  (hollow.material as THREE.Material).side = THREE.DoubleSide;
  g.add(hollow);
  // the way through: a soft light standing in the opening
  const door = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const uT = uniform(0);
  (door as unknown as { timeU: typeof uT }).timeU = uT;
  const p = uv().sub(vec2(0.5, 0)).mul(vec2(2, 1)), r = length(p);
  const edge = smoothstep(1, 0.55, r).mul(smoothstep(0, 0.08, uv().y));
  const shimmer = sin(r.mul(14).sub(uT.mul(1.3))).mul(0.12).add(0.88);
  door.colorNode = vec4(mix(vec3(0.35, 0.75, 1.0), vec3(1.0, 0.85, 0.6), smoothstep(0.9, 0.2, r)).mul(edge.mul(shimmer).mul(2.2)), 1);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.4), door);
  plane.position.set(0, 2.2, -1.5); // its foot on the threshold, filling the arch
  plane.renderOrder = 5;
  g.add(plane);
  g.updateMatrixWorld(true);
  const portal = new V(0, 1.6, -1.5).applyMatrix4(g.matrixWorld);
  return { group: g, portal, door };
}

/* ---------------------------------------------------------------- the grotto */
export const ARCHIVE_ORIGIN = new THREE.Vector3(40000, -26, 0);
const GR = 24; // the grotto's radius
const GH = 15; // its height

export interface ArchiveItem { id: string; title: string }
export interface Being { numeral: string; name: string; tint: THREE.Color }

export class Depths {
  /** In the lakes: ruins, rings, cave mouths (drawn only near or under the water). */
  group = new THREE.Group();
  /** The Archive of the Deeper Self, beyond the world's edge. */
  grotto = new THREE.Group();
  inside = false;
  rings: Ring[] = [];
  mouths: { site: MouthSite; portal: THREE.Vector3; door: THREE.MeshBasicNodeMaterial }[] = [];
  centreRing: Ring;
  private tablets!: THREE.InstancedMesh;
  private tabletIds: string[] = [];
  private alcoveOrbs: THREE.Mesh[] = [];
  private exitDoor!: THREE.MeshBasicNodeMaterial;
  readonly exitAt = new THREE.Vector3();
  private local = new THREE.Vector3();
  private col = new THREE.Color();
  private ray = new THREE.Raycaster();
  private lastReflection = -1;
  private uT = uniform(0);

  constructor(items: ArchiveItem[], beings: Being[]) {
    const s = new Stones(this.uT);
    const lights: number[] = [];
    for (const r of RUIN_SITES) buildRuin(s, r, lights);
    s.done();
    this.group.add(...Object.values(s.meshes));
    // soft lights settled on the stones
    if (lights.length) {
      const pts = worldPoints(new Float32Array(lights), { color: new THREE.Color(0.75, 0.95, 1.0), size: 1.1, opacity: 0.55 });
      this.group.add(pts.sprite);
    }
    for (const sp of SPOT_SITES) {
      const ring = new Ring(sp);
      this.rings.push(ring);
      this.group.add(ring.mesh);
    }
    const mouthStone = ruinStone("sandstone_blocks_08", "grid", this.uT);
    for (const m of MOUTH_SITES) {
      const b = buildMouth(m, mouthStone);
      this.group.add(b.group);
      this.mouths.push({ site: m, portal: b.portal, door: b.door });
    }
    this.group.visible = false;
    this.centreRing = new Ring({ x: ARCHIVE_ORIGIN.x, z: ARCHIVE_ORIGIN.z, y: ARCHIVE_ORIGIN.y, r: 3.4 }, new THREE.Color(1.0, 0.88, 0.66));
    this.buildGrotto(items, beings);
    this.grotto.visible = false;
  }

  private buildGrotto(items: ArchiveItem[], beings: Being[]): void {
    const O = ARCHIVE_ORIGIN;
    this.grotto.position.copy(O);
    // the dome: dark water-worn stone, veins of light running through it
    const domeM = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false });
    const uT = uniform(0);
    (domeM as unknown as { timeU: typeof uT }).timeU = uT;
    {
      const p = positionGeometry;
      const n = sin(p.x.mul(0.37).add(sin(p.y.mul(0.51)).mul(2.1))).add(sin(p.z.mul(0.29).add(sin(p.x.mul(0.43)).mul(1.7)))).add(sin(p.y.mul(0.22).add(p.z.mul(0.31))));
      const vein = smoothstep(0.025, 0, abs(fract(n.mul(0.7)).sub(0.5)).sub(0.004)).mul(0.5);
      const flow = sin(n.mul(3).sub(uT.mul(0.4))).mul(0.5).add(0.5);
      const h = p.y.div(GH).clamp(0, 1);
      const rock = mix(vec3(0.03, 0.035, 0.05), vec3(0.012, 0.018, 0.035), h);
      domeM.colorNode = vec4(rock.add(vec3(0.45, 0.62, 0.8).mul(vein).mul(flow.mul(0.7).add(0.15)).mul(0.22)), 1);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(GR, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeM);
    dome.scale.set(1, GH / GR, 1);
    this.grotto.add(dome);
    // the floor: fine sand, a great mandala of pale lines inlaid in it
    const floorM = new THREE.MeshBasicNodeMaterial({ fog: false });
    {
      const q = uv().sub(0.5).mul(GR * 2), r = length(q), a = atan(q.y, q.x);
      const line = (d: ReturnType<typeof float>, w: number) => smoothstep(w, 0, abs(d));
      const rings = line(fract(r.div(3)).sub(0.5).mul(3), 0.05).mul(smoothstep(4.5, 5, r)).mul(smoothstep(GR - 2, GR - 4, r));
      const spokes = line(fract(a.div(6.28318).mul(22)).sub(0.5).mul(r).mul(0.285), 0.04).mul(smoothstep(4, 6, r)).mul(smoothstep(GR - 3, GR - 6, r));
      const sand = vec3(0.05, 0.05, 0.06).mul(sin(q.x.mul(1.3).add(sin(q.y.mul(0.7)).mul(2))).mul(0.15).add(0.9));
      floorM.colorNode = vec4(sand.add(vec3(0.7, 0.62, 0.45).mul(rings.add(spokes.mul(0.6)).mul(0.22))), 1);
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(GR, 64), floorM);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    this.grotto.add(floor);
    // the tablets: a spiral band round the wall, one per narration of the archive
    const tabM = new THREE.MeshBasicNodeMaterial({ fog: false });
    const n = items.length;
    this.tablets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.9, 0.08), tabM, Math.max(1, n));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    items.forEach((it, i) => {
      const turns = 2.2, u = (i + 0.5) / Math.max(1, n);
      const a = u * turns * Math.PI * 2 + 0.6;
      const y = 3.2 + u * 6.5;
      // on the dome at that height (an ellipsoid), a little in from the wall
      const rr = GR * Math.sqrt(Math.max(0.05, 1 - (y / GH) ** 2)) - 0.9;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      q.setFromAxisAngle(new V(0, 1, 0), Math.atan2(-x, -z));
      m4.compose(new V(x, y, z), q, new V(1, 1, 1));
      this.tablets.setMatrixAt(i, m4);
      this.tablets.setColorAt(i, this.col.setRGB(0.05, 0.05, 0.07));
      this.tabletIds.push(it.id);
    });
    this.tablets.instanceMatrix.needsUpdate = true;
    if (this.tablets.instanceColor) this.tablets.instanceColor.needsUpdate = true;
    this.tablets.computeBoundingSphere();
    this.grotto.add(this.tablets);
    // the alcoves: twenty-two, low round the wall, an arch of stone and a light within
    const alcoveStone = etchedStone("#23262f", "#e9c37d", 2.2);
    const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 2.4, 0.35), alcoveStone, 44);
    const lintels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.3, 0.45), alcoveStone, 22);
    beings.forEach((b, i) => {
      const a = (i / beings.length) * Math.PI * 2 + Math.PI / 22;
      const rr = GR - 2.4;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const face = Math.atan2(-x, -z);
      q.setFromAxisAngle(new V(0, 1, 0), face);
      const side = new V(Math.cos(face), 0, -Math.sin(face));
      for (const sgn of [-1, 1]) pillars.setMatrixAt(i * 2 + (sgn > 0 ? 1 : 0), m4.compose(new V(x + side.x * 0.7 * sgn, 1.2, z + side.z * 0.7 * sgn), q, new V(1, 1, 1)));
      lintels.setMatrixAt(i, m4.compose(new V(x, 2.55, z), q, new V(1, 1, 1)));
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), new THREE.MeshBasicMaterial({ color: b.tint.clone().multiplyScalar(0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      orb.position.set(x, 1.3, z);
      orb.userData = { numeral: b.numeral, name: b.name, tint: b.tint.clone() };
      this.alcoveOrbs.push(orb);
      this.grotto.add(orb);
      // its numeral, carved above
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 64;
      const g = c.getContext("2d")!;
      g.fillStyle = "rgba(233,195,125,0.85)";
      g.font = "40px Georgia, serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(b.numeral, 64, 34);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 }));
      label.position.set(x - Math.sin(face) * 0.25, 3.05, z - Math.cos(face) * 0.25);
      label.rotation.y = face;
      this.grotto.add(label);
    });
    pillars.instanceMatrix.needsUpdate = lintels.instanceMatrix.needsUpdate = true;
    pillars.computeBoundingSphere();
    lintels.computeBoundingSphere();
    this.grotto.add(pillars, lintels);
    // the way out: a soft light in the wall, where you came in
    this.exitDoor = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    {
      const p = uv().sub(vec2(0.5, 0)).mul(vec2(2, 1)), r = length(p);
      this.exitDoor.colorNode = vec4(vec3(0.4, 0.78, 1.0).mul(smoothstep(1, 0.4, r).mul(smoothstep(0, 0.1, uv().y)).mul(0.45)), 1);
    }
    const exit = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4), this.exitDoor);
    const ea = Math.PI; // due west in the grotto (between two alcoves)
    exit.position.set(Math.cos(ea) * (GR - 0.6), 2, Math.sin(ea) * (GR - 0.6));
    exit.rotation.y = Math.PI / 2;
    this.grotto.add(exit);
    this.exitAt.copy(exit.position).add(O);
    // the centre's ring of stillness, and motes drifting in the still water
    this.centreRing.mesh.position.set(0, 0.08, 0);
    this.grotto.add(this.centreRing.mesh);
    const motes = new Float32Array(360 * 3);
    const R = rng(5);
    for (let i = 0; i < 360; i++) {
      const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * (GR - 2), y = 0.5 + R() * (GH - 3);
      motes.set([Math.cos(a) * rr, y, Math.sin(a) * rr], i * 3);
    }
    this.grotto.add(worldPoints(motes, { color: new THREE.Color(0.7, 0.9, 1.0), size: 0.07, opacity: 0.6 }).sprite);
  }

  /** The tablets and alcoves reflect what you have heard and whom you have met. */
  refresh(heard: Set<string>, met: (numeral: string) => boolean): void {
    this.tabletIds.forEach((id, i) => this.tablets.setColorAt(i, heard.has(id) ? this.col.setRGB(1.0, 0.78, 0.48).multiplyScalar(1.2) : this.col.setRGB(0.05, 0.05, 0.07)));
    if (this.tablets.instanceColor) this.tablets.instanceColor.needsUpdate = true;
    for (const o of this.alcoveOrbs) {
      const d = o.userData as { numeral: string; tint: THREE.Color };
      (o.material as THREE.MeshBasicMaterial).color.copy(d.tint).multiplyScalar(met(d.numeral) ? 1.1 : 0.1);
    }
  }

  /** A tap in the grotto: a tablet (its narration) or an alcove's light (its archetype). */
  pick(x: number, y: number, camera: THREE.Camera): { tablet: string } | { numeral: string } | null {
    if (!this.inside) return null;
    this.ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
    const hits = this.ray.intersectObjects([this.tablets, ...this.alcoveOrbs], false);
    const h = hits.find((k) => k.distance < 30);
    if (!h) return null;
    if (h.object === this.tablets && h.instanceId !== undefined) return { tablet: this.tabletIds[h.instanceId] };
    const d = h.object.userData as { numeral?: string };
    return d.numeral ? { numeral: d.numeral } : null;
  }

  /** A cave mouth the wanderer is swimming through, if any. */
  atMouth(p: THREE.Vector3): MouthSite | null {
    for (const m of this.mouths) if (m.portal.distanceTo(p) < 2.6) return m.site;
    return null;
  }

  /** Just outside a cave's mouth, facing out into the lake. */
  outside(m: MouthSite): { x: number; y: number; z: number; heading: number } {
    const x = m.x + Math.cos(m.face) * 6, z = m.z + Math.sin(m.face) * 6;
    return { x, z, y: Math.max(heightAt(x, z) + 2, heightAt(m.x, m.z) + 1.5), heading: Math.atan2(-Math.cos(m.face), -Math.sin(m.face)) };
  }

  /** Coming in: by the way in, looking toward the centre. */
  entry(): { x: number; y: number; z: number; heading: number } {
    const e = this.exitAt;
    const x = e.x + 4.5, z = e.z;
    return { x, y: ARCHIVE_ORIGIN.y + 2.2, z, heading: -Math.PI / 2 };
  }

  floorAt(): number {
    return ARCHIVE_ORIGIN.y;
  }

  /** Keep the wanderer within the dome; true when they swim back into the way out. */
  confine(p: THREE.Vector3): boolean {
    if (p.distanceTo(this.exitAt) < 1.8) return true;
    const l = this.local.copy(p).sub(ARCHIVE_ORIGIN);
    l.y = THREE.MathUtils.clamp(l.y, 0.25, GH - 2.5);
    const lim = GR * Math.sqrt(Math.max(0.05, 1 - ((l.y + 1.2) / GH) ** 2)) - 1.2;
    const d = Math.hypot(l.x, l.z);
    if (d > lim) {
      l.x *= lim / d;
      l.z *= lim / d;
    }
    p.copy(l).add(ARCHIVE_ORIGIN);
    return false;
  }

  /** Near the way out, inside. */
  nearExit(p: THREE.Vector3): boolean {
    return p.distanceTo(this.exitAt) < 7;
  }

  /** Each frame. Returns the ring of stillness the wanderer rests in, if any. */
  update(t: number, player: THREE.Vector3, inWater: boolean, near: boolean): Ring | null {
    this.group.visible = !this.inside && (inWater || near);
    this.uT.value = t;
    for (const m of this.mouths) (m.door as unknown as { timeU: { value: number } }).timeU.value = t;
    let inRing: Ring | null = null;
    const rings = this.inside ? [this.centreRing] : this.group.visible ? this.rings : [];
    for (const r of rings) {
      const d = Math.hypot(player.x - (this.inside ? ARCHIVE_ORIGIN.x : r.site.x), player.z - (this.inside ? ARCHIVE_ORIGIN.z : r.site.z));
      const floorY = this.inside ? ARCHIVE_ORIGIN.y : r.site.y;
      if (d < r.site.r && player.y - floorY < 7) inRing = r;
    }
    for (const r of [...this.rings, this.centreRing]) r.set(t, r.glow);
    const dome = this.grotto.children[0] as THREE.Mesh;
    (dome.material as unknown as { timeU: { value: number } }).timeU.value = t;
    return inRing;
  }

  /** A question to sit with, not the one just asked. */
  reflection(): string {
    let i = Math.floor(Math.random() * REFLECTIONS.length);
    if (i === this.lastReflection) i = (i + 1) % REFLECTIONS.length;
    this.lastReflection = i;
    return REFLECTIONS[i];
  }

  show(inside: boolean): void {
    this.inside = inside;
    this.grotto.visible = inside;
  }
}
void cos;
void max;
void WATER_Y;
