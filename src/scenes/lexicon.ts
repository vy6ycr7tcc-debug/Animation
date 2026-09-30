/* The lessons' visions told in more images (the owner: "simpler stuff, but more of it in the
   storytelling"): between the moments placed by hand (each lesson's own keys), the narration's own
   lines (content/narration.json, timed cues) call up a simple symbol when they name one: a hand,
   first the widely known sign for a concept (a broken chain for forgiveness, a lotus for peace, a
   butterfly for change, an anchor for hope, an ensō for presence…), else what it names: a hand,
   a door, a flame, a heart, a breath, footsteps, an eye, an ear, a river, rain, the sun, stars,
   a tree, a knot, a bird, an hourglass, a tangle of worry, a stone, a bowl, a gift… Each image
   holds at least `MIN_GAP` seconds and never crowds a moment placed by hand. */
import { TRACKS } from "../core/narration";
import { book, heart, river, rock, rope, shift, sprout, stars, storm, sun, tree, wheel, FORM_H } from "../world/forms";
import { anchor, bird, bridge, brokenChain, butterfly, compass, crescent, doorway, dove, ear, enso, eye, fist, flames, footsteps, hand, hourglass, house, infinity, key, lotus, mountain, offeredHand, prayerHands, raisedHand, rings, spiral, steamingBowl, tangle, teardrop, unalome, wave, yinYang } from "../world/symbols";
import { EMBER, GOLD, PALE, PEARL, ROSE, type Key, type Maker, type RGB } from "./visionStage";

const MIN_GAP = 9; // seconds each image holds, at least
const CLEAR = 7; // seconds kept clear before and after a moment placed by hand

/** Words in a line → the symbol it calls up (the first match wins; order matters). */
const WORDS: [RegExp, string, RGB][] = [
  // concepts first, by their widely known symbol
  [/\b(forgiv|release|releas|untie|untying|let go|letting go|set down)/i, "lex-chain", GOLD],
  [/\b(peace|peaceful|calm|serene|awake|awaken)/i, "lex-lotus", PEARL],
  [/\b(dove|gentle|gentleness|kindness|kind)\b/i, "lex-dove", PEARL],
  [/\b(balance|both sides|two sides)/i, "lex-yinyang", PALE],
  [/\b(change|changes|transform|become|becoming)/i, "lex-butterfly", ROSE],
  [/\b(hope|trust|faith|anchor)/i, "lex-anchor", GOLD],
  [/\b(always|forever|never ends|endless|eternal)/i, "lex-infinity", PEARL],
  [/\b(grateful|gratitude|thank|bless)/i, "lex-prayer", GOLD],
  [/\b(steady|steadies|strength|strong|stand firm)/i, "lex-mountain", PEARL],
  [/\b(feel|feeling|feelings|emotion|tide)/i, "lex-wave", PALE],
  [/\b(sleep|rest|resting|evening|moon)/i, "lex-moon", PALE],
  [/\b(understand|answer|secret|unlock|meaning)/i, "lex-key", GOLD],
  [/\b(direction|lost|find your way|which way)/i, "lex-compass", PALE],
  [/\b(connect|between|bridge|reach across)/i, "lex-bridge", GOLD],
  [/\b(whole|wholeness|empty|emptiness|present|presence)/i, "lex-enso", PEARL],
  [/\b(path|practice|teaching|way of)/i, "lex-unalome", GOLD],
  [/\b(grief|tears|cry|crying|sorrow|sad)/i, "lex-tear", PALE],
  [/\b(home|house|belong)/i, "lex-house", GOLD],
  [/\b(fist|clench|grip|grasp|tight)/i, "lex-fist", EMBER],
  [/\b(stop|refus|push(ed|ing)? away|no\b)/i, "lex-raised", PALE],
  [/\b(gift|give|giving|offer|share)/i, "lex-offer", GOLD],
  [/\b(hand|hands|palm|palms|fingers)\b/i, "lex-hand", GOLD],
  [/\b(door|doors|threshold|guest|welcome)/i, "lex-door", GOLD],
  [/\b(coal|fire|flame|burn|heat|hot|warm)/i, "lex-flame", EMBER],
  [/\b(heart|chest|love|tender)/i, "lex-heart", ROSE],
  [/\b(breath|breathe|breathing|exhale|inhale)/i, "lex-breath", PALE],
  [/\b(walk|walking|step|steps|road|path|journey)/i, "lex-steps", PALE],
  [/\b(see|look|watch|eyes?|notice)\b/i, "lex-eye", PEARL],
  [/\b(listen|hear|heard|sound|quiet|silence)/i, "lex-ear", PALE],
  [/\b(river|water|flow|stream|sea|ocean)/i, "lex-river", PALE],
  [/\b(rain|storm|wind|weather)/i, "lex-storm", PALE],
  [/\b(sun|morning|dawn|light)\b/i, "lex-sun", GOLD],
  [/\b(star|stars|night|sky)\b/i, "lex-stars", PEARL],
  [/\b(tree|branch|leaf|leaves|root)/i, "lex-tree", GOLD],
  [/\b(seed|grow|growing|sprout)/i, "lex-sprout", GOLD],
  [/\b(knot|rope|tie|tied|bound)/i, "lex-knot", EMBER],
  [/\b(free|freedom|fly|bird|wings?)\b/i, "lex-bird", PEARL],
  [/\b(time|moment|now|minute|hour|clock)\b/i, "lex-time", PEARL],
  [/\b(worry|worried|thought|thoughts|mind|think)/i, "lex-tangle", PALE],
  [/\b(stone|rock|weight|heavy|carry|burden)/i, "lex-stone", PEARL],
  [/\b(cup|soup|bowl|meal|bread|tea)/i, "lex-bowl", GOLD],
  [/\b(wheel|turn|turning|circle|again)/i, "lex-wheel", GOLD],
  [/\b(ledger|book|count|score|write|written|list)/i, "lex-book", PALE],
  [/\b(yourself|inward|within|inside)\b/i, "lex-spiral", ROSE],
  [/\b(together|people|everyone|neighbou?rs?|friends?|others)\b/i, "lex-flames", GOLD],
];

/** The symbols the lexicon may call up (added to a lesson's own forms). */
export const LEXICON: Record<string, Maker> = {
  "lex-chain": (n, R) => brokenChain(n, R),
  "lex-lotus": (n, R) => lotus(n, R),
  "lex-dove": (n, R) => dove(n, R),
  "lex-yinyang": (n, R) => yinYang(n, R),
  "lex-butterfly": (n, R) => butterfly(n, R),
  "lex-anchor": (n, R) => anchor(n, R),
  "lex-infinity": (n, R) => infinity(n, R),
  "lex-prayer": (n, R) => prayerHands(n, R),
  "lex-mountain": (n, R) => mountain(n, R),
  "lex-wave": (n, R) => wave(n, R),
  "lex-moon": (n, R) => crescent(n, R),
  "lex-key": (n, R) => key(n, R),
  "lex-compass": (n, R) => compass(n, R),
  "lex-bridge": (n, R) => bridge(n, R),
  "lex-enso": (n, R) => enso(n, R),
  "lex-unalome": (n, R) => unalome(n, R),
  "lex-tear": (n, R) => teardrop(n, R),
  "lex-house": (n, R) => house(n, R),
  "lex-fist": (n, R) => fist(n, R),
  "lex-raised": (n, R) => raisedHand(n, R),
  "lex-offer": (n, R) => offeredHand(n, R, 0.25),
  "lex-hand": (n, R) => hand(n, R, 1, FORM_H * 0.5, 1.2),
  "lex-door": (n, R) => doorway(n, R, 1),
  "lex-flame": (n, R) => flames(n, R, 1),
  "lex-heart": (n, R) => heart(n, R, 1.1),
  "lex-breath": (n, R) => rings(n, R, 4),
  "lex-steps": (n, R) => footsteps(n, R),
  "lex-eye": (n, R) => eye(n, R),
  "lex-ear": (n, R) => ear(n, R),
  "lex-river": (n, R) => river(n, R),
  "lex-storm": (n, R) => storm(n, R, 0.3),
  "lex-sun": (n, R) => sun(n, R),
  "lex-stars": (n, R) => stars(n, R),
  "lex-tree": (n, R) => tree(n, R, 0.47),
  "lex-sprout": (n, R) => shift(sprout(n, R, 1.6), 0, 0, 0, 1.5),
  "lex-knot": (n, R) => shift(rope(n, R, 1.9, 0, 0), 0, 2.3, 0, 1.6),
  "lex-bird": (n, R) => bird(n, R, FORM_H * 0.6, 0.3),
  "lex-time": (n, R) => hourglass(n, R, 0.5),
  "lex-tangle": (n, R) => tangle(n, R),
  "lex-stone": (n, R) => rock(n, R, 1.2, 0.8, 1.0, FORM_H * 0.3),
  "lex-bowl": (n, R) => steamingBowl(n, R),
  "lex-wheel": (n, R) => wheel(n, R),
  "lex-book": (n, R) => shift(book(n, R), 0, 0.9, 0, 1.2),
  "lex-spiral": (n, R) => spiral(n, R, 3),
  "lex-flames": (n, R) => flames(n, R, 7),
};

/** The lesson's own keys, and between them more images from its narration's words. */
export function withLexicon(trackId: string, keys: Key[]): Key[] {
  const cues = TRACKS[trackId]?.cues ?? [];
  const placed = [...keys].sort((a, b) => a.t - b.t);
  const out: Key[] = [...placed];
  let last = -Infinity;
  let lastForm = "";
  for (const c of cues) {
    if (c.t - last < MIN_GAP) continue;
    if (placed.some((k) => Math.abs(k.t - c.t) < CLEAR)) continue;
    const hit = WORDS.find(([re]) => re.test(c.text));
    if (!hit || hit[1] === lastForm) continue;
    // don't repeat the image a moment placed by hand is already showing
    const current = [...placed].reverse().find((k) => k.t <= c.t);
    if (current && LEXICON[hit[1]] && current.form === hit[1]) continue;
    out.push({ t: c.t, form: hit[1], tint: hit[2], dur: 3.5 });
    last = c.t;
    lastForm = hit[1];
  }
  return out.sort((a, b) => a.t - b.t);
}
