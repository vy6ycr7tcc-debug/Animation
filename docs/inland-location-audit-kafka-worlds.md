# Inland — Complete Location & Build Reference v2 (SUPERSEDES v1 audit)

**Status:** Sections 1–3 are REFERENCE (verified against the repo on 2026-10-22).
Section 4 (Kafka worlds) is **DRAFT** — nothing in it goes to build until the
owner confirms it, per the nothing-gets-lost protocol. When a Kafka world is
confirmed, it enters the feedback batch as its own row (Draft → Ready →
Deployed to game) with its own narration + cue-sheet requirement.

**How Opus must use this document.** Read it in order: §1 (the rules) first,
then §2 (the world as it stands), then §3 (what is missing), then §4 (what is
proposed). Before building anything, also read the standing docs — they are
not repeated here in full and they still bind:
`docs/style/STYLE_GUIDE.md`, `docs/style/VISUAL_QUALITY.md`,
`docs/style/ANIMATION_QUALITY.md`, and the standing performance directives.
Verify every new scene visually with real `?shot=<sceneId>&t=<seconds>` stills
(`window.__shotReady`); a passing typecheck or build is NOT verification.
Mobile Safari is first-class. If a scene cannot be verified in a real browser
frame, it is not done.

**Status key used throughout:** ✅ covered · ⚠ partial · ❌ missing ·
🚧 in progress · 📝 DRAFT (proposal only).

---

## 1. The game's operating system

### 1.1 Design pillars (non-negotiable, from GAME_PROMPT.md §2)

1. **Easy.** No fail states, no timers, no scores, no enemies, no way to lose.
   Movement is slow walking and gentle swimming. Anyone can finish it,
   including someone who has never played a game.
2. **Art as a door, not a lecture.** Never preach, never explain the
   metaphysics at length. Invite. Suggest. Leave space.
3. **Geometry-forward.** Stations and worlds are pure geometric sanctuaries —
   circles, pillars, spirals, cubes, arches, intersecting rings. Abstract,
   universal, inviting. No religious iconography from any specific tradition.
4. **Audio-led.** Narration plays on arrival at story beats and stations.
   Ambient water and soft tones sit underneath. The player can linger as long
   as they want; nothing rushes them.
5. **Reflection, not instruction.** Each station ends its narration with a
   single quiet question. The player answers only to themselves. An optional
   private journal (stored locally, never uploaded) can hold their thoughts.
6. **Night is safe here.** Darkness in this game is velvet, starlit, calm —
   never threatening. This rule binds the Kafka worlds too: strange, never
   scary.

### 1.2 Palette — the actual values (from STYLE_GUIDE.md, distilled from code)

The canon is **deep blues, golds, embers**. Use these values, don't approximate.

**Night baseline** (`src/world/moods.ts`, the NIGHT mood — the game's home key):
- Sky zenith `(0.016, 0.022, 0.072)`, mid `(0.038, 0.043, 0.12)`,
  horizon `(0.105, 0.1, 0.22)`
- Fog color = horizon `(0.105, 0.1, 0.22)`; moon-glow in haze `(0.55, 0.42, 0.34)`
- Hemisphere sky `(0.48, 0.53, 0.82)`, ground `(0.13, 0.1, 0.21)`, intensity `0.85`
- Key "star" light `(1.8, 1.58, 1.33)` — warm white, never pure white

**Gold accents** (the game's signature light):
- Rings: `0xffd700`; path lamps: `0xffe6a0`
- Bark grain: `(1.0, 0.78, 0.48)` alternating with pale blue `(0.75, 0.85, 1.0)`
- Etched stone lines: `#e9c37d`; rock etch `#d8b8ff`

**Cool lights:** light beams `0xb8d1ff`; starlight rim on bark `(0.3, 0.38, 0.8)`;
leaf/canopy bands gold `(1.0, 0.8, 0.5)` → pale blue `(0.7, 0.85, 1.0)` →
pink `(1.0, 0.7, 0.88)`.

**Crystals:** core blends blue `(0.45, 0.55, 1.0)` → pink `(1.0, 0.72, 0.92)` by
per-instance hue; rainbow split via `spectrum()`; starlight glint
`(1.0, 0.95, 0.9)` × 2.5.

**Dark surfaces:** bark base near-black with blue lift; stone `#1c1a2c`; fog
shadow grade lifts blacks to `(0, 0.01, 0.04)`.

**Mood travel:** 9 moods (night, sunrise, sunset, deep, twilight, golden, dusk,
ember, dawn) shift sky/fog/light per direction of travel. New scenes inherit
the Moods system; do NOT hardcode a competing sky.

**Rule:** 3–5 colors per scene, analogous or complementary. New hues must be
justified by the fiction, never decorative.

### 1.3 Material idioms (code recipes, condensed)

- **Bark / organic solids** (`src/world/creation.ts`): `MeshBasicNodeMaterial`
  (NOT MeshStandardMaterial) with hand-rolled TSL lighting. Near-black
  blue-tinted base; normal-map relief fading out beyond 25–60 m; grain as fine
  light lines spiraling; light flowing down the trunk; thin starlight rim;
  crown sway ∝ height²; hash-discard dissolve closer than ~0.6–2.2 m so bark
  never becomes a wall in front of the lens; fog mixed manually at the end.
  Geometry: `grow(SHAPES[k], seed)` → `tubes()` (CatmullRom limbs, flare at
  base, 4–8 sides by thickness).
- **Crystals:** `prismGeometry()` — six-sided column, pointed tip,
  flat-shaded. Instanced additive material, DoubleSide. Colored core + rainbow
  fresnel split drifting slowly + light rising through the stone + hard
  starlight glint.
- **Stone:** dark `#1c1a2c` with thin gold etched lines `#e9c37d`.
- **Water:** simple shader with moving reflections of the star and stations.
  A 110-second seamless water bed loops under everything.
- **Light:** soft bloom, drifting mist, slow particles (motes, fireflies of
  light). Mood comes from light, not polygon count. Low-poly is fine.

### 1.4 The player, the camera, the interaction vocabulary

- **The player** is a small, simple figure of light — soft glow, no face, no
  gender. Think the kneeling figure from the companion film: minimal,
  luminous, calm.
- **Movement:** slow walking, gentle swimming. The crossing is slow and
  buoyant — the water holds the player.
- **Camera:** slow follow, slightly high; never shaky; transitions between
  areas are slow dissolves, not cuts.
- **UI:** nearly invisible. No HUD. Interaction prompts are single fading
  words ("sit", "listen", "walk"). The journal is one quiet button.
- **Interaction verbs in the game today:** walk, swim, sit (slows time),
  listen (narration on approach), hold-tap to meditate (see §1.5), gestural
  temple building (see §1.6), journal (local only).
- **The oracle** (game integration pending — the game is not yet wired to the
  live Oracle): when wired, the question travels, the answer returns, nothing
  is kept or sold or linked, no accounts. Voice rules: always "you," never
  "the seeker"; archetypes named only when they crystallize; flowing prose,
  no bullets/lists/headings/bold in answers; sources never spoken.

### 1.5 The meditation sequence (shipped spec)

Tap-and-hold on ground, trees, or rocks → screen fades to black → a
minimalist body outline appears in the darkness, lungs animating the square
breath (in 4, hold 4, release 4, rest 4) as the visual metronome → guidance
audio (Aria, rotating clips, intimate volume, ambient ducked) → after a full
cycle, fade back → avatar stands up → world in "contemplative view" → heart
icon blinks a couple of times in case the player wants to write a note. Early
release fades everything out cleanly (no contemplative view, no heart blink).
**No energy-system visuals** — just the body outline and the breathing lungs
(Oct 17 decision: no chakra/energy-center terminology anywhere; the concept
is expressed as plain human layers and blockages only).

### 1.6 Temple building — gestural mode (🚧 in progress with Opus)

Hold on ground → building mode. Draw gestures recognized by a rule-based
$1-Unistroke-style classifier: line → wall, big circle → ring wall, small
circle → pillar, spiral → spire, dot/tap → orb of light. Unrecognized
strokes dissolve quietly. Tap to select (soft glow + base ring), drag to
move (weighted), two-finger vertical drag to lift, two-finger twist to
rotate. Touch on empty ground still orbits the camera — building mode never
hijacks it. No scale in v1. Stone-essence forms from rock meditation;
gold-essence is forged from heart notes, and gold forms remember their note
(tap reopens it). Forms grow with the breathing rhythm and dissolve back
into essence on release. Sanctuary = quiet terrace on the northern island.
On-device persistence only. **The one rule: the temple is a mirror, not a
reward — no counts, unlocks, fanfare.**

### 1.7 Audio rules (from GAME_PROMPT.md §5, binding on all new content)

- Narration ducks (never mutes) the ambient bed; sidechain-style automation.
- If the player leaves mid-narration, fade out gently — never cut.
- All narration gets subtitles (toggleable, on by default).
- Loop-safe: replaying a station replays its narration from the start.
- Voices: warm female (Aria) and smooth male (Miles), alternating by island,
  at a slow contemplative pace. Narration audio is Aria at speed 92 unless
  the spec says otherwise.
- **Every narration item ships with timed cue sheets** (`[{"t": seconds,
  "text": "line"}]`) before its build prompt goes out — same shape as
  `content/narration.json`. No narration merges without its cue sheet.

### 1.8 Language rules (binding, owner decisions)

- **Mainstream human language.** The game is a place, not a lesson.
  Philosophy underneath, never announced.
- **No new-age terminology.** No chakras, no energy centers, no "rays."
  The layered map of a life is expressed as plain observation: survival →
  self → belonging → love → truth → inner seeing → wholeness; the work is
  always at the lowest blocked layer. (Oct 17 decision; enforced across the
  Oracle Brain, all narrations, all prompts, and the game spec.)
- **No named channeled entities, archives, sessions, or dates in spoken
  content.** Spoken attribution only "cosmic wisdom" where attribution is
  needed at all.
- **Tagline:** "A world of night and light." The owner's definition of the
  game: "a place where your spirit can be free to ask any question and
  explore who it wants to be — explore its biases and let it be who it seeks
  to be without judgment."

---

## 2. Location catalog — exhaustive

Every location below gives: scene file, position (where the code states one),
geometry, palette/materials, interaction, narration (file, voice, cue state),
and status. File paths are repo-relative unless marked `~/workspace`.

### 2.1 The journey spine (Acts I–III)

**The Shore — spawn.** Scene: `src/scenes/shore.ts`. A night shore; the
player awakens as a small figure of light. Movement tutorial: walk along the
sand. Narration: **J01 The Shore** (female, 0:46, cues in narration.json),
file `public/audio/J01_the_shore.mp3`. Status: ✅.

**The Crossing.** Open dark water between the home shore and the island.
Narration begins when the player starts swimming: **J02 The Crossing**
(male, 0:41, cues), `public/audio/J02_the_crossing.mp3`. The crossing is slow
and buoyant; halfway across, the island's lights become visible. Status: ✅.

**Arrival.** The island sand. **J03 Arrival** (female, 0:45, cues),
`public/audio/J03_arrival.mp3`. Status: ✅.

**The Return.** After visiting all seven stations, a path of light opens
back to the water. **J11 The Return** (female, 0:39, cues). The shore the
player returns to is the same shore — but the sky is a fraction brighter,
and the figure of light carries a small star. Ending card: "The water will
always be here." Then free roam, or rest. Status: ✅.

**Home — the sunrise-lake home.** The game's home base in the Inland framing
(sunrise lake, gentle piano, minimal UI). In-repo anchor: the Shore.
Status: ✅ as framing; the sunrise mood exists in the Moods system.

### 2.2 The seven stations (Act II — spiral path, any order)

Positions are from `content/stations.json` (x, z on the island plane).
Essence, geometry, and closing question are quoted from that file.
Interactions are from GAME_PROMPT.md §4. All seven narrations carry timed
cues inside `content/narration.json`.

**Station I — The Magician (Matrix of the Mind).** Position (-6, -124).
Essence: "Intention; the beginner's mind, reaching." Geometry: a vertical
beam of light joining sky and earth, with a thin gold ring (`0xffd700`)
floating at its midpoint. Interaction: stepping into the ring brightens the
beam; faint particles rise. Narration: **J04** (male, 0:40, cues),
`public/audio/J04_the_magician.mp3`. Closing question: "What am I truly
reaching for?" Status: ✅.

**Station II — The High Priestess (Potentiator of the Mind).** Position
(-22, -138). Essence: "Stillness and intuition; answers rise in silence."
Geometry: two dark pillars with a veil of slow mist between them; a crescent
of pale light above. Interaction: a "sit" prompt — sitting slows time, the
mist parts slightly, stars emerge. Narration: **J05** (female, 0:48, cues),
`public/audio/J05_the_high_priestess.mp3`. Question: "What begins to
surface?" Status: ✅.

**Station III — The Empress (Catalyst of the Mind).** Position (-20, -160).
Essence: "Catalyst; life as the teacher that changes you." Geometry: a spiral
path of softly glowing garden beds; vines of light climb through the air.
Interaction: walking the spiral inward plays soft ascending tones; at the
center, a bloom of light opens. Narration: **J06** (male, 0:45, cues),
`public/audio/J06_the_empress.mp3`. Question: "What is it trying to give
you?" Status: ✅.

**Station IV — The Emperor (Experience of the Mind).** Position (-9, -169).
Essence: "Experience as a treasury; honouring what you have lived."
Geometry: a dark stone cube as a throne, set on a square of pale light.
Interaction: sitting on the throne reveals faint constellations overhead —
"memory stars." Narration: **J07** (female, 0:48, cues),
`public/audio/J07_the_emperor.mp3`. Question: "What have you made of me?"
Status: ✅.

**Station V — The Hierophant (Significator of the Mind).** Position
(18, -164). Essence: "The inner teacher; the watcher behind thoughts."
Geometry: an archway of three stones; the air beneath it shimmers faintly.
Interaction: walking through the arch sends a slow ripple outward and plays
a low warm tone. Narration: **J08** (male, 0:48, cues),
`public/audio/J08_the_hierophant.mp3`. Question: "What did you learn?"
Status: ✅.

**Station VI — The Lovers (Transformation of the Mind).** Position
(20, -140). Essence: "Choice and freedom; the crossroads of transformation."
Geometry: two large intersecting rings lying flat (vesica piscis), with two
paths crossing beneath a bright star. Interaction: the player chooses a
path — both paths curve and rejoin; there is no wrong choice. At the
crossing point, the rings pulse once, gently. Narration: **J09** (female,
0:52, cues), `public/audio/J09_the_lovers.mp3`. Question: "If I were free,
truly free, which way would my heart lean?" Status: ✅.

**Station VII — The Chariot (Great Way of the Mind).** Position (2, -187).
Essence: "Integration; the road was one road all along." Geometry: a small
vessel of light at the head of a long straight road running to the horizon.
Interaction: boarding the vessel. Narration: **J10** (male, 0:49, cues),
`public/audio/J10_the_chariot.mp3`. Closing line: "The way forward is the
way inward." Status: ✅.

### 2.3 Temple-tour clearings (sites.ts — the tour stops)

The tour stops where the land itself would hold a body kindly (dry, high,
or at the water's edge), each 300 m or more from any archetype's hearth, so
lessons arrive as guests and never crowd the houses. Tour narration:
**TEMPLE — "One Road, Twenty-Two Stations"** (female, 105 cues),
`public/audio/temple-tour.mp3` (file referenced as `audio/temple-tour.mp3`
in narration.json). Positions (x, z, y, heading) from `src/scenes/sites.ts`:

| Clearing | Scene file | Position | What it enacts |
|---|---|---|---|
| Shore | `src/scenes/shore.ts` | (-590, 900, 1.88) | The home shore; rope, disc, torus rim, hub (shore.ts geometry) |
| Igloo | `src/scenes/igloo.ts` | (2097.8, -1180.4, 19.76) | A vast low sun pouring itself out; a fountain whose water leaps from a spring that never stops; a ring of small lights; a candle at the end. Glass-folk seats (sit/reach) |
| Garden | `src/scenes/garden.ts` | (-1600, 1200, 4.21) | Smouldering earth where something was buried; coal (near-black, roughness 0.9); ember glow; a burst of light. The "buried/burn" lesson |
| Galaxies | `src/scenes/galaxies.ts` | (475.4, 1794.1, 13.59) | The galaxies lesson (L06 "What Is" / acceptance, enacted): a logarithmic spiral galaxy, inner parts turning faster; a warm heart point; rain of light; path of gold points |
| Desert | `src/scenes/desert.ts` | (2270.5, 175, 12.67) | A rutted sand plane (grain, ruts, edge falloff); a pole-and-arm marker; glow points; a glass folk walking; a framed structure (metal frame, dark wood) |
| Tree | `src/scenes/tree.ts` | (-2428.1, -1044.9, 19.35) | One tree, grown from `SHAPES[2]` (height 4.4, radius 0.16, 7 roots), bark material in gold/pale-blue grain. **Nothing else: no rings, no pillars, no discs** (the file's own rule) |
| Tree Station | `src/scenes/treeStation.ts` | (-1200, 1600, 5.0) | ⚠ **TEMP-VERIFY** — the file itself marks this position temporary; the harness sets the final one |
| Atoms | `src/scenes/atomsLight.ts` | (499.7, -16.6, 13.27) | Standalone vision: a body of light, larger and further than the other seats (clear radius 26 m) |
| Other Worlds | `src/scenes/otherWorlds.ts` | (-547.8, 368.1, 5.97) | Standalone vision: a body of light (clear radius 26 m) |
| Greetings | `src/scenes/greetings.ts` | (-241.4, -343.7, 5.41) | Standalone vision: a body of light (clear radius 26 m) |

Status: ✅ except Tree Station (⚠ TEMP-VERIFY).

### 2.4 Densities — rooms 0–7 (`src/scenes/densities/room_*.ts`)

Shared kit: `roomKit.ts` (skyDome, pointCloud, seeded random, keepAlpha).
Each room enacts its density as one arc following the fraction of the
narration heard. Audio: `public/audio/densities/` — `density_1`–`density_7`
+ `the_beginning` (8 files). **No timed `.cues.json` files for these 8.**

- **Room 0 — The Beginning.** Absolute darkness: the great sleep before the
  first dream, only the faintest breath in the black. A single point of light
  appears and chooses to move (the first freedom), a slow wandering curve
  with a thread of light behind it. The point warms to gold and beats like a
  heart, light spiralling into it (a direction, a wordless yes). Then light,
  all at once: twenty thousand lights pouring outward in every direction.
  Audio: `the_beginning.mp3`. Status: ✅.
- **Room 1 — First density: learning to be.** Black sand running down to an
  ocean that breathes; towers of basalt; a volcano pouring slow fire on the
  horizon (right third of the view); storm clouds gathering light but never
  breaking. No plant, no animal. Sparks of consciousness rest inside the
  stone; as the narration names them they wake, and lean, barely, toward the
  light: the first dream of movement. Audio: `density_1.mp3`. Status: ✅.
- **Room 2 — Second density: learning to grow.** A green world in early
  light: a meadow rolling away under a pale gold morning; trees growing in
  visible pulses of time; flowers turning their cups toward shafts of light
  as the light moves; a herd moving as one body along the far meadow; a
  flock wheeling overhead in one formation; pollen rising. Everything reaches
  upward. Audio: `density_2.mp3`. Status: ✅.
- **Room 3 — Third density: the great choice.** One room split down its
  length by a seam of white light running from the threshold to a neutral
  white door at the far end — the axis the rest of creation turns on. The
  seam takes a tint from whichever side you look toward. Stage left, service
  to others: a circle of people of glass light, each its own warm colour.
  (Stage right: service to self, per the file.) Audio: `density_3.mp3`.
  Status: ✅.
- **Room 4 — Fourth density: the world of love.** A luminous planet at its
  long gentle dusk: a plaza of pale stone and still water among crystalline
  towers whose light rises through them slowly; rings of glass turning in
  the air above them (a technology that serves wonder); a great ringed world
  low in a sky of soft veils. Its people are figures of glass light, each in
  its own colour, standing together, sitting, walking — and every one joined
  to every other. Audio: `density_4.mp3`. Status: ✅.
- **Room 5 — Fifth density: wisdom.** Owner direction (2026-10-01): "one
  magician on a pitch-black sky, glowing physics and formulas" (replaces the
  earlier thread-planet). Pitch black above, a dark polished floor below. At
  the heart, one figure of cool light stands; the narration is about the
  solitary seeker; wisdom is the light it learns to read. Audio:
  `density_5.mp3`. Status: ✅.
- **Room 6 — Sixth density.** Owner concept (2026-09-30, replacing the
  handover's "Merging"). Pitch black — the owner's one exception to the
  game's no-void rule. Countless points of light drift slowly, each a soul,
  each its own hue and breath. Then they flow back toward the centre: slowly
  at first, then with gathering inevitability, streams of light bending
  inward from every direction and spiralling as they come. At the centre
  they become one: a single point of light. Audio: `density_6.mp3`.
  Status: ✅.
- **Room 7 — Seventh density: foreverness.** Owner arc (2026-10-01): "open
  on galaxies, collapse inward into intense white, then resolve into the
  pitch black of creation." Opens in the dark among turning galaxies; as the
  telling goes on they fall inward, every point on its own delay, into one
  point ahead that grows into an intense white flooding everything; the
  white resolves into the pitch black of creation, where only the way home
  stands, a threshold of gold. All of it follows the fraction of the telling
  heard. Earlier text, kept: stepping through the sixth's white door is
  stepping out of form. Audio: `density_7.mp3`. Status: ✅.

**Densities-area cinematics** (`public/audio/densities-area/`):
7 cinematics (`densities-area-cine-1`–`7`), **each WITH a timed
`.cues.json` file** — the reference pattern for how cue sheets should work
everywhere. Status: ✅.

### 2.5 Adept areas (8 scenes, `src/scenes/adept/`)

The adept's school: its front door in the world, its lobby, and the walk
through its rooms — the three stations of the adept's path (the call, the
crucible, the radiance) and the four chambers of the ancient practices
(stones, pyramids and geometry, the daily disciplines, the others), and home
again. Outside, on levelled ground: a stepped tower of three terraces in
scanned sandstone, a stair climbing the middle of its face, a great quartz
crystal at its crown; on the terraces' front edges three small lights (the
three stations); at the four corners four low shrines, each crowned with its
practice's sign in light: a crystal, a small pyramid, and so on.

| Scene | Audio | Cues |
|---|---|---|
| `call.ts` | `adept_1_the_call.mp3` | ❌ none |
| `crucible.ts` | `adept_2_the_crucible.mp3` | ❌ none |
| `radiance.ts` | `adept_3_the_radiance.mp3` | ❌ none |
| `disciplines.ts` | `practice_disciplines.mp3` | ❌ none |
| `others.ts` | `practice_others.mp3` | ❌ none |
| `pyramids.ts` | `practice_pyramids.mp3` | ❌ none |
| `stones.ts` | `practice_stones.mp3` | ❌ none |
| `monument.ts` | (the school itself; no dedicated track) | — |

Status: ⚠ scenes and audio exist; timed cue sheets missing for all 7 tracks.

### 2.6 Past civilizations (5 scenes, `src/scenes/past/`)

- **Atlantis** (`past/atlantis.ts`): a marble jetty at the end of an old
  causeway, flags cracked, two columns standing, the sea wide and dark under
  a violet dusk. Bells, far out, felt more than heard: rings of light spread
  over the water from a glow beneath it. Then the island rises as it was,
  after Plato's plan: rings of land and water about a central hill, white
  terraces and houses lit sea-blue, a temple on the hill and a great crystal
  over it, crystal towers on the middle ring. Focused light: beams from the
  towers into the sky and between them. Then conditional service: the beams
  turn, light is drawn in from the rings to the centre, the outer rings
  dimming, the crystal swelling. Audio: `past_atlantis.mp3`. Status: ✅.
- **Egypt** (`past/egypt.ts`): the desert at night, a great pyramid ahead
  under the stars, casing pale, door facing the player. Light drawn from the
  ground around its base spirals up its faces and gathers in the chamber at
  its heart (seen through the stone, as a lens gathers light), where one
  small light lies still and is worked upon. A ruler throws the doors open:
  the door stone rises, warm light spills over the sand, people come from
  all sides and go in, and the stone sings (rings of light climbing the
  faces). He dies: the door sinks shut, a fence of dark pylons rises round
  the pyramid and grows taller. Audio: `past_egypt.mp3`. Status: ✅.
- **Maldek** (`past/maldek.ts`): audio `past_maldek.mp3`. Status: ✅
  (scene + audio; see file for its arc).
- **Mars** (`past/mars.ts`): audio `past_mars.mp3`. Status: ✅ (scene +
  audio; see file for its arc).
- **Monument** (`past/monument.ts`): ❌ **no audio file in `past/`** —
  confirmed gap (4 audio files for 5 scenes).

No timed cue sheets for any past audio. Shared kit: `past/kit.ts`.

### 2.7 Duat

Scene: `src/scenes/` duat area (audio folder `public/audio/duat/`, 4.3 MB).
Narration: **DUAT — The Duat** (female, 41 cues in narration.json),
`public/audio/duat/duat-narration.mp3`, **with a timed `.cues.json` file**.
Status: ✅ — the fully-covered pattern (audio + cues + transcript).

### 2.8 Orbs & groves (Voices episodes placed in the world)

Transcripts in `content/transcript_orbs.json`. These are interpretive
adaptations of channeled material, captioned as such in the game.
**No timed cue sheets for any of the 19.** Owner purge 2026-10-06 removed
67 entity-naming narrations (orb-05 + 66 grove episodes) — **orb-05's absence
is deliberate; do NOT refill it or any purged episode with entity-naming
content.**

**The 7 orbs** (audio `public/audio/orbs/`):

| Orb | Title | File |
|---|---|---|
| orb-01 | All Is One | `ep01_all_is_one.mp3` |
| orb-02 | Open Heart | `ep02_open_heart.mp3` |
| orb-03 | Stillness | `ep03_stillness.mp3` |
| orb-04 | Catalyst | `ep04_catalyst.mp3` |
| orb-06 | Dreams | `ep06_dreams.mp3` |
| orb-07 | Fear And Trust | `ep07_fear_and_trust.mp3` |
| orb-08 | Journey Home | `ep08_journey_home.mp3` |

**The 12 surviving grove episodes:**

| Grove | Episode | File |
|---|---|---|
| Grove of the Tender Heart | ep09 Forgiveness | `ep09_forgiveness.mp3` |
| Grove of the Tender Heart | ep13 Joy And Laughter | `ep13_joy_and_laughter.mp3` |
| Grove of Practice | ep12 Patience | `ep12_patience.mp3` |
| Grove of Knowing | ep16 Acceptance Of Self | `ep16_acceptance_of_self.mp3` |
| Grove of Devotion | ep24 Hope | `ep24_hope.mp3` |
| Grove of Devotion | ep25 Humility | `ep25_humility.mp3` |
| Grove of Other Selves | ep27 Service In Daily Life | `ep27_service_in_daily_life.mp3` |
| Grove of Other Selves | ep29 Loneliness | `ep29_loneliness.mp3` |
| Grove of Other Selves | ep33 Dark Night | `ep33_dark_night.mp3` |
| Grove of the Living World | ep30 The Body | `ep30_the_body.mp3` |
| Grove of Reverence | ep51 Reverence | `ep51_reverence.mp3` |
| Grove of Night and Sense | ep54 Evening | `ep54_evening.mp3` |

**Groves with NO episodes (empty after the purge — flagged, §3):**
Grove of Wonder, Grove of Release, Grove of the Inner Child, Grove of
Stillness, Grove of Kindness, Grove of Solitude and Kin, Grove of Learning,
Grove of Enough, Grove of Time, Grove of Becoming.

### 2.9 Wanderer area

7 cinematics (`wanderer-cine-1`–`7`, `public/audio/wanderer-area/`), **each
WITH a timed `.cues.json` file**. Related narration in narration.json:
**WANDERER — "The Wanderer, the Veil, and Past Lives"** (female, 72 cues).
Status: ✅.

### 2.10 Ancient civilizations (cinematics)

6 files (`public/audio/ancient-civs/`), **each WITH a timed `.cues.json`
file**: `atlantis`, `gobekli`, `lemuria`, `mayan`, `nan-madol`,
`pyramid-meditation`. Status: ✅.

### 2.11 Lessons (temple tour)

| ID | Title | Voice | Cues (in narration.json) | File |
|---|---|---|---|---|
| L03 | The Untying | female | 160 | `audio/lessons/LESSON-03_the-untying_paced.mp3` |
| L04 | Without Price | female | 130 | `audio/lessons/LESSON-04_without-price_paced.mp3` |
| L05 | The Fire in the Hand | female | 159 | `audio/lessons/LESSON-05_the-fire-in-the-hand_paced.mp3` |
| L06 | What Is | female | 145 | `audio/lessons/LESSON-06_what-is_paced.mp3` |
| L07 | The Dark and the Lantern | female | 121 | `audio/lessons/LESSON-07_the-dark-and-the-lantern_paced.mp3` |

Enacted scenes: `src/scenes/enacted.ts`, `visionLesson.ts`,
`visionStage.ts`, `lessonKit.ts`. Status: ✅ (cues live in narration.json
rather than standalone `.cues.json` files — acceptable pattern, see §3).

### 2.12 Dialogues, Q&A, passages, rites

- **Dialogues — sit with a figure.** `content/dialogues.json`: 22 figures ×
  8 prompts (who / teach / life / lost / afraid / still / bright / radiant)
  = 176 MP3s in `public/audio/answers/<numeral>/<prompt>.mp3` (e.g.
  `answers/I/who.mp3`). Transcripts in the JSON. **No timed cue sheets.**
  Status: ⚠ (audio + transcripts exist; cues missing).
- **Archetype Q&A.** `content/archetype_qa.json`: 66 MP3s in
  `public/audio/archetype_qa/`. Transcripts in the JSON. **No timed cue
  sheets.** Status: ⚠.
- **Passages — on the road between stations.** `content/passages.json`:
  21 MP3s in `public/audio/passages/` (e.g. P01 "Magician → High
  Priestess"). Transcripts in the JSON. **No timed cue sheets.**
  Status: ⚠.
- **Rites.** `public/audio/rites/`: 74 MP3s — 22 figures × 3 + 8 synth.
  **No timed cue sheets; trigger/scene wiring unconfirmed** (which rite
  plays where is not stated in the files read). Status: ⚠.

### 2.13 Contact, eggs, standalone, opening

- **Contact** (`public/audio/contact/`): 4 files — `contact_1_worlds`,
  `contact_2_disclosure`, `contact_3_reaching_out`, `contact_4_quartz`.
  No cues. Status: ⚠.
- **Eggs** (`public/audio/eggs/`): 3 Easter-egg narrations —
  `egg-easter-island`, `egg-grey-pyramid`, `egg-maya-calendar`. No cues;
  trigger wiring unconfirmed. Status: ⚠.
- **Standalone visions** (`public/audio/standalone/`): 3 files, matching
  the atoms / other-worlds / greetings vision scenes (§2.3). No cues.
  Status: ⚠.
- **Opening** (`public/audio/opening/`): 8 files named `1.mp3`–`8.mp3`.
  ⚠ **Wiring unclear** — generic names, no mapping in the files read to
  which opening moment each serves. Flagged in §3.
- **Other narration.json tracks** (cues embedded in the JSON):
  TREE — "The Catalyst of the Body" (female, 73 cues); EARTH — "Why Earth Is
  So Difficult" (33 cues); NATIONS — "What the Entities Said About the
  Nations" (99 cues); DUALBODY — "The Dual-Activated Body" (68 cues);
  FUTURE — "The Future of the US and Europe" (58 cues); TRANSITION — "The
  Transition to Fourth Density" (83 cues); OPEN-HAND — "The Open Hand"
  (39 cues). Status: ✅ (cues in JSON).

### 2.14 Sanctuary — temple building (🚧 in progress)

Northern island terrace. Gestural building mode per §1.6 (prompt already
sent to Opus). Stone-essence from rock meditation, gold-essence from heart
notes. No narration by design. On-device persistence only. Status: 🚧.

### 2.15 The 22 figures' hearths

The dialogue/Q&A system seats the player near a figure (registry
`seatFor()` in `src/scenes/registry.ts`); lessons stand before their seats
and fill the view (`src/scenes/enacted.ts`); nothing grows between a seat
and its stage or round it. Hearths sit 300 m+ from tour clearings. The
figures themselves are the 22 of the dialogue system (§2.12). Status: ✅.

---

## 3. Gap register — numbered, with what each needs

**G1 — Timed cue sheets missing for most voiced content (largest gap).**
Only densities-area (7), wanderer-area (7), ancient-civs (6), and duat (1)
have standalone `.cues.json` files. Missing: orbs (19), rites (74), adept
(7), densities (8), contact (4), eggs (3), standalone (3), opening (8),
passages (21), dialogues (176), archetype Q&A (66). Journey tracks, lessons,
and the other narration.json tracks carry cues inside narration.json — that
pattern is acceptable and does not need converting. **Needed:** a decision
— generate `.cues.json` for the missing sets (whisper pipeline, same as
densities-area) or declare them transcript-only by design. Until decided,
no new narration item is Ready without its cue sheet (§1.7).

**G2 — Body station BLOCKED (v5 item 1).** Audio
(`workspace/ether/narrations/google/body-healing_Aria.mp3`, Aria, ~6 min)
and script (`body-healing-script.txt`, 790 words) are ready. The station
design is the owner's to spec — do not invent it. **Needed:** owner's spec.

**G3 — Past/Monument has no audio.** 4 audio files for 5 past scenes
(atlantis, egypt, maldek, mars covered; monument not). **Needed:** confirm
whether Monument is intentionally silent or needs a track.

**G4 — Opening audio wiring unclear.** 8 files named `1.mp3`–`8.mp3` with
no mapping in the files read. **Needed:** a mapping note (which moment each
serves) or renaming.

**G5 — Rites + eggs trigger wiring unconfirmed.** 74 rite files and 3 egg
files exist; which scene/moment triggers each is not stated in the files
read. **Needed:** a wiring note or in-code confirmation.

**G6 — Tree Station position TEMP-VERIFY.** `src/scenes/sites.ts` marks
(-1200, 1600, 5.0) temporary; the harness sets the final position.
**Needed:** harness confirmation, then the TEMP-VERIFY comment removed.

**G7 — Empty `female/` directory.** `public/audio/female/` contains
nothing. **Needed:** delete it or state its purpose (repo hygiene).

**G8 — Ten empty groves.** Grove of Wonder, Release, Inner Child,
Stillness, Kindness, Solitude and Kin, Learning, Enough, Time, Becoming
have no episodes after the Oct 6 purge. **Needed:** a decision — leave
them as quiet groves by design, or commission new (non-entity-naming)
episodes for them. Do NOT refill them with purged entity-naming content.

**G9 — Orb-05 gap is deliberate.** Do not treat it as missing. See §2.8.

**G10 — No Kafka register.** The entire emotional range of §4 is unbuilt.
**Needed:** owner confirmation of any K-world (each then becomes its own
batch item).

**G11 — Oracle not yet wired into the game.** PR #318 added only a prompt
doc. The game does not yet call the live Oracle. (Not a location gap, but
it gates the oracle-voice content in §1.4.) **Needed:** integration task,
separate from locations.

**G12 — Game spec / CLAUDE.md drift risk.** The repo's `CLAUDE.md` (203 KB)
and the Drive game spec are the living specs; this document is a snapshot
(2026-10-22). **Needed:** refresh this file whenever a location ships or
changes, per the nothing-gets-lost protocol (same-turn filing).

---

## 4. Kafka worlds — full build specifications (📝 DRAFT)

### 4.0 Shared Kafka rules (bind all seven)

1. **Polite, kind, never threatening.** The keeper, the clerk, the villager
   are warm. Nobody mocks, nobody punishes, nobody chases. The strangeness
   is in the structure, not in any character's intent. Night stays safe (§1.1
   pillar 6).
2. **The system is never defeated — it is outgrown.** Every world's
   resolution is a different move than the system demands: stop asking, stop
   opening, turn around, stop defending, leave, watch, set down. Never a
   puzzle solved, never a door forced, never an enemy beaten. There is no
   fail state, so there is also no "wrong" move — lingering is always allowed.
3. **The turn must be discoverable without instruction.** No text telling
   the player what to do. The world teaches by repetition: the same thing
   happens until the player tries something else. If playtesters don't find
   the turn within a few minutes of lingering, the world's design has
   failed — simplify, don't explain.
4. **Same palette, same materials.** Deep blues, golds, embers; stone
   `#1c1a2c` with gold etch `#e9c37d`; light beams `0xb8d1ff`; path lamps
   `0xffe6a0`; the NIGHT mood. Kafka's devices are expressed in Inland's
   visual language, not imported from film noir or horror. No black-and-
   white, no harsh chiaroscuro, no brutalism, no dread music.
5. **One narration per world, short.** Aria, speed 92, 60–120 seconds, plain
   human language (§1.8). The narration names the feeling, never the
   literary reference — the player is not told "this is Kafka." No named
   entities, no dates, no "the Trial" or "the Law" as proper nouns. The
   keeper is "the keeper"; the door is "the door."
6. **Every world ships with a timed cue sheet** (§1.7) and is verified with
   `?shot=` stills: (a) the world on arrival, (b) the turn happening.
7. **If a world reads as dark in playtest, cut it first.** K7 is the
   highest-risk world on this rule; K4 second. The owner decides cuts.

### 4.1 K1. The Waiting Room (from "Before the Law")

**Source — read first.** Kafka's parable "Before the Law" (~700 words, the
cathedral chapter of *The Trial*): a man from the country comes seeking
entry to the Law and spends his life waiting before a door, told "not yet"
by a doorkeeper, learning only at the end that the entrance was assigned
only to him. Read the parable and its readings at:
- https://www.douxreviews.com/2009/05/lost-lit-franz-kafkas-before-law.html
- https://wintercyclingcongress2016.org/why-before-the-law-by-franz-kafka-still-breaks-our-brains-bhm
- https://deepbookanalysis.com/blogs/news/unraveling-the-labyrinth-of-guilt
- Full text of *The Trial* (free): https://americanliterature.com/author/franz-kafka/book/the-trial/summary
  (and the Kafka library: https://americanliterature.com/author/franz-kafka)

**The device.** Permission deferred forever. The man's mistake was believing
the Law was something outside himself that he needed to be admitted to. He
died waiting for a door that was never locked.

**Layout.** A round room, ~14 m across, stone `#1c1a2c` with thin gold
etch `#e9c37d` in a single unbroken circle at eye height. One door of warm
light (`0xffe6a0`, soft bloom) set into the wall. One low seat. One keeper:
a seated figure of light, warm gold, facing the door. Nothing else. No
windows, no second door, no furniture. Fog: NIGHT mood. Sound: near-silence,
the water bed very low, a faint warm tone when the player sits.

**Interaction script (beat by beat).**
1. Player enters; the keeper looks up, smiles, and a single fading word
   appears: "wait."
2. If the player approaches the door, the keeper says (soft, kind, spoken
   once): "Not yet." The door does not open. The door does not resist — it
   simply stays as it is.
3. If the player sits on the low seat, time slows slightly (the sit mechanic
   from Station II); motes drift; nothing else happens. Waiting is the whole
   activity. The keeper occasionally glances at the door, fondly.
4. The turn: the player walks to the door WITHOUT first approaching the
   keeper or asking — or after sitting a while, stands and walks to it
   directly. The door opens on approach. Warm light spills. The keeper bows
   once, smiles, and the room stays behind the player, quiet.
5. No text ever says "the door was never locked." The player learns it by
   doing it. On replay, the keeper waves the player through immediately.

**Narration outline (Aria, ~90 s).** Beats: (a) "There is a door in your
life that you have been waiting to be let through." (b) "You have asked,
politely, for a long time. The answer has always been: not yet." (c) "No
one is keeping you out. No one ever was. The door was made for one person
to walk through — and it is still open." Ends in silence, not instruction.
**Do not write:** any mention of Kafka, the Law as an institution, guilt,
or the word "permission" as a lecture. The narration names the feeling
(waiting), never the system.

**Stuck layer:** permission — waiting for someone else to authorize your life.
**What NOT to do:** no countdown, no keeper who grows impatient, no door
that slams, no "you waited too long" messaging, no reward fanfare on
opening. **Verification:** `?shot=` (a) the room with keeper and door,
(b) the door open with light spilling. **Needed files:** new scene
(`src/scenes/kafka/waitingRoom.ts` suggested), one narration MP3 + cue sheet,
one entry in the world registry.

### 4.2 K2. The Corridor of Doors

**Source — read first.** The endless offices and corridors of *The Trial*
(chapter 3, "In the Empty Courtroom — The Student — The Offices"): K enters
a narrow corridor of an empty building and finds hundreds waiting; a small
door on one side becomes a massive door on the other. Visual language in
Orson Welles' *The Trial* (1962): vast empty spaces carved out of shadow,
straight lines at severe angles, desks stretching to infinity:
- https://filmforum.org/film/the-trial-welles-film
- https://www.alternateending.com/2017/06/the-trial-1962.html/amp
- https://www.criminalelement.com/orson-welles-at-100-the-trial-1962-kafka-jake-hinkson/
Take from Welles only the *scale and repetition* — NOT the black-and-white,
NOT the dread, NOT the brutalism. Inland's corridor is warm and calm.

**The device.** Seeking as a loop: every door opens onto the same corridor,
a little further along. The answer is never in the next room.

**Layout.** A long, calm corridor, ~60 m, pale stone floor, walls of dark
stone with gold etch lines running level like a horizon. Identical pale
doors on both sides, evenly spaced, each with a small warm lamp above it
(`0xffe6a0`). Soft carpet-light underfoot. No sound but footsteps and the
low water bed. The corridor is procedurally extended: as the player walks,
more corridor generates ahead (same module repeated); the far end never
arrives.

**Interaction script.**
1. Player walks the corridor. Every door opens (tap or walk-through) onto
   the same corridor, a little further along, with the same doors. No
   variation, no surprise, no joke at the player's expense — the repetition
   is gentle, almost lulling.
2. A faint warm light grows behind the player the longer they stand still
   (not a prompt, just light). Standing still is the only thing that changes
   anything.
3. The turn: the player stops and stands still for ~10 seconds. The corridor
   lights up along its whole length — every lamp brightens at once, the gold
   etch lines glow — and a quiet tone sounds. The corridor itself was the
   destination, not a passage. A side arch opens onto open night (the way
   out), or the player simply walks on, now knowing.
4. On replay, the corridor is shorter, and the light comes sooner.

**Narration outline (Aria, ~75 s).** Beats: (a) "You have been opening
doors, looking for the room where the answer lives." (b) "Every door opens
onto the same corridor. That is not a trick. It is the truth of the
search." (c) "Stand still. The corridor you are already in is lit." Ends in
silence. **Do not write:** any mockery of seeking, any "the journey is the
destination" cliché phrasing, any instruction to stop.
**Stuck layer:** seeking — the belief that the answer is in the next room.
**What NOT to do:** no door that leads somewhere different as a "reward,"
no maze, no getting lost, no time pressure, no "you opened N doors" counter.
**Verification:** `?shot=` (a) the corridor receding, (b) the corridor lit
after standing still. **Needed files:** new scene
(`src/scenes/kafka/corridor.ts` suggested), one narration + cue sheet.

### 4.3 K3. The Castle on the Hill

**Source — read first.** *The Castle* (1926, unfinished — its unfinished
state is itself thematically apt: a story about the impossibility of
resolution that refuses to resolve): K, a land surveyor, arrives in a village
to take up a position for a mysterious lord of a castle; villagers and
officials block his efforts at every turn; his quest to penetrate the
inaccessible heart of the castle is repeatedly frustrated. Kafka suggested
the surveyor is driven by a wish "to get clear about ultimate things."
- https://americanliterature.com/author/franz-kafka/book/the-castle/summary
- https://americanliterature.com/author/franz-kafka (full texts)

**The device.** The goal that recedes because it was never the goal. The
village was home all along.

**Layout.** A hillside village of small warm windows (path lamps
`0xffe6a0`, gold etch on stone) at the bottom of a gentle slope. On the
hill above: a castle of pale geometry — three stacked volumes, a thin gold
ring at its highest point (echoing Station I's ring, deliberately). The
castle is visible from everywhere in this area. A path winds up the hill.
As the player climbs, the castle recedes at exactly the player's pace —
never out of sight, never closer. The villagers: two or three figures of
light, one offering tea (a sit prompt, warm tone). Messages arrive as
fading words, politely: "tomorrow." "Perhaps Thursday." "The castle is
glad you came."

**Interaction script.**
1. Player walks up the path; the castle recedes. No frustration mechanic —
   the recession is slow, calm, almost funny if noticed.
2. Sitting with the villager (tea) warms the village lights slightly. The
   villager says nothing of importance. That is the point.
3. The turn: the player turns around. The village behind — small lights,
   warm windows, the path back down — brightens gently. Walking down, the
   castle, now behind, gives a single warm pulse, like a wave. The castle
   was never rejecting the player; it was never the destination.
4. On replay, the castle is a little closer, and the village a little
   brighter from the start.

**Narration outline (Aria, ~90 s).** Beats: (a) "There is a high place you
have been walking toward for a long time." (b) "Every step you take, it
keeps its distance — not unkindly. It is not refusing you. It is showing
you something." (c) "Turn around. The lights below are not small because
they are lesser. They are small because they are close. They are yours."
Ends in silence. **Do not write:** any "be content with what you have"
lecture, any villainy for the castle, any "the real castle was inside you"
line.
**Stuck layer:** aspiration — the goal that recedes because it was never
the goal.
**What NOT to do:** no castle interior, no official who finally grants
entry, no "you made it" moment, no punishment for climbing.
**Verification:** `?shot=` (a) the village with the castle above, (b) the
village brightened from the turned-around view. **Needed files:** new
scene (`src/scenes/kafka/castle.ts` suggested), one narration + cue sheet.

### 4.4 K4. The Office (from "The Trial")

**Source — read first.** *The Trial* (written 1914, published 1925): Josef K,
a respectable bank officer, is arrested and must defend himself against a
charge about which he can get no information. The court's machinery is
opaque; the judgment does not depend on concrete guilt. Read the guilt
analysis at:
- https://deepbookanalysis.com/blogs/news/unraveling-the-labyrinth-of-guilt
- https://americanliterature.com/author/franz-kafka/book/the-trial/summary
And Welles' visual language for the office (desks stretching to infinity)
at the links in §4.2 — again, scale and repetition only, never the dread.

**The device.** Guilt with no charge. The accusation dissolves the moment
the accused stops defending.

**Layout.** A quiet office, ~18 m across, warm wood-dark stone, gold etch
lines forming a single large rectangle on the floor (a room inside the
room). One desk, one file (a thin volume of light), one clerk: a seated
figure of light, patient, even fond. A window with night outside. No other
furniture, no crowd, no waiting defendants (unlike Welles — Inland's office
is intimate, not massive).

**Interaction script.**
1. Player enters; the clerk looks up, smiles, opens the file, and a fading
   word appears: "explain."
2. The clerk asks gentle, unanswerable questions (spoken, one at a time,
   only if the player stays): "And then what happened?" "Why did you do
   that?" "Who told you to?" No question names a deed. There is no charge
   to answer.
3. If the player keeps answering (the game allows lingering indefinitely),
   the clerk keeps listening, kindly, forever. The file stays open.
4. The turn: the player says nothing — stands still for ~10 seconds, or
   walks to the window and looks out at the night. The clerk closes the
   file, smiles, and the room's light warms. If the player then looks at the
   file, it is blank. It was always blank.
5. On replay, the clerk waves the player to the window immediately.

**Narration outline (Aria, ~100 s).** Beats: (a) "Someone has asked you to
explain yourself. No one has said what for." (b) "You have been preparing
your defense for a long time. It is a good defense. It is also unnecessary."
(c) "The file is blank. It was always blank. You may put it down." Ends in
silence. **Do not write:** the word "guilt" as a diagnosis, any courtroom
drama, any "you are innocent" verdict (that would be another judgment).
**Stuck layer:** guilt and self-judgment — the shadow the Oracle Brain
already names, felt rather than explained.
**What NOT to do:** no verdict, no acquittal, no condemnation, no clerk
who turns hostile, no timer, no "case closed" stamp. Second-highest cut
risk after K7: if playtesters feel judged rather than released, cut it.
**Verification:** `?shot=` (a) the office with clerk and file, (b) the
blank file / warmed room. **Needed files:** new scene
(`src/scenes/kafka/office.ts` suggested), one narration + cue sheet.

### 4.5 K5. The Burrow

**Source — read first.** Kafka's "The Burrow" (unfinished, 1923–24): a
creature builds an elaborate burrow for safety, perfects it, then lives in
fear of an unseen intruder — listening, checking, never finding anything.
The burrow built from fear becomes the fear's home. (Read it via the Kafka
library: https://americanliterature.com/author/franz-kafka — search "The
Burrow".)

**The device.** Safety built from fear becomes a cage. The intruder is the
fear itself.

**Layout.** A beautiful, intricate burrow: tunnels of soft light, round
chambers, stored light (small gold motes shelved like provisions), a front
entrance and a maze of passages the player built by walking (the game
remembers the player's path and lights it behind them). Somewhere in it, a
faint sound — a soft tap, irregular, never locatable. The burrow is warm,
well-made, and entirely safe. The sound is the only strange thing.

**Interaction script.**
1. Player explores the burrow; the tunnels light behind them (their own
   path, kept). The faint tap sounds at irregular intervals, always from
   "somewhere else" in the burrow.
2. Checking tunnels: every tunnel checked is empty and well-lit. The tap
   continues, elsewhere. This can go on as long as the player likes — there
   is no escalation, no jump, no reveal.
3. The turn: the player leaves by the front entrance (always open, always
   lit, never blocked). Outside, the night is quiet. The tap stops — not
   because something was caught, but because there is nothing out here to
   listen for. The burrow remains behind, lit and intact: a place, not a
   prison. The player may re-enter freely; the tap does not resume.
4. On replay, the front entrance glows slightly from the start.

**Narration outline (Aria, ~85 s).** Beats: (a) "You built this place
carefully, so that nothing could reach you." (b) "And now you listen for
the thing that might. You have checked every tunnel. Every tunnel is
empty." (c) "The door was never locked. Step outside. The night is quiet,
and it was quiet all along." Ends in silence. **Do not write:** any
monster, any intruder reveal, any "your fear was irrational" lecture.
**Stuck layer:** survival mode — safety built from fear becoming a cage.
Pairs with the lowest layer of the stuck-layers map.
**What NOT to do:** no intruder, no chase, no sound that grows louder, no
burrow collapse, no "you were safe all along" moralizing.
**Verification:** `?shot=` (a) the lit burrow interior, (b) the quiet
night outside the entrance. **Needed files:** new scene
(`src/scenes/kafka/burrow.ts` suggested), one narration + cue sheet.

### 4.6 K6. The Metamorphosis Room

**Source — read first.** *The Metamorphosis* (1915): Gregor Samsa wakes
transformed into a vermin; his family, once dependent on him, becomes his
judges at the doorway; his body is a stranger, but the one watching it
change is continuous. Full text (free):
- https://americanliterature.com/author/franz-kafka (search "Metamorphosis")
- Project Gutenberg's Kafka titles (search "Franz Kafka" at
  https://www.gutenberg.org)

**The device.** The body changes; the watcher doesn't. Identity is the one
who watches, not the form watched.

**Layout.** A room of tall mirrors — not glass but still dark water set
upright in gold frames (`0xffd700` thin frames, stone `#1c1a2c` walls).
The player's figure of light walks past; in each mirror its form changes:
taller, smaller, winged, root-like, many-limbed, a point of light. The
changes are calm, slow, beautiful — never grotesque, never insectile (no
vermin imagery; Inland's register forbids it). At the far doorway, three
silhouettes watch — neither kind nor cruel, simply present, like family at
a door.

**Interaction script.**
1. Player walks the mirror line; each mirror shows a different form. A soft
   tone sounds per mirror, ascending slowly.
2. The silhouettes at the doorway do not move or speak. If the player
   approaches them, they step back gently — not rejection, just space.
3. The turn: the player stands before the last mirror, which shows no form
   at all — only the light itself, the watcher. Standing there ~10 seconds,
   all mirrors settle to the same image: the small figure of light, as it
   always was. The silhouettes bow once and are gone — not banished, just
   no longer needed.
4. On replay, the mirrors show the figure of light from the start, with
   one mirror still changing, for old times' sake.

**Narration outline (Aria, ~90 s).** Beats: (a) "Your body has changed
many times. So has your life. The people at the door have watched every
version." (b) "You have wondered which one of them is you." (c) "Stand
before the last mirror. The one who has watched every change — that one
never changed." Ends in silence. **Do not write:** any insect or vermin
imagery, any family blame, any "you are not your body" lecture.
**Stuck layer:** body and identity. Pairs with the Body station and the
body-healing narration (v5 item 1's audio).
**What NOT to do:** no horror, no body-horror transformation, no judgment
from the silhouettes, no "true self" reveal as a prize.
**Verification:** `?shot=` (a) the mirror line with a changed form,
(b) the last mirror showing only light. **Needed files:** new scene
(`src/scenes/kafka/metamorphosis.ts` suggested), one narration + cue sheet.

### 4.7 K7. The Machine That Writes (from "In the Penal Colony," softened)

**Source — read first.** Kafka's "In the Penal Colony" (1919): a machine
that writes the condemned man's sentence on his body over twelve hours; an
officer who tends it with devotion; a traveller who watches. The story's
horror is the machine's patience and the officer's faith in it. Inland
takes the structure and refuses the horror: the machine writes on stone,
not skin; there is no condemned man; the sentence is one word.
- https://americanliterature.com/author/franz-kafka (search "Penal Colony")
- The machine passage, quoted from Gutenberg: https://kwize.com/en/authors/Franz-Kafka/

**The device.** Self-sentencing: the judgments we write and re-read,
patiently, for years.

**Layout.** A quiet round chamber. At its centre, a device of pale geometry:
a low table, an arm that moves with slow precision, a stylus of light. On
the table, a stone tablet (`#1c1a2c`, gold etch border). The arm writes
one word at a time, slowly, in gold light: "yours." Then again: "yours."
The chamber is calm, the hum low, the light warm. No officer, no
condemned, no audience. A single seat faces the machine.

**Interaction script.**
1. Player enters; the machine is already writing. The word appears, fades,
   appears again. A fading word floats once: "watch."
2. Sitting in the seat, the player watches as long as they like. The machine
   never speeds up, never breaks, never finishes. It is patient. That
   patience is the whole point — and the whole horror, defused.
3. The turn: the player stands and lifts the stylus — one gesture, the
   lightest touch (tap). The machine stops, gently, mid-word. The tablet,
   now complete, reads in full: "yours — the sentence you were writing to
   yourself." The player sets the tablet down (it stays, lit, on the table)
   and walks on. Nothing else happens. No alarm, no collapse, no moral.
4. On replay, the machine is still, the tablet already complete.

**Narration outline (Aria, ~80 s).** Beats: (a) "There is a machine in
you that writes one sentence, over and over, in a patient hand."
(b) "You have read it so many times you believe it was written by someone
else." (c) "Lift the stylus. The hand was yours. It can rest now." Ends in
silence. **Do not write:** any body imagery, any pain, any "judge" or
"sentence" as a legal verdict, any redemption arc.
**Stuck layer:** self-sentencing — the judgments we write and re-read.
**What NOT to do:** NO body writing, NO pain, NO officer, NO condemned
figure, NO gore or dread, NO machine that resists being stopped. If any
playtester reads this as dark, cut the world first — it is the highest cut
risk in the set, and the set survives without it.
**Verification:** `?shot=` (a) the machine writing "yours," (b) the
completed tablet at rest. **Needed files:** new scene
(`src/scenes/kafka/machine.ts` suggested), one narration + cue sheet.

### 4.8 What the seven add up to

Together they cover the stuck layers the current game only names: survival
fear (Burrow), guilt (Office, Machine), seeking (Corridor), permission
(Waiting Room), aspiration (Castle), body/identity (Metamorphosis Room).
They are the missing emotional register — stuckness that is procedural and
faceless, resolved by stopping, turning, or setting down rather than by
winning. Suggested build order (easiest and safest first): K1 Waiting Room
→ K2 Corridor → K5 Burrow → K3 Castle → K6 Metamorphosis Room → K4 Office
→ K7 Machine (last, highest cut risk). Each world is independent; none
depends on another. None requires the Oracle.

---

## 5. Online reference shelf — for Opus to read

Read in this order: the Kafka texts first (what the worlds are *about*),
then the visual references (what they should *look like*), then the film
(what scale and repetition feel like). Everything below was verified as a
live link on 2026-10-22. If a link is dead when Opus reads this, search the
title — do not substitute a different source silently.

### 5.1 Kafka — the texts (read these before building anything in §4)

- **The Kafka library (free full texts)** — *The Trial*, *The Castle*,
  *Metamorphosis*, *In the Penal Colony*, *Before the Law*, *The Burrow*,
  *The Judgment*, *A Hunger Artist*:
  https://americanliterature.com/author/franz-kafka
- ***The Trial* — summary and full text:**
  https://americanliterature.com/author/franz-kafka/book/the-trial/summary
- ***The Castle* — summary and full text (note its unfinished state):**
  https://americanliterature.com/author/franz-kafka/book/the-castle/summary
- **"Before the Law" — the parable, close-read (the K1 source, ~700 words):**
  https://www.douxreviews.com/2009/05/lost-lit-franz-kafkas-before-law.html
- **"Before the Law" — why it still breaks brains (the door was never
  locked; the mistake was waiting for permission):**
  https://wintercyclingcongress2016.org/why-before-the-law-by-franz-kafka-still-breaks-our-brains-bhm
- ***The Trial* and guilt — the machinery of judgment that no longer depends
  on concrete guilt (the K4 source):**
  https://deepbookanalysis.com/blogs/news/unraveling-the-labyrinth-of-guilt
- **Kafka quotations with Gutenberg/Wikisource sourcing (including the
  Penal Colony machine passage):**
  https://kwize.com/en/authors/Franz-Kafka/
- **Project Gutenberg** — search "Franz Kafka" for the German originals
  (*Der Prozess*, *Das Schloss*, *Die Verwandlung*, *In der Strafkolonie*)
  and the Wyllie/Johnston English translations:
  https://www.gutenberg.org

### 5.2 Visual references — what the worlds should look like

- **Piranesi, *Carceri d'Invenzione* (Imaginary Prisons), 1745–1761** —
  the primary spatial ancestor: colossal staircases spiralling into
  darkness, towering arches framing endless vistas, bridges meeting walls,
  tiny figures dwarfed by architecture. The low viewpoint and dramatic
  light/dark contrast make architecture feel vast and the figure
  insignificant. Use for K2 (corridor) and K3 (castle scale). Inland keeps
  the scale and repetition, drops the menace:
  https://sites.courtauld.ac.uk/macurating/archive-previous-exhibitions/2008-archive-stages-and-scenes-creating-architectural-illusion/objects-on-show/fantastic-inventions/
- **Piranesi at the Escher Palace** — the *Carceri* as vertiginous spaces
  that never end: stairs, ladders, bridges, gates, galleries, none leading
  anywhere; man occasionally present, markedly insignificant and
  vulnerable; Piranesi exaggerates perspective but never abandons gravity
  the way Escher does:
  https://escherinhetpaleis.nl:443/en/about-escher/escher-today/giovanni-battista-piranesi?lang=en
- **Escher, *Relativity* (1953)** — three interlocking staircases, multiple
  simultaneous orientations of gravity, every way up and every way down.
  Use for the *feeling* of a space with no single up — never for literal
  impossible geometry in-game (Inland's worlds are buildable, not optical
  tricks):
  https://moa.byu.edu/m-c-eschers-relativity
- **Escher, *Relativity* — perspective analysis** (three vanishing points
  as an equilateral triangle; the building makes visual sense from any
  orientation):
  http://www.scottmcd.net/artanalysis/?p=548
- **De Chirico, the metaphysical piazzas (1910–1919)** — empty squares,
  long arcades, long illogical shadows, a single small figure, the mood of
  waiting and estrangement. "The Roman arcade is fate… its voice speaks in
  riddles." Use for K1 (waiting room) and K3 (village): the arcade as fate,
  the empty piazza as the space where waiting happens:
  https://www.khanacademy.org/humanities/art-1010/xdc974a79:italian-art-before-world-war-i/xdc974a79:metaphysical-art/a/giorgio-de-chirico-the-soothsayers-recompense
- **De Chirico, *Piazza d'Italia* — Christie's essay** (melancholic evening
  shadows, eerily empty squares, the mystery concealed behind the everyday):
  https://www.christies.com/en/lot/lot-6085777
- **De Chirico — life and metaphysical period** (the 1910 Florence
  revelation; arcades, clocks, mannequins; nostalgia, tense expectation,
  estrangement):
  https://www.ilcenacolosf.org/italian_culture/giorgio-de-chirico/

### 5.3 Film — scale and repetition (not mood)

- **Orson Welles, *The Trial* (1962) — Film Forum** (the Gare d'Orsay
  caverns; 800 typists in a single room; desks stretching on and on; the
  pinscreen-animation prologue for "Before the Law"):
  https://filmforum.org/film/the-trial-welles-film
- **Welles, *The Trial* — visual analysis** (maximalist lighting,
  minimalist staging; huge spaces carved out of shadow; straight lines at
  severe angles; spaces like a poorly-remembered dream):
  https://www.alternateending.com/2017/06/the-trial-1962.html/amp
- **Welles at 100: *The Trial*** (architecture pressing in; camera angled
  so ceilings press down; the office straight out of *The Crowd*, desks and
  lights stretching to infinity; a small door becoming a massive door):
  https://www.criminalelement.com/orson-welles-at-100-the-trial-1962-kafka-jake-hinkson/
- **Welles' *The Trial* through a Jungian lens** (offices enormous,
  corridors endless, attics cramped with waiting defendants; the individual
  too small for the space the system occupies — and yet the system's space
  is organized entirely around that individual):
  https://jungianwriter.com/the-trial-welles-jungian-breakdown/

**What to take from the film and what to leave.** TAKE: scale, repetition,
desks/doors stretching to infinity, the small door becoming a large door,
the pinscreen prologue's texture. LEAVE: black-and-white, dread, brutalism,
oppression, the nightmare tone. Inland's Kafka is warm, calm, and safe —
the system is outgrown, never suffered under.

---

## 6. Tracking

Per protocol, the Kafka worlds in §4 enter as **DRAFT** items. When the
owner confirms any of them, each becomes a batch item with its own row
(Draft → Ready → Deployed to game) and its own narration + cue-sheet
requirement, in the suggested build order of §4.8. The gaps in §3 are
triage items, not batch items, until the owner says which to work on.
This document supersedes the v1 audit entirely; the v1 file is replaced by
this file, not kept alongside it.
