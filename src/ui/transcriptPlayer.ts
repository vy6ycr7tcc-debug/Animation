/* The player for the archive's narrations (planets, stars, crystals and grove fruits).
   - It starts only when the player taps a vessel; nothing here begins by itself.
   - Streamed, never decoded whole: a media element plays each recording as it downloads, so a
     long narration starts at once and costs little memory. Being media (not Web Audio), it goes
     on playing when the phone locks or the game is hidden (Samuel: "walk away and listen to it
     even if the screen locks and auto load next one"), and the lock screen shows it with
     play/pause, back 15 s and next (Media Session).
   - When one ends, the next follows by itself (`next`, chosen by the game), until closed.
   - A small card, never a modal, in the top right, easy to follow at a glance (the owner: "more
     interactive and easy to follow"): the title, where it comes from (the poetic rotation, never
     a name), a line filling as it plays with the time heard and the time left, pause/resume, back
     15 s, next, "Show me where it lives" (the light leads you to its planet, star, tree or crystal:
     `onWhere`), what comes next, "Only nature", fold and close. No transcript, no subtitles, no
     source record: nothing of the archive's own record reaches the screen. Folded (by its –, or
     by itself after a few seconds), it becomes a half-moon hanging from the top edge beside ⋮:
     back 15 s, play/pause in the middle, next, the card again below, its curve filling with the
     progress. Movement is never locked. */
import type { AudioEngine } from "../core/audio";
import { assetUrl } from "../core/assets";
import type { Narration } from "../world/sites";

const ARC = 232.5; // the half-moon's curve, in its own units

/** How the player hears where a narration comes from (the poetic rotation; never a name). */
const ATTRIBUTIONS = ["cosmic wisdom", "the teachers", "the guides", "higher guidance", "those who have come before us in this time vortex"];

export class TranscriptPlayer {
  current: Narration | null = null;
  /** The player is showing (playing or paused). */
  get active(): boolean {
    return this.current !== null;
  }
  get playing(): boolean {
    return this.current !== null && !this.media.paused;
  }
  /** Seconds into the recording playing (or paused). */
  get time(): number {
    return this.media.currentTime || 0;
  }
  onChange: ((id: string | null) => void) | null = null;
  /** The narration to follow `n` when it ends (or when "next" is asked for); null stops. */
  next: ((n: Narration) => Narration | null) | null = null;
  /** "Show me where it lives": lead the wanderer to the narration's vessel (main.ts). */
  onWhere: ((n: Narration) => void) | null = null;
  /** "Only nature": every voice rests (the game's own too), and only the world is heard. */
  onQuiet: ((on: boolean) => void) | null = null;
  private quiet = false;
  /** What the half-moon's play begins when nothing is playing. */
  first: (() => Narration | null) | null = null;
  /** The half-moon stays in view while you play (Samuel: "I don't see the player"). */
  private resting = false;
  subtitlesOn = false;

  private media = new Audio();
  /** A recording asked for and still arriving. */
  buffering = false;
  private el = document.getElementById("tp") as HTMLDivElement;
  private titleEl = document.getElementById("tp-title") as HTMLParagraphElement;
  private fromEl = document.getElementById("tp-from") as HTMLParagraphElement;
  private lineEl = document.querySelector("#tp-line i") as HTMLElement;
  private timeEl = document.getElementById("tp-time") as HTMLParagraphElement;
  private upEl = document.getElementById("tp-upnext") as HTMLParagraphElement;
  private pauseBtn = document.getElementById("tp-pause") as HTMLButtonElement;
  private mini = document.getElementById("tp-mini") as HTMLDivElement;
  private miniPlay = document.getElementById("tp-mini-play") as HTMLButtonElement;
  private arc = document.getElementById("tp-arc") as unknown as SVGPathElement;
  private foldTimer = 0;
  private nextTimer = 0;

  constructor(private audio: AudioEngine) {
    this.media.preload = "none";
    this.media.addEventListener("play", () => this.showPlaying(true));
    this.media.addEventListener("pause", () => this.showPlaying(false));
    this.media.addEventListener("ended", () => this.ended());
    // waiting on the network (for the loading mark)
    this.media.addEventListener("waiting", () => (this.buffering = true));
    for (const ev of ["playing", "pause", "canplay", "error", "ended"]) this.media.addEventListener(ev, () => (this.buffering = false));
    this.media.addEventListener("error", () => {
      if (this.current && this.media.error) this.titleEl.textContent = `${this.current.title} (the recording can't be played)`;
    });
    // on the touch itself, so they answer while the other thumb walks (a second finger's tap
    // makes no click on a phone); the click stays for the keyboard
    // (a touch's own click is ignored, or a tap would act twice)
    let downAt = -1e9;
    const tap = (id: string, fn: () => void) => {
      const el = document.getElementById(id)!;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        downAt = performance.now();
        fn();
      });
      el.addEventListener("click", (e) => e.detail === 0 && performance.now() - downAt > 700 && fn());
    };
    // with no archive narration of its own, the half-moon pauses whatever else is speaking or
    // leading (a room's voice, a lesson, a tour): its guest
    const toggle = () => (this.current ? (this.playing ? this.pause() : this.resume()) : this.guest?.active() ? this.guest.toggle() : this.startFirst());
    tap("tp-pause", toggle);
    tap("tp-back", () => this.back(15));
    tap("tp-next", () => this.skip());
    tap("tp-fold", () => this.fold());
    tap("tp-where", () => {
      if (!this.current) return;
      this.onWhere?.(this.current);
      this.fold();
    });
    tap("tp-quiet", () => {
      this.setQuiet(!this.quiet);
      if (this.quiet && this.current) this.close();
      this.onQuiet?.(this.quiet);
    });
    tap("tp-mini-play", toggle);
    tap("tp-mini-back", () => this.back(15));
    tap("tp-mini-next", () => this.skip());
    tap("tp-mini-open", () => this.unfold());
    document.getElementById("tp-close")!.addEventListener("click", () => this.close());
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

  /** Who a narration comes from, as the player hears of it: never an entity's name, a session, a
      date or an archive (the project's narration rule), only the poetic rotation, varied from one
      narration to the next (fixed for each, so it reads the same wherever it shows). */
  static attribution(n: Narration): string {
    let h = 0;
    for (const c of n.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return ATTRIBUTIONS[h % ATTRIBUTIONS.length];
  }
  /** The caption lines for a narration. */
  static caption(n: Narration): string[] {
    const who = TranscriptPlayer.attribution(n);
    return [n.interpretive ? `An interpretive narration after ${who}` : `In the words of ${who}`];
  }

  /** Begin a narration. Call inside the tap (a phone lets media start only from a gesture; the
      same element then carries on from one narration to the next by itself). */
  play(n: Narration): void {
    window.clearTimeout(this.nextTimer);
    this.current = n;
    this.render(n);
    this.media.preload = "auto";
    this.media.src = assetUrl(n.audio);
    this.media.volume = Math.min(1, this.audio.volume / 0.8);
    void this.media.play().catch(() => this.showPlaying(false));
    this.audio.duck(true);
    const ms = navigator.mediaSession;
    if (ms && "MediaMetadata" in window) {
      ms.metadata = new MediaMetadata({ title: n.title, artist: "Inward Journey", album: "Inward Journey" });
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
    else if (this.guest?.active()) this.guest.back?.();
  }

  forward(seconds: number): void {
    if (this.current && isFinite(this.media.duration)) this.media.currentTime = Math.min(this.media.duration - 0.5, this.media.currentTime + seconds);
  }

  /** Show whether only nature is heard (the button reads what it will do). */
  setQuiet(on: boolean): void {
    this.quiet = on;
    const b = document.getElementById("tp-quiet")!;
    b.textContent = on ? "Voices again" : "Only nature";
    b.setAttribute("aria-pressed", String(on));
  }

  /** Another voice the half-moon can pause and resume when the archive is quiet (main.ts). */
  guest: { active(): boolean; paused(): boolean; toggle(): void; progress(): number; back?(): void } | null = null;
  private guestOn = false;

  /** On to the next narration now. */
  skip(): void {
    if (!this.current && this.guest?.active()) return; // a room's voice or a tour: no skipping from here
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
    this.setResting(this.resting);
    this.audio.duck(false);
    if (navigator.mediaSession) navigator.mediaSession.metadata = null;
    this.onChange?.(null);
  }

  /** Put the player away (the same as closing). */
  dismiss(): void {
    this.close();
  }

  private ended(): void {
    const n = this.current && this.next?.(this.current);
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

  private foldIdle(): void {
    window.clearTimeout(this.foldTimer);
    this.el.hidden = true;
    this.setResting(this.resting);
  }

  /** Fold the card away into the half-moon. */
  fold(): void {
    window.clearTimeout(this.foldTimer);
    if (!this.current) return this.foldIdle();
    this.el.hidden = true;
    this.mini.hidden = false;
  }

  unfold(): void {
    window.clearTimeout(this.foldTimer);
    if (!this.current) {
      // nothing playing: the card offers to begin, or to keep only nature's sounds
      this.titleEl.textContent = "Voices of the planets and trees";
      this.fromEl.textContent = "Tap a planet, a star, a tree's fruit or a crystal, or play the next one not yet heard.";
      this.timeEl.textContent = "";
      this.lineEl.style.transform = "scaleX(0)";
      const n = this.first?.();
      this.upEl.textContent = n ? `Next to hear: ${n.title}` : "";
      this.pauseBtn.textContent = "Play";
      for (const id of ["tp-back", "tp-next", "tp-where", "tp-line"]) document.getElementById(id)!.hidden = true;
      this.el.hidden = false;
      this.mini.hidden = true;
      this.foldTimer = window.setTimeout(() => this.foldIdle(), 10000);
      return;
    }
    for (const id of ["tp-back", "tp-next", "tp-where", "tp-line"]) document.getElementById(id)!.hidden = false;
    this.mini.classList.remove("idle");
    this.el.hidden = false;
    this.mini.hidden = true;
    // the card folds itself away after a moment, so the view stays open
    this.foldTimer = window.setTimeout(() => this.fold(), 14000);
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
    this.fromEl.textContent = TranscriptPlayer.caption(n)[0];
    this.timeEl.textContent = "";
    this.lineEl.style.transform = "scaleX(0)";
    const up = this.next?.(n);
    this.upEl.textContent = up ? `Up next: ${up.title}` : "";
  }

  private posAt = -1e9;
  /** Each frame: the half-moon follows its guest while the archive is quiet. */
  guestFrame(): void {
    if (this.current) return;
    const on = !!this.guest?.active();
    if (on !== this.guestOn) {
      this.guestOn = on;
      this.mini.classList.toggle("guest", on);
      if (on) {
        this.mini.hidden = false;
        this.mini.classList.remove("idle");
      } else this.setResting(this.resting);
    }
    if (!on || !this.guest) return;
    const paused = this.guest.paused();
    this.miniPlay.classList.toggle("paused", paused);
    this.miniPlay.setAttribute("aria-label", paused ? "Resume" : "Pause");
    this.arc.style.strokeDashoffset = String(ARC * (1 - Math.min(1, Math.max(0, this.guest.progress()))));
  }
  /** Each frame: subtitles in step with the voice, the half-moon's progress, the lock screen's. */
  update(): void {
    if (!this.current) return;
    const t = this.media.currentTime, dur = this.media.duration;
    if (isFinite(dur) && dur > 0) {
      if (!this.mini.hidden) this.arc.style.strokeDashoffset = String(ARC * (1 - Math.min(1, t / dur)));
      // the lock screen's position, about once a second (it runs on its own between)
      const now = performance.now();
      if (now - this.posAt > 1000) {
        this.posAt = now;
        try {
          navigator.mediaSession?.setPositionState?.({ duration: dur, position: Math.min(t, dur), playbackRate: 1 });
        } catch {
          /* not offered */
        }
      }
    }
    this.media.volume = Math.min(1, this.audio.volume / 0.8);
    // the card: a line filling as it plays, the time heard and the time left (a few times a second)
    if (!this.el.hidden && isFinite(dur) && dur > 0 && performance.now() - this.timeAt > 250) {
      this.timeAt = performance.now();
      this.lineEl.style.transform = `scaleX(${Math.min(1, t / dur).toFixed(4)})`;
      const mmss = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
      this.timeEl.textContent = `${mmss(t)} · ${mmss(Math.max(0, dur - t))} left`;
    }
  }
  private timeAt = 0;
}
