/* The oracle: one panel, asked from two places (the Choice's seat in the temple, and the seat at
   the still centre of the mind's maze). Overall mode: it names which of the twenty-two archetypes
   are at play and then reflects. Only its words are shown, never its sources. The answer can be
   heard in the device's own voice (speechSynthesis), on a tap.
   Privacy: the player's heart notes go with a question only when "Attach my heart" is ticked for
   that question (off each time the panel opens); nothing else leaves the device. */
import { heartNotes, keepToItself, tapButton } from "./heart";
import { canSpeak, pieces, readAloud, speak, speechButton, stopSpeaking, wakeSpeech } from "./speak";

const ENDPOINT = "https://oracle-station.vy6ycr7tcc.workers.dev/oracle";
const SILENT = "The oracle is silent — check your connection.";

const SEED = `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.1"><circle cx="20" cy="20" r="6"/><circle cx="20" cy="14" r="6"/><circle cx="20" cy="26" r="6"/><circle cx="14.8" cy="17" r="6"/><circle cx="25.2" cy="17" r="6"/><circle cx="14.8" cy="23" r="6"/><circle cx="25.2" cy="23" r="6"/><circle cx="20" cy="20" r="12" opacity="0.6"/></g></svg>`;
const HEART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.6-4.6-7.6-10.1A4.2 4.2 0 0 1 12 7.8a4.2 4.2 0 0 1 7.6 2.4c0 5.5-7.6 10.1-7.6 10.1z"/></svg>`;

export class Oracle {
  private el: HTMLElement;
  private q: HTMLTextAreaElement;
  private heartBtn: HTMLButtonElement;
  private consent: HTMLElement;
  private ask: HTMLButtonElement;
  private asked: HTMLButtonElement;
  private answer: HTMLElement;
  private status: HTMLElement;
  private from_: HTMLElement;
  private speak: HTMLButtonElement;
  private offer: HTMLElement;
  private offerOn = false;
  private asking = false;
  private speaking = false;
  /** "Attach my heart", for this one question (off each time the panel opens). */
  private withHeart = false;
  /** The answer's sentences, as spoken and as shown (each its own span, lit while it is read). */
  private sentences: { text: string; el: HTMLElement }[] = [];
  /** where it was opened from (shown under the title) */
  private from = "";

  constructor() {
    const el = document.createElement("div");
    el.id = "oracle";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "The oracle");
    el.innerHTML = `
      <button class="x" type="button" aria-label="Close">✕</button>
      <div class="o-head">
        <div class="orn" aria-hidden="true"><i></i><b></b><i></i></div>
        <h2 class="title">The oracle</h2>
        <p class="o-from"></p>
      </div>
      <div class="o-ask">
        <textarea rows="2" maxlength="600" placeholder="What would you ask?" aria-label="Your question"></textarea>
        <div class="o-row">
          <button class="o-heart" type="button" aria-pressed="false">${HEART}<span>with my heart</span></button>
          <button class="o-seal" type="button" aria-label="Ask">${SEED}</button>
        </div>
        <p class="o-consent" hidden>Your notes go with this question only.</p>
      </div>
      <button class="o-asked" type="button" hidden></button>
      <p class="status" aria-live="polite"></p>
      <div class="answer" tabindex="0" hidden></div>
      <button class="o-voice" type="button" hidden aria-label="Hear it"><span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="lbl">Hear it</span></button>`;
    document.body.appendChild(el);
    keepToItself(el);
    this.el = el;
    this.q = el.querySelector("textarea")!;
    this.heartBtn = el.querySelector(".o-heart")!;
    this.consent = el.querySelector(".o-consent")!;
    this.ask = el.querySelector(".o-seal")!;
    this.asked = el.querySelector(".o-asked")!;
    this.answer = el.querySelector(".answer")!;
    this.status = el.querySelector(".status")!;
    this.from_ = el.querySelector(".o-from")!;
    this.speak = el.querySelector(".o-voice")!;
    tapButton(el.querySelector(".x")!, () => this.close());
    tapButton(this.heartBtn, () => this.setHeart(!this.withHeart));
    // the click wakes the phone's voice (iOS speaks only from a touch), so the answer can be read
    // aloud when it arrives, seconds later
    speechButton(this.ask, () => {
      wakeSpeech();
      void this.send();
    });
    speechButton(this.speak, () => this.toggleSpeech());
    // the question asked, shown small over the answer: a tap asks anew
    tapButton(this.asked, () => this.again());
    this.q.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void this.send();
      }
    });
    this.q.addEventListener("input", () => this.el.classList.toggle("ready", !!this.q.value.trim()));
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

  private setHeart(on: boolean): void {
    this.withHeart = on;
    this.heartBtn.setAttribute("aria-pressed", String(on));
    this.consent.hidden = !on;
  }

  /** Back to the question (the answer set aside). */
  private again(): void {
    this.stopSpeech();
    this.el.classList.remove("answered");
    this.answer.hidden = true;
    this.speak.hidden = true;
    this.asked.hidden = true;
    this.status.textContent = "";
    this.setHeart(false);
    requestAnimationFrame(() => this.q.focus());
  }

  /** A quiet line under the question (the phone's voice would not start). */
  note(msg: string): void {
    this.status.textContent = msg;
    this.stopSpeech();
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
    this.setHeart(false); // consent is asked anew each time
    this.from_.textContent = from;
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
    this.el.classList.add("asking");
    this.status.textContent = "Listening…";
    this.answer.hidden = true;
    this.speak.hidden = true;
    this.el.classList.remove("answered");
    this.q.blur();
    // The request. The API also takes `station` (a lens id) and `origin` (a hidden archetype
    // pre-prompt): the future station-specific triggers will pass those; here it is the whole oracle.
    const body: { mode: "overall"; question: string; heart?: string[] } = { mode: "overall", question };
    if (this.withHeart) {
      const notes = heartNotes().slice(0, 8).map((n) => n.text.slice(0, 400));
      if (notes.length) body.heart = notes;
    }
    try {
      const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      const got = (await r.json()) as { text?: unknown };
      const text = typeof got.text === "string" ? got.text.trim() : "";
      if (!text) throw new Error("empty");
      // each sentence its own span: lit in turn while the phone's voice reads it
      this.sentences = [];
      let n = 0;
      this.answer.replaceChildren(
        ...text.split(/\n\s*\n/).map((para) => {
          const p = document.createElement("p");
          for (const t of pieces(para.trim())) {
            const sp = document.createElement("span");
            sp.className = "s";
            sp.textContent = t + " ";
            sp.style.animationDelay = `${Math.min(n++, 18) * 0.09}s`;
            p.append(sp);
            this.sentences.push({ text: t, el: sp });
          }
          return p;
        }),
      );
      this.asked.textContent = `“${question}”`;
      this.asked.hidden = false;
      this.answer.hidden = false;
      this.el.classList.add("answered");
      this.answer.scrollTop = 0;
      this.status.textContent = "";
      this.speak.hidden = !canSpeak;
      if (readAloud()) this.toggleSpeech();
    } catch {
      // one quiet line; the question stays where it was
      this.status.textContent = SILENT;
    } finally {
      this.asking = false;
      this.ask.disabled = false;
      this.el.classList.remove("asking");
    }
  }

  private toggleSpeech(): void {
    if (this.speaking) return this.stopSpeech();
    if (!this.sentences.length) return;
    this.speaking = true;
    this.speak.classList.add("on");
    this.speak.querySelector(".lbl")!.textContent = "Quiet";
    this.answer.classList.add("reading");
    speak(
      this.sentences.map((s) => s.text),
      () => this.endSpeech(),
      () => this.endSpeech(),
      (i) => {
        // the sentence being read glows; the view keeps it in sight
        for (const s of this.sentences) s.el.classList.remove("now");
        const s = this.sentences[i];
        if (!s) return;
        s.el.classList.add("now");
        s.el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      },
    );
  }

  private endSpeech(): void {
    this.speaking = false;
    this.speak.classList.remove("on");
    this.speak.querySelector(".lbl")!.textContent = "Hear it";
    this.answer.classList.remove("reading");
    for (const s of this.sentences) s.el.classList.remove("now");
  }

  private stopSpeech(): void {
    if (!this.speaking) return;
    stopSpeaking();
    this.endSpeech();
  }
}
