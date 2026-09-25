/* Narration that is always there in the background: the recordings play one after another,
   with a quiet stretch between them, whatever the wanderer is doing.
   - Where you choose to begin decides which voice comes first; the rest follow in order.
   - Meeting an archetype's being begins its narration straight away (and it carries on as
     you walk away).
   - In the background, only tracks with audio in the voice Samuel likes are played. A track
     you ask for (by beginning at its place, or meeting its being) plays even without audio,
     as subtitles. */
import type { Narration } from "./narration";

export const ORDER = ["J01", "J02", "J03", "J04", "J05", "J06", "J07", "J08", "J09", "J10", "J11"];

export class Playlist {
  on = true;
  private i = 0;
  private wait = 6; // seconds until the first voice
  private starting = false;
  private heard = new Set<string>();
  private first: string | null = null;

  constructor(private narration: Narration) {}

  setOn(on: boolean): void {
    this.on = on;
    if (!on) this.narration.stop(2);
    else this.wait = Math.min(this.wait, 3);
  }

  /** A new beginning: this voice first, then onward in order. */
  startWith(id: string, delay = 3): void {
    this.heard.clear();
    this.first = id;
    this.i = Math.max(0, ORDER.indexOf(id));
    this.wait = delay;
    this.narration.stop(1.5);
  }

  /** The wanderer has met the archetype whose narration this is. */
  meet(id: string): void {
    if (!this.on || this.narration.current === id || this.heard.has(id)) return;
    this.heard.add(id);
    this.narration.play(id);
    this.i = (ORDER.indexOf(id) + 1) % ORDER.length;
    this.wait = 22 + Math.random() * 20;
  }

  update(dt: number): void {
    if (!this.on || this.starting || this.narration.current) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.starting = true;
    void this.next();
  }

  private async next(): Promise<void> {
    if (this.heard.size >= ORDER.length) this.heard.clear();
    for (let tries = 0; tries < ORDER.length; tries++) {
      const id = ORDER[this.i];
      this.i = (this.i + 1) % ORDER.length;
      if (this.heard.has(id)) continue;
      const asked = id === this.first;
      if (asked || (await this.narration.available(id))) {
        this.first = null;
        this.heard.add(id);
        if (this.on) this.narration.play(id);
        break;
      }
    }
    // a quiet stretch after each voice, a little different every time
    this.wait = 22 + Math.random() * 20;
    this.starting = false;
  }
}
