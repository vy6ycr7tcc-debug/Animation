/* The Inward Journey — milestone 1: the shore, the swim, arrival on the island.
   States: intro (title over the night water) → play → rest (after Leave) → play …
   Story beats: J01 on waking, J02 on the first swim, J03 on stepping onto the island. */
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
import { AdaptiveQuality, FrameStats, MOBILE, type Tier } from "./core/quality";
import { load, save, type SaveData } from "./core/save";
import { FollowCamera } from "./player/camera";
import { Controller } from "./player/controller";
import { Footprints } from "./player/footprints";
import { Wanderer } from "./player/wanderer";
import { buildMandala, etchUniforms } from "./world/etching";
import { IslandLights } from "./world/island";
import { Motes } from "./world/motes";
import { buildSky, skyUniforms, starDirection } from "./world/sky";
import { buildTerrain, heightAt, ISLAND, onIsland, smooth, SPAWN, WATER_Y } from "./world/terrain";
import { Water } from "./world/water";

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
  heard: new Set<string>(),
  visited: [] as number[],
};

/* ============ RENDERER ============ */
const canvas = $<HTMLCanvasElement>("#gl");
const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: "high-performance", antialias: false, stencil: false, depth: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1500);
const FOG_COLOR = new THREE.Color(0.035, 0.03, 0.085);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0058);

const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
composer.addPass(new RenderPass(scene, camera));
const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.6, luminanceSmoothing: 0.25, intensity: 1.1, radius: 0.75 });
const bloomPass = new EffectPass(camera, bloom, new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
const plainPass = new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
const finalPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM }), new VignetteEffect({ offset: 0.35, darkness: 0.5 }));
// The bright star, as a light source for god rays that fan around the island's silhouette.
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

// Environment light for anything metallic comes from the night sky itself.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(buildSky());
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1100).texture;
  scene.environmentIntensity = 1.5;
  pmrem.dispose();
}

scene.add(new THREE.HemisphereLight(0x5a5aa8, 0x141024, 0.9));
// Starlight: faint and warm, from the bright star over the island. It casts the wanderer's shadow.
const star = new THREE.DirectionalLight(0xffd9a8, 0.55);
star.castShadow = true;
star.shadow.camera.left = -14;
star.shadow.camera.right = 14;
star.shadow.camera.top = 14;
star.shadow.camera.bottom = -14;
star.shadow.camera.near = 1;
star.shadow.camera.far = 140;
star.shadow.bias = -0.0005;
star.shadow.normalBias = 0.04;
scene.add(star, star.target, starSource);

const water = new Water();
water.uniforms.uFogColor.value.copy(FOG_COLOR);
water.uniforms.uFogDensity.value = (scene.fog as THREE.FogExp2).density;
scene.add(water.mesh);
buildTerrain(scene);
const islandLights = new IslandLights();
scene.add(islandLights.group);

// A flat stone where the wanderer wakes, etched with the seven-fold figure.
const spawnY = heightAt(SPAWN.x, SPAWN.z);
const slab = new THREE.Mesh(
  new THREE.CylinderGeometry(3.3, 3.5, 0.5, 48),
  new THREE.MeshStandardMaterial({ color: "#2a2740", roughness: 0.9 }),
);
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

/* ============ QUALITY ============ */
let dpr = 1;
const quality: AdaptiveQuality = new AdaptiveQuality(applyTier);
function resize(): void {
  const w = innerWidth, h = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, quality.current.dpr);
  renderer.setPixelRatio(dpr);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = h > w ? 66 : 55;
  camera.updateProjectionMatrix();
}
function applyTier(t: Tier, i: number = quality.tier): void {
  raysPass.enabled = i <= 1; // god rays on the two higher tiers only
  bloomPass.enabled = t.bloom;
  plainPass.enabled = !t.bloom;
  const sh = star.shadow;
  if (sh.mapSize.x !== t.shadow) {
    sh.mapSize.set(t.shadow, t.shadow);
    sh.map?.dispose();
    sh.map = null;
  }
  motes.setCount(Math.round(t.particles / 2));
  resize();
}
applyTier(quality.current);
addEventListener("resize", resize);

/* ============ AUDIO + SAVE ============ */
const audio = new AudioEngine("audio/water-bed.mp3");
const narration = new Narration(audio, $("#sub"));
narration.preload(["J01", "J02", "J03"]);

const saved = load();
if (saved) {
  const [x, y, z] = saved.pos;
  player.pos.set(x, Math.max(y, heightAt(x, z)), z);
  player.heading = saved.heading;
  saved.heard?.forEach((id) => S.heard.add(id));
  S.visited = saved.visited ?? [];
  S.reducedPref = saved.settings?.reduced ?? null;
  audio.volume = saved.settings?.volume ?? 0.8;
  narration.subtitlesOn = saved.settings?.subtitles ?? true;
}
function persist(): void {
  if (S.mode === "intro") return;
  const d: SaveData = {
    v: 1,
    pos: [player.pos.x, player.pos.y, player.pos.z],
    heading: player.heading,
    heard: [...S.heard],
    visited: S.visited,
    settings: { volume: audio.volume, reduced: S.reducedPref, subtitles: narration.subtitlesOn },
  };
  save(d);
}
follow.yaw = player.heading;
follow.snapTo(player.pos);

/** Play a story narration once. */
function beat(id: string): void {
  if (S.heard.has(id)) return;
  S.heard.add(id);
  narration.play(id);
  persist();
}

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

const input = new Input($("#surface"), $("#joy"), $("#knob"), $("#act"));
input.onAction = () => player.jump();
input.onTap = (x, y) => {
  if (S.mode !== "play") return;
  const p = groundPoint(x, y);
  if (!p) return;
  player.target = new THREE.Vector2(p.x, p.z);
  // A small mark where you tapped: a ring on water, a print on sand.
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

function begin(e?: Event): void {
  if (S.mode !== "intro") return;
  // Sound starts inside this touch (iOS requirement).
  audio.start();
  audio.bell(587.33, 0.05, 6);
  const pt = e instanceof MouseEvent ? groundPoint(e.clientX, e.clientY) : null;
  const rp = pt ?? new THREE.Vector3(0, 0, 10);
  water.ripple(rp.x, rp.z, 1.4, S.t);
  S.mode = "play";
  $("#title").classList.add("gone");
  $("#begin").hidden = true;
  $("#menu-btn").hidden = false;
  if (MOBILE) $("#act").hidden = false;
  input.enabled = true;
  follow.startFollowing();
  wanderer.setForm(0);
  say("A night shore. Dark water ahead, and far off, an island under a bright star.");
  // The first narration begins as the wanderer gathers out of light.
  window.setTimeout(() => beat("J01"), 2200);
  if (!S.heard.has("J01")) {
    window.setTimeout(() => whisper(MOBILE ? "Tap where you want to go, or drag on the left" : "Click where you want to go, or use W A S D", 6500), 9000);
  }
}
$("#begin").addEventListener("click", begin);

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
      // refine between the last two samples
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
  $("#act").hidden = true;
  $("#menu-btn").hidden = true;
  $<HTMLButtonElement>("#return").focus();
  say("Your place is kept.");
});
$("#return").addEventListener("click", () => {
  audio.start();
  audio.fade(true);
  S.mode = "play";
  input.enabled = true;
  $("#rest").hidden = true;
  $("#menu-btn").hidden = false;
  if (MOBILE || input.touchUsed) $("#act").hidden = false;
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
    `pos ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)} · ${player.pose}`,
  ].join("\n");
}

/* ============ LOOP ============ */
let lastPrint = 0;
let printSide = 1;
let lastStroke = 0;
let saveTimer = 0;
const center = new THREE.Vector3();
const glow = new THREE.Vector3();

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

  if (S.mode === "play") player.update(dt, { ...input.move, glide: input.glide }, follow.yaw);
  wanderer.root.position.copy(player.pos);
  wanderer.root.rotation.y = player.heading;
  wanderer.root.visible = S.mode !== "intro";
  wanderer.animate(dt, player.pose, player.speed, t, S.reduced, dpr);
  wanderer.fx.visible = wanderer.root.visible;

  if (S.mode === "play") {
    // Footprints on sand, rings on water.
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
    // Story beats.
    if (player.swimming) beat("J02");
    if (!player.swimming && player.grounded && onIsland(player.pos.x, player.pos.z)) {
      if (!S.heard.has("J03")) {
        whisper("", 10);
        say("You step onto the island.");
      }
      beat("J03");
    }
  }
  narration.update();

  // The island's lights appear once you are about halfway across.
  const dIsland = Math.hypot(player.pos.x - ISLAND.x, player.pos.z - ISLAND.z);
  const seen = smooth(135, 95, dIsland);
  islandLights.update(t, seen, S.reduced);

  follow.update(dt, player.pos, player.heading, player.speed > 0.5, t, S.reduced);
  sky.position.copy(camera.position);
  starSource.position.copy(camera.position).addScaledVector(starDir, 900);
  glow.set(player.pos.x, S.mode === "intro" ? 0 : 1, player.pos.z);
  water.update(camera.position.x, camera.position.z, glow);
  skyUniforms.uT.value = t;
  etchUniforms.uEtchT.value = t;
  mandala.rotation.y = S.reduced ? 0 : t * 0.01;
  center.set(camera.position.x, 0, camera.position.z);
  motes.update(t, center, dpr, S.reduced);
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
  composer.render(dt);
}
requestAnimationFrame(frame);

Object.assign(window, { __ij: { player, follow, quality, audio, narration, scene, S } });
