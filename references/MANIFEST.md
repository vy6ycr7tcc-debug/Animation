# Inward Journey — Claude Code Package

**Built:** 2026-09-28 15:34:54 
**Version note:** Folder format (no zip): 26 design files, 18 narration tracks, all audio under 25MB each

## Contents

### design/ (26 files)
The complete design handoff — concepts, instructions, nuances for every scene.
Start with `design/README.md` for the index.

### narration/narration.json
Subtitle cue metadata for all tracks. 18 tracks.

### narration/audio/ (19 files)
All finished narration MP3s.

## Track List
  - J01: The Shore (female, 7 cues)
  - J02: The Crossing (male, 6 cues)
  - J03: Arrival (female, 7 cues)
  - J04: The Magician (male, 8 cues)
  - J05: The High Priestess (female, 8 cues)
  - J06: The Empress (male, 7 cues)
  - J07: The Emperor (female, 8 cues)
  - J08: The Hierophant (male, 8 cues)
  - J09: The Lovers (female, 7 cues)
  - J10: The Chariot (male, 8 cues)
  - J11: The Return (female, 7 cues)
  - TEMPLE: One Road, Twenty-Two Stations (female, 105 cues)
  - L03: The Untying (female, 160 cues)
  - L04: Without Price (female, 130 cues)
  - L05: The Fire in the Hand (female, 159 cues)
  - L06: What Is (female, 145 cues)
  - L07: The Dark and the Lantern (female, 121 cues)
  - TREE: The Catalyst of the Body (female, 73 cues)

## Audio Files
  - J01_the_shore.mp3 (0.4 MB)
  - J02_the_crossing.mp3 (0.3 MB)
  - J03_arrival.mp3 (0.3 MB)
  - J04_the_magician.mp3 (0.3 MB)
  - J05_the_high_priestess.mp3 (0.4 MB)
  - J06_the_empress.mp3 (0.3 MB)
  - J07_the_emperor.mp3 (0.4 MB)
  - J08_the_hierophant.mp3 (0.4 MB)
  - J09_the_lovers.mp3 (0.4 MB)
  - J10_the_chariot.mp3 (0.4 MB)
  - J11_the_return.mp3 (0.3 MB)
  - temple-tour.mp3 (4.2 MB)
  - TREE_catalyst_of_the_body.mp3 (2.0 MB)
  - lessons/LESSON-03_the-untying_paced.mp3 (9.7 MB)
  - lessons/LESSON-04_without-price_paced.mp3 (8.7 MB)
  - lessons/LESSON-05_the-fire-in-the-hand_paced.mp3 (9.5 MB)
  - lessons/LESSON-06_what-is_paced.mp3 (9.5 MB)
  - lessons/LESSON-07_the-dark-and-the-lantern_paced.mp3 (8.8 MB)
  - water-bed.mp3 (1.3 MB)

## How to Use This Package

1. Read `design/README.md` first — it's the index to all 26 design files.
2. `design/12-NARRATION.md` has the complete narration catalogue with scene mappings.
3. Audio files in `narration/audio/` correspond to track IDs in `narration.json`.
4. When implementing a scene, read its design file + check its narration mapping.

## Target Repo

Build in `vy6ycr7tcc-debug/inward-journey` (NOT the debug Animation repo).
Game code in `game/src/` references audio via `../../audio/`.
Copy needed MP3s from `narration/audio/` to the repo's `audio/` directory.
