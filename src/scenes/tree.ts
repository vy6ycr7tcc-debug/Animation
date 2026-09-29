/* tree.ts — the tree of life, on the coastal hill at SITES.tree.
 *
 * Everything here is composed from systems that already run in the game:
 *   • the tree itself is world/creation.ts — `grow(SHAPES[2], seed)` (the spreading,
 *     tree-of-life shape), `tubes()` for the round trunk/branches and roots, and
 *     `barkMaterial()` for living willow bark with starlight in the grain;
 *   • the canopy is the spriteCloud idiom from buildLeaves: soft instanced points hung
 *     on the twig `tips`, twinkling and breathing in TSL, with a slow fall of leaves —
 *     alpha folded into RGB, never a second alpha channel;
 *   • the CreationKit makers re-choreograph the signature creation beat around it:
 *     slow gold rings above the crown, columns of pale light, breathing path lamps,
 *     a breathing ground disc, and a maternal wisp circling slowly.
 *
 * The tree is grown grand: the whole grown tree carries one clean TREE_SCALE (trunk ~7m,
 * canopy to match), and every dependent value — crown top/spread, the rings, the beam ring,
 * the ground disc, the wisp orbit, the heart-light, the lamp start — is measured in world
 * units in proportion. The canopy sprites are sized and counted to keep the crown lush.
 *
 * NaN discipline: no JS arithmetic operators on TSL nodes (only .add/.sub/.mul/.div and
 * TSL functions — the old build's `+`/`*` on nodes is exactly what produced the NaN alpha),
 * every uniform initialised, every division guarded, every CPU number passed through `safe()`,
 * seeded RNG only, and glowShader colour callbacks return vec3.
 */

import * as THREE from "three/webgpu";

import type { Narration } from "../core/narration";
import { barkMaterial, grow, SHAPES, tubes } from "../world/creation";
import { heightAt } from "../world/terrain";
import { glowShader, gpuUniforms, softPoints, spriteCloud, T, viewDepth } from "../gpu/tsl";
import { CreationKit } from "./creationKit";
import type { SceneModule } from "./lessonKit";
import { SITES } from "./sites";

type Vec3Like = { x: number; y: number; z: number };

const TREE_SEED = 7411;
/** One clean scale for the whole grown tree — trunk ~7m tall, canopy to match. */
const TREE_SCALE = 1.7;
const SEAT_BACK = 3.2;
const SEAT_RADIUS = 2.2;
const WISP_COLOR = 0xffbe86;
const WISP_SIZE = 0.9;

const REST_LINES: ReadonlyArray<{ t: number; ms: number; text: string }> = [
  { t: 3.5, ms: 3200, text: "There now. The road can wait." },
  { t: 11, ms: 3400, text: "You don't have to become anything here." },
  { t: 19, ms: 3000, text: "Rest is also a kind of choosing." },
  { t: 27, ms: 3600, text: "When you're ready — the light is still there." },
];

/** Deterministic placement: the same seed grows the same tree and hangs the same leaves. */
function makeRng(seed: number): () => number {
  let s = Math.floor(Math.abs(seed)) % 2147483647;
  if (s <= 0) s = 16807;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Every CPU number that reaches a node or a transform passes through here. */
function safe(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/** View depth of the world position of the local point `p` (a sprite carries its own matrix). */
function depthOf(p: any): any {
  const model: any = (T as any).modelMatrix || (T as any).modelWorldMatrix;
  return model ? viewDepth(model.mul(T.vec4(p, 1)).xyz) : viewDepth(p);
}

export class TreeOfLifeScene implements SceneModule {
  id = "tree";
  active = false;
  readonly sitPrompt = "Rest beneath the tree";
  readonly panelTitle = "❋ The tree of life";

  seatPos: THREE.Vector3;
  seatHeading: number;

  private readonly whisperFn: (text: string, ms?: number) => void;
  private readonly player: { pos: THREE.Vector3; heading: number; target: THREE.Vector2 | null };
  private readonly narration: Narration;

  private readonly group = new THREE.Group();
  private readonly kit = new CreationKit();
  private readonly treeGroup = new THREE.Group();

  private readonly treeX: number;
  private readonly treeZ: number;
  private readonly groundY: number;

  private canopyTopY = 5;
  private canopySpread = 5;

  private wisp: { group: THREE.Group; setCenter: (v: THREE.Vector3) => void };
  private readonly wispCenter = new THREE.Vector3();
  private wispT = 0;
  private wispRadius = 5.4 * TREE_SCALE;

  private heartHalo: THREE.Mesh | null = null;
  private readonly heartWorld = new THREE.Vector3();

  private resting = false;
  private restT = 0;
  private elapsed = 0;
  private readonly life = T.uniform(0);
  private readonly firedLines = new Set<number>();
  private greeted = false;

  constructor(
    scene: THREE.Scene,
    narration: Narration,
    player: { pos: THREE.Vector3; heading: number; target: THREE.Vector2 | null },
    _wanderer: { setGesture: (g: string) => void } | undefined,
    _follow: unknown,
    hooks: { whisper: (text: string, ms?: number) => void },
  ) {
    this.whisperFn = hooks.whisper;
    this.player = player;
    this.narration = narration;

    const site = SITES.tree;
    const heading = safe(site.heading, 0);
    this.treeX = safe(site.x, 0);
    this.treeZ = safe(site.z, 0);
    this.groundY = safe(heightAt(this.treeX, this.treeZ), 0);
    this.seatHeading = heading;

    // The seat stands a little way out along the site heading, facing back to the tree.
    const sx = this.treeX + Math.sin(heading) * SEAT_BACK;
    const sz = this.treeZ + Math.cos(heading) * SEAT_BACK;
    this.seatPos = new THREE.Vector3(sx, this.groundY + 0.55, sz);

    this.treeGroup.position.set(this.treeX, this.groundY, this.treeZ);
    this.group.add(this.treeGroup);

    this.buildTree();
    this.buildHeart();
    this.buildSeat();
    this.buildSky();
    this.buildPath();

    this.wisp = this.buildSoftWisp();
    this.group.add(this.wisp.group);

    this.group.add(this.kit.group);
    scene.add(this.group);
    this.active = true;
  }

  /* ---------------------------------------------------------------- the tree itself */

  private buildTree(): void {
    const grown = grow(SHAPES[2], TREE_SEED);
    const tips = grown.tips;

    let topY = 0;
    let spread = 0;
    for (const p of tips) {
      const y = safe(p.y, 0);
      const r = Math.hypot(safe(p.x, 0), safe(p.z, 0));
      if (y > topY) topY = y;
      if (r > spread) spread = r;
    }

    // One clean scale for the whole grown tree; everything downstream is measured in world units.
    this.treeGroup.scale.setScalar(safe(TREE_SCALE, 1));
    this.canopyTopY = Math.min(Math.max(safe(topY * TREE_SCALE, 5), 4), 34);
    this.canopySpread = Math.min(Math.max(safe(spread * TREE_SCALE, 5), 4), 26);

    const bark = barkMaterial(new THREE.Color(0xffd8a4), TREE_SEED);
    this.treeGroup.add(new THREE.Mesh(tubes(grown.limbs), bark));
    if (grown.roots.length > 0) {
      this.treeGroup.add(new THREE.Mesh(tubes(grown.roots), bark));
    }

    // Anchors for the canopy: the twig tips the grown tree already offers.
    const tipCount = Math.max(1, tips.length);
    const pick = (r: number): Vec3Like => {
      const i = Math.min(tipCount - 1, Math.max(0, Math.floor(r * tipCount)));
      return tips.length > 0 ? tips[i] : { x: 0, y: this.canopyTopY * 0.8, z: 0 };
    };

    this.buildCanopy(pick);
    this.buildFallingLeaves(pick);
  }

  /** The living crown: soft sprite clusters at the twig tips, twinkling and breathing. */
  private buildCanopy(pick: (r: number) => Vec3Like): void {
    const R = makeRng(TREE_SEED + 17);
    const count = 1400;

    const mat = softPoints();
    const cloud = spriteCloud(count, { base: 3, aK: 1, aHue: 1 }, mat);
    const base = cloud.attrs.base.array as Float32Array;
    const kArr = cloud.attrs.aK.array as Float32Array;
    const hArr = cloud.attrs.aHue.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const a = pick(R());
      const ang = R() * Math.PI * 2;
      const rad = Math.pow(R(), 0.55) * 1.35;
      base[i * 3 + 0] = safe(a.x + Math.cos(ang) * rad, 0);
      base[i * 3 + 1] = safe(a.y + (R() - 0.5) * 1.15, 0);
      base[i * 3 + 2] = safe(a.z + Math.sin(ang) * rad, 0);
      kArr[i] = R();
      hArr[i] = R();
    }
    cloud.attrs.base.needsUpdate = true;
    cloud.attrs.aK.needsUpdate = true;
    cloud.attrs.aHue.needsUpdate = true;
    cloud.setCount(count);
    this.treeGroup.add(cloud.sprite);

    const time: any = this.life;
    const b = cloud.nodes.base as any;
    const k = cloud.nodes.aK as any;
    const h = cloud.nodes.aHue as any;

    // The canopy breathes: a slow swell about the trunk, and a luminance wave travelling down.
    const breathe = T.sin(time.mul(0.3)).mul(0.035).add(1.0);
    const p = b.mul(breathe);
    mat.positionNode = p;

    const tw = T.sin(time.mul(k.mul(2.5).add(1.2)).add(k.mul(60))).mul(0.45).add(0.55);
    const wave = T.sin(time.mul(0.5).sub(p.y.mul(0.4))).mul(0.22).add(0.78);
    const soft = T.smoothstep(0.5, 0.12, T.length(T.pointUV.sub(0.5)));
    const color = T.mix(T.vec3(0.36, 0.68, 0.5), T.vec3(1.0, 0.9, 0.62), h);
    mat.colorNode = T.vec4(color.mul(tw.mul(wave).mul(soft).mul(0.85)), 1);

    // Sprites carry their own pixel size, so the crown is scaled by hand to match the tree.
    const sizeW = T.mix(0.3, 0.62, k).mul(TREE_SCALE);
    mat.sizeNode = T.clamp(sizeW.mul(gpuUniforms.px).div(T.max(depthOf(p), 0.5)), 1.5, 150)
      .div(T.max(gpuUniforms.dpr, 1));
  }

  /** Leaves let go and drift down through the same crown, fading as they fall. */
  private buildFallingLeaves(pick: (r: number) => Vec3Like): void {
    const R = makeRng(TREE_SEED + 29);
    const count = 180;

    const mat = softPoints();
    const cloud = spriteCloud(count, { base: 3, aK: 1, aHue: 1 }, mat);
    const base = cloud.attrs.base.array as Float32Array;
    const kArr = cloud.attrs.aK.array as Float32Array;
    const hArr = cloud.attrs.aHue.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const a = pick(R());
      const ang = R() * Math.PI * 2;
      const rad = Math.pow(R(), 0.5) * 2.6;
      base[i * 3 + 0] = safe(a.x + Math.cos(ang) * rad, 0);
      base[i * 3 + 1] = safe(a.y + (R() - 0.5) * 1.6, 0);
      base[i * 3 + 2] = safe(a.z + Math.sin(ang) * rad, 0);
      kArr[i] = R();
      hArr[i] = R();
    }
    cloud.attrs.base.needsUpdate = true;
    cloud.attrs.aK.needsUpdate = true;
    cloud.attrs.aHue.needsUpdate = true;
    cloud.setCount(count);
    this.treeGroup.add(cloud.sprite);

    const time: any = this.life;
    const b = cloud.nodes.base as any;
    const k = cloud.nodes.aK as any;
    const h = cloud.nodes.aHue as any;

    const span = T.float(safe(7.5 * TREE_SCALE, 7.5));
    const drop = T.mod(time.mul(k.mul(0.32).add(0.16)).add(k.mul(span)), span);
    const swayX = T.sin(time.mul(0.7).add(k.mul(21))).mul(0.9);
    const swayZ = T.cos(time.mul(0.55).add(k.mul(13))).mul(0.9);
    const p = T.vec3(b.x.add(swayX), b.y.sub(drop), b.z.add(swayZ));
    mat.positionNode = p;

    const fade = T.smoothstep(0.0, 1.8, drop).mul(T.smoothstep(span, span.mul(0.4), drop));
    const soft = T.smoothstep(0.5, 0.12, T.length(T.pointUV.sub(0.5)));
    const color = T.mix(T.vec3(0.5, 0.78, 0.52), T.vec3(1.0, 0.86, 0.56), h);
    mat.colorNode = T.vec4(color.mul(fade.mul(soft).mul(0.6)), 1);

    const sizeW = T.mix(0.22, 0.4, k).mul(TREE_SCALE);
    mat.sizeNode = T.clamp(sizeW.mul(gpuUniforms.px).div(T.max(depthOf(p), 0.5)), 1.5, 100)
      .div(T.max(gpuUniforms.dpr, 1));
  }

  /* ---------------------------------------------------------------- heart-light */

  private buildHeart(): void {
    // Kept in the grown tree's own units: TREE_SCALE carries it up the trunk to the hollow.
    const hx = Math.sin(this.seatHeading) * 0.42;
    const hy = 1.3;
    const hz = Math.cos(this.seatHeading) * 0.42;
    this.heartWorld.set(
      this.treeX + hx * TREE_SCALE,
      this.groundY + hy * TREE_SCALE,
      this.treeZ + hz * TREE_SCALE,
    );

    const time: any = this.life;

    // The ember in the hollow: one soft point, breathing.
    const mat = softPoints();
    const cloud = spriteCloud(1, { base: 3, aK: 1, aHue: 1 }, mat);
    (cloud.attrs.base.array as Float32Array).set([hx, hy, hz]);
    (cloud.attrs.aK.array as Float32Array).set([0.31]);
    (cloud.attrs.aHue.array as Float32Array).set([0.5]);
    cloud.attrs.base.needsUpdate = true;
    cloud.attrs.aK.needsUpdate = true;
    cloud.attrs.aHue.needsUpdate = true;
    cloud.setCount(1);
    this.treeGroup.add(cloud.sprite);

    const b = cloud.nodes.base as any;
    mat.positionNode = b;
    const pulse = T.sin(time.mul(1.1)).mul(0.16).add(0.9);
    const soft = T.smoothstep(0.5, 0.06, T.length(T.pointUV.sub(0.5)));
    mat.colorNode = T.vec4(T.vec3(1.0, 0.7, 0.4).mul(pulse.mul(soft)), 1);
    mat.sizeNode = T.clamp(
      T.float(safe(1.5 * TREE_SCALE, 1.5)).mul(gpuUniforms.px).div(T.max(depthOf(b), 0.5)),
      2,
      180,
    ).div(T.max(gpuUniforms.dpr, 1));

    // Its halo: wide, faint, and always a vec3 colour (never a nested vec4).
    const haloMat = glowShader({ strength: 0.55 }, (u, uv) => {
      const d = T.length(uv.sub(0.5));
      const fall = T.smoothstep(0.5, 0.03, d);
      const beat = T.sin(time.mul(1.1)).mul(0.12).add(0.88);
      return T.vec3(1.0, 0.62, 0.3).mul(fall.mul(beat).mul(u.strength));
    });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), haloMat);
    halo.position.set(hx, hy, hz);
    halo.renderOrder = 3;
    this.treeGroup.add(halo);
    this.heartHalo = halo;
  }

  /**
   * The maternal wisp as nested soft glow sprites (bright core / warm body / wide faint
   * halo) — the same glow idiom as the heart halo above. Replaces the flat kit.wisp disc.
   * Tree-local so this file owns its look; call sites (`setCenter` in update) are unchanged.
   */
  private buildSoftWisp(): {
    group: THREE.Group;
    setCenter: (v: THREE.Vector3) => void;
  } {
    const group = new THREE.Group();
    group.userData.color = WISP_COLOR;

    type WispLayer = {
      r: number;
      rgb: [number, number, number];
      strength: number;
      omega: number;
      phase: number;
    };

    // halo -> body -> core: add order is draw order at equal renderOrder
    const layers: WispLayer[] = [
      { r: 1.02, rgb: [1.0, 0.62, 0.35], strength: 0.32, omega: 0.897597901, phase: 4.2 },
      { r: 0.55, rgb: [1.0, 0.76, 0.53], strength: 0.55, omega: 1.0471975512, phase: 2.1 },
      { r: 0.3, rgb: [1.0, 0.93, 0.78], strength: 0.95, omega: 1.2566370614, phase: 0.0 },
    ];

    for (const layer of layers) {
      const size = (WISP_SIZE * 2 * layer.r) / 0.3;

      const mat = glowShader({ strength: layer.strength }, (u, uv) => {
        const d = T.length(uv.sub(0.5));
        const ramp = T.smoothstep(0.04, 0.5, d); // ascending: 0 at centre, 1 at rim
        const fall = ramp.mul(-1).add(1); // inverted: soft centre, no hard edge
        const soft = fall.mul(fall);
        const breath = T.sin(this.life.mul(layer.omega).add(layer.phase)).mul(0.12).add(0.88);
        return T.vec3(layer.rgb[0], layer.rgb[1], layer.rgb[2]).mul(soft.mul(breath).mul(u.strength));
      });

      // Keeps-alpha CustomBlending: additive RGB, framebuffer alpha preserved (canon recipe).
      mat.blending = THREE.CustomBlending;
      mat.blendSrc = THREE.SrcAlphaFactor;
      mat.blendDst = THREE.OneFactor;
      mat.blendSrcAlpha = THREE.ZeroFactor;
      mat.blendDstAlpha = THREE.OneFactor;
      mat.transparent = true;
      mat.depthWrite = false;
      mat.fog = false;

      const sprite = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      sprite.renderOrder = 3;
      sprite.frustumCulled = false;
      group.add(sprite);
    }

    return {
      group,
      setCenter: (v: THREE.Vector3) => {
        group.position.copy(v);
      },
    };
  }

  /* ---------------------------------------------------------------- seat, sky, path */

  private buildSeat(): void {
    const geo = new THREE.CylinderGeometry(1.05, 1.5, 0.55, 16, 1);
    // The moss seat: near-black green organic solid, hand-lit in TSL like the bark.
    // Upgrade: two-scale moss variation (fine grain + larger clumps) and a top-face
    // moss lightening, so the top no longer reads as a flat green disc.
    const mat = new THREE.MeshBasicNodeMaterial({ fog: true });
    const n = T.normalWorld;
    const v = T.cameraPosition.sub(T.positionWorld);
    const hemi = T.clamp(n.y.mul(0.5).add(0.5), 0, 1);
    const base = T.mix(T.vec3(0.008, 0.015, 0.01), T.vec3(0.034, 0.068, 0.04), hemi);

    // Hash helper: the bark's fract(sin(...)*43758.5453) idiom, keyed by scale + salt.
    const hashAt = (scale: number, salt: number) => {
      const p = T.positionLocal.mul(scale);
      return T.fract(
        T.sin(p.x.mul(12.9898).add(p.y.mul(78.233)).add(p.z.mul(37.719)).add(salt)).mul(43758.5453),
      );
    };

    // (1) Fine grain: ~4 cm speckle (scale 26), amplitude 0.014 -> +/- 0.007 per channel.
    const fine = hashAt(26, 0).sub(0.5).mul(0.014);
    // (2) Larger clumps: ~24 cm moss clumps (scale 4.2), amplitude 0.032 -> +/- 0.016.
    const clump = hashAt(4.2, 17.31).sub(0.5).mul(0.032);

    // (3) Top-face moss lightening: the seat top catches skylight, the flanks stay near-black.
    //     smoothstep edges ascending only (Safari WebGPU).
    const top = T.smoothstep(0.15, 0.85, n.y);
    const mossTop = T.vec3(0.048, 0.092, 0.056); // max green 0.115 incl. grain, palette 0.008-0.12
    const moss = T.mix(base, mossTop, top).add(clump).add(fine);

    // Thin starlight rim, the bark's `pow(1-ndv, 5) * 0.18`.
    const ndv = T.clamp(n.dot(v).div(T.max(T.length(n).mul(T.length(v)), 1e-4)), 0, 1);
    const rim = T.float(1).sub(ndv).pow(5).mul(0.18);

    const col = moss.add(T.vec3(0.3, 0.38, 0.8).mul(rim));
    // Alpha folded into RGB: a fogged solid, no emissive, fades scale color toward black.
    mat.colorNode = T.vec4(T.max(col, T.vec3(0)), 1);

    const seat = new THREE.Mesh(geo, mat);
    seat.position.set(this.seatPos.x, this.groundY + 0.27, this.seatPos.z);
    seat.rotation.set(0.04, 0, -0.03);
    this.group.add(seat);
  }

  /** The signature creation hint: slow gold rings above the crown, pale beams, breathing ground. */
  /** The signature creation hint: slow gold rings above the crown, pale beams, breathing ground. */
  private buildSky(): void {
    const ringY = this.groundY + this.canopyTopY + 2.8 * TREE_SCALE;
    const ringR = Math.min(Math.max(this.canopySpread + 2.4 * TREE_SCALE, 6), 22);
    this.kit.rings(new THREE.Vector3(this.treeX, ringY, this.treeZ), ringR, 0.12);

    const R = makeRng(TREE_SEED + 91);
    const beams: THREE.Vector3[] = [];
    const n = 5;
    const beamR = this.canopySpread + 5.5 * TREE_SCALE;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.4;
      const rr = beamR * (0.85 + R() * 0.35);
      beams.push(new THREE.Vector3(
        this.treeX + Math.cos(a) * rr,
        this.groundY,
        this.treeZ + Math.sin(a) * rr,
      ));
    }
    // Stream above is byte-identical to the old source: 2 draws per beam, same order -> same 5 positions.

    // Tree-local shafts replace kit.beams(): same placement/height/radius, but each shaft
    // fades along its length and dissolves at its silhouette - never a hard-edged bar.
    const BEAM_H = 15;
    const BEAM_R = 0.34;
    const BEAM_COL = T.vec3(0.72, 0.82, 1.0); // canon beam color 0xb8d1ff

    for (let i = 0; i < beams.length; i++) {
      const p = beams[i];

      const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
      mat.transparent = true;
      mat.depthWrite = false;
      mat.side = THREE.DoubleSide;
      // Keeps-alpha CustomBlending (inline): additive RGB, framebuffer alpha preserved.
      mat.blending = THREE.CustomBlending;
      mat.blendSrc = THREE.SrcAlphaFactor;
      mat.blendDst = THREE.OneFactor;
      mat.blendSrcAlpha = THREE.ZeroFactor;
      mat.blendDstAlpha = THREE.OneFactor;

      // (1) Vertical fade along the shaft: soft at BOTH ends of the 15 m run.
      //     u = 0 at the ground end, u = 1 at the top end (geometry-local Y spans -7.5..+7.5).
      const u = T.positionLocal.y.div(T.max(T.float(BEAM_H), 1e-4)).add(0.5);
      const vfade = T.smoothstep(0, 0.24, u).mul(T.smoothstep(0, 0.3, T.float(1).sub(u)));

      // (2) Silhouette softness: bright where the shaft faces the camera,
      //     dissolving at its cylindrical edge (no hard rectangular outline).
      const nv = T.normalize(T.normalView);
      const sil = T.abs(nv.z).pow(2.6);
      const core = T.abs(nv.z).pow(6.0);

      // (3) Slow breath: ~7 s period, per-beam phase i * 1.7, never synchronized.
      const phase = T.float(i * 1.7);
      const breath = T.sin(this.life.mul(T.float(Math.PI * 2 / 7)).add(phase))
        .mul(0.5).add(0.5).mul(0.28).add(0.30);

      // (3b) Descending shimmer: gentle bands drifting down the shaft.
      const shimmer = T.sin(u.mul(22.0).sub(this.life.mul(1.3)).add(phase)).mul(0.5).add(0.5);
      const shimmerAmt = shimmer.mul(0.1).add(0.9);

      const col = BEAM_COL.mul(vfade).mul(sil.add(core.mul(0.45))).mul(breath).mul(shimmerAmt);
      // Alpha folded into RGB: every fade scales the color toward black, never alpha.
      mat.colorNode = T.vec4(col, 1);

      const geo = new THREE.CylinderGeometry(BEAM_R, BEAM_R, BEAM_H, 10, 1, true);
      const beam = new THREE.Mesh(geo, mat);
      beam.position.set(p.x, p.y + BEAM_H * 0.5, p.z);
      beam.renderOrder = 2;
      this.group.add(beam);
    }

    // painterly ground aura replacing the hard-edged ground disc
    const auraR = safe(13.5 * TREE_SCALE, 13.5);
    const auraMat = new THREE.MeshBasicNodeMaterial({ fog: true });
    auraMat.transparent = true;
    auraMat.depthWrite = false;
    auraMat.blending = THREE.CustomBlending;
    auraMat.blendSrc = THREE.SrcAlphaFactor;
    auraMat.blendDst = THREE.OneFactor;
    auraMat.blendSrcAlpha = THREE.ZeroFactor;
    auraMat.blendDstAlpha = THREE.OneFactor;

    // Soft fade from center to edge using UV coordinates
    const uv = T.uv();
    const dist = T.length(uv.sub(T.vec2(0.5)));
    const fade = T.smoothstep(0.5, 0.0, dist);
    
    // Slow breathing pulse
    const breath = T.sin(this.life.mul(0.8)).mul(0.15).add(0.85);
    
    const col = T.vec3(1.0, 0.9, 0.62).mul(0.3).mul(fade).mul(breath);
    auraMat.colorNode = T.vec4(col, 1);

    const auraGeo = new THREE.PlaneGeometry(auraR * 2, auraR * 2);
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.position.set(this.treeX, this.groundY + 0.02, this.treeZ);
    aura.rotation.x = -Math.PI / 2;
    aura.renderOrder = 1;
    this.group.add(aura);
  }

  /** Breathing lamps lead the walk in to the moss seat. */
  private buildPath(): void {
    const fx = Math.sin(this.seatHeading);
    const fz = Math.cos(this.seatHeading);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
      const d = SEAT_BACK + 3.2 * TREE_SCALE + i * 2.3 * TREE_SCALE;
      const x = this.treeX + fx * d;
      const z = this.treeZ + fz * d;
      pts.push(new THREE.Vector3(x, safe(heightAt(x, z), this.groundY) + 0.28, z));
    }
    this.kit.pathLights(pts);
  }

  /* ---------------------------------------------------------------- scene module */

  greet(): void {
    if (this.greeted) return;
    this.greeted = true;
    this.whisperFn("You found the tree. Sit a while, if you like.");
  }

  nearSeat(p: THREE.Vector3): boolean {
    const dx = safe(p.x, this.seatPos.x) - this.seatPos.x;
    const dz = safe(p.z, this.seatPos.z) - this.seatPos.z;
    return dx * dx + dz * dz < SEAT_RADIUS * SEAT_RADIUS;
  }

  onSit(): void {
    this.rest();
  }

  onStand(): void {
    this.wake();
  }

  /** Set the wanderer down at the moss seat; the sit animation is the wanderer's own. */
  rest(): void {
    if (!this.resting) {
      this.resting = true;
      this.restT = 0;
      this.firedLines.clear();
    }
    this.player.pos.set(this.seatPos.x, this.seatPos.y, this.seatPos.z);
    this.player.heading = this.seatHeading;
    this.player.target = null;
  }

  wake(): void {
    if (!this.resting) return;
    this.resting = false;
    this.player.target = null;
    this.whisperFn("Go gently.");
  }

  holdsMovement(): boolean {
    return this.resting;
  }

  update(dt: number): void {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0;
    this.elapsed += step;
    this.life.value = safe(this.elapsed, 0);

    // The maternal wisp circles the tree, drawing closer while the wanderer rests.
    this.wispT += step * 0.16;
    const radiusTarget = this.resting ? 3.4 * TREE_SCALE : 5.4 * TREE_SCALE;
    this.wispRadius += (radiusTarget - this.wispRadius) * Math.min(1, step * 1.2);
    const wx = this.treeX + Math.cos(this.wispT) * this.wispRadius;
    const wy = this.groundY + 2.4 * TREE_SCALE + Math.sin(this.wispT * 0.8) * 0.55 * TREE_SCALE;
    const wz = this.treeZ + Math.sin(this.wispT) * this.wispRadius;
    this.wisp.setCenter(this.wispCenter.set(wx, wy, wz));

    // The heart's halo keeps its face toward the wanderer.
    if (this.heartHalo) {
      const px = safe(this.player.pos.x, this.heartWorld.x + 1);
      const py = safe(this.player.pos.y + 1.1, this.heartWorld.y);
      const pz = safe(this.player.pos.z, this.heartWorld.z + 1);
      const dx = px - this.heartWorld.x;
      const dy = py - this.heartWorld.y;
      const dz = pz - this.heartWorld.z;
      if (dx * dx + dy * dy + dz * dz > 0.25) {
        this.heartHalo.lookAt(px, py, pz);
      }
    }

    // The rest whispers, one at a time.
    if (this.resting) {
      this.restT += step;
      for (let i = 0; i < REST_LINES.length; i++) {
        const line = REST_LINES[i];
        if (this.restT >= line.t && !this.firedLines.has(i)) {
          this.firedLines.add(i);
          this.whisperFn(line.text, line.ms);
        }
      }
    }

    // The makers turn on the later of the scene's own clock and the narration's, so the
    // rings and lamps keep breathing even when no track is playing.
    const narr = safe(this.narration.time(), 0);
    this.kit.update(step, Math.max(this.elapsed, narr));
  }

  dispose(): void {
    this.wake();
    this.active = false;
    this.kit.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.traverse((obj) => {
      const o = obj as THREE.Mesh;
      if (o.geometry) o.geometry.dispose();
      const m = o.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else if (m) m.dispose();
    });
  }
}
