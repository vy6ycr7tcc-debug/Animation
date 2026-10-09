/* The map you begin from, and travel by. It is drawn from the world's own height function, in
   the style of the drawings: dark ground, fine gold contour lines, a pearl shoreline, and the
   homes of the twenty-two archetypes marked with their numerals.
   - Drag to move the map; pinch, scroll or use − / + to come closer or see it all.
   - Tap a place (or its name below the map) and you go there. Tapping open land takes you to
     that spot, and the nearest archetype's voice comes first.
   - Each group has its own mark, so nothing depends on colour alone: the Mind a circle, the
     Body a diamond, the Spirit a triangle, the Choice a star. The archive's vessels have small pale
   marks: a round tree for a grove, a tall diamond for a crystal garden, a ringed disc for a planet, a four-pointed sparkle for a star. A wave beneath a mark means its
     home is in the deep: you wake on the water above it. */
import { heightAt, WATER_Y } from "../world/terrain";

export type Group = "Shore" | "Mind" | "Body" | "Spirit" | "Choice" | "Deep";
/** Where a place is listed below the map: by kind, the ancient worlds by era. */
export type Section = "Monuments" | "Ancient" | "Lessons" | "Archetypes" | "Deep";
export interface Place {
  numeral: string; // "" for the shore
  label: string;
  group: Group;
  /** Its tab below the map (archetypes and the deep by their group; anything else Monuments). */
  section?: Section;
  /** A short note under its name: an ancient world's era. */
  note?: string;
  /** Its order in its tab (lower first; the ancient worlds oldest first). */
  order?: number;
  deep?: boolean;
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

const RES = 360;
const GROUPS: { g: Group; title: string }[] = [
  { g: "Shore", title: "" },
  { g: "Mind", title: "The Mind" },
  { g: "Body", title: "The Body" },
  { g: "Spirit", title: "The Spirit" },
  { g: "Choice", title: "The Choice" },
  { g: "Deep", title: "Beneath the water" },
];
const INK: Record<Group, string> = {
  Shore: "rgba(244,239,230,0.95)",
  Mind: "rgba(190,210,255,0.95)",
  Body: "rgba(240,196,130,0.95)",
  Spirit: "rgba(206,170,255,0.95)",
  Choice: "rgba(255,246,228,0.98)",
  Deep: "rgba(150,225,215,0.95)",
};
/** The places that aren't archetypes, by their tab: monuments gold, ancient worlds sand, lessons rose. */
const SECTION_INK: Partial<Record<Section, string>> = {
  Monuments: "rgba(236,200,130,0.95)",
  Ancient: "rgba(232,176,128,0.95)",
  Lessons: "rgba(240,184,206,0.95)",
  Deep: INK.Deep,
};
const SERIF = '"Iowan Old Style", Palatino, Georgia, serif';

interface View {
  cx: number;
  cz: number;
  size: number; // world metres across the canvas
}

export class StartMap {
  /** The archive's vessels (groves, crystal gardens, planets, stars): marked, not places to wake. */
  sky: { x: number; z: number; kind: "planet" | "star" | "grove" | "crystal"; label: string }[] = [];
  private el = document.getElementById("map") as HTMLDivElement;
  private canvas = document.getElementById("map-canvas") as HTMLCanvasElement;
  private list = document.getElementById("map-places") as HTMLDivElement;
  private closeBtn = document.getElementById("map-close") as HTMLButtonElement;
  private pick = document.getElementById("map-pick") as HTMLDivElement;
  private pickName = document.getElementById("map-pick-name") as HTMLParagraphElement;
  private goBtn = document.getElementById("map-go") as HTMLButtonElement;
  private continueBtn = document.getElementById("map-continue") as HTMLButtonElement;
  private guideBtn = document.getElementById("map-guide") as HTMLButtonElement;
  /** The walk-throughs (end to end, the narrations timed): a tab of their own, each marked once walked. */
  tours: { id: string; label: string; walked: boolean }[] = [];
  onTour: ((id: string) => void) | null = null;
  /** The whispers found so far (world/whispers.ts): a quiet list, each heard again on a tap. */
  whispers: { id: string; label: string; note: string }[] = [];
  onWhisper: ((id: string) => void) | null = null;
  /** "Ask the guide" (while travelling): the map closes and the guide asks where to go. */
  onGuide: (() => void) | null = null;
  private places: Place[] = [];
  private you: { x: number; z: number; heading?: number } | null = null;
  private view: View = { cx: 0, cz: 0, size: 1000 };
  private all: View = { cx: 0, cz: 0, size: 1000 };
  /** The ground, drawn for some stretch of the world: re-drawn sharper after you zoom. */
  private base: { img: HTMLCanvasElement; box: View } | null = null;
  private baseTimer = 0;
  private selected: { place: Place; x: number; z: number } | null = null;
  private resolve: ((c: Choice | null) => void) | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { moved: number; t: number; pinch: number } | null = null;

  constructor() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) this.gesture = { moved: 0, t: performance.now(), pinch: 0 };
      else if (this.gesture) this.gesture.pinch = this.spread();
    });
    c.addEventListener("pointermove", (e) => {
      const last = this.pointers.get(e.pointerId);
      if (!last || !this.gesture) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.gesture.moved += Math.hypot(dx, dy);
      const k = this.view.size / c.getBoundingClientRect().width;
      if (this.pointers.size === 1) {
        this.view.cx -= dx * k;
        this.view.cz -= dy * k;
      } else if (this.pointers.size === 2) {
        const s = this.spread();
        if (this.gesture.pinch > 0 && s > 0) this.zoomBy(this.gesture.pinch / s, ...this.mid());
        this.gesture.pinch = s;
      }
      this.changed();
    });
    const up = (e: PointerEvent) => {
      const g = this.gesture;
      this.pointers.delete(e.pointerId);
      if (!this.pointers.size) this.gesture = null;
      if (g && e.type === "pointerup" && !this.pointers.size && g.moved < 10 && g.pinch === 0) this.tapAt(e);
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY);
      this.changed();
    }, { passive: false });
    document.getElementById("map-in")!.addEventListener("click", () => (this.zoomBy(0.6), this.changed()));
    document.getElementById("map-out")!.addEventListener("click", () => (this.zoomBy(1 / 0.6), this.changed()));
    document.getElementById("map-all")!.addEventListener("click", () => ((this.view = { ...this.all }), this.changed()));
    this.goBtn.addEventListener("click", () => this.go());
    this.continueBtn.addEventListener("click", () => {
      const y = this.you;
      if (!y) return;
      const p = this.nearest(y.x, y.z);
      this.finish({ place: p, x: y.x, z: y.z, heading: y.heading ?? Math.atan2(-(p.x - y.x), -(p.z - y.z)) });
    });
    this.closeBtn.addEventListener("click", () => this.finish(null));
    this.guideBtn.addEventListener("click", () => {
      this.finish(null);
      this.onGuide?.();
    });
    addEventListener("resize", () => !this.el.hidden && this.layout());
    addEventListener("keydown", (e) => {
      if (this.el.hidden) return;
      if (e.key === "+" || e.key === "=") this.zoomBy(0.7), this.changed();
      if (e.key === "-") this.zoomBy(1 / 0.7), this.changed();
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** Show the map. Resolves with where to begin, or null if closed (only when closable).
      `resume`: offer to continue where you were (coming back to a saved journey). */
  open(places: Place[], you: { x: number; z: number; heading?: number } | null, closable: boolean, resume = false): Promise<Choice | null> {
    this.places = places;
    this.you = you;
    this.closeBtn.hidden = !closable;
    document.getElementById("map-title")!.textContent = closable ? "Where would you like to go?" : "Where will you begin?";
    this.guideBtn.hidden = !closable;
    this.continueBtn.hidden = !(resume && you);
    this.selected = null;
    this.showPick();
    // the whole world of places, with room around them
    const xs = places.map((p) => p.x).concat(you ? [you.x] : []), zs = places.map((p) => p.z).concat(you ? [you.z] : []);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    this.all = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, size: Math.max(x1 - x0, z1 - z0) * 1.25 + 300 };
    // travelling: begin close around where you are; the first time: see it all
    this.view = you ? { cx: you.x, cz: you.z, size: Math.min(this.all.size, 1600) } : { ...this.all };
    this.base = null;
    this.list.replaceChildren(...this.buildList());
    this.el.hidden = false;
    document.body.classList.add("mapping");
    requestAnimationFrame(() => this.el.classList.add("on"));
    this.layout();
    this.renderBase();
    // focus the open tab (focusing the first place chose it, and drew a box round the shore)
    (this.continueBtn.hidden ? (this.list.querySelector('.map-tabs [aria-selected="true"]') as HTMLButtonElement | null) : this.continueBtn)?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    return new Promise((res) => (this.resolve = res));
  }

  /** The places below the map: the way back to the shore, then one tab of places at a time,
      by kind (the monuments, the ancient worlds by era, the lessons, the archetypes by realm,
      the deep, the tours). Any destination is two taps away: its tab, then its name. Each name
      says which way it lies and how far, from where you stand. */
  private tab: Section | "Tours" | "Whispers" = "Monuments";
  private sectionOf(p: Place): Section {
    if (p.section) return p.section;
    if (p.group === "Deep") return "Deep";
    if (p.group !== "Shore") return "Archetypes";
    return "Monuments";
  }
  private buildList(): HTMLElement[] {
    const head = document.createElement("div");
    head.className = "map-head";
    const shore = this.places.find((q) => q.label === "The shore");
    if (shore) {
      const b = this.placeButton(shore, "⌂ The shore");
      b.classList.add("map-home");
      head.append(b);
    }
    const tabs = document.createElement("div");
    tabs.className = "map-tabs";
    tabs.setAttribute("role", "tablist");
    head.append(tabs);
    const body = document.createElement("div");
    body.className = "map-group";
    const SECTIONS: { s: Section | "Tours" | "Whispers"; title: string }[] = [
      { s: "Monuments", title: "Monuments" },
      { s: "Ancient", title: "Ancient" },
      { s: "Lessons", title: "Lessons" },
      { s: "Archetypes", title: "Archetypes" },
      { s: "Deep", title: "Deep" },
      { s: "Tours", title: "Tours" },
      { s: "Whispers", title: "Whispers" },
    ];
    const has = (s: Section | "Tours" | "Whispers") =>
      s === "Tours" ? this.tours.length > 0 && !this.closeBtn.hidden : s === "Whispers" ? this.whispers.length > 0 && !this.closeBtn.hidden : this.places.some((q) => q !== shore && this.sectionOf(q) === s);
    const shown = SECTIONS.filter(({ s }) => has(s));
    const show = (s: Section | "Tours" | "Whispers") => {
      this.tab = s;
      for (const b of tabs.children) b.setAttribute("aria-selected", String((b as HTMLElement).dataset.s === s));
      body.className = s === "Archetypes" ? "map-group map-realms" : "map-group";
      body.replaceChildren(...(s === "Tours" ? this.tourButtons() : s === "Whispers" ? this.whisperButtons() : s === "Archetypes" ? this.realms() : this.sectionButtons(s, shore)));
    };
    for (const { s: sec, title } of shown) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.dataset.s = sec;
      b.textContent = title;
      b.addEventListener("click", () => show(sec));
      tabs.append(b);
    }
    show(shown.some(({ s: sec }) => sec === this.tab) ? this.tab : (shown[0]?.s ?? "Monuments"));
    return [head, body];
  }
  /** Which way, and how far, from where you stand (or the shore). */
  private bearing(p: Place): string {
    const from = this.you ?? this.places.find((q) => q.label === "The shore");
    if (!from) return "";
    const dx = p.x - from.x, dz = p.z - from.z, d = Math.hypot(dx, dz);
    if (d < 40) return "here";
    const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const dir = names[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8];
    return `${dir} · ${d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`}`;
  }
  private placeButton(p: Place, text?: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    const name = document.createElement("span");
    name.className = "map-name";
    name.textContent = text ?? (p.numeral ? `${p.numeral} · ${p.label.replace(/^The /, "")}` : p.label);
    const sub = document.createElement("span");
    sub.className = "map-sub";
    sub.textContent = [p.note, p.deep ? "in the deep" : "", this.bearing(p)].filter(Boolean).join(" · ");
    b.append(name, sub);
    b.addEventListener("click", () => {
      this.select(p, true);
      this.go();
    });
    b.addEventListener("focus", () => this.select(p, false));
    return b;
  }
  private sectionButtons(s: Section, except?: Place): HTMLElement[] {
    return this.places
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p !== except && this.sectionOf(p) === s)
      .sort((a, b) => (a.p.order ?? 0) - (b.p.order ?? 0) || a.i - b.i)
      .map(({ p }) => this.placeButton(p));
  }
  /** The twenty-two by realm: four short rows, each under its name. */
  private realms(): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const { g, title } of GROUPS.filter(({ g }) => g !== "Shore" && g !== "Deep")) {
      const list = this.places.filter((q) => q.group === g && this.sectionOf(q) === "Archetypes");
      if (!list.length) continue;
      const h = document.createElement("p");
      h.className = "map-realm";
      h.textContent = title;
      const row = document.createElement("div");
      row.className = "map-row";
      row.append(...list.map((p) => this.placeButton(p)));
      out.push(h, row);
    }
    return out;
  }
  /** Each walk-through: the whole way, end to end; "walked" once you have been all the way. */
  private tourButtons(): HTMLElement[] {
    return this.tours.map((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t.walked ? `${t.label} · walked ✓` : t.label;
      b.addEventListener("click", () => {
        this.finish(null);
        this.onTour?.(t.id);
      });
      return b;
    });
  }

  /** The whispers found: each by its name and, quietly, where it was; a tap hears it again. */
  private whisperButtons(): HTMLElement[] {
    return this.whispers.map((w) => {
      const b = document.createElement("button");
      b.type = "button";
      const name = document.createElement("span");
      name.className = "map-name";
      name.textContent = w.label;
      const sub = document.createElement("span");
      sub.className = "map-sub";
      sub.textContent = w.note;
      b.append(name, sub);
      b.addEventListener("click", () => {
        this.finish(null);
        this.onWhisper?.(w.id);
      });
      return b;
    });
  }

  private finish(c: Choice | null): void {
    this.el.classList.remove("on");
    document.body.classList.remove("mapping");
    window.setTimeout(() => (this.el.hidden = true), 600);
    const r = this.resolve;
    this.resolve = null;
    r?.(c);
  }

  /** Choose a place (and, from the list, bring it into view). */
  private select(p: Place, centre: boolean): void {
    this.selected = { place: p, x: p.x, z: p.z };
    if (centre || !this.inView(p.x, p.z)) {
      this.view.cx = p.x;
      this.view.cz = p.z;
      if (centre) this.view.size = Math.min(this.view.size, 900);
      this.changed();
    } else this.draw();
    this.showPick();
  }

  private nearest(x: number, z: number): Place {
    let best = this.places[0], bd = Infinity;
    for (const p of this.places) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) (bd = d), (best = p);
    }
    return best;
  }

  private tapAt(e: PointerEvent): void {
    const [px, py] = this.local(e);
    const hit = this.hit(px, py);
    // a tap is enough: tapping a place (or open land) takes you there
    if (hit) {
      this.select(hit, false);
      return this.go();
    }
    const x = this.toWorldX(px), z = this.toWorldZ(py);
    this.selected = { place: this.nearest(x, z), x, z };
    this.draw();
    this.go();
  }

  private showPick(): void {
    const s = this.selected;
    this.pick.hidden = !s;
    if (!s) return;
    const p = s.place;
    const onPlace = s.x === p.x && s.z === p.z;
    const water = heightAt(s.x, s.z) < WATER_Y;
    this.pickName.textContent = onPlace
      ? `${p.numeral ? `${p.numeral} · ` : ""}${p.label}${p.deep ? ", in the deep: you wake on the water above" : ""}`
      : `${water ? "Open water" : "Open land"}, near ${p.numeral ? `${p.numeral} · ` : ""}${p.label}`;
    this.goBtn.textContent = "Wake here";
  }

  private go(): void {
    const s = this.selected;
    if (!s) return;
    const p = s.place;
    if (s.x === p.x && s.z === p.z) this.finish({ place: p, ...p.start });
    // wake facing the nearest place
    else this.finish({ place: p, x: s.x, z: s.z, heading: Math.atan2(-(p.x - s.x), -(p.z - s.z)) });
  }

  /* ---------------------------------------------------------------- the view */
  private zoomBy(k: number, clientX?: number, clientY?: number): void {
    const size = Math.min(Math.max(this.view.size * k, 120), this.all.size * 1.6);
    if (clientX !== undefined && clientY !== undefined) {
      // keep the point under the fingers where it is
      const r = this.canvas.getBoundingClientRect();
      const fx = (clientX - r.left) / r.width - 0.5, fz = (clientY - r.top) / r.height - 0.5;
      this.view.cx += fx * (this.view.size - size);
      this.view.cz += fz * (this.view.size - size);
    }
    this.view.size = size;
  }
  private spread(): number {
    const p = [...this.pointers.values()];
    return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }
  private mid(): [number, number] {
    const p = [...this.pointers.values()];
    return [(p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2];
  }
  private changed(): void {
    // never wander off the world entirely
    const lim = this.all.size * 0.8;
    this.view.cx = Math.min(Math.max(this.view.cx, this.all.cx - lim), this.all.cx + lim);
    this.view.cz = Math.min(Math.max(this.view.cz, this.all.cz - lim), this.all.cz + lim);
    this.draw();
    // once the view rests, draw the ground again, sharp at this scale
    window.clearTimeout(this.baseTimer);
    this.baseTimer = window.setTimeout(() => this.renderBase(), 220);
  }
  private inView(x: number, z: number): boolean {
    return Math.abs(x - this.view.cx) < this.view.size * 0.42 && Math.abs(z - this.view.cz) < this.view.size * 0.42;
  }

  /* ---------------------------------------------------------------- drawing */
  private layout(): void {
    const w = Math.floor(Math.min(innerWidth * 0.94, 680));
    const h = Math.floor(Math.min(w, innerHeight * 0.5));
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.draw();
  }

  /** World metres per canvas pixel, the same both ways (the view's size fits the width). */
  private get mpp(): number {
    return this.view.size / this.canvas.width;
  }
  private toMapX(x: number): number {
    return (x - this.view.cx) / this.mpp + this.canvas.width / 2;
  }
  private toMapY(z: number): number {
    return (z - this.view.cz) / this.mpp + this.canvas.height / 2;
  }
  private toWorldX(px: number): number {
    return this.view.cx + (px - this.canvas.width / 2) * this.mpp;
  }
  private toWorldZ(py: number): number {
    return this.view.cz + (py - this.canvas.height / 2) * this.mpp;
  }
  private local(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * this.canvas.width, ((e.clientY - r.top) / r.height) * this.canvas.height];
  }
  private hit(px: number, py: number): Place | null {
    const reach = 26 * (this.canvas.width / this.canvas.getBoundingClientRect().width);
    let best: Place | null = null, bd = reach;
    for (const p of this.places) {
      const d = Math.hypot(this.toMapX(p.x) - px, this.toMapY(p.z) - py);
      if (d < bd) (bd = d), (best = p);
    }
    return best;
  }

  /** The ground as the drawings would have it, for the stretch of world in view (and a margin). */
  private renderBase(): void {
    const box: View = { cx: this.view.cx, cz: this.view.cz, size: this.view.size * 1.35 };
    const x0 = box.cx - box.size / 2, z0 = box.cz - box.size / 2;
    const n = RES + 1;
    const h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = heightAt(x0 + (i / RES) * box.size, z0 + (j / RES) * box.size);
    const c = document.createElement("canvas");
    c.width = c.height = RES;
    const g = c.getContext("2d")!;
    const img = g.createImageData(RES, RES);
    const mix = (a: number[], b: number[], t: number) => a.map((v, k) => v + (b[k] - v) * Math.min(1, Math.max(0, t)));
    // contour lines in gold, spaced to suit the map's scale. Lines are drawn by their distance in
    // pixels from the level (height over the slope), so they come out smooth, never stair-stepped.
    const ci = Math.max(3, Math.round(box.size / 220));
    const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
    for (let j = 0; j < RES; j++)
      for (let i = 0; i < RES; i++) {
        const v = h[j * n + i], vr = h[j * n + i + 1], vd = h[(j + 1) * n + i];
        const slope = Math.max(1e-3, Math.hypot(vr - v, vd - v));
        const wet = mix([26, 30, 78], [7, 8, 26], -v / 40);
        let col: number[] = mix([44, 37, 72], [86, 72, 104], v / 40);
        const shade = Math.max(-1, Math.min(1, (v - vr + (v - vd)) * 0.35 * (RES / box.size) * 8)); // light from the north-west
        col = col.map((x) => x * (0.85 + shade * 0.25));
        if (v >= WATER_Y) {
          const f = v / ci, line = (Math.abs(f - Math.round(f)) * ci) / slope;
          col = mix(col, [226, 184, 110], 0.32 * clamp01(1 - line));
        }
        // land and water meet softly, and the shoreline is a fine line of pearl along that meeting
        const d = (v - WATER_Y) / slope;
        col = mix(wet, col, clamp01(d + 0.5));
        col = mix(col, [236, 226, 206], 0.9 * clamp01(1.1 - Math.abs(d)));
        img.data.set([col[0], col[1], col[2], 255], (j * RES + i) * 4);
      }
    g.putImageData(img, 0, 0);
    this.base = { img: c, box };
    this.draw();
  }

  private mark(g: CanvasRenderingContext2D, group: Group, x: number, y: number, r: number): void {
    g.beginPath();
    if (group === "Body") {
      g.moveTo(x, y - r * 1.2);
      g.lineTo(x + r * 1.2, y);
      g.lineTo(x, y + r * 1.2);
      g.lineTo(x - r * 1.2, y);
      g.closePath();
    } else if (group === "Spirit") {
      g.moveTo(x, y - r * 1.25);
      g.lineTo(x + r * 1.15, y + r * 0.8);
      g.lineTo(x - r * 1.15, y + r * 0.8);
      g.closePath();
    } else if (group === "Choice") {
      for (let k = 0; k <= 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.6 : r * 1.3;
        if (k) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
    } else if (group === "Deep") {
      // a ruined arch: two piers and the round head between them
      g.moveTo(x - r, y + r);
      g.lineTo(x - r, y - r * 0.1);
      g.arc(x, y - r * 0.1, r, Math.PI, 0);
      g.lineTo(x + r, y + r);
      g.lineTo(x + r * 0.45, y + r);
      g.lineTo(x + r * 0.45, y - r * 0.1);
      g.arc(x, y - r * 0.1, r * 0.45, 0, Math.PI, true);
      g.lineTo(x - r * 0.45, y + r);
      g.closePath();
    } else g.arc(x, y, r, 0, Math.PI * 2);
  }

  private draw(): void {
    const g = this.canvas.getContext("2d")!;
    const W = this.canvas.width, H = this.canvas.height;
    const k = W / 400;
    g.fillStyle = "#0b0a1c";
    g.fillRect(0, 0, W, H);
    if (this.base) {
      const b = this.base.box;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      const x = this.toMapX(b.cx - b.size / 2), y = this.toMapY(b.cz - b.size / 2), s = b.size / this.mpp;
      g.drawImage(this.base.img, x, y, s, s);
    }
    // a soft vignette, so the map fades at its edges like old paper in the dark
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    v.addColorStop(0, "rgba(11,10,28,0)");
    v.addColorStop(1, "rgba(11,10,28,0.9)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);

    // a scale: how far a stretch of the map is on foot
    const metres = [100, 250, 500, 1000, 2000].find((m) => m / this.mpp > W * 0.12) ?? 2000;
    g.strokeStyle = "rgba(244,239,230,0.6)";
    g.lineWidth = 1 * k;
    g.beginPath();
    g.moveTo(14 * k, H - 14 * k);
    g.lineTo(14 * k + metres / this.mpp, H - 14 * k);
    g.stroke();
    g.fillStyle = "rgba(244,239,230,0.7)";
    g.font = `italic ${10 * k}px ${SERIF}`;
    g.textAlign = "left";
    g.textBaseline = "bottom";
    g.fillText(metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, 14 * k, H - 17 * k);

    g.textBaseline = "middle";
    if (this.you) {
      const x = this.toMapX(this.you.x), y = this.toMapY(this.you.z);
      g.fillStyle = "rgba(244,239,230,0.95)";
      g.beginPath();
      g.arc(x, y, 3.5 * k, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(244,239,230,0.5)";
      g.beginPath();
      g.arc(x, y, 8 * k, 0, Math.PI * 2);
      g.stroke();
      g.font = `italic ${11 * k}px ${SERIF}`;
      g.textAlign = "left";
      g.fillText(this.continueBtn.hidden ? "you" : "where you were", x + 11 * k, y);
    }
    const close = this.view.size < 1300;
    // Names are gathered as the marks are drawn, then placed most important first, each only
    // where it overlaps nothing already written (they piled into an unreadable knot)
    const labels: { text: string; x: number; y: number; align: CanvasTextAlign; font: string; fill: string; rank: number }[] = [];
    // every mark's own room, so no name is written across a mark
    const marks: [number, number, number, number][] = [];
    // the planets and stars overhead: a ringed disc, a four-pointed sparkle
    for (const m of this.sky) {
      const x = this.toMapX(m.x), y = this.toMapY(m.z);
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      g.save();
      g.strokeStyle = "rgba(200,215,255,0.85)";
      g.fillStyle = "rgba(200,215,255,0.85)";
      g.lineWidth = 1.1 * k;
      g.shadowColor = "rgba(180,200,255,0.9)";
      g.shadowBlur = 6 * k;
      if (m.kind === "grove") {
        // a small round tree: a trunk and a crown
        g.strokeStyle = g.fillStyle = "rgba(255,226,170,0.9)";
        g.shadowColor = "rgba(255,200,140,0.9)";
        g.beginPath();
        g.moveTo(x, y + 6 * k);
        g.lineTo(x, y);
        g.stroke();
        g.beginPath();
        g.arc(x, y - 2.5 * k, 4.2 * k, 0, Math.PI * 2);
        g.fill();
      } else if (m.kind === "crystal") {
        // a small crystal: a tall diamond
        g.strokeStyle = g.fillStyle = "rgba(210,190,255,0.9)";
        g.shadowColor = "rgba(190,170,255,0.9)";
        g.beginPath();
        g.moveTo(x, y - 7 * k);
        g.lineTo(x + 3.2 * k, y);
        g.lineTo(x, y + 5 * k);
        g.lineTo(x - 3.2 * k, y);
        g.closePath();
        g.fill();
      } else if (m.kind === "planet") {
        g.beginPath();
        g.arc(x, y, 4 * k, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(x, y, 8 * k, 2.6 * k, -0.35, 0, Math.PI * 2);
        g.stroke();
      } else {
        g.beginPath();
        for (let s2 = 0; s2 < 8; s2++) {
          const a2 = (s2 / 8) * Math.PI * 2, rr = (s2 % 2 ? 1.6 : 7) * k;
          g.lineTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr);
        }
        g.closePath();
        g.fill();
      }
      marks.push([x - 7 * k, y - 7 * k, x + 7 * k, y + 7 * k]);
      if (close)
        labels.push({ text: m.label, x: x + 11 * k, y: y + 3 * k, align: "left", font: `italic ${10.5 * k}px ${SERIF}`, fill: m.kind === "grove" ? "rgba(255,236,200,0.9)" : "rgba(220,228,255,0.85)", rank: 3 });
      g.restore();
    }
    for (const p of this.places) {
      const x = this.toMapX(p.x), y = this.toMapY(p.z);
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      const on = this.selected?.place === p && this.selected.x === p.x && this.selected.z === p.z;
      const r = (on ? 13 : 10.5) * k;
      g.save();
      g.shadowColor = "rgba(255,210,150,0.9)";
      g.shadowBlur = (on ? 18 : 7) * k;
      g.fillStyle = "rgba(11,10,28,0.8)";
      g.strokeStyle = on ? "#fff4dc" : INK[p.group];
      g.lineWidth = (on ? 2.2 : 1.3) * k;
      if (p.numeral) {
        this.mark(g, p.group, x, y, r);
        g.fill();
        g.stroke();
      }
      g.restore();
      g.fillStyle = "#f4efe6";
      g.textAlign = "center";
      if (p.numeral) {
        g.font = `${(p.numeral.length > 3 ? 7.5 : p.numeral.length > 2 ? 8.5 : 10) * k}px ${SERIF}`;
        g.fillText(p.numeral, x, y + (p.group === "Spirit" ? 2 : 0.5) * k);
      } else if (p.label === "The shore") {
        // the shore: a small spiral, the drawings' own mark
        g.strokeStyle = "#f4efe6";
        g.lineWidth = 1 * k;
        g.beginPath();
        for (let s = 0; s <= 60; s++) {
          const a = (s / 60) * Math.PI * 5, rr = (s / 60) * 8 * k;
          if (s) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else g.moveTo(x, y);
        }
        g.stroke();
      } else {
        // any other place: a small point of its kind's colour in a fine ring (they were all
        // the shore's spiral, a field of identical whorls)
        const ink = SECTION_INK[this.sectionOf(p)] ?? INK.Shore;
        g.save();
        g.shadowColor = ink;
        g.shadowBlur = (on ? 12 : 5) * k;
        g.fillStyle = ink;
        g.beginPath();
        g.arc(x, y, (on ? 3.6 : 2.6) * k, 0, Math.PI * 2);
        g.fill();
        g.restore();
        g.strokeStyle = ink;
        g.globalAlpha = 0.55;
        g.lineWidth = 0.9 * k;
        g.beginPath();
        g.arc(x, y, (on ? 8 : 5.5) * k, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
      if (p.deep) {
        // a wave beneath: this home is in the deep
        g.strokeStyle = "rgba(170,200,255,0.9)";
        g.lineWidth = 1.2 * k;
        g.beginPath();
        for (let s = 0; s <= 16; s++) {
          const u = s / 16, wx = x - 9 * k + u * 18 * k, wy = y + r + 5 * k + Math.sin(u * Math.PI * 3) * 1.8 * k;
          if (s) g.lineTo(wx, wy);
          else g.moveTo(wx, wy);
        }
        g.stroke();
      }
      const rm = (p.numeral ? r * 1.2 : 6 * k) + 1.5 * k;
      marks.push([x - rm, y - rm, x + rm, y + rm + (p.deep ? 9 * k : 0)]);
      // names only where there is room for them, and always the one you've chosen
      const right = x > W * 0.72;
      labels.push({
        text: p.numeral && !on ? p.label.replace(/^The /, "") : p.label, x: x + (right ? -17 : 17) * k, y, align: right ? "right" : "left",
        font: `italic ${(on ? 13 : 11.5) * k}px ${SERIF}`, fill: on ? "#fff4dc" : "rgba(244,239,230,0.85)",
        rank: on ? 0 : p.numeral ? (close ? 1 : 9) : p.group === "Shore" ? 2 : close ? 2.5 : 9,
      });
    }
    const taken: [number, number, number, number][] = [];
    g.textBaseline = "middle";
    for (const l of labels.filter((q) => q.rank < 9).sort((a, b) => a.rank - b.rank)) {
      g.font = l.font;
      const w = g.measureText(l.text).width, h = 13 * k;
      const x0 = l.align === "right" ? l.x - w : l.x, y0 = l.y - h / 2;
      if (x0 < 2 || x0 + w > W - 2 || y0 < 2 || y0 + h > H - 2) continue;
      if (l.rank > 0 && taken.some(([a, b, c, d]) => x0 < c + 4 * k && x0 + w + 4 * k > a && y0 < d && y0 + h > b)) continue;
      if (l.rank > 0 && marks.some(([a, b, c, d]) => x0 < c && x0 + w > a && y0 + 2 * k < d && y0 + h - 2 * k > b)) continue;
      taken.push([x0, y0, x0 + w, y0 + h]);
      g.textAlign = l.align;
      g.fillStyle = l.fill;
      g.shadowColor = "rgba(0,0,0,0.9)";
      g.shadowBlur = 6 * k;
      g.fillText(l.text, l.x, l.y);
      g.shadowBlur = 0;
    }
    // a chosen spot on open land
    const s = this.selected;
    if (s && !(s.x === s.place.x && s.z === s.place.z)) {
      const x = this.toMapX(s.x), y = this.toMapY(s.z);
      g.strokeStyle = "#fff4dc";
      g.lineWidth = 1.6 * k;
      g.beginPath();
      g.arc(x, y, 7 * k, 0, Math.PI * 2);
      g.moveTo(x - 12 * k, y);
      g.lineTo(x + 12 * k, y);
      g.moveTo(x, y - 12 * k);
      g.lineTo(x, y + 12 * k);
      g.stroke();
    }
  }
}
