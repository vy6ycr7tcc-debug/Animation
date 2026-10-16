/* What Inland is, and how to keep it as an app.
   - The intro (`openIntro`): one quiet page over the world saying what the game is for and every
     thing in it, ending with how to put it on the Home Screen. ⋮ → "What is Inland?", and a small
     link under the title the first time.
   - Add to Home Screen (`Install`): a web page becomes an app only by the person's own hand. On an
     iPhone Safari has no button a page can press, so the card shows the two steps (Share, then
     "Add to Home Screen"); where the browser offers its own install (Chrome, Edge, Android) the
     card's button asks it. Never shown once the game is running as an app. */
import { keepToItself } from "./heart";

const LATER_KEY = "inward-journey:install-later";

type Deferred = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}
const ua = navigator.userAgent;
const IOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
/** Only Safari can add to the Home Screen on an iPhone (others can since iOS 16.4, from their own Share). */
const IOS_OTHER = IOS && /CriOS|FxiOS|EdgiOS/.test(ua);

const SHARE = `<svg class="ico-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
const ADD = `<svg class="ico-share" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`;

/** The steps, in this device's own words. */
function steps(): string {
  if (IOS)
    return `<ol class="steps">
      <li>${IOS_OTHER ? "In this browser's menu, or better in <b>Safari</b>, tap" : "Tap"} <b>Share</b> ${SHARE} at the foot of the screen (on an iPad, at the top).</li>
      <li>Scroll a little and tap <b>Add to Home Screen</b> ${ADD}.</li>
      <li>Tap <b>Add</b>. Inland now opens from its own icon, full screen.</li>
    </ol>`;
  return `<ol class="steps">
      <li>Tap <b>Install</b> below, or in the browser's menu choose <b>Install app</b> / <b>Add to Home screen</b>.</li>
      <li>Inland then opens from its own icon, in its own window.</li>
    </ol>`;
}
const WHY = `Full screen, no browser bars; your place, notes and lamps are kept safe (Safari can clear a website's storage after a week unvisited, but not an app's); and after ⋮ → Download for offline play it opens with no connection at all.`;

export class Install {
  private deferred: Deferred | null = null;
  private card: HTMLElement;
  private btn: HTMLButtonElement;
  /** Whether anything can still be offered here (false once it is an app). */
  get offerable(): boolean {
    return !isStandalone();
  }
  /** Fired when the app becomes installed, or the browser's own offer arrives. */
  onChange: () => void = () => {};

  constructor() {
    addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault(); // keep the browser's own bar from appearing; the card asks instead
      this.deferred = e as Deferred;
      this.btn.hidden = false;
      this.onChange();
    });
    addEventListener("appinstalled", () => {
      this.deferred = null;
      this.hide();
      this.onChange();
    });
    const card = document.createElement("div");
    card.id = "install";
    card.hidden = true;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Add Inland to your Home Screen");
    card.innerHTML = `
      <button class="x" type="button" aria-label="Not now">✕</button>
      <p class="i-title">Keep Inland as an app</p>
      <p class="i-why">${WHY}</p>
      ${steps()}
      <div class="i-row"><button class="i-install" type="button" hidden>Install</button><button class="i-later" type="button">Not now</button></div>`;
    document.body.appendChild(card);
    keepToItself(card);
    this.card = card;
    this.btn = card.querySelector(".i-install")!;
    this.btn.addEventListener("click", () => void this.prompt());
    const later = () => {
      this.hide();
      try {
        localStorage.setItem(LATER_KEY, String(Date.now()));
      } catch {
        /* nothing kept */
      }
    };
    card.querySelector(".x")!.addEventListener("click", later);
    card.querySelector(".i-later")!.addEventListener("click", later);
  }

  /** The browser's own install, where it has one. */
  async prompt(): Promise<void> {
    const d = this.deferred;
    if (!d) return;
    this.deferred = null;
    await d.prompt();
    await d.userChoice.catch(() => null);
    this.hide();
    this.onChange();
  }
  get canPrompt(): boolean {
    return !!this.deferred;
  }

  /** Show the card: `asked` from the menu always, otherwise at most once a week. */
  show(asked = false): void {
    if (isStandalone()) return;
    if (!asked) {
      try {
        const t = Number(localStorage.getItem(LATER_KEY) || 0);
        if (Date.now() - t < 7 * 864e5) return;
      } catch {
        /* show it */
      }
    }
    this.btn.hidden = !this.deferred;
    this.card.hidden = false;
  }
  hide(): void {
    this.card.hidden = true;
  }
  get open(): boolean {
    return !this.card.hidden;
  }
}

/** The intro page. `howto` opens the full list of controls. */
export function buildIntro(install: Install, howto: () => void): { open(): void; close(): void; readonly isOpen: boolean } {
  const el = document.createElement("div");
  el.id = "intro";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-labelledby", "intro-title");
  el.innerHTML = `
    <button class="x" type="button" aria-label="Close">✕</button>
    <div class="in-body">
      <div class="orn" aria-hidden="true"><i></i><b></b><i></i></div>
      <h2 id="intro-title">Inland</h2>
      <p class="lede">A contemplative world of night and light, to wander through the twenty-two archetypes of mind, body and spirit.</p>

      <section>
        <h3>What it is for</h3>
        <p>Inland is not a game to win. There are no enemies, scores, timers or ways to fail. It is a place to slow down and look inward: to meet the archetypes, the deep patterns every life passes through, and to listen, rest and reflect. Keep it open beside you while you work, or lie down and let it hold you.</p>
      </section>

      <section>
        <h3>Moving</h3>
        <p><b>Your thumb, low on the left</b> walks; push further to run. <b>Drag</b> anywhere else to look. <b>Tap the land</b> and you walk there. <b>The round button</b> jumps; hold it to fly, let go to glide. In water, the word beside it says what it does (Dive, Floor, Surface). On a computer: W A S D, Space, the mouse.</p>
      </section>

      <section>
        <h3>The archetypes</h3>
        <p>Twenty-two beings of light live across the world: the Mind near the shore, the Body to the east, the Spirit to the west, the Choice on an island to the north. Come near and one greets you. <b>Sit</b> with it to hear who it is, what it teaches and its practice, in recorded voices; then <b>go deeper</b>: write what is on your heart and the oracle answers through that archetype.</p>
      </section>

      <section>
        <h3>The temple</h3>
        <p>An Egyptian temple near the shore holds all twenty-two as glowing carvings. At each shrine, <b>Be with it</b>: make its gesture with it, read its words, listen, go deeper, and its lamp is lit. When a place is lit in mind, body and spirit, the altar answers; when all twenty-one are lit, the Choice opens. A guided tour walks the whole temple with you.</p>
      </section>

      <section>
        <h3>Places to enter</h3>
        <p>The monuments each take you through rooms of a telling: the <b>densities</b> of creation, the <b>school of the adept</b>, the <b>past choices</b> of other worlds, the <b>mind's maze</b> with a sun at its heart. The <b>pyramid</b> has its chambers and the Duat below. There are ancient worlds (Göbekli Tepe, Nan Madol, and drowned cities beneath the water), lessons told on stone seats, visions of creation, and the world after the veil. Some things are hidden; a curious visitor finds them.</p>
      </section>

      <section>
        <h3>The voices in the sky</h3>
        <p>Planets, stars, fruit on great trees and crystals each keep a narration. <b>Tap one</b> to hear it. The half-moon at the top right plays, pauses and goes on to the next; "Only nature" rests every voice.</p>
      </section>

      <section>
        <h3>Practices</h3>
        <p><b>Stillness:</b> stop for a few seconds and the view turns inward, toward whatever moves nearby. <b>Square breathing:</b> the small ring above the round button lets the world carry you while lungs of light breathe with you. <b>Laying hands:</b> hold your finger on a tree, a stone, a crystal or the ground and the wanderer goes to touch it.</p>
      </section>

      <section>
        <h3>Your heart and the oracle</h3>
        <p>A double tap on your own heart opens a note. Your notes (⋮ → My Heart) live only on this device; nothing is sent anywhere. The <b>oracle</b> (⋮ → Oracle, at the Choice, at the maze's centre, and in every Go deeper) reflects on what you ask; every exchange is kept in your notes. Only when you choose <b>♥ share my heart</b> do your notes go with that one question, with names and details taken out, and they are not kept.</p>
      </section>

      <section>
        <h3>Finding your way</h3>
        <p>⋮ opens the <b>map</b> (tap anywhere to go there), the <b>guide</b> ("Walk me there"), <b>tours</b> that take you from place to place, and autofly. When something ends, a card offers where to go next.</p>
      </section>

      <section class="in-app">
        <h3>Keep it as an app</h3>
        <p>${WHY}</p>
        ${steps()}
        <button class="in-install" type="button" hidden>Install</button>
      </section>

      <div class="in-foot">
        <button class="in-howto" type="button">Every control</button>
        <button class="in-close" type="button">Begin</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  keepToItself(el);
  const appSec = el.querySelector<HTMLElement>(".in-app")!;
  const inst = el.querySelector<HTMLButtonElement>(".in-install")!;
  inst.addEventListener("click", () => void install.prompt());
  const sync = () => {
    appSec.hidden = !install.offerable;
    inst.hidden = !install.canPrompt;
  };
  install.onChange = sync;
  const close = () => {
    el.hidden = true;
    document.body.classList.remove("introing");
  };
  el.querySelector(".x")!.addEventListener("click", close);
  el.querySelector(".in-close")!.addEventListener("click", close);
  el.querySelector(".in-howto")!.addEventListener("click", () => {
    close();
    howto();
  });
  addEventListener("keydown", (e) => e.key === "Escape" && !el.hidden && close());
  return {
    open() {
      sync();
      el.hidden = false;
      el.scrollTop = 0;
      el.querySelector(".in-body")!.scrollTop = 0;
      document.body.classList.add("introing");
      el.querySelector<HTMLButtonElement>(".in-close")!.focus({ preventScroll: true });
    },
    close,
    get isOpen() {
      return !el.hidden;
    },
  };
}
