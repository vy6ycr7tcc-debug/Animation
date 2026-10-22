/* Weather (the owner: "add rain and clouds"). Now and then a shower passes: the clouds thicken
   and darken over the sky (atmosphere.ts `cloudUniforms.cover`), the haze closes in a little and
   the moon dims; rain falls round you in fine streaks slanting on the wind, rings open on the water
   near you, and its sound comes up under everything; then it clears. The first comes a few minutes
   in, the next every six to twelve minutes, each one to three minutes long. Never in the places
   apart or under the water. ⋮ → "Rain now and then" turns it off (saved).

   The streaks: a box of drops round the camera, each a thin quad turned to face you about the
   vertical, falling at ~8 m/s and wrapping round, drawn on the GPU from where each began and the
   clock. Faint (normal light on rain is a glint, never a glare), fading near the lens and far
   off. */
import * as THREE from "three/webgpu";
import { fogUniforms, T } from "../gpu/tsl";

const { attribute, cameraPosition, clamp, cross, float, length, mix, mod, normalize, positionGeometry, positionLocal, smoothstep, uniform, varying, vec3, vec4 } = T;

const BOX = 22; // half-width of the box of rain round the camera (m)
const TALL = 18; // its height

export class Weather {
  /** The shower now (0 … 1) and how overcast (0 … 1); eased. */
  rain = 0;
  /** How wet the land is (0 … 1): it lags the rain, and outlasts it. */
  wet = 0;
  cloud = 0;
  enabled = true;
  /** Held on (still frames: `&rain=1`). */
  forced = -1;
  mesh: THREE.Mesh;
  private uT = uniform(0);
  private uK = uniform(0);
  private uCam = uniform(new THREE.Vector3());
  private uWind = uniform(new THREE.Vector2(1.6, 0.7));
  private clock = 0;
  private next = 200 + Math.random() * 140; // the first, a few minutes in
  private ends = 0;
  private dropT = 0;

  constructor(count: number) {
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry().copy(quad as unknown as THREE.InstancedBufferGeometry);
    geo.instanceCount = count;
    const base = new Float32Array(count * 4);
    let s = 7;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) base.set([(R() - 0.5) * 2 * BOX, R() * TALL, (R() - 0.5) * 2 * BOX, R()], i * 4);
    geo.setAttribute("aBase", new THREE.InstancedBufferAttribute(base, 4));
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    const aBase = attribute("aBase", "vec4");
    const speed = aBase.w.mul(2.5).add(7.5);
    // where the drop is now: falling, carried on the wind, wrapped into the box round the camera
    const wind = vec3(this.uWind.x, 0, this.uWind.y);
    const fall = this.uT.mul(speed);
    const p0 = vec3(aBase.x, aBase.y.sub(fall), aBase.z).add(wind.mul(fall.div(speed)));
    const rel = mod(p0.sub(this.uCam).add(vec3(BOX, TALL / 2, BOX)), vec3(2 * BOX, TALL, 2 * BOX)).sub(vec3(BOX, TALL / 2, BOX));
    const c = this.uCam.add(rel);
    // a thin streak along its fall (slanted by the wind), turned to face you about that line
    const along = normalize(vec3(this.uWind.x.div(speed), -1, this.uWind.y.div(speed)));
    const toCam = normalize(cameraPosition.sub(c));
    const side = normalize(cross(along, toCam));
    const len = aBase.w.mul(0.25).add(0.45);
    const w = c.add(side.mul(positionLocal.x).mul(0.02)).add(along.mul(positionLocal.y.sub(1).mul(len).negate()));
    mat.positionNode = w;
    const vd = varying(length(c.sub(cameraPosition)));
    const vY = varying(positionGeometry.y);
    const vEdge = varying(positionGeometry.x);
    // faint: the air's own light on water, a little brighter at the drop's head; soft at its sides
    const fade = smoothstep(0.6, 2.2, vd).mul(float(1).sub(smoothstep(12, BOX, vd)));
    const across = clamp(float(1).sub(vEdge.abs().mul(2)), 0, 1);
    const col = mix(vec3(0.55, 0.6, 0.7), fogUniforms.glow, 0.35).mul(mix(float(0.35), float(1), vY));
    mat.colorNode = vec4(col.mul(across).mul(fade).mul(this.uK).mul(0.62), 1);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  /** Each frame. `open`: in the open world and above the water (it rests elsewhere). Returns the
      places on the water near you where a drop rings this frame (for the ripples). */
  update(dt: number, cam: THREE.Vector3, open: boolean, reduced: boolean, ring: (x: number, z: number) => void): void {
    this.clock += dt;
    let rainTo = 0, cloudTo = 0;
    if (this.enabled) {
      if (this.clock > this.next && this.ends === 0) this.ends = this.clock + 90 + Math.random() * 100;
      if (this.ends > 0) {
        // the clouds gather first (40 s), the rain follows (20 s after), and both go as it ends
        const into = this.clock - this.next;
        cloudTo = 1;
        rainTo = into > 25 ? 1 : 0;
        if (this.clock > this.ends) {
          this.ends = 0;
          this.next = this.clock + 360 + Math.random() * 360;
        }
      }
    }
    if (this.forced >= 0) rainTo = cloudTo = this.forced;
    this.cloud += (cloudTo - this.cloud) * Math.min(1, dt / 22);
    this.rain += (Math.min(rainTo, this.cloud) - this.rain) * Math.min(1, dt / 12);
    if (this.forced >= 0) (this.cloud = cloudTo), (this.rain = rainTo);
    const k = open ? this.rain : 0;
    this.uK.value = k;
    // the ground soaks as it rains (~45 s) and dries slowly after (~3 min): puddles, wet stone
    this.wet += ((this.rain > 0.2 ? 1 : 0) - this.wet) * Math.min(1, dt / (this.rain > 0.2 ? 45 : 180));
    if (this.forced >= 0) this.wet = this.forced;
    this.uT.value += dt * (reduced ? 0.5 : 1);
    this.uCam.value.copy(cam);
    this.mesh.visible = k > 0.01;
    // rings on the water near you, as many as the rain is heavy
    if (k > 0.05) {
      this.dropT += dt * k * 5;
      while (this.dropT > 1) {
        this.dropT -= 1;
        const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 14;
        ring(cam.x + Math.cos(a) * r, cam.z + Math.sin(a) * r);
      }
    }
  }
}
