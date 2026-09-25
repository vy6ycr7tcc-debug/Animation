/* Sound (Web Audio).
   - Must be started inside the first tap (iOS rule).
   - iOS 17+: audioSession "playback" lets it sound with the silent switch on.
   - The bed is the package's water ambience (water-bed.mp3), looped with a crossfade so
     the seam never shows, plus soft tones kept above ~200 Hz. If the file can't load,
     generative lapping water stands in.
   - Narration plays on its own bus; while it speaks, the bed ducks (never mutes). */

type AudioSessionNav = Navigator & { audioSession?: { type: string } };
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class AudioEngine {
  ctx: AudioContext | null = null;
  volume = 0.8;
  sessionType = "unsupported";
  master!: GainNode;
  voice!: GainNode; // narration bus
  private bed!: GainNode; // everything that ducks under narration
  private fx!: GainNode;
  private rev!: ConvolverNode;
  private noise!: AudioBuffer;
  private laps: GainNode | null = null;
  private lapFilter: BiquadFilterNode | null = null;
  private bedFile: Promise<ArrayBuffer | null>;

  constructor(bedUrl: string) {
    // Fetch early; decoding waits for the context, which only exists after the first tap.
    this.bedFile = fetch(bedUrl)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
  }

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
    comp.threshold.value = -14;
    comp.ratio.value = 2.5;
    this.master.connect(comp).connect(c.destination);

    this.rev = c.createConvolver();
    const len = Math.floor(c.sampleRate * 4);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    this.rev.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.45;
    this.rev.connect(wet).connect(this.master);

    this.bed = c.createGain();
    this.bed.connect(this.master);
    this.fx = c.createGain();
    this.fx.connect(this.bed);
    this.fx.connect(this.rev);
    this.voice = c.createGain();
    this.voice.connect(this.master);

    this.noise = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    this.startBed();
    this.startTones();
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
    this.ramp(this.master?.gain, v, ramp);
  }

  /** Fade everything out (Leave) or back in, keeping the chosen volume. */
  fade(on: boolean): void {
    this.ramp(this.master?.gain, on ? this.volume : 0, on ? 2.5 : 1.5);
  }

  /** Duck the bed under narration (sidechain-style), or bring it back. */
  duck(on: boolean): void {
    this.ramp(this.bed?.gain, on ? 0.38 : 1, on ? 1.2 : 2.5);
  }

  private ramp(p: AudioParam | undefined, to: number, secs: number): void {
    if (!this.ctx || !p) return;
    const t = this.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(to, t + secs);
  }

  /* ---------- the bed ---------- */
  private async startBed(): Promise<void> {
    const c = this.ctx!;
    const data = await this.bedFile;
    let buf: AudioBuffer | null = null;
    if (data) {
      try {
        buf = await c.decodeAudioData(data.slice(0));
      } catch {
        buf = null;
      }
    }
    if (!buf) {
      this.startLaps();
      return;
    }
    const src = c.createBufferSource();
    src.buffer = crossfadeLoop(c, buf, 2.5);
    src.loop = true;
    const g = c.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(this.bed);
    src.start();
  }

  /** Generative lapping water, used only if the bed file can't be played. */
  private startLaps(): void {
    const c = this.ctx!;
    this.lapFilter = c.createBiquadFilter();
    this.lapFilter.type = "bandpass";
    this.lapFilter.frequency.value = 650;
    this.lapFilter.Q.value = 0.9;
    this.laps = c.createGain();
    this.laps.gain.value = 0;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.connect(this.lapFilter).connect(this.laps).connect(this.bed);
    s.start();
    const lap = () => {
      if (!this.ctx || !this.laps || !this.lapFilter) return;
      const t = this.ctx.currentTime;
      const g = this.laps.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.5 + Math.random() * 0.4);
      g.exponentialRampToValueAtTime(0.004, t + 2 + Math.random() * 1.2);
      this.lapFilter.frequency.setTargetAtTime(450 + Math.random() * 600, t, 0.4);
      window.setTimeout(lap, 1400 + Math.random() * 2600);
    };
    lap();
  }

  /** Soft night tones: open fifths, very quiet, slowly breathing. */
  private startTones(): void {
    const c = this.ctx!;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    const out = c.createGain();
    out.gain.value = 1;
    lp.connect(out).connect(this.bed);
    out.connect(this.rev);
    [293.66, 440, 554.37, 880].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = i % 2 ? "sine" : "triangle";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = c.createGain();
      g.gain.value = 0;
      const amp = 0.008 / (1 + i * 0.5);
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = 0.025 + i * 0.011;
      lg.gain.value = amp;
      const bias = c.createConstantSource();
      bias.offset.value = amp;
      l.connect(lg).connect(g.gain);
      bias.connect(g.gain);
      o.connect(g).connect(lp);
      o.start();
      l.start();
      bias.start();
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

  /** A soft touch of the foot: on sand a faint hush, on water a small splash. */
  step(water: boolean): void {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = water ? 900 + Math.random() * 500 : 1600 + Math.random() * 600;
    f.Q.value = water ? 0.8 : 1.2;
    const g = c.createGain();
    const peak = water ? 0.05 : 0.014;
    const len = water ? 0.35 : 0.09;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(this.fx);
    s.start(t, Math.random() * 3, len + 0.05);
  }
}

/** Fold the tail of a buffer over its head so it loops without a seam. */
function crossfadeLoop(c: BaseAudioContext, src: AudioBuffer, secs: number): AudioBuffer {
  const x = Math.min(Math.floor(secs * src.sampleRate), Math.floor(src.length / 4));
  const n = src.length - x;
  const out = c.createBuffer(src.numberOfChannels, n, src.sampleRate);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const a = src.getChannelData(ch);
    const o = out.getChannelData(ch);
    o.set(a.subarray(0, n));
    for (let i = 0; i < x; i++) {
      const k = i / x;
      // equal-power: the tail fades out as the head fades in
      o[i] = a[i] * Math.sin((k * Math.PI) / 2) + a[n + i] * Math.cos((k * Math.PI) / 2);
    }
  }
  return out;
}
