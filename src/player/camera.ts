/* Third-person camera: glides after the wanderer, eases behind them while they move,
   and never dips under the ground or the water. No shake, ever. */
import * as THREE from "three/webgpu";
import { heightAt, WATER_Y } from "../world/terrain";

export class FollowCamera {
  yaw = 0;
  pitch = 0.36; // slightly high
  dist = 7;
  /** Free flight while flying: the view may look well up, to climb where you look. */
  freeLook = false;
  /** 0..1: drawn back and up to take in the land (genesis). */
  lift = 0;
  private target = new THREE.Vector3();
  private sinceLook = 99;
  private effDist = 7; // shortened when a hillside would block the view
  /** 0 = intro drift over the lake, 1 = following the wanderer. */
  follow = 0;
  private followGoal = 0;
  /** While sitting with an archetype: frame the two of you, the archetype high in the view
      and clear of the choices along the bottom. */
  seatedWith: THREE.Vector3 | null = null;
  /** Diving: the camera follows below the surface, and may look up. */
  underwater = false;
  private seatK = 0;
  /** 0..1 contemplation: the view from the wanderer's own eyes (its body gone), turned slowly
      toward `gaze` (what moves nearby), or straight ahead when there is none. */
  inward = 0;
  gaze: THREE.Vector3 | null = null;
  private gazeAt = new THREE.Vector3();
  private gazeHeld = false;
  /** The gravity point: while a narration shows an animation, its centre. The view composes
      toward it (the wanderer in the foreground, the animation ahead); `frameHold` says how
      firmly (lower while a finger is on the screen, so it never fights the hand). */
  frame: THREE.Vector3 | null = null;
  frameHold = 1;
  private frameK = 0;
  private frameAt = new THREE.Vector3();

  constructor(public cam: THREE.PerspectiveCamera) {}

  look(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    // under the water you may look up at the surface and the moon beyond it
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, this.underwater ? -1.05 : this.freeLook ? -0.95 : -0.15, 1.15);
    this.sinceLook = 0;
  }
  zoom(f: number): void {
    this.dist = THREE.MathUtils.clamp(this.dist * f, 3.2, 12);
  }
  startFollowing(now = false): void {
    this.followGoal = 1;
    if (now) this.follow = 1; // arriving somewhere new: no long glide from the title view
  }
  snapTo(pos: THREE.Vector3): void {
    this.target.set(pos.x, pos.y + 1.3, pos.z);
  }

  update(dt: number, player: THREE.Vector3, heading: number, moving: boolean, t: number, reduced: boolean, flying = false): void {
    this.sinceLook += dt;
    this.follow += (this.followGoal - this.follow) * Math.min(1, dt * 0.7);
    // back above the water, the view settles to its usual range
    if (!this.underwater && !this.freeLook && this.pitch < -0.15) this.pitch += (-0.15 - this.pitch) * Math.min(1, dt * 2);
    // Ease behind the wanderer while they move, unless the viewer is looking around; in flight
    // sooner and more firmly, so steering with the stick turns the view with you (as in Sky).
    if (moving) {
      let d = heading - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const delay = flying ? 0.4 : 1.0;
      const recenterK = THREE.MathUtils.smoothstep(this.sinceLook, delay, delay + 1.5);
      if (recenterK > 0) {
        this.yaw += d * Math.min(1, dt * (flying ? 1.6 : 1.0) * recenterK);
      }
    }
    this.target.lerp(new THREE.Vector3(player.x, player.y + 1.3, player.z), Math.min(1, dt * 5));

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const pitch = this.pitch + (0.98 - this.pitch) * this.lift, dist = this.dist * (1 + 4.5 * this.lift);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // Pull in when the ground would come between the camera and the wanderer.
    let clear = dist;
    for (let k = 1; k <= 10; k++) {
      const d = (dist * k) / 10;
      const px = this.target.x - fx * cp * d, pz = this.target.z - fz * cp * d, py = this.target.y + sp * d;
      if (py < Math.max(heightAt(px, pz), this.underwater ? -1e9 : WATER_Y) + 0.4) {
        clear = Math.max(1.6, (dist * (k - 1)) / 10);
        break;
      }
    }
    this.effDist += (clear - this.effDist) * Math.min(1, dt * (clear < this.effDist ? 10 : 2));
    const ed = this.effDist;
    const followPos = new THREE.Vector3(this.target.x - fx * cp * ed, this.target.y + sp * ed, this.target.z - fz * cp * ed);
    const floor = Math.max(heightAt(followPos.x, followPos.z), this.underwater ? -1e9 : WATER_Y) + 0.35;
    // under the water, stay under it (no bobbing through the surface)
    if (this.underwater) followPos.y = Math.min(followPos.y, WATER_Y - 0.3);
    if (followPos.y < floor) followPos.y = floor;

    // The intro: low over the shallows, drifting slowly, looking out toward the far island.
    const drift = reduced ? 0 : t;
    const introPos = new THREE.Vector3(Math.sin(drift * 0.03) * 3, 2.2, 16 - Math.sin(drift * 0.02) * 3);
    const introLook = new THREE.Vector3(-45, 8, -150); // a little left: the shore's tree stays clear of the title

    const k = THREE.MathUtils.smoothstep(this.follow, 0, 1);
    this.cam.position.copy(introPos).lerp(followPos, k);
    const look = introLook.clone().lerp(this.target, k);
    this.seatK += ((this.seatedWith ? 1 : 0) - this.seatK) * Math.min(1, dt * 1.2);
    if (this.seatK > 0.001) {
      const other = this.seatedWith ?? look;
      // over the shoulder, a little to one side, looking low so both figures sit high in the frame
      const a = this.yaw + 0.5;
      const side = new THREE.Vector3(this.target.x + Math.sin(a) * 3.6, this.target.y + 0.35, this.target.z + Math.cos(a) * 3.6);
      side.y = Math.max(side.y, Math.max(heightAt(side.x, side.z), WATER_Y) + 0.5);
      const low = this.target.clone().lerp(new THREE.Vector3(other.x, other.y + 1.1, other.z), 0.55);
      low.y -= 1.1;
      const s = THREE.MathUtils.smoothstep(this.seatK, 0, 1);
      this.cam.position.lerp(side, s);
      look.lerp(low, s);
    }
    // the gravity point: turn the look from the wanderer toward the animation, keeping both in view
    const fGoal = this.frame ? this.frameHold : 0;
    this.frameK += (fGoal - this.frameK) * Math.min(1, dt * (fGoal > this.frameK ? 0.8 : 3));
    if (this.frame) this.frameAt.copy(this.frame);
    if (this.frameK > 0.001 && this.seatK < 0.5) {
      const cp = this.cam.position, d = look.distanceTo(cp);
      const toT = look.clone().sub(cp).normalize(), toG = this.frameAt.clone().sub(cp).normalize();
      look.copy(cp).addScaledVector(toT.lerp(toG, THREE.MathUtils.smoothstep(this.frameK, 0, 1) * 0.62).normalize(), d);
    }
    if (this.inward > 0.001) {
      const eye = new THREE.Vector3(player.x, player.y + 1.6, player.z);
      const ahead = eye.clone().add(new THREE.Vector3(-Math.sin(this.yaw) * 20, 0.8, -Math.cos(this.yaw) * 20));
      if (!this.gazeHeld) (this.gazeAt.copy(look), (this.gazeHeld = true));
      // the gaze glides from one thing to the next, never snaps
      this.gazeAt.lerp(this.gaze ?? ahead, Math.min(1, dt * 0.4));
      const s = THREE.MathUtils.smoothstep(this.inward, 0, 1);
      this.cam.position.lerp(eye, s);
      look.lerp(this.gazeAt, s);
    } else this.gazeHeld = false;
    this.cam.lookAt(look);
  }
}
