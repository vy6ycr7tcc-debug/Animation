/* Film mode's clock (`?film=<tour>`, see debug/film.ts). This module is imported first by main.ts
   and does nothing at all unless the address asks for film mode.

   - Any film mode: Math.random is seeded, so a second recording takes the same path through
     whatever the tours leave to chance (particles may still differ frame to frame).
   - Fast capture (`&fast=1`): time is ours. performance.now, Date.now, setTimeout, setInterval and
     requestAnimationFrame run on a virtual clock that film.ts advances one fixed step at a time,
     so the game steps its simulation on a fixed timestep (1/fps per frame) with no wall-clock
     dependence, and a frame can take as long to draw as it needs. */

const q = new URLSearchParams(location.search);
export const FILM: string | null = q.get("film");
export const FAST = !!FILM && q.get("fast") === "1";

/** The real timers, for film.ts's own use (the virtual ones replace the page's). */
export const real = {
  setTimeout: window.setTimeout.bind(window),
  clearTimeout: window.clearTimeout.bind(window),
  now: performance.now.bind(performance),
};

/** Seconds on the virtual clock (fast capture only; real time otherwise). */
export const vclock = {
  /** milliseconds on the virtual clock */
  ms: 0,
  /** seconds on the virtual clock, from page start: the audio clock's stand-in in fast mode */
  get t(): number {
    return FAST ? this.ms / 1000 : real.now() / 1000;
  },
  /** Advance the clock by `dtMs`: due timers run in order, then the frame callbacks. */
  step: (_dtMs: number): void => {},
};

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

if (FILM) {
  Math.random = mulberry(Number(q.get("seed") ?? 20260930));
}

if (FAST) {
  const base = real.now();
  const wall0 = Date.now();
  vclock.ms = base;
  performance.now = () => vclock.ms;
  Date.now = () => wall0 + (vclock.ms - base);

  interface Timer {
    id: number;
    at: number;
    fn: () => void;
    every: number; // 0 for a one-shot
    seq: number;
  }
  let nextId = 1, seq = 0;
  const timers = new Map<number, Timer>();
  const add = (fn: TimerHandler, ms: number | undefined, args: unknown[], every: boolean): number => {
    const f = typeof fn === "function" ? () => (fn as (...a: unknown[]) => void)(...args) : () => void 0;
    const d = Math.max(0, Number(ms) || 0);
    const t: Timer = { id: nextId++, at: vclock.ms + d, fn: f, every: every ? Math.max(1, d) : 0, seq: seq++ };
    timers.set(t.id, t);
    return t.id;
  };
  window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => add(fn, ms, args, false)) as typeof window.setTimeout;
  window.setInterval = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => add(fn, ms, args, true)) as typeof window.setInterval;
  window.clearTimeout = window.clearInterval = ((id?: number) => void (id !== undefined && timers.delete(id))) as typeof window.clearTimeout;

  let frames: { id: number; fn: FrameRequestCallback }[] = [];
  let frameId = 1;
  window.requestAnimationFrame = (fn) => {
    frames.push({ id: frameId, fn });
    return frameId++;
  };
  window.cancelAnimationFrame = (id) => {
    frames = frames.filter((f) => f.id !== id);
  };

  vclock.step = (dtMs: number): void => {
    const to = vclock.ms + dtMs;
    // timers that fall due within the step run at their own moment, in order
    for (;;) {
      let first: Timer | null = null;
      for (const t of timers.values()) if (t.at <= to && (!first || t.at < first.at || (t.at === first.at && t.seq < first.seq))) first = t;
      if (!first) break;
      vclock.ms = Math.max(vclock.ms, first.at);
      if (first.every) {
        first.at += first.every;
        first.seq = seq++;
      } else timers.delete(first.id);
      try {
        first.fn();
      } catch (e) {
        console.error(e);
      }
    }
    vclock.ms = to;
    const run = frames;
    frames = [];
    for (const f of run) {
      try {
        f.fn(vclock.ms);
      } catch (e) {
        console.error(e);
      }
    }
  };
}
