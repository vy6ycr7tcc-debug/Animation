/* The archetypes as the characters of Samuel's Ra tarot (Samuel: "we don't want stick man… we
   want the actual characters from the tarot cards"; "rely more on the format of animation you used
   for the monument"). Each is a body of thousands of points of light, like the vision of creation:
   the figure's own skin, and over it what the card's character wears and is: the nemes headcloth
   striped in gold and lapis, the broad collar, the linen robe and pleated kilt, the crowns (the
   white crown of the Chariot, the Hierophant's mitre, the Priestess's crescent and disc, the
   Empress's rays), cloaks and hoods, wings, horns; Death is a skeleton, the Star goes unclothed
   with her long hair. The deck is Egyptian (reference/IMG_0033–0056); the forms follow it.
   Every point is skinned to the figure's skeleton (its weights taken from the skin beneath it), so
   the recorded clip and each archetype's own movement (player/gestures.ts) move the whole
   character. Far off it is a loose, slowly turning pillar of motes; coming near, the motes swirl
   and gather into the figure, as the vision gathers each form; walking away, it loosens again.
   The archive leaves XII and XXI open: their light is drawn in bands, unfinished.
   Frame (bind pose, the model's own units): y up, the figure faces +z, its left is +x;
   floor ≈ −0.95, hips 0, chest 0.41, neck 0.59. */
import * as THREE from "three/webgpu";
import { MOBILE } from "../core/quality";
import { gpuUniforms, softPoints, spriteCloud, T, viewDepth, type SpriteCloud } from "../gpu/tsl";

type RGB = [number, number, number];
const key = (s: string) => s.replace(/[\s.:/[\]]/g, "");
const V = THREE.Vector3;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------------------------------------------------------------- colours of the deck */
const LINEN: RGB = [1.0, 0.94, 0.82];
const GOLD: RGB = [1.0, 0.76, 0.36];
const LAPIS: RGB = [0.36, 0.5, 1.0];
const TURQ: RGB = [0.35, 0.92, 0.85];
const CARNELIAN: RGB = [1.0, 0.46, 0.34];
const SILVER: RGB = [0.82, 0.88, 1.0];
const NIGHT: RGB = [0.42, 0.36, 0.78];
const WHITE: RGB = [1.0, 1.0, 1.0];
const BONE: RGB = [0.95, 0.92, 0.84];

/** The shared, per-archetype description: points in bind space and their skin. */
export interface FigureBind {
  n: number;
  q: Float32Array; // n × 3, bind space
  idx: Uint8Array; // n × 4 bones (the skeleton's order)
  w: Float32Array; // n × 4 weights
  col: Float32Array; // n × 3
  seed: Float32Array; // n
}

/* ---------------------------------------------------------------- the builder */
interface Skin {
  meshes: THREE.SkinnedMesh[];
  names: string[]; // canonical bone order (the first skeleton's)
  inv: THREE.Matrix4[];
}

function skinOf(model: THREE.Object3D): Skin | null {
  const meshes: THREE.SkinnedMesh[] = [];
  model.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && meshes.push(o as THREE.SkinnedMesh));
  if (!meshes.length) return null;
  const sk = meshes[0].skeleton;
  return { meshes, names: sk.bones.map((b) => key(b.name)), inv: sk.boneInverses };
}

class Builder {
  q: number[] = [];
  idx: number[] = [];
  w: number[] = [];
  col: number[] = [];
  /** The body's own points, for lending their skin to what is worn over them. */
  private body: { p: THREE.Vector3; idx: number[]; w: number[] }[] = [];
  /** Landmarks in bind space. */
  J: Record<string, THREE.Vector3> = {};
  floor = -0.95;
  head = new V(0, 0.77, -0.02);
  hr = 0.11;
  tint: RGB;
  open = false;

  constructor(
    private skin: Skin,
    private R: () => number,
    tint: RGB,
  ) {
    this.tint = tint;
    skin.names.forEach((n, i) => (this.J[n] = new V().setFromMatrixPosition(skin.inv[i].clone().invert())));
  }

  bone(name: string): number {
    return Math.max(0, this.skin.names.indexOf(key(name)));
  }

  /** Mix a deck colour toward the archetype's own. */
  hue(c: RGB, k = 0.35): RGB {
    return [c[0] * (1 - k) + this.tint[0] * k, c[1] * (1 - k) + this.tint[1] * k, c[2] * (1 - k) + this.tint[2] * k];
  }

  /** A point with explicit weights ([bone, weight]…), or the skin of the body nearest it. */
  put(p: THREE.Vector3, c: RGB, weights?: [string, number][]): void {
    // the archive leaves this one open: its light comes in bands, unfinished
    if (this.open && ((p.y * 14 + 20) % 1) < 0.34) return;
    let idx: number[], w: number[];
    if (weights) {
      idx = weights.map(([b]) => this.bone(b));
      w = weights.map(([, x]) => x);
    } else [idx, w] = this.nearest(p);
    while (idx.length < 4) idx.push(0), w.push(0);
    const s = w.reduce((a, b) => a + b, 0) || 1;
    this.q.push(p.x, p.y, p.z);
    this.idx.push(...idx.slice(0, 4));
    this.w.push(...w.slice(0, 4).map((x) => x / s));
    this.col.push(...c);
  }

  private nearest(p: THREE.Vector3): [number[], number[]] {
    const k = 7;
    const best: { d: number; i: number }[] = [];
    for (let i = 0; i < this.body.length; i += 2) {
      const d = this.body[i].p.distanceToSquared(p);
      if (best.length < k || d < best[best.length - 1].d) {
        best.push({ d, i });
        best.sort((a, b) => a.d - b.d);
        if (best.length > k) best.pop();
      }
    }
    const acc = new Map<number, number>();
    for (const { d, i } of best) {
      const b = this.body[i], f = 1 / (Math.sqrt(d) + 0.02);
      b.idx.forEach((bi, j) => acc.set(bi, (acc.get(bi) ?? 0) + b.w[j] * f));
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    return [top.map(([i]) => i), top.map(([, x]) => x)];
  }

  /** The figure's own skin: area-weighted points on its surface, each with its skin weights.
      `keep(p)` may thin it where something is worn over it. */
  skinPoints(n: number, c: RGB, keep: (p: THREE.Vector3) => number = () => 1, store = true): void {
    const { meshes, names } = this.skin;
    const tris: { m: number; a: number; b: number; c: number; area: number }[] = [];
    const pos: Float32Array[] = [], maps: number[][] = [];
    let total = 0;
    const va = new V(), vb = new V(), vc = new V();
    meshes.forEach((m, mi) => {
      const g = m.geometry as THREE.BufferGeometry;
      const pa = g.attributes.position as THREE.BufferAttribute;
      const arr = new Float32Array(pa.count * 3);
      for (let i = 0; i < pa.count; i++) {
        va.fromBufferAttribute(pa, i).applyMatrix4(m.bindMatrix);
        arr.set([va.x, va.y, va.z], i * 3);
      }
      pos.push(arr);
      maps.push(m.skeleton.bones.map((b) => Math.max(0, names.indexOf(key(b.name)))));
      const ix = g.index ? g.index.array : null;
      const count = ix ? ix.length / 3 : pa.count / 3;
      for (let t = 0; t < count; t++) {
        const a = ix ? ix[t * 3] : t * 3, b = ix ? ix[t * 3 + 1] : t * 3 + 1, cc = ix ? ix[t * 3 + 2] : t * 3 + 2;
        va.fromArray(arr, a * 3);
        vb.fromArray(arr, b * 3);
        vc.fromArray(arr, cc * 3);
        const area = vb.sub(va).cross(vc.sub(va)).length() * 0.5;
        total += area;
        tris.push({ m: mi, a, b, c: cc, area: total });
      }
    });
    for (const v of pos) for (let i = 1; i < v.length; i += 3) this.floor = Math.min(this.floor, v[i]);
    const R = this.R;
    let made = 0, tries = 0;
    while (made < n && tries++ < n * 6) {
      const r = R() * total;
      let lo = 0, hi = tris.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (tris[mid].area < r) lo = mid + 1;
        else hi = mid;
      }
      const t = tris[lo];
      let u = R(), v = R();
      if (u + v > 1) (u = 1 - u), (v = 1 - v);
      const P = pos[t.m];
      const p = new V().fromArray(P, t.a * 3).multiplyScalar(1 - u - v).add(vb.fromArray(P, t.b * 3).multiplyScalar(u)).add(vc.fromArray(P, t.c * 3).multiplyScalar(v));
      // the skin of the nearest corner
      const vi = u > 0.5 ? t.b : v > 0.5 ? t.c : t.a;
      const g = this.skin.meshes[t.m].geometry as THREE.BufferGeometry;
      const si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
      const idx = [0, 1, 2, 3].map((k) => maps[t.m][si.getComponent(vi, k)]);
      const w = [0, 1, 2, 3].map((k) => sw.getComponent(vi, k));
      if (store) this.body.push({ p, idx, w });
      if (R() > keep(p)) continue;
      if (this.open && ((p.y * 14 + 20) % 1) < 0.34) continue;
      made++;
      this.q.push(p.x, p.y, p.z);
      this.idx.push(...idx);
      this.w.push(...w);
      this.col.push(...c);
    }
  }

  /** The head: its centre and size, from the skin that moves with it. */
  measureHead(): void {
    const hb = this.bone("DEF-head");
    const box = new THREE.Box3();
    for (const b of this.body) if (b.idx[b.w.indexOf(Math.max(...b.w))] === hb) box.expandByPoint(b.p);
    if (!box.isEmpty()) {
      box.getCenter(this.head);
      this.hr = Math.max(0.06, (box.max.y - box.min.y) * 0.5);
    }
  }

  /* ---------- what the characters wear ---------- */

  /** A garment hanging round the body from `top` to `bottom`, widening; pleats in two colours,
      a band at the hem. `z0`: its centre front–back. */
  robe(n: number, top: number, bottom: number, r0: number, r1: number, a: RGB, b: RGB, pleats = 18, hem: RGB = GOLD, z0 = -0.03): void {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const v = R(), th = R() * Math.PI * 2;
      const y = top + (bottom - top) * v;
      const r = r0 + (r1 - r0) * Math.pow(v, 1.25);
      const ripple = 1 + Math.sin(th * pleats) * 0.035;
      const p = new V(Math.sin(th) * r * ripple, y, z0 + Math.cos(th) * r * 0.78 * ripple);
      const c = v > 0.94 ? hem : Math.cos(th * pleats) > 0.55 ? b : a;
      this.put(p, this.hue(c, 0.25));
    }
  }

  /** The broad collar on the shoulders: concentric bands of gold, lapis, carnelian, turquoise. */
  collar(n: number, outer = 0.21): void {
    const R = this.R, bands: RGB[] = [GOLD, LAPIS, CARNELIAN, TURQ, GOLD];
    const c0 = this.J[key("DEF-neck")].clone().setY(this.J[key("DEF-neck")].y - 0.035);
    for (let i = 0; i < n; i++) {
      const f = R(), r = 0.075 + (outer - 0.075) * f, th = R() * Math.PI * 2;
      const p = new V(c0.x + Math.sin(th) * r, c0.y - (r - 0.075) * 0.55, c0.z + Math.cos(th) * r * 0.72);
      this.put(p, this.hue(bands[Math.min(4, Math.floor(f * 5))], 0.15), [["DEF-spine.003", 0.75], ["DEF-neck", 0.25]]);
    }
  }

  /** A belt at the waist, and a pleated apron hanging before the kilt. */
  belt(n: number, apronTo = -0.4): void {
    const R = this.R;
    for (let i = 0; i < n * 0.4; i++) {
      const th = R() * Math.PI * 2, r = 0.16 + R() * 0.01;
      this.put(new V(Math.sin(th) * r, 0.05 + R() * 0.035, -0.03 + Math.cos(th) * r * 0.8), this.hue(GOLD, 0.1));
    }
    for (let i = 0; i < n * 0.6; i++) {
      const v = R(), u = (R() * 2 - 1) * (0.11 - v * 0.05);
      const p = new V(u, 0.04 + (apronTo - 0.04) * v, 0.12 + v * 0.03);
      this.put(p, this.hue(Math.floor((u + 0.2) * 40) % 2 ? GOLD : LINEN, 0.15));
    }
  }

  /** On the head, as a shell: `from`, the lowest direction.y it reaches; `face`, how far round
      the front it comes (−1 all the way, 1 not at all). */
  private shell(n: number, grow: number, from: number, face: number, c: (d: THREE.Vector3) => RGB): void {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const d = new V(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1);
      if (d.lengthSq() > 1 || d.lengthSq() < 0.01) {
        i--;
        continue;
      }
      d.normalize();
      if (d.y < from || d.z > face) {
        i--;
        continue;
      }
      this.put(this.head.clone().addScaledVector(d, this.hr * grow), this.hue(c(d), 0.15), [["DEF-head", 1]]);
    }
  }

  /** The nemes: the striped headcloth over the crown and back of the head, its two lappets down the
      front of the shoulders and a tail down the back. */
  nemes(n: number, a: RGB = GOLD, b: RGB = LAPIS): void {
    const stripe = (y: number): RGB => (Math.floor(y * 55 + 100) % 2 ? a : b);
    this.shell(Math.round(n * 0.5), 1.14, -0.15, 0.35, (d) => stripe(this.head.y + d.y * this.hr));
    const R = this.R, hy = this.head.y, hz = this.head.z, hr = this.hr;
    for (let i = 0; i < n * 0.4; i++) {
      const s = R() < 0.5 ? -1 : 1, v = R(), u = R() * 2 - 1;
      // flaring out beside the face, then falling flat over the chest
      const x = s * (hr * 1.05 + Math.sin(Math.min(1, v * 2.5) * Math.PI) * 0.035 - v * 0.02) + u * 0.028;
      const y = hy - hr * 0.1 - v * (hy - 0.42);
      const z = hz + 0.02 + v * 0.07;
      const f = Math.min(1, v * 1.5);
      this.put(new V(x, y, z), this.hue(stripe(y), 0.15), [["DEF-head", 1 - f], ["DEF-spine.003", f]]);
    }
    for (let i = 0; i < n * 0.1; i++) {
      const v = R(), u = (R() * 2 - 1) * (0.05 - v * 0.02);
      const y = hy - v * (hy - 0.4);
      this.put(new V(u, y, hz - hr * 1.05 - v * 0.06), this.hue(b, 0.15), [["DEF-head", 1 - v], ["DEF-spine.003", v]]);
    }
  }

  /** The short round wig (khat), to the jaw. */
  wig(n: number, c: RGB = NIGHT): void {
    this.shell(n, 1.1, -0.55, 0.25, () => c);
  }

  /** Long hair falling down the back. */
  hair(n: number, c: RGB = NIGHT, to = 0.2): void {
    this.shell(Math.round(n * 0.4), 1.07, -0.3, 0.2, () => c);
    const R = this.R, hy = this.head.y, hz = this.head.z;
    for (let i = 0; i < n * 0.6; i++) {
      const v = R(), u = (R() * 2 - 1) * (0.1 + v * 0.05);
      const y = hy - v * (hy - to);
      const f = Math.min(1, v * 1.3);
      this.put(new V(u, y, hz - this.hr * 0.95 - v * 0.08 - (1 - u * u * 60) * 0.005), this.hue(c, 0.2), [["DEF-head", 1 - f], ["DEF-spine.003", f]]);
    }
  }

  /** A shape of revolution standing on the head (the crowns). `r(v)` its radius at height v. */
  private onHead(n: number, h: number, r: (v: number) => number, c: (v: number, th: number) => RGB, lift = 0.75, zs = 1): void {
    const R = this.R, base = this.head.y + this.hr * lift;
    for (let i = 0; i < n; i++) {
      const v = R(), th = R() * Math.PI * 2, rr = r(v);
      this.put(new V(this.head.x + Math.sin(th) * rr, base + v * h, this.head.z + Math.cos(th) * rr * zs), this.hue(c(v, th), 0.12), [["DEF-head", 1]]);
    }
  }

  /** A feathered headdress (the Maya priests of the drowned city): a band round the brow, and a
      fan of long plumes rising up and back from the crown, each arcing over and tapering, from
      `base` at the quill to `tip` at the end. */
  plumes(n: number, feathers: number, len: number, base: RGB, mid: RGB, tip: RGB): void {
    const R = this.R, h = this.head, top = h.y + this.hr * 0.6;
    for (let i = 0; i < n * 0.15; i++) {
      const th = R() * Math.PI * 2;
      this.put(new V(h.x + Math.sin(th) * this.hr * 1.05, h.y + this.hr * (0.25 + R() * 0.2), h.z + Math.cos(th) * this.hr * 1.05), this.hue(base, 0.1), [["DEF-head", 1]]);
    }
    for (let i = 0; i < n * 0.85; i++) {
      const f = Math.floor(R() * feathers), fan = (f / Math.max(1, feathers - 1) - 0.5) * 2.2; // side to side
      const v = R(), w = (R() - 0.5) * 0.045 * (1 - v * 0.7);
      const a = 0.35 + v * 1.1; // rising, then arcing back
      const x = Math.sin(fan) * (0.04 + v * len * 0.55) + w * Math.cos(fan);
      const y = top + Math.sin(a) * v * len * 0.85;
      const z = h.z - 0.05 - Math.cos(fan) * 0.02 - (1 - Math.cos(a)) * v * len * 0.6;
      const c: RGB = v < 0.45 ? base : v < 0.85 ? mid : tip;
      this.put(new V(h.x + x, y, z), this.hue(c, 0.08), [["DEF-head", 1]]);
    }
  }

  /** The white crown of Upper Egypt: a tall bulb, a knob at its top. */
  hedjet(n: number): void {
    this.onHead(n, 0.36, (v) => this.hr * (1.0 - 0.72 * v) + Math.sin(v * Math.PI) * 0.015 + (v > 0.93 ? 0.02 : 0), () => WHITE, 0.5);
    this.uraeus(40);
  }

  /** The tall pointed mitre of the Hierophant, gold bands on linen. */
  mitre(n: number): void {
    this.onHead(n, 0.42, (v) => this.hr * 1.02 * Math.pow(1 - v, 0.8), (v, th) => (Math.abs(Math.sin(th)) < 0.12 || Math.floor(v * 6) % 3 === 0 ? GOLD : LINEN), 0.45, 0.5);
  }

  /** A crown of rays, as the Empress's (and a smaller one for Justice). */
  rays(n: number, h = 0.12): void {
    const R = this.R, base = this.head.y + this.hr * 0.55;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(R() * 14), th = (k / 14) * Math.PI * 2, v = R();
      const r = this.hr * (1.02 + v * 0.25);
      this.put(new V(this.head.x + Math.sin(th) * r, base + v * h, this.head.z + Math.cos(th) * r), this.hue(GOLD, 0.1), [["DEF-head", 1]]);
    }
    this.onHead(Math.round(n * 0.4), 0.03, () => this.hr * 1.02, () => GOLD, 0.5);
  }

  /** A disc between horns on the head (the Priestess's and the Moon's crescent, the sun of
      Temperance and Judgement): `crescent` curves up round it; `plumes` rise behind. */
  disc(n: number, r = 0.075, c: RGB = SILVER, crescent = true, plumes = false): void {
    const R = this.R, cy = this.head.y + this.hr + r + 0.03, cz = this.head.z - 0.01;
    for (let i = 0; i < n * 0.55; i++) {
      const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * r;
      this.put(new V(Math.cos(a) * rr, cy + Math.sin(a) * rr, cz), this.hue(c, 0.1), [["DEF-head", 1]]);
    }
    if (crescent)
      for (let i = 0; i < n * 0.45; i++) {
        const a = Math.PI * (1.15 + R() * 0.7), rr = r * 1.45 + R() * 0.012;
        this.put(new V(Math.cos(a) * rr, cy + 0.02 + Math.sin(a) * rr * -1 - 0.0, cz), this.hue(WHITE, 0.1), [["DEF-head", 1]]);
      }
    if (plumes)
      for (let i = 0; i < n * 0.5; i++) {
        const s = R() < 0.5 ? -1 : 1, v = R();
        this.put(new V(s * (0.02 + R() * 0.03), cy + v * 0.28, cz - 0.03), this.hue(Math.floor(v * 8) % 2 ? WHITE : GOLD, 0.1), [["DEF-head", 1]]);
      }
  }

  /** The cobra at the brow. */
  uraeus(n: number): void {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const v = R();
      const p = new V(Math.sin(v * 9) * 0.008, this.head.y + this.hr * (0.35 + v * 0.35), this.head.z + this.hr * (1.12 - v * 0.15) + Math.sin(v * Math.PI) * 0.02);
      this.put(p, this.hue(GOLD, 0.05), [["DEF-head", 1]]);
    }
  }

  /** The vulture crown: a cap whose wings fall down both sides of the head. */
  vulture(n: number): void {
    this.shell(Math.round(n * 0.45), 1.12, -0.1, 0.3, () => GOLD);
    const R = this.R;
    for (let i = 0; i < n * 0.55; i++) {
      const s = R() < 0.5 ? -1 : 1, v = R(), u = R();
      const y = this.head.y + this.hr * 0.4 - v * this.hr * 1.4;
      const p = new V(s * this.hr * (1.12 + v * 0.05), y, this.head.z + this.hr * (0.6 - u * 1.4));
      this.put(p, this.hue(Math.floor(v * 7) % 2 ? LAPIS : GOLD, 0.1), [["DEF-head", 1]]);
    }
  }

  /** Two horns curling up and out from the head (the one who holds the torch). */
  horns(n: number): void {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const s = R() < 0.5 ? -1 : 1, v = R(), a = v * 2.2;
      const r = 0.03 * (1 - v) + 0.006;
      const c = new V(s * (this.hr * 0.7 + Math.sin(a) * 0.12), this.head.y + this.hr * 0.6 + (1 - Math.cos(a)) * 0.1 + v * 0.05, this.head.z);
      const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(r);
      this.put(c.add(d), this.hue(CARNELIAN, 0.2), [["DEF-head", 1]]);
    }
  }

  /** A hood round the head, falling into the cloak. */
  hood(n: number, c: RGB): void {
    this.shell(n, 1.28, -0.7, 0.45, () => c);
  }

  /** A cloak from the shoulders down the back to the ground, open in front; `front` wraps it
      round the sides. */
  cloak(n: number, c: RGB, edge: RGB = GOLD, front = 0.15, top = 0.55): void {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, v = Math.pow(R(), 0.9);
      const y = top + (this.floor + 0.03 - top) * v;
      const half = 0.21 + v * 0.17;
      const x = u * half;
      const back = -0.13 - v * 0.1 - (1 - u * u) * 0.05;
      const z = back + Math.max(0, Math.abs(u) - 0.7) * (front + v * 0.25);
      const col = Math.abs(u) > 0.93 || v > 0.96 ? edge : c;
      this.put(new V(x, y, z), this.hue(col, 0.25));
    }
  }

  /** A veil from the crown of the head down the back to the ground. */
  veil(n: number, c: RGB): void {
    const R = this.R, top = this.head.y + this.hr;
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, v = R();
      const y = top + (this.floor + 0.05 - top) * v;
      const half = this.hr * 1.1 + v * 0.26;
      const z = this.head.z - this.hr * 1.05 * (1 - v) - v * 0.24 - (1 - u * u) * 0.04 + Math.max(0, Math.abs(u) - 0.75) * 0.25;
      const f = Math.min(1, v * 2.5);
      const p = new V(u * half, y, z);
      if (v < 0.35) this.put(p, this.hue(c, 0.3), [["DEF-head", 1 - f], ["DEF-spine.003", f]]);
      else this.put(p, this.hue(c, 0.3));
    }
  }

  /** Wings from the shoulder blades: fans of feathers, or a bat's ribs and skin. */
  wings(n: number, span: number, c: RGB, bat = false): void {
    const R = this.R, root = this.J[key("DEF-spine.003")].clone().add(new V(0, 0.05, -0.12));
    const feathers = 13;
    for (let i = 0; i < n; i++) {
      const s = R() < 0.5 ? -1 : 1;
      if (bat && R() < 0.55) {
        // the skin between five ribs, scalloped at its edge
        const a = 1.1 - R() * 1.9, v = Math.sqrt(R());
        const len = span * (0.75 + 0.25 * Math.cos(a * 2.5)) * (1 - 0.18 * Math.abs(Math.sin(a * 5 + 1)));
        const p = root.clone().add(new V(s * Math.cos(a) * len * v, Math.sin(a) * len * v * 0.8 + v * 0.12, -0.08 - v * 0.14));
        this.put(p, this.hue(c, 0.35), [["DEF-spine.003", 1]]);
        continue;
      }
      const k = Math.floor(R() * (bat ? 5 : feathers)), a = 1.1 - (k / ((bat ? 5 : feathers) - 1)) * 1.9, v = R();
      const len = span * (bat ? 1 : 0.55 + 0.45 * Math.cos((a - 0.35) * 1.2));
      const w = (R() - 0.5) * (bat ? 0.01 : 0.05 * Math.sin(v * Math.PI));
      const p = root.clone().add(new V(s * (Math.cos(a) * len * v + w * Math.sin(a)), Math.sin(a) * len * v * 0.8 + v * 0.12 + w * Math.cos(a), -0.08 - v * 0.14));
      this.put(p, this.hue(bat ? CARNELIAN : v > 0.8 ? WHITE : c, 0.3), [["DEF-spine.003", 1]]);
    }
  }

  /** A tail from the base of the spine, curling on the ground. */
  tail(n: number): void {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const v = R(), a = v * 3.6;
      const p = new V(Math.sin(a) * 0.12 * v, -0.05 - v * 0.8, -0.12 - v * 0.25 - Math.cos(a) * 0.05);
      this.put(p.add(new V(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.025 * (1 - v) + 0.008)), this.hue(CARNELIAN, 0.3));
    }
  }

  /** Death: a skeleton of light in place of the body: long bones between the joints, the ribs,
      the pelvis and the skull. */
  skeleton(n: number): void {
    const R = this.R, J = (b: string) => this.J[key(b)];
    const segs: [string, string, number][] = [
      ["DEF-hips", "DEF-spine.003", 0.006], ["DEF-spine.003", "DEF-neck", 0.006], ["DEF-neck", "DEF-head", 0.005],
      ["DEF-upper_arm.L", "DEF-forearm.L", 0.012], ["DEF-forearm.L", "DEF-hand.L", 0.01], ["DEF-upper_arm.R", "DEF-forearm.R", 0.012], ["DEF-forearm.R", "DEF-hand.R", 0.01],
      ["DEF-thigh.L", "DEF-shin.L", 0.016], ["DEF-shin.L", "DEF-foot.L", 0.013], ["DEF-foot.L", "DEF-toe.L", 0.012],
      ["DEF-thigh.R", "DEF-shin.R", 0.016], ["DEF-shin.R", "DEF-foot.R", 0.013], ["DEF-foot.R", "DEF-toe.R", 0.012],
    ];
    const lens = segs.map(([a, b]) => J(a).distanceTo(J(b)));
    const tot = lens.reduce((x, y) => x + y, 0);
    const nb = Math.round(n * 0.45);
    for (let i = 0; i < nb; i++) {
      let r = R() * tot, k = 0;
      while (r > lens[k] && k < lens.length - 1) r -= lens[k++];
      const [a, b, th] = segs[k], v = r / lens[k];
      // a long bone: thin in the shaft, swelling at the joints
      const t2 = th * (1 + 1.4 * Math.pow(Math.abs(v - 0.5) * 2, 4));
      const d = new V(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(t2);
      this.put(J(a).clone().lerp(J(b), v).add(d), this.hue(BONE, 0.15), [[a, 1]]);
    }
    // the hands' fingers, spread
    for (const s of ["L", "R"]) {
      const h = J(`DEF-hand.${s}`), sg = s === "L" ? 1 : -1;
      for (let i = 0; i < n * 0.03; i++) {
        const f = Math.floor(R() * 5), v = R();
        this.put(h.clone().add(new V(sg * (0.02 + v * 0.1), 0, (f - 2) * 0.014)), this.hue(BONE, 0.15), [[`DEF-hand.${s}`, 1]]);
      }
    }
    // the ribs: arcs round the chest, open at the breastbone
    const chest = J("DEF-spine.003");
    for (let i = 0; i < n * 0.2; i++) {
      const k = Math.floor(R() * 7), y = chest.y - 0.02 - k * 0.035, a = (R() * 2 - 1) * Math.PI * 0.9;
      const rx = 0.11 - k * 0.004, rz = 0.08;
      this.put(new V(Math.sin(a) * rx, y - Math.cos(a) * 0.015, chest.z - 0.01 + Math.cos(a) * rz * (a > 0 ? 1 : 1)), this.hue(BONE, 0.15), [["DEF-spine.003", 0.8], ["DEF-hips", 0.2]]);
    }
    // collarbones and shoulder blades
    for (let i = 0; i < n * 0.04; i++) {
      const s = R() < 0.5 ? -1 : 1, v = R();
      this.put(new V(s * v * 0.19, chest.y + 0.12 - v * 0.01, chest.z + 0.05 - v * 0.03), this.hue(BONE, 0.15), [["DEF-spine.003", 1]]);
    }
    // the pelvis: a basin
    const hips = J("DEF-hips");
    for (let i = 0; i < n * 0.08; i++) {
      const a = R() * Math.PI * 2, v = R();
      this.put(new V(Math.sin(a) * (0.12 - v * 0.04), hips.y + 0.05 - v * 0.09, hips.z + Math.cos(a) * 0.07), this.hue(BONE, 0.15), [["DEF-hips", 1]]);
    }
    // the skull: a shell with the eyes and the nose left dark, and a jaw
    for (let i = 0; i < n * 0.2; i++) {
      const d = new V(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1);
      if (d.lengthSq() > 1 || d.lengthSq() < 0.01) {
        i--;
        continue;
      }
      d.normalize();
      const eye = (x: number) => Math.hypot(d.x - x, d.y - 0.05, d.z - 0.9) < 0.3;
      if (eye(0.35) || eye(-0.35) || Math.hypot(d.x, d.y + 0.3, d.z - 0.95) < 0.15) continue;
      if (d.y < -0.35 && d.z < 0.2) continue;
      const p = this.head.clone().addScaledVector(d, this.hr * 0.95);
      if (d.y < -0.4) p.y -= 0.02;
      this.put(p, this.hue(BONE, 0.1), [["DEF-head", 1]]);
    }
  }

  result(seedR: () => number): FigureBind {
    const n = this.q.length / 3;
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) seed[i] = seedR();
    return { n, q: new Float32Array(this.q), idx: new Uint8Array(this.idx), w: new Float32Array(this.w), col: new Float32Array(this.col), seed };
  }
}

/* ---------------------------------------------------------------- each character */
type Recipe = (b: Builder, N: number) => void;
const under = (y: number) => (p: THREE.Vector3) => (p.y < y ? 0.3 : 1);

const RECIPES: Record<string, Recipe> = {
  // the angel of the world after the veil (scenes/afterVeil): a being of warm gold light-dust,
  // its body and a long robe falling from the shoulders, a veil of paler light from the head;
  // no wings (the brief: only if they come of the flow, and they do not here)
  ANGEL: (b, N) => {
    b.skinPoints(N * 0.42, b.hue([1.0, 0.82, 0.5], 0.4), under(0.35));
    b.measureHead();
    b.veil(N * 0.14, [1.0, 0.93, 0.78]);
    b.robe(N * 0.36, 0.44, b.floor + 0.02, 0.14, 0.34, [1.0, 0.8, 0.46], [1.0, 0.9, 0.7], 26, [1.0, 0.72, 0.36]);
    b.collar(N * 0.08, 0.2);
  },
  // the drowned cities' keepers (world/ancient): never archetypes, only presences
  // the wanderers of Atlantis: tall, robed in a garment cut in few broad planes (pleats six), a
  // hood of pale light, crystal-blue at the collar and hem
  ATLANTEAN: (b, N) => {
    b.skinPoints(N * 0.3, b.hue([0.75, 0.86, 1.0], 0.3), under(0.4));
    b.measureHead();
    b.hood(N * 0.12, [0.82, 0.9, 1.0]);
    b.collar(N * 0.07, 0.19);
    b.robe(N * 0.42, 0.46, b.floor + 0.01, 0.15, 0.3, [0.42, 0.56, 0.86], [0.78, 0.88, 1.0], 6, [0.62, 0.9, 1.0]);
    b.cloak(N * 0.09, [0.5, 0.64, 0.95], [0.7, 0.95, 1.0]);
  },
  // the still presence on the acropolis: a memorial more than a character; a long veil, a broad
  // robe, a pale disc behind the head
  ATLANTEAN_PRESENCE: (b, N) => {
    b.skinPoints(N * 0.3, b.hue([0.9, 0.94, 1.0], 0.3), under(0.4));
    b.measureHead();
    b.disc(N * 0.06, 0.1, [0.8, 0.9, 1.0], false);
    b.veil(N * 0.2, [0.85, 0.92, 1.0]);
    b.robe(N * 0.4, 0.44, b.floor + 0.01, 0.14, 0.38, [0.62, 0.74, 0.98], [0.9, 0.95, 1.0], 14, [0.75, 0.9, 1.0]);
  },
  // the Maya priests: a feathered headdress, a jade collar, a wrapped garment in deep green
  MAYA_PRIEST: (b, N) => {
    b.skinPoints(N * 0.36, b.hue([0.85, 0.72, 0.5], 0.3), under(0.35));
    b.measureHead();
    b.plumes(N * 0.2, 9, 0.62, [0.3, 0.85, 0.62], [0.2, 0.62, 0.42], [1.0, 0.78, 0.36]);
    b.collar(N * 0.08, 0.2);
    b.robe(N * 0.28, 0.4, -0.62, 0.15, 0.24, [0.22, 0.52, 0.4], [0.32, 0.7, 0.55], 10, [1.0, 0.76, 0.36]);
    b.belt(N * 0.08, -0.3);
  },
  // I, the Magician: nemes and uraeus, broad collar, the long linen robe and a gold apron
  I: (b, N) => {
    b.skinPoints(N * 0.38, b.hue(LINEN, 0.5), under(0.4));
    b.measureHead();
    b.nemes(N * 0.16);
    b.uraeus(N * 0.01);
    b.collar(N * 0.1);
    b.robe(N * 0.25, 0.42, b.floor + 0.02, 0.14, 0.25, LINEN, SILVER, 22);
    b.belt(N * 0.1, -0.5);
  },
  // II, the High Priestess: the crescent and disc, a veil to the ground, a close linen sheath
  II: (b, N) => {
    b.skinPoints(N * 0.34, b.hue(LINEN, 0.5), under(0.35));
    b.measureHead();
    b.wig(N * 0.06, NIGHT);
    b.disc(N * 0.07, 0.07, SILVER, true);
    b.veil(N * 0.18, SILVER);
    b.collar(N * 0.08, 0.19);
    b.robe(N * 0.27, 0.4, b.floor + 0.02, 0.13, 0.2, LINEN, SILVER, 30, SILVER);
  },
  // III, the Empress: a crown of rays, the collar, a long striped skirt
  III: (b, N) => {
    b.skinPoints(N * 0.4, b.hue(LINEN, 0.5), under(0.05));
    b.measureHead();
    b.hair(N * 0.08, NIGHT, 0.35);
    b.rays(N * 0.08);
    b.collar(N * 0.1);
    b.robe(N * 0.3, 0.06, b.floor + 0.02, 0.17, 0.27, TURQ, GOLD, 14);
    b.belt(N * 0.04, 0.02);
  },
  // IV, the Emperor: the round wig with the cobra, collar, a pleated tunic to the knee, a cloak
  IV: (b, N) => {
    b.skinPoints(N * 0.36, b.hue(LINEN, 0.5), under(-0.4));
    b.measureHead();
    b.wig(N * 0.08, LAPIS);
    b.uraeus(N * 0.01);
    b.collar(N * 0.1);
    b.robe(N * 0.2, 0.44, -0.42, 0.15, 0.24, GOLD, LINEN, 26);
    b.belt(N * 0.08, -0.38);
    b.cloak(N * 0.17, CARNELIAN, GOLD, 0.1);
  },
  // V, the Hierophant: the tall mitre, a heavy cloak to the ground over a long robe
  V: (b, N) => {
    b.skinPoints(N * 0.28, b.hue(LINEN, 0.5), under(0.3));
    b.measureHead();
    b.mitre(N * 0.12);
    b.robe(N * 0.25, 0.46, b.floor + 0.02, 0.15, 0.26, LINEN, GOLD, 10);
    b.cloak(N * 0.3, NIGHT, GOLD, 0.35);
    b.collar(N * 0.05, 0.16);
  },
  // VI, the Lovers: the round wig, collar and a long linen robe
  VI: (b, N) => {
    b.skinPoints(N * 0.4, b.hue(LINEN, 0.5), under(0.35));
    b.measureHead();
    b.wig(N * 0.1, NIGHT);
    b.collar(N * 0.1);
    b.robe(N * 0.32, 0.4, b.floor + 0.02, 0.14, 0.24, LINEN, CARNELIAN, 18);
    b.belt(N * 0.05, 0.0);
  },
  // VII, the Chariot: the white crown, a corselet of gold, kilt and apron
  VII: (b, N) => {
    b.skinPoints(N * 0.38, b.hue(LINEN, 0.5), under(-0.4));
    b.measureHead();
    b.hedjet(N * 0.12);
    b.collar(N * 0.1, 0.23);
    b.robe(N * 0.12, 0.42, 0.08, 0.15, 0.16, GOLD, LAPIS, 40, GOLD);
    b.robe(N * 0.16, 0.06, -0.4, 0.17, 0.25, LINEN, GOLD, 30);
    b.belt(N * 0.1, -0.44);
  },
  // VIII, Strength: the vulture crown, a patterned sheath to the ground
  VIII: (b, N) => {
    b.skinPoints(N * 0.38, b.hue(LINEN, 0.5), under(0.35));
    b.measureHead();
    b.vulture(N * 0.13);
    b.collar(N * 0.08, 0.18);
    b.robe(N * 0.36, 0.38, b.floor + 0.02, 0.13, 0.2, GOLD, NIGHT, 8, GOLD);
  },
  // IX, the Hermit: a hood, a cloak to the ground, a plain robe
  IX: (b, N) => {
    b.skinPoints(N * 0.3, b.hue(LINEN, 0.5), under(0.4));
    b.measureHead();
    b.hood(N * 0.14, NIGHT);
    b.robe(N * 0.22, 0.46, b.floor + 0.02, 0.15, 0.25, SILVER, NIGHT, 8, SILVER);
    b.cloak(N * 0.34, NIGHT, SILVER, 0.3);
  },
  // X, the Wheel: the round wig, collar, kilt
  X: (b, N) => {
    b.skinPoints(N * 0.5, b.hue(LINEN, 0.5), under(-0.4));
    b.measureHead();
    b.wig(N * 0.1, NIGHT);
    b.collar(N * 0.12);
    b.robe(N * 0.18, 0.06, -0.38, 0.17, 0.24, LINEN, GOLD, 30);
    b.belt(N * 0.1, -0.36);
  },
  // XI, Justice: a small crown of rays, the collar, a long robe and a mantle
  XI: (b, N) => {
    b.skinPoints(N * 0.32, b.hue(LINEN, 0.5), under(0.35));
    b.measureHead();
    b.wig(N * 0.06, NIGHT);
    b.rays(N * 0.06, 0.07);
    b.collar(N * 0.09);
    b.robe(N * 0.28, 0.42, b.floor + 0.02, 0.15, 0.25, LINEN, CARNELIAN, 16);
    b.cloak(N * 0.19, CARNELIAN, GOLD, 0.2);
  },
  // XII, the Hanged Man (open): the round wig, a tunic, bands at the waist
  XII: (b, N) => {
    b.open = true;
    b.skinPoints(N * 0.55, b.hue(LINEN, 0.5), under(-0.3));
    b.measureHead();
    b.wig(N * 0.1, NIGHT);
    b.robe(N * 0.25, 0.42, -0.3, 0.15, 0.2, LINEN, TURQ, 24);
    b.belt(N * 0.1, 0.0);
  },
  // XIII, Death: a skeleton
  XIII: (b, N) => {
    b.skinPoints(N * 0.25, b.hue(LINEN, 0.5), () => 0); // the skin is measured, not drawn
    b.measureHead();
    b.skeleton(N);
  },
  // XIV, Temperance: the sun disc with plumes, great wings, a long robe
  XIV: (b, N) => {
    b.skinPoints(N * 0.3, b.hue(LINEN, 0.5), under(0.35));
    b.measureHead();
    b.hair(N * 0.07, NIGHT, 0.4);
    b.disc(N * 0.07, 0.07, GOLD, false, true);
    b.wings(N * 0.28, 0.85, LINEN);
    b.robe(N * 0.28, 0.42, b.floor + 0.02, 0.14, 0.26, LINEN, TURQ, 16);
  },
  // XV, the one who holds the torch: horns, the bat's wings, a tail; the body dark
  XV: (b, N) => {
    b.skinPoints(N * 0.46, b.hue(NIGHT, 0.4));
    b.measureHead();
    b.horns(N * 0.08);
    b.wings(N * 0.34, 1.1, NIGHT, true);
    b.tail(N * 0.1);
  },
  // XVI, the Tower: the round wig, kilt; open to the lightning
  XVI: (b, N) => {
    b.skinPoints(N * 0.55, b.hue(LINEN, 0.5), under(-0.4));
    b.measureHead();
    b.wig(N * 0.1, NIGHT);
    b.robe(N * 0.22, 0.06, -0.4, 0.17, 0.24, LINEN, SILVER, 30);
    b.belt(N * 0.1, -0.36);
  },
  // XVII, the Star: unclothed, her long hair down her back
  XVII: (b, N) => {
    b.skinPoints(N * 0.8, b.hue(LINEN, 0.55));
    b.measureHead();
    b.hair(N * 0.2, NIGHT, 0.15);
  },
  // XVIII, the Moon: the crescent, a veil, a silver robe
  XVIII: (b, N) => {
    b.skinPoints(N * 0.34, b.hue(SILVER, 0.5), under(0.35));
    b.measureHead();
    b.wig(N * 0.05, NIGHT);
    b.disc(N * 0.06, 0.06, SILVER, true);
    b.veil(N * 0.2, SILVER);
    b.robe(N * 0.35, 0.4, b.floor + 0.02, 0.13, 0.24, SILVER, NIGHT, 12, SILVER);
  },
  // XIX, the Sun: the round wig, collar, kilt
  XIX: (b, N) => {
    b.skinPoints(N * 0.5, b.hue(LINEN, 0.5), under(-0.4));
    b.measureHead();
    b.wig(N * 0.1, NIGHT);
    b.uraeus(N * 0.01);
    b.collar(N * 0.12);
    b.robe(N * 0.17, 0.06, -0.38, 0.17, 0.25, LINEN, GOLD, 30);
    b.belt(N * 0.1, -0.36);
  },
  // XX, Judgement: the one who calls, winged, a sun on the head, a long robe
  XX: (b, N) => {
    b.skinPoints(N * 0.3, b.hue(LINEN, 0.5), under(0.35));
    b.measureHead();
    b.hair(N * 0.06, NIGHT, 0.4);
    b.disc(N * 0.06, 0.06, GOLD, false);
    b.wings(N * 0.3, 0.95, SILVER);
    b.robe(N * 0.28, 0.42, b.floor + 0.02, 0.14, 0.26, LINEN, SILVER, 16);
  },
  // XXI, the World (open): long hair, collar, a long robe
  XXI: (b, N) => {
    b.open = true;
    b.skinPoints(N * 0.4, b.hue(LINEN, 0.5), under(0.35));
    b.measureHead();
    b.hair(N * 0.12, NIGHT, 0.3);
    b.collar(N * 0.1);
    b.robe(N * 0.38, 0.4, b.floor + 0.02, 0.14, 0.26, LINEN, TURQ, 20);
  },
  // XXII, the Choice: the round wig, a tunic over one shoulder to the knee, a belt
  XXII: (b, N) => {
    b.skinPoints(N * 0.5, b.hue(LINEN, 0.5), under(-0.4));
    b.measureHead();
    b.wig(N * 0.1, NIGHT);
    b.robe(N * 0.28, 0.44, -0.42, 0.15, 0.23, LINEN, SILVER, 10);
    b.belt(N * 0.12, 0.0);
  },
};

const cache = new Map<string, FigureBind>();
/** The points of an archetype's character (made once, shared by every place it stands). */
export function figureBind(numeral: string, tint: RGB, model: THREE.Object3D): FigureBind | null {
  const hit = cache.get(numeral);
  if (hit) return hit;
  const skin = skinOf(model);
  const recipe = RECIPES[numeral];
  if (!skin || !recipe) return null;
  const seed = [...numeral].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const b = new Builder(skin, rng(seed), tint);
  recipe(b, MOBILE ? 3000 : 4600);
  const out = b.result(rng(seed + 1));
  cache.set(numeral, out);
  return out;
}

/* ---------------------------------------------------------------- one standing figure */
export class Figure {
  cloud: SpriteCloud;
  /** 0 a loose pillar of motes, 1 the character whole. */
  formK = 0;
  private bones: THREE.Bone[] = [];
  private inv: THREE.Matrix4[];
  private M: Float32Array;
  private pos: Float32Array;
  private uGlow = T.uniform(1);
  private uT = T.uniform(0);
  private uScan = T.uniform(0);
  private tmp = new THREE.Matrix4();
  private rootInv = new THREE.Matrix4();
  private height: number;

  constructor(
    private bind: FigureBind,
    model: THREE.Object3D,
    private root: THREE.Object3D,
    tint: RGB,
  ) {
    const skin = skinOf(model)!;
    const byName = new Map<string, THREE.Bone>();
    model.traverse((o) => (o as THREE.Bone).isBone && byName.set(key(o.name), o as THREE.Bone));
    this.bones = skin.names.map((n) => byName.get(n)!);
    this.inv = skin.inv;
    this.M = new Float32Array(this.bones.length * 16);
    const mat = softPoints();
    this.cloud = spriteCloud(bind.n, { position: 3, aCol: 3, aSeed: 1 }, mat);
    this.pos = this.cloud.attrs.position.array as Float32Array;
    (this.cloud.attrs.aCol.array as Float32Array).set(bind.col);
    (this.cloud.attrs.aSeed.array as Float32Array).set(bind.seed);
    this.height = 1.7;
    {
      const { clamp, float, length, max, pointUV, sin, smoothstep, exp, vec4, vec3, mix } = T;
      const { position, aCol, aSeed } = this.cloud.nodes;
      const worldPos = T.modelWorldMatrix.mul(vec4(position, 1)).xyz;
      mat.sizeNode = clamp(gpuUniforms.px.mul(0.022).mul(aSeed.mul(0.8).add(0.6)).div(max(viewDepth(worldPos), 0.4)), float(1).div(gpuUniforms.dpr), 6);
      const flick = sin(this.uT.mul(17).add(aSeed.mul(97))).mul(0.12).add(0.88);
      const scan = exp(position.y.sub(this.uScan).mul(position.y.sub(this.uScan)).mul(-9)).mul(0.6);
      const soft = smoothstep(0.5, 0.05, length(pointUV.sub(0.5)));
      // the archetype's own colour runs a little through everything it wears
      const c = mix(aCol, vec3(tint[0], tint[1], tint[2]), 0.12);
      mat.colorNode = vec4(c.mul(soft).mul(flick).mul(scan.add(0.7)).mul(this.uGlow).mul(0.5), 1);
    }
    this.cloud.sprite.frustumCulled = false;
    root.add(this.cloud.sprite);
  }

  /** Each frame while it is in sight. `near`: gathered into the character (else a pillar). */
  update(dt: number, t: number, near: boolean, glow: number, reduced: boolean): void {
    this.formK += ((near ? 1 : 0) - this.formK) * Math.min(1, dt * (near ? 0.7 : 0.35));
    this.uGlow.value = glow;
    this.uT.value = t;
    this.uScan.value = ((t * 0.55) % (this.height + 1.4)) - 0.7;
    const b = this.bind, P = this.pos, M = this.M, q = b.q, idx = b.idx, w = b.w, seed = b.seed;
    this.rootInv.copy(this.root.matrixWorld).invert();
    this.bones.forEach((bone, i) => {
      this.tmp.multiplyMatrices(this.rootInv, bone.matrixWorld).multiply(this.inv[i]);
      M.set(this.tmp.elements, i * 16);
    });
    const form = this.formK;
    const spin = t * (reduced ? 0.08 : 0.22);
    for (let i = 0; i < b.n; i++) {
      const j = i * 3, k = i * 4;
      const qx = q[j], qy = q[j + 1], qz = q[j + 2];
      let x = 0, y = 0, z = 0;
      for (let m = 0; m < 4; m++) {
        const ww = w[k + m];
        if (ww === 0) continue;
        const o = idx[k + m] * 16;
        x += ww * (M[o] * qx + M[o + 4] * qy + M[o + 8] * qz + M[o + 12]);
        y += ww * (M[o + 1] * qx + M[o + 5] * qy + M[o + 9] * qz + M[o + 13]);
        z += ww * (M[o + 2] * qx + M[o + 6] * qy + M[o + 10] * qz + M[o + 14]);
      }
      const s = seed[i];
      // each mote sets off on its own time, the far ones last
      const e0 = Math.min(1, Math.max(0, (form - s * 0.4) / 0.6));
      const e = e0 * e0 * (3 - 2 * e0);
      if (e < 0.999) {
        // loose: a slowly turning pillar of motes where it stands
        const a = s * 47.1 + spin * (0.6 + s), r = 0.25 + ((s * 13.7) % 1) * 0.55;
        const py = ((s * 7.31) % 1) * 2.3 + Math.sin(t * 0.4 + s * 20) * 0.08;
        const px = Math.cos(a) * r, pz = Math.sin(a) * r;
        // between the two, a vortex: turned about the axis and drawn outward
        const sw = Math.sin(e * Math.PI);
        const ang = sw * (1.3 + s), c = Math.cos(ang), sn = Math.sin(ang);
        let bx = px + (x - px) * e, bz = pz + (z - pz) * e;
        const out = 1 + sw * 0.35;
        const nx = (bx * c - bz * sn) * out;
        bz = (bx * sn + bz * c) * out;
        bx = nx;
        x = bx;
        y = py + (y - py) * e + sw * (s - 0.4) * 0.5;
        z = bz;
      } else if (!reduced) {
        // whole: a faint quiver in each mote
        x += Math.sin(t * 1.7 + s * 40) * 0.004;
        y += Math.sin(t * 1.3 + s * 60) * 0.004;
        z += Math.cos(t * 1.5 + s * 50) * 0.004;
      }
      P[j] = x;
      P[j + 1] = y;
      P[j + 2] = z;
    }
    this.cloud.attrs.position.needsUpdate = true;
  }
}
