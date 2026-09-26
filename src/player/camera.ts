/* Third-person camera: glides after the wanderer, eases behind them while they move,
   and never dips under the ground or the water. No shake, ever. */
import * as THREE from "three/webgpu";
import { heightAt, WATER_Y } from "../world/terrain";

export class FollowCamera {
  yaw = 0;
  pitch = 0.36; // slightly high
  dist = 7;
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

  constructor(public cam: THREE.PerspectiveCamera) {}

  look(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    // under the water you may look up at the surface and the moon beyond it
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, this.underwater ? -1.05 : -0.15, 1.15);
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

  update(dt: number, player: THREE.Vector3, heading: number, moving: boolean, t: number, reduced: boolean): void {
    this.sinceLook += dt;
    this.follow += (this.followGoal - this.follow) * Math.min(1, dt * 0.7);
    // back above the water, the view settles to its usual range
    if (!this.underwater && this.pitch < -0.15) this.pitch += (-0.15 - this.pitch) * Math.min(1, dt * 2);
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
      if (py < Math.max(heightAt(px, pz), this.underwater ? -1e9 : WATER_Y) + 0.4) {
        clear = Math.max(1.6, (this.dist * (k - 1)) / 10);
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
    const introLook = new THREE.Vector3(0, 6, -150);

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
    this.cam.lookAt(look);
  }
}
