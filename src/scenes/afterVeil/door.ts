/* The one door (the owner's brief, scene 1): a single standing door in the forest, old and tall,
   faintly luminous at its seams, plainly not of the woods. Round it the forest at its heaviest and
   dimmest (its own ring of trees under dark crowns), spores of light drifting low. This side is the
   third density, the world behind the veil. The angel waits beside the door; coming near, it turns
   to you and speaks the first beat (the choice). Walking through goes white, not dark, and the
   world after the veil begins. It stands on levelled ground `VEIL_HALL`, its face toward home. */
import * as THREE from "three/webgpu";
import { T, gpuUniforms } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { heightAt, VEIL_HALL } from "../../world/terrain";
import { landStone, stoneBlock } from "../../world/stoneworks";
import { keepAlpha, merge, pointCloud, seeded, touch } from "../densities/roomKit";
import type { Narration } from "../../core/narration";
import type { Hall } from "../journey";
import { Angel } from "./angel";
import { forest, type TreeSpot } from "./forest";
import { VEIL_TRACK } from "./area";

const { cos, float, fract, length, sin, smoothstep, uv, vec2, vec3, vec4 } = T;
const W = 2.3, H = 4.8; // the opening

export class VeilDoor implements Hall {
  readonly world = new THREE.Group();
  readonly label = "The world after the veil";
  readonly door: THREE.Vector3;
  readonly face = VEIL_HALL.face;
  private inv = new THREE.Matrix4();
  private angel: Angel;
  private spoke = false;
  private speaking = 0;
  private away = 0;

  constructor(private narration: Narration) {
    const S = VEIL_HALL;
    this.world.position.set(S.x, S.y, S.z);
    this.world.rotation.y = S.face;
    this.world.name = "after-veil-door";
    this.world.updateMatrixWorld(true);
    this.inv.copy(this.world.matrixWorld).invert();
    this.door = new THREE.Vector3(S.x, S.y, S.z);
    const R = seeded(4401);
    const t = gpuUniforms.time;

    // the door: two tall jambs of old dark stone in courses, a heavy lintel, a sill sunk in moss
    const parts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      let y = 0;
      for (let k = 0; y < H + 0.1; k++) {
        const h = 0.7 + R() * 0.35;
        const b = stoneBlock(0.95 + R() * 0.12, h - 0.03, 1.05 + R() * 0.12, 20 + k * 2 + (sx > 0 ? 1 : 0));
        b.translate(sx * (W / 2 + 0.5) + (R() - 0.5) * 0.04, y + h / 2, (R() - 0.5) * 0.04);
        parts.push(b);
        y += h;
      }
    }
    const lintel = stoneBlock(W + 2.6, 1.0, 1.25, 31);
    lintel.translate(0, H + 0.5, 0);
    parts.push(lintel);
    const cap = stoneBlock(W + 1.6, 0.5, 0.95, 33);
    cap.translate(0, H + 1.25, 0);
    parts.push(cap);
    const sill = stoneBlock(W + 2.4, 0.3, 1.3, 35);
    sill.translate(0, 0.02, 0);
    parts.push(sill);
    // old dark stone, its grain weathered grey-green (it has stood here a long time)
    const stone = landStone("sandstone_cracks", 0, 1.6, [0.2, 0.22, 0.2]);
    const frame = new THREE.Mesh(merge(parts), stone);
    frame.castShadow = frame.receiveShadow = true;
    this.world.add(frame);

    // the seams: fine lines of light where stone meets stone round the opening, breathing
    {
      const seg: number[] = [];
      const line = (a: [number, number, number], b: [number, number, number]) => seg.push(...a, ...b);
      for (const z of [0.54, -0.54]) {
        line([-W / 2, 0.15, z], [-W / 2, H, z]);
        line([W / 2, 0.15, z], [W / 2, H, z]);
        line([-W / 2, H, z], [W / 2, H, z]);
        line([-W / 2 - 1.0, H, z], [-W / 2, H, z]);
        line([W / 2, H, z], [W / 2 + 1.0, H, z]);
      }
      const gm = ribbonGeometry(seg);
      const pulse = sin(t.mul(0.6).add(T.positionGeometry.y.mul(0.8))).mul(0.25).add(0.75);
      const m = keepAlpha(ribbonMaterial(vec3(1, 0.86, 0.6).mul(pulse).mul(0.45), 0.55));
      const mesh = new THREE.Mesh(gm, m);
      mesh.frustumCulled = false;
      this.world.add(mesh);
    }
    // the opening: a faint pale light hanging in it, deeper toward its heart
    {
      const g = new THREE.PlaneGeometry(W, H);
      g.translate(0, H / 2 + 0.15, 0);
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      const u = uv();
      const c = smoothstep(0.75, 0.0, length(u.sub(vec2(0.5, 0.45)).mul(vec2(1.4, 0.9))));
      const shimmer = sin(t.mul(0.5).add(u.y.mul(9))).mul(0.1).add(0.9);
      m.colorNode = vec4(vec3(1, 0.95, 0.85).mul(c).mul(shimmer).mul(0.16), 1);
      this.world.add(new THREE.Mesh(g, m));
    }

    // the forest at its heaviest round it: a ring of trees under dark crowns (the way to the door
    // from home kept open)
    {
      const spots: TreeSpot[] = [];
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2 * 1.0 + (R() - 0.5) * 0.25;
        if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.4) continue; // the way in, toward home (+z)
        const r = (i % 2 ? 5 : 9) + R() * 6;
        const lx = Math.sin(a) * r, lz = Math.cos(a) * r;
        const w = new THREE.Vector3(lx, 0, lz).applyMatrix4(this.world.matrixWorld);
        spots.push({ x: lx, z: lz, y: heightAt(w.x, w.z) - S.y, size: 1.3 + R() * 0.8, shape: R() < 0.35 ? 3 : 1, crown: 1 });
      }
      const f = forest(spots, t, R, 5200);
      this.world.add(...f.objects);
    }
    // spores of light, drifting low in the dim
    {
      const n = 140;
      const c = pointCloud(n, 0.07);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, r = 1 + Math.sqrt(R()) * 12;
        c.pos.set([Math.sin(a) * r, 0.3 + R() * 3.5, Math.cos(a) * r], i * 3);
        c.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(c.cloud);
      const K = c.cloud.nodes.aK;
      const life = fract(K.x.add(t.mul(float(0.02).add(K.y.mul(0.02)))));
      c.material.positionNode = c.cloud.nodes.position.add(vec3(sin(t.mul(0.2).add(K.z.mul(30))).mul(0.6), life.mul(1.5), cos(t.mul(0.17).add(K.w.mul(30))).mul(0.6)));
      const blink = smoothstep(0.4, 1, sin(t.mul(float(0.5).add(K.w)).add(K.x.mul(50))));
      c.material.colorNode = vec4(vec3(1, 0.8, 0.45).mul(c.round).mul(blink).mul(smoothstep(0, 0.15, life)).mul(float(1).sub(smoothstep(0.75, 1, life))).mul(0.8), 1);
      this.world.add(c.cloud.sprite);
    }
    void cos;

    // the angel, waiting beside the door, facing home
    const ap = new THREE.Vector3(W / 2 + 2.2, 0, 1.4).applyMatrix4(this.world.matrixWorld);
    this.angel = new Angel(ap.x, heightAt(ap.x, ap.z), ap.z, S.face + Math.PI);
    this.angel.goal.copy(ap);
  }

  /** Each frame out in the world (only near: it costs nothing far away). */
  update(dt: number, t: number, visitor: THREE.Vector3, reduced: boolean, inside: boolean): void {
    const d = Math.hypot(visitor.x - this.door.x, visitor.z - this.door.z);
    const near = !inside && d < 120;
    if (near && !this.angel.root.parent) this.world.parent?.add(this.angel.root);
    if (!near) {
      if (this.angel.root.parent) this.angel.root.parent.remove(this.angel.root);
      // coming back out through the door, it has already spoken this visit (no second telling);
      // gone a long way through the world, it speaks again when you come back
      if (inside) this.spoke = true;
      else if (d > 160) this.spoke = false;
      return;
    }
    // beat 1, the choice: when you come near, it turns to you and speaks (once a visit)
    if (!this.spoke && d < 11) {
      this.spoke = true;
      this.speaking = 0.01;
      void this.narration.play(VEIL_TRACK(1));
    }
    if (this.speaking > 0) {
      this.speaking += dt;
      this.angel.look = visitor;
      if (this.speaking > 2 && !this.narration.progress()) this.speaking = 0;
    } else {
      // between, it turns back toward the door, waiting
      this.away += dt;
      this.angel.look = d < 14 ? visitor : this.door;
    }
    this.angel.update(dt, t, heightAt, visitor, reduced);
  }

  atDoor(p: THREE.Vector3): boolean {
    if (Math.abs(p.x - this.door.x) > 12 || Math.abs(p.z - this.door.z) > 12) return false;
    const l = p.clone().applyMatrix4(this.inv);
    return Math.abs(l.x) < W / 2 - 0.15 && Math.abs(l.z) < 0.35;
  }
  outside(): { x: number; y: number; z: number; heading: number } {
    const p = new THREE.Vector3(0, 0, 4).applyMatrix4(this.world.matrixWorld);
    return { x: p.x, y: heightAt(p.x, p.z), z: p.z, heading: this.face + Math.PI };
  }
  light(): void {
    /* nothing to light: the way after the veil is walked once, and the door stays as it is */
  }
}
