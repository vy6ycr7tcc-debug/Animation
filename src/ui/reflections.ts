/* Questions to sit with (the owner, of "What in you is asking to be forgiven?": "it's the essence of
   the game, to incite introspection and bring forth radical acceptance and rediscovery, let's do
   more of that").

   One pool of questions, all written for the game (never quotations), asked one at a time at the
   quiet moments: in contemplation, in the deep's rings of stillness, after a meditation, lying still
   on the shallows. Each is asked once before any comes again (the order kept on the device). It rises
   low in the view, stays a while and goes; under it, "Answer in your heart" opens a note with the
   question at its head. Never over a voice, a tour or a panel. */
import { keepToItself, tapButton } from "./heart";

export const QUESTIONS = [
  // forgiveness and acceptance
  "What in you is asking to be forgiven?",
  "What are you carrying that was never yours to carry?",
  "Whom are you still waiting to forgive, and what would it cost you to begin?",
  "What would change if you stopped arguing with what has already happened?",
  "Which of your mistakes could you hold the way you would hold a child?",
  "What did you once need that you can now give yourself?",
  "What would it mean to be gentle with the one you used to be?",
  "What are you still trying to earn?",
  "Which part of your story are you ready to set down?",
  "What would it mean to accept yourself exactly as you are tonight?",
  "Which feeling have you been refusing to feel?",
  "What can you let be, just for now?",
  "What would you say to yourself if you were your own dearest friend?",
  // rediscovery
  "Where in you is it already quiet?",
  "What is the oldest thing you know about yourself?",
  "What did you love before anyone told you what to love?",
  "Which part of you have you been waiting to meet?",
  "Who were you as a child, when no one was watching?",
  "What have you forgotten that you once knew for certain?",
  "When do you feel most like yourself?",
  "What would you do today if you trusted yourself completely?",
  "What is your heart saying underneath the noise?",
  // fear and the shadow
  "Who taught you to be afraid of the dark?",
  "What are you afraid would happen if you were truly seen?",
  "What do you keep busy so as not to feel?",
  "What gift is hidden in what hurts?",
  "What is the fear beneath your anger?",
  "What would you stop defending if you felt safe?",
  "Which part of you have you been hiding from the light?",
  // love
  "What do you love that you have not yet said aloud?",
  "Where has love been waiting for you to notice it?",
  "How do you love when no one is keeping count?",
  "Who has loved you in a way you never thanked?",
  "Whom could you love a little more freely tomorrow?",
  // presence and wonder
  "If nothing needed to change, what would you notice?",
  "Let the water hold you. What do you hear?",
  "What is here, right now, that you have not yet noticed?",
  "What does your breath already know?",
  "When did you last feel entirely at home?",
  "What would it feel like to need nothing from this moment?",
  "What is the light in you made of?",
  "Where in your body do you feel most alive right now?",
  "What small thing today was quietly beautiful?",
  // purpose and choice
  "What are you here to give?",
  "What would you choose if you were not afraid of losing?",
  "Which way would you walk if no one were watching?",
  "What is asking to be born through you?",
  "What are you ready to begin?",
  "What would you like to be remembered for being, rather than doing?",
  "What would your days look like if each one were an offering?",
  // unity
  "Where do you end, and where does the world begin?",
  "If everyone you meet is you in another form, whom did you meet today?",
  "What do you share with the stranger you least understand?",
  "What would you say to the Creator, if you knew you were heard?",
  "What in this place is looking back at you?",
  "What is enough?",
];

const ORDER_KEY = "inward-journey:asked";
const ON_KEY = "inward-journey:questions";

/** The next question: every one asked once, in a shuffled order kept on the device, before any again. */
function nextQuestion(): string {
  let order: number[] = [];
  let at = 0;
  try {
    const s = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "null") as { order: number[]; at: number } | null;
    if (s && Array.isArray(s.order) && s.order.length === QUESTIONS.length) ({ order, at } = s);
  } catch {
    /* none kept */
  }
  if (!order.length || at >= order.length) {
    const last = order[order.length - 1];
    order = QUESTIONS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order[0] === last) order.push(order.shift()!); // never the same twice running across rounds
    at = 0;
  }
  const q = QUESTIONS[order[at]];
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify({ order, at: at + 1 }));
  } catch {
    /* fine: asked anyway */
  }
  return q;
}

export class Reflections {
  private el: HTMLElement;
  private text: HTMLElement;
  private timer = 0;
  private current = "";
  /** When the last question was asked (performance.now() ms). */
  last = -Infinity;
  on = true;
  /** Opens the heart's note with the question at its head. */
  answer: (question: string) => void = () => {};

  constructor() {
    try {
      this.on = localStorage.getItem(ON_KEY) !== "0";
    } catch {
      /* on */
    }
    const el = document.createElement("div");
    el.id = "reflect";
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `<p class="q"></p><button class="ans" type="button">♥ Answer in your heart</button>`;
    document.body.appendChild(el);
    keepToItself(el);
    this.el = el;
    this.text = el.querySelector(".q")!;
    tapButton(el.querySelector(".ans")!, () => {
      const q = this.current;
      this.hide();
      if (q) this.answer(q);
    });
  }

  setOn(on: boolean): void {
    this.on = on;
    if (!on) this.hide();
    try {
      localStorage.setItem(ON_KEY, on ? "1" : "0");
    } catch {
      /* fine */
    }
  }

  get showing(): boolean {
    return this.el.classList.contains("on");
  }

  /** Seconds since the last question was asked. */
  since(): number {
    return (performance.now() - this.last) / 1000;
  }

  /** The next question to carry (shown elsewhere, as on the "Where next" card), or "" when off. */
  take(): string {
    if (!this.on) return "";
    this.last = performance.now();
    return nextQuestion();
  }

  /** Ask the next question (or `q`), held `ms` before it goes. */
  ask(ms = 17000, q?: string): string {
    if (!this.on) return "";
    this.current = q ?? nextQuestion();
    this.last = performance.now();
    this.text.textContent = this.current;
    this.el.classList.remove("on");
    void this.el.offsetWidth;
    this.el.classList.add("on");
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), ms);
    return this.current;
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.el.classList.remove("on");
  }
}
