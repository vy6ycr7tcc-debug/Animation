/* The night sky: velvet indigo, a field of stars, and one bright gold star low over the
   island. The same function colours the water's reflection, so the lake mirrors the sky
   truthfully, the star included. `uLight` (0–1) is how much the sky has brightened by the
   end of the journey. */
import * as THREE from "three/webgpu";
import { hash3, T, type N } from "../gpu/tsl";

const { Fn, float, vec3, vec4, uniform, normalize, mix, smoothstep, max, dot, pow, exp, sin, floor, fract, length, step, positionLocal, cameraProjectionMatrix, modelViewMatrix, varying } = T;

export const skyUniforms = {
  uStar: uniform(new THREE.Vector3()), // direction to the bright star
  uLight: uniform(0),
  uT: uniform(0),
  uStarBoost: uniform(0), // stars emerge while the wanderer sits in stillness
};

/** The colour of the night sky in direction `d` (normalized). Shared with the water's mirror. */
export const skyColor = Fn(([d]: N[]) => {
  const U = skyUniforms;
  const y = d.y;
  // a luminous night: deep blue overhead, lilac haze at the horizon (the fog's own colour)
  const zen = mix(vec3(0.016, 0.022, 0.072), vec3(0.03, 0.04, 0.11), U.uLight);
  const mid = mix(vec3(0.038, 0.043, 0.12), vec3(0.07, 0.07, 0.19), U.uLight);
  const hor = mix(vec3(0.105, 0.1, 0.22), vec3(0.2, 0.15, 0.3), U.uLight);
  const hy = max(y, 0);
  const c = mix(hor, mid, smoothstep(0, 0.22, hy)).toVar();
  c.assign(mix(c, zen, smoothstep(0.2, 0.9, hy)));
  c.assign(y.lessThan(0).select(hor.mul(mix(1, 0.5, smoothstep(0, 0.25, y.negate()))), c));
  // a faint band of the galaxy
  const bdot = dot(d, normalize(vec3(0.5, 0.35, 0.8)));
  const band = exp(bdot.mul(bdot).mul(-18));
  c.addAssign(vec3(0.035, 0.03, 0.07).mul(band).mul(smoothstep(-0.05, 0.3, y)));
  // stars
  const q = d.mul(230), cell = floor(q), h = hash3(cell), f = fract(q).sub(0.5);
  const tw = sin(U.uT.mul(h.mul(2).add(0.7)).add(h.mul(60))).mul(0.3).add(0.7);
  const star = step(0.988, h).mul(smoothstep(0.26, 0, length(f))).mul(tw);
  c.addAssign(mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), step(0.995, h)).mul(star).mul(smoothstep(-0.02, 0.2, y)).mul(band.add(0.9)).mul(U.uStarBoost.add(1)));
  // fainter stars that only appear in stillness
  const h2 = hash3(cell.add(17));
  c.addAssign(vec3(0.8, 0.85, 1.0).mul(step(0.965, h2)).mul(smoothstep(0.2, 0, length(f))).mul(U.uStarBoost).mul(0.5).mul(smoothstep(0, 0.2, y)));
  // the bright star: a gold point with a soft halo
  const sd = max(dot(d, U.uStar), 0);
  c.addAssign(vec3(1.0, 0.8, 0.5).mul(pow(sd, 4000)).mul(14));
  c.addAssign(vec3(1.0, 0.72, 0.42).mul(pow(sd, 300)).mul(0.3));
  // the moon's glow in the haze, matching the fog's light toward it
  c.assign(mix(c, vec3(0.55, 0.42, 0.34), pow(sd, 5).mul(0.7).mul(float(1).sub(smoothstep(0, 0.35, hy)))));
  c.addAssign(vec3(0.35, 0.28, 0.3).mul(pow(sd, 24)).mul(0.35));
  return c;
});

export { starDirection } from "./fog";

export function buildSky(): THREE.Mesh {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const dir = varying(positionLocal);
  // always at the far plane
  const clip = cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionLocal, 1));
  mat.vertexNode = vec4(clip.x, clip.y, clip.w, clip.w);
  mat.colorNode = skyColor(normalize(dir));
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}
