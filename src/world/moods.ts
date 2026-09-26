/* The moods of the sky. The time of day doesn't pass; it changes as you travel, so each part of
   the world has its own light:
   - home, around the shore where you wake: a moonlit indigo night;
   - east, where the Body's archetypes live: a cold winter sunrise, ice blue above and blush and
     peach along the horizon;
   - west, where the Spirit's live: a winter sunset, violet above and rose and amber below;
   - north, toward the Choice's island: the deep night, nearly black, full of stars, the band of
     the galaxy with its dust, nebulae and far galaxies;
   - south: the cold blue hour before a winter dawn;
   and between them (Samuel: "I would add some like these too: dusk, haze, sunset…"):
   - north-east: a pale morning haze, pearl and peach, the sun a soft disc;
   - north-west: dusk, the afterglow sinking into violet and the first stars;
   - south-west: an ember sunset, crimson and gold;
   - south-east: a pink dawn, rose and lilac.
   Each mood sets the sky, the air (fog), the light on the land and the sky's reflection in
   glossy things, already turning a short walk from the shore (~80 m) and full by ~450 m;
   between two directions, their moods blend. */
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
  density: 0.0044, cloudShade: C(0.13, 0.12, 0.26), cloudLight: C(0.62, 0.54, 0.52),
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

const TWILIGHT: Mood = {
  // south: the cold blue hour before a winter dawn, a pale teal band over the horizon
  zen: C(0.01, 0.025, 0.09), mid: C(0.03, 0.08, 0.2), hor: C(0.2, 0.36, 0.45),
  fog: C(0.1, 0.16, 0.26), glow: C(0.55, 0.62, 0.75),
  sun: V(0.1, -0.04, 1), sunCol: C(0.45, 0.62, 0.8), sunK: 0.45,
  stars: 0.55, deep: 0.1, moonK: 0.5,
  light: C(1.3, 1.45, 1.7), hemiSky: C(0.42, 0.55, 0.8), hemiGround: C(0.1, 0.1, 0.16), hemi: 0.85, env: 1.3,
  density: 0.0036, cloudShade: C(0.07, 0.1, 0.2), cloudLight: C(0.5, 0.6, 0.75),
};

const HAZE: Mood = {
  // north-east: a soft morning haze, pale and luminous, the sun a diffuse disc
  zen: C(0.05, 0.07, 0.19), mid: C(0.19, 0.18, 0.33), hor: C(0.74, 0.55, 0.5),
  fog: C(0.25, 0.22, 0.33), glow: C(0.85, 0.66, 0.52),
  sun: V(0.7, 0.14, -0.7), sunCol: C(1.0, 0.74, 0.58), sunK: 0.42,
  stars: 0, deep: 0, moonK: 0.05,
  light: C(1.85, 1.62, 1.45), hemiSky: C(0.56, 0.56, 0.76), hemiGround: C(0.18, 0.14, 0.18), hemi: 0.9, env: 1.4,
  density: 0.003, cloudShade: C(0.3, 0.27, 0.4), cloudLight: C(1.0, 0.84, 0.74),
};
const DUSK: Mood = {
  // north-west: after the sun has gone, violet deepening overhead, a rose afterglow low down
  zen: C(0.018, 0.022, 0.09), mid: C(0.09, 0.07, 0.22), hor: C(0.44, 0.26, 0.42),
  fog: C(0.14, 0.11, 0.24), glow: C(0.55, 0.36, 0.46),
  sun: V(-0.7, -0.03, -0.7), sunCol: C(0.75, 0.36, 0.48), sunK: 0.5,
  stars: 0.7, deep: 0.2, moonK: 0.4,
  light: C(1.3, 1.15, 1.38), hemiSky: C(0.4, 0.38, 0.7), hemiGround: C(0.12, 0.08, 0.18), hemi: 0.8, env: 1.3,
  density: 0.0036, cloudShade: C(0.12, 0.09, 0.22), cloudLight: C(0.72, 0.46, 0.6),
};
const EMBER: Mood = {
  // south-west: a deep red sunset, crimson and gold, the sun a red disc on the horizon
  zen: C(0.03, 0.02, 0.07), mid: C(0.28, 0.08, 0.12), hor: C(1.0, 0.36, 0.1),
  fog: C(0.3, 0.12, 0.14), glow: C(1.0, 0.4, 0.15),
  sun: V(-0.7, 0.02, 0.7), sunCol: C(1.0, 0.35, 0.08), sunK: 1,
  stars: 0.2, deep: 0, moonK: 0.1,
  light: C(2.2, 1.2, 0.8), hemiSky: C(0.6, 0.32, 0.45), hemiGround: C(0.2, 0.08, 0.1), hemi: 0.9, env: 1.6,
  density: 0.0036, cloudShade: C(0.22, 0.07, 0.12), cloudLight: C(1.0, 0.45, 0.2),
};
const DAWN: Mood = {
  // south-east: a pink dawn, rose along the horizon, lilac above
  zen: C(0.03, 0.04, 0.15), mid: C(0.22, 0.13, 0.33), hor: C(0.95, 0.48, 0.58),
  fog: C(0.24, 0.17, 0.31), glow: C(0.92, 0.55, 0.6),
  sun: V(0.7, 0.0, 0.7), sunCol: C(1.0, 0.6, 0.62), sunK: 0.7,
  stars: 0.3, deep: 0, moonK: 0.2,
  light: C(1.8, 1.45, 1.5), hemiSky: C(0.52, 0.5, 0.8), hemiGround: C(0.18, 0.12, 0.18), hemi: 0.9, env: 1.4,
  density: 0.003, cloudShade: C(0.26, 0.2, 0.36), cloudLight: C(1.0, 0.7, 0.72),
};

/** Every mood, and the direction from the shore where it is full (x east, z south). */
const MOODS: { mood: Mood; dir: [number, number] | null }[] = [
  { mood: NIGHT, dir: null },
  { mood: SUNRISE, dir: [1, 0] },
  { mood: SUNSET, dir: [-1, 0] },
  { mood: DEEP, dir: [0, -1] },
  { mood: TWILIGHT, dir: [0, 1] },
  { mood: HAZE, dir: [Math.SQRT1_2, -Math.SQRT1_2] },
  { mood: DUSK, dir: [-Math.SQRT1_2, -Math.SQRT1_2] },
  { mood: EMBER, dir: [-Math.SQRT1_2, Math.SQRT1_2] },
  { mood: DAWN, dir: [Math.SQRT1_2, Math.SQRT1_2] },
];
export const MOOD_NAMES = ["night", "sunrise", "sunset", "deep", "twilight", "haze", "dusk", "ember", "dawn"];

export interface MoodTargets {
  hemi: THREE.HemisphereLight;
  star: THREE.DirectionalLight;
  scene: THREE.Scene;
  /** The creation's own simple fog (creation.ts). */
  creationFog: THREE.Color;
}

export class Moods {
  /** The blend now, in the order of MOOD_NAMES (they sum to 1). */
  weights = MOODS.map((_, i) => (i ? 0 : 1));
  /** Changes since the sky's reflection in glossy things was last baked (0 → none). */
  drift = 0;
  private cur: Mood = structuredCloneMood(NIGHT);
  private w = MOODS.map((_, i) => (i ? 0 : 1));

  constructor(private t: MoodTargets) {}

  /** Blend the moods for where the wanderer is (eased, so crossing a boundary is never sudden). */
  update(pos: THREE.Vector3, dt: number): void {
    const dx = pos.x - SPAWN.x, dz = pos.z - SPAWN.z;
    const dist = Math.hypot(dx, dz) || 1;
    // the shore keeps its moonlit night; a short walk out, the sky already turns
    const away = THREE.MathUtils.smoothstep(dist, 80, 450);
    // each direction's mood is full where you head straight that way, and gone 45° off it
    const lobes = MOODS.map(({ dir }) => (dir ? THREE.MathUtils.smoothstep((dx * dir[0] + dz * dir[1]) / dist, Math.SQRT1_2, 1) : 0));
    const sum = lobes.reduce((a, b) => a + b, 0) || 1;
    const want = lobes.map((l, i) => (i ? (l / sum) * away : 1 - away));
    const k = Math.min(1, dt * 0.6);
    for (let i = 0; i < MOODS.length; i++) {
      const before = this.w[i];
      this.w[i] += (want[i] - this.w[i]) * k;
      this.drift += Math.abs(this.w[i] - before);
    }
    this.weights = [...this.w];
    this.blend();
    this.apply();
  }

  private blend(): void {
    const ms = MOODS.map((x) => x.mood), w = this.w, m = this.cur;
    const colours: (keyof Mood)[] = ["zen", "mid", "hor", "fog", "glow", "sunCol", "light", "hemiSky", "hemiGround", "cloudShade", "cloudLight"];
    for (const key of colours) {
      const out = m[key] as THREE.Color;
      out.setRGB(0, 0, 0);
      ms.forEach((x, i) => out.add((x[key] as THREE.Color).clone().multiplyScalar(w[i])));
    }
    for (const key of ["sunK", "stars", "deep", "moonK", "hemi", "env", "density"] as const) m[key] = ms.reduce((s, x, i) => s + x[key] * w[i], 0);
    // the low sun stands where the dawn or the dusk is strongest
    m.sun.copy(SUNRISE.sun).multiplyScalar(1e-3);
    ms.forEach((x, i) => m.sun.addScaledVector(x.sun, w[i] * x.sunK));
    m.sun.normalize();
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
