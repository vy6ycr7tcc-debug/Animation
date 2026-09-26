/* The quiet player for the archive's narrations (orbs and grove fruits).
   - It starts only when the player taps a vessel; nothing here ever autoplays.
   - A small card, never a modal: the title, the source caption, pause/resume, back 15 s, a
     "source" link to the full record, fold and close. Movement is never locked.
   - Folded (by its ‹, or by itself after a few seconds), it becomes a half-moon on the left
     edge (Samuel: "a semi circle top left with play pause in the middle"): play/pause in the
     middle, back 15 s above, the card again below, and its curve filling with the progress.
   - Tapping another vessel switches to it. When a narration ends, two quiet choices:
     continue with the background narration (the journey's own voices), or just the music.
   - Attribution: interpretive narrations say "An interpretive narration after {entity} ·
     {date}"; direct quotations say "Quoting {entity} · {session} · {date}"; each source on its
     own line. */
import type { AudioEngine } from "../core/audio";
import { loadBytes } from "../core/assets";
import type { Narration } from "../world/sites";

export class TranscriptPlayer {
  current: Narration | null = null;
  /** The player is showing (playing, paused, or offering the choices at the end). */
  get active(): boolean {
    return this.current !== null || !this.ended.hidden;
  }
  get playing(): boolean {
    return this.src !== null;
  }
  onChoose: ((backgroundNarration: boolean) => void) | null = null;
  onChange: ((id: string | null) => void) | null = null;
  /** Nobody answered the end's question for a while. */
  onEndIdle: (() => void) | null = null;
  private idleTimer = 0;
  subtitlesOn = true;

  private el = document.getElementById("tp") as HTMLDivElement;
  private titleEl = document.getElementById("tp-title") as HTMLParagraphElement;
  private captionEl = document.getElementById("tp-caption") as HTMLDivElement;
  private pauseBtn = document.getElementById("tp-pause") as HTMLButtonElement;
  private ended = document.getElementById("tp-end") as HTMLDivElement;
  private sourceDlg = document.getElementById("tp-source") as HTMLDivElement;
  private sub = document.getElementById("sub") as HTMLElement;
  private mini = document.getElementById("tp-mini") as HTMLDivElement;
  private miniPlay = document.getElementById("tp-mini-play") as HTMLButtonElement;
  private arc = document.getElementById("tp-arc") as unknown as SVGPathElement;
  private foldTimer = 0;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private buffer: AudioBuffer | null = null;
  private token = 0;
  private cues: { t: number; text: string }[] = [];
  private cueIndex = -1;

  constructor(private audio: AudioEngine) {
    // on the touch itself, so they answer while the other thumb walks (a second finger's tap
    // makes no click on a phone); the click stays for the keyboard
    const tap = (id: string, fn: () => void) => {
      const el = document.getElementById(id)!;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        fn();
      });
      el.addEventListener("click", (e) => e.detail === 0 && fn());
    };
    const toggle = () => (this.playing ? this.pause() : this.resume());
    this.pauseBtn.addEventListener("click", toggle);
    tap("tp-mini-play", toggle);
    tap("tp-mini-back", () => this.back(15));
    tap("tp-mini-open", () => this.unfold());
    tap("tp-fold", () => this.fold());
    document.getElementById("tp-back")!.addEventListener("click", () => this.back(15));
    document.getElementById("tp-close")!.addEventListener("click", () => this.close());
    document.getElementById("tp-src")!.addEventListener("click", () => this.showSource(true));
    document.getElementById("tp-source-close")!.addEventListener("click", () => this.showSource(false));
    document.getElementById("tp-more")!.addEventListener("click", () => this.choose(true));
    document.getElementById("tp-music")!.addEventListener("click", () => this.choose(false));
  }

  /** The source caption lines for a narration. */
  static caption(n: Narration): string[] {
    return n.sources.map((s) => (n.interpretive ? `An interpretive narration after ${s.entity} · ${s.date}` : `Quoting ${s.entity} · ${s.session_label} · ${s.date}`));
  }

  private load(n: Narration): Promise<AudioBuffer | null> {
    let p = this.buffers.get(n.audio);
    const ctx = this.audio.ctx;
    // a long narration decodes to a hundred megabytes: keep only the one playing and the last
    for (const k of [...this.buffers.keys()]) if (k !== n.audio && this.buffers.size > 1) this.buffers.delete(k);
    if (!p && ctx) {
      p = loadBytes(n.audio).then(async (b) => {
        if (!b) return null;
        try {
          return await ctx.decodeAudioData(b.slice(0));
        } catch {
          return null;
        }
      });
      this.buffers.set(n.audio, p);
    }
    return p ?? Promise.resolve(null);
  }

  async play(n: Narration): Promise<void> {
    const token = ++this.token;
    this.stopSource(0.8);
    this.current = n;
    this.offset = 0;
    this.buffer = null;
    this.ended.hidden = true;
    this.render(n);
    this.onChange?.(n.id);
    const buf = await this.load(n);
    if (token !== this.token) return;
    this.buffer = buf;
    if (!buf) {
      this.titleEl.textContent = `${n.title} (the recording is missing)`;
      return;
    }
    // subtitles, one sentence at a time, spread over the recording by length
    const parts = n.transcript.split(/(?<=[.!?…])\s+/).filter(Boolean);
    const total = parts.reduce((a, p) => a + p.length, 0) || 1;
    let t = 0;
    this.cues = parts.map((p) => {
      const c = { t, text: p };
      t += (p.length / total) * buf.duration;
      return c;
    });
    this.start();
  }

  private start(): void {
    const ctx = this.audio.ctx, buf = this.buffer;
    if (!ctx || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.5);
    src.connect(gain).connect(this.audio.voice);
    src.start(0, this.offset);
    this.src = src;
    this.gain = gain;
    this.startedAt = ctx.currentTime - this.offset;
    this.cueIndex = -1;
    this.audio.duck(true);
    this.showPlaying(true);
    src.onended = () => {
      if (this.src !== src) return; // paused, switched or closed
      this.src = null;
      this.finish();
    };
  }

  private stopSource(fade = 0.4): void {
    const ctx = this.audio.ctx, src = this.src, gain = this.gain;
    this.src = null;
    if (ctx && src && gain) {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + fade);
      src.stop(t + fade + 0.05);
    }
    this.audio.duck(false);
    this.sub.classList.remove("on");
  }

  pause(): void {
    const ctx = this.audio.ctx;
    if (!this.src || !ctx) return;
    this.offset = Math.min(ctx.currentTime - this.startedAt, (this.buffer?.duration ?? 0) - 0.05);
    this.stopSource(0.25);
    this.showPlaying(false);
  }

  private showPlaying(on: boolean): void {
    this.pauseBtn.textContent = on ? "Pause" : "Resume";
    this.pauseBtn.setAttribute("aria-label", on ? "Pause the narration" : "Resume the narration");
    this.miniPlay.classList.toggle("paused", !on);
    this.miniPlay.setAttribute("aria-label", on ? "Pause the narration" : "Resume the narration");
  }

  /** Go back a little (to hear a passage again), playing or paused. */
  back(seconds: number): void {
    const ctx = this.audio.ctx;
    if (!this.buffer || !ctx) return;
    const at = this.src ? ctx.currentTime - this.startedAt : this.offset;
    this.offset = Math.max(0, at - seconds);
    if (this.src) {
      this.stopSource(0.12);
      this.start();
    }
  }

  /** Fold the card away into the half-moon on the left edge. */
  fold(): void {
    window.clearTimeout(this.foldTimer);
    if (!this.current) return;
    this.el.hidden = true;
    this.mini.hidden = false;
  }

  unfold(): void {
    window.clearTimeout(this.foldTimer);
    this.el.hidden = false;
    this.mini.hidden = true;
  }

  resume(): void {
    if (this.src || !this.buffer) return;
    this.start();
  }

  close(): void {
    this.token++;
    this.stopSource(0.8);
    this.current = null;
    window.clearTimeout(this.foldTimer);
    this.el.hidden = true;
    this.mini.hidden = true;
    this.ended.hidden = true;
    this.showSource(false);
    this.onChange?.(null);
  }

  private finish(): void {
    this.audio.duck(false);
    this.sub.classList.remove("on");
    this.current = null;
    this.onChange?.(null);
    this.pauseBtn.hidden = true;
    this.ended.hidden = false;
    this.unfold(); // the end's two choices
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => !this.ended.hidden && this.onEndIdle?.(), 15000);
  }

  /** Put the bar away without a choice. */
  dismiss(): void {
    this.close();
  }

  private choose(background: boolean): void {
    this.onChoose?.(background);
    this.close();
  }

  private render(n: Narration): void {
    this.unfold();
    // the card folds itself away after a moment, so the view stays open
    this.foldTimer = window.setTimeout(() => this.fold(), 10000);
    this.pauseBtn.hidden = false;
    this.showPlaying(true);
    this.arc.style.strokeDashoffset = "232.5";
    this.titleEl.textContent = n.title;
    this.captionEl.replaceChildren(
      ...TranscriptPlayer.caption(n).map((l) => {
        const p = document.createElement("p");
        p.textContent = l;
        return p;
      }),
    );
  }

  private showSource(on: boolean): void {
    const n = this.current;
    if (on && n) {
      (document.getElementById("tp-source-title") as HTMLElement).textContent = n.title;
      (document.getElementById("tp-source-kind") as HTMLElement).textContent = n.interpretive
        ? "An interpretive narration: an artistic adaptation, not the channeling itself."
        : "A direct quotation from the archive.";
      (document.getElementById("tp-source-text") as HTMLElement).textContent = n.transcript;
      const list = document.getElementById("tp-source-list") as HTMLElement;
      list.replaceChildren(
        ...n.sources.map((s) => {
          const li = document.createElement("li");
          li.textContent = `${s.entity} · ${s.session_label} · ${s.date}`;
          return li;
        }),
      );
    }
    this.sourceDlg.hidden = !on;
    if (on) (document.getElementById("tp-source-close") as HTMLButtonElement).focus();
  }

  /** Each frame: subtitles in step with the voice, and the half-moon's progress. */
  update(): void {
    const ctx = this.audio.ctx;
    if (ctx && this.buffer && !this.mini.hidden) {
      const at = this.src ? ctx.currentTime - this.startedAt : this.offset;
      this.arc.style.strokeDashoffset = String(232.5 * (1 - Math.min(1, at / this.buffer.duration)));
    }
    if (!this.src || !ctx || !this.subtitlesOn) return;
    const t = ctx.currentTime - this.startedAt;
    let k = -1;
    for (let i = 0; i < this.cues.length; i++) if (this.cues[i].t <= t + 0.05) k = i;
    if (k !== this.cueIndex && k >= 0) {
      this.cueIndex = k;
      this.sub.textContent = this.cues[k].text;
      this.sub.classList.add("on");
    }
  }
}
