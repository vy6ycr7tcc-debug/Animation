/* The tour bar: one control for every guided walk (the temple tour, the monuments' walk-throughs,
   the Duat). The owner: the tours' controls were "a bit annoying", and asked for pause, play and
   rewind, "integrated with the existing controller in a more intuitive way". So the half-moon's
   play/pause and its progress arc come down into the tour's own bar, which reads like a player:

     ⟲  back ten seconds (near a part's start, the stop before)
     ❚❚ pause / ▶ play (the voice, its clock and the tour's walking stand still together)
     the place, "n of N" and a hairline of the part's progress
     »  on to the next stop
     ✕  end the tour

   Whoever runs a tour `show`s the bar with its own handlers and `hide`s it; pause is shared (the
   game's hold, set once by main). The half-moon steps aside while the bar is up. */

export interface TourBarOwner {
  back(): void;
  next(): void;
  end(): void;
  /** 0–1 through what the stop is telling (or showing). */
  progress(): number;
}

class TourBar {
  readonly el: HTMLDivElement;
  private titleEl: HTMLElement;
  private hintEl: HTMLElement;
  private fill: HTMLElement;
  private playBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private owner: TourBarOwner | null = null;
  /** The game's pause (set by main): toggle it, and read it. */
  togglePause: () => void = () => {};
  isPaused: () => boolean = () => false;

  constructor() {
    const btn = (text: string, cls: string, label: string) => {
      const b = Object.assign(document.createElement("button"), { type: "button", textContent: text, className: cls });
      b.setAttribute("aria-label", label);
      return b;
    };
    this.el = Object.assign(document.createElement("div"), { id: "tour-panel", hidden: true });
    this.el.setAttribute("role", "group");
    this.el.setAttribute("aria-label", "Tour");
    const back = btn("⟲", "ctl back", "Back ten seconds");
    this.playBtn = btn("", "ctl play", "Pause the tour");
    this.playBtn.append(document.createElement("span"));
    this.nextBtn = btn("»", "ctl next", "On to the next");
    const end = btn("✕", "end", "End the tour");
    const mid = Object.assign(document.createElement("div"), { className: "mid" });
    this.titleEl = Object.assign(document.createElement("p"), { className: "title" });
    this.hintEl = Object.assign(document.createElement("p"), { className: "hint" });
    const line = Object.assign(document.createElement("span"), { className: "line" });
    this.fill = document.createElement("i");
    line.append(this.fill);
    mid.append(this.titleEl, this.hintEl, line);
    this.el.append(back, this.playBtn, mid, this.nextBtn, end);
    document.body.append(this.el);
    // on the touch itself (a phone sends no click while the other thumb holds the stick); a
    // keyboard's Enter or Space still clicks
    // (a touch's own click is ignored, or each tap would act twice)
    let downAt = -1e9;
    const act = (b: HTMLButtonElement, fn: () => void) => {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        downAt = performance.now();
        fn();
      });
      b.addEventListener("click", (e) => (e as MouseEvent).detail === 0 && performance.now() - downAt > 700 && fn());
    };
    act(back, () => this.owner?.back());
    act(this.playBtn, () => (this.togglePause(), this.frame()));
    act(this.nextBtn, () => this.owner?.next());
    act(end, () => this.owner?.end());
  }

  show(owner: TourBarOwner): void {
    this.owner = owner;
    this.el.hidden = false;
    document.body.classList.add("tour-bar");
  }
  hide(owner?: TourBarOwner): void {
    if (owner && this.owner !== owner) return;
    this.owner = null;
    this.el.hidden = true;
    document.body.classList.remove("tour-bar");
  }
  get shown(): boolean {
    return !!this.owner;
  }
  set(title: string, hint: string): void {
    if (this.titleEl.textContent !== title) this.titleEl.textContent = title;
    if (this.hintEl.textContent !== hint) this.hintEl.textContent = hint;
  }
  /** The next button glows when the stop has been told (the tour goes on by itself soon). */
  ready(on: boolean): void {
    this.nextBtn.classList.toggle("ready", on);
  }
  /** Each frame: the progress line and the play button's state. */
  frame(): void {
    if (!this.owner) return;
    const k = Math.min(1, Math.max(0, this.owner.progress() || 0));
    this.fill.style.transform = `scaleX(${k.toFixed(4)})`;
    const p = this.isPaused();
    if (this.playBtn.classList.contains("paused") !== p) {
      this.playBtn.classList.toggle("paused", p);
      this.playBtn.setAttribute("aria-label", p ? "Play the tour" : "Pause the tour");
    }
  }
}

let bar: TourBar | null = null;
/** The one tour bar (made on first use). */
export function tourBar(): TourBar {
  return (bar ??= new TourBar());
}
