/* The tarot cards live here as small lit rooms.
   Their imagery is the user's photographed Egyptian tarot (22 PNGs,
   512x768 with transparent margins) where a photo exists; the corner
   stations keep the procedural linework drawn on canvas by tour/tarotArt.
   Either way it lands on a plane backed by a soft additive halo, like
   breath behind glass.
   A narration cue ignites one: a flare of gold, a shimmer, a steady lamp.
   Every brightness is a pure function of narration seconds —
   one leap or a hundred small steps find the same card, so seeking,
   scrubbing and replay are safe.
   Photo loading never mutates a live texture: each photo is painted onto
   a fresh canvas exactly once, uploaded through the renderer's normal
   first-use path, and live materials are repointed at the new texture
   between frames. No canvas is ever repainted after upload. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";

import { CARD_H, CARD_W, drawCard } from "../tour/tarotArt";

const { texture, uniform, vec3 } = T;

/* ------------------------------------------------------------------ *
 * Constants + ignition curve
 * ------------------------------------------------------------------ */

export const CARD_COUNT = 26;

/** Brightness of an un-ignited card's linework. */
const DORMANT = 0.28;
/** Settled brightness of a lit card. */
const LIT = 1.0;
/** Peak brightness of the ignition flare. */
const FLARE = 2.8;
/** Seconds from ignite to the peak of the flare. */
const RISE = 0.32;
/** Exponential decay constant from peak back down to LIT. */
const DECAY = 0.62;
/** dt at which a card is considered "fully lit". */
const SETTLE = RISE + 1.4;

/** Warm gold multiplier applied to every card's linework. */
const GOLD_TINT = /* @__PURE__ */ vec3(1.0, 0.93, 0.76);

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Card linework brightness for a given `dt = uT - igniteAt`.
 * Dormant -> fast flare (ease-out) -> damped shimmer -> settled gold.
 */
export function ignitionBrightness(dt: number): number {
  if (!(dt > 0)) return DORMANT; // also covers -Infinity before ignition

  if (dt < RISE) {
    const k = dt / RISE;
    const inv = 1 - k;
    const ease = 1 - inv * inv * inv; // easeOutCubic
    return DORMANT + (FLARE - DORMANT) * ease;
  }

  const t = dt - RISE;
  const settle = Math.exp(-t / DECAY);
  const shimmer = 0.06 * Math.sin(t * 26) * Math.exp(-t / 0.45);
  return LIT + (FLARE - LIT) * settle + shimmer;
}

/** Additive halo strength for a given `dt`. */
export function ignitionGlow(dt: number): number {
  if (!(dt > 0)) return 0.08;
  const b = ignitionBrightness(dt);
  const over = clamp01((b - DORMANT) / (FLARE - DORMANT));
  return 0.08 + 0.95 * over;
}

/* ------------------------------------------------------------------ *
 * Real card photos (async, non-blocking)
 * ------------------------------------------------------------------ */

/**
 * 22 photographed Egyptian-tarot cards (512x768 PNG with transparent
 * margins), keyed by station/card index. Stations 0, 8, 16 and 25 have
 * no photo and keep the procedural `drawCard` canvas permanently.
 */
const PHOTO_FILES = new Map<number, string>([
  [1, "card-01-magician.png"],
  [2, "card-02-high-priestess.png"],
  [3, "card-03-empress.png"],
  [4, "card-04-emperor.png"],
  [5, "card-05-hierophant.png"],
  [6, "card-06-lovers.png"],
  [7, "card-07-chariot.png"],
  [9, "card-09-strength.png"],
  [10, "card-10-hermit.png"],
  [11, "card-11-wheel.png"],
  [12, "card-12-justice.png"],
  [13, "card-13-hanged-man.png"],
  [14, "card-14-death.png"],
  [15, "card-15-temperance.png"],
  [17, "card-17-devil.png"],
  [18, "card-18-tower.png"],
  [19, "card-19-star.png"],
  [20, "card-20-moon.png"],
  [21, "card-21-sun.png"],
  [22, "card-22-judgement.png"],
  [23, "card-23-world.png"],
  [24, "card-24-fool.png"],
]);

interface PhotoState {
  img: HTMLImageElement;
  /** True once `onload` has fired; false while pending or after a failed load. */
  loaded: boolean;
}

const photoStates = new Map<number, PhotoState>();

/**
 * Minimal shape of the TSL texture node a card material samples through.
 * (`T` is untyped, so we only rely on `.value`.)
 */
interface SwappableTexNode {
  value: THREE.Texture;
}

/**
 * Texture nodes currently displaying the procedural fallback for a station
 * whose photo has not arrived yet. When the photo loads, each node is
 * repointed at a brand-new photo texture — the fallback canvas and texture
 * are never mutated after their first upload.
 */
const cardNodes = new Map<number, Set<SwappableTexNode>>();

/** Live card textures by station index. */
const texCache = new Map<number, THREE.CanvasTexture>();

/** Paint `img` over the whole 512x768 canvas (transparent margins stay clear).
    Always called on a fresh canvas; the 2d-state reset is defensive. */
function paintPhoto(img: HTMLImageElement, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Reset 2d state defensively (a reused canvas could carry sticky
  // shadowBlur/shadowColor from drawCard's Pen in tour/tarotArt, which
  // would cast a phantom gold shadow of the photo onto its margins).
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.filter = "none";
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.drawImage(img, 0, 0, CARD_W, CARD_H);
  ctx.restore();
}

/** Shared sampler/color setup for every card texture. */
function finalizeCardTexture(tex: THREE.CanvasTexture, idx: number): THREE.CanvasTexture {
  tex.name = `tarot-${idx}`;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build a brand-new texture from a photo: fresh canvas, painted exactly
 * once, then never mutated. The texture is uploaded by the renderer on its
 * first use inside a normal frame — the same init path as every texture.
 */
function makePhotoTexture(img: HTMLImageElement, idx: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  paintPhoto(img, canvas);
  return finalizeCardTexture(new THREE.CanvasTexture(canvas), idx);
}

/* Kick off every photo load at module scope — `img.src` is async, so
   module evaluation is never blocked. When a photo arrives, a FRESH
   texture is built from a FRESH canvas and every live material sampling
   the procedural fallback for that station is repointed at it. The
   fallback canvas/texture are never touched after their first upload:
   no in-place repaint, no needsUpdate churn on a bound texture.
   (Image `onload` fires as a task between frames — it can never run in
   the middle of the renderer's synchronous frame recording.) */
for (const [idx, file] of PHOTO_FILES) {
  const state: PhotoState = { img: new Image(), loaded: false };
  state.img.onload = () => {
    state.loaded = true;
    const nodes = cardNodes.get(idx);
    cardNodes.delete(idx);
    if (!nodes || nodes.size === 0) {
      // No live materials sample the fallback: drop the stale procedural
      // texture (if any) so a late cardTexture() rebuilds from the photo
      // instead of reusing it. Deferred for the same in-flight-frame reason.
      const stale = texCache.get(idx);
      if (stale) {
        texCache.delete(idx);
        setTimeout(() => stale.dispose(), 1500);
      }
      return;
    }
    const fresh = makePhotoTexture(state.img, idx);
    texCache.set(idx, fresh);
    const olds = new Set<THREE.CanvasTexture>();
    for (const node of nodes) {
      const old = node.value as THREE.CanvasTexture | null;
      if (old && old !== fresh) olds.add(old);
      node.value = fresh;
    }
    // Deferred dispose, one per distinct old texture: the just-finished
    // frame may still be in flight on the GPU. By the time the timer fires,
    // no submitted work can reference them.
    for (const old of olds) {
      const doomed = old;
      setTimeout(() => doomed.dispose(), 1500);
    }
  };
  state.img.onerror = () => {
    // keep the procedural fallback permanently; drop swap registrations
    cardNodes.delete(idx);
  };
  state.img.src = `textures/temple/cards/${file}`;
  photoStates.set(idx, state);
}

/* ------------------------------------------------------------------ *
 * Textures (cached)
 * ------------------------------------------------------------------ */

/** Wrap/clamp any index into 0..25. */
function normIndex(i: number): number {
  if (!Number.isFinite(i)) return 0;
  const n = Math.floor(i) % CARD_COUNT;
  return n < 0 ? n + CARD_COUNT : n;
}

/**
 * Cached CanvasTexture for card `i` (wrapped into 0..25). The backing
 * canvas is painted exactly once — before the texture is created — and is
 * never mutated afterwards. When a photo arrives later, materials are
 * repointed at a fresh texture (see the preload loop); this texture object
 * is left alone.
 */
export function cardTexture(i: number): THREE.CanvasTexture {
  const idx = normIndex(i);
  const cached = texCache.get(idx);
  if (cached) return cached;

  const photo = photoStates.get(idx);
  const tex =
    photo && photo.loaded
      ? makePhotoTexture(photo.img, idx) // photo already in
      : finalizeCardTexture(new THREE.CanvasTexture(drawCard(idx)), idx); // procedural fallback

  texCache.set(idx, tex);
  return tex;
}

/** Drop cached card textures (hot reload / teardown). */
export function disposeCardTextures(): void {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
  cardNodes.clear();
}

/** Single soft radial halo texture, shared by every card. */
let glowTex: THREE.CanvasTexture | null = null;

function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;

  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;

  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.0, "rgba(255,238,196,0.95)");
  g.addColorStop(0.25, "rgba(255,206,122,0.55)");
  g.addColorStop(0.55, "rgba(216,152,62,0.20)");
  g.addColorStop(1.0, "rgba(120,80,20,0.0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  glowTex = new THREE.CanvasTexture(canvas);
  glowTex.name = "tarot-glow";
  glowTex.colorSpace = THREE.SRGBColorSpace;
  glowTex.minFilter = THREE.LinearFilter;
  glowTex.magFilter = THREE.LinearFilter;
  glowTex.needsUpdate = true;

  return glowTex;
}

/* ------------------------------------------------------------------ *
 * Card mesh
 * ------------------------------------------------------------------ */

export interface CardUserData {
  /** Narration seconds at which ignition starts. `Infinity` = never. */
  igniteAt: number;
  /** True once the flare has settled into the lit gold state. */
  lit: boolean;
  /** Brightness uniform driven by `updateCards`. */
  uBright?: { value: number };
  /** Halo strength uniform driven by `updateCards`. */
  uGlow?: { value: number };
  /** Halo plane, scaled up during the flare. */
  glow?: THREE.Object3D;
}

/**
 * A tarot card: textured plane (MeshBasicNodeMaterial, transparent) backed
 * by a soft additive glow plane. Both are driven purely from `updateCards`.
 */
export function cardMesh(i: number, w = 2.2, h = 3.4): THREE.Group {
  const idx = normIndex(i);
  const group = new THREE.Group();
  group.name = `tarot-card-${idx}`;

  /* --- card plane ------------------------------------------------- */

  const cardTexNode = texture(cardTexture(idx));

  // If the photo for this station hasn't arrived yet, register the node so
  // the preload loop can repoint it at the fresh photo texture later.
  // (Registration runs back-to-back with cardTexture() in this synchronous
  // call, so no photo arrival can slip between them.)
  const photo = photoStates.get(idx);
  if (photo && !photo.loaded) {
    let set = cardNodes.get(idx);
    if (!set) {
      set = new Set<SwappableTexNode>();
      cardNodes.set(idx, set);
    }
    set.add(cardTexNode);
  }

  const uBright = uniform(DORMANT);

  const cardMat = new THREE.MeshBasicNodeMaterial();
  cardMat.name = "tarot-card-mat";
  cardMat.transparent = true;
  cardMat.depthWrite = true;
  cardMat.side = THREE.DoubleSide;
  cardMat.colorNode = cardTexNode.rgb.mul(GOLD_TINT).mul(uBright);
  cardMat.opacityNode = cardTexNode.a;

  const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), cardMat);
  card.name = "card";
  card.renderOrder = 1;
  group.add(card);

  /* --- soft glow backing ------------------------------------------ */

  const glowTexNode = texture(glowTexture());
  const uGlow = uniform(ignitionGlow(-1));

  const glowMat = new THREE.MeshBasicNodeMaterial();
  glowMat.name = "tarot-glow-mat";
  glowMat.transparent = true;
  glowMat.depthWrite = false;
  glowMat.side = THREE.DoubleSide;
  glowMat.blending = THREE.AdditiveBlending;
  glowMat.fog = false;
  glowMat.colorNode = glowTexNode.rgb.mul(uGlow);
  glowMat.opacityNode = glowTexNode.a;

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.3, h * 1.75), glowMat);
  glow.name = "glow";
  glow.position.z = -0.02;
  glow.renderOrder = 0;
  group.add(glow);

  /* --- state ------------------------------------------------------ */

  const data: CardUserData = {
    igniteAt: Infinity,
    lit: false,
    uBright,
    uGlow,
    glow,
  };
  group.userData = data;

  return group;
}

/* ------------------------------------------------------------------ *
 * Ignition
 * ------------------------------------------------------------------ */

/** Start (or re-start) a card's ignition at narration time `uT`. */
export function ignite(group: THREE.Group, uT: number): void {
  const ud = group.userData as Partial<CardUserData>;
  if (!ud || typeof ud !== "object") return;

  ud.igniteAt = uT;
  ud.lit = false;
}

/**
 * Walk `parent`'s descendants and refresh every ignitable card from the
 * current narration time. Everything is derived from `uT`, nothing is
 * integrated frame-to-frame.
 */
export function updateCards(parent: THREE.Object3D, uT: number): void {
  parent.traverse((obj) => {
    if (obj === parent) return;

    const ud = obj.userData as CardUserData | undefined;
    if (!ud || ud.igniteAt === undefined) return;

    const dt = uT - ud.igniteAt;
    const bright = ignitionBrightness(dt);

    if (ud.uBright) ud.uBright.value = bright;
    if (ud.uGlow) ud.uGlow.value = ignitionGlow(dt);

    if (ud.glow) {
      const over = clamp01((bright - LIT) / (FLARE - LIT));
      const s = 1 + 0.35 * over;
      ud.glow.scale.set(s, s, 1);
    }

    ud.lit = dt >= SETTLE;
  });
}
