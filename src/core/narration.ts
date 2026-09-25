/* Narration: the package's recorded tracks (content/narration.json), played on the voice
   bus with subtitles. Starting a track fades out any track already playing; leaving
   fades gently, never cuts. The bed ducks while a voice speaks. */
import catalogue from "../../content/narration.json";
import type { AudioEngine } from "./audio";

export interface Cue {
  t: number;
  text: string;
}
export interface Track {
  id: string;
  title: string;
  voice: "female" | "male";
  file: string;
  duration: number;
  trigger: string;
  cues: Cue[];
}

export const TRACKS: Record<string, Track> = Object.fromEntries(
  (catalogue.tracks as Track[]).map((t) => [t.id, t]),
);

export class Narration {
  subtitlesOn = true;
  current: string | null = null;
  onEnd: ((id: string) => void) | null = null;
  private raw = new Map<string, Promise<ArrayBuffer | null>>();
  private decoded = new Map<string, Promise<AudioBuffer | null>>();
  private playing: { id: string; src: AudioBufferSourceNode; gain: GainNode; start: number } | null = null;
  private cueIndex = -1;

  constructor(
    private audio: AudioEngine,
    private sub: HTMLElement,
  ) {}

  /** Start downloading tracks ahead of need (they are small). */
  preload(ids: string[]): void {
    for (const id of ids) {
      if (this.raw.has(id) || !TRACKS[id]) continue;
      this.raw.set(
        id,
        fetch(`./${TRACKS[id].file}`)
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .catch(() => null),
      );
    }
  }

  private buffer(id: string): Promise<AudioBuffer | null> {
    const ctx = this.audio.ctx;
    if (!ctx) return Promise.resolve(null);
    let p = this.decoded.get(id);
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

  async play(id: string): Promise<void> {
    const track = TRACKS[id];
    if (!track) return;
    this.stop(1.5);
    this.current = id;
    const buf = await this.buffer(id);
    const ctx = this.audio.ctx;
    if (this.current !== id || !ctx) return;
    if (!buf) {
      // No audio: the words still arrive, as subtitles paced like speech.
      this.fakePlay(track);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.4);
    src.connect(gain).connect(this.audio.voice);
    src.start();
    this.playing = { id, src, gain, start: ctx.currentTime };
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
    if (p && ctx) {
      const t = ctx.currentTime;
      p.gain.gain.cancelScheduledValues(t);
      p.gain.gain.setValueAtTime(p.gain.gain.value, t);
      p.gain.gain.linearRampToValueAtTime(0, t + fadeSecs);
      p.src.stop(t + fadeSecs + 0.05);
    }
    if (this.current) {
      this.current = null;
      this.audio.duck(false);
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
    const t = ctx.currentTime - p.start;
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
