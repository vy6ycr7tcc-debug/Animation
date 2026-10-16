/* The heart's notes ("My Heart"): the player's own private journal, kept on this device only
   (localStorage `ij:heart:v1`; nothing is sent anywhere, except a question's notes when the
   player ticks "Attach my heart" for that one question in the oracle). A double tap on the
   wanderer's heart, or H, opens the composer; ⋮ → My Heart lists them, newest first; a small ♥
   rests at the edge of the view while seated or laying hands, and opens the composer.
   Same look as the reading panel (words in the dark over the world, gold hairlines). */

export interface HeartNote {
  text: string;
  /** ms since the epoch */
  createdAt: number;
  /** where it was written (the game's own name for the place) */
  scene: string;
}

import { heartPrompt } from "./anonymise";

const KEY = "ij:heart:v1";

export function heartNotes(): HeartNote[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((n) => n && typeof n.text === "string") : [];
  } catch {
    return [];
  }
}

function saveNotes(list: HeartNote[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** A button that answers on the touch itself (a phone gives no click while the other thumb holds
    the stick), and to the keyboard. */
export function tapButton(b: HTMLElement, f: () => void): void {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    f();
  });
  b.addEventListener("click", (e) => {
    e.preventDefault();
    if (e.detail === 0) f();
  });
}

/** A panel keeps its touches and its typing to itself (WASD, H, Space… never reach the game). */
export function keepToItself(el: HTMLElement): void {
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  el.addEventListener("keydown", (e) => e.stopPropagation());
  el.addEventListener("keyup", (e) => e.stopPropagation());
}

/** Keep a note in the heart from elsewhere (the oracle's "Keep in my heart"). False if the device
    would not keep it. */
export function keepNote(text: string, scene: string): boolean {
  const notes = heartNotes();
  notes.unshift({ text, createdAt: Date.now(), scene });
  return saveNotes(notes);
}

/** A button that acts on the click (a touch's release): copying and sharing need it on iOS. */
function clickButton(b: HTMLElement, f: () => void): void {
  b.addEventListener("pointerdown", (e) => e.stopPropagation());
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    f();
  });
}

const ORN = `<div class="orn" aria-hidden="true"><i></i><b></b><i></i></div>`;

function when(t: number): string {
  try {
    return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export class Heart {
  private compose: HTMLElement;
  private area: HTMLTextAreaElement;
  private list: HTMLElement;
  private listBody: HTMLElement;
  private mini: HTMLElement;
  private bring: HTMLElement;
  private bringText: HTMLTextAreaElement;
  private bringInfo: HTMLElement;
  private bringCopy: HTMLButtonElement;
  private miniOn = false;
  private miniDismissed = false;
  /** Where the note is being written (asked when the composer opens). */
  place: () => string = () => "";
  /** A soft sound when a note is kept. */
  onSaved: () => void = () => {};
  /** Something to say quietly (a whisper). */
  say: (text: string) => void = () => {};

  constructor() {
    const compose = document.createElement("div");
    compose.id = "heart-compose";
    compose.className = "heart-panel";
    compose.hidden = true;
    compose.setAttribute("role", "dialog");
    compose.setAttribute("aria-label", "A note from the heart");
    compose.innerHTML = `
      ${ORN}
      <h2 class="title">From the heart</h2>
      <textarea rows="6" maxlength="4000" placeholder="What is in your heart?" aria-label="Your note"></textarea>
      <p class="note">Kept on this device only.</p>
      <div class="foot"><button class="word cancel" type="button">Cancel</button><button class="word save" type="button">Keep it</button></div>`;
    document.body.appendChild(compose);
    keepToItself(compose);
    this.compose = compose;
    this.area = compose.querySelector("textarea")!;
    tapButton(compose.querySelector(".cancel")!, () => this.closeCompose());
    tapButton(compose.querySelector(".save")!, () => this.save());

    const list = document.createElement("div");
    list.id = "heart-notes";
    list.className = "heart-panel";
    list.hidden = true;
    list.setAttribute("role", "dialog");
    list.setAttribute("aria-label", "My heart");
    list.innerHTML = `
      <button class="x" type="button" aria-label="Close">✕</button>
      ${ORN}
      <h2 class="title">My heart</h2>
      <div class="notes" tabindex="0"></div>
      <p class="privacy">Your notes live only on this device, in this browser's own storage; nothing is sent anywhere. Only when you choose "with my heart" for a question do they go, with names and details taken out, to the oracle for that one answer, and they are not kept there.</p>
      <div class="foot"><button class="word add" type="button">A new note</button><button class="word bring-open" type="button">Bring my heart</button></div>`;
    document.body.appendChild(list);
    keepToItself(list);
    this.list = list;
    this.listBody = list.querySelector(".notes")!;
    tapButton(list.querySelector(".x")!, () => this.closeList());
    tapButton(list.querySelector(".add")!, () => {
      this.closeList();
      this.openCompose();
    });
    tapButton(list.querySelector(".bring-open")!, () => this.openBring());

    // Bring my heart: the notes as an anonymised prompt to paste into any other AI, for an
    // overview of the journey. Made here, shown and editable, and only copied or shared by you.
    const bring = document.createElement("div");
    bring.id = "heart-bring";
    bring.className = "heart-panel";
    bring.hidden = true;
    bring.setAttribute("role", "dialog");
    bring.setAttribute("aria-label", "Bring my heart");
    bring.innerHTML = `
      <button class="x" type="button" aria-label="Close">✕</button>
      ${ORN}
      <h2 class="title">Bring my heart</h2>
      <p class="lead">Your notes, made into a prompt for any AI you trust, to see an overview of your journey. Names, places, contact details, numbers and dates are taken out first. Read it, change anything, then copy it and paste it there. Nothing is sent from here.</p>
      <textarea class="prompt" spellcheck="false" aria-label="The prompt"></textarea>
      <p class="info" aria-live="polite"></p>
      <div class="foot"><button class="word back" type="button">Back</button><button class="word share" type="button" hidden>Share</button><button class="word copy" type="button">Copy the prompt</button></div>`;
    document.body.appendChild(bring);
    keepToItself(bring);
    this.bring = bring;
    this.bringText = bring.querySelector(".prompt")!;
    this.bringInfo = bring.querySelector(".info")!;
    this.bringCopy = bring.querySelector(".copy")!;
    tapButton(bring.querySelector(".x")!, () => this.closeBring());
    tapButton(bring.querySelector(".back")!, () => {
      this.closeBring();
      this.openList();
    });
    clickButton(this.bringCopy, () => void this.copyBring());
    const share = bring.querySelector<HTMLButtonElement>(".share")!;
    if (typeof navigator.share === "function") {
      share.hidden = false;
      clickButton(share, () => void navigator.share({ title: "My heart", text: this.bringText.value }).catch(() => {}));
    }

    const mini = document.createElement("div");
    mini.id = "heart-mini";
    mini.hidden = true;
    mini.innerHTML = `<button class="open" type="button" aria-label="Write from the heart">♥</button><button class="dis" type="button" aria-label="Not now">✕</button>`;
    document.body.appendChild(mini);
    keepToItself(mini);
    this.mini = mini;
    tapButton(mini.querySelector(".open")!, () => this.openCompose());
    tapButton(mini.querySelector(".dis")!, () => {
      this.miniDismissed = true;
      this.mini.hidden = true;
    });

    addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!compose.hidden) this.closeCompose();
      else if (!list.hidden) this.closeList();
      else if (!this.bring.hidden) this.closeBring();
    });
  }

  get open(): boolean {
    return !this.compose.hidden || !this.list.hidden || !this.bring.hidden;
  }

  private mark(): void {
    document.body.classList.toggle("hearting", this.open);
  }

  openCompose(): void {
    if (!this.compose.hidden) return;
    this.list.hidden = true;
    this.area.value = "";
    this.compose.hidden = false;
    this.mark();
    // focus after the panel shows (a phone raises its keyboard only for a focused field)
    requestAnimationFrame(() => this.area.focus());
  }

  closeCompose(): void {
    this.compose.hidden = true;
    this.area.blur();
    this.mark();
  }

  private save(): void {
    const text = this.area.value.trim();
    if (!text) return this.closeCompose();
    const notes = heartNotes();
    notes.unshift({ text, createdAt: Date.now(), scene: this.place() });
    if (!saveNotes(notes)) {
      this.say("This device would not keep the note.");
      return;
    }
    this.closeCompose();
    this.onSaved();
    this.say("Kept in your heart.");
  }

  openList(): void {
    this.compose.hidden = true;
    const notes = heartNotes();
    this.listBody.replaceChildren();
    if (!notes.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Nothing here yet. A double tap on your heart, or H, opens a new note.";
      this.listBody.append(p);
    }
    for (const n of notes) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "item";
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = [when(n.createdAt), n.scene].filter(Boolean).join(" · ");
      const body = document.createElement("span");
      body.className = "text";
      body.textContent = n.text;
      item.append(meta, body);
      // a tap opens a note to read it whole (and folds it again)
      item.addEventListener("click", () => item.classList.toggle("open"));
      // ✕ deletes it: a first tap asks ("Delete?"), a second within a few seconds deletes
      const del = document.createElement("button");
      del.type = "button";
      del.className = "del";
      del.setAttribute("aria-label", "Delete this note");
      del.textContent = "✕";
      let armed = 0;
      tapButton(del, () => {
        if (!armed) {
          del.textContent = "Delete?";
          del.classList.add("armed");
          armed = window.setTimeout(() => {
            armed = 0;
            del.textContent = "✕";
            del.classList.remove("armed");
          }, 3500);
          return;
        }
        window.clearTimeout(armed);
        this.deleteNote(n);
      });
      const row = document.createElement("div");
      row.className = "row";
      row.append(item, del);
      this.listBody.append(row);
    }
    (this.list.querySelector(".bring-open") as HTMLElement).hidden = !notes.length;
    this.list.hidden = false;
    this.mark();
  }

  /** Remove one note from this device for good. */
  private deleteNote(n: HeartNote): void {
    const left = heartNotes().filter((m) => !(m.createdAt === n.createdAt && m.text === n.text));
    saveNotes(left);
    this.openList();
  }

  openBring(): void {
    const notes = heartNotes();
    if (!notes.length) return;
    this.list.hidden = true;
    this.compose.hidden = true;
    const { text, names } = heartPrompt(notes);
    this.bringText.value = text;
    this.bringText.scrollTop = 0;
    this.bringInfo.textContent = `${notes.length} ${notes.length === 1 ? "note" : "notes"}${names ? ` · ${names} ${names === 1 ? "name" : "names"} taken out` : ""}. Check it before you share it: the clearing is careful, not perfect.`;
    this.bringCopy.textContent = "Copy the prompt";
    this.bring.hidden = false;
    this.mark();
  }

  closeBring(): void {
    this.bring.hidden = true;
    this.bringText.blur();
    this.mark();
  }

  private async copyBring(): Promise<void> {
    const t = this.bringText.value;
    let ok = false;
    try {
      await navigator.clipboard.writeText(t);
      ok = true;
    } catch {
      // older browsers: select it and copy
      this.bringText.focus();
      this.bringText.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      this.bringText.setSelectionRange(0, 0);
      this.bringText.blur();
    }
    this.bringCopy.textContent = ok ? "Copied ✓" : "Select it and copy";
  }

  closeList(): void {
    this.list.hidden = true;
    this.mark();
  }

  /** The small ♥ at the edge of the view: shown while seated or laying hands (called each frame;
      it only touches the page when the answer changes). A ✕ sets it aside until the next time. */
  affordance(on: boolean): void {
    if (on === this.miniOn) return;
    this.miniOn = on;
    if (!on) this.miniDismissed = false;
    this.mini.hidden = !on || this.miniDismissed;
  }
}
