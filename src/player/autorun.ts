/* Auto-walk (v5 item 3; the owner: "auto-run… will add that too"). The wanderer goes on by itself
   at a gentle walking pace, steering softly over the land: toward one grove, home or garden after
   another (as autofly's low flight does), in wide gentle turns. It keeps to dry land: water ahead
   turns it aside, and so does being held up (a wall, a stone: the controller's colliders hold it,
   so it never passes through anything). The stick, the button or a tap takes over. It gives the
   controller a stick to push each frame, as a thumb would, so every rule of walking still holds. */
import * as THREE from "three/webgpu";
import { heightCoarse, WATER_Y, WORLD_R } from "../world/terrain";
import type { Place } from "./autofly";

const TURN = 0.45; // radians a second at most
const PUSH = 0.62; // a gentle walk (~1.7 m/s)

export class Autorun {
  active = false;
  private heading = 0;
  private target = new THREE.Vector2();
  private visited: Place[] = [];
  private stuckT = 0;
  private dodge = 0;
  private dodgeT = 0;
  private last = new THREE.Vector2();

  constructor(private places: Place[]) {}

  start(pos: THREE.Vector3, heading: number): void {
    this.active = true;
    this.heading = heading;
    this.stuckT = 0;
    this.dodgeT = 0;
    this.last.set(pos.x, pos.z);
    this.pick(pos);
  }

  stop(): void {
    this.active = false;
  }

  /** The next place: ahead of it, on land, not lately walked to; else a while on in the same way. */
  private pick(pos: THREE.Vector3): void {
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    if (Math.hypot(pos.x, pos.z) > WORLD_R * 0.55) {
      this.target.set(pos.x * 0.4, pos.z * 0.4);
      return;
    }
    const cands = this.places.filter((q) => {
      const dx = q.x - pos.x, dz = q.z - pos.z, d = Math.hypot(dx, dz);
      return d > 40 && d < 420 && (dx * fx + dz * fz) / d > 0.2 && !this.visited.includes(q) && heightCoarse(q.x, q.z) > WATER_Y + 0.3;
    });
    if (cands.length) {
      const q = cands.reduce((a, b) => (Math.hypot(a.x - pos.x, a.z - pos.z) < Math.hypot(b.x - pos.x, b.z - pos.z) ? a : b));
      this.visited.push(q);
      if (this.visited.length > 10) this.visited.shift();
      this.target.set(q.x, q.z);
    } else {
      const a = this.heading + (Math.random() - 0.5) * 0.9, d = 80 + Math.random() * 80;
      this.target.set(pos.x - Math.sin(a) * d, pos.z - Math.cos(a) * d);
    }
  }

  private wet(x: number, z: number): boolean {
    return heightCoarse(x, z) < WATER_Y + 0.15;
  }

  /** Each frame: the world direction it would walk (a unit x, z) and how hard to push the stick. */
  update(dt: number, pos: THREE.Vector3): { x: number; z: number; push: number } {
    const dx = this.target.x - pos.x, dz = this.target.y - pos.z;
    if (Math.hypot(dx, dz) < 8) this.pick(pos);
    let want = Math.atan2(-dx, -dz);
    // water ahead (8 and 16 m): turn aside, to whichever side is dry, and keep turning till it is
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    if (this.wet(pos.x + fx * 8, pos.z + fz * 8) || this.wet(pos.x + fx * 16, pos.z + fz * 16)) {
      if (!this.dodgeT) {
        const l = this.heading + 0.9, r = this.heading - 0.9;
        const dryL = !this.wet(pos.x - Math.sin(l) * 12, pos.z - Math.cos(l) * 12);
        const dryR = !this.wet(pos.x - Math.sin(r) * 12, pos.z - Math.cos(r) * 12);
        this.dodge = dryL && !dryR ? 1 : dryR && !dryL ? -1 : Math.random() < 0.5 ? 1 : -1;
      }
      this.dodgeT = 2.5;
    }
    // held up (a wall, a great stone): no headway for a moment, so step round it
    const moved = Math.hypot(pos.x - this.last.x, pos.z - this.last.y);
    this.last.set(pos.x, pos.z);
    this.stuckT = moved < 0.4 * dt ? this.stuckT + dt : Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.2) {
      this.stuckT = 0;
      this.dodge = Math.random() < 0.5 ? 1 : -1;
      this.dodgeT = 2;
    }
    if (this.dodgeT > 0) {
      this.dodgeT = Math.max(0, this.dodgeT - dt);
      want = this.heading + this.dodge * 1.4;
      if (!this.dodgeT) this.pick(pos);
    }
    let dh = want - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += THREE.MathUtils.clamp(dh, -TURN * dt * (this.dodgeT ? 2 : 1), TURN * dt * (this.dodgeT ? 2 : 1));
    return { x: -Math.sin(this.heading), z: -Math.cos(this.heading), push: PUSH };
  }
}
