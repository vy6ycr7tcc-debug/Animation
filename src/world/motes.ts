/* Motes of light drifting above the lake, drawn on the GPU. They follow the viewer
   in a wrapping volume, so there are always some nearby and never too many.
   They are carried by the air: a slow breeze through the volume and the currents' eddies on
   top (`flow`), so neighbours drift together, rising and turning as one; each glows on its
   own slow time (`glimmer`), resting dim a while and now and then brightening. */
import * as THREE from "three/webgpu";
import { flow, glimmer, softPoints, spriteCloud, T, type SpriteCloud, softDot } from "../gpu/tsl";

const { cameraViewMatrix, float, length, mix, mod, pointUV, smoothstep, step, uniform, vec3, vec4, clamp } = T;

/** The breeze through the motes (m/s). */
const BREEZE = [0.16, 0, 0.09];

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
    // carried on the breeze, wrapped into an 80-unit box around the viewer
    const blown = base.add(vec3(BREEZE[0], BREEZE[1], BREEZE[2]).mul(U.uT));
    const xz = U.uCenter.xz.add(mod(blown.xz.sub(U.uCenter.xz).add(40), 80)).sub(40);
    const w0 = vec3(xz.x, blown.y, xz.y);
    // and the air's eddies, a few metres across, turning slowly
    mat.positionNode = w0.add(flow(w0.div(2.6), U.uT.mul(0.12)).mul(vec3(1.1, 0.8, 1.1)));
    const d = cameraViewMatrix.mul(vec4(mat.positionNode, 1)).z.negate();
    const g = glimmer(aK, U.uT);
    mat.sizeNode = clamp(aK.mul(2.2).add(1).mul(16).mul(g.mul(0.18).add(0.84)).div(d), float(1).div(U.uDpr), 6);
    const a = float(1).sub(smoothstep(20, 40, d)).mul(smoothstep(0.6, 3, d)).mul(aK.mul(0.7).add(0.3)).mul(g.mul(0.92));
    const r = length(pointUV.sub(0.5));
    const col = mix(vec3(1.0, 0.9, 0.78), vec3(1.0, 0.72, 0.5), step(0.75, aK));
    mat.colorNode = vec4(col.mul(softDot(r.mul(2)).mul(1.22)).mul(a).mul(1.4), 1);
    this.points = this.cloud.sprite;
    this.setCount(count);
  }

  private count = -1;
  setCount(n: number): void {
    n = Math.min(n, this.max);
    if (n === this.count) return; // a new render scale alone changes nothing here: no rebuild
    this.count = n;
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
