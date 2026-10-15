/* Reading aloud in the device's own voice (speechSynthesis: on an iPhone the same voices as
   Settings → Accessibility → Spoken Content). Nothing leaves the device. It prefers an Enhanced or
   Premium voice in the reader's own language when the device has one downloaded, else the
   device's default. One utterance at a time, started by a tap. */

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

let voice: SpeechSynthesisVoice | null = null;
function pickVoice(): void {
  if (!canSpeak) return;
  const lang = (navigator.language || "en").toLowerCase(), base = lang.split("-")[0];
  const all = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(base));
  const rank = (v: SpeechSynthesisVoice) =>
    (/premium/i.test(v.name) ? 4 : /enhanced/i.test(v.name) ? 3 : 0) + (v.lang.toLowerCase() === lang ? 1 : 0) + (v.localService ? 0.5 : 0);
  voice = all.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}
if (canSpeak) {
  pickVoice();
  speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

let token = 0;
/** The utterance being spoken, held so Safari can't collect it mid-speech (its end would never come). */
let held: SpeechSynthesisUtterance | null = null;
/** Speak `text`; `done` is called when it ends of itself (not when stopped).
    iOS speaks only from a touch's click or release (never from a pointerdown), and drops a line
    spoken straight after cancel() when nothing was speaking: so cancel only what is speaking. */
export function speak(text: string, done?: () => void): void {
  if (!canSpeak || !text.trim()) return;
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  if (speechSynthesis.paused) speechSynthesis.resume();
  if (!voice) pickVoice();
  const my = ++token;
  const u = new SpeechSynthesisUtterance(text);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  u.rate = 0.95;
  u.onend = () => {
    if (held === u) held = null;
    if (my === token) done?.();
  };
  held = u;
  speechSynthesis.speak(u);
}

/** A button that speaks: it acts on the click (a touch's release), which iOS counts as the
    gesture that lets speech begin; its pointerdown is kept from the game. */
export function speechButton(b: HTMLElement, f: () => void): void {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    f();
  });
}

export function stopSpeaking(): void {
  if (!canSpeak) return;
  token++;
  speechSynthesis.cancel();
}

/* Read aloud (⋮ → "Read words aloud"): when on, the game speaks its written words by itself as
   they appear (readings, steles, the archetypes' and the rites' words, the oracle's answers), no
   button to press each time. Saved on the device. The switch's own tap also wakes the phone's
   voice (iOS lets speech begin only from a touch, once; after that the game may speak). */
const AUTO_KEY = "inward-journey:readaloud";
let auto = false;
try {
  auto = localStorage.getItem(AUTO_KEY) === "1";
} catch {
  /* private mode: off */
}
export function readAloud(): boolean {
  return auto && canSpeak;
}
export function setReadAloud(on: boolean): void {
  auto = on;
  try {
    localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch {
    /* not kept */
  }
  if (on) speak("I will read the words aloud.");
  else stopSpeaking();
}
/** Speak `text` if reading aloud is on (else nothing). */
export function sayAloud(text: string, done?: () => void): boolean {
  if (!readAloud()) return false;
  speak(text, done);
  return true;
}
/** Inside the first touch of a visit ("Touch the water to begin"): wake the phone's voice, silently,
    so the game may read aloud later without a touch of its own. */
export function wakeSpeech(): void {
  if (!readAloud()) return;
  // iOS skips an empty line without waking anything: a real word, silent and quick
  const u = new SpeechSynthesisUtterance("ready");
  u.volume = 0;
  u.rate = 2;
  held = u;
  speechSynthesis.speak(u);
}
