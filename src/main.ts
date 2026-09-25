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
import { promptsFor, registerAnswers, trackId } from "./core/dialogues";
import { AdaptiveQuality, FrameStats, MOBILE, type Tier } from "./core/quality";
import { clear, load, save, type SaveData } from "./core/save";
import { FollowCamera } from "./player/camera";
import { Controller } from "./player/controller";
import { Footprints } from "./player/footprints";
import { Wanderer } from "./player/wanderer";
import { Clouds } from "./world/atmosphere";
import { buildMandala, etchedStone, etchUniforms } from "./world/etching";
import { Landmarks } from "./world/landmarks";
import { Butterflies, Flowers, Gliders, Lanterns, LightGrass, Sparks, type LifeFrame } from "./world/life";
import { Motes } from "./world/motes";
import { Creation, creationUniforms, Spirits } from "./world/creation";
import { Beings } from "./world/beings";
import { StartMap, type Choice, type Place } from "./ui/map";
import { Reflection } from "./world/reflection";
import { buildSky, skyUniforms, starDirection } from "./world/sky";
import { heightAt, SPAWN, Terrain, WATER_Y } from "./world/terrain";
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
const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.6, luminanceSmoothing: 0.25, intensity: 1.15, radius: 0.75 });
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
  reflection.setSize(w * dpr, h * dpr);
  camera.aspect = w / h;
  camera.fov = h > w ? 66 : 55;
  camera.updateProjectionMatrix();
}
function applyTier(t: Tier, i: number = quality.tier): void {
  raysPass.enabled = i <= 1; // god rays on the two higher tiers only
  aoPass.enabled = i <= 1;
  reflection.enabled = i <= 1; // mirrored world in the lakes
  water.uniforms.uReflOn.value = reflection.enabled ? 1 : 0;
  wanderer.setQuality([48, 40, 32, 24][i] ?? 32); // ray-march steps for the fluid body
  bloomPass.enabled = t.bloom;
  plainPass.enabled = !t.bloom;
  const sh = star.shadow;
  if (sh.mapSize.x !== t.shadow) {
    sh.mapSize.set(t.shadow, t.shadow);
    sh.map?.dispose();
    sh.map = null;
  }
  motes.setCount(Math.round(t.particles / 2));
  creation.setQuality(i);
  resize();
}
applyTier(quality.current);
addEventListener("resize", resize);

/* ============ SAVE ============ */
const saved = load();
if (saved) {
  const [x, y, z] = saved.pos;
  player.pos.set(x, Math.max(y, heightAt(x, z)), z);
  player.heading = saved.heading;
  S.reducedPref = saved.settings?.reduced ?? null;
  audio.volume = saved.settings?.volume ?? 0.8;
  narration.subtitlesOn = saved.settings?.subtitles ?? true;
  playlist.on = saved.settings?.narration ?? true;
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
    settings: { volume: audio.volume, reduced: S.reducedPref, subtitles: narration.subtitlesOn, narration: playlist.on },
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

const input = new Input($("#surface"), $("#joy"), $("#knob"), $("#act"), $("#run"), $("#fly"), $("#down"));
// no long-press menus or text selection anywhere in the game
addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("selectstart", (e) => {
  if (!(e.target as HTMLElement)?.closest?.("input, textarea")) e.preventDefault();
});
input.onFly = () => {
  standUp();
  player.toggleFly();
  whisper(player.flying ? (MOBILE ? "Hold the round button to rise, Down to sink" : "Hold Space to rise, C to sink") : "Gliding down", 3500);
};
input.onAction = () => {
  if (wanderer.gesture !== "none") wanderer.setGesture("none");
  player.jump();
};
input.onTap = (x, y) => {
  if (S.mode !== "play" || sitting.phase === "seated") return;
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
  void startMap.open(places(), saved ? { x: saved.pos[0], z: saved.pos[2] } : null, false).then((c) => c && arrive(c, true));
}

/** The places on the map: the shore, and the seven archetypes' homes. */
function places(): Place[] {
  return [
    { numeral: "", label: "The shore", x: SPAWN.x, z: SPAWN.z, narration: "J01", start: { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading } },
    ...beings.list.map((b, i) => ({
      numeral: b.spec.numeral,
      label: b.spec.name,
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
  follow.yaw = c.heading;
  follow.snapTo(player.pos);
  follow.startFollowing(true);
  wanderer.setForm(0);
  wanderer.setGesture("none");
  beings.reset();
  playlist.startWith(c.place.narration);
  input.enabled = true;
  S.mode = "play";
  persist();
  if (!first) return;
  $("#menu-btn").hidden = false;
  if (MOBILE) for (const id of ["#act", "#run", "#fly"]) $(id).hidden = false;
  say(`You wake near ${c.place.label.replace(/^The /, "the ")}. Wander anywhere; the land answers as you pass.`);
  window.setTimeout(() => whisper(MOBILE ? "Tap where you want to go, or drag on the left" : "Click where you want to go, or use W A S D", 6500), 4000);
  window.setTimeout(() => whisper(MOBILE ? "Hold Run to run; run off a slope to glide" : "Hold Shift to run; run off a slope to glide", 6000), 26000);
  window.setTimeout(() => whisper(MOBILE ? "Tap Fly to take to the air" : "Press F to fly", 6000), 50000);
}
$("#begin").addEventListener("click", begin);
const startMap = new StartMap();
// Meeting an archetype: it greets you, and its voice begins.
beings.onMeet = (a) => {
  playlist.meet(a.narration);
  whisper(`${a.numeral} · ${a.name}`, 5000);
  say(`${a.name} turns toward you.`);
};
/* ---- Sitting with an archetype: ask it something, rest in silence, offer light ---- */
const sitting = { being: -1, phase: "none" as "none" | "walking" | "seated", x: 0, z: 0, heading: 0, rise: 0 };
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
      stillness(false);
      b.greet();
      void narration.play(trackId(b.spec.numeral, p.id));
    });
    box.append(btn);
  }
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

/** Each frame: offer a seat near a being, walk to it, and keep the sitting in step. */
function updateSitting(dt: number): void {
  const n = beings.nearest(player.pos);
  sitOffer.hidden = !(S.mode === "play" && sitting.phase === "none" && n.i >= 0 && n.d < 6.5 && !startMap.isOpen);
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
  beings.list.forEach((b) => (b.speaking = narration.current?.startsWith(`A-${b.spec.numeral}-`) ? 1 : 0));
}

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
  setMenu(false);
  S.mode = "rest";
  input.enabled = false;
  narration.stop(2);
  audio.fade(false);
  $("#rest").hidden = false;
  for (const id of ["#act", "#run", "#fly", "#down"]) $(id).hidden = true;
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
  audio.start();
  audio.fade(true);
  S.mode = "play";
  input.enabled = true;
  $("#rest").hidden = true;
  $("#menu-btn").hidden = false;
  if (MOBILE || input.touchUsed) for (const id of ["#act", "#run", "#fly"]) $(id).hidden = false;
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
    player.update(dt, { ...input.move, glide: input.boost, hold: input.hold, down: input.descend }, follow.yaw);
    $("#fly").setAttribute("aria-pressed", String(player.flying));
    $("#down").hidden = !(MOBILE && player.flying);
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
    if (player.swimming && player.odometer - lastStroke > 1.1) {
      lastStroke = player.odometer;
      water.ripple(player.pos.x, player.pos.z, 0.8, t);
      audio.step(true);
    }
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

  follow.update(dt, player.pos, player.heading, player.speed > 0.5, t, S.reduced);
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
  if (star.shadow.map) reflection.render(renderer, scene, camera, [water.mesh, sky, starSource, grass.mesh, ...creation.noReflect]);
  composer.render(dt);
}
requestAnimationFrame(frame);

Object.assign(window, { __ij: { player, follow, quality, audio, narration, playlist, scene, S, wanderer, lanterns, flowers, landmarks, creation, spirits, beings, startMap, arrive, places } });
