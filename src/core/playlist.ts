/* Narration that is always there in the background: the recordings play one after another,
   with a quiet stretch between them, whatever the wanderer is doing. Only tracks with audio
   in the voice Samuel likes are played; the rest join once they are re-voiced. */
import type { Narration } from "./narration";

const ORDER = ["J01", "J02", "J03", "J04", "J05", "J06", "J07", "J08", "J09", "J10", "J11"];

export class Playlist {
  on = true;
  private i = 0;
  private wait = 6; // seconds until the first voice
  private starting = false;

  constructor(private narration: Narration) {}

  setOn(on: boolean): void {
    this.on = on;
    if (!on) this.narration.stop(2);
    else this.wait = Math.min(this.wait, 3);
  }

  update(dt: number): void {
    if (!this.on || this.starting || this.narration.current) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.starting = true;
    void this.next();
  }

  private async next(): Promise<void> {
    for (let tries = 0; tries < ORDER.length; tries++) {
      const id = ORDER[this.i];
      this.i = (this.i + 1) % ORDER.length;
      if (await this.narration.available(id)) {
        if (this.on) this.narration.play(id);
        break;
      }
    }
    // a quiet stretch after each voice, a little different every time
    this.wait = 22 + Math.random() * 20;
    this.starting = false;
  }
}
