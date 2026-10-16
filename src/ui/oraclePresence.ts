/* The oracle's presence (the owner: "like you talk to someone, and when they think, speak and go
   quiet, a certain animation with particles goes on"; after the vision of creation's star he saw
   through the old panel). A body of small lights over the question: a six-pointed star (two
   triangles' edges and their spokes), a ring, a bright core and a haze of dust, each light with
   its own place, drift and flicker.
   - quiet: it breathes slowly, turning a little.
   - thinking: it draws in, spiralling faster about its heart, the core pulsing.
   - speaking: each sentence as it begins sends a ring of light out and a breath through the
     star; between, the core flutters as a voice does.
   Canvas 2D, additive, one prerendered sprite, drawn only while the oracle is open. */

export type PresenceState = "quiet" | "thinking" | "speaking";

interface Dot {
  /** its place in the form (form units, −1…1) */
  x: number;
  y: number;
  /** 0 star line, 1 ring, 2 dust, 3 core */
  kind: number;
  size: number;
  ph: number;
  sp: number;
  warm: number;
}

const N_STAR = 360, N_RING = 120, N_DUST = 220, N_CORE = 60;

function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function sprite(rgb: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.25, `rgba(${rgb},0.55)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return c;
}

export class OraclePresence {
  readonly el: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private dots: Dot[] = [];
  private cool = sprite("214,232,255");
  private gold = sprite("255,214,150");
  private state: PresenceState = "quiet";
  /** eased toward the state: how drawn-in (thinking) and how voiced (speaking) */
  private draw_ = 0;
  private voice = 0;
  private spin = 0;
  private spinVel = 0.06;
  private rings: { t: number }[] = [];
  private breath = 0;
  private raf = 0;
  private last = 0;
  private t = 0;
  private still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor() {
    this.el = document.createElement("canvas");
    this.el.className = "o-presence";
    this.el.setAttribute("aria-hidden", "true");
    this.g = this.el.getContext("2d")!;
    const r = rnd(7);
    // the star: the six edges of two triangles, and six spokes from the heart to their points
    const pts: [number, number][] = [];
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 3;
      pts.push([Math.cos(a) * 0.82, Math.sin(a) * 0.82]);
    }
    const segs: [number, number, number, number][] = [];
    for (const tri of [[0, 2, 4], [1, 3, 5]])
      for (let i = 0; i < 3; i++) {
        const a = pts[tri[i]], b = pts[tri[(i + 1) % 3]];
        segs.push([a[0], a[1], b[0], b[1]]);
      }
    for (const p of pts) segs.push([0, 0, p[0], p[1]]);
    for (let i = 0; i < N_STAR; i++) {
      const s = segs[i % segs.length], u = r();
      this.dots.push({ x: s[0] + (s[2] - s[0]) * u, y: s[1] + (s[3] - s[1]) * u, kind: 0, size: 0.6 + r() * 0.8, ph: r() * 6.28, sp: 0.6 + r() * 1.4, warm: r() < 0.22 ? 1 : 0 });
    }
    for (let i = 0; i < N_RING; i++) {
      const a = r() * 6.283;
      this.dots.push({ x: Math.cos(a) * 0.95, y: Math.sin(a) * 0.95, kind: 1, size: 0.5 + r() * 0.6, ph: r() * 6.28, sp: 0.5 + r(), warm: r() < 0.5 ? 1 : 0 });
    }
    for (let i = 0; i < N_DUST; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * 1.05;
      this.dots.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, kind: 2, size: 0.35 + r() * 0.5, ph: r() * 6.28, sp: 0.3 + r() * 0.8, warm: r() < 0.3 ? 1 : 0 });
    }
    for (let i = 0; i < N_CORE; i++) {
      const a = r() * 6.283, d = r() * r() * 0.16;
      this.dots.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, kind: 3, size: 0.9 + r() * 1.2, ph: r() * 6.28, sp: 1 + r(), warm: 1 });
    }
  }

  setState(s: PresenceState): void {
    this.state = s;
  }

  /** A sentence begins: a ring goes out and a breath passes through the star. */
  pulse(): void {
    this.rings.push({ t: 0 });
    if (this.rings.length > 5) this.rings.shift();
    this.breath = 1;
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame(dt: number): void {
    const c = this.el, dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) (c.width = w), (c.height = h);
    const still = this.still;
    if (!still) this.t += dt;
    const t = this.t;
    // ease toward the state
    const thinking = this.state === "thinking" ? 1 : 0, speaking = this.state === "speaking" ? 1 : 0;
    this.draw_ += (thinking - this.draw_) * Math.min(1, dt * 1.6);
    this.voice += (speaking - this.voice) * Math.min(1, dt * 2.5);
    const wantSpin = 0.06 + this.draw_ * 1.4 + this.voice * 0.12;
    this.spinVel += (wantSpin - this.spinVel) * Math.min(1, dt * 1.2);
    if (!still) this.spin += this.spinVel * dt;
    this.breath = Math.max(0, this.breath - dt * 0.9);
    for (const ring of this.rings) ring.t += dt;
    this.rings = this.rings.filter((r) => r.t < 2.6);

    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
    // the breath: a slow swell, quicker when thinking, a voice's flutter while speaking
    const slow = 1 + Math.sin(t * 0.9) * 0.035;
    const flutter = this.voice * (Math.sin(t * 7.3) * 0.5 + Math.sin(t * 11.1) * 0.3) * 0.02;
    const scale = slow * (1 - this.draw_ * 0.32) * (1 + this.breath * 0.1 + flutter);
    const cos = Math.cos(this.spin), sin = Math.sin(this.spin);
    const px = 2.6 * dpr * (Math.min(w, h) / (180 * dpr));

    for (const d of this.dots) {
      let x = d.x, y = d.y;
      // thinking: drawn in along a spiral, the outer more than the inner
      if (this.draw_ > 0.001) {
        const r = Math.hypot(x, y), a = Math.atan2(y, x) + this.draw_ * (0.9 - r) * 1.2;
        const rr = r * (1 - this.draw_ * 0.35 * r);
        x = Math.cos(a) * rr;
        y = Math.sin(a) * rr;
      }
      // its own drift
      const dr = d.kind === 2 ? 0.05 : d.kind === 3 ? 0.02 : 0.012;
      x += Math.sin(t * d.sp + d.ph) * dr;
      y += Math.cos(t * d.sp * 0.8 + d.ph * 1.3) * dr;
      const sx = (x * cos - y * sin) * scale, sy = (x * sin + y * cos) * scale;
      const tw = 0.55 + 0.45 * Math.sin(t * (1.5 + d.sp * 2) + d.ph);
      let a = d.kind === 2 ? 0.28 : d.kind === 1 ? 0.45 : d.kind === 3 ? 0.9 : 0.7;
      a *= tw * (0.85 + this.breath * 0.4 + this.draw_ * 0.25);
      // the core brightens with thought and voice
      if (d.kind === 3) a *= 1 + this.draw_ * 0.6 * (0.5 + 0.5 * Math.sin(t * 4)) + this.voice * 0.4;
      const s = d.size * px * (d.kind === 3 ? 1.6 : 1);
      g.globalAlpha = Math.min(1, a);
      g.drawImage(d.warm ? this.gold : this.cool, cx + sx * R - s, cy + sy * R - s, s * 2, s * 2);
    }
    // the heart's glow
    const glow = 0.35 + this.draw_ * 0.25 + this.voice * 0.2 + this.breath * 0.3;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
    gr.addColorStop(0, `rgba(255,236,200,${0.55 * glow})`);
    gr.addColorStop(0.3, `rgba(255,214,150,${0.18 * glow})`);
    gr.addColorStop(1, "rgba(255,214,150,0)");
    g.globalAlpha = 1;
    g.fillStyle = gr;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    // the rings a sentence sends out
    for (const ring of this.rings) {
      const k = ring.t / 2.6;
      g.globalAlpha = (1 - k) * 0.55;
      g.strokeStyle = "rgb(255,222,170)";
      g.lineWidth = 1.2 * dpr;
      g.beginPath();
      g.arc(cx, cy, R * (0.25 + k * 0.85), 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }
}
