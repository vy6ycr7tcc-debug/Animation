/* Sound (Web Audio).
   - Must be started inside the first tap (iOS rule).
   - iOS 17+: audioSession "playback" lets it sound with the silent switch on.
   - The bed is the package's water ambience (water-bed.mp3), looped with a crossfade so
     the seam never shows, plus soft tones kept above ~200 Hz. If the file can't load,
     generative lapping water stands in.
   - Narration plays on its own bus; while it speaks, the bed ducks (never mutes). */

import { loadBytes } from "./assets";


type AudioSessionNav = Navigator & { audioSession?: { type: string } };
import { FAST, vclock } from "../debug/filmClock";

/** Film mode's record of the sounds that come from files (debug/film.ts, fast capture): enough to
    lay the voice and the bed in afterwards at their exact moments on the audio clock. */
export type Tape =
  | { k: "voice"; at: number; file: string; off: number; dur?: number; fadeIn: number }
  | { k: "voiceStop"; at: number; fade: number }
  | { k: "gain"; w: "bed" | "master"; at: number; to: number; secs: number }
  | { k: "bed"; at: number };

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class AudioEngine {
  ctx: AudioContext | null = null;
  /** Film mode: told every file-based sound as it starts (null otherwise). */
  tape: ((e: Tape) => void) | null = null;
  /** Fast film capture: the audio clock is the film's virtual clock, and nothing is played. */
  readonly virtual = FAST;
  private comp: DynamicsCompressorNode | null = null;
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
    // fast film capture: a context that is never rendered (no sound plays; decoding works), and the
    // film's own clock stands in for its time
    const c = (this.ctx = FAST ? (new OfflineAudioContext(2, 48000, 48000) as unknown as AudioContext) : new AC());
    if (!FAST) c.resume();
    const silent = c.createBufferSource(); // fully unlocks output on older iOS
    silent.buffer = c.createBuffer(1, 1, c.sampleRate);
    silent.connect(c.destination);
    silent.start(0);

    this.master = c.createGain();
    this.master.gain.value = 0;
    const comp = (this.comp = c.createDynamicsCompressor());
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

  /** The audio clock, in seconds: the context's own, or in fast film capture the film's. */
  now(): number {
    return FAST ? vclock.t : (this.ctx?.currentTime ?? 0);
  }

  /** Film mode: the whole mix (voice, bed, tones, one-shots) as a stream for the recorder. */
  tapStream(): MediaStream | null {
    const c = this.ctx;
    if (!c || !this.comp || FAST || !("createMediaStreamDestination" in c)) return null;
    const d = c.createMediaStreamDestination();
    this.comp.connect(d);
    return d.stream;
  }

  resume(): void {
    if (FAST) return;
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

  /** A light duck under a short spoken cue (the breathing guide), gentler than narration's. */
  duckSoft(on: boolean): void {
    this.ramp(this.bed?.gain, on ? 0.72 : 1, on ? 0.6 : 2);
  }

  private ramp(p: AudioParam | undefined, to: number, secs: number): void {
    if (!this.ctx || !p) return;
    if (this.tape) {
      const w = p === this.bed?.gain ? "bed" : p === this.master?.gain ? "master" : null;
      if (w) this.tape({ k: "gain", w, at: this.now(), to, secs });
    }
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
    this.tape?.({ k: "bed", at: this.now() });
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

  /** The night's music (the owner: "really relaxing… but it can become a bit monotonous"; "any
      sound that is sort of like Buddhism and meditation"). Never the same for long:
      - a soft pad that drifts through a cycle of open modal chords on D, gliding from one to the
        next every 40–80 s;
      - now and then a singing bowl struck somewhere near, its partials beating slowly;
      - soft wind chimes in the pentatonic, a few notes at a time;
      - rarely, a distant temple bell;
      - a tanpura-like drone that comes for a few minutes and goes again.
      All very quiet, above ~200 Hz (phone speakers), through the night's reverb. */
  private startTones(): void {
    const c = this.ctx!;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1500;
    const out = c.createGain();
    out.gain.value = 1;
    lp.connect(out).connect(this.worldDry);
    out.connect(this.worldWet);
    // the pad: four voices, each gliding to its note in the next chord
    const CHORDS = [
      [293.66, 440, 554.37, 880], // D A C# A (the old open fifths)
      [293.66, 392, 587.33, 739.99], // D G D F# (Gmaj over D)
      [246.94, 369.99, 493.88, 587.33], // B F# B D (Bm)
      [220, 329.63, 440, 659.25], // A E A E (open A)
      [261.63, 392, 523.25, 659.25], // C G C E (C, the flat seventh's colour)
      [293.66, 440, 587.33, 659.25], // D A D E (Dsus2)
    ];
    // the home piece (the pad and the drone) has its own level, so other pieces can take its place
    const home = c.createGain();
    home.gain.value = 1;
    home.connect(lp);
    const voices = CHORDS[0].map((f, i) => {
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
      o.connect(g).connect(home);
      o.start();
      l.start();
      bias.start();
      return o;
    });
    let chord = 0;
    const nextChord = () => {
      if (!this.ctx) return;
      chord = (chord + 1 + (Math.random() < 0.3 ? 1 : 0)) % CHORDS.length;
      const t = this.ctx.currentTime;
      voices.forEach((o, i) => {
        o.frequency.cancelScheduledValues(t);
        o.frequency.setValueAtTime(o.frequency.value, t);
        o.frequency.exponentialRampToValueAtTime(CHORDS[chord][i], t + 8 + i * 2);
      });
      window.setTimeout(nextChord, 40000 + Math.random() * 40000);
    };
    window.setTimeout(nextChord, 30000);
    this.startSoundscape(lp, home);
    this.startPieces(lp, home);
  }

  /* ---------- more music in the same spirit ----------
     The owner: "the current music is absolutely great but we need more variety… based out of
     hypnagogia". The home piece (the pad and the drone) alternates with four others in its key
     and register, each five to eight minutes, crossfading over ~40 s; the bowls, chimes and far
     bell go on through all of them, so it stays one soundscape:
     - airport loops (after Eno's Music for Airports): five soft sung tones, each repeating on its
       own period, 17–34 s, that never fall into step, so the harmony is always newly met;
     - tape drift (after Basinski and the hypnagogic tape records): a warm two-chord loop with tape
       wow and flutter, a breath of hiss, and now and then a worn moment where it thins;
     - glass piano (after Harold Budd): sparse soft notes in D Lydian, long silences between;
     - the deep choir (after Stars of the Lid): bowed tones swelling open and closing slowly, the
       chords changing about once a minute, no sudden shifts.
     All above ~200 Hz and very quiet, through the night's reverb; none of them in the temple. */
  private startPieces(into: AudioNode, home: GainNode): void {
    const c = this.ctx!;
    const later = (s: number, fn: () => void) => window.setTimeout(fn, s * 1000);
    const fadeTo = (g: GainNode, to: number, secs: number) => {
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(to, t + secs);
    };
    type Piece = { out: GainNode; start(): void; stop(): void };
    const piece = (build: (out: GainNode, alive: () => boolean, keep: (n: AudioScheduledSourceNode) => void) => void): Piece => {
      const out = c.createGain();
      out.gain.value = 0;
      out.connect(into);
      let live = false, nodes: AudioScheduledSourceNode[] = [];
      return {
        out,
        start() {
          live = true;
          nodes = [];
          build(out, () => live, (n) => nodes.push(n));
          fadeTo(out, 1, 40);
        },
        stop() {
          fadeTo(out, 0, 40);
          later(42, () => {
            if (out.gain.value > 0.01) return; // started again meanwhile
            live = false;
            for (const n of nodes) {
              try {
                n.stop();
              } catch {
                /* already */
              }
            }
            nodes = [];
          });
        },
      };
    };
    const note = (out: AudioNode, f: number, peak: number, attack: number, hold: number, release: number, partials: [number, number, OscillatorType][], pan = 0) => {
      const t = c.currentTime;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.setValueAtTime(peak, t + attack + hold);
      g.gain.exponentialRampToValueAtTime(0.00005, t + attack + hold + release);
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(out);
      for (const [m, a, type] of partials) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = f * m;
        o.detune.value = (Math.random() - 0.5) * 6;
        const og = c.createGain();
        og.gain.value = a;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + attack + hold + release + 0.1);
      }
    };

    const airport = piece((out, alive) => {
      const loops: [number, number, number][] = [
        [587.33, 17.3, -0.55],
        [739.99, 20.9, 0.35],
        [880, 25.1, -0.15],
        [493.88, 29.7, 0.6],
        [659.25, 34.3, -0.35],
      ];
      for (const [f, period, pan] of loops) {
        const sing = () => {
          if (!alive()) return;
          if (!this.inTemple) note(out, f, 0.0055, 2.6, 1.8, 7.5, [[1, 1, "sine"], [2, 0.18, "sine"], [3, 0.05, "triangle"]], pan);
          later(period, sing);
        };
        later(Math.random() * period, sing);
      }
    });

    const tape = piece((out, alive, keep) => {
      const A = [293.66, 369.99, 440, 554.37], B = [246.94, 293.66, 369.99, 440];
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 950;
      lp.Q.value = 0.4;
      const wear = c.createGain();
      lp.connect(wear).connect(out);
      const lpL = c.createOscillator(), lpG = c.createGain();
      lpL.frequency.value = 0.031;
      lpG.gain.value = 380;
      lpL.connect(lpG).connect(lp.frequency);
      // wow (slow) and flutter (quick), in cents, shared by every voice as one tape would
      const wow = c.createOscillator(), wowG = c.createGain(), flut = c.createOscillator(), flutG = c.createGain();
      wow.frequency.value = 0.09;
      wowG.gain.value = 13;
      flut.frequency.value = 0.71;
      flutG.gain.value = 4;
      wow.connect(wowG);
      flut.connect(flutG);
      const vs = A.map((f, i) => {
        const o = c.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 10;
        wowG.connect(o.detune);
        flutG.connect(o.detune);
        const g = c.createGain();
        g.gain.value = 0.0065 / (1 + i * 0.35);
        o.connect(g).connect(lp);
        o.start();
        keep(o);
        return o;
      });
      // a breath of tape hiss
      const hiss = c.createBufferSource(), hb = c.createBiquadFilter(), hg = c.createGain();
      hiss.buffer = this.noise;
      hiss.loop = true;
      hb.type = "bandpass";
      hb.frequency.value = 4200;
      hb.Q.value = 0.6;
      hg.gain.value = 0.0012;
      hiss.connect(hb).connect(hg).connect(out);
      for (const n of [lpL, wow, flut, hiss]) {
        n.start();
        keep(n);
      }
      let onA = true;
      const swap = () => {
        if (!alive()) return;
        onA = !onA;
        const tt = c.currentTime;
        vs.forEach((o, i) => {
          o.frequency.cancelScheduledValues(tt);
          o.frequency.setValueAtTime(o.frequency.value, tt);
          o.frequency.exponentialRampToValueAtTime((onA ? A : B)[i], tt + 3.5);
        });
        later(12 + Math.random() * 4, swap);
      };
      later(12, swap);
      // now and then the worn tape thins a moment
      const worn = () => {
        if (!alive()) return;
        const tt = c.currentTime;
        wear.gain.cancelScheduledValues(tt);
        wear.gain.setValueAtTime(1, tt);
        wear.gain.linearRampToValueAtTime(0.35, tt + 0.25);
        wear.gain.linearRampToValueAtTime(1, tt + 1.4);
        later(24 + Math.random() * 30, worn);
      };
      later(20, worn);
    });

    const glass = piece((out, alive) => {
      const LYD = [587.33, 659.25, 739.99, 830.61, 880, 987.77, 1108.73, 1174.66];
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      lp.connect(out);
      const strike = (f: number, gain: number) => note(lp, f, gain, 0.012, 0.05, 4.5 + Math.random() * 2, [[1, 1, "sine"], [2, 0.32, "sine"], [3, 0.08, "sine"], [4.02, 0.03, "sine"]], (Math.random() - 0.5) * 0.7);
      const play = () => {
        if (!alive()) return;
        if (!this.inTemple) {
          const i = Math.floor(Math.random() * (LYD.length - 2));
          const r = Math.random();
          if (r < 0.62) strike(LYD[i], 0.011);
          else if (r < 0.88) {
            strike(LYD[i], 0.009);
            later(0.35 + Math.random() * 0.5, () => strike(LYD[i + 2], 0.008));
          } else for (let k = 0; k < 3; k++) later(k * (0.9 + Math.random() * 0.6), () => strike(LYD[Math.max(0, i + 2 - k)], 0.008));
        }
        later(2.6 + Math.random() * 6.5, play);
      };
      later(3, play);
    });

    const choir = piece((out, alive, keep) => {
      const CH = [
        [293.66, 440, 587.33],
        [329.63, 493.88, 659.25],
        [246.94, 369.99, 587.33],
        [261.63, 392, 523.25],
      ];
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 800;
      lp.Q.value = 0.7;
      const swell = c.createGain();
      swell.gain.value = 0.7;
      lp.connect(swell).connect(out);
      // one long breath through it all: the bows press and ease (22 s)
      const br = c.createOscillator(), brF = c.createGain(), brG = c.createGain();
      br.frequency.value = 1 / 22;
      brF.gain.value = 450;
      brG.gain.value = 0.3;
      br.connect(brF).connect(lp.frequency);
      br.connect(brG).connect(swell.gain);
      br.start();
      keep(br);
      const vs: OscillatorNode[] = [];
      CH[0].forEach((f) => {
        for (const d of [-7, 7]) {
          const o = c.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = f;
          o.detune.value = d;
          const g = c.createGain();
          g.gain.value = 0.0024;
          o.connect(g).connect(lp);
          o.start();
          keep(o);
          vs.push(o);
        }
      });
      let ch = 0;
      const move = () => {
        if (!alive()) return;
        ch = (ch + 1) % CH.length;
        const tt = c.currentTime;
        vs.forEach((o, i) => {
          o.frequency.cancelScheduledValues(tt);
          o.frequency.setValueAtTime(o.frequency.value, tt);
          o.frequency.exponentialRampToValueAtTime(CH[ch][i >> 1], tt + 9 + (i >> 1) * 2);
        });
        later(50 + Math.random() * 20, move);
      };
      later(45, move);
    });

    // the order: home, then one of the others, then home again… never the same other twice running
    const others = [airport, tape, glass, choir];
    let last = -1;
    // `?music=airport|tape|glass|choir` begins that piece at once (to hear it), then the order goes on
    let pick = ["airport", "tape", "glass", "choir"].indexOf(new URLSearchParams(location.search).get("music") ?? "");
    const homeFor = () => later(pick >= 0 ? 0.5 : 360 + Math.random() * 240, () => {
      let k = pick >= 0 ? pick : Math.floor(Math.random() * others.length);
      if (pick < 0 && k === last) k = (k + 1) % others.length;
      pick = -1;
      last = k;
      const p = others[k];
      fadeTo(home, 0, 40);
      p.start();
      later(300 + Math.random() * 180, () => {
        p.stop();
        fadeTo(home, 1, 40);
        homeFor();
      });
    });
    homeFor();
  }

  /** The things that come and go over the pad: bowls, chimes, a far bell, the drone. */
  private startSoundscape(into: AudioNode, home: AudioNode): void {
    const c = this.ctx!;
    const PENTA = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98]; // D major pentatonic, high
    const BOWLS = [293.66, 329.63, 369.99, 440, 493.88];
    const later = (min: number, max: number, fn: () => void) => window.setTimeout(fn, (min + Math.random() * (max - min)) * 1000);
    // a singing bowl, every half minute or so
    const bowlLoop = () => {
      if (!this.inTemple) this.bowl(BOWLS[Math.floor(Math.random() * BOWLS.length)], 0.018 + Math.random() * 0.01, into);
      later(25, 70, bowlLoop);
    };
    later(12, 30, bowlLoop);
    // wind chimes: a few soft notes, stirred by a breeze
    const chimeLoop = () => {
      if (!this.inTemple) {
        const n = 3 + Math.floor(Math.random() * 5);
        for (let k = 0; k < n; k++) {
          window.setTimeout(() => this.chime(PENTA[Math.floor(Math.random() * PENTA.length)], 0.006 + Math.random() * 0.005, into), k * (180 + Math.random() * 420));
        }
      }
      later(40, 120, chimeLoop);
    };
    later(20, 60, chimeLoop);
    // rarely, a temple bell far away
    const farBell = () => {
      if (!this.inTemple) this.bowl(220, 0.02, into, 14, true);
      later(150, 330, farBell);
    };
    later(90, 180, farBell);
    // the drone: a few minutes, then gone for a while
    const drone = this.tanpura(home);
    const droneLoop = (on: boolean) => {
      const t = c.currentTime;
      drone.gain.cancelScheduledValues(t);
      drone.gain.setValueAtTime(drone.gain.value, t);
      drone.gain.linearRampToValueAtTime(on ? 1 : 0, t + 25);
      later(on ? 120 : 150, on ? 240 : 360, () => droneLoop(!on));
    };
    later(60, 120, () => droneLoop(true));
  }

  /** A singing bowl (or, `far`, a temple bell a long way off): inharmonic partials, each a
      pair a hair apart so they beat slowly, a long bloom and fade. */
  bowl(f: number, gain: number, into?: AudioNode, dur = 9, far = false): void {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const dest = into ?? this.fx;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = far ? 1400 : 4000;
    lp.connect(dest);
    for (const [m, a] of [[1, 1], [2.71, 0.45], [5.12, 0.18], [8.4, 0.06]] as const) {
      for (const beat of [-0.6, 0.6]) {
        const o = c.createOscillator();
        o.frequency.value = f * m + beat * m;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain * a * 0.5, t + (far ? 0.4 : 0.03));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur / Math.sqrt(m));
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.2);
      }
    }
    window.setTimeout(() => lp.disconnect(), (dur + 1) * 1000);
  }

  /** One chime: a bright, short-lived note with a glassy overtone. */
  private chime(f: number, gain: number, into: AudioNode): void {
    const c = this.ctx!, t = c.currentTime;
    for (const [m, a] of [[1, 1], [3.01, 0.25]] as const) {
      const o = c.createOscillator();
      o.frequency.value = f * m;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * a, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2 / m);
      o.connect(g).connect(into);
      o.start(t);
      o.stop(t + 3.5);
    }
  }

  /** A tanpura-like drone on D and A: soft buzzing strings plucked in turn, their overtones
      opening slowly through a shifting filter. Returns its gain (0 to start). */
  private tanpura(into: AudioNode): GainNode {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = 0;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const sweep = c.createOscillator(), sg = c.createGain();
    sweep.frequency.value = 0.07;
    sg.gain.value = 500;
    sweep.connect(sg).connect(bp.frequency);
    sweep.start();
    bp.connect(g).connect(into);
    const strings = [220, 293.66, 293.66, 146.83 * 2]; // Pa Sa Sa Sa (A D D D)
    let k = 0;
    const pluck = () => {
      if (!this.ctx) return;
      window.setTimeout(pluck, 1150);
      if (g.gain.value < 0.005 || this.inTemple) return; // resting: no strings struck
      const t = this.ctx.currentTime, f = strings[k++ % strings.length];
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const e = c.createGain();
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(0.004, t + 0.08);
      e.gain.exponentialRampToValueAtTime(0.0008, t + 3.5);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 5);
      o.connect(e).connect(bp);
      o.start(t);
      o.stop(t + 5.1);
    };
    pluck();
    return g;
  }

  /* ---------- the temple ---------- */
  /** Into the temple (or out): the water and the night tones fall silent, the stone hall
      takes over, and a far chant begins; outside again, all as it was. */
  setTemple(on: boolean, chant = true): void {
    if (!this.ctx) return;
    if (on === this.inTemple) {
      // already within stone walls (one place apart straight into another): only the chant changes
      if (on && chant && !this.chant) this.startChant();
      if (this.chant) this.ramp(this.chant.gain, on && chant ? 0.55 : 0, 1.5);
      return;
    }
    this.inTemple = on;
    this.ramp(this.worldDry.gain, on ? 0 : 1, on ? 1.2 : 2.5);
    this.ramp(this.worldWet.gain, on ? 0 : 1, on ? 1.2 : 2.5);
    this.ramp(this.templeBus.gain, on ? 1 : 0, on ? 2 : 1);
    if (on && chant && !this.chant) this.startChant();
    if (on && !this.roomOn) this.startRoom();
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
  /** Play a clip on the voice bus; `stop` fades it out. */
  playClip(buf: AudioBuffer, gain = 1, when = 0): { stop(fade?: number): void } | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    g.gain.value = gain;
    s.connect(g).connect(this.voice);
    s.start(Math.max(when, ctx.currentTime));
    return {
      stop: (fade = 1) => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fade);
        try {
          s.stop(t + fade + 0.05);
        } catch {
          /* already ended */
        }
      },
    };
  }

  /* ---------- the temple's own ambience (Samuel: "focus on the ambient sound of a temple") ----------
     The stillness of a great stone room: a low, hollow room tone that breathes; air moving through
     the clerestory grilles high above, in slow swells; now and then a drop of water falling far
     off in the dark, and the hall answering; and once in a long while a singing bowl struck
     somewhere deep inside. All of it through the hall's long dark reverb, all soft, all above
     ~200 Hz so a phone's speaker keeps it. */
  private roomOn = false;
  private startRoom(): void {
    const c = this.ctx!;
    this.roomOn = true;
    const noise = () => {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start(0, Math.random() * 3);
      return s;
    };
    // the room tone: the hall's hum, two resonances of its length and height, slowly breathing
    for (const [f, q, g, rate] of [[240, 6, 0.028, 0.05], [410, 8, 0.016, 0.037], [620, 10, 0.008, 0.029]] as const) {
      const bp = c.createBiquadFilter(), a = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = q;
      a.gain.value = g;
      lfo.frequency.value = rate;
      lg.gain.value = g * 0.5;
      lfo.connect(lg).connect(a.gain);
      lfo.start();
      noise().connect(bp).connect(a);
      a.connect(this.templeBus);
      a.connect(this.hall);
    }
    // air through the grilles high above: a hollow whistle of wind that swells and falls away
    {
      const bp = c.createBiquadFilter(), a = c.createGain();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 3;
      a.gain.value = 0;
      noise().connect(bp).connect(a);
      a.connect(this.hall);
      const swell = () => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime, up = 4 + Math.random() * 5, hold = 2 + Math.random() * 4;
        bp.frequency.setTargetAtTime(700 + Math.random() * 700, t, 3);
        a.gain.setTargetAtTime(this.inTemple ? 0.012 + Math.random() * 0.012 : 0, t, up / 3);
        a.gain.setTargetAtTime(0, t + up + hold, 3);
        window.setTimeout(swell, (up + hold + 6 + Math.random() * 10) * 1000);
      };
      swell();
    }
    // a drop of water, far off in the dark
    const drop = () => {
      if (this.ctx && this.inTemple) {
        const t = this.ctx.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        const f = 1300 + Math.random() * 1500;
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.05);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.018 + Math.random() * 0.012, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(g);
        g.connect(this.hall);
        const dry = c.createGain();
        dry.gain.value = 0.25;
        g.connect(dry).connect(this.templeBus);
        o.start(t);
        o.stop(t + 0.15);
      }
      window.setTimeout(drop, (4 + Math.random() * 11) * 1000);
    };
    window.setTimeout(drop, 3000);
    // a singing bowl, struck deep inside, once in a long while
    const bowl = () => {
      if (this.ctx && this.inTemple) {
        const t = this.ctx.currentTime, f = [293.66, 329.63, 392][Math.floor(Math.random() * 3)];
        for (const [m, a, d] of [[1, 1, 14], [2.71, 0.4, 9], [5.15, 0.15, 5]] as const) {
          for (const beat of [0, 1.8]) {
            const o = c.createOscillator(), g = c.createGain();
            o.frequency.value = f * m + beat;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.012 * a, t + 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            o.connect(g).connect(this.hall);
            o.start(t);
            o.stop(t + d + 0.1);
          }
        }
      }
      window.setTimeout(bowl, (35 + Math.random() * 40) * 1000);
    };
    window.setTimeout(bowl, 9000);
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

  private sigh: GainNode | null = null;
  /** The false doors' breath (0–1): air sighing out of stone, a soft band of noise, heard only
      within a few metres of a door. */
  stoneBreath(k: number): void {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.sigh) {
      if (k < 0.01) return;
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 700;
      bp.Q.value = 0.7;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1600;
      this.sigh = c.createGain();
      this.sigh.gain.value = 0;
      s.connect(bp).connect(lp).connect(this.sigh).connect(this.worldDry);
      s.start();
    }
    this.sigh.gain.setTargetAtTime(k * 0.05, c.currentTime, 0.4);
  }

  private hum: GainNode | null = null;
  /** One quartz that sings (0–1): a clear high tone over its fifth and octave, each pair a few
      cents apart so it beats slowly, heard only near it; unlike any other crystal's voice. */
  quartzHum(k: number): void {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.hum) {
      if (k < 0.01) return;
      this.hum = c.createGain();
      this.hum.gain.value = 0;
      this.hum.connect(this.worldDry);
      for (const [f, a] of [[432, 0.5], [648, 0.28], [864, 0.18], [1296, 0.06]] as const)
        for (const det of [0, 4]) {
          const o = c.createOscillator(), g = c.createGain();
          o.frequency.value = f;
          o.detune.value = det;
          g.gain.value = a * 0.5;
          o.connect(g).connect(this.hum);
          o.start();
        }
    }
    this.hum.gain.setTargetAtTime(k * 0.035, c.currentTime, 0.5);
  }

  private rainBus: GainNode | null = null;
  /** Rain (0–1): a soft hiss of many drops, and a band of patter over it whose level stirs quickly
      and unevenly (drops never fall in step); kept well above the phone's lost low end. */
  rain(k: number): void {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.rainBus) {
      if (k < 0.01) return;
      this.rainBus = c.createGain();
      this.rainBus.gain.value = 0;
      this.rainBus.connect(this.worldDry);
      const hiss = c.createBufferSource();
      hiss.buffer = this.noise;
      hiss.loop = true;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 600;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6500;
      hiss.connect(hp).connect(lp).connect(this.rainBus);
      hiss.start();
      const pat = c.createBufferSource();
      pat.buffer = this.noise;
      pat.loop = true;
      pat.playbackRate.value = 0.83;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600;
      bp.Q.value = 0.9;
      const stir = c.createGain();
      stir.gain.value = 0.55;
      for (const [f, g] of [[3.7, 0.22], [7.9, 0.16], [0.31, 0.12]] as const) {
        const o = c.createOscillator(), og = c.createGain();
        o.frequency.value = f;
        og.gain.value = g;
        o.connect(og).connect(stir.gain);
        o.start();
      }
      pat.connect(bp).connect(stir).connect(this.rainBus);
      pat.start();
    }
    this.rainBus.gain.setTargetAtTime(k * 0.06, c.currentTime, 1.2);
  }

  private surfBus: GainNode | null = null;
  /** Surf breaking softly on a seawall far off (0–1): low noise in slow swells, each set rising
      and falling over some seconds, kept above the phone's lost low end. */
  surf(k: number): void {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.surfBus) {
      if (k < 0.01) return;
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 220;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      // the swells: a slow wave on the level and a slower one on the brightness
      const swell = c.createGain();
      swell.gain.value = 0.5;
      const lfo = c.createOscillator(), lfoG = c.createGain();
      lfo.frequency.value = 0.11;
      lfoG.gain.value = 0.45;
      lfo.connect(lfoG).connect(swell.gain);
      const lfo2 = c.createOscillator(), lfo2G = c.createGain();
      lfo2.frequency.value = 0.047;
      lfo2G.gain.value = 380;
      lfo2.connect(lfo2G).connect(lp.frequency);
      lfo.start();
      lfo2.start();
      this.surfBus = c.createGain();
      this.surfBus.gain.value = 0;
      s.connect(hp).connect(lp).connect(swell).connect(this.surfBus).connect(this.worldDry);
      s.start();
    }
    this.surfBus.gain.setTargetAtTime(k * 0.07, c.currentTime, 0.8);
  }

  private fallsBus: GainNode | null = null;
  /** A waterfall's roar (0–1): broad noise, brighter than the surf, with a slow, uneven breath in it
      (water never falls quite evenly); kept above the phone's lost low end. */
  falls(k: number): void {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.fallsBus) {
      if (k < 0.01) return;
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 260;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      const swell = c.createGain();
      swell.gain.value = 0.85;
      const lfo = c.createOscillator(), lfoG = c.createGain();
      lfo.frequency.value = 0.23;
      lfoG.gain.value = 0.12;
      lfo.connect(lfoG).connect(swell.gain);
      lfo.start();
      this.fallsBus = c.createGain();
      this.fallsBus.gain.value = 0;
      s.connect(hp).connect(lp).connect(swell).connect(this.fallsBus).connect(this.worldDry);
      s.start();
    }
    this.fallsBus.gain.setTargetAtTime(k * 0.09, c.currentTime, 0.6);
  }

  private windBus: GainNode | null = null;
  /** A soothing wind (0–1), for the meditation's dark: breathy noise in two bands, gusting slowly
      (two slow waves that never line up), its colour drifting; a faint high sigh over it. Kept
      above the phone's lost low end. */
  wind(k: number): void {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.windBus) {
      if (k < 0.01) return;
      this.windBus = c.createGain();
      this.windBus.gain.value = 0;
      this.windBus.connect(this.bed);
      const lfo = (hz: number, depth: number, to: AudioParam) => {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = hz;
        g.gain.value = depth;
        o.connect(g).connect(to);
        o.start();
      };
      const layer = (f: number, q: number, level: number, gust: [number, number], drift: number) => {
        const s = c.createBufferSource();
        s.buffer = this.noise;
        s.loop = true;
        s.playbackRate.value = 0.9 + Math.random() * 0.2;
        const hp = c.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 210;
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = f;
        bp.Q.value = q;
        const g = c.createGain();
        g.gain.value = level;
        lfo(gust[0], level * 0.55, g.gain);
        lfo(gust[1], level * 0.3, g.gain);
        lfo(gust[0] * 0.7, drift, bp.frequency);
        s.connect(hp).connect(bp).connect(g).connect(this.windBus!);
        s.start(c.currentTime, Math.random() * 2);
      };
      layer(520, 0.6, 0.5, [0.071, 0.029], 220); // the body of it
      layer(1150, 1.4, 0.16, [0.053, 0.019], 360); // its breath through leaves
      layer(1700, 7, 0.035, [0.043, 0.023], 260); // a faint high sigh
    }
    this.windBus.gain.setTargetAtTime(k * 0.11, c.currentTime, k > 0 ? 1.6 : 1.1);
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

  /* ---------- the om (the mind's maze): a few low voices sounding A-U-M together in the stone's
     long reverb, then resting while the room's own sounds (air, a drop, a bowl) carry on, then
     again; never all the time. The vowel moves ah → oh → oo and closes into the hum of the M. */
  private om: GainNode | null = null;
  private omOn = false;
  setOm(on: boolean): void {
    if (!this.ctx || on === this.omOn) return;
    this.omOn = on;
    if (on && !this.om) this.startOm();
    if (this.om) this.ramp(this.om.gain, on ? 1 : 0, on ? 3 : 1.5);
  }
  private startOm(): void {
    const c = this.ctx!;
    this.om = c.createGain();
    this.om.gain.value = 0;
    this.om.connect(this.hall);
    const dry = c.createGain();
    dry.gain.value = 0.3;
    this.om.connect(dry).connect(this.templeBus);
    const voices = [[146.83, -6, 1], [146.83, 7, 0.9], [220.0, 2, 0.55], [293.66, -3, 0.35]].map(([f, det, lvl]) => {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = det;
      const vib = c.createOscillator(), vg = c.createGain();
      vib.frequency.value = 4.2 + Math.random() * 0.8;
      vg.gain.value = 2.5;
      vib.connect(vg).connect(o.detune);
      const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), lp = c.createBiquadFilter(), a = c.createGain();
      f1.type = f2.type = "bandpass";
      f1.Q.value = 6;
      f2.Q.value = 8;
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      a.gain.value = 0;
      o.connect(f1).connect(lp);
      o.connect(f2).connect(lp);
      lp.connect(a).connect(this.om!);
      o.start();
      vib.start();
      return { f1, f2, lp, a, lvl };
    });
    const sound = () => {
      if (!this.ctx) return;
      if (!this.omOn) {
        window.setTimeout(sound, 4000);
        return;
      }
      const t = this.ctx.currentTime + 0.05;
      for (const v of voices) {
        const lag = Math.random() * 0.6, peak = 0.06 * v.lvl;
        // ah (700, 1150) → oh (480, 850) → oo (330, 720) → the M: the mouth closes, a soft hum
        for (const [f, hz] of [[v.f1, [700, 480, 330, 260]], [v.f2, [1150, 850, 720, 500]]] as const) {
          f.frequency.setValueAtTime(hz[0], t);
          f.frequency.linearRampToValueAtTime(hz[1], t + lag + 3.2);
          f.frequency.linearRampToValueAtTime(hz[2], t + lag + 6.2);
          f.frequency.linearRampToValueAtTime(hz[3], t + lag + 8.4);
        }
        v.lp.frequency.setValueAtTime(2400, t);
        v.lp.frequency.linearRampToValueAtTime(2000, t + lag + 6.2);
        v.lp.frequency.linearRampToValueAtTime(520, t + lag + 8.6);
        v.a.gain.cancelScheduledValues(t);
        v.a.gain.setValueAtTime(0, t);
        v.a.gain.linearRampToValueAtTime(peak, t + lag + 2.4);
        v.a.gain.setValueAtTime(peak, t + lag + 7.6);
        v.a.gain.linearRampToValueAtTime(peak * 0.75, t + lag + 9);
        v.a.gain.linearRampToValueAtTime(0, t + lag + 13.5);
      }
      // then a rest, while the room's air, drops and bowls carry the silence
      window.setTimeout(sound, (14 + 8 + Math.random() * 12) * 1000);
    };
    window.setTimeout(sound, 2500);
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
export function crossfadeLoop(c: BaseAudioContext, src: AudioBuffer, secs: number): AudioBuffer {
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
