# 15 — Current State & What's Proven

## What the Prototype Proved (Concepts That Work)

These ideas were built, tested, and visually verified in the debug prototype. They should be **rebuilt** (not copied) in the inward-journey repo:

### ✅ Temple with S-Weave
The weaving path works. It feels like breathing, like being led. The column rhythm creates natural reveal moments. This is the foundation — get this right first.

### ✅ Tarot Cards as Holograms
The technique works: card imagery as projected golden light, with shimmer, scanlines, fresnel rim, ignition flare, and float. The user hasn't seen the final version, but the approach (light, not photo) is what they asked for.

### ✅ Tree Station (7 Beats)
All seven beats were built and visually verified: full leaf, dry season, breaking (with stubs and notches), spirit emerging from inside the trunk, watering, new growth in different shapes, the painting with broken branches included. The story works.

### ✅ Terrain-Aware Positioning
The lesson: on a slope, everything must sit at the actual terrain height. The tree was 5 meters above the viewer's seat. Build terrain-aware from the start.

### ✅ iOS Texture Approach
Simple linear filtering, no mipmaps. This stopped the Safari crashes.

### ✅ WebGPU Root-Cause Diagnostic
The error-scope technique for finding the *first* validation error (not the cascade symptom).

## What Was In Progress (Not Proven)

### 🔶 Final Room Declutter
The instruction is clear (file 03) but the rebuilt room was never visually verified. The concept is solid — the execution needs to be done fresh.

### 🔶 Duat De-boxing
The four fixes are specified (file 06) but were never completed and verified. Build de-boxed from the start.

## What Was Never Started

- ❌ Igloo second attempt (the "awful" version is the only reference for what NOT to do)
- ❌ Desert floating vegetation
- ❌ Shore figure (was missing entirely)
- ❌ Galaxies narration decision

## The Debug Repo (Reference Only)

`vy6ycr7tcc-debug/Animation` contains the prototype. It's stopped as of 2026-09-28. Useful as:
- A reference for what the S-weave *feels* like
- A reference for the hologram *approach* (not the code)
- A reference for the tree station *story beats*
- A list of mistakes to avoid

**Do not copy code from it.** The architecture is different. Rebuild cleanly in the inward-journey structure.

## The Inward-Journey Repo (Where You Build)

Already has:
- `art/` — the ink drawings (visual reference)
- `audio/` — narration tracks and voice specs
- `game/` — the game shell (index.html, src/, styles.css)
- `theory/` — Law of One archetype research
- `prompts/` — master build prompt

Start from here. Build the temple first (files 01-04). Then the tree (file 05). Then Duat (file 06). Then the remaining scenes.
