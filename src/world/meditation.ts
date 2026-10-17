/* The meditation (the owner's "meditation sequence"): holding a finger on a rock, a tree or a
   crystal, the wanderer goes to it and lays hands on it (world/touch.ts), and the world slowly
   closes like eyes:
   1. the screen fades to black over a few seconds, never a cut;
   2. in the dark, a body drawn in a few fine lines, threads of light running quietly through it,
      and at its chest the lungs (ui/breathLungs.ts) breathing the square (in 4, hold 4, out 4,
      rest 4): the metronome to breathe with;
   3. one of Aria's three guidances (audio/meditation/), never the same twice running, low under
      it, the world's own sound ducked beneath;
   4. when it ends the body fades, the world fades back, and the wanderer rises, unhurried;
   5. for a few breaths the world is seen quietly: a little less colour, no controls;
   6. then the controls return, and the small heart blinks twice: if something moved, write it.
   Let go of the hold before the guidance ends and the voice and the dark fade out together and the
   wanderer stands: no quiet view, no heart (they chose to leave, and that's fine). */
import { LungParticles } from "../ui/breathLungs";

export const GUIDANCES = ["audio/meditation/meditation_square.mp3", "audio/meditation/meditation_body.mp3", "audio/meditation/meditation_blend.mp3"];
const LAST = "inward-journey:meditation-last";
const FADE_IN = 3.4; // the eyes closing
const BODY_IN = 2.2;
const BODY_OUT = 2.2;
const FADE_OUT = 3.2; // the eyes opening
const QUIET = 13; // the contemplative view: a few breaths
const LEAVE = 1.6; // let go early: everything fades out together

export interface MeditationHooks {
  /** play a guidance (a recording's path); stop the voice with a fade */
  play(path: string): void;
  stopVoice(fade: number): void;
  /** is this recording still speaking? */
  speaking(path: string): boolean;
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
  private bodyCanvas: HTMLCanvasElement;
  private lungs: LungParticles;
  private ctx: CanvasRenderingContext2D | null;
  private sprite: HTMLCanvasElement;
  private threads: { x: number; y: number }[][] = [];
  private outline: Path2D;
  private bt = 0;
  private started = false;

  constructor(private hooks: MeditationHooks) {
    const el = document.createElement("div");
    el.id = "meditation";
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<div class="dark"></div><div class="inner"><canvas class="body"></canvas><canvas class="lungs"></canvas></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.dark = el.querySelector(".dark")!;
    this.bodyWrap = el.querySelector(".inner")!;
    this.bodyCanvas = el.querySelector("canvas.body")!;
    this.ctx = this.bodyCanvas.getContext("2d");
    this.lungs = new LungParticles(el.querySelector("canvas.lungs")!);
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
    /* the body, in a 200 × 440 frame: a person standing at rest, arms a little away from the
       sides, drawn as one quiet outline (head, neck, shoulders, the arms down to open hands,
       the waist, the legs) */
    this.outline = new Path2D(
      "M100 18 C116 18 126 30 126 46 C126 62 116 76 100 76 C84 76 74 62 74 46 C74 30 84 18 100 18 Z " +
        "M90 76 C90 84 89 90 86 94 C70 97 56 101 50 112 C44 124 42 150 40 176 C38 200 36 222 34 240 C33 250 36 256 41 254 C46 252 47 244 48 236 C51 214 55 190 59 168 C61 158 64 150 66 146 " +
        "C67 170 68 196 70 214 C66 260 66 300 70 340 C72 370 74 396 74 418 C74 426 80 430 88 428 C93 426 94 420 94 412 C95 380 96 340 98 300 L100 268 L102 300 C104 340 105 380 106 412 C106 420 107 426 112 428 C120 430 126 426 126 418 C126 396 128 370 130 340 C134 300 134 260 130 214 C132 196 133 170 134 146 " +
        "C136 150 139 158 141 168 C145 190 149 214 152 236 C153 244 154 252 159 254 C164 256 167 250 166 240 C164 222 162 200 160 176 C158 150 156 124 150 112 C144 101 130 97 114 94 C111 90 110 84 110 76",
    );
    // the threads of light: the central channel crown to root, and along each arm and leg
    const line = (pts: [number, number][], n: number) => {
      const out: { x: number; y: number }[] = [];
      for (let i = 0; i < pts.length - 1; i++)
        for (let k = 0; k < n; k++) {
          const u = k / n;
          out.push({ x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u });
        }
      out.push({ x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] });
      return out;
    };
    this.threads = [
      line([[100, 22], [100, 76], [100, 120], [100, 180], [100, 262]], 18),
      line([[100, 104], [72, 104], [56, 130], [50, 180], [42, 244]], 16),
      line([[100, 104], [128, 104], [144, 130], [150, 180], [158, 244]], 16),
      line([[100, 262], [92, 300], [86, 360], [84, 420]], 18),
      line([[100, 262], [108, 300], [114, 360], [116, 420]], 18),
    ];
  }

  /** busy: the sequence is under way (closing, in the dark, opening, or the quiet after) */
  get active(): boolean {
    return this.phase !== "none";
  }
  /** the dark is over everything (no world needs drawing in detail) */
  get covered(): boolean {
    return this.phase === "inner" || this.phase === "guiding";
  }

  /** A hold has begun on something to lay hands on: the eyes begin to close. */
  begin(): void {
    if (this.phase !== "none") return;
    this.phase = "closing";
    this.t = 0;
    this.started = false;
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
  /** The finger was lifted (or the hold was otherwise let go). Before the guidance ends: leave. */
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
      case "guiding":
        dark = 1;
        body = 1;
        // the guidance has ended (give it a moment to have begun)
        if (!this.frozen && t > 2 && !this.hooks.speaking(this.path)) {
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

  private drawBody(k: number): void {
    const ctx = this.ctx;
    const b = this.breath();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.lungs.draw(b.open, b.phase, reduced);
    if (!ctx) return;
    const cw = this.bodyCanvas.clientWidth, ch = this.bodyCanvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (!W || !H) return;
    if (this.bodyCanvas.width !== W || this.bodyCanvas.height !== H) {
      this.bodyCanvas.width = W;
      this.bodyCanvas.height = H;
    }
    const s = Math.min(W / 200, H / 440);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(s, 0, 0, s, (W - 200 * s) / 2, (H - 440 * s) / 2);
    // the outline: a faint pale line, breathing with the lungs (a little brighter full)
    ctx.globalCompositeOperation = "source-over";
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(190, 210, 255, ${(0.2 + b.open * 0.1) * k})`;
    ctx.lineWidth = 3.4 / s;
    ctx.stroke(this.outline);
    ctx.strokeStyle = `rgba(225, 235, 255, ${(0.42 + b.open * 0.12) * k})`;
    ctx.lineWidth = 1.1 / s;
    ctx.stroke(this.outline);
    // the threads: a hair of light each, and slow pulses travelling along them (up the centre on
    // the in-breath, down it on the out-breath; out along the limbs and home)
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(255, 220, 160, ${0.1 * k})`;
    ctx.lineWidth = 0.9 / s;
    for (const th of this.threads) {
      ctx.beginPath();
      ctx.moveTo(th[0].x, th[0].y);
      for (const q of th) ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    const tt = this.bt;
    for (let i = 0; i < this.threads.length; i++) {
      const th = this.threads[i];
      const n = th.length - 1;
      const dir = i === 0 ? (b.phase === "out" || b.phase === "rest" ? 1 : -1) : 1;
      for (let j = 0; j < 2; j++) {
        let u = ((tt * 0.07 + i * 0.23 + j * 0.5) % 1 + 1) % 1;
        if (dir < 0) u = 1 - u;
        const q = th[Math.min(n, Math.floor(u * n))];
        const a = Math.sin(u * Math.PI) * 0.6 * k;
        const r = 5.5;
        ctx.globalAlpha = a;
        ctx.drawImage(this.sprite, q.x - r, q.y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
  }
}

function ease(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}
