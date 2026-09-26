/* The moods of the sky. The time of day doesn't pass; it changes as you travel, so each part of
   the world has its own light:
   - home, around the shore where you wake: a moonlit indigo night;
   - east, where the Body's archetypes live: a cold winter sunrise, ice blue above and blush and
     peach along the horizon;
   - west, where the Spirit's live: a winter sunset, violet above and rose and amber below;
   - north, toward the Choice's island: the deep night, nearly black, full of stars, the band of
     the galaxy with its dust, nebulae and far galaxies.
   Each mood sets the sky, the air (fog), the light on the land and the sky's reflection in
   glossy things, blended smoothly over a kilometre or so. */
import * as THREE from "three/webgpu";
import { fogUniforms } from "../gpu/tsl";
import { cloudUniforms } from "./atmosphere";
import { skyUniforms } from "./sky";
import { SPAWN } from "./terrain";

interface Mood {
  zen: THREE.Color;
  mid: THREE.Color;
  hor: THREE.Color;
  fog: THREE.Color;
  glow: THREE.Color; // the air toward the moon or the low sun
  sun: THREE.Vector3; // the low sun (dawn and dusk)
  sunCol: THREE.Color;
  sunK: number;
  stars: number;
  deep: number;
  moonK: number;
  light: THREE.Color; // the moon/star light on the land (colour × intensity)
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  env: number;
  density: number; // the air's thickness
  cloudShade: THREE.Color;
  cloudLight: THREE.Color;
}

const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

const NIGHT: Mood = {
  zen: C(0.016, 0.022, 0.072), mid: C(0.038, 0.043, 0.12), hor: C(0.105, 0.1, 0.22),
  fog: C(0.105, 0.1, 0.22), glow: C(0.55, 0.42, 0.34),
  sun: V(1, 0.05, 0), sunCol: C(1, 0.6, 0.4), sunK: 0,
  stars: 1, deep: 0.15, moonK: 1,
  light: C(1.8, 1.58, 1.33), hemiSky: C(0.48, 0.53, 0.82), hemiGround: C(0.13, 0.1, 0.21), hemi: 0.85, env: 1.5,
  density: 0.0052, cloudShade: C(0.13, 0.12, 0.26), cloudLight: C(0.62, 0.54, 0.52),
};
const SUNRISE: Mood = {
  zen: C(0.018, 0.045, 0.17), mid: C(0.08, 0.15, 0.34), hor: C(0.85, 0.42, 0.36),
  fog: C(0.2, 0.21, 0.37), glow: C(0.95, 0.52, 0.4),
  sun: V(1, 0.035, 0.25), sunCol: C(1.0, 0.58, 0.4), sunK: 1,
  stars: 0.15, deep: 0, moonK: 0.15,
  light: C(1.9, 1.45, 1.3), hemiSky: C(0.5, 0.58, 0.84), hemiGround: C(0.18, 0.13, 0.18), hemi: 0.9, env: 1.4,
  density: 0.0028, cloudShade: C(0.24, 0.26, 0.45), cloudLight: C(1.0, 0.66, 0.58),
};
const SUNSET: Mood = {
  zen: C(0.025, 0.018, 0.09), mid: C(0.18, 0.055, 0.22), hor: C(0.95, 0.34, 0.13),
  fog: C(0.27, 0.13, 0.22), glow: C(0.9, 0.38, 0.17),
  sun: V(-1, 0.03, -0.15), sunCol: C(1.0, 0.42, 0.17), sunK: 1,
  stars: 0.35, deep: 0, moonK: 0.15,
  light: C(2.1, 1.3, 0.95), hemiSky: C(0.55, 0.36, 0.66), hemiGround: C(0.18, 0.08, 0.13), hemi: 0.9, env: 1.6,
  density: 0.0038, cloudShade: C(0.2, 0.1, 0.22), cloudLight: C(1.0, 0.5, 0.3),
};
const DEEP: Mood = {
  zen: C(0.0015, 0.002, 0.007), mid: C(0.004, 0.006, 0.017), hor: C(0.018, 0.02, 0.04),
  fog: C(0.018, 0.02, 0.04), glow: C(0.05, 0.05, 0.08),
  sun: V(0, 0.05, -1), sunCol: C(0, 0, 0), sunK: 0,
  stars: 1, deep: 1, moonK: 0.06,
  light: C(0.65, 0.72, 0.95), hemiSky: C(0.26, 0.3, 0.52), hemiGround: C(0.04, 0.035, 0.07), hemi: 0.5, env: 0.8,
  density: 0.0042, cloudShade: C(0.012, 0.012, 0.025), cloudLight: C(0.06, 0.06, 0.09),
};

export interface MoodTargets {
  hemi: THREE.HemisphereLight;
  star: THREE.DirectionalLight;
  scene: THREE.Scene;
  /** The creation's own simple fog (creation.ts). */
  creationFog: THREE.Color;
}

export class Moods {
  /** The blend now: night, sunrise, sunset, deep (they sum to 1). */
  weights = [1, 0, 0, 0];
  /** Changes since the sky's reflection in glossy things was last baked (0 → none). */
  drift = 0;
  private cur: Mood = structuredCloneMood(NIGHT);
  private w = [1, 0, 0, 0];

  constructor(private t: MoodTargets) {}

  /** Blend the moods for where the wanderer is (eased, so crossing a boundary is never sudden). */
  update(pos: THREE.Vector3, dt: number): void {
    const dx = pos.x - SPAWN.x, dz = pos.z - SPAWN.z;
    const dist = Math.hypot(dx, dz) || 1;
    const away = THREE.MathUtils.smoothstep(dist, 250, 1100); // home keeps its night
    const lobe = (c: number) => THREE.MathUtils.smoothstep(c, 0.2, 0.85);
    let e = lobe(dx / dist) * away, wst = lobe(-dx / dist) * away, n = lobe(-dz / dist) * away;
    const sum = e + wst + n;
    if (sum > 1) (e /= sum), (wst /= sum), (n /= sum);
    const want = [Math.max(0, 1 - e - wst - n), e, wst, n];
    const k = Math.min(1, dt * 0.6);
    for (let i = 0; i < 4; i++) {
      const before = this.w[i];
      this.w[i] += (want[i] - this.w[i]) * k;
      this.drift += Math.abs(this.w[i] - before);
    }
    this.weights = [...this.w];
    this.blend();
    this.apply();
  }

  private blend(): void {
    const ms = [NIGHT, SUNRISE, SUNSET, DEEP], w = this.w, m = this.cur;
    const colours: (keyof Mood)[] = ["zen", "mid", "hor", "fog", "glow", "sunCol", "light", "hemiSky", "hemiGround", "cloudShade", "cloudLight"];
    for (const key of colours) {
      const out = m[key] as THREE.Color;
      out.setRGB(0, 0, 0);
      ms.forEach((x, i) => out.add((x[key] as THREE.Color).clone().multiplyScalar(w[i])));
    }
    for (const key of ["sunK", "stars", "deep", "moonK", "hemi", "env", "density"] as const) m[key] = ms.reduce((s, x, i) => s + x[key] * w[i], 0);
    // the low sun stands where the dawn or the dusk is strongest
    m.sun.set(0, 0, 0).addScaledVector(SUNRISE.sun, w[1] + 1e-3).addScaledVector(SUNSET.sun, w[2]).normalize();
  }

  private apply(): void {
    const m = this.cur, S = skyUniforms;
    S.uZen.value.copy(m.zen);
    S.uMid.value.copy(m.mid);
    S.uHor.value.copy(m.hor);
    S.uSun.value.copy(m.sun);
    S.uSunCol.value.copy(m.sunCol);
    S.uSunK.value = m.sunK;
    S.uStars.value = m.stars;
    S.uDeep.value = m.deep;
    S.uMoonK.value = m.moonK;
    fogUniforms.color.value.copy(m.fog);
    fogUniforms.density.value = m.density;
    cloudUniforms.shade.value.copy(m.cloudShade);
    cloudUniforms.light.value.copy(m.cloudLight);
    fogUniforms.glow.value.copy(m.glow);
    // the air glows toward the moon at night, toward the low sun at dawn and dusk
    const sunny = Math.min(1, m.sunK);
    fogUniforms.glowDir.value.copy(S.uStar.value).lerp(m.sun, sunny).normalize();
    this.t.creationFog.copy(m.fog);
    const L = this.t.star, H = this.t.hemi;
    const li = Math.max(m.light.r, m.light.g, m.light.b);
    L.color.copy(m.light).multiplyScalar(1 / li);
    L.intensity = li;
    H.color.copy(m.hemiSky);
    H.groundColor.copy(m.hemiGround);
    H.intensity = m.hemi;
    this.t.scene.environmentIntensity = m.env;
  }
}

function structuredCloneMood(m: Mood): Mood {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(m)) out[k] = v instanceof THREE.Color || v instanceof THREE.Vector3 ? v.clone() : v;
  return out as unknown as Mood;
}
