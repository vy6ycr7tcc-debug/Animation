/* The Inward Journey — an open world of night and light.
   Wander anywhere. The land answers as you pass: grass brightens along your path, flowers
   bloom and chime, lanterns kindle, butterflies follow, gliders drift overhead, and the old
   forms (beam, veil, garden, throne, arch, rings) stand as landmarks to wander toward.
   Narration plays in the background the whole time, one recording after another.
   States: intro (title over the night water) → play → rest (after Leave) → play … */
import "./gpu/compat";
import * as THREE from "three/webgpu";
import { AudioEngine } from "./core/audio";
import { Input } from "./core/input";
import { Narration } from "./core/narration";
import { Playlist } from "./core/playlist";
import { heartId, passageId, promptsFor, registerAnswers, registerTunnel, SPECTRUM, trackId, walkId } from "./core/dialogues";
import { Awake } from "./core/awake";
import { AdaptiveQuality, FrameStats, MOBILE, type Tier } from "./core/quality";
import { clear, load, save, type SaveData } from "./core/save";
import { FollowCamera } from "./player/camera";
import { Controller } from "./player/controller";
import { Footprints } from "./player/footprints";
import { Wanderer } from "./player/wanderer";
import { Clouds } from "./world/atmosphere";
import { buildMandala, etchedStone, etchUniforms, vibeUniforms } from "./world/etching";
import { Landmarks } from "./world/landmarks";
import { Butterflies, Flowers, Gliders, Lanterns, LightGrass, Sparks, type LifeFrame } from "./world/life";
import { Motes } from "./world/motes";
import { Creation, creationUniforms, Spirits } from "./world/creation";
import { Beings } from "./world/beings";
import { SeaFauna, SeaLife, UnderwaterEffect } from "./world/underwater";
import { Post } from "./gpu/post";
import { fogUniforms, gpuUniforms, ijFogNode } from "./gpu/tsl";
import { Presences } from "./world/presences";
import { Guide, type Destination } from "./world/guide";
import { ARCHIVE, GROVE_SITES, ORB_SITES } from "./world/sites";
import { Communion } from "./world/communion";
import { Creatures } from "./world/creatures";
import { Vessels } from "./world/vessels";
import { TranscriptPlayer } from "./ui/transcriptPlayer";
import { StartMap, type Choice, type Place } from "./ui/map";
import { buildSky, skyUniforms, starDirection } from "./world/sky";
import { groundUniforms, heightAt, LANDMARK_SITES, PEAKS, SPAWN, Terrain, WATER_Y } from "./world/terrain";
import { Genesis } from "./world/genesis";
import { cloudUniforms } from "./world/atmosphere";
import { NO_MIRROR_LAYER, Water } from "./world/water";
import { FOG } from "./world/fog";
import { MOOD_NAMES, Moods } from "./world/moods";
import { lightField } from "./world/lightfield";
import { Forest } from "./world/forest";
import { RisingFlowers } from "./world/blooms";
import { Wilds } from "./world/wilds";

declare const __BUILD__: string;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

/** If anything fails on the phone, say so quietly on screen (for a screenshot), instead of the
    game silently losing a control or a voice. */
function showProblem(msg: string): void {
  let el = document.getElementById("problem");
  if (!el) {
    el = document.createElement("div");
    el.id = "problem";
    el.style.cssText = "position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom) + 4px);z-index:99;font:11px/1.3 ui-monospace,monospace;color:#ffd9b0;background:rgba(20,10,20,.72);padding:4px 8px;border-radius:6px;pointer-events:none;white-space:pre-wrap";
    document.body.append(el);
  }
  el.textContent = ("Problem: " + msg).slice(0, 300);
  window.clearTimeout((showProblem as unknown as { t?: number }).t);
  (showProblem as unknown as { t?: number }).t = window.setTimeout(() => el?.remove(), 30000);
}
addEventListener("error", (e) => showProblem(`${e.message} (${String(e.filename).split("/").pop()}:${e.lineno})`));
// the renderer reports shader and GPU failures through console.error: show those too
{
  const ce = console.error.bind(console);
  console.error = (...a: unknown[]) => {
    ce(...a);
    const m = a.map((x) => (x instanceof Error ? x.message : String(x))).join(" ");
    if (/THREE|WebGPU|GPU|shader|WGSL|GLSL/i.test(m)) showProblem(m);
  };
}
addEventListener("unhandledrejection", (e) => showProblem(String((e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason)));

type Mode = "intro" | "play" | "rest";
const S = {
  mode: "intro" as Mode,
  t: 0,
  hidden: false,
  reducedPref: null as boolean | null, // null: follow the system setting
  osReduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  get reduced() {
    return this.reducedPref ?? this.osReduced;
  },
  wt: 0, // world time: slows a little when the wanderer is still beside the veil
  toldDive: false,
};

/* ============ RENDERER ============ */
// WebGPU where the browser has it (Safari 26+, Chrome); otherwise three falls back to WebGL2 by
// itself. `?webgl` in the URL forces the fallback, for comparing the two.
const canvas = $<HTMLCanvasElement>("#gl");
const renderer = new THREE.WebGPURenderer({
  canvas,
  powerPreference: "high-performance",
  antialias: false,
  stencil: false,
  forceWebGL: /[?&]webgl\b/.test(location.search),
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // soft by its radius (WebGPU three has no PCFSoft)
renderer.toneMapping = THREE.AgXToneMapping;
renderer.setClearColor(0x000000, 0); // the lakes' mirror reads alpha 0 as "sky"
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.15, 6000);
const FOG_COLOR = FOG.color;
scene.fogNode = ijFogNode(); // height fog with moonlit in-scattering, for every standard material

// Under the surface: deep teal haze and wavering shafts of moonlight (only while the camera is under).
const underwater = new UnderwaterEffect();
const post = new Post(renderer, scene, camera, underwater);
// The bright star, as a light source for god rays (where it is on screen).
const starSource = new THREE.Object3D();

/* ============ WORLD ============ */
const starDir = starDirection();
skyUniforms.uStar.value.copy(starDir);
const sky = buildSky();
sky.layers.set(NO_MIRROR_LAYER); // the lakes mirror the world; the sky they draw themselves
scene.add(sky);
/** The sky as light for glossy things (after the renderer is ready; again as the mood changes). */

const hemi = new THREE.HemisphereLight(0x7a86d0, 0x221a36, 0.85);
scene.add(hemi);
const star = new THREE.DirectionalLight(0xffe0bc, 1.8);
star.castShadow = true;
star.shadow.camera.left = -26;
star.shadow.camera.right = 26;
star.shadow.camera.top = 26;
star.shadow.camera.bottom = -26;
star.shadow.camera.near = 1;
star.shadow.camera.far = 160;
star.shadow.bias = -0.0005;
star.shadow.normalBias = 0.04;
star.shadow.radius = 3;
scene.add(star, star.target, starSource);

const water = new Water();
scene.add(water.mesh, water.mirror.target);
water.excludeFromMirror(camera);
const terrain = new Terrain();
scene.add(terrain.group);
const clouds = new Clouds(MOBILE ? 60 : 80);
scene.add(clouds.mesh);

// A flat stone where the wanderer wakes, etched with the seven-fold figure.
const spawnY = heightAt(SPAWN.x, SPAWN.z);
const slab = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.5, 0.5, 48), new THREE.MeshStandardMaterial({ color: "#2a2740", roughness: 0.9 }));
slab.position.set(SPAWN.x, spawnY - 0.12, SPAWN.z);
slab.receiveShadow = true;
scene.add(slab);
const mandala = buildMandala();
mandala.scale.setScalar(0.4);
mandala.position.set(SPAWN.x, spawnY + 0.14, SPAWN.z);
scene.add(mandala);

const motes = new Motes(500);
scene.add(motes.points);

const wanderer = new Wanderer(camera);
scene.add(wanderer.root, wanderer.fx);
wanderer.load("models/wanderer.glb");
const player = new Controller();
player.pos.set(SPAWN.x, spawnY + 0.13, SPAWN.z);
player.heading = SPAWN.heading;
const footprints = new Footprints();
scene.add(footprints.mesh);
const follow = new FollowCamera(camera);

/* ============ AUDIO ============ */
const audio = new AudioEngine("audio/water-bed.mp3");
const narration = new Narration(audio, $("#sub"));
const playlist = new Playlist(narration);
registerAnswers();
registerTunnel();

/* ============ THE LIVING WORLD ============ */
const sparks = new Sparks();
const grass = new LightGrass();
const flowers = new Flowers(sparks, audio);
const lanterns = new Lanterns(sparks);
const blooms = new RisingFlowers();
const wilds = new Wilds();
const butterflies = new Butterflies(flowers);
const gliders = new Gliders();
const landmarks = new Landmarks(scene, audio, wanderer);
// The archetypes themselves, each at home in its landmark.
const beings = new Beings(landmarks.list, sparks);
scene.add(beings.group);
void beings.load("models/wanderer.glb");
// the voices of the archive, present while they speak
const presences = new Presences();
scene.add(presences.group);
// the entities' figures are left out: one walked beside the wanderer through every narration
// (Samuel: "remove that annoying chasing character")
scene.add(sparks.points, grass.mesh, flowers.mesh, blooms.mesh, wilds.group, lanterns.points, butterflies.points, gliders.group);
// The whole creation: trees and their roots, rocks, crystals, spirits, and the light through them.
creationUniforms.uFogC.value.copy(FOG_COLOR);
creationUniforms.uFogD.value = FOG.density * 0.9;
creationUniforms.uStar.value.copy(starDir);
// the sky's moods, which change as you travel
const moods = new Moods({ hemi, star, scene, creationFog: creationUniforms.uFogC.value });
const creation = new Creation(sparks);
// the forests beyond, out to half a kilometre
const forest = new Forest(creation);
scene.add(forest.mesh);
const spirits = new Spirits(creation, MOBILE ? 10 : 14);
scene.add(creation.group, spirits.group);
const seaLife = new SeaLife();
scene.add(seaLife.group);
const fauna = new SeaFauna();
scene.add(fauna.group);
const communion = new Communion();
scene.add(communion.group);
// The archive's vessels: orbs and groves, and the quiet player for their narrations.
const vessels = new Vessels();
scene.add(vessels.group);
const creatures = new Creatures(MOBILE ? 7 : 9, MOBILE ? 15 : 21);
scene.add(creatures.group);

/** Glow materials add light but leave alpha alone, so they don't punch dark squares into
    the water's reflection texture (which uses alpha to know where the world is). */
function additiveKeepsAlpha(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      if (m.blending !== THREE.AdditiveBlending) continue;
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.SrcAlphaFactor;
      m.blendDst = THREE.OneFactor;
      m.blendSrcAlpha = THREE.ZeroFactor;
      m.blendDstAlpha = THREE.OneFactor;
    }
  });
}
additiveKeepsAlpha(scene);
// what the lakes don't mirror: the grass's blades and the lights seen through the ground
for (const o of [grass.mesh, blooms.mesh, ...creation.noReflect]) o.layers.set(NO_MIRROR_LAYER);

/* ============ QUALITY ============ */
let dpr = 1;
const quality: AdaptiveQuality = new AdaptiveQuality(applyTier);
function resize(): void {
  const w = innerWidth, h = innerHeight;
  dpr = quality.dpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  // the lakes' mirror: half the drawing buffer (its long side stays above 1024 on a phone)
  water.mirror.reflector.resolutionScale = Math.max(0.5, Math.min(1, 1100 / (Math.max(w, h) * dpr)));
  camera.aspect = w / h;
  camera.fov = h > w ? 66 : 55;
  camera.updateProjectionMatrix();
}
/** What the quality tier allows; under the water, ambient occlusion and god rays rest. */
const tierFx = { rays: true, ao: true };
/** Anti-aliasing: SMAA by default (crisp; TRAA softened everything and left ghost trails behind
    moving motes on the phone); `?aa=traa` or `?aa=none` to compare. */
const AA = (new URLSearchParams(location.search).get("aa") ?? "smaa") as "smaa" | "traa" | "none";
function applyTier(t: Tier, i: number = quality.tier): void {
  tierFx.rays = t.rays;
  tierFx.ao = t.ao;
  post.configure({ ao: t.ao, rays: t.rays, bloom: t.bloom, aa: AA });
  // no mirrored world in the lakes: the water reflects only the sky (Samuel: "better to not
  // have any reflecting… but incredible skies when you look at them")
  water.setReflection(false);
  // the shadow map follows mapSize by itself (no dispose, as WebGL needed)
  star.shadow.mapSize.set(t.shadow, t.shadow);
  motes.setCount(Math.round(t.particles / 2));
  creation.setQuality(Math.max(0, i - 1));
  forest.mesh.visible = i <= 2; // the forests beyond rest on the two lowest tiers
  resize();
}
applyTier(quality.current);
addEventListener("resize", resize);

/* ============ SAVE ============ */
const saved = load();
const awake = new Awake();
awake.on = saved?.settings?.awake ?? true;
if (saved) {
  const [x, y, z] = saved.pos;
  player.pos.set(x, Math.max(y, heightAt(x, z)), z);
  player.heading = saved.heading;
  S.reducedPref = saved.settings?.reduced ?? null;
  audio.volume = saved.settings?.volume ?? 0.8;
  narration.subtitlesOn = false; // no subtitles (Samuel: "remove subtitles")
  // (the older "narration" setting is not read: one tap on "Just the music" had silenced the
  // narrator for good; only the menu's own switch turns the voices off now)
  playlist.on = saved.settings?.voices ?? true;
  playlist.restore(saved.journey?.heard ?? []);
  for (const b of beings.list) {
    b.walked = !!saved.journey?.walked.includes(b.spec.numeral);
    b.hearted = !!saved.journey?.hearted.includes(b.spec.numeral);
  }
}
let resetting = false;
function persist(): void {
  if (S.mode === "intro" || resetting) return;
  const d: SaveData = {
    v: 1,
    pos: [player.pos.x, player.pos.y, player.pos.z],
    heading: player.heading,
    heard: [],
    visited: [],
    settings: { volume: audio.volume, reduced: S.reducedPref, subtitles: narration.subtitlesOn, voices: playlist.on, awake: awake.on },
    journey: {
      heard: playlist.heardIds,
      walked: beings.list.filter((b) => b.walked).map((b) => b.spec.numeral),
      hearted: beings.list.filter((b) => b.hearted).map((b) => b.spec.numeral),
      passed: [...passed],
      archive: [...archiveHeard],
    },
    savedAt: Date.now(),
  };
  save(d);
}
follow.yaw = player.heading;
follow.snapTo(player.pos);
terrain.update(player.pos.x, player.pos.z, true);

/* ============ UI ============ */
function say(m: string): void {
  const l = $("#live");
  l.textContent = "";
  window.setTimeout(() => (l.textContent = m), 50);
}
let whisperTimer = 0;
function whisper(text: string, ms = 5000): void {
  const w = $("#whisper");
  w.textContent = text;
  w.classList.add("on");
  window.clearTimeout(whisperTimer);
  whisperTimer = window.setTimeout(() => w.classList.remove("on"), ms);
}

const input = new Input($("#surface"), $("#joy"), $("#knob"), $("#act"), $("#ctx"));
// no long-press menus or text selection anywhere in the game
addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("selectstart", (e) => {
  if (!(e.target as HTMLElement)?.closest?.("input, textarea")) e.preventDefault();
});
input.onLand = () => {
  if (player.flying) {
    player.land();
    whisper("Coming down to land", 2500);
  } else if (player.diving) player.surface();
  else if (player.swimming) player.dive();
};
input.onAction = () => {
  if (genesis.active) return;
  if (wanderer.gesture !== "none") wanderer.setGesture("none");
  if (player.swimming) {
    player.stroke();
    seaLife.bubbles(player.pos, 10);
  } else player.jump();
};
input.onTap = (x, y, touch) => {
  if (S.mode !== "play" || genesis.active) return;
  // an orb or a fruit under the tap: its narration begins (never by itself)
  const v = vessels.pick(x, y, camera);
  if (v) {
    playArchive(v.narration);
    return;
  }
  // a tap on the land sets course for it: walking, or flying there if in the air (Samuel)
  void touch;
  if (sitting.phase === "seated") return;
  const p = groundPoint(x, y);
  if (!p) return;
  player.target = new THREE.Vector2(p.x, p.z);
  if (p.y <= WATER_Y + 0.05) water.ripple(p.x, p.z, 0.6, S.t);
  else footprints.place(p.x, p.y, p.z, player.heading, S.t);
};
// Genesis: a long press on the wanderer's heart (or H). The world goes dark, lines of light
// grow from the heart to all of creation, and creation rebuilds itself (world/genesis.ts).
const genesis = new Genesis();
scene.add(genesis.group);
const heartScreen = new THREE.Vector3();
let genesisBells = 0;
function heartAt(out: THREE.Vector3): THREE.Vector3 {
  return out.copy(player.pos).add(new THREE.Vector3(0, 1.15, 0));
}
function beginGenesis(): void {
  if (S.mode !== "play" || genesis.active || sitting.phase === "seated" || player.flying || player.diving) return;
  const targets = [
    ...creation.standing(),
    ...lanterns.standing().map((p) => ({ p, great: false })),
    ...flowers.standing(player.pos, 45, 40).map((p) => ({ p, great: false })),
    ...beings.list.map((b) => ({ p: b.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)), great: true })),
    ...ORB_SITES.map((o) => ({ p: new THREE.Vector3(o.x, o.y, o.z), great: true })),
    ...GROVE_SITES.map((g) => ({ p: new THREE.Vector3(g.x, g.y + 4, g.z), great: false })),
    ...LANDMARK_SITES.map(([x, z]) => ({ p: new THREE.Vector3(x, heightAt(x, z) + 2, z), great: false })),
    ...PEAKS.map((k) => ({ p: new THREE.Vector3(k.x, heightAt(k.x, k.z) + 4, k.z), great: true })),
  ];
  player.target = null;
  genesis.start(heartAt(new THREE.Vector3()), targets);
  genesisBells = 0;
  audio.duck(true);
  quality.hold(4);
}
input.onHold = (x, y) => {
  heartAt(heartScreen).project(camera);
  const sx = (heartScreen.x * 0.5 + 0.5) * innerWidth, sy = (-heartScreen.y * 0.5 + 0.5) * innerHeight;
  if (heartScreen.z < 1 && Math.hypot(x - sx, y - sy) < Math.max(70, innerHeight * 0.09)) beginGenesis();
};
input.onHeart = beginGenesis;
function genesisFrame(dt: number): void {
  const g = genesis.update(dt, camera, innerHeight);
  // the bells: one as the dark falls, two as creation comes back (all above ~200 Hz)
  const bells = [[0.2, 264], [18.5, 396], [21, 528]];
  while (genesisBells < bells.length && genesis.t >= bells[genesisBells][0]) audio.bell(bells[genesisBells++][1], 0.16, 7);
  // the air: black and thick at the start, thinning again from the heart outward
  const air = g.air;
  fogUniforms.color.value.multiplyScalar(1 - air);
  fogUniforms.glow.value.multiplyScalar(1 - air);
  fogUniforms.density.value = fogUniforms.density.value * Math.pow(0.6 / fogUniforms.density.value, air);
  const k = g.sky;
  skyUniforms.uZen.value.multiplyScalar(k);
  skyUniforms.uMid.value.multiplyScalar(k);
  skyUniforms.uHor.value.multiplyScalar(k);
  skyUniforms.uStars.value *= k;
  skyUniforms.uSunK.value *= k;
  skyUniforms.uMoonK.value *= k;
  cloudUniforms.shade.value.multiplyScalar(k);
  cloudUniforms.light.value.multiplyScalar(k);
  post.starVis.value *= k; // the moon's rays
  follow.lift = genesis.active ? g.lift : 0;
  const lit = !g.lightsHidden;
  vessels.group.visible = lanterns.points.visible = butterflies.points.visible = gliders.group.visible = lit;
  if (!genesis.active) audio.duck(false);
}
player.onLand = () => {
  if (!player.swimming) wanderer.land();
  const y = Math.max(heightAt(player.pos.x, player.pos.z), WATER_Y);
  footprints.place(player.pos.x - 0.1, y, player.pos.z, player.heading, S.t);
  footprints.place(player.pos.x + 0.1, y, player.pos.z, player.heading, S.t);
  audio.step(false);
};
lanterns.onKindle = () => say("Lanterns kindle around you.");

function begin(e?: Event): void {
  if (S.mode !== "intro" || startMap.isOpen) return;
  // Sound starts inside this touch (iOS requirement).
  audio.start();
  audio.bell(587.33, 0.05, 6);
  const pt = e instanceof MouseEvent ? groundPoint(e.clientX, e.clientY) : null;
  const rp = pt ?? new THREE.Vector3(0, 0, 10);
  water.ripple(rp.x, rp.z, 1.4, S.t);
  $("#title").classList.add("gone");
  $("#begin").hidden = true;
  // Then the map: where to begin decides whose voice comes first.
  awake.want();
  // ask the phone to keep the saved journey safe (granted quietly, most readily on the Home Screen)
  void navigator.storage?.persist?.().catch(() => false);
  const you = saved ? { x: saved.pos[0], z: saved.pos[2], heading: saved.heading } : null;
  void startMap.open(places(), you, false, !!you).then((c) => c && arrive(c, true));
}

/** Every vessel of the archive's narrations, marked on the map in its own way: the groves'
    great trees, the planets (over the land, in the deep, in the sky) and the stars. */
function skyMarks(): { x: number; z: number; kind: "planet" | "star" | "grove" | "crystal"; label: string }[] {
  return [
    ...ORB_SITES.map((o) => ({ x: o.x, z: o.z, kind: (o.realm === "star" ? "star" : "planet") as "star" | "planet", label: o.orb.title })),
    ...GROVE_SITES.map((g) => ({ x: g.x, z: g.z, kind: g.crystal ? ("crystal" as const) : ("grove" as const), label: g.grove.name })),
  ];
}

/** The places on the map: the shore, and the seven archetypes' homes. */
function places(): Place[] {
  return [
    { numeral: "", label: "The shore", group: "Shore", x: SPAWN.x, z: SPAWN.z, narration: "J01", start: { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading } },
    ...beings.list.map((b, i) => ({
      numeral: b.spec.numeral,
      label: b.spec.name,
      group: b.spec.realm,
      deep: !!b.spec.under,
      x: b.root.position.x,
      z: b.root.position.z,
      narration: b.spec.narration,
      start: beings.approach(i),
    })),
  ];
}

/** Wake at the chosen place. */
function arrive(c: Choice, first: boolean): void {
  standUp();
  player.pos.set(c.x, Math.max(heightAt(c.x, c.z), WATER_Y - 1), c.z);
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.grounded = true;
  player.target = null;
  player.heading = c.heading;
  terrain.update(c.x, c.z, true);
  quality.hold(4); // a new place streams in: don't take its first moments as slowness
  follow.yaw = c.heading;
  follow.snapTo(player.pos);
  follow.startFollowing(true);
  wanderer.setForm(0);
  wanderer.setGesture("none");
  beings.reset();
  lastMet = -1;
  playlist.startWith(c.place.narration);
  input.enabled = true;
  S.mode = "play";
  persist();
  if (!first) return;
  $("#menu-btn").hidden = false;
  tp.setResting(true);
  if (MOBILE) $("#act").hidden = $("#joy").hidden = false;
  say(`You wake near ${c.place.label.replace(/^The /, "the ")}. Wander anywhere; the land answers as you pass.`);
  window.setTimeout(() => whisper(MOBILE ? "Put your thumb down anywhere on the lower left to walk" : "Click where you want to go, or use W A S D", 6500), 4000);
  window.setTimeout(() => whisper(MOBILE ? "Tap the round button to jump, tap again to fly; hold it to rise" : "Space to jump, again to fly; hold it to rise", 6000), 26000);
  window.setTimeout(() => whisper(MOBILE ? "Push the stick further to run" : "Hold Shift to run", 6000), 50000);
}
$("#begin").addEventListener("click", begin);
const startMap = new StartMap();
startMap.sky = skyMarks();
// Meeting an archetype: it greets you, and its voice begins (the Threshold).
beings.onMeet = (a) => {
  if (playlist.on) playlist.meet(a.narration); // "only nature": the archetypes keep quiet too
  whisper(`${a.numeral} · ${a.name}`, 5000);
  say(`${a.name} turns toward you.`);
};
/* The tunnel, deeper in: step close to a being you have met and it speaks its teaching (the
   Walk); sit with it (or, in the deep, rest still before it) and it speaks its practice (the
   Heart). When you leave it behind, the passage for the road onward is the next voice you hear. */
let lastMet = -1;
const passed = new Set<number>(saved?.journey?.passed ?? []);
const archiveHeard = new Set<string>(saved?.journey?.archive ?? []);
function updateTunnel(): void {
  if (S.mode !== "play" || !playlist.on || playlist.held || tp.active) return;
  const n = beings.nearest(player.pos);
  const b = n.i >= 0 ? beings.list[n.i] : null;
  if (b?.met) lastMet = n.i;
  const idle = !narration.current;
  if (b && b.met && !b.walked && idle && sitting.phase === "none" && n.d < (b.spec.under ? 5 : 3.4)) {
    b.walked = true;
    playlist.mark(walkId(b.spec.numeral));
    void narration.play(walkId(b.spec.numeral));
    return;
  }
  const settled = sitting.phase === "seated" ? sitting.since > 1.2 && !sitting.asked : !!b?.spec.under && b.walked && n.d < 5 && stillFor > 2.5;
  if (b && b.met && !b.hearted && idle && settled && (sitting.phase !== "seated" || sitting.being === n.i)) {
    b.hearted = true;
    playlist.mark(heartId(b.spec.numeral));
    void narration.play(heartId(b.spec.numeral));
    return;
  }
  if (lastMet >= 0 && !passed.has(lastMet) && beings.list[lastMet].distanceTo(player.pos) > 35) {
    passed.add(lastMet);
    const id = passageId(lastMet + 1);
    if (id) playlist.queueNext(id);
  }
}
/* ---- Sitting with an archetype: ask it something, rest in silence, offer light ---- */
const sitting = { being: -1, phase: "none" as "none" | "walking" | "seated", x: 0, z: 0, heading: 0, rise: 0, since: 0, asked: false };
const seatStone = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), etchedStone("#3a3552"));
seatStone.scale.set(0.46, 0.42, 0.36);
seatStone.castShadow = seatStone.receiveShadow = true;
seatStone.visible = false;
scene.add(seatStone);
const sitOffer = $<HTMLButtonElement>("#sit-offer"), sitPanel = $("#sit-panel");
const stillBtn = $<HTMLButtonElement>("#sit-still");

function offerSit(): void {
  if (S.mode !== "play" || sitting.phase !== "none") return;
  const n = beings.nearest(player.pos);
  if (n.i < 0 || n.d > 6.5) return;
  const seat = beings.seatFor(n.i);
  Object.assign(sitting, { being: n.i, phase: "walking", x: seat.x, z: seat.z, heading: seat.heading });
  seatStone.visible = seat.stone;
  seatStone.position.set(seat.x, heightAt(seat.x, seat.z) - 0.5, seat.z + 0.4);
  sitting.rise = 0;
  player.target = new THREE.Vector2(seat.x, seat.z);
  sitOffer.hidden = true;
}
function sitDown(): void {
  const b = beings.list[sitting.being];
  sitting.phase = "seated";
  sitting.since = 0;
  sitting.asked = false;
  player.pos.x = sitting.x;
  player.pos.z = sitting.z;
  player.target = null;
  player.heading = sitting.heading;
  follow.yaw = sitting.heading;
  wanderer.setGesture("sit");
  follow.seatedWith = b.root.position;
  document.body.classList.add("seated");
  $("#sit-title").textContent = `${b.spec.numeral} · ${b.spec.name}`;
  const box = $("#sit-prompts");
  box.replaceChildren();
  let group = "";
  for (const p of promptsFor(b.spec.numeral)) {
    if (p.kind !== group) {
      group = p.kind;
      const g = document.createElement("p");
      g.className = "group";
      g.textContent = p.kind === "feeling" ? "Share a feeling" : "Ask";
      box.append(g);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = p.label;
    btn.addEventListener("click", () => {
      btn.classList.add("heard");
      sitting.asked = true;
      stillness(false);
      b.greet();
      if (tp.active) tp.close(); // at a station, only the archetype speaks
      playlist.held = false;
      void narration.play(trackId(b.spec.numeral, p.id));
    });
    box.append(btn);
  }
  heart.reset();
  sitPanel.hidden = false;
  (box.querySelector("button") as HTMLButtonElement | null)?.focus({ preventScroll: true });
  say(`You sit with ${b.spec.name}.`);
}
function standUp(): void {
  if (sitting.phase === "none") return;
  if (sitting.phase === "seated" && narration.current?.startsWith("A-")) narration.stop(2);
  sitting.phase = "none";
  stillness(false);
  wanderer.setGesture("none");
  sitPanel.hidden = true;
  follow.seatedWith = null;
  document.body.classList.remove("seated");
}
function stillness(on: boolean): void {
  stillBtn.setAttribute("aria-pressed", String(on));
  stillBtn.textContent = on ? "Return from silence" : "Rest in silence";
  if (on) narration.stop(3);
}
sitOffer.addEventListener("click", offerSit);
stillBtn.addEventListener("click", () => stillness(stillBtn.getAttribute("aria-pressed") !== "true"));
$("#sit-stand").addEventListener("click", standUp);
$("#sit-offer-light").addEventListener("click", () => {
  // light flows from the wanderer's heart to the archetype, and it answers with its own
  const b = beings.list[sitting.being];
  if (!b) return;
  const from = player.pos.clone().setY(player.pos.y + 1.0);
  const to = b.root.position.clone().setY(b.root.position.y + 1.1);
  for (let k = 0; k <= 12; k++)
    window.setTimeout(() => sparks.emit(from.clone().lerp(to, k / 12), 5, new THREE.Color(1, 0.85, 0.6), 0.25), k * 90);
  window.setTimeout(() => b.greet(), 1100);
});

/* "How is your heart right now?": drag slowly along one gradient from shadow to light. Letting
   go settles on the nearest of five places, and the archetype answers from there. */
const heart = (() => {
  const box = $("#heart"), track = $("#heart-track"), thumb = $("#heart-thumb");
  const anchors = SPECTRUM?.anchors ?? [];
  const n = Math.max(1, anchors.length - 1);
  const said = ["far toward shadow", "toward shadow", "between shadow and light", "toward light", "far toward light"];
  let pos = 0.5, target = 0.5, dragging = false;
  box.hidden = !SPECTRUM;
  if (SPECTRUM) {
    $("#heart-label").textContent = SPECTRUM.label;
    const [a, b] = [...$("#heart-ends").children] as HTMLElement[];
    a.textContent = SPECTRUM.ends[0];
    b.textContent = SPECTRUM.ends[1];
  }
  const at = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const answer = () => {
    const i = Math.round(target * n);
    target = i / n;
    track.setAttribute("aria-valuenow", String(i));
    track.setAttribute("aria-valuetext", said[i] ?? "");
    const b = beings.list[sitting.being];
    if (!b || !anchors[i]) return;
    sitting.asked = true;
    stillness(false);
    b.greet();
    if (tp.active) tp.close();
    playlist.held = false;
    void narration.play(trackId(b.spec.numeral, anchors[i]));
  };
  track.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    track.setPointerCapture(e.pointerId);
    dragging = true;
    target = at(e);
  });
  track.addEventListener("pointermove", (e) => dragging && (target = at(e)));
  const release = () => {
    if (!dragging) return;
    dragging = false;
    answer();
  };
  track.addEventListener("pointerup", release);
  track.addEventListener("pointercancel", release);
  track.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    target = Math.min(1, Math.max(0, Math.round(target * n + step) / n));
    answer();
  });
  return {
    reset() {
      pos = target = 0.5;
      thumb.style.left = "50%";
    },
    /** Each frame: the light follows the finger slowly, and settles softly. */
    update(dt: number) {
      pos += (target - pos) * Math.min(1, dt * (dragging ? 2.6 : 3.5));
      thumb.style.left = `${pos * 100}%`;
    },
  };
})();

/* ---- Stillness: stop, and the wanderer turns inward; everything connects through light ---- */
let stillFor = 0;
let vibeK = 0, vibeTimer = 0;
let vibeStone: { p: THREE.Vector3; r: number; crystal: boolean } | null = null;
let medK = 0;
const heartPos = new THREE.Vector3();
function updateStillness(dt: number, wt: number): void {
  const calm =
    S.mode === "play" && player.grounded && !player.swimming && !player.flying && player.speed < 0.15 &&
    wanderer.gesture === "none" && sitting.phase === "none" && Math.hypot(input.move.x, input.move.y) < 0.05 && !startMap.isOpen;
  stillFor = calm ? stillFor + dt : 0;
  const want = stillFor > 1.6 ? 1 : 0;
  const was = medK;
  medK += (want - medK) * Math.min(1, dt * (want ? 0.55 : 3.5));
  if (medK < 0.002) medK = 0;
  if (was < 0.3 && medK >= 0.3) spirits.gather(player.pos);
  wanderer.meditation = medK;
  creationUniforms.uCommune.value = medK;
  heartPos.copy(player.pos).setY(player.pos.y + 1.15);
  communion.update(wt, dt, medK, heartPos, player.pos, () => [
    ...creation.anchors(),
    ...beings.list.map((b) => b.root.position.clone().setY(b.root.position.y + 1.1)),
    ...landmarks.list.map((l) => l.center.clone().setY(l.center.y + 2.5)),
  ], (innerHeight * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  // a rock or crystal you have stopped before answers: it vibrates light outward
  const stone = stillFor > 0.7 ? creation.stoneBefore(player.pos, player.heading) : null;
  if (stone && (!vibeStone || stone.p.distanceTo(vibeStone.p) > 0.1)) vibeStone = stone;
  vibeK += ((stone ? 1 : 0) - vibeK) * Math.min(1, dt * (stone ? 1.2 : 2.5));
  if (vibeStone && vibeK > 0.01) {
    vibeUniforms.uVibePos.value.copy(vibeStone.p);
    vibeUniforms.uVibeR.value = vibeStone.r;
    vibeTimer -= dt;
    if (vibeTimer <= 0 && stone) {
      vibeTimer = 0.28;
      const col = vibeStone.crystal ? new THREE.Color().setHSL(Math.random(), 0.6, 0.78) : new THREE.Color(1, 0.86, 0.62);
      sparks.emit(vibeStone.p.clone().add(new THREE.Vector3((Math.random() - 0.5) * vibeStone.r, Math.random() * vibeStone.r * 0.6, (Math.random() - 0.5) * vibeStone.r)), 6, col, 1.3);
    }
  }
  vibeUniforms.uVibeK.value = vibeK;
}

/** Each frame: offer a seat near a being, walk to it, and keep the sitting in step. */
function updateSitting(dt: number): void {
  if (sitting.phase === "seated") {
    heart.update(dt);
    sitting.since += dt;
  }
  const n = beings.nearest(player.pos);
  // in the deep there is nowhere to sit: you rest before the being instead
  const canSit = n.i >= 0 && !beings.list[n.i].spec.under;
  sitOffer.hidden = !(S.mode === "play" && sitting.phase === "none" && canSit && n.d < 6.5 && !startMap.isOpen);
  if (!sitOffer.hidden) sitOffer.textContent = `Sit with ${beings.list[n.i].spec.name.replace(/^The /, "the ")}`;
  if (sitting.phase === "walking") {
    const moved = Math.hypot(input.move.x, input.move.y) > 0.2;
    if (moved) sitting.phase = "none";
    else if (Math.hypot(player.pos.x - sitting.x, player.pos.z - sitting.z) < 0.45) sitDown();
    else if (!player.target) player.target = new THREE.Vector2(sitting.x, sitting.z);
  }
  if (sitting.phase === "seated" && wanderer.gesture !== "sit") standUp(); // moving stands you up
  // the seat stone rises as you arrive, and sinks back when you leave
  sitting.rise += ((sitting.phase === "none" ? 0 : 1) - sitting.rise) * Math.min(1, dt * 1.6);
  seatStone.position.y = heightAt(seatStone.position.x, seatStone.position.z) - 0.5 + sitting.rise * 0.5;
  if (sitting.rise < 0.01 && sitting.phase === "none") seatStone.visible = false;
  landmarks.stillness += ((stillBtn.getAttribute("aria-pressed") === "true" ? 1 : 0) - landmarks.stillness) * Math.min(1, dt * 0.5);
  const cur = narration.current ?? "";
  beings.list.forEach((b) => (b.speaking = cur.startsWith(`A-${b.spec.numeral}-`) || cur === walkId(b.spec.numeral) || cur === heartId(b.spec.numeral) ? 1 : 0));
}

/* ---- The archive's narrations: started only by the player, one quiet card, never a modal ---- */
const tp = new TranscriptPlayer(audio);
function playArchive(n: Parameters<TranscriptPlayer["play"]>[0]): void {
  narration.stop(1.5); // the journey's voice or an archetype's answer makes way
  playlist.held = true;
  tp.play(n);
  tp.unfold(); // tapped on a vessel: its card shows
  say(`Playing: ${n.title}. ${TranscriptPlayer.caption(n).join(". ")}.`);
}
tp.onChange = (id) => {
  vessels.setPlaying(id);
  if (id) archiveHeard.add(id);
  else playlist.held = false; // closed: the journey's own voices may speak again
  const who = id ? tp.current?.sources[0]?.entity ?? null : null;
  if (who && !/^unknown/i.test(who)) whisper(who, 3500);
};
// when one ends, the next follows by itself (the phone may be locked in a pocket by now): the
// archive in its own order, episodes 1 to 86, those not yet heard first
const ARCHIVE_ORDER = [...ARCHIVE.orbs, ...ARCHIVE.trees.flatMap((t) => t.episodes)];
// the resting half-moon's play: the first narration of the archive not yet heard
tp.first = () => ARCHIVE_ORDER.find((x) => !archiveHeard.has(x.id)) ?? ARCHIVE_ORDER[0] ?? null;
tp.next = (n) => {
  const i = ARCHIVE_ORDER.findIndex((x) => x.id === n.id);
  for (let k = 1; k < ARCHIVE_ORDER.length; k++) {
    const c = ARCHIVE_ORDER[(i + k) % ARCHIVE_ORDER.length];
    if (!archiveHeard.has(c.id)) return c;
  }
  return ARCHIVE_ORDER[(i + 1) % ARCHIVE_ORDER.length] ?? null;
};
// once the journey's voices are all heard, the archive never speaks by itself (it starts only on a
// tap): now and then a quiet word points out where a voice not yet heard is waiting
let lastHint = -1e9;
playlist.onRunOut = () => {
  if (S.t - lastHint < 240 || tp.active) return false;
  let best: (typeof vessels.vessels)[number] | null = null, bd = Infinity;
  for (const v of vessels.vessels) {
    if (archiveHeard.has(v.narration.id)) continue;
    const d = v.pos.distanceTo(player.pos);
    if (d < bd) (bd = d), (best = v);
  }
  if (!best) return false;
  lastHint = S.t;
  const high = best.pos.y - Math.max(heightAt(best.pos.x, best.pos.z), WATER_Y) > 30;
  whisper(best.kind === "fruit" ? "A great tree nearby bears voices: tap a fruit to listen" : best.kind === "crystal" ? "Crystals nearby hold voices: tap one to listen" : high && best.radius < 5 ? "A star overhead carries a voice: fly up and tap it" : "A planet in the sky carries a voice: tap it to listen", 6000);
  return false;
};
$("#about-open").addEventListener("click", () => {
  setMenu(false);
  $("#about").hidden = false;
  $<HTMLButtonElement>("#about-close").focus();
});
$("#about-close").addEventListener("click", () => ($("#about").hidden = true));

/* ---- The guide: tell it where you'd like to go, and it leads the way ---- */
const guide = new Guide();
scene.add(guide.group);
const guidePanel = $("#guide"), guideList = $("#guide-list"), guidePick = $("#guide-pick");
let guideChoice: Destination | null = null;
guide.onArrive = (d) => {
  whisper(d.label, 4000);
  say(`You have arrived: ${d.label}.`);
};
function guideDestinations(): { group: string; items: (Destination & { note?: string })[] }[] {
  const p = player.pos;
  const byDist = <T extends { x: number; z: number }>(a: T[]) => [...a].sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z));
  const being = (b: (typeof beings.list)[number]): Destination & { note?: string } => ({
    label: `${b.spec.numeral} · ${b.spec.name}`,
    x: b.root.position.x,
    y: b.root.position.y,
    z: b.root.position.z,
    note: b.spec.under ? "in the deep" : b.walked ? "visited" : undefined,
  });
  // somewhere new: the nearest archetype you haven't sat or walked with, and the nearest archive voice you haven't heard
  const newBeing = byDist(beings.list.filter((b) => !b.walked).map((b) => ({ b, x: b.root.position.x, z: b.root.position.z })))[0];
  const newOrb = byDist(ORB_SITES.filter((o) => !archiveHeard.has(o.orb.id)).map((o) => ({ ...o })))[0];
  const fresh: (Destination & { note?: string })[] = [];
  if (newBeing) fresh.push({ ...being(newBeing.b), note: "an archetype you haven't met yet" });
  if (newOrb) fresh.push({ label: newOrb.orb.title, x: newOrb.x, y: newOrb.y, z: newOrb.z, note: newOrb.realm === "star" ? "a star you haven't heard, high overhead" : "a planet you haven't heard, in the sky" });
  const realm = (r: string) => beings.list.filter((b) => b.spec.realm === r).map(being);
  return [
    { group: "Somewhere new", items: fresh },
    { group: "The Mind", items: realm("Mind") },
    { group: "The Body", items: realm("Body") },
    { group: "The Spirit", items: realm("Spirit") },
    { group: "The Choice", items: realm("Choice") },
    { group: "The groves of the archive", items: byDist(GROVE_SITES.map((g) => ({ label: g.grove.name, x: g.x, y: g.y, z: g.z }))) },
    {
      group: "The orbs of the archive",
      items: byDist(ORB_SITES.map((o) => ({ label: o.orb.title, x: o.x, y: o.y, z: o.z, note: [o.realm === "star" ? "a star, high overhead" : o.realm === "sky" ? "a planet in the sky" : o.realm === "water" ? "in the deep" : "", archiveHeard.has(o.orb.id) ? "heard" : ""].filter(Boolean).join(", ") || undefined }))),
    },
  ];
}
const far = (d: Destination) => {
  const m = Math.hypot(d.x - player.pos.x, d.z - player.pos.z);
  return m > 950 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
};
function openGuide(): void {
  setMenu(false);
  guideList.replaceChildren();
  guidePick.hidden = true;
  if (guide.target) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `Stop guiding (to ${guide.target.label})`;
    b.addEventListener("click", () => (guide.stop(), (guidePanel.hidden = true)));
    guideList.append(b);
  }
  for (const g of guideDestinations()) {
    if (!g.items.length) continue;
    const h = document.createElement("p");
    h.className = "gg";
    h.textContent = g.group;
    guideList.append(h);
    for (const d of g.items) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = d.label;
      const s = document.createElement("span");
      s.textContent = [far(d), d.note].filter(Boolean).join(" · ");
      b.append(s);
      b.addEventListener("click", () => {
        guideChoice = d;
        $("#guide-name").textContent = `${d.label} · ${far(d)} away`;
        guidePick.hidden = false;
        guidePick.scrollIntoView({ block: "nearest" });
        $<HTMLButtonElement>("#guide-walk").focus();
      });
      guideList.append(b);
    }
  }
  guidePanel.hidden = false;
  input.enabled = false;
}
function closeGuide(): void {
  guidePanel.hidden = true;
  input.enabled = S.mode === "play";
}
$("#guide-open").addEventListener("click", openGuide);
$("#guide-close").addEventListener("click", closeGuide);
$("#guide-walk").addEventListener("click", () => {
  if (!guideChoice) return;
  guide.lead(guideChoice, player.pos);
  whisper(`Follow the light · ${guideChoice.label}`, 5000);
  closeGuide();
});
$("#guide-go").addEventListener("click", () => {
  const d = guideChoice;
  if (!d) return;
  closeGuide();
  const pl = places();
  let best = pl[0];
  for (const q of pl) if (Math.hypot(q.x - d.x, q.z - d.z) < Math.hypot(best.x - d.x, best.z - d.z)) best = q;
  // wake a few steps away from it, facing it (on the water above, if it's in the deep)
  const x = d.x, z = d.z + 6;
  arrive({ place: best, x, z, heading: 0 }, false);
  guide.lead(d, player.pos);
});
startMap.onGuide = openGuide;

$("#map-open").addEventListener("click", () => {
  setMenu(false);
  input.enabled = false;
  void startMap.open(places(), { x: player.pos.x, z: player.pos.z }, true).then((c) => {
    input.enabled = true;
    if (c) arrive(c, false);
  });
});

/** Where a screen point meets the ground or the water. */
function groundPoint(cx: number, cy: number): THREE.Vector3 | null {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  if (d.y > -0.01) return null;
  let prev = 0;
  for (let s = 0.5; s < 400; s *= 1.06) {
    const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
    const g = Math.max(heightAt(x, z), WATER_Y);
    if (y <= g) {
      let a = prev, b = s;
      for (let i = 0; i < 8; i++) {
        const m = (a + b) / 2;
        const mx = o.x + d.x * m, mz = o.z + d.z * m;
        if (o.y + d.y * m <= Math.max(heightAt(mx, mz), WATER_Y)) b = m;
        else a = m;
      }
      const hx = o.x + d.x * b, hz = o.z + d.z * b;
      return new THREE.Vector3(hx, Math.max(heightAt(hx, hz), WATER_Y), hz);
    }
    prev = s;
  }
  return null;
}

// Settings.
const menu = $("#menu"), menuBtn = $("#menu-btn");
function setMenu(open: boolean): void {
  menu.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
  if (open) $<HTMLInputElement>("#vol").focus();
}
// on the touch itself: a phone makes no click of a tap while the other thumb is on the stick
menuBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  setMenu(menu.hidden);
});
menuBtn.addEventListener("click", (e) => e.detail === 0 && setMenu(menu.hidden)); // the keyboard
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.mode === "play") setMenu(menu.hidden);
  if ((e.key === "e" || e.key === "E") && S.mode === "play") (sitting.phase === "none" ? offerSit() : standUp());
  if (e.key === "Enter" && S.mode === "play" && !(e.target as HTMLElement)?.closest?.("button, input, [role=slider]")) {
    const v = vessels.nearest(player.pos);
    if (v) playArchive(v.narration);
  }
  if (S.mode === "intro" && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    begin();
  }
});
const vol = $<HTMLInputElement>("#vol");
vol.value = String(audio.volume);
vol.addEventListener("input", () => {
  audio.setVolume(Number(vol.value));
  persist();
});
const voiceBox = $<HTMLInputElement>("#voice");
voiceBox.checked = playlist.on;
tp.setQuiet(!playlist.on);
// "Only nature" in the player: every voice rests, and only the world is heard (Samuel: "I was
// underwater enjoying the sound and the lady started talking"); the menu's Narration is the same switch
tp.onQuiet = (on) => {
  playlist.setOn(!on);
  narration.stop(1.5);
  voiceBox.checked = !on;
  persist();
};
voiceBox.addEventListener("change", () => {
  playlist.setOn(voiceBox.checked);
  tp.setQuiet(!voiceBox.checked);
  persist();
});
const awakeBox = $<HTMLInputElement>("#awake");
awakeBox.checked = awake.on;
awakeBox.addEventListener("change", () => {
  awake.set(awakeBox.checked);
  persist();
});
const reducedBox = $<HTMLInputElement>("#reduced");
reducedBox.checked = S.reduced;
reducedBox.addEventListener("change", () => {
  S.reducedPref = reducedBox.checked;
  applyReduced();
  persist();
});
matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", (e) => {
  S.osReduced = e.matches;
  reducedBox.checked = S.reduced;
  applyReduced();
});
function applyReduced(): void {
  water.uniforms.uCalm.value = S.reduced ? 0.35 : 1;
}
applyReduced();

$("#leave").addEventListener("click", () => {
  persist();
  awake.rest();
  setMenu(false);
  S.mode = "rest";
  input.enabled = false;
  narration.stop(2);
  if (tp.active) tp.close();
  audio.fade(false);
  $("#rest").hidden = false;
  for (const id of ["#act", "#ctx", "#joy"]) $(id).hidden = true;
  $("#menu-btn").hidden = true;
  tp.setResting(false);
  $<HTMLButtonElement>("#return").focus();
  say("Your place is kept.");
});
// Begin again: asks once more before forgetting (position and kindled lanterns).
let restartArmed = 0;
$("#restart").addEventListener("click", () => {
  const b = $("#restart");
  if (!restartArmed) {
    b.textContent = "Tap again to begin from the start";
    restartArmed = window.setTimeout(() => {
      restartArmed = 0;
      b.textContent = "Begin again";
    }, 5000);
    return;
  }
  resetting = true;
  clear();
  try {
    localStorage.removeItem("inward-journey:lanterns");
  } catch {
    /* nothing to clear */
  }
  location.reload();
});
$("#return").addEventListener("click", () => {
  awake.want();
  audio.start();
  audio.fade(true);
  S.mode = "play";
  input.enabled = true;
  $("#rest").hidden = true;
  $("#menu-btn").hidden = false;
  tp.setResting(true);
  if (MOBILE || input.touchUsed) $("#act").hidden = $("#joy").hidden = false;
});

/* ============ READINGS (#stats, or tap ⋮ five times quickly) ============ */
const stats = new FrameStats();
let showStats = location.hash === "#stats";
try {
  showStats ||= localStorage.getItem("inward-journey:stats") === "1";
} catch {
  /* no storage */
}
$("#stats").hidden = !showStats;
{
  let taps: number[] = [];
  $("#menu-btn").addEventListener("pointerdown", () => {
    const now = performance.now();
    taps = [...taps.filter((t) => now - t < 1500), now];
    if (taps.length < 5) return;
    taps = [];
    showStats = !showStats;
    $("#stats").hidden = !showStats;
    try {
      localStorage.setItem("inward-journey:stats", showStats ? "1" : "0");
    } catch {
      /* no storage */
    }
  });
}
window.setInterval(() => showStats && ($("#stats-text").textContent = readings()), 1000);
let rendererName = "starting…";
function nameRenderer(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const be = renderer.backend as any;
  if (be.isWebGPUBackend) {
    const info = be.adapter?.info ?? {};
    const gpu = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ");
    rendererName = `WebGPU${gpu ? ` · ${gpu}` : ""}`;
  } else {
    const gl = be.gl as WebGL2RenderingContext | undefined;
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    const gpu = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    rendererName = `WebGL2 (fallback)${gpu ? ` · ${gpu}` : ""}`;
  }
}
function readings(): string {
  const ri = renderer.info.render;
  const px = Math.round(innerWidth * dpr) + "×" + Math.round(innerHeight * dpr);
  return [
    `${rendererName} · build ${__BUILD__}`,
    `fps ${stats.fps.toFixed(1)} · avg ${stats.avgMs.toFixed(1)} ms · worst ${stats.worstMs.toFixed(0)} ms`,
    `tier ${quality.current.name} · dpr ${dpr.toFixed(2)} of ${devicePixelRatio} · scale ${quality.scale.toFixed(1)} · ${px}`,
    `${quality.reason} · ${shadersReady ? "shaders ready" : "compiling shaders…"}`,
    `${frameDraws} draws · ${(ri.triangles / 1000).toFixed(0)}k tris`, // this frame's (calls counts since the start)
    `audio ${audio.ctx?.state ?? "off"} · session ${audio.sessionType} · voice ${narration.current ?? "-"}`,
    `sky ${MOOD_NAMES.map((n, i) => `${n} ${(moods.weights[i] * 100).toFixed(0)}`).filter((x) => !x.endsWith(" 0")).join(" · ")}`,
    `pos ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)} · ${player.pose} · lanterns ${lanterns.litCount}`,
  ].join("\n");
}

/* ============ LOOP ============ */
let lastPrint = 0;
let printSide = 1;
let lastStroke = 0;
const orbPos = new THREE.Vector3();
let wasSwimming = false;
let saveTimer = 0;
const center = new THREE.Vector3();
const glow = new THREE.Vector3();
const life: LifeFrame = { t: 0, dt: 0, player: player.pos, speed: 0, reduced: false, dpr: 1 };

document.addEventListener("visibilitychange", () => {
  S.hidden = document.hidden;
  if (document.hidden) {
    persist();
    audio.suspend();
  } else {
    if (S.mode !== "intro") audio.resume();
    last = performance.now();
  }
});
addEventListener("pagehide", persist);

function update(dt: number): void {
  S.t += dt;
  const t = S.t;
  input.poll();
  const [lx, ly] = input.takeLook();
  if (lx || ly) follow.look(-lx * 0.0055, ly * 0.004);
  const z = input.takeZoom();
  if (z !== 1) follow.zoom(z);

  if (S.mode === "play") {
    if (wanderer.gesture !== "none" && Math.hypot(input.move.x, input.move.y) > 0.2 && wanderer.gesture === "sit") wanderer.setGesture("none");
    if (genesis.active) player.update(dt, { x: 0, y: 0, glide: false, run: 0, hold: false, down: false, pitch: follow.pitch }, follow.yaw);
    else player.update(dt, { ...input.move, glide: input.boost, run: input.run, hold: input.hold, down: input.descend, pitch: follow.pitch }, follow.yaw);
    // the one context word: "Land" high in the air, "Dive" on the water, "Surface" under it
    const ctx = $("#ctx");
    const high = player.flying && !player.landing && player.pos.y - Math.max(heightAt(player.pos.x, player.pos.z), WATER_Y) > 2.5;
    const word = sitting.phase === "seated" ? "" : high ? "Land" : player.swimming ? (player.diving ? "Surface" : "Dive") : "";
    ctx.hidden = !(MOBILE || input.touchUsed) || !word;
    if (ctx.textContent !== word) ctx.textContent = word;
    document.body.classList.toggle("flying", player.flying);
    if (player.swimming && !S.toldDive) {
      S.toldDive = true;
      whisper(MOBILE ? "Tap the round button to dive. Under the water, swim where you look" : "Tap Space to dive. Under the water, swim where you look", 6000);
    }
  }
  S.wt += dt * landmarks.timeScale;
  const wt = S.wt;

  wanderer.root.position.copy(player.pos);
  wanderer.root.rotation.y = player.heading;
  wanderer.root.visible = S.mode !== "intro";
  wanderer.animate(dt, player.pose, player.speed, t, S.reduced, dpr);
  wanderer.fx.visible = wanderer.root.visible;

  if (S.mode === "play") {
    // Footprints on the ground, rings on water.
    if (player.grounded && player.odometer - lastPrint > 0.7) {
      lastPrint = player.odometer;
      printSide = -printSide;
      const ox = Math.cos(player.heading) * 0.11 * printSide, oz = -Math.sin(player.heading) * 0.11 * printSide;
      const gy = heightAt(player.pos.x, player.pos.z);
      footprints.place(player.pos.x + ox, gy, player.pos.z + oz, player.heading, t);
      audio.step(false);
      if (gy < 0.15) water.ripple(player.pos.x, player.pos.z, 0.5, t);
    }
    if (player.swimming && !player.diving && player.odometer - lastStroke > 1.1) {
      lastStroke = player.odometer;
      water.ripple(player.pos.x, player.pos.z, 0.8, t);
      audio.step(true);
    }
    playlist.quiet = sitting.phase === "seated";
    playlist.update(realDt); // real time: a slow frame rate never stretches the quiet
  }
  narration.update();

  // The world streams around the wanderer and answers them.
  terrain.update(player.pos.x, player.pos.z);
  life.t = wt;
  life.dt = dt;
  life.speed = player.speed;
  life.reduced = S.reduced;
  life.dpr = dpr;
  if (S.mode !== "intro") {
    grass.update(life);
    flowers.update(life);
    blooms.update(life);
    wilds.update(life);
    lanterns.update(life);
    butterflies.update(life);
  }
  gliders.update(life);
  forest.update(player.pos);
  creation.update(life, (innerHeight * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  spirits.update(life, camera);
  sparks.update(dt, dpr);
  landmarks.update(wt, dt, player.pos, S.mode === "play" ? player.speed : 1, S.reduced);
  if (S.mode === "play") beings.update(wt, dt, player.pos, S.reduced);
  updateSitting(dt);
  updateTunnel();
  vessels.update(wt, player.pos, camera, S.reduced, S.mode === "play" && !startMap.isOpen);
  tp.subtitlesOn = narration.subtitlesOn;
  tp.update();
  updateStillness(dt, wt);
  if (S.mode !== "intro") creatures.update(wt, dt, player.pos, medK, player.speed > 3 || player.gliding, S.reduced);
  const camUnder = camera.position.y < WATER_Y - 0.05;
  post.under.value = camUnder ? 1 : 0;
  post.raysOn.value = camUnder ? 0 : 1 - 0.7 * moods.weights[3]; // the deep night keeps the star's glow small
  post.aoOn.value = camUnder ? 0 : 1;
  audio.underwater(camUnder);
  groundUniforms.uT.value = wt;
  // the camera goes under with you once you are properly down, and comes up as you surface
  if (player.swimming && player.depth > 0.7) follow.underwater = true;
  else if (!player.swimming || player.depth < 0.15) follow.underwater = false;
  input.inWater = player.swimming;
  const orbAt = orbPos.set(player.pos.x, player.pos.y + 1.22, player.pos.z);
  const inWater = player.swimming || camUnder;
  seaLife.update(wt, dt, player.pos, inWater, orbAt, camera.position, (innerHeight * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  fauna.update(wt, dt, player.pos, inWater, orbAt, S.reduced);
  guide.update(wt, dt, player.pos);
  presences.speaking = tp.playing ? 1 : 0;
  presences.update(wt, dt, player.pos, follow.yaw, follow.underwater);
  if (player.swimming && !wasSwimming) seaLife.bubbles(player.pos, 18); // into the water
  if (player.diving && Math.random() < dt * 0.6) seaLife.bubbles(player.pos, 1);
  wasSwimming = player.swimming;

  follow.update(dt, player.pos, player.heading, player.speed > 0.5, t, S.reduced, player.flying);
  // high in the air, the camera reaches farther (and keeps its depth precise)
  {
    const alt = Math.max(0, camera.position.y);
    const near = Math.max(0.15, alt * 0.0015), far = 6000 + alt * 3;
    if (Math.abs(camera.near - near) > near * 0.2 || Math.abs(camera.far - far) > far * 0.2) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }
  if (camUnder) {
    camera.updateMatrixWorld();
    underwater.follow(camera, wt, orbPos);
  }
  sky.position.copy(camera.position);
  starSource.position.copy(camera.position).addScaledVector(starDir, 900);
  camera.updateMatrixWorld();
  post.follow(starSource.position, innerWidth, innerHeight);
  gpuUniforms.player.value.copy(player.pos);
  gpuUniforms.dpr.value = dpr;
  gpuUniforms.px.value = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2); // CSS pixels per metre at 1 m
  glow.set(player.pos.x, S.mode === "intro" ? 0 : 1, player.pos.z);
  water.update(camera.position.x, camera.position.z, glow);
  skyUniforms.uT.value = wt;
  moods.update(player.pos, dt);
  if (genesis.active) genesisFrame(dt);
  // the sky's reflection is baked once: baking it again as the moods drifted (every few seconds
  // while travelling) hitched the frame on a phone and made the ground's sheen jump; the moods'
  // own lights (the hemisphere, the moon or sun, the fog) carry the change of colour
  moods.drift = 0;
  etchUniforms.uEtchT.value = wt;
  mandala.rotation.y = S.reduced ? 0 : wt * 0.01;
  center.set(camera.position.x, 0, camera.position.z);
  motes.update(wt, center, dpr, S.reduced);
  clouds.update(wt, camera.position);
  footprints.update(t);

  // The starlight's shadow follows the wanderer, and stays on the land below them when they fly
  // high (up there its small box hung in the air, and the ground beneath went dark and speckled).
  const below = Math.max(heightAt(player.pos.x, player.pos.z), WATER_Y);
  shadowAt.set(player.pos.x, Math.min(player.pos.y, below + 12), player.pos.z);
  star.target.position.copy(shadowAt);
  star.position.copy(shadowAt).addScaledVector(starDir, 60);

  saveTimer += dt;
  if (saveTimer > 4) {
    saveTimer = 0;
    persist();
  }
}

// Compile every shader before the first frame, behind the title, so the start isn't taken
// for slowness (and the first look at the world doesn't stutter).
let shadersReady = false;
quality.hold(12);

const shadowAt = new THREE.Vector3();

let last = performance.now();
let realDt = 0;
let frameDraws = 0; // draw calls of the last frame, taken right after it (for the readout)
function frame(now: number): void {
  requestAnimationFrame(frame);
  if (S.hidden) return;
  const ms = now - last;
  last = now;
  const dt = Math.min(0.05, ms / 1000);
  realDt = Math.min(1, ms / 1000);
  if (ms < 250 && stats.push(ms)) {
    if (S.mode !== "intro") quality.window(stats);
    if (showStats) $("#stats-text").textContent = readings();
  }
  update(dt);
  renderer.info.reset();
  water.renderMirror(renderer, scene, camera);
  post.render();
  frameDraws = renderer.info.render.drawCalls;
}
// WebGPU starts asynchronously (it asks the browser for the GPU); the world is built meanwhile.
renderer
  .init()
  .then(() => {
    nameRenderer();
    // if the phone takes the GPU away (memory pressure, a long time in the background), start
    // again where you were instead of freezing on an error
    renderer.onDeviceLost = () => {
      persist();
      if (document.hidden) addEventListener("visibilitychange", () => location.reload(), { once: true });
      else location.reload();
    };
    // nothing reflects the sky's picture (blurred, its stars and nebulae became blobs over the land)
    post.start();
    requestAnimationFrame(frame);
    return renderer.compileAsync(scene, camera);
  })
  .catch((e) => {
    console.error(e);
    showProblem(String(e?.message ?? e));
  })
  .finally(() => {
    shadersReady = true;
    quality.hold(3);
  });

Object.assign(window, { __ij: { player, follow, quality, audio, narration, playlist, scene, S, wanderer, lanterns, flowers, landmarks, creation, spirits, beings, startMap, arrive, places, heightAt, communion, creatures, sitting, setMed: (v: number) => { medK = v; stillFor = 99; }, vessels, tp, post, renderer, camera, THREE, moods, fauna, presences, guide, terrain, water, grass, seaLife, lightField, blooms, input, archiveHeard, wilds, genesis, beginGenesis } });
