# Opus prompt — Inward Journey: Heart notes wiring + Genesis removal + Oracle triggers

Date: 2026-10-15. Line numbers from repo `vy6ycr7tcc-debug/Animation` @ main, checked this date — re-derive with grep on section headers if the tree moved.

## Standing rules (read first)

- INWARD JOURNEY IS SACRED. Work only in this repo. No Juzu/GLM anything touches it.
- Read and follow `VISUAL_QUALITY.md`, `ANIMATION_QUALITY.md`, and `STYLE_GUIDE.md` (distilled from this game's own code — the style source of truth) on every visual you generate. Confirm you are actually following them. Match the style in STYLE_GUIDE.md.
- The 11-rule performance block in `~/workspace/your_files/standing-performance-directives.md` applies to everything you build here — phone thermals are a standing complaint.
- Context discipline: read ONLY the file:line ranges cited per task, fresh at execution time. Do not load whole files into context.
- Verify with the still-frame hook (`?shot=<sceneId>&t=<seconds>`, `window.__shotReady`) for every new UI surface. Never call UI done on typecheck/build alone.

## Overview

Three changes, one wiring:

1. **Remove Genesis.** The long-press-on-the-heart world-rebuild sequence goes away entirely (owner: "honestly it's whatever").
2. **Heart notes ("My Heart").** The wanderer's heart becomes the notes instrument: double-tap the heart (in-world) or the H key opens a note composer; notes persist on-device; the heart lives in the menu, appears whenever seated, and appears during touch interactions.
3. **Oracle triggers.** The main oracle (overall mode — it names which of the 22 archetypes are at play, then reflects) becomes interactable at two places: **the Choice** (finale) and **the center of the labyrinth** (the still center / mirror). Question input, "Attach my heart" consent toggle (off by default), answer display, tap-to-speak via the device's native speechSynthesis.

Privacy is law: notes live in localStorage only. Nothing leaves the device unless the player explicitly enables "Attach my heart" for a question — per-question consent, never a global switch.

---

## Task A — Remove Genesis

Genesis = the 30-second long-press sequence where the world goes dark and rebuilds itself out of geometric lines from the heart (`src/world/genesis.ts`, 259 lines; header comment describes the 0–30s timeline).

Remove completely:
- `src/main.ts:1479-1547` — the whole Genesis block: the comment at 1479-1480, `const genesis = new Genesis()` (1481), `heartAt` (1485-1487), `beginGenesis` (1488-1504), the `input.onHold` heart hit-test branch (1506-1511 — keep `beginTouch` for non-heart holds), `input.onHeart = beginGenesis` (1546), `genesisFrame` (1547+; also remove its per-frame call site — find it), `genesisBells`.
- Every `genesis.active` guard: `src/main.ts:846, 854, 1344, 1357, 1380, 1489` and the one inside `canTouch` (~1522). Remove the `|| genesis.active` clauses; do not leave dangling references.
- `audio.genesisScore()` call inside `beginGenesis` (definition lives in `src/core/audio.ts` — remove the call; leave the definition only if something else uses it, else remove).
- Check `src/player/camera.ts`, `src/debug/film.ts`, `src/debug/shot.ts`, `src/debug/feedback.ts` for genesis references (they showed up in a repo grep) and remove/adjust.
- Delete `src/world/genesis.ts`. (Its `HEART_PERIOD, HEART_START` import comes FROM `src/core/audio.ts` — deleting genesis.ts does not affect audio.ts.)

Do NOT remove: the heart screen-position projection logic — Task B reuses it for double-tap hit-testing.

Gate: typecheck clean, game boots, `?shot=` of normal play shows zero visual change vs before (genesis only ever ran on demand).

## Task B — Heart notes

### B1. Double-tap the heart → note composer

- Reuse the heart hit-test from the old `input.onHold` (`src/main.ts:1505-1510`: project `heartAt()` to screen, radius `Math.max(70, innerHeight * 0.09)`).
- Add double-tap detection: two `onTap` events within 350ms, both inside the heart hit radius → open the note composer. Single taps and long-presses elsewhere are untouched (`onHold` keeps working for touch.ts; the heart branch of `onHold` is gone with Task A).
- The H key (`src/core/input.ts:41`, `onHeart`) now opens the note composer instead of genesis. Keep the `input, #menu` focus guard pattern used by the other key handlers.
- The composer: a minimal overlay in the game's visual language (STYLE_GUIDE.md) — textarea, Save, Cancel. No entity names, no archive jargon in the chrome; it is the player's private journal.
- On save: `{ text, createdAt, scene }` appended to localStorage key `ij:heart:v1` (game key — NOT the Voices site's `vfa:heart:v1`). Cap: keep it simple, newest-first, no hard limit needed yet.

### B2. Heart always in the menu

- `index.html:222-260` — the `#menu` dialog. Add a heart entry to `.menu-go` next to Map/Guide/Autofly: a `♥ My Heart` button opening the notes panel (list of notes, newest first; tap a note to read; add-note button inside).
- Wire open/close in `src/main.ts:4235-4239` (`setMenu`) following the existing menu button patterns.

### B3. Heart appears when seated and when interacting

- Whenever `sitting.phase === "seated"` (`src/main.ts:1800` — the sitting state object; seated is set at :1299/:1823), show a small heart affordance on screen. Tapping it opens the note composer directly.
- During touch.ts interactions ("laying hands": `src/main.ts:1516-1545`, `beginTouch`/`canTouch`), show the same heart affordance. Tapping it opens the composer.
- The affordance must be quiet — small, dismissible, never blocking the scene. It hides when the player stands / the interaction ends.

Gate: `?shot=` frames of (1) the composer overlay, (2) the menu with the heart entry, (3) the seated heart affordance — eyes-open check against STYLE_GUIDE.md before calling done.

## Task C — Oracle triggers (the Choice + the labyrinth center)

The oracle backend is live. Exact contract — implement precisely this:

- `POST https://oracle-station.vy6ycr7tcc.workers.dev/oracle`
- Headers: `content-type: application/json` AND `x-oracle-key` with this exact value:
  `a16af48d2554193869f51e95784801297ea36eb2bf6d9193c3004f2758ad0d97`
  (shared secret — abuse protection; the worker rejects requests without it.
  It ships in client JS by design; the real spend ceiling is the worker's per-IP quota.)
- Request: `{ mode: "overall", question: string, heart?: string[] }`
  - `mode: "overall"` — the main oracle: it opens by naming the 1–3 of the 22 archetypes at play, then reflects. This is the mode for both trigger points below.
  - `heart`: array of the player's note texts, max 8 entries × 400 chars. Include ONLY when the player explicitly enables "Attach my heart" for that question. Never otherwise. Never persisted server-side (it isn't).
- Response: `{ text: string, sources: [...] }`. Render `text` only — do NOT render sources in-game (no titles/dates/pages; the oracle's voice never cites, keep it that way).
- Voice: the answer gets a Speak/Stop button using the device's native `speechSynthesis` (tap-to-speak, triggered by the tap). Rate 0.95. Do not build server TTS; there is none.
- Failure: if the fetch fails, show one quiet line ("The oracle is silent — check your connection.") and keep the question in the input. Never a stack trace, never a retry storm.

Trigger points:
1. **The Choice** — `references/design/19-THE-CHOICE.md` (finale: "I choose to love" / "I choose to rest" / "I choose not to choose — yet"). After the player chooses, offer the oracle: a quiet prompt to ask a question of the whole oracle about the path ahead. This is the natural home of overall mode.
2. **The center of the labyrinth** — `src/scenes/mindMaze/area.ts:439` ("The still center": "Here at the center, every wall falls below the eye…"). When the player reaches the center, the oracle becomes available there too — same overall mode, same UI.

Oracle UI: one reusable panel (question input + Ask + "Attach my heart" checkbox, off by default + answer area + Speak/Stop). Same visual language as the note composer (Task B). It must work at both trigger points without duplication — one component, two call sites.

Note for later (do NOT build now): the API also accepts `station` (a lens id) and `origin` (free-text hidden archetype pre-prompt) — the game's future station-specific triggers will use those. Mention in a code comment where the request is built.

Gate: typecheck clean; ask a real question at each trigger point against the live worker and confirm a sensible answer returns; `?shot=` of the oracle panel.

## What NOT to do

- Do not touch the maze mechanics, the archetype beings, the Choice design itself, or any narration content.
- Do not add server-side storage, accounts, or analytics for notes. On-device only.
- Do not render oracle `sources` in-game. Ever.
- Do not reintroduce any world-rebuild / genesis-style sequence under another name.
- Do not regress the perf directives. The note composer and oracle panel are DOM overlays — they must not allocate per frame.

## Done criteria

1. `tsc` clean, game boots, no console errors on load.
2. Genesis fully gone: grep for `genesis`/`Genesis`/`GENESIS` in `src/` returns only the debug files if you consciously kept them (prefer zero).
3. Double-tap heart / H opens composer; note saves to `ij:heart:v1`; menu shows ♥ My Heart with the notes list; heart affordance appears when seated and during touch interactions.
4. Oracle answers real questions at the Choice and the labyrinth center; attach-my-heart sends notes only when enabled; Speak/Stop works with native TTS.
5. `?shot=` frames reviewed for the composer, the menu entry, the seated affordance, and the oracle panel.
