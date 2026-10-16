/* Reading aloud in the device's own voice (speechSynthesis: on an iPhone the same voices as
   Settings → Accessibility → Spoken Content). Nothing leaves the device. It prefers an Enhanced or
   Premium voice in the reader's own language when the device has one downloaded, else the
   device's default. One utterance at a time, started by a tap. */

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

let voice: SpeechSynthesisVoice | null = null;

/* Which of the device's voices are worth hearing. On an iPhone Safari lists every installed voice,
   and its names don't say "Enhanced" or "Premium": that is in the voiceURI
   (com.apple.voice.premium.en-US.Zoe, ….enhanced.…, ….compact.…). It also lists the novelty voices
   (Bubbles, Zarvox, Whisper…) and the old Eloquence ones (Grandma, Rocko, Reed…), which sound
   robotic; they are never chosen. Siri's own voices are not given to websites at all. */
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
export type VoiceTier = "premium" | "enhanced" | "natural" | "standard";
export function tierOf(v: SpeechSynthesisVoice): VoiceTier {
  const id = `${v.voiceURI} ${v.name}`;
  if (/premium/i.test(id)) return "premium";
  if (/enhanced|siri/i.test(id)) return "enhanced";
  if (/natural|neural|online|google/i.test(id)) return "natural"; // Edge's and Chrome's network voices
  return "standard";
}
function usable(v: SpeechSynthesisVoice): boolean {
  return !NOVELTY.test(v.name) && !/eloquence|speech\.synthesis\.voice/i.test(v.voiceURI);
}
function score(v: SpeechSynthesisVoice, lang: string): number {
  const t = tierOf(v);
  return (t === "premium" ? 8 : t === "enhanced" ? 6 : t === "natural" ? 5 : 0) + (v.lang.toLowerCase().replace("_", "-") === lang ? 1 : 0) + (v.default ? 0.5 : 0);
}
/** The device's voices in the reader's language worth offering, best first. */
export function listVoices(): SpeechSynthesisVoice[] {
  if (!canSpeak) return [];
  const lang = (navigator.language || "en").toLowerCase(), base = lang.split("-")[0];
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith(base) && usable(v))
    .sort((a, b) => score(b, lang) - score(a, lang) || a.name.localeCompare(b.name));
}
/** Every voice the device gives the browser, in three groups: the reader's language (best first),
    the other languages (by language, best first), and the novelty and older voices. Nothing is
    left out; only the automatic choice ignores the last group. */
export function allVoices(): { label: string; voices: SpeechSynthesisVoice[] }[] {
  if (!canSpeak) return [];
  const lang = (navigator.language || "en").toLowerCase(), base = lang.split("-")[0];
  const all = speechSynthesis.getVoices();
  const mine = listVoices();
  const others = all
    .filter((v) => !v.lang.toLowerCase().startsWith(base) && usable(v))
    .sort((a, b) => a.lang.localeCompare(b.lang) || score(b, "") - score(a, "") || a.name.localeCompare(b.name));
  const odd = all.filter((v) => !usable(v)).sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  return [
    { label: "Your language", voices: mine },
    { label: "Other languages", voices: others },
    { label: "Novelty and older voices", voices: odd },
  ].filter((g) => g.voices.length);
}
const VOICE_KEY = "inward-journey:voice";
let chosen = "";
try {
  chosen = localStorage.getItem(VOICE_KEY) ?? "";
} catch {
  /* private mode */
}
/** The voice chosen in ⋮ ("" = the best this device has). */
export function chosenVoice(): string {
  return chosen;
}
export function setVoice(uri: string): void {
  chosen = uri;
  try {
    localStorage.setItem(VOICE_KEY, uri);
  } catch {
    /* not kept */
  }
  pickVoice();
}
function pickVoice(): void {
  if (!canSpeak) return;
  const all = listVoices();
  const best = all[0];
  // With nothing chosen, a Premium or Enhanced voice is named; otherwise none is, so the phone speaks
  // in its own voice for the language: on an iPhone the one picked in Settings → Accessibility →
  // Spoken Content → Voices. Naming the plain default (often the only voice Safari lists, as
  // Samantha) would override a better voice chosen there.
  voice = (chosen && speechSynthesis.getVoices().find((v) => v.voiceURI === chosen)) || (best && tierOf(best) !== "standard" ? best : null);
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
export function pieces(text: string): string[] {
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
export function speak(text: string | string[], done?: () => void, fail?: () => void, onPart?: (i: number) => void): void {
  if (!canSpeak) return;
  const parts = typeof text === "string" ? pieces(text) : text.filter((t) => t.trim());
  if (!parts.length) return;
  const my = ++token;
  let started = false;
  const queue = (withVoice: boolean) => {
    speechSynthesis.cancel();
    if (speechSynthesis.paused) speechSynthesis.resume();
    // always the voice object the device lists now (iOS can replace them after voiceschanged)
    if (withVoice) pickVoice();
    held = parts.map((t, i) => {
      const u = new SpeechSynthesisUtterance(t);
      if (withVoice && voice) u.voice = voice;
      u.lang = (withVoice && voice?.lang) || navigator.language || "en-US";
      u.rate = 0.95;
      u.onstart = () => {
        if (!started) report(withVoice ? "chosen" : "fallback");
        started = true;
        if (my === token) onPart?.(i);
      };
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
  // a Premium or Enhanced voice loads its model the first time it speaks, which on an iPhone can
  // take several seconds: waiting only 1.5 s fell back to the default voice before the chosen one
  // began, so the chosen voice was never heard. A chosen voice is given 6 s.
  const patience = chosen ? 6000 : 2500;
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
  }, patience);
}

/** Told how the last speech began: in the voice asked for, or (it would not start) the default. */
let reportTo: (how: "chosen" | "fallback", name: string) => void = () => {};
export function onSpeechStart(f: (how: "chosen" | "fallback", name: string) => void): void {
  reportTo = f;
}
function report(how: "chosen" | "fallback"): void {
  reportTo(how, voice?.name ?? "");
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
// "-v2": off for everyone once (the owner: never read aloud by default); turning it on is kept
const AUTO_KEY = "inward-journey:readaloud-v2";
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
