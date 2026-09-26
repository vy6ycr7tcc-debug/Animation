/* Frame timing and adaptive quality.
   Samuel: "we want the maximum resolution". So resolution comes first: every tier keeps the
   picture sharp (native on the top tier, never below 2x on a phone), and when frames run slow it
   is the costly effects that rest, one by one, before any sharpness is given up.
   The controller is patient: it ignores the hitches of the first seconds and of streaming new
   ground, it recognises a steady 30 fps cap (Low Power Mode) as a cap rather than as slowness,
   and after a long good run it tries the tier above again. */

export interface Tier {
  name: string;
  dpr: number; // cap, further limited by the device pixel ratio
  shadow: number;
  bloom: boolean;
  particles: number;
  ao: boolean; // soft contact shadows
  rays: boolean; // god rays
  reflection: boolean; // the mirrored world in the lakes
}

export const MOBILE =
  matchMedia("(pointer:coarse)").matches || Math.min(screen.width, screen.height) < 700;

export const TIERS: Tier[] = [
  { name: "full", dpr: 3, shadow: 2048, bloom: true, particles: MOBILE ? 1200 : 1800, ao: true, rays: true, reflection: true },
  { name: "high", dpr: 3, shadow: 2048, bloom: true, particles: 1100, ao: false, rays: true, reflection: true },
  { name: "medium", dpr: 2.5, shadow: 1024, bloom: true, particles: 900, ao: false, rays: false, reflection: true },
  { name: "light", dpr: 2, shadow: 1024, bloom: true, particles: 700, ao: false, rays: false, reflection: false },
  { name: "minimum", dpr: 2, shadow: 512, bloom: false, particles: 400, ao: false, rays: false, reflection: false },
];

export class FrameStats {
  fps = 0;
  avgMs = 0;
  worstMs = 0;
  /** Share of frames in the last window that took longer than 20 ms (visible stutter at 60 Hz). */
  slowShare = 0;
  private acc = 0;
  private n = 0;
  private worst = 0;
  private slow = 0;

  /** Returns true once per ~1 s window, when the readings update. */
  push(ms: number): boolean {
    this.acc += ms;
    this.n++;
    this.worst = Math.max(this.worst, ms);
    if (ms > 20) this.slow++;
    if (this.acc < 1000) return false;
    this.fps = (this.n * 1000) / this.acc;
    this.avgMs = this.acc / this.n;
    this.worstMs = this.worst;
    this.slowShare = this.slow / this.n;
    this.acc = this.n = this.worst = this.slow = 0;
    return true;
  }
}

export class AdaptiveQuality {
  tier = 0;
  /** Keep the top tier whatever happens (a setting). */
  pinned = false;
  private good = 0;
  private bad = 0;
  private settle = 8; // ignore the first seconds (shader compile, audio start, the world streaming in)
  private failedAt = new Map<number, number>(); // tier -> windows since it ran slow
  private windows = 0;

  constructor(private apply: (t: Tier, index: number) => void) {}

  get current(): Tier {
    return TIERS[this.tier];
  }

  /** A burst of new work is coming (arriving somewhere, streaming ground): don't judge it. */
  hold(windows = 3): void {
    this.settle = Math.max(this.settle, windows);
  }

  /** Feed once per stats window. */
  window(stats: FrameStats): void {
    this.windows++;
    if (this.pinned) return;
    if (this.settle > 0) {
      this.settle--;
      return;
    }
    // a steady 30 fps (Low Power Mode caps Safari there) is a cap, not a struggle
    const capped30 = stats.fps > 27 && stats.fps < 32 && stats.worstMs < 45;
    if (stats.fps < 45 && !capped30) {
      this.good = 0;
      if (++this.bad >= 3 && this.tier < TIERS.length - 1) {
        this.failedAt.set(this.tier, this.windows);
        this.set(this.tier + 1);
      }
    } else if (stats.fps > 56 || capped30) {
      this.bad = 0;
      // climb back after a good run; a tier that ran slow is tried again only after a long while
      const above = this.tier - 1, failed = this.failedAt.get(above);
      if (++this.good >= 10 && above >= 0 && (failed === undefined || this.windows - failed > 90)) this.set(above);
    } else {
      this.good = this.bad = 0;
    }
  }

  set(i: number): void {
    this.tier = i;
    this.good = this.bad = 0;
    this.settle = 3;
    this.apply(TIERS[i], i);
  }
}
