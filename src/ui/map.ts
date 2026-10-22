/* The map you travel by, drawn from the world's own land as a real map would show it: the water
   by its depth, each country in its own colours (the meadow, the frost tundra, the autumn wood,
   the ash fields, the heather moor, the ochre dunes, the red rocks, the mossland, the chalk downs)
   with its name written across it, forests, bare rock, snow on the massifs with their heights,
   rivers, shaded relief lit from the north-west, faint contours, north up and a compass, a scale.
   It is drawn in tiles, kept once drawn, so it moves and zooms at once.
   - Drag to move the map; pinch, scroll or use − / + to come closer or see it all; ◎ comes back
     to where you are (the small wedge shows which way you face); Key says what the marks mean.
   - Tap a place (or its name below the map) and you go there. Tapping open land takes you to
     that spot, and the nearest archetype's voice comes first.
   - Each group has its own mark, so nothing depends on colour alone: the Mind a circle, the
     Body a diamond, the Spirit a triangle, the Choice a star. The archive's vessels have small pale
     marks: a round tree for a grove, a tall diamond for a crystal garden, a ringed disc for a
     planet, a four-pointed sparkle for a star. A wave beneath a mark means its home is in the
     deep: you wake on the water above it. */
import { fbm, heightAt, PEAKS, regionAt, regionIndex, riverDist, smooth, SPAWN, WATER_Y } from "../world/terrain";

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
  /** Its own mark instead of a point: "maze", a small round labyrinth (the mind's maze). */
  icon?: "maze";
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

/** Map tiles: TILE_M metres across at the finest level, doubling each level; TILE_PX pixels. */
const TILE_M = 256, TILE_PX = 128, TILE_LEVELS = 7, TILE_CACHE = 220;
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

/* ---- the ground's colours, as a map would have them (sRGB) ---- */
type RGB = [number, number, number];
const lerp = (a: RGB, b: RGB, t: number): RGB => {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};
const MEADOW: RGB = [92, 116, 68], SAND: RGB = [212, 190, 142], ROCK: RGB = [112, 104, 100], HIGH: RGB = [132, 118, 98], SNOW: RGB = [238, 241, 248];
const RIVER: RGB = [74, 132, 182], CONTOUR: RGB = [52, 38, 28], COAST: RGB = [236, 228, 206];
const MARSH: RGB = [74, 104, 92], SHALLOW: RGB = [78, 132, 150], MIDWATER: RGB = [32, 70, 110], DEEP: RGB = [12, 24, 58];
/** The regions' names, each in its own country (terrain.ts REGIONS: E, NE, N, NW, W, SW, S, SE). */
const REGION_NAMES = ["Frost Tundra", "Autumn Wood", "Ash Fields", "Heather Moor", "Ochre Dunes", "Red Rocks", "Mossland", "Chalk Downs"];
const REGION_DIRS = [0, -1, -2, -3, 4, 3, 2, 1].map((k) => (k * Math.PI) / 4);
const toSRGB = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const contourStep = (size: number) => [5, 10, 20, 25, 50].find((m) => size / m < 260) ?? 50;
function groundColour(x: number, z: number, v: number, vr: number, vd: number, step: number, ci: number): RGB {
  const gx = (vr - v) / step, gz = (vd - v) / step, slope = Math.max(1e-4, Math.hypot(gx, gz));
  // shaded relief: light from the north-west and high, as maps are lit; steeper the farther out
  const ex = Math.min(5, Math.max(1.6, step / 3));
  const nx = -gx * ex, nz = -gz * ex, nl = Math.hypot(nx, 1, nz);
  const shade = (-nx * 0.5 + 0.72 - nz * 0.5) / (nl * 1.0198); // L = normalize(-0.5, 0.72, -0.5)
  const edge = v / (slope * step); // pixels from the shoreline
  let col: RGB;
  if (v < WATER_Y) {
    const d = -v;
    col = lerp(lerp(SHALLOW, MIDWATER, d / 5), DEEP, (d - 5) / 30);
    // the shallowest water, a hand deep, reads as marsh: wet ground among reeds, not a lake
    col = lerp(MARSH, col, smooth(0.15, 0.7, d));
    col = col.map((c) => c * (0.8 + 0.25 * shade)) as RGB;
  } else {
    const rg = regionAt(x, z);
    col = rg.away > 0 ? lerp(MEADOW, [toSRGB(rg.col.r), toSRGB(rg.col.g), toSRGB(rg.col.b)], rg.away * 0.85) : MEADOW;
    // forests where the trees stand thick (the world's own groves and each country's density)
    const dense = 1 + (rg.trees - 1) * rg.away;
    const grove = smooth(0.46, 0.64, fbm(x * 0.008 + 71, z * 0.008 - 33));
    const forest = Math.min(1, grove * dense * 1.1) * smooth(0.7, 2, v) * (1 - smooth(24, 32, v)) * (1 - smooth(0.5, 0.9, slope));
    if (forest > 0.02) {
      const leafC: RGB = rg.away > 0.5 && rg.leaf >= 0 ? (rg.leaf < 0.9 ? [150, 92, 38] : [118, 130, 122]) : [38, 72, 44];
      col = lerp(col, leafC, forest * 0.7);
      // a stipple of crowns
      const hsh = Math.abs(Math.sin(Math.floor(x / 6) * 127.1 + Math.floor(z / 6) * 311.7) * 43758.5453) % 1;
      if (hsh < forest * 0.55) col = col.map((c) => c * 0.72) as RGB;
    }
    col = lerp(col, SAND, smooth(1.4, 0.35, v));
    col = lerp(col, HIGH, smooth(30, 90, v) * 0.55);
    col = lerp(col, ROCK, smooth(0.6, 1.3, slope));
    const snowLine = 100 + (fbm(x * 0.004 + 3, z * 0.004) - 0.5) * 50;
    col = lerp(col, SNOW, smooth(snowLine, snowLine + 10, v) * (1 - smooth(1.0, 1.7, slope) * 0.7));
    col = col.map((c) => c * (0.42 + 0.8 * shade)) as RGB;
    // rivers: a fine blue line, never thinner than a pixel
    const rd = riverDist(x, z);
    if (rd < Infinity) col = lerp(col, RIVER, 1.2 - (rd - Math.max(5, step * 0.4)) / step);
    // contours, every fifth stronger
    const f = v / ci, line = (Math.abs(f - Math.round(f)) * ci) / (slope * step);
    const index = Math.round(f) % 5 === 0;
    col = lerp(col, CONTOUR, (index ? 0.34 : 0.16) * Math.min(1, Math.max(0, 1 - line)));
  }
  // the shoreline, a fine pale line where land and water meet
  // (only where the map is fine enough to show a shore as a line: far out it is a speckle)
  col = lerp(col, COAST, 0.6 * (1.1 - Math.abs(edge)) * smooth(14, 5, step) * smooth(0.1, 0.6, Math.abs(v) + (v > 0 ? 1 : 0)));
  return col.map((c) => Math.min(255, c * 0.92)) as RGB;
}
/** Where each region's name is written: the middle of its country along its bearing, about
    `r` metres out (farther when the map shows more of the world). */
const regionSpots = new Map<number, { name: string; x: number; z: number; ink: string }[]>();
function regionLabels(r0: number): { name: string; x: number; z: number; ink: string }[] {
  const R = Math.round(Math.min(2600, Math.max(620, r0)) / 200) * 200;
  const known = regionSpots.get(R);
  if (known) return known;
  const spots = REGION_NAMES.map((name, i) => {
    let sx = 0, sz = 0, n = 0;
    for (let r = R * 0.75; r <= R * 1.25; r += R * 0.05)
      for (let a = -0.4; a <= 0.4; a += 0.08) {
        const x = SPAWN.x + Math.cos(REGION_DIRS[i] + a) * r, z = SPAWN.z + Math.sin(REGION_DIRS[i] + a) * r;
        const ri = regionIndex(x, z);
        if (ri.i === i && ri.away > 0.6) (sx += x), (sz += z), n++;
      }
    const x = n ? sx / n : SPAWN.x + Math.cos(REGION_DIRS[i]) * R, z = n ? sz / n : SPAWN.z + Math.sin(REGION_DIRS[i]) * R;
    const rg = regionAt(x, z);
    const c = [toSRGB(rg.col.r), toSRGB(rg.col.g), toSRGB(rg.col.b)].map((v) => Math.round(Math.min(255, v * 0.35 + 175)));
    return { name, x, z, ink: `rgba(${c[0]},${c[1]},${c[2]},0.9)` };
  });
  regionSpots.set(R, spots);
  return spots;
}
/** Each massif's summit and its height. */
let summits: { x: number; z: number; h: number }[] | null = null;
function peakSummits(): { x: number; z: number; h: number }[] {
  if (summits) return summits;
  summits = PEAKS.map((p) => {
    let best = { x: p.x, z: p.z, h: -Infinity };
    for (let j = -10; j <= 10; j++)
      for (let i = -10; i <= 10; i++) {
        const x = p.x + i * p.r * 0.03, z = p.z + j * p.r * 0.03, y = heightAt(x, z);
        if (y > best.h) best = { x, z, h: y };
      }
    return best;
  });
  return summits;
}

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
    // ◎: back to where you are, close enough to find your way
    document.getElementById("map-me")!.addEventListener("click", () => {
      const y = this.you ?? this.places.find((q) => q.label === "The shore");
      if (!y) return;
      this.view = { cx: y.x, cz: y.z, size: Math.min(this.view.size, 900) };
      this.changed();
    });
    const keyBtn = document.getElementById("map-key")!;
    keyBtn.addEventListener("click", () => {
      this.keyOn = !this.keyOn;
      keyBtn.setAttribute("aria-pressed", String(this.keyOn));
      this.draw();
    });
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
    this.list.replaceChildren(...this.buildList());
    this.el.hidden = false;
    document.body.classList.add("mapping");
    requestAnimationFrame(() => this.el.classList.add("on"));
    this.layout();
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
    const keepTab = (): void => (tabs.querySelector('[aria-selected="true"]') as HTMLElement | null)?.scrollIntoView({ inline: "center", block: "nearest" });
    for (const { s: sec, title } of shown) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.dataset.s = sec;
      b.textContent = title;
      b.addEventListener("click", () => (show(sec), keepTab()));
      tabs.append(b);
    }
    show(shown.some(({ s: sec }) => sec === this.tab) ? this.tab : (shown[0]?.s ?? "Monuments"));
    window.requestAnimationFrame(keepTab);
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
  }
  private inView(x: number, z: number): boolean {
    return Math.abs(x - this.view.cx) < this.view.size * 0.42 && Math.abs(z - this.view.cz) < this.view.size * 0.42;
  }

  /* ---------------------------------------------------------------- drawing */
  private layout(): void {
    // a phone on its side: the map stands on the left, the whole height, the list beside it
    const side = innerWidth > innerHeight && innerHeight <= 540;
    if (side) {
      const cs = getComputedStyle(this.el);
      const hh = Math.floor((this.el.clientHeight || innerHeight) - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0));
      const ww = Math.floor(Math.min(innerWidth * 0.46, hh * 1.25));
      this.size(ww, hh);
      return;
    }
    const w = Math.floor(Math.min(innerWidth * 0.94, 680));
    // the map takes what the screen has left after the title, the line under it, the tabs and a few
    // rows of names (the names scroll within their own space), so the whole screen fits without scrolling
    let h = Math.floor(Math.min(w, innerHeight * 0.5));
    if (this.el.clientHeight) {
      const cs = getComputedStyle(this.el);
      const gap = parseFloat(cs.rowGap) || 0;
      const kids = [...this.el.children].filter((c) => !(c as HTMLElement).hidden && c !== this.canvas.parentElement && c.id !== "map-places") as HTMLElement[];
      const used = kids.reduce((n, c) => n + c.offsetHeight + gap, 0) + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + gap * 2;
      const rest = this.el.clientHeight - used - 250; // the shore row, the tabs and about three rows of names
      h = Math.floor(Math.max(170, Math.min(w, rest)));
    }
    this.size(w, h);
  }

  private size(w: number, h: number): void {
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

  /** The ground as it is: a map you could find your way by. Water by its depth, the land in the
      colours of its own country (the meadow, the tundra, the autumn wood, the ash…), sand along
      the shores, forests where the trees stand thick, bare rock on the steep, snow on the high
      massifs, rivers as fine blue lines, shaded relief lit from the north-west as maps are, and
      faint contours. Drawn first coarse (at once), then sharp in slices over a few frames, so
      the map never freezes while it is moved. */
  /** The ground in tiles, as map apps draw it: square tiles at a ladder of scales (256 m across
      at the finest, twice as wide each step up), each 128 pixels, drawn once and kept, so the
      map moves and zooms back at once. Tiles in view are painted nearest the middle first, a slice
      at a time between the game's frames; until one is ready, its coarser parent stands in. */
  private tiles = new Map<string, HTMLCanvasElement>();
  private queue: { L: number; i: number; j: number; key: string }[] = [];
  private painting: { L: number; i: number; j: number; key: string; row: number; h: Float32Array; img: ImageData; c: HTMLCanvasElement } | null = null;
  private pump = 0;
  private levelFor(): number {
    for (let L = 0; L < TILE_LEVELS; L++) if ((TILE_M * 2 ** L) / TILE_PX >= this.mpp * 1.4) return L;
    return TILE_LEVELS - 1;
  }
  private drawTiles(g: CanvasRenderingContext2D): void {
    const L = this.levelFor(), T = TILE_M * 2 ** L;
    const W = this.canvas.width, H = this.canvas.height;
    const x0 = this.toWorldX(0), x1 = this.toWorldX(W), z0 = this.toWorldZ(0), z1 = this.toWorldZ(H);
    const want: { L: number; i: number; j: number; key: string; d: number }[] = [];
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    for (let j = Math.floor(z0 / T); j <= Math.floor(z1 / T); j++)
      for (let i = Math.floor(x0 / T); i <= Math.floor(x1 / T); i++) {
        const key = `${L}:${i}:${j}`;
        const px = this.toMapX(i * T), py = this.toMapY(j * T), ps = T / this.mpp;
        const have = this.tiles.get(key);
        if (have) {
          // freshly used: to the end of the cache's order
          this.tiles.delete(key);
          this.tiles.set(key, have);
          g.drawImage(have, px, py, ps + 0.5, ps + 0.5);
          continue;
        }
        // a coarser tile stands in, the part of it that covers this one
        for (let up = 1; L + up < TILE_LEVELS; up++) {
          const f = 2 ** up, pi = Math.floor(i / f), pj = Math.floor(j / f), parent = this.tiles.get(`${L + up}:${pi}:${pj}`);
          if (!parent) continue;
          const sub = TILE_PX / f;
          g.drawImage(parent, (i - pi * f) * sub, (j - pj * f) * sub, sub, sub, px, py, ps + 0.5, ps + 0.5);
          break;
        }
        want.push({ L, i, j, key, d: Math.hypot((i + 0.5) * T - this.view.cx, (j + 0.5) * T - this.view.cz) });
      }
    want.sort((a, b) => a.d - b.d);
    // the coarsest level for the whole world first (a stand-in everywhere), then the view two
    // levels coarser (quick, a quarter of the work), then the view itself
    const rough: typeof want = [];
    if (want.length && L + 2 < TILE_LEVELS) {
      const T2 = T * 4;
      for (let j = Math.floor(z0 / T2); j <= Math.floor(z1 / T2); j++)
        for (let i = Math.floor(x0 / T2); i <= Math.floor(x1 / T2); i++) {
          const key = `${L + 2}:${i}:${j}`;
          if (!this.tiles.has(key) && this.painting?.key !== key) rough.push({ L: L + 2, i, j, key, d: 0 });
        }
    }
    this.queue = [...rough, ...want];
    for (let i = -1; i <= 0; i++) for (let j = -1; j <= 0; j++) {
      const key = `${TILE_LEVELS - 1}:${i}:${j}`;
      if (!this.tiles.has(key) && this.painting?.key !== key) this.queue.unshift({ L: TILE_LEVELS - 1, i, j, key });
    }
    if (this.queue.length && !this.pump) this.pump = window.setTimeout(() => this.paintSome(), 0);
  }
  private paintSome(): void {
    this.pump = 0;
    if (this.el.hidden) return;
    const t0 = performance.now();
    let finished = false;
    while (performance.now() - t0 < 10) {
      if (!this.painting) {
        const next = this.queue.shift();
        if (!next) break;
        if (this.tiles.has(next.key)) continue;
        const c = document.createElement("canvas");
        c.width = c.height = TILE_PX;
        const img = c.getContext("2d")!.createImageData(TILE_PX, TILE_PX);
        const h = new Float32Array((TILE_PX + 1) * (TILE_PX + 1));
        this.painting = { ...next, row: -1, h, img, c };
      }
      const t = this.painting, T = TILE_M * 2 ** t.L, step = T / TILE_PX, n = TILE_PX + 1;
      const x0 = t.i * T, z0 = t.j * T;
      const fill = (j: number) => {
        for (let i = 0; i < n; i++) t.h[j * n + i] = heightAt(x0 + i * step, z0 + j * step);
      };
      if (t.row < 0) fill(0), (t.row = 0);
      fill(t.row + 1);
      const ci = contourStep(step * 360);
      for (let i = 0; i < TILE_PX; i++) {
        const col = groundColour(x0 + (i + 0.5) * step, z0 + (t.row + 0.5) * step, t.h[t.row * n + i], t.h[t.row * n + i + 1], t.h[(t.row + 1) * n + i], step, ci);
        t.img.data.set([col[0], col[1], col[2], 255], (t.row * TILE_PX + i) * 4);
      }
      if (++t.row >= TILE_PX) {
        t.c.getContext("2d")!.putImageData(t.img, 0, 0);
        this.tiles.set(t.key, t.c);
        if (this.tiles.size > TILE_CACHE) this.tiles.delete(this.tiles.keys().next().value!);
        this.painting = null;
        finished = true;
      }
    }
    if (finished) this.draw();
    if (this.painting || this.queue.length) this.pump = window.setTimeout(() => this.paintSome(), 0);
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

  /** North, at the map's corner (north is up: the deep night lies that way). */
  private compass(g: CanvasRenderingContext2D, x: number, y: number, k: number): void {
    g.save();
    g.fillStyle = "rgba(11,10,28,0.55)";
    g.beginPath();
    g.arc(x, y, 15 * k, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(244,239,230,0.45)";
    g.lineWidth = 0.8 * k;
    g.stroke();
    g.fillStyle = "rgba(255,226,170,0.95)";
    g.beginPath();
    g.moveTo(x, y - 11 * k);
    g.lineTo(x + 3.6 * k, y + 1 * k);
    g.lineTo(x - 3.6 * k, y + 1 * k);
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(244,239,230,0.5)";
    g.beginPath();
    g.moveTo(x, y + 11 * k);
    g.lineTo(x + 3.6 * k, y - 1 * k);
    g.lineTo(x - 3.6 * k, y - 1 * k);
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(255,240,214,0.95)";
    g.font = `${9 * k}px ${SERIF}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("N", x, y - 21 * k);
    g.restore();
  }
  /** The key: what each mark and colour means (Key under the map's corner turns it on). */
  keyOn = false;
  private key(g: CanvasRenderingContext2D, k: number, H: number): void {
    const rows: [string, (x: number, y: number) => void][] = [];
    const ring = (ink: string, group: Group) => (x: number, y: number) => {
      g.fillStyle = "rgba(11,10,28,0.8)";
      g.strokeStyle = ink;
      g.lineWidth = 1.2 * k;
      this.mark(g, group, x, y, 5 * k);
      g.fill();
      g.stroke();
    };
    const dot = (ink: string) => (x: number, y: number) => {
      g.fillStyle = ink;
      g.beginPath();
      g.arc(x, y, 3 * k, 0, Math.PI * 2);
      g.fill();
    };
    const swatch = (c: string) => (x: number, y: number) => {
      g.fillStyle = c;
      g.fillRect(x - 6 * k, y - 4 * k, 12 * k, 8 * k);
    };
    rows.push(["The Mind", ring(INK.Mind, "Mind")], ["The Body", ring(INK.Body, "Body")], ["The Spirit", ring(INK.Spirit, "Spirit")], ["The Choice", ring(INK.Choice, "Choice")]);
    rows.push(["Monuments", dot(SECTION_INK.Monuments!)], ["Ancient worlds", dot(SECTION_INK.Ancient!)], ["Lessons", dot(SECTION_INK.Lessons!)], ["Beneath the water", ring(INK.Deep, "Deep")]);
    rows.push(["Forest", swatch("rgb(40,70,44)")], ["Rivers and lakes", swatch("rgb(50,96,140)")], ["Rock", swatch("rgb(104,98,96)")], ["Snow", swatch("rgb(232,236,244)")]);
    const lh = 15 * k, w = 128 * k, h = rows.length * lh + 12 * k, x0 = 10 * k, y0 = H - 34 * k - h;
    g.save();
    g.fillStyle = "rgba(11,10,28,0.96)";
    g.strokeStyle = "rgba(244,239,230,0.25)";
    g.lineWidth = 0.8 * k;
    g.beginPath();
    g.roundRect(x0, y0, w, h, 8 * k);
    g.fill();
    g.stroke();
    g.font = `italic ${10 * k}px ${SERIF}`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    rows.forEach(([t, icon], i) => {
      const y = y0 + 6 * k + lh * (i + 0.5);
      icon(x0 + 14 * k, y);
      g.fillStyle = "rgba(244,239,230,0.88)";
      g.fillText(t, x0 + 28 * k, y);
    });
    g.restore();
  }

  private draw(): void {
    const g = this.canvas.getContext("2d")!;
    const W = this.canvas.width, H = this.canvas.height;
    const k = W / 400;
    g.fillStyle = "#0b0a1c";
    g.fillRect(0, 0, W, H);
    this.drawTiles(g);
    // a soft vignette, so the map fades at its edges like old paper in the dark
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    v.addColorStop(0, "rgba(11,10,28,0)");
    v.addColorStop(1, "rgba(11,10,28,0.6)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);

    // a scale: how far a stretch of the map is on foot
    const metres = [100, 250, 500, 1000, 2000].find((m) => m / this.mpp > W * 0.12) ?? 2000;
    g.strokeStyle = "rgba(244,239,230,0.6)";
    g.lineWidth = 1 * k;
    // (top left: the controls sit along the foot)
    g.save();
    g.shadowColor = "rgba(0,0,0,0.9)";
    g.shadowBlur = 4 * k;
    g.lineWidth = 1.4 * k;
    g.beginPath();
    g.moveTo(14 * k, 30 * k);
    g.lineTo(14 * k + metres / this.mpp, 30 * k);
    g.moveTo(14 * k, 26 * k);
    g.lineTo(14 * k, 34 * k);
    g.moveTo(14 * k + metres / this.mpp, 26 * k);
    g.lineTo(14 * k + metres / this.mpp, 34 * k);
    g.stroke();
    g.fillStyle = "rgba(244,239,230,0.85)";
    g.font = `italic ${10 * k}px ${SERIF}`;
    g.textAlign = "left";
    g.textBaseline = "bottom";
    g.fillText(metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, 14 * k, 24 * k);
    g.restore();

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
      if (this.you.heading !== undefined) {
        // which way you face: a small wedge (the wanderer looks along (−sin h, −cos h))
        const h = this.you.heading, fx = -Math.sin(h), fy = -Math.cos(h);
        g.fillStyle = "rgba(255,244,220,0.95)";
        g.beginPath();
        g.moveTo(x + fx * 15 * k, y + fy * 15 * k);
        g.lineTo(x + fy * 5 * k + fx * 8 * k, y - fx * 5 * k + fy * 8 * k);
        g.lineTo(x - fy * 5 * k + fx * 8 * k, y + fx * 5 * k + fy * 8 * k);
        g.closePath();
        g.fill();
        g.fillStyle = "rgba(244,239,230,0.95)";
      }
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
    // the countries' names, written large and faint across them, under every mark and name
    if (this.view.size > 450 && this.view.size < 12000) {
      const fs = Math.min(16, Math.max(10, 10000 / this.view.size)) * k;
      const spaced = (t: string) => t.toUpperCase().split("").join("\u2009");
      g.save();
      g.textAlign = "center";
      g.shadowColor = "rgba(0,0,0,0.85)";
      g.shadowBlur = 5 * k;
      g.font = `${fs}px ${SERIF}`;
      g.lineJoin = "round";
      g.lineWidth = 3.2 * k;
      g.strokeStyle = "rgba(12,10,24,0.7)";
      for (const r of regionLabels(this.view.size * 0.32)) {
        const x = this.toMapX(r.x), y = this.toMapY(r.z);
        g.strokeText(spaced(r.name), x, y);
        g.fillStyle = r.ink;
        g.fillText(spaced(r.name), x, y);
      }
      if (this.view.size < 2600) {
        g.fillStyle = "rgba(206,226,180,0.8)";
        g.font = `${fs * 0.85}px ${SERIF}`;
        g.fillText(spaced("The Meadow"), this.toMapX(SPAWN.x), this.toMapY(SPAWN.z - 120));
      }
      g.restore();
    }
    // the massifs' summits: a small triangle and the height
    for (const pk of peakSummits()) {
      const x = this.toMapX(pk.x), y = this.toMapY(pk.z);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      g.fillStyle = "rgba(250,250,255,0.95)";
      g.strokeStyle = "rgba(20,18,30,0.8)";
      g.lineWidth = 1 * k;
      g.beginPath();
      g.moveTo(x, y - 6 * k);
      g.lineTo(x + 5.5 * k, y + 4 * k);
      g.lineTo(x - 5.5 * k, y + 4 * k);
      g.closePath();
      g.fill();
      g.stroke();
      marks.push([x - 6 * k, y - 7 * k, x + 6 * k, y + 5 * k]);
      labels.push({ text: `${Math.round(pk.h)} m`, x: x + 9 * k, y, align: "left", font: `italic ${10 * k}px ${SERIF}`, fill: "rgba(240,242,250,0.85)", rank: 4 });
    }
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
      } else if (p.icon === "maze") {
        // the mind's maze: a small round labyrinth in gold, its rings broken by their doors, a
        // point at its still centre
        const R = (on ? 11 : 9) * k;
        g.save();
        g.shadowColor = "rgba(255,210,150,0.9)";
        g.shadowBlur = (on ? 14 : 6) * k;
        g.fillStyle = "rgba(11,10,28,0.85)";
        g.beginPath();
        g.arc(x, y, R + 2 * k, 0, Math.PI * 2);
        g.fill();
        g.restore();
        g.strokeStyle = on ? "#fff4dc" : "rgba(255,214,150,0.95)";
        g.lineWidth = 1.1 * k;
        g.lineCap = "round";
        // each ring: its door's angle (from the top, clockwise), rings turning their doors about
        const rings: [number, number][] = [[1, 0.5], [0.72, 3.6], [0.44, 1.9]];
        for (const [f, door] of rings) {
          g.beginPath();
          g.arc(x, y, R * f, -Math.PI / 2 + door + 0.42, -Math.PI / 2 + door - 0.42 + Math.PI * 2);
          g.stroke();
        }
        // a few walls across the corridors
        g.beginPath();
        for (const [a, f0, f1] of [[2.4, 0.72, 1], [5.1, 0.44, 0.72], [0.9, 0.44, 0.72], [4.2, 0.72, 1]] as [number, number, number][]) {
          const ax = Math.sin(a), ay = -Math.cos(a);
          g.moveTo(x + ax * R * f0, y + ay * R * f0);
          g.lineTo(x + ax * R * f1, y + ay * R * f1);
        }
        g.stroke();
        g.fillStyle = g.strokeStyle;
        g.beginPath();
        g.arc(x, y, 1.6 * k, 0, Math.PI * 2);
        g.fill();
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
    this.compass(g, W - 26 * k, 28 * k, k);
    if (this.keyOn) this.key(g, k, H);
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
