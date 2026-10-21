/* The lungs over the view while you breathe (main.ts breathCueFrame, and the meditation's dark): a body
   of small blue lights in the shape of a pair of lungs, the owner's "use the particles… that shape but
   dynamic, expanding, holding and deflating".
   - Two lungs drawn as they are: the right with its two fissures (three lobes), the left with one
     and the heart's notch in its edge, both bases curving over the diaphragm's dome.
   - Inside each, the bronchial tree grown branch by branch from the windpipe, its finest twigs
     ending in small clusters of alveoli.
   - Breathing in, air (motes of light) runs down the windpipe and along the branches, the clusters
     bloom as it reaches them, a fullness spreads from the hilum out to the edges, and the whole
     swells outward and down (the diaphragm descending).
   - Held, the light rests and glows softly; released, it runs back up the branches and out of the
     windpipe as the lungs settle; empty, they rest dim and still.
   - Nothing moves faster than the breath itself: the drift and the twinkle are slow, and the air's
     front is the breath's own fullness, so the light arrives exactly as the count does.
   Canvas 2D, additive, two prerendered sprites: cheap on a phone. */

/** The breath's own curve through a phase (0..1 through it), for the square breath and the
    meditation alike: breathing in begins the moment its word does (a third full by a quarter of
    the way, where a plain ease had barely moved) and slows as the lungs fill; breathing out lets go
    the same way and settles; never a snap at either end; the holds are still. */
export function breathCurve(phase: string, k: number): number {
  const u = Math.pow(Math.min(1, Math.max(0, k)), 0.7);
  const s = u * u * (3 - 2 * u);
  if (phase === "in") return s;
  if (phase === "out") return 1 - s;
  return phase === "hold" ? 1 : 0;
}

const LUNGS = [
  // the right lung (on the viewer's left): apex, the lateral edge, the base over the dome, the hilum
  "M47 17 C39 18 30 26 24 39 C17 54 13 72 13 93 C22 89 37 88 52 95 C54 83 52 72 55 62 C52 55 52 47 55 40 C55 30 52 19 47 17 Z",
  // the left lung: its medial edge swings out round the heart (the cardiac notch)
  "M73 17 C81 18 90 26 96 39 C103 54 107 72 107 93 C99 90 88 89 78 92 C82 84 79 76 72 72 C66 67 67 55 65 46 C67 38 66 26 73 17 Z",
];
/** The fissures between the lobes: faint lines of light. */
const FISSURES = ["M24 45 C33 57 41 73 47 92", "M34 63 C27 62 20 62 15 64", "M96 45 C88 57 81 71 78 90"];
/** Where the windpipe divides, and where each lung hangs from (the hilum). */
const CARINA = { x: 60, y: 30 };
const HILA = [{ x: 51, y: 44 }, { x: 69, y: 46 }];
/** About the middle of each lung, for its glow. */
const MIDS = [{ x: 35, y: 60 }, { x: 86, y: 62 }];
/** The drawing's frame (shape units), with room round the shape to swell into. */
const FRAME = { x: -14, y: -12, w: 148, h: 140 };

/** 0 tissue, 1 outline, 2 airway, 3 alveolus, 4 fissure */
interface Dot {
  x: number;
  y: number;
  kind: number;
  size: number;
  ph: number;
  sp: number;
  /** airways and alveoli: how far along the tree from the top of the windpipe (0..1); tissue: how
      far from its hilum toward the edge (0..1) */
  at: number;
  lung: number;
}
interface Mote {
  t: number;
  life: number;
  path: number;
  dir: 1 | -1;
}

function samplePath(d: string, step: number): { x: number; y: number }[] {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("style", "position:absolute;width:0;height:0;visibility:hidden");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", d);
  svg.appendChild(p);
  document.body.appendChild(svg);
  const out: { x: number; y: number }[] = [];
  try {
    const len = p.getTotalLength();
    for (let s = 0; s <= len; s += step) {
      const q = p.getPointAtLength(s);
      out.push({ x: q.x, y: q.y });
    }
  } catch {
    /* no layout: the outline is left to the inside's lights */
  }
  svg.remove();
  return out;
}

function sprite(stops: [number, string][]): HTMLCanvasElement {
  const s = document.createElement("canvas");
  s.width = s.height = 32;
  const g = s.getContext("2d")!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  for (const [o, c] of stops) r.addColorStop(o, c);
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return s;
}

export class LungParticles {
  private ctx: CanvasRenderingContext2D | null;
  private dots: Dot[] = [];
  private motes: Mote[] = [];
  private blue: HTMLCanvasElement;
  private pale: HTMLCanvasElement;
  /** each path from the top of the windpipe to a cluster of alveoli (shape units), for the air */
  private paths: { x: number; y: number }[][] = [];
  private last = 0;
  private t = 0;
  /** how quickly the lights drift and twinkle (1: the square-breathing cue; the meditation's dark
      is slower, softer) */
  pace = 1;
  private spawn = 0;
  /** how fast the air is moving now (0..1, from the breath's own change, eased): the front's
      brightness and the motes follow it, so nothing jumps where one side of the square meets the next */
  private flow = 0;
  private prevOpen = -1;
  /** the hold's soft glow, eased in and out */
  private holdK = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
    this.blue = sprite([[0, "rgba(225,240,255,1)"], [0.25, "rgba(140,198,255,0.75)"], [0.6, "rgba(64,124,220,0.22)"], [1, "rgba(40,80,180,0)"]]);
    this.pale = sprite([[0, "rgba(255,255,255,1)"], [0.3, "rgba(205,232,255,0.7)"], [0.65, "rgba(120,180,255,0.2)"], [1, "rgba(80,140,230,0)"]]);
    const rnd = mulberry(7);
    const add = (x: number, y: number, kind: number, size: number, at: number, lung: number) =>
      this.dots.push({ x, y, kind, size, ph: rnd() * Math.PI * 2, sp: 0.25 + rnd() * 0.35, at, lung });
    const probe = this.ctx;
    const shapes = LUNGS.map((d) => new Path2D(d));
    const inside = (lung: number, x: number, y: number) => !probe || probe.isPointInPath(shapes[lung], x, y);

    // the outline, denser: the shape reads at a glance
    LUNGS.forEach((d, lung) => {
      for (const q of samplePath(d, 1.35)) add(q.x + (rnd() - 0.5) * 1.2, q.y + (rnd() - 0.5) * 1.2, 1, 0.75 + rnd() * 0.5, 0, lung);
    });
    for (const d of FISSURES) for (const q of samplePath(d, 2.4)) add(q.x + (rnd() - 0.5) * 0.8, q.y + (rnd() - 0.5) * 0.8, 4, 0.5 + rnd() * 0.3, 0, q.x < 60 ? 0 : 1);
    // the tissue, how far each light lies from its hilum toward the edge
    let n = 0;
    for (let tries = 0; n < 400 && tries < 20000; tries++) {
      const x = 12 + rnd() * 96, y = 16 + rnd() * 80;
      const lung = x < 60 ? 0 : 1;
      if (!inside(lung, x, y)) continue;
      const h = HILA[lung];
      add(x, y, 0, 0.45 + rnd() * 0.65, Math.min(1, Math.hypot(x - h.x, (y - h.y) * 0.8) / 46), lung);
      n++;
    }

    // the bronchial tree as it is: the windpipe; each main bronchus to its hilum (the right short and
    // steep, the left longer and flatter); there the lobes' bronchi, one rising into the apex, one out
    // to the side, one down to the base; each dividing again and again, every branch kept inside its
    // lung, the finest ending in clusters of alveoli. Angles: 0 straight down, ±π/2 out, ±π up.
    type P = { x: number; y: number };
    const segs: { a: P; b: P; c: P; d0: number; d1: number; depth: number; lung: number; path: P[] }[] = [];
    const TOP = { x: 60, y: 2 };
    const trunkLen = CARINA.y - TOP.y;
    const seg = (from: P, to: P, len: number, ang: number, depth: number, lung: number, d0: number, path: P[]): P[] => {
      const bend = (rnd() - 0.5) * len * 0.25;
      const c = { x: (from.x + to.x) / 2 + Math.cos(ang) * bend, y: (from.y + to.y) / 2 - Math.sin(ang) * bend };
      const p2 = [...path, to];
      segs.push({ a: from, b: to, c, d0, d1: d0 + len, depth, lung, path: p2 });
      return p2;
    };
    const grow = (from: P, ang: number, len: number, depth: number, lung: number, d0: number, path: P[]) => {
      let to = { x: from.x + Math.sin(ang) * len, y: from.y + Math.cos(ang) * len };
      for (let k = 0; k < 3 && !inside(lung, to.x, to.y); k++) {
        len *= 0.7;
        to = { x: from.x + Math.sin(ang) * len, y: from.y + Math.cos(ang) * len };
      }
      if (!inside(lung, to.x, to.y) || len < 1.6) return;
      const p2 = seg(from, to, len, ang, depth, lung, d0, path);
      if (depth >= 5) return;
      const spread = 0.36 + rnd() * 0.2;
      const k = 0.74 + rnd() * 0.1;
      grow(to, ang - spread, len * k, depth + 1, lung, d0 + len, p2);
      grow(to, ang + spread, len * (k - 0.04 + rnd() * 0.08), depth + 1, lung, d0 + len, p2);
    };
    // the main bronchi, then the lobes' (the right: upper, middle, lower; the left: upper, the
    // lingula, lower)
    const LOBES: { lung: number; ang: number; len: number }[][] = [
      [{ lung: 0, ang: -2.5, len: 9 }, { lung: 0, ang: -1.3, len: 10 }, { lung: 0, ang: -0.32, len: 13 }],
      [{ lung: 1, ang: 2.45, len: 9 }, { lung: 1, ang: 1.4, len: 9 }, { lung: 1, ang: 0.36, len: 13 }],
    ];
    HILA.forEach((h, lung) => {
      const len = Math.hypot(h.x - CARINA.x, h.y - CARINA.y);
      const p2 = seg(CARINA, h, len, Math.atan2(h.x - CARINA.x, h.y - CARINA.y), 0, lung, trunkLen, [TOP, CARINA]);
      for (const l of LOBES[lung]) grow(h, l.ang + (rnd() - 0.5) * 0.12, l.len, 1, lung, trunkLen + len, p2);
    });
    const longest = Math.max(trunkLen + 1, ...segs.map((s) => s.d1));
    // the windpipe
    for (let y = TOP.y; y <= CARINA.y; y += 1.6) add(60 + (rnd() - 0.5) * 1.6, y, 2, 0.55 + rnd() * 0.3, (y - TOP.y) / longest, -1);
    for (const s of segs) {
      const L = s.d1 - s.d0, steps = Math.max(2, Math.round(L / 1.6));
      for (let i = 0; i <= steps; i++) {
        const u = i / steps, w = 1 - u;
        const x = w * w * s.a.x + 2 * w * u * s.c.x + u * u * s.b.x, y = w * w * s.a.y + 2 * w * u * s.c.y + u * u * s.b.y;
        add(x + (rnd() - 0.5) * 0.5, y + (rnd() - 0.5) * 0.5, 2, Math.max(0.35, 0.8 - s.depth * 0.09) + rnd() * 0.2, (s.d0 + L * u) / longest, s.lung);
      }
      // the tips: a cluster of alveoli each, and a path for the air to reach it
      if (s.depth >= 5 || !segs.some((o) => o.a === s.b)) {
        for (let j = 0; j < 4; j++) {
          const a = rnd() * Math.PI * 2, r = 0.8 + rnd() * 1.5;
          add(s.b.x + Math.cos(a) * r, s.b.y + Math.sin(a) * r, 3, 0.5 + rnd() * 0.35, s.d1 / longest, s.lung);
        }
        this.paths.push(s.path);
      }
    }
    if (!this.paths.length) this.paths.push([TOP, CARINA]);
  }

  /** Each frame while shown: `open` 0..1 (the breath's own fullness), its phase. */
  draw(open: number, phase: string, still: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = performance.now() / 1000;
    const gap = this.last ? now - this.last : 1;
    const dt = Math.min(0.1, gap);
    this.last = now;
    this.t += dt * this.pace;
    if (still) open = 0.6;
    // the air's speed: a breath at its fastest (a third of the lungs a second) is 1
    if (gap > 0.25 || this.prevOpen < 0) this.prevOpen = open; // shown again after a rest: no jump
    const rate = dt > 0 ? Math.abs(open - this.prevOpen) / dt : 0;
    this.prevOpen = open;
    this.flow += ((still ? 0 : Math.min(1, rate / 0.3)) - this.flow) * Math.min(1, dt * 5);
    this.holdK += ((phase === "hold" && !still ? 1 : 0) - this.holdK) * Math.min(1, dt * 1.4);

    // the canvas at the device's resolution
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (!W || !H) return;
    if (this.canvas.width !== W || this.canvas.height !== H) (this.canvas.width = W), (this.canvas.height = H);
    const k = W / FRAME.w;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const px = (x: number) => (x - FRAME.x) * k, py = (y: number) => (y - FRAME.y) * k;
    const t = still ? 0 : this.t;
    const hold = this.holdK;
    // the air's front along the tree: the fullness itself (down the branches breathing in, back up
    // breathing out), all the way when held, gone when empty
    const front = still ? 0.8 : open;
    // the swell: outward from each hilum and down more at the base (the diaphragm descending), with a
    // soft glow while held
    const sx = 0.8 + 0.3 * open, sy = 0.82 + 0.26 * open;
    const glowPulse = hold * (0.5 + 0.5 * Math.sin(t * 1.1));

    // a soft glow within each lung (about its middle), growing as it fills
    MIDS.forEach((m) => {
      const g = ctx.createRadialGradient(px(m.x), py(m.y), 0, px(m.x), py(m.y), 40 * k * (0.75 + 0.4 * open));
      g.addColorStop(0, `rgba(100,165,255,${0.05 + 0.13 * open + 0.04 * glowPulse})`);
      g.addColorStop(1, "rgba(60,110,220,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });

    const place = (x0: number, y0: number, kind: number, lung: number, d: Dot | null): [number, number] => {
      const h = lung < 0 ? CARINA : HILA[lung];
      const base = kind === 2 && lung < 0 ? 0.15 : kind === 2 ? 0.6 : 1; // the windpipe moves least
      const fx = 1 + (sx - 1) * base;
      const fy = 1 + (sy - 1) * base * (0.75 + 0.45 * Math.max(0, (y0 - h.y) / 50));
      let x = h.x + (x0 - h.x) * fx, y = h.y + (y0 - h.y) * fy;
      if (d) {
        // each light drifts on its own slow path, a little wider as the lungs fill
        const w = (kind === 0 ? 0.9 : 0.4) * (0.5 + 0.7 * open);
        x += Math.sin(t * d.sp + d.ph) * w;
        y += Math.cos(t * d.sp * 0.8 + d.ph * 1.3) * w;
      }
      return [x, y];
    };

    for (const d of this.dots) {
      const [x, y] = place(d.x, d.y, d.kind, d.lung, d);
      const twinkle = 0.78 + 0.22 * Math.sin(t * 1.2 * d.sp + d.ph);
      let a: number, r: number, img = this.blue;
      if (d.kind === 2) {
        // the airways: lit where the air has reached, brightest at its front
        const lit = 1 - smooth(front - 0.04, front + 0.06, d.at);
        const band = Math.exp(-((d.at - front) ** 2) / 0.0035) * (0.15 + 0.85 * this.flow);
        a = 0.22 + 0.5 * lit + 0.6 * band;
        r = d.size * k * (1.5 + 0.8 * band);
        if (band > 0.3) img = this.pale;
      } else if (d.kind === 3) {
        // the alveoli bloom as the air reaches them, and breathe softly while held
        const bloom = smooth(d.at - 0.16, d.at, front);
        a = (0.12 + 0.5 * bloom) * twinkle * (1 + 0.2 * glowPulse);
        r = d.size * k * (1 + 0.85 * bloom);
        img = this.pale;
      } else if (d.kind === 0) {
        // the tissue fills from the hilum outward
        const fill = smooth(d.at - 0.3, d.at + 0.02, open * 1.15);
        a = (0.1 + 0.42 * fill) * twinkle;
        r = d.size * k * (1.3 + 0.7 * fill);
      } else {
        // the outline (and the fissures, fainter)
        a = (d.kind === 4 ? 0.22 : 0.5) + (d.kind === 4 ? 0.2 : 0.45) * open;
        a *= twinkle;
        r = d.size * k * (1.4 + 0.3 * open);
      }
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(img, px(x) - r, py(y) - r, r * 2, r * 2);
    }

    // the air itself: motes down the windpipe and the branches to the alveoli breathing in, back up
    // and out of the windpipe breathing out
    if (!still && (phase === "in" || phase === "out")) {
      this.spawn += dt * 11 * this.pace * this.flow;
      while (this.spawn >= 1) {
        this.spawn--;
        this.motes.push({ t: 0, life: (1.8 + Math.random() * 0.9) / this.pace, path: Math.floor(Math.random() * this.paths.length), dir: phase === "in" ? 1 : -1 });
      }
    }
    this.motes = this.motes.filter((m) => (m.t += dt) < m.life);
    for (const m of this.motes) {
      const u = m.t / m.life;
      const along = m.dir === 1 ? u : 1 - u;
      const pth = this.paths[m.path] ?? this.paths[0];
      // a point that far along the path (by its points; the paths are short), moving with the lung
      // it is in (the windpipe, its first stretch, with the windpipe)
      const f = along * (pth.length - 1), i = Math.min(pth.length - 2, Math.floor(f)), w = f - i;
      const lung = i === 0 ? -1 : pth[i + 1].x < 60 ? 0 : 1;
      let [x, y] = place(pth[i].x + (pth[i + 1].x - pth[i].x) * w, pth[i].y + (pth[i + 1].y - pth[i].y) * w, 2, lung, null);
      // out of the windpipe breathing out, rising and spreading as it leaves
      if (m.dir === -1 && u > 0.85) (y -= (u - 0.85) * 40), (x += Math.sin(m.path * 2.39) * (u - 0.85) * 18);
      const a = Math.sin(Math.PI * u) * 0.75;
      const r = (1.0 + 0.5 * Math.sin(Math.PI * u)) * k * 1.5;
      ctx.globalAlpha = a;
      ctx.drawImage(this.pale, px(x) - r, py(y) - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
