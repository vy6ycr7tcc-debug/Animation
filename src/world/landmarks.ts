/* Landmarks across the open world: the six forms (beam and ring, pillars and veil, spiral
   garden, throne, arch, crossing rings). Each responds to the wanderer's presence as they pass;
   the quiet ones (veil, throne) open further when the wanderer is still nearby. Nothing waits
   to be used, and nothing needs to be finished. */
import * as THREE from "three";
import type { AudioEngine } from "../core/audio";
import type { Wanderer } from "../player/wanderer";
import { skyUniforms } from "./sky";
import { buildLandmarks, type Frame, type Hooks, type Station } from "./stations";

export class Landmarks {
  list: Station[];
  timeScale = 1;
  private hooks: Hooks;
  private still = 0;
  private wantTime = 1;
  private wantStars = 0;
  private stars = 0;

  constructor(scene: THREE.Scene, audio: AudioEngine, private wanderer: Wanderer) {
    this.list = buildLandmarks();
    for (const s of this.list) scene.add(s.group);
    this.hooks = {
      audio,
      sit: () => {},
      reach: (on) => wanderer.setGesture(on ? "reach" : "none"),
      setTimeScale: (k) => (this.wantTime = Math.min(this.wantTime, k)),
      setStarBoost: (k) => (this.wantStars = Math.max(this.wantStars, k)),
      board: () => {},
      visitedCount: () => 0,
    };
  }

  update(t: number, dt: number, player: THREE.Vector3, speed: number, reduced: boolean): void {
    this.still = speed < 0.2 ? this.still + dt : 0;
    this.wantTime = 1;
    this.wantStars = 0;
    for (const s of this.list) {
      const d = s.distance(player);
      const near = d < s.radius + 1;
      // Pausing near a landmark counts as sitting with it.
      // Far beyond the fog a landmark is simply not drawn (it would be invisible anyway).
      const seen = Math.min(1, Math.max(0, (300 - d) / 60));
      const f: Frame = { t, dt, player, reduced, seen, gesture: near && this.still > 1.2 ? "sit" : this.wanderer.gesture };
      if (near && !s.visited) s.markVisited(); // its ring closes once you've been
      s.update(f, this.hooks, near);
    }
    this.timeScale += (this.wantTime - this.timeScale) * Math.min(1, dt * 0.8);
    this.stars += (this.wantStars - this.stars) * Math.min(1, dt * 0.5);
    skyUniforms.uStarBoost.value = this.stars;
  }
}
