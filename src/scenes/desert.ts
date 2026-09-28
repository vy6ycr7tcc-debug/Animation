/*
  L07 · The desert — "a scorched plain that remembers how to bloom".

  The whole scene hangs from ONE deterministic progression, read in the shader from the
  lesson's uT uniform (narration.time(), seconds into the L07 track):

      u       = clamp(uT / 579.6, 0, 1)
      greenR  = 30 · smoothstep(0.10, 0.78, u)     // the green breath's radius

  At u = 0 the ground is cracked, dark and ember-veined, with a seed of light glowing at
  the centre of the plain. As u rises a green wavefront (a constant-width glowing band at
  greenR) spreads outward; behind it the earth turns meadow-green, the embers die, pollen
  rises, and each flower kindles — with a small flash — the moment the wave passes its
  radius. Same narration time = same picture, every run, on every device.

  All set dressing is the game's own vocabulary: the CreationKit's wisp, beams, rings,
  path-lights, birds and horizon clusters, plus soft instanced sprites for flowers and
  motes. Nothing here is invented, nothing is random (placement uses fixed-seed streams),
  and every alpha fed to the GPU is clamped to [0,1] with finite-guarded arithmetic.
*/
import * as THREE from "three/webgpu";
import { T, softPoints, spriteCloud, vnoise, withFog } from "../gpu/tsl";
import { LessonScene, type LessonCtx, type Beat, type SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import type { Narration } from "../core/narration";

const {
  clamp, color, cos, exp, float, length, materialOpacity, max, mix,
  pointUV, positionWorld, sin, smoothstep, vec2, vec3,
} = T;

/** The lesson track's length; uT / TRACK_SECONDS is the scene's single 0→1 progression. */
const TRACK_SECONDS = 579.6;
/** How far the green breath spreads before it reaches the horizon haze. */
const MEADOW_R = 30;
/** Radius of the drawn earth disc. */
const DISC_R = 26;
/** Radius of the flower field around the seed of light. */
const FLOWER_R = 23.5;

/* ------------------------------------------------------------------ small safe helpers */

/** Deterministic placement stream (fixed seed, placement only — never motion). */
function makeRng(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 2147483647;
  if (s <= 0) s = 11;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Clamp that also survives NaN by falling back to `lo`. */
function clampNum(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
}

/** CPU smoothstep with a guarded edge (never divides by zero). */
function sstep(e0: number, e1: number, x: number): number {
  const d = e1 - e0;
  const t = clampNum(d !== 0 ? (x - e0) / d : 0, 0, 1);
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ scene state */

let seat = new THREE.Vector3();
let center = new THREE.Vector3();
let fwd = new THREE.Vector3(0, 0, 1);
/** Per-frame targets (never reallocated — hard rule #8). */
const lanternPos = new THREE.Vector3();
const seedPos = new THREE.Vector3();
/** Scene-local life clock for ambient motion only (style-guide hard rule #8). */
const life = T.uniform(0);
let lantern: ReturnType<LessonCtx["kit"]["wisp"]> | null = null;
let seed: ReturnType<LessonCtx["kit"]["wisp"]> | null = null;
const disposables: Array<{ dispose(): void }> = [];

/** Radial distance from the seed of light (clamped, so no sqrt/length of a zero vector). */
function radial(): any {
  const pxz = positionWorld.xz;
  return max(length(vec2(pxz.x.sub(center.x), pxz.z.sub(center.z))), 1e-3);
}

/* ------------------------------------------------------------------ the earth: cracked, then green */

function buildEarth(group: THREE.Group, uT: any): void {
  const geo = new THREE.CircleGeometry(DISC_R, 96);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -4;
  mat.polygonOffsetUnits = -4;

  const pxz = positionWorld.xz;
  const dist = radial();
  const u = clamp(uT.div(TRACK_SECONDS), 0, 1);
  const greenR = float(MEADOW_R).mul(smoothstep(0.1, 0.78, u));

  const n1 = vnoise(pxz.mul(0.28));
  const n2 = vnoise(pxz.mul(0.9).add(vec2(11.7, 4.1)));
  const n3 = vnoise(pxz.mul(2.6).add(vec2(4.3, 19.2)));

  // thin veins where the noise crosses 0.5 — the cracked, burnt crust
  const crv = n1.sub(0.5).abs().add(n2.sub(0.5).abs().mul(0.55));
  const crack = smoothstep(0.08, 0.0, crv);

  const greenMask = smoothstep(greenR, greenR.sub(2.5), dist); // 1 behind the wave
  const fresh = smoothstep(greenR, greenR.sub(8.0), dist);     // freshly breathed-on glow
  const ember = crack.mul(float(1).sub(greenMask)).mul(float(0.35).add(n3.mul(0.9)));

  const earth = mix(color(0x120c09), color(0x2c1b12), n1.mul(0.65).add(n2.mul(0.35)));
  const meadow = mix(color(0x2b4a2a), color(0x5c8b3c), n2.mul(0.6).add(n3.mul(0.4)));
  const green = meadow.add(color(0x8ecb62).mul(fresh.mul(0.3)));

  const col = mix(earth, green, greenMask).add(color(0xff8b3a).mul(ember.mul(0.8)));
  mat.colorNode = withFog(col, positionWorld);
  mat.opacityNode = clamp(
    float(0.98).mul(float(1).sub(smoothstep(DISC_R - 6, DISC_R, dist))),
    0, 1,
  );

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(center.x, center.y + 0.12, center.z);
  mesh.renderOrder = 1;
  group.add(mesh);
  disposables.push(geo, mat);
}

/* ------------------------------------------------------------------ the green breath (additive glow) */

function buildWaveGlow(group: THREE.Group, uT: any): void {
  const geo = new THREE.CircleGeometry(MEADOW_R + 2, 96);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  // additiveKeepsAlpha() runs once at startup and misses scene-entered materials.
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.SrcAlphaFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;

  const dist = radial();
  const u = clamp(uT.div(TRACK_SECONDS), 0, 1);
  const greenR = float(MEADOW_R).mul(smoothstep(0.1, 0.78, u));

  // a constant-width glowing wavefront riding greenR, and a soft afterglow behind it
  const band = smoothstep(greenR.sub(3.4), greenR.sub(1.2), dist)
    .mul(float(1).sub(smoothstep(greenR.sub(1.2), greenR.add(1.6), dist)));
  const bloom = smoothstep(greenR, greenR.sub(10.0), dist)
    .mul(float(1).sub(smoothstep(4.0, 24.0, dist)));
  // the seed of light: already glowing at u = 0, kindling brighter as the lesson turns
  const seedMask = float(1).sub(smoothstep(0.3, 3.4, dist));

  mat.colorNode = mix(
    color(0x7fe08c),
    color(0xffe4a0),
    clamp(band.add(seedMask), 0, 1),
  );
  mat.opacityNode = clamp(
    band.mul(0.85)
      .add(bloom.mul(0.18))
      .add(seedMask.mul(float(0.22).add(float(0.5).mul(u)))),
    0, 1,
  );

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(center.x, center.y + 0.18, center.z);
  mesh.renderOrder = 2;
  group.add(mesh);
  disposables.push(geo, mat);
}

/* ------------------------------------------------------------------ flowers kindling behind the wave */

function buildFlowers(group: THREE.Group, uT: any): void {
  const count = 720;
  const R = makeRng(20240517);

  const mat = softPoints();
  mat.sizeAttenuation = true;
  mat.size = 0.42;
  mat.opacity = 0.95;
  mat.color.set(0xffffff);

  const cloud = spriteCloud(count, { position: 3, aColor: 3, aData: 4 }, mat);
  const pos = cloud.attrs.position.array as Float32Array;
  const col = cloud.attrs.aColor.array as Float32Array;
  const dat = cloud.attrs.aData.array as Float32Array;

  const palette = [0xffc766, 0xff9a3c, 0xffe8b0, 0xffd9a0, 0xfff2d6, 0xffb45c]
    .map((h) => new THREE.Color(h));

  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(R()) * FLOWER_R;
    pos[i * 3 + 0] = center.x + Math.cos(a) * r;
    pos[i * 3 + 1] = center.y + 0.12 + R() * 0.55;
    pos[i * 3 + 2] = center.z + Math.sin(a) * r;

    const c = palette[Math.floor(R() * palette.length) % palette.length];
    col[i * 3 + 0] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;

    dat[i * 4 + 0] = r;                 // radius from the seed of light
    dat[i * 4 + 1] = R() * 6.283;       // sway phase
    dat[i * 4 + 2] = 0.55 + R() * 0.8;  // brightness
    dat[i * 4 + 3] = R() * 6.283;       // twinkle phase
  }
  cloud.attrs.position.needsUpdate = true;
  cloud.attrs.aColor.needsUpdate = true;
  cloud.attrs.aData.needsUpdate = true;

  const pn = cloud.nodes.position;
  const dt = cloud.nodes.aData.x;
  const ph = cloud.nodes.aData.y;
  const br = cloud.nodes.aData.z;
  const tw0 = cloud.nodes.aData.w;

  const u = clamp(uT.div(TRACK_SECONDS), 0, 1);
  const greenR = float(MEADOW_R).mul(smoothstep(0.1, 0.78, u));

  mat.positionNode = pn.add(vec3(
    sin(life.mul(1.15).add(ph)).mul(0.06),
    float(0),
    cos(life.mul(0.95).add(ph)).mul(0.06),
  ));

  const arrive = smoothstep(dt, dt.add(2.2), greenR);      // kindles as the wave passes
  const dd = greenR.sub(dt);
  const flash = exp(dd.mul(dd).div(1.6).negate());         // a small bloom at the moment of kindling
  const round = smoothstep(0.5, 0.2, length(pointUV.sub(0.5)));
  const twinkle = float(0.7).add(float(0.3).mul(sin(life.mul(1.6).add(tw0))));

  mat.colorNode = cloud.nodes.aColor.mul(float(0.85).add(flash.mul(1.1)));
  mat.opacityNode = clamp(
    materialOpacity
      .mul(round)
      .mul(arrive)
      .mul(twinkle.add(flash.mul(0.7)))
      .mul(br),
    0, 1,
  );

  group.add(cloud.sprite);
  disposables.push(mat);
}

/* ------------------------------------------------------------------ drifting motes: embers out, pollen in */

function buildEmbers(group: THREE.Group, uT: any): void {
  const count = 200;
  const R = makeRng(771103);

  const mat = softPoints();
  mat.sizeAttenuation = true;
  mat.size = 0.3;
  mat.opacity = 0.85;
  mat.color.set(0xffffff);

  const cloud = spriteCloud(count, { position: 3, aData: 4 }, mat);
  const pos = cloud.attrs.position.array as Float32Array;
  const dat = cloud.attrs.aData.array as Float32Array;

  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(R()) * 24;
    pos[i * 3 + 0] = center.x + Math.cos(a) * r;
    pos[i * 3 + 1] = center.y + 0.5 + R() * 5.5;
    pos[i * 3 + 2] = center.z + Math.sin(a) * r;
    dat[i * 4 + 0] = r;
    dat[i * 4 + 1] = R() * 6.283;
    dat[i * 4 + 2] = 0.45 + R() * 0.85;
    dat[i * 4 + 3] = R() * 6.283;
  }
  cloud.attrs.position.needsUpdate = true;
  cloud.attrs.aData.needsUpdate = true;

  const pn = cloud.nodes.position;
  const dt = cloud.nodes.aData.x;
  const ph = cloud.nodes.aData.y;
  const br = cloud.nodes.aData.z;
  const ph2 = cloud.nodes.aData.w;

  const u = clamp(uT.div(TRACK_SECONDS), 0, 1);
  const greenR = float(MEADOW_R).mul(smoothstep(0.1, 0.78, u));

  mat.positionNode = pn.add(vec3(
    sin(life.mul(0.35).add(ph)).mul(1.2),
    sin(life.mul(0.22).add(ph2)).mul(0.8),
    cos(life.mul(0.31).add(ph)).mul(1.2),
  ));

  const gone = float(1).sub(smoothstep(greenR, greenR.sub(2.5), dt)); // 1 only where the burn still stands
  const flicker = float(0.55).add(float(0.45).mul(sin(life.mul(2.3).add(ph2.mul(1.7)))));
  const round = smoothstep(0.5, 0.2, length(pointUV.sub(0.5)));

  mat.colorNode = color(0xd08a58).mul(float(0.5).add(flicker.mul(0.8)));
  mat.opacityNode = clamp(materialOpacity.mul(round).mul(gone).mul(flicker).mul(br), 0, 1);

  group.add(cloud.sprite);
  disposables.push(mat);
}

function buildPollen(group: THREE.Group, uT: any): void {
  const count = 220;
  const R = makeRng(31337);

  const mat = softPoints();
  mat.sizeAttenuation = true;
  mat.size = 0.26;
  mat.opacity = 0.8;
  mat.color.set(0xffffff);

  const cloud = spriteCloud(count, { position: 3, aData: 4 }, mat);
  const pos = cloud.attrs.position.array as Float32Array;
  const dat = cloud.attrs.aData.array as Float32Array;

  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(R()) * 24;
    pos[i * 3 + 0] = center.x + Math.cos(a) * r;
    pos[i * 3 + 1] = center.y + 0.4 + R() * 6.5;
    pos[i * 3 + 2] = center.z + Math.sin(a) * r;
    dat[i * 4 + 0] = r;
    dat[i * 4 + 1] = R() * 6.283;
    dat[i * 4 + 2] = 0.4 + R() * 0.8;
    dat[i * 4 + 3] = R() * 6.283;
  }
  cloud.attrs.position.needsUpdate = true;
  cloud.attrs.aData.needsUpdate = true;

  const pn = cloud.nodes.position;
  const dt = cloud.nodes.aData.x;
  const ph = cloud.nodes.aData.y;
  const br = cloud.nodes.aData.z;
  const ph2 = cloud.nodes.aData.w;

  const u = clamp(uT.div(TRACK_SECONDS), 0, 1);
  const greenR = float(MEADOW_R).mul(smoothstep(0.1, 0.78, u));

  mat.positionNode = pn.add(vec3(
    sin(life.mul(0.42).add(ph)).mul(0.7),
    sin(life.mul(0.3).add(ph2)).mul(1.1),
    cos(life.mul(0.38).add(ph)).mul(0.7),
  ));

  const arrive = smoothstep(dt, dt.add(2.2), greenR);     // pollen wakes behind the wave
  const season = smoothstep(0.3, 0.62, u);
  const twinkle = float(0.55).add(float(0.45).mul(sin(life.mul(1.1).add(ph2.mul(2.1)))));
  const round = smoothstep(0.5, 0.2, length(pointUV.sub(0.5)));

  mat.colorNode = color(0xe6f2b8).mul(float(0.7).add(twinkle.mul(0.6)));
  mat.opacityNode = clamp(
    materialOpacity.mul(round).mul(arrive).mul(season).mul(twinkle).mul(br),
    0, 1,
  );

  group.add(cloud.sprite);
  disposables.push(mat);
}

/* ------------------------------------------------------------------ rings of light on the ground */

function addGroundRing(
  group: THREE.Group, uT: any, radius: number, hex: number, opacity: number, phase: number,
): void {
  const geo = new THREE.RingGeometry(radius * 0.9, radius, 96);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  // additiveKeepsAlpha() runs once at startup and misses scene-entered materials.
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.SrcAlphaFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  mat.colorNode = color(hex);
  mat.opacityNode = clamp(
    float(opacity).mul(float(0.8).add(float(0.2).mul(sin(uT.mul(0.6).add(phase))))),
    0, 1,
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(center.x, center.y + 0.16, center.z);
  mesh.renderOrder = 2;
  group.add(mesh);
  disposables.push(geo, mat);
}

/* ------------------------------------------------------------------ soft light pillars (desert-local) */

/*
  Camera-facing billboarded glow columns. Replaces the shared kit's flat
  cylinders (hard-edged clip-art rectangles) with the canon soft-shaft recipe:
  Gaussian horizontal falloff, vertical fade, slow descending brightness bands,
  near-camera fade. Hue stays the canon cool-light blue 0xb8d1ff.
*/
function addPillars(group: THREE.Group, positions: THREE.Vector3[], height: number, radius: number): void {
  const eps = 1e-4;
  const count = Math.min(positions.length, 6);

  for (let i = 0; i < count; i++) {
    const baseX = positions[i].x;
    const baseY = positions[i].y;
    const baseZ = positions[i].z;

    const geometry = new THREE.PlaneGeometry(1, 1);
    disposables.push(geometry);

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });

    // keeps-alpha additive: RGB accumulates, destination alpha untouched
    material.blending = THREE.CustomBlending;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneFactor;
    material.blendEquation = THREE.AddEquation;
    material.blendSrcAlpha = THREE.ZeroFactor;
    material.blendDstAlpha = THREE.OneFactor;
    disposables.push(material);

    // per-pillar phase (golden-angle spread so the shimmer never syncs)
    const phase = T.uniform((i * 2.3999632) % (Math.PI * 2));

    // camera-facing (yaw-only) billboard basis: horizontal axis is
    // perpendicular to the view direction (cross of world-up and toCam),
    // so the quad faces the camera instead of sitting edge-on. Division guarded.
    const toCam = vec3(T.cameraPosition.x.sub(baseX), 0, T.cameraPosition.z.sub(baseZ));
    const toCamLen = max(length(toCam), float(eps));
    const right = vec3(0, 1, 0).cross(toCam).div(toCamLen);

    // uv.x -> [-1, 1], uv.y -> [0, 1]
    const vX = T.uv().x.mul(2).sub(1);
    const vY = T.uv().y;

    // quad spans +/-radius across the camera right vector, height above the base
    material.positionNode = right.mul(vX.mul(radius)).add(vec3(0, 1, 0).mul(vY.mul(height)));

    const dist = length(T.cameraPosition.sub(vec3(baseX, baseY, baseZ)));

    const across = exp(vX.mul(vX).mul(-3));
    const up = smoothstep(0, 0.04, vY).mul(float(1).sub(smoothstep(0.7, 1, vY)));
    const bands = sin(vY.mul(40).add(life.mul(1.2)).add(phase)).mul(0.3).add(0.7);
    const nearFade = smoothstep(8, 30, dist);
    const breathe = float(0.75).add(float(0.25).mul(sin(life.mul(1.5).add(phase))));

    // additive glow: fold all fades into RGB; alpha stays 1 (keeps-alpha blending).
    // NOTE: no vec4() wrap — colorNode takes the vec3 directly (file idiom, cf.
    // buildWaveGlow/addGroundRing). Wrapping caused a vec4(vec4( nesting TSL error.
    material.colorNode = color(0xb8d1ff).mul(1.6).mul(across).mul(up).mul(bands).mul(nearFade).mul(breathe);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(baseX, baseY, baseZ);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
}

/* ------------------------------------------------------------------ build */

function build(ctx: LessonCtx): void {
  const s = SITES.desert;
  seat = new THREE.Vector3(s.x, s.y, s.z);
  fwd = new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
  center = seat.clone().addScaledVector(fwd, 8);
  center.y = seat.y;

  const uT: any = ctx.uT;

  // the CreationKit draws into its own group, and its wisp is handed back unparented:
  // seat both here, so every maker actually reaches the frame.
  ctx.group.add(ctx.kit.group);

  buildEarth(ctx.group, uT);
  buildWaveGlow(ctx.group, uT);
  buildFlowers(ctx.group, uT);
  buildEmbers(ctx.group, uT);
  buildPollen(ctx.group, uT);

  addGroundRing(ctx.group, uT, 20, 0x2f2113, 0.22, 0.0);
  addGroundRing(ctx.group, uT, 2.6, 0xffcc66, 0.3, 1.7);
  addGroundRing(ctx.group, uT, 6.4, 0x7fe08c, 0.14, 3.1);

  // the seed of light, out in the middle of the burnt plain
  seed = ctx.kit.wisp(0xffc766, 0.55);
  seed.setCenter(center.clone().setY(center.y + 0.9));
  ctx.group.add(seed.group);

  // the wanderer's lantern-wisp, beside the seat
  lantern = ctx.kit.wisp(0xffb84d, 0.6);
  lantern.setCenter(seat.clone().addScaledVector(fwd, 1.2).setY(seat.y + 1.1));
  ctx.group.add(lantern.group);

  // first, quiet dressing — always present, never state
  ctx.kit.pathLights(
    [0.2, 0.36, 0.52, 0.68, 0.84].map((k) =>
      seat.clone().lerp(center, k).setY(center.y + 0.12),
    ),
  );
  addPillars(ctx.group, [center.clone().setY(center.y + 0.1)], 6, 0.3);
}

/* ------------------------------------------------------------------ CPU motion (never changes STATE) */

function tick(t: number, dt: number): void {
  const tt = Number.isFinite(t) ? t : 0;
  const d = Number.isFinite(dt) ? Math.min(0.05, Math.max(0, dt)) : 0;
  life.value = (Number.isFinite(life.value) ? life.value : 0) + d;
  const u = clampNum(tt / TRACK_SECONDS, 0, 1);

  const l = lantern;
  if (l) {
    const lift = tt < 133.61 ? 0 : Math.min(1, (tt - 133.61) / 3) * 0.6;
    const sway = Math.sin(tt * 0.8) * 0.05;
    const flare = 1 + (tt < 251.2 ? 0 : Math.min(1, (tt - 251.2) / 8)) * 0.9;
    lanternPos.copy(seat).addScaledVector(fwd, 1.2);
    lanternPos.set(lanternPos.x + sway, seat.y + 1.1 + lift, lanternPos.z);
    l.setCenter(lanternPos);
    l.group.scale.setScalar(Math.max(0.001, flare * (1 + 0.06 * Math.sin(tt * 1.7))));
  }

  const s = seed;
  if (s) {
    seedPos.copy(center);
    seedPos.y = center.y + 0.9 + Math.sin(tt * 0.6) * 0.12;
    s.setCenter(seedPos);
    s.group.scale.setScalar(Math.max(0.001, 0.7 + 1.2 * sstep(0.02, 0.3, u) + 0.08 * Math.sin(tt * 1.3)));
    const mesh = s.group.children[0] as THREE.Mesh | undefined;
    const mat = mesh ? (mesh.material as THREE.MeshBasicMaterial) : null;
    if (mat) {
      mat.opacity = clampNum(0.22 + 0.55 * u + 0.12 * Math.sin(tt * 1.3), 0, 1);
    }
  }
}

/* ------------------------------------------------------------------ factory */

export function createDesert(
  scene: THREE.Scene,
  narration: Narration,
  whisper: (text: string, ms?: number) => void,
): SceneModule {
  const s = SITES.desert;
  const seatPos = new THREE.Vector3(s.x, s.y, s.z);

  // additive dressing fires once per scene instance, so re-sitting never stacks duplicates
  const fired = new Set<string>();
  const once = (key: string, fn: () => void): void => {
    if (fired.has(key)) return;
    fired.add(key);
    fn();
  };

  const lamp = (k: number): THREE.Vector3 =>
    seat.clone().lerp(center, k).setY(center.y + 0.12);

  const beats: Beat[] = [
    {
      t: 0,
      apply: (ctx) => {
        once("awaken", () => {
          addPillars(ctx.group, [lamp(0.14).setY(seat.y + 0.1)], 2.8, 0.12);
          addPillars(ctx.group, [lamp(0.46)], 4.2, 0.16);
          addPillars(ctx.group, [lamp(0.78)], 5.2, 0.18);
        });
      },
    },
    {
      t: 6.74,
      apply: (ctx) => {
        once("lantern", () => {
          const p = seat.clone().addScaledVector(fwd, 1.2).setY(seat.y + 0.1);
          addPillars(ctx.group, [p], 3.6, 0.22);
        });
      },
    },
    {
      t: 72.28,
      apply: (ctx) => {
        once("seed", () => {
          addPillars(ctx.group, [center.clone().setY(center.y + 0.1)], 8, 0.36);
          ctx.kit.rings(center.clone().setY(center.y + 0.7), 3, 0.07);
        });
      },
    },
    {
      t: 133.61,
      apply: (ctx) => {
        once("lift", () => {
          addPillars(ctx.group, [lamp(0.3), lamp(0.7)], 7, 0.2);
          ctx.kit.rings(center.clone().setY(center.y + 1.4), 5, 0.09);
        });
      },
    },
    {
      t: 214.03,
      apply: (ctx) => {
        once("breath", () => {
          ctx.kit.birds(9, center.clone().setY(center.y + 10), 16, 3);
          addPillars(ctx.group, [center.clone().setY(center.y + 0.1)], 11, 0.5);
        });
      },
    },
    {
      t: 251.2,
      apply: (ctx) => {
        once("opening", () => {
          ctx.kit.rings(center.clone().setY(center.y + 1.2), 9, 0.12);
          addPillars(ctx.group, [lamp(0.24), lamp(0.62), lamp(0.94)], 8, 0.22);
        });
      },
    },
    {
      t: 306.44,
      apply: (ctx) => {
        once("meadow", () => {
          ctx.kit.horses(center.clone().setY(center.y + 0.6), 15);
          ctx.kit.birds(7, center.clone().setY(center.y + 12), 22, 3);
        });
      },
    },
    {
      t: 431.72,
      apply: (ctx) => {
        once("road", () => {
          ctx.kit.pathLights(
            Array.from({ length: 8 }, (_, i) => lamp(i / 7)),
          );
        });
      },
    },
    {
      t: 451.57,
      apply: (ctx) => {
        once("road-out", () => {
          const dir = center.clone().sub(seat).normalize();
          ctx.kit.pathLights(
            Array.from({ length: 8 }, (_, i) =>
              center.clone().addScaledVector(dir, i + 1).setY(center.y + 0.12),
            ),
          );
        });
      },
    },
    {
      t: 504.56,
      apply: (ctx) => {
        once("full", () => {
          ctx.kit.rings(center.clone().setY(center.y + 1.6), 14, 0.16);
          addPillars(ctx.group, [center.clone().setY(center.y + 0.1)], 13, 0.6);
        });
      },
    },
    {
      t: 530.68,
      apply: (ctx) => {
        once("still", () => {
          const ring: THREE.Vector3[] = [];
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ring.push(
              center.clone()
                .add(new THREE.Vector3(Math.cos(a) * 9, 0, Math.sin(a) * 9))
                .setY(center.y + 0.1),
            );
          }
          addPillars(ctx.group, ring, 6, 0.24);
        });
      },
    },
  ];

  const lesson = new LessonScene(scene, narration, whisper, {
    id: "desert",
    trackId: "L07",
    seatPos,
    seatHeading: s.heading,
    build,
    beats,
  });

  const baseUpdate = lesson.update.bind(lesson);
  lesson.update = (dt: number): void => {
    baseUpdate(dt);
    tick(narration.time(), dt);
  };

  const baseDispose = lesson.dispose.bind(lesson);
  lesson.dispose = (): void => {
    for (const d of disposables) {
      try { d.dispose(); } catch { /* already gone */ }
    }
    disposables.length = 0;
    lantern = null;
    seed = null;
    baseDispose();
  };

  return lesson;
}
