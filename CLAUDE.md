# Inward Journey (web 3D game)

## What this is
A contemplative third-person exploration game for Samuel about the archetypes of Mind, Body and Spirit.
**The governing brief is `prompts/master-build-prompt.md`.** Read it before any design decision.
This file records how the brief is being applied and the decisions made along the way.

In short: a luminous wanderer on an endless lake at sunrise (the hub). Three islands rise from it:
Mind, Body and Spirit. Each island holds seven stations, one per archetype: Matrix, Potentiator,
Catalyst, Experience, Significator, Transformation, Great Way. That makes 21 stations.
- **Order:** stations unlock 1→7 within an island, and the islands can be visited in any order.
- **Synthesis:** finishing the same position on all three islands triggers a synthesis moment at the lake. There are seven.
- **The Choice:** after all 21 are attuned, The Choice opens at the lake's centre.

No enemies, timers, scores or fail states. Art as a door, not a lecture.

Samuel works mainly from an **iPhone**. Mobile Safari performance and audio are first-class requirements.

## Decisions (defaults Claude proposed on 2026-09-24; Samuel said "go")
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
- Web Audio, generative beds per zone:
  - water lapping (hub);
  - wind and pages (Mind);
  - waterfall and stone (Body);
  - high resonant tones (Spirit).
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

## Build phases (from the brief; stop and show Samuel after each)
1. Walking prototype: lake hub, character controller, camera, dawn atmosphere.
2. Mind island, stations 1–3, with interactions and narration hooks.
3. All three islands, all 21 stations, progression, synthesis moments.
4. The Choice, hub transformation, audio mix, mobile, accessibility, performance.

Ask Samuel before large aesthetic decisions. The transcripts stay the authority on meaning.
