/* Square breathing while the world carries you (v5 item 3; the owner). While auto-walk or autofly
   moves the wanderer, a ring of warm gold motes breathes round it at the heart's height: it opens
   on the inhale, holds, draws in on the exhale, rests, and again. Over the view, the side of the
   square ("Breathe", "Hold", "Release", "Hold") and its seconds counting (the owner; main.ts
   `breathCueFrame`); the first time, a line says what square breathing is. The pattern is config (`public/breathing.json`: 4-4-4-4 by
   default; 4-4-6-2 or any other is an edit there, no code).

   The voice: Aria will guide it ("Breathe in." / "Hold." / "Breathe out." / "Rest."), from the
   narrations pipeline. ASSET SLOT, PENDING: until those recordings exist the config names none, and
   the guide runs in silence with the same timing (no file is asked for, nothing complains). When
   they arrive, name them in the config: either four cue clips, one per phase (`voice.cues`), or one
   seamless clip of a whole cycle (`voice.loop`). Cues start on the audio clock exactly at each
   phase's edge; the bed ducks a little under them; "Only nature" rests them. Never synthesize a
   stand-in voice. */
import * as THREE from "three/webgpu";
import { T, outOfTheWay } from "../gpu/tsl";
import { pointCloud, touch } from "../scenes/densities/roomKit";
import type { AudioEngine } from "../core/audio";

const { cos, float, mix, sin, smoothstep, vec3, vec4 } = T;

export interface BreathPhase {
  name: "in" | "hold" | "out" | "rest";
  secs: number;
}
export interface BreathConfig {
  phases: BreathPhase[];
  voice: { cues: Partial<Record<BreathPhase["name"], string | null>>; loop: string | null; gain: number };
}
const DEFAULT: BreathConfig = {
  phases: [
    { name: "in", secs: 4 },
    { name: "hold", secs: 4 },
    { name: "out", secs: 4 },
    { name: "rest", secs: 4 },
  ],
  voice: { cues: {}, loop: null, gain: 0.9 },
};

const N = 220;

export class BreathGuide {
  readonly group = new THREE.Group();
  /** Breathing now (the world moves you). */
  active = false;
  /** The phase now and how far through it (0..1); `open` 0 drawn in .. 1 opened. */
  phase: BreathPhase["name"] = "in";
  phaseK = 0;
  open = 0;
  /** Still frames: hold the ring this open (0..1), whatever the clock says. */
  debugOpen: number | null = null;
  /** Cycles begun since it last started (for checking the timing). */
  cycles = 0;
  /** The count is running (past the pause before the first inhale), and the phase's length. */
  counting = false;
  secs = 4;
  /** The pattern (phases and their seconds), for the words that explain it. */
  get phases(): readonly BreathPhase[] {
    return this.cfg.phases;
  }
  private cfg: BreathConfig = DEFAULT;
  private cycle = 16;
  /** The cycle's start on the clock (seconds). */
  private t0 = 0;
  private lastPhase = -1;
  private uCenter = T.uniform(new THREE.Vector3());
  private uOpen = T.uniform(0);
  private uOn = T.uniform(0);
  private uT = T.uniform(0);
  private on = 0;
  private bufs = new Map<string, AudioBuffer | null>();
  /** The cue or cycle clip sounding now (faded out when the breathing ends). */
  private loopSrc: { stop(fade?: number): void } | null = null;
  private ducked = false;

  constructor(private audio: AudioEngine) {
    const c = pointCloud(N, 0.12);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.05;
      c.pos.set([a, (Math.random() - 0.5) * 0.5, Math.random()], i * 3);
      c.k.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    touch(c.cloud);
    const P = c.cloud.nodes.position, K = c.cloud.nodes.aK;
    const t = this.uT;
    // each mote on the ring: its angle turning slowly, its own small sway; the ring's radius is
    // the breath (drawn in 0.75 m, opened 2.3 m), a little looser at the edges of the band
    const a = P.x.add(t.mul(float(0.05).add(K.x.mul(0.04))));
    const r = mix(float(0.75), float(2.3), this.uOpen).mul(float(1).add(P.z.sub(0.5).mul(0.12))).add(sin(t.mul(0.7).add(K.y.mul(30))).mul(0.05));
    const y = float(1.2).add(P.y.mul(mix(float(0.35), float(1), this.uOpen))).add(sin(t.mul(0.5).add(K.z.mul(20))).mul(0.06));
    const p = this.uCenter.add(vec3(cos(a).mul(r), y, sin(a).mul(r)));
    c.material.positionNode = p;
    const twinkle = sin(t.mul(float(1.2).add(K.w)).add(K.x.mul(40))).mul(0.25).add(0.75);
    // contained: dim motes, a touch brighter as the breath fills; out of the camera's line to you
    const lum = mix(float(0.7), float(1.1), this.uOpen).mul(twinkle).mul(this.uOn).mul(outOfTheWay(p));
    c.material.colorNode = vec4(vec3(1.0, 0.8, 0.46).mul(c.round).mul(lum).mul(smoothstep(0, 0.02, this.uOn)), 1);
    c.cloud.sprite.frustumCulled = false;
    this.group.add(c.cloud.sprite);
    this.group.visible = false;
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}breathing.json`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as Partial<BreathConfig>;
      const phases = Array.isArray(j.phases) ? j.phases.filter((p) => p && typeof p.secs === "number" && p.secs > 0 && ["in", "hold", "out", "rest"].includes(p.name)) : [];
      if (phases.length) this.cfg.phases = phases as BreathPhase[];
      if (j.voice && typeof j.voice === "object") this.cfg.voice = { cues: j.voice.cues ?? {}, loop: j.voice.loop ?? null, gain: typeof j.voice.gain === "number" ? j.voice.gain : 0.9 };
    } catch {
      /* the defaults hold */
    }
    this.cycle = this.cfg.phases.reduce((s, p) => s + p.secs, 0);
  }

  /** The clock: the audio's own while it runs (the voice and the motes can never drift apart). */
  private now(): number {
    const c = this.audio.ctx;
    return c && c.state === "running" ? c.currentTime : performance.now() / 1000;
  }

  /** Begin (from the start of an inhale) or end. */
  set(on: boolean): void {
    if (on === this.active || (!on && this.debugOpen !== null)) return; // a still frame holds it open
    this.active = on;
    if (on) {
      this.t0 = this.now() + 0.6; // a breath's pause before the first inhale
      this.lastPhase = -1;
      this.cycles = 0;
    } else {
      this.loopSrc?.stop(1.2);
      this.loopSrc = null;
      this.duck(false);
    }
  }

  private duck(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    this.audio.duckSoft(on);
  }

  private async cue(url: string, when: number): Promise<void> {
    if (!this.bufs.has(url)) this.bufs.set(url, await this.audio.clip(url));
    const b = this.bufs.get(url);
    if (!b || !this.active) return;
    this.duck(true);
    this.loopSrc = this.audio.playClip(b, this.cfg.voice.gain, when);
    window.setTimeout(() => this.duck(false), Math.max(0, (when - this.now() + b.duration) * 1000 + 300));
  }

  /** Each frame: the wanderer's position; `voice` false rests the cues ("Only nature", another voice speaking). */
  update(dt: number, center: THREE.Vector3, voice: boolean): void {
    this.on += ((this.active ? 1 : 0) - this.on) * Math.min(1, dt * (this.active ? 0.8 : 1.6));
    // the ring of motes round the wanderer is no longer drawn (the owner: "remove the particles
    // around the flying ball, leave the lungs only"); the breath's clock still runs for the lungs
    this.group.visible = false;
    if (this.on <= 0.003) return;
    this.uOn.value = this.on;
    this.uT.value += dt;
    this.uCenter.value.copy(center);
    if (!this.active) return;
    if (this.debugOpen !== null) {
      this.uOpen.value = this.open = this.debugOpen;
      // a still frame: the inhale, this far through
      this.counting = true;
      this.phase = "in";
      this.secs = this.cfg.phases[0].secs;
      this.phaseK = Math.min(0.99, this.debugOpen);
      return;
    }
    const now = this.now();
    let s = now - this.t0;
    if (s < 0) {
      // the pause before the first breath: drawn in, still
      this.open += (0 - this.open) * Math.min(1, dt * 2);
      this.uOpen.value = this.open;
      this.counting = false;
      return;
    }
    const n = Math.floor(s / this.cycle);
    s -= n * this.cycle;
    let i = 0;
    while (i < this.cfg.phases.length - 1 && s >= this.cfg.phases[i].secs) s -= this.cfg.phases[i++].secs;
    const ph = this.cfg.phases[i];
    this.phase = ph.name;
    this.secs = ph.secs;
    this.counting = true;
    this.phaseK = Math.min(1, s / ph.secs);
    const e = this.phaseK * this.phaseK * (3 - 2 * this.phaseK);
    this.open = ph.name === "in" ? e : ph.name === "hold" ? 1 : ph.name === "out" ? 1 - e : 0;
    this.uOpen.value = this.open;
    // a phase's edge: its cue, started on the audio clock where the phase began
    const idx = n * this.cfg.phases.length + i;
    if (idx !== this.lastPhase) {
      this.lastPhase = idx;
      if (i === 0) this.cycles++;
      const at = this.t0 + n * this.cycle + this.cfg.phases.slice(0, i).reduce((q, p) => q + p.secs, 0);
      const v = this.cfg.voice;
      if (voice && v.loop && i === 0) {
        void this.cue(v.loop, Math.max(now, at));
      } else if (voice && !v.loop) {
        const url = v.cues[ph.name];
        if (url) void this.cue(url, Math.max(now, at));
      }
    }
  }
}
