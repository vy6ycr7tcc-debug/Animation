/* The meditation (the owner's "meditation sequence"): holding a finger on a rock, a tree or a
   crystal, the wanderer goes to it and lays hands on it (world/touch.ts), and the world slowly
   closes like eyes:
   1. the screen fades to black over a few seconds, never a cut;
   2. in the dark, one cycle of slow square breaths (in 5, hold 5, out 5, rest 5; three of them):
      the lungs (ui/breathLungs.ts) breathing at the centre, slow and soft, with the breath's one
      word; no voice (the owner: "remove the narration… replace for soothing wind"): a soft wind
      rises as the eyes close and settles as they open;
   3. how much is left shows small, in a corner: a little pair of lungs filling with warm light
      from the base up (the owner: "small in a corner and with just filling a small lung");
   4. when it is full, the world fades back and the wanderer rises, unhurried;
   5. for a few breaths the world is seen quietly: a little less colour, no controls;
   6. then the controls return, and the small heart blinks twice: if something moved, write it.
   The hold only begins it: the finger may lift. The small ✕ (or the stick) leaves early: the dark
   fades out and the wanderer stands; no quiet view, no heart, no stone.
   The dark is drawn on its own animation frames (the game's frame may be capped at 30, and slower
   still while everything is covered), so the breath is smooth. */
import { LungParticles } from "../ui/breathLungs";

const FADE_IN = 3.4; // the eyes closing
const BODY_IN = 2.6;
const BODY_OUT = 2.6;
const FADE_OUT = 3.4; // the eyes opening
const QUIET = 13; // the contemplative view: a few breaths
const LEAVE = 1.8; // let go early: everything fades out together
const SIDE = 5; // seconds a side of the square
const CYCLE = SIDE * 4 * 3; // three slow breaths
const WORDS: Record<string, string> = { in: "Breathe in", hold: "Hold", out: "Release", rest: "Wait" };

export interface MeditationHooks {
  /** the wind: 1 rising, 0 settling */
  wind(k: number): void;
  /** the wanderer lets go of what it holds and rises */
  rise(): void;
  /** it ran its whole course (stone-essence, for a rock) */
  completed(): void;
  /** the heart's two soft blinks */
  invite(): void;
}

type Phase = "none" | "closing" | "inner" | "guiding" | "opening" | "quiet" | "leaving";

/** The little lungs in the corner: two lobes, in a 40 × 40 frame. */
function lobePath(g: CanvasRenderingContext2D, W: number, H: number): void {
  const x = (v: number) => (v / 40) * W, y = (v: number) => (v / 40) * H;
  g.beginPath();
  g.moveTo(x(17.5), y(13));
  g.bezierCurveTo(x(12), y(9), x(5), y(15), x(4.5), y(25));
  g.bezierCurveTo(x(4.2), y(33), x(9), y(36.5), x(14), y(35));
  g.bezierCurveTo(x(17.5), y(34), x(18.5), y(30), x(18.5), y(24));
  g.closePath();
  g.moveTo(x(22.5), y(13));
  g.bezierCurveTo(x(28), y(9), x(35), y(15), x(35.5), y(25));
  g.bezierCurveTo(x(35.8), y(33), x(31), y(36.5), x(26), y(35));
  g.bezierCurveTo(x(22.5), y(34), x(21.5), y(30), x(21.5), y(24));
  g.closePath();
}

export class Meditation {
  phase: Phase = "none";
  /** 0..1: how hushed the world's colour is (the quiet view after) */
  hush = 0;
  private t = 0;
  private el: HTMLElement;
  private dark: HTMLElement;
  private bodyWrap: HTMLElement;
  private prog: HTMLCanvasElement;
  private progCtx: CanvasRenderingContext2D | null;
  private lungs: LungParticles;
  private word: HTMLElement;
  private what: HTMLElement;
  /** the breath's own clock (seconds), on real time */
  private bt = 0;
  /** seconds into the cycle, and how far it is (0..1) */
  private gt = 0;
  private done = 0;
  private body = 0;
  private raf = 0;
  private lastNow = 0;
  private frozen = false;
  private risen = false;
  private lastDark = 0;
  private lastBody = 0;

  constructor(private hooks: MeditationHooks) {
    const el = document.createElement("div");
    el.id = "meditation";
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<div class="dark"></div><div class="inner"><canvas class="lungs"></canvas><div class="word"></div></div><canvas class="prog"></canvas><p class="what"></p><button class="leave" type="button" aria-label="Stop the meditation">✕</button>`;
    document.body.appendChild(el);
    this.el = el;
    this.dark = el.querySelector(".dark")!;
    this.bodyWrap = el.querySelector(".inner")!;
    this.prog = el.querySelector("canvas.prog")!;
    this.progCtx = this.prog.getContext("2d");
    this.lungs = new LungParticles(el.querySelector("canvas.lungs")!);
    this.lungs.pace = 0.4;
    this.word = el.querySelector(".word")!;
    this.what = el.querySelector(".what")!;
    const leave = el.querySelector(".leave") as HTMLElement;
    leave.addEventListener("pointerdown", (e) => (e.preventDefault(), e.stopPropagation(), this.release()));
    leave.addEventListener("click", (e) => (e.preventDefault(), e.detail === 0 && this.release()));
  }

  /** busy: the sequence is under way (closing, in the dark, opening, or the quiet after) */
  get active(): boolean {
    return this.phase !== "none";
  }
  /** the dark is over everything (no world needs drawing in detail) */
  get covered(): boolean {
    return this.phase === "inner" || this.phase === "guiding";
  }

  /** A hold has begun on something to lay hands on (`what`: "the stone", "the tree"…): the eyes
      begin to close. */
  begin(what = "the stone"): void {
    if (this.phase !== "none") return;
    this.phase = "closing";
    this.t = 0;
    this.bt = 0;
    this.gt = 0;
    this.done = 0;
    this.what.textContent = `Stay with ${what}, and breathe with the lungs.`;
    this.el.hidden = false;
    document.body.classList.add("meditating");
    this.hooks.wind(1);
    this.loop();
  }
  /** Leave early (the ✕, the stick, the hold let go some other way). */
  release(): void {
    if (this.phase === "closing" || this.phase === "inner" || this.phase === "guiding") {
      this.phase = "leaving";
      this.t = 0;
      this.hooks.wind(0);
      this.hooks.rise();
    }
  }
  /** Any touch during the quiet after ends it at once (the controls come back). */
  wake(): void {
    if (this.phase === "quiet") this.t = Math.max(this.t, QUIET - 1.2);
  }

  /** For a still: hold the sequence at a phase (`inner`: the lungs at their breath; `quiet`). */
  hold(phase: "inner" | "quiet", breathAt = 2.6): void {
    this.el.hidden = phase === "quiet";
    this.phase = phase === "inner" ? "guiding" : "quiet";
    this.t = phase === "inner" ? 30 : 3;
    this.bt = breathAt;
    this.done = 0.62;
    this.frozen = true;
    document.body.classList.add("meditating");
    this.paint(phase === "inner" ? 1 : 0, phase === "inner" ? 1 : 0);
    if (phase === "inner") {
      this.body = 1;
      this.drawBody();
    }
  }

  /** The sequence's own time, from the game's frame (real seconds, not capped). */
  update(dt: number): void {
    if (this.phase === "none") return;
    if (!this.frozen) this.t += dt;
    const t = this.t;
    let dark = 0, body = 0;
    switch (this.phase) {
      case "closing":
        dark = ease(t / FADE_IN);
        if (t >= FADE_IN) this.next("inner");
        break;
      case "inner":
        dark = 1;
        body = ease(t / BODY_IN);
        if (t >= BODY_IN) this.next("guiding");
        break;
      case "guiding":
        dark = 1;
        body = 1;
        if (this.frozen) break;
        this.gt += dt;
        this.done = Math.min(1, this.gt / CYCLE);
        if (this.gt >= CYCLE) {
          this.done = 1;
          this.next("opening");
          this.hooks.completed();
        }
        break;
      case "opening":
        body = 1 - ease(t / BODY_OUT);
        dark = 1 - ease((t - BODY_OUT * 0.6) / FADE_OUT);
        if (t >= BODY_OUT * 0.6 && !this.risen) {
          this.risen = true;
          this.hooks.rise();
        }
        if (t >= BODY_OUT * 0.6 + FADE_OUT) this.next("quiet");
        break;
      case "quiet":
        dark = 0;
        if (!this.frozen && t >= QUIET) {
          this.end();
          this.hooks.invite();
          return;
        }
        break;
      case "leaving":
        dark = Math.max(0, this.lastDark * (1 - ease(t / LEAVE)));
        body = Math.max(0, this.lastBody * (1 - ease(t / LEAVE)));
        if (t >= LEAVE) {
          this.end();
          return;
        }
        break;
    }
    // the quiet after: the colour hushed a little, in and out softly
    const want = this.phase === "quiet" ? (t < QUIET - 2 ? 1 : Math.max(0, (QUIET - t) / 2)) : this.phase === "opening" ? ease((t - BODY_OUT * 0.6) / FADE_OUT) : 0;
    this.hush += (want - this.hush) * Math.min(1, dt * 1.5 + (this.frozen ? 1 : 0));
    document.body.classList.toggle("contemplative", this.phase === "quiet" && t < QUIET - 1.2);
    // in the dark nothing beneath answers a touch (only the ✕): a tap would walk the wanderer off
    this.el.classList.toggle("held", this.phase === "closing" || this.phase === "inner" || this.phase === "guiding");
    if (this.phase !== "leaving") {
      this.lastDark = dark;
      this.lastBody = body;
    }
    this.body = body;
    this.paint(dark, body);
  }

  private next(p: Phase): void {
    this.phase = p;
    this.t = 0;
    if (p === "opening") {
      this.risen = false;
      this.hooks.wind(0);
    }
  }
  private end(): void {
    this.phase = "none";
    this.frozen = false;
    this.el.classList.remove("held");
    this.hush = 0;
    this.body = 0;
    this.el.hidden = true;
    this.dark.style.opacity = "0";
    this.bodyWrap.style.opacity = "0";
    this.prog.style.opacity = "0";
    document.body.classList.remove("meditating", "contemplative");
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
  private paint(dark: number, body: number): void {
    this.dark.style.opacity = dark.toFixed(3);
    this.bodyWrap.style.opacity = body.toFixed(3);
    this.prog.style.opacity = (body * 0.9).toFixed(3);
  }

  /** The dark's own frames: the lungs and the corner drawn every display frame, smooth. */
  private loop(): void {
    if (this.raf) return;
    this.lastNow = performance.now();
    const step = (now: number) => {
      if (this.phase === "none") {
        this.raf = 0;
        return;
      }
      this.raf = requestAnimationFrame(step);
      const dt = Math.min(0.1, (now - this.lastNow) / 1000);
      this.lastNow = now;
      if (this.body > 0.002) {
        if (!this.frozen) this.bt += dt;
        this.drawBody();
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  /** The square breath, slow: 0..1 full, and its phase. */
  private breath(): { open: number; phase: string } {
    const c = this.bt % (SIDE * 4);
    if (c < SIDE) return { open: soft(c / SIDE), phase: "in" };
    if (c < SIDE * 2) return { open: 1, phase: "hold" };
    if (c < SIDE * 3) return { open: 1 - soft((c - SIDE * 2) / SIDE), phase: "out" };
    return { open: 0, phase: "rest" };
  }

  /** The lungs breathing at the centre with the breath's word; in the corner, the small lungs
      filling with what has gone. */
  private drawBody(): void {
    const b = this.breath();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.lungs.draw(b.open, b.phase, reduced);
    const w = WORDS[b.phase];
    if (this.word.textContent !== w) this.word.textContent = w;
    this.what.style.opacity = String(Math.max(0, Math.min(1, (12 - this.gt) / 3)) * 0.7 * this.body);
    const g = this.progCtx;
    if (!g) return;
    const cw = this.prog.clientWidth, ch = this.prog.clientHeight;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (!W || !H) return;
    if (this.prog.width !== W || this.prog.height !== H) (this.prog.width = W), (this.prog.height = H);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    // the fill: warm light rising from the base as the cycle goes, its surface breathing a little
    const top = H * (0.9 - 0.62 * this.done) - H * 0.012 * b.open;
    g.save();
    lobePath(g, W, H);
    g.clip();
    const grd = g.createLinearGradient(0, top, 0, H);
    grd.addColorStop(0, "rgba(255, 226, 170, 0.95)");
    grd.addColorStop(1, "rgba(255, 176, 104, 0.75)");
    g.fillStyle = grd;
    g.fillRect(0, top, W, H - top);
    g.restore();
    // the outline, faint: what is left
    lobePath(g, W, H);
    g.strokeStyle = "rgba(255, 232, 196, 0.45)";
    g.lineWidth = 1.1 * dpr;
    g.lineJoin = "round";
    g.stroke();
    // the airway
    const x = (v: number) => (v / 40) * W, y = (v: number) => (v / 40) * H;
    g.beginPath();
    g.moveTo(x(20), y(4));
    g.lineTo(x(20), y(14));
    g.quadraticCurveTo(x(19), y(16), x(17), y(17.5));
    g.moveTo(x(20), y(14));
    g.quadraticCurveTo(x(21), y(16), x(23), y(17.5));
    g.stroke();
  }
}

function ease(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}
/** A breath's own curve: gentle at both ends, never a snap. */
function soft(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return 0.5 - 0.5 * Math.cos(Math.PI * c);
}
