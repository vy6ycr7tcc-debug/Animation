/* What you can say to an archetype when you sit with it, and its recorded answers
   (content/dialogues.json). Each answer becomes a narration track, so it gets everything the
   narration has: the bed ducks, it fades rather than cuts, and its subtitles follow the voice.
   Samuel will send the recordings and transcripts. Until then an answer shows its transcript,
   or a placeholder line, as subtitles. */
import data from "../../content/dialogues.json";
import { TRACKS, type Cue, type Track } from "./narration";
import qa from "../../content/archetype_qa.json";
import passages from "../../content/passages.json";

export interface Prompt {
  id: string;
  kind: "question" | "feeling";
  label: string;
}
interface Answer {
  file: string;
  transcript: string;
  cues?: Cue[];
}
interface Entry {
  prompts?: Prompt[];
  [promptId: string]: Answer | Prompt[] | undefined;
}
export interface Spectrum {
  id: string;
  label: string;
  ends: [string, string];
  anchors: string[];
}
const D = data as unknown as {
  prompts: Prompt[];
  spectrum?: Spectrum;
  names: Record<string, string>;
  answers: Record<string, Entry>;
};

export const trackId = (numeral: string, prompt: string) => `A-${numeral}-${prompt}`;

/** Subtitles for a transcript, one sentence at a time, paced like unhurried speech. The
    narration stretches these times to fit the recording once it exists. */
function cuesFor(text: string): { cues: Cue[]; duration: number } {
  const parts = text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  const cues: Cue[] = [];
  let t = 0;
  for (const p of parts) {
    cues.push({ t, text: p });
    t += 0.6 + p.length / 13;
  }
  return { cues, duration: t };
}

/** "How is your heart right now?": one gradient from shadow to light, with anchor answers. */
export const SPECTRUM: Spectrum | null = D.spectrum ?? null;

/** The prompts offered at one archetype: questions first, then feelings. */
export function promptsFor(numeral: string): Prompt[] {
  const own = D.answers[numeral]?.prompts;
  const list = own ?? D.prompts;
  return [...list.filter((p) => p.kind !== "feeling"), ...list.filter((p) => p.kind === "feeling")];
}

/** Register every answer as a narration track. */
export function registerAnswers(): void {
  for (const [numeral, entry] of Object.entries(D.answers)) {
    const anchors: Prompt[] = (SPECTRUM?.anchors ?? []).map((a) => ({ id: a, kind: "feeling", label: `${SPECTRUM!.label} (${a})` }));
    for (const p of [...promptsFor(numeral), ...anchors]) {
      const a = entry[p.id] as Answer | undefined;
      const name = D.names[numeral] ?? numeral;
      const text =
        a?.transcript?.trim() ||
        (p.kind === "feeling" ? `(${name}'s answer for a heart toward ${p.id} is still to be recorded.)` : `(${name}'s answer to “${p.label}” is still to be recorded.)`);
      const timed = a?.cues?.length ? { cues: a.cues, duration: a.cues[a.cues.length - 1].t + 4 } : cuesFor(text);
      const track: Track = {
        id: trackId(numeral, p.id),
        title: `${name}: ${p.label}`,
        voice: "female", // Samuel's own recordings: played as they are
        file: a?.file ?? `audio/answers/${numeral}/${p.id}.mp3`,
        duration: timed.duration,
        trigger: "sit",
        cues: timed.cues,
      };
      TRACKS[track.id] = track;
    }
  }
}

/* The tunnel (Samuel's archetype Q&A package, content/archetype_qa.json): at each archetype,
   "Who are you?" on arrival (the Threshold), its teaching when you step closer (the Walk), and
   its practice when you sit with it (the Heart). Passages (content/passages.json) are spoken on
   the road from one archetype to the next. */

interface Spoken {
  question: string;
  file: string;
  transcript: string;
}
const QA = (qa as unknown as { archetypes: Record<string, Record<"threshold" | "walk" | "heart", Spoken>> }).archetypes;
const PASSAGES = (passages as unknown as { passages: { id: string; route: string; file: string; transcript: string }[] }).passages;

export const walkId = (numeral: string) => `W-${numeral}`;
export const heartId = (numeral: string) => `H-${numeral}`;
/** The passage spoken on the road onward from archetype n (1–21), or null. */
export const passageId = (n: number) => (n >= 1 && n <= PASSAGES.length ? PASSAGES[n - 1].id : null);

export function registerTunnel(): void {
  const add = (id: string, title: string, file: string, text: string, trigger: string) => {
    const timed = cuesFor(text);
    TRACKS[id] = { id, title, voice: "female", file, duration: timed.duration, trigger, cues: timed.cues };
  };
  for (const [numeral, e] of Object.entries(QA)) {
    const name = D.names[numeral] ?? numeral;
    if (e.walk) add(walkId(numeral), `${name}: ${e.walk.question}`, e.walk.file, e.walk.transcript, "walk");
    if (e.heart) add(heartId(numeral), `${name}: ${e.heart.question}`, e.heart.file, e.heart.transcript, "heart");
  }
  for (const p of PASSAGES) add(p.id, `Passage: ${p.route}`, p.file, p.transcript, "passage");
}
