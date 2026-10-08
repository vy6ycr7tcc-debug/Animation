/* The lungs over the view while you breathe (main.ts breathCueFrame): a body of small blue lights in
   the shape of a pair of lungs, the owner's "use the particles… that shape but dynamic, expanding,
   holding and deflating". Each light has its own place in the shape (the outline drawn denser than
   the inside, the bronchi fine), its own drift and flicker; the whole swells outward and down from
   the airway as you breathe in, shimmers while you hold, and settles as you release. A few motes
   travel the airway: down into the lungs on the inhale, up and away on the release. Canvas 2D,
   additive, one prerendered sprite: cheap on a phone. */

const LOBES = [
  "M54 24 C40 26 22 40 16 64 C11 86 18 103 33 104 C45 105 52 96 53 84 C54 66 55 42 54 24 Z",
  "M66 24 C80 26 98 40 104 64 C109 86 102 103 87 104 C75 105 68 96 67 84 C66 66 65 42 66 24 Z",
];
const AIRWAYS = [
  "M60 3 V30",
  "M60 30 C55 35 49 38 43 44 C37 52 33 60 31 72",
  "M60 30 C65 35 71 38 77 44 C83 52 87 60 89 72",
  "M43 44 C44 56 42 68 40 86",
  "M77 44 C76 56 78 68 80 86",
  "M37 56 C30 60 26 66 23 76",
  "M83 56 C90 60 94 66 97 76",
];
/** Where the lungs hang from: they swell away from here. */
const HILUM = { x: 60, y: 28 };
/** The drawing's frame (shape units), with room round the shape to swell into. */
const FRAME = { x: -10, y: -14, w: 140, h: 132 };

interface Dot {
  x: number;
  y: number;
  /** 0 inside, 1 outline, 2 airway */
  kind: number;
  size: number;
  ph: number;
  sp: number;
}
interface Mote {
  t: number;
  life: number;
  dx: number;
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

export class LungParticles {
  private ctx: CanvasRenderingContext2D | null;
  private dots: Dot[] = [];
  private motes: Mote[] = [];
  private sprite: HTMLCanvasElement;
  private trunk: { x: number; y: number }[];
  private last = 0;
  private t = 0;
  private spawn = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
    // one soft blue-white light, drawn once
    const s = (this.sprite = document.createElement("canvas"));
    s.width = s.height = 32;
    const g = s.getContext("2d")!;
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, "rgba(235,246,255,1)");
    r.addColorStop(0.25, "rgba(150,205,255,0.75)");
    r.addColorStop(0.6, "rgba(70,130,220,0.22)");
    r.addColorStop(1, "rgba(40,80,180,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);

    const rnd = mulberry(7);
    const add = (x: number, y: number, kind: number, size: number) =>
      this.dots.push({ x, y, kind, size, ph: rnd() * Math.PI * 2, sp: 0.6 + rnd() * 1.4 });
    // the outline, denser: the shape reads at a glance
    for (const d of LOBES) for (const q of samplePath(d, 1.15)) add(q.x + (rnd() - 0.5) * 1.6, q.y + (rnd() - 0.5) * 1.6, 1, 0.8 + rnd() * 0.6);
    // the inside, thinning toward the middle of each lobe like breath held in tissue
    const probe = this.ctx;
    const paths = LOBES.map((d) => new Path2D(d));
    let n = 0;
    for (let tries = 0; n < 620 && tries < 20000; tries++) {
      const x = 12 + rnd() * 96, y = 22 + rnd() * 84;
      if (!probe || !paths.some((p) => probe.isPointInPath(p, x, y))) continue;
      add(x, y, 0, 0.45 + rnd() * 0.75);
      n++;
    }
    // the airway and its branches, fine
    for (const d of AIRWAYS) for (const q of samplePath(d, 1.6)) add(q.x + (rnd() - 0.5) * 0.8, q.y + (rnd() - 0.5) * 0.8, 2, 0.45 + rnd() * 0.35);
    this.trunk = samplePath(AIRWAYS[0] + " " + AIRWAYS[1].slice(AIRWAYS[1].indexOf("C")), 1);
    if (!this.trunk.length) this.trunk = [{ x: 60, y: 3 }, { x: 60, y: 30 }];
  }

  /** Each frame while shown: `open` 0..1 (the breath's own eased fullness), its phase. */
  draw(open: number, phase: string, still: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, this.last ? now - this.last : 0.016);
    this.last = now;
    this.t += dt;
    if (still) open = 0.6;

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

    // the swell: outward and down from the hilum, a little more at the base, as real lungs fill
    const sx = 0.8 + 0.26 * open, sy = 0.84 + 0.2 * open;
    const hold = phase === "hold" ? 1 : 0;
    const bright = 0.42 + 0.5 * open;
    const t = still ? 0 : this.t;
    for (const d of this.dots) {
      const base = d.kind === 2 ? 0.25 : 1; // the airway barely moves
      const fx = 1 + (sx - 1) * base, fy = 1 + (sy - 1) * base * (0.7 + 0.5 * ((d.y - 24) / 80));
      // each light drifts on its own slow path; in the hold, a fine shimmer
      const w = d.kind === 1 ? 0.5 : 0.9;
      const jx = Math.sin(t * d.sp + d.ph) * w + Math.sin(t * 7 * d.sp + d.ph * 3) * 0.18 * hold;
      const jy = Math.cos(t * d.sp * 0.8 + d.ph) * w;
      const x = HILUM.x + (d.x - HILUM.x) * fx + jx;
      const y = HILUM.y + (d.y - HILUM.y) * fy + jy;
      const flick = 0.75 + 0.25 * Math.sin(t * 2.3 * d.sp + d.ph);
      const a = bright * flick * (d.kind === 1 ? 0.95 : d.kind === 2 ? 0.95 : 0.55);
      const r = d.size * k * (d.kind === 0 ? 1.6 + 0.6 * open : d.kind === 2 ? 1.9 : 1.5);
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(this.sprite, px(x) - r, py(y) - r, r * 2, r * 2);
    }

    // the breath itself: motes down the airway on the inhale, up and away on the release
    if (!still && (phase === "in" || phase === "out")) {
      this.spawn += dt * 9;
      while (this.spawn >= 1) {
        this.spawn--;
        this.motes.push({ t: 0, life: 1.6 + Math.random() * 0.8, dx: (Math.random() - 0.5) * 6, dir: phase === "in" ? 1 : -1 });
      }
    }
    const L = this.trunk.length - 1;
    this.motes = this.motes.filter((m) => (m.t += dt) < m.life);
    for (const m of this.motes) {
      const u = m.t / m.life;
      let x: number, y: number;
      if (m.dir === 1) {
        // from above, down the windpipe into the lung
        const q = this.trunk[Math.min(L, Math.floor(u * L))];
        x = q.x + m.dx * (1 - u) * 0.6;
        y = q.y - (1 - u) * 10;
        if (m.dx < 0) x = 120 - x; // half go to each lung
      } else {
        // out of the windpipe and up, spreading and fading
        x = 60 + m.dx * u * 1.8;
        y = 6 - u * 18;
      }
      const a = Math.sin(Math.PI * u) * 0.8;
      const r = (0.9 + 0.6 * (m.dir === -1 ? u : 1 - u)) * k * 1.6;
      ctx.globalAlpha = a;
      ctx.drawImage(this.sprite, px(x) - r, py(y) - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
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
