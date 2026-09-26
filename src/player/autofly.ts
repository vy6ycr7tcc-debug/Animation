/* Autofly (Samuel: "new mode: autofly, character routes around going thru low fly touching
   nature and then up the galaxies"). The wanderer flies by itself, in long smooth arcs:
   - low over the land and the lakes, a few metres up, following the ground's rise and fall,
     from one grove, home or crystal garden to the next (the grass, flowers and lanterns answer
     as it passes);
   - then it climbs, up among the planets and the stars, and cruises there a while;
   - then it comes down again somewhere new, and begins again.
   It steers itself: a heading that turns toward the next place at a gentle rate, and a height
   that eases toward the ground ahead (low) or the sky (high). The stick or the button takes over. */
import * as THREE from "three/webgpu";
import { heightAt, WATER_Y, WORLD_R } from "../world/terrain";

export interface Place {
  x: number;
  z: number;
}

type Phase = "low" | "rise" | "high" | "fall";
const LOW_SPEED = 10, HIGH_SPEED = 17;
const LOW_CLEAR = 4.5; // metres over the land or water
const HIGH_ALT = 320; // over the water: up among the planets (50–90 m) and past the stars (150–240 m)
const TURN = 0.32; // radians a second at most: wide, easy arcs
const DUR: Record<Phase, [number, number]> = { low: [60, 95], rise: [22, 30], high: [35, 50], fall: [22, 30] };

export class Autofly {
  active = false;
  phase: Phase = "low";
  private phaseT = 0;
  private phaseLen = 60;
  private target = new THREE.Vector2();
  private heading = 0;
  private speed = 0;
  private vy = 0;
  private visited: Place[] = [];

  constructor(private low: Place[], private high: Place[]) {}

  start(pos: THREE.Vector3, heading: number): void {
    this.active = true;
    this.heading = heading;
    this.speed = 3;
    this.vy = 0;
    this.enter("low");
    this.pick(pos);
  }

  stop(): void {
    this.active = false;
  }

  private enter(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    const [a, b] = DUR[p];
    this.phaseLen = a + Math.random() * (b - a);
  }

  /** The next place: one ahead (within ~70° of the heading), not lately visited; else onward. */
  private pick(pos: THREE.Vector3): void {
    const list = this.phase === "high" ? this.high : this.low;
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    // far out toward the world's edge: turn home
    if (Math.hypot(pos.x, pos.z) > WORLD_R * 0.6) {
      this.target.set(pos.x * 0.3 + (Math.random() - 0.5) * 400, pos.z * 0.3 + (Math.random() - 0.5) * 400);
      return;
    }
    const cands = list.filter((q) => {
      const dx = q.x - pos.x, dz = q.z - pos.z, d = Math.hypot(dx, dz);
      return d > 90 && d < 650 && (dx * fx + dz * fz) / d > 0.35 && !this.visited.includes(q);
    });
    if (cands.length) {
      const q = cands[Math.floor(Math.random() * cands.length)];
      this.visited.push(q);
      if (this.visited.length > 12) this.visited.shift();
      this.target.set(q.x, q.z);
    } else {
      const a = this.heading + (Math.random() - 0.5) * 1.2, d = 160 + Math.random() * 160;
      this.target.set(pos.x - Math.sin(a) * d, pos.z - Math.cos(a) * d);
    }
  }

  /** Each frame: moves the wanderer; returns its heading, speed and climb. */
  update(dt: number, pos: THREE.Vector3): { heading: number; speed: number; vy: number } {
    this.phaseT += dt;
    if (this.phaseT > this.phaseLen) this.enter(this.phase === "low" ? "rise" : this.phase === "rise" ? "high" : this.phase === "high" ? "fall" : "low");
    // steer toward the next place, gently
    const dx = this.target.x - pos.x, dz = this.target.y - pos.z;
    if (Math.hypot(dx, dz) < 30) this.pick(pos);
    const want = Math.atan2(-dx, -dz);
    let dh = want - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += THREE.MathUtils.clamp(dh, -TURN * dt, TURN * dt);
    const high = this.phase === "high" || this.phase === "rise";
    const wantSpeed = high ? HIGH_SPEED : LOW_SPEED;
    this.speed += (wantSpeed - this.speed) * Math.min(1, dt * 0.5);
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    pos.x += fx * this.speed * dt;
    pos.z += fz * this.speed * dt;
    // height: over the ground ahead (the highest of the next ~40 m, so no hill is struck), or the sky
    let ground = -Infinity;
    for (let s = 0; s <= 40; s += 8) ground = Math.max(ground, heightAt(pos.x + fx * s, pos.z + fz * s), WATER_Y);
    const lowAlt = ground + LOW_CLEAR;
    const wantY = this.phase === "low" ? lowAlt : this.phase === "high" ? Math.max(lowAlt + 60, WATER_Y + HIGH_ALT) : this.phase === "rise" ? Math.max(lowAlt, WATER_Y + HIGH_ALT * Math.min(1, this.phaseT / this.phaseLen)) : lowAlt;
    const wantVy = THREE.MathUtils.clamp((wantY - pos.y) * 0.9, this.phase === "fall" ? -16 : -6, this.phase === "rise" ? 18 : 8);
    this.vy += (wantVy - this.vy) * Math.min(1, dt * 1.5);
    pos.y = Math.max(pos.y + this.vy * dt, heightAt(pos.x, pos.z) + 1.2, WATER_Y + 1.2);
    if (this.phase === "fall" && pos.y < lowAlt + 3) this.enter("low");
    return { heading: this.heading, speed: Math.hypot(this.speed, this.vy), vy: this.vy };
  }

  /** Where the camera would like to look: level and a little down low, up toward the sky high. */
  get pitch(): number {
    return this.phase === "low" ? 0.18 : this.phase === "fall" ? 0.3 : -0.12;
  }
}
