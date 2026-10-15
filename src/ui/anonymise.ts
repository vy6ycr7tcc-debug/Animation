/* "Bring my heart": the notes made into a prompt to paste into any other AI, which reads them
   and gives back an overview of the person's journey. Everything happens on this device: the
   notes are anonymised here first (names, places, contact details, numbers and dates taken out),
   the person sees the prompt and may edit it, and only they copy or share it.
   The anonymising is careful but plain pattern work, not understanding; the prompt also asks
   the other AI never to guess who the person is. */
import type { HeartNote } from "./heart";

/** Capitalised words that are not names: the game's own words, the days and months, a few that
    open sentences mid-line ("I", "God"), and family words (a relation is not an identity). */
const KEEP = new Set(
  (
    "I I'm I've I'd I'll Me My God Creator Infinite One Love Light Mind Body Spirit Matrix Potentiator Catalyst Experience " +
    "Significator Transformation Great Way Choice Oracle Heart Soul Self Higher Universe Source Earth Sun Moon " +
    "Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August " +
    "September October November December Today Tomorrow Yesterday Mom Mum Dad Mother Father Mama Papa Grandma " +
    "Grandpa Granny Brother Sister Son Daughter Wife Husband Partner Friend Baby OK Okay Yes No Oh Maybe Please " +
    "Thank Thanks Sorry Dear The A An And But Or So If When Then This That These Those It It's Its We Our Us You " +
    "Your They Their He She His Her Him What Why How Who Where Which Not Now Here There Just Still Even Also"
  ).split(" "),
);

/** Replace what could identify someone. Names (and places: capitalised words that are not
    ordinary words) become a letter kept consistent across all the notes ("[name A]"), so the
    reader can still follow who recurs. */
export class Anonymiser {
  private names = new Map<string, string>();

  private label(word: string): string {
    const key = word.toLowerCase();
    let l = this.names.get(key);
    if (!l) {
      const n = this.names.size;
      l = `[name ${n < 26 ? String.fromCharCode(65 + n) : `#${n + 1}`}]`;
      this.names.set(key, l);
    }
    return l;
  }

  /** Learn the names first, from every note, before replacing (so a name met mid-sentence in
      one note is also caught where it opens a sentence in another). */
  learn(texts: string[]): void {
    const cap = /(^|[^\p{L}\p{N}'’])(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)*)/gu;
    for (const t of texts)
      for (const line of this.patterns(t).split(/\n/)) {
        let m: RegExpExecArray | null;
        cap.lastIndex = 0;
        while ((m = cap.exec(line))) {
          const start = m.index + m[1].length;
          // the first word of a sentence is capitalised anyway: only count it when it recurs mid-sentence
          const before = line.slice(0, start).trimEnd();
          const opens = before === "" || /[.!?…:"“”]$/.test(before);
          const words = m[2].split(/\s+/).filter((w) => !KEEP.has(w.replace(/['’]s$/, "")));
          if (!words.length) continue;
          if (!opens) for (const w of words) this.label(w.replace(/['’]s$/, ""));
        }
      }
  }

  /** Contact details, addresses, dates and numbers. */
  private patterns(text: string): string {
    let t = text;
    t = t.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[email]");
    t = t.replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link]");
    t = t.replace(/(^|\s)@[\w.]{2,}/g, "$1[handle]");
    // street addresses: a number then words then a street word
    t = t.replace(/\b\d{1,5}\s+(?:[A-Za-z]+\s+){0,3}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|court|ct|place|pl|square|sq)\b\.?/gi, "[address]");
    // dates written out
    t = t.replace(/\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/g, "[date]");
    t = t.replace(/\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+\d{1,2}(?:st|nd|rd|th)?)?(?:,?\s+\d{4})?\b/gi, (m) => (/\d/.test(m) ? "[date]" : m));
    // phone numbers and any long run of digits (ids, accounts, years)
    t = t.replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]");
    t = t.replace(/\b\d{4,}\b/g, "[number]");
    return t;
  }

  /** The labels that appear in what was scrubbed. */
  private used = new Set<string>();

  scrub(text: string): string {
    let t = this.patterns(text);
    // the names learned, wherever they stand
    if (this.names.size) {
      const words = [...this.names.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])(${words.join("|")})(['’]s)?(?![\\p{L}\\p{N}])`, "giu"), (_m, w: string, s?: string) => {
        const l = this.label(w);
        this.used.add(l);
        return l + (s ?? "");
      });
    }
    return t;
  }

  /** How many different names were taken out. */
  get count(): number {
    return this.used.size;
  }
}

/** The prompt: the notes, anonymised, oldest first, each dated only by days since the first. */
export function heartPrompt(notes: HeartNote[]): { text: string; names: number } {
  const list = [...notes].sort((a, b) => a.createdAt - b.createdAt);
  const an = new Anonymiser();
  an.learn(list.map((n) => n.text));
  const first = list[0]?.createdAt ?? Date.now();
  const entries = list.map((n, i) => {
    const day = Math.max(0, Math.round((n.createdAt - first) / 86400000));
    const where = n.scene ? ` · written at "${n.scene}" (a place in a contemplative game)` : "";
    return `Entry ${i + 1} · day ${day}${where}\n${an.scrub(n.text.trim())}`;
  });
  const text = `I keep a private journal of the heart while playing Inward Journey, a contemplative game about the 22 archetypes of mind, body and spirit. Below are my entries, oldest first. They have been anonymised: names and places appear as [name A], [name B]…; contact details, numbers and dates are removed; "day N" counts days since my first entry. Some entries are questions I asked the game's oracle, with its reflection.

Please read them as a whole and give me a gentle overview of my journey:
1. The main themes and what seems to matter most to me.
2. How things have moved or changed over time, from the first entries to the latest.
3. Recurring feelings, patterns or questions.
4. Strengths and moments of growth you notice.
5. What seems to be asking for my attention now.
6. Three questions I could sit with next.

Write warmly and plainly, as a mirror rather than an authority. Do not diagnose, do not give medical or legal advice, and do not try to work out who I or anyone named is. If something suggests I may be in danger, gently point me to people or services who can help.

My entries:

${entries.join("\n\n")}`;
  return { text, names: an.count };
}
