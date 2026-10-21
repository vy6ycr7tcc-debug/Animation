/* The meditation (the owner's "meditation sequence"): holding a finger on a rock, a tree or a
   crystal, the wanderer goes to it and lays hands on it (world/touch.ts), and the world slowly
   closes like eyes:
   1. the screen fades to black over a few seconds, never a cut;
   2. in the dark, one cycle (the owner: "end it thru a single cycle and make a circle… tracking
      what's left"): a ring of light that fills as the guidance goes, the lungs (ui/breathLungs.ts)
      breathing the square at its heart (in 4, hold 4, out 4, rest 4) with the breath's one word,
      and faint motes drifting in toward them;
   3. one of Aria's three guidances (audio/meditation/), never the same twice running, the world's
      own sound ducked beneath; the ring's length is the recording's own (or a fixed cycle if it
      can't be heard), so it always ends;
   4. when the ring closes it fades, the world fades back, and the wanderer rises, unhurried;
   5. for a few breaths the world is seen quietly: a little less colour, no controls;
   6. then the controls return, and the small heart blinks twice: if something moved, write it.
   The hold only begins it: the finger may lift. The small ✕ (or the stick) leaves early: the
   voice and the dark fade out together and the wanderer stands; no quiet view, no heart, no stone
   (they chose to leave, and that's fine). */
import { LungParticles } from "../ui/breathLungs";

export const GUIDANCES = ["audio/meditation/meditation_square.mp3", "audio/meditation/meditation_body.mp3", "audio/meditation/meditation_blend.mp3"];
const LAST = "inward-journey:meditation-last";
const FADE_IN = 3.4; // the eyes closing
const BODY_IN = 2.2;
const BODY_OUT = 2.2;
const FADE_OUT = 3.2; // the eyes opening
const QUIET = 13; // the contemplative view: a few breaths
const LEAVE = 1.6; // let go early: everything fades out together
const CYCLE = 45; // a cycle when the guidance can't be heard (no recording, the voices resting)
const WORDS: Record<string, string> = { in: "Breathe in", hold: "Hold", out: "Release", rest: "Wait" };

export interface MeditationHooks {
  /** play a guidance (a recording's path); stop the voice with a fade */
  play(path: string): void;
  stopVoice(fade: number): void;
  /** is this recording still speaking? */
  speaking(path: string): boolean;
  /** how far it has gone (seconds), and its length, while it is the one speaking */
  progress(path: string): { t: number; total: number } | null;
  /** the wanderer lets go of what it holds and rises */
  rise(): void;
  /** it ran its whole course (stone-essence, for a rock) */
  completed(): void;
  /** the heart's two soft blinks */
  invite(): void;
}

type Phase = "none" | "closing" | "inner" | "guiding" | "opening" | "quiet" | "leaving";

export class Meditation {
  phase: Phase = "none";
  /** 0..1: how hushed the world's colour is (the quiet view after) */
  hush = 0;
  private t = 0;
  private path = "";
  private el: HTMLElement;
  private dark: HTMLElement;
  private bodyWrap: HTMLElement;
  private ringCanvas: HTMLCanvasElement;
  private lungs: LungParticles;
  private ctx: CanvasRenderingContext2D | null;
  private sprite: HTMLCanvasElement;
  private word: HTMLElement;
  private what: HTMLElement;
  private motes: { a: number; r0: number; sp: number; ph: number }[] = [];
  private bt = 0;
  private started = false;
  /** the cycle: seconds since the guidance began, its length once known, how far the ring is */
  private gt = 0;
  private len = 0;
  private done = 0;

  constructor(private hooks: MeditationHooks) {
    const el = document.createElement("div");
    el.id = "meditation";
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<div class="dark"></div><div class="inner"><canvas class="ring"></canvas><canvas class="lungs"></canvas><div class="word"></div></div><p class="what"></p><button class="leave" type="button" aria-label="Stop the meditation">✕</button>`;
    document.body.appendChild(el);
    this.el = el;
    this.dark = el.querySelector(".dark")!;
    this.bodyWrap = el.querySelector(".inner")!;
    this.ringCanvas = el.querySelector("canvas.ring")!;
    this.ctx = this.ringCanvas.getContext("2d");
    this.lungs = new LungParticles(el.querySelector("canvas.lungs")!);
    this.word = el.querySelector(".word")!;
    this.what = el.querySelector(".what")!;
    const leave = el.querySelector(".leave") as HTMLElement;
    leave.addEventListener("pointerdown", (e) => (e.preventDefault(), e.stopPropagation(), this.release()));
    leave.addEventListener("click", (e) => (e.preventDefault(), e.detail === 0 && this.release()));
    for (let i = 0; i < 90; i++) this.motes.push({ a: Math.random() * Math.PI * 2, r0: 0.55 + Math.random() * 0.45, sp: 0.03 + Math.random() * 0.05, ph: Math.random() });
    // a soft point of light for the threads' pulses, drawn once
    const s = (this.sprite = document.createElement("canvas"));
    s.width = s.height = 32;
    const g = s.getContext("2d")!;
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, "rgba(255,244,222,1)");
    r.addColorStop(0.3, "rgba(255,214,150,0.6)");
    r.addColorStop(1, "rgba(255,190,120,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
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
    this.started = false;
    this.gt = 0;
    this.len = 0;
    this.done = 0;
    this.what.textContent = `Stay with ${what}. The ring fills as the meditation goes.`;
    this.el.hidden = false;
    document.body.classList.add("meditating");
    // the next guidance, never the one heard last
    let last = -1;
    try {
      last = Number(localStorage.getItem(LAST) ?? -1);
    } catch {
      /* no storage: still rotate within the visit */
    }
    const i = (Number.isFinite(last) ? last + 1 : 0) % GUIDANCES.length;
    this.path = GUIDANCES[i];
    try {
      localStorage.setItem(LAST, String(i));
    } catch {
      /* fine */
    }
  }
  /** Leave early (the ✕, the stick, the hold let go some other way). Before the cycle ends: leave. */
  release(): void {
    if (this.phase === "closing" || this.phase === "inner" || this.phase === "guiding") {
      this.phase = "leaving";
      this.t = 0;
      this.hooks.stopVoice(LEAVE);
      this.hooks.rise();
    }
  }
  /** Any touch during the quiet after ends it at once (the controls come back). */
  wake(): void {
    if (this.phase === "quiet") this.t = Math.max(this.t, QUIET - 1.2);
  }

  /** For a still: hold the sequence at a phase (`inner`: the body at its breath; `quiet`). */
  hold(phase: "inner" | "quiet", breathAt = 2.2): void {
    this.el.hidden = phase === "quiet";
    this.phase = phase === "inner" ? "guiding" : "quiet";
    this.t = phase === "inner" ? 30 : 3;
    this.bt = breathAt;
    this.done = 0.62;
    this.started = true;
    this.frozen = true;
    document.body.classList.add("meditating");
    this.paint(phase === "inner" ? 1 : 0, phase === "inner" ? 1 : 0);
  }
  private frozen = false;

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
        if (t > BODY_IN * 0.7 && !this.started) {
          this.started = true;
          this.hooks.play(this.path);
        }
        if (t >= BODY_IN) this.next("guiding");
        break;
      case "guiding": {
        dark = 1;
        body = 1;
        if (this.frozen) break;
        this.gt += dt;
        // the cycle's length: the recording's own once it is heard, else a fixed cycle
        const p = this.hooks.progress(this.path);
        if (p && p.total > 1) this.len = Math.min(120, p.total);
        else if (!this.len && this.gt > 6) this.len = CYCLE;
        const at = p && p.total > 1 ? p.t : this.gt;
        this.done = this.len ? Math.min(1, at / this.len) : 0;
        // it ends when the ring closes, or the voice has finished (never waits on it for ever)
        const over = (this.len && at >= this.len - 0.2) || (this.gt > 8 && this.len && !this.hooks.speaking(this.path) && this.gt >= this.len) || this.gt > 130;
        if (over) {
          this.done = 1;
          this.next("opening");
          this.hooks.completed();
        }
        break;
      }
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
    this.paint(dark, body);
    if (body > 0.002) {
      if (!this.frozen) this.bt += dt;
      this.drawBody(body);
    }
  }
  private risen = false;
  private lastDark = 0;
  private lastBody = 0;
  private next(p: Phase): void {
    this.phase = p;
    this.t = 0;
    if (p === "opening") this.risen = false;
  }
  private end(): void {
    this.phase = "none";
    this.el.classList.remove("held");
    this.hush = 0;
    this.el.hidden = true;
    this.dark.style.opacity = "0";
    this.bodyWrap.style.opacity = "0";
    document.body.classList.remove("meditating", "contemplative");
  }
  private paint(dark: number, body: number): void {
    this.dark.style.opacity = dark.toFixed(3);
    this.bodyWrap.style.opacity = body.toFixed(3);
  }

  /** The square breath, as the lungs show it: 0..1 full, and its phase. */
  private breath(): { open: number; phase: string } {
    const c = this.bt % 16;
    if (c < 4) return { open: ease(c / 4), phase: "in" };
    if (c < 8) return { open: 1, phase: "hold" };
    if (c < 12) return { open: 1 - ease((c - 8) / 4), phase: "out" };
    return { open: 0, phase: "rest" };
  }

  /** The ring and what is in it: the lungs breathing, the breath's word, the ring filling with
      what has gone, its head a bead of light, motes drifting in. */
  private drawBody(k: number): void {
    const ctx = this.ctx;
    const b = this.breath();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.lungs.draw(b.open, b.phase, reduced);
    const w = WORDS[b.phase];
    if (this.word.textContent !== w) this.word.textContent = w;
    this.what.style.opacity = String(Math.max(0, Math.min(1, (14 - this.gt) / 3)) * 0.75 * k);
    if (!ctx) return;
    const cw = this.ringCanvas.clientWidth, ch = this.ringCanvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (!W || !H) return;
    if (this.ringCanvas.width !== W || this.ringCanvas.height !== H) {
      this.ringCanvas.width = W;
      this.ringCanvas.height = H;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.44 * (1 + 0.015 * b.open);
    const top = -Math.PI / 2, p = this.done;
    ctx.lineCap = "round";
    // the whole round, faint: what is left
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `rgba(255, 232, 196, ${0.13 * k})`;
    ctx.lineWidth = 1.4 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // what has gone: a line of warm light, softly glowing
    if (p > 0.001) {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255, 196, 120, ${0.22 * k})`;
      ctx.lineWidth = 7 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, R, top, top + Math.PI * 2 * p);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 226, 170, ${0.9 * k})`;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, R, top, top + Math.PI * 2 * p);
      ctx.stroke();
      // its head: a bead of light
      const ha = top + Math.PI * 2 * p, hr = 9 * dpr * (1 + 0.25 * b.open);
      ctx.globalAlpha = k;
      ctx.drawImage(this.sprite, cx + Math.cos(ha) * R - hr, cy + Math.sin(ha) * R - hr, hr * 2, hr * 2);
      ctx.globalAlpha = 1;
    }
    // motes drifting in from beyond the ring toward the heart, slowly, more as the cycle fills
    ctx.globalCompositeOperation = "lighter";
    const tt = this.bt;
    for (const m of this.motes) {
      const u = (m.ph + tt * m.sp) % 1;
      const rr = R * (m.r0 * 1.5) * (1 - u * 0.85);
      const a = m.a + u * 1.6;
      const al = Math.sin(u * Math.PI) * (0.25 + 0.55 * p) * k;
      if (al < 0.01) continue;
      const sz = (2.2 + 2.6 * (1 - u)) * dpr;
      ctx.globalAlpha = al;
      ctx.drawImage(this.sprite, cx + Math.cos(a) * rr - sz, cy + Math.sin(a) * rr - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

function ease(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}
