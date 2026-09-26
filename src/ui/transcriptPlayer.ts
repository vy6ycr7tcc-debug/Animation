/* The player for the archive's narrations (planets, stars, crystals and grove fruits).
   - It starts only when the player taps a vessel; nothing here begins by itself.
   - Streamed, never decoded whole: a media element plays each recording as it downloads, so a
     long narration starts at once and costs little memory. Being media (not Web Audio), it goes
     on playing when the phone locks or the game is hidden (Samuel: "walk away and listen to it
     even if the screen locks and auto load next one"), and the lock screen shows it with
     play/pause, back 15 s and next (Media Session).
   - When one ends, the next follows by itself (`next`, chosen by the game), until closed.
   - A small card, never a modal, in the top right: the title, the source caption, pause/resume,
     back 15 s, next, a "source" link to the full record, fold and close. Folded (by its ‹, or by
     itself after a few seconds), it becomes a half-moon hanging from the top edge beside ⋮
     (Samuel: "a semi circle… with play pause in the middle", "top right corner"): back 15 s,
     play/pause in the middle, next, the card again below, its curve filling with the progress.
     Movement is never locked.
   - Attribution: interpretive narrations say "An interpretive narration after {entity} ·
     {date}"; direct quotations say "Quoting {entity} · {session} · {date}"; each source on its
     own line. */
import type { AudioEngine } from "../core/audio";
import { assetUrl } from "../core/assets";
import type { Narration } from "../world/sites";

const ARC = 232.5; // the half-moon's curve, in its own units

export class TranscriptPlayer {
  current: Narration | null = null;
  /** The player is showing (playing or paused). */
  get active(): boolean {
    return this.current !== null;
  }
  get playing(): boolean {
    return this.current !== null && !this.media.paused;
  }
  onChange: ((id: string | null) => void) | null = null;
  /** The narration to follow `n` when it ends (or when "next" is asked for); null stops. */
  next: ((n: Narration) => Narration | null) | null = null;
  /** What the half-moon's play begins when nothing is playing. */
  first: (() => Narration | null) | null = null;
  /** The half-moon stays in view while you play (Samuel: "I don't see the player"). */
  private resting = false;
  subtitlesOn = false;

  private media = new Audio();
  private el = document.getElementById("tp") as HTMLDivElement;
  private titleEl = document.getElementById("tp-title") as HTMLParagraphElement;
  private captionEl = document.getElementById("tp-caption") as HTMLDivElement;
  private pauseBtn = document.getElementById("tp-pause") as HTMLButtonElement;
  private sourceDlg = document.getElementById("tp-source") as HTMLDivElement;
  private sub = document.getElementById("sub") as HTMLElement;
  private mini = document.getElementById("tp-mini") as HTMLDivElement;
  private miniPlay = document.getElementById("tp-mini-play") as HTMLButtonElement;
  private arc = document.getElementById("tp-arc") as unknown as SVGPathElement;
  private foldTimer = 0;
  private nextTimer = 0;
  private cues: { t: number; text: string }[] = [];
  private cueIndex = -1;

  constructor(private audio: AudioEngine) {
    this.media.preload = "none";
    this.media.addEventListener("play", () => this.showPlaying(true));
    this.media.addEventListener("pause", () => this.showPlaying(false));
    this.media.addEventListener("ended", () => this.ended());
    this.media.addEventListener("loadedmetadata", () => this.timeCues());
    this.media.addEventListener("error", () => {
      if (this.current && this.media.error) this.titleEl.textContent = `${this.current.title} (the recording can't be played)`;
    });
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
    const toggle = () => (this.playing ? this.pause() : this.current ? this.resume() : this.startFirst());
    tap("tp-pause", toggle);
    tap("tp-back", () => this.back(15));
    tap("tp-next", () => this.skip());
    tap("tp-fold", () => this.fold());
    tap("tp-mini-play", toggle);
    tap("tp-mini-back", () => this.back(15));
    tap("tp-mini-next", () => this.skip());
    tap("tp-mini-open", () => this.unfold());
    document.getElementById("tp-close")!.addEventListener("click", () => this.close());
    document.getElementById("tp-src")!.addEventListener("click", () => this.showSource(true));
    document.getElementById("tp-source-close")!.addEventListener("click", () => this.showSource(false));
    // the lock screen and the headphones
    const ms = navigator.mediaSession;
    if (ms) {
      const on = (a: MediaSessionAction, fn: MediaSessionActionHandler) => {
        try {
          ms.setActionHandler(a, fn);
        } catch {
          /* not offered here */
        }
      };
      on("play", () => this.resume());
      on("pause", () => this.pause());
      on("seekbackward", (d) => this.back(d.seekOffset ?? 15));
      on("seekforward", (d) => this.forward(d.seekOffset ?? 15));
      on("nexttrack", () => this.skip());
      on("stop", () => this.close());
    }
  }

  /** The source caption lines for a narration. */
  static caption(n: Narration): string[] {
    return n.sources.map((s) => (n.interpretive ? `An interpretive narration after ${s.entity} · ${s.date}` : `Quoting ${s.entity} · ${s.session_label} · ${s.date}`));
  }

  /** Begin a narration. Call inside the tap (a phone lets media start only from a gesture; the
      same element then carries on from one narration to the next by itself). */
  play(n: Narration): void {
    window.clearTimeout(this.nextTimer);
    this.current = n;
    this.render(n);
    this.cues = [];
    this.cueIndex = -1;
    this.sub.classList.remove("on");
    this.media.preload = "auto";
    this.media.src = assetUrl(n.audio);
    this.media.volume = Math.min(1, this.audio.volume / 0.8);
    void this.media.play().catch(() => this.showPlaying(false));
    this.audio.duck(true);
    const ms = navigator.mediaSession;
    if (ms && "MediaMetadata" in window) {
      ms.metadata = new MediaMetadata({ title: n.title, artist: n.sources.map((s) => s.entity).filter((e, i, a) => a.indexOf(e) === i).join(", "), album: "Inward Journey" });
    }
    this.onChange?.(n.id);
  }

  pause(): void {
    this.media.pause();
  }

  resume(): void {
    if (this.current) void this.media.play().catch(() => this.showPlaying(false));
  }

  /** Go back a little (to hear a passage again), playing or paused. */
  back(seconds: number): void {
    if (this.current) this.media.currentTime = Math.max(0, this.media.currentTime - seconds);
  }

  forward(seconds: number): void {
    if (this.current && isFinite(this.media.duration)) this.media.currentTime = Math.min(this.media.duration - 0.5, this.media.currentTime + seconds);
  }

  /** On to the next narration now. */
  skip(): void {
    if (!this.current) return this.startFirst();
    const n = this.next?.(this.current);
    if (n) this.play(n);
  }

  private startFirst(): void {
    const n = this.first?.();
    if (n) this.play(n);
  }

  /** While you play, the half-moon stays in view even with nothing playing; its play button then
      begins the next narration not yet heard. */
  setResting(on: boolean): void {
    this.resting = on;
    if (!this.current) {
      this.mini.hidden = !on;
      this.mini.classList.toggle("idle", on);
      this.showPlaying(false);
      this.arc.style.strokeDashoffset = String(ARC);
    }
  }

  close(): void {
    window.clearTimeout(this.nextTimer);
    window.clearTimeout(this.foldTimer);
    this.media.pause();
    this.media.removeAttribute("src");
    this.media.load();
    this.current = null;
    this.el.hidden = true;
    this.mini.hidden = true;
    this.sub.classList.remove("on");
    this.setResting(this.resting);
    this.audio.duck(false);
    this.showSource(false);
    if (navigator.mediaSession) navigator.mediaSession.metadata = null;
    this.onChange?.(null);
  }

  /** Put the player away (the same as closing). */
  dismiss(): void {
    this.close();
  }

  private ended(): void {
    const n = this.current && this.next?.(this.current);
    this.sub.classList.remove("on");
    if (!n) return this.close();
    // hidden (the phone locked), at once: timers sleep there, and the next must follow the last
    // straight away to be allowed to play; on screen, a breath of quiet between them
    if (document.hidden) this.play(n);
    else this.nextTimer = window.setTimeout(() => this.current && this.play(n), 2500);
  }

  private showPlaying(on: boolean): void {
    this.pauseBtn.textContent = on ? "Pause" : "Resume";
    this.pauseBtn.setAttribute("aria-label", on ? "Pause the narration" : "Resume the narration");
    this.miniPlay.classList.toggle("paused", !on);
    this.miniPlay.setAttribute("aria-label", on ? "Pause the narration" : "Resume the narration");
    if (navigator.mediaSession) navigator.mediaSession.playbackState = on ? "playing" : "paused";
    if (this.current) this.audio.duck(on);
  }

  /** Fold the card away into the half-moon. */
  fold(): void {
    window.clearTimeout(this.foldTimer);
    if (!this.current) return;
    this.el.hidden = true;
    this.mini.hidden = false;
  }

  unfold(): void {
    window.clearTimeout(this.foldTimer);
    if (!this.current) return;
    this.mini.classList.remove("idle");
    this.el.hidden = false;
    this.mini.hidden = true;
    // the card folds itself away after a moment, so the view stays open
    this.foldTimer = window.setTimeout(() => this.fold(), 10000);
  }

  private render(n: Narration): void {
    // a narration that follows another keeps the player as it was (folded or open), and one
    // begun from the resting half-moon stays folded
    const folded = !this.mini.hidden;
    this.mini.classList.remove("idle");
    if (folded) this.el.hidden = true;
    else this.unfold();
    this.showPlaying(true);
    this.arc.style.strokeDashoffset = String(ARC);
    this.titleEl.textContent = n.title;
    this.captionEl.replaceChildren(
      ...TranscriptPlayer.caption(n).map((l) => {
        const p = document.createElement("p");
        p.textContent = l;
        return p;
      }),
    );
  }

  /** Subtitles, one sentence at a time, spread over the recording by length. */
  private timeCues(): void {
    const n = this.current, dur = this.media.duration;
    if (!n || !isFinite(dur)) return;
    const parts = n.transcript.split(/(?<=[.!?…])\s+/).filter(Boolean);
    const total = parts.reduce((a, p) => a + p.length, 0) || 1;
    let t = 0;
    this.cues = parts.map((p) => {
      const c = { t, text: p };
      t += (p.length / total) * dur;
      return c;
    });
    this.cueIndex = -1;
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

  /** Each frame: subtitles in step with the voice, the half-moon's progress, the lock screen's. */
  update(): void {
    if (!this.current) return;
    const t = this.media.currentTime, dur = this.media.duration;
    if (isFinite(dur) && dur > 0) {
      if (!this.mini.hidden) this.arc.style.strokeDashoffset = String(ARC * (1 - Math.min(1, t / dur)));
      try {
        navigator.mediaSession?.setPositionState?.({ duration: dur, position: Math.min(t, dur), playbackRate: 1 });
      } catch {
        /* not offered */
      }
    }
    this.media.volume = Math.min(1, this.audio.volume / 0.8);
    if (!this.playing || !this.subtitlesOn) return;
    let k = -1;
    for (let i = 0; i < this.cues.length; i++) if (this.cues[i].t <= t + 0.05) k = i;
    if (k !== this.cueIndex && k >= 0) {
      this.cueIndex = k;
      this.sub.textContent = this.cues[k].text;
      this.sub.classList.add("on");
    }
  }
}
