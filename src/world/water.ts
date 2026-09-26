/* Night water: dark, calm, and safe. It mirrors the sky (stars and the bright star) with
   pale cyan light on the ripples. Small waves near the viewer calm to a mirror far away.
   Ripples (footsteps, strokes, the first touch) are rings added to the surface normal.
   The world above (the land, the beings, the wanderer, the lights) is mirrored by three's
   reflector node, bent by the same ripples. */
import * as THREE from "three/webgpu";
import { T, withFog, type N } from "../gpu/tsl";
import { skyColor, skyUniforms } from "./sky";

const {
  abs, cameraPosition, clamp, cos, dot, exp, float, Fn, length, Loop, max, mix, normalize, positionWorld, pow, reflect, reflector,
  sin, smoothstep, uniform, uniformArray, vec2, vec3, vec4,
} = T;

const MAX_RIPPLES = 10;
/** Objects on this layer (the sky) are seen by the camera but never mirrored. */
export const NO_MIRROR_LAYER = 1;

export class Water {
  mesh: THREE.Mesh;
  /** The reflector's plane (add it to the scene) and its render settings. */
  readonly mirror: N;
  private ripples: THREE.Vector4[] = [];
  private next = 0;
  private matOn: THREE.MeshBasicNodeMaterial;
  private matOff: THREE.MeshBasicNodeMaterial;
  readonly uniforms = {
    uCalm: uniform(1),
    uGlow: uniform(new THREE.Vector3()), // the wanderer's light, reflected
    uReflOn: { value: 0 }, // 1 draws the mirrored world (costly), 0 only the sky
  };

  constructor() {
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new THREE.Vector4(0, 0, -100, 0));
    const rip = uniformArray(this.ripples, "vec4");
    const U = this.uniforms, S = skyUniforms;
    this.mirror = reflector({ resolutionScale: 0.5 });
    // the mirror plane is the water surface: its local +z faces up
    this.mirror.target.rotation.x = -Math.PI / 2;
    // rendered by renderMirror() before the frame, rather than nested inside the scene pass
    this.mirror.reflector.updateBeforeType = "none";

    const build = (withWorld: boolean) =>
      Fn(() => {
        const vW = positionWorld;
        /* ---- from below: the sky through a bright window straight up, elsewhere a plain dim
           teal (no shimmering mirror: Samuel found the underwater reflection annoying) */
        const up = normalize(vW.sub(cameraPosition));
        const wob = sin(vW.x.mul(1.3).add(S.uT.mul(0.9))).mul(sin(vW.z.mul(1.1).sub(S.uT.mul(0.7)))).mul(0.5).add(0.5);
        const window_ = smoothstep(0.62, 0.9, up.y.add(wob.mul(0.05)));
        const below = vec3(0.02, 0.1, 0.13).mul(0.85);
        const upS = normalize(vec3(up.x, up.y.mul(1.4), up.z));
        const skyB = skyColor(upS).mul(1.6).add(vec3(0.05, 0.12, 0.14));
        const moonB = pow(max(dot(upS, S.uStar), 0), 30);
        const fromBelow = mix(below, skyB, window_).add(vec3(0.9, 0.85, 0.7).mul(moonB).mul(window_));

        /* ---- from above */
        const toEye = cameraPosition.sub(vW);
        const dist = length(toEye);
        const v = toEye.div(dist);
        const p = vW.xz;
        const t = S.uT.mul(U.uCalm);
        const g = vec2(0).toVar();
        const dirs = [[0.8, 0.6], [-0.6, 0.8], [0.2, -1.0], [-0.9, -0.3], [0.5, 0.85]];
        const fr = [0.7, 1.3, 2.3, 3.7, 5.9];
        for (let i = 0; i < 5; i++) {
          const d = vec2(dirs[i][0], dirs[i][1]);
          const ph = dot(d, p).mul(fr[i]).add(t.mul(0.5 + fr[i] * 0.3));
          g.addAssign(d.mul(cos(ph)).mul(0.016));
        }
        g.mulAssign(exp(dist.mul(-0.015)));
        Loop(MAX_RIPPLES, ({ i }: N) => {
          const r = rip.element(i);
          const age = S.uT.sub(r.z);
          const live = age.greaterThanEqual(0).and(age.lessThanEqual(7));
          const dp = p.sub(r.xy);
          const rr = length(dp).add(1e-4);
          const front = age.mul(1.3);
          const k = rr.sub(front);
          const env = exp(k.mul(2.2).mul(k.mul(2.2)).negate()).mul(exp(age.mul(-0.7))).mul(r.w);
          g.addAssign(live.select(dp.div(rr).mul(env).mul(sin(k.mul(9))).mul(0.35), vec2(0)));
        });
        const n = normalize(vec3(g.x.negate(), 1, g.y.negate()));
        const cosT = max(dot(n, v), 0);
        const fres = float(0.04).add(pow(float(1).sub(cosT), 5).mul(0.96));
        const R0 = reflect(v.negate(), n);
        const R = vec3(R0.x, abs(R0.y), R0.z);
        const refl = skyColor(R).toVar();
        if (withWorld) {
          // the land, the beings and the wanderer, mirrored and bent by the ripples
          const m = this.mirror;
          m.uvNode = m.uvNode.add(g.mul(vec2(0.9, 0.6)));
          const rt = m;
          refl.assign(refl.mul(float(1).sub(clamp(rt.a, 0, 1))).add(rt.rgb)); // solid things cover the sky; glows add their light
        }
        // pale cyan catches on the ripple slopes
        refl.addAssign(vec3(0.3, 0.6, 0.7).mul(smoothstep(0.02, 0.25, length(g))).mul(0.1));
        const c = mix(vec3(0.012, 0.024, 0.055), refl, clamp(fres.mul(1.25), 0, 1)).toVar();
        // the bright star's path of light across the water
        c.addAssign(vec3(1.0, 0.78, 0.48).mul(pow(max(dot(R, S.uStar), 0), 220)).mul(2.2));
        // the wanderer's own light, reflected nearby
        const gd = length(vW.xz.sub(U.uGlow.xz));
        c.addAssign(vec3(1.0, 0.82, 0.58).mul(exp(gd.mul(gd).mul(-0.35))).mul(0.07).mul(U.uGlow.y));
        const fromAbove = withFog(c, vW);
        return vec4(cameraPosition.y.lessThan(vW.y.sub(0.001)).select(fromBelow, fromAbove), 1);
      })();

    const make = (withWorld: boolean) => {
      const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false }); // seen from beneath when diving
      m.colorNode = build(withWorld);
      return m;
    };
    this.matOff = make(false);
    this.matOn = make(true);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000, 1, 1).rotateX(-Math.PI / 2), this.matOff);
    this.mesh.frustumCulled = false;
  }

  /** Call once with the main camera (which must see NO_MIRROR_LAYER): the mirror's camera then
      leaves that layer out, so the sky shows through where nothing stands (alpha 0). */
  excludeFromMirror(camera: THREE.Camera): void {
    camera.layers.enable(NO_MIRROR_LAYER);
    this.mirror.reflector.getVirtualCamera(camera).layers.disable(NO_MIRROR_LAYER);
  }

  /** Mirror the world above (true) or only the sky (false). */
  setReflection(on: boolean): void {
    this.uniforms.uReflOn.value = on ? 1 : 0;
    this.mesh.material = on ? this.matOn : this.matOff;
  }

  /** Draw the mirrored world for this frame (before the scene itself is drawn). */
  renderMirror(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.uniforms.uReflOn.value) return;
    this.mirror.reflector.updateBefore({ renderer, scene, camera, material: this.mesh.material });
  }

  ripple(x: number, z: number, strength: number, time: number): void {
    this.ripples[this.next].set(x, z, time, strength);
    this.next = (this.next + 1) % MAX_RIPPLES;
  }

  update(camX: number, camZ: number, glow: THREE.Vector3): void {
    this.mesh.position.set(Math.round(camX / 50) * 50, 0, Math.round(camZ / 50) * 50);
    this.uniforms.uGlow.value.copy(glow);
  }
}
