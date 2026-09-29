/* The guide: a small, warm light you can call (⋮ → Guide, or from the map). Tell it what you
   would like to explore, the archetypes of the Mind, the Body or the Spirit, the Choice, one of
   the archive's groves or orbs, or simply somewhere you haven't been, and it goes ahead of you,
   waiting when you fall behind, until you arrive. Then it circles the place once and fades.
   It never speaks over the voices; it only shows the way. */
import * as THREE from "three/webgpu";
import { worldPoints } from "../gpu/tsl";
import { heightAt, WATER_Y } from "./terrain";

export interface Destination {
  label: string;
  x: number;
  y: number; // for places in the air or the deep
  z: number;
}

function glowTex(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,244,222,1)");
  grd.addColorStop(0.3, "rgba(255,226,180,0.35)");
  grd.addColorStop(1, "rgba(255,210,160,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TRAIL = 40;

export class Guide {
  group = new THREE.Group();
  target: Destination | null = null;
  /** Called once when you arrive. */
  onArrive: ((d: Destination) => void) | null = null;
  private light: THREE.Sprite;
  private core: THREE.Mesh;
  private trail: THREE.Sprite;
  private trailMat: THREE.PointsNodeMaterial;
  private trailPos: THREE.InstancedBufferAttribute;
  private hist: THREE.Vector3[] = [];
  private p = new THREE.Vector3();
  private k = 0;
  private arrivedT = -1;

  constructor() {
    this.light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.light.scale.setScalar(1.1);
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.15, 0.9), transparent: true, depthWrite: false }));
    const tp = worldPoints(new Float32Array(TRAIL * 3), { color: new THREE.Color(1, 0.88, 0.7), size: 0.06, opacity: 0.6 });
    this.trail = tp.sprite;
    this.trailMat = tp.material;
    this.trailPos = tp.position;
    this.group.add(this.light, this.core, this.trail);
    this.group.visible = false;
  }

  /** Lead the way to `d`, starting beside the wanderer. */
  lead(d: Destination, from: THREE.Vector3): void {
    this.target = d;
    this.arrivedT = -1;
    if (this.k < 0.05) {
      this.p.set(from.x + 1.2, from.y + 2, from.z);
      this.hist = [];
    }
  }
  stop(): void {
    this.target = null;
  }
  /** How far the destination is, in metres. */
  distance(from: THREE.Vector3): number {
    const d = this.target;
    return d ? Math.hypot(d.x - from.x, d.z - from.z) : 0;
  }

  update(t: number, dt: number, player: THREE.Vector3): void {
    const d = this.target;
    this.k += ((d ? 1 : 0) - this.k) * Math.min(1, dt * (d ? 1.5 : 0.8));
    this.group.visible = this.k > 0.01;
    if (!this.group.visible) return;
    const want = new THREE.Vector3();
    if (d) {
      const dx = d.x - player.x, dz = d.z - player.z, dist = Math.hypot(dx, dz);
      if (dist < 9 && Math.abs(d.y - player.y) < 12) {
        // arrived: it circles the place once, then goes
        if (this.arrivedT < 0) {
          this.arrivedT = t;
          this.onArrive?.(d);
        }
        const a = (t - this.arrivedT) * 1.2;
        want.set(d.x + Math.cos(a) * 2.5, d.y + 2.5, d.z + Math.sin(a) * 2.5);
        if (t - this.arrivedT > 6) this.target = null;
      } else {
        // ahead of you along the way; it waits if you fall behind
        const ahead = Math.min(7, dist);
        const gx = player.x + (dx / dist) * ahead, gz = player.z + (dz / dist) * ahead;
        const ground = Math.max(heightAt(gx, gz), WATER_Y);
        // over land it floats at head height; for places in the air or the deep, it rises or sinks toward them
        const toward = THREE.MathUtils.clamp(d.y - player.y, -6, 6) * (1 - dist / (dist + 60));
        want.set(gx, Math.max(ground + 1.6, player.y + 1.8 + toward) + Math.sin(t * 1.4) * 0.15, gz);
        if (player.y < WATER_Y - 0.5) want.y = Math.min(want.y, WATER_Y - 0.6);
      }
    } else want.copy(this.p).setY(this.p.y + 0.5);
    this.p.lerp(want, Math.min(1, dt * 1.6));
    this.light.position.copy(this.p);
    this.core.position.copy(this.p);
    this.light.material.opacity = this.k * (0.75 + 0.25 * Math.sin(t * 2.3));
    (this.core.material as THREE.MeshBasicMaterial).opacity = this.k;
    // a faint trail of motes behind it
    this.hist.unshift(this.p.clone());
    if (this.hist.length > TRAIL) this.hist.pop();
    const a = this.trailPos.array as Float32Array;
    for (let i = 0; i < TRAIL; i++) {
      const h = this.hist[Math.min(i, this.hist.length - 1)];
      a.set([h.x + Math.sin(i * 1.7 + t) * 0.05 * i * 0.1, h.y - i * 0.004, h.z], i * 3);
    }
    this.trailPos.needsUpdate = true;
    this.trailMat.opacity = 0.5 * this.k;
  }
}
