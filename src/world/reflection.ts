/* A planar reflection of the world above the water (the island, the stations, the
   wanderer, the lights), rendered from a mirrored camera into a half-resolution texture.
   The water shader reads it, bends it with its ripples, and blends it over the reflected sky.
   Clipping uses an oblique near plane (as three's Reflector does), so nothing under the water
   is ever mirrored. */
import * as THREE from "three";

export class Reflection {
  target: THREE.WebGLRenderTarget;
  textureMatrix = new THREE.Matrix4();
  enabled = true;
  private cam = new THREE.PerspectiveCamera();
  private plane = new THREE.Plane();
  private clip = new THREE.Vector4();
  private q = new THREE.Vector4();
  private v = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private rot = new THREE.Matrix4();

  constructor() {
    this.target = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 0 });
    this.target.texture.generateMipmaps = false;
  }

  setSize(w: number, h: number): void {
    this.target.setSize(Math.max(64, Math.round(w / 2)), Math.max(64, Math.round(h / 2)));
  }

  /** Render the mirrored view. `hide` are objects not to be reflected (water, sky). */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, hide: THREE.Object3D[]): void {
    if (!this.enabled) return;
    const cam = this.cam;
    // Mirror the camera across y = 0.
    cam.position.set(camera.position.x, -camera.position.y, camera.position.z);
    this.rot.extractRotation(camera.matrixWorld);
    this.lookAt.set(0, 0, -1).applyMatrix4(this.rot).add(camera.position);
    this.lookAt.y = -this.lookAt.y;
    cam.up.set(0, 1, 0).applyMatrix4(this.rot);
    cam.up.y = -cam.up.y;
    cam.lookAt(this.lookAt);
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);

    // Oblique near plane at the water surface (Lengyel), so only what is above it is drawn.
    this.plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.02, 0));
    this.plane.applyMatrix4(cam.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = cam.projectionMatrix.elements;
    this.q.x = (Math.sign(this.clip.x) + pm[8]) / pm[0];
    this.q.y = (Math.sign(this.clip.y) + pm[9]) / pm[5];
    this.q.z = -1.0;
    this.q.w = (1.0 + pm[10]) / pm[14];
    this.clip.multiplyScalar(2.0 / this.clip.dot(this.q));
    pm[2] = this.clip.x;
    pm[6] = this.clip.y;
    pm[10] = this.clip.z + 1.0;
    pm[14] = this.clip.w;

    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const prevClear = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearAlpha(prevClear);
    renderer.shadowMap.autoUpdate = prevShadow;
    hide.forEach((o, i) => (o.visible = vis[i]));
    this.v.set(0, 0, 0);
  }
}
