/* Motes of light drifting above the lake, drawn on the GPU. They follow the viewer
   in a wrapping volume, so there are always some nearby and never too many.
   They are carried by the air: a slow breeze through the volume and the currents' eddies on
   top (`flow`), so neighbours drift together, rising and turning as one; each glows on its
   own slow time (`glimmer`), resting dim a while and now and then brightening.
   They answer the wanderer: walking through them stirs those near aside and back in a wake,
   brightening as they are stirred; in stillness some of them come in from round about, on curving
   ways, to circle slowly about the heart, a little brighter for the company, and go back to the
   breeze when you move. Contained: no more of them, kept out of the line from the camera to you. */
import * as THREE from "three/webgpu";
import { flow, glimmer, softPoints, spriteCloud, T, type SpriteCloud, softDot } from "../gpu/tsl";

const { cameraPosition, cameraViewMatrix, cos, dot, float, fract, length, max, mix, mod, pointUV, sin, smoothstep, step, uniform, vec3, vec4, clamp } = T;

/** The breeze through the motes (m/s). */
const BREEZE = [0.16, 0, 0.09];

export class Motes {
  /** The sprite cloud (named `points` as before, so callers can toggle it). */
  points: THREE.Sprite;
  private cloud: SpriteCloud;
  private U = {
    uT: uniform(0), uDpr: uniform(1), uCenter: uniform(new THREE.Vector3()),
    /** the wanderer's heart, its velocity, and how gathered the motes are (0..1, eased here) */
    uP: uniform(new THREE.Vector3(0, -999, 0)), uVel: uniform(new THREE.Vector3()), uGather: uniform(0),
  };
  private gather = 0;
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
    const w = w0.add(flow(w0.div(2.6), U.uT.mul(0.12)).mul(vec3(1.1, 0.8, 1.1)));

    // the wake: near the wanderer as it moves, motes are pushed aside, swept back and lifted,
    // curling on the currents, and brighten as they are stirred
    const rel = w.sub(U.uP);
    const dh = max(length(rel.xz), 0.05);
    const sp = length(U.uVel.xz);
    const stir = float(1).sub(smoothstep(1.5, 6.0, length(rel))).mul(smoothstep(0.3, 2.5, sp));
    const back = U.uVel.mul(-1).div(max(sp, 0.01)).mul(vec3(1, 0, 1));
    const wake = vec3(rel.x, 0, rel.z).div(dh).mul(1.1).add(back.mul(0.7)).add(vec3(0, 0.55, 0))
      .add(flow(w.mul(0.8), U.uT.mul(0.6)).mul(0.45)).mul(stir.mul(1.3));
    const ww = w.add(wake);

    // stillness: two in five of them, from within ~25 m (some sixty), come in one after another to circle the heart
    const h2 = fract(aK.mul(13.7)), h3 = fract(aK.mul(5.29)), h5 = fract(aK.mul(3.11));
    const chosen = step(fract(aK.mul(7.31)), 0.4);
    const near = float(1).sub(smoothstep(22, 28, length(w.xz.sub(U.uP.xz))));
    const e0 = clamp(U.uGather.sub(fract(aK.mul(17.3)).mul(0.45)).div(0.55), 0, 1);
    const e = e0.mul(e0).mul(e0.mul(-2).add(3)).mul(chosen).mul(near);
    const ang = h2.mul(6.2832).add(U.uT.mul(h5.mul(0.08).add(0.1)));
    const rad = h3.mul(2.0).add(1.3).add(sin(U.uT.mul(0.23).add(h2.mul(6.28))).mul(0.25));
    const hy = fract(aK.mul(23.9)).mul(1.8).sub(0.75).add(sin(U.uT.mul(0.31).add(h3.mul(6.28))).mul(0.18));
    const orbit = U.uP.add(vec3(cos(ang).mul(rad), hy, sin(ang).mul(rad)));
    // on their way they curve on the currents and rise a little, never in a straight line
    const arc = sin(e.mul(3.1416));
    const way = flow(w.mul(0.4), U.uT.mul(0.2)).mul(1.6).add(vec3(0, 1.2, 0)).mul(arc);
    const pos = mix(ww, orbit, e).add(way);
    mat.positionNode = pos;

    const d = cameraViewMatrix.mul(vec4(pos, 1)).z.negate();
    const g = glimmer(aK, U.uT);
    mat.sizeNode = clamp(aK.mul(2.2).add(1).mul(16).mul(g.mul(0.18).add(0.84)).mul(e.mul(0.35).add(1)).div(d), float(1).div(U.uDpr), 6);
    // the company and the stir make them a little brighter; kept out of the camera's line to you
    const lift = e.mul(0.8).add(stir.mul(0.7)).add(1);
    // (only the line itself: the usual fade near the camera hid most of a circle 6 m from it)
    const toP = U.uP.sub(cameraPosition);
    const along = clamp(dot(pos.sub(cameraPosition), toP).div(max(dot(toP, toP), 1e-3)), 0, 1);
    const dSeg = length(pos.sub(cameraPosition.add(toP.mul(along))));
    const clear = mix(float(1), smoothstep(0.35, 1.3, dSeg), max(e, stir));
    const a = float(1).sub(smoothstep(20, 40, d)).mul(smoothstep(0.6, 3, d)).mul(aK.mul(0.7).add(0.3)).mul(g.mul(0.92))
      .mul(lift).mul(clear);
    const r = length(pointUV.sub(0.5));
    const col = mix(mix(vec3(1.0, 0.9, 0.78), vec3(1.0, 0.72, 0.5), step(0.75, aK)), vec3(1.0, 0.88, 0.74), e.mul(0.5));
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

  /** `heart`: the wanderer's heart; `vel`: its velocity; `still`: its stillness (0..1). */
  update(t: number, center: THREE.Vector3, dpr: number, reduced: boolean, dt = 0, heart?: THREE.Vector3, vel?: THREE.Vector3, still = 0): void {
    this.U.uT.value = reduced ? t * 0.3 : t;
    this.U.uDpr.value = dpr;
    this.U.uCenter.value.copy(center);
    if (heart) this.U.uP.value.copy(heart);
    if (vel) this.U.uVel.value.copy(vel);
    // they come in slowly (~10 s for all of them) and go back to the breeze quickly
    const want = still > 0.6 ? 1 : 0;
    this.gather += (want - this.gather) * Math.min(1, dt * (want ? 0.12 : 0.9));
    this.U.uGather.value = this.gather;
  }
}
