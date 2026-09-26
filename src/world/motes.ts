/* Motes of light drifting above the lake, drawn on the GPU. They follow the viewer
   in a wrapping volume, so there are always some nearby and never too many. */
import * as THREE from "three/webgpu";
import { softPoints, spriteCloud, T, type SpriteCloud } from "../gpu/tsl";

const { cameraViewMatrix, cos, float, length, mix, mod, pointUV, positionView, sin, smoothstep, step, uniform, vec2, vec3, vec4, clamp } = T;

export class Motes {
  /** The sprite cloud (named `points` as before, so callers can toggle it). */
  points: THREE.Sprite;
  private cloud: SpriteCloud;
  private U = { uT: uniform(0), uDpr: uniform(1), uCenter: uniform(new THREE.Vector3()) };
  private max = 2400;

  constructor(count: number) {
    const mat = softPoints();
    this.cloud = spriteCloud(this.max, { base: 3, aK: 1 }, mat);
    const { base, aK } = this.cloud.nodes;
    const U = this.U;
    const drift = vec3(sin(U.uT.mul(0.11).add(aK.mul(9))), sin(U.uT.mul(0.17).add(aK.mul(4))).mul(0.6), cos(U.uT.mul(0.09).add(aK.mul(7)))).mul(1.6);
    const p = base.add(drift);
    // wrap into an 80-unit box around the viewer
    const xz = U.uCenter.xz.add(mod(p.xz.sub(U.uCenter.xz).add(40), 80)).sub(40);
    mat.positionNode = vec3(xz.x, p.y, xz.y);
    const d = cameraViewMatrix.mul(vec4(mat.positionNode, 1)).z.negate();
    mat.sizeNode = clamp(aK.mul(2.2).add(1).mul(16).div(d), float(1).div(U.uDpr), 6);
    const a = float(1).sub(smoothstep(20, 40, d)).mul(smoothstep(0.6, 3, d)).mul(aK.mul(0.7).add(0.3)).mul(sin(U.uT.mul(1.4).add(aK.mul(40))).mul(0.4).add(0.6));
    const r = length(pointUV.sub(0.5));
    const col = mix(vec3(1.0, 0.9, 0.78), vec3(1.0, 0.72, 0.5), step(0.75, aK));
    mat.colorNode = vec4(col.mul(smoothstep(0.5, 0, r)).mul(a).mul(1.4), 1);
    void positionView;
    void vec2;
    this.points = this.cloud.sprite;
    this.setCount(count);
  }

  setCount(n: number): void {
    n = Math.min(n, this.max);
    const p = this.cloud.attrs.base.array as Float32Array;
    const k = this.cloud.attrs.aK.array as Float32Array;
    let s = 11;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      p.set([(R() - 0.5) * 80, 0.4 + Math.pow(R(), 1.8) * 9, (R() - 0.5) * 80], i * 3);
      k[i] = R();
    }
    this.cloud.attrs.base.needsUpdate = this.cloud.attrs.aK.needsUpdate = true;
    this.cloud.setCount(n);
  }

  update(t: number, center: THREE.Vector3, dpr: number, reduced: boolean): void {
    this.U.uT.value = reduced ? t * 0.3 : t;
    this.U.uDpr.value = dpr;
    this.U.uCenter.value.copy(center);
  }
}
