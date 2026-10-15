/* The reading panel: a tapped artifact's text, a page at a time (world/readables.ts). Not a box
   on a page (the owner: "looks too website-ish") but words set in the dark over the world: a
   veil that melts away at its edges, the title in spaced gold capitals between two hairlines with
   a small diamond, the page in a large quiet serif, a row of small lights for the pages. ‹ › (or
   a swipe, or the arrow keys) turn it; ✕ (or Escape, or walking away) closes it. With a
   recording it can be heard as it is read (one for all, or one per page). While it is open the
   stick and the button rest so a thumb on the text never walks you away. */
import type { Reading } from "../world/readables";
import { canSpeak, readAloud, speak, stopSpeaking } from "./speak";

export class Reader {
  readonly el: HTMLElement;
  private title: HTMLElement;
  private body: HTMLElement;
  private pager: HTMLElement;
  private count: HTMLElement;
  private prev: HTMLButtonElement;
  private next: HTMLButtonElement;
  private listen: HTMLButtonElement;
  private page = 0;
  current: Reading | null = null;
  /** Called when a reading closes (by any way). */
  onClose: (r: Reading) => void = () => {};
  /** Asked to play or stop its recording (`page`: the page shown, for one recording a page). */
  onListen: (r: Reading, on: boolean, page: number) => void = () => {};
  private listening = false;
  /** Read aloud in the device's own voice (a reading with no recording of its own). */
  private native = false;

  constructor() {
    const el = document.createElement("div");
    el.id = "reader";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "false");
    el.innerHTML = `
      <button class="x" type="button" aria-label="Close">✕</button>
      <div class="orn" aria-hidden="true"><i></i><b></b><i></i></div>
      <h2 class="title"></h2>
      <div class="body" tabindex="0"></div>
      <div class="foot">
        <span class="pager"><button class="prev" type="button" aria-label="Previous page">‹</button><span class="count" aria-live="polite"></span><button class="next" type="button" aria-label="Next page">›</button></span>
        <button class="listen" type="button" hidden>Listen</button>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.title = el.querySelector(".title")!;
    this.body = el.querySelector(".body")!;
    this.pager = el.querySelector(".pager")!;
    this.count = el.querySelector(".count")!;
    this.prev = el.querySelector(".prev")!;
    this.next = el.querySelector(".next")!;
    this.listen = el.querySelector(".listen")!;
    // act on the touch itself (a phone gives no click while the other thumb holds the stick)
    const tap = (b: HTMLElement, f: () => void) => {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        f();
      });
      b.addEventListener("click", (e) => e.preventDefault());
    };
    tap(el.querySelector(".x")!, () => this.close());
    tap(this.prev, () => this.turn(-1));
    tap(this.next, () => this.turn(1));
    tap(this.listen, () => {
      if (!this.current) return;
      if (!this.recorded(this.current)) return this.setNative(!this.native);
      this.listening = !this.listening;
      this.listen.textContent = this.listening ? "Quiet" : "Listen";
      this.listen.classList.toggle("on", this.listening);
      this.onListen(this.current, this.listening, this.page);
    });
    // a swipe across the page turns it
    let sx = 0, sy = 0;
    this.body.addEventListener("pointerdown", (e) => ((sx = e.clientX), (sy = e.clientY)));
    this.body.addEventListener("pointerup", (e) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) this.turn(dx < 0 ? 1 : -1);
    });
    // the panel keeps its touches to itself
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    addEventListener("keydown", (e) => {
      if (el.hidden) return;
      if (e.key === "Escape") this.close();
      else if (e.key === "ArrowRight") this.turn(1);
      else if (e.key === "ArrowLeft") this.turn(-1);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  show(r: Reading): void {
    if (this.listening && this.current) this.onListen(this.current, false, this.page);
    this.current = r;
    this.page = 0;
    this.listening = !!r.autoVoice && !!(r.audio || r.voices?.length);
    this.listen.textContent = this.listening ? "Quiet" : "Listen";
    this.listen.classList.toggle("on", this.listening);
    this.setNative(false);
    this.listen.hidden = !this.recorded(r) && !canSpeak;
    if (!this.recorded(r)) this.listen.textContent = "Speak";
    this.title.textContent = r.title;
    this.el.hidden = false;
    document.body.classList.add("reading");
    this.render();
    if (this.listening) this.onListen(r, true, 0);
    // read aloud by itself (⋮ → Read words aloud) when there is no recording of its own
    else if (!this.recorded(r) && readAloud()) this.setNative(true);
  }

  close(): void {
    if (this.el.hidden || !this.current) return;
    const r = this.current;
    if (this.listening) this.onListen(r, false, this.page);
    this.listening = false;
    this.setNative(false);
    this.el.hidden = true;
    document.body.classList.remove("reading");
    this.current = null;
    this.onClose(r);
  }

  private turn(d: number): void {
    if (!this.current) return;
    const n = this.current.pages.length;
    const p = Math.max(0, Math.min(n - 1, this.page + d));
    if (p === this.page) return;
    this.page = p;
    this.render();
    // read aloud page by page: the next page's voice takes over
    if (this.listening && this.current.voices) this.onListen(this.current, true, p);
    if (this.native) this.speakPage();
  }

  private recorded(r: Reading): boolean {
    return !!(r.audio || r.voices?.length);
  }

  /** The device's own voice: the page shown, then on to the next page by itself. */
  private setNative(on: boolean): void {
    this.native = on && canSpeak;
    if (this.current && !this.recorded(this.current)) {
      this.listen.textContent = this.native ? "Stop" : "Speak";
      this.listen.classList.toggle("on", this.native);
    }
    if (this.native) this.speakPage();
    else stopSpeaking();
  }

  private speakPage(): void {
    const r = this.current;
    if (!r) return;
    speak(`${this.page === 0 ? r.title + ". " : ""}${r.pages[this.page] ?? ""}`, () => {
      if (!this.native || this.current !== r) return;
      if (this.page < r.pages.length - 1) this.turn(1);
      else this.setNative(false);
    });
  }

  private render(): void {
    const r = this.current!;
    const n = r.pages.length;
    this.body.replaceChildren(
      ...(r.pages[this.page] ?? "").split(/\n\s*\n/).map((t) => {
        const p = document.createElement("p");
        p.textContent = t.trim();
        return p;
      }),
    );
    this.body.scrollTop = 0;
    this.pager.hidden = n < 2;
    // the pages as a row of small lights, the one you are on lit
    this.count.replaceChildren(...Array.from({ length: n }, (_, i) => Object.assign(document.createElement("i"), { className: i === this.page ? "on" : "" })));
    this.count.setAttribute("aria-label", `Page ${this.page + 1} of ${n}`);
    this.prev.disabled = this.page === 0;
    this.next.disabled = this.page === n - 1;
    // the panel fades in again with each page
    this.body.classList.remove("turn");
    void this.body.offsetWidth;
    this.body.classList.add("turn");
  }
}
