/* The map you begin from. It is drawn from the world's own height function, in the style of
   the drawings: dark ground, fine gold contour lines, a pearl shoreline, and the places where
   the archetypes live marked with their numerals. Tap a place (or anywhere on the land) to
   wake there; the narration begins with the nearest archetype's voice. */
import { heightAt, WATER_Y } from "../world/terrain";

export interface Place {
  numeral: string; // "" for the shore
  label: string;
  x: number;
  z: number;
  narration: string;
  start: { x: number; z: number; heading: number };
}
export interface Choice {
  place: Place; // the nearest place: its narration comes first
  x: number;
  z: number;
  heading: number;
}

const RES = 220;

export class StartMap {
  private el = document.getElementById("map") as HTMLDivElement;
  private canvas = document.getElementById("map-canvas") as HTMLCanvasElement;
  private list = document.getElementById("map-places") as HTMLDivElement;
  private closeBtn = document.getElementById("map-close") as HTMLButtonElement;
  private places: Place[] = [];
  private you: { x: number; z: number } | null = null;
  private base: HTMLCanvasElement | null = null;
  private box = { x0: 0, z0: 0, size: 1 };
  private hover = -1;
  private resolve: ((c: Choice | null) => void) | null = null;

  constructor() {
    this.canvas.addEventListener("pointermove", (e) => {
      const h = this.hit(e);
      if (h !== this.hover) {
        this.hover = h;
        this.draw();
      }
    });
    this.canvas.addEventListener("pointerup", (e) => {
      const [px, py] = this.local(e);
      const h = this.hit(e);
      if (h >= 0) this.choose(this.places[h]);
      else this.chooseAt(this.toWorldX(px), this.toWorldZ(py));
    });
    this.closeBtn.addEventListener("click", () => this.finish(null));
    addEventListener("resize", () => !this.el.hidden && this.layout());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** Show the map. Resolves with where to begin, or null if closed (only when closable). */
  open(places: Place[], you: { x: number; z: number } | null, closable: boolean): Promise<Choice | null> {
    this.places = places;
    this.you = you;
    this.closeBtn.hidden = !closable;
    // frame all the places, with room around them
    const xs = places.map((p) => p.x).concat(you ? [you.x] : []), zs = places.map((p) => p.z).concat(you ? [you.z] : []);
    const x0 = Math.min(...xs) - 70, x1 = Math.max(...xs) + 70, z0 = Math.min(...zs) - 70, z1 = Math.max(...zs) + 70;
    const size = Math.max(x1 - x0, z1 - z0);
    this.box = { x0: (x0 + x1) / 2 - size / 2, z0: (z0 + z1) / 2 - size / 2, size };
    this.base = this.renderGround();
    this.list.replaceChildren(
      ...places.map((p) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = p.numeral ? `${p.numeral} · ${p.label}` : p.label;
        b.addEventListener("click", () => this.choose(p));
        b.addEventListener("focus", () => ((this.hover = places.indexOf(p)), this.draw()));
        return b;
      }),
    );
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add("on"));
    this.layout();
    (this.list.firstElementChild as HTMLButtonElement | null)?.focus({ preventScroll: true });
    return new Promise((res) => (this.resolve = res));
  }

  private finish(c: Choice | null): void {
    this.el.classList.remove("on");
    window.setTimeout(() => (this.el.hidden = true), 600);
    const r = this.resolve;
    this.resolve = null;
    r?.(c);
  }

  private choose(p: Place): void {
    this.finish({ place: p, ...p.start });
  }

  private chooseAt(x: number, z: number): void {
    let best = this.places[0], bd = Infinity;
    for (const p of this.places) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) (bd = d), (best = p);
    }
    // wake facing the nearest place
    this.finish({ place: best, x, z, heading: Math.atan2(-(best.x - x), -(best.z - z)) });
  }

  /* ---------------------------------------------------------------- drawing */
  private layout(): void {
    const s = Math.floor(Math.min(innerWidth * 0.92, innerHeight * 0.62, 640));
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.style.width = this.canvas.style.height = `${s}px`;
    this.canvas.width = this.canvas.height = Math.round(s * dpr);
    this.draw();
  }

  private toMapX(x: number): number {
    return ((x - this.box.x0) / this.box.size) * this.canvas.width;
  }
  private toMapY(z: number): number {
    return ((z - this.box.z0) / this.box.size) * this.canvas.height;
  }
  private toWorldX(px: number): number {
    return this.box.x0 + (px / this.canvas.width) * this.box.size;
  }
  private toWorldZ(py: number): number {
    return this.box.z0 + (py / this.canvas.height) * this.box.size;
  }
  private local(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * this.canvas.width, ((e.clientY - r.top) / r.height) * this.canvas.height];
  }
  private hit(e: PointerEvent): number {
    const [px, py] = this.local(e);
    const reach = 30 * (this.canvas.width / this.canvas.getBoundingClientRect().width);
    let best = -1, bd = reach;
    this.places.forEach((p, i) => {
      const d = Math.hypot(this.toMapX(p.x) - px, this.toMapY(p.z) - py);
      if (d < bd) (bd = d), (best = i);
    });
    return best;
  }

  /** The ground as the drawings would have it, once per opening. */
  private renderGround(): HTMLCanvasElement {
    const n = RES + 1;
    const h = new Float32Array(n * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) h[j * n + i] = heightAt(this.box.x0 + (i / RES) * this.box.size, this.box.z0 + (j / RES) * this.box.size);
    const c = document.createElement("canvas");
    c.width = c.height = RES;
    const g = c.getContext("2d")!;
    const img = g.createImageData(RES, RES);
    const mix = (a: number[], b: number[], t: number) => a.map((v, k) => v + (b[k] - v) * Math.min(1, Math.max(0, t)));
    for (let j = 0; j < RES; j++)
      for (let i = 0; i < RES; i++) {
        const v = h[j * n + i], vr = h[j * n + i + 1], vd = h[(j + 1) * n + i];
        let col: number[];
        if (v < WATER_Y) {
          col = mix([24, 28, 74], [10, 11, 34], -v / 12);
          // faint lines on the water, like the drawings' waves
          if (Math.sin((i + j * 0.3) * 0.9) > 0.97) col = mix(col, [60, 64, 120], 0.5);
        } else {
          col = mix([44, 37, 72], [86, 72, 104], v / 40);
          const shade = Math.max(-1, Math.min(1, (v - vr + (v - vd)) * 0.35)); // light from the north-west
          col = col.map((x) => x * (0.85 + shade * 0.25));
          // contour lines every three metres, in gold
          if (Math.floor(v / 3) !== Math.floor(vr / 3) || Math.floor(v / 3) !== Math.floor(vd / 3)) col = mix(col, [226, 184, 110], 0.45);
        }
        // the shoreline, in pearl
        if ((v < WATER_Y) !== (vr < WATER_Y) || (v < WATER_Y) !== (vd < WATER_Y)) col = [236, 226, 206];
        img.data.set([col[0], col[1], col[2], 255], (j * RES + i) * 4);
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  private draw(): void {
    const g = this.canvas.getContext("2d")!;
    const W = this.canvas.width, k = W / 400;
    g.clearRect(0, 0, W, W);
    if (this.base) {
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(this.base, 0, 0, W, W);
    }
    // a soft vignette, so the map fades at its edges like old paper in the dark
    const v = g.createRadialGradient(W / 2, W / 2, W * 0.3, W / 2, W / 2, W * 0.72);
    v.addColorStop(0, "rgba(11,10,28,0)");
    v.addColorStop(1, "rgba(11,10,28,0.95)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, W);

    g.textBaseline = "middle";
    const serif = '"Iowan Old Style", Palatino, Georgia, serif';
    if (this.you) {
      const x = this.toMapX(this.you.x), y = this.toMapY(this.you.z);
      g.fillStyle = "rgba(244,239,230,0.9)";
      g.beginPath();
      g.arc(x, y, 3.5 * k, 0, Math.PI * 2);
      g.fill();
      g.font = `italic ${11 * k}px ${serif}`;
      g.fillText("where you were", x + 8 * k, y);
    }
    this.places.forEach((p, i) => {
      const x = this.toMapX(p.x), y = this.toMapY(p.z);
      const on = i === this.hover;
      g.save();
      g.shadowColor = "rgba(255,210,150,0.9)";
      g.shadowBlur = (on ? 18 : 8) * k;
      g.strokeStyle = on ? "#fff4dc" : "rgba(226,191,126,0.95)";
      g.lineWidth = (on ? 2 : 1.3) * k;
      g.fillStyle = "rgba(11,10,28,0.75)";
      g.beginPath();
      g.arc(x, y, (on ? 15 : 12) * k, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
      g.fillStyle = "#f4efe6";
      if (p.numeral) {
        g.font = `${(p.numeral.length > 2 ? 9 : 11) * k}px ${serif}`;
        g.textAlign = "center";
        g.fillText(p.numeral, x, y + 0.5 * k);
      } else {
        // the shore: a small spiral, the drawings' own mark
        g.strokeStyle = "#f4efe6";
        g.lineWidth = 1 * k;
        g.beginPath();
        for (let s = 0; s <= 60; s++) {
          const a = (s / 60) * Math.PI * 5, r = (s / 60) * 8 * k;
          if (s) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          else g.moveTo(x, y);
        }
        g.stroke();
      }
      g.textAlign = x > W * 0.7 ? "right" : "left";
      g.font = `italic ${(on ? 13 : 12) * k}px ${serif}`;
      g.fillStyle = on ? "#fff4dc" : "rgba(244,239,230,0.85)";
      g.shadowColor = "rgba(0,0,0,0.9)";
      g.shadowBlur = 6 * k;
      g.fillText(p.label, x + (x > W * 0.7 ? -19 : 19) * k, y);
      g.shadowBlur = 0;
    });
  }
}
