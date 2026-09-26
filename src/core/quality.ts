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
  // on a phone the ambient occlusion rests even at the top: at native resolution it cost the most
  // of any effect for the least seen (Samuel's iPhone ran at ~43 fps with it)
  { name: "full", dpr: 3, shadow: 2048, bloom: true, particles: MOBILE ? 1200 : 1800, ao: !MOBILE, rays: true, reflection: true },
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
  /** Render scale on top of the tier's pixel ratio: lowered in small steps before any effect is
      given up, and never below the sharpness floor (2x on a phone). The browser upscales. */
  scale = 1;
  /** Keep the top tier whatever happens (a setting). */
  pinned = false;
  /** Why the last change happened, for the readout. */
  reason = "start";
  private good = 0;
  private bad = 0;
  private settle = 8; // ignore the first seconds (shader compile, audio start, the world streaming in)
  private failedAt = new Map<number, number>(); // tier -> windows since it ran slow
  private windows = 0;

  constructor(private apply: (t: Tier, index: number) => void) {}

  get current(): Tier {
    return TIERS[this.tier];
  }

  /** The pixel ratio to render at: the tier's cap, times the render scale, above the floor. */
  get dpr(): number {
    const device = devicePixelRatio || 1;
    const floor = Math.min(device, MOBILE ? 2 : 1);
    return Math.max(floor, Math.min(device, this.current.dpr) * this.scale);
  }

  /** A burst of new work is coming (arriving somewhere, streaming ground): don't judge it. */
  hold(windows = 3): void {
    this.settle = Math.max(this.settle, windows);
  }

  /** Feed once per stats window (about a second). */
  window(stats: FrameStats): void {
    this.windows++;
    if (this.pinned) return;
    if (this.settle > 0) {
      this.settle--;
      return;
    }
    // Low Power Mode caps Safari at a steady 30 fps: that is a power setting, not a slow phone
    const capped30 = stats.fps > 27 && stats.fps < 32 && stats.worstMs < 45;
    const canScaleDown = Math.min(devicePixelRatio || 1, this.current.dpr) * (this.scale - 0.1) >= Math.min(devicePixelRatio || 1, MOBILE ? 2 : 1) - 1e-3;
    if (stats.fps < 50 && !capped30) {
      this.good = 0;
      if (++this.bad >= 3) {
        if (canScaleDown && this.scale > 0.7) this.setScale(this.scale - 0.1, "slow: render scale down");
        else if (this.tier < TIERS.length - 1) {
          this.failedAt.set(this.tier, this.windows);
          this.reason = "slow: effects down";
          this.set(this.tier + 1);
        }
      }
    } else if (stats.fps > 56 || capped30) {
      this.bad = 0;
      if (++this.good >= 10) {
        // climb back: sharpness first, then the tier above (a tier that ran slow is retried after ~30 s)
        const above = this.tier - 1, failed = this.failedAt.get(above);
        if (this.scale < 1) this.setScale(this.scale + 0.1, "good: render scale up");
        else if (above >= 0 && (failed === undefined || this.windows - failed > 30)) {
          this.reason = "good: effects up";
          this.set(above);
        } else this.good = 0;
      }
    } else {
      this.good = this.bad = 0;
    }
  }

  private setScale(v: number, reason: string): void {
    this.scale = Math.round(Math.min(1, Math.max(0.5, v)) * 10) / 10;
    this.reason = reason;
    this.good = this.bad = 0;
    this.settle = 2;
    this.apply(this.current, this.tier);
  }

  set(i: number): void {
    this.tier = i;
    this.good = this.bad = 0;
    this.settle = 3;
    this.apply(TIERS[i], i);
  }
}
