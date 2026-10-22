/* Inland — an open world of night and light.
   Wander anywhere. The land answers as you pass: grass brightens along your path, flowers
   bloom and chime, lanterns kindle, and the old
   forms (beam, veil, garden, throne, arch, rings) stand as landmarks to wander toward.
   Narration plays in the background the whole time, one recording after another.
   States: intro (title over the night water) → play → rest (after Leave) → play … */
import { FILM, SIM } from "./debug/filmClock"; // first: in film mode it seeds Math.random and (fast capture) owns time
import { KeyHints } from "./ui/keyHints";
import { solidity } from "./world/solidity";
import { setShadowSize } from "./gpu/lightRig";
import { loadFailed } from "./core/assets";
import { EgyptGate } from "./world/egyptGate";
import { CUES, FINALE_T, TRACK_ID as TEMPLE_TRACK } from "./scenes/templeTour";
import "./gpu/compat";
import { registerSW } from "virtual:pwa-register";
import * as THREE from "three/webgpu";
import { AudioEngine } from "./core/audio";
import { Input } from "./core/input";
import { Narration } from "./core/narration";
import { Playlist } from "./core/playlist";
import { RITES, SYNTHESES } from "./world/rites";
import { SIGNATURES } from "./player/gestures";
import { heartId, passageId, promptsFor, registerAnswers, registerTunnel, SPECTRUM, trackId, walkId } from "./core/dialogues";
import { Awake } from "./core/awake";
import { AdaptiveQuality, FrameStats, loadQualityConfig, MOBILE, type Tier } from "./core/quality";
import { clear, load, save, type SaveData } from "./core/save";
import { FollowCamera } from "./player/camera";
import { Controller } from "./player/controller";
import { GoldSphere, ReachLine } from "./player/goldSphere";
import { Wanderer } from "./player/wanderer";
import { Clouds } from "./world/atmosphere";
import { buildMandala, etchedStone, etchUniforms, vibeUniforms } from "./world/etching";
import { Landmarks } from "./world/landmarks";
import { Flowers, Lanterns, LightGrass, Sparks, type LifeFrame } from "./world/life";
import { Motes } from "./world/motes";
import { Risers } from "./world/risers";
import { GroundCover } from "./world/groundCover";
import { Weather } from "./world/weather";
import { cloudUniforms } from "./world/atmosphere";
import { wakeStep } from "./gpu/wake";
import { Creation, creationUniforms } from "./world/creation";
import { Beings, type BeingModel } from "./world/beings";
import { SeaFauna, SeaLife, UnderwaterEffect } from "./world/underwater";
import { Post } from "./gpu/post";
import { T, fogUniforms, gpuUniforms, gradeUniforms, ijFogNode } from "./gpu/tsl";
import { newerBuild, reloadTo } from "./core/fresh";
import { Presences } from "./world/presences";
import { Guide, type Destination } from "./world/guide";
import { NextUp } from "./ui/nextUp";
import { VEIL_TRACK } from "./scenes/afterVeil/area";
import { WANDERER_TRACK } from "./scenes/wanderer/area";
import { SITES } from "./scenes/sites";
import { ARCHIVE, GROVE_SITES, ORB_SITES } from "./world/sites";
import { Communion } from "./world/communion";
import { Creatures } from "./world/creatures";
import { SpiritHorses } from "./world/spiritHorses";
import { SpiritCritters } from "./world/spiritCritters";
import { Readables, type Reading } from "./world/readables";
import { Reader } from "./ui/reader";
import { Heart, heartNotes, keepToItself } from "./ui/heart";
import { Oracle, type Lens } from "./ui/oracle";
import { Install, buildIntro, isStandalone } from "./ui/intro";
import { StationGlow } from "./world/stationGlow";
import { OracleVision } from "./world/oracleVision";
import { allVoices, chosenVoice, onSpeechFail, onSpeechStart, readAloud, sayAloud, setReadAloud, setVoice, speak, speechButton, tierOf, wakeSpeech } from "./ui/speak";
import { Vessels } from "./world/vessels";
import { TranscriptPlayer } from "./ui/transcriptPlayer";
import { tourBar, type TourBarOwner } from "./ui/tourBar";
import { StartMap, type Choice, type Place } from "./ui/map";
import { buildSky, skyUniforms, starDirection } from "./world/sky";
import { floorHook, GOBEKLI, gobekliAt, NAN_MADOL, nanMadolAt, RAPA_NUI, rapaNuiAt, groundUniforms, heightAt, heightCoarse, LANDMARK_SITES, MONUMENT, PEAKS, SPAWN, standAt, Terrain, WATER_Y } from "./world/terrain";
import { Temple } from "./world/temple";
import { Autofly } from "./player/autofly";
import { Autorun } from "./player/autorun";
import { BreathGuide } from "./world/breath";
import { LungParticles } from "./ui/breathLungs";
import { Touch } from "./world/touch";
import { Depths, RUIN_NAMES, RUIN_SITES } from "./world/depths";
import { Ancients } from "./world/ancient";
import { Pyramid, DUAT_ORIGIN } from "./world/pyramid";
import { Cavern, type Underground } from "./world/cavern";
import { GoldMine } from "./world/mines";
import { MINE_SITES, wakeTheNile } from "./world/terrain";
import { FalseDoors } from "./world/falseDoors";
import { Gobekli } from "./world/ancient/gobekli";
import { NanMadol } from "./world/ancient/nanMadol";
import { Waterfalls } from "./world/waterfalls";
import { RapaNui } from "./world/ancient/rapaNui";
import { Whispers, whisperOf, type WhisperId } from "./world/whispers";
import { DUAT_TRACKS } from "./world/duat";
import { Companion } from "./world/companion";
import { Vision } from "./world/vision";
import { Journey, JOURNEY_ORIGIN, inJourney, type Hall, type JourneyHost } from "./scenes/journey";
import { AdeptMonument, adeptStages } from "./scenes/adept/monument";
import { DensityMonument, densityStages } from "./scenes/densities/monument";
import { PastMonument, pastStages } from "./scenes/past/monument";
import { VeilDoor } from "./scenes/afterVeil/door";
import { createAfterVeil, veilConfine, veilFloor, VEIL_EXIT } from "./scenes/afterVeil/area";
import { WandererPortal } from "./scenes/wanderer/portal";
import { MindMazePortal } from "./scenes/mindMaze/portal";
import { createMindMaze, maze, mazeConfine, mazeFloor, MAZE_AIR, MAZE_EXIT, MAZE_OUTER, MAZE_START } from "./scenes/mindMaze/area";
import { MazeMap } from "./ui/mazeMap";
import { createLongDescent, wandererConfine, wandererFloor, WANDERER_EXIT } from "./scenes/wanderer/area";
import { moodForce } from "./world/moods";
import { NO_MIRROR_LAYER, Water } from "./world/water";
import { FOG } from "./world/fog";
import { MOOD_NAMES, Moods } from "./world/moods";
import { Forest } from "./world/forest";
import { RisingFlowers } from "./world/blooms";
import { Wilds } from "./world/wilds";
import { Nile } from "./world/nile";
import { lessonDark } from "./scenes/enacted";
import { initTourScenes, tourPlaces, type TourScenes } from "./scenes/integration";
import { bodyForms } from "./world/forms";
import { glyphsLoaded } from "./world/glyphs";
import { Duat } from "./world/duat";

import { downloadAssets, requestPersistentStorage, downloadedBefore, fetchAssetList, megabytes, plan } from "./core/offline";

// Register the service worker, and ask it to look for a newer version at every start and every
// return to the game (iOS checks rarely on its own, and a Home Screen game is only ever resumed).
// A newer one installs and takes over at once (sw.js skips waiting); if that happens before the
// journey has begun, the page loads again on it, once, so all of it is the new build.
// the Nile and the pyramid's new place come into the land now, after every module has chosen its
// own sites (terrain.ts wakeTheNile), so that nothing else moved
wakeTheNile();
const hadWorker = "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
registerSW({
  immediate: true,
  onRegisteredSW(_url, r) {
    if (!r) return;
    void r.update().catch(() => undefined);
    addEventListener("visibilitychange", () => document.visibilityState === "visible" && void r.update().catch(() => undefined));
  },
  onOfflineReady() {
    console.log("App ready to work offline");
  },
});
if (hadWorker)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (S.mode !== "intro") return;
    try {
      if (sessionStorage.getItem("inward-journey:sw-reload")) return;
      sessionStorage.setItem("inward-journey:sw-reload", "1");
    } catch {
      return;
    }
    location.reload();
  });

declare const __BUILD__: string;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
/** How far the loading has come (0..1), shown under the seed as a thin bar and a number, so it
    never looks stuck; it only ever moves forward. The bar is a transform, which the compositor
    draws even while the page is busy building the world. */
let bootShown = 0;
/** `creep`: seconds over which the bar keeps easing on toward `f` by itself (the long shader
    compile gives no word of its progress, but the bar must never sit still). */
function bootProgress(f: number, label = "Building the world", creep = 0.6): void {
  bootShown = Math.max(bootShown, Math.min(1, f));
  const bar = document.querySelector<HTMLElement>("#boot-bar i"), pct = document.querySelector("#boot-pct");
  if (bar) {
    bar.style.transitionDuration = `${creep}s`;
    bar.style.transform = `scaleX(${bootShown.toFixed(3)})`;
  }
  if (pct) pct.textContent = creep > 1 ? label : `${label} · ${Math.round(bootShown * 100)}%`;
}
bootProgress(0.12);

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

/* WebGPU root-cause diagnostic (temporary): the "Invalid CommandEncoder" banner is a
   downstream symptom — a command encoder poisoned by an EARLIER validation error.
   A per-frame validation error scope catches that first error so the phone can
   show us the actual cause. */
interface GpuDiagDevice {
  pushErrorScope(type: "validation"): void;
  popErrorScope(): Promise<{ message: string } | null>;
}
let gpuDiagDevice: GpuDiagDevice | null = null;
let gpuDiagScopeOpen = false;

function gpuDiagStart(): void {
  const d = gpuDiagDevice;
  if (!d || gpuDiagScopeOpen) return;
  try {
    d.pushErrorScope("validation");
    gpuDiagScopeOpen = true;
  } catch {
    /* ignore */
  }
}

function gpuDiagEnd(): void {
  const d = gpuDiagDevice;
  if (!d || !gpuDiagScopeOpen) return;
  gpuDiagScopeOpen = false;
  d.popErrorScope()
    .then((err) => {
      if (err && err.message) {
        showProblem(`ROOT WebGPU: ${err.message}`);
      }
    })
    .catch(() => {
      /* ignore */
    });
}

const isTv = new URLSearchParams(location.search).get("tv") === "1";
if (isTv) {
  document.body.classList.add("tv-mode");
}

type Mode = "intro" | "play" | "rest";
const S = {
  mode: (isTv ? "play" : "intro") as Mode,
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
scene.userData.camera = camera; // what the lessons measure their distance from
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
scene.add(water.mesh);
water.excludeFromMirror(camera);
const terrain = new Terrain();
scene.add(terrain.group);
const clouds = new Clouds(MOBILE ? 60 : 80);
scene.add(clouds.mesh);
// showers that pass now and then (world/weather.ts); ⋮ → "Rain now and then"
const weather = new Weather(MOBILE ? 1400 : 2400);
scene.add(weather.mesh);
{
  const q = new URLSearchParams(location.search).get("rain");
  if (q !== null) weather.forced = Number(q);
  try {
    weather.enabled = localStorage.getItem("inward-journey:rain") !== "0";
  } catch {
    /* private mode */
  }
}

// A flat stone where the wanderer wakes, etched with the seven-fold figure.
const spawnY = heightAt(SPAWN.x, SPAWN.z);
// (no dark stone disc under it: it filled the first view; the mandala lies on the sand)
const mandala = buildMandala();
mandala.scale.setScalar(0.4);
mandala.position.set(SPAWN.x, spawnY + 0.04, SPAWN.z);
scene.add(mandala);

const motes = new Motes(500);
scene.add(motes.points);
// lights that rise from where you kneel or lay hands, and the quiet just after a meditation
const risers = new Risers();
scene.add(risers.points);
const riseAt = new THREE.Vector3();

const wanderer = new Wanderer(camera);
scene.add(wanderer.root, wanderer.fx);
// the mind's maze: the wanderer becomes a sphere of polished gold, and the view its own eyes
const goldSphere = new GoldSphere();
scene.add(goldSphere.mesh, goldSphere.shadow);
const reachLine = new ReachLine(gpuUniforms.time);
scene.add(reachLine.mesh);
wanderer.load("models/wanderer.glb");
const player = new Controller();
player.pos.set(SPAWN.x, spawnY + 0.13, SPAWN.z);
player.heading = SPAWN.heading;
const follow = new FollowCamera(camera);

/* ============ AUDIO ============ */
const audio = new AudioEngine("audio/water-bed.mp3");
const narration = new Narration(audio, $("#sub"));
Duat.voice = (track) => void narration.play(track); // the Duat's hours, if they ever have recordings of their own (DUAT_TRACKS)
const playlist = new Playlist(narration);
registerAnswers();
registerTunnel();

/* ============ THE LIVING WORLD ============ */
const sparks = new Sparks();
/* The temple of the spirit (world/sanctuary.ts): a sanctuary drawn by hand on its terrace, the
   strokes grown into walls, rings, pillars, spires and orbs, in stone (from rock meditations) and
   gold (from the heart's notes); kept on this device only. */
const sanct = new Sanctuary(
  { sparks: (at, n, c, s) => sparks.emit(at, n, c, s), bowl: (f, g) => audio.bowl(f, g), bell: (f, g, d) => audio.bell(f, g, d), breath: () => breath.phases, say: (t) => whisper(t, 6500) },
  { persist: !new URLSearchParams(location.search).has("shot") },
);
/* Trees you plant and grow with your own energy (world/garden.ts): planted from the build screen,
   tended with a hold. */
const garden = new Garden({ persist: !new URLSearchParams(location.search).has("shot") });
sanct["hooks"].plant = (x: number, z: number, y?: number) => garden.plant(x, z, y);
const grass = new LightGrass();
const flowers = new Flowers(sparks, audio);
const lanterns = new Lanterns(sparks);
const blooms = new RisingFlowers();
const wilds = new Wilds();
// the Nile's palms, papyrus and boats, in the valley the pyramid now stands above (world/nile.ts)
const nile = new Nile(MOBILE);
scene.add(nile.group);
// what grows and lies on the ground round you, each region its own (world/groundCover.ts)
const cover = new GroundCover();
scene.add(cover.group);
(window as unknown as { __palmAt?: () => { x: number; y: number; z: number } | null }).__palmAt = () => wilds.nearestPalm(SPAWN.x, SPAWN.z);
const landmarks = new Landmarks(scene, audio, wanderer);
// The archetypes themselves, each at home in its landmark.
const beings = new Beings(landmarks.list, sparks);
scene.add(beings.group);
// The temple: a pylon near the shore, and through its door a place apart (world/temple.ts)
const temple = new Temple(sparks, {
  onMeet: (numeral, name) => {
    // only the name: inside, it is silent but for your steps and the far chant (Samuel). Not on
    // the tour: its view glides past the next shrines, which named themselves before their turn
    if (document.body.classList.contains("touring")) return;
    whisper(`${numeral} · ${name}`, 4000);
  },
});
scene.add(temple.group, temple.gate);
let hallsReady = false; // the halls are made further down; until then their floor is level
floorHook.fn = (x, z) => (x > 55000 ? (under()?.floorAt(x, z) ?? 0) : inJourney(x) ? (hallsReady ? (inHall()?.journey.floorAt(x, z) ?? 0) : 0) : x > 45000 ? pyramid.floorAt(x, z) : x > 35000 ? depths.floorAt() : temple.floorAt(x, z));
/** The figure the beings wear, once loaded (the mind's maze dresses its archetypes in it too). */
let beingModel: BeingModel | null = null;
void beings.load("models/wanderer.glb").then((m) => {
  beingModel = m;
  if (m) temple.attach(m);
});
// the voices of the archive, present while they speak
const presences = new Presences();
scene.add(presences.group);
// the entities' figures are left out: one walked beside the wanderer through every narration
// (Samuel: "remove that annoying chasing character")
/* the oracle at work at an archetype or a shrine, in that archetype's own light */
const stationGlow = new StationGlow();
scene.add(stationGlow.points);
scene.add(sparks.points, grass.mesh, flowers.mesh, blooms.mesh, wilds.group, lanterns.points, sanct.group, garden.group);
// The whole creation: trees and their roots, rocks, crystals, and the light through them.
creationUniforms.uFogC.value.copy(FOG_COLOR);
creationUniforms.uFogD.value = FOG.density * 0.9;
creationUniforms.uStar.value.copy(starDir);
// the sky's moods, which change as you travel
const moods = new Moods({ hemi, star, scene, creationFog: creationUniforms.uFogC.value });
const worldLit = { hemi: hemi.intensity, star: star.intensity }; // the lights as the moods last set them
const creation = new Creation(sparks);
// the forests beyond, out to half a kilometre
const forest = new Forest(creation);
scene.add(forest.mesh);
// no flying spirits (the owner, 2026-10-17: "Remove those spirits everywhere")
scene.add(creation.group);
const seaLife = new SeaLife();
scene.add(seaLife.group);
const fauna = new SeaFauna();
scene.add(fauna.group);
const communion = new Communion();
scene.add(communion.group);
// The archive's vessels: orbs and groves, and the quiet player for their narrations.
const vessels = new Vessels();
scene.add(vessels.group);
const creatures = new Creatures(MOBILE ? 12 : 18); // modest flocks
scene.add(creatures.group);
// horses of light: out of the world (the owner: they "don't add anything… better a nice animation
// in spots than ugly random horses"); made only for their still
const spiritHorses = new SpiritHorses(new URLSearchParams(location.search).get("shot") === "horses" ? 3 : 0, MOBILE ? 1400 : 2200);
scene.add(spiritHorses.group);
// rabbits in the meadows, small spirits of light that come and go (no squirrels: the owner found
// the drawn one poor; it waits for a real model)
const spiritCritters = new SpiritCritters(3, 0, MOBILE ? 900 : 1300, () =>
  creation.touchables().filter((t) => t.kind === "tree"),
);
scene.add(spiritCritters.group);
// readable artifacts (content/readings.json): a shiny thing that opens a text when tapped; the
// sample entries show only in dev mode and still frames
const readables = new Readables(
  (label) => placeAt(label),
  devMode() || new URLSearchParams(location.search).has("shot"),
);
scene.add(readables.group);
const reader = new Reader();
/** A reading tapped from afar: the wanderer goes to it, and it opens on arrival. */
let readingOn: { reading: Reading; pos: THREE.Vector3 } | null = null;
let readingFor: { reading: Reading; pos: THREE.Vector3 } | null = null;
function openReading(r: { reading: Reading; pos: THREE.Vector3 }): void {
  readingFor = null;
  readingOn = r;
  player.target = null;
  reader.show(r.reading);
  if (r.reading.id.startsWith("maze-")) {
    maze?.markRead(r.reading.id);
    maze?.reading(r.reading.id); // an archetype makes its gesture while its rite is read
  } else readables.markRead(r.reading.id);
  audio.bowl(660, 0.035, undefined, 5);
}
reader.onClose = () => {
  readingOn = null;
  maze?.reading(null);
};
reader.onListen = (r, on, page) => {
  const src = r.voices?.[page] ?? r.audio;
  if (on && src) void narration.play(src);
  else if (!on && narration.current && (narration.current === r.audio || r.voices?.includes(narration.current))) narration.stop(1.2);
};
/* The mind's maze's steles (scenes/mindMaze): read in the same panel. A tap on one opens it (near)
   or walks you to it; standing beside one a moment opens it once a visit. */
const mazeOpened = new Set<string>();
let mazeStill = 0, mazeWasIn = false, mazeLast = 0, mazeSat = false, mazeGone = false;
function mazeSteleNear(within: number): { reading: Reading; pos: THREE.Vector3 } | null {
  if (!maze) return null;
  let best: { reading: Reading; pos: THREE.Vector3 } | null = null, bd = within;
  for (const s of maze.steles()) {
    const d = Math.hypot(s.pos.x - player.pos.x, s.pos.z - player.pos.z);
    if (d < bd) (bd = d), (best = s);
  }
  return best;
}
function mazeStelePick(x: number, y: number): { reading: Reading; pos: THREE.Vector3 } | null {
  if (!maze) return null;
  const v = new THREE.Vector3(), f = innerHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
  let best: { reading: Reading; pos: THREE.Vector3 } | null = null, bd = Infinity;
  for (const s of maze.steles()) {
    const d = s.pos.distanceTo(camera.position);
    if (d > 60) continue;
    v.copy(s.pos).project(camera);
    if (v.z > 1) continue;
    const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
    if (Math.hypot(sx - x, sy - y) < Math.max(36, (0.7 / d) * f * 1.4) && d < bd) (bd = d), (best = s);
  }
  return best;
}
/* The maze's own map (ui/mazeMap.ts): its button shows in the maze; a tap on the map sets you there. */
const mazeMap = new MazeMap({
  layout: () => (maze && inHall()?.hall === mazeHall ? maze.layout() : null),
  you: () => {
    const o = maze?.layout().origin;
    return { x: player.pos.x - (o?.x ?? 0), z: player.pos.z - (o?.z ?? 0), heading: player.heading };
  },
  go: (x, z) => {
    const o = maze?.layout().origin;
    if (!o) return;
    player.pos.set(o.x + x, mazeFloor(x, z), o.z + z);
    player.vel.set(0, 0, 0);
    player.target = null;
    follow.snapTo(player.pos);
  },
  full: () => devMode(),
});
/** The maze's camera test still (`maze-17`): sampled each frame. */
let camStep: ((dt: number) => void) | null = null;
const mazeClear = (a: THREE.Vector3, b: THREE.Vector3): number => maze?.clearance(a, b) ?? 1;
/** In the maze the stick steers by a frame that turns only slowly after the view: the view turns
    with the walker's path, and a stick read against it directly turned the walker under the thumb
    (push a little right and it circled on, the view chasing it). Held, the frame follows the view
    at most 0.7 rad/s; let go, it is the view's again. */
let mazeWalk = false;
let toldMazeTap = false;
/** In the maze a tap walks you there along the corridors: the points still to walk through. */
let mazeRoute: THREE.Vector2[] = [];
/** Set course for a point; in the maze, by the corridors (never straight into a wall). */
function courseTo(x: number, z: number): void {
  const inMaze = !!maze && inHall()?.hall === mazeHall;
  const way = inMaze ? maze!.route(player.pos, new THREE.Vector3(x, 0, z)) : null;
  if (way && way.length) {
    mazeRoute = way;
    player.target = mazeRoute.shift()!;
  } else {
    mazeRoute = [];
    player.target = new THREE.Vector2(x, z);
  }
}
if (location.search.includes("shot=")) (window as unknown as { __maze: unknown }).__maze = { courseTo, pos: () => [player.pos.x, player.pos.z], origin: () => [JOURNEY_ORIGIN.x, JOURNEY_ORIGIN.z], left: () => mazeRoute.length, target: () => player.target && [player.target.x, player.target.y] };
/** Walk the maze's way: on to the next point a little before reaching each one; the stick takes over. */
function mazeRouteFrame(): void {
  // run while much of the way is left, walking the last stretch
  player.runCourse = mazeRoute.length > 3;
  if (!mazeRoute.length) return;
  const t = player.target;
  if (!t || Math.hypot(input.move.x, input.move.y) > 0.2) {
    mazeRoute = [];
    player.runCourse = false;
    return;
  }
  if (Math.hypot(t.x - player.pos.x, t.y - player.pos.z) < (player.runCourse ? 2 : 1.2)) player.target = mazeRoute.shift()!;
}
let moveYaw = 0;
function stickYaw(dt: number): number {
  const held = Math.hypot(input.move.x, input.move.y) > 0.12;
  if (!mazeWalk || !held) return (moveYaw = follow.yaw);
  const d = Math.atan2(Math.sin(follow.yaw - moveYaw), Math.cos(follow.yaw - moveYaw));
  moveYaw += THREE.MathUtils.clamp(d, -0.7 * dt, 0.7 * dt);
  return moveYaw;
}
let mazeLastT = 0;
function mazeSteleFrame(): void {
  const nowT = performance.now(), mazeDt = Math.min(0.1, (nowT - (mazeLastT || nowT)) / 1000);
  mazeLastT = nowT;
  const inMaze = !!maze && inHall()?.hall === mazeHall;
  mazeMap.frame(inMaze && !crossing);
  // on foot only in the maze: no jumping, no flight (the round button rests); and seated at its
  // centre, the view rises to an eagle's height over it
  player.walkOnly = inMaze;
  if (inMaze && player.flying) player.flying = false;
  document.body.classList.toggle("walkonly", inMaze);
  if (inMaze && !toldMazeTap && !crossing) {
    toldMazeTap = true;
    whisper("Tap the floor where you want to go: the way through the corridors is walked for you", 6000);
  }
  follow.eagle = inMaze ? (maze?.eagle() ?? null) : null;
  if (inMaze && maze) follow.eagleH = maze.eagleHeight();
  // the veil: in the maze the following view stays below the walls' tops
  // (4.2 m: still under the walls' tops, 4.6 m, so nothing beyond them shows; the chase view's crane rises to it)
  follow.ceiling = inMaze ? player.pos.y + 4.2 : null;
  // and the view keeps to the corridors (the owner: the camera "fucking annoying"): close behind,
  // settling along the corridor's way as you walk, standing in front of any wall, never behind one
  // the maze in first person (the owner's v2: "the player IS a rolling sphere, first-person; the
  // camera is the ball"): one gesture, a drag anywhere, rolls you; the view is the sphere's own
  // eyes; the third-person rail and arc rest (they serve the eagle's descent only)
  // (the owner: "you don't see any sphere and the experience on the controls is AWFUL"): the view
  // stands close and low behind the golden sphere, always in sight, and the usual stick moves it
  const fp = false;
  follow.firstPerson = fp;
  input.rollMode = false;
  // the walker, not the ball (the owner: "an absolute nightmare to play"; his fallback: "we go
  // back to avatar, but fixing the camera view")
  follow.targetLift = null;
  // the chase view: always behind the way the ball really goes, the ball at the centre (the rail
  // and arc rest: they chased the corridor's way, not yours)
  follow.chase = inMaze && !follow.eagle;
  follow.rail = null;
  follow.arcCentre = null;
  follow.nearDist = inMaze ? 3.4 : null;
  wanderer.orbMode = false;
  // a fixed view from above (the way in at the foot of the screen, the centre up it), so nothing
  // turns under the thumb
  follow.overhead = inMaze && follow.chase ? 0 : null;
  mazeWalk = false;
  mazeRouteFrame();
  if (maze) maze.veilShift(inMaze && follow.chase ? Math.max(0, camera.position.distanceTo(player.pos) - 5) : 0);
  // the golden sphere rests (kept for a later use)
  goldSphere.update(player.pos, false, heightAt);
  // the reach of light over the floor while a drag pulls (the way the drag pulls, in the world)
  {
    const mx = input.move.x, my = input.move.y, ml = Math.hypot(mx, my);
    const fx = -Math.sin(follow.yaw), fz = -Math.cos(follow.yaw), rx = Math.cos(follow.yaw), rz = -Math.sin(follow.yaw);
    const ax = ml > 1e-3 ? (rx * mx + fx * my) / ml : fx, az = ml > 1e-3 ? (rz * mx + fz * my) / ml : fz;
    reachLine.update(mazeDt, fp && input.rolling && ml > 0.05, player.pos, -Math.sin(player.heading), -Math.cos(player.heading), ax, az, heightAt);
  }
  follow.clearance = inMaze && maze ? mazeClear : null;
  // through one of the forecourt's doors: on to that world, the way "where next" goes there
  const door = inMaze && !mazeGone && !crossing ? maze?.portalAt(player.pos) : null;
  if (door) {
    mazeGone = true;
    enterFromMaze(door);
  }
  if (!inMaze) {
    mazeGone = false;
    if (mazeWasIn) {
      mazeOpened.clear(); // a new visit: each opens by itself once again
      // walked out, having sat at its centre: where next
      if (mazeSat) window.setTimeout(() => offerNext("maze", "The mind's maze"), 2500);
      mazeSat = false;
    }
    mazeWasIn = false;
    return;
  }
  mazeWasIn = true;
  if (maze?.sat) mazeSat = true;
  const now = performance.now() / 1000, dt = Math.min(0.2, mazeLast ? now - mazeLast : 0);
  mazeLast = now;
  // standing a moment beside a stele, or before an archetype, opens it (once a visit)
  let s = reader.open || readingFor ? null : mazeSteleNear(2.9);
  if (s && !s.reading.id.startsWith("maze-arch-") && Math.hypot(s.pos.x - player.pos.x, s.pos.z - player.pos.z) > 1.9) s = null;
  mazeStill = s && player.vel.lengthSq() < 0.05 ? mazeStill + dt : 0;
  if (s && mazeStill > 1.2 && !mazeOpened.has(s.reading.id)) {
    mazeOpened.add(s.reading.id);
    openReading(s);
  }
}
/** Each frame: open a reading on arriving at it; close one walked away from. */
function readingFrame(): void {
  if (readingFor) {
    if (!player.target) readingFor = null; // the stick took over
    else if (Math.hypot(readingFor.pos.x - player.pos.x, readingFor.pos.z - player.pos.z) < 2.2) openReading(readingFor);
  }
  mazeSteleFrame();
  if (readingOn && reader.open && ((apart() && !readingOn.reading.id.startsWith("maze-")) || Math.hypot(readingOn.pos.x - player.pos.x, readingOn.pos.z - player.pos.z) > 8)) reader.close();
}
addEventListener("keydown", (e) => {
  if ((e.key === "r" || e.key === "R") && !reader.open && S.mode === "play" && !apart() && !(e.target as HTMLElement)?.closest?.("input, textarea")) {
    const near = readables.nearest(player.pos, 3) ?? mazeSteleNear(3);
    if (near) openReading(near);
  }
});

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
/* The graphics level (⋮ → Graphics): automatic by default, the game choosing as it goes; or one
   level held whatever the frame rate (Best … Lowest). Remembered on the device. */
{
  const KEY = "inward-journey:graphics";
  const sel = $<HTMLSelectElement>("#graphics");
  let saved = "auto";
  try {
    // once: a level held before the phone's levels were made cooler goes back to Automatic (the
    // owner's phone held Best at 3x, hot at 15–25 fps); choosing again is kept as ever
    if (!localStorage.getItem("inward-journey:graphics-v2")) {
      localStorage.removeItem(KEY);
      localStorage.setItem("inward-journey:graphics-v2", "1");
    }
    saved = localStorage.getItem(KEY) ?? "auto";
  } catch {
    /* private window */
  }
  if (![...sel.options].some((o) => o.value === saved)) saved = "auto";
  sel.value = saved;
  const set = (v: string) => quality.override(v === "auto" ? null : v);
  if (saved !== "auto") window.setTimeout(() => set(saved), 0); // once the renderer exists
  sel.addEventListener("change", () => {
    set(sel.value);
    try {
      localStorage.setItem(KEY, sel.value);
    } catch {
      /* private window */
    }
  });
}
/* The frame rate (⋮ → Frame rate): 30 on a phone by default, 60 elsewhere. Half the frames is half
   the GPU's work, so the phone stays cool and the frame time steady (a hot phone throttles, and
   uneven frames and a starved audio thread were the stutter the owner heard). Remembered. */
let frameCap = 0;
{
  const KEY = "inward-journey:fps";
  const sel = $<HTMLSelectElement>("#fps");
  let saved = MOBILE ? "30" : "60";
  try {
    saved = localStorage.getItem(KEY) ?? saved;
  } catch {
    /* private window */
  }
  if (![...sel.options].some((o) => o.value === saved)) saved = "60";
  sel.value = saved;
  const set = (v: string) => (frameCap = v === "30" ? 30 : 0);
  set(saved);
  sel.addEventListener("change", () => {
    set(sel.value);
    try {
      localStorage.setItem(KEY, sel.value);
    } catch {
      /* private window */
    }
  });
}
/** The screen's real height in CSS pixels. On the Home Screen iOS reports a window (and so
    100vh/100lvh) short of the screen, which left a dark band at the foot: there, the screen's
    own size is the truth (its long side in portrait). Elsewhere the largest the page reports. */
function fullHeight(): number {
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  let h = Math.max(innerHeight, document.documentElement.clientHeight, visualViewport?.height ?? 0);
  if (standalone && screen?.width && screen?.height) {
    const portrait = innerHeight >= innerWidth;
    h = Math.max(h, portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height));
  }
  return Math.round(h);
}
function resize(): void {
  document.documentElement.style.setProperty("--fh", `${fullHeight()}px`);
  // the canvas is sized by CSS to the whole screen; its drawing size follows the canvas
  const el = renderer.domElement;
  const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
  dpr = quality.dpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  // the lakes' mirror: half the drawing buffer (its long side stays above 1024 on a phone)
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
  // the shadow map follows mapSize by itself (no dispose, as WebGL needed)
  star.shadow.mapSize.set(t.shadow, t.shadow);
  setShadowSize(t.shadow); // every room's key light follows the moon's map (gpu/lightRig.ts)
  motes.setCount(Math.round(t.particles / 2));
  creation.setQuality(Math.max(0, i - 1));
  forest.mesh.visible = i <= 2; // the forests beyond rest on the two lowest tiers
  resize();
}
applyTier(quality.current);
// the tuning lives in public/quality.json (frame targets, hysteresis, scale band, start tiers,
// the tiers themselves): read over the built-in defaults, it takes over before anything is judged
void loadQualityConfig().then((ok) => ok && quality.reconfigure());
addEventListener("resize", resize);
// iOS settles the screen's size a moment after launch and on turning: measure again then
visualViewport?.addEventListener("resize", resize);
addEventListener("orientationchange", () => window.setTimeout(resize, 300));
for (const ms of [500, 2000]) window.setTimeout(resize, ms);

/* ============ SAVE ============ */
const saved = FILM ? null : load(); // a film always wakes at the shore, whatever the device has saved
const awake = new Awake();
awake.on = saved?.settings?.awake ?? true;
// a place apart (the temple, the halls, x > 20 km) is never a place to wake in: those are
// saved as the place outside their door; an older save that holds one wakes at the shore
if (saved && !(Math.abs(saved.pos[0]) < 20000 && saved.pos.every(Number.isFinite))) (saved.pos = [SPAWN.x, spawnY + 0.13, SPAWN.z]), (saved.heading = SPAWN.heading);
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
  if (S.mode === "intro" || resetting || FILM) return; // a film never overwrites the device's own journey
  const d: SaveData = {
    v: 1,
    pos: under() ? ((o) => [o.x, heightAt(o.x, o.z), o.z] as [number, number, number])(under()!.outside()) : inHall() ? ((o) => [o.x, o.y, o.z] as [number, number, number])(inHall()!.hall.outside()) : temple.inside ? templeReturnPos() : depths.inside ? deepReturnPos() : pyramid.isInside ? [pyramid.outside().x, heightAt(pyramid.outside().x, pyramid.outside().z), pyramid.outside().z] : [player.pos.x, player.pos.y, player.pos.z],
    heading: under() ? under()!.outside().heading : inHall() ? inHall()!.hall.outside().heading : pyramid.isInside ? 0 : temple.inside ? temple.outside().heading : depths.inside ? depths.outside(deepMouth ?? depths.mouths[0].site).heading : player.heading,
    heard: [],
    visited: [],
    settings: { volume: audio.volume, reduced: S.reducedPref, subtitles: narration.subtitlesOn, voices: playlist.on, awake: awake.on },
    journey: {
      heard: playlist.heardIds,
      walked: beings.list.filter((b) => b.walked).map((b) => b.spec.numeral),
      hearted: beings.list.filter((b) => b.hearted).map((b) => b.spec.numeral),
      passed: [...passed],
      archive: [...archiveHeard],
      kindled: [...kindled],
      synth: [...synthDone],
    },
    savedAt: Date.now(),
  };
  save(d);
}
follow.yaw = player.heading;
follow.snapTo(player.pos);
terrain.update(player.pos.x, player.pos.z, true);

/* ============ UI ============ */
// A newer build on the server (Samuel's phone kept an old copy for days: a Home Screen game is
// only resumed, never reloaded). Before the journey begins, or on coming back to the game with no
// archive narration playing, load it at once (your place is saved, and the map offers
// "Continue where you were"); otherwise say so once.
let toldNewer = false;
function checkFresh(returning: boolean): void {
  void newerBuild().then((live) => {
    if (!live) return;
    if (S.mode === "intro" || (returning && !tp.playing)) {
      if (S.mode !== "intro") persist();
      reloadTo(live);
    } else if (!toldNewer) {
      toldNewer = true;
      whisper("A newer version of the game is ready: ⋮ → Load the newest version.", 8000);
    }
  });
}
checkFresh(false);
addEventListener("visibilitychange", () => document.visibilityState === "visible" && checkFresh(true));

function say(m: string): void {
  const l = $("#live");
  l.textContent = "";
  window.setTimeout(() => (l.textContent = m), 50);
}
let whisperTimer = 0;
// a model that cannot load is said, not silently missing (its name, quietly; once each)
loadFailed.hook = (path) => {
  const name = path.replace(/^models\//, "").replace(/\.glb$/, "").replace(/[-_/]/g, " ");
  window.setTimeout(() => whisper(`Something could not load (${name}). It will be there next time.`, 6000), 1500);
};
const STILL = new URLSearchParams(location.search).has("shot");
function whisper(text: string, ms = 5000): void {
  if (STILL) return; // still frames: no words over the picture (first-time tips covered the ruins)
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
  } else if (player.seabed || player.sinking) player.descend(); // back up to the surface
  else if (player.diving) player.descend(); // down to the floor
  else if (player.swimming) player.dive();
};
// In the water, a double tap on the orb takes you down to the lake floor, where you stand and
// walk; again, and you rise back to the surface (the owner's way).
let lastOrbTap = 0;
function tapOnOrb(x: number, y: number): boolean {
  if (!player.swimming) return false;
  heartAt(heartScreen).project(camera);
  const sx = (heartScreen.x * 0.5 + 0.5) * innerWidth, sy = (-heartScreen.y * 0.5 + 0.5) * innerHeight;
  if (heartScreen.z >= 1 || Math.hypot(x - sx, y - sy) > Math.max(80, innerHeight * 0.1)) return false;
  const now = performance.now();
  if (now - lastOrbTap < 450) {
    lastOrbTap = 0;
    const down = !(player.seabed || player.sinking);
    player.descend();
    if (down) whisper("Down to the floor", 2200);
    audio.bowl(down ? 196 : 294, 0.05);
  } else lastOrbTap = now;
  return true;
}
input.onAction = () => {
  if (wanderer.gesture !== "none") wanderer.setGesture("none");
  if (player.swimming) {
    player.stroke();
    seaLife.bubbles(player.pos, 10);
  } else player.jump();
};
input.onTap = (x, y, touch) => {
  if (isTv || S.mode !== "play" || temple.cardsOpen) return;
  // in the archive of the heart: a star is a note, read again
  if (depths.inside) {
    const got = depths.pick(x, y, camera);
    if (got) {
      const d = new Date(got.note.createdAt);
      reader.show({ id: `heart-${got.note.createdAt}`, title: `${d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} · ${got.note.scene}`, pages: [got.note.text], place: {} });
      audio.bowl(660, 0.03, undefined, 5);
    }
    return;
  }
  if (tapOnOrb(x, y)) return;
  if (tapOnHeart(x, y)) return;
  // a block of gold in the sanctuary: its note, read again
  {
    const g = apart() || reader.open ? null : sanct.pickNote(x, y, camera);
    if (g) {
      if (!g.note) whisper("This held a memory you let go. Its shape stays.", 4200);
      else {
        const d = new Date(g.note.createdAt);
        reader.show({ id: `heart-${g.note.createdAt}`, title: `${d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} · ${g.note.scene}`, pages: [g.note.text], place: {} });
        audio.bowl(660, 0.03, undefined, 5);
      }
      return;
    }
  }
  // a whisper's thing under the tap: a door, a stone, a wandering world, a quartz, a star, a tree
  {
    const w = apart() ? null : whispers.pick(x, y, camera);
    if (w) {
      hearWhisper(w, true);
      return;
    }
  }
  // a readable artifact under the tap: near, it opens; farther, the wanderer goes to it first
  {
    const r = reader.open ? null : apart() ? mazeStelePick(x, y) : readables.pick(x, y, camera);
    if (r) {
      if (Math.hypot(r.pos.x - player.pos.x, r.pos.z - player.pos.z) < 9) openReading(r);
      else {
        stopAuto();
        readingFor = r;
        courseTo(r.pos.x, r.pos.z);
      }
      return;
    }
  }
  // an orb or a fruit under the tap: its narration begins (never by itself)
  const v = vessels.pick(x, y, camera);
  if (v) {
    playArchive(v.narration);
    return;
  }
  // a tap on the land sets course for it: walking, or flying there if in the air (Samuel)
  void touch;
  if (sitting.phase === "seated" || tourScenes.movementHeld) return;
  const p = groundPoint(x, y);
  if (!p) return;
  stopAuto();
  courseTo(p.x, p.z);
  if (p.y <= WATER_Y + 0.05) water.ripple(p.x, p.z, 0.6, S.t);
};
// Into the temple and out again. Inside, the open world rests: hidden, and not streamed.
const fadeEl = $("#fade");
fadeEl.style.transitionDuration = "0.6s";
fadeEl.style.zIndex = "40";
let hiddenWorld: [THREE.Object3D, boolean][] = [];
let crossing = false;
let toldGate = false;
function templeReturnPos(): [number, number, number] {
  const o = temple.outside();
  return [o.x, heightAt(o.x, o.z), o.z];
}
/** Switch between the world and the temple at once (no fade). */
function setInside(inside: boolean): void {
  if (inside === temple.inside) return;
  if (inside) {
    const keep = new Set<THREE.Object3D>([temple.group, wanderer.root, wanderer.fx, camera]);
    hiddenWorld = scene.children.filter((o) => !keep.has(o)).map((o) => [o, o.visible]);
    for (const [o] of hiddenWorld) o.visible = false;
    temple.show(true);
    temple.reset();
    audio.setTemple(true);
    const e = temple.entry();
    player.pos.set(e.x, temple.floorAt(e.x, e.z), e.z);
    player.heading = e.heading;
    follow.yaw = e.heading;
    follow.pitch = 0.12;
  } else {
    for (const [o, v] of hiddenWorld) o.visible = v;
    hiddenWorld = [];
    closeCards();
    audio.setTemple(false);
    temple.show(false);
    const o = temple.outside();
    player.pos.set(o.x, heightAt(o.x, o.z), o.z);
    player.heading = o.heading;
    follow.yaw = o.heading;
    terrain.update(o.x, o.z, true);
  }
  Object.assign(player, { flying: false, landing: false, grounded: true, swimming: false, vy: 0, target: null });
  player.vel.set(0, 0, 0);
  follow.snapTo(player.pos);
  quality.hold(3);
}
/** A place apart's shaders compile while the crossing is dark, never for long (whatever isn't
    ready compiles on its first draw instead). */
function compileInDark(): Promise<unknown> {
  return Promise.race([renderer.compileAsync(scene, camera).catch(() => undefined), new Promise((r) => window.setTimeout(r, 4000))]);
}
/* Through one of the maze's monuments: straight in, through the dark, to that place itself (the
   owner: "my idea was that you go into those places, no fly there"). The maze is let go in the dark,
   you are set down before the place's own door out in the world (so leaving it later brings you out
   there), and its door takes you in. */
const MAZE_HALL_OF: Record<string, number> = { densities: 0, adept: 1, past: 2, veil: 3, descent: 4 };
function enterFromMaze(id: string): void {
  stopAuto();
  fadeEl.classList.remove("white");
  fadeEl.classList.add("on");
  busy(1.5);
  window.setTimeout(() => {
    halls.find((h) => h.hall === mazeHall)?.journey.leaveNow();
    const k = MAZE_HALL_OF[id];
    if (k !== undefined) {
      const o = halls[k].hall.outside();
      player.pos.set(o.x, o.y, o.z);
      player.heading = o.heading;
      void halls[k].journey.enter();
    } else if (id === "temple") {
      const o = temple.outside();
      player.pos.set(o.x, heightAt(o.x, o.z), o.z);
      crossTemple(true);
    } else if (id === "duat") {
      const o = pyramid.outside();
      player.pos.set(o.x, heightAt(o.x, o.z), o.z);
      crossPyr(true);
    } else {
      DESTS.find((q) => q.id === id)?.go();
      fadeEl.classList.remove("on");
    }
  }, 650);
}
function crossTemple(inside: boolean, then?: () => void): void {
  if (crossing) return;
  crossing = true;
  stopAuto();
  fadeEl.classList.add("on");
  audio.bell(inside ? 330 : 396, 0.12, 6);
  window.setTimeout(async () => {
    if (inside) busy(1.5);
    setInside(inside); // the temple is built as you go in, and freed as you come out
    if (then) {
      then(); // somewhere else than the door (the tree of life): set down there, still in the dark
      terrain.update(player.pos.x, player.pos.z, true);
    }
    // its shaders compile in the dark, never for long (whatever isn't ready compiles on its first draw)
    await compileInDark(); // in, the temple's shaders; out, the world's (its first frame back hitched)
    if (inside) whisper("The temple. The Mind on your left, the Body on your right; the Spirit beyond the gateway. The door behind you leads out.", 8000);
    window.setTimeout(() => {
      fadeEl.classList.remove("on");
      crossing = false;
    }, 250);
  }, 650);
}
// The cards, at the centre of the sanctuary: all twenty-two, each in three dimensions on the
// altar; ‹ › (or a swipe, or the arrow keys) to go through them, the strip to jump to one.
let cardIndex = 0;
const cardsEl = $("#cards"), cardsStrip = $("#cards-strip");
for (let i = 0; i < 22; i++) {
  if (i === 7 || i === 14 || i === 21) cardsStrip.append(Object.assign(document.createElement("span"), { className: "gap" }));
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = temple.cardInfo(i).numeral;
  b.setAttribute("aria-label", `${temple.cardInfo(i).numeral}, ${temple.cardInfo(i).name}`);
  b.addEventListener("click", () => setCard(i));
  cardsStrip.append(b);
}
function setCard(i: number): void {
  cardIndex = (i + 22) % 22;
  temple.showCard(cardIndex);
  const c = temple.cardInfo(cardIndex);
  $("#cards-title").textContent = `${c.numeral} · ${c.name}`;
  $("#cards-sub").textContent = c.realm ? `The ${c.place} of the ${c.realm}` : c.place;
  cardsStrip.querySelectorAll("button").forEach((b, k) => {
    b.setAttribute("aria-current", String(k === cardIndex));
    if (k === cardIndex) b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  });
  audio.bell(330 + (cardIndex % 7) * 33, 0.05, 3);
}
function openCards(): void {
  if (!temple.inside || temple.cardsOpen) return;
  temple.cardsOpen = true;
  player.target = null;
  cardsEl.hidden = false;
  $("#cards-offer").hidden = true;
  setCard(cardIndex);
}
function closeCards(): void {
  if (!temple.cardsOpen) return;
  temple.cardsOpen = false;
  cardsEl.hidden = true;
}
$("#cards-offer").addEventListener("click", openCards);
$("#cards-close").addEventListener("click", closeCards);
$("#cards-prev").addEventListener("click", () => setCard(cardIndex - 1));
$("#cards-next").addEventListener("click", () => setCard(cardIndex + 1));
addEventListener("keydown", (e) => {
  if (!temple.cardsOpen) return;
  if (e.key === "ArrowLeft") setCard(cardIndex - 1);
  else if (e.key === "ArrowRight") setCard(cardIndex + 1);
  else if (e.key === "Escape") closeCards();
});
{
  // a swipe across the view turns to the next card or the one before
  let sx = 0, sy = 0, sid = -1;
  addEventListener("pointerdown", (e) => {
    if (!temple.cardsOpen || (e.target as HTMLElement)?.closest?.("#cards, #menu, #tp, #tp-mini")) return;
    (sx = e.clientX), (sy = e.clientY), (sid = e.pointerId);
  });
  addEventListener("pointerup", (e) => {
    if (e.pointerId !== sid) return;
    sid = -1;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) setCard(cardIndex + (dx < 0 ? 1 : -1));
  });
}
/* ---- The temple's rites (world/rites.ts; Samuel: "an exploratory place for the spirit") ----
   Before each shrine: be with it (its rite), or hear it answer "Who are you?", its teaching, its
   practice (Samuel's recordings). In a rite you stand before it and make its gesture with it,
   while three things are said: an invitation, what it is, and a question to carry. Then its lamp
   is lit. A place lit in mind, body and spirit alike (I, VIII, XV; II, IX, XVI; …) is answered
   at the altar; when all twenty-one are lit, the Choice opens. Moving ends a rite, gently. */
const kindled = new Set<string>(saved?.journey?.kindled ?? []);
const synthDone = new Set<number>(saved?.journey?.synth ?? []);
for (let i = 0; i < 22; i++) if (kindled.has(temple.shrineInfo(i).numeral)) temple.kindle(i, true);
const shrineEl = $("#shrine"), riteWords = $("#rite-words"), riteEndBtn = $<HTMLButtonElement>("#rite-end");
const withEl = $("#with"), withLine = $("#with-line");
let shrineAt = -1;
let shrineSetAside = -1; // the shrine whose approach panel was closed (✕), until you step away
/* Being with a shrine: its own panel (its words as the rite speaks them, its three recordings,
   and "Go deeper", asked of the oracle through that shrine's archetype) */
const shrineDeeper = deeperField(
  () => (shrineAt >= 0 ? temple.shrineInfo(shrineAt) : null),
  undefined,
  // the carving's heart: a little under the framing point, which sits above its middle
  (out) => (shrineAt >= 0 && temple.frameFor(shrineAt, out) ? (out.y -= 2.0, 1.9) : 0),
);
$("#with-deeper").append(shrineDeeper);
keepToItself(withEl);
/** "The Catalyst of the Mind": an archetype's place among the seven, in its realm. */
function roleOf(numeral: string): string {
  const i = ARCHETYPES.findIndex((a) => a.numeral === numeral);
  if (i < 0 || i > 20) return "The Choice";
  return `${SEVEN[i % 7][1].replace(/^the /, "The ")} of the ${["Mind", "Body", "Spirit"][Math.floor(i / 7)]}`;
}
function openWith(i: number): void {
  const info = temple.shrineInfo(i);
  $("#with-title").textContent = `${info.numeral} · ${info.name}`;
  $("#with-role").textContent = roleOf(info.numeral);
  withLine.textContent = "";
  withLine.classList.remove("ask");
  (shrineDeeper.querySelector("textarea") as HTMLTextAreaElement).placeholder = `Ask ${info.name} to go deeper…`;
  withEl.hidden = false;
  document.body.classList.add("withing");
}
function closeWith(): void {
  withEl.hidden = true;
  document.body.classList.remove("withing");
}
type TRite = { i: number; phase: "walk" | "on" | "after"; t: number; step: number; next: number; clips: (AudioBuffer | null)[]; voice: { stop(f?: number): void } | null; lit?: boolean };
let trite: TRite | null = null;
let wordsOff = 0;
let riteDist = 7; // the view's distance before a rite, given back after
let spoken: { stop(f?: number): void } | null = null;
/** A line of the temple's words: shown low in the view, spoken if its recording is there. */
function templeWords(text: string, clip: AudioBuffer | null, ask = false): number {
  if (!withEl.hidden) {
    // being with a shrine: its words are in its panel, where they stay to be read
    withLine.textContent = text;
    withLine.classList.toggle("ask", ask);
    withLine.classList.remove("in");
    void withLine.offsetWidth;
    withLine.classList.add("in");
  } else {
    riteWords.textContent = text;
    riteWords.classList.toggle("ask", ask);
    riteWords.classList.add("on");
  }
  spoken?.stop(0.6);
  spoken = clip ? audio.playClip(clip, 0.95) : null;
  // no recording: in the phone's own voice when reading aloud is on (a little slower than reading)
  const aloud = !clip && sayAloud(text);
  const dur = clip ? clip.duration : text.length / (aloud ? 12 : 14);
  wordsOff = S.t + Math.max(5, dur + 2.2);
  return dur;
}
const litCount = () => [...kindled].filter((n) => n !== "XXII").length;
function beginTempleRite(i: number): void {
  if (trite || !temple.inside) return;
  const info = temple.shrineInfo(i);
  if (info.numeral === "XXII" && litCount() < 21) {
    whisper(`The Choice waits until the other lamps are lit. ${litCount()} of twenty-one.`, 5000);
    return;
  }
  closeCards();
  narration.stop(1);
  if (tp.active) tp.close();
  const st = temple.standFor(i);
  player.target = new THREE.Vector2(st.x, st.z);
  riteDist = follow.dist;
  temple.quietStage = i >= 14;
  trite = { i, phase: "walk", t: 0, step: 0, next: 0, clips: [null, null, null], voice: null };
  shrineEl.hidden = true;
  openWith(i);
}
function endTempleRite(done: boolean): void {
  const r = trite;
  if (!r) return;
  trite = null;
  temple.quietStage = false;
  temple.setRite(r.i, false);
  wanderer.echo.rite = 0;
  follow.dist = riteDist;
  closeWith();
  shrineAt = -1; // the approach panel comes back if you are still before it
  if (!done || r.lit) {
    if (!done) spoken?.stop(1.5);
    riteWords.classList.remove("on");
    return;
  }
  lightLamp(r.i);
}
/** The rite's three things said: its lamp burns, and a place lit in all three realms wakes the altar. */
function lightLamp(i: number): void {
  const r = { i };
  const info = temple.shrineInfo(r.i);
  temple.kindle(r.i);
  audio.bell(396, 0.07, 6);
  const fresh = !kindled.has(info.numeral);
  kindled.add(info.numeral);
  persist();
  if (fresh) whisper(`The lamp of ${info.name} is lit.`, 4500);
  // a place lit in all three realms: the altar answers (Ra's grouping, 88.24)
  if (r.i < 21) {
    const p = r.i % 7;
    const three = [p, p + 7, p + 14];
    if (!synthDone.has(p) && three.every((k) => kindled.has(temple.shrineInfo(k).numeral))) {
      synthDone.add(p);
      persist();
      window.setTimeout(() => synthesis(p, three), 7000);
    }
  }
}
function synthesis(p: number, three: number[]): void {
  temple.synthesis(three.map((k) => temple.shrineInfo(k).tint));
  [294, 440, 587].forEach((f, k) => window.setTimeout(() => audio.bell(f, 0.06, 9), k * 700));
  templeWords(SYNTHESES[p], null);
  if (litCount() >= 21 && !synthDone.has(7)) {
    synthDone.add(7);
    persist();
    window.setTimeout(() => templeWords(SYNTHESES[7], null, true), 16000);
  }
}
function riteFrame(dt: number): void {
  if (S.t > wordsOff) riteWords.classList.remove("on");
  const echo = wanderer.echo;
  if (!trite) {
    echo.k = Math.max(0, echo.k - dt * 0.8);
    if (echo.k === 0) echo.sig = null;
    const i = temple.inside && !temple.cardsOpen && !crossing && !tourScenes.tour.active && sitting.phase === "none" ? temple.nearShrine(player.pos) : -1;
    if (i < 0) shrineSetAside = -1;
    if (i !== shrineAt) {
      shrineAt = i;
      shrineEl.hidden = i < 0 || i === shrineSetAside;
      if (i >= 0) {
        const info = temple.shrineInfo(i);
        $("#shrine-title").textContent = `${info.numeral} · ${info.name}`;
        const lit = kindled.has(info.numeral);
        const locked = info.numeral === "XXII" && litCount() < 21;
        $("#shrine-be").textContent = locked ? `Waiting · ${litCount()} of 21 lamps` : lit ? "Be with it again" : "Be with it";
        $("#shrine-role").textContent = roleOf(info.numeral);
      }
    }
    return;
  }
  const r = trite;
  r.t += dt;
  const info = temple.shrineInfo(r.i);
  const st = temple.standFor(r.i);
  if (r.phase === "walk") {
    const d = Math.hypot(player.pos.x - st.x, player.pos.z - st.z);
    if (d < 0.35 || r.t > 7 || (player.target === null && d < 1.5)) {
      player.pos.x = st.x;
      player.pos.z = st.z;
      player.target = null;
      player.heading = st.heading;
      follow.yaw = st.heading;
      r.phase = "on";
      r.t = 0;
      r.next = 1.8;
      temple.setRite(r.i, true);
      audio.bell(264 + (r.i % 7) * 33, 0.06, 7);
      // the Hanged Man is met in stillness; everyone else, by making their gesture with them
      echo.sig = SIGNATURES[info.numeral === "XII" ? "II" : info.numeral] ?? null;
    } else if (player.target === null) endTempleRite(false); // the stick took over
    return;
  }
  // moving (the stick, the button, a tap on the floor) ends it, gently
  if (Math.hypot(input.move.x, input.move.y) > 0.3 || input.hold || player.target) {
    endTempleRite(r.step >= 3);
    return;
  }
  player.heading = st.heading;
  // the view settles behind you and a little above, both of you in it, the words on the floor
  follow.yaw += Math.atan2(Math.sin(st.heading - follow.yaw), Math.cos(st.heading - follow.yaw)) * Math.min(1, dt * 0.8);
  follow.pitch += (0.3 - follow.pitch) * Math.min(1, dt * 0.8);
  follow.dist += (Math.max(riteDist, 5.5) - follow.dist) * Math.min(1, dt * 0.8);
  echo.t = S.wt;
  echo.rt = r.t;
  echo.rite = Math.min(1, Math.max(0, (r.t - 4) / 4));
  echo.k = Math.min(0.85, echo.k + dt * 0.25);
  const rite = RITES[info.numeral];
  if (r.phase === "on" && r.t >= r.next) {
    if (r.step < 3) {
      const text = [rite.invite, rite.line, rite.ask][r.step];
      const dur = templeWords(text, r.clips[r.step], r.step === 2);
      r.next = r.t + Math.max(r.step === 0 ? 9 : 8, dur + (r.step === 2 ? 7 : 3.5));
      r.step++;
    } else {
      // all three said: its lamp is lit, and you stay with it as long as you like (Return, or walk on)
      r.phase = "after";
      r.lit = true;
      lightLamp(r.i);
    }
  }
}
const shrineDo = (fn: (n: string) => void) => (e: Event) => {
  e.preventDefault();
  if (shrineAt < 0) return;
  fn(temple.shrineInfo(shrineAt).numeral);
};
const shrineSpeak = (id: (n: string) => string) =>
  shrineDo((n) => {
    if (tp.active) tp.close();
    const b = temple.shrineInfo(shrineAt);
    whisper(`${b.numeral} · ${b.name}`, 3000);
    void narration.play(id(n));
  });
$("#shrine-be").addEventListener("pointerdown", shrineDo(() => beginTempleRite(shrineAt)));
$("#shrine-who").addEventListener("pointerdown", shrineSpeak((n) => trackId(n, "who")));
$("#shrine-teach").addEventListener("pointerdown", shrineSpeak(walkId));
$("#shrine-life").addEventListener("pointerdown", shrineSpeak(heartId));
riteEndBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  endTempleRite(false);
});
// the same from the keyboard (Enter or Space make a click with no pointer)
for (const id of ["#shrine-be", "#shrine-who", "#shrine-teach", "#shrine-life", "#rite-end"]) {
  $(id).addEventListener("click", (e) => {
    if ((e as MouseEvent).detail === 0) $(id).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
  });
}

// the view moves to the altar while the cards are open, and back after
let cardsView = 0;
const cardCam = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
const cardLook = new THREE.PerspectiveCamera(); // a camera, so lookAt turns its -z (not +z) to the target
const followPos = new THREE.Vector3(), followQuat = new THREE.Quaternion();
function cardsCamera(dt: number): void {
  cardsView += ((temple.cardsOpen ? 1 : 0) - cardsView) * Math.min(1, dt * 1.8);
  if (cardsView < 0.001) return;
  temple.cardView(cardCam);
  cardLook.position.copy(cardCam.pos);
  cardLook.lookAt(cardCam.target);
  followPos.copy(camera.position);
  followQuat.copy(camera.quaternion);
  const k = cardsView * cardsView * (3 - 2 * cardsView);
  camera.position.lerpVectors(followPos, cardCam.pos, k);
  camera.quaternion.slerpQuaternions(followQuat, cardLook.quaternion, k);
}

/** Each frame: through the pylon's door, in; out through the temple's door, out; the air inside. */
/* The Choice's room: one shrine, one seat. Walking onto the seat sits you and the Choice's part of
   the temple's recording plays through its landing; standing up stops it. Afterwards, a few quiet
   questions, far apart (the owner's "what is your choice?"; the rest ours). */
const CHOICE_ASK = ["What is your choice?", "How will you love?", "Stay as long as you like."];
const choiceSit = { on: false, off: true, after: 0, asked: 0 };
function choiceFrame(): void {
  const seat = temple.choiceSeat();
  if (choiceSit.on) {
    if (sitting.phase !== "seated" || tourScenes.tour.active || !temple.inside) {
      choiceSit.on = false;
      choiceSit.off = false;
      temple.setFocus(-1);
      if (narration.current === TEMPLE_TRACK) narration.stop(1.5);
      return;
    }
    if (narration.current !== TEMPLE_TRACK) {
      if (!choiceSit.after) choiceSit.after = S.t;
      else if (choiceSit.asked < CHOICE_ASK.length && S.t - choiceSit.after > 5 + choiceSit.asked * 30) whisper(CHOICE_ASK[choiceSit.asked++], 8000);
    }
    return;
  }
  if (tourScenes.tour.active || trite || sitting.phase !== "none") return;
  const d = Math.hypot(player.pos.x - seat.x, player.pos.z - seat.z);
  if (d > 1.3) choiceSit.off = true;
  else if (choiceSit.off) {
    Object.assign(choiceSit, { on: true, off: false, after: 0, asked: 0 });
    const st = temple.standFor(21);
    Object.assign(sitting, { phase: "seated", since: 0, asked: false });
    player.pos.set(seat.x, seat.y, seat.z);
    player.target = null;
    player.vel.set(0, 0, 0);
    player.heading = st.heading;
    wanderer.setGesture("sit");
    faceYaw = st.heading;
    faceFor = 2.5;
    temple.setFocus(21);
    void narration.play(TEMPLE_TRACK, CUES[24].t, FINALE_T);
  }
}
function templeFrame(dt: number): void {
  temple.update(S.wt, dt, player.pos, S.reduced);
  // the view never stands behind a wall (the temple's walls as they are now: it is rebuilt per visit)
  follow.blockers = temple.inside ? temple.blockers : apart() ? apartBlockers() : NO_BLOCKERS;
  if (S.mode !== "play") return;
  installFrame();
  if (temple.inside) {
    if (temple.confine(player.pos) && !crossing) crossTemple(false);
    if (player.flying) player.flying = false; // no flight in the temple: you walk here
    riteFrame(dt);
    choiceFrame();
    $("#cards-offer").hidden = temple.cardsOpen || !temple.nearCards(player.pos) || crossing || shrineAt >= 0 || !!trite || tourScenes.tour.active;
    // the air inside: warm, dim, a little dust in the light
    fogUniforms.color.value.setRGB(0.09, 0.065, 0.045);
    fogUniforms.glow.value.setRGB(0.3, 0.22, 0.15);
    fogUniforms.density.value = 0.004;
    // the temple's own grade: warm stone, shadows a little deeper
    gradeUniforms.shadow.value.setRGB(0.02, 0.008, 0.0);
    gradeUniforms.high.value.setRGB(1.06, 1.0, 0.9);
    gradeUniforms.sat.value = 1.05;
    gradeUniforms.contrast.value = 1.1;
    post.starVis.value = 0;
    post.raysOn.value = 0;
    return;
  }
  $("#cards-offer").hidden = true;
  if (trite) endTempleRite(false);
  if (shrineAt >= 0) (shrineAt = -1), (shrineEl.hidden = true);
  if (depths.inside || pyramid.isInside) return; // the deep archive and the pyramid keep their own
  const d = player.pos.distanceTo(temple.gateAt);
  if (!toldGate && d < 30) {
    toldGate = true;
    whisper("A temple. Walk through its door.", 5000);
  }
  // a walk passing by on its way elsewhere is not taken in (leaving the temple for the pyramid it
  // went back through the door, and the temple's tour began again)
  const passing = !!walk && walk.stops[walk.i]?.place !== "temple";
  if (d < 6 && !crossing && !passing && !autofly.active && sitting.phase !== "seated" && temple.atGateDoor(player.pos)) crossTemple(true);
}

// Autofly (⋮ → Autofly, or P): the wanderer flies by itself, low over the land from place to
// place, then up among the planets and stars, and down again (player/autofly.ts).
const autofly = new Autofly(
  [...GROVE_SITES.map((g) => ({ x: g.x, z: g.z })), ...LANDMARK_SITES.map(([x, z]) => ({ x, z }))],
  ORB_SITES.map((o) => ({ x: o.x, z: o.z })),
);
function setAutofly(on: boolean): void {
  if (isTv && !on) return;
  if (on === autofly.active) return;
  if (on) {
    if (S.mode !== "play" || sitting.phase === "seated" || tourScenes.movementHeld || player.diving || apart()) return;
    player.target = null;
    if (autorun.active) setAutorun(false);
    autofly.start(player.pos, player.heading);
    say("Autofly: the stick or the button takes you back.");
  } else {
    autofly.stop();
    player.vy = 0;
  }
  $("#autofly").setAttribute("aria-pressed", String(on));
  $("#auto").setAttribute("aria-pressed", String(on || autorun.active));
}
/* Auto-walk and square breathing (v5 item 3): the wanderer goes on by itself on foot (Autorun),
   or flies (Autofly); while either carries you, a ring of gold motes breathes round you, in, hold,
   out, rest (world/breath.ts; Aria's cues when they exist). The stick, the button or a tap takes
   over; the small ring button (bottom right, or O) takes you on again: on foot, or in the air when
   flying. */
const autorun = new Autorun([...GROVE_SITES.map((g) => ({ x: g.x, z: g.z })), ...LANDMARK_SITES.map(([x, z]) => ({ x, z }))]);
const breath = new BreathGuide(audio);
scene.add(breath.group);
function setAutorun(on: boolean): void {
  if (isTv || on === autorun.active) return;
  if (on) {
    if (S.mode !== "play" || sitting.phase === "seated" || tourScenes.movementHeld || player.swimming || player.flying || apart()) return;
    if (autofly.active) setAutofly(false);
    player.target = null;
    autorun.start(player.pos, player.heading);
    say("Walking on by itself: the stick or the button takes you back.");
  } else autorun.stop();
  $("#auto").setAttribute("aria-pressed", String(on || autofly.active));
}
function stopAuto(): void {
  if (autofly.active) setAutofly(false);
  if (autorun.active) setAutorun(false);
}
/** The ring button: on again (in the air, autofly; on the land, auto-walk), or off. */
function toggleAuto(): void {
  if (autofly.active || autorun.active) return stopAuto();
  if (player.flying) setAutofly(true);
  else setAutorun(true);
}
$("#auto").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  toggleAuto();
});
addEventListener("keydown", (e) => {
  if (isTv) return;
  if (e.key.toLowerCase() === "o" && !e.repeat && S.mode === "play" && !(e.target as HTMLElement)?.closest?.("input, #menu")) toggleAuto();
});
let autoShown = false;
const keyHints = new KeyHints();
function autoFrame(dt: number): void {
  const show = !$("#menu-btn").hidden && !apart() && S.mode === "play";
  if (show !== autoShown) $("#auto").hidden = !(autoShown = show);
  const on = autofly.active || autorun.active;
  breath.set(on);
  // the voice rests for "Only nature", and while another voice is speaking
  breath.update(dt, player.pos, playlist.on && !narration.progress() && !tp.playing);
  breathCueFrame();
}
/* The side of the square, over the view while you breathe: the lungs and one word, Breathe in, Hold,
   Release, Wait (the owner: "remove numbers… just make the lungs breathe, hold, release, wait"). The first time on this device, a line
   under it says what square breathing is, for its first two rounds. */
const cueEl = $("#breath-cue"), cueWord = cueEl.querySelector(".word") as HTMLElement, cueExplain = cueEl.querySelector(".explain") as HTMLElement;
const CUE_WORDS: Record<string, string> = { in: "Breathe in", hold: "Hold", out: "Release", rest: "Wait" };
const lungs = new LungParticles(cueEl.querySelector("canvas.lungs") as HTMLCanvasElement);
let cueOn = false, cueWordNow = "", cueExplaining = false;
let breathExplained = false;
try {
  breathExplained = localStorage.getItem("inward-journey:breath-explained") === "1";
} catch {
  /* not remembered: explained again next time */
}
/** The overlay comes and goes (the owner: "fade in and out… doesn't need to be on all the time"):
    shown for the first rounds, then resting a while, then back for a few rounds, and so on. */
const CUE_SHOW = 3, CUE_REST = 4;
function breathCueFrame(): void {
  // shown as soon as the breath begins: the lungs settle and "Breathe with me" waits for the first count
  const round = Math.max(0, breath.cycles - 1) % (CUE_SHOW + CUE_REST);
  const on = breath.active && S.mode === "play" && (!breath.counting || round < CUE_SHOW);
  if (on !== cueOn) cueEl.classList.toggle("on", (cueOn = on));
  if (!on) {
    if (cueExplaining && !breath.active) cueExplain.classList.remove("on"), (cueExplaining = false);
    return;
  }
  // the lungs, in lights, fill, hold and empty with the ring of light
  lungs.draw(breath.open, breath.counting ? breath.phase : "wait", S.reduced);
  cueEl.classList.toggle("counting", breath.counting);
  if (!breath.counting) {
    if (cueWordNow !== "wait") (cueWord.textContent = "Breathe with me"), (cueWordNow = "wait");
    return;
  }
  const word = CUE_WORDS[breath.phase] ?? "";
  if (word !== cueWordNow) {
    // each side's word arrives softly, out of a little blur, as the lungs turn
    cueWord.textContent = cueWordNow = word;
    cueWord.classList.remove("arrive");
    void cueWord.offsetWidth;
    cueWord.classList.add("arrive");
  }
  // the first time: what square breathing is, for the first two rounds
  const explain = !breathExplained && breath.cycles <= 2;
  if (explain && !cueExplaining) {
    cueExplain.textContent = "Square breathing: breathe in, hold, release, wait, and again, each as long as the others. Let your lungs fill and empty with the light.";
    cueExplain.classList.add("on");
    cueExplaining = true;
  } else if (!explain && cueExplaining) {
    cueExplain.classList.remove("on");
    cueExplaining = false;
    if (!breathExplained) {
      breathExplained = true;
      try {
        localStorage.setItem("inward-journey:breath-explained", "1");
      } catch {
        /* fine */
      }
    }
  }
}
$("#autofly").addEventListener("click", () => {
  setAutofly(!autofly.active);
  setMenu(false);
});
addEventListener("keydown", (e) => {
  if (isTv) return;
  if (e.key.toLowerCase() === "p" && !e.repeat && S.mode === "play" && !(e.target as HTMLElement)?.closest?.("input, #menu")) setAutofly(!autofly.active);
});

// The wanderer's heart, where a double tap opens its notes (and, in the water, where the orb is).
const heartScreen = new THREE.Vector3();
const HEART_UP = new THREE.Vector3(0, 1.15, 0);
function heartAt(out: THREE.Vector3): THREE.Vector3 {
  return out.copy(player.pos).add(HEART_UP);
}
input.onHold = (x, y) => (canTouch() || sanct.building ? beginTouch(x, y) : beginHoverBuild());
// building's own touches: a stroke on the sanctuary's earth, a touch on a form (world/sanctuary.ts)
input.capture = sanct.capture;

/* The heart's notes (ui/heart.ts): a double tap on the wanderer's heart, or H, opens a note; they
   are kept on this device only. ⋮ → My Heart lists them; a small ♥ rests at the edge of the view
   while seated or laying hands. The oracle (ui/oracle.ts) is offered at the Choice's seat and at
   the maze's still centre. */
const myHeart = new Heart();
const oracle = new Oracle();
watchKeyboard();
myHeart.place = () => {
  // the place in the game's own words (no ids, no metres)
  const h = inHall();
  if (h) return h.journey.stage && h.journey.inside ? h.journey.stage.title : h.hall.label;
  if (temple.inside) return "The temple";
  if (pyramid.isInside) return player.pos.distanceTo(DUAT_ORIGIN) < 260 ? "The Duat" : "The pyramid";
  if (depths.inside) return "The archive of the heart";
  { const u = under(); if (u) return u.chamber(player.pos)?.name ?? u.spec.label; }
  let best: Place | null = null, bd = Infinity;
  for (const p of places()) {
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (d < bd) (bd = d), (best = p);
  }
  return best && bd < 160 ? best.label : "The world";
};
myHeart.onSaved = () => audio.bowl(330, 0.03);
oracle.onKept = () => audio.bowl(330, 0.03);
/* the oracle summoned in the world (world/oracleVision.ts): a body of light ahead of the view,
   brought nearer where something solid stands closer (the temple's small room, a corridor) */
const oracleRay = new THREE.Raycaster();
const oracleHits: THREE.Intersection[] = [];
const oracleVision = new OracleVision(scene, camera, (from, dir, near, max) => {
  // the first solid surface along the way (the wanderer's own body is skinned, so it is passed)
  oracleRay.set(from, dir);
  oracleRay.near = near;
  oracleRay.far = max;
  let best = max;
  const look = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) {
      oracleHits.length = 0;
      try {
        oracleRay.intersectObject(m, false, oracleHits);
      } catch {
        /* a mesh that can't be tested is passed */
      }
      for (const h of oracleHits) if (h.distance < best) best = h.distance;
    }
    for (const c of o.children) look(c);
  };
  look(scene);
  return best;
}, () => player.pos);
oracle.presence = {
  summon: () => oracleVision.summon(follow.overhead !== null),
  dismiss: () => oracleVision.dismiss(),
  setState: (s) => oracleVision.setState(s),
  pulse: () => oracleVision.pulse(),
};
myHeart.say = (t) => whisper(t, 3200);
function openHeart(): void {
  if (S.mode !== "play" || oracle.isOpen || reader.current) return;
  myHeart.openCompose();
}
input.onHeart = openHeart;
// the phone's voice would not start: say so where the words are
onSpeechFail((m) => (oracle.isOpen ? oracle.note(m) : whisper(m, 8000)));
let lastHeartTap = 0;
/** A double tap (within 350 ms) on the wanderer's heart opens a note. In the water the orb's own
    double tap (down to the floor) comes first. */
function tapOnHeart(x: number, y: number): boolean {
  if (player.swimming) return false;
  heartAt(heartScreen).project(camera);
  const sx = (heartScreen.x * 0.5 + 0.5) * innerWidth, sy = (-heartScreen.y * 0.5 + 0.5) * innerHeight;
  if (heartScreen.z >= 1 || Math.hypot(x - sx, y - sy) > Math.max(70, innerHeight * 0.09)) return false;
  // only the second tap is taken: a single tap near the wanderer still walks there (in the maze,
  // seen from above, the walker is small and most short taps land near it)
  const now = performance.now();
  if (now - lastHeartTap < 350) {
    lastHeartTap = 0;
    openHeart();
    return true;
  }
  lastHeartTap = now;
  return false;
}
/** Each frame: the small ♥ while seated or laying hands; the oracle's offer at the Choice (once
    its part has been spoken) and at the maze's still centre. */
function heartFrame(): void {
  const play = S.mode === "play" && !crossing;
  myHeart.affordance(play && (sitting.phase === "seated" || touch.active || S.t < heartInviteUntil));
  const atChoice = choiceSit.on && choiceSit.after > 0 && S.t - choiceSit.after > 4;
  const atCentre = sitting.phase === "seated" && inHall()?.hall === mazeHall;
  oracle.offerAt(play && !myHeart.open ? (atChoice ? "At the Choice" : atCentre ? "At the still centre" : null) : null);
}

// Laying hands on the world: hold a finger on a tree, a stone, a crystal or the ground
// (world/touch.ts). The wanderer goes to it, kneels or embraces it, and they talk in light.
const touch = new Touch(creation, wanderer, player, {
  // in the meditation's dark, the conversation's notes rest under the guidance
  bell: (f, g, d) => !med.covered && !sanct.building && audio.bell(f, g, d),
  sparks: (at, n, c, spread) => sparks.emit(at, n, c, spread),
});
scene.add(touch.points);
/* The meditation (world/meditation.ts): holding on a rock, a tree or a crystal, the eyes close
   into the dark, three slow square breaths with the lungs and a soft wind, and the world comes back
   quietly. A rock meditation run to its end gives its stone (stone-essence): it
   gathers out of the rock once the world is back, and comes to you. */
const chestAt = new THREE.Vector3();
let medRock: { contact: THREE.Vector3; centre: THREE.Vector3; r: number } | null = null;
let medStoneAt = 0;
let heartInviteUntil = 0;
const med = new Meditation({
  wind: (k) => audio.wind(k),
  rise: () => touch.stop(),
  completed: () => {
    if (medRock) medStoneAt = S.t + 3.2;
  },
  invite: () => {
    // the small heart, twice, softly: if something moved, write it down
    heartInviteUntil = S.t + 9;
    const m = document.getElementById("heart-mini");
    if (m) {
      m.classList.remove("blink");
      void m.offsetWidth;
      m.classList.add("blink");
    }
  },
});
function medFrame(dt: number): void {
  // the hold let go another way (the stick, T again, flight): the meditation goes with it
  if ((med.phase === "closing" || med.phase === "inner" || med.phase === "guiding") && touch.phase === "none") med.release();
  // its clock is real time (the frame's dt is capped, and the world is drawn slowly under the dark)
  med.update(Math.min(0.25, realDt || dt));
  // the narrator leaves the silence alone: through the meditation and for a while after it
  if (med.active) playlist.rest(150);
  if (medStoneAt && S.t >= medStoneAt && medRock) {
    medStoneAt = 0;
    sanct.formStone(medRock.contact, medRock.centre, medRock.r, () => heartAt(chestAt));
    medRock = null;
  }
}
// the hold only begins it (the finger may lift): its ✕ or the stick leaves early
input.onHoldEnd = null;
// a touch during the quiet view after brings the controls back
addEventListener("pointerdown", () => med.wake(), { capture: true });
/* stills: `?shot=meditation` (the inner body in the dark, its lungs mid-breath),
   `meditation-after` (the quiet view just after: the wanderer by its rock, hushed, no controls) */
// the archive of the heart in a still (`?shot=archive`): forty sample notes over a year, the view
// among them a third of the way in
(window as unknown as { __archiveShot?: () => { base: [number, number, number]; view: { eye: [number, number, number]; look: [number, number, number] } } }).__archiveShot = () => {
  setDeep(true);
  const t0 = Date.UTC(2025, 9, 1);
  depths.setNotes(Array.from({ length: 40 }, (_, i) => ({ text: `A sample memory, the ${i + 1}th.`, createdAt: t0 + i * 9.1 * 86400e3 + (i % 3) * 3600e3, scene: "the shore" })));
  const a = depths.nodeWorld(11, new THREE.Vector3())!, b = depths.nodeWorld(15, new THREE.Vector3())!;
  const base: [number, number, number] = [a.x, a.y - 0.6, a.z];
  player.pos.set(...base);
  return { base, view: { eye: [-(b.x - a.x) * 0.35, 0.5, -(b.z - a.z) * 0.35], look: [b.x - a.x, b.y - a.y + 0.2, b.z - a.z] } };
};
(window as unknown as { __medShot?: (id: string) => void }).__medShot = (id) => {
  if (id === "meditation") med.hold("inner", 2.6);
  else {
    touch.stop(); // risen
    med.hold("quiet");
  }
};
/* Building (world/sanctuary.ts): a hold on open ground, and the wanderer goes there and kneels
   with a palm on the earth; once settled, the build screen opens round that spot (the view rises
   over it). Done stands the wanderer up again. */
let buildPending: { since: number } | null = null;
/** Building on the water, under it or in the air: the wanderer holds still where it is (no kneeling:
    there is no earth to kneel on) while the build screen is open. */
let buildHover: THREE.Vector3 | null = null;
sanct.onDone = () => {
  sanct.close();
  touch.stop();
  buildHover = null;
};
/** A hold while flying or in the water opens building there: in the air and on the water a floating
    foundation (disc or sphere) under you, under the water on the lake floor below. */
function beginHoverBuild(): void {
  if (S.mode !== "play" || sanct.building || apart() || autofly.active || sitting.phase !== "none" || startMap.isOpen) return;
  if (!player.flying && !player.swimming) return;
  stopAuto();
  touch.stop();
  const p = player.pos;
  buildHover = p.clone();
  const yaw = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
  if (player.flying) sanct.open(p, { yaw, level: p.y - 0.4 });
  else if (player.diving || player.seabed) sanct.open(p, { yaw });
  else sanct.open(p, { yaw, level: WATER_Y + 0.15 });
  audio.bell(330, 0.016, 2.4);
}
function buildFrame(): void {
  input.captureAll = sanct.building;
  if (buildPending) {
    const tg = touch.target;
    if (!tg || touch.phase === "none" || S.t - buildPending.since > 14) buildPending = null;
    else if (touch.phase === "touching" && S.t - buildPending.since > 1.2 && player.speed < 0.3) {
      buildPending = null;
      sanct.open(tg.contact, { yaw: Math.atan2(camera.position.x - tg.contact.x, camera.position.z - tg.contact.z) });
    }
  }
  // building rests when the wanderer is taken elsewhere (the map, a place apart, the water, the air)
  if (sanct.building && (apart() || (!buildHover && (player.flying || player.swimming)) || startMap.isOpen || S.mode !== "play")) {
    sanct.close();
    touch.stop();
  }
  if (!sanct.building) buildHover = null;
}
let toldTouch = false;
let toldTend = false;
let tending: { tree: Garden["trees"][number]; t: number } | null = null;
/** Tending a planted tree: while the hands are on it the ring fills; closed, it grows a stage. */
function tendFrame(dt: number): void {
  if (!tending) return garden.tend(null, 0, 0);
  const tr = tending.tree;
  if (touch.phase === "none") {
    tending = null;
    garden.tend(null, 0, 0);
    return;
  }
  if (touch.phase !== "touching") return garden.tend(tr, 0, 0.6);
  tending.t += dt;
  garden.tend(tr, tending.t / TEND_CYCLE, 1);
  if (tending.t >= TEND_CYCLE) {
    const st = garden.growUp(tr);
    const top = new THREE.Vector3(tr.x, tr.y + 0.6 + st * 1.2, tr.z);
    sparks.emit(top, 34, new THREE.Color(0.8, 1, 0.62), 1.4);
    sparks.emit(top, 20, new THREE.Color(1, 0.84, 0.55), 2.2);
    for (const [f, d] of [[392, 0], [493.88, 0.25], [587.33, 0.5]] as const) window.setTimeout(() => audio.bell(f, 0.02, 4), d * 1000);
    whisper(`It grew into ${STAGE_NAMES[st]}.`, 4500);
    tending = null;
    touch.stop();
    garden.tend(null, 1, 0);
  }
}
function canTouch(): boolean {
  return S.mode === "play" && player.grounded && !player.swimming && !player.flying && !apart() &&
    !autofly.active && sitting.phase === "none" && !startMap.isOpen;
}
/** Building begins with a hold on open ground: the wanderer kneels there, and the build screen
    opens round it (buildFrame). */
function beginBuild(x: number, y: number): void {
  const g = groundPoint(x, y);
  if (!g || g.y <= WATER_Y + 0.05 || g.distanceTo(player.pos) > 36) return;
  stopAuto();
  touch.stop();
  touch.touchThing("ground", g, 0, 0);
  buildPending = { since: S.t };
  audio.bell(330, 0.016, 2.4);
  const mark = Object.assign(document.createElement("div"), { className: "touch-mark" });
  mark.style.left = `${x}px`;
  mark.style.top = `${y}px`;
  document.body.append(mark);
  window.setTimeout(() => mark.remove(), 1400);
}
function beginTouch(x: number, y: number, earth = false): void {
  if (sanct.building || !canTouch()) return;
  // a tree, a stone, a crystal under the finger: laying hands; open ground: building (the T key
  // still kneels to the earth)
  if (!touch.pick(x, y, camera, earth ? groundPoint(x, y) : null)) {
    if (!earth) beginBuild(x, y);
    return;
  }
  // a tree you planted: tended, in the open (no dark), its ring filling round it
  {
    const tg0 = touch.target!;
    const pt = tg0.kind === "tree" ? garden.at(tg0.centre.x, tg0.centre.z) : null;
    if (pt) {
      if (garden.small(pt)) {
        // a sapling: kneel by it, a palm on the earth at its foot
        touch.stop();
        const a = Math.atan2(player.pos.x - pt.x, player.pos.z - pt.z);
        touch.touchThing("ground", new THREE.Vector3(pt.x + Math.sin(a) * 0.35, pt.y, pt.z + Math.cos(a) * 0.35), 0, 0);
      }
      tending = { tree: pt, t: 0 };
      audio.bell(392, 0.02, 2);
      if (!toldTend) {
        toldTend = true;
        whisper("Stay with it. The ring fills as you tend it; when it closes, it grows.", 6000);
      }
      return;
    }
  }
  // the eyes begin to close
  const tg = touch.target!;
  medRock = tg.kind === "rock" ? { contact: tg.contact.clone(), centre: tg.centre.clone(), r: tg.r } : null;
  medStoneAt = 0;
  med.begin(tg.kind === "tree" ? "the tree" : tg.kind === "crystal" ? "the crystal" : tg.kind === "ground" ? "the earth" : "the stone");
  // a small ring where the finger rests: the press was heard
  const mark = Object.assign(document.createElement("div"), { className: "touch-mark" });
  mark.style.left = `${x}px`;
  mark.style.top = `${y}px`;
  document.body.append(mark);
  window.setTimeout(() => mark.remove(), 1400);
  audio.bell(392, 0.02, 2);
  if (!toldTouch) {
    toldTouch = true;
    const what = touch.target?.kind === "tree" ? "the tree" : touch.target?.kind === "ground" ? "the earth" : touch.target?.kind === "crystal" ? "the crystal" : "the stone";
    whisper(`Stay a while with ${what}. The stick lets go.`, 6000);
  }
}
addEventListener("keydown", (e) => {
  // T: lay hands on what is just ahead
  if (e.key.toLowerCase() !== "t" || e.repeat || (e.target as HTMLElement)?.closest?.("input, #menu")) return;
  if (touch.active) touch.stop();
  else beginTouch(innerWidth / 2, innerHeight * 0.6, true);
});
player.onLand = () => {
  if (!player.swimming) wanderer.land();
  if (!apart()) audio.step(false); // inside, no steps: only the place's own sound (Samuel)
};
lanterns.onKindle = () => say("Lanterns kindle around you.");

/* The welcome (the owner's words on what this place is and how it is meant to be used, and one
   line of how to move): under the title the first time only, over the world as it finishes
   loading; the touch on the water is still the one way in. Afterwards it lives in ⋮ → Welcome. */
const WELCOMED = "inward-journey:welcomed";
const welcomeHint = MOBILE
  ? "Your left thumb moves you, a drag anywhere else looks around, and a tap on what glows lets it speak."
  : "Move with W A S D or the arrow keys, drag to look around, and click on what glows to let it speak.";
for (const el of document.querySelectorAll(".w-hint")) el.textContent = welcomeHint;
let firstWelcome = false;
try {
  firstWelcome = !localStorage.getItem(WELCOMED);
} catch {
  firstWelcome = true;
}
if (firstWelcome) {
  $("#welcome").hidden = false;
  $("#title").classList.add("first");
}
/* What Inland is (ui/intro.ts), and keeping it as an app: ⋮ → "What is Inland?", ⋮ → "Add to
   Home Screen", and the small link under the title on the water. */
const install = new Install();
const intro = buildIntro(install, () => $("#howto-open").click());
$("#welcome-open").addEventListener("click", () => {
  setMenu(false);
  intro.open();
});
$("#install-open").hidden = isStandalone();
$("#install-open").addEventListener("click", () => {
  setMenu(false);
  install.show(true);
});
// the link sits over the water's own touch, so it keeps its touch to itself
for (const ev of ["pointerdown", "pointerup", "touchstart"]) $("#intro-link").addEventListener(ev, (e) => e.stopPropagation());
$("#intro-link").addEventListener("click", (e) => {
  e.stopPropagation();
  intro.open();
});
/** Once a journey is under way (not straight away, never over a tour or a panel), the card offers
    to keep Inland as an app; at most once a week, never once it is one. */
let installOffered = false;
const introLink = $("#intro-link");
function installFrame(): void {
  if (S.mode === "play" && !introLink.hidden) introLink.hidden = true; // only ever on the water's title
  if (installOffered || isStandalone() || S.mode !== "play" || S.t < 50) return;
  if (!(MOBILE || install.canPrompt)) return;
  if (document.body.classList.contains("touring") || document.body.classList.contains("oracling") || document.body.classList.contains("withing") || sitting.phase !== "none") return;
  installOffered = true;
  install.show();
}

function begin(e?: Event): void {
  if (S.mode !== "intro" || startMap.isOpen || opening !== "done") return;
  try {
    localStorage.setItem(WELCOMED, "1"); // read once: later boots go straight to the water
  } catch {
    /* private mode: it shows again next time, which is fine */
  }
  // Sound starts inside this touch (iOS requirement).
  audio.start();
  wakeSpeech();
  audio.bell(587.33, 0.05, 6);
  const pt = e instanceof MouseEvent ? groundPoint(e.clientX, e.clientY) : null;
  const rp = pt ?? new THREE.Vector3(0, 0, 10);
  water.ripple(rp.x, rp.z, 1.4, S.t);
  $("#title").classList.add("gone");
  $("#begin").hidden = true;
  $("#intro-link").hidden = true;
  awake.want();
  // ask the phone to keep the saved journey safe (granted quietly, most readily on the Home Screen)
  void navigator.storage?.persist?.().catch(() => false);
  // Straight into the world (the owner: always the water first, never a map, settings or words
  // before it): coming back, where you were; the first time, the shore. The map is in the menu.
  if (saved) {
    const x = saved.pos[0], z = saved.pos[2];
    const all = places();
    const near = all.reduce((a, b) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a), all[0]);
    arrive({ place: near, x, z, heading: saved.heading ?? 0 }, true);
  } else {
    const shore = places()[0];
    arrive({ place: shore, ...shore.start }, true);
  }
}

/** Every vessel of the archive's narrations, marked on the map in its own way: the groves'
    great trees, the planets (over the land, in the deep, in the sky) and the stars. */
function skyMarks(): { x: number; z: number; kind: "planet" | "star" | "grove" | "crystal"; label: string }[] {
  return [
    ...ORB_SITES.map((o) => ({ x: o.x, z: o.z, kind: (o.realm === "star" ? "star" : "planet") as "star" | "planet", label: o.orb.title })),
    ...GROVE_SITES.map((g) => ({ x: g.x, z: g.z, kind: g.crystal ? ("crystal" as const) : ("grove" as const), label: g.grove.name })),
  ];
}

/** Which way a place lies from the shore, in words (north is −z). */
function compass(x: number, z: number): string {
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  const a = Math.atan2(x - SPAWN.x, -(z - SPAWN.z));
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

/** The places on the map: the shore, and the seven archetypes' homes. */
function places(): Place[] {
  return [
    { numeral: "", label: "The shore", group: "Shore", x: SPAWN.x, z: SPAWN.z, narration: "J01", start: { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading } },
    { numeral: "", label: "The temple", group: "Shore", order: 1, x: temple.gateAt.x, z: temple.gateAt.z, narration: "J01", start: { ...temple.outside(), heading: temple.gateHeading } },
    ...waterfalls.list.map(({ f, name, view }, i) => ({ numeral: "", label: `${name}, ${compass(f.x, f.z)}`, group: "Shore" as const, section: "Wonders" as const, order: 8 + i, x: f.x, z: f.z, narration: "J01", start: view })),
    // the crystal caverns and the gold mines: you wake before the way in, facing it
    ...unders.map((u, i) => ((o) => ({ numeral: "", label: u.spec.label, group: "Shore" as const, section: "Wonders" as const, note: u === cavern ? "a cave of crystals, a hundred metres deep" : "an old mine, its drifts down to the mother lode", order: i, x: u.site.x, z: u.site.z, narration: "J01", start: { x: o.x, z: o.z, heading: o.heading + Math.PI } }))(u.outside())),
    { numeral: "", label: "The vision of creation", group: "Shore" as const, order: 0, x: vision.group.position.x, z: vision.group.position.z, narration: "J01", start: { x: vision.group.position.x + 11, z: vision.group.position.z + 11, heading: Math.atan2(11, 11) } },
    (() => {
      const [x, z] = nanMadolAt(0, -30);
      return { numeral: "", label: "Nan Madol", group: "Shore" as const, section: "Ancient" as const, note: "Pohnpei, c. 1180–1628", order: 5, x: NAN_MADOL.x, z: NAN_MADOL.z, narration: "J01", start: { x, z, heading: NAN_MADOL.face + Math.PI } };
    })(),
    (() => {
      const [x, z] = rapaNuiAt(0, -30);
      return { numeral: "", label: "Rapa Nui", group: "Shore" as const, section: "Ancient" as const, note: "the ancestors over the sea, c. 1250–1650", order: 6, x: RAPA_NUI.x, z: RAPA_NUI.z, narration: "J01", start: { x, z, heading: RAPA_NUI.face + Math.PI } };
    })(),
    (() => {
      const [x, z] = gobekliAt(0, 50);
      return { numeral: "", label: "Göbekli Tepe", group: "Shore" as const, section: "Ancient" as const, note: "c. 9500 BCE", order: 2, x: GOBEKLI.x, z: GOBEKLI.z, narration: "J01", start: { x, z, heading: GOBEKLI.face } };
    })(),
    { numeral: "", label: "The pyramid", group: "Shore" as const, section: "Ancient" as const, note: "Egypt, and the Duat beneath", order: 3, x: pyramid.door.x, z: pyramid.door.z, narration: "J01", start: { x: pyramid.door.x, z: pyramid.door.z - 14, heading: Math.PI } },
    ...halls.map(({ hall }) => {
      const o = hall.outside(), f = hall.face;
      return { numeral: "", label: hall.label, group: "Shore" as const, order: 2, icon: hall === mazeHall ? ("maze" as const) : undefined, x: hall.door.x, z: hall.door.z, narration: "J01", start: { x: o.x + Math.sin(f) * 22, z: o.z + Math.cos(f) * 22, heading: f } };
    }),
    // beneath the water: the sunken ruins, and the cave that leads to the deep archive (you wake
    // on the water above; dive, and swim down to them)
    ...RUIN_SITES.map((r) => {
      const same = RUIN_SITES.filter((q) => q.kind === r.kind && !q.name);
      let label = r.name ?? RUIN_NAMES[r.kind];
      if (!r.name && same.length > 1) {
        const dir = compass(r.x, r.z), d = Math.hypot(r.x - SPAWN.x, r.z - SPAWN.z);
        const twin = same.some((q) => q !== r && compass(q.x, q.z) === dir && Math.hypot(q.x - SPAWN.x, q.z - SPAWN.z) < d);
        label += `, ${twin ? "further " : ""}${dir}`;
      }
      // the drowned cities are ancient worlds (legendary or not), listed by era; the rest are the deep's
      const era = r.area ? ({ lemuria: { note: "legendary, beneath the water", order: 0 }, atlantis: { note: "legendary, beneath the water", order: 1 }, mayan: { note: "Maya, beneath the water", order: 4 } } as Record<string, { note: string; order: number }>)[r.area] : undefined;
      if (era) return { numeral: "", label, group: "Deep" as const, section: "Ancient" as const, ...era, x: r.x + 14, z: r.z + 14, narration: "J01", start: { x: r.x + 14, z: r.z + 14, heading: Math.atan2(14, 14) } };
      return { numeral: "", label, group: "Deep" as const, x: r.x + 14, z: r.z + 14, narration: "J01", start: { x: r.x + 14, z: r.z + 14, heading: Math.atan2(14, 14) } };
    }),
    ...depths.mouths.slice(0, 1).map((m) => {
      const o = depths.outside(m.site);
      return { numeral: "", label: "The way to the archive of the heart", group: "Deep" as const, x: m.site.x, z: m.site.z, narration: "J01", start: { x: o.x, z: o.z, heading: o.heading + Math.PI } };
    }),
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
    ...tourPlaces({ temple }),
  ];
}

/** Wake at the chosen place. */
/** An arrival through the dark is under way (a tour's stop waits for it before it begins). */
let arriving = false;
function arrive(c: Choice, first: boolean): void {
  // the land to build is heavy work that holds the page still: first a soft dark with the
  // loading mark, painted, then the work, then the dark lifts
  arriving = true;
  busy(1.5);
  input.enabled = false;
  fadeEl.classList.add("on");
  requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(() => {
    arriveNow(c, first);
    arriving = false;
    busy(0.8);
    window.setTimeout(() => fadeEl.classList.remove("on"), 150);
  }, 60)));
}
function arriveNow(c: Choice, first: boolean): void {
  if (temple.inside) setInside(false);
  if (depths.inside) setDeep(false);
  if (pyramid.isInside) setPyr(false);
  if (under()) setUnder(under()!, false);
  for (const h of halls) h.journey.leaveNow();
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
  // the background narrator begins again from here, but not under a tour: its start stops the
  // voice speaking, and a tour's stop reached through the dark lost its telling as it began
  if (!walk && !duatTour && !areaTour) playlist.startWith(c.place.narration);
  input.enabled = true;
  S.mode = "play";
  persist();
  if (c.place.label === "✦ The temple tour") crossTemple(true); // the door, then the docent
  if (!first) return;
  $("#menu-btn").hidden = false;
  tp.setResting(true);
  if (MOBILE) $("#act").hidden = $("#joy").hidden = false;
  say(`You wake near ${c.place.label.replace(/^The /, "the ")}. Wander anywhere; the land answers as you pass.`);
  // the controls' first tips: not while a tour moves you (they name controls that rest then)
  const tip = (text: string) => !document.body.classList.contains("touring") && whisper(text, 6000);
  window.setTimeout(() => tip(MOBILE ? "Put your thumb down anywhere on the lower left to walk" : "Click where you want to go, or use W A S D"), 4000);
  window.setTimeout(() => tip(MOBILE ? "Tap the round button to jump, tap again to fly; hold it to rise" : "Space to jump, again to fly; hold it to rise"), 26000);
  window.setTimeout(() => tip(MOBILE ? "Push the stick further to run" : "Hold Shift to run"), 50000);
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
    if (p.kind === "feeling") continue; // feelings go to the oracle, through this archetype (below)
    if (p.kind !== group) {
      group = p.kind;
      const g = document.createElement("p");
      g.className = "group";
      g.textContent = "Ask";
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
  // Go deeper: the person types, and the oracle answers through this archetype's lens (kept in My Heart)
  const g = document.createElement("p");
  g.className = "group";
  g.textContent = "Go deeper";
  const deep = deeperField(() => ({ numeral: b.spec.numeral, name: b.spec.name }), () => {
    sitting.asked = true;
    stillness(false);
    b.greet();
  }, (out) => (out.copy(b.root.position).setY(b.root.position.y + 1.25), 1.3));
  box.append(g, deep);
  heart.reset();
  sitPanel.hidden = false;
  (box.querySelector("button") as HTMLButtonElement | null)?.focus({ preventScroll: true });
  say(`You sit with ${b.spec.name}.`);
}
/** "Go deeper": one line to write in and a ✧ to send. What is written opens the oracle, asked at
    once through the archetype `who()` names (its lens), and is kept in My Heart. Used at the
    world's archetypes (seated) and at the temple's shrines. */
function deeperField(
  who: () => { numeral: string; name: string } | null,
  before: () => void = () => {},
  /** Where the archetype's heart is (into `out`), and how far round it its light gathers; 0: nowhere. */
  where: (out: THREE.Vector3) => number = () => 0,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "deeper-wrap";
  const deep = document.createElement("div");
  deep.className = "deeper";
  deep.innerHTML = `<textarea rows="1" maxlength="600" enterkeyhint="send" aria-label="Ask the oracle, through this archetype"></textarea><button type="button" class="d-go" aria-label="Ask the oracle">✧</button>`;
  const opts = document.createElement("div");
  opts.className = "d-opts";
  opts.innerHTML = `<button type="button" class="d-heart" aria-pressed="false">♥ share my heart</button><p class="d-consent">Nothing is stored in the cloud. What you send always goes anonymously.</p>`;
  wrap.append(deep, opts);
  const field = deep.querySelector("textarea")!, go = deep.querySelector<HTMLButtonElement>(".d-go")!, heartBtn = opts.querySelector<HTMLButtonElement>(".d-heart")!;
  // share my heart, for this one question (asked anew each time)
  let withHeart = false;
  const setHeart = (on: boolean) => {
    withHeart = on;
    heartBtn.setAttribute("aria-pressed", String(on));
  };
  heartBtn.addEventListener("click", () => setHeart(!withHeart));
  const a0 = who();
  field.placeholder = a0 ? `Ask ${a0.name} to go deeper…` : "Go deeper…";
  keepToItself(deep);
  const ask = () => {
    const a = who(), text = field.value.trim();
    if (!a) return;
    if (!text) return field.focus();
    before();
    if (tp.active) tp.close();
    if (narration.current?.startsWith("A-")) narration.stop(1.5);
    field.value = "";
    deep.classList.remove("ready");
    field.blur();
    // the oracle works in the archetype's own light here (no sun to crowd the screen)
    const rad = where(stationGlow.at);
    const i = ARCHETYPES.findIndex((x) => x.numeral === a.numeral);
    if (i >= 0) stationGlow.color.setRGB(...(ARCHETYPES[i].tint as [number, number, number])).lerp(new THREE.Color(1, 0.86, 0.6), 0.45);
    stationGlow.radius = rad || 1.4;
    oracle.stationPresence = rad ? stationGlow : { summon() {}, dismiss() {}, setState() {}, pulse() {} };
    oracle.show(`${a.numeral} · ${a.name}`, archetypeLens(a.numeral, a.name), text, withHeart);
    setHeart(false);
  };
  // the click wakes the phone's voice, so the answer can be read aloud when it comes
  speechButton(go, () => {
    wakeSpeech();
    ask();
  });
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  });
  field.addEventListener("input", () => {
    deep.classList.toggle("ready", !!field.value.trim());
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 92)}px`;
  });
  return wrap;
}
/** An archetype as the oracle's point of origin: its place among the seven (the worker's station
    ids, which tint what it draws on) and a short hidden line naming it (the worker's `origin`). */
const SEVEN = [
  ["matrix", "the Matrix", "what reaches out: attention, will, conscious focus"],
  ["potentiator", "the Potentiator", "the deep: what is felt before it is known"],
  ["catalyst", "the Catalyst", "difficulty as a teacher"],
  ["experience", "the Experience", "what life has written in you: memory, habit"],
  ["significator", "the Significator", "the core self and what it truly wants"],
  ["transformation", "the Transformation", "the turning: letting go, crossing a threshold"],
  ["great-way", "the Great Way", "the long road, how a life is walked"],
] as const;
function archetypeLens(numeral: string, name: string): Lens {
  const i = ARCHETYPES.findIndex((a) => a.numeral === numeral);
  if (i < 0 || i > 20)
    return { origin: `The person is with ${name} (${numeral}), the Choice: how to love, toward others or toward self. They ask to go deeper.` };
  const [station, pos, theme] = SEVEN[i % 7];
  const realm = ["Mind", "Body", "Spirit"][Math.floor(i / 7)];
  return { station, origin: `The person is with ${name} (${numeral}), ${pos} of the ${realm}: ${theme}. They ask to go deeper; let this archetype's light meet it.` };
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
const floatHeart = new THREE.Vector3();
function updateStillness(dt: number, wt: number): void {
  const calm =
    S.mode === "play" && player.grounded && !player.swimming && !player.flying && player.speed < 0.15 &&
    wanderer.gesture === "none" && sitting.phase === "none" && Math.hypot(input.move.x, input.move.y) < 0.05 && !startMap.isOpen;
  stillFor = calm ? stillFor + dt : 0;
  const want = stillFor > 1.6 ? 1 : 0;
  medK += (want - medK) * Math.min(1, dt * (want ? 0.55 : 3.5));
  if (medK < 0.002) medK = 0;
  wanderer.meditation = medK;
  creationUniforms.uCommune.value = medK;
  heartPos.copy(player.pos).setY(player.pos.y + 1.15);
  // lying back on the water the heart is at the chest, a little over it, not where it stands
  if (floatK > 0.001 && wanderer.ready) heartPos.lerp(wanderer.chestPos(floatHeart).setY(floatHeart.y + 0.1), floatK);
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
    else if (!player.target) player.target = new THREE.Vector2(sitting.x, sitting.z); // once, not each frame
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
// "Show me where it lives": the guide's light goes to the narration's planet, star, tree or
// crystal, and the wanderer goes after it (on foot or in flight); the stick takes over
tp.onWhere = (n) => {
  const v = vessels.vessels.find((x) => x.narration.id === n.id);
  if (!v) return;
  stopAuto();
  standUp();
  guide.lead({ label: n.title, x: v.pos.x, y: v.pos.y, z: v.pos.z }, player.pos);
  guideAuto = { since: 0 };
  whisper(`On the way to where it lives. The stick takes over.`, 5000);
};
tp.onChange = (id) => {
  vessels.setPlaying(id);
  if (id) archiveHeard.add(id);
  else playlist.held = false; // closed: the journey's own voices may speak again
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

// The deep (world/depths.ts): ruins and rings of stillness on the lake floors, and caves whose
// mouths lead to the Archive of the Heart, a grotto apart like the temple.
const depths = new Depths();
scene.add(depths.group, depths.grotto);
const ancients = new Ancients();
scene.add(ancients.group);
{
  // inside the grotto the scene's own lights rest with the world: its stone has its own
  // (pitch dark: only enough light for the wanderer's own form)
  const hemi = new THREE.HemisphereLight(0x9fc4ff, 0x1a1420, 0.14);
  const warm = new THREE.PointLight(0xffc98a, 2, 30, 1.6);
  warm.position.set(0, 6, 0);
  depths.grotto.add(hemi, warm);
}
let deepMouth: ReturnType<Depths["atMouth"]> = null;
let deepHidden: [THREE.Object3D, boolean][] = [];
let ringStill = 0, ringSpoke = false;
function deepReturnPos(): [number, number, number] {
  const o = depths.outside(deepMouth ?? depths.mouths[0].site);
  return [o.x, o.y, o.z];
}
/** Into the deep archive and out again, at once (no fade). */
function setDeep(inside: boolean): void {
  if (inside === depths.inside) return;
  if (inside) {
    const keep = new Set<THREE.Object3D>([depths.grotto, wanderer.root, wanderer.fx, camera]);
    deepHidden = scene.children.filter((o) => !keep.has(o)).map((o) => [o, o.visible]);
    for (const [o] of deepHidden) o.visible = false;
    depths.setNotes(heartNotes());
    depths.show(true);
    const e = depths.entry();
    player.pos.set(e.x, e.y, e.z);
    player.heading = e.heading;
    follow.yaw = e.heading;
    follow.pitch = 0.1;
  } else {
    for (const [o, v] of deepHidden) o.visible = v;
    deepHidden = [];
    depths.show(false);
    const o = depths.outside(deepMouth ?? depths.mouths[0].site);
    player.pos.set(o.x, o.y, o.z);
    player.heading = o.heading;
    follow.yaw = o.heading;
    terrain.update(o.x, o.z, true);
  }
  player.placeUnder();
  follow.underwater = true;
  follow.snapTo(player.pos);
  ringStill = 0;
  quality.hold(3);
}
function crossDeep(inside: boolean): void {
  if (crossing) return;
  crossing = true;
  fadeEl.classList.add("on");
  audio.bell(inside ? 264 : 352, 0.1, 6);
  window.setTimeout(async () => {
    setDeep(inside);
    await compileInDark();
    if (inside) whisper(heartNotes().length ? "The Archive of the Heart. Every note you have written is a light here, joined to the others. Move among them; touch one to read it again." : "The Archive of the Heart. Nothing is gathered yet: each note you write becomes a light here.", 8000);
    window.setTimeout(() => {
      fadeEl.classList.remove("on");
      crossing = false;
    }, 250);
  }, 650);
}
/* The pyramid (world/pyramid.ts), after what Ra says of it: walk in through its door on the
   north face, or climb to its apex. Inside: the resonating chamber below, the Queen's Chamber
   (initiation: the senses rest in the dark, and another life begins), the Grand Gallery, the
   King's Chamber (healing: light through you in seven colours). All said here is paraphrase. */
const pyramid = new Pyramid();
scene.add(pyramid.world, pyramid.inside);
// beside it, the gateway into the telling of Egypt (world/egyptGate.ts)
const egyptGate = new EgyptGate(pyramid.door);
scene.add(egyptGate.group);
// round its base, eight false doors that breathe (world/falseDoors.ts); before the north face,
// the calm place where the pyramid meditation begins
const falseDoors = new FalseDoors();
scene.add(falseDoors.group);
let meditationHeard = false;
// Göbekli Tepe (world/ancient/gobekli.ts): the hilltop of great stone rings, east by north-east
const gobekli = new Gobekli(MOBILE);
scene.add(gobekli.group, gobekli.far, gobekli.live);
// Nan Madol (world/ancient/nanMadol.ts): the basalt islets in their lagoon, toward the dawn
const nanMadol = new NanMadol(MOBILE);
scene.add(nanMadol.group, nanMadol.live);
// Rapa Nui (world/ancient/rapaNui.ts): the ancestors on their headland over the sea, westward
const rapaNui = new RapaNui(MOBILE);
scene.add(rapaNui.group, rapaNui.live);
// the waterfalls (world/waterfalls.ts; their land is shaped in terrain.ts): stream, curtain, foam, mist
const waterfalls = new Waterfalls(MOBILE);
scene.add(waterfalls.group);
/* Whispers (world/whispers.ts): seven tellings hidden in the world, each found by being there
   (a door that breathes deeper, a stone of days, a wandering world, a singing quartz, a star, a
   tree alone, Rapa Nui). Found once, they wait under the map. */
const whispers = new Whispers(MOBILE, falseDoors, ancients.areas.find((a) => a.id === "mayan"));
scene.add(whispers.group);
touch.extra = () => [...whispers.touchables(), ...garden.touchables()];
/** A whisper found (or asked for again from the map). Found by stillness it waits for the voices
    ("Only nature" rests them) and never breaks into a tour or an archive narration; a tap, a
    hand laid on it or the map's list is your own choice, and speaks. Each plays once on its
    finding; in the world after that it only answers with a soft tone. */
function hearWhisper(id: WhisperId, chosen: boolean, again = false): void {
  if (S.mode !== "play") return;
  if (!again && (walk || duatTour || tourScenes.tour.active)) return;
  if (!again && whispers.has(id)) {
    if (chosen) audio.bowl(528, 0.03, undefined, 5);
    return;
  }
  if (!chosen && (!playlist.on || tp.playing)) return;
  if (tp.playing) tp.close();
  whispers.markFound(id);
  // a moment of grace before the voice: one soft bowl, the world going a little quieter
  audio.bowl(396, 0.045, undefined, 8);
  const track = whisperOf(id).track;
  window.setTimeout(() => void narration.play(track), again ? 300 : 1600);
}

/* The monuments (scenes/journey.ts): through each one's door, a lobby, then its rooms one after
   another, each crossing pitch black, each room's recording beginning as you arrive, and home to
   the lobby. The densities (scenes/densities/monument.ts); the adept (scenes/adept/monument.ts). */
const densityHall = new DensityMonument();
const adeptHall = new AdeptMonument();
const pastHall = new PastMonument();
// the one door into the world after the veil (scenes/afterVeil): through it, an open walk
const veilHall = new VeilDoor(narration);
// the way into the long descent (scenes/wanderer): a shaft of light in a meadow
const descentHall = new WandererPortal();
// the way into the mind's maze (scenes/mindMaze): two leaning monoliths holding a curtain of light
const mazeHall = new MindMazePortal();
scene.add(densityHall.world, adeptHall.world, pastHall.world, veilHall.world, descentHall.world, mazeHall.world);
/** `sky`: the place keeps the world's real sky and clouds (the long descent tells its story
    through them). */
function journeyHost(hall: Hall, withSky = false): JourneyHost {
  return {
    scene,
    narration,
    whisper,
    keep: (o) => o === wanderer.root || o === wanderer.fx || o === camera || (o as THREE.Light).isLight || (withSky && (o === sky || o === clouds.mesh)),
    place: (x, y, z, heading) => {
      if (sitting.phase === "seated") standUp(); // a new room: you arrive on your feet
      player.pos.set(x, y, z);
      player.heading = heading;
      follow.yaw = heading;
      follow.pitch = 0.18;
      Object.assign(player, { flying: false, landing: false, grounded: true, swimming: false, vy: 0, target: null });
      player.vel.set(0, 0, 0);
      follow.snapTo(player.pos);
      if (!inJourney(x)) terrain.update(x, z, true);
      quality.hold(3);
    },
    fade: (on, white) => {
      if (on) fadeEl.classList.toggle("white", !!white);
      fadeEl.classList.toggle("on", on);
    },
    busy,
    settle: async () => {
      additiveKeepsAlpha(scene);
      // never wait on it for long: whatever isn't ready compiles on its first draw instead
      await Promise.race([renderer.compileAsync(scene, camera).catch(() => undefined), new Promise((r) => window.setTimeout(r, 4000))]);
    },
    apart: (on) => {
      if (on) {
        stopAuto();
        standUp();
      }
      // the mind's maze: the temple's far chant (plainchant voices on one mode) under the stone's
      // own sounds, and an om now and then; the other places apart keep their silence
      audio.setTemple(on, hall === mazeHall);
      audio.setOm(on && hall === mazeHall);
    },
    outside: () => (hall === pastHall && halls[2]?.journey.via ? egyptGate.outside() : hall.outside()),
    presence: (k) => (hallPresence = k),
    sit: (x, y, z, heading) => {
      // a seated room's seat: you sit, and the view turns to what it shows
      Object.assign(sitting, { phase: "seated", since: 0, asked: false });
      player.pos.set(x, y, z);
      player.target = null;
      player.vel.set(0, 0, 0);
      player.heading = heading;
      wanderer.setGesture("sit");
      faceYaw = heading;
      faceFor = 2.5;
    },
    seated: () => sitting.phase === "seated",
  };
}
let hallPresence = 1; // a room's own say in how much of the wanderer is there (the seventh fades it)
const halls: { hall: Hall; journey: Journey; lit: number }[] = [];
{
  const dj: Journey = new Journey("densities", densityStages(() => dj.seen), journeyHost(densityHall));
  const aj: Journey = new Journey("adept", adeptStages(() => aj.seen), journeyHost(adeptHall));
  const pj: Journey = new Journey("past", pastStages(() => pj.seen), journeyHost(pastHall));
  // the world after the veil: one open walk (no more doors), its crossings white
  const vj: Journey = new Journey(
    "veil",
    [
      {
        id: "afterVeil",
        title: "The world after the veil",
        make: async (sc, nar, wh) => createAfterVeil(sc, nar, wh),
        floor: veilFloor,
        start: { x: 0, z: 2, heading: 0 },
        exits: [{ x: VEIL_EXIT.x, z: VEIL_EXIT.z, r: 4, to: "out" }],
        confine: veilConfine,
        ownAir: true,
      },
    ],
    journeyHost(veilHall),
  );
  vj.white = true;
  // the long descent: one walk in the clouds under the world's own sky, its crossings white
  const wj: Journey = new Journey(
    "descent",
    [
      {
        id: "longDescent",
        title: "The long descent",
        make: async (sc, nar, wh) => createLongDescent(sc, nar, wh),
        floor: wandererFloor,
        start: { x: 0, z: 6, heading: 0 },
        exits: [{ x: WANDERER_EXIT.x, z: WANDERER_EXIT.z, r: 4, to: "out" }],
        confine: wandererConfine,
        ownAir: true,
      },
    ],
    journeyHost(descentHall, true),
  );
  wj.white = true;
  // the mind's maze: one open labyrinth under the night, its crossings white; its seat at the
  // still centre sits you down (a seated stage with no recording)
  const mj: Journey = new Journey(
    "maze",
    [
      {
        id: "mindMaze",
        title: "The mind's maze",
        make: async (sc, nar, wh) => createMindMaze(sc, nar, wh, { model: () => beingModel, sparks, reduced: () => S.reduced, chime: () => audio.bowl(294 + Math.random() * 98, 0.012, undefined, 6),
          pressing: () => Math.hypot(input.move.x, input.move.y) > 0.2 || !!player.target,
          // the worlds' own buildings round it, behind their doors (the pyramid far off, a landmark)
          buildings: () => [
            { id: "temple", obj: temple.gate, door: temple.gateAt, face: temple.gateHeading },
            { id: "duat", obj: pyramid.world, door: pyramid.door, face: Math.PI, far: 270 },
            ...halls.slice(0, 5).map((h, k) => ({ id: ["densities", "adept", "past", "veil", "descent"][k], obj: h.hall.world, door: h.hall.door, face: h.hall.face })),
          ] }),
        floor: mazeFloor,
        start: MAZE_START,
        exits: [{ x: MAZE_EXIT.x, z: MAZE_EXIT.z, r: 2.2, to: "out" }],
        confine: mazeConfine,
        air: MAZE_AIR,
        seated: true,
        focus: [[0, mazeFloor(0, 0) + 6, 0], [0, 4, -44], [44, 4, 0], [-44, 4, 0]],
        centre: [0, mazeFloor(0, 0) + 6, 0],
      },
    ],
    journeyHost(mazeHall),
  );
  mj.white = true;
  halls.push({ hall: densityHall, journey: dj, lit: -1 }, { hall: adeptHall, journey: aj, lit: -1 }, { hall: pastHall, journey: pj, lit: -1 }, { hall: veilHall, journey: vj, lit: -1 }, { hall: descentHall, journey: wj, lit: -1 }, { hall: mazeHall, journey: mj, lit: -1 });
}
/** The journey you are in (null out in the world). */
hallsReady = true;
const inHall = (): { hall: Hall; journey: Journey } | null => halls.find((h) => h.journey.inside || h.journey.crossing) ?? null;
const hearAgain = $("#hear-again") as HTMLButtonElement;
hearAgain.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  inHall()?.journey.replay();
  audio.bell(528, 0.05, 3);
});
/** Each frame: the monuments' doors, and within one, its journey. */
function journeyFrame(dt: number): void {
  egyptGate.update(S.t);
  veilHall.update(dt, S.t, player.pos, S.reduced, !!inHall() || apart());
  if (!apart() && S.mode === "play" && Math.hypot(player.pos.x - egyptGate.at.x, player.pos.z - egyptGate.at.z) < 9) tellPyr("egypt-gate", "The telling of Egypt", 4500);
  const at = inHall();
  if (at?.journey.inside) {
    if (player.flying) player.flying = false; // you walk here
    at.journey.update(dt, player.pos);
    post.starVis.value = 0;
    post.raysOn.value = 0;
  } else if (!at && S.mode === "play" && !crossing && !autofly.active && sitting.phase !== "seated") {
    const h = halls.find((h) => h.hall.atDoor(player.pos));
    if (h) void h.journey.enter();
    else if (egyptGate.atGate(player.pos) && !halls[2].journey.crossing) {
      // the pyramid's gate: straight into the telling of Egypt, and back out here after
      const j = halls[2].journey, k = j.stages.findIndex((s) => s.id === "egypt");
      j.via = true;
      void j.enter(k);
    }
  }
  for (const h of halls)
    if (h.journey.seen.size !== h.lit) {
      h.lit = h.journey.seen.size;
      h.hall.light(h.journey.seen);
    }
  hearAgain.hidden = !(at && at.journey.inside && at.journey.hasVoice && !at.journey.crossing && S.mode === "play");
}
// the vision of creation (world/vision.ts): creation as one flowing body of light, on the ground
// near the shore, in a loop: atom, stone, crystal, molecule, plant, animal, primate, human, the
// many as one, unity, a point, and the burst that begins it again
const vision = new Vision(new THREE.Vector3(MONUMENT.x, MONUMENT.y + 0.15, MONUMENT.z), MOBILE ? 11000 : 16000);
scene.add(vision.group);
const sevenGroup = new THREE.Group();
sevenGroup.add(...pyramid.seven);
scene.add(sevenGroup);
/* The loading mark (Samuel: "some sort of loading indicator… it makes the loading less choppy
   because you expect it"): shown while a place is crossed into, a journey lands, the land is
   still arriving around you, a recording is on its way, or the shaders are still compiling;
   held a moment, so it never flickers. */
const busyEl = $("#busy");
let busyUntil = 0, backlogFor = 0;
function busy(seconds: number): void {
  busyUntil = Math.max(busyUntil, performance.now() + seconds * 1000);
  busyEl.classList.add("on"); // at once, before any heavy work holds the page still
}
function busyFrame(): void {
  const now = performance.now();
  // the land: only a real backlog that lasts (a journey, a fast flight far out), not a tile or two
  backlogFor = terrain.pending > 24 ? backlogFor + realDt : 0;
  if (crossing || backlogFor > 0.5 || tp.buffering || (!shadersReady && S.mode !== "intro")) busyUntil = Math.max(busyUntil, now + 500);
  busyEl.classList.toggle("on", now < busyUntil && (S.mode !== "intro" || fadeEl.classList.contains("on")));
}

/* Calm (Samuel: "hide controls if autofly or simply not touching the screen, collapse player
   also"): after a few seconds with no touch, or while autofly carries you, the stick, the round
   button, its word, ⋮ and the half-moon fade away, and an open narration card folds. Any touch
   brings them back at once (they still answer that first touch). */
let lastTouch = performance.now(), calm = false;
for (const ev of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"])
  addEventListener(ev, (e) => {
    if (ev === "pointermove" && (e as PointerEvent).pointerType === "mouse" && !(e as PointerEvent).buttons) return;
    lastTouch = performance.now();
  }, { capture: true, passive: true });
function calmFrame(): void {
  const idle = performance.now() - lastTouch > 4500 && Math.hypot(input.move.x, input.move.y) < 0.05 && !input.hold;
  const want = S.mode === "play" && !startMap.isOpen && $("#menu").hidden && (autofly.active || autorun.active || idle);
  if (want === calm) return;
  calm = want;
  document.body.classList.toggle("calm", calm);
  if (calm && !$("#tp").hidden) tp.fold();
}

/* Contemplation (the owner: "the character goes away and it becomes first person and the view
   is centred around animations if any, like in the rooms… triggered by not touching the
   controls"): after a long stillness the wanderer fades and the view becomes its own eyes, turning
   slowly from one thing that moves to the next (a room's points of interest; out in the world the
   vision of creation when near, else straight ahead). Any touch brings the body back. */
let inwardOn = true, inwardK = 0, gazeI = 0, gazeFor = 0, toldInward = false;
try {
  inwardOn = localStorage.getItem("inward-journey:contemplate") !== "0";
  toldInward = localStorage.getItem("inward-journey:contemplate-told") === "1";
} catch {
  /* no storage: on */
}
const INWARD_AFTER = 8000;
/** Sitting at a lesson's seat or a monument room's (not with an archetype, whose panel is open). */
const lessonSeated = (): boolean => sitting.phase === "seated" && (!!tourScenes.seatedId || !!inHall()?.journey.sitting);
let tourWatchK = 0;
const gazeV = new THREE.Vector3(); // the gaze contemplation gives the camera, reused each frame
const gazePts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const gzEye = new THREE.Vector3(), gzGlow = new THREE.Vector3(), gzPeak = new THREE.Vector3(), gzUp = new THREE.Vector3();
const Y_UP = new THREE.Vector3(0, 1, 0);
/** A still of the maze's sun holds it nourishing. */
let sunStill = false;
function contemplationFrame(dt: number): void {
  const idle = performance.now() - lastTouch > INWARD_AFTER && Math.hypot(input.move.x, input.move.y) < 0.05 && !input.hold;
  const want = inwardOn && idle && S.mode === "play" && !startMap.isOpen && $("#menu").hidden && !oracle.isOpen && player.speed < 0.3 &&
    !player.flying && !player.diving && !player.floating && !follow.underwater && !autofly.active && !autorun.active && !crossing &&
    (sitting.phase === "none" || lessonSeated()) && !document.body.classList.contains("touring") && !sanct.building && !sanct.formingNow && !med.active;
  inwardK += ((want ? 1 : 0) - inwardK) * Math.min(1, dt * (want ? 0.35 : 3));
  if (inwardK < 0.002 && !want) inwardK = 0;
  follow.inward = inwardK;
  // the temple tour: while a shrine is spoken the wanderer fades away, so nothing stands between
  // you and the carving (the owner: "sitting on the floor or the character disappears while watching")
  const watch = tourScenes.tour.watching ? 1 : 0;
  tourWatchK += (watch - tourWatchK) * Math.min(1, dt * (watch ? 1.2 : 2.5));
  wanderer.presence = hallPresence * (1 - inwardK) * (1 - tourWatchK);
  if (want && inwardK > 0.5 && !toldInward) {
    toldInward = true;
    whisper("Contemplation: touch anywhere to return", 6000);
    try {
      localStorage.setItem("inward-journey:contemplate-told", "1");
    } catch {
      /* fine */
    }
  }
  // the mind's maze: contemplating, the view from above draws back and tilts toward the horizon
  // (the whole maze, the volcanoes, the monuments, and its sun low ahead, which flares: "nourishing
  // the mind"); playing, it stays steep over the walker
  const mz = maze && inHall()?.hall === mazeHall && !maze.eagle() ? maze : null;
  follow.skyward = false;
  follow.eyeLift = 0;
  follow.overheadTilt = mz ? inwardK : 0;
  follow.overheadSun = mz ? (follow.overheadSun ?? new THREE.Vector3()).copy(mz.sunWorld()) : null;
  if (mz && !sunStill) mz.setNourish(inwardK, gzEye.copy(player.pos).setY(player.pos.y + 1.6));
  if (!want) return void (follow.gaze = null);
  gazeFor += dt;
  if (mz) {
    const s = mz.sunWorld();
    follow.gaze = gazeV.copy(s).add(gpTmp.set(Math.sin(S.t * 0.05), Math.sin(S.t * 0.04 + 2) * 0.4, Math.cos(S.t * 0.045)).multiplyScalar(s.distanceTo(player.pos) * 0.015));
    return;
  }
  // a narrated animation: hold it, with the slightest drift so the view breathes
  const g = gravityPoint();
  if (g) {
    const d = g.distanceTo(player.pos) * 0.03;
    follow.gaze = gazeV.copy(g).add(gpTmp.set(Math.sin(S.t * 0.07) * d, Math.sin(S.t * 0.05 + 1) * d * 0.5, Math.cos(S.t * 0.06) * d * 0.4));
    return;
  }
  // otherwise a slow drift between the loveliest views: the room's points of interest, the
  // vision of creation, and out in the world the sky (where the moon or low sun glows, a peak
  // standing against it, the stars low over the land), never a wall
  let pts = inHall()?.journey.focus() ?? under()?.focus(player.pos) ?? [];
  if (!pts.length && !apart()) {
    const [g0, g1, g2] = gazePts;
    if (player.pos.distanceTo(vision.group.position) < 70) pts = [g0.copy(vision.group.position).setY(vision.group.position.y + 3)];
    else {
      const eye = gzEye.copy(player.pos).setY(player.pos.y + 1.6);
      const glow = gzGlow.copy(fogUniforms.glowDir.value).setY(Math.max(0.18, fogUniforms.glowDir.value.y)).normalize();
      let peak = PEAKS[0];
      for (const b of PEAKS) if (Math.hypot(b.x - eye.x, b.z - eye.z) < Math.hypot(peak.x - eye.x, peak.z - eye.z)) peak = b;
      const toPeak = gzPeak.set(peak.x - eye.x, 0, peak.z - eye.z).normalize();
      const up = gzUp.set(glow.x, 0, glow.z).normalize().applyAxisAngle(Y_UP, 2.1);
      g0.copy(eye).addScaledVector(glow, 400);
      g1.copy(eye).addScaledVector(toPeak, 400).setY(eye.y + 400 * 0.12);
      g2.copy(eye).addScaledVector(up, 300).setY(eye.y + 300 * 0.2); // the sky low over the land, not overhead
      pts = gazePts;
    }
  }
  if (gazeFor > 20) (gazeFor = 0), gazeI++;
  const base = pts.length ? pts[gazeI % pts.length] : null;
  // a gentle parallax drift about whatever it rests on
  follow.gaze = base ? gazeV.copy(base).add(gpTmp.set(Math.sin(S.t * 0.05), Math.sin(S.t * 0.04 + 2) * 0.4, Math.cos(S.t * 0.045)).multiplyScalar(base.distanceTo(player.pos) * 0.025)) : null;
}

/* The gravity point (the owner: "SUPER important"). While a narration with an animation plays,
   in a monument's room (standing or seated) or at a lesson's seat, the view eases round to frame
   the animation's centre, the wanderer in the foreground. Look away if you like: while a finger
   is on the screen it never fights the hand, and a couple of seconds after you let go it eases
   back. */
function gravityPoint(): THREE.Vector3 | null {
  if (S.mode === "play" && duatTour?.phase === "watch") {
    const h = pyramid.duatHours()[duatTour.i];
    if (h) return gpOut.copy(DUAT_ORIGIN).add(h.at).setY(gpOut.y + 3);
  }
  // the climb to the dawn: the view turns to the dawn the stair rises into (the Duat's sky glows
  // low toward local (−0.3, −0.9)), not the stair's corner at your feet
  if (S.mode === "play" && duatTour && duatTour.i >= pyramid.duatHours().length) {
    const p7 = pyramid.PATH[pyramid.PATH.length - 1];
    return gpOut.copy(DUAT_ORIGIN).add(p7).add(gpTmp.set(-0.3 * 140, 14, -0.95 * 140));
  }
  // standing at a shrine's place in the temple (not seated, not with the cards): its carving
  if (S.mode === "play" && temple.inside && !temple.cardsOpen && sitting.phase === "none" && player.speed < 0.3) {
    const k = temple.nearShrine(player.pos, 1.6);
    if (k >= 0 && k !== 21) return temple.frameFor(k, shrineFrame);
  }
  if (S.mode !== "play" || (!narration.progress() && narration.debugTime === null)) return null;
  const h = inHall();
  if (h) {
    const c = h.journey.inside && !h.journey.crossing ? h.journey.centre() : null;
    return c ? gpOut.copy(c) : null;
  }
  const id = tourScenes.seatedId;
  if (!id) return null;
  const m = tourScenes.registry.byId(id) as { focus?: THREE.Vector3 } | undefined;
  return m?.focus ? gpOut.copy(m.focus) : null;
}
/* gravityPoint's answer and its helper, reused each frame (it was a new vector or two every frame);
   a caller that changes it copies it first */
const gpOut = new THREE.Vector3(), gpTmp = new THREE.Vector3();
const GRAVITY_AFTER = 2500;
const shrineFrame = new THREE.Vector3();
function gravityFrame(dt: number): void {
  // the temple tour at a shrine: the view centred on its carving, the whole of it and its title
  // with room above (the owner's framing); the tour itself turns the view round
  const ts = tourScenes.tour.active ? tourScenes.tour.atShrine : -1;
  if (ts >= 0) {
    follow.frame = temple.frameFor(ts, shrineFrame);
    follow.frameHold = 1;
    follow.wide = 0;
    return;
  }
  const g = document.body.classList.contains("touring") && !walk && !duatTour ? null : gravityPoint();
  follow.frame = g;
  // a room framed wide (the first density): the focus move, and contemplation, draw back to reveal it
  follow.wide = inHall()?.journey.framing() === "wide" && (g || inwardK > 0.05) ? 1 : 0;
  if (!g) return;
  const idle = performance.now() - lastTouch > GRAVITY_AFTER && Math.hypot(input.move.x, input.move.y) < 0.05 && !input.hold;
  follow.frameHold = idle ? 1 : 0.35;
  if (!idle || player.speed > 0.3 || faceFor > 0) {
    gravityVel = 0;
    return;
  }
  // swing round behind the wanderer, on the line to the animation: a critically damped spring,
  // so the move eases in and eases out as a camera operator would, never a constant-rate turn
  const want = Math.atan2(-(g.x - player.pos.x), -(g.z - player.pos.z));
  const d = Math.atan2(Math.sin(want - follow.yaw), Math.cos(want - follow.yaw));
  const k = 0.9, h = Math.min(0.05, dt);
  gravityVel += (d * k * k - 2 * k * gravityVel) * h;
  follow.yaw += gravityVel * h;
  follow.pitch += (0.12 - follow.pitch) * Math.min(1, dt * 0.6);
}
let gravityVel = 0;
const NO_BLOCKERS: THREE.Object3D[] = [];
/* In a place apart (a monument's lobby or room, the pyramid, the deep archive) the view never
   stands outside a wall looking back in through it (the owner: "you are blinded by the walls"):
   every solid surface there (opaque meshes, the door sheets included, not the far sky shells or
   the points of light) keeps the camera in front of it. Gathered once a second, not each frame. */
let apartList: THREE.Object3D[] = [];
let apartAt = -1e9;
function apartBlockers(): THREE.Object3D[] {
  const now = performance.now();
  if (now - apartAt < 1000) return apartList;
  apartAt = now;
  const out: THREE.Object3D[] = [];
  const v = new THREE.Vector3();
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mat = m.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat) || mat.transparent || mat.blending === THREE.AdditiveBlending) return;
    const g = m.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const r = (g.boundingSphere?.radius ?? 0) * m.matrixWorld.getMaxScaleOnAxis();
    if (r > 80) return; // a sky shell or a far backdrop: never between you and the camera
    if (v.copy(g.boundingSphere!.center).applyMatrix4(m.matrixWorld).distanceTo(player.pos) > r + 40) return;
    out.push(m);
  });
  apartList = out;
  return out;
}

/* The lessons' seats and the narration's progress (the owner: nobody knew a stone seat starts a
   lesson, had to hunt for the show after sitting, or could tell how much of a narration was left).
   Near a lesson's seat a soft ring of light breathes on the ground round it and "Sit to listen"
   hangs over it; sitting turns the view to face the stage; while any narration speaks, a hairline
   at the foot of the screen fills as it goes (a tap shows the time). */
const seatRing = (() => {
  const g = new THREE.RingGeometry(1.15, 1.45, 64);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const u = T.uv();
  const edge = T.smoothstep(0, 0.5, u.y).mul(T.smoothstep(1, 0.5, u.y));
  const k = T.uniform(0);
  m.colorNode = T.vec4(T.vec3(1, 0.78, 0.42).mul(edge).mul(k), 1);
  const mesh = new THREE.Mesh(g, m);
  mesh.visible = false;
  mesh.renderOrder = 3;
  scene.add(mesh);
  return { mesh, k };
})();
const seatHint = $("#seat-hint");
const nprog = $<HTMLButtonElement>("#nprog");
const nprogBar = nprog.querySelector("i") as HTMLElement, nprogTime = nprog.querySelector(".time") as HTMLElement;
let nprogShow = 0, lastSeated: string | null = null, faceFor = 0, faceYaw = 0;
nprog.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  nprogShow = 4;
});
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const hintAt = new THREE.Vector3();
function lessonUxFrame(dt: number): void {
  // the nearest lesson seat not yet sat on
  let near: { pos: THREE.Vector3; d: number } | null = null;
  if (S.mode === "play" && sitting.phase === "none" && !apart()) {
    for (const m of tourScenes.registry.modules) {
      if (!m.seatPos || m === (tourScenes.tour as unknown)) continue;
      const d = player.pos.distanceTo(m.seatPos);
      if (d < 18 && (!near || d < near.d)) near = { pos: m.seatPos, d };
    }
  }
  // a monument's seated room (its recording waits for you to sit)
  const hallSeat = S.mode === "play" && sitting.phase === "none" ? inHall()?.journey.seatAt() ?? (temple.inChoiceRoom(player.pos) && !tourScenes.tour.active ? temple.choiceSeat() : null) : null;
  if (hallSeat) near = { pos: hallSeat, d: player.pos.distanceTo(hallSeat) };
  const want = near ? THREE.MathUtils.smoothstep(18, 12, near.d) : 0;
  seatRing.k.value += (want * (0.55 + 0.25 * Math.sin(S.t * 2.2)) - seatRing.k.value) * Math.min(1, dt * 3);
  seatRing.mesh.visible = seatRing.k.value > 0.01;
  if (near) seatRing.mesh.position.set(near.pos.x, near.pos.y + 0.06, near.pos.z);
  let hint = false;
  if (near && want > 0.3) {
    hintAt.set(near.pos.x, near.pos.y + 1.6, near.pos.z).project(camera);
    if (hintAt.z < 1 && Math.abs(hintAt.x) < 0.95 && Math.abs(hintAt.y) < 0.95) {
      hint = true;
      const w = innerWidth, h = innerHeight;
      seatHint.style.transform = `translate(${((hintAt.x + 1) / 2) * w}px, ${((1 - hintAt.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }
  // the maze's seat plays nothing: it is only for sitting
  const hintWord = hint && inHall()?.hall === mazeHall ? "Sit at the still centre" : "Sit to listen";
  if (seatHint.textContent !== hintWord) seatHint.textContent = hintWord;
  seatHint.classList.toggle("on", hint);
  // sitting: the view turns to the stage, gently
  const id = tourScenes.seatedId;
  if (id && id !== lastSeated) {
    const m = tourScenes.registry.modules.find((x) => x.id === id);
    if (m?.seatHeading !== undefined) (faceYaw = m.seatHeading), (faceFor = 2.5), (player.heading = m.seatHeading);
  }
  lastSeated = id;
  if (faceFor > 0) {
    faceFor -= dt;
    const d = Math.atan2(Math.sin(faceYaw - follow.yaw), Math.cos(faceYaw - follow.yaw));
    follow.yaw += d * Math.min(1, dt * 2.2);
    follow.pitch += (0.1 - follow.pitch) * Math.min(1, dt * 2);
  }
  // the narration's progress
  const pr = S.mode === "play" ? narration.progress() : null;
  nprog.hidden = !pr;
  if (pr) {
    nprogBar.style.transform = `scaleX(${(pr.t / pr.total).toFixed(4)})`;
    nprogShow = Math.max(0, nprogShow - dt);
    nprog.classList.toggle("show", nprogShow > 0);
    nprogTime.textContent = `${clock(pr.t)} / ${clock(pr.total)}`;
  }
}


/* The walk-throughs (the owner: "a walk thru for all monuments and rooms… end to end with the
   narrations well timed, then… another tab on map where you see walked tours"). A tour is the
   monuments' rooms in order: it takes you in, lets each room's recording play to its end (a
   moment's stillness after), walks you to the door onward and through it, and so on to the last,
   then out into the world. The stick rests while it runs (as in the temple tour); "Skip ›" goes on
   to the next room at once, "✕" ends it where you are. Walked tours are saved on the device and
   marked on the map's Tours tab. */
/** A stop: a monument's room (hall, stage), or a place with its own guided tour (the temple's,
    the Duat's), walked inside the walk. */
interface WalkStop { hall: number; stage: number; place?: "temple" | "duat" | "site"; site?: SiteStop }
/** A narrated place out in the world, walked as a stop (the owner: "add all of the narrated tours
    to tours… end to end goes thru all of them in a sense making manner"): a lesson's or a vision's
    seat (sitting begins it), the world after the veil or the long descent (going in begins its
    guide), or a telling heard where it is (the ancient worlds, the pyramid's meditation). The walk
    goes there, lets its recording play to its end, and goes on. */
interface SiteStop {
  label: string;
  /** Its recording (a catalogue id or a path): heard to its end, the stop is done. */
  track: string;
  /** Where the walk goes to first. */
  at: () => { x: number; z: number; heading?: number };
  /** A lesson's seat: the wanderer walks onto it and sits. */
  seat?: { x: number; z: number; heading: number };
  /** An area (the halls' index): in through its door, then its guide leads. */
  area?: number;
}
const seatStop = (id: keyof typeof SITES, label: string, track: string): SiteStop => {
  const st = SITES[id];
  return { label, track, seat: st, at: () => ({ x: st.x + Math.sin(st.heading) * 2.4, z: st.z + Math.cos(st.heading) * 2.4, heading: st.heading }) };
};
const hereStop = (label: string, track: string, mapLabel = label): SiteStop => ({ label, track, at: () => placeAt(mapLabel)?.start ?? { x: 0, z: 0 } });
const SITE_STOPS = (): Record<string, SiteStop> => ({
  meditation: { label: "The pyramid's meditation", track: "PYRAMID-MEDITATION", at: () => falseDoors.calm },
  veil: { label: halls[3].hall.label, track: VEIL_TRACK(7), area: 3, at: () => halls[3].hall.outside() },
  descent: { label: halls[4].hall.label, track: WANDERER_TRACK(7), area: 4, at: () => halls[4].hall.outside() },
  gobekli: hereStop("Göbekli Tepe", "GOBEKLI"),
  nanmadol: hereStop("Nan Madol", "NAN-MADOL"),
  mu: hereStop("Mu, the drowned land", "LEMURIA"),
  atlantis: hereStop("Atlantis", "ATLANTIS"),
  maya: hereStop("The drowned Maya city", "MAYAN"),
  shore: seatStop("shore", "The lesson of the shore", "L03"),
  garden: seatStop("garden", "The lesson of the garden", "L05"),
  igloo: seatStop("igloo", "The lesson of the igloo", "L04"),
  galaxies: seatStop("galaxies", "The lesson of the galaxies", "L06"),
  desert: seatStop("desert", "The lesson of the desert", "L07"),
  "tree-station": seatStop("tree-station", "The tree station", "TREE"),
  atoms: seatStop("atoms", "Atoms and light", "audio/standalone/atoms_and_light.mp3"),
  "other-worlds": seatStop("other-worlds", "Other worlds", "audio/standalone/other_worlds.mp3"),
  greetings: seatStop("greetings", "Psychic greetings", "audio/standalone/psychic_greetings.mp3"),
});
const sites = (...ids: string[]): WalkStop[] => {
  const all = SITE_STOPS();
  return ids.map((id) => ({ hall: -1, stage: 0, place: "site" as const, site: all[id] }));
};
const monumentStops = (h: number): WalkStop[] => halls[h].journey.stages.map((_, i) => ({ hall: h, stage: i }));
const TEMPLE_STOP: WalkStop = { hall: -1, stage: 0, place: "temple" };
const DUAT_STOP: WalkStop = { hall: -1, stage: 0, place: "duat" };
const ANCIENT = ["gobekli", "nanmadol", "mu", "atlantis", "maya"];
const LESSONS = ["shore", "garden", "igloo", "galaxies", "desert", "tree-station"];
const VISIONS = ["atoms", "other-worlds", "greetings"];
const WALKS: { id: string; label: string; stops: () => WalkStop[] }[] = [
  {
    // everything narrated, along the one gentle way through the world (DESTS): the temple and its
    // archetypes, the pyramid and the Duat, the three monuments, the two guided areas, the
    // ancient worlds oldest first, the lessons, and last the three visions; flying between
    id: "all",
    label: "Everything, end to end",
    stops: () => [
      TEMPLE_STOP, ...sites("meditation"), DUAT_STOP,
      ...[0, 1, 2].flatMap(monumentStops), ...sites("veil", "descent"),
      ...sites(...ANCIENT), ...sites(...LESSONS), ...sites(...VISIONS),
    ],
  },
  { id: "temple", label: "The temple, guided", stops: () => [TEMPLE_STOP] },
  { id: "pyramid", label: "The pyramid's meditation and the Duat", stops: () => [...sites("meditation"), DUAT_STOP] },
  { id: "densities", label: "The densities, end to end", stops: () => monumentStops(0) },
  { id: "adept", label: "The school of the adept, end to end", stops: () => monumentStops(1) },
  { id: "past", label: "Past choices, end to end", stops: () => monumentStops(2) },
  { id: "veil", label: "The world after the veil, guided", stops: () => sites("veil") },
  { id: "descent", label: "The long descent, guided", stops: () => sites("descent") },
  { id: "ancient", label: "The ancient worlds, end to end", stops: () => sites(...ANCIENT) },
  { id: "lessons", label: "The lessons, end to end", stops: () => sites(...LESSONS) },
  { id: "visions", label: "The three visions, end to end", stops: () => sites(...VISIONS) },
];
let walked = new Set<string>();
try {
  walked = new Set(JSON.parse(localStorage.getItem("inward-journey:walked") || "[]") as string[]);
} catch {
  /* nothing walked yet */
}
/* The walk-throughs and the Duat tour share the tour bar (ui/tourBar.ts) with the temple tour:
   ⟲ ten seconds back (near a room's start, or a voiceless one, the stop before), ❚❚/▶, » on, ✕. */
const walkBar: TourBarOwner = {
  back: () => (duatTour ? duatTourBack() : walkBack()),
  next: () => (duatTour ? (duatTour.skip = true) : walkSkip()),
  end: () => (duatTour ? duatTourEnd(false) : walkEnd(false)),
  progress: () => {
    if (duatTour) {
      const h = pyramid.duatHours()[duatTour.i];
      return h && duatTour.phase === "watch" ? duatTour.t / (h.cycle + 1.5) : duatTour.i >= pyramid.duatHours().length ? 1 : 0;
    }
    if (walk?.phase === "place" && walk.stops[walk.i].place === "site") {
      const pr = narration.progress();
      return pr ? pr.t / pr.total : 0;
    }
    if (!walk || walk.phase === "travel" || walk.phase === "place" || walk.phase === "leaving") return 0;
    if (walk.phase === "linger" || walk.phase === "go") return 1;
    const pr = narration.progress();
    return pr ? pr.t / pr.total : 0;
  },
};
let walk: {
  id: string;
  label: string;
  stops: WalkStop[];
  i: number;
  phase: "enter" | "listen" | "linger" | "go" | "leaving" | "travel" | "place";
  t: number;
  heard: boolean;
  skip: boolean;
  tries: number;
  /** A place's own tour has begun (the temple's, the Duat's), and how it ended. */
  begun: boolean;
  done: boolean;
  /** On the way somewhere: the nearest it has come, and when (a walk held up goes on). */
  best: { d: number; t: number };
} | null = null;
const walkTitle = (t: string, hint: string) => tourBar().set(t, hint);
function walkStart(id: string): void {
  const w = WALKS.find((x) => x.id === id);
  if (!w) return;
  stopAuto();
  standUp();
  if (duatTour) duatTourEnd(false);
  if (narration.current) narration.stop(1.5); // a background voice gives way to the tour's own
  siteHoldFrom = 0;
  walk = { id, label: w.label, stops: w.stops(), i: 0, phase: "enter", t: 0, heard: false, skip: false, tries: 0, begun: false, done: false, best: { d: Infinity, t: 0 } };
  document.body.classList.add("touring");
  tourBar().show(walkBar);
  walkTitle(w.label, "Beginning…");
  void walkEnterStop();
}
/* Between places the walk glides (the owner: "glide, don't teleport"): out through the door you
   are in, then the wanderer takes off and flies to the next place's door (or runs, when it is
   near), comes down before it and goes in. Only a place too far to fly to in good time (or a walk
   begun in a place apart) is reached through the dark. The companion goes ahead the whole way. */
const TRAVEL_MAX = 1500;
const travelTo = new THREE.Vector2();
let travelHold = false;
const crossingSettled = (): Promise<void> => new Promise((done) => {
  const f = (): void => void (crossing ? window.setTimeout(f, 100) : done());
  f();
});
function stopApproach(s: WalkStop): { x: number; z: number } {
  if (s.place === "temple") return temple.outside();
  if (s.place === "duat") return pyramid.outside();
  if (s.place === "site") return s.site!.at();
  return halls[s.hall].hall.outside();
}
async function walkEnterStop(): Promise<void> {
  if (!walk) return;
  const s = walk.stops[walk.i], j = s.place ? null : halls[s.hall].journey;
  walk.heard = false;
  walk.begun = walk.done = false;
  walk.tries++;
  const other = inHall();
  if (j && other?.journey === j) {
    // the next room of the same monument: through its door
    walk.phase = "enter";
    walk.t = 0;
    // already there (its door took us in while Skip was waiting): never through the dark again
    if (j.at !== s.stage || j.crossing) await j.enter(s.stage);
    return;
  }
  // somewhere else: out of where you are first. Until you are out the walk waits ("leaving"):
  // it used to stay in the room's last phase meanwhile, and the next frame took the half-left
  // monument for the next one and skipped on (the next monument's lobby was never walked, and
  // the flight there was lost to the dark)
  const w = walk, i = walk.i;
  if (sitting.phase === "seated") standUp(); // never carried off still seated
  walk.phase = "leaving";
  walk.t = 0;
  if (other) {
    await other.journey.leave();
    await new Promise<void>((done) => {
      const f = (): void => void (other.journey.inside || other.journey.crossing ? window.setTimeout(f, 100) : done());
      f();
    });
  }
  if (temple.inside) {
    if (!crossing) crossTemple(false);
    await crossingSettled();
  }
  if (walk !== w || walk.i !== i) return; // ended, or moved on (Skip, ⟲) while leaving
  const a = stopApproach(s);
  if (apart() || Math.hypot(a.x - player.pos.x, a.z - player.pos.z) > TRAVEL_MAX) return walkArrive();
  travelTo.set(a.x, a.z);
  walk.phase = "travel";
  walk.t = 0;
  walk.best = { d: Infinity, t: 0 };
}
/** Each frame on the way somewhere by itself (a walk between places; the guide's "Walk me
    there"): on foot when it is near, in flight when it is far, cruising ~14 m over the land and
    coming down before it; a place in the air (`y` well above its ground) is flown to at its
    height. Out of the water it rises into flight. True when there. */
function driveTo(x: number, z: number, y: number | null, since: number): boolean {
  const d = Math.hypot(x - player.pos.x, z - player.pos.z);
  (player.target ??= new THREE.Vector2()).set(x, z);
  const high = y !== null && y > Math.max(heightAt(x, z), WATER_Y) + 20;
  const cruise = high ? y - 2 : Math.max(heightAt(player.pos.x, player.pos.z), WATER_Y) + 14;
  const far = d > 45 || high;
  if (far && !player.flying && !player.swimming && since > 0.6) player.jump(); // a jump, and in the air a second: flight
  travelHold = player.swimming ? far : player.flying && (high || d > 40) && player.pos.y < cruise;
  if (player.flying) player.landing = !high && d < 34;
  return high ? d < 6 && player.pos.y > y - 12 : !player.flying && d < 2.2;
}
/** At the stop's door: in. */
function walkArrive(): void {
  if (!walk) return;
  const s = walk.stops[walk.i];
  travelHold = false;
  player.target = null;
  if (player.flying) player.landing = true;
  walk.skip = false; // Skip on the way meant "there now": it is answered
  walk.phase = s.place ? "place" : "enter";
  walk.t = 0;
  if (s.place === "temple") crossTemple(true); // its own tour begins as you go in
  else if (s.place === "duat") duatTourStart(true);
  else if (s.place === "site") siteArrive(s.site!);
  else void halls[s.hall].journey.enter(s.stage);
}
/** At a narrated place: reached through the dark when it was too far to fly (the map's arrival),
    then left to its own way of beginning (walkFrame). */
function siteArrive(st: SiteStop): void {
  const a = st.at();
  if (Math.hypot(a.x - player.pos.x, a.z - player.pos.z) > 40) {
    const place: Place = { numeral: "", label: st.label, group: "Shore", x: a.x, z: a.z, narration: "J01", start: { x: a.x, z: a.z, heading: a.heading ?? player.heading } };
    arrive({ place, x: a.x, z: a.z, heading: a.heading ?? player.heading }, false);
  }
}
const stopName = (s: WalkStop): string => (s.place === "temple" ? "The temple" : s.place === "duat" ? "The Duat" : s.place === "site" ? s.site!.label : halls[s.hall].hall.label);
/** Skip always answers: mid-crossing it is kept and taken as soon as the crossing ends. */
/* Pause (the half-moon's ❚❚ while the archive is quiet): the voice speaking stops where it is,
   and with it its clock, so rooms, lessons and the tours' advance all stand still; play goes on
   from the same moment. A tour with no voice (the Duat) pauses its own advance. */
let tourHeld = false;
tp.guest = {
  active: () => S.mode === "play" && (!!narration.current || narration.paused || tourScenes.tour.active || !!walk || !!duatTour || !!areaTour),
  paused: () => narration.paused || tourHeld,
  toggle: () => {
    if (narration.paused || tourHeld) {
      tourHeld = false;
      tourScenes.tour.held = false;
      narration.resume();
    } else {
      if (narration.current) narration.pause();
      tourHeld = !!(duatTour || walk || areaTour || tourScenes.tour.active);
    }
    tourScenes.tour.held = tourHeld;
  },
  progress: () => {
    const pr = narration.progress();
    return pr ? pr.t / pr.total : 0;
  },
  // ↺ outside a tour (a room, a lesson, a seated telling): fifteen seconds back in what is speaking, as for the archive
  back: () => void narration.rewind(15, tourHeld),
};

tourBar().togglePause = () => tp.guest?.toggle();
tourBar().isPaused = () => narration.paused || tourHeld;

/* The Duat, hour by hour (⋮ → Map → Tours): the auto-advance pattern. A guide's walk from hour to
   hour: you are walked to the place before each story and turned to it; the story begins for you
   and tells itself once through, beat by beat; then on to the next, and at the end up the stair
   into the dawn. Skip › goes on, ✕ ends it. No words but the places' names. */
let duatTour: { i: number; phase: "enter" | "walk" | "watch"; t: number; skip: boolean } | null = null;
/** `chained`: a stop of a walk (the grand tour), which goes on when the Duat's tour ends. */
function duatTourStart(chained = false): void {
  stopAuto();
  standUp();
  if (walk && !chained) walkEnd(false);
  inHall()?.journey.leaveNow();
  if (temple.inside) setInside(false);
  duatTour = { i: 0, phase: "enter", t: 0, skip: false };
  document.body.classList.add("touring");
  tourBar().show(walkBar);
  walkTitle("The Duat, hour by hour", "Beginning…");
  if (!pyramid.duatActive) {
    if (!pyramid.isInside) setPyr(true);
    crossing = false;
    enterDuatCrossing();
  }
}
function duatTourEnd(done: boolean): void {
  if (!duatTour) return;
  duatTour = null;
  player.target = null;
  if (walk) {
    // a stop of a walk: the walk goes on (or ends, if this was ended by hand)
    walk.done = done;
    return;
  }
  document.body.classList.remove("touring");
  tourBar().hide(walkBar);
  if (done) {
    walked.add("duat");
    try {
      localStorage.setItem("inward-journey:walked", JSON.stringify([...walked]));
    } catch {
      /* fine */
    }
    window.setTimeout(() => offerNext("duat", "The Duat, hour by hour"), 1500);
  }
}
const duatTo = new THREE.Vector2();
function duatTourFrame(dt: number): void {
  const d = duatTour;
  if (!d || tourHeld) return;
  goalOn = false;
  d.t += dt;
  if (d.phase === "enter") {
    if (pyramid.duatActive && !crossing) Object.assign(d, { phase: "walk", t: 0 });
    else if (d.t > 25) duatTourEnd(false); // a slow phone builds and compiles the Duat in the dark: 12 s gave up on it
    return;
  }
  if (!pyramid.duatActive) return void (crossing ? 0 : duatTourEnd(d.i >= pyramid.duatHours().length));
  const hs = pyramid.duatHours(), O = DUAT_ORIGIN;
  if (d.skip && !crossing) {
    d.skip = false;
    if (d.i < hs.length) Object.assign(d, { i: d.i + 1, phase: "walk", t: 0 });
  }
  if (d.i >= hs.length) {
    // the last: up the stair into the dawn (leaving the Duat ends the tour)
    const p7 = pyramid.PATH[pyramid.PATH.length - 1];
    duatTo.set(O.x + p7.x, O.z + p7.z);
    (player.target ??= new THREE.Vector2()).copy(duatTo);
    tourGoal(duatTo.x, duatTo.y);
    walkTitle("Dawn", `${hs.length} of ${hs.length}`);
    // the stair's top ends the tour by itself; if the way up is held up, the tour still ends
    // (it used to wait forever, the controls hidden), leaving you on the stair with them back
    if (d.t > 60) duatTourEnd(true);
    return;
  }
  const h = hs[d.i], sx = O.x + h.stand.x, sz = O.z + h.stand.z;
  walkTitle(h.name, `${d.i + 1} of ${hs.length}`);
  if (d.phase === "walk") {
    duatTo.set(sx, sz);
    (player.target ??= new THREE.Vector2()).copy(duatTo);
    tourGoal(sx, sz);
    if (Math.hypot(player.pos.x - sx, player.pos.z - sz) < 0.9 || d.t > 45) {
      player.target = null;
      player.pos.x = sx;
      player.pos.z = sz;
      player.heading = h.heading;
      faceYaw = h.heading;
      faceFor = 2.5;
      pyramid.duatRestart(d.i);
      Object.assign(d, { phase: "watch", t: 0 });
    }
  } else if (d.t > h.cycle + 1.5) {
    // the last story waits for the Duat's telling to end (it ran ~70 s past the dawn's climb, and
    // was heard back out in the world), at most two minutes more
    const telling = narration.current === DUAT_TRACKS.entry || narration.loading;
    if (d.i < hs.length - 1 || !telling || d.t > h.cycle + 120) Object.assign(d, { i: d.i + 1, phase: "walk", t: 0 });
  }
}
/** Each frame at a narrated place: begin it its own way, hear it to the end, then on. */
/** When a walk began holding at an area's door for a word spoken there (0: not holding). */
let siteHoldFrom = 0;
function siteFrame(st: SiteStop): void {
  if (!walk) return;
  const playing = narration.current === st.track;
  if (st.area !== undefined) {
    // an area: in through its door; inside, its guide leads from place to place; out at the
    // path's end (or its ✕, which ends the walk)
    const h = halls[st.area], j = h.journey;
    if (!walk.begun) {
      if (j.inside && !j.crossing) {
        walk.begun = true;
        areaTourStart(j, h.hall.label);
      } else if (!j.crossing && (narration.current || narration.loading) && performance.now() - siteHoldFrom < 150000) {
        // a word spoken at the door (the angel's, beat 1): heard before going in. The walk went
        // straight through, and crossing the door cut it after a second
        if (!siteHoldFrom) siteHoldFrom = performance.now();
        player.target = null;
        tourGoal(h.hall.door.x, h.hall.door.z);
        walk.t = Math.min(walk.t, 1);
      } else if (!j.crossing) {
        driveTo(h.hall.door.x, h.hall.door.z, null, walk.t);
        tourGoal(h.hall.door.x, h.hall.door.z);
        if (walk.t > 60) walkNext(); // the door never took us in: on
      }
    } else if (!j.inside && !j.crossing) walkNext();
    else if (j.inside && !j.crossing && !areaTour) walkEnd(false);
    return;
  }
  if (playing) walk.heard = true;
  if (!walk.begun) {
    if (st.seat) {
      // a lesson's seat: onto it, and sitting begins its telling
      walkTo.set(st.seat.x, st.seat.z);
      (player.target ??= new THREE.Vector2()).copy(walkTo);
      tourGoal(st.seat.x, st.seat.z);
      if (sitting.phase === "seated" || playing) (walk.begun = true), (player.target = null), (walk.t = 0);
      else if (walk.t > 25) (walk.begun = true), (player.target = null), (walk.t = 0), void narration.play(st.track); // never sat: told where it stands
    } else {
      // a telling heard where it is
      walk.begun = true;
      walk.t = 0;
      if (st.track === "PYRAMID-MEDITATION") meditationHeard = true;
      if (!playing) void narration.play(st.track);
    }
    return;
  }
  // heard to its end (or never begun after a while): a moment's stillness, then on
  if (walk.done) {
    if (walk.t > 3) walkNext();
  } else if ((walk.heard && !playing && !narration.paused) || (!walk.heard && walk.t > 20)) {
    walk.done = true;
    walk.t = 0;
  }
}
/** ⟲ in a walk-through: ten seconds back in the room's telling (back into it if it has just
    ended); near its start or in a room without a voice, the room before. */
function walkBack(): void {
  if (!walk || walk.phase === "travel" || walk.phase === "place" || walk.phase === "leaving") return;
  const s = walk.stops[walk.i], j = halls[s.hall].journey;
  if (j.crossing || walk.phase === "enter") return;
  const pr = narration.progress();
  if (j.voiced && (pr ? pr.t > 3 : walk.heard) && narration.rewind(10, tourHeld)) {
    if (walk.phase !== "listen") {
      player.target = null;
      walk.phase = "listen";
      walk.t = 0;
    }
    return;
  }
  if (walk.i === 0) return;
  walk.i--;
  walk.tries = 0;
  void walkEnterStop();
}
/** ⟲ in the Duat: the hour's story again from its beginning; near its start, the hour before. */
function duatTourBack(): void {
  const d = duatTour;
  if (!d || !pyramid.duatActive) return;
  if (d.phase === "watch" && d.t > 3 && d.i < pyramid.duatHours().length) {
    pyramid.duatRestart(d.i);
    d.t = 0;
    return;
  }
  Object.assign(d, { i: Math.max(0, d.i - 1), phase: "walk", t: 0 });
}
function walkSkip(): void {
  if (!walk) return;
  if (inHall()?.journey.crossing || walk.phase === "travel" || walk.phase === "leaving") walk.skip = true; // on the way: there at once
  else walkNext();
}
function walkNext(): void {
  if (!walk) return;
  siteHoldFrom = 0;
  siteLeave();
  walk.skip = false;
  walk.tries = 0;
  walk.i++;
  if (walk.i >= walk.stops.length) return walkEnd(true);
  void walkEnterStop();
}
/** Going on from a narrated place: its voice gives way, the seat is left, its guide stops. */
function siteLeave(): void {
  const s = walk?.stops[walk.i];
  if (s?.place !== "site") return;
  if (narration.current === s.site!.track) narration.stop(1.2);
  if (sitting.phase === "seated") standUp();
  if (areaTour) areaTourEnd();
  player.target = null;
}
function walkEnd(done: boolean): void {
  if (!walk) return;
  if (!done) siteLeave();
  const w = walk;
  walk = null;
  player.target = null;
  travelHold = false;
  setRecording(false);
  if (duatTour) duatTourEnd(false);
  document.body.classList.remove("touring");
  tourBar().hide(walkBar);
  if (done) {
    walked.add(w.id);
    try {
      localStorage.setItem("inward-journey:walked", JSON.stringify([...walked]));
    } catch {
      /* fine */
    }
    const h = inHall();
    if (h) void h.journey.leave();
    const w0 = WALKS.find((x) => x.id === w.id);
    // out through the door first (a moment), then where next
    window.setTimeout(() => offerNext(({ all: "greetings", pyramid: "duat", ancient: "maya", lessons: "desert", visions: "greetings" } as Record<string, string>)[w.id] ?? w.id, w0?.label.replace(/, end to end$/, "") ?? "The walk"), h ? 3500 : 1200);
  }
}
const walkTo = new THREE.Vector2();
function walkFrame(dt: number): void {
  if (!walk || tourHeld || narration.paused) return;
  goalOn = false;
  walk.t += dt;
  const s0 = walk.stops[walk.i];
  // a place's own tour may have taken the bar and the stick for a while: the walk takes them back
  if (!tourScenes.tour.active && !document.body.classList.contains("touring")) document.body.classList.add("touring");
  if (!tourScenes.tour.active && !tourBar().shown) tourBar().show(walkBar);
  if (walk.phase === "leaving") return walkTitle(stopName(s0), `${walk.i + 1} of ${walk.stops.length} · on the way`);
  if (walk.phase === "travel") {
    walkTitle(stopName(s0), `${walk.i + 1} of ${walk.stops.length} · on the way`);
    if (walk.skip) {
      walk.skip = false;
      return walkArrive();
    }
    tourGoal(travelTo.x, travelTo.y);
    // there, or held up on the way (no nearer for 6 s: a stone or a wall before the door), or long enough
    const td = Math.hypot(travelTo.x - player.pos.x, travelTo.y - player.pos.z);
    if (td < walk.best.d - 0.5) walk.best = { d: td, t: walk.t };
    if (driveTo(travelTo.x, travelTo.y, null, walk.t) || walk.t - walk.best.t > 6 || walk.t > 150) walkArrive();
    return;
  }
  if (walk.phase === "place") {
    walkTitle(stopName(s0), `${walk.i + 1} of ${walk.stops.length}`);
    if (crossing || arriving) return;
    if (s0.place === "temple") {
      const tour = tourScenes.tour;
      if (temple.inside && tour.active) {
        walk.begun = true;
        if (tour.completed && walk.t > 6) {
          // its end ("rest at the tree / stay"): stay, and go on. Not sat down again at the
          // Choice's seat on the way (it restarted the Choice's part over the flight onward)
          choiceSit.off = false;
          tour.choose("stay");
          if (sitting.phase === "seated") standUp();
          crossTemple(false);
          walkNext();
        } else if (!tour.completed) walk.t = 0;
      } else if (walk.begun) {
        // its own ✕ ended it: so the walk ends
        if (temple.inside) crossTemple(false);
        walkEnd(false);
      } else if (walk.t > 15) walkNext(); // it never opened: on
    } else if (s0.place === "site") {
      siteFrame(s0.site!);
    } else if (s0.place === "duat") {
      if (duatTour) walk.begun = true;
      else if (walk.begun) {
        if (walk.done) walkNext();
        else walkEnd(false);
      } else if (walk.t > 20) walkNext();
    }
    return;
  }
  const s = s0, j = halls[s.hall].journey;
  const hallCrossing = !!inHall()?.journey.crossing || j.crossing;
  if (walk.skip && !hallCrossing) return walkNext();
  if (walk.phase === "enter") {
    if (j.inside && !hallCrossing && j.at === s.stage) {
      walk.phase = "listen";
      walk.t = 0;
    } else if (!hallCrossing && j.failed === s.stage) {
      walkNext(); // the room would not open (said so): on to the next
      return;
    } else if (!hallCrossing && walk.t > 4) {
      // the way in was taken by another crossing: try again once, then go on
      if (walk.tries < 2) void walkEnterStop();
      else return walkNext();
    }
    walkTitle(walk.label, `${walk.i + 1} of ${walk.stops.length}`);
    return;
  }
  const stage = j.stage;
  walkTitle(stage?.title || (stage?.id === "lobby" ? "The lobby" : walk.label), `${walk.i + 1} of ${walk.stops.length}`);
  if (walk.phase === "listen") {
    // a seated room: walk to its seat and sit (its recording begins as you do)
    const seat = j.seatAt();
    if (seat && !walk.heard) {
      walkTo.set(seat.x, seat.z);
      (player.target ??= new THREE.Vector2()).copy(walkTo);
      tourGoal(seat.x, seat.z);
    }
    const pr = narration.progress(), loading = narration.loading;
    if (pr) walk.heard = true;
    // a room is heard when its recording has played to its end; a room without a voice, a moment.
    // A recording still on its way is waited for (up to two minutes): a slow connection used to
    // reach the 14/30 s "no voice" limit first, and the tour went on before the room spoke
    const quiet = !j.voiced ? walk.t > 7 : loading ? walk.t > 120 : walk.heard ? !pr || pr.t > pr.total - 0.4 : walk.t > (stage?.seated ? 30 : 14);
    if (quiet || walk.t > 480) {
      walk.phase = "linger";
      walk.t = 0;
    }
  } else if (walk.phase === "linger") {
    if (walk.t > 3) {
      walk.phase = "go";
      walk.t = 0;
      walk.best = { d: Infinity, t: 0 };
    }
  } else if (walk.phase === "go") {
    if (sitting.phase === "seated") standUp(); // up from the seat first
    // walk to the door onward (the one that leads where the tour goes next), and through it
    const nx = walk.stops[walk.i + 1];
    const door = stage?.exits.find((e) => nx && nx.hall === s.hall && e.to === nx.stage) ?? stage?.exits[0];
    // the doors stand 6–60 m from where a room begins: the wanderer runs there and goes through,
    // and the walk only steps in (through the dark) if it is truly held up, never on a clock
    // shorter than the walk (a 9 s limit used to cut every walk to a door short)
    const dd = door ? Math.hypot(JOURNEY_ORIGIN.x + door.x - player.pos.x, JOURNEY_ORIGIN.z + door.z - player.pos.z) : 0;
    if (dd < walk.best.d - 0.5) walk.best = { d: dd, t: walk.t };
    const stalled = walk.t - walk.best.t;
    const held = stalled > 6 || walk.t > 40; // no nearer for 6 s, or far too long
    if (door && !held) {
      walkTo.set(JOURNEY_ORIGIN.x + door.x, JOURNEY_ORIGIN.z + door.z);
      // something stands in the straight way (the Past Choices' pool lies across it): step round
      // it to one side for a moment, then on to the door
      if (stalled > 1.2 && dd > 3) {
        const ax = walkTo.x - player.pos.x, az = walkTo.y - player.pos.z, side = stalled > 3.6 ? -1 : 1;
        walkTo.set(player.pos.x + (ax / dd) * 2 - (az / dd) * 4 * side, player.pos.z + (az / dd) * 2 + (ax / dd) * 4 * side);
      }
      (player.target ??= new THREE.Vector2()).copy(walkTo);
      tourGoal(walkTo.x, walkTo.y);
    }
    // the door took us on by itself, or the way to it is held up
    if (j.crossing || j.at !== s.stage || !door || held) {
      player.target = null;
      if (j.at !== s.stage && !j.crossing && nx && nx.hall === s.hall && j.at === nx.stage) {
        walk.i++;
        walk.phase = "listen";
        walk.t = 0;
        walk.heard = false;
      } else if (!j.crossing) walkNext();
    }
  }
}

/* Arrival (the owner, 2026-10-07: "no dead monuments, no hunting for a start button"): a place
   with a guided tour begins it as you come in. Through a monument's door into its lobby, its walk
   end to end; into the Duat, its hours; into the world after the veil or the long descent, a
   guided walk beside the guide from place to place, held while it speaks. The tour bar's ✕ gives
   the way back to you, and the tour doesn't begin again until you have left and come back. The
   temple's tour already begins as you go in (scenes/integration.ts). */
const HALL_WALKS = ["densities", "adept", "past"];
let arrivedIn: Journey | null = null;
let duatArrived = false;
let areaTour: Journey | null = null;
const areaBar: TourBarOwner = {
  back: () => void narration.rewind(10, tourHeld),
  next: () => void (narration.current && narration.stop(1)), // the line ends: the guide goes on to its next place
  end: () => areaTourEnd(),
  progress: () => {
    const pr = narration.progress();
    return pr ? pr.t / pr.total : 0;
  },
};
function areaTourStart(j: Journey, title: string): void {
  if (narration.current) narration.stop(1.5); // a background voice gives way to the guide's
  areaTour = j;
  document.body.classList.add("touring");
  tourBar().show(areaBar);
  walkTitle(title, "Walking with the guide");
}
function areaTourEnd(): void {
  if (!areaTour) return;
  areaTour = null;
  player.target = null;
  document.body.classList.remove("touring");
  tourBar().hide(areaBar);
}
// still frames keep their own placing; `&arrive` lets one show a tour beginning
const ARRIVE_IN_STILLS = new URLSearchParams(location.search).has("arrive");
function arrivalFrame(): void {
  if (S.mode !== "play" || (STILL && !ARRIVE_IN_STILLS)) return;
  const at = inHall(), j = at?.journey ?? null;
  if (!j || !j.inside) {
    arrivedIn = null;
    areaTourEnd();
  } else if (j !== arrivedIn && !j.crossing) {
    arrivedIn = j;
    const k = halls.findIndex((h) => h.journey === j);
    // not when a tour brought you here, nor by the pyramid's gate straight into Egypt
    if (!walk && !duatTour && !j.via) {
      if (k >= 0 && k < HALL_WALKS.length) {
        if (j.at === 0) walkStart(HALL_WALKS[k]);
      } else if (at && at.hall !== mazeHall) areaTourStart(j, at.hall.label);
    }
  }
  if (areaTour && !tourHeld && !narration.paused) {
    const p = areaTour.lead();
    if (p) (player.target ??= new THREE.Vector2()).set(p.x, p.z);
    else player.target = null;
  }
  // the Duat: its hours begin as you come down into it
  if (!pyramid.duatActive) duatArrived = false;
  else if (!duatArrived && !crossing) {
    duatArrived = true;
    if (!duatTour && !walk) duatTourStart();
  }
}

/* "Start the tour" (the owner: "add start tour in a big enough radius within the entrance to those
   areas"): within 45 m of a tour place's entrance (the three monuments, the world after the veil,
   the long descent, the temple, the pyramid for the Duat), or inside its start (a monument's lobby,
   the area, the temple hall, the pyramid's rooms or the Duat) while no tour runs, a button offers
   its tour. From outside it takes you to the door and in, and the tour begins there; inside, at
   once. Arriving through a door still begins the tour by itself; this is for coming near, for
   arriving another way, and for after a tour was ended. */
const OFFER_R = 45;
interface TourPlace { label: string; door: () => { x: number; z: number }; inside: () => boolean; start: (inside: boolean) => void }
let pendingArea: { k: number; since: number } | null = null;
const TOUR_PLACES: TourPlace[] = [
  ...[0, 1, 2].map((k): TourPlace => ({
    label: halls[k].hall.label,
    door: () => halls[k].hall.door,
    inside: () => halls[k].journey.inside && halls[k].journey.at === 0,
    start: () => walkStart(HALL_WALKS[k]),
  })),
  ...[3, 4].map((k): TourPlace => ({
    label: halls[k].hall.label,
    door: () => halls[k].hall.door,
    inside: () => halls[k].journey.inside,
    start: (inside) => {
      if (inside) areaTourStart(halls[k].journey, halls[k].hall.label);
      else pendingArea = { k, since: 0 }; // walked to the door; going in begins it
    },
  })),
  { label: "The temple", door: () => temple.outside(), inside: () => temple.inside, start: (inside) => (inside ? tourScenes.beginTour() : walkStart("temple")) },
  { label: "The Duat, hour by hour", door: () => pyramid.outside(), inside: () => pyramid.isInside, start: () => duatTourStart() },
];
const offerEl = $("#tour-start"), offerWhere = offerEl.querySelector(".where") as HTMLElement;
let offered: { place: TourPlace; inside: boolean } | null = null;
function tourOfferFrame(dt: number): void {
  // on the way to a door to begin an area's tour: the stick or the button takes over
  if (pendingArea) {
    const h = halls[pendingArea.k];
    pendingArea.since += dt;
    if (h.journey.inside || h.journey.crossing || crossing) pendingArea = null;
    else if (Math.hypot(input.move.x, input.move.y) > 0.25 || input.hold || pendingArea.since > 60) (pendingArea = null), (player.target = null);
    else driveTo(h.hall.door.x, h.hall.door.z, null, pendingArea.since);
  }
  let want: { place: TourPlace; inside: boolean } | null = null;
  const free = S.mode === "play" && !walk && !duatTour && !areaTour && !pendingArea && !tourScenes.tour.active && !crossing && !nextUp.shown &&
    sitting.phase === "none" && !startMap.isOpen && $("#menu").hidden && !temple.cardsOpen && !inHall()?.journey.crossing;
  if (free) {
    for (const pl of TOUR_PLACES) {
      if (pl.inside()) {
        want = { place: pl, inside: true };
        break;
      }
      if (apart()) continue;
      const d = pl.door();
      if (Math.hypot(player.pos.x - d.x, player.pos.z - d.z) < OFFER_R && !player.swimming && !player.flying) {
        want = { place: pl, inside: false };
        break;
      }
    }
  }
  if (want?.place !== offered?.place || want?.inside !== offered?.inside) {
    offered = want;
    offerEl.hidden = !want;
    if (want) offerWhere.textContent = want.place.label;
  }
}
offerEl.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  const o = offered;
  if (!o) return;
  offerEl.hidden = true;
  offered = null;
  stopAuto();
  o.place.start(o.inside);
});
offerEl.addEventListener("click", (e) => (e as MouseEvent).detail === 0 && offered && (offered.place.start(offered.inside), (offerEl.hidden = true), (offered = null)));

/* Where next (the owner: "once the temple tour is done, then you are suggested the next
   destination… do that for all of them"). When something comes to its end (a monument's walk, the
   temple's tour, the Duat's hours, the world after the veil, the long descent, a lesson, a vision,
   an ancient world's telling), a card names it and offers where to go next: the next places along
   one gentle way through the world not yet done, nearest first among the next few, with which way
   and how far, and "Stay here" (ui/nextUp.ts). What is done is remembered on the device. A choice
   goes there the best way it can: a place with a tour begins its tour (which takes you there,
   walking or flying), anything else is reached by the map's arrival. */
const nextUp = new NextUp();
interface Dest { id: string; label: string; at: () => { x: number; z: number }; go: () => void }
const placeAt = (label: string): Place | undefined => places().find((p) => p.label === label);
function goPlace(label: string, then?: () => void): void {
  const p = placeAt(label);
  if (!p) return;
  stopAuto();
  arrive({ place: p, x: p.start.x, z: p.start.z, heading: p.start.heading }, false);
  if (then) window.setTimeout(then, 700);
}
const placeDest = (id: string, label: string, title = label): Dest => ({ id, label: title, at: () => placeAt(label) ?? { x: 0, z: 0 }, go: () => goPlace(label) });
const areaDest = (id: string, k: number): Dest => ({
  id,
  label: halls[k].hall.label,
  at: () => halls[k].hall.door,
  // to its door (the map's arrival), then in: going in begins its guide
  go: () => goPlace(halls[k].hall.label, () => (pendingArea = { k, since: 0 })),
});
/** One gentle way through the world: the shore's tree, the temple, the pyramid, the monuments,
    the areas, the ancient worlds, the lessons and the visions. */
const DESTS: Dest[] = [
  { id: "tree", label: "Rest at the tree of life", at: () => SITES.tree, go: () => (temple.inside ? tourScenes.gotoTree() : goPlace("❋ The tree of life")) },
  { id: "temple", label: "The temple, guided", at: () => temple.gateAt, go: () => walkStart("temple") },
  { id: "duat", label: "The pyramid and the Duat", at: () => pyramid.door, go: () => duatTourStart() },
  { id: "densities", label: halls[0].hall.label, at: () => halls[0].hall.door, go: () => walkStart("densities") },
  { id: "adept", label: halls[1].hall.label, at: () => halls[1].hall.door, go: () => walkStart("adept") },
  { id: "past", label: halls[2].hall.label, at: () => halls[2].hall.door, go: () => walkStart("past") },
  areaDest("veil", 3),
  areaDest("descent", 4),
  placeDest("maze", "The mind's maze"),
  placeDest("gobekli", "Göbekli Tepe"),
  placeDest("nanmadol", "Nan Madol"),
  placeDest("mu", "Mu, the drowned land"),
  placeDest("atlantis", "Atlantis"),
  placeDest("maya", "The drowned Maya city"),
  placeDest("shore", "The lesson of the shore"),
  placeDest("garden", "The lesson of the garden"),
  placeDest("igloo", "The lesson of the igloo"),
  placeDest("galaxies", "The lesson of the galaxies"),
  placeDest("desert", "The lesson of the desert"),
  placeDest("atoms", "Atoms and light"),
  placeDest("other-worlds", "Other worlds"),
  placeDest("greetings", "Psychic greetings"),
];
/** The recordings whose end is the end of an experience (heard to the end, not stopped). */
const TRACK_DEST: Record<string, string> = {
  L03: "shore", L04: "igloo", L05: "garden", L06: "galaxies", L07: "desert",
  "audio/standalone/atoms_and_light.mp3": "atoms", "audio/standalone/other_worlds.mp3": "other-worlds", "audio/standalone/psychic_greetings.mp3": "greetings",
  MAYAN: "maya", ATLANTIS: "atlantis", LEMURIA: "mu", GOBEKLI: "gobekli", "NAN-MADOL": "nanmadol",
  [VEIL_TRACK(7)]: "veil", [WANDERER_TRACK(7)]: "descent",
};
let doneDests = new Set<string>();
try {
  doneDests = new Set(JSON.parse(localStorage.getItem("inward-journey:done") || "[]") as string[]);
} catch {
  /* nothing done yet */
}
function markDone(id: string): void {
  doneDests.add(id);
  try {
    localStorage.setItem("inward-journey:done", JSON.stringify([...doneDests]));
  } catch {
    /* fine */
  }
}
/** Where you are in the world, for which way and how far: in a place apart (the temple, the
    pyramid, a monument's rooms, the deep archive), its door outside. */
function whereFrom(): { x: number; z: number } {
  if (temple.inside) return temple.outside();
  if (pyramid.isInside) return pyramid.outside();
  if (under()) return under()!.outside();
  const h = inHall();
  if (h?.journey.inside) return h.hall.outside();
  if (depths.inside) return depths.outside(depths.mouths[0].site);
  return player.pos;
}
function bearingTo(x: number, z: number): string {
  const o = whereFrom();
  const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz);
  if (d < 60) return "close by";
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  const dir = names[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8];
  return `${dir} · ${d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`}`;
}
/** Something has come to its end: remember it, and offer where next. `first`: an option that
    belongs to this place's own ending (the temple's tree of life). */
function offerNext(doneId: string, title: string, opts: { first?: Dest; stay?: string } = {}): void {
  markDone(doneId);
  if (walk || duatTour || areaTour || isTv || S.mode !== "play") return;
  const i0 = Math.max(0, DESTS.findIndex((d) => d.id === doneId));
  // the next few along the way not yet done, nearest of them first
  const ahead: Dest[] = [];
  for (let k = 1; k < DESTS.length && ahead.length < 4; k++) {
    const d = DESTS[(i0 + k) % DESTS.length];
    if (!doneDests.has(d.id) && d.id !== opts.first?.id) ahead.push(d);
  }
  if (!ahead.length) for (let k = 1; k <= 2; k++) ahead.push(DESTS[(i0 + k) % DESTS.length]);
  const from = whereFrom();
  const dist = (d: Dest) => {
    const p = d.at();
    return Math.hypot(p.x - from.x, p.z - from.z);
  };
  const pick = [ahead[0], ...ahead.slice(1).sort((a, b) => dist(a) - dist(b))].slice(0, opts.first ? 1 : 2);
  const options = [...(opts.first ? [opts.first] : []), ...pick].map((d) => {
    const p = d.at();
    return { label: d.label, note: d.id === "tree" && temple.inside ? "out through the temple's door" : bearingTo(p.x, p.z), go: () => d.go() };
  });
  nextUp.show(`${title}: complete`, options, opts.stay);
}
// a lesson, a vision, an ancient world's telling, an area's last word: heard to its end
narration.onEnd = (id) => {
  const d = TRACK_DEST[id];
  if (!d) return;
  const dest = DESTS.find((x) => x.id === d);
  window.setTimeout(() => offerNext(d, dest?.label.replace(/^Rest at /, "") ?? "The telling"), 2500);
};
// the card goes when you start on your own way
function nextUpFrame(): void {
  if (nextUp.shown && (walk || duatTour || tourScenes.tour.active || Math.hypot(input.move.x, input.move.y) > 0.5)) nextUp.hide();
}

/* The companion (world/companion.ts): with you on every walk-through and the Duat's tour, ahead on
   the way to where the tour goes next, at your shoulder while a place speaks. The temple tour has
   its own light of the same look, so it steps back there. */
const companion = new Companion(scene);
const tourGoalV = new THREE.Vector3();
let goalOn = false;
function tourGoal(x: number, z: number): void {
  goalOn = true;
  tourGoalV.set(x, apart() || inJourney(x) ? player.pos.y : Math.max(heightAt(x, z), WATER_Y), z);
}
function companionFrame(dt: number): void {
  const on = S.mode === "play" && (!!walk || !!duatTour) && !(temple.inside && tourScenes.tour.active);
  companion.update(dt, on, player.pos, player.heading, on && goalOn ? tourGoalV : null);
}

/* Record mode (the tour bar's ◉; the owner records the tours for the TV app): every control,
   hint, line and word fades, leaving the world, the companion and the animations. A touch
   anywhere brings them back; the end of the walk does too. */
function setRecording(on: boolean): void {
  if (document.body.classList.contains("recording") === on) return;
  document.body.classList.toggle("recording", on);
}
tourBar().onRecord = () => {
  whisper("Record mode: everything but the world fades. Touch anywhere to bring the controls back.", 2600);
  window.setTimeout(() => (walk || duatTour || tourScenes.tour.active) && setRecording(true), 2800);
};
// a touch anywhere (or any key) brings the controls back. A long press never arrived: with every
// layer let go of touch, the phone took the press as its own gesture and cancelled it (the owner:
// "there is no way to exit it"). The touch that ends record mode does nothing else.
{
  const end = (e: Event): void => {
    if (!document.body.classList.contains("recording")) return;
    e.preventDefault();
    e.stopPropagation();
    setRecording(false);
  };
  window.addEventListener("pointerdown", end, { capture: true });
  window.addEventListener("keydown", end, { capture: true });
}

/** In a place apart (the temple, the deep archive, the pyramid): the open world rests. */
function apart(): boolean {
  return temple.inside || depths.inside || pyramid.isInside || !!under() || !!inHall()?.journey.inside;
}
let pyrHidden: [THREE.Object3D, boolean][] = [];
const toldPyr = new Set<string>();
function tellPyr(key: string, text: string, ms = 7000): void {
  if (toldPyr.has(key)) return;
  toldPyr.add(key);
  whisper(text, ms);
}
function setPyr(inside: boolean): void {
  if (inside === pyramid.isInside) return;
  if (inside) {
    const keep = new Set<THREE.Object3D>([pyramid.inside, sevenGroup, wanderer.root, wanderer.fx, camera]);
    pyrHidden = scene.children.filter((o) => !keep.has(o)).map((o) => [o, o.visible]);
    for (const [o] of pyrHidden) o.visible = false;
    pyramid.show(true);
    audio.setTemple(true, false);
    const e = pyramid.entry();
    player.pos.set(e.x, pyramid.floorAt(e.x, e.z), e.z);
    player.heading = e.heading;
    follow.yaw = e.heading;
    follow.pitch = 0.15;
  } else {
    for (const [o, v] of pyrHidden) o.visible = v;
    pyrHidden = [];
    pyramid.show(false);
    audio.setTemple(false);
    audio.resonance(0);
    endRite();
    const o = pyramid.outside();
    player.pos.set(o.x, heightAt(o.x, o.z), o.z);
    player.heading = o.heading;
    follow.yaw = o.heading;
    terrain.update(o.x, o.z, true);
  }
  Object.assign(player, { flying: false, landing: false, grounded: true, swimming: false, vy: 0, target: null });
  player.vel.set(0, 0, 0);
  follow.snapTo(player.pos);
  quality.hold(3);
}
function crossPyr(inside: boolean): void {
  if (crossing) return;
  crossing = true;
  stopAuto();
  fadeEl.classList.add("on");
  audio.bell(inside ? 293.66 : 440, 0.1, 6);
  window.setTimeout(async () => {
    if (inside) busy(1.5);
    setPyr(inside); // the Duat is built as you go in, and freed as you come out
    await compileInDark();
    if (inside) whisper("A pyramid of the teachers, built from thought of living stone, for healing and for initiation, one work. Later its power was kept by a few, which was never meant. Enter as one who seeks.", 10000);
    else whisper("The guides called such shapes training wheels: in time the heart holds, without them, what they gather.", 8000);
    window.setTimeout(() => {
      fadeEl.classList.remove("on");
      crossing = false;
    }, 250);
  }, 650);
}

/* Underground (world/cavern.ts, world/mines.ts): the crystal caverns, behind a cold fissure at the
   back of the cave by the shore, and the gold mines, through their portals in the hills. Each is a
   place apart, one long way down; walk back up to its doorway to come out. */
const cavern = new Cavern();
const mines = MINE_SITES.map((_, i) => new GoldMine(i));
const unders: Underground[] = [cavern, ...mines];
for (const u of unders) scene.add(u.group, u.world);
/** The underground place you are in, if any. */
function under(): Underground | null {
  for (const u of unders) if (u.inside) return u;
  return null;
}
let underHidden: [THREE.Object3D, boolean][] = [];
const toldUnder = new Set<Underground>();
function setUnder(u: Underground, inside: boolean): void {
  if (inside === u.inside) return;
  if (inside) {
    const keep = new Set<THREE.Object3D>([u.group, wanderer.root, wanderer.fx, camera]);
    underHidden = scene.children.filter((o) => !keep.has(o)).map((o) => [o, o.visible]);
    for (const [o] of underHidden) o.visible = false;
    u.show(true);
    audio.setTemple(true, false);
    const e = u.entry();
    player.pos.set(e.x, e.y, e.z);
    player.heading = e.heading;
    follow.yaw = e.heading;
    follow.pitch = 0.12;
  } else {
    for (const [o, v] of underHidden) o.visible = v;
    underHidden = [];
    u.show(false);
    audio.setTemple(false);
    audio.quartzHum(0);
    const o = u.outside();
    player.pos.set(o.x, heightAt(o.x, o.z), o.z);
    player.heading = o.heading;
    follow.yaw = o.heading;
    terrain.update(o.x, o.z, true);
  }
  Object.assign(player, { flying: false, landing: false, grounded: true, swimming: false, vy: 0, target: null });
  player.vel.set(0, 0, 0);
  follow.snapTo(player.pos);
  quality.hold(3);
}
const setCavern = (inside: boolean): void => setUnder(cavern, inside);
function crossUnder(u: Underground, inside: boolean): void {
  if (crossing) return;
  crossing = true;
  stopAuto();
  fadeEl.classList.add("on");
  audio.bell(inside ? 220 : 330, 0.08, 7);
  window.setTimeout(async () => {
    if (inside) busy(1.5);
    setUnder(u, inside);
    await compileInDark();
    if (inside) whisper(u.spec.greeting, 9000);
    window.setTimeout(() => {
      fadeEl.classList.remove("on");
      crossing = false;
    }, 250);
  }, 650);
}
function undergroundFrame(): void {
  for (const u of unders) u.update(S.wt, player.pos);
  if (S.mode !== "play") return;
  const u = under();
  if (!u) {
    if (apart()) return;
    for (const w of unders) {
      const d = player.pos.distanceTo(w.door);
      if (d < 9 && !toldUnder.has(w)) {
        toldUnder.add(w);
        whisper(w === cavern ? "A cold breath comes from a crack at the back of the cave, and a faint violet light." : "An old mine: its adit runs into the hill, a lantern by the door.", 7000);
      }
      if (!crossing && !autofly.active && !player.flying && !player.swimming && w.atDoor(player.pos)) crossUnder(w, true);
    }
    return;
  }
  if (player.flying) player.flying = false;
  if (follow.dist > 4.4) follow.dist = 4.4;
  if (u.confine(player.pos) && !crossing) crossUnder(u, false);
  const said = u.arrived(player.pos);
  if (said) whisper(said, 6000);
  audio.quartzHum(u.heartNear);
  // the air underground: near black (a little violet among the crystals, warm by the mine's lamps)
  if (u === cavern) fogUniforms.color.value.setRGB(0.006, 0.005, 0.012);
  else fogUniforms.color.value.setRGB(0.01, 0.007, 0.004);
  fogUniforms.density.value = u === cavern ? 0.016 : 0.022;
  gradeUniforms.shadow.value.setRGB(0.004, 0.002, u === cavern ? 0.012 : 0.004);
  gradeUniforms.high.value.setRGB(1.0, 0.98, 0.96);
  gradeUniforms.sat.value = 1.05;
  gradeUniforms.contrast.value = 1.06;
}

/* The Duat crossing — fade-crossing idiom (crossPyr) + teleport idiom (setPyr), verbatim.
   The Duat lives inside src/world/pyramid.ts; main.ts only feeds the player position
   and teleports in/out. */
const DUAT_WALKBACK_R = 3; // units — walk-back exit at duat-local (0, 0, 0)
const DUAT_DAWN_R = 4; // units — dawn end at duat-local (-8, 5, -20)

// Face along the Duat path (entry -> PATH[1]). Finite-guarded; no division.
function duatPathHeading(): number {
  const a = pyramid.duatEntryPoint();
  const p1 = pyramid.PATH[1] ?? pyramid.PATH[0];
  const dx = DUAT_ORIGIN.x + p1.x - a.x;
  const dz = DUAT_ORIGIN.z + p1.z - a.z;
  const d = Math.hypot(dx, dz);
  return Number.isFinite(d) && d > 1e-3 ? Math.atan2(dx, dz) : Math.PI;
}

let duatVentured = false;
function enterDuatCrossing(): void {
  duatVentured = false;
  if (crossing) return;
  crossing = true;
  stopAuto();
  fadeEl.classList.add("on");
  audio.bell(293.66, 0.1, 6);
  window.setTimeout(() => {
    const e = pyramid.duatEntryPoint();
    const h = duatPathHeading();
    player.pos.set(e.x, e.y, e.z);
    player.heading = h;
    follow.yaw = h;
    follow.pitch = 0.22; // level: it can arrive still looking down into the pit above
    Object.assign(player, { flying: false, landing: false, grounded: true, swimming: false, vy: 0, target: null });
    player.vel.set(0, 0, 0);
    follow.snapTo(player.pos);
    pyramid.duatActive = true;
    whisper("The Duat", 5000);
    if (DUAT_TRACKS.entry) void narration.play(DUAT_TRACKS.entry); // the Duat's narration, once per entry (duat-landfall)
    window.setTimeout(() => {
      fadeEl.classList.remove("on");
      crossing = false;
    }, 250);
  }, 650);
}

function exitDuatWalkBack(): void {
  duatVentured = false;
  if (crossing) return;
  crossing = true;
  stopAuto();
  fadeEl.classList.add("on");
  audio.bell(293.66, 0.1, 6);
  window.setTimeout(() => {
    const e = pyramid.exitDuatPoint();
    const h = Math.PI;
    player.pos.set(e.x, e.y, e.z);
    player.heading = h;
    follow.yaw = h;
    Object.assign(player, { flying: false, landing: false, grounded: true, swimming: false, vy: 0, target: null });
    player.vel.set(0, 0, 0);
    follow.snapTo(player.pos);
    pyramid.duatActive = false;
    window.setTimeout(() => {
      fadeEl.classList.remove("on");
      crossing = false;
    }, 250);
  }, 650);
}

function exitDuatDawn(): void {
  duatVentured = false;
  if (crossing) return;
  crossing = true;
  stopAuto();
  fadeEl.classList.add("on");
  audio.bell(293.66, 0.1, 6);
  window.setTimeout(() => {
    setPyr(false);
    const a = pyramid.apex;
    const h = player.heading;
    player.pos.set(a.x, a.y + 1.2, a.z);
    player.heading = h;
    follow.yaw = h;
    Object.assign(player, { flying: false, landing: false, grounded: true, swimming: false, vy: 0, target: null });
    player.vel.set(0, 0, 0);
    follow.snapTo(player.pos);
    pyramid.duatActive = false;
    whisper("Dawn", 5000);
    if (DUAT_TRACKS.dawn) void narration.play(DUAT_TRACKS.dawn); // none yet (DUAT_TRACKS)
    window.setTimeout(() => {
      fadeEl.classList.remove("on");
      crossing = false;
    }, 250);
  }, 650);
}
// the rites: the Queen's Chamber (in the dark, only the heart) and the King's (seven colours)
let rite: { kind: "queen" | "king"; t: number; beats: number; step: number } | null = null;
let stillIn = 0, lastRite = -1e9;
const riteVeil = Object.assign(document.createElement("div"), { id: "rite-veil" });
document.body.append(riteVeil);
function endRite(): void {
  if (!rite) return;
  if (rite.kind === "queen") {
    riteVeil.classList.remove("on", "light");
    audio.hush(false, 2.5);
  }
  for (const sp of pyramid.seven) sp.visible = false;
  rite = null;
  lastRite = S.t;
}
const SEVEN_NOTES = [293.66, 329.63, 369.99, 392, 440, 493.88, 554.37];
const SEVEN_AT = [0.86, 0.98, 1.12, 1.28, 1.45, 1.57, 1.72]; // the energy centres, above the feet
function pyramidFrame(dt: number): void {
  pyramid.playerPos = player.pos; // the Duat reads the wanderer's position from here
  const near = !pyramid.isInside && player.pos.distanceTo(pyramid.apex) < 700;
  const pitK = pyramid.isInside ? pyramid.nearPit(player.pos) : 0;
  const atApex = !pyramid.isInside && pyramid.atApex(player.pos);
  pyramid.update(S.wt, near, pitK, rite?.kind === "king" && rite.t > 10.5 ? 1 : 0, atApex ? 1.25 : 0.6, S.reduced);
  // the false doors breathe only for someone near the pyramid outside it
  const doorsNear = !pyramid.isInside && !apart() && player.pos.distanceTo(pyramid.apex) < 260;
  falseDoors.group.visible = !pyramid.isInside && !apart() && player.pos.distanceTo(pyramid.apex) < 900;
  audio.stoneBreath(doorsNear ? falseDoors.update(dt, S.wt, player.pos, S.reduced) : 0);
  // the pyramid meditation: once a session, on first standing calmly before the north face
  // (on the ground, not climbing, flying or swimming), when the voices may speak
  if (doorsNear && !meditationHeard && S.mode === "play" && !player.flying && !player.swimming &&
      falseDoors.inCalm(player.pos) && playlist.on && !tp.playing) {
    meditationHeard = true;
    void narration.play("PYRAMID-MEDITATION");
  }
  // the Duat: enter at the hidden door, leave by walking back or completing the dawn ascent
  if (!crossing) {
    if (S.mode === "play" && !pyramid.duatActive && pyramid.isInside && pyramid.shouldEnterDuat()) {
      enterDuatCrossing();
    } else if (pyramid.duatActive) {
      const p0 = pyramid.PATH[0];
      const d0 = Math.hypot(
        player.pos.x - (DUAT_ORIGIN.x + p0.x),
        player.pos.y - (DUAT_ORIGIN.y + p0.y),
        player.pos.z - (DUAT_ORIGIN.z + p0.z),
      );
      const p7 = pyramid.PATH[7] ?? pyramid.PATH[pyramid.PATH.length - 1];
      const d7 = Math.hypot(
        player.pos.x - (DUAT_ORIGIN.x + p7.x),
        player.pos.y - (DUAT_ORIGIN.y + p7.y),
        player.pos.z - (DUAT_ORIGIN.z + p7.z),
      );
      if (Number.isFinite(d0) && d0 > 10) duatVentured = true;
      if (Number.isFinite(d7) && d7 <= DUAT_DAWN_R) exitDuatDawn();
      else if (duatVentured && Number.isFinite(d0) && d0 <= DUAT_WALKBACK_R) exitDuatWalkBack();
    }
  }
  audio.resonance(pitK);
  if (S.mode !== "play") return;
  if (!pyramid.isInside) {
    if (player.pos.distanceTo(pyramid.door) < 90) tellPyr("near", "A pyramid. Its door is on the north face; or climb its faces to the apex.", 6000);
    if (atApex) tellPyr("apex", "At the apex. Higher guidance speaks of a third spiral leaving it, like a candle flame.", 7000);
    if (!crossing && !autofly.active && !player.flying && pyramid.atDoor(player.pos)) crossPyr(true);
    return;
  }
  // inside: the rooms are close, so the camera stays near
  if (!pyramid.duatActive && follow.dist > 3.6) follow.dist = 3.6;
  if (pyramid.confine(player.pos) && !crossing) crossPyr(false);
  if (player.flying) player.flying = false;
  const ch = pyramid.chamber(player.pos);
  if (ch === "pit") tellPyr("pit", "The resonating chamber. Its floor lies open to the earth below.");
  if (ch === "queen") tellPyr("queen", "The Queen's Chamber: the place of initiation, and of resurrection. Stand at its centre and be still.");
  if (ch === "gallery") tellPyr("gallery", "Light is drawn in at the base, and spirals upward toward the apex.");
  if (ch === "king") tellPyr("king", "The King's Chamber: the place of healing, where the spiral is strongest. Stand by the coffer and be still.");
  if (pyramid.duatActive) {
    // the Duat's own night air: deep blue, thin, the lamps warm against it
    fogUniforms.color.value.setRGB(0.012, 0.016, 0.034);
    fogUniforms.density.value = 0.0065;
    gradeUniforms.shadow.value.setRGB(0.0, 0.006, 0.02);
    gradeUniforms.high.value.setRGB(1.04, 0.97, 0.9);
  } else {
    fogUniforms.color.value.setRGB(0.06, 0.045, 0.03);
    fogUniforms.density.value = 0.012;
    gradeUniforms.shadow.value.setRGB(0.015, 0.008, 0.0);
    gradeUniforms.high.value.setRGB(1.05, 0.98, 0.9);
  }
  gradeUniforms.sat.value = 1.05;
  gradeUniforms.contrast.value = 1.12;
  post.starVis.value = 0;
  post.raysOn.value = 0;
  // stillness at the centre of a chamber begins its rite
  const still = player.speed < 0.15 && Math.hypot(input.move.x, input.move.y) < 0.05 && !input.hold;
  const place = pyramid.atQueenCentre(player.pos) ? "queen" : pyramid.inCoffer(player.pos) ? "king" : null;
  stillIn = still && place ? stillIn + dt : 0;
  if (!rite && place && stillIn > 2.5 && S.t - lastRite > 20) {
    rite = { kind: place, t: 0, beats: 0, step: 0 };
    if (place === "queen") {
      riteVeil.classList.add("on");
      audio.hush(true, 3);
    } else whisper("Light moves through you in seven colours.", 6000);
  }
  if (!rite) return;
  rite.t += dt;
  const moved = Math.hypot(input.move.x, input.move.y) > 0.3 || input.hold || place !== rite.kind;
  if (rite.kind === "queen") {
    // in the dark, only the heart; the senses rest; then a light, and the world again
    const bpm = 0.95 + Math.min(0.35, rite.t * 0.02);
    if (rite.t > 1 && rite.t < 15 && rite.t > 1 + rite.beats * bpm) {
      rite.beats++;
      audio.heartbeat(0.28);
    }
    if (rite.step === 0 && rite.t > 4.5) (rite.step = 1), whisper("Here the senses rest.", 4000);
    if (rite.step === 1 && rite.t > 9) (rite.step = 2), whisper("In a sense the body sleeps as if dead, and another life begins.", 5000);
    if (rite.step === 2 && rite.t > 13) {
      rite.step = 3;
      riteVeil.classList.add("light");
      audio.bell(528, 0.06, 8);
    }
    if (rite.step === 3 && rite.t > 16.5) {
      rite.step = 4;
      riteVeil.classList.remove("on");
      audio.hush(false, 4);
    }
    if (rite.t > 21 || (moved && rite.t > 3)) endRite();
  } else {
    // the seven colours, one by one, up through the body, then the crystal answers
    const k = Math.floor((rite.t - 1) / 1.4);
    if (rite.t > 1 && k >= rite.step && k < 7) {
      rite.step = k + 1;
      audio.bell(SEVEN_NOTES[k], 0.05, 5);
    }
    pyramid.seven.forEach((sp, i) => {
      const on = rite!.t - 1 - i * 1.4;
      sp.visible = on > 0;
      if (on <= 0) return;
      const m = sp.material as THREE.SpriteMaterial;
      m.opacity = Math.min(1, on * 2) * (0.45 + 0.55 * Math.exp(-on * 1.2)) * (1 - THREE.MathUtils.smoothstep(rite!.t, 13, 16));
      sp.position.set(player.pos.x, player.pos.y + SEVEN_AT[i], player.pos.z);
      sp.scale.setScalar(0.34 + 0.3 * Math.exp(-on * 1.5));
    });
    if (rite.step === 7 && rite.t > 11) {
      rite.step = 8;
      audio.bell(587.33, 0.06, 8);
      sparks.emit(pyramid.cofferTop().setY(player.pos.y + 1.8), 24, new THREE.Color(1, 0.95, 0.85), 0.5);
    }
    if (rite.t > 16.5 || (moved && rite.t > 2)) endRite();
  }
}

/** Each frame: the caves' mouths, the grotto's walls and way out, and the rings of stillness. */
function deepFrame(dt: number, wt: number, inWater: boolean): void {
  const nearWater = heightAt(player.pos.x, player.pos.z) < WATER_Y - 2 && player.pos.y < 12;
  const ring = depths.update(wt, player.pos, inWater, nearWater);
  depths.thoughts(camera, player.pos, !reader.open && !document.body.classList.contains("recording"));
  // the drowned cities: each begins its telling the first time you come into it, and it plays
  // on wherever you go (not while the voices rest, nor over an archive narration)
  if (!depths.inside)
    ancients.update(dt, wt, player.pos, S.reduced, underwater, (id) => {
      if (S.mode !== "play" || !playlist.on || tp.playing) return false;
      void narration.play(id);
      return true;
    }, { id: narration.current, t: narration.progress()?.t ?? 0 });
  // Göbekli Tepe: its telling begins the first time you come onto the hilltop, and plays on
  if (!apart())
    gobekli.update(dt, wt, player.pos, S.reduced, (id) => {
      if (S.mode !== "play" || !playlist.on || tp.playing) return false;
      void narration.play(id);
      return true;
    });
  else gobekli.group.visible = gobekli.live.visible = gobekli.far.visible = false;
  // Nan Madol: its telling begins the first time you come into the lagoon, and plays on
  if (!apart())
    nanMadol.update(dt, wt, player.pos, S.reduced, (id) => {
      if (S.mode !== "play" || !playlist.on || tp.playing) return false;
      void narration.play(id);
      return true;
    });
  else nanMadol.group.visible = nanMadol.live.visible = false;
  // Rapa Nui: its telling begins the first time you come onto the headland, and plays on; it is
  // a whisper too (found by arriving)
  const atRest = player.speed < 0.3 && !player.flying;
  if (!apart())
    rapaNui.update(dt, wt, player.pos, S.reduced, atRest, () => {
      if (S.mode !== "play" || !playlist.on || tp.playing || walk || duatTour) return false;
      hearWhisper("rapa", false);
      return true;
    });
  else rapaNui.group.visible = rapaNui.live.visible = false;
  audio.surf(apart() ? 0 : Math.max(nanMadol.surf, rapaNui.surf));
  waterfalls.update(player.pos, apart());
  audio.falls(waterfalls.roar);
  // the whispers: what answers a visitor who is still, or near
  {
    const outdoors = !apart() && S.mode === "play";
    whispers.group.visible = !apart();
    const got = whispers.update(dt, wt, { pos: player.pos, still: atRest && !tourScenes.tour.active, under: follow.underwater, camera, outdoors, reduced: S.reduced });
    audio.quartzHum(whispers.hum);
    if (got) hearWhisper(got, false);
    // hands laid on the lone tree or the singing quartz
    if (touch.phase === "touching" && touch.target) {
      const id = whispers.touched(touch.target.centre);
      if (id && !whispers.has(id)) hearWhisper(id, true);
    }
  }
  if (S.mode !== "play") return;
  if (depths.inside) {
    if (!player.swimming) player.placeUnder();
    if (depths.confine(player.pos) && !crossing) crossDeep(false);
    // the still water of the grotto: clear, blue-dark, a little warm light from the centre
    fogUniforms.color.value.setRGB(0.002, 0.003, 0.005);
    fogUniforms.density.value = 0.01;
    gradeUniforms.shadow.value.setRGB(0, 0, 0);
    gradeUniforms.high.value.setRGB(1.0, 0.98, 0.94);
    gradeUniforms.sat.value = 1.0;
    gradeUniforms.contrast.value = 1.05;
  } else if (player.diving && !crossing && !autofly.active) {
    const m = depths.atMouth(player.pos);
    if (m) {
      deepMouth = m;
      crossDeep(true);
    }
  }
  // a ring of stillness: come to rest in it and the sea hushes, and a question rises
  const resting = !!ring && player.swimming && player.speed < 0.45 && Math.hypot(input.move.x, input.move.y) < 0.05 && !input.hold;
  ringStill = resting ? ringStill + dt : 0;
  for (const r of [...depths.rings, depths.centreRing]) r.glow += ((r === ring ? (resting ? 1 : 0.35) : 0) - r.glow) * Math.min(1, dt * (resting ? 0.5 : 2));
  if (ringStill > 2.5 && !ringSpoke) {
    ringSpoke = true;
    audio.duck(true);
    audio.bell(528, 0.03, 7);
    if (ring) seaLife.bubbles(player.pos, 4);
    whisper(depths.reflection(), 11000);
  } else if (ringStill === 0 && ringSpoke) {
    ringSpoke = false;
    audio.duck(false);
  }
}
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
/* Load the newest version, whatever the phone has kept (the owner: "it really sticks to whatever is
   the prior version"). Your place is saved; the service worker and its kept copy of the game are let
   go (the downloaded recordings, models and textures stay), and the page is asked for again by a
   new address, so no cache can answer with the old one. */
$("#update-now").title = `This version: ${__BUILD__}`;
$("#update-now").addEventListener("click", () => {
  setMenu(false);
  try {
    persist();
  } catch {
    /* fine */
  }
  whisper("Loading the newest version…", 4000);
  void (async () => {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      for (const k of await caches.keys()) if (k !== "inward-journey-assets") await caches.delete(k);
    } catch {
      /* go on regardless */
    }
    const u = new URL(location.href);
    u.searchParams.set("v", String(Date.now()));
    location.replace(u.toString());
  })();
});
$("#howto-open").addEventListener("click", () => {
  setMenu(false);
  // on a computer, the keys come first
  $("#howto").classList.toggle("kbd", !(MOBILE || input.touchUsed));
  $("#howto").hidden = false;
  $<HTMLButtonElement>("#howto-close").focus({ preventScroll: true });
  $("#howto").scrollTop = 0;
});
$("#howto-close").addEventListener("click", () => ($("#howto").hidden = true));
{
  const box = $<HTMLInputElement>("#contemplate");
  box.checked = inwardOn;
  box.addEventListener("change", () => {
    inwardOn = box.checked;
    try {
      localStorage.setItem("inward-journey:contemplate", inwardOn ? "1" : "0");
    } catch {
      /* fine */
    }
  });
}

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
{
  const ra = $<HTMLInputElement>("#readaloud");
  ra.checked = readAloud();
  ra.addEventListener("change", () => setReadAloud(ra.checked));
  if (!("speechSynthesis" in window)) ra.closest("label")!.hidden = true;
  // the voice for written words: the device's own, best first (novelty and robotic voices left out)
  const vs = $<HTMLSelectElement>("#voice");
  const tierName = { premium: "Premium", enhanced: "Enhanced", natural: "Natural", standard: "Standard" };
  const fill = () => {
    const groups = allVoices();
    const names = (v: SpeechSynthesisVoice, g: number) => `${v.name} · ${tierName[tierOf(v)]}${g ? ` · ${v.lang}` : ""}`;
    vs.replaceChildren(
      new Option("The phone's own voice", ""),
      ...groups.map((g, gi) => {
        const og = document.createElement("optgroup");
        og.label = `${g.label} (${g.voices.length})`;
        og.append(...g.voices.map((v) => new Option(names(v, gi), v.voiceURI)));
        return og;
      }),
    );
    vs.value = groups.some((g) => g.voices.some((v) => v.voiceURI === chosenVoice())) ? chosenVoice() : "";
  };
  if ("speechSynthesis" in window) {
    fill();
    speechSynthesis.addEventListener?.("voiceschanged", fill);
    $("#menu").addEventListener("pointerenter", fill); // iOS may list newly downloaded voices only later
    vs.addEventListener("change", () => setVoice(vs.value));
    const note = $("#voice-note");
    speechButton($("#voice-try"), () => {
      note.textContent = "Loading the voice…";
      speak("From the stillness of the heart, the soul seeks to rediscover itself.");
    });
    // say which voice actually began, so a chosen voice the phone won't use is not a mystery
    onSpeechStart((how, name) => {
      note.textContent = how === "chosen" ? name ? `Speaking as ${name}` : "Speaking in the phone's own voice (set in Settings → Spoken Content)" : "Your chosen voice wouldn't start, so the phone's default spoke. Try another.";
    });
  } else $("#voice-row").hidden = true;
}
$("#oracle-open").addEventListener("click", () => {
  setMenu(false);
  oracle.show("");
});
$("#heart-open").addEventListener("click", () => {
  setMenu(false);
  myHeart.openList();
});
$("#guide-close").addEventListener("click", closeGuide);
/* "Walk me there" (the owner: "one click and it completes; the stick takes over"): the guide's
   light goes ahead and the wanderer goes after it by itself, on foot or in flight (`driveTo`),
   all the way; touching the stick or the round button gives you back the way, and the light
   still leads. */
let guideAuto: { since: number } | null = null;
function stopGuideAuto(): void {
  if (!guideAuto) return;
  guideAuto = null;
  travelHold = false;
  player.target = null;
}
function guideAutoFrame(dt: number): void {
  const g = guide.target;
  if (!guideAuto) return;
  if (!g || walk || duatTour || apart() || S.mode !== "play") return stopGuideAuto();
  if (Math.hypot(input.move.x, input.move.y) > 0.25 || input.hold) return stopGuideAuto(); // the thumb takes over
  guideAuto.since += dt;
  if (driveTo(g.x, g.z, g.y, guideAuto.since)) stopGuideAuto();
}
$("#guide-walk").addEventListener("click", () => {
  if (!guideChoice) return;
  stopAuto();
  standUp();
  guide.lead(guideChoice, player.pos);
  guideAuto = { since: 0 };
  whisper(`On the way · ${guideChoice.label}. The stick takes over.`, 5000);
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
startMap.onTour = (id) => (id === "duat" ? duatTourStart() : walkStart(id));
startMap.onWhisper = (id) => hearWhisper(id as WhisperId, true, true);

$("#map-open").addEventListener("click", () => {
  setMenu(false);
  input.enabled = false;
  startMap.tours = [...WALKS.map((w) => ({ id: w.id, label: w.label, walked: walked.has(w.id) })), { id: "duat", label: "The Duat, hour by hour", walked: walked.has("duat") }];
  startMap.whispers = whispers.list().map((w) => ({ id: w.id, label: w.title, note: w.where }));
  void startMap.open(places(), { x: player.pos.x, z: player.pos.z, heading: player.heading }, true).then((c) => {
    input.enabled = true;
    if (c) arrive(c, false);
  });
});

/** Where a screen point meets the ground or the water. */
const gpRay = new THREE.Raycaster(), gpNdc = new THREE.Vector2();
function groundPoint(cx: number, cy: number): THREE.Vector3 | null {
  const ray = gpRay;
  ray.setFromCamera(gpNdc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
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

/* Offline play (core/offline.ts): the button says what it would cost. Never downloaded: the whole
   game's size. Downloaded: "ready" when nothing changed, or the size of the update when a new
   version brought new or changed files (only those are fetched; a quiet word says so once). */
async function offlineLabel(announce = false): Promise<void> {
  const btn = $<HTMLButtonElement>("#offline-btn");
  try {
    const list = await fetchAssetList();
    if (!downloadedBefore()) {
      btn.textContent = `Download for offline play (${megabytes(list.reduce((s, a) => s + a.s, 0))})`;
      return;
    }
    const p = await plan(list);
    btn.textContent = p.need.length ? `Update offline play (${megabytes(p.bytes)})` : "Offline play: ready ✓";
    if (announce && p.need.length) whisper(`An update for offline play is ready (${megabytes(p.bytes)}), in ⋮`, 6000);
  } catch {
    /* off line: keep the label it has */
  }
}
window.setTimeout(() => void offlineLabel(true), 12000); // after the world has loaded
$("#offline-btn").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("#offline-btn");
  const prog = $("#offline-progress");
  const bar = $("#offline-bar");
  const text = $("#offline-text");

  btn.disabled = true;
  prog.hidden = false;
  text.textContent = "Requesting storage...";

  const persisted = await requestPersistentStorage();

  try {
    const r = await downloadAssets((p) => {
      bar.style.width = `${p.percentage}%`;
      text.textContent = `${p.percentage}% (${p.downloaded}/${p.total})`;
    });
    const got = r.bytes ? `${megabytes(r.bytes)} downloaded.` : "Everything was already here.";
    text.textContent = r.failed
      ? `${r.failed} file${r.failed > 1 ? "s" : ""} could not be fetched; tap again to finish.`
      : `${got} The game now plays without a connection${persisted ? "." : " (the device may clear it if storage runs low)."}`;
    btn.disabled = false;
    if (!r.failed) btn.textContent = "Offline play: ready ✓";
  } catch (err) {
    console.error("Offline download failed:", err);
    text.textContent = `Download failed: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`;
    btn.disabled = false;
  }
});
// on the touch itself: a phone makes no click of a tap while the other thumb is on the stick
menuBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  setMenu(menu.hidden);
});
menuBtn.addEventListener("click", (e) => e.detail === 0 && setMenu(menu.hidden)); // the keyboard
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.mode === "play") setMenu(menu.hidden);
  // M the map, G the guide, ? every key (How to play): as ⋮ offers them
  if (S.mode === "play" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !startMap.isOpen && !(e.target as HTMLElement)?.closest?.("input, textarea")) {
    const k = e.key.toLowerCase();
    if (k === "m") $("#map-open").click();
    else if (k === "g") $("#guide-open").click();
    else if (k === "?" || k === "/") $("#howto-open").click();
  }
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
// Free flight (⋮): the stick flies where you look, and let go you hover (remembered on the device)
let freeFly = false;
try {
  freeFly = localStorage.getItem("inward-journey:freefly") === "1";
} catch {
  /* no storage: off */
}
const freeBox = $<HTMLInputElement>("#freefly");
freeBox.checked = freeFly;
freeBox.addEventListener("change", () => {
  freeFly = freeBox.checked;
  try {
    localStorage.setItem("inward-journey:freefly", freeFly ? "1" : "0");
  } catch {
    /* fine */
  }
});
// Rain now and then (⋮): showers pass every so often (on by default)
{
  const box = $<HTMLInputElement>("#rainy");
  box.checked = weather.enabled;
  box.addEventListener("change", () => {
    weather.enabled = box.checked;
    try {
      localStorage.setItem("inward-journey:rain", box.checked ? "1" : "0");
    } catch {
      /* fine */
    }
  });
}
// Auto jump (⋮): walking into a ledge too tall to step over hops up it (on by default)
{
  const KEY = "inward-journey:autojump";
  const box = $<HTMLInputElement>("#autojump");
  try {
    player.autoJump = localStorage.getItem(KEY) !== "0";
  } catch {
    /* no storage: on */
  }
  box.checked = player.autoJump;
  box.addEventListener("change", () => {
    player.autoJump = box.checked;
    try {
      localStorage.setItem(KEY, box.checked ? "1" : "0");
    } catch {
      /* fine */
    }
  });
}
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

/** Rest: the world waits behind the water screen ("Tap to return"), the place kept.
    `fromAway`: coming back to the game after a while, the title stands over it as at the start
    (the owner: the game must always open on "touch the water", never on a panel left open). */
function rest(fromAway = false): void {
  persist();
  awake.rest();
  setMenu(false);
  for (const id of ["#howto", "#guide"]) $(id).hidden = true;
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
  $("#rest").classList.toggle("away", fromAway);
  if (fromAway) $("#title").classList.remove("gone");
  say("Your place is kept.");
}
$("#leave").addEventListener("click", () => rest());
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
  wakeSpeech();
  audio.fade(true);
  S.mode = "play";
  input.enabled = true;
  $("#rest").hidden = true;
  $("#title").classList.add("gone");
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
/* The feedback tool's switch, in the readings: a Home Screen app keeps its own storage, apart from
   Safari's, so `?dev=1` opened in Safari never reaches it. Here it can be turned on from inside. */
{
  const b = $("#dev-toggle");
  const on = () => {
    try {
      return localStorage.getItem("inward-journey:dev") === "1";
    } catch {
      return false;
    }
  };
  b.textContent = on() ? "✎ Feedback mode: on (tap to turn off)" : "✎ Turn on feedback mode";
  b.addEventListener("click", () => {
    try {
      if (on()) localStorage.removeItem("inward-journey:dev");
      else localStorage.setItem("inward-journey:dev", "1");
    } catch {
      /* no storage */
    }
    location.reload();
  });
}
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
    `tier ${quality.current.name} · dpr ${dpr.toFixed(2)} of ${devicePixelRatio} · scale ${quality.scale.toFixed(1)} · ${px} · ${frameCap ? `cap ${frameCap}` : "no cap"}`,
    `${quality.reason} · ${shadersReady ? "shaders ready" : "compiling shaders…"}`,
    `${frameDraws} draws · ${(ri.triangles / 1000).toFixed(0)}k tris · cpu ${cpuMs.toFixed(2)} ms · gpu mem ${renderer.info.memory.geometries} geo ${renderer.info.memory.textures} tex`, // this frame's (calls counts since the start)
    `audio ${audio.ctx?.state ?? "off"} · session ${audio.sessionType} · voice ${narration.current ?? "-"}`,
    `sky ${MOOD_NAMES.map((n, i) => `${n} ${(moods.weights[i] * 100).toFixed(0)}`).filter((x) => !x.endsWith(" 0")).join(" · ")}`,
    `pos ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)} · ${player.pose} · lanterns ${lanterns.litCount}`,
  ].join("\n");
}

/* ============ LOOP ============ */
let lastPrint = 0;
let lastStroke = 0;
let floatRing = 0;
let floatK = 0;
const orbPos = new THREE.Vector3();
let wasSwimming = false;
let saveTimer = 0;
const center = new THREE.Vector3();
const glow = new THREE.Vector3();
const life: LifeFrame = { t: 0, dt: 0, player: player.pos, speed: 0, reduced: false, dpr: 1 };

let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  S.hidden = document.hidden;
  if (document.hidden) {
    persist();
    audio.suspend();
    hiddenAt = performance.now();
  } else {
    // back after a while: open on the water, never on a panel left open (an archive narration
    // still playing through the lock screen, or a guided walk, carries on as it was)
    const away = performance.now() - hiddenAt > 45000;
    setMenu(false);
    $("#howto").hidden = true;
    if (away && S.mode === "play" && !tp.active && !walk && !tourScenes.tour.active) rest(true);
    if (S.mode !== "intro") audio.resume();
    last = performance.now();
  }
});
addEventListener("pagehide", persist);

/* The temple tour, the tree, and the five lesson sites: one registry, one frame call. */
const tourScenes: TourScenes = initTourScenes({
  scene, narration, player, follow, wanderer, camera, whisper, temple, crossTemple, heightAt, sitting,
});
// the temple's tour: its own ending (the tree of life) first, then the way on
tourScenes.tour.onEnd = () => {
  if (walk) return; // a walk-through takes the temple in its stride and goes on by itself
  tourScenes.tour.exit();
  offerNext("temple", "The temple, guided", { first: DESTS[0], stay: "Stay in the temple" });
};
// Lesson scenes are created above, AFTER the startup additiveKeepsAlpha pass (line ~263),
// so their additive materials were never converted. Re-run to cover them: without this,
// additive glow punches dark squares into the lakes' reflection texture.
additiveKeepsAlpha(scene);

if (isTv) {
  setAutofly(true);
}

function update(dt: number): void {
  // the title over the water is kept clear: what you built and planted rests out of its view
  // (it stands again as the journey begins)
  const titleView = S.mode === "intro" || S.mode === "rest";
  sanct.titleClear(titleView);
  garden.group.visible = !titleView;
  S.t += dt;
  const t = S.t;
  input.poll();
  const [lx, ly] = input.takeLook();
  if (lx || ly) follow.look(-lx * 0.0055, ly * 0.004);
  const z = input.takeZoom();
  if (z !== 1) follow.zoom(z);

  if (S.mode === "play") {
    solidity.update(scene, player.pos, dt);
    guideAutoFrame(dt);
    if (wanderer.gesture !== "none" && Math.hypot(input.move.x, input.move.y) > 0.2 && wanderer.gesture === "sit") wanderer.setGesture("none");
    if (autofly.active && !isTv && (Math.hypot(input.move.x, input.move.y) > 0.25 || input.hold)) setAutofly(false); // the thumb takes over
    if (autorun.active && (Math.hypot(input.move.x, input.move.y) > 0.25 || input.hold || player.swimming || player.flying || player.target)) setAutorun(false);
    if (buildHover && sanct.building) {
      // building in the air or the water: held still where it began
      player.pos.copy(buildHover);
      player.vel.set(0, 0, 0);
      player.vy = 0;
      player.speed = 0;
    } else if (temple.cardsOpen || tourScenes.tour.active) player.update(dt, { x: 0, y: 0, glide: false, run: 0, hold: false, down: false, pitch: follow.pitch }, follow.yaw);
    else if (walk?.phase === "travel" || walk?.phase === "go" || (walk?.phase === "listen" && player.target) || (duatTour?.phase === "walk" && player.target) || guideAuto) player.update(dt, { x: 0, y: 0, glide: false, run: 1, hold: travelHold, down: false, pitch: follow.pitch }, follow.yaw);
    else if (autofly.active) {
      const r = autofly.update(dt, player.pos);
      Object.assign(player, { heading: r.heading, speed: r.speed, vy: r.vy, flying: true, landing: false, grounded: false, swimming: false, gliding: false, pose: "fly", target: null });
      player.vel.set(-Math.sin(r.heading), 0, -Math.cos(r.heading)).multiplyScalar(r.speed);
      follow.pitch += (autofly.pitch - follow.pitch) * Math.min(1, dt * 0.6);
    } else if (autorun.active) {
      // as a thumb would: the way it chooses, given relative to the camera
      const r = autorun.update(dt, player.pos);
      const fx = -Math.sin(follow.yaw), fz = -Math.cos(follow.yaw), rx = Math.cos(follow.yaw), rz = -Math.sin(follow.yaw);
      player.update(dt, { x: (r.x * rx + r.z * rz) * r.push, y: (r.x * fx + r.z * fz) * r.push, glide: false, run: 0.25, hold: false, down: false, pitch: follow.pitch }, follow.yaw);
    } else player.update(dt, { ...input.move, glide: input.boost, run: input.run, hold: input.hold, down: input.descend, pitch: follow.pitch, free: freeFly }, stickYaw(dt));
    follow.freeLook = freeFly && player.flying;
    // the one context word: "Land" high in the air, "Dive" on the water, "Surface" under it
    const ctx = $("#ctx");
    const high = player.flying && !player.landing && player.pos.y - Math.max(heightAt(player.pos.x, player.pos.z), WATER_Y) > 2.5;
    const word = sitting.phase === "seated" ? "" : high ? "Land" : player.swimming ? (player.seabed || player.sinking ? "Surface" : player.diving ? "Floor" : "Dive") : "";
    ctx.hidden = !(MOBILE || input.touchUsed) || !word;
    if (ctx.textContent !== word) ctx.textContent = word;
    // on a keyboard there is no button and no word: the keys that matter here, low on the left
    keyHints.set(
      !(MOBILE || input.touchUsed) && menu.hidden,
      autofly.active || autorun.active ? "auto" : sitting.phase === "seated" ? "seated" : player.flying ? "fly" : player.swimming ? (player.seabed ? "floor" : player.diving || player.sinking ? "under" : "surface") : "land",
    );
    document.body.classList.toggle("flying", player.flying);
    if (player.swimming && !S.toldDive) {
      S.toldDive = true;
      whisper(MOBILE ? "Tap the round button to dive; under the water it takes you up. Double tap the orb to go down to the floor" : "Tap Space to dive; under the water it takes you up. L goes down to the floor", 7000);
    }
  }
  S.wt += dt * landmarks.timeScale;
  const wt = S.wt;

  wanderer.root.position.copy(player.pos);
  wanderer.root.rotation.y = player.heading;
  {
    // the ground under the wanderer, for its contact shadow (on its slope)
    const px = player.pos.x, pz = player.pos.z;
    wanderer.groundY = player.grounded ? player.pos.y : standAt(px, pz);
    const hx = standAt(px + 0.4, pz) - standAt(px - 0.4, pz), hz = standAt(px, pz + 0.4) - standAt(px, pz - 0.4);
    wanderer.groundNormal.set(-hx / 0.8, 1, -hz / 0.8).normalize();
  }
  wanderer.root.visible = S.mode !== "intro" && !follow.firstPerson; // in the maze the view is the sphere's own eyes
  wanderer.animate(dt, player.pose, player.speed, t, S.reduced, dpr);
  wanderer.fx.visible = wanderer.root.visible;

  if (S.mode === "play") {
    // Steps on the ground (no footprints: the owner), rings on water.
    if (player.grounded && !player.floating && player.odometer - lastPrint > 0.7) {
      lastPrint = player.odometer;
      const gy = heightAt(player.pos.x, player.pos.z);
      if (apart()) {
        // inside the temple and the pyramid there are no steps: only the place's own quiet (Samuel)
      } else {
        audio.step(false);
        if (gy < 0.15) water.ripple(player.pos.x, player.pos.z, 0.5, t);
      }
    }
    // lying back on the shallows: a slow ring now and then as the body drifts, a soft stroke as it moves
    if (player.floating) {
      floatRing -= dt;
      if (player.odometer - lastStroke > 1.6 || floatRing <= 0) {
        if (player.odometer - lastStroke > 1.6) audio.step(true);
        lastStroke = player.odometer;
        floatRing = 4 + Math.random() * 3;
        water.ripple(player.pos.x, player.pos.z, player.speed > 0.3 ? 0.45 : 0.25, t);
      }
    }
    if (player.swimming && !player.diving && player.odometer - lastStroke > 1.1) {
      lastStroke = player.odometer;
      water.ripple(player.pos.x, player.pos.z, 0.8, t);
      audio.step(true);
    }
    playlist.quiet = sitting.phase === "seated" || apart() || !!walk || !!duatTour || tourScenes.tour.active || breath.active; // a tour has its own voices; the breath its own
    playlist.update(realDt); // real time: a slow frame rate never stretches the quiet
  }
  narration.update();

  // The world streams around the wanderer and answers them.
  const world = !apart(); // inside the temple, the deep archive or the pyramid, the open world rests
  if (world) terrain.update(player.pos.x, player.pos.z);
  life.t = wt;
  life.dt = dt;
  life.speed = player.speed;
  life.reduced = S.reduced;
  life.dpr = dpr;
  if (S.mode !== "intro" && world) {
    grass.update(life);
    flowers.update(life);
    blooms.update(life);
    wilds.update(life);
    nile.update(life);
    cover.update(wt, player.pos, S.reduced);
    sanct.update(dt, wt, dpr, player.pos, camera);
    garden.update(dt, wt, player.pos);
    lanterns.update(life);
  }
  if (world) forest.update(player.pos);
  if (world) creation.update(life, (innerHeight * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  sparks.update(dt, dpr);
  stationGlow.update(dt, dpr);
  if (world) landmarks.update(wt, dt, player.pos, S.mode === "play" ? player.speed : 1, S.reduced);
  if (S.mode === "play" && world) beings.update(wt, dt, player.pos, S.reduced);
  updateSitting(dt);
  tourScenes.frame(dt); // seats, the temple door's edge, the tree's greeting, then every exhibit
  if (world) updateTunnel();
  $("#labels").style.visibility = world ? "" : "hidden";
  if (world) vessels.update(wt, player.pos, camera, S.reduced, S.mode === "play" && !startMap.isOpen);
  tp.subtitlesOn = narration.subtitlesOn;
  tp.update();
  tp.guestFrame();
  tourBar().frame();
  // nothing left to pause (the tour ended, the voice finished): the hold goes with it
  if (tourHeld && !tp.guest?.active()) tourHeld = tourScenes.tour.held = false;
  if (world) updateStillness(dt, wt);
  if (S.mode === "play") {
    const letGo = Math.hypot(input.move.x, input.move.y) > 0.2 || input.hold || (touch.phase === "touching" && !!player.target) ||
      startMap.isOpen || apart() || autofly.active || sitting.phase !== "none";
    touch.update(dt, dpr, letGo, S.reduced);
    medFrame(dt);
    const kneeling = touch.phase === "touching" && !!touch.target;
    if (kneeling && touch.target) riseAt.copy(touch.target.kind === "ground" ? touch.target.contact : player.pos);
    risers.update(dt, riseAt, standAt, kneeling || med.phase === "quiet", dpr, S.reduced, touch.target?.kind === "ground" ? 1.8 : 1.4);
    tendFrame(dt);
    buildFrame();
    // a stone or crystal in the hands vibrates with light, as it does before stillness
    if (touch.vibe > 0.01 && touch.target) {
      vibeUniforms.uVibePos.value.copy(touch.target.contact);
      vibeUniforms.uVibeR.value = Math.max(0.6, touch.target.r * 1.3);
      vibeUniforms.uVibeK.value = Math.max(vibeUniforms.uVibeK.value, touch.vibe);
    }
  }
  if (S.mode !== "intro" && world) creatures.update(wt, dt, player.pos, S.reduced);
  if (S.mode !== "intro") spiritHorses.update(wt, dt, player.pos, medK, player.speed > 3 || player.gliding, S.reduced, !world || player.swimming);
  if (S.mode !== "intro") readables.update(wt, player.pos, apart());
  readingFrame();
  camStep?.(dt);
  if (S.mode !== "intro") spiritCritters.update(wt, dt, player.pos, medK, player.speed > 3 || player.gliding, S.reduced, !world || player.swimming);
  const camUnder = camera.position.y < WATER_Y - 0.05;
  post.under.value = camUnder ? 1 : 0;
  post.raysOn.value = camUnder ? 0 : 1 - 0.7 * moods.weights[3]; // the deep night keeps the star's glow small
  post.aoOn.value = camUnder ? 0 : 1;
  audio.underwater(camUnder);
  const wtSafe = Number.isFinite(wt) ? wt : 0;
  groundUniforms.uT.value = wtSafe;
  // the camera goes under with you once you are properly down, and comes up as you surface
  if (player.swimming && player.depth > 0.7) follow.underwater = true;
  else if (!player.swimming || player.depth < 0.15) follow.underwater = false;
  input.inWater = player.swimming;
  const orbAt = orbPos.set(player.pos.x, player.pos.y + 1.22, player.pos.z);
  const inWater = player.swimming || camUnder;
  if (world) seaLife.update(wt, dt, player.pos, inWater, orbAt, camera.position, (innerHeight * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  if (world) fauna.update(wt, dt, player.pos, inWater, orbAt, S.reduced);
  deepFrame(dt, wt, inWater);
  if (world) guide.update(wt, dt, player.pos);
  presences.speaking = tp.playing ? 1 : 0;
  if (world) presences.update(wt, dt, player.pos, follow.yaw, follow.underwater);
  if (player.swimming && !wasSwimming) seaLife.bubbles(player.pos, 18); // into the water
  if (player.diving && Math.random() < dt * 0.6) seaLife.bubbles(player.pos, 1);
  wasSwimming = player.swimming;

  // floating, the view looks at the body lying on the water, not the air above it, and the water
  // round it stills to a mirror of the stars
  floatK += ((player.floating ? 1 : 0) - floatK) * Math.min(1, dt * 0.8);
  const lift0 = follow.targetLift;
  if (floatK > 0.002) follow.targetLift = (lift0 ?? 1.3) - 0.85 * floatK;
  follow.floatK = floatK;
  water.uniforms.uMirror.value = floatK;
  water.uniforms.uMirrorAt.value.set(player.pos.x, player.pos.z);
  follow.update(dt, player.pos, player.heading, player.speed > 0.5, t, S.reduced, player.flying);
  follow.targetLift = lift0;
  cardsCamera(dt);
  sanct.cameraFrame(camera, dt);
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
    underwater.u.uRoof.value = depths.inside ? 1 : 0;
  }
  sky.position.copy(camera.position);
  starSource.position.copy(camera.position).addScaledVector(starDir, 900);
  camera.updateMatrixWorld();
  post.follow(starSource.position, innerWidth, innerHeight);
  gpuUniforms.player.value.copy(player.pos);
  gpuUniforms.dpr.value = dpr;
  gpuUniforms.px.value = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2); // CSS pixels per metre at 1 m
  gpuUniforms.time.value = wtSafe;
  glow.set(player.pos.x, S.mode === "intro" ? 0 : 1, player.pos.z);
  water.update(camera.position.x, camera.position.z, glow);
  skyUniforms.uT.value = wtSafe;
  if (!apart() || moodForce.w) {
    moods.update(player.pos, dt);
    // building: the world hushes a little (Ōkami's canvas), the more while the brush is down;
    // after a meditation, for a few breaths, its colour is quieted and its light a little softer
    if (sanct.hush > 0.002) {
      // Ōkami's canvas: the world fades back like an old scroll while the brush is down
      gradeUniforms.sat.value *= 1 - 0.38 * sanct.hush;
      gradeUniforms.contrast.value *= 1 - 0.08 * sanct.hush;
      gradeUniforms.high.value.multiplyScalar(1 - 0.12 * sanct.hush);
    }
    if (med.hush > 0.002) {
      gradeUniforms.sat.value *= 1 - 0.22 * med.hush;
      gradeUniforms.contrast.value *= 1 - 0.08 * med.hush;
      gradeUniforms.high.value.multiplyScalar(1 + 0.05 * med.hush);
    }
    // a shower: the haze closes in, the moon and the sky dim a little, the clouds darken
    {
      const c = weather.cloud;
      cloudUniforms.cover.value = c;
      if (c > 0.002) {
        fogUniforms.density.value *= 1 + 0.55 * c;
        fogUniforms.glow.value.multiplyScalar(1 - 0.45 * c);
        hemi.intensity *= 1 - 0.18 * c;
        star.intensity *= 1 - 0.45 * c;
        gradeUniforms.sat.value *= 1 - 0.15 * c;
      }
    }
    worldLit.hemi = hemi.intensity;
    worldLit.star = star.intensity;
  }
  // a lesson or a room that asks for real darkness (the desert's lantern, the beginning's black):
  // after the moods, so it holds; the lights from what the moods set (they rest in a place apart)
  {
    const k = lessonDark.k;
    hemi.intensity = worldLit.hemi * (1 - 0.9 * k);
    star.intensity = worldLit.star * (1 - 0.94 * k);
    if (k > 0.001 && !apart()) {
      fogUniforms.color.value.multiplyScalar(1 - 0.85 * k);
      fogUniforms.glow.value.multiplyScalar(1 - 0.8 * k);
      fogUniforms.density.value += (0.022 - fogUniforms.density.value) * k;
    }
  }
  lessonDark.k *= 0.92; // held only while a lesson keeps asking for it
  templeFrame(dt);
  pyramidFrame(dt);
  undergroundFrame();
  journeyFrame(dt);
  busyFrame();
  calmFrame();
  heartFrame();
  oracleVision.update(realDt, S.reduced);
  autoFrame(realDt);
  gravityFrame(realDt);
  contemplationFrame(realDt);
  lessonUxFrame(realDt);
  walkFrame(realDt);
  duatTourFrame(realDt);
  arrivalFrame();
  tourOfferFrame(realDt);
  nextUpFrame();
  companionFrame(realDt);
  if (!walk && !duatTour && !tourScenes.tour.active) setRecording(false);
  if (!apart()) {
    const vd = player.pos.distanceTo(vision.group.position);
    vision.update(dt, vd < 420, S.reduced);
    // (no words: the forms speak for themselves; Samuel)
  }
  // the sky's reflection is baked once: baking it again as the moods drifted (every few seconds
  // while travelling) hitched the frame on a phone and made the ground's sheen jump; the moods'
  // own lights (the hemisphere, the moon or sun, the fog) carry the change of colour
  moods.drift = 0;
  etchUniforms.uEtchT.value = wt;
  mandala.rotation.y = S.reduced ? 0 : wt * 0.01;
  center.set(camera.position.x, 0, camera.position.z);
  motes.update(wt, center, dpr, S.reduced, dt, heartPos, player.vel, medK);
  wakeStep(S.t, player.pos, player.speed, !player.flying);
  clouds.update(wt, camera.position);
  {
    const open = !apart() && camera.position.y > WATER_Y + 0.05;
    weather.update(realDt || dt, camera.position, open, S.reduced, (x, z) => {
      if (heightAt(x, z) < WATER_Y - 0.05) water.ripple(x, z, 0.18, S.t);
    });
    audio.rain(open ? weather.rain : 0);
  }

  // The starlight's shadow follows the wanderer, and stays on the land below them when they fly
  // high (up there its small box hung in the air, and the ground beneath went dark and speckled).
  const below = Math.max(heightCoarse(player.pos.x, player.pos.z), WATER_Y);
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
import { devMode } from "./debug/devflag";
import { watchKeyboard } from "./core/keyboard";
import { ARCHETYPES } from "./world/beings";
import { getShot, runShot } from "./debug/shot";
import { Sanctuary } from "./world/sanctuary";
import { Garden, CYCLE as TEND_CYCLE, STAGE_NAMES } from "./world/garden";
import { Meditation } from "./world/meditation"; // dev-only: ?shot=<scene>&t=<sec> renders one still frame
const shot = getShot();

let realDt = 0;
let devHeld = false; // the feedback tool (dev mode) holds the game while its panel is open
let frameDraws = 0; // draw calls of the last frame, taken right after it (for the readout)
function frame(now: number): void {
  if (shot) return; // shot mode draws exactly one frame, outside this loop
  requestAnimationFrame(frame);
  if (S.hidden || devHeld) return;
  // a frame is drawn only when its time has come: the cap (⋮ → Frame rate), and a crawl behind the
  // map, whose near-opaque sheet hides the world (a film keeps every frame)
  // under the meditation's dark the world is hidden: drawn slowly (the dark draws its own frames)
  // the open map's sheet all but hides the world: it draws a few times a second, and the map's
  // own tiles take the time between
  const gap = FILM ? 0 : startMap.isOpen ? 1000 / 4 : med.covered ? 1000 / 10 : frameCap ? 1000 / frameCap : 0;
  if (gap && now - last < gap - 4) return;
  const ms = now - last;
  last = now;
  const dt = Math.min(0.05, ms / 1000);
  realDt = Math.min(1, ms / 1000);
  if (ms < 250 && stats.push(ms)) {
    if (S.mode !== "intro") quality.window(stats);
    if (showStats) $("#stats-text").textContent = readings();
  }
  // a failure in one frame's life (a room, an effect) must never stop the picture: the frame is
  // still drawn, and the controls still answer
  const c0 = performance.now();
  try {
    update(dt);
  } catch (e) {
    frameFault(e);
  }
  cpuMs += (performance.now() - c0 - cpuMs) * 0.05; // the frame's own work on the CPU, smoothed
  renderer.info.reset();
  gpuDiagStart();
  try {
    if (!SIM) post.render(); // a simulated tour (testing) draws nothing
    drawFaults = 0;
  } catch (e) {
    frameFault(e);
    // the GPU was taken away (memory pressure on the phone): every draw now fails the same way
    if (++drawFaults > 3 || /command ?encoder|device (was )?lost|lost device|context lost/i.test(String((e as Error)?.message ?? e))) gpuLost();
  }
  gpuDiagEnd();
  frameDraws = renderer.info.render.drawCalls;
  frameCount++;
  filmFrame?.(); // film mode: this frame's picture is drawn and still on the canvas
}
let frameCount = 0;
let filmFrame: (() => void) | null = null;
let drawFaults = 0, lastFault = "", faultAt = 0, cpuMs = 0;
function frameFault(e: unknown): void {
  const m = String((e as Error)?.message ?? e);
  if (m === lastFault && performance.now() - faultAt < 5000) return; // once, not sixty times a second
  lastFault = m;
  faultAt = performance.now();
  console.error(e);
  showProblem(m);
}
/** The GPU is gone (the phone took it back, or the driver reset): keep your place, say so
    plainly, and start the light again (at once, or when you come back to the game). */
let losing = false;
function gpuLost(): void {
  if (losing) return;
  losing = true;
  try {
    persist();
  } catch {
    /* the place outside is saved where it can be */
  }
  const note = document.createElement("div");
  note.id = "lost";
  note.setAttribute("role", "status");
  note.textContent = "The light went out for a moment. Waking it again…";
  note.style.cssText = "position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;background:#03040a;color:#e9dcc0;font:italic 17px/1.5 Georgia,serif;letter-spacing:.02em";
  document.body.append(note);
  // never a loop of reloads: a third loss within two minutes waits for a touch
  let recent: number[] = [];
  try {
    recent = (JSON.parse(sessionStorage.getItem("inward-journey:lost") || "[]") as number[]).filter((t) => Date.now() - t < 120000);
    sessionStorage.setItem("inward-journey:lost", JSON.stringify([...recent, Date.now()]));
  } catch {
    /* fine */
  }
  if (recent.length >= 2) {
    note.textContent = "The light went out. Touch to wake it again.";
    note.addEventListener("pointerdown", () => location.reload(), { once: true });
    return;
  }
  const go = () => window.setTimeout(() => location.reload(), 900);
  if (document.hidden) addEventListener("visibilitychange", go, { once: true });
  else go();
}
// WebGPU starts asynchronously (it asks the browser for the GPU); the world is built meanwhile.
bootProgress(0.55, "Waking the light");
renderer
  .init()
  .then(() => {
    nameRenderer();
    // if the phone takes the GPU away (memory pressure, a long time in the background), start
    // again where you were instead of freezing on an error
    renderer.onDeviceLost = () => gpuLost();
    // the WebGL fallback loses its context the same way
    renderer.domElement.addEventListener("webglcontextlost", (e) => (e.preventDefault(), gpuLost()));
    // Root-cause diagnostic: grab the WebGPU device for per-frame validation error scopes.
    try {
      gpuDiagDevice =
        (renderer as unknown as { backend?: { device?: GpuDiagDevice } }).backend?.device ?? null;
    } catch {
      gpuDiagDevice = null;
    }
    // nothing reflects the sky's picture (blurred, its stars and nebulae became blobs over the land)
    post.start();
    if (!shot) requestAnimationFrame(frame);
    bootProgress(0.65, "Preparing the light");
    requestAnimationFrame(() => bootProgress(0.96, "Preparing the light", 16));
    return renderer.compileAsync(scene, camera);
  })
  .catch((e) => {
    console.error(e);
    showProblem(String(e?.message ?? e));
  })
  .finally(() => {
    shadersReady = true;
    quality.hold(3);
    endLoading();
    if (shot?.id.startsWith("duat")) {
      duatVentured = false;
      crossing = false;
      setPyr(true);
      // duat-<k>: stand at hour k, having come through its gate; its story at t
      const k = Number(shot.id.slice(5)) || 0;
      Duat.clockOverride = shot.t;
      const e = k ? DUAT_ORIGIN.clone().add(pyramid.PATH[k]).lerp(DUAT_ORIGIN.clone().add(pyramid.PATH[k - 1]), 0.25) : pyramid.duatEntryPoint();
      if (k) e.y = pyramid.floorAt(e.x, e.z);
      const h = k ? Math.atan2(-(pyramid.PATH[k].x - pyramid.PATH[k - 1].x), -(pyramid.PATH[k].z - pyramid.PATH[k - 1].z)) : duatPathHeading();
      player.pos.set(e.x, e.y, e.z);
      player.heading = h;
      follow.yaw = h;
      Object.assign(player, { flying: false, landing: false, grounded: true, swimming: false, vy: 0, target: null });
      player.vel.set(0, 0, 0);
      follow.snapTo(player.pos);
      pyramid.duatActive = true;
      pyramid.playerPos = player.pos;
    } else if (shot?.id === "pyramid") {
      const dx = pyramid.door.x;
      const dz = pyramid.door.z - 14;
      player.pos.set(dx, heightAt(dx, dz), dz);
      player.heading = Math.PI;
      follow.yaw = Math.PI;
      Object.assign(player, { flying: false, landing: false, grounded: true, swimming: false, vy: 0, target: null });
      player.vel.set(0, 0, 0);
      follow.snapTo(player.pos);
      pyramid.playerPos = player.pos;
    }
    // a still of a readable artifact (`?shot=reading[&id=…][&open]`): where it lies, and it opens
    (window as unknown as { __readingAt?: (id: string) => THREE.Vector3 | null }).__readingAt = (id) => {
      readables.update(0, player.pos, false);
      return readables.at(id);
    };
    /* the sanctuary's stills: `?shot=sanctuary-stroke` (a finger mid-stroke, its trail of light),
       `sanctuary-rise` (a wall half risen), `sanctuary-dusk` (a small sanctuary at dusk, stone and
       gold), `sanctuary-form` (a stone gathering out of a rock; &warm=10) */
    (window as unknown as { __sanctuaryShot?: (id: string) => { base: [number, number, number]; view: { eye: [number, number, number]; look: [number, number, number] } } | null }).__sanctuaryShot = (id) => {
      const c = sanct.centre, f = c.face, fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
      // a point of the sanctuary's own frame (local x right, z toward the temple) in the shot's
      const L = (x: number, y: number, z: number): [number, number, number] => [x * rx + z * fx, y, x * rz + z * fz];
      const stand = (lx: number, lz: number, toward = 0) => {
        const [wx, , wz] = L(lx, 0, lz);
        player.pos.set(c.x + wx, c.y, c.z + wz);
        player.heading = f + toward;
      };
      if (id === "sanctuary-form" || id === "meditation-after") {
        // the rock nearest the sanctuary standing on its own, on dry ground
        creation["restream"](c.x, c.z);
        let best: ReturnType<typeof creation.touchables>[number] | null = null, bd = Infinity;
        const all = creation.touchables();
        for (const t of all) {
          if (t.kind !== "rock" || t.y < WATER_Y + 0.6 || t.r < 0.95 || t.r > 1.8) continue;
          if (all.some((o) => o !== t && Math.hypot(o.x - t.x, o.z - t.z) < 7)) continue;
          const d = Math.hypot(t.x - c.x, t.z - c.z);
          if (d < bd) (bd = d), (best = t);
        }
        if (!best) return null;
        const a = Math.atan2(c.x - best.x, c.z - best.z);
        const sx = best.x + Math.sin(a) * (best.r + 1.2), sz = best.z + Math.cos(a) * (best.r + 1.2);
        player.pos.set(sx, heightAt(sx, sz), sz);
        touch.touchThing("rock", new THREE.Vector3(best.x, best.y, best.z), best.r, best.r * 0.8);
        const st = touch.target!.stand, ct = touch.target!.contact;
        const gy = heightAt(st.x, st.y);
        const across = Math.atan2(best.x - st.x, best.z - st.y);
        const mx = (st.x + best.x) / 2, mz = (st.y + best.z) / 2;
        const ex = mx + Math.sin(across + Math.PI / 2) * 4.2 - Math.sin(across) * 0.8, ez = mz + Math.cos(across + Math.PI / 2) * 4.2 - Math.cos(across) * 0.8;
        if (id === "meditation-after") {
          // risen: from behind the wanderer's shoulder, the rock before it and the land beyond
          const bx = st.x - Math.sin(across) * 3.6 + Math.sin(across + Math.PI / 2) * 0.5, bz = st.y - Math.cos(across) * 3.6 + Math.cos(across + Math.PI / 2) * 0.5;
          return { base: [st.x, gy, st.y], view: { eye: [bx - st.x, 2.1, bz - st.y], look: [Math.sin(across) * 4, 0.9, Math.cos(across) * 4] } };
        }
        return { base: [st.x, gy, st.y], view: { eye: [ex - st.x, 1.3, ez - st.y], look: [mx - st.x, ct.y - gy + 0.15, mz - st.y] } };
      }
      if (id === "sanctuary-stroke") {
        // building, a circle being drawn on the earth, three-quarters round; the wanderer at the edge
        sanct.open(new THREE.Vector3(c.x, c.y, c.z), { orbit: false });
        sanct.shotForms([{ kind: "wall", ink: "stone", path: [-1.6, 0, -0.5, 0.25, 0.5, 0.25, 1.6, 0], x: 0, z: -4.2, y: 0, rot: 0, cost: 0.3 }]);
        const pts: [number, number][] = [];
        for (let i = 0; i <= 70; i++) {
          const a = -0.4 + (i / 70) * Math.PI * 1.55;
          const r = 2.1 + Math.sin(i * 0.31) * 0.06;
          pts.push([Math.cos(a) * r + 0.3, Math.sin(a) * r * 0.97 + 0.4]);
        }
        sanct.shotTrail(pts);
        stand(-1.2, 5.6, 0);
        (window as unknown as { __strokeTip?: [number, number] }).__strokeTip = pts[pts.length - 1];
        return { base: [c.x, c.y, c.z], view: { eye: L(0.6, 5.2, 8.6), look: L(0.2, 0, 0.2) } };
      }
      if (id === "sanctuary-rise") {
        // a wall drawn along a gentle curve, half risen out of the earth
        sanct.shotForms([{ kind: "wall", ink: "stone", path: [-3, 0.4, -1.6, -0.2, 0, -0.45, 1.6, -0.2, 3, 0.4], x: 0, z: -0.8, y: 0, rot: 0, cost: 0.5 }], 0.5);
        stand(3.4, 3.2, 0.4);
        return { base: [c.x, c.y, c.z], view: { eye: L(-3.2, 2.4, 6.8), look: L(0.2, 0.35, -0.8) } };
      }
      if (id === "sanctuary-joint") {
        // where gold meets stone, close: the post, its collar of light, its gold cap
        moodForce.w = MOOD_NAMES.map((n) => (n === "dusk" ? 1 : 0));
        sanct.shotForms(Sanctuary.shotLayout());
        stand(7.5, 3.0, 0.6);
        return { base: [c.x, c.y, c.z], view: { eye: L(6.4, 2.3, 0.6), look: L(3.6, 0.95, -3.6) } };
      }
      if (id === "sanctuary-build") {
        // the build screen over the terrace: the view risen over it, the arch chosen, its tools
        sanct.open(new THREE.Vector3(c.x, c.y, c.z), { yaw: f + 0.5 });
        // each in its own stone (the finishes), two carved with a note in the old script
        const fins = ["earth", "cliff", "granite", "marble", "field", "cut"] as const;
        // the ring roofed, the steps leading up onto it
        sanct.shotForms(Sanctuary.shotLayout().map((s) => (s.kind === "ring" ? { ...s, top: "roof" as const } : s.kind === "stairs" ? { ...s, h: 1.15, l: 2.6, z: 2.1 } : s)).map((s, i) => (s.ink === "stone" ? { ...s, fin: fins[i % fins.length], ...(i === 0 || i === 6 ? { note: 1 } : {}) } : s)));
        sanct.shotSelect(6);
        stand(0.6, 5.2, 0);
        // `sanctuary-build&near`: close to the arch's head, to read the carving
        if (new URLSearchParams(location.search).has("near")) return { base: [c.x, c.y, c.z], view: { eye: L(1.2, 2.4, 7.4), look: L(0, 2.6, 3.6) } };
        const o = sanct.shotOrbit();
        return { base: [c.x, c.y, c.z], view: { eye: [o.eye.x - c.x, o.eye.y - c.y, o.eye.z - c.z], look: [o.aim.x - c.x, o.aim.y - c.y, o.aim.z - c.z] } };
      }
      // a small sanctuary at dusk
      moodForce.w = MOOD_NAMES.map((n) => (n === "dusk" ? 1 : 0));
      sanct.shotForms(Sanctuary.shotLayout());
      stand(-4.2, 6.4, 0.5);
      // `&near`: up close to the arch and its pillar, to read the stone itself
      if (new URLSearchParams(location.search).has("near")) return { base: [c.x, c.y, c.z], view: { eye: L(2.2, 1.9, 6.6), look: L(0.6, 1.6, 3.6) } };
      // `&foot`: low by the arch's foot, where moss, damp and sand settle
      if (new URLSearchParams(location.search).has("foot")) return { base: [c.x, c.y, c.z], view: { eye: L(2.6, 0.9, 6.2), look: L(0.9, 0.35, 3.4) } };
      return { base: [c.x, c.y, c.z], view: { eye: L(4.2, 3.0, 14.5), look: L(-0.4, 1.9, -0.6) } };
    };
    if (shot)
      runShot({
        whisper: (id: string, k: number) => {
          const w = id as WhisperId;
          if (!["door", "days", "worlds", "quartz", "sky", "tree"].includes(w)) return null;
          whispers.hold = { id: w, k: Math.max(0, Math.min(1, k)) };
          if (w === "door" && k >= 1) falseDoors.setOffered(true);
          const v = whispers.shotView(w);
          if (w === "days") player.placeUnder();
          return { eye: v.eye.toArray() as [number, number, number], look: v.look.toArray() as [number, number, number], stand: v.stand.toArray() as [number, number, number] };
        },
        journey: async (name: string, i: number, tt: number) => {
          const j = (halls.find((h) => h.journey.name === name) ?? halls[0]).journey;
          await j.jump(i);
          j.sitNow(); // a seated room: as if you had sat down on its seat
          for (let k = 0, n = Math.min(7200, Math.max(40, Math.round(tt / 0.05))); k < n; k++) j.room?.update(0.05);
        },
        room: async (n: number) => {
          // the density rooms are factory modules (not yet in the journey): built here alone
          const mods: Record<number, () => Promise<Record<string, unknown>>> = {
            0: () => import("./scenes/densities/room_0"),
            1: () => import("./scenes/densities/room_1"),
            2: () => import("./scenes/densities/room_2"),
            3: () => import("./scenes/densities/room_3"),
            4: () => import("./scenes/densities/room_4"),
            5: () => import("./scenes/densities/room_5"),
            6: () => import("./scenes/densities/room_6"),
            7: () => import("./scenes/densities/room_7"),
          };
          const mod = await (mods[n] ?? mods[1])();
          // each room module names its own factory; room 7 also takes where it stands
          type Make = (s: THREE.Scene, nar: typeof narration, w: typeof whisper, at?: THREE.Vector3, heading?: number) => { onSit(): void; update(dt: number): void };
          const make = mod[n === 3 ? "createRoom3Scene" : n === 5 ? "createDensity5Scene" : n === 7 ? "createDensity7" : `createDensityRoom${n}Scene`] as Make;
          const lesson = n === 7 ? make(scene, narration, whisper, new THREE.Vector3(), 0) : make(scene, narration, whisper);
          await (lesson as { loaded?: Promise<void> }).loaded;
          additiveKeepsAlpha(scene);
          for (const o of scene.children) if (!(o as THREE.Light).isLight && o.name !== `lesson:density_${n}` && o.name !== `lesson:density-${n}` && o.name !== `density:density-${n}` && o !== camera) o.visible = false;
          return lesson;
        },
        camera,
        player,
        follow,
        narration,
        tour: tourScenes,
        S,
        terrain,
        gate: egyptGate.at,
        setInside,
        ready: bodyForms(),
        settle:
          shot.id === "reading"
            ? async () => {
                await glyphsLoaded();
                const q = new URLSearchParams(location.search), at = readables.at(q.get("id") ?? "sample");
                if (at && q.has("open")) openReading({ reading: readables.readings.find((r) => r.id === (q.get("id") ?? "sample"))!, pos: at });
              }
            : shot.id === "horses" || shot.id === "critters"
            ? async () => {
                await glyphsLoaded();
                await spiritHorses.loaded;
                const inland = { x: 2 * player.pos.x - MONUMENT.x, z: 2 * player.pos.z - MONUMENT.z };
                if (shot.id === "horses") spiritHorses.summon(player.pos, inland);
                else spiritCritters.summon(player.pos, { x: player.pos.x + 1, z: player.pos.z }, new URLSearchParams(location.search).has("hop"));
              }
            : async () => {
                await glyphsLoaded();
                // `&sit=<numeral>`: seated with that archetype (its panel open); `&feel=<word>` shares that feeling
                const q = new URLSearchParams(location.search), n = q.get("sit");
                const i = n ? beings.list.findIndex((b) => b.spec.numeral === n) : -1;
                if (i < 0) return;
                const seat = beings.seatFor(i);
                Object.assign(sitting, { being: i, x: seat.x, z: seat.z, heading: seat.heading });
                sitDown();
                const f = q.get("ask");
                if (f) {
                  (document.querySelector("#sit-prompts .deeper textarea") as HTMLTextAreaElement).value = f;
                  (document.querySelector("#sit-prompts .d-go") as HTMLButtonElement).click();
                }
              },
        update,
        veil: async (n) => {
          if (n === 1) {
            // the door in the world, from the way in, the angel beside it
            const o = veilHall.outside(), d = veilHall.door, f = veilHall.face;
            const sx = Math.cos(f), sz = -Math.sin(f);
            player.pos.set(o.x + Math.sin(f) * 4, heightAt(o.x + Math.sin(f) * 4, o.z + Math.cos(f) * 4), o.z + Math.cos(f) * 4);
            player.heading = o.heading;
            terrain.update(player.pos.x, player.pos.z, true);
            for (let k = 0; k < 60; k++) veilHall.update(1 / 30, k / 30, player.pos, false, false);
            const eye = [d.x + Math.sin(f) * 13 + sx * 3, d.y + 2.6, d.z + Math.cos(f) * 13 + sz * 3] as [number, number, number];
            return { eye, look: [d.x, d.y + 2.6, d.z] as [number, number, number] };
          }
          const j = halls[3].journey;
          await j.jump(0);
          const room = j.room as unknown as { debugPlace(n: number): { at: THREE.Vector3; look: THREE.Vector3 } };
          const { at, look } = room.debugPlace(n);
          const o = JOURNEY_ORIGIN;
          player.pos.set(o.x + at.x, o.y + at.y, o.z + at.z);
          const dir = look.clone().sub(at).setY(0).normalize();
          player.heading = Math.atan2(-dir.x, -dir.z);
          const eye = at.clone().addScaledVector(dir, -5.5).add(new THREE.Vector3(dir.z * 1.6, 2.6, -dir.x * 1.6));
          return { eye: [o.x + eye.x, o.y + eye.y, o.z + eye.z], look: [o.x + look.x, o.y + look.y, o.z + look.z] };
        },
        descent: async (n) => {
          if (n === 0) {
            // the shaft of light in its meadow, from a little way off
            const d = descentHall.door, f = descentHall.face;
            const px = d.x + Math.sin(f) * 16, pz = d.z + Math.cos(f) * 16;
            player.pos.set(px, heightAt(px, pz), pz);
            player.heading = f + Math.PI;
            terrain.update(px, pz, true);
            const eye = [d.x + Math.sin(f) * 30 + Math.cos(f) * 6, d.y + 4, d.z + Math.cos(f) * 30 - Math.sin(f) * 6] as [number, number, number];
            return { eye, look: [d.x, d.y + 14, d.z] as [number, number, number] };
          }
          const j = halls[4].journey;
          await j.jump(0);
          const room = j.room as unknown as { debugPlace(n: number): { at: THREE.Vector3; look: THREE.Vector3 } };
          const { at, look } = room.debugPlace(n);
          const o = JOURNEY_ORIGIN;
          player.pos.set(o.x + at.x, o.y + at.y, o.z + at.z);
          const dir = look.clone().sub(at).setY(0).normalize();
          player.heading = Math.atan2(-dir.x, -dir.z);
          const eye = at.clone().addScaledVector(dir, -5.5).add(new THREE.Vector3(dir.z * 1.6, 2.6, -dir.x * 1.6));
          return { eye: [o.x + eye.x, o.y + eye.y, o.z + eye.z], look: [o.x + look.x, o.y + look.y, o.z + look.z] };
        },
        maze: async (n) => {
          if (n === 0) {
            // the door: its leaning monoliths and curtain, from a little way off on the home side
            const d = mazeHall.door, f = mazeHall.face;
            const px = d.x + Math.sin(f) * 9, pz = d.z + Math.cos(f) * 9;
            player.pos.set(px, heightAt(px, pz), pz);
            player.heading = f + Math.PI;
            terrain.update(px, pz, true);
            const eye = [d.x + Math.sin(f) * 16 + Math.cos(f) * 5, d.y + 3.2, d.z + Math.cos(f) * 16 - Math.sin(f) * 5] as [number, number, number];
            return { eye, look: [d.x, d.y + 3.4, d.z] as [number, number, number] };
          }
          const j = halls[5].journey;
          await j.jump(0);
          const o = JOURNEY_ORIGIN;
          const cy = mazeFloor(0, 0);
          const OUT = MAZE_OUTER;
          const stand = (x: number, z: number, lx: number, lz: number) => {
            player.pos.set(o.x + x, mazeFloor(x, z), o.z + z);
            player.heading = Math.atan2(x - lx, z - lz);
          };
          const arts = maze?.steles() ?? [];
          const near = (id: string, back: number, up: number) => {
            // standing before it, the view over the shoulder
            const a = arts.find((q) => q.reading.id === id)!;
            const f = a.front ?? a.pos;
            const x = a.pos.x - o.x, z = a.pos.z - o.z, sx = f.x - o.x, sz = f.z - o.z;
            stand(sx, sz, x, z);
            const ex = x + (sx - x) * back, ez = z + (sz - z) * back;
            return { eye: [o.x + ex, mazeFloor(ex, ez) + up, o.z + ez] as [number, number, number], look: [a.pos.x, a.pos.y + 0.2, a.pos.z] as [number, number, number] };
          };
          if (n === 1) {
            // the way in: the gate in the high granite wall, nothing beyond it to be seen
            stand(0, OUT + 4.5, 0, 0);
            return { eye: [o.x + 1.5, mazeFloor(0, OUT + 10.5) + 2.8, o.z + OUT + 11.5], look: [o.x, mazeFloor(0, OUT - 1.5) + 2.4, o.z + OUT - 3.5] };
          }
          if (n === 2) {
            // the whole plan, from high above
            stand(0, OUT + 4.5, 0, 0);
            return { eye: [o.x, OUT * 2.05, o.z + OUT * 0.72], look: [o.x, 0, o.z + 2] };
          }
          if (n === 3) return near("maze-arch-I", 2.2, 2.2);
          if (n === 16 && maze) {
            // a real walk into a wall (&ring=k): set course through the ring's outer wall and let the
            // controller press the body to the stone (with &live=S the game runs S seconds)
            const k = Number(new URLSearchParams(location.search).get("ring") ?? 14);
            const L = maze.layout(), R = L.rin + L.cw * (k + 1), M = L.rin + L.cw * (k + 0.5);
            const arc = L.arcs.filter((w) => Math.abs(w.r - R) < 0.01).sort((p, q) => q.a1 - q.a0 - (p.a1 - p.a0))[0];
            const a = (arc.a0 + arc.a1) / 2;
            stand(Math.sin(a) * M, Math.cos(a) * M, Math.sin(a) * R, Math.cos(a) * R);
            player.target = new THREE.Vector2(o.x + Math.sin(a) * (R + 3), o.z + Math.cos(a) * (R + 3));
            const fy = mazeFloor(Math.sin(a) * M, Math.cos(a) * M);
            return { eye: [o.x + Math.sin(a + 0.05) * (M - 3), fy + 2.2, o.z + Math.cos(a + 0.05) * (M - 3)], look: [o.x + Math.sin(a) * R, fy + 1.3, o.z + Math.cos(a) * R] };
          }
          if (n === 19 && maze) {
            // a tap's way through the maze (&ang, &rad: where to, room frame): set course from the way in
            // and walk it; window.__routeStats keeps how far it got (with &live=S the game runs S seconds)
            const q = new URLSearchParams(location.search);
            const ang = Number(q.get("ang") ?? 1.2), rad = Number(q.get("rad") ?? 90);
            stand(0, OUT + 4.5, 0, 0);
            const tx = o.x + Math.sin(ang) * rad, tz = o.z + Math.cos(ang) * rad;
            courseTo(tx, tz);
            const st = { points: mazeRoute.length + 1, walked: 0, left: 0, dist: 0, stuck: 0 };
            (window as unknown as { __routeStats: typeof st }).__routeStats = st;
            const last = player.pos.clone();
            let acc = 0, still = 0;
            camStep = (dt: number) => {
              acc += dt;
              if (acc < 0.25) return;
              const step = player.pos.distanceTo(last);
              st.walked += step;
              still = step < 0.05 && player.target ? still + acc : 0;
              st.stuck = Math.max(st.stuck, still);
              acc = 0;
              last.copy(player.pos);
              st.left = mazeRoute.length + (player.target ? 1 : 0);
              st.dist = Math.hypot(tx - player.pos.x, tz - player.pos.z);
            };
            return { eye: [o.x, mazeFloor(0, OUT) + 40, o.z + OUT + 20], look: [o.x, 0, o.z + OUT - 20] };
          }
          if (n === 17 && maze) {
            // the camera test (&route=i, with &live=S): walk the corridors' way from reading i in
            // toward the centre, turns and doors and all, setting course a few metres ahead along it
            // each tenth of a second; each sample notes whether a wall stands between the view and
            // the wanderer, how far the view stands, and how much it turned (window.__camStats)
            const route = maze.debugRoute(Number(new URLSearchParams(location.search).get("route") ?? 0));
            const rollIt = new URLSearchParams(location.search).has("roll");
            if (rollIt) input.enabled = true; // stills keep input off; a roll drag needs it
            // a few metres along, clear of the reading at the route's start
            const r0 = Math.min(route.length - 8, 24), p0 = route[r0], p1 = route[Math.min(route.length - 1, r0 + 6)];
            stand(p0.x - o.x, p0.z - o.z, p1.x - o.x, p1.z - o.z);
            const st = { n: 0, blocked: 0, dist: 0, walked: 0, turn: 0 };
            (window as unknown as { __camStats: typeof st }).__camStats = st;
            const chest = new THREE.Vector3();
            const last = player.pos.clone();
            let acc = 0, at = r0, lastYaw = follow.yaw;
            camStep = (dt: number) => {
              acc += dt;
              if (acc < 0.1) return;
              acc = 0;
              // the nearest route point ahead of where it is, then a few metres on
              let best = at, bd = Infinity;
              for (let j = at; j < Math.min(route.length, at + 40); j++) {
                const d = Math.hypot(route[j].x - player.pos.x, route[j].z - player.pos.z);
                if (d < bd) (bd = d), (best = j);
              }
              at = best;
              const q = route[Math.min(route.length - 1, at + 7)];
              if (rollIt) {
                // as a hand would: a drag toward the way on, relative to the view
                const dx = q.x - player.pos.x, dz = q.z - player.pos.z, l = Math.hypot(dx, dz) || 1;
                const fx = -Math.sin(follow.yaw), fz = -Math.cos(follow.yaw);
                const fwd = (dx * fx + dz * fz) / l, right = (dx * Math.cos(follow.yaw) - dz * Math.sin(follow.yaw)) / l;
                input.debugRoll({ x: right, y: fwd });
              } else player.target = new THREE.Vector2(q.x, q.z);
              chest.copy(player.pos).setY(player.pos.y + 1.3);
              st.n++;
              if (maze!.clearance(chest, camera.position) < 0.98) st.blocked++;
              st.dist += chest.distanceTo(camera.position);
              st.walked += player.pos.distanceTo(last);
              st.turn += Math.abs(Math.atan2(Math.sin(follow.yaw - lastYaw), Math.cos(follow.yaw - lastYaw)));
              lastYaw = follow.yaw;
              last.copy(player.pos);
            };
            return { eye: [p0.x, p0.y + 3, p0.z + 4], look: [p1.x, p1.y + 1.3, p1.z] };
          }
          if (n >= 12 && n <= 15 && maze) {
            if (n === 15) {
              // the centre: sat at the seat, every path lit, the motes come home to the one seated
              maze.debugAll();
              maze.debugSeated(30);
              stand(0, 0.05, 0, -3);
              const cy0 = mazeFloor(0, 0);
              if (new URLSearchParams(location.search).has("eagle")) {
                // the mirror: from the eagle's height, the golden sphere at the heart of its own golden road
                maze.debugExplore(200, 0);
                stand(0, 0.05, 0, -3);
                maze.debugSeated(30);
                return { eye: [o.x + 0.01, cy0 + 87, o.z + 0.02], look: [o.x, cy0, o.z] };
              }
              return { eye: [o.x + 3.4, cy0 + 2.4, o.z + 4.6], look: [o.x, cy0 + 1.0, o.z] };
            }
            // walked some way in along the true way, touching the walls as it went
            const e = maze.debugExplore(n === 12 ? 3 : n === 13 ? 9 : 16, n === 12 ? 0 : n === 13 ? 4 : 3);
            const l = Math.hypot(e.dx, e.dz) || 1, fx = e.dx / l, fz = e.dz / l;
            const fy = mazeFloor(e.x, e.z);
            if (n === 12) {
              // a touch, mid-shimmer: the wall answering where the hand met it
              maze.debugTouch(e.x - fz * 2.4, e.z + fx * 2.4);
              stand(e.x, e.z, e.x - fz * 3, e.z + fx * 3);
              return { eye: [o.x + e.x + fz * 1.2 - fx * 2.2, fy + 1.6, o.z + e.z - fx * 1.2 - fz * 2.2], look: [o.x + e.x - fz * 3 + fx * 0.6, fy + 1.2, o.z + e.z + fx * 3 + fz * 0.6] };
            }
            if (n === 13) {
              // palms left along a wall as the hand went, the touched stone edged in gold
              for (const b of [7.5, 4.5, 1.5]) maze.debugTouch(e.x - fx * b - fz * 2.4, e.z - fz * b + fx * 2.4);
              stand(e.x + fz * 1.2, e.z - fx * 1.2, e.x - fz * 3, e.z + fx * 3);
              // from the sphere's own eye (0.7 m), along the wall it touched
              return { eye: [o.x + e.x + fx * 2.5 + fz * 1.6, fy + 0.7, o.z + e.z + fz * 2.5 - fx * 1.6], look: [o.x + e.x - fx * 4.5 - fz * 3, fy + 1.2, o.z + e.z - fz * 4.5 + fx * 3] };
            }
            // 14: the road walked, glowing behind the wanderer
            stand(e.x, e.z, e.x + fx * 5, e.z + fz * 5);
            return { eye: [o.x + e.x - fx * 6.5, fy + 3.1, o.z + e.z - fz * 6.5], look: [o.x + e.x + fx * 1.5, fy + 0.6, o.z + e.z + fz * 1.5] };
          }
          if (n === 11) {
            // the maze's own map, open, standing just inside the way in
            stand(0, OUT - 3.25, 0, 0);
            maze?.debugExplore(40, 6);
            requestAnimationFrame(() => mazeMap.open());
            return { eye: [o.x, mazeFloor(0, OUT) + 3, o.z + OUT + 4], look: [o.x, mazeFloor(0, 0), o.z] };
          }
          if (n === 10) {
            // contemplating in a corridor: the view up to the sun, flaring, its light pouring down
            stand(0.6, 43.2, 0, 0);
            const head = new THREE.Vector3(o.x + 0.6, mazeFloor(0, 43.2) + 1.6, o.z + 43.2);
            sunStill = true;
            maze?.setNourish(1, head);
            const s = maze!.sunWorld();
            return { eye: [o.x + 1.2, head.y + 0.3, o.z + 44.6], look: [s.x, s.y, s.z] };
          }
          if (n === 6) {
            // a monument round the forecourt, its door toward the maze (&slot=0…6: the temple, the
            // pyramid far off, the densities, the adept, past choices, the veil, the descent)
            const k = Number(new URLSearchParams(location.search).get("slot") ?? 0);
            const a = 0.62 + (k / 6) * (Math.PI * 2 - 1.24);
            stand(Math.sin(a) * (OUT + 8.5), Math.cos(a) * (OUT + 8.5), Math.sin(a) * (OUT + 30), Math.cos(a) * (OUT + 30));
            return { eye: [o.x + Math.sin(a - 0.04) * (OUT + 2.5), mazeFloor(0, OUT + 2.5) + 3.2, o.z + Math.cos(a - 0.04) * (OUT + 2.5)], look: [o.x + Math.sin(a) * (OUT + 24.5), mazeFloor(0, OUT + 24.5) + 4, o.z + Math.cos(a) * (OUT + 24.5)] };
          }
          if (n === 9) {
            // walking up to a monument round the forecourt and in through its door (&slot as for 6)
            const k = Number(new URLSearchParams(location.search).get("slot") ?? 0);
            const id = ["temple", "duat", "densities", "adept", "past", "veil", "descent"][k];
            const d = maze?.doors().find((q) => q.id === id);
            const a = 0.62 + (k / 6) * (Math.PI * 2 - 1.24);
            stand(Math.sin(a) * (OUT + 6.5), Math.cos(a) * (OUT + 6.5), Math.sin(a) * (OUT + 30), Math.cos(a) * (OUT + 30));
            if (d) player.target = new THREE.Vector2(d.pos.x, d.pos.z);
            return { eye: [o.x + Math.sin(a) * (OUT + 0.5), mazeFloor(0, OUT + 0.5) + 3, o.z + Math.cos(a) * (OUT + 0.5)], look: [o.x + Math.sin(a) * (OUT + 24.5), mazeFloor(0, OUT + 24.5) + 3, o.z + Math.cos(a) * (OUT + 24.5)] };
          }
          if (n === 8) {
            // the whole: the maze, the worlds' buildings round it, the volcanoes and the pyramid beyond
            stand(0, OUT + 4.5, 0, 0);
            return { eye: [o.x + 70, 170, o.z + 340], look: [o.x - 10, 0, o.z - 50] };
          }
          if (n === 7) {
            // a wall touched: the wave of blue light going out through the stone
            const a = 0.3, r = OUT - 0.8;
            stand(Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * (OUT + 11), Math.cos(a) * (OUT + 11));
            return { eye: [o.x + Math.sin(a - 0.04) * (OUT - 5), mazeFloor(0, OUT - 5) + 2.3, o.z + Math.cos(a - 0.04) * (OUT - 5)], look: [o.x + Math.sin(a) * OUT, mazeFloor(0, OUT) + 1.6, o.z + Math.cos(a) * OUT] };
          }
          if (n === 4) return near("maze-2", 1.6, 1.9);
          // 5: sat at the centre, everything met: the eagle's view, the paths lit, the motes flowing
          maze?.debugAll();
          stand(0, 0.5, 0, -3);
          return { eye: [o.x + Math.sin(follow.yaw) * 20, cy + 58, o.z + Math.cos(follow.yaw) * 20], look: [o.x, cy, o.z] };
        },
        breath: (open) => {
          breath.debugOpen = open;
          breath.set(true);
          for (let k = 0; k < 120; k++) breath.update(1 / 30, player.pos, false);
          breathCueFrame();
        },
        templeStand: (i) => {
          setInside(true);
          update(1 / 60); // coming in begins the tour: this still is of walking up yourself
          tourScenes.tour.exit();
          const s = temple.standFor(i);
          player.pos.set(s.x, temple.floorAt(s.x, s.z), s.z);
          player.heading = s.heading;
          follow.yaw = s.heading;
          follow.snapTo(player.pos);
        },
        idle: () => {
          // (&inward=0: still a few seconds, not long enough for contemplation)
          lastTouch = new URLSearchParams(location.search).get("inward") === "0" ? performance.now() - 3000 : -1e9;
          realDt = 1 / 60; // the stills' frames are lived synchronously, at sixty a second
        },
        draw: () => {
          renderer.info.reset();
          post.render();
        },
      });
  });

/* Loading, then the title (the owner: "remove the weird quote… go straight to the main page, also
   add the loading progress so we know it's not stuck"). While the world loads, the seed turns in
   the dark over a thin bar of how far it has come; when it is ready the dark lifts onto the night
   water and the title, "Tap to begin". No words before it. */
let loadingEnded = false;
let opening: "loading" | "done" = "loading";
if (isTv) {
  loadingEnded = true;
  opening = "done";
  document.body.classList.remove("loading");
  $("#loading")?.remove();
  $("#title")?.classList.add("gone");
  if ($("#begin")) $("#begin").hidden = true;
} else {
  window.setTimeout(endLoading, Math.max(0, 14000 - performance.now()));
}
/** The world is ready: the dark lifts onto the water and the title. */
function endLoading(): void {
  if (loadingEnded) return;
  loadingEnded = true;
  bootProgress(1, "Ready");
  const wait = Math.max(0, 1200 - performance.now());
  window.setTimeout(() => {
    opening = "done";
    $("#loading").classList.add("dawn", "done");
    document.body.classList.remove("loading");
    window.setTimeout(() => $("#loading")?.remove(), 4500);
  }, wait);
}

/* The owner's feedback tool (`?dev=1`, remembered on the device; debug/feedback.ts). Loaded only
   in dev mode: with it off, nothing of it is fetched, shown or run. */
declare const __SHA__: string;
if (devMode()) {
  void import("./debug/feedback").then(({ installFeedback }) =>
    installFeedback({
      capture: () => {
        try {
          post.render(); // a fresh frame, read before the browser presents it (no preserved buffer)
        } catch {
          return null;
        }
        const c = renderer.domElement;
        const out = document.createElement("canvas");
        out.width = c.width;
        out.height = c.height;
        const g = out.getContext("2d");
        if (!g) return null;
        g.drawImage(c, 0, 0);
        return out;
      },
      hold: () => {
        devHeld = true;
        const voice = !!tp.guest?.active() && !tp.guest.paused();
        if (voice) tp.guest!.toggle();
        const archive = tp.playing;
        if (archive) tp.pause();
        return () => {
          devHeld = false;
          last = performance.now();
          if (voice && tp.guest?.paused()) tp.guest.toggle();
          if (archive) tp.resume();
        };
      },
      context: devContext,
    }),
  );
}
function devPlace(): string {
  const h = inHall();
  if (h) {
    const st = h.journey.stage;
    return `${h.hall.label} › ${st && h.journey.inside && !h.journey.crossing ? `${st.title} [${st.id}]` : "crossing"}`;
  }
  if (temple.inside) {
    const i = temple.nearShrine(player.pos, 4);
    return "The temple" + (i >= 0 && ARCHETYPES[i] ? ` › ${ARCHETYPES[i].numeral} ${ARCHETYPES[i].name}` : "");
  }
  if (pyramid.isInside) return player.pos.distanceTo(DUAT_ORIGIN) < 260 ? "The Duat" : "The pyramid, inside";
  if (depths.inside) return "The archive of the heart";
  { const u = under(); if (u) return u.chamber(player.pos)?.name ?? u.spec.label; }
  let best: Place | null = null, bd = Infinity;
  for (const p of places()) {
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (d < bd) (bd = d), (best = p);
  }
  const how = player.swimming ? " · in the water" : player.flying ? " · flying" : "";
  return (best ? `world · ${Math.round(bd)} m from ${best.label}` : "world") + how;
}
function devContext(): [string, string][] {
  const r1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const yaw = Math.round((Math.atan2(dir.x, -dir.z) * 180) / Math.PI);
  const pitch = Math.round((Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) * 180) / Math.PI);
  const out: [string, string][] = [];
  if (shot) out.push(["shot", location.search.replace(/^\?/, "")]);
  out.push(["place", devPlace()]);
  out.push(["camera", `${r1(camera.position.x)}, ${r1(camera.position.y)}, ${r1(camera.position.z)} · yaw ${yaw}° pitch ${pitch}°`]);
  out.push(["wanderer", `${r1(player.pos.x)}, ${r1(player.pos.y)}, ${r1(player.pos.z)} · ${player.pose}`]);
  const bar = tourBar().info();
  if (bar) {
    const name = walk ? walk.label : duatTour ? "The Duat, hour by hour" : areaTour ? "Walking with the guide" : tourScenes.tour.active ? "The temple tour" : "tour";
    out.push(["tour", `${name} › ${[bar.title, bar.hint].filter(Boolean).join(" · ")}`]);
  }
  const pr = narration.progress();
  if (narration.current) out.push(["narration", `${narration.current}${pr ? ` @ ${pr.t.toFixed(1)} / ${pr.total.toFixed(1)} s` : ""}${narration.paused ? " (paused)" : ""}`]);
  if (tp.current) out.push(["archive", `${tp.current.id} "${tp.current.title}" @ ${tp.time.toFixed(1)} s`]);
  const sky = MOOD_NAMES.map((n, i) => [n, moods.weights[i]] as const).filter(([, w]) => w > 0.05).map(([n, w]) => `${n} ${Math.round(w * 100)}`).join(" · ");
  if (sky) out.push(["sky", sky]);
  out.push(["view", `${rendererName} · ${quality.current.name} · ${renderer.domElement.width}×${renderer.domElement.height}`]);
  out.push(["build", `${__SHA__} · ${__BUILD__}`]);
  return out;
}

/* Film mode (`?film=<tour>`; debug/film.ts): the game records its own tour. Loaded only then. */
if (FILM) {
  void import("./debug/film").then((m) =>
    m.startFilm({
      canvas: renderer.domElement,
      audio,
      narration,
      fadeEl,
      tours: [...WALKS.map((w) => ({ id: w.id, label: w.label })), { id: "duat", label: "The Duat, hour by hour" }],
      ready: () => shadersReady && opening === "done" && !startMap.isOpen,
      waking: () => (!shadersReady ? "preparing the light (the shaders)" : opening !== "done" ? "raising the water" : S.mode !== "intro" ? "arriving" : "ready"),
      playing: () => S.mode === "play" && !crossing && !fadeEl.classList.contains("on"),
      begin: () => begin(),
      start: (kind, id) => {
        if (kind === "autofly") setAutofly(true);
        else if (kind === "autowalk") setAutorun(true);
        else if (id === "duat") duatTourStart();
        else walkStart(id);
      },
      active: () => !!walk || !!duatTour || tourScenes.tour.active,
      chapter: () => {
        const where = devPlace();
        const info = tourBar().info();
        if (info) {
          const travel = /on the way/.test(info.hint);
          return { key: `${walk?.id ?? ""}|${info.title}|${travel ? "t" : "s"}`, label: info.title, detail: info.hint, kind: travel ? "travel" : tourScenes.tour.active ? "temple" : duatTour ? "duat" : "stop", where };
        }
        if (autofly.active) return { key: "autofly", label: "Autofly", detail: "", kind: "autofly", where };
        if (autorun.active) return { key: "autowalk", label: "Auto-walk", detail: "", kind: "autowalk", where };
        return { key: "free", label: "The world", detail: "", kind: "free", where };
      },
      reset: async () => {
        if (walk) walkEnd(false);
        if (duatTour) duatTourEnd(false);
        if (areaTour) areaTourEnd();
        if (tourScenes.tour.active) tourScenes.tour.exit();
        stopAuto();
        narration.stop(0.5);
        standUp();
        // back on foot (an autofly clip leaves the wanderer flying)
        Object.assign(player, { flying: false, landing: false, gliding: false, vy: 0 });
        const shore = places()[0];
        arrive({ place: shore, ...shore.start }, false);
      },
      pin: (_scale, fixed, targetH) => {
        // fast capture holds the best picture (its time is its own); a real-time one lets the game
        // adapt as it always does, or a laptop that cannot draw the best level at full size draws a
        // frame every few seconds and the whole scene stands still
        if (fixed) quality.override("full");
        const el = renderer.domElement;
        const native = (el.clientHeight || innerHeight) * Math.min(devicePixelRatio || 1, quality.current.dpr);
        // render about as many pixels as the film will hold (more is thrown away when it is shrunk)
        // (and more pixels than the screen has when the film is larger than the screen: a 4K film
        // from a 1080p window is drawn at 2×, not stretched)
        quality.scale = Math.max(targetH / native, 0.5);
        resize();
      },
      frames: () => frameCount,
      onFrame: (cb) => (filmFrame = cb),
    }),
  );
}
/* A ✕ in the corner of every panel laid over the world (the owner: "add close (x) symbol to all
   the popups across the game"). Panels that already have their own (the reader, the oracle, the
   heart's pages, the guide, the narration card, the maze's map, the intro, the install card, the
   tour bar) keep theirs. */
function addX(el: HTMLElement | null, close: () => void, label = "Close"): HTMLButtonElement | null {
  if (!el) return null;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "px";
  b.setAttribute("aria-label", label);
  b.textContent = "✕";
  b.addEventListener("pointerdown", (e) => e.stopPropagation());
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    close();
  });
  el.prepend(b);
  return b;
}
addX($("#menu"), () => setMenu(false));
addX($("#howto"), () => ($("#howto").hidden = true));
addX($("#about"), () => ($("#about").hidden = true));
addX($("#welcome-again"), () => ($("#welcome-again").hidden = true));
addX($("#cards"), () => closeCards(), "Leave the cards");
addX($("#sit-panel"), () => standUp(), "Stand up");
addX($("#with"), () => endTempleRite(false), "Return");
addX(shrineEl, () => {
  shrineSetAside = shrineAt;
  shrineEl.hidden = true;
});
addX(document.getElementById("heart-compose"), () => (document.querySelector("#heart-compose .cancel") as HTMLButtonElement | null)?.click());
addX(document.getElementById("next-up"), () => nextUp.hide(), "Stay here");
{
  // the map: only when it can be closed (its "Stay where I am" shows)
  const mx = addX($("#map"), () => $("#map-close").click(), "Close the map")!;
  const sync = () => (mx.hidden = $("#map-close").hidden);
  new MutationObserver(sync).observe($("#map-close"), { attributes: true, attributeFilter: ["hidden"] });
  sync();
}
Object.assign(window, { __ij: { cavern, setCavern, mines, setUnder, med, sanct, garden, canTouch, beginBuild, beginHoverBuild, groundPoint, solidity, offerNext, nextUp, player, follow, quality, audio, narration, playlist, scene, S, wanderer, lanterns, flowers, landmarks, creation, beings, startMap, arrive, places, heightAt, communion, creatures, sitting, setMed: (v: number) => { medK = v; stillFor = 99; }, vessels, tp, post, renderer, camera, THREE, duatTourStart, walkStart, walkState: () => walk && { phase: walk.phase, i: walk.i, n: walk.stops.length, t: walk.t }, walkSkip, duatTourState: () => duatTour, companion, cpu: () => cpuMs, moods, fauna, presences, guide, terrain, water, grass, seaLife, blooms, input, archiveHeard, wilds, nile, autofly, setAutofly, autorun, setAutorun, breath, temple, setInside, crossTemple, openCards, setCard, beginTempleRite, endTempleRite, kindled, touch, beginTouch, depths, setDeep, crossDeep, RUIN_SITES, ancients, falseDoors, gobekli, nanMadol, pyramid, setPyr, crossPyr, vision, tourScenes, halls, densityHall, adeptHall, pastHall, veilHall, descentHall, mazeHall, myHeart, oracle, oracleVision, stepFrames: (n: number, dt = 1 / 60) => { realDt = dt; for (let i = 0; i < n; i++) update(dt); post.render(); }, heartFrame, maze: () => maze, tourInfo: () => tourBar().info() } });
Object.assign((window as unknown as { __ij: object }).__ij, { whispers, hearWhisper, rapaNui });
