/* The mind's maze's map (the owner: "give me a map of the maze so I can test it"). A button in
   the maze (bottom right, where the round button rests there) or N opens it: the walls from above
   (the way in at the foot, the sanctuary in the middle), the plazas, the archetypes by numeral
   (gold once read), the steles, the monuments' doors, and you, an arrow. A tap anywhere on it sets
   you there (for testing); ✕, Escape, N or a tap outside closes it. */
import type { MazeLayout } from "../scenes/mindMaze/area";

export interface MazeMapHost {
  /** The maze's plan, while you are in it. */
  layout(): MazeLayout | null;
  /** Where you stand (room frame) and which way you face (radians, as the player's heading). */
  you(): { x: number; z: number; heading: number };
  /** Set the wanderer at a point (room frame). */
  go(x: number, z: number): void;
}

export class MazeMap {
  readonly btn: HTMLButtonElement;
  private readonly sheet: HTMLDivElement;
  private readonly cv: HTMLCanvasElement;
  private readonly info: HTMLDivElement;
  private shown = false;
  private scale = 1;
  private cx = 0;
  private cy = 0;
  private hover: { x: number; y: number } | null = null;

  constructor(private readonly host: MazeMapHost) {
    this.btn = document.createElement("button");
    this.btn.id = "maze-map-btn";
    this.btn.type = "button";
    this.btn.setAttribute("aria-label", "Map of the maze (N)");
    this.btn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="12" cy="12" r="10"/><path d="M12 2.6v3.2M12 6.8a5.2 5.2 0 1 1-5 3.8M12 9.6a2.4 2.4 0 1 0 2.4 2.4"/></svg>`;
    this.btn.hidden = true;
    const act = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    };
    this.btn.addEventListener("pointerdown", act);
    this.btn.addEventListener("click", (e) => e.preventDefault());
    document.body.appendChild(this.btn);

    this.sheet = document.createElement("div");
    this.sheet.id = "maze-map";
    this.sheet.hidden = true;
    this.sheet.innerHTML = `<div class="mm-head"><span class="mm-title">The mind's maze</span><button type="button" class="mm-close" aria-label="Close the map">✕</button></div>`;
    this.cv = document.createElement("canvas");
    this.info = document.createElement("div");
    this.info.className = "mm-info";
    this.info.textContent = "Tap anywhere to stand there · ◆ steles · numerals the archetypes (gold once read) · ▢ plazas";
    this.sheet.append(this.cv, this.info);
    document.body.appendChild(this.sheet);
    this.sheet.querySelector(".mm-close")!.addEventListener("pointerdown", (e) => (e.stopPropagation(), this.close()));
    this.sheet.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (e.target !== this.cv) return void this.close();
      const r = this.cv.getBoundingClientRect();
      const x = (e.clientX - r.left - this.cx) / this.scale, z = (e.clientY - r.top - this.cy) / this.scale;
      this.host.go(x, z);
      this.draw();
    });
    this.cv.addEventListener("pointermove", (e) => {
      const r = this.cv.getBoundingClientRect();
      this.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    this.cv.addEventListener("pointerleave", () => (this.hover = null));
    window.addEventListener("keydown", (e) => {
      if (e.repeat || (e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      if (e.code === "KeyN" && !this.btn.hidden) (e.preventDefault(), e.stopPropagation(), this.toggle());
      else if (e.code === "Escape" && this.shown) (e.preventDefault(), e.stopPropagation(), this.close());
    }, true);
  }

  get isOpen(): boolean {
    return this.shown;
  }
  toggle(): void {
    if (this.shown) this.close();
    else this.open();
  }
  open(): void {
    if (!this.host.layout()) return;
    this.shown = true;
    this.sheet.hidden = false;
    document.body.classList.add("mazemapping");
    this.draw();
  }
  close(): void {
    this.shown = false;
    this.sheet.hidden = true;
    document.body.classList.remove("mazemapping");
  }

  /** Each frame: the button shows in the maze; an open map follows you. */
  frame(inMaze: boolean): void {
    this.btn.hidden = !inMaze;
    if (!inMaze && this.shown) this.close();
    if (this.shown) this.draw();
  }

  private draw(): void {
    const L = this.host.layout();
    if (!L) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const box = this.sheet.getBoundingClientRect();
    const head = (this.sheet.querySelector(".mm-head") as HTMLElement).offsetHeight + this.info.offsetHeight + 24;
    const size = Math.max(200, Math.min(box.width - 16, box.height - head));
    if (this.cv.width !== Math.round(size * dpr)) {
      this.cv.width = this.cv.height = Math.round(size * dpr);
      this.cv.style.width = this.cv.style.height = `${size}px`;
    }
    const c = this.cv.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    const reach = Math.max(L.outer + 34, ...L.doors.map((d) => Math.hypot(d.x, d.z) + 18));
    const s = (this.scale = size / (reach * 2));
    const cx = (this.cx = size / 2), cy = (this.cy = size / 2);
    const X = (x: number) => cx + x * s, Y = (z: number) => cy + z * s;
    // the forecourt
    c.fillStyle = "rgba(255, 220, 170, 0.04)";
    c.beginPath();
    c.arc(cx, cy, (L.outer + 12.5) * s, 0, Math.PI * 2);
    c.fill();
    // the plazas: their cells shaded
    const rad = (k: number) => L.rin + L.cw * k;
    c.fillStyle = "rgba(120, 200, 255, 0.16)";
    for (const p of L.plazas)
      for (const cell of p.cells) {
        c.beginPath();
        c.arc(cx, cy, rad(cell.k + 1) * s, Math.PI / 2 - cell.a0, Math.PI / 2 - cell.a1, true);
        c.arc(cx, cy, rad(cell.k) * s, Math.PI / 2 - cell.a1, Math.PI / 2 - cell.a0, false);
        c.closePath();
        c.fill();
      }
    // the walls
    c.strokeStyle = "rgba(236, 228, 214, 0.85)";
    c.lineCap = "round";
    for (const w of L.arcs) {
      c.lineWidth = Math.max(1, w.d * s);
      c.beginPath();
      c.arc(cx, cy, w.r * s, Math.PI / 2 - w.a0, Math.PI / 2 - w.a1, true);
      c.stroke();
    }
    for (const w of L.boxes) {
      const ux = Math.cos(w.a) * w.w * 0.5, uz = -Math.sin(w.a) * w.w * 0.5;
      c.lineWidth = Math.max(1, w.d * s);
      c.beginPath();
      c.moveTo(X(w.x - ux), Y(w.z - uz));
      c.lineTo(X(w.x + ux), Y(w.z + uz));
      c.stroke();
    }
    // labels
    c.textAlign = "center";
    c.textBaseline = "middle";
    const font = (px: number, italic = false) => (c.font = `${italic ? "italic " : ""}${px}px Georgia, serif`);
    font(Math.max(9, Math.min(12, size / 70)), true);
    L.plazas.forEach((p, n) => {
      c.fillStyle = "rgba(170, 220, 255, 0.95)";
      c.fillText(`P${n + 1}`, X(p.x), Y(p.z));
    });
    c.fillStyle = "rgba(255, 214, 150, 0.9)";
    c.fillText("centre", cx, cy);
    c.fillText("way in", cx, Y(L.outer + 6));
    for (const d of L.doors) {
      c.fillStyle = "rgba(255, 196, 120, 0.9)";
      c.beginPath();
      c.arc(X(d.x), Y(d.z), 3, 0, Math.PI * 2);
      c.fill();
      c.fillText(d.id, X(d.x), Y(d.z) + 11);
    }
    // the archetypes and steles
    font(Math.max(8, Math.min(11, size / 80)));
    for (const a of L.arts) {
      const x = X(a.x), y = Y(a.z);
      if (a.arch) {
        const num = a.title.split(" ·")[0];
        c.fillStyle = a.lit ? "rgba(255, 210, 120, 1)" : "rgba(160, 230, 255, 0.95)";
        c.fillText(num, x, y);
      } else {
        c.fillStyle = a.lit ? "rgba(255, 210, 120, 1)" : "rgba(200, 160, 255, 0.95)";
        c.beginPath();
        c.moveTo(x, y - 4);
        c.lineTo(x + 3.2, y);
        c.lineTo(x, y + 4);
        c.lineTo(x - 3.2, y);
        c.closePath();
        c.fill();
      }
    }
    // you
    const me = this.host.you();
    const h = me.heading;
    const fx = -Math.sin(h), fz = -Math.cos(h); // the way you face
    const px = X(me.x), py = Y(me.z), r = 7;
    c.fillStyle = "#fff";
    c.strokeStyle = "rgba(0, 0, 0, 0.6)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(px + fx * r * 1.4, py + fz * r * 1.4);
    c.lineTo(px - fz * r * 0.7 - fx * r * 0.7, py + fx * r * 0.7 - fz * r * 0.7);
    c.lineTo(px + fz * r * 0.7 - fx * r * 0.7, py - fx * r * 0.7 - fz * r * 0.7);
    c.closePath();
    c.stroke();
    c.fill();
    // the hovered point's coordinates (desktop), for placing things
    if (this.hover) {
      const hx = (this.hover.x - cx) / s, hz = (this.hover.y - cy) / s;
      this.info.textContent = `x ${hx.toFixed(1)}  z ${hz.toFixed(1)}  ·  r ${Math.hypot(hx, hz).toFixed(1)} m  ·  tap to stand there`;
    }
  }
}
