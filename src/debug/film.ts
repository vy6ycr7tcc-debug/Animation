/* Film mode: the game records its own tour. Loaded only when the address asks for it.

     ?film=<tour>      a tour id (see Tours on the map: all, temple, pyramid, densities, adept, past,
                       veil, descent, ancient, lessons, visions, duat); `grand` is the whole walk
     &fps=30           frames a second (default 30)
     &scale=1          render scale multiplier (2 renders at twice the pixels, for a larger capture)
     &until=<seconds>  stop after this long (otherwise at the tour's end)
     &fast=1           offline capture: the game steps on a fixed 1/fps timestep with no wall clock,
                       every frame is drawn and encoded, and the audio is laid in on the same
                       timeline (see the notes on what it holds, below)
     &seed=<n>         the seed for what the tours leave to chance

   Real-time (the default): the game plays as the player would see and hear it. The picture is a
   composite canvas (the game's canvas, and the dark or white of a crossing's fade, which is DOM
   and so would otherwise be missing) recorded by MediaRecorder; the audio is the engine's whole
   master bus (voice, bed, tones, one-shots), tapped after its compressor. A .webm comes out.

   Fast: the same picture, but time is virtual (debug/filmClock.ts), frames are encoded with
   WebCodecs as fast as the GPU draws them, and the sound is rebuilt from a timeline of what the
   audio engine played: the voice (every start, stop and fade, on the audio clock), the water bed
   and its ducking, and the master level. The generated layer (the modal pad, bowls, chimes, the
   one-shot sounds) is made live by the engine from random choices and is not in this mix: a fast
   capture has the voice and the water, a real-time one has everything. A timeline.json (every
   event with the frame it fires on) comes with the video. Without WebCodecs a zip of frames, the
   timeline and an ffmpeg command is offered instead. */
import { ArrayBufferTarget, Muxer } from "webm-muxer";
import type { AudioEngine, Tape } from "../core/audio";
import { crossfadeLoop } from "../core/audio";
import type { Narration } from "../core/narration";
import { FAST, real, vclock } from "./filmClock";

export interface FilmHost {
  canvas: HTMLCanvasElement;
  audio: AudioEngine;
  narration: Narration;
  fadeEl: HTMLElement;
  tours: { id: string; label: string }[];
  /** the world is built, the shaders compiled and the title is up */
  ready(): boolean;
  /** what the game is waiting for before it is ready, in words */
  waking(): string;
  /** in the world, awake, not in a crossing */
  playing(): boolean;
  begin(): void;
  /** begin a clip: a tour (by its walk id), autofly, auto-walk or genesis */
  start(kind: string, tour: string): void;
  /** a tour or genesis is still going */
  active(): boolean;
  /** what the game is doing now (the chapter it belongs to) */
  chapter(): ChapterInfo;
  /** between clips: every tour and automatic mode put away, back at the shore */
  reset(): Promise<void>;
  /** the best picture, held, at this render scale */
  pin(scale: number): void;
  onFrame(cb: () => void): void;
}

const q = new URLSearchParams(location.search);
const num = (k: string, d: number, lo: number, hi: number): number => {
  const v = Number(q.get(k));
  return Number.isFinite(v) && q.get(k) !== null && q.get(k) !== "" ? Math.min(hi, Math.max(lo, v)) : d;
};
const FPS = Math.round(num("fps", 30, 10, 60));
const SCALE = num("scale", 1, 0.25, 4);
const UNTIL = q.has("until") ? num("until", 0, 1, 24 * 3600) : 0;
const TAIL = 3; // seconds kept after the tour's last word, so the end isn't cut

/* ------------------------------------------------------------------ the film's own screen */

class Screen {
  el = document.createElement("div");
  private title = document.createElement("p");
  private line = document.createElement("p");
  private btns = document.createElement("div");
  private rec = document.createElement("div");
  private recText = document.createElement("span");
  constructor() {
    this.el.id = "film-ui";
    this.el.innerHTML = `<div class="film-card"><div class="film-ring"></div><p class="film-title"></p><p class="film-line"></p><div class="film-btns"></div></div><div class="film-rec" hidden><i></i><span></span></div>`;
    document.body.append(this.el);
    this.title = this.el.querySelector(".film-title")!;
    this.line = this.el.querySelector(".film-line")!;
    this.btns = this.el.querySelector(".film-btns")!;
    this.rec = this.el.querySelector(".film-rec")!;
    this.recText = this.rec.querySelector("span")!;
  }
  card(title: string, line: string, buttons: { label: string; go: () => void; href?: string; name?: string }[] = []): void {
    this.el.classList.add("card-on");
    this.title.textContent = title;
    this.line.textContent = line;
    this.btns.replaceChildren(
      ...buttons.map((b) => {
        const e = document.createElement(b.href ? "a" : "button") as HTMLButtonElement & HTMLAnchorElement;
        e.textContent = b.label;
        e.className = "film-btn";
        if (b.href) {
          e.href = b.href;
          e.download = b.name ?? "";
        } else e.type = "button";
        e.addEventListener("click", () => b.go());
        return e;
      }),
    );
  }
  /** Only the card's line changes (the title and buttons stay). */
  line_(text: string): void {
    if (this.line.textContent !== text) this.line.textContent = text;
  }
  /** A pulsing ring on the card while something is being waited for. */
  waiting(on: boolean): void {
    this.el.classList.toggle("waiting", on);
  }
  /** The card steps away while it records; the dot says it does. */
  recording(on: boolean, text = ""): void {
    this.el.classList.toggle("card-on", !on);
    this.rec.hidden = !on;
    this.recText.textContent = text && `${text} · keep this tab in front`;
  }
  status(text: string): void {
    this.recText.textContent = `${text} · keep this tab in front`;
  }
}

/* ------------------------------------------------------------------ the picture */

/** The game's canvas plus the fade of a crossing, in one canvas: the fade is a DOM layer, which a
    canvas capture would otherwise leave out, so every crossing would cut instead of dipping. */
class Picture {
  readonly canvas = document.createElement("canvas");
  private g: CanvasRenderingContext2D;
  private level = 0;
  private from = 0;
  private to = 0;
  private t0 = 0;
  private dur = 1.3;
  constructor(private host: FilmHost) {
    this.canvas.width = host.canvas.width;
    this.canvas.height = host.canvas.height;
    this.g = this.canvas.getContext("2d", { alpha: false })!;
  }
  private fade(now: number): number {
    const el = this.host.fadeEl;
    const target = el.classList.contains("on") ? 1 : 0;
    if (target !== this.to) {
      this.from = this.level;
      this.to = target;
      this.t0 = now;
      const d = parseFloat(getComputedStyle(el).transitionDuration);
      this.dur = Number.isFinite(d) && d > 0 ? d : 1.3;
    }
    const p = Math.min(1, Math.max(0, (now - this.t0) / this.dur));
    // CSS `ease`, near enough: slow at both ends
    const e = p * p * (3 - 2 * p);
    return (this.level = this.from + (this.to - this.from) * e);
  }
  draw(now: number): void {
    const { g, canvas } = this;
    g.globalAlpha = 1;
    g.drawImage(this.host.canvas, 0, 0, canvas.width, canvas.height);
    const a = this.fade(now);
    if (a > 0.002) {
      g.globalAlpha = a;
      g.fillStyle = this.host.fadeEl.classList.contains("white") ? "#fff6e6" : "#07061a";
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.globalAlpha = 1;
    }
  }
}

/* ------------------------------------------------------------------ small helpers */

const tick = (): Promise<void> => new Promise((r) => (tickPort.port1.onmessage = () => r(), tickPort.port2.postMessage(0)));
const tickPort = new MessageChannel();
const sleep = (ms: number): Promise<void> => new Promise((r) => real.setTimeout(r, ms));
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const bytesText = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`);

function download(blob: Blob, name: string): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  return url;
}

interface Status {
  state: "boot" | "waiting" | "recording" | "encoding" | "done" | "error";
  frames: number;
  seconds: number;
  bytes: number;
  name: string;
  files: string[];
  note: string;
  error: string;
  /** the timeline (fast capture) */
  timeline: unknown;
  clip: string;
  progress: string;
  clips: { id: string; file: string; duration: number; bytes: number; chapters: number }[];
  /** every file written, with its size (what the page believes it saved) */
  saved: { name: string; bytes: number }[];
}
const status: Status = { state: "boot", frames: 0, seconds: 0, bytes: 0, name: "", files: [], note: "", error: "", timeline: null, clip: "", progress: "", clips: [], saved: [] };
(window as unknown as { __film: object }).__film = status;

/* ------------------------------------------------------------------ clips and chapters */

/** One recording: a tour, autofly, auto-walk or the heart's genesis. */
interface Clip {
  id: string;
  label: string;
  kind: "tour" | "autofly" | "autowalk" | "genesis";
  /** for a tour: the walk's id */
  tour?: string;
  /** for the timed kinds: how long to film */
  secs?: number;
}

/** What the game is doing now, as the host describes it (see main.ts `chapter`). */
export interface ChapterInfo {
  key: string;
  label: string;
  detail: string;
  kind: string;
  where: string;
}
/** A part of a clip, with when it starts and ends (seconds from the clip's first frame). */
export interface Chapter {
  id: string;
  label: string;
  detail: string;
  kind: string;
  where: string;
  start: number;
  end: number;
}

const slug = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "part";

class Chapters {
  private list: Chapter[] = [];
  private cur: Chapter | null = null;
  private key = "";
  note(t: number, c: ChapterInfo): void {
    if (this.cur && c.key === this.key) return;
    this.close(t);
    this.key = c.key;
    this.cur = { id: "", label: c.label, detail: c.detail, kind: c.kind, where: c.where, start: Math.round(t * 100) / 100, end: Math.round(t * 100) / 100 };
    this.list.push(this.cur);
  }
  private close(t: number): void {
    if (this.cur) this.cur.end = Math.round(t * 100) / 100;
  }
  /** Close the last, drop blips (under a second, which are the tour changing its mind), number them. */
  finish(t: number): Chapter[] {
    this.close(t);
    let out = this.list.filter((c) => c.end - c.start >= 1);
    if (!out.length) out = this.list.slice(0, 1);
    out.forEach((c, i) => (c.id = `${String(i + 1).padStart(2, "0")}-${slug(c.label)}`));
    if (out.length) out[0].start = 0; // the first part begins with the clip (the first frame may come a moment late)
    return out;
  }
}

/** Where the files go: a folder the owner chose (written straight to disk), or downloads. */
interface Sink {
  where: string;
  save(name: string, blob: Blob): Promise<string | null>;
}
function makeSink(dir: FileSystemDirectoryHandle | null): Sink {
  if (dir) {
    return {
      where: `the folder “${dir.name}”`,
      async save(name, blob) {
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
        return null;
      },
    };
  }
  return {
    where: "your downloads",
    async save(name, blob) {
      const url = download(blob, name);
      await sleep(500); // one at a time, so the browser doesn't fold them into a refusal
      return url;
    },
  };
}

/** What the clips were, for whoever plays them (the TV app: `docs/film-mode.md`). */
interface ClipResult {
  id: string;
  label: string;
  kind: string;
  file: string;
  chaptersFile: string;
  timelineFile?: string;
  duration: number;
  bytes: number;
  chapters: Chapter[];
  /** set when something looks wrong with the clip (a tour that ended almost at once) */
  warning?: string;
}

/** The clips `?film=` asks for. */
function clipsAsked(host: FilmHost): { clips: Clip[]; many: boolean } | string {
  const asked = q.get("film")!;
  const flySecs = num("flysecs", 240, 5, 3600), walkSecs = num("walksecs", 150, 5, 3600);
  const timed: Clip[] = [
    { id: "autofly", label: "Autofly", kind: "autofly", secs: flySecs },
    { id: "autowalk", label: "Auto-walk", kind: "autowalk", secs: walkSecs },
    { id: "genesis", label: "Genesis, the heart", kind: "genesis" },
  ];
  if (asked === "everything" || asked === "all-clips") {
    let clips: Clip[] = [...host.tours.filter((t) => t.id !== "all").map((t) => ({ id: t.id, label: t.label, kind: "tour" as const, tour: t.id })), ...timed];
    if (q.get("grand") === "1") clips.push({ id: "grand", label: "The grand tour, end to end", kind: "tour", tour: "all" });
    const only = (q.get("only") ?? "").split(",").filter(Boolean), skip = (q.get("skip") ?? "").split(",").filter(Boolean);
    if (only.length) clips = clips.filter((c) => only.includes(c.id));
    if (skip.length) clips = clips.filter((c) => !skip.includes(c.id));
    if (!clips.length) return "No clips match that list.";
    return { clips, many: true };
  }
  const t = timed.find((c) => c.id === asked);
  if (t) return { clips: [t], many: false };
  const id = asked === "grand" ? "all" : asked;
  const tour = host.tours.find((x) => x.id === id);
  if (!tour) return `There is no tour called “${asked}”. Try: everything, grand, autofly, autowalk, genesis, ${host.tours.map((x) => x.id).join(", ")}.`;
  return { clips: [{ id: asked, label: asked === "grand" ? "The grand tour, end to end" : tour.label, kind: "tour", tour: id }], many: false };
}

/** Clips already filmed (kept on this device, so a restart carries on where it stopped). */
const DONE_KEY = `inward-journey:film-done:${FAST ? "fast" : "live"}`;
const doneIds = (): string[] => {
  if (q.get("fresh") === "1") return [];
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const markDone = (ids: string[]): void => {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(ids));
  } catch {
    /* fine */
  }
};

/* ------------------------------------------------------------------ start */

export function startFilm(host: FilmHost): void {
  document.body.classList.add("film");
  const ui = new Screen();
  const fail = (msg: string): void => {
    status.state = "error";
    status.error = msg;
    ui.recording(false);
    ui.card("Film mode", msg);
  };
  const asked = clipsAsked(host);
  if (typeof asked === "string") return fail(asked);
  const { many } = asked;
  const finished = many && q.get("fresh") !== "1" ? doneIds() : [];
  const clips = asked.clips.filter((c) => !finished.includes(c.id));
  const webcodecs = "VideoEncoder" in window && "AudioEncoder" in window && "VideoFrame" in window && "AudioData" in window;
  if (!FAST && (typeof MediaRecorder === "undefined" || !("captureStream" in HTMLCanvasElement.prototype))) {
    return fail("This browser cannot record the screen from the game (MediaRecorder or canvas capture is missing). Try Chrome or Edge on a computer, or add &fast=1.");
  }
  if (!clips.length) return fail(`Every clip of this list is already filmed (kept on this device). Add &fresh=1 to film them again.`);
  host.pin(SCALE);
  status.state = "waiting";
  status.clips = [];
  const go = (dir: FileSystemDirectoryHandle | null): void => void session(host, ui, clips, asked.clips.length, many, makeSink(dir), !webcodecs).catch((e) => fail(String(e?.message ?? e)));
  if (!many) {
    if (FAST) return go(null);
    // wake the audio without a click when the browser allows it; otherwise one click, which also
    // lets the file download at the end
    return void autoplayOk().then((ok) => (ok ? go(null) : ui.card("Film mode", `${clips[0].label}. Click to begin; the game plays by itself and the file is offered at the end.`, [{ label: "Begin filming", go: () => go(null) }])));
  }
  const names = clips.map((c) => c.id).join(", ");
  const resumed = finished.length ? ` ${finished.length} already filmed (${finished.join(", ")}) are skipped.` : "";
  const picker = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  ui.card(
    "Film everything",
    `${clips.length} clips: ${names}.${resumed} Each is its own video with its chapters, and manifest.json lists them all. Then leave this tab in front and walk away.`,
    [
      ...(picker ? [{ label: "Choose a folder and begin", go: () => void picker.call(window, { mode: "readwrite" }).then(go, () => ui.card("Film everything", "No folder was chosen. Try again, or begin with downloads.")) }] : []),
      { label: picker ? "Begin (files download)" : "Begin", go: () => go(null) },
    ],
  );
}

async function autoplayOk(): Promise<boolean> {
  try {
    const c = new AudioContext();
    await Promise.race([c.resume().catch(() => void 0), sleep(400)]);
    const ok = c.state === "running";
    void c.close();
    return ok;
  } catch {
    return false;
  }
}

/** Past the title, into the world, and settled. */
async function intoTheWorld(host: FilmHost, ui: Screen, wait: (ms: number) => Promise<void>, settle: (secs: number) => Promise<void>): Promise<void> {
  // the card says what is being waited for and for how long (a still card looks like a hung page)
  ui.card("Film mode", "Waking the world…");
  ui.waiting(true);
  const t0 = real.now();
  let stopped = false;
  const say = (): void => {
    if (stopped) return;
    const s = Math.round((real.now() - t0) / 1000);
    let hint = "";
    if (document.hidden) hint = " Bring this tab to the front: the world only wakes while it is in view.";
    else if (s > 90) hint = " Still working: the first time it fetches the world and prepares the shaders, which can take a couple of minutes.";
    ui.line_(`Waking the world: ${host.waking()} · ${s} s.${hint}`);
    real.setTimeout(say, 500);
  };
  say();
  while (!host.ready()) await wait(100);
  host.begin(); // sound starts here, inside the click (or the allowed autoplay)
  await wait(400);
  while (!host.playing()) await wait(100);
  stopped = true;
  ui.waiting(false);
  await settle(2.5); // the land streams in; the first moments are never filmed
}

/** Between clips: every tour and automatic mode put away, the voice stopped, back at the shore. */
async function betweenClips(host: FilmHost, wait: (ms: number) => Promise<void>, settle: (secs: number) => Promise<void>): Promise<void> {
  await host.reset();
  await wait(300);
  while (!host.playing()) await wait(100);
  await settle(3);
}

/** The timed clips end at their time; a tour, when it has ended (or at `until`). */
function clipLimit(clip: Clip): number {
  return clip.secs ?? (UNTIL || 0);
}

/* ------------------------------------------------------------------ the whole run */

async function session(host: FilmHost, ui: Screen, clips: Clip[], total: number, many: boolean, sink: Sink, zip: boolean): Promise<void> {
  const results: ClipResult[] = [];
  const doneBefore = many ? doneIds() : [];
  // time: real, or the film's own (fast capture steps the game on a fixed timestep)
  let wait: (ms: number) => Promise<void> = sleep;
  let settle = (secs: number): Promise<void> => sleep(secs * 1000);
  let steps: Steps | null = null;
  const log: Tape[] = []; // what the audio engine has done to its gains, from the start (fast capture)
  let current: { mixer: Mixer; raw: Tape[] } | null = null;
  if (FAST) {
    const step = (): void => vclock.step(1000 / FPS);
    // the virtual clock is stepped from the very beginning: nothing else would move time. While the
    // world loads (in real time) it goes on at a rate the loading can keep up with.
    wait = async (ms) => {
      const t = real.now();
      while (real.now() - t < ms) {
        step();
        await sleep(8);
      }
    };
    // (the settle counts the game's own seconds: a slow machine draws fewer frames in the same wall time)
    settle = async (secs) => {
      const end = vclock.t + secs;
      while (vclock.t < end) {
        step();
        await tick();
      }
    };
    steps = { step };
    const tape = (e: Tape): void => {
      if (e.k === "gain" || e.k === "bed") log.push(e);
      current?.mixer.push(e);
      current?.raw.push(e);
    };
    host.audio.tape = tape;
    host.narration.tape = tape;
  }
  await intoTheWorld(host, ui, wait, settle);

  let size = { width: 0, height: 0 };
  for (let n = 0; n < clips.length; n++) {
    const clip = clips[n];
    if (n > 0) await betweenClips(host, wait, settle);
    status.clip = clip.id;
    status.progress = `${doneBefore.length + n + 1} of ${total}`;
    const prefix = many ? "" : "inward-journey-";
    const base = many ? clip.id : `${prefix}${q.get("film")}`;
    let out: Captured;
    if (FAST) {
      const mixer = new Mixer();
      for (const e of log) mixer.push(e);
      current = { mixer, raw: [...log] };
      out = await captureFast(host, ui, clip, zip, steps!, current, base);
      current = null;
    } else out = await captureLive(host, ui, clip, base);
    size = out.size;
    // the files: the video, its chapters, and (fast) its timeline
    const chaptersFile = `${base}.chapters.json`;
    const chaptersBlob = new Blob([JSON.stringify({ clip: clip.id, label: clip.label, duration: out.duration, chapters: out.chapters }, null, 1)], { type: "application/json" });
    ui.status(`saving ${base}…`);
    let url: string | null = null;
    for (const f of out.files) {
      url = (await sink.save(f.name, f.blob)) ?? url;
      status.saved.push({ name: f.name, bytes: f.blob.size });
    }
    await sink.save(chaptersFile, chaptersBlob);
    const bytes = out.files.reduce((a, f) => a + f.blob.size, 0);
    const video = out.files[0].name;
    const warning = clip.secs === undefined && !UNTIL && out.duration < 10 ? `This clip lasted only ${out.duration} s: the tour or animation probably did not start. Film it again with ?film=${clip.id}.` : undefined;
    results.push({ id: clip.id, label: clip.label, kind: clip.kind, file: video, chaptersFile, timelineFile: out.files.find((f) => f.name.endsWith(".timeline.json"))?.name, duration: out.duration, bytes, chapters: out.chapters, warning });
    if (warning) status.note += `${clip.id}: ${warning} `;
    status.clips.push({ id: clip.id, file: video, duration: out.duration, bytes, chapters: out.chapters.length });
    status.files.push(video, chaptersFile);
    status.bytes += bytes;
    status.name = video;
    status.timeline = out.timeline;
    if (many) {
      markDone([...doneBefore, ...results.map((r) => r.id)]);
      await sink.save("manifest.json", new Blob([JSON.stringify(manifestOf(results, size), null, 1)], { type: "application/json" }));
    }
    if (!many) {
      ui.recording(false);
      ui.card("Film complete", `${clip.label}: ${video} · ${bytesText(bytes)} · ${mmss(out.duration)} · ${out.chapters.length} chapters. ${out.note}`, url ? [{ label: "Download again", href: url, name: video, go: () => void 0 }] : []);
    }
  }
  status.state = "done";
  if (many) {
    ui.recording(false);
    ui.card("Everything is filmed", `${results.length} clips saved to ${sink.where}, with manifest.json. ${bytesText(status.bytes)} in all. You can close this tab.`);
  }
}

function manifestOf(results: ClipResult[], size: { width: number; height: number }): object {
  return {
    app: "inward-journey",
    generated: new Date().toISOString(),
    mode: FAST ? "fast" : "live",
    fps: FPS,
    size,
    note: "Each clip is its own video; chapters give where in it each part of the tour is (seconds from the clip's start). To jump: pick the clip, seek to the chapter's start, play to its end.",
    clips: results,
  };
}

interface Captured {
  files: { name: string; blob: Blob }[];
  duration: number;
  size: { width: number; height: number };
  chapters: Chapter[];
  timeline: unknown;
  note: string;
}
interface Steps {
  step: () => void;
}

/* ------------------------------------------------------------------ real time */

async function captureLive(host: FilmHost, ui: Screen, clip: Clip, base: string): Promise<Captured> {
  const pic = new Picture(host);
  const video = pic.canvas.captureStream(FPS);
  const sound = host.audio.tapStream();
  const note: string[] = [];
  if (!sound) note.push("The audio could not be tapped: this recording has no sound.");
  else for (const t of sound.getAudioTracks()) video.addTrack(t);
  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("This browser's recorder has no WebM format to offer.");
  const px = pic.canvas.width * pic.canvas.height;
  const rec = new MediaRecorder(video, { mimeType: mime, videoBitsPerSecond: Math.min(40e6, Math.round(px * FPS * 0.12)), audioBitsPerSecond: 192000 });
  const chunks: Blob[] = [];
  let size = 0;
  rec.ondataavailable = (e) => e.data.size && (chunks.push(e.data), (size += e.data.size));
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
  const chapters = new Chapters();
  const limit = clipLimit(clip), timed = clip.secs !== undefined;

  const t0 = real.now();
  let started = false, idleSince = 0, finished = false, lastNote = -1;
  const elapsed = (): number => (real.now() - t0) / 1000;
  host.onFrame(() => {
    if (!started || finished) return;
    const s = elapsed();
    pic.draw(s);
    status.seconds = s;
    status.bytes = size;
    status.state = "recording";
    ui.status(`REC ${clip.id} ${mmss(s)}${status.progress ? ` · clip ${status.progress}` : ""}`);
    if (s - lastNote >= 0.25) {
      lastNote = s;
      chapters.note(s, host.chapter());
    }
    if (limit && s >= limit) finished = true;
    else if (!timed && !host.active()) {
      idleSince ||= s;
      if (s - idleSince >= TAIL) finished = true;
    } else idleSince = 0;
  });
  pic.draw(0);
  rec.start(1000);
  started = true;
  ui.recording(true, `REC ${clip.id} 0:00`);
  host.start(clip.kind, clip.tour ?? "");
  while (!finished) await sleep(250);
  // one last frame, and a moment for the encoder to take it before the recorder is closed
  pic.draw(elapsed());
  await sleep(900);
  const duration = elapsed();
  host.onFrame(() => void 0);
  if (rec.state !== "inactive") rec.requestData();
  rec.stop();
  await stopped;
  for (const t of video.getTracks()) t.stop();
  const blob = new Blob(chunks, { type: "video/webm" });
  if (blob.size < 1000) throw new Error("The recorder produced no data (the game drew no frames while it was recording). Try again with the tab in front.");
  return { files: [{ name: `${base}.webm`, blob }], duration: Math.round(duration * 100) / 100, size: { width: pic.canvas.width, height: pic.canvas.height }, chapters: chapters.finish(duration), timeline: null, note: note.join(" ") };
}

/* ------------------------------------------------------------------ fast capture */

interface Ev {
  frame: number;
  t: number;
  kind: string;
  [k: string]: unknown;
}

/** A gain that moves in the straight ramps the engine asked for (each one starting from wherever the
    last had got to). */
class Env {
  private segs: { t0: number; v0: number; t1: number; v1: number }[] = [];
  constructor(private init: number) {}
  at(t: number): number {
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const s = this.segs[i];
      if (s.t0 <= t) return t >= s.t1 ? s.v1 : s.v0 + ((s.v1 - s.v0) * (t - s.t0)) / Math.max(1e-6, s.t1 - s.t0);
    }
    return this.init;
  }
  ramp(at: number, to: number, secs: number): void {
    this.segs.push({ t0: at, v0: this.at(at), t1: at + Math.max(0.001, secs), v1: to });
  }
}

interface Voice {
  at: number;
  file: string;
  off: number;
  dur?: number;
  fadeIn: number;
  stopAt?: number;
  stopFade: number;
}

const RATE = 48000;

/** The sound of a fast capture, rebuilt from the audio engine's own record of what it played. */
class Mixer {
  voices: Voice[] = [];
  bedAt: number | null = null;
  private bed = new Env(1);
  private master = new Env(0);
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private bedBuf: Promise<AudioBuffer | null> | null = null;
  private decoder = new OfflineAudioContext(2, 1, RATE);

  push(e: Tape): void {
    if (e.k === "voice") this.voices.push({ at: e.at, file: e.file, off: e.off, dur: e.dur, fadeIn: e.fadeIn, stopFade: 0.1 });
    else if (e.k === "voiceStop") {
      for (let i = this.voices.length - 1; i >= 0; i--) {
        const v = this.voices[i];
        if (v.stopAt !== undefined) continue;
        v.stopAt = Math.max(e.at, v.at);
        v.stopFade = Math.max(0.02, e.fade);
        break;
      }
    } else if (e.k === "gain") (e.w === "bed" ? this.bed : this.master).ramp(e.at, e.to, e.secs);
    else if (e.k === "bed") this.bedAt ??= e.at;
  }

  private load(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(`./${url}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => this.decoder.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(url, p);
      // keep only the few most recent (a long recording decoded is large)
      while (this.buffers.size > 6) this.buffers.delete(this.buffers.keys().next().value!);
    }
    return p;
  }

  private voiceEnd(v: Voice, buf: AudioBuffer): number {
    let end = v.at + (v.dur ?? buf.duration - v.off);
    if (v.stopAt !== undefined) end = Math.min(end, v.stopAt + v.stopFade + 0.05);
    return Math.min(end, v.at + buf.duration - v.off);
  }
  private voiceGain(v: Voice, t: number): number {
    let g = Math.min(1, Math.max(0, (t - v.at) / v.fadeIn));
    if (v.dur !== undefined) {
      const f0 = v.at + Math.max(v.fadeIn, v.dur - 0.5);
      if (t > f0) g *= Math.max(0, 1 - (t - f0) / Math.max(0.001, v.at + v.dur - f0));
    }
    if (v.stopAt !== undefined && t > v.stopAt) g *= Math.max(0, 1 - (t - v.stopAt) / v.stopFade);
    return g;
  }

  /** Seconds [c0, c1) of the film (times are on the audio clock, shifted by `origin`). */
  async render(c0: number, c1: number, origin: number): Promise<AudioBuffer> {
    const a0 = c0 + origin, a1 = c1 + origin;
    const len = Math.round((c1 - c0) * RATE);
    const ctx = new OfflineAudioContext(2, len, RATE);
    const curve = (param: AudioParam, from: number, to: number, f: (t: number) => number): void => {
      const n = Math.max(2, Math.ceil((to - from) * 100) + 1);
      const arr = new Float32Array(n);
      for (let i = 0; i < n; i++) arr[i] = f(from + ((to - from) * i) / (n - 1));
      param.setValueCurveAtTime(arr, from - a0, to - from);
    };
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 2.5;
    comp.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = 0;
    curve(master.gain, a0, a1, (t) => this.master.at(t));
    master.connect(comp);
    for (const v of this.voices) {
      if (v.at >= a1) continue;
      const buf = await this.load(v.file);
      if (!buf) continue;
      const end = this.voiceEnd(v, buf);
      if (end <= a0) continue;
      const s0 = Math.max(v.at, a0), s1 = Math.min(end, a1);
      if (s1 - s0 < 0.002) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0;
      curve(g.gain, s0, s1, (t) => this.voiceGain(v, t));
      src.connect(g).connect(master);
      src.start(s0 - a0, v.off + (s0 - v.at), s1 - s0);
    }
    if (this.bedAt !== null && this.bedAt < a1) {
      this.bedBuf ??= this.load("audio/water-bed.mp3").then((b) => (b ? crossfadeLoop(this.decoder, b, 2.5) : null));
      const b = await this.bedBuf;
      if (b) {
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0;
        const s0 = Math.max(this.bedAt, a0);
        curve(g.gain, s0, a1, (t) => 0.9 * this.bed.at(t));
        src.connect(g).connect(master);
        src.start(s0 - a0, (s0 - this.bedAt) % b.duration);
      }
    }
    return ctx.startRendering();
  }
}

async function captureFast(host: FilmHost, ui: Screen, clip: Clip, zip: boolean, steps: Steps, current: { mixer: Mixer; raw: Tape[] }, base: string): Promise<Captured> {
  const { mixer, raw } = current;
  let origin = 0; // audio-clock seconds at the clip's first frame
  const step = steps.step;
  const pic = new Picture(host);
  const chapters = new Chapters();

  const W = pic.canvas.width, H = pic.canvas.height;
  if (!zip && (W % 2 || H % 2)) throw new Error(`The canvas is ${W}×${H}: video needs even sides. Resize the window by a pixel and try again.`);
  let venc: VideoEncoder | null = null, aenc: AudioEncoder | null = null, muxer: Muxer<ArrayBufferTarget> | null = null;
  let encErr: unknown = null;
  const jpegs: { name: string; blob: Blob }[] = [];
  const pending: Promise<void>[] = [];
  if (!zip) {
    muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "V_VP9", width: W, height: H, frameRate: FPS }, audio: { codec: "A_OPUS", numberOfChannels: 2, sampleRate: RATE }, firstTimestampBehavior: "offset" });
    venc = new VideoEncoder({ output: (c, m) => muxer!.addVideoChunk(c, m), error: (e) => (encErr = e) });
    venc.configure({ codec: "vp09.00.10.08", width: W, height: H, framerate: FPS, bitrate: Math.min(40e6, Math.round(W * H * FPS * 0.14)) });
    aenc = new AudioEncoder({ output: (c, m) => muxer!.addAudioChunk(c, m), error: (e) => (encErr = e) });
    aenc.configure({ codec: "opus", sampleRate: RATE, numberOfChannels: 2, bitrate: 160000 });
  }
  const limit = clipLimit(clip) ? Math.round(clipLimit(clip) * FPS) : Infinity, timed = clip.secs !== undefined;
  let captured = 0, capturing = false, idleFrames = 0, finished = false;

  host.onFrame(() => {
    if (!capturing || finished) return;
    const f = captured++;
    pic.draw(f / FPS);
    if (venc) {
      const vf = new VideoFrame(pic.canvas, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
      vf.close();
    } else pending.push(new Promise((r) => pic.canvas.toBlob((b) => (b && jpegs.push({ name: `frames/f${String(f).padStart(6, "0")}.jpg`, blob: b }), r()), "image/jpeg", 0.92)));
    if (f % 8 === 0) chapters.note(f / FPS, host.chapter());
    status.frames = captured;
    status.seconds = captured / FPS;
    if (captured >= limit) finished = true;
    else if (!timed && !host.active()) {
      if (++idleFrames >= TAIL * FPS) finished = true;
    } else idleFrames = 0;
  });

  const encodeAudio = async (c0: number, c1: number): Promise<void> => {
    if (!aenc || c1 - c0 < 0.01) return;
    const buf = await mixer.render(c0, c1, origin);
    const n = buf.length, data = new Float32Array(n * 2);
    data.set(buf.getChannelData(0), 0);
    data.set(buf.getChannelData(1), n);
    const ad = new AudioData({ format: "f32-planar", sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(c0 * 1e6), data });
    aenc.encode(ad);
    ad.close();
  };

  // the clip begins now: its first frame is the next one the game draws
  origin = vclock.t + 1 / FPS;
  capturing = true;
  status.state = "recording";
  ui.recording(true, `REC ${clip.id}`);
  host.start(clip.kind, clip.tour ?? "");
  const CHUNK = 10;
  let audioDone = 0, counted = 0;
  const startedAt = real.now();
  while (!finished) {
    step();
    if (captured > counted) {
      counted = captured;
      const t = captured / FPS;
      // the sound of everything up to a finished 10 s is known by now: mix and encode it
      if (aenc && t - audioDone >= CHUNK + 1) {
        await encodeAudio(audioDone, audioDone + CHUNK);
        audioDone += CHUNK;
      }
      if (encErr) throw encErr;
      if (venc) while (venc.encodeQueueSize > 8) await sleep(2);
      if (captured % FPS === 0) {
        ui.status(`REC ${clip.id} ${mmss(t)}${limit < Infinity ? ` of ${mmss(limit / FPS)}` : ""}${status.progress ? ` · clip ${status.progress}` : ""} · filmed in ${mmss((real.now() - startedAt) / 1000)}`);
        await sleep(0);
      }
    }
    await tick();
  }
  host.onFrame(() => void 0);
  const total = captured;
  const duration = total / FPS;
  status.state = "encoding";
  ui.status("encoding…");
  const timeline = {
    tour: clip.id,
    label: clip.label,
    fps: FPS,
    frames: total,
    duration: Math.round(duration * 1000) / 1000,
    size: { width: W, height: H },
    scale: SCALE,
    seed: Number(q.get("seed") ?? 20260930),
    audioNote: "The voice and the water bed are laid in from these events (frame = the film frame each fires on; negative = before the first frame). The generated layer (pad, bowls, chimes, one-shots) is live and random and is not in a fast capture.",
    // each event with the clip frame it fires on (negative: before the first frame)
    events: raw.map((e) => {
      const t = e.at - origin;
      const { k, ...rest } = e;
      return { ...rest, frame: Math.round(t * FPS), t: Math.round(t * 1000) / 1000, kind: k === "voice" ? "narration" : k === "voiceStop" ? "narration-stop" : k === "bed" ? "bed" : `${(e as { w: string }).w}-gain` };
    }),
  };
  const tl = new Blob([JSON.stringify(timeline, null, 1)], { type: "application/json" });
  const ch = chapters.finish(duration);
  const common = { duration: Math.round(duration * 100) / 100, size: { width: W, height: H }, chapters: ch, timeline };

  if (!zip && venc && aenc && muxer) {
    await encodeAudio(audioDone, duration);
    await venc.flush();
    await aenc.flush();
    if (encErr) throw encErr;
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: "video/webm" });
    return { ...common, files: [{ name: `${base}.webm`, blob }, { name: `${base}.timeline.json`, blob: tl }], note: "The timeline came with it." };
  }

  // no WebCodecs: a zip of the frames, the timeline and the command that makes the video
  await Promise.all(pending);
  const sh = ffmpegScript(timeline as unknown as { fps: number; duration: number; events: Ev[] }, base);
  const z = await zipStore([...jpegs, { name: "timeline.json", blob: tl }, { name: "make-video.sh", blob: new Blob([sh], { type: "text/plain" }) }]);
  return { ...common, files: [{ name: `${base}.frames.zip`, blob: z }], note: "This browser has no WebCodecs: a zip of frames, the timeline and make-video.sh (run it in the unzipped folder, with ffmpeg and the game's audio files beside it)." };
}

/** The ffmpeg command that lays the voice and the bed on the frames, at the timeline's moments. */
function ffmpegScript(tl: { fps: number; duration: number; events: Ev[] }, base: string): string {
  const voices = tl.events.filter((e) => e.kind === "narration");
  const stops = tl.events.filter((e) => e.kind === "narration-stop");
  const inputs: string[] = [];
  const parts: string[] = [];
  voices.forEach((v, i) => {
    const next = stops.find((s) => s.t >= (v.t as number)) ?? null;
    const t0 = Math.max(0, v.t as number);
    let dur = typeof v.dur === "number" ? (v.dur as number) : 1e9;
    if (next) dur = Math.min(dur, next.t - t0 + (next.fade as number));
    inputs.push(`-i "../public/${v.file}"`);
    parts.push(`[${i}:a]atrim=start=${v.off}:duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=${v.fadeIn},adelay=${Math.round(t0 * 1000)}|${Math.round(t0 * 1000)}[v${i}]`);
  });
  const mix = voices.map((_, i) => `[v${i}]`).join("");
  const filter = voices.length ? `${parts.join(";")};${mix}amix=inputs=${voices.length}:normalize=0[a]` : "";
  return [
    "#!/bin/sh",
    `# Frames at ${tl.fps} fps, ${tl.duration} s. The voice is laid in at the timeline's moments; the water bed and the`,
    "# generated tones are not part of a fast capture. Adjust the ../public path to where the game's audio files are.",
    `ffmpeg -framerate ${tl.fps} -i frames/f%06d.jpg ${inputs.join(" ")} ${filter ? `-filter_complex "${filter}" -map 0:v -map "[a]"` : ""} -c:v libx264 -pix_fmt yuv420p -crf 16 -c:a aac -b:a 192k -t ${tl.duration} ${base}.mp4`,
    "",
  ].join("\n");
}

/** A zip with nothing compressed (frames are already JPEG): enough, and no library. */
async function zipStore(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = (b: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer());
    const name = enc.encode(f.name) as Uint8Array<ArrayBuffer>;
    const c = crc(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(14, c, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(local.buffer, name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint32(16, c, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}
