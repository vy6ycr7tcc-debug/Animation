/* Third-person camera: glides after the wanderer, eases behind them while they move,
   and never dips under the ground or the water. No shake, ever. */
import * as THREE from "three";
import { heightAt, WATER_Y } from "../world/terrain";

export class FollowCamera {
  yaw = 0;
  pitch = 0.28;
  dist = 6.5;
  private target = new THREE.Vector3();
  private sinceLook = 99;
  private effDist = 6.5; // shortened when a hillside would block the view
  /** 0 = intro drift over the lake, 1 = following the wanderer. */
  follow = 0;
  private followGoal = 0;

  constructor(public cam: THREE.PerspectiveCamera) {}

  look(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -0.15, 1.15);
    this.sinceLook = 0;
  }
  zoom(f: number): void {
    this.dist = THREE.MathUtils.clamp(this.dist * f, 3.2, 12);
  }
  startFollowing(): void {
    this.followGoal = 1;
  }
  snapTo(pos: THREE.Vector3): void {
    this.target.set(pos.x, pos.y + 1.3, pos.z);
  }

  update(dt: number, player: THREE.Vector3, heading: number, moving: boolean, t: number, reduced: boolean): void {
    this.sinceLook += dt;
    this.follow += (this.followGoal - this.follow) * Math.min(1, dt * 0.7);
    // Ease behind the wanderer while they walk, unless the viewer is looking around.
    if (moving && this.sinceLook > 1.5) {
      let d = heading - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 0.9);
    }
    this.target.lerp(new THREE.Vector3(player.x, player.y + 1.3, player.z), Math.min(1, dt * 5));

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // Pull in when the ground would come between the camera and the wanderer.
    let clear = this.dist;
    for (let k = 1; k <= 10; k++) {
      const d = (this.dist * k) / 10;
      const px = this.target.x - fx * cp * d, pz = this.target.z - fz * cp * d, py = this.target.y + sp * d;
      if (py < Math.max(heightAt(px, pz), WATER_Y) + 0.4) {
        clear = Math.max(1.6, (this.dist * (k - 1)) / 10);
        break;
      }
    }
    this.effDist += (clear - this.effDist) * Math.min(1, dt * (clear < this.effDist ? 10 : 2));
    const ed = this.effDist;
    const followPos = new THREE.Vector3(this.target.x - fx * cp * ed, this.target.y + sp * ed, this.target.z - fz * cp * ed);
    const floor = Math.max(heightAt(followPos.x, followPos.z), WATER_Y) + 0.35;
    if (followPos.y < floor) followPos.y = floor;

    // The intro: low over the water, drifting slowly toward the sunrise.
    const drift = reduced ? 0 : t;
    const introPos = new THREE.Vector3(Math.sin(drift * 0.03) * 3, 1.6, 22 - Math.sin(drift * 0.02) * 4);
    const introLook = new THREE.Vector3(0, 3, -60);

    const k = THREE.MathUtils.smoothstep(this.follow, 0, 1);
    this.cam.position.copy(introPos).lerp(followPos, k);
    const look = introLook.clone().lerp(this.target, k);
    this.cam.lookAt(look);
  }
}
