/* The oracle: one panel, asked from two places (the Choice's seat in the temple, and the seat at
   the still centre of the mind's maze). Overall mode: it names which of the twenty-two archetypes
   are at play and then reflects. Only its words are shown, never its sources. The answer can be
   heard in the device's own voice (speechSynthesis), on a tap.
   Privacy: the player's heart notes go with a question only when "Attach my heart" is ticked for
   that question (off each time the panel opens); nothing else leaves the device. */
import { heartNotes, keepToItself, tapButton } from "./heart";
import { canSpeak, speak, stopSpeaking } from "./speak";

const ENDPOINT = "https://oracle-station.vy6ycr7tcc.workers.dev/oracle";
const SILENT = "The oracle is silent — check your connection.";

export class Oracle {
  private el: HTMLElement;
  private q: HTMLTextAreaElement;
  private attach: HTMLInputElement;
  private ask: HTMLButtonElement;
  private answer: HTMLElement;
  private status: HTMLElement;
  private speak: HTMLButtonElement;
  private offer: HTMLElement;
  private offerOn = false;
  private asking = false;
  private speaking = false;
  /** where it was opened from (for the title) */
  private from = "";

  constructor() {
    const el = document.createElement("div");
    el.id = "oracle";
    el.className = "heart-panel";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "The oracle");
    el.innerHTML = `
      <button class="x" type="button" aria-label="Close">✕</button>
      <div class="orn" aria-hidden="true"><i></i><b></b><i></i></div>
      <h2 class="title">The oracle</h2>
      <textarea rows="3" maxlength="600" placeholder="Ask about the path ahead" aria-label="Your question"></textarea>
      <label class="check"><input type="checkbox"> Attach my heart</label>
      <p class="note consent">Your notes go with this question only, and only when this is ticked.</p>
      <div class="foot"><button class="word ask" type="button">Ask</button></div>
      <p class="status" aria-live="polite"></p>
      <div class="answer" tabindex="0" hidden></div>
      <div class="foot"><button class="word speak" type="button" hidden>Speak</button></div>`;
    document.body.appendChild(el);
    keepToItself(el);
    this.el = el;
    this.q = el.querySelector("textarea")!;
    this.attach = el.querySelector("input[type=checkbox]")!;
    this.ask = el.querySelector(".ask")!;
    this.answer = el.querySelector(".answer")!;
    this.status = el.querySelector(".status")!;
    this.speak = el.querySelector(".speak")!;
    tapButton(el.querySelector(".x")!, () => this.close());
    tapButton(this.ask, () => void this.send());
    tapButton(this.speak, () => this.toggleSpeech());
    this.q.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void this.send();
      }
    });
    addEventListener("keydown", (e) => e.key === "Escape" && !el.hidden && this.close());

    const offer = document.createElement("button");
    offer.id = "oracle-offer";
    offer.type = "button";
    offer.hidden = true;
    offer.innerHTML = `<span class="seed" aria-hidden="true">✧</span><span>Ask the oracle</span>`;
    document.body.appendChild(offer);
    keepToItself(offer);
    tapButton(offer, () => this.show(this.from));
    this.offer = offer;
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** The quiet "Ask the oracle" offer, at the Choice and the maze's still centre (called each
      frame; it only touches the page when the answer changes). */
  offerAt(where: string | null): void {
    const on = !!where && this.el.hidden;
    if (where) this.from = where;
    if (on === this.offerOn) return;
    this.offerOn = on;
    this.offer.hidden = !on;
  }

  show(from: string): void {
    this.from = from;
    this.attach.checked = false; // consent is asked anew each time
    this.status.textContent = from;
    this.el.hidden = false;
    this.offer.hidden = true;
    this.offerOn = false;
    document.body.classList.add("oracling");
    requestAnimationFrame(() => this.q.focus());
  }

  close(): void {
    this.stopSpeech();
    this.el.hidden = true;
    this.q.blur();
    document.body.classList.remove("oracling");
  }

  private async send(): Promise<void> {
    const question = this.q.value.trim();
    if (!question || this.asking) return;
    this.asking = true;
    this.stopSpeech();
    this.ask.disabled = true;
    this.status.textContent = "Listening…";
    this.answer.hidden = true;
    this.speak.hidden = true;
    // The request. The API also takes `station` (a lens id) and `origin` (a hidden archetype
    // pre-prompt): the future station-specific triggers will pass those; here it is the whole oracle.
    const body: { mode: "overall"; question: string; heart?: string[] } = { mode: "overall", question };
    if (this.attach.checked) {
      const notes = heartNotes().slice(0, 8).map((n) => n.text.slice(0, 400));
      if (notes.length) body.heart = notes;
    }
    try {
      const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      const got = (await r.json()) as { text?: unknown };
      const text = typeof got.text === "string" ? got.text.trim() : "";
      if (!text) throw new Error("empty");
      this.answer.replaceChildren(
        ...text.split(/\n\s*\n/).map((p) => Object.assign(document.createElement("p"), { textContent: p.trim() })),
      );
      this.answer.hidden = false;
      this.answer.scrollTop = 0;
      this.status.textContent = "";
      this.speak.hidden = !canSpeak;
    } catch {
      // one quiet line; the question stays where it was
      this.status.textContent = SILENT;
    } finally {
      this.asking = false;
      this.ask.disabled = false;
    }
  }

  private toggleSpeech(): void {
    if (this.speaking) return this.stopSpeech();
    const text = this.answer.textContent ?? "";
    if (!text.trim()) return;
    this.speaking = true;
    this.speak.textContent = "Stop";
    speak(text, () => {
      this.speaking = false;
      this.speak.textContent = "Speak";
    });
  }

  private stopSpeech(): void {
    if (!this.speaking) return;
    this.speaking = false;
    this.speak.textContent = "Speak";
    stopSpeaking();
  }
}
