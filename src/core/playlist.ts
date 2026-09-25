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
  /** While an archive narration (orb or fruit) is with the player, the journey's voices wait. */
  held = false;
  /** While the wanderer sits with an archetype, only the archetype speaks. */
  quiet = false;
  private i = 0;
  private wait = 6; // seconds until the first voice
  private starting = false;
  private heard = new Set<string>();
  private first: string | null = null;
  /** A voice asked for next, ahead of the order (a passage on the road onward). */
  private next_: string | null = null;

  constructor(private narration: Narration) {}

  setOn(on: boolean): void {
    this.on = on;
    if (!on) this.narration.stop(2);
    else this.wait = Math.min(this.wait, 3);
  }

  /** A new beginning: this voice first, then onward in order. */
  startWith(id: string, delay = 3): void {
    this.heard.clear();
    this.next_ = null;
    this.first = id;
    this.i = Math.max(0, ORDER.indexOf(id));
    this.wait = delay;
    this.narration.stop(1.5);
  }

  /** Speak this next, as soon as the voices are quiet (after a short breath). */
  queueNext(id: string): void {
    if (this.heard.has(id)) return;
    this.next_ = id;
    this.wait = Math.min(this.wait, 4);
  }

  /** The wanderer has met the archetype whose narration this is. */
  meet(id: string): void {
    if (!this.on || this.held || this.narration.current === id || this.heard.has(id)) return;
    this.heard.add(id);
    this.narration.play(id);
    this.i = (ORDER.indexOf(id) + 1) % ORDER.length;
    this.wait = 22 + Math.random() * 20;
  }

  update(dt: number): void {
    if (!this.on || this.held || this.quiet || this.starting || this.narration.current) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.starting = true;
    void this.next();
  }

  private async next(): Promise<void> {
    const asked = this.next_;
    if (asked) {
      this.next_ = null;
      this.heard.add(asked);
      if (this.on && !this.held && !this.quiet && !this.narration.current) this.narration.play(asked);
      this.wait = 22 + Math.random() * 20;
      this.starting = false;
      return;
    }
    if (ORDER.every((id) => this.heard.has(id))) for (const id of ORDER) this.heard.delete(id);
    for (let tries = 0; tries < ORDER.length; tries++) {
      const id = ORDER[this.i];
      this.i = (this.i + 1) % ORDER.length;
      if (this.heard.has(id)) continue;
      const asked = id === this.first;
      if (asked || (await this.narration.available(id))) {
        // things may have changed while the recording loaded: never talk over another voice
        if (!this.on || this.held || this.quiet || this.narration.current) break;
        this.first = null;
        this.heard.add(id);
        this.narration.play(id);
        break;
      }
    }
    // a quiet stretch after each voice, a little different every time
    this.wait = 22 + Math.random() * 20;
    this.starting = false;
  }
}
