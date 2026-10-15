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
/** The utterances being spoken, held so Safari can't collect them mid-speech (their end would never come). */
let held: SpeechSynthesisUtterance[] = [];
/** Told when the phone's voice would not start (shown where the words are). */
let failNote: (msg: string) => void = () => {};
export function onSpeechFail(f: (msg: string) => void): void {
  failNote = f;
}
const QUIET = "The phone's voice didn't start. If the ringer switch is on silent, turn it off: the phone's voice obeys it.";

/** The text in pieces of a sentence or two (iOS can go silent on one long utterance). */
function pieces(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const sen of text.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]*["'”’)]*\s*/g) ?? [text]) {
    if (cur && (cur + sen).length > 220) (out.push(cur.trim()), (cur = ""));
    cur += sen;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Speak `text`; `done` is called when it ends of itself (not when stopped).
    iOS speaks only from a touch's click or release (never from a pointerdown). If nothing has
    begun after a moment it tries once more in the phone's default voice (a chosen voice can be
    listed yet silent), and if that too stays silent says so. */
export function speak(text: string, done?: () => void, fail?: () => void): void {
  if (!canSpeak || !text.trim()) return;
  const my = ++token;
  const parts = pieces(text);
  let started = false;
  const queue = (withVoice: boolean) => {
    speechSynthesis.cancel();
    if (speechSynthesis.paused) speechSynthesis.resume();
    if (withVoice && !voice) pickVoice();
    held = parts.map((t, i) => {
      const u = new SpeechSynthesisUtterance(t);
      if (withVoice && voice) u.voice = voice;
      u.lang = (withVoice && voice?.lang) || navigator.language || "en-US";
      u.rate = 0.95;
      u.onstart = () => (started = true);
      if (i === parts.length - 1)
        u.onend = () => {
          if (my !== token) return;
          held = [];
          if (started) done?.();
        };
      return u;
    });
    for (const u of held) speechSynthesis.speak(u);
  };
  queue(true);
  window.setTimeout(() => {
    if (my !== token || started || speechSynthesis.speaking) return;
    queue(false);
    window.setTimeout(() => {
      if (my !== token || started || speechSynthesis.speaking) return;
      held = [];
      speechSynthesis.cancel();
      fail?.();
      failNote(QUIET);
    }, 2500);
  }, 1500);
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
  held = [];
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
  speak(text, done, done);
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
  held = [u];
  speechSynthesis.speak(u);
}
