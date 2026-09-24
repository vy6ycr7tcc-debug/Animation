/* Three Islands — milestone 1: scaffold and device test.
   Checks on Samuel's iPhone: sound (with the silent switch on), the device voice,
   subtitles, and frame rate under bloom, shadows and particles. */
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
import { AudioEngine } from "./audio";
import { AdaptiveQuality, FrameStats, MOBILE, TIERS, type Tier } from "./quality";
import { TestScene } from "./scene";
import { OPENING, Voice } from "./voice";

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const canvas = $<HTMLCanvasElement>("#gl");

const S = {
  started: false,
  reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  hidden: false,
  t: 0,
};

/* ============ RENDERER ============ */
const renderer = new THREE.WebGLRenderer({
  canvas,
  powerPreference: "high-performance",
  antialias: false, // SMAA handles it
  stencil: false,
  depth: false, // the composer owns the depth buffer
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // soft in r18x (PCFSoft was folded into it)
renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the effect pass
renderer.info.autoReset = false; // count every pass in a frame, not just the last

const quality = new AdaptiveQuality(applyTier);
const world = new TestScene(renderer, { shadowSize: quality.current.shadow, particles: quality.current.particles });

const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
composer.addPass(new RenderPass(world.scene, world.camera));
const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.7, luminanceSmoothing: 0.2, intensity: 1.3, radius: 0.7 });
const bloomPass = new EffectPass(world.camera, bloom, new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
const plainPass = new EffectPass(world.camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
const finalPass = new EffectPass(world.camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM }), new VignetteEffect({ offset: 0.3, darkness: 0.55 }));
composer.addPass(bloomPass);
composer.addPass(plainPass);
composer.addPass(finalPass);

let dpr = 1;
function resize(): void {
  const w = innerWidth;
  const h = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, quality.current.dpr);
  renderer.setPixelRatio(dpr);
  composer.setSize(w, h);
  world.camera.aspect = w / h;
  world.camera.fov = h > w ? 68 : 52;
  world.camera.updateProjectionMatrix();
  world.setDpr(dpr);
}
function applyTier(t: Tier): void {
  bloomPass.enabled = t.bloom;
  plainPass.enabled = !t.bloom;
  world.setShadowSize(t.shadow);
  world.setParticles(t.particles);
  resize();
}
applyTier(quality.current);
addEventListener("resize", resize);

/* ============ AUDIO + VOICE ============ */
const audio = new AudioEngine();
const voice = new Voice($("#sub"), (busy) => audio.duck(busy));

/* ============ UI ============ */
function say(m: string): void {
  const l = $("#live");
  l.textContent = "";
  window.setTimeout(() => (l.textContent = m), 50);
}
function hint(text: string, ms = 6000): void {
  const h = $("#hint");
  h.textContent = text;
  h.classList.add("on");
  window.clearTimeout((hint as unknown as { t: number }).t);
  (hint as unknown as { t: number }).t = window.setTimeout(() => h.classList.remove("on"), ms);
}
function toggleButton(sel: string, on: boolean, label?: [string, string]): void {
  const b = $(sel);
  b.setAttribute("aria-pressed", String(on));
  if (label) b.textContent = on ? label[0] : label[1];
}

$("#enter").addEventListener("click", () => {
  // Everything audible starts synchronously inside this tap (iOS requirement).
  audio.start();
  voice.play(OPENING);
  S.started = true;
  $("#gate").classList.add("gone");
  $("#controls").hidden = false;
  $("#stats").hidden = false;
  window.setTimeout(() => ($("#gate").style.display = "none"), 1500);
  window.setTimeout(soundCheck, 2500);
  window.setTimeout(() => hint("Tap the gold disk to open it. Drag to look around.", 7000), 9000);
});

function soundCheck(): void {
  if (!audio.ctx || audio.ctx.state !== "running") {
    hint("No sound? Tap Sound off and on again. If it stays silent, open this page in Safari.", 9000);
  }
}

$("#b-sound").addEventListener("click", () => {
  audio.start();
  audio.setOn(!audio.on);
  toggleButton("#b-sound", audio.on, ["Sound", "Sound off"]);
});
$("#b-voice").addEventListener("click", () => {
  voice.on = !voice.on;
  if (!voice.on) voice.stop(true);
  toggleButton("#b-voice", voice.on, ["Voice", "Voice off"]);
});
function setReduced(v: boolean): void {
  S.reduced = v;
  toggleButton("#b-motion", v);
}
setReduced(S.reduced);
$("#b-motion").addEventListener("click", () => setReduced(!S.reduced));
matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", (e) => setReduced(e.matches));
$("#b-ignite").addEventListener("click", () => ignite());
$("#b-stats").addEventListener("click", () => {
  const s = $("#stats");
  s.hidden = !s.hidden;
  toggleButton("#b-stats", !s.hidden);
});
$("#b-copy").addEventListener("click", async () => {
  const text = $("#stats-text").textContent || "";
  try {
    await navigator.clipboard.writeText(text);
    $("#b-copy").textContent = "Copied";
  } catch {
    $("#b-copy").textContent = "Copy failed; take a screenshot";
  }
  window.setTimeout(() => ($("#b-copy").textContent = "Copy readings"), 2500);
});

function ignite(): void {
  audio.start(); // also resumes after an iOS interruption
  const opened = world.toggleOpen();
  if (opened) {
    audio.openChord();
    say("The disk opens. Light rises.");
  } else {
    audio.bell(659.25, 0.05, 4);
    say("The disk closes.");
  }
}

/* ============ INPUT: drag to look, tap the disk ============ */
const worldEl = $("#world");
let drag: { x: number; y: number; x0: number; y0: number; moved: boolean } | null = null;
worldEl.addEventListener("pointerdown", (e) => {
  if (!S.started) return;
  audio.resume();
  worldEl.setPointerCapture?.(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false };
});
worldEl.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) drag.moved = true;
  if (drag.moved) {
    world.yaw -= dx * 0.006;
    world.pitch = THREE.MathUtils.clamp(world.pitch + dy * 0.004, -0.1, 0.9);
  }
});
worldEl.addEventListener("pointerup", (e) => {
  const d = drag;
  drag = null;
  if (!d || d.moved) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (world.hitDisk(ndc)) ignite();
  else audio.bell(880 * (0.75 + Math.random() * 0.5), 0.03, 3);
});
worldEl.addEventListener("pointercancel", () => (drag = null));
addEventListener("keydown", (e) => {
  if (!S.started) return;
  if (e.key === "ArrowLeft") world.yaw += 0.15;
  if (e.key === "ArrowRight") world.yaw -= 0.15;
  if (e.key === "ArrowUp") world.pitch = Math.min(0.9, world.pitch + 0.08);
  if (e.key === "ArrowDown") world.pitch = Math.max(-0.1, world.pitch - 0.08);
});

/* ============ READINGS ============ */
const stats = new FrameStats();
const gpu = (() => {
  const gl = renderer.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
})();
const webgl2 = renderer.capabilities.isWebGL2;

function readings(): string {
  const a = audio.ctx;
  const ri = renderer.info.render;
  const verdict = stats.fps >= 57 ? "smooth" : stats.fps >= 45 ? "mostly smooth" : stats.fps >= 28 ? "30-ish: is Low Power Mode on?" : "slow";
  return [
    `fps ${stats.fps.toFixed(1)}  (${verdict})`,
    `frame avg ${stats.avgMs.toFixed(1)} ms, worst ${stats.worstMs.toFixed(0)} ms, slow ${(stats.slowShare * 100).toFixed(0)}%`,
    `quality ${quality.current.name} · dpr ${dpr} of ${devicePixelRatio}`,
    `canvas ${renderer.domElement.width}×${renderer.domElement.height} · ${ri.calls} draws · ${(ri.triangles / 1000).toFixed(1)}k tris`,
    `gpu ${gpu}${webgl2 ? "" : " (WebGL1)"}`,
    `audio ${a ? a.state : "not started"}${a ? ` · ${a.sampleRate} Hz` : ""} · session ${audio.sessionType}`,
    `voice ${voice.available ? (voice.on ? "device" : "off") : "unavailable"}`,
    `${MOBILE ? "touch" : "desktop"} · ${navigator.userAgent.match(/OS (\d+[_\d]*)/)?.[1]?.replace(/_/g, ".") ?? ""}`.trim(),
  ].join("\n");
}

/* ============ LOOP ============ */
document.addEventListener("visibilitychange", () => {
  S.hidden = document.hidden;
  if (document.hidden) {
    audio.suspend();
    voice.stop();
  } else {
    audio.resume();
    last = performance.now();
  }
});

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  if (S.hidden) return;
  const ms = now - last;
  last = now;
  const dt = Math.min(0.1, ms / 1000);
  S.t += dt;
  if (S.started && ms < 250 && stats.push(ms)) {
    quality.window(stats);
    if (!$("#stats").hidden) $("#stats-text").textContent = readings();
  }
  world.update(S.t, dt, S.reduced);
  renderer.info.reset();
  composer.render(dt);
}
requestAnimationFrame(frame);

// Exposed for debugging from the console.
Object.assign(window, { __ij: { renderer, world, quality, audio, TIERS } });
