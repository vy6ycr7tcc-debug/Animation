/* Generative ambient sound (Web Audio). No audio files.
   - Must be started inside the first tap (iOS rule).
   - iOS 17+: audioSession "playback" lets it sound with the silent switch on.
   - Everything sits above ~200 Hz; phone speakers lose the low end.
   Beds: water lapping (hub), wind + pages (Mind), waterfall + stone (Body), resonant tones (Spirit).
   Zone gains follow the wanderer's closeness to each island. */

type AudioSessionNav = Navigator & { audioSession?: { type: string } };
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
export type Zone = "hub" | "mind" | "body" | "spirit";

export class AudioEngine {
  ctx: AudioContext | null = null;
  volume = 0.8;
  sessionType = "unsupported";
  private master!: GainNode;
  private fx!: GainNode; // dry + reverb send for one-shots
  private rev!: ConvolverNode;
  private zones = {} as Record<Zone, GainNode>;
  private noise!: AudioBuffer;
  private laps!: GainNode;
  private lapFilter!: BiquadFilterNode;
  private started = false;

  /** Call synchronously inside a click/touch handler. */
  start(): void {
    const nav = navigator as AudioSessionNav;
    try {
      if (nav.audioSession) {
        nav.audioSession.type = "playback";
        this.sessionType = nav.audioSession.type;
      }
    } catch {
      /* older iOS */
    }
    if (this.ctx) {
      this.resume();
      return;
    }
    const AC = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    c.resume();
    const silent = c.createBufferSource(); // fully unlocks output on older iOS
    silent.buffer = c.createBuffer(1, 1, c.sampleRate);
    silent.connect(c.destination);
    silent.start(0);

    this.master = c.createGain();
    this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 190;
    this.master.connect(hp).connect(comp).connect(c.destination);

    this.rev = c.createConvolver();
    const len = Math.floor(c.sampleRate * 4);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    this.rev.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.5;
    this.rev.connect(wet).connect(this.master);
    this.fx = c.createGain();
    this.fx.connect(this.master);
    this.fx.connect(this.rev);

    this.noise = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    for (const z of ["hub", "mind", "body", "spirit"] as Zone[]) {
      const g = c.createGain();
      g.gain.value = z === "hub" ? 1 : 0;
      g.connect(this.master);
      g.connect(this.rev);
      this.zones[z] = g;
    }
    this.buildHub();
    this.buildMind();
    this.buildBody();
    this.buildSpirit();
    this.started = true;
    this.setVolume(this.volume, 3);
  }

  resume(): void {
    if (this.ctx && this.ctx.state !== "running") this.ctx.resume();
  }
  suspend(): void {
    if (this.ctx && this.ctx.state === "running") this.ctx.suspend();
  }

  setVolume(v: number, ramp = 0.3): void {
    this.volume = v;
    if (!this.ctx) return;
    const g = this.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v, t + ramp);
  }

  /** Fade everything out (Leave) or back in. */
  fade(on: boolean): void {
    if (!this.ctx) return;
    const g = this.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(on ? this.volume : 0, t + (on ? 2.5 : 1.5));
  }

  setZones(w: Record<Zone, number>): void {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const z of Object.keys(w) as Zone[]) this.zones[z].gain.setTargetAtTime(w[z], t, 1.2);
  }

  /* ---------- beds ---------- */
  private loopNoise(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    s.start(0, Math.random() * 3);
    return s;
  }

  private buildHub(): void {
    const c = this.ctx!;
    // Water lapping: band-passed noise in slow, uneven swells.
    this.lapFilter = c.createBiquadFilter();
    this.lapFilter.type = "bandpass";
    this.lapFilter.frequency.value = 650;
    this.lapFilter.Q.value = 0.9;
    this.laps = c.createGain();
    this.laps.gain.value = 0;
    this.loopNoise().connect(this.lapFilter).connect(this.laps).connect(this.zones.hub);
    this.lap();
    // Air: very quiet, high.
    const air = c.createBiquadFilter();
    air.type = "highpass";
    air.frequency.value = 3500;
    const ag = c.createGain();
    ag.gain.value = 0.006;
    this.loopNoise().connect(air).connect(ag).connect(this.zones.hub);
    // Dawn pad: open fifths and a sixth, slowly breathing.
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1500;
    lp.connect(this.zones.hub);
    [440, 659.25, 739.99, 987.77].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = i % 2 ? "sine" : "triangle";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = c.createGain();
      g.gain.value = 0.0;
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = 0.03 + i * 0.013;
      lg.gain.value = 0.012 / (1 + i * 0.5);
      const bias = c.createConstantSource();
      bias.offset.value = 0.012 / (1 + i * 0.5);
      l.connect(lg).connect(g.gain);
      bias.connect(g.gain);
      o.connect(g).connect(lp);
      o.start();
      l.start();
      bias.start();
    });
  }

  private lap(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.laps.gain;
    const peak = 0.05 + Math.random() * 0.05;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(peak, t + 0.5 + Math.random() * 0.4);
    g.exponentialRampToValueAtTime(0.004, t + 2 + Math.random() * 1.2);
    this.lapFilter.frequency.setTargetAtTime(450 + Math.random() * 600, t, 0.4);
    window.setTimeout(() => this.lap(), 1400 + Math.random() * 2600);
  }

  private buildMind(): void {
    const c = this.ctx!;
    // Wind: a slowly sweeping band of noise.
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 800;
    bp.Q.value = 1.4;
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 0.07;
    lg.gain.value = 400;
    lfo.connect(lg).connect(bp.frequency);
    lfo.start();
    const g = c.createGain();
    g.gain.value = 0.05;
    this.loopNoise().connect(bp).connect(g).connect(this.zones.mind);
    // Pages: rare, soft paper turns.
    const page = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const s = this.ctx.createBufferSource();
      s.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 2400;
      const e = this.ctx.createGain();
      e.gain.setValueAtTime(0, t);
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.07;
        e.gain.linearRampToValueAtTime(0.03, tt + 0.01);
        e.gain.linearRampToValueAtTime(0.0, tt + 0.06);
      }
      s.connect(f).connect(e).connect(this.zones.mind);
      s.start(t, Math.random() * 3, 0.5);
      window.setTimeout(page, 3000 + Math.random() * 6000);
    };
    page();
  }

  private buildBody(): void {
    const c = this.ctx!;
    // Waterfall: steady broadband rush, kept out of the low end.
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 320;
    const g = c.createGain();
    g.gain.value = 0.05;
    this.loopNoise().connect(hp).connect(lp).connect(g).connect(this.zones.body);
    // Stone: an occasional low knock (still above 200 Hz).
    const knock = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(330 + Math.random() * 60, t);
      o.frequency.exponentialRampToValueAtTime(240, t + 0.2);
      const e = this.ctx.createGain();
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(0.06, t + 0.005);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(e).connect(this.zones.body);
      o.start(t);
      o.stop(t + 0.4);
      window.setTimeout(knock, 4000 + Math.random() * 7000);
    };
    knock();
  }

  private buildSpirit(): void {
    const c = this.ctx!;
    // High resonant tones that beat gently against each other.
    [880, 882.4, 1318.5, 1760, 1763].forEach((f, i) => {
      const o = c.createOscillator();
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = 0.012 / (1 + i * 0.4);
      o.connect(g).connect(this.zones.spirit);
      o.start();
    });
  }

  /* ---------- one-shots ---------- */
  bell(f: number, gain: number, dur: number): void {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    for (const [m, a] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = f * m;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * a, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / m);
      o.connect(g).connect(this.fx);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /** A soft touch of the foot: on stone a faint tick, on water a small splash. */
  step(water: boolean): void {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = water ? 900 + Math.random() * 500 : 2200 + Math.random() * 800;
    f.Q.value = water ? 0.8 : 2.5;
    const g = c.createGain();
    const peak = water ? 0.05 : 0.018;
    const len = water ? 0.35 : 0.06;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(this.fx);
    s.start(t, Math.random() * 3, len + 0.05);
  }
}
