/* The coordinator's list of temple-tour scenes — lessons and the tour.
   Each frame it wakes whichever modules are active,
   answers whose seat the wanderer stands near,
   and tells the game loop whether anyone is holding movement.
   It keeps the modules; the walking, the sitting, the loop live elsewhere. */
import * as THREE from "three/webgpu";
import type { SceneModule } from "./lessonKit";

/**
 * Coordinator-owned registry of scene modules.
 * Holds modules only — game loop and sit system live elsewhere.
 */
export class SceneRegistry {
  constructor(public modules: SceneModule[]) {}

  update(dt: number): void {
    for (const m of this.modules) {
      if (m.active) m.update(dt);
    }
  }

  seatFor(p: THREE.Vector3): SceneModule | null {
    for (const m of this.modules) {
      if (m.active && m.nearSeat(p)) return m;
    }
    return null;
  }

  byId(id: string): SceneModule | undefined {
    return this.modules.find((m) => m.id === id);
  }

  get movementHeld(): boolean {
    for (const m of this.modules) {
      if (m.active && m.holdsMovement()) return true;
    }
    return false;
  }
}
