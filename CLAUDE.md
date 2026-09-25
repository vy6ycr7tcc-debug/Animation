# Inward Journey (web 3D game)

## What this is
A contemplative third-person exploration game for Samuel about the archetypes of Mind, Body and Spirit.

**Current build target (since 2026-09-25): `prompts/GAME_PROMPT.md`, Samuel's game package.**
- A night shore, a swim across dark water, one island with seven geometric stations (the archetypes of the Mind, Ra 78–79), and the swim home.
- It comes with 11 recorded narrations (J01–J11) and a water bed, all in `public/audio/`. Their scripts are in `content/scripts/`, and the catalogue with subtitle cues is `content/narration.json`.
- Follow its pillars exactly: easy, no fail states, art as a door not a lecture, geometry-forward, night is safe.
- Its milestones:
  - **M1** shore and swim;
  - **M2** seven stations;
  - **M3** full audio;
  - **M4** reflection questions and a private journal;
  - **M5** the Chariot ride, J11 and the return, polish.
- All five were built (2026-09-25, PR #2). They were then replaced by the open world (see Decisions). The package's pillars, audio and station forms still apply.

**Current shape (since 2026-09-25): an open night world, "kind of like Children of Light".**
- The world has no island, no stations to stand at and no required path. `PLAYTEST.md` describes it.
- Narration plays in the background in order (`src/core/playlist.ts`).
- The world reacts as you pass through it (`src/world/life.ts`):
  - grass trails;
  - flowers that bloom with notes;
  - lanterns to kindle;
  - butterflies;
  - gliders.
- Seven station forms stand as landmarks to discover (`src/world/landmarks.ts`, `src/world/stations.ts`). The terrain streams in chunks (`src/world/terrain.ts`).
- In each landmark lives its archetype as a being you meet (`src/world/beings.ts`):
  - recreated from Samuel's Ra tarot cards (`reference/IMG_0033–0056.jpeg`), never shown as cards;
  - a fluid body of light in its own colour, posed as on the card, holding the card's objects;
  - coming near wakes it: it turns, greets you, and its narration begins and carries on as you wander.
- You begin from a map (`src/ui/map.ts`), drawn from the terrain. Where you choose decides whose narration comes first. ⋮ → Map travels again.
- The whole creation (`src/world/creation.ts`), with the light of the Creator shown as light that is always moving through it:
  - trees whose roots go deep into the earth, seen through the ground as fine lines of light;
  - one network of light joining trees and crystals underground;
  - crystals that take shafts of light from the sky and split it into rainbows;
  - rocks etched with gold linework;
  - spirits with veils of light.

**Longer-term vision: `prompts/master-build-prompt.md`** (a dawn lake hub, three islands, 21 stations).
- This package is effectively its Mind island. Build the package first.
- Ask Samuel before extending to Body and Spirit.

The rest of this file records decisions made along the way.

In short: a luminous wanderer on an endless lake at sunrise (the hub). Three islands rise from it:
Mind, Body and Spirit. Each island holds seven stations, one per archetype: Matrix, Potentiator,
Catalyst, Experience, Significator, Transformation, Great Way. That makes 21 stations.
- **Order:** stations unlock 1→7 within an island, and the islands can be visited in any order.
- **Synthesis:** finishing the same position on all three islands triggers a synthesis moment at the lake. There are seven.
- **The Choice:** after all 21 are attuned, The Choice opens at the lake's centre.

No enemies, timers, scores or fail states. Art as a door, not a lecture.

Samuel works mainly from an **iPhone**. Mobile Safari performance and audio are first-class requirements.

## Decisions
- 2026-09-25: the game package's night world replaces the dawn lake for the current build. The recorded narrations are Samuel's own and are used as they are.
- 2026-09-25: Samuel doesn't want the island or narration triggered by standing at an artifact ("I don't want them to be waiting").
  - The world is open and delightful to walk through, "kind of like Children of Light".
  - Narration is always going on in the background.
  - Areas "pop" as you walk through them.
  - He likes the walking feel; keep it.
- 2026-09-25: after playing the open world:
  - no bells on the lantern orbs;
  - the narration describes places that don't match where the wanderer is. Samuel will draw a map. Don't change the map or the narration order until he does;
  - focus on the environment's items and the love/light flowing through everything.
- 2026-09-25: living things (second density) are drawn round and circular, never stiff:
  - smooth curved limbs with no joints;
  - twigs and fine roots end in spiral curls;
  - flowing threads.
  - Crystals and rocks may stay geometric.
- 2026-09-25: Samuel added the Ra tarot deck (22 cards, `reference/IMG_00xx.jpeg`) and an archetype overview chart (`reference/BE9C2465-….png`).
  - "Don't stamp the card on the game": each archetype is a recreated character you interact with.
  - Players choose on a map where to start, "otherwise it's the same narration every time".
  - Built for the seven Mind archetypes, which have narrations. Body (8–14), Spirit (15–21) and The Choice (22) wait on Samuel's go-ahead and narration.
  - The zip he uploaded (`reference/inward-journey-game-package.zip`) holds the same recordings already in `public/audio/`.
- 2026-09-25: Samuel: "Whenever done push to mainline." Merge finished, verified work into `main` without asking.
- 2026-09-25: Samuel likes the female voice and not the male one.
  - Only the female voice plays.
  - Male-voice tracks (J02, J04, J06, J08, J10) are skipped by the background playlist until `narration/revoice-female.sh` has made female copies in `public/audio/female/`.
- 2026-09-25: the wanderer must read as fluid, with no visible joints.
  - The skeleton (recorded animation from the CC0 Universal Animation Library) drives a ray-marched smooth union of capsules (`src/player/fluidBody.ts`).
  - The mannequin mesh is never drawn.

Defaults Claude proposed on 2026-09-24 (Samuel said "go"):
- **Art direction:**
  - the brief's world wins: the lake hub; Mind as forests, libraries, mirrors in silver-blue; Body as mountains, waterfalls, terraces in amber, green and earth red; Spirit as crystal and starlight in violet, gold and indigo.
  - Egyptian and pre-Columbian influence only as abstract linework, never temples, deities or religious symbols.
  - The older temple-based art direction from the first prototype is retired.
- **Visual DNA:**
  - Samuel's drawings. Fine glowing linework, sacred geometry, hand-drawn wobble.
  - In-engine this becomes etched-light contour lines on terrain, line mandalas, and light footprints.
- **Target:** iPhone Safari first, laptop second.
- **Narration:** new 30–90 s station meditations will be written for Samuel's approval, then voiced with his `tts` CLI as before.
  - The 21 one-line distillations in the theory file stay as source material.
  - Never quote Ra verbatim in-game.
  - Map every station to its theory passage in `content-notes.md`.
- **Engine:** Vite + TypeScript + Three.js + `postprocessing`. No runtime network calls; system fonts only.

## Source material (authoritative)
- `reference/theory/Mind__Body__Spirit___Foundational_Theory.md` is canon for meaning. It holds verbatim Ra/Q'uo quotes per archetype. Never invent quotes, doctrine or session numbers.
- Archive gaps: the Significator of the Body (12) and the Great Way of the Spirit (21) have no Ra definition. Mark them as open or unfinished (dashed or incomplete forms).
- Ra's teaching order (88.24): 1, 8, 15, 2, 9, 16, 3, 10, 17, 4, 11, 18, 5, 12, 19, 6, 13, 20, 7, 14, 21. The seven synthesis moments follow this grouping.
- `reference/drawings/samuel-art/` and `reference/drawings/egyptian-tarot-cards/` hold references. The brief's 19 ink drawings (2014–2016) and finished narration audio live in Samuel's `inward-journey` repo, which is not yet attached.
- `prototype/` holds earlier single-file prototypes. Behaviour ideas only; do not port their renderer.

## Audio
- The bed is `water-bed.mp3` (from the package's `water-bed.wav`), looped with a crossfade, plus soft generated tones.
- Narration ducks the bed (never mutes it). Leaving a narration fades it, never cuts it.
- Subtitles are on by default and can be turned off.
- iOS 17+: set `navigator.audioSession.type = "playback"`, so sound plays with the silent switch on.
- Start audio inside the first tap ("Touch the water to begin").
- Keep music above about 200 Hz; phone speakers lose the low end.
- Narration voices: Aria is `avocado_v2:MAI_01` (warm female), Rowan is `avocado_v2:miles` (soothing male), speed 92. Subtitles are always on.

## Quality bar
- Lighting is the main character: dawn light, fog with depth, water that reflects the sky, bloom used with restraint.
- **Performance:** 60 fps on a recent iPhone and at least 30 fps on mid-range devices. Adaptive quality covers pixel ratio, shadows and bloom (`src/core/quality.ts`).
- **Accessibility:**
  - keyboard, mouse and touch all work;
  - reduced motion, both automatic and as a toggle;
  - subtitles;
  - never rely on colour alone;
  - no tracking and no personal data.

## Build order
Follow the package milestones (M1–M5 above). Stop and show Samuel after each.

Ask Samuel before large aesthetic decisions. The transcripts stay the authority on meaning.
