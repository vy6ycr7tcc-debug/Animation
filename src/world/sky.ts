/* The sky. Its colours are set by the moods (moods.ts), which change as you travel: a moonlit
   indigo night at home, a cold winter sunrise to the east, a violet and amber sunset to the west,
   and a deep, nearly black night to the north. Over it all:
   - stars that twinkle, and fainter ones that come out in stillness;
   - the Milky Way, a band of soft light with dark lanes of dust through it;
   - nebulae: drifting clouds of rose, violet and teal light, most of them along the band;
   - a few distant spiral galaxies, turning too slowly to see;
   - the bright gold star, and the moon's glow in the haze;
   - at dawn and dusk, the low sun's glow along the horizon.
   The same function colours the water's reflection (without the finest detail), so the lakes
   mirror the sky truthfully. */
import * as THREE from "three/webgpu";
import { hash3, T, type N } from "../gpu/tsl";

const {
  abs, atan, cameraProjectionMatrix, cos, dot, exp, float, floor, Fn, fract, length, log, max, mix, modelViewMatrix, normalize,
  positionLocal, pow, sin, smoothstep, step, uniform, varying, vec2, vec3, vec4,
} = T;

export const skyUniforms = {
  uStar: uniform(new THREE.Vector3()), // direction to the bright star
  uLight: uniform(0),
  uT: uniform(0),
  uStarBoost: uniform(0), // stars emerge while the wanderer sits in stillness
  // the mood's palette (moods.ts)
  uZen: uniform(new THREE.Color(0.016, 0.022, 0.072)),
  uMid: uniform(new THREE.Color(0.038, 0.043, 0.12)),
  uHor: uniform(new THREE.Color(0.105, 0.1, 0.22)),
  /** The low sun of dawn and dusk: its direction, colour and strength. */
  uSun: uniform(new THREE.Vector3(1, 0.05, 0).normalize()),
  uSunCol: uniform(new THREE.Color(1, 0.6, 0.4)),
  uSunK: uniform(0),
  /** How much of the night sky shows (stars, the band): low at dawn and dusk. */
  uStars: uniform(1),
  /** Deep night: the band, the nebulae and the galaxies at their fullest. */
  uDeep: uniform(0),
  /** The moon's glow in the haze. */
  uMoonK: uniform(1),
};

/** Smooth 3D value noise in 0–1, and a few octaves of it (for the nebulae and the dust). */
const vnoise3 = Fn(([p]: N[]) => {
  const i = floor(p), f0 = fract(p), f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  const h = (x: number, y: number, z: number) => hash3(i.add(vec3(x, y, z)));
  return mix(
    mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y),
    f.z,
  );
});
const fbm3 = Fn(([p0]: N[]) => {
  const p = vec3(p0).toVar();
  const s = float(0).toVar();
  let a = 0.5;
  for (let k = 0; k < 4; k++) {
    s.addAssign(vnoise3(p).mul(a));
    p.assign(p.mul(2.07).add(vec3(1.7, 9.2, 4.1)));
    a *= 0.5;
  }
  return s;
});

/** Where the far galaxies are, how large, how tilted and in what light. */
const GALAXIES: { dir: [number, number, number]; size: number; tilt: number; squash: number; col: [number, number, number] }[] = [
  { dir: [-0.35, 0.55, -0.75], size: 0.05, tilt: 0.6, squash: 0.42, col: [0.85, 0.8, 1.0] },
  { dir: [0.62, 0.42, -0.66], size: 0.032, tilt: 2.1, squash: 0.7, col: [1.0, 0.85, 0.75] },
  { dir: [0.2, 0.8, 0.55], size: 0.04, tilt: 1.2, squash: 0.3, col: [0.75, 0.85, 1.0] },
  { dir: [-0.7, 0.3, 0.64], size: 0.026, tilt: 0.2, squash: 0.85, col: [1.0, 0.8, 0.95] },
];

function galaxy(d: N, g: (typeof GALAXIES)[number]): N {
  const n = new THREE.Vector3(...g.dir).normalize();
  // a frame on the sky around the galaxy, turned by its tilt
  const t1 = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(t1, n).normalize();
  const c = Math.cos(g.tilt), s = Math.sin(g.tilt);
  const a1 = t1.clone().multiplyScalar(c).addScaledVector(t2, s), a2 = t2.clone().multiplyScalar(c).addScaledVector(t1, -s);
  const u = dot(d, vec3(a1.x, a1.y, a1.z)).div(g.size);
  const v = dot(d, vec3(a2.x, a2.y, a2.z)).div(g.size * g.squash);
  const facing = step(0.9, dot(d, vec3(n.x, n.y, n.z)));
  const r = length(vec2(u, v));
  const ang = atan(v, u);
  // two arms winding out from a bright core
  const arms = pow(cos(ang.mul(2).sub(log(r.add(0.08)).mul(3.2))).mul(0.5).add(0.5), 3);
  const disc = exp(r.mul(r).mul(-2.2));
  const b = disc.mul(arms.mul(0.7).add(0.3)).mul(0.5).add(exp(r.mul(r).mul(-40)).mul(1.6));
  return vec3(...g.col).mul(b).mul(facing);
}

/** The colour of the sky in direction `d` (normalized). `detail` adds the finest work (nebulae,
    dust, galaxies); the water's reflection leaves it out. */
function skyColorImpl(d: N, detail: boolean): N {
  const U = skyUniforms;
  const y = d.y;
  const hy = max(y, 0);
  const c = mix(U.uHor, U.uMid, smoothstep(0, 0.22, hy)).toVar();
  c.assign(mix(c, U.uZen, smoothstep(0.2, 0.9, hy)));
  c.assign(y.lessThan(0).select(U.uHor.mul(mix(1, 0.5, smoothstep(0, 0.25, y.negate()))), c));
  const above = smoothstep(-0.02, 0.2, y);
  // dawn and dusk: the low sun, and its warmth spread along the horizon on its side
  const sd = max(dot(d, U.uSun), 0);
  const side = dot(normalize(vec3(d.x, 0, d.z).add(1e-4)), normalize(vec3(U.uSun.x, 0, U.uSun.z))).mul(0.5).add(0.5);
  c.addAssign(
    U.uSunCol.mul(pow(sd, 5).mul(0.5).add(pow(sd, 48).mul(0.9)).add(pow(sd, 1600).mul(9)).add(exp(hy.mul(-7)).mul(side).mul(side).mul(0.45))).mul(U.uSunK),
  );
  // the Milky Way: a band of light with lanes of dust through it
  const bdot = dot(d, normalize(vec3(0.5, 0.35, 0.8)));
  const band = exp(bdot.mul(bdot).mul(-18));
  const nightK = U.uStars.mul(above);
  if (detail) {
    const dust = fbm3(d.mul(7).add(3.1));
    const glow = fbm3(d.mul(3).sub(1.7));
    const lanes = float(1).sub(smoothstep(0.42, 0.66, dust).mul(0.8).mul(band));
    c.addAssign(vec3(0.05, 0.045, 0.09).mul(band).mul(glow.mul(1.2).add(0.4)).mul(lanes).mul(U.uDeep.mul(2.2).add(0.7)).mul(nightK));
    // nebulae: soft clouds of coloured light, most of them near the band
    const n1 = fbm3(d.mul(2.3).add(11.3));
    const n2 = fbm3(d.mul(4.6).sub(5.2));
    const cloud = smoothstep(0.5, 0.82, n1).mul(n2.mul(0.7).add(0.3)).mul(band.mul(0.8).add(0.35));
    const neb = mix(mix(vec3(0.55, 0.12, 0.42), vec3(0.12, 0.42, 0.55), smoothstep(0.35, 0.65, n2)), vec3(0.42, 0.25, 0.75), smoothstep(0.55, 0.8, glow));
    c.addAssign(neb.mul(cloud).mul(U.uDeep.mul(0.22).add(0.035)).mul(nightK));
    // the far galaxies
    const gal = vec3(0).toVar();
    for (const g of GALAXIES) gal.addAssign(galaxy(d, g));
    c.addAssign(gal.mul(U.uDeep.mul(0.5).add(0.06)).mul(nightK));
  } else {
    c.addAssign(vec3(0.05, 0.045, 0.09).mul(band).mul(U.uDeep.mul(2.2).add(0.7)).mul(nightK));
  }
  // stars
  const q = d.mul(230), cell = floor(q), h = hash3(cell), f = fract(q).sub(0.5);
  const tw = sin(U.uT.mul(h.mul(2).add(0.7)).add(h.mul(60))).mul(0.3).add(0.7);
  const many = mix(0.988, 0.975, U.uDeep); // the deep night holds more of them
  const star = step(many, h).mul(smoothstep(0.26, 0, length(f))).mul(tw);
  c.addAssign(mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), step(0.995, h)).mul(star).mul(band.add(0.9)).mul(U.uStarBoost.add(1)).mul(U.uDeep.mul(0.8).add(1)).mul(nightK));
  // fainter stars that appear in stillness, and always in the deep night
  const h2 = hash3(cell.add(17));
  c.addAssign(vec3(0.8, 0.85, 1.0).mul(step(0.965, h2)).mul(smoothstep(0.2, 0, length(f))).mul(U.uStarBoost.add(U.uDeep.mul(0.6))).mul(0.5).mul(nightK));
  // the bright star: a gold point with a soft halo
  const ss = max(dot(d, U.uStar), 0);
  c.addAssign(vec3(1.0, 0.8, 0.5).mul(pow(ss, 4000)).mul(14).mul(U.uStars.mul(0.7).add(0.3)).mul(float(1).sub(U.uDeep.mul(0.65))));
  c.addAssign(vec3(1.0, 0.72, 0.42).mul(pow(ss, 300)).mul(0.3).mul(U.uStars).mul(float(1).sub(U.uDeep.mul(0.7))));
  // the moon's glow in the haze, matching the fog's light toward it
  c.assign(mix(c, vec3(0.55, 0.42, 0.34), pow(ss, 5).mul(0.7).mul(float(1).sub(smoothstep(0, 0.35, hy))).mul(U.uMoonK)));
  c.addAssign(vec3(0.35, 0.28, 0.3).mul(pow(ss, 24)).mul(0.35).mul(U.uMoonK));
  void abs;
  return c;
}

/** The colour of the sky in direction `d`, as the water mirrors it. */
export const skyColor = Fn(([d]: N[]) => skyColorImpl(d, false));
/** The sky itself, with its nebulae, dust and galaxies. */
export const skyColorFull = Fn(([d]: N[]) => skyColorImpl(d, true));

export { starDirection } from "./fog";

export function buildSky(): THREE.Mesh {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const dir = varying(positionLocal);
  // always at the far plane
  const clip = cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionLocal, 1));
  mat.vertexNode = vec4(clip.x, clip.y, clip.w, clip.w);
  mat.colorNode = skyColorFull(normalize(dir));
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}
