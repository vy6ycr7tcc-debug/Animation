/* Progress lives only on this device (localStorage). Nothing leaves it.
   Storage can be unavailable (private mode, blocked site data); the game then simply starts fresh. */

export interface SaveData {
  v: 1;
  pos: [number, number, number];
  heading: number;
  attuned: number[]; // station numbers 1–21 (from phase 2)
  settings: { volume: number; reduced: boolean | null };
}

const KEY = "inward-journey:v1";

export function load(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return d && d.v === 1 ? d : null;
  } catch {
    return null;
  }
}

export function save(d: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: progress simply isn't kept */
  }
}
