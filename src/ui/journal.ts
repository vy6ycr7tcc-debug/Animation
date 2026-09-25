/* A private journal: one page per question the island has asked. Words stay on this device
   (localStorage) and are never sent anywhere. There is nothing to answer correctly. */
import { STATION_DATA } from "../world/stations";

const KEY = "inward-journey:journal";

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function store(d: Record<string, string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: the words live only while the page is open */
  }
}

export class Journal {
  private el: HTMLElement;
  private list: HTMLElement;
  private entries = load();
  onClose: (() => void) | null = null;

  constructor(private visited: () => number[]) {
    this.el = document.querySelector("#journal") as HTMLElement;
    this.list = this.el.querySelector(".entries") as HTMLElement;
    this.el.querySelector(".close")!.addEventListener("click", () => this.close());
    this.el.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") this.close();
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** Open the journal, optionally at one station's question. */
  open(focusStation?: number): void {
    const seen = new Set(this.visited());
    if (focusStation) seen.add(focusStation);
    this.list.textContent = "";
    const shown = STATION_DATA.filter((s) => seen.has(s.n));
    if (!shown.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "The island's questions will gather here as you visit its stations.";
      this.list.append(p);
    }
    let focusEl: HTMLTextAreaElement | null = null;
    for (const s of shown) {
      const wrap = document.createElement("section");
      const h = document.createElement("h3");
      h.textContent = s.question;
      const small = document.createElement("small");
      small.textContent = s.title;
      const ta = document.createElement("textarea");
      ta.id = `journal-${s.n}`;
      ta.rows = 3;
      ta.value = this.entries[s.n] ?? "";
      ta.setAttribute("aria-label", `${s.title}: ${s.question}`);
      ta.addEventListener("input", () => {
        this.entries[s.n] = ta.value;
        store(this.entries);
      });
      wrap.append(small, h, ta);
      this.list.append(wrap);
      if (s.n === focusStation) focusEl = ta;
    }
    this.el.hidden = false;
    (focusEl ?? (this.el.querySelector(".close") as HTMLElement)).focus();
    focusEl?.scrollIntoView({ block: "center" });
  }

  close(): void {
    this.el.hidden = true;
    this.onClose?.();
  }
}
