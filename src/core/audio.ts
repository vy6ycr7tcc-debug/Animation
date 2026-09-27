/* Sound (Web Audio).
   - Must be started inside the first tap (iOS rule).
   - iOS 17+: audioSession "playback" lets it sound with the silent switch on.
   - The bed is the package's water ambience (water-bed.mp3), looped with a crossfade so
     the seam never shows, plus soft tones kept above ~200 Hz. If the file can't load,
     generative lapping water stands in.
   - Narration plays on its own bus; while it speaks, the bed ducks (never mutes). */

import { loadBytes } from "./assets";

/** The heartbeat shared by genesis's sound and its light: first beat, and the time between. */
export const HEART_START = 0.3, HEART_PERIOD = 0.95;

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
  private muffle!: BiquadFilterNode;
  private under = false;
  private rev!: ConvolverNode;
  private noise!: AudioBuffer;
  private laps: GainNode | null = null;
  private lapFilter: BiquadFilterNode | null = null;
  private bedFile: Promise<ArrayBuffer | null>;
  // the open world's sounds (the water and the night tones), silenced inside the temple
  private worldDry!: GainNode;
  private worldWet!: GainNode;
  // the temple: its own long, dark stone reverb; footsteps and a far chant
  private templeBus!: GainNode;
  private hall!: ConvolverNode;
  private chant: GainNode | null = null;
  private inTemple = false;

  constructor(bedPath: string) {
    // Load early; decoding waits for the context, which only exists after the first tap.
    this.bedFile = loadBytes(bedPath);
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
    // under the water, the world's sounds are muffled (the voices stay clear)
    this.muffle = c.createBiquadFilter();
    this.muffle.type = "lowpass";
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.5;
    this.muffle.connect(this.master);
    const wet = c.createGain();
    wet.gain.value = 0.45;
    this.rev.connect(wet).connect(this.muffle);

    this.bed = c.createGain();
    this.bed.connect(this.muffle);
    this.fx = c.createGain();
    this.fx.connect(this.bed);
    this.fx.connect(this.rev);
    this.voice = c.createGain();
    this.voice.connect(this.master);
    this.worldDry = c.createGain();
    this.worldDry.connect(this.bed);
    this.worldWet = c.createGain();
    this.worldWet.connect(this.rev);
    // the temple's hall: a long, dark tail (the high end dies first in stone rooms)
    this.templeBus = c.createGain();
    this.templeBus.gain.value = 0;
    this.templeBus.connect(this.master);
    this.hall = c.createConvolver();
    {
      const n = Math.floor(c.sampleRate * 5.5), ir = c.createBuffer(2, n, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const k = i / n, a = Math.min(1, i / (c.sampleRate * 0.02)); // a short gap before the walls answer
          lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.42 * k); // darker as it fades
          d[i] = lp * a * Math.pow(1 - k, 2.2) * 1.6;
        }
      }
      this.hall.buffer = ir;
    }
    const hallWet = c.createGain();
    hallWet.gain.value = 0.9;
    this.hall.connect(hallWet).connect(this.templeBus);

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

  /** The camera has gone under the water (or come up): muffle the world, gently. */
  underwater(on: boolean): void {
    const c = this.ctx;
    if (!c || !this.muffle || on === this.under) return;
    this.under = on;
    const f = this.muffle.frequency, t = c.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(on ? 750 : 20000, t + (on ? 0.3 : 0.6));
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
    src.connect(g).connect(this.worldDry);
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
    s.connect(this.lapFilter).connect(this.laps).connect(this.worldDry);
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
    lp.connect(out).connect(this.worldDry);
    out.connect(this.worldWet);
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

  /* ---------- the temple ---------- */
  /** Into the temple (or out): the water and the night tones fall silent, the stone hall
      takes over, and a far chant begins; outside again, all as it was. */
  setTemple(on: boolean, chant = true): void {
    if (!this.ctx || on === this.inTemple) return;
    this.inTemple = on;
    this.ramp(this.worldDry.gain, on ? 0 : 1, on ? 1.2 : 2.5);
    this.ramp(this.worldWet.gain, on ? 0 : 1, on ? 1.2 : 2.5);
    this.ramp(this.templeBus.gain, on ? 1 : 0, on ? 2 : 1);
    if (on && chant && !this.chant) this.startChant();
    // the pyramid keeps its silence: no chant there
    if (this.chant) this.ramp(this.chant.gain, on && chant ? 0.55 : 0, 1.5);
  }

  /** A short recorded line (the opening's voice), decoded for playing on the voice bus. */
  async clip(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await this.ctx.decodeAudioData(await r.arrayBuffer());
    } catch {
      return null;
    }
  }
  playClip(buf: AudioBuffer, gain = 1): void {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = buf;
    g.gain.value = gain;
    s.connect(g).connect(this.voice);
    s.start();
  }

  /** One heartbeat, lub-dub (the Queen's Chamber, in the dark). */
  heartbeat(gain = 0.3): void {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    for (const [dt, a] of [[0, 1], [0.26, 0.6]] as const) {
      const at = t + dt;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(95, at);
      o.frequency.exponentialRampToValueAtTime(48, at + 0.14);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(gain * a, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
      o.connect(g).connect(this.master);
      o.start(at);
      o.stop(at + 0.32);
      const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = this.noise;
      nf.type = "lowpass";
      nf.frequency.value = 260;
      ng.gain.setValueAtTime(0, at);
      ng.gain.linearRampToValueAtTime(gain * 0.7 * a, at + 0.008);
      ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      n.connect(nf).connect(ng).connect(this.master);
      n.start(at, Math.random() * 3, 0.15);
    }
  }

  /** Everything but the heart falls silent (the Queen's Chamber), or comes back. */
  hush(on: boolean, seconds = 3): void {
    if (!this.ctx) return;
    this.ramp(this.bed.gain, on ? 0 : 1, seconds);
    this.ramp(this.templeBus.gain, on ? 0 : this.inTemple ? 1 : 0, seconds);
  }

  private reso: GainNode | null = null;
  /** The resonating chamber's hum (0–1): a low tone and its overtones, slowly beating. */
  resonance(k: number): void {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.reso) {
      if (k < 0.01) return;
      this.reso = c.createGain();
      this.reso.gain.value = 0;
      this.reso.connect(this.master);
      this.reso.connect(this.hall);
      for (const [f, a, d] of [[98, 0.6, 0], [196, 0.45, 1.5], [294, 0.3, -2], [392, 0.22, 2.5], [588, 0.1, -3]] as const) {
        for (const det of [0, d]) {
          const o = c.createOscillator(), g = c.createGain();
          o.frequency.value = f;
          o.detune.value = det;
          g.gain.value = a * 0.5;
          o.connect(g).connect(this.reso);
          o.start();
        }
      }
    }
    this.reso.gain.setTargetAtTime(k * 0.08, c.currentTime, 0.6);
  }

  /** A footstep on stone: the soft slap of a bare sole and the hall answering. */
  stepStone(): void {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1100 + Math.random() * 500;
    f.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    s.connect(f).connect(g);
    // a little weight: a dull knock under the slap
    const o = c.createOscillator();
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
    const og = c.createGain();
    og.gain.setValueAtTime(0.03, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(og);
    for (const n of [g, og]) {
      n.connect(this.templeBus);
      n.connect(this.hall);
    }
    s.start(t, Math.random() * 3, 0.1);
    o.start(t);
    o.stop(t + 0.1);
  }

  /** A far chant: a few low voices on one mode, each breathing its own long phrases, the
      vowels slowly changing (oo, oh, ah), almost all of it the hall's echo. */
  private startChant(): void {
    const c = this.ctx!;
    this.chant = c.createGain();
    this.chant.gain.value = 0.55;
    this.chant.connect(this.hall);
    const dry = c.createGain();
    dry.gain.value = 0.08;
    this.chant.connect(dry).connect(this.templeBus);
    const MODE = [146.83, 164.81, 174.61, 196.0, 220.0, 293.66]; // D, E, F, G, A, d
    const VOWELS: [number, number][] = [[320, 800], [480, 880], [700, 1150]];
    const voice = (base: number, detune: number) => {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = base;
      o.detune.value = detune;
      const vib = c.createOscillator(), vg = c.createGain();
      vib.frequency.value = 4.6 + Math.random();
      vg.gain.value = 3.5;
      vib.connect(vg).connect(o.detune);
      const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter();
      f1.type = f2.type = "bandpass";
      f1.Q.value = 7;
      f2.Q.value = 9;
      const a = c.createGain();
      a.gain.value = 0;
      o.connect(f1).connect(a);
      o.connect(f2).connect(a);
      a.connect(this.chant!);
      o.start();
      vib.start();
      const phrase = () => {
        if (!this.ctx || !this.inTemple) {
          window.setTimeout(phrase, 4000);
          return;
        }
        const t = this.ctx.currentTime;
        const [v1, v2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
        f1.frequency.setTargetAtTime(v1, t, 1.2);
        f2.frequency.setTargetAtTime(v2, t, 1.2);
        if (Math.random() < 0.35) o.frequency.setTargetAtTime(MODE[Math.floor(Math.random() * MODE.length)] * (base / 146.83 >= 1.9 ? 2 : 1), t, 0.6);
        const hold = 5 + Math.random() * 5, rise = 2.5 + Math.random();
        a.gain.cancelScheduledValues(t);
        a.gain.setValueAtTime(a.gain.value, t);
        a.gain.linearRampToValueAtTime(0.02, t + rise);
        a.gain.setValueAtTime(0.02, t + rise + hold);
        a.gain.linearRampToValueAtTime(0, t + rise + hold + 3);
        window.setTimeout(phrase, (rise + hold + 3 + 2 + Math.random() * 6) * 1000);
      };
      window.setTimeout(phrase, Math.random() * 5000);
    };
    voice(146.83, -4);
    voice(146.83, 5);
    voice(220.0, 0);
    voice(293.66, 3);
  }

  /* ---------- genesis: a cosmic crescendo (Samuel: "add some cosmic crescendo music") ---------- */
  /** The 30 s score for genesis, in step with it: a heartbeat in the dark (lub-dub, ~63 a
      minute, the same beat as the heart's light: `heartbeat`); an open chord of stacked fifths
      swelling as its filter opens; glints that come faster and faster; a rising shimmer and far
      voices; at 18 s, as creation comes back, a soft bloom and the chord resolving into D major,
      high and bright, fading over the last ten seconds. Its own bus (the bed is ducked). */
  genesisScore(): void {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + 0.05;
    const bus = c.createGain();
    bus.gain.value = 0.9;
    bus.connect(this.master);
    const send = c.createGain();
    send.gain.value = 0.55;
    bus.connect(send).connect(this.rev);
    const env = (g: GainNode, pts: [number, number][]) => {
      g.gain.setValueAtTime(0, t0);
      for (const [t, v] of pts) g.gain.linearRampToValueAtTime(v, t0 + t);
    };
    const tone = (f: number, type: OscillatorType, start: number, end: number, out: AudioNode, detune = 0) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(out);
      o.start(t0 + start);
      o.stop(t0 + end);
      return o;
    };
    // the heartbeat, in the dark and under the rising sound
    for (let t = HEART_START; t < 17; t += HEART_PERIOD) {
      const k = Math.min(1, (t + 0.5) / 2) * (1 - Math.max(0, (t - 12) / 5));
      for (const [dt, a] of [[0, 1], [0.26, 0.6]] as const) {
        const at = t0 + t + dt;
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(95, at);
        o.frequency.exponentialRampToValueAtTime(48, at + 0.14);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.32 * a * k, at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
        o.connect(g).connect(bus);
        o.start(at);
        o.stop(at + 0.32);
        // its body where a phone can play it: a soft, low knock
        const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
        n.buffer = this.noise;
        nf.type = "lowpass";
        nf.frequency.value = 260;
        ng.gain.setValueAtTime(0, at);
        ng.gain.linearRampToValueAtTime(0.22 * a * k, at + 0.008);
        ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
        n.connect(nf).connect(ng).connect(bus);
        n.start(at, Math.random() * 3, 0.15);
      }
    }
    // the drone beneath
    const drone = c.createGain();
    env(drone, [[1, 0.02], [10, 0.05], [18, 0.07], [22, 0.04], [29.5, 0]]);
    drone.connect(bus);
    for (const f of [73.42, 110, 146.83]) tone(f, "sine", 0, 30, drone);
    // the open chord of fifths, swelling as its filter opens
    const padF = c.createBiquadFilter();
    padF.type = "lowpass";
    padF.Q.value = 0.8;
    padF.frequency.setValueAtTime(260, t0);
    padF.frequency.setValueAtTime(260, t0 + 3);
    padF.frequency.exponentialRampToValueAtTime(4800, t0 + 17.5);
    padF.frequency.exponentialRampToValueAtTime(1800, t0 + 21);
    const pad = c.createGain();
    env(pad, [[3, 0], [10, 0.01], [15, 0.03], [17.5, 0.055], [19.5, 0.0]]); // twelve voices
    pad.connect(padF).connect(bus);
    for (const f of [146.83, 220, 329.63, 493.88]) for (const d of [-9, 0, 8]) tone(f, "sawtooth", 3, 20, pad, d);
    // the resolution: D major, open and high
    const resF = c.createBiquadFilter();
    resF.type = "lowpass";
    resF.frequency.value = 5200;
    const res = c.createGain();
    env(res, [[17.8, 0], [19, 0.045], [23, 0.028], [29.8, 0]]); // fifteen voices
    res.connect(resF).connect(bus);
    for (const f of [146.83, 220, 293.66, 369.99, 440, 659.25]) for (const d of [-6, 6]) tone(f, "sawtooth", 17.8, 30, res, d);
    for (const f of [587.33, 880, 1174.66]) tone(f, "sine", 17.8, 30, res);
    // glints: high notes of D major's pentatonic, faster and faster, then a slow climb after
    const glints = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51];
    const pluck = (f: number, at: number, a: number) => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(a, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.6);
      o.connect(g).connect(bus);
      o.start(t0 + at);
      o.stop(t0 + at + 1.7);
    };
    for (let t = 4; t < 17.8; t += Math.max(0.1, 0.62 - (t - 4) * 0.038)) pluck(glints[Math.floor(Math.random() * glints.length)], t, 0.012 + (t - 4) * 0.0012);
    [293.66, 369.99, 440, 587.33, 739.99, 880, 1174.66, 1479.98, 1760, 2349.32].forEach((f, i) => pluck(f, 18.4 + i * 0.55, 0.03 - i * 0.002));
    // a rising shimmer into the turn
    const nz = c.createBufferSource(), nzf = c.createBiquadFilter(), nzg = c.createGain();
    nz.buffer = this.noise;
    nz.loop = true;
    nzf.type = "bandpass";
    nzf.Q.value = 2.5;
    nzf.frequency.setValueAtTime(500, t0 + 9);
    nzf.frequency.exponentialRampToValueAtTime(7000, t0 + 17.9);
    env(nzg, [[9, 0], [17.6, 0.09], [18.1, 0]]);
    nz.connect(nzf).connect(nzg).connect(bus);
    nz.start(t0 + 9);
    nz.stop(t0 + 18.5);
    // far voices, "ah", swelling into the light
    const vox = c.createGain();
    env(vox, [[11, 0], [17.5, 0.035], [22, 0.045], [29.5, 0]]);
    vox.connect(bus);
    for (const [f, start] of [[220, 11], [293.66, 12.5], [369.99, 17.8], [440, 14]] as const) {
      const src = c.createGain();
      src.gain.value = 0.5;
      for (const d of [-7, 7]) tone(f, "sawtooth", start, 30, src, d);
      for (const [ff, q, a] of [[800, 6, 1], [1150, 7, 0.6], [2900, 9, 0.25]] as const) {
        const bp = c.createBiquadFilter(), bg = c.createGain();
        bp.type = "bandpass";
        bp.frequency.value = ff;
        bp.Q.value = q;
        bg.gain.value = a;
        src.connect(bp).connect(bg).connect(vox);
      }
    }
    // the turn: a soft, deep bloom
    const boom = c.createOscillator(), bg = c.createGain();
    boom.frequency.setValueAtTime(110, t0 + 17.9);
    boom.frequency.exponentialRampToValueAtTime(52, t0 + 19.5);
    bg.gain.setValueAtTime(0, t0 + 17.9);
    bg.gain.linearRampToValueAtTime(0.28, t0 + 18.0);
    bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 21);
    boom.connect(bg).connect(bus);
    boom.start(t0 + 17.9);
    boom.stop(t0 + 21.2);
    window.setTimeout(() => bus.disconnect(), 32000);
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
