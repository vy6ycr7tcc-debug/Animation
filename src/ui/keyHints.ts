/* The keys, shown (the owner: on a computer "the controls… are not clear… I finally figured out
   that I had to use space for diving, but that was not super clear"). On a keyboard there is no
   round button and no word beside it, so nothing said what Space does where you are. A quiet row
   low on the left, where the stick sits on a phone, names the keys that matter now, changing with
   what you are doing: on the land, in the air, at the water's surface, under it, on its floor,
   seated. The key that has just taken on a new meaning glows a moment. The last chips are the
   same everywhere: the map, the guide, and every key (How to play). Never on a touch screen. */

export type KeyState = "land" | "fly" | "surface" | "under" | "floor" | "seated" | "auto";

type Chip = [keys: string[], what: string];

const ROWS: Record<KeyState, Chip[]> = {
  land: [[["W", "A", "S", "D"], "walk"], [["Shift"], "run"], [["Space"], "jump · twice to fly"], [["E"], "sit"]],
  fly: [[["W", "A", "S", "D"], "steer"], [["Space"], "hold to rise"], [["L"], "land"]],
  surface: [[["W", "A", "S", "D"], "swim"], [["Space"], "dive"], [["Space"], "hold: fly out"]],
  under: [[["W", "A", "S", "D"], "swim where you look"], [["Space"], "up"], [["C"], "down"], [["L"], "to the floor"]],
  floor: [[["W", "A", "S", "D"], "walk the floor"], [["Space"], "lift off"], [["L"], "surface"]],
  seated: [[["E"], "stand up"]],
  auto: [[["O"], "stop"], [["W", "A", "S", "D"], "take over"]],
};
const ALWAYS: Chip[] = [[["M"], "map"], [["G"], "guide"], [["?"], "all keys"]];

export class KeyHints {
  readonly el: HTMLDivElement;
  private state: KeyState | null = null;
  private shown = false;

  constructor() {
    this.el = Object.assign(document.createElement("div"), { id: "keys", hidden: true });
    this.el.setAttribute("role", "note");
    this.el.setAttribute("aria-label", "Keys");
    document.body.append(this.el);
  }

  /** Each frame: whether a keyboard player should see the row now, and what they are doing. */
  set(show: boolean, state: KeyState): void {
    if (show !== this.shown) this.el.hidden = !(this.shown = show);
    if (!show || state === this.state) return;
    const was = this.state;
    this.state = state;
    const row = (chips: Chip[], fresh: boolean) =>
      chips.map(([keys, what]) => {
        const c = Object.assign(document.createElement("span"), { className: "chip" + (fresh && keys[0] === "Space" ? " fresh" : "") });
        for (const k of keys) c.append(Object.assign(document.createElement("kbd"), { textContent: k }));
        c.append(Object.assign(document.createElement("span"), { className: "what", textContent: what }));
        return c;
      });
    const sep = Object.assign(document.createElement("span"), { className: "sep" });
    // Space changes meaning from place to place: when it does, it glows a moment
    this.el.replaceChildren(...row(ROWS[state], was !== null), sep, ...row(ALWAYS, false));
  }
}
