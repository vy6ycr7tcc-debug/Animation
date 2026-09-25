/* Narration with subtitles that are always shown.
   Milestone 1 only has the device voice; generated mp3s (narration/generate.sh) arrive in milestone 5.
   The first line must be started inside the Enter tap, or iOS stays silent. */

export interface Line {
  who: "Aria" | "Rowan";
  text: string;
}

// Verbatim from narration/opening.txt.
export const OPENING: Line[] = [
  { who: "Aria", text: "Three islands rest in the ether... Mind... Body... and Spirit." },
  { who: "Rowan", text: "Wander where you like. When something calls to you, go to it... and be still." },
];

export class Voice {
  on = true;
  busy = false;
  private voices: Partial<Record<Line["who"], SpeechSynthesisVoice>> = {};
  private gen = 0;

  constructor(
    private sub: HTMLElement,
    private onBusy: (busy: boolean) => void,
  ) {
    if ("speechSynthesis" in window) {
      this.pick();
      speechSynthesis.addEventListener?.("voiceschanged", () => this.pick());
    }
  }

  get available(): boolean {
    return "speechSynthesis" in window;
  }

  private pick(): void {
    const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    if (!vs.length) return;
    const f = vs.find((v) => /samantha|ava|allison|susan|karen|serena|victoria|female/i.test(v.name)) || vs[0];
    const m = vs.find((v) => /daniel|aaron|alex|fred|tom|nathan|evan|arthur|male/i.test(v.name) && v !== f) || vs[1] || vs[0];
    this.voices = { Aria: f, Rowan: m };
  }

  /** Call from inside a tap for the first line. */
  play(lines: Line[]): void {
    const my = ++this.gen;
    this.stop(true);
    this.busy = true;
    this.onBusy(true);
    const next = (i: number) => {
      if (my !== this.gen) return;
      if (i >= lines.length) {
        this.busy = false;
        this.onBusy(false);
        window.setTimeout(() => my === this.gen && this.subOff(), 2500);
        return;
      }
      this.subtitle(lines[i]);
      this.speak(lines[i]).then(() => my === this.gen && window.setTimeout(() => next(i + 1), 650));
    };
    next(0);
  }

  stop(keepSub = false): void {
    try {
      if (this.available) speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    if (!keepSub) this.subOff();
  }

  private speak(l: Line): Promise<void> {
    return new Promise((res) => {
      const fallbackMs = Math.max(3500, l.text.length * 62);
      if (!this.on || !this.available) {
        window.setTimeout(res, fallbackMs);
        return;
      }
      const u = new SpeechSynthesisUtterance(l.text.replace(/\.\.\./g, ", "));
      u.lang = "en-US";
      u.rate = 0.86;
      u.pitch = l.who === "Rowan" ? 0.8 : 1.05;
      const v = this.voices[l.who];
      if (v) u.voice = v;
      let done = false;
      const end = () => {
        if (!done) {
          done = true;
          res();
        }
      };
      u.onend = end;
      u.onerror = end;
      window.setTimeout(end, l.text.length * 85 + 2500);
      speechSynthesis.speak(u);
    });
  }

  private subtitle(l: Line): void {
    this.sub.textContent = "";
    const w = document.createElement("span");
    w.className = "who";
    w.textContent = l.who;
    this.sub.append(w, document.createTextNode(l.text.replace(/\.\.\./g, "…")));
    this.sub.classList.add("on");
  }

  private subOff(): void {
    this.sub.classList.remove("on");
  }
}
