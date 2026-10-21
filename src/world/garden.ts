/* Trees you plant, grown with your own energy (the owner: "plant trees and grow trees with energy,
   similar to meditating but with trees… we see the avatar loving with energy the tree").

   - Planting: in the build screen (world/sanctuary.ts) the 🌱 chip; a tap on the ground then sets
     a seed there instead of an orb, and a sprout stands up out of the earth.
   - Tending: a hold on a tree you planted. The wanderer goes to it and lays hands on it (world/
     touch.ts: kneeling with a palm by a sapling, arms round a grown tree); its light flows into
     the tree breath by breath and the bark lights from the hands. A ring on the ground round the
     tree fills over one cycle (CYCLE seconds); when it closes, the tree grows a stage, with a
     burst of light: seed → sapling → young → grown → elder. Letting go early keeps what it was.
   - Each tree is one of the world's own kinds (creation.ts: its grown limbs in living bark, glints
     at its twig tips), its own seed; kept on this device only, where it was planted. */
import * as THREE from "three/webgpu";
import { T, glowShader, type SpriteCloud } from "../gpu/tsl";
import { barkMaterial, crownLeaves, foliageCloud, grow, SHAPES, tubes } from "./creation";
import { colliders, heightAt, type Collider } from "./terrain";

const KEY = "inward-journey:planted";
/** One cycle of tending (seconds): the ring closes and the tree grows a stage. */
export const CYCLE = 30;
/** How big each stage stands (of its kind's full size). */
const STAGE = [0.07, 0.2, 0.42, 0.75, 1.15];
export const STAGE_NAMES = ["a seed", "a sapling", "a young tree", "a grown tree", "an elder"];
const { abs, atan, clamp, float, length, smoothstep, sin, vec3 } = T;

interface Kept {
  x: number;
  z: number;
  seed: number;
  kind: number;
  stage: number;
  /** set on top of something built (its height); absent: on the ground */
  y?: number;
}
interface Planted extends Omit<Kept, "y"> {
  y: number;
  /** on something built (kept as such) */
  raised: boolean;
  group: THREE.Group;
  trunk: THREE.Mesh;
  tips: THREE.Vector3[];
  canopy: SpriteCloud | null;
  scale: number;
  collider: Collider | null;
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export class Garden {
  readonly group = new THREE.Group();
  readonly trees: Planted[] = [];
  /** the tending ring round a tree: how far round (0..1), and how strongly it shows */
  private ring: THREE.Mesh & { material: ReturnType<typeof glowShader<"uP" | "uK" | "uT">> };
  private ringK = 0;
  private ringOf: Planted | null = null;
  private persist: boolean;

  constructor(opts: { persist?: boolean } = {}) {
    this.persist = opts.persist !== false;
    // the ring: a fine circle of light on the earth, the part gone bright, a bead at its head
    const rm = glowShader({ uP: 0, uK: 0, uT: 0 }, (u, uv) => {
      const q = uv.sub(0.5).mul(2);
      const r = length(q);
      const band = smoothstep(0.06, 0.0, abs(r.sub(0.86)));
      // angle from the top, clockwise, 0..1
      const a = atan(q.x, q.y).div(Math.PI * 2).add(0.5);
      const gone = smoothstep(0.004, 0.0, a.sub(u.uP));
      const head = smoothstep(0.03, 0.0, abs(a.sub(u.uP))).mul(smoothstep(0.12, 0.0, abs(r.sub(0.86)))).mul(clamp(u.uP.mul(40), 0, 1));
      const breathe = sin(u.uT.mul(1.2)).mul(0.12).add(0.88);
      return vec3(1, 0.8, 0.5).mul(band.mul(float(0.14).add(gone.mul(0.75))).add(head.mul(1.4)).mul(u.uK).mul(breathe));
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), rm) as typeof this.ring;
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 3;
    this.ring.visible = false;
    this.group.add(this.ring);
    this.load();
  }

  private load(): void {
    if (!this.persist) return;
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Kept[];
      if (Array.isArray(v)) for (const k of v) if (Number.isFinite(k.x) && Number.isFinite(k.z)) this.add(k, true);
    } catch {
      /* nothing kept */
    }
  }
  private save(): void {
    if (!this.persist) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.trees.map((t) => ({ x: Math.round(t.x * 100) / 100, z: Math.round(t.z * 100) / 100, seed: t.seed, kind: t.kind, stage: t.stage, ...(t.raised ? { y: Math.round(t.y * 100) / 100 } : {}) }))));
    } catch {
      /* full: they still grow this visit */
    }
  }

  /** Plant a seed where a tap fell (not in the water, not on another tree); `y`: on top of
      something built. */
  plant(x: number, z: number, y?: number): boolean {
    if ((y ?? heightAt(x, z)) < 0.15) return false;
    if (this.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.6 && Math.abs(t.y - (y ?? heightAt(x, z))) < 2)) return false;
    const kind = [0, 1, 2][Math.floor(Math.random() * 3)];
    this.add({ x, z, seed: Math.floor(Math.random() * 1e6), kind, stage: 0, ...(y !== undefined ? { y: Math.round(y * 100) / 100 } : {}) }, false);
    this.save();
    return true;
  }
  private add(k: Kept, settled: boolean): Planted {
    const shape = SHAPES[k.kind] ?? SHAPES[0];
    const g = grow(shape, k.seed);
    const trunk = new THREE.Mesh(tubes(g.limbs), barkMaterial(new THREE.Color(1, 0.86, 0.6), (k.seed % 997) / 997));
    trunk.castShadow = true;
    const group = new THREE.Group();
    const raised = Number.isFinite(k.y);
    const y = raised ? (k.y as number) : heightAt(k.x, k.z);
    group.position.set(k.x, y, k.z);
    group.add(trunk);
    this.group.add(group);
    const t: Planted = { x: k.x, z: k.z, seed: k.seed, kind: k.kind, y, raised, stage: Math.min(4, Math.max(0, k.stage | 0)), group, trunk, tips: g.tips, canopy: null, scale: settled ? STAGE[Math.min(4, k.stage | 0)] : 0.001, collider: null };
    trunk.scale.setScalar(Math.max(0.001, t.scale));
    this.trees.push(t);
    if (settled) this.leaves(t);
    this.hold(t);
    return t;
  }
  /** Its crown: the world's own leaves round its twig tips (rebuilt as it grows). */
  private leaves(t: Planted): void {
    if (t.canopy) {
      t.group.remove(t.canopy.sprite);
      t.canopy.sprite.geometry.dispose();
      (t.canopy.sprite.material as THREE.Material).dispose();
    }
    t.canopy = null;
    if (t.stage < 1) return;
    const s = STAGE[t.stage];
    let r = t.seed + 7;
    const R = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const { f, fl } = crownLeaves(t.tips, R, t.stage < 2 ? 6 : 12, s);
    const n = fl.length;
    const c = foliageCloud(n, { size: 0.62 * Math.max(0.3, s) });
    const a = c.attrs;
    (a.base.array as Float32Array).set(f);
    (a.aL.array as Float32Array).set(fl);
    const k = a.aK.array as Float32Array, h = a.aHue.array as Float32Array;
    const hue = (t.seed % 1000) / 1000;
    for (let i = 0; i < n; i++) (k[i] = (i * 0.618034 + hue * 3.1) % 1), (h[i] = hue);
    for (const v of Object.values(a)) v.needsUpdate = true;
    c.setCount(n);
    t.canopy = c;
    t.group.add(c.sprite);
  }
  /** Grown enough to stand in your way: its trunk is solid. */
  private hold(t: Planted): void {
    const shape = SHAPES[t.kind] ?? SHAPES[0];
    const r = shape.radius * STAGE[t.stage];
    if (t.stage < 2) return;
    if (!t.collider) {
      t.collider = { x: t.x, z: t.z, r: r * 1.1, top: t.y + shape.height * STAGE[t.stage] };
      colliders.push(t.collider);
    } else {
      t.collider.r = r * 1.1;
      t.collider.top = t.y + shape.height * STAGE[t.stage];
    }
  }

  /** The trees to lay hands on (touch.ts's extra). */
  touchables(): { kind: "tree"; x: number; y: number; z: number; r: number; h: number }[] {
    return this.trees.map((t) => {
      const shape = SHAPES[t.kind] ?? SHAPES[0];
      return { kind: "tree" as const, x: t.x, y: t.y, z: t.z, r: Math.max(0.08, shape.radius * STAGE[t.stage]), h: shape.height * STAGE[t.stage] };
    });
  }
  /** The planted tree at a point (within its reach). */
  at(x: number, z: number): Planted | null {
    let best: Planted | null = null, bd = 1.2;
    for (const t of this.trees) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) (bd = d), (best = t);
    }
    return best;
  }
  /** A small one is tended kneeling by it (a hug is for a trunk). */
  small(t: Planted): boolean {
    return t.stage < 2;
  }
  /** Tending: show the ring round it filling (k: how strongly, 0 hides it). */
  tend(t: Planted | null, p: number, k: number): void {
    if (t) this.ringOf = t;
    this.ringK = k;
    this.ring.material.uniforms.uP.value = Math.min(1, p);
  }
  /** A cycle completed: it grows a stage (an elder stays an elder). Returns its new stage. */
  growUp(t: Planted): number {
    if (t.stage < 4) t.stage++;
    this.leaves(t);
    this.hold(t);
    this.save();
    return t.stage;
  }

  update(dt: number, time: number, near: THREE.Vector3): void {
    for (const t of this.trees) {
      const want = STAGE[t.stage];
      if (Math.abs(t.scale - want) > 1e-4) {
        // grows up out of the earth over a few seconds
        t.scale += (want - t.scale) * Math.min(1, dt * 0.9);
        if (Math.abs(t.scale - want) < 1e-3) t.scale = want;
        t.trunk.scale.setScalar(Math.max(0.001, t.scale));
        if (t.canopy) t.canopy.sprite.scale.setScalar(ease(t.scale / want));
      }
      t.group.visible = Math.hypot(t.x - near.x, t.z - near.z) < 480;
    }
    const f = this.ringOf;
    const u = this.ring.material.uniforms;
    u.uT.value = time;
    u.uK.value += (this.ringK - u.uK.value) * Math.min(1, dt * 3);
    this.ring.visible = !!f && u.uK.value > 0.01;
    if (f) {
      const R = Math.max(1.3, (SHAPES[f.kind] ?? SHAPES[0]).radius * STAGE[f.stage] * 4 + 0.9);
      this.ring.position.set(f.x, f.y + 0.06, f.z);
      this.ring.scale.setScalar(R / 0.86);
    }
  }
}
