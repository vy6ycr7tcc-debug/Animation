/* Narration: the package's recorded tracks (content/narration.json), played on the voice
   bus with subtitles. Starting a track fades out any track already playing; leaving
   fades gently, never cuts. The bed ducks while a voice speaks. */
import catalogue from "../../content/narration.json";
import { loadBytes } from "./assets";
import type { AudioEngine } from "./audio";

export interface Cue {
  t: number;
  text: string;
}
/** A scene cue: a named moment in a track's timeline (the temple tour's 26 stations). */
export interface SceneCue {
  t: number;
  label: string;
}
export interface Track {
  id: string;
  title: string;
  voice: "female" | "male";
  file: string;
  duration: number;
  trigger: string;
  cues: Cue[];
  scenes?: SceneCue[];
}

export const TRACKS: Record<string, Track> = Object.fromEntries(
  (catalogue.tracks as Track[]).map((t) => [t.id, t]),
);

/**
 * Samuel prefers the female voice. Tracks recorded in the male voice play from their re-voiced
 * copy in audio/female/ (made with narration/revoice-female.sh); until that copy exists, they
 * are shown as subtitles only.
 */
export const FEMALE_ONLY = true;
function fileFor(t: Track): string {
  return FEMALE_ONLY && t.voice === "male" ? t.file.replace("audio/", "audio/female/") : t.file;
}

export class Narration {
  subtitlesOn = false;
  current: string | null = null;
  onEnd: ((id: string) => void) | null = null;
  private raw = new Map<string, Promise<ArrayBuffer | null>>();
  private decoded = new Map<string, Promise<AudioBuffer | null>>();
  private playing: { id: string; src: AudioBufferSourceNode; gain: GainNode; start: number; scale: number; from: number } | null = null;
  private cueIndex = -1;
  /** Bumped by every play and stop: a track still loading when another is asked for never starts. */
  private token = 0;

  constructor(
    private audio: AudioEngine,
    private sub: HTMLElement,
  ) {}

  /** Start downloading tracks ahead of need (they are small). */
  preload(ids: string[]): void {
    for (const id of ids) {
      if (this.raw.has(id) || !TRACKS[id]) continue;
      this.raw.set(id, loadBytes(fileFor(TRACKS[id])));
    }
  }

  private buffer(id: string): Promise<AudioBuffer | null> {
    const ctx = this.audio.ctx;
    if (!ctx) return Promise.resolve(null);
    let p = this.decoded.get(id);
    // decoded audio is large (about 10 MB a minute): keep only the few most recent, or Safari
    // may run out of memory and reload the page
    if (p) {
      this.decoded.delete(id);
      this.decoded.set(id, p);
    }
    while (this.decoded.size > 4) this.decoded.delete(this.decoded.keys().next().value!);
    if (!p) {
      this.preload([id]);
      p = this.raw.get(id)!.then(async (data) => {
        if (!data) return null;
        try {
          return await ctx.decodeAudioData(data.slice(0));
        } catch {
          return null;
        }
      });
      this.decoded.set(id, p);
    }
    return p;
  }

  /** Whether a track has playable audio (female-voice copies may not exist yet). */
  async available(id: string): Promise<boolean> {
    return (await this.buffer(id)) !== null;
  }

  /** Debug still-frame hook (?shot): when set, time() reads this instead of the audio clock. */
  debugTime: number | null = null;

  /** Seconds into the current track, on the audio clock (0 when nothing plays). */
  time(): number {
    if (this.debugTime !== null) return this.debugTime;
    const p = this.playing;
    const ctx = this.audio.ctx;
    if (!p || !ctx) return 0;
    return p.from + Math.max(0, (ctx.currentTime - p.start) / p.scale);
  }

  /** Play a track, or only its part from `from` to `to` seconds (track time), fading at the end. */
  async play(id: string, from = 0, to = Infinity): Promise<void> {
    const track = TRACKS[id];
    if (!track) return;
    // Debug still-frame hook: no audio at all — the scene still sees the track as current.
    if (this.debugTime !== null) {
      this.current = id;
      return;
    }
    // one voice at a time: the one speaking steps aside quickly, and the new one waits for it
    const handoff = this.playing ? 0.5 : 0;
    this.stop(0.5);
    const token = this.token;
    this.current = id;
    const buf = await this.buffer(id);
    const ctx = this.audio.ctx;
    if (token !== this.token || this.current !== id || !ctx) return;
    if (!buf) {
      // No audio: the words still arrive, as subtitles paced like speech.
      this.fakePlay(track);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // A re-voiced recording has its own pace: stretch the cue times to fit it.
    const scale = buf.duration / (track.duration || buf.duration);
    const gain = ctx.createGain();
    const at = ctx.currentTime + handoff;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + 0.4);
    src.connect(gain).connect(this.audio.voice);
    const off = Math.max(0, Math.min(buf.duration - 0.05, from * scale));
    const dur = Number.isFinite(to) ? Math.max(0.5, (to - from) * scale) : undefined;
    if (dur !== undefined) {
      gain.gain.setValueAtTime(1, at + Math.max(0.4, dur - 0.5));
      gain.gain.linearRampToValueAtTime(0, at + dur);
      src.start(at, off, dur);
    } else src.start(at, off);
    this.playing = { id, src, gain, start: at, scale, from: off / scale };
    this.cueIndex = -1;
    this.audio.duck(true);
    src.onended = () => {
      if (this.playing?.src !== src) return;
      this.playing = null;
      this.finish(id);
    };
  }

  /** Fade the current track out (e.g. the wanderer walked away). */
  stop(fadeSecs = 2): void {
    const p = this.playing;
    const ctx = this.audio.ctx;
    this.playing = null;
    this.token++;
    if (p && ctx) {
      const t = ctx.currentTime;
      p.gain.gain.cancelScheduledValues(t);
      p.gain.gain.setValueAtTime(p.gain.gain.value, t);
      p.gain.gain.linearRampToValueAtTime(0, t + fadeSecs);
      p.src.stop(t + fadeSecs + 0.05);
    }
    if (this.current) {
      this.current = null;
      if (this.debugTime === null) this.audio.duck(false);
      this.hideSub();
    }
    window.clearTimeout(this.fakeTimer);
  }

  private finish(id: string): void {
    if (this.current !== id) return;
    this.current = null;
    this.audio.duck(false);
    window.setTimeout(() => this.current === null && this.hideSub(), 1500);
    this.onEnd?.(id);
  }

  private fakeTimer = 0;
  private fakePlay(track: Track): void {
    let i = 0;
    const next = () => {
      if (this.current !== track.id) return;
      if (i >= track.cues.length) return this.finish(track.id);
      this.showSub(track.cues[i].text);
      const nextT = i + 1 < track.cues.length ? track.cues[i + 1].t : track.duration;
      const wait = (nextT - track.cues[i].t) * 1000;
      i++;
      this.fakeTimer = window.setTimeout(next, wait);
    };
    next();
  }

  /** Call every frame: advances subtitles in step with the audio clock. */
  update(): void {
    const p = this.playing;
    const ctx = this.audio.ctx;
    if (!p || !ctx) return;
    const t = p.from + (ctx.currentTime - p.start) / p.scale;
    const cues = TRACKS[p.id].cues;
    let k = -1;
    for (let i = 0; i < cues.length; i++) if (cues[i].t <= t + 0.05) k = i;
    if (k !== this.cueIndex && k >= 0) {
      this.cueIndex = k;
      this.showSub(cues[k].text);
    }
  }

  private showSub(text: string): void {
    if (!this.subtitlesOn) return;
    this.sub.textContent = text;
    this.sub.classList.add("on");
  }
  hideSub(): void {
    this.sub.classList.remove("on");
  }
}
