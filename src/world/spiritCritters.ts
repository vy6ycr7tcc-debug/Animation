/* Small spirits of light: rabbits and squirrels (the owner: "also fluid and beautiful squirrels,
   rabbits", after the horses became spirits). There is no CC0 animated rabbit or squirrel to load,
   so each is drawn here as the horses are, a body of motes, on a form of soft rounded volumes
   (body, haunches, head, ears, paws, a bushy tail of overlapping puffs), never a stiff shape: each
   mote lies on the outer skin of the volumes, so the animal reads as one round, furred outline.
   They move by their own gaits, written as curves of time: the rabbit hops (haunches driving, the
   back arching and stretching, ears laid back in the air) and sits between hops, nose and ears
   twitching, now and then rising up to look; the squirrel darts in quick bounds, its tail streaming
   flat, then sits up with its paws to its chest and its tail curled high behind, flicking.
   Like the horses they come as spirits: motes gather out of the air into a small animal near you,
   it lives a while, and it loosens back into rising motes. Rushing at one sends it bounding off as
   it fades; in stillness they come near and sit. Squirrels keep to the trees. */
import * as THREE from "three/webgpu";
import { gpuUniforms, softDot, softPoints, pointR, spriteCloud, T, viewDepth, type SpriteCloud } from "../gpu/tsl";
import { groundKind, heightAt, WATER_Y } from "./terrain";

type V3 = [number, number, number];
type Kind = "rabbit" | "squirrel";

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** One soft volume of the body: an ellipsoid at `c` with radii `r`, turned about x by `tilt`,
    moved about `pivot` by its pose, under `parent`'s pose. `fuzz`: fur standing off the skin. */
interface Part {
  name: string;
  c: V3;
  r: V3;
  tilt?: number;
  pivot?: V3;
  parent?: string;
  fuzz?: number;
  /** Share of the motes, beyond its area (faces and ears read best a little denser). */
  w?: number;
}

/* The forms, in metres; the animal faces −z, y up, x its left. */
const RABBIT: Part[] = [
  { name: "body", c: [0, 0.16, 0.02], r: [0.105, 0.11, 0.17], tilt: -0.12, fuzz: 0.006 },
  { name: "haunchL", c: [0.07, 0.13, 0.09], r: [0.055, 0.085, 0.09], pivot: [0.07, 0.13, 0.08] },
  { name: "haunchR", c: [-0.07, 0.13, 0.09], r: [0.055, 0.085, 0.09], pivot: [-0.07, 0.13, 0.08] },
  { name: "footL", c: [0.07, 0.022, 0.05], r: [0.028, 0.022, 0.1], pivot: [0.07, 0.11, 0.1], parent: "haunchL" },
  { name: "footR", c: [-0.07, 0.022, 0.05], r: [0.028, 0.022, 0.1], pivot: [-0.07, 0.11, 0.1], parent: "haunchR" },
  { name: "foreL", c: [0.045, 0.06, -0.1], r: [0.022, 0.06, 0.024], pivot: [0.045, 0.13, -0.1] },
  { name: "foreR", c: [-0.045, 0.06, -0.1], r: [0.022, 0.06, 0.024], pivot: [-0.045, 0.13, -0.1] },
  { name: "head", c: [0, 0.255, -0.17], r: [0.062, 0.066, 0.085], tilt: 0.35, pivot: [0, 0.2, -0.12], w: 1.3 },
  { name: "earL", c: [0.036, 0.385, -0.135], r: [0.019, 0.108, 0.036], tilt: -0.25, pivot: [0.028, 0.3, -0.16], parent: "head", w: 1.4 },
  { name: "earR", c: [-0.036, 0.385, -0.135], r: [0.019, 0.108, 0.036], tilt: -0.25, pivot: [-0.028, 0.3, -0.16], parent: "head", w: 1.4 },
  { name: "tail", c: [0, 0.19, 0.185], r: [0.045, 0.045, 0.04], fuzz: 0.014, w: 1.5 },
];

/** The squirrel's tail rises behind in an S of six puffs; `curl` 1 high and curled, 0 streaming flat. */
function tailAt(i: number, curl: number, flick: number): V3 {
  const u = i / 5;
  // flat: straight back and a little up; curled: up the back and over at the tip
  const fx = 0, fy = 0.12 + u * 0.05, fz = 0.12 + u * 0.32;
  const a = u * 2.2 + flick * u * u;
  const cy = 0.12 + Math.sin(a) * 0.2 + u * 0.08, cz = 0.13 + (1 - Math.cos(a)) * 0.06 - u * u * 0.08;
  return [fx, fy + (cy - fy) * curl, fz + (cz - fz) * curl];
}
const SQUIRREL: Part[] = [
  { name: "body", c: [0, 0.11, 0], r: [0.058, 0.064, 0.11], tilt: -0.15, fuzz: 0.006, w: 1.3 },
  { name: "haunchL", c: [0.04, 0.09, 0.055], r: [0.034, 0.05, 0.05], pivot: [0.04, 0.09, 0.05] },
  { name: "haunchR", c: [-0.04, 0.09, 0.055], r: [0.034, 0.05, 0.05], pivot: [-0.04, 0.09, 0.05] },
  { name: "footL", c: [0.04, 0.016, 0.035], r: [0.017, 0.014, 0.05], pivot: [0.04, 0.08, 0.06], parent: "haunchL" },
  { name: "footR", c: [-0.04, 0.016, 0.035], r: [0.017, 0.014, 0.05], pivot: [-0.04, 0.08, 0.06], parent: "haunchR" },
  { name: "foreL", c: [0.03, 0.04, -0.07], r: [0.014, 0.04, 0.015], pivot: [0.03, 0.09, -0.07] },
  { name: "foreR", c: [-0.03, 0.04, -0.07], r: [0.014, 0.04, 0.015], pivot: [-0.03, 0.09, -0.07] },
  { name: "head", c: [0, 0.165, -0.12], r: [0.042, 0.044, 0.056], tilt: 0.3, pivot: [0, 0.13, -0.08], w: 1.3 },
  { name: "earL", c: [0.024, 0.212, -0.115], r: [0.011, 0.024, 0.011], pivot: [0.024, 0.195, -0.115], parent: "head", w: 1.4 },
  { name: "earR", c: [-0.024, 0.212, -0.115], r: [0.011, 0.024, 0.011], pivot: [-0.024, 0.195, -0.115], parent: "head", w: 1.4 },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({
    name: `tail${i}`,
    c: tailAt(i, 1, 0),
    r: [0.026 + i * 0.005, 0.034 + i * 0.004, 0.032 + i * 0.004] as V3,
    pivot: [0, 0.11, 0.11] as V3, // the tail's root: it turns as one about it
    fuzz: 0.018,
    w: 0.85,
  })),
];

const SPECIES: Record<Kind, { parts: Part[]; hip: V3; col: [number, number, number][] }> = {
  rabbit: { parts: RABBIT, hip: [0, 0.12, 0.08], col: [[0.86, 0.9, 1.0], [1.0, 0.95, 0.86], [0.78, 0.86, 1.0]] },
  squirrel: { parts: SQUIRREL, hip: [0, 0.08, 0.05], col: [[1.0, 0.82, 0.6], [1.0, 0.9, 0.74], [0.95, 0.78, 0.66]] },
};

/** Motes on the outer skin of the volumes: a point on one ellipsoid is kept only if it lies
    outside every other (as they stand at rest), so the overlaps melt into one rounded outline. */
function sampleForm(parts: Part[], n: number, R: () => number): { part: Uint8Array; q: Float32Array } {
  const tilt = (p: Part, v: V3): V3 => {
    const a = p.tilt ?? 0, c = Math.cos(a), s = Math.sin(a);
    return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
  };
  const inside = (p: Part, x: number, y: number, z: number): number => {
    const a = -(p.tilt ?? 0), c = Math.cos(a), s = Math.sin(a);
    const dx = x - p.c[0], dy0 = y - p.c[1], dz0 = z - p.c[2];
    const dy = dy0 * c - dz0 * s, dz = dy0 * s + dz0 * c;
    return (dx / p.r[0]) ** 2 + (dy / p.r[1]) ** 2 + (dz / p.r[2]) ** 2;
  };
  const area = parts.map((p) => {
    const [a, b, c] = p.r, k = 1.6;
    return 4 * Math.PI * (((a * b) ** k + (a * c) ** k + (b * c) ** k) / 3) ** (1 / k) * (p.w ?? 1);
  });
  const tot = area.reduce((a, b) => a + b, 0);
  const part = new Uint8Array(n), q = new Float32Array(n * 3);
  let i = 0, guard = 0;
  while (i < n && guard++ < n * 60) {
    let r = R() * tot, k = 0;
    while (k < parts.length - 1 && r > area[k]) r -= area[k++];
    const p = parts[k];
    // a direction on the sphere, stretched to the ellipsoid, fur standing off it
    const u = R() * 2 - 1, th = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const f = 1 + (p.fuzz ? (R() * p.fuzz) / Math.min(...p.r) : 0);
    const l = tilt(p, [s * Math.cos(th) * p.r[0] * f, u * p.r[1] * f, s * Math.sin(th) * p.r[2] * f]);
    const x = p.c[0] + l[0], y = p.c[1] + l[1], z = p.c[2] + l[2];
    // puffs of the tail overlap freely (fluff); everywhere else a skin inside another volume goes
    const tailK = p.name.startsWith("tail");
    if (parts.some((o, j) => j !== k && inside(o, x, y, z) < (tailK && o.name.startsWith("tail") ? 0.7 : 0.92))) continue;
    part[i] = k;
    q.set([x, y, z], i * 3);
    i++;
  }
  for (; i < n; i++) (part[i] = 0), q.set(parts[0].c, i * 3); // never short
  return { part, q };
}

interface Pose {
  rx: number;
  ry: number;
  t: V3;
}

interface Critter {
  kind: Kind;
  state: "away" | "gather" | "live" | "fade";
  form: number;
  left: number;
  p: THREE.Vector3;
  heading: number;
  /** Doing: sitting (and how upright), or on the move toward `goal`. */
  moving: boolean;
  goal: THREE.Vector3;
  wait: number;
  phase: number;
  speed: number;
  /** 0–1: sitting up (rabbit: up on its haunches to look; squirrel: upright, paws to chest). */
  up: number;
  upWant: number;
  upFor: number;
  flick: number;
  flickAt: number;
  look: number;
  lookWant: number;
  lookAt: number;
  fleeing: boolean;
  /** For a still's summoned ones: its own way, not drawn by stillness. */
  own: number;
  M: THREE.Matrix4[];
}

const tmpA = new THREE.Matrix4(), tmpB = new THREE.Matrix4(), tmpC = new THREE.Matrix4(), e = new THREE.Euler();

export class SpiritCritters {
  group = new THREE.Group();
  private list: Critter[] = [];
  private cloud: SpriteCloud;
  private P: Float32Array;
  private A: Float32Array;
  private forms: Record<Kind, { part: Uint8Array; q: Float32Array; seed: Float32Array; parts: Part[]; index: Map<string, number> }>;
  private uT = T.uniform(0);
  private R = rng(4242);
  private summonAt: { x: number; z: number; fx: number; fz: number; moving: boolean } | null = null;

  /** `trees()`: trunks near you (x, z and girth), for the squirrels. */
  constructor(
    rabbits = 3,
    squirrels = 3,
    private per = 900,
    private trees: () => { x: number; z: number; r: number }[] = () => [],
  ) {
    const R = rng(77);
    const make = (k: Kind) => {
      const parts = SPECIES[k].parts;
      const f = sampleForm(parts, per, R);
      const seed = new Float32Array(per);
      for (let i = 0; i < per; i++) seed[i] = R();
      return { ...f, seed, parts, index: new Map(parts.map((p, i) => [p.name, i])) };
    };
    this.forms = { rabbit: make("rabbit"), squirrel: make("squirrel") };
    const kinds: Kind[] = [...Array(rabbits).fill("rabbit"), ...Array(squirrels).fill("squirrel")];
    this.list = kinds.map((kind, i) => ({
      kind, state: "away", form: 0, left: 3 + i * 4 + this.R() * 5,
      p: new THREE.Vector3(), heading: this.R() * 6.28, moving: false, goal: new THREE.Vector3(), wait: 0, phase: 0, speed: 0,
      up: 0, upWant: 0, upFor: 0, flick: 0, flickAt: 2, look: 0, lookWant: 0, lookAt: 1, fleeing: false, own: 0,
      M: SPECIES[kind].parts.map(() => new THREE.Matrix4()),
    }));

    const N = per * kinds.length;
    const mat = softPoints();
    const cloud = spriteCloud(N, { position: 3, aCol: 3, aSeed: 1, aA: 1 }, mat);
    this.cloud = cloud;
    this.P = cloud.attrs.position.array as Float32Array;
    this.A = cloud.attrs.aA.array as Float32Array;
    const col = cloud.attrs.aCol.array as Float32Array, sd = cloud.attrs.aSeed.array as Float32Array;
    this.list.forEach((c, h) => {
      const f = this.forms[c.kind], cs = SPECIES[c.kind].col;
      for (let i = 0; i < per; i++) {
        const j = h * per + i, s = f.seed[i];
        const name = f.parts[f.part[i]].name;
        // ears and tail a little paler, the rest in its own cast
        const cc = name.startsWith("tail") || name.startsWith("ear") ? [1.0, 0.97, 0.93] : cs[(h + Math.floor(s * 3)) % 3];
        col.set(cc, j * 3);
        sd[j] = (s * 5.17 + h * 0.31) % 1;
      }
    });
    {
      const { clamp, float, max, sin, vec4 } = T;
      const { position, aCol, aSeed, aA } = cloud.nodes;
      mat.sizeNode = clamp(gpuUniforms.px.mul(0.0135).mul(aSeed.mul(0.8).add(0.6)).div(max(viewDepth(position), 0.3)), float(1).div(gpuUniforms.dpr), 5);
      const flick = sin(this.uT.mul(11).add(aSeed.mul(97))).mul(0.15).add(0.85);
      mat.colorNode = vec4(aCol.mul(softDot(pointR())).mul(flick).mul(aA).mul(0.8), 1);
    }
    cloud.sprite.frustumCulled = false;
    cloud.setCount(0);
    this.group.add(cloud.sprite);
  }

  /** For a still (`?shot=critters`): one of each comes, ahead of `from` toward `to`, gathering. */
  summon(from: { x: number; z: number }, to: { x: number; z: number }, moving = false): void {
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
    this.summonAt = { x: from.x, z: from.z, fx: dx / l, fz: dz / l, moving };
  }

  private meadowNear(x: number, z: number, rMin: number, rMax: number): THREE.Vector3 | null {
    for (let k = 0; k < 24; k++) {
      const a = this.R() * 6.28, r = rMin + this.R() * (rMax - rMin);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const h = heightAt(px, pz);
      if (h > WATER_Y + 0.5 && h < 40 && groundKind(px, pz, h).stone < 0.3) return new THREE.Vector3(px, h, pz);
    }
    return null;
  }

  /** A trunk's foot near a point for a squirrel (just off the bark), else open ground. */
  private treeNear(x: number, z: number, rMax: number, not?: THREE.Vector3): THREE.Vector3 | null {
    const ts = this.trees().filter((t) => Math.hypot(t.x - x, t.z - z) < rMax && (!not || Math.hypot(t.x - not.x, t.z - not.z) > 2));
    if (!ts.length) return null;
    const t = ts[Math.floor(this.R() * ts.length)], a = this.R() * 6.28, d = t.r + 0.35;
    const px = t.x + Math.cos(a) * d, pz = t.z + Math.sin(a) * d, h = heightAt(px, pz);
    return h > WATER_Y + 0.3 ? new THREE.Vector3(px, h, pz) : null;
  }

  /** `still`: 0–1, the wanderer's stillness. `rushing`: running or gliding. `away`: in the water or a place apart. */
  update(t: number, dt: number, player: THREE.Vector3, still: number, rushing: boolean, reduced: boolean, away = false): void {
    this.uT.value = t;
    if (this.summonAt) {
      const { x, z, fx, fz, moving } = this.summonAt;
      const firstR = this.list.find((c) => c.kind === "rabbit"), firstS = this.list.find((c) => c.kind === "squirrel");
      [firstR, firstS].forEach((c, i) => {
        if (!c) return;
        const near = new URLSearchParams(location.search).get("near") === "squirrel" ? 1 : 0;
        const d = i === near ? 2.9 : 4.4, side = i === near ? 0.9 : -1.0;
        const px = x + fx * d - fz * side, pz = z + fz * d + fx * side;
        c.p.set(px, Math.max(heightAt(px, pz), WATER_Y), pz);
        // side-on across the view, turned a little toward the side the camera stands
        const across = Math.atan2(fz, -fx) + Math.PI / 2;
        c.heading = across + (i ? Math.PI + 0.35 : -0.35);
        Object.assign(c, { state: "gather", form: 0, left: 60, moving: false, wait: 40, own: 60, up: 0, upWant: i ? 1 : 0, upFor: 40 });
        if (moving) {
          // on their way across the view (a still of the gait)
          c.goal.set(px - Math.sin(c.heading) * 40, 0, pz - Math.cos(c.heading) * 40);
          Object.assign(c, { moving: true, upWant: 0, speed: 1.4, state: "live", form: 1 });
          c.p.x -= Math.sin(c.heading) * -2.6;
          c.p.z -= Math.cos(c.heading) * -2.6; // starting a little back, so it hops into the frame
        }
      });
      this.summonAt = null;
    }

    let any = false;
    for (const c of this.list) {
      const toP = Math.hypot(player.x - c.p.x, player.z - c.p.z);
      if (c.state === "away") {
        c.left -= dt;
        if (c.left > 0 || away) continue;
        const at = c.kind === "squirrel" ? (this.treeNear(player.x, player.z, 30) ?? this.meadowNear(player.x, player.z, 7, 20)) : this.meadowNear(player.x, player.z, 7, 24);
        if (!at || Math.hypot(at.x - player.x, at.z - player.z) < 5) {
          c.left = 2;
          continue;
        }
        c.p.copy(at);
        c.heading = this.R() * 6.28;
        Object.assign(c, { state: "gather", form: 0, left: 40 + this.R() * 50, moving: false, wait: 2 + this.R() * 3, fleeing: false, up: 0, upWant: 0, own: 0 });
      }
      // going: rushed at (it bounds away as it fades), far behind, or somewhere apart
      if ((c.state === "live" || c.state === "gather") && ((rushing && toP < 10) || toP > 70 || away)) {
        c.state = "fade";
        if (rushing && toP < 10 && !away) {
          const a = Math.atan2(c.p.z - player.z, c.p.x - player.x) + (this.R() - 0.5) * 0.8;
          c.goal.set(c.p.x + Math.cos(a) * 8, 0, c.p.z + Math.sin(a) * 8);
          Object.assign(c, { moving: true, fleeing: true, upWant: 0 });
        }
      }
      if (c.state === "live") {
        c.left -= still > 0.4 && toP < 30 ? 0 : dt;
        if (c.left <= 0) c.state = "fade";
      }
      if (c.state === "gather") {
        c.form = Math.min(1, c.form + dt / 2.6);
        if (c.form >= 1) c.state = "live";
      } else if (c.state === "fade") {
        c.form = Math.max(0, c.form - dt / (c.fleeing ? 1.8 : 3.4));
        if (c.form <= 0) {
          Object.assign(c, { state: "away", left: 10 + this.R() * 25, fleeing: false });
          continue;
        }
      }
      any = true;
      this.behave(c, t, dt, player, still, toP, reduced);
    }

    // the motes
    const n = this.per, P = this.P, A = this.A;
    let live = 0;
    this.list.forEach((c, hi) => {
      const o = hi * n;
      if (c.state === "away") {
        A.fill(0, o, o + n);
        return;
      }
      live = hi + 1;
      this.pose(c, t);
      const f = this.forms[c.kind], q = f.q, part = f.part, seed = f.seed, M = c.M;
      const form = c.form, rise = reduced ? 0.4 : 1;
      for (let i = 0; i < n; i++) {
        const m = M[part[i]].elements, j = i * 3;
        const qx = q[j], qy = q[j + 1], qz = q[j + 2];
        let x = m[0] * qx + m[4] * qy + m[8] * qz + m[12];
        let y = m[1] * qx + m[5] * qy + m[9] * qz + m[13];
        let z = m[2] * qx + m[6] * qy + m[10] * qz + m[14];
        const s = seed[i];
        // each mote comes and goes on its own time
        const e0 = Math.min(1, Math.max(0, (form - s * 0.45) / 0.55));
        const ee = e0 * e0 * (3 - 2 * e0);
        let a = ee;
        if (ee < 0.999) {
          const l = 1 - ee, an = s * 47.1 + t * (0.4 + s * 0.4), r = l * (0.2 + s * 0.5);
          x += Math.cos(an) * r;
          z += Math.sin(an) * r;
          y += l * (0.3 + s * 1.2) * rise;
          a = ee + l * 0.45 * Math.min(1, form * 3);
        } else if (!reduced) {
          // whole: a faint shiver in the fur
          x += Math.sin(t * 2.1 + s * 40) * 0.0025;
          y += Math.sin(t * 1.7 + s * 60) * 0.0025;
        }
        const k = (o + i) * 3;
        P[k] = x;
        P[k + 1] = y;
        P[k + 2] = z;
        A[o + i] = a;
      }
    });
    this.cloud.setCount(live * n);
    this.cloud.sprite.visible = any;
    if (any) {
      this.cloud.attrs.position.needsUpdate = true;
      this.cloud.attrs.aA.needsUpdate = true;
    }
  }

  /** Its way through the world: sit, look about, go on a little, come near in stillness. */
  private behave(c: Critter, _t: number, dt: number, player: THREE.Vector3, still: number, toP: number, reduced: boolean): void {
    const rabbit = c.kind === "rabbit";
    c.own -= dt;
    const drawn = still > 0.4 && toP < 26 && c.state !== "fade" && c.own <= 0;
    if (!c.moving) {
      c.wait -= dt;
      if (drawn && toP > (rabbit ? 3.4 : 2.6)) {
        // drawn to the stillness: come near, and sit facing you
        const a = Math.atan2(c.p.z - player.z, c.p.x - player.x) + (this.R() - 0.5) * 0.5;
        const r = rabbit ? 2.8 : 2.2;
        c.goal.set(player.x + Math.cos(a) * r, 0, player.z + Math.sin(a) * r);
        Object.assign(c, { moving: true, upWant: 0 });
      } else if (c.wait <= 0 && !drawn) {
        let g: THREE.Vector3 | null = null;
        if (!rabbit) g = this.treeNear(c.p.x, c.p.z, 14, c.p) ?? this.meadowNear(c.p.x, c.p.z, 2, 6);
        else g = this.meadowNear(c.p.x, c.p.z, 1.2, 4.5);
        if (g) {
          c.goal.copy(g);
          Object.assign(c, { moving: true, upWant: 0 });
        } else c.wait = 1.5;
      }
      // sitting: now and then up on its haunches to look about (the squirrel mostly sits up)
      c.upFor -= dt;
      if (c.upFor <= 0) {
        c.upWant = this.R() < (rabbit ? 0.35 : 0.8) ? 1 : 0;
        c.upFor = 2 + this.R() * 4;
      }
      if (drawn) {
        const hd = Math.atan2(-(player.x - c.p.x), -(player.z - c.p.z));
        c.heading += Math.atan2(Math.sin(hd - c.heading), Math.cos(hd - c.heading)) * Math.min(1, dt * 2);
      }
    } else {
      const dx = c.goal.x - c.p.x, dz = c.goal.z - c.p.z, dist = Math.hypot(dx, dz);
      const pace = c.fleeing ? (rabbit ? 4.2 : 4.6) : rabbit ? 1.5 : 2.4;
      if (dist < 0.25) {
        Object.assign(c, { moving: false, wait: (rabbit ? 2.5 : 1.5) + this.R() * (rabbit ? 5 : 4), speed: 0 });
      } else {
        const hd = Math.atan2(-dx, -dz);
        c.heading += Math.atan2(Math.sin(hd - c.heading), Math.cos(hd - c.heading)) * Math.min(1, dt * (rabbit ? 5 : 8));
        c.speed += (Math.min(pace, dist * 2.5) - c.speed) * Math.min(1, dt * 6);
        c.p.x -= Math.sin(c.heading) * c.speed * dt;
        c.p.z -= Math.cos(c.heading) * c.speed * dt;
      }
    }
    const g = heightAt(c.p.x, c.p.z);
    if (g < WATER_Y + 0.2 && c.moving) Object.assign(c, { moving: false, wait: 0.5 });
    c.p.y = Math.max(g, WATER_Y);
    // the gait's clock runs with the ground covered: a hop or a bound per stride
    const stride = rabbit ? (c.fleeing ? 1.1 : 0.62) : c.fleeing ? 0.7 : 0.42;
    if (c.moving) c.phase = (c.phase + (c.speed * dt) / stride) % 1;
    else c.phase += (Math.ceil(c.phase) - c.phase) * Math.min(1, dt * 6); // settle at the end of a stride
    c.up += ((c.moving ? 0 : c.upWant) - c.up) * Math.min(1, dt * 3);
    // the squirrel's tail flicks; heads turn to look
    c.flickAt -= dt;
    if (c.flickAt <= 0) (c.flick = 1), (c.flickAt = 1.2 + this.R() * 3.5);
    c.flick = Math.max(0, c.flick - dt * 2.4);
    c.lookAt -= dt;
    if (c.lookAt <= 0) (c.lookWant = (this.R() - 0.5) * 1.3), (c.lookAt = 1 + this.R() * 2.5);
    c.look += ((c.moving ? 0 : c.lookWant) - c.look) * Math.min(1, dt * (reduced ? 2 : 5));
  }

  /** Each volume's place this moment, by gait and mood: a matrix per part from rest to world. */
  private pose(c: Critter, t: number): void {
    const f = this.forms[c.kind], parts = f.parts, sp = SPECIES[c.kind], rabbit = c.kind === "rabbit";
    const mv = c.moving ? Math.min(1, c.speed / 0.8) : 0, h = c.phase, TAU = Math.PI * 2;
    const s1 = Math.sin(TAU * h), arc = Math.sin(Math.PI * h);
    const up = c.up;
    // the whole: lifted through the leap, nose up at the push and down to land; sitting up rocks
    // it back about the hips
    const lift = arc * (rabbit ? 0.13 : 0.07) * mv + (rabbit ? 0.03 : 0.02) * up;
    const pitch = -0.32 * Math.cos(TAU * h) * mv * (rabbit ? 1 : 0.8) - up * (rabbit ? 0.55 : 0.9);
    const poses: Pose[] = parts.map(() => ({ rx: 0, ry: 0, t: [0, 0, 0] }));
    const set = (name: string, p: Partial<Pose>) => {
      const i = f.index.get(name);
      if (i !== undefined) Object.assign(poses[i], p);
    };
    // hind legs drive back at the push and fold under to land; the fore reach ahead
    const hind = 0.95 * s1 * mv, fore = -0.9 * Math.sin(TAU * h + 1.2) * mv;
    set("footL", { rx: hind });
    set("footR", { rx: hind });
    set("haunchL", { rx: hind * 0.35 });
    set("haunchR", { rx: hind * 0.35 });
    // sitting up, the forepaws come to the chest
    set("foreL", { rx: fore - up * 1.1, t: [0, up * 0.03, up * 0.02] });
    set("foreR", { rx: fore - up * 1.1, t: [0, up * 0.03, up * 0.02] });
    // the head keeps level against the body's pitch, and looks about; a nose twitch when sitting
    const twitch = c.moving ? 0 : Math.sin(t * 13 + c.heading * 7) * 0.025 * (0.5 + 0.5 * Math.sin(t * 0.7));
    set("head", { rx: -pitch * 0.7 + twitch, ry: c.look });
    if (rabbit) {
      // ears: laid back in the air, pricked when sitting, each turning on its own
      const back = -0.75 * arc * mv;
      set("earL", { rx: back + Math.sin(t * 0.9) * 0.12 * (1 - mv), ry: 0.15 + Math.sin(t * 0.6 + 1) * 0.25 * (1 - mv) });
      set("earR", { rx: back + Math.sin(t * 0.8 + 2) * 0.12 * (1 - mv), ry: -0.15 + Math.sin(t * 0.5 + 3) * 0.25 * (1 - mv) });
    } else {
      // the tail: curled high sitting, streaming flat in a bound (rippling), flicked now and then
      const curl = Math.max(0.15, 1 - mv * 0.85);
      for (let i = 0; i < 6; i++) {
        const rest = tailAt(i, 1, 0), now = tailAt(i, curl, c.flick * 1.4 + Math.sin(TAU * h - i * 0.6) * 0.5 * mv);
        // sitting up the body leans back; the tail turns the other way about its root and stands
        // up behind the back instead of sweeping under it
        set(`tail${i}`, { rx: up * 0.6, t: [now[0] - rest[0], now[1] - rest[1], now[2] - rest[2]] });
      }
    }
    // world ← root: placed and turned, lifted, pitched about the hips
    const hip = sp.hip;
    const W = tmpA.makeRotationY(c.heading).setPosition(c.p.x, c.p.y, c.p.z);
    W.multiply(tmpB.makeTranslation(0, lift, 0));
    W.multiply(tmpB.makeTranslation(hip[0], hip[1], hip[2])).multiply(tmpC.makeRotationX(pitch)).multiply(tmpB.makeTranslation(-hip[0], -hip[1], -hip[2]));
    // each part: about its pivot, then moved, under its parent
    const done = new Array<boolean>(parts.length).fill(false);
    const solve = (i: number): THREE.Matrix4 => {
      if (done[i]) return c.M[i];
      const p = parts[i], ps = poses[i], pv = p.pivot ?? p.c;
      const base = p.parent ? solve(f.index.get(p.parent)!) : W;
      e.set(ps.rx, ps.ry, 0, "YXZ");
      c.M[i]
        .copy(base)
        .multiply(tmpB.makeTranslation(pv[0] + ps.t[0], pv[1] + ps.t[1], pv[2] + ps.t[2]))
        .multiply(tmpC.makeRotationFromEuler(e))
        .multiply(tmpB.makeTranslation(-pv[0], -pv[1], -pv[2]));
      done[i] = true;
      return c.M[i];
    };
    for (let i = 0; i < parts.length; i++) solve(i);
  }
}
