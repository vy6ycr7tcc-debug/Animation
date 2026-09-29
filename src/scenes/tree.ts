/* The tree of life, on the coastal hill at SITES.tree: where the temple tour sets you down to
   rest. A great tree of the world's own kind (world/creation.ts): the spreading shape, grown from
   its seed, its round limbs and roots in the living bark (starlight in the grain, light flowing
   down the trunk, the crown swaying); its canopy of soft lights hung on the twig tips, gold, pale
   blue and rose, each twinkling on its own clock while a slow wave of brightness moves through
   the crown and now and then a leaf of light lets go and falls. A stone seat before it, facing it.
   Nothing else: no rings, no pillars, no discs. */
import * as THREE from "three/webgpu";
import type { Narration } from "../core/narration";
import { barkMaterial, grow, SHAPES, tubes } from "../world/creation";
import { etchedStone } from "../world/etching";
import { fbm, heightAt } from "../world/terrain";
import { gpuUniforms, softPoints, spriteCloud, T, viewDepth } from "../gpu/tsl";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";

const TREE_SCALE = 1.8;
const SEAT_BACK = 6.5;
const SEAT_RADIUS = 2.2;

function rng(seed: number): () => number {
  let s = seed % 2147483647 || 16807;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export class TreeOfLifeScene implements SceneModule {
  id = "tree";
  active = true;
  readonly sitPrompt = "Rest beneath the tree";
  readonly panelTitle = "❋ The tree of life";
  seatPos: THREE.Vector3;
  seatHeading: number;

  private group = new THREE.Group();
  private uT = T.uniform(0);
  private resting = false;
  private greeted = false;
  private life = 0;
  private whisper: (text: string, ms?: number) => void;

  constructor(
    scene: THREE.Scene,
    _narration: Narration,
    private player: { pos: THREE.Vector3; heading: number; target: THREE.Vector2 | null },
    _wanderer: unknown,
    _follow: unknown,
    hooks: { whisper: (text: string, ms?: number) => void },
  ) {
    this.whisper = hooks.whisper;
    const site = SITES.tree;
    const tx = site.x, tz = site.z, gy = heightAt(tx, tz);
    this.seatHeading = site.heading;
    // the seat stands out along the heading, facing back to the tree
    const sx = tx + Math.sin(site.heading) * SEAT_BACK, sz = tz + Math.cos(site.heading) * SEAT_BACK;
    this.seatPos = new THREE.Vector3(sx, heightAt(sx, sz), sz);

    // the tree: grown, skinned, placed in the world (the bark reads world positions)
    const { limbs, roots, tips } = grow({ ...SHAPES[2], height: 4.4, radius: 0.16, limbLen: 2.0, roots: 7 }, 0.37);
    const place = new THREE.Matrix4().compose(new THREE.Vector3(tx, gy - 0.25, tz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), site.heading), new THREE.Vector3().setScalar(TREE_SCALE));
    const g = tubes([...limbs, ...roots]);
    g.applyMatrix4(place);
    g.computeBoundingSphere();
    const bark = new THREE.Mesh(g, barkMaterial(new THREE.Color(1.0, 0.8, 0.5), 0.37));
    bark.castShadow = true;
    bark.frustumCulled = false;
    this.group.add(bark);

    // the canopy: soft lights on the twig tips, a few around each
    const R = rng(3711);
    const per = 9, n = tips.length * per;
    const mat = softPoints();
    const cloud = spriteCloud(n, { position: 3, aK: 1 }, mat);
    const pos = cloud.attrs.position.array as Float32Array, ks = cloud.attrs.aK.array as Float32Array;
    const v = new THREE.Vector3();
    tips.forEach((tip, i) => {
      for (let k = 0; k < per; k++) {
        v.copy(tip).add(new THREE.Vector3(R() - 0.5, (R() - 0.3) * 0.7, R() - 0.5).multiplyScalar(0.9)).applyMatrix4(place);
        pos.set([v.x, v.y, v.z], (i * per + k) * 3);
        ks[i * per + k] = R();
      }
    });
    {
      const { clamp, exp, float, length, max, mix, pointUV, sin, smoothstep, vec3, vec4 } = T;
      const { position, aK } = cloud.nodes;
      // a few leaves of light let go and fall, and come back to the crown
      const falls = smoothstep(0.93, 0.94, aK);
      const drop = T.fract(this.uT.mul(0.05).add(aK.mul(17))).mul(falls);
      const P = position.sub(vec3(sin(this.uT.mul(0.4).add(aK.mul(40))).mul(drop).mul(1.2), drop.mul(6), 0));
      mat.positionNode = P;
      mat.sizeNode = clamp(gpuUniforms.px.mul(0.22).mul(aK.mul(0.6).add(0.7)).div(max(viewDepth(P), 1)), float(1).div(gpuUniforms.dpr), 24);
      const hue = mix(mix(vec3(1.0, 0.8, 0.5), vec3(0.7, 0.85, 1.0), smoothstep(0.35, 0.45, aK)), vec3(1.0, 0.7, 0.88), smoothstep(0.75, 0.85, aK));
      const twinkle = sin(this.uT.mul(aK.mul(2.5).add(1.2)).add(aK.mul(60))).mul(0.45).add(0.55);
      const wave = sin(this.uT.mul(0.5).sub(position.y.mul(0.4))).mul(0.4).add(0.6);
      const r = length(pointUV.sub(0.5));
      const soft = exp(r.mul(r).mul(-14));
      mat.colorNode = vec4(hue.mul(soft).mul(twinkle).mul(wave).mul(float(1).sub(drop.mul(0.12))).mul(0.34), 1);
    }
    cloud.sprite.frustumCulled = false;
    this.group.add(cloud.sprite);

    // the seat: rough stone, part-buried
    const sg = new THREE.IcosahedronGeometry(1, 2);
    const sp = sg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      v.fromBufferAttribute(sp, i).normalize();
      const d = 0.82 + fbm(v.x * 1.5 + 2.3, v.z * 1.5 + v.y * 1.2) * 0.3;
      sp.setXYZ(i, v.x * d, v.y * d, v.z * d);
    }
    sg.computeVertexNormals();
    const sm = etchedStone("#221e30", "#e9c37d", 1.6);
    sm.flatShading = true;
    const seat = new THREE.Mesh(sg, sm);
    seat.scale.set(0.62, 0.42, 0.5);
    seat.position.copy(this.seatPos).setY(this.seatPos.y + 0.14);
    seat.castShadow = seat.receiveShadow = true;
    this.group.add(seat);
    scene.add(this.group);
  }

  greet(): void {
    if (this.greeted) return;
    this.greeted = true;
    this.whisper("You found the tree. Sit a while, if you like.");
  }

  nearSeat(p: THREE.Vector3): boolean {
    return Math.hypot(p.x - this.seatPos.x, p.z - this.seatPos.z) < SEAT_RADIUS;
  }

  onSit(): void {
    this.rest();
  }

  onStand(): void {
    this.wake();
  }

  /** Set the wanderer down at the seat, facing the tree. */
  rest(): void {
    this.resting = true;
    this.player.pos.set(this.seatPos.x, this.seatPos.y, this.seatPos.z);
    this.player.heading = this.seatHeading;
    this.player.target = null;
  }

  wake(): void {
    if (!this.resting) return;
    this.resting = false;
    this.player.target = null;
    this.whisper("Go gently.");
  }

  holdsMovement(): boolean {
    return this.resting;
  }

  update(dt: number): void {
    this.life += Math.min(0.05, Math.max(0, dt));
    this.uT.value = this.life;
  }

  dispose(): void {
    this.active = false;
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
  }
}
