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
const WHY = `Full screen, no browser bars; your place, notes and lamps are kept safe (Safari can clear a website's storage after a week unvisited, but not an app's). And once downloaded for offline play, it opens with no connection at all.`;

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

/* The intro's illustrations: line drawings in the game's thin gold, one per page. */
const G = (body: string) => `<svg class="art" viewBox="0 0 200 140" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
const stars = (pts: [number, number][]) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.9" fill="currentColor" stroke="none"/>`).join("");
const seed = (cx: number, cy: number, r: number) =>
  [[0, 0], [0, -r], [0, r], [-r * 0.866, -r / 2], [r * 0.866, -r / 2], [-r * 0.866, r / 2], [r * 0.866, r / 2]].map(([x, y]) => `<circle cx="${cx + x}" cy="${cy + y}" r="${r}"/>`).join("") + `<circle cx="${cx}" cy="${cy}" r="${r * 2}" opacity="0.6"/>`;
const ART = {
  // a moon over still water, its light lying on it
  what: G(`${stars([[24, 20], [48, 34], [70, 14], [140, 22], [172, 38], [186, 16], [112, 12]])}
    <path d="M112 30a20 20 0 1 0 14 34a16 16 0 1 1 -14 -34z"/>
    <path d="M10 96h180" opacity="0.8"/><path d="M84 104h40M90 111h28M96 118h16M101 125h6" opacity="0.7"/>`),
  // the stick under the left thumb, the round button on the right
  move: G(`<circle cx="52" cy="82" r="30" opacity="0.7"/><circle cx="62" cy="74" r="12"/>
    <path d="M40 38c10-8 24-8 30 2" opacity="0.6"/><path d="M66 34l4 6 -7 1" opacity="0.6"/>
    <circle cx="150" cy="86" r="20" opacity="0.8"/><circle cx="150" cy="86" r="5"/>
    <path d="M138 52q12-14 24 0" opacity="0.6"/><path d="M150 44v-8M144 40l6-6 6 6" opacity="0.6"/>`),
  // seven, seven and seven round a circle; one apart, to the north
  twentytwo: G(`<circle cx="100" cy="84" r="36" opacity="0.35"/>
    ${Array.from({ length: 21 }, (_, k) => { const a = Math.PI * 0.75 + (k / 20) * Math.PI * 1.5; return `<circle cx="${(100 + Math.cos(a) * 36).toFixed(1)}" cy="${(84 + Math.sin(a) * 36).toFixed(1)}" r="${k % 7 === 0 ? 3 : 2}" fill="currentColor" stroke="none" opacity="${k < 7 ? 1 : k < 14 ? 0.8 : 0.6}"/>`; }).join("")}
    <circle cx="100" cy="22" r="4.5"/><circle cx="100" cy="22" r="9" opacity="0.4"/><path d="M84 34h32" opacity="0.5"/>`),
  // the temple's pylon by the shore
  temple: G(`<path d="M44 104l10-62h30l4 62zM112 104l4-62h30l10 62z"/><path d="M88 104v-38h24v38"/><path d="M92 66a8 8 0 0 1 16 0" opacity="0.7"/>
    <path d="M50 52h36M114 52h36" opacity="0.5"/><circle cx="100" cy="30" r="5" opacity="0.8"/><path d="M84 30h-10M116 30h10" opacity="0.6"/>
    <path d="M14 112h172" opacity="0.7"/><path d="M70 120h60M86 127h28" opacity="0.5"/>`),
  // a heart, and above it a small sun of light
  heart: G(`<path d="M100 120s-34-19-34-43a17 17 0 0 1 34-9a17 17 0 0 1 34 9c0 24-34 43-34 43z"/>
    <circle cx="100" cy="30" r="8"/>${Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * Math.PI * 2; return `<path d="M${(100 + Math.cos(a) * 12).toFixed(1)} ${(30 + Math.sin(a) * 12).toFixed(1)}L${(100 + Math.cos(a) * 18).toFixed(1)} ${(30 + Math.sin(a) * 18).toFixed(1)}" opacity="0.7"/>`; }).join("")}
    <path d="M100 44v14" opacity="0.4" stroke-dasharray="2 3"/>`),
  // your notes kept close: a phone holding a heart, a ring of quiet round it
  data: G(`<rect x="76" y="20" width="48" height="96" rx="9"/><path d="M93 27h14" opacity="0.6"/>
    <path d="M100 84s-14-8-14-18a7 7 0 0 1 14-4a7 7 0 0 1 14 4c0 10-14 18-14 18z"/>
    <circle cx="100" cy="68" r="52" opacity="0.25"/><circle cx="100" cy="68" r="64" opacity="0.15"/>`),
  // a map and a path of light across it
  way: G(`<path d="M30 34l40-12 60 14 40-12v84l-40 12-60-14-40 12z" opacity="0.8"/><path d="M70 22v84M130 36v84" opacity="0.4"/>
    <path d="M48 98c14-6 18-26 38-28s30 16 46 4 18-30 26-36" stroke-dasharray="3 4"/>
    <circle cx="48" cy="98" r="3" fill="currentColor" stroke="none"/><path d="M158 34l4-10 4 10-4-3z" fill="currentColor"/>`),
  // its own icon on the Home Screen
  app: G(`<rect x="70" y="14" width="60" height="114" rx="11"/>
    <rect x="84" y="40" width="32" height="32" rx="8"/>${seed(100, 56, 5)}<path d="M86 84h28" opacity="0.5"/>
    <path d="M150 64v-14M143 57h14" opacity="0.8"/>`),
};

type Page = { art: string; title: string; body: string; app?: boolean };

/** The intro: one page at a time, each with its drawing. `howto` opens the full list of controls. */
export function buildIntro(install: Install, howto: () => void): { open(): void; close(): void; readonly isOpen: boolean } {
  const pages: Page[] = [
    { art: ART.what, title: "What it is for", body: `<p>Inland is not a game to win. There are no enemies, scores, timers, or ways to fail. It is a place to slow down and look inward — to meet the deep patterns every life passes through, and to listen, rest, and reflect. Keep it open beside you while you work, or lie down and let it hold you.</p>` },
    { art: ART.move, title: "Moving", body: `<p>Your thumb, low on the left, walks; push further to run. <b>Drag</b> anywhere else to look. <b>Tap the land</b> and you walk there. <b>The round button</b> jumps; hold it to fly, let go to glide. In water, the word beside it says what it does (Dive, Floor, Surface). On a computer: W A S D, Space, the mouse.</p>` },
    { art: ART.twentytwo, title: "The twenty-two", body: `<p>Twenty-two beings of light live across the world — not gods, not guides, but the shapes a human life takes: the part of you that grieves, the part that dares, the part that doubts at 3 a.m., the part that loves without keeping score.</p>
        <p>Seven near the shore, seven to the east, seven to the west — and one alone on an island to the north, waiting.</p>
        <p>Come near and one greets you. <b>Sit</b> with it to hear its story and its practice, in recorded voices. Then, when you are ready, <b>go deeper</b>: write what is on your heart, and the oracle will meet you there, seeing through that figure's eyes.</p>` },
    { art: ART.temple, title: "The temple", body: `<p>Near the shore stands a temple. Inside, all twenty-two are gathered in one place — come here when you want to sit with any of them, or to find the one you need.</p>` },
    { art: ART.heart, title: "Your heart and the oracle", body: `<p>A double tap on your own heart opens a note. Your notes live only on this device; nothing is sent anywhere. The <b>oracle</b> reflects on what you ask — in the temple, at the maze's centre, from the menu, and wherever you go deeper. Every exchange is kept in your notes. Only when you choose ♥ <b>share my heart</b> do your notes travel with that one question — with names and details taken out — and they are not kept.</p>` },
    { art: ART.data, title: "Your data", body: `<p>What you write here is yours. Your notes live only on this device and are never sent anywhere — except when you ask the oracle, and then only your question travels, to bring back an answer. Nothing you write or ask is kept, sold, or linked to an identity; there are no accounts, no profiles, no advertising. If you choose ♥ “share my heart,” your notes go with that single question, with names and details taken out, and are not kept.</p>` },
    { art: ART.way, title: "Finding your way", body: `<p>The menu opens the <b>map</b> (tap anywhere to go there), the <b>guide</b> (“Walk me there”), <b>tours</b> that take you from place to place, and autofly. When something ends, a card offers where to go next.</p>` },
    { art: ART.app, title: "Keep it as an app", body: `<p>${WHY}</p>${steps()}<button class="in-install" type="button" hidden>Install</button>`, app: true },
  ];
  const el = document.createElement("div");
  el.id = "intro";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-labelledby", "intro-title");
  el.innerHTML = `
    <button class="x" type="button" aria-label="Close">✕</button>
    <div class="in-head">
      <h2 id="intro-title">Inland</h2>
      <p class="lede">A contemplative world of night and light, where getting lost is the way in.</p>
    </div>
    <div class="in-pages"></div>
    <div class="in-nav">
      <button class="in-prev" type="button" aria-label="Previous page">‹</button>
      <div class="in-dots" role="tablist"></div>
      <button class="in-next" type="button" aria-label="Next page">›</button>
    </div>
    <div class="in-foot">
      <button class="in-howto" type="button">Every control</button>
      <button class="in-close" type="button">Begin</button>
    </div>`;
  document.body.appendChild(el);
  keepToItself(el);
  const box = el.querySelector<HTMLElement>(".in-pages")!, dots = el.querySelector<HTMLElement>(".in-dots")!;
  const prev = el.querySelector<HTMLButtonElement>(".in-prev")!, next = el.querySelector<HTMLButtonElement>(".in-next")!;
  const pageEls = pages.map((pg, k) => {
    const sec = document.createElement("section");
    sec.className = "in-page";
    if (pg.app) sec.classList.add("in-app");
    sec.innerHTML = `${pg.art}<div class="in-words"><h3>${pg.title}</h3><div class="in-text">${pg.body}</div></div>`;
    box.append(sec);
    const d = document.createElement("button");
    d.type = "button";
    d.className = "in-dot";
    d.setAttribute("aria-label", `${k + 1} of ${pages.length}: ${pg.title}`);
    d.addEventListener("click", () => go(k));
    dots.append(d);
    return sec;
  });
  const inst = el.querySelector<HTMLButtonElement>(".in-install")!;
  inst.addEventListener("click", () => void install.prompt());
  let shown = pages.map((_, k) => k), at = 0;
  const go = (k: number) => {
    const n = Math.max(0, Math.min(shown.length - 1, k));
    at = n;
    pageEls.forEach((p, j) => {
      p.hidden = j !== shown[n];
      if (!p.hidden) {
        p.classList.remove("in");
        void p.offsetWidth;
        p.classList.add("in");
      }
    });
    [...dots.children].forEach((d, j) => {
      (d as HTMLElement).hidden = !shown.includes(j);
      d.classList.toggle("on", j === shown[n]);
    });
    prev.disabled = n === 0;
    next.disabled = n === shown.length - 1;
    box.scrollTop = 0;
  };
  prev.addEventListener("click", () => go(at - 1));
  next.addEventListener("click", () => go(at + 1));
  // a swipe turns the page
  let sx = 0, sy = 0;
  box.addEventListener("pointerdown", (e) => ((sx = e.clientX), (sy = e.clientY)));
  box.addEventListener("pointerup", (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(at + (dx < 0 ? 1 : -1));
  });
  const sync = () => {
    // once it is an app, the app's page has nothing left to say
    shown = pages.map((_, k) => k).filter((k) => !pages[k].app || install.offerable);
    inst.hidden = !install.canPrompt;
  };
  install.onChange = () => {
    sync();
    if (!el.hidden) go(Math.min(at, shown.length - 1));
  };
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
  addEventListener("keydown", (e) => {
    if (el.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") go(at + 1);
    else if (e.key === "ArrowLeft") go(at - 1);
  });
  return {
    open() {
      sync();
      el.hidden = false;
      go(0);
      document.body.classList.add("introing");
      next.focus({ preventScroll: true });
    },
    close,
    get isOpen() {
      return !el.hidden;
    },
  };
}
