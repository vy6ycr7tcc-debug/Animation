/* Movement: walk, glide, jump, swim. Ground comes from the analytic height function;
   solid features are circle colliders. There is no way to fall or fail. */
import * as THREE from "three";
import { colliders, heightAt, WATER_Y } from "../world/terrain";
import type { Pose } from "./wanderer";

const WALK = 3.0;
const GLIDE = 6.5;
const SWIM = 3.4;
const GRAVITY = 16;
const JUMP_V = 5.6;
const SWIM_DEPTH = 1.0; // ground this far under water means swimming
const SWIM_FEET = WATER_Y - 1.0; // feet height while swimming (head just above the surface)
const BODY_R = 0.3;

export interface MoveInput {
  x: number; // right
  y: number; // forward
  glide: boolean;
}

export class Controller {
  pos = new THREE.Vector3(0, 0.35, 5);
  vel = new THREE.Vector3();
  heading = 0; // radians; 0 faces -z
  vy = 0;
  grounded = true;
  swimming = false;
  pose: Pose = "idle";
  speed = 0;
  /** Distance travelled, for footprints and footstep sounds. */
  odometer = 0;
  onLand: (() => void) | null = null;

  jump(): void {
    if (this.grounded && !this.swimming) {
      this.vy = JUMP_V;
      this.grounded = false;
    }
  }

  update(dt: number, input: MoveInput, camYaw: number): void {
    // Camera-relative direction.
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = fx * input.y + rx * input.x;
    let dz = fz * input.y + rz * input.x;
    const mag = Math.min(1, Math.hypot(dx, dz));
    if (mag > 0.001) {
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
    }
    const top = this.swimming ? SWIM : input.glide ? GLIDE : WALK;
    const target = mag * top;
    const accel = this.grounded || this.swimming ? 7 : 2;
    this.vel.x += (dx * target - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (dz * target - this.vel.z) * Math.min(1, dt * accel);

    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const p = new THREE.Vector2(nx, nz);
    // Push out of solid features.
    for (const c of colliders) {
      if (this.pos.y > c.top) continue;
      const ddx = p.x - c.x, ddz = p.y - c.z;
      const d = Math.hypot(ddx, ddz);
      const min = c.r + BODY_R;
      if (d < min && d > 1e-4) {
        p.x = c.x + (ddx / d) * min;
        p.y = c.z + (ddz / d) * min;
      }
    }
    const moved = Math.hypot(p.x - this.pos.x, p.y - this.pos.z);
    this.pos.x = p.x;
    this.pos.z = p.y;
    this.odometer += moved;
    this.speed = moved / Math.max(dt, 1e-4);

    const ground = heightAt(this.pos.x, this.pos.z);
    const wasSwimming = this.swimming;
    this.swimming = ground < WATER_Y - SWIM_DEPTH && this.pos.y < WATER_Y + 0.3;

    if (this.swimming) {
      // Float at the surface; ease in from a jump or a walk off the edge.
      this.vy = 0;
      this.pos.y += (SWIM_FEET - this.pos.y) * Math.min(1, dt * (wasSwimming ? 4 : 2.5));
      this.grounded = false;
    } else {
      const floor = Math.max(ground, wasSwimming ? SWIM_FEET : -Infinity);
      if (this.grounded && ground > this.pos.y - 0.7 && ground < this.pos.y + 0.8) {
        // Follow the ground up and down gentle slopes and steps.
        this.pos.y += (ground - this.pos.y) * Math.min(1, dt * 14);
      } else {
        this.vy -= GRAVITY * dt;
        this.pos.y += this.vy * dt;
        this.grounded = false;
        if (this.pos.y <= floor) {
          this.pos.y = floor;
          this.vy = 0;
          if (!this.grounded) this.onLand?.();
          this.grounded = true;
        }
      }
      if (ground > this.pos.y) this.pos.y = ground; // never sink into a rising shore
    }

    if (mag > 0.05) {
      const want = Math.atan2(-dx, -dz);
      let dh = want - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += dh * Math.min(1, dt * 8);
    }
    this.pose = this.swimming
      ? "swim"
      : !this.grounded
        ? "air"
        : this.speed < 0.25
          ? "idle"
          : input.glide && this.speed > WALK + 0.5
            ? "glide"
            : "walk";
  }
}
