/* The capsules along the wanderer's bones (about twenty tapered segments, placed by the animated
   skeleton each frame). They were once ray-marched as one fluid body of light; the body is now
   the recorded figure's own mesh in glass light (lightBody.ts), and the capsules only guide the
   motes that flow over the figure. */
import * as THREE from "three/webgpu";

export const SEGMENTS = 20;

export class FluidBody {
  /** Kept for the callers that hide it; nothing is drawn. */
  mesh = new THREE.Object3D();
  readonly a: THREE.Vector3[] = [];
  readonly b: THREE.Vector3[] = [];
  readonly r: THREE.Vector2[] = [];

  constructor(_shared?: unknown) {
    for (let i = 0; i < SEGMENTS; i++) {
      this.a.push(new THREE.Vector3());
      this.b.push(new THREE.Vector3());
      this.r.push(new THREE.Vector2(0.001, 0.001));
    }
    this.mesh.visible = false;
  }

  setSteps(_n: number): void {}

  /** Call after the segments are set. */
  commit(_root: THREE.Vector3): void {}
}
