/* Web Audio engine.
   - Must be started from inside a user tap (iOS requirement).
   - iOS 17+: navigator.audioSession.type = "playback" lets sound play with the silent switch on.
   - Everything sits above ~200 Hz because phone speakers lose the low end. */

type AudioSessionNav = Navigator & { audioSession?: { type: string } };
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class AudioEngine {
  ctx: AudioContext | null = null;
  on = true;
  sessionType = "unsupported";
  private master!: GainNode;
  private music!: GainNode;
  private bus!: BiquadFilterNode;
  private voices: OscillatorNode[][] = [];
  private chordI = 0;

  /** Call synchronously inside a click/touch handler. */
  start(): void {
    const nav = navigator as AudioSessionNav;
    try {
      if (nav.audioSession) {
        nav.audioSession.type = "playback";
        this.sessionType = nav.audioSession.type;
      }
    } catch {
      /* older iOS: no audioSession */
    }
    if (this.ctx) {
      this.resume();
      return;
    }
    const AC = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    c.resume();
    // A silent buffer played inside the tap fully unlocks output on older iOS.
    const silent = c.createBufferSource();
    silent.buffer = c.createBuffer(1, 1, c.sampleRate);
    silent.connect(c.destination);
    silent.start(0);

    this.master = c.createGain();
    this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(c.destination);

    // Keep the low end out: phone speakers can't play it and it muddies everything else.
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 200;
    hp.Q.value = 0.5;
    this.music = c.createGain();
    this.music.connect(hp).connect(this.master);

    this.bus = c.createBiquadFilter();
    this.bus.type = "lowpass";
    this.bus.frequency.value = 1300;
    this.bus.Q.value = 0.6;
    this.bus.connect(this.music);

    // Procedural reverb.
    const conv = c.createConvolver();
    const len = Math.floor(c.sampleRate * 3.5);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    conv.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.55;
    this.bus.connect(conv).connect(wet).connect(this.music);

    // Slow filter breath.
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 0.05;
    lg.gain.value = 350;
    lfo.connect(lg).connect(this.bus.frequency);
    lfo.start();

    // Pad: three voices of two detuned oscillators, gliding through A · F#m · D · E.
    for (let v = 0; v < 3; v++) {
      const g = c.createGain();
      g.gain.value = 0.035;
      g.connect(this.bus);
      this.voices.push(
        [-7, 7].map((dt) => {
          const o = c.createOscillator();
          o.type = "sawtooth";
          o.detune.value = dt;
          o.connect(g);
          o.start();
          return o;
        }),
      );
    }

    // Air: band-passed noise, well above 200 Hz.
    const nb = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const ns = c.createBufferSource();
    ns.buffer = nb;
    ns.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const wg = c.createGain();
    wg.gain.value = 0.014;
    ns.connect(bp).connect(wg).connect(this.music);
    ns.start();

    this.setChord();
    window.setInterval(() => this.setChord(), 14000);
    this.setOn(this.on);
    // An immediate soft bell confirms sound right after the tap.
    this.bell(880, 0.06, 5);
    window.setTimeout(() => this.bell(1318.5, 0.04, 6), 260);
    this.bellLoop();
  }

  resume(): void {
    if (this.ctx && this.ctx.state !== "running") this.ctx.resume();
  }
  suspend(): void {
    if (this.ctx && this.ctx.state === "running") this.ctx.suspend();
  }

  setOn(on: boolean): void {
    this.on = on;
    if (!this.ctx) return;
    const g = this.master.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(on ? 0.85 : 0, t + (on ? 2 : 0.4));
  }

  /** Lower the music while a voice speaks. */
  duck(down: boolean): void {
    if (!this.ctx) return;
    const g = this.music.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(down ? 0.35 : 1, t + 1.2);
  }

  bell(f: number, gain: number, dur: number): void {
    if (!this.ctx || !this.on) return;
    const c = this.ctx;
    const t = c.currentTime;
    for (const [m, a] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
      const o = c.createOscillator();
      const gn = c.createGain();
      o.frequency.value = f * m;
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(gain * a, t + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur / m);
      o.connect(gn).connect(this.bus);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /** The chord a place makes when it opens (Mind: a fourth, rising). */
  openChord(): void {
    const b = 440;
    this.bell(b, 0.09, 6);
    window.setTimeout(() => this.bell((b * 4) / 3, 0.07, 6), 180);
    window.setTimeout(() => this.bell(b * 2, 0.05, 8), 420);
  }

  private setChord(): void {
    if (!this.ctx) return;
    const CHORDS = [
      [220, 329.63, 554.37],
      [277.18, 369.99, 440],
      [293.66, 369.99, 440],
      [246.94, 329.63, 415.3],
    ];
    const ch = CHORDS[this.chordI++ % CHORDS.length];
    const t = this.ctx.currentTime;
    this.voices.forEach((os, i) => os.forEach((o) => o.frequency.setTargetAtTime(ch[i], t, 2.5)));
  }

  private bellLoop(): void {
    const pent = [659.25, 739.99, 880, 987.77, 1108.73, 1318.5];
    this.bell(pent[Math.floor(Math.random() * pent.length)], 0.035, 5);
    window.setTimeout(() => this.bellLoop(), 5000 + Math.random() * 6000);
  }
}
