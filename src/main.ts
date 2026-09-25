/* Inward Journey — phase 1: the walking prototype.
   The lake at first light, the wanderer, the camera, the three islands on the horizon.
   States: intro (title over the lake) → play → rest (after Leave) → play … */
import * as THREE from "three";
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";
import { AudioEngine } from "./core/audio";
import { Input } from "./core/input";
import { AdaptiveQuality, FrameStats, MOBILE, type Tier } from "./core/quality";
import { load, save, type SaveData } from "./core/save";
import { FollowCamera } from "./player/camera";
import { Controller } from "./player/controller";
import { Footprints } from "./player/footprints";
import { Wanderer } from "./player/wanderer";
import { buildMandala, etchUniforms } from "./world/etching";
import { buildIslands } from "./world/islands";
import { Motes } from "./world/motes";
import { buildSky, skyUniforms, sunDirection } from "./world/sky";
import { buildTerrain, heightAt, ISLANDS, islandWeights, WATER_Y } from "./world/terrain";
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
  dawn: 0,
  attuned: [] as number[],
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
const FOG_COLOR = new THREE.Color(0.84, 0.56, 0.52);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0065);

const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
composer.addPass(new RenderPass(scene, camera));
const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.85, luminanceSmoothing: 0.2, intensity: 0.9, radius: 0.7 });
const bloomPass = new EffectPass(camera, bloom, new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
const plainPass = new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
const finalPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM }), new VignetteEffect({ offset: 0.35, darkness: 0.45 }));
composer.addPass(bloomPass);
composer.addPass(plainPass);
composer.addPass(finalPass);

/* ============ WORLD ============ */
const sunDir = sunDirection(S.dawn);
skyUniforms.uSun.value.copy(sunDir);
skyUniforms.uDawn.value = S.dawn;
const sky = buildSky();
scene.add(sky);

// Environment light for metal and mirrors comes from the sky itself.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(buildSky());
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1100).texture;
  scene.environmentIntensity = 0.6;
  pmrem.dispose();
}

scene.add(new THREE.HemisphereLight(0xc9b4dc, 0x5a4a48, 1.15));
const sun = new THREE.DirectionalLight(0xffc896, 2.2);
sun.castShadow = true;
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

const water = new Water();
water.uniforms.uFogColor.value.copy(FOG_COLOR);
water.uniforms.uFogDensity.value = (scene.fog as THREE.FogExp2).density;
scene.add(water.mesh);
buildTerrain(scene);
const animated = buildIslands(scene);
const mandala = buildMandala();
scene.add(mandala);
const motes = new Motes(600);
scene.add(motes.points);

const wanderer = new Wanderer();
scene.add(wanderer.root);
const player = new Controller();
const footprints = new Footprints();
scene.add(footprints.mesh);
const follow = new FollowCamera(camera);

/* ============ QUALITY ============ */
let dpr = 1;
const quality = new AdaptiveQuality(applyTier);
function resize(): void {
  const w = innerWidth, h = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, quality.current.dpr);
  renderer.setPixelRatio(dpr);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = h > w ? 66 : 55;
  camera.updateProjectionMatrix();
}
function applyTier(t: Tier): void {
  bloomPass.enabled = t.bloom;
  plainPass.enabled = !t.bloom;
  const sh = sun.shadow;
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

/* ============ SAVE ============ */
const saved = load();
if (saved) {
  const [x, y, z] = saved.pos;
  player.pos.set(x, Math.max(y, heightAt(x, z)), z);
  player.heading = saved.heading;
  S.attuned = saved.attuned ?? [];
  S.reducedPref = saved.settings?.reduced ?? null;
}
const audio = new AudioEngine();
if (saved) audio.volume = saved.settings?.volume ?? 0.8;
function persist(): void {
  if (S.mode === "intro") return;
  const d: SaveData = {
    v: 1,
    pos: [player.pos.x, player.pos.y, player.pos.z],
    heading: player.heading,
    attuned: S.attuned,
    settings: { volume: audio.volume, reduced: S.reducedPref },
  };
  save(d);
}
follow.yaw = player.heading;
follow.snapTo(player.pos);

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
player.onLand = () => {
  // Both feet touch down together.
  const y = Math.max(heightAt(player.pos.x, player.pos.z), WATER_Y);
  footprints.place(player.pos.x - 0.1, y, player.pos.z, player.heading, S.t);
  footprints.place(player.pos.x + 0.1, y, player.pos.z, player.heading, S.t);
  audio.step(false);
};

function begin(e?: Event): void {
  if (S.mode !== "intro") return;
  // Sound starts inside this touch (iOS requirement).
  audio.start();
  audio.bell(659.25, 0.07, 6);
  window.setTimeout(() => audio.bell(987.77, 0.045, 7), 350);
  // The touch lands on the water as a ripple.
  const pt = e instanceof PointerEvent || e instanceof MouseEvent ? groundPoint(e.clientX, e.clientY) : null;
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
  say("The lake at first light. You stand on a stone platform. Three islands rise from the water: Mind ahead to the left, Body ahead to the right, Spirit behind you.");
  window.setTimeout(() => {
    whisper(MOBILE ? "Touch and drag on the left to walk" : "W A S D to walk · drag to look · Shift to glide", 6500);
  }, 5500);
}
$("#begin").addEventListener("click", begin);

function groundPoint(cx: number, cy: number): THREE.Vector3 | null {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  const hit = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? hit : null;
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
    `audio ${audio.ctx?.state ?? "off"} · session ${audio.sessionType}`,
    `pos ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)} · ${player.pose}`,
  ].join("\n");
}

/* ============ LOOP ============ */
const seen = new Set<string>();
let lastPrint = 0;
let printSide = 1;
let lastStroke = 0;
let saveTimer = 0;
const center = new THREE.Vector3();

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
  wanderer.animate(dt, player.pose, player.speed, t, S.reduced);

  // Footprints on land, rings on water.
  if (S.mode === "play") {
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
  }

  // Island closeness drives the sound, and names the island once when you arrive.
  const w = islandWeights(player.pos.x, player.pos.z);
  const near = Math.max(w.mind, w.body, w.spirit);
  audio.setZones({ hub: 1 - near * 0.8, mind: w.mind, body: w.body, spirit: w.spirit });
  for (const isl of ISLANDS) {
    if (S.mode === "play" && w[isl.kind] > 0.75 && !seen.has(isl.kind)) {
      seen.add(isl.kind);
      whisper(isl.name, 4500);
      say(isl.name);
    }
  }

  follow.update(dt, player.pos, player.heading, player.speed > 0.5, t, S.reduced);
  sky.position.copy(camera.position);
  water.update(t, camera.position.x, camera.position.z);
  skyUniforms.uT.value = t;
  etchUniforms.uEtchT.value = t;
  for (const a of animated) a.update(t, S.reduced);
  mandala.rotation.y = S.reduced ? 0 : t * 0.01;
  mandala.scale.setScalar(1 + (S.reduced ? 0 : Math.sin(t * 0.63) * 0.004));
  center.set(camera.position.x, 0, camera.position.z);
  motes.update(t, center, dpr, S.reduced);
  footprints.update(t);

  // The sun's shadow follows the wanderer.
  sun.target.position.copy(player.pos);
  sun.position.copy(player.pos).addScaledVector(sunDir, 60);

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

Object.assign(window, { __ij: { player, follow, quality, audio, scene } });
