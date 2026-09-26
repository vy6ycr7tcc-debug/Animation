/* Progress lives only on this device (localStorage). Nothing leaves it.
   It is kept as you play (every few seconds, and whenever the page is hidden or closed), so
   coming back continues where you were. Storage can be unavailable (private mode, blocked site
   data); the game then simply starts fresh. */

export interface SaveData {
  v: 1;
  pos: [number, number, number];
  heading: number;
  heard: string[]; // story narrations already played (J01, J02, …)
  visited: number[]; // stations visited, 1–7
  rideDone?: boolean; // the Chariot has carried the wanderer to the shore
  ended?: boolean; // home again: the journey is complete
  settings: { volume: number; reduced: boolean | null; subtitles: boolean; narration?: boolean; voices?: boolean; awake?: boolean };
  /** The journey so far, so coming back continues it rather than repeating it. */
  journey?: {
    heard: string[]; // every voice heard (journey narrations, answers, teachings, passages)
    walked: string[]; // archetypes whose teaching you've heard (numerals)
    hearted: string[]; // archetypes whose practice you've heard
    passed: number[]; // archetypes whose onward passage has been spoken (indices)
    archive: string[]; // archive narrations (orbs and fruits) you've heard
  };
  savedAt?: number;
}

const KEY = "inward-journey:night:v1";

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

/** Forget the journey's progress (the journal is kept). */
export function clear(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
