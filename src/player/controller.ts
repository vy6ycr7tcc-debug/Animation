/* Movement: walk, run, glide, jump, swim, fly. Ground comes from the analytic height function;
   solid features are circle colliders. There is no way to fall or fail. */
import * as THREE from "three";
import { colliders, heightAt, WATER_Y } from "../world/terrain";
import type { Pose } from "./wanderer";

// A stroll, not a run. Swimming is buoyant and unhurried.
const WALK = 1.6;
const RUN = 6.0; // holding Run
const AIR_GLIDE = 7.0; // running off an edge, or holding jump in the air
const SWIM = 2.6;
const FLY = 6.0;
const FLY_FAST = 13.0; // flying while holding Run
const CLIMB = 4.5; // rising or sinking while flying
const CEILING = 700;
const GRAVITY = 16;
const JUMP_V = 5.6;
const SWIM_DEPTH = 1.0; // ground this far under water means swimming
const SWIM_FEET = WATER_Y - 1.0; // feet height while swimming (head just above the surface)
const BODY_R = 0.3;

export interface MoveInput {
  x: number; // right
  y: number; // forward
  glide: boolean;
  /** Jump held: in the air, the wanderer glides down slowly; while flying, rises. */
  hold?: boolean;
  /** While flying: sink. */
  down?: boolean;
}

export class Controller {
  pos = new THREE.Vector3(0, 0.35, 5);
  vel = new THREE.Vector3();
  heading = 0; // radians; 0 faces -z
  vy = 0;
  grounded = true;
  swimming = false;
  pose: Pose = "idle";
  gliding = false;
  /** Free flight: no gravity; rise and sink at will, as high as you like. */
  flying = false;
  speed = 0;
  /** Distance travelled, for footprints and footstep sounds. */
  odometer = 0;
  onLand: (() => void) | null = null;
  /** Tap-to-move destination; cleared on arrival or when the player steers. */
  target: THREE.Vector2 | null = null;

  /** Take to the air, or stop flying (then you glide down). */
  toggleFly(): void {
    if (this.flying) {
      this.flying = false;
      return;
    }
    this.flying = true;
    this.grounded = false;
    this.swimming = false;
    this.vy = Math.max(this.vy, 3.5); // a lift to begin
  }

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
    let mag = Math.min(1, Math.hypot(dx, dz));
    if (mag > 0.1) this.target = null;
    else if (this.target) {
      // Walk toward the tapped point, easing in as it arrives.
      const tx = this.target.x - this.pos.x, tz = this.target.y - this.pos.z;
      const d = Math.hypot(tx, tz);
      if (d < 0.35) this.target = null;
      else {
        dx = tx;
        dz = tz;
        mag = Math.min(1, d / 1.2);
      }
    }
    if (mag > 0.001) {
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
    }
    const top = this.flying
      ? input.glide ? FLY_FAST : FLY
      : this.swimming ? SWIM : this.gliding && !this.grounded ? AIR_GLIDE : input.glide ? RUN : WALK;
    const target = mag * top;
    const accel = this.flying ? 2.2 : this.grounded || this.swimming ? (input.glide ? 3.5 : 7) : this.gliding ? 3 : 2;
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
    if (this.flying) {
      // Hover unless asked to rise or sink; ease into each.
      const want = (input.hold ? 1 : 0) - (input.down ? 1 : 0);
      this.vy += (want * CLIMB * (input.glide ? 1.8 : 1) - this.vy) * Math.min(1, dt * 2.5);
      this.pos.y = Math.min(CEILING, this.pos.y + this.vy * dt);
      const floor = Math.max(ground, WATER_Y - SWIM_DEPTH);
      if (this.pos.y <= floor + 0.02 && this.vy <= 0) {
        // touching down ends the flight: on land you stand, in water you swim
        this.flying = false;
        this.pos.y = Math.max(ground, this.pos.y);
      }
      this.speed = Math.hypot(this.vel.x, this.vel.z, this.vy);
      this.gliding = false;
      if (this.flying) {
        this.grounded = false;
        this.swimming = false;
        if (mag > 0.05) {
          const want2 = Math.atan2(-dx, -dz);
          let dh = want2 - this.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          this.heading += dh * Math.min(1, dt * 5);
        }
        this.pose = this.speed > 0.6 ? "fly" : "hover";
        return;
      }
    }
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
        // Holding jump on the way down, or running off an edge, opens into a slow glide.
        this.gliding = (!!input.hold || input.glide) && this.vy < 0.5;
        this.vy -= GRAVITY * (this.gliding ? 0.22 : 1) * dt;
        if (this.gliding) this.vy = Math.max(this.vy, -1.25);
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
      if (this.grounded) this.gliding = false;
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
