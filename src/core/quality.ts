/* Frame timing and adaptive quality.
   Samuel: "we want the maximum resolution". So resolution comes first: every tier keeps the
   picture sharp (native on the top tier, never below 2x on a phone), and when frames run slow the
   render scale steps down within its band first (the least visible lever), then the costly effects
   rest, one by one; when there is headroom it all climbs back.
   The controller is patient: it ignores the hitches of the first seconds and of streaming new
   ground, it recognises a steady 30 fps cap (Low Power Mode) as a cap rather than as slowness,
   and after a long good run it tries the tier above again.
   Its tuning is not in code: `public/quality.json` (read at boot, `loadQualityConfig`) holds the
   frame targets, the hysteresis, the scale band, the start tier per kind of device and the tiers
   themselves. The values below are the defaults it falls back on, field by field. */

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

/** A tier as the config writes it: what differs on a phone is given separately. */
interface TierDef extends Tier {
  particlesPhone: number;
  aoPhone: boolean;
}

export interface QualityConfig {
  /** Below this the window counts as slow; above `goodFps` as good (the gap is the hysteresis). */
  slowFps: number;
  goodFps: number;
  /** Slow windows (≈1 s each) in a row before stepping down; good ones before stepping up. */
  slowWindows: number;
  goodWindows: number;
  /** Windows before a tier that ran slow is tried again. */
  retryWindows: number;
  /** Windows ignored at the start (shader compile, the world streaming in). */
  startSettle: number;
  /** The render scale's band (of the tier's pixel ratio) and its step. */
  scaleMin: number;
  scaleStep: number;
  /** Sharpness floors: never render below this pixel ratio (phones, desktops). */
  dprFloorPhone: number;
  dprFloorDesktop: number;
  /** Low Power Mode: a steady ~30 fps is a cap, not slowness. */
  lowPower: { minFps: number; maxFps: number; maxWorstMs: number };
  /** A device counts as lower-end with this many cores or this much memory (GB) or fewer. */
  lowEnd: { maxCores: number; maxMemoryGB: number };
  /** The tier each kind of device starts on (by name); the controller adapts from there. */
  start: { phone: string; phoneLowEnd: string; desktop: string; desktopLowEnd: string };
  tiers: TierDef[];
}

export const MOBILE =
  matchMedia("(pointer:coarse)").matches || Math.min(screen.width, screen.height) < 700;

/** The defaults (the controller as it was tuned before the config existed). */
export const QUALITY_DEFAULTS: QualityConfig = {
  slowFps: 50,
  goodFps: 56,
  slowWindows: 3,
  goodWindows: 10,
  retryWindows: 30,
  startSettle: 8,
  scaleMin: 0.5,
  scaleStep: 0.1,
  dprFloorPhone: 2,
  dprFloorDesktop: 1,
  lowPower: { minFps: 27, maxFps: 32, maxWorstMs: 45 },
  lowEnd: { maxCores: 4, maxMemoryGB: 3 },
  start: { phone: "high", phoneLowEnd: "medium", desktop: "full", desktopLowEnd: "high" },
  tiers: [
    // on a phone the ambient occlusion rests even at the top: at native resolution it cost the most
    // of any effect for the least seen (Samuel's iPhone ran at ~43 fps with it)
    { name: "full", dpr: 3, shadow: 2048, bloom: true, particles: 1800, particlesPhone: 1200, ao: true, aoPhone: false, rays: true, reflection: true },
    { name: "high", dpr: 3, shadow: 2048, bloom: true, particles: 1100, particlesPhone: 1100, ao: false, aoPhone: false, rays: true, reflection: true },
    { name: "medium", dpr: 2.5, shadow: 1024, bloom: true, particles: 900, particlesPhone: 900, ao: false, aoPhone: false, rays: false, reflection: true },
    { name: "light", dpr: 2, shadow: 1024, bloom: true, particles: 700, particlesPhone: 700, ao: false, aoPhone: false, rays: false, reflection: false },
    { name: "minimum", dpr: 2, shadow: 512, bloom: false, particles: 400, particlesPhone: 400, ao: false, aoPhone: false, rays: false, reflection: false },
  ],
};

/** The tuning in force (the defaults until `quality.json` is read). */
export const QCONFIG: QualityConfig = structuredClone(QUALITY_DEFAULTS);

/** The tiers in force, for this device (phone values on a phone). Rebuilt in place. */
export const TIERS: Tier[] = [];
function buildTiers(): void {
  TIERS.length = 0;
  for (const d of QCONFIG.tiers)
    TIERS.push({ name: d.name, dpr: d.dpr, shadow: d.shadow, bloom: d.bloom, particles: MOBILE ? d.particlesPhone : d.particles, ao: MOBILE ? d.aoPhone : d.ao, rays: d.rays, reflection: d.reflection });
}
buildTiers();

/** Lay `src` over `dst`, keeping only fields of the right kind (a bad value keeps the default). */
function merge<T extends object>(dst: T, src: unknown): void {
  if (!src || typeof src !== "object") return;
  for (const k of Object.keys(dst) as (keyof T)[]) {
    const v = (src as Record<string, unknown>)[k as string], cur = dst[k];
    if (v === undefined) continue;
    if (typeof cur === "number" && typeof v === "number" && Number.isFinite(v)) dst[k] = v as T[keyof T];
    else if (typeof cur === "string" && typeof v === "string") dst[k] = v as T[keyof T];
    else if (typeof cur === "boolean" && typeof v === "boolean") dst[k] = v as T[keyof T];
    else if (cur && typeof cur === "object" && !Array.isArray(cur)) merge(cur as object, v);
  }
}

/** Read `quality.json` (beside the page) over the defaults. Silent if it's missing or broken: the
    defaults stand. Returns whether it was read. */
export async function loadQualityConfig(url = "quality.json"): Promise<boolean> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return false;
    const cfg = (await res.json()) as Partial<QualityConfig>;
    const next: QualityConfig = structuredClone(QUALITY_DEFAULTS);
    merge(next, cfg);
    // the tiers: a list of whole tiers, each laid over the default of its name (or the last)
    if (Array.isArray(cfg.tiers) && cfg.tiers.length) {
      next.tiers = cfg.tiers.map((t, i) => {
        const base = structuredClone(QUALITY_DEFAULTS.tiers.find((d) => d.name === (t as Partial<TierDef>)?.name) ?? QUALITY_DEFAULTS.tiers[Math.min(i, QUALITY_DEFAULTS.tiers.length - 1)]);
        merge(base, t);
        return base;
      });
    }
    Object.assign(QCONFIG, next);
    buildTiers();
    return true;
  } catch {
    return false;
  }
}

/** Whether this device counts as lower-end (few cores or little memory, where the browser says). */
function lowEnd(): boolean {
  const cores = navigator.hardwareConcurrency || 8;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  return cores <= QCONFIG.lowEnd.maxCores || mem <= QCONFIG.lowEnd.maxMemoryGB;
}
/** The tier this device starts on. */
export function startTier(): number {
  const s = QCONFIG.start, low = lowEnd();
  const name = MOBILE ? (low ? s.phoneLowEnd : s.phone) : low ? s.desktopLowEnd : s.desktop;
  const i = TIERS.findIndex((t) => t.name === name);
  return i >= 0 ? i : 0;
}

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
  tier = startTier();
  /** Render scale on top of the tier's pixel ratio: lowered in small steps before any effect is
      given up, within its band and never below the sharpness floor. The browser upscales. */
  scale = 1;
  /** Keep a tier whatever happens (a manual override; see `override`). */
  pinned = false;
  /** Why the last change happened, for the readout. */
  reason = "start";
  private good = 0;
  private bad = 0;
  private settle = QCONFIG.startSettle; // ignore the first seconds (shader compile, audio start, the world streaming in)
  private failedAt = new Map<number, number>(); // tier -> windows since it ran slow
  private windows = 0;
  private judged = false;

  constructor(private apply: (t: Tier, index: number) => void) {}

  get current(): Tier {
    return TIERS[Math.min(this.tier, TIERS.length - 1)];
  }

  private get floor(): number {
    return Math.min(devicePixelRatio || 1, MOBILE ? QCONFIG.dprFloorPhone : QCONFIG.dprFloorDesktop);
  }

  /** The pixel ratio to render at: the tier's cap, times the render scale, above the floor. */
  get dpr(): number {
    const device = devicePixelRatio || 1;
    return Math.max(this.floor, Math.min(device, this.current.dpr) * this.scale);
  }

  /** The config was read (after boot began): take its start tier if nothing has been judged yet. */
  reconfigure(): void {
    if (this.pinned) return;
    if (!this.judged) {
      this.tier = startTier();
      this.settle = Math.max(this.settle, Math.min(QCONFIG.startSettle, 4));
    } else this.tier = Math.min(this.tier, TIERS.length - 1);
    this.reason = "config";
    this.apply(this.current, this.tier);
  }

  /** A manual override (for a settings menu, if one is ever wanted): a tier by name, held whatever
      the frame rate; `null` returns to automatic. Not shown anywhere yet (the owner leans
      automatic-only). */
  override(name: string | null): void {
    if (name === null) {
      this.pinned = false;
      this.reason = "auto";
      this.good = this.bad = 0;
      return;
    }
    const i = TIERS.findIndex((t) => t.name === name);
    if (i < 0) return;
    this.pinned = true;
    this.scale = 1;
    this.reason = `override: ${name}`;
    this.tier = i;
    this.apply(this.current, i);
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
    this.judged = true;
    const C = QCONFIG, lp = C.lowPower;
    // Low Power Mode caps Safari at a steady 30 fps: that is a power setting, not a slow phone
    const capped30 = stats.fps > lp.minFps && stats.fps < lp.maxFps && stats.worstMs < lp.maxWorstMs;
    const canScaleDown = Math.min(devicePixelRatio || 1, this.current.dpr) * (this.scale - C.scaleStep) >= this.floor - 1e-3 && this.scale - C.scaleStep >= C.scaleMin - 1e-3;
    if (stats.fps < C.slowFps && !capped30) {
      this.good = 0;
      if (++this.bad >= C.slowWindows) {
        if (canScaleDown) this.setScale(this.scale - C.scaleStep, "slow: render scale down");
        else if (this.tier < TIERS.length - 1) {
          this.failedAt.set(this.tier, this.windows);
          this.reason = "slow: effects down";
          this.set(this.tier + 1);
        }
      }
    } else if (stats.fps > C.goodFps || capped30) {
      this.bad = 0;
      if (++this.good >= C.goodWindows) {
        // climb back: sharpness first, then the tier above (a tier that ran slow is retried later)
        const above = this.tier - 1, failed = this.failedAt.get(above);
        if (this.scale < 1) this.setScale(this.scale + C.scaleStep, "good: render scale up");
        else if (above >= 0 && (failed === undefined || this.windows - failed > C.retryWindows)) {
          this.reason = "good: effects up";
          this.set(above);
        } else this.good = 0;
      }
    } else {
      this.good = this.bad = 0;
    }
  }

  private setScale(v: number, reason: string): void {
    const step = QCONFIG.scaleStep;
    this.scale = Math.round(Math.min(1, Math.max(QCONFIG.scaleMin, v)) / step) * step;
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
