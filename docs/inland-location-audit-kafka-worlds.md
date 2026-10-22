# Inland — Location Audit & Kafka Worlds (DRAFT)

**Purpose:** every location in the game, its style, what narration it has, and what's
missing — plus the Kafka-style worlds that don't exist yet. Built from a full read
of the Animation repo on 2026-10-22. Kafka proposals are **DRAFT** (protocol:
nothing goes to Opus as a Draft).

**Style of the whole game (the bar every new world must meet):** night baseline —
deep blues, golds, embers; geometric sanctuaries (circles, pillars, spirals,
cubes, arches, rings); velvet starlit night that is safe, never threatening;
no fail states, no timers, no scores; audio-led; reflection, not instruction;
3–5 colors per scene; no religious iconography from any specific tradition.
Kafka worlds keep all of this — their strangeness comes from polite
impossibility and waiting, never from fear or threat.

---

## 1. Locations that exist

### The journey spine (Acts I–III)

| Location | Style | Narration | Status |
|---|---|---|---|
| The Shore (spawn) | Night sand, dark water, figure of light | J01 The Shore (female, cues in narration.json) | ✅ Covered |
| The Crossing | Open dark water, island lights mid-crossing | J02 The Crossing (male, cues) | ✅ Covered |
| Arrival (island sand) | First landfall | J03 Arrival (female, cues) | ✅ Covered |
| The Return (swim home) | Same shore, sky a fraction brighter, small star | J11 The Return (female, cues) | ✅ Covered |

### The seven stations (Act II, spiral path, any order)

| Station | Geometry | Narration | Status |
|---|---|---|---|
| I The Magician | Vertical beam, gold ring at midpoint | J04 (male, cues) | ✅ Covered |
| II The High Priestess | Two dark pillars, mist veil, pale crescent | J05 (female, cues) | ✅ Covered |
| III The Empress | Spiral path of glowing garden beds, vines of light | J06 (male, cues) | ✅ Covered |
| IV The Emperor | Dark stone cube throne on pale square | J07 (female, cues) | ✅ Covered |
| V The Hierophant | Archway of three stones, shimmering air | J08 (male, cues) | ✅ Covered |
| VI The Lovers | Two intersecting rings, crossing paths, bright star | J09 (female, cues) | ✅ Covered |
| VII The Chariot | (per stations.json; geometry in repo) | J10 (male, cues) | ✅ Covered |

### Temple-tour clearings (sites.ts — the tour stops)

Shore, Igloo, Garden, Galaxies, Desert, Tree, Tree Station, Atoms, Other Worlds,
Greetings. Tour narration: **TEMPLE — "One Road, Twenty-Two Stations"**
(105 cues, narration.json). Style: clearings chosen by the land itself, lessons
arrive as guests, 300 m+ from any archetype hearth.

### Densities (rooms 0–7)

Eight rooms (`room_0.ts`–`room_7.ts`) + monument. Audio: `density_1`–`density_7`
+ `the_beginning` (8 files, public/audio/densities/). **Densities-area cinematics:
7 files WITH cue sheets** (densities-area-cine-1..7) — the only area besides
wanderer/ancient-civs/duat with timed `.cues.json` files.

### Adept areas (8 scenes)

Call, Crucible, Disciplines, Monument, Others, Pyramids, Radiance, Stones.
Audio: 7 files (`adept_1_the_call`, `adept_2_the_crucible`,
`adept_3_the_radiance`, `practice_disciplines`, `practice_others`,
`practice_pyramids`, `practice_stones`) — **no cue sheets**.

### Past civilizations (5 scenes)

Atlantis, Egypt, Maldek, Mars, Monument. Audio: 4 files in `past/` —
**verify which scene the 4th file covers; Monument narration unconfirmed.**

### Duat

One narration (`duat-narration.mp3`) **with cue sheet**. Scene: `duat/`
(4.3 MB area audio).

### Orbs & groves (Voices episodes placed in the world)

7 orbs + 12 grove episodes = 19 MP3s (`public/audio/orbs/`), transcripts in
`content/transcript_orbs.json`. **No timed cue sheets** (transcripts only).

### Wanderer area

7 cinematics **with cue sheets** (wanderer-cine-1..7). Covered.

### Ancient civilizations

6 files **with cue sheets** (atlantis + related). Covered.

### Lessons (temple tour)

L03 The Untying, L04 Without Price, L05 The Fire in the Hand, L06 What Is,
L07 The Dark and the Lantern — 5 MP3s, cues embedded in narration.json.

### Dialogues & Q&A (the 22 figures)

- **Dialogues:** 176 MP3s (22 figures × 8 prompts: who/teach/life/
  lost/afraid/still/bright/radiant), transcripts in `content/dialogues.json`.
- **Archetype Q&A:** 66 MP3s (`archetype_qa/`), transcripts in
  `content/archetype_qa.json`. **No timed cue sheets for either set.**

### Passages (road between stations)

21 MP3s, transcripts in `content/passages.json`. **No timed cue sheets.**

### Rites

74 MP3s: 22 figures × 3 + 8 synth. **No timed cue sheets; scene wiring
unconfirmed** (which rite plays where).

### Contact, eggs, standalone, opening

- Contact: 4 (worlds, disclosure, reaching out, quartz). No cues.
- Eggs (Easter-egg narrations): 3 (Easter Island, grey pyramid, Maya calendar).
  No cues; trigger wiring unconfirmed.
- Standalone visions: 3 (atoms, other-worlds, greetings) — the three vision
  scenes in sites.ts.
- Opening: 8 files named `1.mp3`–`8.mp3`. **Wiring unclear — flag.**

### Sanctuary (temple building) — IN PROGRESS

Northern island terrace. Gestural building mode (prompt already sent to Opus):
draw with finger, stone-essence from rock meditation, gold-essence from heart
notes. No narration yet by design — the temple is a mirror, not a reward.

### Home

Sunrise-lake home (the game's home base in the Inland framing; the Shore is
its in-repo anchor). Gentle piano, minimal UI.

---

## 2. Confirmed gaps — flagged work

These are verified from file listings, not guesses:

1. **Cue sheets missing for most voiced content.** Only densities-area,
   wanderer-area, ancient-civs, and duat have `.cues.json` files. Missing:
   orbs (19), rites (74), adept (7), densities (8), contact (4), eggs (3),
   standalone (3), opening (8), passages (21), dialogues (176), archetype Q&A
   (66). Journey tracks + lessons carry cues inside `content/narration.json`
   instead — that pattern works; the question is whether the rest get timed
   cues or stay transcript-only.
2. **Body station — BLOCKED** (v5 item 1): audio + script ready, station design
   is the owner's to spec. No narration gap — a design gap.
3. **Past/Monument narration unconfirmed** (4 audio files for 5 scenes).
4. **Opening audio (8 files, generic names) — wiring unclear.**
5. **Rites + eggs trigger wiring unconfirmed.**
6. **Tree Station position marked TEMP-VERIFY** in `sites.ts` (harness sets final).
7. **`female/` directory is empty** — leftover placeholder.
8. **No Kafka register at all** (section 3) — the emotional range of
   stuckness-by-system is unbuilt.

---

## 3. Kafka worlds — DRAFT proposals

Why Kafka belongs here: Inland already teaches "where we get stuck" as plain
human observation. Kafka is the literature of stuckness — not horror, but the
ordinary made strange: polite systems that cannot be satisfied, doors that
don't open, guilt with no charge, goals that recede. These worlds let a player
*feel* a blockage instead of being told about it — and each one resolves the
Inland way: not by defeating the system, but by a different move than the
system demands.

All seven use the game's palette and geometry. All keep "night is safe."

### K1. The Waiting Room (from "Before the Law")

- **The Kafka device:** a man waits his whole life before a door, told "not
  yet" by a polite keeper. The door was meant only for him.
- **In Inland:** a quiet round room, one door of warm light, one keeper
  (a seated figure of light) who smiles and says "not yet" — kindly, never
  mocking. Nothing else happens. The room is beautiful; waiting is the whole
  activity.
- **The turn:** the door opens the moment the player stops asking the keeper
  and walks to it. The keeper bows. The door was never locked.
- **Stuck layer:** permission — waiting for someone else to authorize your life.
- **Needs:** one short narration (the keeper's line + the realization),
  one scene, no cues yet.

### K2. The Corridor of Doors

- **The Kafka device:** endless offices, endless doors, each opening onto the
  same corridor.
- **In Inland:** a long, calm corridor of identical pale doors. Every door
  opens onto the same corridor, a little further along. Soft carpet-light,
  no sound but footsteps.
- **The turn:** stop opening doors. Stand still. The corridor itself lights
  up — it was the destination, not a passage.
- **Stuck layer:** seeking — the belief that the answer is in the next room.
- **Needs:** scene + a short narration. No cues yet.

### K3. The Castle on the Hill

- **The Kafka device:** a village beneath a castle the surveyor approaches
  forever and never enters; officials, messages, endless deferral.
- **In Inland:** a castle of pale geometry on a hill, visible from everywhere
  in this area. Walk toward it and it recedes, gently, without malice. A
  villager offers tea. Messages arrive, politely, saying "tomorrow."
- **The turn:** turn around. The village behind you — small lights, warm
  windows — was home all along. The castle waves back, kindly, as you leave.
- **Stuck layer:** aspiration — the goal that recedes because it was never
  the goal.
- **Needs:** scene + narration. No cues yet.

### K4. The Office (from "The Trial")

- **The Kafka device:** accused of a crime never named; kind clerks, endless
  files, a court that is everywhere and nowhere.
- **In Inland:** a quiet office. A clerk with a file — your file — asks you to
  explain yourself. No charge is ever stated. The clerk is patient, even
  fond. The file is blank when you finally look.
- **The turn:** stop defending. Say "there is nothing to explain." The clerk
  closes the file, smiles, and the office becomes an ordinary room.
- **Stuck layer:** guilt and self-judgment — the shadow the Oracle Brain
  already names, felt rather than explained.
- **Needs:** scene + narration (the clerk's questions + the blank file).
  No cues yet.

### K5. The Burrow

- **The Kafka device:** a creature builds an elaborate burrow for safety, then
  lives in fear of an unseen intruder that may not exist.
- **In Inland:** a beautiful, intricate burrow — tunnels of soft light you
  built yourself. Somewhere in it, a faint sound. You check every tunnel.
  Nothing is ever there.
- **The turn:** leave by the front entrance. Outside, the night is quiet and
  nothing was ever hunting you. The burrow remains — a place, not a prison.
- **Stuck layer:** survival mode — safety built from fear becoming a cage.
- **Needs:** scene + narration. No cues yet.

### K6. The Metamorphosis Room

- **The Kafka device:** waking transformed; the body a stranger; family as
  judges at the doorway.
- **In Inland:** a room of tall mirrors. Your figure of light changes form
  as you walk past — taller, smaller, winged, root-like. Silhouettes watch
  from a doorway, neither kind nor cruel. The watcher in the mirror never
  changes.
- **The turn:** the forms keep changing; the one watching them doesn't.
  That one is you.
- **Stuck layer:** body and identity — pairs with the Body station and the
  body-healing narration.
- **Needs:** scene + narration. No cues yet.

### K7. The Machine That Writes (from "In the Penal Colony," softened)

- **The Kafka device:** a machine that writes the sentence on the body.
- **In Inland, softened to the game's register:** a quiet device that etches
  one word at a time onto a stone tablet. The word is always the same:
  "yours." No body, no pain — stone only. The machine hums, patient.
- **The turn:** lift the stylus. The machine stops. The tablet reads, in full:
  "yours — the sentence you were writing to yourself." You set the tablet
  down and walk on.
- **Stuck layer:** self-sentencing — the judgments we write and re-read.
- **Needs:** scene + narration. No cues yet. (Handle with the softest touch;
  if it reads as dark in playtest, cut it first.)

### What the seven add up to

Together they cover the stuck layers the current game only names: survival
fear (Burrow), guilt (Office, Machine), seeking (Corridor), permission
(Waiting Room), aspiration (Castle), body/identity (Metamorphosis Room).
They are the missing emotional register — stuckness that is procedural and
faceless, resolved by stopping, turning, or setting down rather than by
winning.

---

## 4. Tracking

Per protocol, the Kafka worlds enter as **DRAFT** items. When the owner
confirms any of them, each becomes a batch item with its own row (Draft →
Ready → Deployed to game) and its own narration + cue sheet requirement.
The confirmed gaps in section 2 are triage items, not batch items, until the
owner says which to work on.
