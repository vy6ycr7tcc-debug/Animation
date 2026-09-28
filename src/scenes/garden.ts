/* The garden lesson — a forge-garden of light.
   The wanderer sits before palm-shaped hands of light that hold a bed of coals.
   The coals' heat follows the narration's keyframes: rising and falling, splitting in two
   and coming back together. A breath ring widens and narrows around them; three columns of
   light stand behind. Everything — heat, opacity, drift — is a pure function of the
   narration's clock. */
import * as THREE from "three/webgpu";
import { LessonScene, type LessonOpts, type LessonCtx, type Beat } from "./lessonKit";
import { CreationKit } from "./creationKit";
import { SITES } from "./sites";
import type { Narration } from "../core/narration";

const V = THREE.Vector3;
/** Keep the garden's fire identical on every visit. */
let gSeed = 11;
function gRnd(): number {
  return (gSeed = (gSeed * 16807) % 2147483647) / 2147483647;
}

function fadeIn(uT: number, start: number, dur: number): number {
  return THREE.MathUtils.smoothstep(uT, start, start + dur);
}

function fadeOut(uT: number, start: number, dur: number): number {
  return 1 - THREE.MathUtils.smoothstep(uT, start, start + dur);
}

function gaussian(uT: number, center: number, sigma: number): number {
  const d = (uT - center) / sigma;
  return Math.exp(-d * d);
}

function makeSoftTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.75)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeGlowSprite(
  texture: THREE.Texture,
  color: THREE.Color,
  opacity: number,
  scale: number,
  basePos: THREE.Vector3,
  baseColor: THREE.Color,
  baseScale: number
): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: texture,
    color: color.clone(),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  mat.fog = false;
  const sp = new THREE.Sprite(mat);
  sp.position.copy(basePos);
  sp.scale.setScalar(scale);
  sp.renderOrder = 1;
  sp.userData.basePos = basePos.clone();
  sp.userData.baseScale = baseScale;
  sp.userData.baseColor = baseColor.clone();
  sp.userData.phase = gRnd() * Math.PI * 2;
  return sp;
}

function createPalmHand(
  center: THREE.Vector3,
  handScale: number,
  texture: THREE.Texture,
  color: THREE.Color
): { group: THREE.Group; sprites: THREE.Sprite[] } {
  const group = new THREE.Group();
  group.position.copy(center);
  const sprites: THREE.Sprite[] = [];

  const positions: THREE.Vector3[] = [];
  const rx = 0.32 * handScale;
  const ry = 0.42 * handScale;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    positions.push(new V(Math.cos(a) * rx, Math.sin(a) * ry, 0));
  }

  const fingerBaseY = 0.32 * handScale;
  const fingerTipY = 0.72 * handScale;
  const fingerOffsets = [-0.16, -0.08, 0, 0.08, 0.16].map(v => v * handScale);
  for (const fx of fingerOffsets) {
    for (let j = 0; j <= 6; j++) {
      const y = fingerBaseY + (fingerTipY - fingerBaseY) * (j / 6);
      const spread = (j / 6) * 0.1 * handScale;
      const x = fx + spread * Math.sin(Math.PI * (j / 6));
      positions.push(new V(x, y, 0));
    }
  }

  for (const pos of positions) {
    const scale = 0.06 * handScale;
    const sp = makeGlowSprite(texture, color, 0, scale, pos, color, scale);
    group.add(sp);
    sprites.push(sp);
  }

  return { group, sprites };
}

function createCoal(
  center: THREE.Vector3,
  coalScale: number,
  texture: THREE.Texture
): { group: THREE.Group; sprites: THREE.Sprite[] } {
  const group = new THREE.Group();
  group.position.copy(center);
  const sprites: THREE.Sprite[] = [];
  const height = 0.9 * coalScale;
  const baseRadius = 0.38 * coalScale;
  const N = 70;

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const y = t * height;
    const radius = Math.max(0.04, baseRadius * (1 - t * 0.75) * (0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI))));
    const angle = gRnd() * Math.PI * 2;
    const r = radius * (0.4 + 0.6 * gRnd());
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const depth = t;
    const color = new THREE.Color().lerpColors(new THREE.Color(0xff3311), new THREE.Color(0xffcc66), depth);
    const scale = (0.06 + 0.12 * (1 - t)) * coalScale;
    const pos = new V(x, y, z);
    const sp = makeGlowSprite(texture, color, 0, scale, pos, color, scale);
    group.add(sp);
    sprites.push(sp);
  }

  return { group, sprites };
}

function createBreathRing(
  center: THREE.Vector3,
  radius: number,
  count: number,
  texture: THREE.Texture
): { group: THREE.Group; sprites: THREE.Sprite[] } {
  const group = new THREE.Group();
  group.position.copy(center);
  const sprites: THREE.Sprite[] = [];
  const color = new THREE.Color(0xffaa44);

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const pos = new V(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    const scale = 0.1;
    const sp = makeGlowSprite(texture, color, 0, scale, pos, color, scale);
    group.add(sp);
    sprites.push(sp);
  }

  return { group, sprites };
}

function createBeam(
  pos: THREE.Vector3,
  height: number,
  radius: number,
  texture: THREE.Texture,
  color: THREE.Color
): { group: THREE.Group; sprites: THREE.Sprite[] } {
  const group = new THREE.Group();
  group.position.copy(pos);
  const sprites: THREE.Sprite[] = [];
  const N = Math.floor(height / 0.35) + 1;

  for (let i = 0; i < N; i++) {
    const y = (i / (N - 1)) * height;
    const spread = radius * (0.3 + 0.7 * gRnd());
    const angle = gRnd() * Math.PI * 2;
    const x = Math.cos(angle) * spread;
    const z = Math.sin(angle) * spread;
    const posLocal = new V(x, y, z);
    const scale = 0.15 + 0.2 * gRnd();
    const sp = makeGlowSprite(texture, color, 0, scale, posLocal, color, scale);
    group.add(sp);
    sprites.push(sp);
  }

  return { group, sprites };
}

export function createGardenScene(
  scene: THREE.Scene,
  narration: Narration,
  whisper: (text: string, ms?: number) => void
): LessonScene {
  const site = SITES.garden;
  const seatPos = new V(site.x, site.y, site.z);
  const heading = site.heading;
  const forward = new V(Math.sin(heading), 0, Math.cos(heading)).normalize();
  const right = new V(Math.cos(heading), 0, -Math.sin(heading)).normalize();

  const softTexture = makeSoftTexture();

  let kit: CreationKit;
  let root: THREE.Group;
  let palmGroup: THREE.Group;
  let coalGroup: THREE.Group;
  let secondaryCoalGroup: THREE.Group;
  let ringGroup: THREE.Group;
  let beamGroups: THREE.Group[] = [];

  let palmSprites: THREE.Sprite[] = [];
  let coalSprites: THREE.Sprite[] = [];
  let secondaryCoalSprites: THREE.Sprite[] = [];
  let ringSprites: THREE.Sprite[] = [];
  let beamSprites: THREE.Sprite[][] = [[], [], []];

  const palmCenterBase = seatPos.clone().addScaledVector(forward, 2.5);
  palmCenterBase.y = site.y + 1.25;

  const heatKeys: [number, number][] = [
    [0, 0],
    [16.11, 0],
    [19.11, 0.55],
    [29.93, 0.65],
    [33.93, 0.8],
    [83.41, 0.85],
    [86.41, 0.6],
    [106.28, 0.55],
    [109.28, 0.3],
    [155.29, 0.3],
    [158.29, 0.3],
    [161.46, 0.3],
    [164.46, 0.55],
    [194.66, 0.6],
    [197.66, 0.5],
    [207.99, 0.5],
    [210.99, 0.65],
    [244.37, 0.65],
    [247.37, 0.55],
    [279.17, 0.55],
    [282.17, 0.65],
    [291.00, 0.65],
    [294.00, 0.72],
    [338.13, 0.75],
    [341.13, 0.9],
    [386.94, 1.0],
    [389.94, 0.8],
    [431.48, 0.78],
    [434.48, 0.7],
    [474.93, 0.68],
    [477.93, 0.45],
    [537.46, 0.42],
    [540.46, 0.25],
    [546.21, 0.24],
    [590.55, 0.22],
    [598.90, 0.18],
    [617.00, 0.15],
    [620.98, 0.08]
  ];

  function sampleKeys(keys: [number, number][], uT: number): number {
    if (uT <= keys[0][0]) return keys[0][1];
    if (uT >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const t0 = keys[i][0];
      const t1 = keys[i + 1][0];
      if (uT >= t0 && uT <= t1) {
        const t = (uT - t0) / (t1 - t0);
        const s = t * t * (3 - 2 * t);
        return keys[i][1] + (keys[i + 1][1] - keys[i][1]) * s;
      }
    }
    return keys[keys.length - 1][1];
  }

  function computeBeamOpacity(index: number, uT: number): number {
    const baseFade = fadeIn(uT, 95.84, 8);
    if (index === 0) {
      let op = baseFade * 0.15;
      op = Math.max(op, fadeIn(uT, 106.28, 4) * 0.9 * fadeOut(uT, 161.46, 6));
      op = Math.max(op, gaussian(uT, 590.55, 4) * 0.35);
      return THREE.MathUtils.clamp(op, 0, 1);
    }
    if (index === 1) {
      let op = baseFade * 0.15;
      op = Math.max(op, fadeIn(uT, 161.46, 4) * 0.9 * fadeOut(uT, 207.99, 6));
      op = Math.max(op, gaussian(uT, 590.55, 4) * 0.35);
      return THREE.MathUtils.clamp(op, 0, 1);
    }
    let op = baseFade * 0.15;
    op = Math.max(op, fadeIn(uT, 207.99, 4) * 0.9 * fadeOut(uT, 537.46, 8));
    op = Math.max(op, gaussian(uT, 590.55, 4) * 0.35);
    return THREE.MathUtils.clamp(op, 0, 1);
  }

  function ringOpacity(uT: number): number {
    const main = fadeIn(uT, 244.37, 5) * fadeOut(uT, 279.17, 8);
    const later = 0.5 * fadeIn(uT, 598.90, 4) * fadeOut(uT, 610, 8);
    return THREE.MathUtils.clamp(main + later, 0, 1);
  }

  function updateSprites(
    sprites: THREE.Sprite[],
    uT: number,
    opacity: number,
    color: THREE.Color,
    scaleMul: number,
    driftAmp: number,
    yScaleMul: number = 1.0
  ) {
    for (const sp of sprites) {
      const data = sp.userData as { basePos: THREE.Vector3; baseScale: number; phase: number };
      const ph = data.phase;
      const x = data.basePos.x + Math.sin(uT * 1.4 + ph) * driftAmp;
      const y = data.basePos.y * yScaleMul + Math.sin(uT * 1.8 + ph * 1.3) * driftAmp * 0.6;
      const z = data.basePos.z + Math.cos(uT * 1.2 + ph * 0.9) * driftAmp;
      sp.position.set(x, y, z);
      sp.scale.setScalar(data.baseScale * scaleMul);
      (sp.material as THREE.SpriteMaterial).opacity = opacity;
      (sp.material as THREE.SpriteMaterial).color.copy(color);
    }
  }

  class GardenSceneImpl extends LessonScene {
    update(dt: number) {
      super.update(dt);
      const uT = narration.time();
      this.animate(uT);
    }

    private animate(uT: number) {
      const palmDrift = 0.25 * fadeIn(uT, 474.93, 4);
      const palmPos = palmCenterBase.clone().addScaledVector(forward, -palmDrift);
      palmGroup.position.copy(palmPos);

      const palmOpacity = fadeIn(uT, 0, 8);
      const palmColor = new THREE.Color().lerpColors(
        new THREE.Color(0xffaa44),
        new THREE.Color(0xffcc77),
        fadeIn(uT, 546.21, 5)
      );
      updateSprites(palmSprites, uT, palmOpacity, palmColor, 1.0, 0.025, 1.0);

      const heatBase = sampleKeys(heatKeys, uT);
      const forgeGlow = 0.35 * fadeIn(uT, 338.13, 20) * fadeOut(uT, 386.94, 20);
      const spike1 = 0.45 * gaussian(uT, 155.29, 3);
      const spike2 = 0.35 * gaussian(uT, 161.46, 3);
      const heat = THREE.MathUtils.clamp(heatBase + forgeGlow + spike1 + spike2, 0, 1);

      const coalColor = new THREE.Color().lerpColors(
        new THREE.Color(0xff3311),
        new THREE.Color(0xffcc66),
        heat
      );
      const coalOpacity = THREE.MathUtils.clamp(0.15 + heat * 0.85, 0, 1);
      const coalYScale = 1 - 0.5 * fadeIn(uT, 537.46, 8);
      const coalPos = palmPos.clone().add(new V(0, 0.3 + 0.4 * heat, 0));
      coalGroup.position.copy(coalPos);

      updateSprites(coalSprites, uT, coalOpacity, coalColor, 0.8 + heat * 0.6, 0.04, coalYScale);

      const split = fadeIn(uT, 194.66, 5) * fadeOut(uT, 207.99, 6);
      const secondaryPos = coalPos.clone().addScaledVector(right, 0.6 * split);
      secondaryCoalGroup.position.copy(secondaryPos);
      const secondaryOpacity = split * coalOpacity;
      const secondaryColor = coalColor.clone().lerp(new THREE.Color(0xffaa44), 0.3);
      updateSprites(secondaryCoalSprites, uT, secondaryOpacity, secondaryColor, 0.7 + split * 0.4, 0.03, coalYScale);

      const ringOp = ringOpacity(uT);
      const breathe = 1 + 0.08 * Math.sin(uT * 2 * Math.PI / 8);
      ringGroup.scale.setScalar(breathe);
      ringGroup.position.copy(coalPos);
      updateSprites(ringSprites, uT, ringOp, new THREE.Color(0xffaa44), 1.0, 0.02, 1.0);

      for (let i = 0; i < 3; i++) {
        const op = computeBeamOpacity(i, uT);
        beamGroups[i].visible = op > 0.01;
        if (beamGroups[i].visible) {
          updateSprites(beamSprites[i], uT, op * 0.8, new THREE.Color(0xffaa44), 1.0, 0.02, 1.0);
        }
      }
    }

    dispose() {
      const allSprites = [
        ...palmSprites,
        ...coalSprites,
        ...secondaryCoalSprites,
        ...ringSprites,
        ...beamSprites[0],
        ...beamSprites[1],
        ...beamSprites[2]
      ];
      const materials = new Set<THREE.Material>();
      for (const sp of allSprites) {
        if (sp.material) materials.add(sp.material as THREE.Material);
      }
      materials.forEach(m => m.dispose());
      softTexture.dispose();
      if (root && root.parent) root.parent.remove(root);
      super.dispose();
    }
  }

  const build = (ctx: LessonCtx) => {
    kit = ctx.kit;
    root = new THREE.Group();
    root.name = "gardenCustom";
    ctx.group.add(root);

    kit.groundDisc(3.0, 0xcc8844, 0.18, site.y + 0.02);
    kit.flowers(600, site.x, site.z, 30);

    const palmCenter = palmCenterBase.clone();
    palmGroup = new THREE.Group();
    palmGroup.position.copy(palmCenter);
    root.add(palmGroup);

    const leftPalmCenter = palmCenter.clone().addScaledVector(right, 0.7);
    const rightPalmCenter = palmCenter.clone().addScaledVector(right, -0.7);

    const leftPalm = createPalmHand(leftPalmCenter, 0.55, softTexture, new THREE.Color(0xffaa44));
    const rightPalm = createPalmHand(rightPalmCenter, 0.55, softTexture, new THREE.Color(0xffaa44));
    palmGroup.add(leftPalm.group);
    palmGroup.add(rightPalm.group);
    palmSprites.push(...leftPalm.sprites, ...rightPalm.sprites);

    const coalCenter = palmCenter.clone().add(new V(0, 0.3, 0));
    coalGroup = new THREE.Group();
    coalGroup.position.copy(coalCenter);
    root.add(coalGroup);
    const mainCoal = createCoal(coalCenter, 0.7, softTexture);
    coalSprites.push(...mainCoal.sprites);
    coalGroup.add(...mainCoal.sprites);

    secondaryCoalGroup = new THREE.Group();
    secondaryCoalGroup.position.copy(coalCenter);
    root.add(secondaryCoalGroup);
    const secCoal = createCoal(coalCenter, 0.35, softTexture);
    secondaryCoalSprites.push(...secCoal.sprites);
    secondaryCoalGroup.add(...secCoal.sprites);

    const backCenter = seatPos.clone().addScaledVector(forward, 4.5);
    backCenter.y = site.y;
    const beamRadius = 2.2;
    const beamAngles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
    for (let i = 0; i < 3; i++) {
      const pos = new V(
        backCenter.x + Math.cos(beamAngles[i]) * beamRadius,
        site.y,
        backCenter.z + Math.sin(beamAngles[i]) * beamRadius
      );
      const beam = createBeam(pos, 2.8, 0.25, softTexture, new THREE.Color(0xffaa44));
      beamGroups.push(beam.group);
      beamSprites[i] = beam.sprites;
      root.add(beam.group);
    }

    ringGroup = new THREE.Group();
    ringGroup.position.copy(coalCenter);
    root.add(ringGroup);
    const ring = createBreathRing(coalCenter, 1.8, 36, softTexture);
    ringSprites.push(...ring.sprites);
    ringGroup.add(...ring.sprites);
  };

  const beats: Beat[] = [
    { t: 0.00, apply: () => {} },
    { t: 11.53, apply: () => {} },
    { t: 16.11, apply: () => {} },
    { t: 29.93, apply: () => {} },
    { t: 83.41, apply: () => {} },
    { t: 95.84, apply: () => {} },
    { t: 106.28, apply: () => {} },
    { t: 155.29, apply: () => {} },
    { t: 161.46, apply: () => {} },
    { t: 194.66, apply: () => {} },
    { t: 207.99, apply: () => {} },
    { t: 244.37, apply: () => {} },
    { t: 279.17, apply: () => {} },
    { t: 291.00, apply: () => {} },
    { t: 338.13, apply: () => {} },
    { t: 386.94, apply: () => {} },
    { t: 431.48, apply: () => {} },
    { t: 474.93, apply: () => {} },
    { t: 537.46, apply: () => {} },
    { t: 546.21, apply: () => {} },
    { t: 590.55, apply: () => {} },
    { t: 598.90, apply: () => {} },
    { t: 617.00, apply: () => {} }
  ];

  const opts: LessonOpts = {
    id: "garden",
    trackId: "L05",
    seatPos,
    seatHeading: heading,
    seatRadius: 3,
    build,
    beats
  };

  return new GardenSceneImpl(scene, narration, whisper, opts);
}
