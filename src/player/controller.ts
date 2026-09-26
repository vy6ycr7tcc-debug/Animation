/* Movement: walk, run, glide, jump, swim, dive, fly. Ground comes from the analytic height
   function; solid features are circle colliders. There is no way to fall or fail.
   Swimming (as in Abzû and Sky): at the surface the stick swims across the water; tap to dive
   (a small leap and a curving plunge); hold to rise out of the water into flight. Under the
   water you swim where you look, in three dimensions: look down to go deeper, up to rise. Tap
   for a stroke (a burst that eases off; taps in rhythm keep the glide going); hold to rise; let
   go and you sink slowly toward the floor. No breath, no current, nothing to fear. */
import * as THREE from "three/webgpu";
import { colliders, heightAt, WATER_Y } from "../world/terrain";
import type { Pose } from "./wanderer";

// A stroll, not a run. Swimming is buoyant and unhurried.
const WALK = 1.6;
const RUN = 6.0; // holding Run
const AIR_GLIDE = 7.0; // running off an edge, or holding jump in the air
const SWIM = 2.6;
const SWIM_FAST = 4.5; // the thumb at the edge
const UNDER = 3.0; // swimming under the water
const STROKE = 6.0; // the burst of one stroke
const SINK = 1.1; // drifting down under the water when you let go
const FLY = 6.0;
const FLY_FAST = 13.0; // flying while holding Run
const FLY_GLIDE = 7.5; // flying with the stick let go: a steady glide straight ahead
const GLIDE_SINK = 1.6; // how fast that glide comes down
const CLIMB = 4.5; // rising or sinking while flying
const CEILING = 12000; // effectively none: up among the clouds and beyond
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
  /** In the water: sink, while held. */
  down?: boolean;
  /** The camera's pitch (positive looking down): under the water you swim where you look. */
  pitch?: number;
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
  /** Coming in to land: a smooth, steady descent until the feet touch the ground. */
  landing = false;
  private heldAir = 0;
  /** How far below the surface the swimmer has dived (0 at the surface). */
  depth = 0;
  get diving(): boolean {
    return this.swimming && this.depth > 0.4;
  }
  /** The swimmer's own velocity under the water (3D); the stroke's burst, easing off. */
  private swimVel = new THREE.Vector3();
  private burst = 0;
  private surfacing = false;
  private plunge = 0; // a dolphin dive in progress: seconds left
  private holdWater = 0;
  /** How long rise has been held: the climb gathers speed the longer you hold it. */
  private climbHeld = 0;
  speed = 0;
  /** Distance travelled, for footprints and footstep sounds. */
  odometer = 0;
  onLand: (() => void) | null = null;
  /** Tap-to-move destination; cleared on arrival or when the player steers. */
  target: THREE.Vector2 | null = null;

  /** Come down to land (from the "Land" word). */
  land(): void {
    if (this.flying) this.landing = true;
  }

  /** In the water, the round button's tap: at the surface a dive, under it a stroke. */
  stroke(): void {
    if (!this.swimming) return;
    if (this.depth < 0.5) {
      this.plunge = 0.9;
      this.surfacing = false;
      return;
    }
    this.burst = Math.min(STROKE * 1.4, this.burst + STROKE);
  }
  /** The "Dive" word: the same dive as a tap at the surface. */
  dive(): void {
    if (this.swimming && this.depth < 0.5) this.plunge = 0.9;
  }
  /** The "Surface" word: glide up to the surface in a smooth arc. */
  surface(): void {
    if (this.diving) this.surfacing = true;
  }

  jump(): void {
    if (this.grounded && !this.swimming) {
      this.vy = JUMP_V;
      this.grounded = false;
    }
  }

  update(dt: number, input: MoveInput, camYaw: number): void {
    if (this.swimming && !this.flying && (this.depth > 0.5 || this.plunge > 0)) {
      this.swimUnder(dt, input, camYaw);
      return;
    }
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
    // In the air with the stick let go, the wanderer glides on ahead (as in Sky), sinking gently.
    const glideOn = this.flying && mag < 0.05 && !this.landing;
    if (glideOn) {
      dx = -Math.sin(this.heading);
      dz = -Math.cos(this.heading);
      mag = FLY_GLIDE / FLY;
    }
    if (mag > 0.001) {
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
    }
    const top = this.flying
      ? input.glide ? FLY_FAST : FLY
      : this.swimming ? (input.glide ? SWIM_FAST : SWIM) : this.gliding && !this.grounded ? AIR_GLIDE : input.glide ? RUN : WALK;
    // flying without holding the button is a glide: it keeps its speed, steered by the stick
    const target = Math.min(1, mag) * (glideOn ? FLY_GLIDE : this.flying && !input.hold && !input.glide ? FLY_GLIDE : top);
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
      // Hold to rise (gathering speed); let go to drift gently down; "Land" brings you down.
      if (input.hold) this.landing = false;
      this.climbHeld = input.hold ? this.climbHeld + dt : 0;
      const surge = 1 + Math.min(8, this.climbHeld * this.climbHeld * 0.35); // up to ~40 m/s after a few seconds
      const wantVy = input.hold
        ? CLIMB * surge * (input.glide ? 1.8 : 1)
        : this.landing
          ? -Math.min(14, 3 + (this.pos.y - ground) * 0.25)
          : -GLIDE_SINK; // not rising: always a glide, sinking gently
      this.vy += (wantVy - this.vy) * Math.min(1, dt * (input.hold ? 2.5 : 1.8));
      this.pos.y = Math.min(CEILING, this.pos.y + this.vy * dt);
      const floor = Math.max(ground, WATER_Y - SWIM_DEPTH);
      if (this.pos.y <= floor + 0.02 && this.vy <= 0) {
        // touching down ends the flight: on land you stand, in water you swim
        this.flying = false;
        this.landing = false;
        this.pos.y = Math.max(ground, this.pos.y);
      }
      this.speed = Math.hypot(this.vel.x, this.vel.z, this.vy);
      this.gliding = false;
      if (this.flying) {
        this.grounded = false;
        this.swimming = false;
        if (mag > 0.05 && !glideOn) {
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
    if (!this.swimming) this.depth = 0;

    if (this.swimming) {
      // Float at the surface. Holding Down sinks you under; holding the button a moment lifts
      // you out of the water into flight.
      const deepest = Math.max(0, SWIM_FEET - (ground + 0.4));
      if (input.down) this.depth = Math.min(deepest, this.depth + 2.4 * dt);
      else this.depth = Math.max(0, this.depth - 3 * dt);
      this.holdWater = input.hold ? this.holdWater + dt : 0;
      if (this.holdWater > 0.3) {
        this.holdWater = 0;
        this.swimming = false;
        this.flying = true;
        this.landing = false;
        this.vy = 4;
        this.pos.y = WATER_Y + 0.35;
        this.pose = "fly";
        return;
      }
      this.vy = 0;
      this.pos.y += (SWIM_FEET - this.depth - this.pos.y) * Math.min(1, dt * (wasSwimming ? 4 : 2.5));
      this.grounded = false;
    } else {
      const floor = Math.max(ground, wasSwimming ? SWIM_FEET : -Infinity);
      if (this.grounded && ground > this.pos.y - 0.7 && ground < this.pos.y + 0.8) {
        // Follow the ground up and down gentle slopes and steps.
        this.pos.y += (ground - this.pos.y) * Math.min(1, dt * 14);
      } else {
        // Holding the button in the air takes off into flight (as the jump crests);
        // running off an edge opens into a slow glide.
        this.heldAir = input.hold ? this.heldAir + dt : 0;
        if (input.hold && this.heldAir > 0.18 && this.vy < 2.2 && !this.swimming) {
          this.flying = true;
          this.landing = false;
          this.vy = Math.max(this.vy, 1.5);
        }
        this.gliding = input.glide && !input.hold && this.vy < 0.5;
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
      if (this.grounded) {
        this.gliding = false;
        this.heldAir = 0;
      }
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

  /** Under the water: swim where you look. */
  private swimUnder(dt: number, input: MoveInput, camYaw: number): void {
    const pitch = input.pitch ?? 0.3;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    // forward follows the camera down and up; right stays level
    const dir = new THREE.Vector3(fx * cp * input.y + rx * input.x, -sp * input.y, fz * cp * input.y + rz * input.x);
    const mag = Math.min(1, dir.length());
    if (mag > 0.001) dir.divideScalar(dir.length());
    this.target = null;
    // the dive: a curving plunge forward and down from the surface
    if (this.plunge > 0) {
      this.plunge -= dt;
      const hx = -Math.sin(this.heading), hz = -Math.cos(this.heading);
      dir.set(hx * 0.55, -1, hz * 0.55).normalize();
      this.swimVel.lerp(dir.clone().multiplyScalar(4.2), Math.min(1, dt * 6));
    } else {
      const want = dir.multiplyScalar(mag * (input.glide ? SWIM_FAST : UNDER));
      // a stroke's burst carries you on the way you are heading, easing off over a second or so
      if (this.burst > 0.01) {
        const along = this.swimVel.lengthSq() > 0.04 ? this.swimVel.clone().normalize() : new THREE.Vector3(fx * cp, -sp, fz * cp);
        want.addScaledVector(along, this.burst);
      }
      if (input.hold) want.y += 2.6;
      if (input.down) want.y -= 2.6;
      // let go of everything and you sink gently toward the floor, as flight glides down:
      // going deeper takes no effort at all
      else if (!input.hold && !this.surfacing && mag < 0.05 && this.burst < 0.1) want.y -= SINK;
      if (this.surfacing) {
        want.y = Math.max(want.y, 3.2);
        if (input.down) this.surfacing = false;
      }
      this.swimVel.lerp(want, Math.min(1, dt * (mag > 0.05 || this.burst > 0.1 || input.hold || input.down || this.surfacing ? 2.4 : 1.4)));
    }
    this.burst *= Math.exp(-dt * 1.6);

    // move, gliding along the floor and the surface rather than stopping at them
    this.pos.addScaledVector(this.swimVel, dt);
    const ground = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < ground + 0.25) {
      this.pos.y = ground + 0.25;
      if (this.swimVel.y < 0) this.swimVel.y *= 0.2;
    }
    const moved = this.swimVel.length() * dt;
    this.odometer += moved;
    this.speed = this.swimVel.length();
    this.depth = Math.max(0, SWIM_FEET - this.pos.y);
    // coming up: rest at the surface, or, rising fast, leap clear of it (hold on to fly)
    if (this.pos.y >= SWIM_FEET && this.plunge <= 0) {
      this.surfacing = false;
      if (this.swimVel.y > 2.4 && input.hold) {
        this.swimming = false;
        this.grounded = false;
        this.vy = 5.5;
        this.pos.y = SWIM_FEET + 0.1;
        this.vel.set(this.swimVel.x, 0, this.swimVel.z);
      } else {
        this.pos.y = SWIM_FEET;
        this.depth = 0;
        this.vel.set(this.swimVel.x, 0, this.swimVel.z);
        this.vy = 0;
      }
      this.swimVel.set(0, 0, 0);
      this.burst = 0;
    }
    if (ground >= WATER_Y - SWIM_DEPTH) {
      // the shallows: out of the deep, onto your feet
      this.swimming = false;
      this.depth = 0;
      this.swimVel.set(0, 0, 0);
      this.pos.y = Math.max(this.pos.y, ground);
    }
    const hs = Math.hypot(this.swimVel.x, this.swimVel.z);
    if (hs > 0.2) {
      const want = Math.atan2(-this.swimVel.x, -this.swimVel.z);
      let dh = want - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += dh * Math.min(1, dt * 4);
    }
    this.vel.set(this.swimVel.x, 0, this.swimVel.z);
    this.grounded = false;
    this.gliding = false;
    this.pose = "swim";
  }
}
