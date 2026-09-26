/* Clouds: soft banks of cloud drifting among the far mountains and higher up, lit by the moon.
   Each is a billboard shaded as if it were a volume. The side toward the moon is brighter, and
   edges glow silver when the moon is behind them. They sit in the same haze as the land, so
   they layer the distance. (The earlier flat mist sheets and cut-out horizon were retired when
   the land itself reached the mountains.) */
import * as THREE from "three/webgpu";
import { hash2b, T, withFog } from "../gpu/tsl";
import { starDirection } from "./sky";

const { attribute, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, dot, float, floor, fract, length, max, mix, mod, normalize, positionLocal, pow, smoothstep, uniform, uv, varying, vec2, vec3, vec4, Fn, Loop, int } = T;

/** Five octaves of value noise (the clouds' billows). */
const fbm5 = Fn(([p0]: unknown[]) => {
  const p = vec2(p0 as never).toVar(), s = float(0).toVar(), a = float(0.5).toVar();
  Loop({ start: int(0), end: int(5) }, () => {
    const i = floor(p), f = fract(p);
    const u = f.mul(f).mul(float(3).sub(f.mul(2)));
    const n = mix(mix(hash2b(i), hash2b(i.add(vec2(1, 0))), u.x), mix(hash2b(i.add(vec2(0, 1))), hash2b(i.add(vec2(1, 1))), u.x), u.y);
    s.addAssign(n.mul(a));
    p.assign(p.mul(2.03).add(vec2(1.7, 9.2)));
    a.mulAssign(0.5);
  });
  return s;
});

/** The clouds' shaded and lit colours, set by the sky's mood (moods.ts). */
export const cloudUniforms = {
  shade: uniform(new THREE.Color(0.13, 0.12, 0.26)),
  light: uniform(new THREE.Color(0.62, 0.54, 0.52)),
};

export class Clouds {
  mesh: THREE.Mesh;
  private uniforms = { uT: uniform(0), uMoon: uniform(starDirection()), uCam: uniform(new THREE.Vector3()) };

  constructor(count = 42) {
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1) as unknown as THREE.InstancedBufferGeometry);
    geo.instanceCount = count;
    const seed = new Float32Array(count);
    const size = new Float32Array(count * 2);
    const centre = new Float32Array(count * 3);
    const U = this.uniforms;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    const aSeed = attribute("aSeed", "float"), aSize = attribute("aSize", "vec2"), aCentre = attribute("aCentre", "vec3");
    // drifting on the wind, and always around you wherever you travel
    const cx = aCentre.x.add(U.uT.mul(aSeed.mul(0.8).add(0.6)));
    const cxz = U.uCam.xz.add(mod(vec2(cx, aCentre.z).sub(U.uCam.xz).add(2500), 5000)).sub(2500);
    const right = vec3(cameraViewMatrix[0].x, cameraViewMatrix[1].x, cameraViewMatrix[2].x);
    const up = vec3(0, 1, 0);
    const w = vec3(cxz.x, aCentre.y, cxz.y).add(right.mul(positionLocal.x).mul(aSize.x)).add(up.mul(positionLocal.y).mul(aSize.y));
    mat.vertexNode = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(w, 1));
    const vW = varying(w), vRight = varying(right), vSeed = varying(aSeed);
    const vUv = uv();
    const q = vUv.mul(2).sub(1);
    // a billowing mass: round on top, flatter underneath
    const body = float(1).sub(length(vec2(q.x, q.y.greaterThan(0).select(q.y.mul(1.1), q.y.mul(2.2)))));
    const f = fbm5(vUv.mul(vec2(3, 2)).add(vSeed.mul(17)).add(vec2(U.uT.mul(0.004), 0)));
    const d0 = smoothstep(0, 0.9, body.add(f.sub(0.5).mul(1.1)));
    const d = d0.mul(d0);
    // shade it as a volume: a normal as if it were a rounded mass
    const viewDir = normalize(cameraPosition.sub(vW));
    const nrm = normalize(vRight.mul(q.x).add(up.mul(q.y).mul(0.8)).add(viewDir.mul(max(0.2, body))));
    const lit = max(dot(nrm, U.uMoon), 0).mul(0.55).add(0.45);
    const behind = pow(max(dot(viewDir.negate(), U.uMoon), 0), 5);
    let c = mix(cloudUniforms.shade, cloudUniforms.light, lit.mul(lit).mul(0.8));
    c = c.add(cloudUniforms.light.mul(1.4).mul(behind).mul(float(1).sub(d)).mul(d).mul(1.6)); // a silver lining when the moon is behind
    mat.colorNode = mix(c, withFog(c, vW), 0.7);
    mat.opacityNode = d.mul(0.9);
    mat.alphaTest = 0.009;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -0.5;
    let s = 11;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const low = i < count * 0.6; // most drift low over the land; the rest float high
      const y = low ? 45 + R() * 50 : 130 + R() * 110;
      centre.set([(R() - 0.5) * 5000, y, (R() - 0.5) * 5000], i * 3);
      seed[i] = R();
      const w = low ? 120 + R() * 180 : 90 + R() * 120;
      size.set([w, w * (low ? 0.32 + R() * 0.18 : 0.22 + R() * 0.12)], i * 2);
    }
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
    geo.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 2));
    geo.setAttribute("aCentre", new THREE.InstancedBufferAttribute(centre, 3));
  }

  update(t: number, cam: THREE.Vector3): void {
    this.uniforms.uT.value = t;
    this.uniforms.uCam.value.copy(cam);
  }
}
