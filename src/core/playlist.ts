/* Narration in the background: sparing, and never repeating.
   - Each of the journey's voices is heard once per journey. What you've heard is kept on this
     device, so coming back you hear what you haven't yet (Samuel: the narrator "is repeating the
     same thing over and over"). When all have been heard, the narrator rests; the archive's
     narrations never begin by themselves (only on a tap), but `onRunOut` may point one out.
   - A long quiet stretch between voices (a minute or two), so the world can speak for itself.
   - Where you choose to begin decides which voice comes first; the rest follow in order.
   - The archetypes' own voices (arriving, stepping close, sitting with them, the passages on the
     road onward) are spoken once each, where they belong (the tunnel, in main.ts).
   - In the background, only tracks with audio in the voice Samuel likes are played. A track
     you ask for (by beginning at its place, or meeting its being) plays even without audio,
     as subtitles. */
import type { Narration } from "./narration";

export const ORDER = ["J01", "J02", "J03", "J04", "J05", "J06", "J07", "J08", "J09", "J10", "J11"];

/** The quiet after a voice: under a minute, a little different every time. */
const gap = () => 35 + Math.random() * 25;

export class Playlist {
  on = true;
  /** While an archive narration (orb or fruit) is with the player, the journey's voices wait. */
  held = false;
  /** While the wanderer sits with an archetype, only the archetype speaks. */
  quiet = false;
  private i = 0;
  private wait = 4; // seconds until the first voice
  private starting = false;
  private heard = new Set<string>();
  private first: string | null = null;
  /** A voice asked for next, ahead of the order (a passage on the road onward). */
  private next_: string | null = null;

  constructor(private narration: Narration) {}

  /** Everything heard on this journey (kept on this device). */
  get heardIds(): string[] {
    return [...this.heard];
  }
  /** Coming back: what was heard before stays heard. */
  restore(ids: string[]): void {
    for (const id of ids) this.heard.add(id);
  }
  /** Begin again: forget it all. */
  forget(): void {
    this.heard.clear();
    this.next_ = null;
  }
  /** A voice spoken elsewhere (an archetype's teaching, its practice): it counts as heard. */
  mark(id: string): void {
    this.heard.add(id);
  }
  has(id: string): boolean {
    return this.heard.has(id);
  }

  /** When the journey's own voices have all been heard: a chance to point out something else
      to hear; true if something began speaking. */
  onRunOut: (() => boolean) | null = null;

  /** Quiet for a while ("Just the music"), then the voices return. */
  rest(seconds: number): void {
    this.wait = Math.max(this.wait, seconds);
  }

  setOn(on: boolean): void {
    this.on = on;
    if (!on) this.narration.stop(2);
    else this.wait = Math.min(this.wait, 3);
  }

  /** Wake somewhere: this voice first (unless it has been heard), then onward in order. */
  startWith(id: string, delay = 3): void {
    this.next_ = null;
    this.first = this.heard.has(id) ? null : id;
    this.i = Math.max(0, ORDER.indexOf(id));
    this.wait = delay;
    this.narration.stop(1.5);
  }

  /** Speak this next, as soon as the voices are quiet (after a short breath). */
  queueNext(id: string): void {
    if (this.heard.has(id)) return;
    this.next_ = id;
    this.wait = Math.min(this.wait, 6);
  }

  /** The wanderer has met the archetype whose narration this is. */
  meet(id: string): void {
    if (!this.on || this.held || this.narration.current === id || this.heard.has(id)) return;
    this.heard.add(id);
    this.narration.play(id);
    const k = ORDER.indexOf(id);
    if (k >= 0) this.i = (k + 1) % ORDER.length;
    this.wait = gap();
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
      this.wait = gap();
      this.starting = false;
      return;
    }
    let spoke = false;
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
        spoke = true;
        break;
      }
    }
    // every journey voice heard: point out where another voice is waiting
    if (!spoke && this.on && !this.held && !this.quiet && !this.narration.current) spoke = this.onRunOut?.() ?? false;
    this.wait = spoke ? gap() : 60;
    this.starting = false;
  }
}
