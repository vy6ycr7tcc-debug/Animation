/* The reading panel: a tapped artifact's text, a page at a time (world/readables.ts). The title
   in gold, the page in a readable serif, ‹ n / N › to turn (or a swipe, or the arrow keys), ✕ (or
   Escape, or walking away) to close. With a recording it can be heard as it is read. While it
   is open the stick and the button rest so a thumb on the text never walks you away. */
import type { Reading } from "../world/readables";

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
  /** Asked to play or stop its recording. */
  onListen: (r: Reading, on: boolean) => void = () => {};
  private listening = false;

  constructor() {
    const el = document.createElement("div");
    el.id = "reader";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "false");
    el.innerHTML = `
      <button class="x" type="button" aria-label="Close">✕</button>
      <h2 class="title"></h2>
      <div class="body" tabindex="0"></div>
      <div class="foot">
        <button class="listen" type="button" hidden>♪ Listen</button>
        <span class="pager"><button class="prev" type="button" aria-label="Previous page">‹</button><span class="count"></span><button class="next" type="button" aria-label="Next page">›</button></span>
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
      this.listening = !this.listening;
      this.listen.textContent = this.listening ? "❚❚ Stop" : "♪ Listen";
      this.onListen(this.current, this.listening);
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
    if (this.listening && this.current) this.onListen(this.current, false);
    this.current = r;
    this.page = 0;
    this.listening = false;
    this.listen.textContent = "♪ Listen";
    this.listen.hidden = !r.audio;
    this.title.textContent = r.title;
    this.el.hidden = false;
    document.body.classList.add("reading");
    this.render();
  }

  close(): void {
    if (this.el.hidden || !this.current) return;
    const r = this.current;
    if (this.listening) this.onListen(r, false);
    this.listening = false;
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
    this.count.textContent = `${this.page + 1} / ${n}`;
    this.prev.disabled = this.page === 0;
    this.next.disabled = this.page === n - 1;
    // the panel fades in again with each page
    this.body.classList.remove("turn");
    void this.body.offsetWidth;
    this.body.classList.add("turn");
  }
}
