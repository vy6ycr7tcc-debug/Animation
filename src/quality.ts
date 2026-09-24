/* Frame timing and adaptive quality.
   Drops a tier quickly when frames run long; climbs back slowly after a sustained good run. */

export interface Tier {
  name: string;
  dpr: number; // cap, further limited by the device pixel ratio
  shadow: number;
  bloom: boolean;
  particles: number;
}

export const MOBILE =
  matchMedia("(pointer:coarse)").matches || Math.min(screen.width, screen.height) < 700;

export const TIERS: Tier[] = [
  { name: "high", dpr: 2, shadow: 2048, bloom: true, particles: MOBILE ? 1200 : 1800 },
  { name: "medium", dpr: 1.5, shadow: 1024, bloom: true, particles: 900 },
  { name: "low", dpr: 1.25, shadow: 1024, bloom: true, particles: 600 },
  { name: "minimum", dpr: 1, shadow: 512, bloom: false, particles: 400 },
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
  tier: number;
  private good = 0;
  private bad = 0;
  private settle = 3; // ignore the first seconds (shader compile, audio start)
  private failed = new Set<number>(); // tiers that ran slow are not retried, so it can't ping-pong

  constructor(private apply: (t: Tier, index: number) => void) {
    this.tier = MOBILE ? 1 : 0;
  }

  get current(): Tier {
    return TIERS[this.tier];
  }

  /** Feed once per stats window. */
  window(stats: FrameStats): void {
    if (this.settle > 0) {
      this.settle--;
      return;
    }
    // Screens at 120 Hz show ~8 ms frames; judge by 60 fps either way.
    if (stats.fps < 50) {
      this.good = 0;
      if (++this.bad >= 2 && this.tier < TIERS.length - 1) {
        this.failed.add(this.tier);
        this.set(this.tier + 1);
      }
    } else if (stats.fps > 58) {
      this.bad = 0;
      if (++this.good >= 8 && this.tier > 0 && !this.failed.has(this.tier - 1)) this.set(this.tier - 1);
    } else {
      this.good = this.bad = 0;
    }
  }

  set(i: number): void {
    this.tier = i;
    this.good = this.bad = 0;
    this.settle = 2;
    this.apply(TIERS[i], i);
  }
}
