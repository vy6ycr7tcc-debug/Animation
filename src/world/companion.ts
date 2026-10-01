/* The companion (the owner's guide orb): a small light that goes with you on every tour, the one
   continuous thread through it. Gentle, not a widget: it glides a little ahead on the way to
   where the tour goes next, waits there turning slowly, and while a place speaks it rests at your
   shoulder, breathing. A short trail of fading motes follows it, so its path reads as a glide.
   Contained, as every glow here: a small bright core, a thin halo, no light cast. The temple tour
   has its own light of the same look, so the companion steps back there. */
import * as THREE from "three/webgpu";

const TRAIL = 14;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,246,228,1)");
  grd.addColorStop(0.2, "rgba(255,214,150,0.55)");
  grd.addColorStop(1, "rgba(255,190,120,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Companion {
  readonly group = new THREE.Group();
  private core: THREE.Sprite;
  private halo: THREE.Sprite;
  private motes: THREE.Sprite[] = [];
  private trail: THREE.Vector3[] = [];
  private mats: THREE.SpriteMaterial[] = [];
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private want = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private shown = 0;
  private placed = false;
  private t = 0;
  private trailAt = 0;

  constructor(scene: THREE.Scene) {
    const tex = glowTexture();
    const mat = () => {
      const m = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 });
      this.mats.push(m);
      return m;
    };
    this.core = new THREE.Sprite(mat());
    this.core.scale.setScalar(0.5);
    this.halo = new THREE.Sprite(mat());
    this.halo.scale.setScalar(2.0);
    this.group.add(this.core, this.halo);
    for (let i = 0; i < TRAIL; i++) {
      const s = new THREE.Sprite(mat());
      s.scale.setScalar(0.16 * (1 - i / TRAIL) + 0.05);
      this.motes.push(s);
      this.trail.push(new THREE.Vector3());
      this.group.add(s);
    }
    this.group.visible = false;
    this.group.renderOrder = 5;
    scene.add(this.group);
  }

  /** Each frame. `on`: a tour wants it; `anchor`: the wanderer's feet; `heading`: theirs;
      `goal`: where the tour goes next (world), or null to rest at the shoulder. */
  update(dt: number, on: boolean, anchor: THREE.Vector3, heading: number, goal: THREE.Vector3 | null): void {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0;
    this.shown += ((on ? 1 : 0) - this.shown) * Math.min(1, step * (on ? 1.2 : 2.5));
    if (this.shown < 0.003) {
      this.group.visible = false;
      this.placed = false;
      return;
    }
    this.group.visible = true;
    this.t += step;
    // where it wants to be: ahead on the way, or at the shoulder (to the right, a little up)
    if (goal) {
      this.tmp.set(goal.x - anchor.x, 0, goal.z - anchor.z);
      const d = this.tmp.length();
      if (d > 1e-3) this.tmp.divideScalar(d);
      // far ahead enough (and a little to the side) to be seen past the wanderer, not behind it
      const lead = Math.min(7, Math.max(0, d - 0.6)), side = Math.min(1, d / 6) * 0.9;
      this.want.set(anchor.x + this.tmp.x * lead - this.tmp.z * side, Math.max(anchor.y, goal.y) + 1.8, anchor.z + this.tmp.z * lead + this.tmp.x * side);
      // waiting at the goal: a slow circle above it
      if (d < 5) this.want.add(this.tmp.set(Math.cos(this.t * 0.6) * 0.5, 0, Math.sin(this.t * 0.6) * 0.5));
    } else {
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      this.want.set(anchor.x + rx * 1.3 + fx * 0.4, anchor.y + 2.15 + Math.sin(this.t * 0.9) * 0.12, anchor.z + rz * 1.3 + fz * 0.4);
    }
    // a crossing (a place apart, a room) moves the wanderer at once: the companion comes along
    if (!this.placed || this.pos.distanceTo(this.want) > 30) {
      this.pos.copy(this.want);
      this.vel.set(0, 0, 0);
      for (const p of this.trail) p.copy(this.want);
      this.placed = true;
    }
    // a critically damped glide: soft to start, never a snap
    const k = 2.0;
    this.tmp.subVectors(this.want, this.pos).multiplyScalar(k * k).addScaledVector(this.vel, -2 * k);
    this.vel.addScaledVector(this.tmp, step);
    this.pos.addScaledVector(this.vel, step);
    this.core.position.copy(this.pos);
    this.halo.position.copy(this.pos);
    // the trail: where it was, a moment apart
    this.trailAt += step;
    if (this.trailAt > 0.06) {
      this.trailAt = 0;
      const last = this.trail.pop()!;
      this.trail.unshift(last.copy(this.pos));
    }
    const speed = Math.min(1, this.vel.length() / 3);
    const breathe = 0.82 + 0.18 * Math.sin(this.t * 1.1);
    this.core.material.opacity = this.shown * breathe * 0.9;
    this.halo.material.opacity = this.shown * breathe * 0.16;
    for (let i = 0; i < TRAIL; i++) {
      this.motes[i].position.copy(this.trail[i]);
      this.motes[i].material.opacity = this.shown * speed * 0.5 * (1 - i / TRAIL);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.mats[0]?.map?.dispose();
    for (const m of this.mats) m.dispose();
  }
}
