/* "Where next" (the owner: "once the temple tour is done, then you are suggested the next
   destination… do that for all of them"): when a tour, a walk, a lesson or a telling comes to its
   end, a small card names what was done and offers where to go next, one or two places with which
   way and how far, and "Stay here". A choice takes you there (main.ts says how: a place's own tour,
   the guide's light, or the map's arrival). It never covers the view's middle and goes away by
   itself after a while, or when you start walking. */

export interface NextOption {
  label: string;
  /** A quiet line under it: which way and how far. */
  note?: string;
  go: () => void;
}

export class NextUp {
  private el: HTMLDivElement;
  private head: HTMLParagraphElement;
  private list: HTMLDivElement;
  private timer = 0;

  constructor() {
    this.el = Object.assign(document.createElement("div"), { id: "next-up", hidden: true });
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-label", "Where next");
    this.head = Object.assign(document.createElement("p"), { className: "head" });
    this.list = Object.assign(document.createElement("div"), { className: "list" });
    this.el.append(this.head, this.list);
    document.body.append(this.el);
  }

  get shown(): boolean {
    return !this.el.hidden;
  }

  /** `done`: what came to its end ("The temple, guided"); the options in order; then "Stay here". */
  show(done: string, options: NextOption[], stay = "Stay here"): void {
    window.clearTimeout(this.timer);
    this.head.innerHTML = "";
    const d = Object.assign(document.createElement("span"), { className: "done", textContent: done });
    const q = Object.assign(document.createElement("span"), { className: "q", textContent: "Where next?" });
    this.head.append(d, q);
    this.list.replaceChildren(
      ...options.map((o, i) => this.button(o.label, o.note, i === 0 ? "go first" : "go", () => o.go())),
      this.button(stay, undefined, "stay", () => undefined),
    );
    this.el.hidden = false;
    // it waits a good while, then goes quietly (the choice is still on the map)
    this.timer = window.setTimeout(() => this.hide(), 90000);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.el.hidden = true;
  }

  private button(label: string, note: string | undefined, cls: string, fn: () => void): HTMLButtonElement {
    const b = Object.assign(document.createElement("button"), { type: "button", className: cls });
    b.append(Object.assign(document.createElement("span"), { className: "label", textContent: label }));
    if (note) b.append(Object.assign(document.createElement("span"), { className: "note", textContent: note }));
    // on the touch itself (a phone sends no click while the other thumb holds the stick); a
    // keyboard's Enter or Space still clicks; a touch's own click is ignored
    let downAt = -1e9;
    const act = () => {
      this.hide();
      fn();
    };
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      downAt = performance.now();
      act();
    });
    b.addEventListener("click", (e) => (e as MouseEvent).detail === 0 && performance.now() - downAt > 700 && act());
    return b;
  }
}
