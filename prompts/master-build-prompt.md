# INWARD JOURNEY — Master Build Prompt

(Samuel's brief, as given to Claude Code on 2026-09-24. This file is the governing design brief;
`CLAUDE.md` records how it is being applied.)

---

You are a senior game developer and creative technologist. Build me a complete,
playable, end-to-end video game called **INWARD JOURNEY**. This is not a demo, not a
rendered animation, not a cutscene — it is a real game: a single character I control,
a world I explore, objectives I complete, and an ending I earn.

## 1. The vision (read this first, it governs every decision)

Inward Journey is a contemplative exploration game about the archetypes of **Mind,
Body, and Spirit**. The player turns inward toward their real self and toward
unconditional love. The governing principle is: **art as a door, not a lecture.**

- The game never preaches, never explains itself with text dumps, never imprints any
  religious ideas. It is universal and non-denominational. No religious symbols, no
  scripture, no dogma — only light, water, geometry, and silence doing the teaching.
- The emotional reference is a concert where the performer seemed to radiate literal
  light, and the audience felt directed inward toward themselves and toward the
  Creator. Chase that feeling: radiance, intimacy, awe.
- Pacing is slow and reverent. There are no fail states, no enemies, no timers, no
  scores. The only "challenge" is attention: the game rewards slowing down, looking,
  listening, and being present.
- The aesthetic reference is my own ink drawings (fine-line geometric-spiritual work,
  2014–2016, provided in `art/`): dense hand-drawn linework, sacred geometry,
  handwritten fragments of text woven into the line. The 3D world should feel like
  those drawings came alive — etched light, living geometry — not like generic
  "spiritual" stock art.

## 2. The world

**The Lake.** The game opens on an infinite lake at sunrise. Glassy water to every
horizon, soft fog, a vast luminous sky. This is the hub — the player always returns
here, and it visibly transforms as the journey progresses (the sunrise advances, the
water grows more radiant).

**The Three Islands.** Three islands rise from the lake, each the domain of one
archetype complex:

- **Island of Mind** — floating forests, impossible libraries, dream architecture,
  mirrors half-lost in fog. Palette: silver, pale blue, moonlight white.
- **Island of Body** — mountains, waterfalls, terraced stone, gardens, physical
  ordeals of balance and breath. Palette: amber, deep green, earth red.
- **Island of Spirit** — crystalline structures, open sky, starfields visible at
  noon, resonant chambers. Palette: violet, gold, deep indigo.

The player travels between hub and islands by boat, by swimming, or simply by
walking on water once attuned — movement itself is part of the teaching.

## 3. The character

A single wanderer: a simple luminous humanoid figure, androgynous, featureless,
made of soft light. Third-person camera, close enough to feel embodied. Movement:
walk, run (a gentle glide), jump, swim, and eventually a slow hovering flight
unlocked late in the game. The character leaves faint light-trails and footprints of
radiance that fade — the world remembers your passing briefly, then lets go.

## 4. Game structure — the 21 stations

The backbone of the game is the archetypal sequence from the Law of One material.
Each island holds **7 stations**, one per archetypal position, in this order:

1. Matrix · 2. Potentiator · 3. Catalyst · 4. Experience · 5. Significator ·
6. Transformation · 7. Great Way

That is 21 explorable stations total (3 islands × 7). Each station is a designed
space on its island — a grove, a chamber, a shore, a summit — with its own visual
identity, its own short narrated meditation (30–90 seconds), and one simple
interaction (light a brazier, pour water, ring a tone, align mirrors, breathe with a
pulse, etc.). Completing a station's interaction "attunes" it: the station ignites
with light and its narration plays.

**Progression rules:**
- Within an island, stations unlock in order 1→7. You cannot skip ahead; each
  station's teaching prepares the next.
- The three islands can be approached in any order, BUT the cross-teaching matters:
  completing the same position across all three islands (e.g. all three Catalysts)
  unlocks a short "synthesis" moment at the Lake hub — a convergence event where the
  three teachings rhyme. There are 7 synthesis moments total.
- After all 21 stations are attuned, the Lake hub transforms fully (full sunrise,
  radiant water) and the final station — **The Choice** — opens at the lake's
  center: a single wordless decision presented as two paths of light. Walking one
  completes the game. The ending is quiet, not climactic: the character dissolves
  into light, and the player may keep wandering the completed world freely afterward.

**Content authority.** The meanings of Mind, Body, Spirit and all 21 archetypes are
defined in `theory/mind-body-spirit.md` (grounded in the L/L Research channeling
archive, with verbatim Ra/Q'uo quotations). Treat that file as canon. In brief:

- *Mind* (Ra): the mind reflects "the inpourings of the spirit and the up-pourings
  of the body complex."
- *Body* (Ra): "The body is the creature of the mind and is the instrument of
  manifestation for the fruits of mind and spirit."
- *Spirit* (Ra): "The spirit is a shuttle."
- The Star (Spirit's Catalyst) is "Hope — which we would prefer to call Faith":
  faith that the light is real, even in dark water.

Each station's narration must be faithful to its archetype's essence as defined in
the theory file. Write new contemplative narration in that spirit (second person,
present tense, sensory, 30–90 seconds spoken). Do NOT invent doctrine; do NOT quote
Ra verbatim in-game (paraphrase into meditation language). Keep a `content-notes.md`
mapping every station to the theory passage it draws on.

## 5. Visual & art direction

- Engine: your choice (Three.js/WebGL recommended for portability; Unity or Unreal
  acceptable if you can deliver a playable build I can actually run). Target 60fps on
  a mid-range laptop and playable on mobile browsers if web-based.
- The ink drawings in `art/` are the visual DNA: convert their linework into
  textures, etched-light geometry, and particle motifs. Geometry should feel
  hand-drawn at the edges — slightly imperfect, breathing.
- Lighting is the main character. Volumetric-feeling light, god rays, bloom used
  with restraint, water that reflects the sky truthfully.
- Scale for awe: vast skies, tiny wanderer. But keep intimate spaces too — the
  contrast teaches.
- Color script: dawn hub (rose/gold), Mind (moonlight silver-blue), Body (amber/
  green), Spirit (violet/gold), finale (pure white-gold radiance).

## 6. Audio

- Provided in `audio/`: finished narrations (warm female + soothing male voices) for
  the Three Islands journey and The Star Within, plus ambient-tested scripts. Use
  these as the voice reference and, where they fit, as actual in-game audio.
- New station narrations: synthesize or license calm male/female voices matching the
  provided reference (warm American female, satiny soothing American male, slow
  contemplative pacing). Every station gets its narration; the hub gets ambient-only.
- Ambient beds per zone: water lapping (hub), wind + pages (Mind), waterfalls +
  stone (Body), high resonant tones (Spirit). Generative/WebAudio ambient is
  preferred over large audio files. All audio must start after a user gesture
  (browser autoplay policy) — design the opening so the first tap is a ritual
  ("touch the water to begin").
- Adaptive touch: attuning a station shifts its zone's bed subtly brighter.

## 7. Interaction & UX

- Almost no conventional UI. No HUD, no minimap, no quest markers. Guidance is
  environmental: light draws the eye, sound draws the ear, the camera suggests.
- Interactions are single-button / single-tap, contextual, and wordless where
  possible. On desktop: WASD + mouse, Space to interact. On mobile: virtual
  joystick + one context button. The game must be fully playable on a phone.
- Include: reduced-motion mode, volume controls, and a quiet "leave" that saves
  progress (localStorage or equivalent). Progress = attuned stations.
- Opening: no menus. Title appears over the lake, fades. "Touch the water to begin."

## 8. Technical requirements

- Real game loop: player controller with collision, camera controller, zone
  streaming or well-managed level loads, save system, state machine for the 21
  stations + 7 syntheses + finale.
- Organize code as a real project: `src/`, per-island scene modules, `content/`
  (station data + narration scripts as data files, not hardcoded), `assets/`.
- Performance budget: draw calls and texture memory must stay sane on mobile GPUs;
  use LOD or fog-culling for distant geometry; profile and report fps in your
  summary.
- Accessibility: colorblind-safe palettes for critical signals (never rely on color
  alone), subtitles for all narration, reduced-motion toggle that disables camera
  shake and strobing effects.
- No external network calls at runtime (fonts, assets all local) except where
  I explicitly approve.

## 9. Deliverables

1. A playable build I can run (web build preferred: a single folder I can open or
   host statically; or clear run instructions for a native build).
2. The full source, cleanly organized, committed to the repo I'll give you.
3. `content/stations.json` (or equivalent): all 21 stations with island, position,
   essence, narration script, interaction, and theory reference.
4. `content-notes.md`: theory grounding per station.
5. A short `PLAYTEST.md`: controls, intended progression path, known issues, fps
   notes.

## 10. Build order (do it in this sequence, show me playable progress after each)

1. **Walking prototype** — lake hub, character controller, camera, day-one
   atmosphere. I must be able to walk around. Stop and show me.
2. **One island, three stations** (Mind 1–3) with interactions + narration hooks.
   Stop and show me.
3. **All three islands, all 21 stations**, progression logic, synthesis moments.
4. **Finale + polish** — The Choice, hub transformation, audio mix, mobile pass,
   accessibility, performance.

Do not build everything in one blind pass. After each phase, summarize what works,
what's placeholder, and how to run it, then wait for my feedback before continuing.

## Assets I will provide

A private GitHub repo (`inward-journey`) containing:
- `audio/` — finished narration MP3/M4A + scripts + locked voice specs
- `art/` — 19 ink drawings (visual DNA)
- `theory/mind-body-spirit.md` — the canonical archetype definitions
- `prompts/` — the series master prompt
