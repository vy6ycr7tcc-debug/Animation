/* The tarot cards live here as small lit rooms.
   Their imagery is the user's photographed Egyptian tarot (22 PNGs,
   512x768 with transparent margins) where a photo exists; the corner
   stations keep the procedural linework drawn on canvas by tour/tarotArt.
   Either way it lands on a plane backed by a soft additive halo, like
   breath behind glass.
   A narration cue ignites one: a flare of gold, a shimmer, a steady lamp.
   Every brightness is a pure function of narration seconds —
   one leap or a hundred small steps find the same card, so seeking,
   scrubbing and replay are safe. */
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
  /** Canvases awaiting an in-place repaint once the photo arrives. */
  pending: Map<HTMLCanvasElement, THREE.CanvasTexture>;
}

const photoStates = new Map<number, PhotoState>();

/** Paint `img` over the whole 512x768 canvas (transparent margins stay clear). */
function paintPhoto(img: HTMLImageElement, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // The fallback canvas may carry sticky 2d state from drawCard's Pen
  // (gold shadowBlur/shadowColor in tour/tarotArt) — reset it, or drawImage
  // would cast a phantom gold shadow of the photo onto its transparent margins.
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

/* Kick off every photo load at module scope — `img.src` is async, so
   module evaluation is never blocked. Each finished photo repaints any
   canvases already waiting on it, exactly once. */
for (const [idx, file] of PHOTO_FILES) {
  const state: PhotoState = {
    img: new Image(),
    loaded: false,
    pending: new Map(),
  };
  state.img.onload = () => {
    state.loaded = true;
    for (const [canvas, tex] of state.pending) {
      paintPhoto(state.img, canvas);
      tex.needsUpdate = true;
    }
    state.pending.clear();
  };
  state.img.onerror = () => {
    // keep the procedural fallback; drop waiters so nothing leaks
    state.pending.clear();
  };
  state.img.src = `textures/temple/cards/${file}`;
  photoStates.set(idx, state);
}

/* ------------------------------------------------------------------ *
 * Textures (cached)
 * ------------------------------------------------------------------ */

const texCache = new Map<number, THREE.CanvasTexture>();

/** Wrap/clamp any index into 0..25. */
function normIndex(i: number): number {
  if (!Number.isFinite(i)) return 0;
  const n = Math.floor(i) % CARD_COUNT;
  return n < 0 ? n + CARD_COUNT : n;
}

/** Cached CanvasTexture for card `i` (wrapped into 0..25). */
export function cardTexture(i: number): THREE.CanvasTexture {
  const idx = normIndex(i);
  const cached = texCache.get(idx);
  if (cached) return cached;

  const photo = photoStates.get(idx);
  let canvas: HTMLCanvasElement;
  if (photo && photo.loaded) {
    // photo already in: paint it instead of the procedural card
    canvas = document.createElement("canvas");
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    paintPhoto(photo.img, canvas);
  } else {
    // no photo yet (or none at all): procedural fallback
    canvas = drawCard(idx);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.name = `tarot-${idx}`;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;

  if (photo && !photo.loaded) {
    // when the photo arrives, repaint THIS canvas in place and re-upload
    // the SAME texture — no texture-object swap, no material pop
    photo.pending.set(canvas, tex);
  }

  texCache.set(idx, tex);
  return tex;
}

/** Drop cached card textures (hot reload / teardown). */
export function disposeCardTextures(): void {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
  for (const p of photoStates.values()) p.pending.clear();
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
  const group = new THREE.Group();
  group.name = `tarot-card-${normIndex(i)}`;

  /* --- card plane ------------------------------------------------- */

  const cardTexNode = texture(cardTexture(i));

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
