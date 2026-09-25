/* What you can say to an archetype when you sit with it, and its recorded answers
   (content/dialogues.json). Each answer becomes a narration track, so it gets everything the
   narration has: the bed ducks, it fades rather than cuts, and its subtitles follow the voice.
   Samuel will send the recordings and transcripts. Until then an answer shows its transcript,
   or a placeholder line, as subtitles. */
import data from "../../content/dialogues.json";
import { TRACKS, type Cue, type Track } from "./narration";

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
const D = data as unknown as {
  prompts: Prompt[];
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

/** The prompts offered at one archetype: questions first, then feelings. */
export function promptsFor(numeral: string): Prompt[] {
  const own = D.answers[numeral]?.prompts;
  const list = own ?? D.prompts;
  return [...list.filter((p) => p.kind !== "feeling"), ...list.filter((p) => p.kind === "feeling")];
}

/** Register every answer as a narration track. */
export function registerAnswers(): void {
  for (const [numeral, entry] of Object.entries(D.answers)) {
    for (const p of promptsFor(numeral)) {
      const a = entry[p.id] as Answer | undefined;
      const name = D.names[numeral] ?? numeral;
      const text = a?.transcript?.trim() || `(${name}'s answer to “${p.label}” is still to be recorded.)`;
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
