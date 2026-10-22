/* Lights that rise from where you kneel or lay hands: a few warm motes at a time come up out of
   the ground round the wanderer and drift slowly upward on the air's currents, glimmering, and are
   gone after a few metres. Drawn on the GPU from each light's birth place and time; the CPU only
   writes a light when it is born. Contained: small soft points, few of them, kept out of the line
   from the camera to the wanderer and faded near the lens. */
import * as THREE from "three/webgpu";
import { flow, glimmer, gpuUniforms, lifeEnv, nearLens, pointR, softDot, softPoints, spriteCloud, T, type SpriteCloud } from "../gpu/tsl";

const { cameraPosition, cameraViewMatrix, clamp, dot, float, length, max, mix, smoothstep, step, uniform, vec3, vec4 } = T;

const MAX = 64;
const LIFE = 7.5;

export class Risers {
  points: THREE.Sprite;
  private cloud: SpriteCloud;
  private uT = uniform(0);
  private uDpr = uniform(1);
  private next = 0;
  private wait = 0;
  private t = 0;

  constructor() {
    const mat = softPoints();
    // aP: where it was born; aB: birth time, seed, warmth
    this.cloud = spriteCloud(MAX, { aP: 3, aB: 3 }, mat);
    const { aP, aB } = this.cloud.nodes;
    const age = clamp(this.uT.sub(aB.x).div(LIFE), 0, 1);
    const s = aB.y;
    // it rises slowly, easing off as it goes, carried a little by the currents
    const up = age.mul(float(2).sub(age)).mul(s.mul(1.6).add(1.6));
    const drift = flow(aP.div(2.2).add(vec3(0, up.mul(0.4), 0)), this.uT.mul(0.15)).mul(age.mul(0.9));
    const pos = aP.add(vec3(0, up, 0)).add(drift);
    mat.positionNode = pos;
    const d = cameraViewMatrix.mul(vec4(pos, 1)).z.negate();
    const g = glimmer(s, this.uT, 1.6);
    mat.sizeNode = clamp(s.mul(1.2).add(1.6).mul(18).mul(g.mul(0.2).add(0.8)).div(d), float(1).div(this.uDpr), 7);
    // kept out of the way only in front of the body (the usual fade round the line to the chest
    // took the lights round the wanderer's own feet)
    const toP = gpuUniforms.player.add(vec3(0, 1.1, 0)).sub(cameraPosition);
    const along = dot(pos.sub(cameraPosition), toP).div(max(dot(toP, toP), 1e-3));
    const dSeg = length(pos.sub(cameraPosition.add(toP.mul(clamp(along, 0, 1)))));
    const clear = mix(float(1), smoothstep(0.25, 0.9, dSeg), step(along, 0.9));
    const a = lifeEnv(age, 0.12, 0.55).mul(g).mul(clear).mul(nearLens());
    const col = mix(vec3(1.0, 0.84, 0.58), vec3(0.98, 0.92, 0.8), aB.z);
    mat.colorNode = vec4(col.mul(softDot(pointR())).mul(a).mul(1.5), 1);
    this.points = this.cloud.sprite;
    this.points.renderOrder = 4;
    const b = this.cloud.attrs.aB.array as Float32Array;
    for (let i = 0; i < MAX; i++) b[i * 3] = -1e4; // none alive
    this.cloud.attrs.aB.needsUpdate = true;
    this.cloud.setCount(MAX);
  }

  /** `at`: where the body meets the earth (the knee, the palm, the feet); `on`: kneeling or laying
      hands now. While on, a light is born every ~0.45 s on the ground within `r` of it. */
  update(dt: number, at: THREE.Vector3, ground: (x: number, z: number) => number, on: boolean, dpr: number, reduced: boolean, r = 1.5): void {
    this.t += dt * (reduced ? 0.4 : 1);
    this.uT.value = this.t;
    this.uDpr.value = dpr;
    if (!on) {
      this.wait = Math.min(this.wait, 0.6);
      return;
    }
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = 0.32 + Math.random() * 0.35;
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const a = Math.random() * Math.PI * 2, rr = r * Math.sqrt(Math.random());
    const x = at.x + Math.cos(a) * rr, z = at.z + Math.sin(a) * rr;
    const p = this.cloud.attrs.aP.array as Float32Array;
    const b = this.cloud.attrs.aB.array as Float32Array;
    p.set([x, ground(x, z) + 0.06, z], i * 3);
    b.set([this.t, Math.random(), Math.random()], i * 3);
    this.cloud.attrs.aP.needsUpdate = this.cloud.attrs.aB.needsUpdate = true;
  }
}
