/* The archetypes as glowing carvings (Samuel: "make them flat… like a glowing carving… take all
   the tarot cards… almost like you scan them, but then the background is empty… the traces,
   they are glowy"). Each card's own drawing, traced from his Ra tarot photos by
   tools/build-card-glyphs.py (the line in the luminance channel, a soft glow round it in alpha),
   stands upright where its being stands: gold line warming into the archetype's colour, a halo
   of that colour about it, breathing, a slow band of light rising through it; brighter as you
   come near and in its rite, flaring as it greets you. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";

const { exp, float, fract, mix, sin, texture, uniform, uv, vec3, vec4 } = T;

/** The card's proportion (the traced area, width to height). */
export const GLYPH_ASPECT = 480 / 840;

const cache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();
const pending = new Set<Promise<void>>();
/** Settles when every drawing asked for so far has arrived (for still frames, ?shot). */
export async function glyphsLoaded(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
}
/** The traced card for a numeral, loaded once and shared. */
function glyphTexture(numeral: string): THREE.Texture {
  let t = cache.get(numeral);
  if (!t) {
    let done!: () => void;
    const p = new Promise<void>((r) => (done = r));
    pending.add(p);
    const settle = () => (pending.delete(p), done());
    t = loader.load(`textures/cards/${numeral}.png`, settle, undefined, settle);
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4;
    cache.set(numeral, t);
  }
  return t;
}

export interface Glyph {
  mesh: THREE.Mesh;
  /** Near (0..1), its rite (0..1), the greeting's flash (0..1), time, and the tour's focus (0..1:
      the shrine being spoken about glows from within, no lamp on it). */
  u: { wake: { value: number }; rite: { value: number }; greet: { value: number }; t: { value: number }; focus: { value: number } };
  /** Load its drawing (the first time it is near). */
  load(): void;
}

/** A glowing carving of card `numeral`, `height` metres tall, its foot at y = 0, facing +z. */
export function makeGlyph(numeral: string, tint: THREE.Color, height: number): Glyph {
  const u = { wake: uniform(0), rite: uniform(0), greet: uniform(0), t: uniform(0), focus: uniform(0) };
  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  blank.needsUpdate = true;
  const tex = texture(blank);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const s = tex.sample(uv());
  // only the firm strokes: faint hatching (shaded skies, canopies) would fill the card with a haze
  const line = T.smoothstep(0.13, 0.5, s.r);
  const v = uv().y;
  // a slow band of light rising through it, quicker in its rite
  const bandY = fract(u.t.mul(mix(float(0.05), float(0.14), u.rite)));
  const band = exp(v.sub(bandY).mul(v.sub(bandY)).mul(-60)).mul(0.5);
  const breathe = sin(u.t.mul(0.55)).mul(0.08).add(0.92);
  const k = float(0.4).add(u.wake.mul(0.45)).add(u.rite.mul(0.45)).add(u.greet.mul(0.6)).add(u.focus.mul(0.55)).mul(breathe).add(band);
  const c = vec3(tint.r, tint.g, tint.b);
  const gold = vec3(1.0, 0.8, 0.5);
  const col = mix(gold, c, 0.3).mul(line).mul(0.85);
  // in focus the card glows from within: the traced glow about every stroke (alpha) rises as a
  // soft halo of its own colour, and the lines warm toward white; contained, never a veil
  const halo = s.a.mul(s.a).mul(u.focus).mul(0.2).mul(breathe);
  const warm = mix(col, col.add(vec3(0.25, 0.2, 0.12).mul(line)), u.focus);
  mat.colorNode = vec4(warm.mul(k).add(mix(gold, c, 0.6).mul(halo)), 1);
  const w = height * GLYPH_ASPECT;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, height).translate(0, height / 2, 0), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  let loaded = false;
  return {
    mesh,
    u,
    load() {
      if (loaded) return;
      loaded = true;
      tex.value = glyphTexture(numeral);
    },
  };
}
