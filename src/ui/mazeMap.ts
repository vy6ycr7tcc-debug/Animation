/* The mind's maze's map (the owner: "give me a map of the maze so I can test it"; then "the maze
   IS the archetypal engine": experience lifts the veil). A button in the maze (bottom right,
   where the round button rests there) or N opens it. It draws only what you have walked and
   touched: the cells walked, round every palm left on a wall, the road in gold, and the
   archetypes and steles once their place is known; the forecourt outside is always open ground.
   Feedback mode (?dev=1) draws all of it, for testing. A tap on a known place sets you there;
   ✕, Escape, N or a tap outside closes it. */
import type { MazeLayout } from "../scenes/mindMaze/area";

export interface MazeMapHost {
  /** The maze's plan, while you are in it. */
  layout(): MazeLayout | null;
  /** Where you stand (room frame) and which way you face (radians, as the player's heading). */
  you(): { x: number; z: number; heading: number };
  /** Set the wanderer at a point (room frame). */
  go(x: number, z: number): void;
  /** Draw all of it, not only what has been walked (feedback mode, for testing). */
  full(): boolean;
}

const INFO = "Pinch or + − to zoom, drag to look round. Tap a walked place to stand there. ◆ steles, numerals the archetypes.";
const ZOOM_MAX = 7;

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
  /** The view: zoom (1 = the whole maze) and the centre's offset from the canvas's middle (CSS
      px). While `follow` holds, a zoomed map keeps you in the middle; a drag lets go of it. */
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private follow = true;
  private readonly ptrs = new Map<number, { x: number; y: number }>();
  private gesture: { moved: boolean; d0: number; z0: number; mx: number; my: number; px: number; py: number } | null = null;

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
    this.sheet.innerHTML = `<div class="mm-head"><span class="mm-title">The mind's maze</span><span class="mm-zoom"><button type="button" class="mm-z" data-z="out" aria-label="Zoom out">−</button><button type="button" class="mm-z" data-z="me" aria-label="Centre on me">⌖</button><button type="button" class="mm-z" data-z="in" aria-label="Zoom in">+</button></span><button type="button" class="mm-close" aria-label="Close the map">✕</button></div>`;
    this.cv = document.createElement("canvas");
    this.info = document.createElement("div");
    this.info.className = "mm-info";
    this.info.textContent = INFO;
    this.sheet.append(this.cv, this.info);
    document.body.appendChild(this.sheet);
    this.sheet.querySelector(".mm-close")!.addEventListener("pointerdown", (e) => (e.stopPropagation(), this.close()));
    for (const b of this.sheet.querySelectorAll<HTMLButtonElement>(".mm-z"))
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const z = b.dataset.z;
        if (z === "me") {
          this.follow = true;
          if (this.zoom < 2.5) this.setZoom(2.5);
        } else this.setZoom(this.zoom * (z === "in" ? 1.6 : 1 / 1.6));
        this.draw();
      });
    this.sheet.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (e.target === this.sheet) this.close();
    });
    // the canvas: one finger drags (or taps to go), two pinch; the wheel zooms about the pointer
    const local = (e: PointerEvent | WheelEvent) => {
      const r = this.cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.cv.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.cv.setPointerCapture?.(e.pointerId);
      this.ptrs.set(e.pointerId, local(e));
      this.startGesture();
    });
    this.cv.addEventListener("pointermove", (e) => {
      const q = local(e);
      this.hover = q;
      if (!this.ptrs.has(e.pointerId)) return;
      this.ptrs.set(e.pointerId, q);
      const g = this.gesture;
      if (!g) return;
      const m = this.mid();
      if (Math.hypot(m.x - g.mx, m.y - g.my) > 8 || this.ptrs.size > 1) g.moved = true;
      if (!g.moved) return;
      this.follow = false;
      if (this.ptrs.size > 1 && g.d0 > 0) {
        // pinch about the fingers' middle: the point under them stays under them
        const z = this.clampZoom(g.z0 * (m.d / g.d0));
        const k = z / g.z0;
        this.zoom = z;
        this.panX = m.x - this.half - (g.mx - this.half - g.px) * k;
        this.panY = m.y - this.half - (g.my - this.half - g.py) * k;
      } else {
        this.panX = g.px + (m.x - g.mx);
        this.panY = g.py + (m.y - g.my);
      }
      this.clampPan();
      this.draw();
    });
    const up = (e: PointerEvent) => {
      if (!this.ptrs.has(e.pointerId)) return;
      const g = this.gesture;
      const q = local(e);
      this.ptrs.delete(e.pointerId);
      if (g && !g.moved && this.ptrs.size === 0 && e.type === "pointerup" && this.revealed(q.x, q.y)) {
        // a tap: stand there (only somewhere already walked or touched)
        this.host.go((q.x - this.cx) / this.scale, (q.y - this.cy) / this.scale);
        this.draw();
      }
      if (this.ptrs.size) this.startGesture();
      else this.gesture = null;
    };
    this.cv.addEventListener("pointerup", up);
    this.cv.addEventListener("pointercancel", up);
    this.cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const q = local(e);
      const z = this.clampZoom(this.zoom * Math.exp(-e.deltaY * 0.0015));
      const k = z / this.zoom;
      this.follow = false;
      this.panX = q.x - this.half - (q.x - this.half - this.panX) * k;
      this.panY = q.y - this.half - (q.y - this.half - this.panY) * k;
      this.zoom = z;
      this.clampPan();
      this.draw();
    }, { passive: false });
    this.cv.addEventListener("pointerleave", () => ((this.hover = null), (this.info.textContent = INFO)));
    window.addEventListener("keydown", (e) => {
      if (e.repeat || (e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      if (e.code === "KeyN" && !this.btn.hidden) (e.preventDefault(), e.stopPropagation(), this.toggle());
      else if (this.shown && (e.key === "+" || e.key === "=")) (e.preventDefault(), this.setZoom(this.zoom * 1.6));
      else if (this.shown && (e.key === "-" || e.key === "_")) (e.preventDefault(), this.setZoom(this.zoom / 1.6));
      else if (e.code === "Escape" && this.shown) (e.preventDefault(), e.stopPropagation(), this.close());
    }, true);
  }

  /** Half the canvas's size (CSS px). */
  private half = 0;
  private clampZoom(z: number): number {
    return Math.min(ZOOM_MAX, Math.max(1, z));
  }
  /** Zoom about the middle of the canvas (or about you, while following). */
  private setZoom(z: number): void {
    z = this.clampZoom(z);
    const k = z / this.zoom;
    this.panX *= k;
    this.panY *= k;
    this.zoom = z;
    if (z === 1) (this.panX = this.panY = 0), (this.follow = true);
    this.clampPan();
  }
  /** Keep some of the map in view: the centre may move at most as far as the zoom allows. */
  private clampPan(): void {
    const lim = this.half * (this.zoom - 1) + this.half * 0.3;
    this.panX = Math.max(-lim, Math.min(lim, this.panX));
    this.panY = Math.max(-lim, Math.min(lim, this.panY));
  }
  private mid(): { x: number; y: number; d: number } {
    const p = [...this.ptrs.values()];
    if (p.length < 2) return { x: p[0]?.x ?? 0, y: p[0]?.y ?? 0, d: 0 };
    return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) };
  }
  private startGesture(): void {
    const m = this.mid();
    this.gesture = { moved: this.gesture?.moved ?? false, d0: m.d, z0: this.zoom, mx: m.x, my: m.y, px: this.panX, py: this.panY };
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

  // the drawn layers, kept until what they show changes: every wall and plaza (`full`), what
  // you have walked and touched (`mask`), and the two together (`shown`)
  private full: HTMLCanvasElement | null = null;
  private layerShown: HTMLCanvasElement | null = null;
  private keyed = "";
  private fullKey = "";

  /** Whether a point on the canvas (CSS px) has been revealed. */
  private revealed(px: number, py: number): boolean {
    if (this.host.full()) return true;
    const L = this.host.layout();
    if (!L) return false;
    const x = (px - this.cx) / this.scale, z = (py - this.cy) / this.scale, r = Math.hypot(x, z);
    if (r > L.outer - 0.6) return true; // the forecourt: open ground
    const k = Math.floor((r - L.rin) / L.cw);
    if (k >= 0) {
      const a = ((Math.atan2(x, z) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      for (let n = 0; n < L.cells.length; n++) {
        const c = L.cells[n];
        if (c.k !== k || !L.visited[n]) continue;
        let d = a - c.a0;
        d -= Math.floor(d / (Math.PI * 2)) * Math.PI * 2;
        if (d <= c.a1 - c.a0) return true;
      }
    }
    for (let i = 0; i < L.markCount; i++) if (Math.hypot(x - L.marks[i * 2], z - L.marks[i * 2 + 1]) < 4.5) return true;
    let near = false;
    L.trail.forEachPoint((tx, tz) => {
      if (!near && Math.hypot(x - tx, z - tz) < 3.5) near = true;
    });
    return near;
  }
  /** The archetypes and steles known, by the reveal's version. */
  private known: boolean[] = [];
  /** The labels placed this frame (x, y, w, h), so none is written over another. */
  private readonly boxes = new Float32Array(4 * 64);
  private knownKey = "";
  private centreKnown = false;

  private draw(): void {
    const L = this.host.layout();
    if (!L) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const box = this.sheet.getBoundingClientRect();
    const cs = getComputedStyle(this.sheet);
    const head = (this.sheet.querySelector(".mm-head") as HTMLElement).offsetHeight + this.info.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 8;
    const size = Math.max(200, Math.min(box.width - 16, box.height - head));
    const W = Math.round(size * dpr);
    if (this.cv.width !== W) {
      this.cv.width = this.cv.height = W;
      this.cv.style.width = this.cv.style.height = `${size}px`;
    }
    const reach = Math.max(L.outer + 34, ...L.doors.map((d) => Math.hypot(d.x, d.z) + 18));
    this.half = size / 2;
    const s = (this.scale = (size / (reach * 2)) * this.zoom);
    if (this.follow && this.zoom > 1) {
      // zoomed and following: you stay in the middle
      const me0 = this.host.you();
      this.panX = -me0.x * s;
      this.panY = -me0.z * s;
      this.clampPan();
    }
    const cx = (this.cx = size / 2 + this.panX), cy = (this.cy = size / 2 + this.panY);
    const X = (x: number) => cx + x * s, Y = (z: number) => cy + z * s;
    const rad = (k: number) => L.rin + L.cw * k;
    const full = this.host.full();
    const layer = () => {
      const c = document.createElement("canvas");
      c.width = c.height = W;
      const g = c.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { c, g };
    };
    // the walls and the plazas, drawn once for a size
    const viewKey = `${W}|${this.zoom.toFixed(4)}|${cx.toFixed(1)}|${cy.toFixed(1)}`;
    if (!this.full || this.fullKey !== viewKey) {
      this.fullKey = viewKey;
      const { c, g } = layer();
      g.fillStyle = "rgba(255, 220, 170, 0.04)";
      g.beginPath();
      g.arc(cx, cy, (L.outer + 12.5) * s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(120, 200, 255, 0.16)";
      for (const p of L.plazas)
        for (const cell of p.cells) {
          g.beginPath();
          g.arc(cx, cy, rad(cell.k + 1) * s, Math.PI / 2 - cell.a0, Math.PI / 2 - cell.a1, true);
          g.arc(cx, cy, rad(cell.k) * s, Math.PI / 2 - cell.a1, Math.PI / 2 - cell.a0, false);
          g.closePath();
          g.fill();
        }
      g.strokeStyle = "rgba(236, 228, 214, 0.85)";
      g.lineCap = "round";
      for (const w of L.arcs) {
        g.lineWidth = Math.max(1, w.d * s);
        g.beginPath();
        g.arc(cx, cy, w.r * s, Math.PI / 2 - w.a0, Math.PI / 2 - w.a1, true);
        g.stroke();
      }
      for (const w of L.boxes) {
        const ux = Math.cos(w.a) * w.w * 0.5, uz = -Math.sin(w.a) * w.w * 0.5;
        g.lineWidth = Math.max(1, w.d * s);
        g.beginPath();
        g.moveTo(X(w.x - ux), Y(w.z - uz));
        g.lineTo(X(w.x + ux), Y(w.z + uz));
        g.stroke();
      }
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `italic ${Math.max(9, Math.min(12, size / 70))}px Georgia, serif`;
      L.plazas.forEach((p, n) => {
        g.fillStyle = "rgba(170, 220, 255, 0.95)";
        g.fillText(`P${n + 1}`, X(p.x), Y(p.z));
      });
      this.full = c;
      this.keyed = "";
    }
    // what you have walked and touched: the veil lifted only there (the owner's design: your
    // marks draw the map)
    const key = `${viewKey}|${L.version}|${full}`;
    if (key !== this.keyed) {
      this.keyed = key;
      const m = layer();
      const g = m.g;
      g.fillStyle = "#fff";
      g.strokeStyle = "#fff";
      // the forecourt round the outside is open ground, always known
      g.beginPath();
      g.arc(cx, cy, (L.outer + 13) * s, 0, Math.PI * 2);
      g.arc(cx, cy, (L.outer - 0.6) * s, 0, Math.PI * 2, true);
      g.fill("evenodd");
      L.cells.forEach((cell, n) => {
        if (!L.visited[n]) return;
        const r0 = rad(cell.k) - 0.7, r1 = rad(cell.k + 1) + 0.7, pad = 0.7 / rad(cell.k + 1);
        g.beginPath();
        g.arc(cx, cy, r1 * s, Math.PI / 2 - cell.a0 + pad, Math.PI / 2 - cell.a1 - pad, true);
        g.arc(cx, cy, Math.max(0, r0) * s, Math.PI / 2 - cell.a1 - pad, Math.PI / 2 - cell.a0 + pad, false);
        g.closePath();
        g.fill();
      });
      for (let i = 0; i < L.markCount; i++) {
        g.beginPath();
        g.arc(X(L.marks[i * 2]), Y(L.marks[i * 2 + 1]), 4.5 * s, 0, Math.PI * 2);
        g.fill();
      }
      // the road: a little round every step (it reaches into the sanctuary too)
      g.lineWidth = 6 * s;
      g.lineCap = g.lineJoin = "round";
      g.beginPath();
      L.trail.forEachPoint((x, z, first) => (first ? g.moveTo(X(x), Y(z)) : g.lineTo(X(x), Y(z))));
      g.stroke();
      const sh = layer();
      sh.g.setTransform(1, 0, 0, 1, 0, 0);
      sh.g.drawImage(this.full!, 0, 0);
      if (!full) {
        sh.g.globalCompositeOperation = "destination-in";
        sh.g.drawImage(m.c, 0, 0);
        sh.g.globalCompositeOperation = "source-over";
      }
      // the road walked, in gold, and the palms left on the walls
      sh.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      sh.g.strokeStyle = "rgba(255, 200, 120, 0.75)";
      sh.g.lineWidth = Math.max(1, 0.5 * s);
      sh.g.lineCap = sh.g.lineJoin = "round";
      sh.g.beginPath();
      L.trail.forEachPoint((x, z, first) => (first ? sh.g.moveTo(X(x), Y(z)) : sh.g.lineTo(X(x), Y(z))));
      sh.g.stroke();
      sh.g.fillStyle = "rgba(255, 214, 140, 1)";
      for (let i = 0; i < L.markCount; i++) {
        sh.g.beginPath();
        sh.g.arc(X(L.marks[i * 2]), Y(L.marks[i * 2 + 1]), 2.4, 0, Math.PI * 2);
        sh.g.fill();
      }
      this.layerShown = sh.c;
    }
    const c = this.cv.getContext("2d")!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, W);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the maze's shape, before it is walked: every ring as a faint unbroken outline (which ways
    // lead through stays unknown until walked), and the sanctuary at its heart
    if (!full) {
      c.strokeStyle = "rgba(236, 228, 214, 0.16)";
      c.lineWidth = 1;
      for (let k = 0; k <= Math.round((L.outer - L.rin) / L.cw); k++) {
        c.beginPath();
        c.arc(cx, cy, rad(k) * s, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.layerShown) c.drawImage(this.layerShown, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // labels: the centre once reached, the way in, the monuments' doors (out in the open)
    c.textAlign = "center";
    c.textBaseline = "middle";
    const font = (px: number, italic = false) => (c.font = `${italic ? "italic " : ""}${px}px Georgia, serif`);
    font(Math.max(12, Math.min(14, size / 30)), true);
    c.fillStyle = "rgba(255, 214, 150, 0.9)";
    if (this.centreKnown) c.fillText("centre", cx, cy);
    c.fillText("way in", cx, Y(L.outer + 6));
    for (const d of L.doors) {
      c.fillStyle = "rgba(255, 196, 120, 0.9)";
      c.beginPath();
      c.arc(X(d.x), Y(d.z), 3, 0, Math.PI * 2);
      c.fill();
      c.fillText(d.id, X(d.x), Y(d.z) + 11);
    }
    // the archetypes and steles, once their place has been walked (or they have been read)
    font(Math.max(10, Math.min(12, size / 36)));
    if (this.knownKey !== this.keyed) {
      this.knownKey = this.keyed;
      this.known = L.arts.map((a) => full || a.lit || this.revealed(X(a.x), Y(a.z)));
      this.centreKnown = full || this.revealed(cx, cy);
    }
    // labels never overlap: each archetype is a dot, and its numeral is written beside it only
    // where it clears every label already placed (outward from the centre first, then inward)
    let placed = 0;
    for (let ai = 0; ai < L.arts.length; ai++) {
      const a = L.arts[ai];
      const x = X(a.x), y = Y(a.z);
      if (!this.known[ai]) continue;
      if (a.arch) {
        const num = a.title.split(" ·")[0];
        const col = a.lit ? "rgba(255, 210, 120, 1)" : "rgba(160, 230, 255, 0.95)";
        c.fillStyle = col;
        c.beginPath();
        c.arc(x, y, 2.2, 0, Math.PI * 2);
        c.fill();
        const w = c.measureText(num).width + 4, hh = 13;
        const rr = Math.hypot(x - cx, y - cy) || 1, ox = (x - cx) / rr, oy = (y - cy) / rr;
        for (const side of [1, -1]) {
          const lx = x + ox * side * (w / 2 + 5), ly = y + oy * side * (hh / 2 + 4);
          let clear = true;
          for (let q = 0; q < placed; q++) {
            const b = this.boxes;
            if (Math.abs(lx - b[q * 4]) < (w + b[q * 4 + 2]) / 2 && Math.abs(ly - b[q * 4 + 1]) < (hh + b[q * 4 + 3]) / 2) {
              clear = false;
              break;
            }
          }
          if (!clear) continue;
          if (placed * 4 + 4 > this.boxes.length) break;
          this.boxes.set([lx, ly, w, hh], placed * 4);
          placed++;
          c.fillText(num, lx, ly);
          break;
        }
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
      this.info.textContent = `x ${hx.toFixed(1)}  z ${hz.toFixed(1)}  ·  r ${Math.hypot(hx, hz).toFixed(1)} m`;
    }
  }
}
