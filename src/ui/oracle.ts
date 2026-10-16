/* The oracle: summoned in the world (world/oracleVision.ts, through `presence`), with only a
   question bar at the foot of the screen and, once it has answered, its words in a lower third.
   Asked from two places (the Choice's seat in the temple, and the seat at
   the still centre of the mind's maze). Overall mode: it names which of the twenty-two archetypes
   are at play and then reflects. Only its words are shown, never its sources. The answer can be
   heard in the device's own voice (speechSynthesis), on a tap.
   At each archetype, "Share a feeling" opens it through that archetype's lens (`Lens`: the worker's
   `station` and a hidden `origin` line), the feeling already asked.
   Every exchange is kept in My Heart by itself (on this device only).
   Privacy: the player's heart notes go with a question only when "Attach my heart" is ticked for
   that question (off each time the panel opens); nothing else leaves the device. */
import { heartNotes, keepNote, keepToItself, tapButton } from "./heart";
import { Anonymiser } from "./anonymise";
import { canSpeak, pieces, readAloud, speak, speechButton, stopSpeaking, wakeSpeech } from "./speak";

const ENDPOINT = "https://oracle-station.vy6ycr7tcc.workers.dev/oracle";
/** The worker's shared key (prompts/opus-heart-notes-oracle-wiring-prompt.md, the owner's contract):
    abuse protection only, shipped in the page by design; the real ceiling is the worker's per-IP quota. */
const ORACLE_KEY = "a16af48d2554193869f51e95784801297ea36eb2bf6d9193c3004f2758ad0d97";
const SILENT = "The oracle is silent — check your connection.";

const SEED = `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.1"><circle cx="20" cy="20" r="6"/><circle cx="20" cy="14" r="6"/><circle cx="20" cy="26" r="6"/><circle cx="14.8" cy="17" r="6"/><circle cx="25.2" cy="17" r="6"/><circle cx="14.8" cy="23" r="6"/><circle cx="25.2" cy="23" r="6"/><circle cx="20" cy="20" r="12" opacity="0.6"/></g></svg>`;
const HEART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.6-4.6-7.6-10.1A4.2 4.2 0 0 1 12 7.8a4.2 4.2 0 0 1 7.6 2.4c0 5.5-7.6 10.1-7.6 10.1z"/></svg>`;

/** The point a question comes from: an archetype's lens (the worker's `station` id for its place
    among the seven, and a short hidden `origin` line naming it). */
export interface Lens {
  station?: string;
  origin: string;
}

export type PresenceState = "quiet" | "thinking" | "speaking";
/** The oracle's body in the world: summoned when the oracle opens, let go when it closes. */
export interface OraclePresenceLike {
  summon(): void;
  dismiss(): void;
  setState(s: PresenceState): void;
  pulse(): void;
}

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
  private after: HTMLElement;
  private keep: HTMLButtonElement;
  private offer: HTMLElement;
  /** The oracle's presence in the world: a body of light that breathes, thinks and speaks. */
  presence: OraclePresenceLike = { summon() {}, dismiss() {}, setState() {}, pulse() {} };
  /** The last exchange, carried into a follow-up question (the oracle keeps no memory of its own). */
  private last: { q: string; a: string } | null = null;
  /** The next question follows on from the last answer. */
  private following = false;
  /** A soft sound when an answer is kept in the heart. */
  onKept: () => void = () => {};
  private offerOn = false;
  private asking = false;
  private speaking = false;
  /** "Attach my heart", for this one question (off each time the panel opens). */
  private withHeart = false;
  /** The answer's sentences, as spoken and as shown (each its own span, lit while it is read). */
  private sentences: { text: string; el: HTMLElement }[] = [];
  /** where it was opened from (shown under the title) */
  private from = "";
  /** The lens of this visit (an archetype's), kept through its follow-ups. */
  private lens: Lens | null = null;

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
      <div class="o-dock">
        <button class="o-asked" type="button" hidden></button>
        <p class="status" aria-live="polite"></p>
        <div class="answer" tabindex="0" hidden></div>
        <div class="o-after" hidden>
          <button class="o-keep" type="button">${HEART}<span>Keep</span></button>
          <button class="o-voice" type="button" aria-label="Hear it"><span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="lbl">Hear it</span></button>
          <button class="o-more" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v7a4 4 0 0 0 4 4h8M14 12l4 4-4 4"/></svg><span>Follow up</span></button>
        </div>
        <div class="o-ask">
          <p class="o-consent" hidden>Your notes go with this question only, names and details taken out, and aren't kept.</p>
          <div class="o-bar">
            <button class="o-heart" type="button" aria-pressed="false" aria-label="Share my heart" title="Share my heart">${HEART}<span>share my heart</span></button>
            <textarea rows="1" maxlength="600" placeholder="What would you ask?" aria-label="Your question"></textarea>
            <button class="o-seal" type="button" aria-label="Ask">${SEED}</button>
          </div>
        </div>
      </div>`;
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
    this.after = el.querySelector(".o-after")!;
    this.keep = el.querySelector(".o-keep")!;
    tapButton(this.keep, () => this.keepIt());
    tapButton(el.querySelector(".o-more")!, () => this.again(true));
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
    this.q.addEventListener("input", () => {
      this.el.classList.toggle("ready", !!this.q.value.trim());
      this.grow();
    });
    // the phone's keyboard: the bar rides up on top of it
    const vv = window.visualViewport;
    const lift = () => {
      if (this.el.hidden || !vv) return;
      const kb = Math.max(0, this.el.getBoundingClientRect().bottom - (vv.offsetTop + vv.height));
      this.el.style.setProperty("--kb", `${Math.round(kb)}px`);
    };
    vv?.addEventListener("resize", lift);
    vv?.addEventListener("scroll", lift);
    this.q.addEventListener("focus", () => setTimeout(lift, 350));
    this.q.addEventListener("blur", () => setTimeout(lift, 350));
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

  /** The question's field grows with what is written, up to four lines. */
  private grow(): void {
    this.q.style.height = "auto";
    this.q.style.height = `${Math.min(this.q.scrollHeight, 104)}px`;
  }

  private setHeart(on: boolean): void {
    this.withHeart = on;
    this.heartBtn.setAttribute("aria-pressed", String(on));
    this.consent.hidden = !on;
  }

  /** Back to the question (the answer set aside): anew, or following on from the last answer. */
  private again(follow = false): void {
    this.stopSpeech();
    this.following = follow && !!this.last;
    this.el.classList.remove("answered");
    this.el.classList.toggle("following", this.following);
    this.answer.hidden = true;
    this.after.hidden = true;
    this.asked.hidden = !this.following;
    this.status.textContent = "";
    this.q.value = "";
    this.grow();
    this.el.classList.remove("ready");
    this.q.placeholder = this.following ? "And what follows from it?" : "What would you ask?";
    this.setHeart(false);
    requestAnimationFrame(() => this.q.focus());
  }

  /** The answer, with its question, kept in My Heart (on this device only). Every answer is kept
      by itself as it comes; the pill only says so (or tries again if the device refused). */
  private keepIt(): void {
    if (!this.last || this.keep.disabled) return;
    const ok = keepNote(`“${this.last.q}”\n\n${this.last.a}`, this.from ? `The oracle · ${this.from}` : "The oracle");
    this.keep.querySelector("span")!.textContent = ok ? "Kept" : "Not kept";
    this.keep.classList.toggle("kept", ok);
    this.keep.disabled = true;
    if (ok) this.onKept();
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

  /** Open it. `lens`: an archetype's point of view for this visit; `ask`: a question (a feeling)
      asked at once. */
  show(from: string, lens: Lens | null = null, ask = "", heart = false): void {
    if (!this.el.hidden && (lens || from !== this.from)) this.close(); // a new lens, a new thread
    this.from = from;
    this.lens = lens;
    this.setHeart(false); // consent is asked anew each time
    this.from_.textContent = from;
    if (this.el.hidden) {
      // a fresh visit begins a fresh thread
      this.last = null;
      this.following = false;
      this.el.classList.remove("following");
      this.q.placeholder = "What would you ask?";
    }
    this.el.hidden = false;
    this.offer.hidden = true;
    this.offerOn = false;
    document.body.classList.add("oracling");
    this.presence.summon();
    this.presence.setState(this.asking ? "thinking" : this.speaking ? "speaking" : "quiet");
    if (ask && !this.asking) {
      this.again();
      this.setHeart(heart); // "share my heart" chosen where the question was written
      this.q.value = ask;
      this.el.classList.add("ready");
      void this.send();
      return;
    }
    requestAnimationFrame(() => this.q.focus());
  }

  close(): void {
    this.stopSpeech();
    this.el.hidden = true;
    this.q.blur();
    this.presence.dismiss();
    document.body.classList.remove("oracling");
  }

  private async send(): Promise<void> {
    const question = this.q.value.trim();
    if (!question || this.asking) return;
    this.asking = true;
    this.stopSpeech();
    this.ask.disabled = true;
    this.el.classList.add("asking");
    this.presence.setState("thinking");
    this.status.textContent = "Listening…";
    this.answer.hidden = true;
    this.after.hidden = true;
    this.el.classList.remove("answered");
    this.q.blur();
    // The request: the whole oracle ("overall"), or, from an archetype, its lens: the worker's
    // `station` (a lens id among the seven) and `origin` (a hidden line naming the archetype).
    // A follow-up carries the last exchange inside the question (the API keeps no thread), within
    // its 1000 characters: the new question whole, the earlier ones shortened.
    let asked = question;
    if (this.following && this.last) {
      const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t);
      const room = Math.max(120, 960 - question.length - 120);
      asked = `Earlier I asked: "${cut(this.last.q, 160)}". You reflected: "${cut(this.last.a, room - 160)}". Following on from that, I ask: "${question}"`.slice(0, 1000);
    }
    const body: { mode: "overall" | "station"; question: string; station?: string; origin?: string; heart?: string[] } = this.lens
      ? { mode: "station", question: asked, origin: this.lens.origin.slice(0, 300), ...(this.lens.station ? { station: this.lens.station } : {}) }
      : { mode: "overall", question: asked };
    if (this.withHeart) {
      // anonymised here first, as Bring my heart does: names, places and details never leave the device;
      // the oracle's own kept answers stay home (only the person's own words go)
      const list = heartNotes().filter((n) => !n.scene.startsWith("The oracle")).slice(0, 8);
      const an = new Anonymiser();
      an.learn(list.map((n) => n.text));
      const notes = list.map((n) => an.scrub(n.text).slice(0, 400));
      if (notes.length) body.heart = notes;
    }
    try {
      const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", "x-oracle-key": ORACLE_KEY }, body: JSON.stringify(body) });
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
      this.last = { q: question, a: text };
      this.following = false;
      this.el.classList.remove("following");
      this.after.hidden = false;
      this.keep.disabled = false;
      this.keep.classList.remove("kept");
      this.keep.querySelector("span")!.textContent = "Keep";
      this.keepIt(); // every exchange goes into My Heart by itself
      this.asked.hidden = false;
      this.answer.hidden = false;
      this.el.classList.add("answered");
      this.answer.scrollTop = 0;
      // it has spoken: one ring goes out as the answer comes, then it quiets
      this.presence.setState("quiet");
      this.presence.pulse();
      this.status.textContent = "";
      this.speak.hidden = !canSpeak;
      this.q.value = "";
      this.grow();
      if (readAloud()) this.toggleSpeech();
    } catch {
      // one quiet line; the question stays where it was
      this.status.textContent = SILENT;
      this.presence.setState("quiet");
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
    this.presence.setState("speaking");
    speak(
      this.sentences.map((s) => s.text),
      () => this.endSpeech(),
      () => this.endSpeech(),
      (i) => {
        // the sentence being read glows; the view keeps it in sight
        for (const s of this.sentences) s.el.classList.remove("now");
        this.presence.pulse();
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
    this.presence.setState("quiet");
  }

  private stopSpeech(): void {
    if (!this.speaking) return;
    stopSpeaking();
    this.endSpeech();
  }
}
