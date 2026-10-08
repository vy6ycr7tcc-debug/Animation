/* Full screen on desktop (the owner: "full screen by default when you enter the game on desktop,
   so it hides the toolbar"). Browsers allow it only from a click or key, so it is asked for on the
   touch that begins the game ("Touch the water to begin") and on returning from the rest screen.
   Phones keep their own way (the Home Screen app is already full screen; Safari on the iPhone has
   no full-screen API for pages). The choice is remembered on the device: ⋮ → "Full screen". Esc,
   the browser's own way out, leaves it for now without changing the choice. */
import { MOBILE } from "./quality";

const KEY = "inward-journey:fullscreen";
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

/** This device can go full screen from the page (desktop browsers). */
export const fullscreenAvailable = (): boolean => {
  const el = document.documentElement as FsEl;
  return !MOBILE && !!(el.requestFullscreen || el.webkitRequestFullscreen) && (document.fullscreenEnabled ?? true);
};

/** The choice (on by default). */
export function fullscreenWanted(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}
export function setFullscreenWanted(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* this visit only */
  }
}

export const isFullscreen = (): boolean => !!(document.fullscreenElement || (document as FsDoc).webkitFullscreenElement);

/** Go full screen; call only inside a click or key handler. Quietly does nothing if refused. */
export function enterFullscreen(): void {
  if (!fullscreenAvailable() || isFullscreen()) return;
  const el = document.documentElement as FsEl;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: "hide" }) : el.webkitRequestFullscreen?.();
    void p?.catch?.(() => undefined);
  } catch {
    /* refused: the page goes on in its window */
  }
}
export function exitFullscreen(): void {
  if (!isFullscreen()) return;
  const d = document as FsDoc;
  try {
    void (document.exitFullscreen ? document.exitFullscreen() : d.webkitExitFullscreen?.())?.catch?.(() => undefined);
  } catch {
    /* fine */
  }
}
/** On entering the game (inside its click): full screen, if this is a desktop and it is wanted. */
export function fullscreenOnEnter(): void {
  if (fullscreenWanted()) enterFullscreen();
}
