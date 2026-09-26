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
   - north-east: golden hour over a lake (Samuel's photo): dusky blue sky, a peach-rose band low down,
     brown-gold light on the land;
   - north-west: dusk, reds and blues together: deep blue above, the sun's last red below;
   - south-west: an ember sunset, crimson and gold;
   - south-east: a pink dawn, rose and lilac.
   Each mood sets the sky, the air (fog), the light on the land and the sky's reflection in
   glossy things, already turning a short walk from the shore (~80 m) and full by ~450 m;
   between two directions, their moods blend. */
import * as THREE from "three/webgpu";
import { fogUniforms, gradeUniforms } from "../gpu/tsl";
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
/** A colour from Samuel's palettes (sRGB hex), at a brightness `k` for the night's scale. */
const H = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);

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
  // west: Samuel's palette of clouds catching the sunset: blue-grey above, mauve, then orange
  // and burnt orange low down (#737597, #785566, #D97D4A, #D15C26)
  zen: H("#737597", 0.4), mid: H("#785566", 0.55), hor: H("#D97D4A", 1.05),
  fog: H("#785566", 0.32), glow: H("#D97D4A", 0.85),
  sun: V(-1, 0.03, -0.15), sunCol: H("#D15C26", 0.6), sunK: 1,
  stars: 0.3, deep: 0, moonK: 0.12,
  light: C(2.1, 1.35, 1.0), hemiSky: H("#737597", 0.9), hemiGround: H("#785566", 0.3), hemi: 0.9, env: 1.6,
  density: 0.0036, cloudShade: H("#785566", 0.55), cloudLight: H("#D97D4A", 1.2),
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

const GOLDEN: Mood = {
  // north-east: Samuel's lake photo: a dusky blue sky, cool and still, a peach-rose band low over
  // the horizon with a little red in it, and the low sun behind you laying brown-gold light on
  // the land (the colour he loves, kept to the land so the sky's cool restraint holds)
  zen: H("#46648C", 0.55), mid: H("#7F97B2", 0.55), hor: H("#E5B7A0", 0.75),
  fog: H("#6E7D96", 0.45), glow: H("#C9786A", 0.9),
  sun: V(-0.7, 0.1, 0.7), sunCol: H("#FFB36B", 0.6), sunK: 0.4,
  stars: 0.1, deep: 0, moonK: 0.05,
  light: C(2.4, 1.75, 1.0), hemiSky: H("#7F97B2", 1.0), hemiGround: H("#8A6A3E", 0.45), hemi: 0.9, env: 1.4,
  density: 0.0026, cloudShade: H("#6E7D96", 0.6), cloudLight: H("#F0C2A8", 1.0),
};
const DUSK: Mood = {
  // north-west: dusk, reds and blues together, in Samuel's dusk palette: navy overhead,
  // teal-grey below it, the last maroon and burnt orange along the horizon (#25283A, #5E8590,
  // #6B2F33, #D35A15, #545152)
  zen: H("#25283A", 0.45), mid: H("#5E8590", 0.32), hor: H("#D35A15", 0.8),
  fog: H("#25283A", 0.55), glow: H("#6B2F33", 1.1),
  sun: V(-0.7, -0.02, -0.7), sunCol: H("#D35A15", 0.9), sunK: 0.35, // gone below: only its red remains, low down
  stars: 0.75, deep: 0.2, moonK: 0.12,
  light: C(1.35, 1.05, 1.2), hemiSky: H("#5E8590", 0.8), hemiGround: H("#6B2F33", 0.35), hemi: 0.8, env: 1.3,
  density: 0.0036, cloudShade: H("#25283A", 0.6), cloudLight: H("#6B2F33", 1.3),
};
const EMBER: Mood = {
  // south-west: Samuel's sunset over the sea: a teal-sage sky, a molten gold-orange sun on the
  // horizon, dark clouds lit rust from below, the land nearly black (#AE3B13, #846146,
  // #3B4840, #2F2E2C, #17191B)
  zen: H("#3B4840", 0.8), mid: H("#6f9a95", 0.55), hor: H("#F09A2A", 0.9),
  fog: H("#2F2E2C", 0.6), glow: H("#AE3B13", 0.8),
  sun: V(-0.7, 0.02, 0.7), sunCol: H("#FFB030", 0.55), sunK: 1,
  stars: 0.15, deep: 0, moonK: 0.08,
  light: C(2.2, 1.3, 0.8), hemiSky: H("#3B4840", 1.2), hemiGround: H("#846146", 0.3), hemi: 0.85, env: 1.6,
  density: 0.0036, cloudShade: H("#17191B", 0.9), cloudLight: H("#AE3B13", 1.4),
};
const DAWN: Mood = {
  // south-east: Samuel's cyan-to-coral sky: clear cyan above, soft steel blue, a blush of pink,
  // salmon, and coral red on the horizon (#00B4D8, #9DB9CE, #E2C4CE, #F99B9B, #F1525E)
  zen: H("#00B4D8", 0.42), mid: H("#9DB9CE", 0.5), hor: H("#F1525E", 0.95),
  fog: H("#9DB9CE", 0.3), glow: H("#F99B9B", 0.85),
  sun: V(0.7, 0.0, 0.7), sunCol: H("#F99B9B", 0.6), sunK: 0.6,
  stars: 0.25, deep: 0, moonK: 0.15,
  light: C(1.85, 1.45, 1.55), hemiSky: H("#9DB9CE", 0.9), hemiGround: H("#F99B9B", 0.25), hemi: 0.9, env: 1.4,
  density: 0.003, cloudShade: H("#9DB9CE", 0.45), cloudLight: H("#F99B9B", 1.1),
};

/** Every mood, and the direction from the shore where it is full (x east, z south). */
/** Each mood's colour grade, in the order of MOODS: the shadows' lifted colour, the highlights'
    tint, saturation, contrast. Gentle: a film's grade, not a filter. */
const GRADES: [THREE.Color, THREE.Color, number, number][] = [
  [C(0.0, 0.01, 0.045), C(1.0, 0.98, 0.95), 1.0, 1.05], // night: cool blue shadows
  [C(0.01, 0.02, 0.05), C(1.04, 1.0, 0.96), 0.95, 1.05], // winter sunrise
  [C(0.03, 0.0, 0.045), C(1.08, 0.98, 0.9), 1.08, 1.06], // violet-amber sunset
  [C(0.0, 0.0, 0.02), C(1.0, 1.0, 1.0), 0.9, 1.1], // deep night
  [C(0.0, 0.01, 0.05), C(0.97, 1.0, 1.05), 1.0, 1.04], // blue hour
  [C(0.0, 0.015, 0.05), C(1.1, 1.0, 0.86), 1.08, 1.08], // golden hour: dusky blue shadows, gold light
  [C(0.0, 0.01, 0.05), C(1.08, 0.95, 0.9), 1.05, 1.06], // dusk: reds and blues
  [C(0.0, 0.02, 0.02), C(1.1, 0.98, 0.85), 1.1, 1.1], // ember: teal shadows, gold
  [C(0.01, 0.02, 0.05), C(1.06, 0.98, 0.98), 1.05, 1.04], // pink dawn
];

const MOODS: { mood: Mood; dir: [number, number] | null }[] = [
  { mood: NIGHT, dir: null },
  { mood: SUNRISE, dir: [1, 0] },
  { mood: SUNSET, dir: [-1, 0] },
  { mood: DEEP, dir: [0, -1] },
  { mood: TWILIGHT, dir: [0, 1] },
  { mood: GOLDEN, dir: [Math.SQRT1_2, -Math.SQRT1_2] },
  { mood: DUSK, dir: [-Math.SQRT1_2, -Math.SQRT1_2] },
  { mood: EMBER, dir: [-Math.SQRT1_2, Math.SQRT1_2] },
  { mood: DAWN, dir: [Math.SQRT1_2, Math.SQRT1_2] },
];
export const MOOD_NAMES = ["night", "sunrise", "sunset", "deep", "twilight", "golden", "dusk", "ember", "dawn"];

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
    // the grade, blended as the moods are
    const G = gradeUniforms;
    G.shadow.value.setRGB(0, 0, 0);
    G.high.value.setRGB(0, 0, 0);
    G.sat.value = 0;
    G.contrast.value = 0;
    this.w.forEach((wi, i) => {
      const [sh, hi, sat, con] = GRADES[i];
      G.shadow.value.r += sh.r * wi;
      G.shadow.value.g += sh.g * wi;
      G.shadow.value.b += sh.b * wi;
      G.high.value.r += hi.r * wi;
      G.high.value.g += hi.g * wi;
      G.high.value.b += hi.b * wi;
      G.sat.value += sat * wi;
      G.contrast.value += con * wi;
    });
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
    this.t.scene.environmentIntensity = m.env * 0.7; // a quieter sheen of sky on the land
  }
}

function structuredCloneMood(m: Mood): Mood {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(m)) out[k] = v instanceof THREE.Color || v instanceof THREE.Vector3 ? v.clone() : v;
  return out as unknown as Mood;
}
