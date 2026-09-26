/* The Inward Journey — an open world of night and light.
   Wander anywhere. The land answers as you pass: grass brightens along your path, flowers
   bloom and chime, lanterns kindle, butterflies follow, gliders drift overhead, and the old
   forms (beam, veil, garden, throne, arch, rings) stand as landmarks to wander toward.
   Narration plays in the background the whole time, one recording after another.
   States: intro (title over the night water) → play → rest (after Leave) → play … */
import * as THREE from "three";
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";
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
import { Communion } from "./world/communion";
import { Creatures } from "./world/creatures";
import { Vessels } from "./world/vessels";
import { TranscriptPlayer } from "./ui/transcriptPlayer";
import { StartMap, type Choice, type Place } from "./ui/map";
import { Reflection } from "./world/reflection";
import { buildSky, skyUniforms, starDirection } from "./world/sky";
import { groundUniforms, heightAt, SPAWN, Terrain, WATER_Y } from "./world/terrain";
import { Water } from "./world/water";
import { FOG, installFog } from "./world/fog";
import { N8AOPostPass } from "n8ao";

installFog(); // before any material is compiled

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

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
const canvas = $<HTMLCanvasElement>("#gl");
const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: "high-performance", antialias: false, stencil: false, depth: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // soft in this three.js (radius below)
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.15, 6000);
const FOG_COLOR = FOG.color;
scene.fog = new THREE.FogExp2(FOG_COLOR, FOG.density);

const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
composer.addPass(new RenderPass(scene, camera));
// Ambient occlusion: soft shadow where things meet (feet on the ground, rocks, trunks, steps),
// the cue that makes forms sit in the world. On the two higher quality levels.
const aoPass = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
aoPass.configuration.halfRes = true;
aoPass.configuration.aoRadius = 1.6;
aoPass.configuration.distanceFalloff = 1.0;
aoPass.configuration.intensity = 2.4;
aoPass.configuration.color = new THREE.Color("#0b0a1c");
aoPass.configuration.gammaCorrection = false;
aoPass.configuration.transparencyAware = false; // glows and glass stay out of it (and it stays cheap)
aoPass.setQualityMode(MOBILE ? "Performance" : "Low");
composer.addPass(aoPass);
// Under the surface: deep teal haze and wavering shafts of moonlight (only while the camera is under).
const underwater = new UnderwaterEffect();
const underwaterPass = new EffectPass(camera, underwater);
underwaterPass.enabled = false;
composer.addPass(underwaterPass);
// bloom with restraint: only what is truly bright glows (threshold near 1, gentle strength)
const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.88, luminanceSmoothing: 0.3, intensity: 0.7, radius: 0.7 });
const bloomPass = new EffectPass(camera, bloom, new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
const plainPass = new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
const finalPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM }), new VignetteEffect({ offset: 0.35, darkness: 0.5 }));
// The bright star, as a light source for god rays.
const starSource = new THREE.Mesh(
  new THREE.SphereGeometry(9, 16, 12),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.5), transparent: true, fog: false, depthWrite: false }),
);
starSource.frustumCulled = false;
const godRays = new GodRaysEffect(camera, starSource, {
  resolutionScale: 0.5, density: 0.9, decay: 0.95, weight: 0.35, exposure: 0.45, samples: 48, clampMax: 1.0, blur: true,
});
const raysPass = new EffectPass(camera, godRays);
composer.addPass(raysPass);
composer.addPass(bloomPass);
composer.addPass(plainPass);
composer.addPass(finalPass);

/* ============ WORLD ============ */
const starDir = starDirection();
skyUniforms.uStar.value.copy(starDir);
const sky = buildSky();
scene.add(sky);
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(buildSky());
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1100).texture;
  scene.environmentIntensity = 1.5;
  pmrem.dispose();
}

scene.add(new THREE.HemisphereLight(0x7a86d0, 0x221a36, 0.85));
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
water.uniforms.uFogColor.value.copy(FOG_COLOR);
water.uniforms.uFogDensity.value = (scene.fog as THREE.FogExp2).density;
scene.add(water.mesh);
const terrain = new Terrain();
scene.add(terrain.group);
const clouds = new Clouds(MOBILE ? 60 : 80);
scene.add(clouds.mesh);
const reflection = new Reflection();
water.uniforms.uRefl.value = reflection.target.texture;
water.uniforms.uReflMat.value = reflection.textureMatrix;

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
const butterflies = new Butterflies(flowers);
const gliders = new Gliders();
const landmarks = new Landmarks(scene, audio, wanderer);
// The archetypes themselves, each at home in its landmark.
const beings = new Beings(landmarks.list, sparks);
scene.add(beings.group);
void beings.load("models/wanderer.glb");
scene.add(sparks.points, grass.mesh, flowers.mesh, lanterns.points, butterflies.points, gliders.group);
// The whole creation: trees and their roots, rocks, crystals, spirits, and the light through them.
creationUniforms.uFogC.value.copy(FOG_COLOR);
creationUniforms.uFogD.value = (scene.fog as THREE.FogExp2).density;
creationUniforms.uStar.value.copy(starDir);
const creation = new Creation(sparks);
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

/* ============ QUALITY ============ */
let dpr = 1;
const quality: AdaptiveQuality = new AdaptiveQuality(applyTier);
function resize(): void {
  const w = innerWidth, h = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, quality.current.dpr);
  renderer.setPixelRatio(dpr);
  composer.setSize(w, h);
  reflection.setSize(w * Math.min(dpr, 1.5), h * Math.min(dpr, 1.5)); // the lakes' mirror needn't be as sharp as the world
  camera.aspect = w / h;
  camera.fov = h > w ? 66 : 55;
  camera.updateProjectionMatrix();
}
/** What the quality tier allows; under the water, ambient occlusion and god rays rest. */
const tierFx = { rays: true, ao: true };
function applyTier(t: Tier, i: number = quality.tier): void {
  tierFx.rays = t.rays;
  tierFx.ao = t.ao;
  raysPass.enabled = tierFx.rays;
  aoPass.enabled = tierFx.ao;
  reflection.enabled = t.reflection; // mirrored world in the lakes
  water.uniforms.uReflOn.value = reflection.enabled ? 1 : 0;
  wanderer.setQuality([48, 48, 40, 32, 24][i] ?? 32); // ray-march steps for the fluid body
  bloomPass.enabled = t.bloom;
  plainPass.enabled = !t.bloom;
  const sh = star.shadow;
  if (sh.mapSize.x !== t.shadow) {
    sh.mapSize.set(t.shadow, t.shadow);
    sh.map?.dispose();
    sh.map = null;
  }
  motes.setCount(Math.round(t.particles / 2));
  creation.setQuality(Math.max(0, i - 1));
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
  narration.subtitlesOn = saved.settings?.subtitles ?? true;
  playlist.on = saved.settings?.narration ?? true;
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
    settings: { volume: audio.volume, reduced: S.reducedPref, subtitles: narration.subtitlesOn, narration: playlist.on, awake: awake.on },
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
  if (wanderer.gesture !== "none") wanderer.setGesture("none");
  if (player.swimming) {
    player.stroke();
    seaLife.bubbles(player.pos, 10);
  } else player.jump();
};
input.onTap = (x, y) => {
  if (S.mode !== "play") return;
  // an orb or a fruit under the tap: its narration begins (never by itself)
  const v = vessels.pick(x, y, camera);
  if (v) {
    playArchive(v.narration);
    return;
  }
  if (sitting.phase === "seated") return;
  const p = groundPoint(x, y);
  if (!p) return;
  player.target = new THREE.Vector2(p.x, p.z);
  if (p.y <= WATER_Y + 0.05) water.ripple(p.x, p.z, 0.6, S.t);
  else footprints.place(p.x, p.y, p.z, player.heading, S.t);
};
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
  const you = saved ? { x: saved.pos[0], z: saved.pos[2], heading: saved.heading } : null;
  void startMap.open(places(), you, false, !!you).then((c) => c && arrive(c, true));
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
  if (MOBILE) $("#act").hidden = $("#joy").hidden = false;
  say(`You wake near ${c.place.label.replace(/^The /, "the ")}. Wander anywhere; the land answers as you pass.`);
  window.setTimeout(() => whisper(MOBILE ? "Tap where you want to go, or use the stick" : "Click where you want to go, or use W A S D", 6500), 4000);
  window.setTimeout(() => whisper(MOBILE ? "Hold the round button to fly; let go to drift down" : "Hold Space to fly; let go to drift down", 6000), 26000);
  window.setTimeout(() => whisper(MOBILE ? "Push the stick to its edge to run" : "Hold Shift to run", 6000), 50000);
}
$("#begin").addEventListener("click", begin);
const startMap = new StartMap();
// Meeting an archetype: it greets you, and its voice begins (the Threshold).
beings.onMeet = (a) => {
  playlist.meet(a.narration);
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

/* ---- The archive's narrations: started only by the player, one quiet bar, never a modal ---- */
const tp = new TranscriptPlayer(audio);
function playArchive(n: Parameters<TranscriptPlayer["play"]>[0]): void {
  narration.stop(1.5); // the journey's voice or an archetype's answer makes way
  playlist.held = true;
  void tp.play(n);
  say(`Playing: ${n.title}. ${TranscriptPlayer.caption(n).join(". ")}.`);
}
tp.onChange = (id) => {
  vessels.setPlaying(id);
  if (id) archiveHeard.add(id);
};
tp.onChoose = (background) => {
  playlist.setOn(background);
  voiceBox.checked = background;
  persist();
};
const releaseHold = () => {
  if (!tp.active) playlist.held = false;
};
for (const id of ["#tp-close", "#tp-more", "#tp-music"]) $(id).addEventListener("click", () => window.setTimeout(releaseHold, 0));
$("#about-open").addEventListener("click", () => {
  setMenu(false);
  $("#about").hidden = false;
  $<HTMLButtonElement>("#about-close").focus();
});
$("#about-close").addEventListener("click", () => ($("#about").hidden = true));

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
menuBtn.addEventListener("click", () => setMenu(menu.hidden));
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
voiceBox.addEventListener("change", () => {
  playlist.setOn(voiceBox.checked);
  persist();
});
const awakeBox = $<HTMLInputElement>("#awake");
awakeBox.checked = awake.on;
awakeBox.addEventListener("change", () => {
  awake.set(awakeBox.checked);
  persist();
});
const subsBox = $<HTMLInputElement>("#subs");
subsBox.checked = narration.subtitlesOn;
subsBox.addEventListener("change", () => {
  narration.subtitlesOn = subsBox.checked;
  if (!subsBox.checked) narration.hideSub();
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
  audio.fade(false);
  $("#rest").hidden = false;
  for (const id of ["#act", "#ctx", "#joy"]) $(id).hidden = true;
  $("#menu-btn").hidden = true;
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
  if (MOBILE || input.touchUsed) $("#act").hidden = $("#joy").hidden = false;
});

/* ============ READINGS (#stats) ============ */
const stats = new FrameStats();
const showStats = location.hash === "#stats";
$("#stats").hidden = !showStats;
function readings(): string {
  const ri = renderer.info.render;
  return [
    `fps ${stats.fps.toFixed(1)} · avg ${stats.avgMs.toFixed(1)} ms · worst ${stats.worstMs.toFixed(0)} ms`,
    `${quality.current.name} · dpr ${dpr}/${devicePixelRatio} · ${ri.calls} draws · ${(ri.triangles / 1000).toFixed(0)}k tris`,
    `audio ${audio.ctx?.state ?? "off"} · session ${audio.sessionType} · voice ${narration.current ?? "-"}`,
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
    player.update(dt, { ...input.move, glide: input.boost, hold: input.hold, down: input.descend, pitch: follow.pitch }, follow.yaw);
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
    playlist.update(dt);
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
    lanterns.update(life);
    butterflies.update(life);
  }
  gliders.update(life);
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
  underwaterPass.enabled = camUnder;
  raysPass.enabled = tierFx.rays && !camUnder;
  aoPass.enabled = tierFx.ao && !camUnder;
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
  if (player.swimming && !wasSwimming) seaLife.bubbles(player.pos, 18); // into the water
  if (player.diving && Math.random() < dt * 0.6) seaLife.bubbles(player.pos, 1);
  wasSwimming = player.swimming;

  follow.update(dt, player.pos, player.heading, player.speed > 0.5, t, S.reduced);
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
  glow.set(player.pos.x, S.mode === "intro" ? 0 : 1, player.pos.z);
  water.update(camera.position.x, camera.position.z, glow);
  skyUniforms.uT.value = wt;
  etchUniforms.uEtchT.value = wt;
  mandala.rotation.y = S.reduced ? 0 : wt * 0.01;
  center.set(camera.position.x, 0, camera.position.z);
  motes.update(wt, center, dpr, S.reduced);
  clouds.update(wt, camera.position);
  footprints.update(t);

  // The starlight's shadow follows the wanderer.
  star.target.position.copy(player.pos);
  star.position.copy(player.pos).addScaledVector(starDir, 60);

  saveTimer += dt;
  if (saveTimer > 4) {
    saveTimer = 0;
    persist();
  }
}

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  if (S.hidden) return;
  const ms = now - last;
  last = now;
  const dt = Math.min(0.05, ms / 1000);
  if (ms < 250 && stats.push(ms)) {
    if (S.mode !== "intro") quality.window(stats);
    if (showStats) $("#stats-text").textContent = readings();
  }
  update(dt);
  renderer.info.reset();
  // (The shadow map must exist first: it is created by the main render.)
  if (star.shadow.map && camera.position.y > WATER_Y) reflection.render(renderer, scene, camera, [water.mesh, sky, starSource, grass.mesh, ...creation.noReflect]);
  composer.render(dt);
}
requestAnimationFrame(frame);

Object.assign(window, { __ij: { player, follow, quality, audio, narration, playlist, scene, S, wanderer, lanterns, flowers, landmarks, creation, spirits, beings, startMap, arrive, places, heightAt, communion, creatures, sitting, setMed: (v: number) => { medK = v; stillFor = 99; }, vessels, tp, aoPass, composer, underwaterPass, fauna, reflection, terrain, water, grass, seaLife, raysPass } });
