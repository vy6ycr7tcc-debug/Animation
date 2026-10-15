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
/** Speak `text`; `done` is called when it ends of itself (not when stopped). */
export function speak(text: string, done?: () => void): void {
  if (!canSpeak || !text.trim()) return;
  speechSynthesis.cancel();
  const my = ++token;
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.onend = () => my === token && done?.();
  speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (!canSpeak) return;
  token++;
  speechSynthesis.cancel();
}
