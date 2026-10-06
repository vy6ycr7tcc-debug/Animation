# v5 — next feedback batch (Opus prompt, collecting feedback — DO NOT LAUNCH YET)

Repo: `vy6ycr7tcc-debug/Animation` — branch `main`

This batch follows v4 (`opus-v4-batch.md`). The owner is still walking the game and adding feedback here. Nothing below is final until the owner says launch.

The standing bar applies: follow `docs/style/VISUAL_QUALITY.md`, `docs/style/ANIMATION_QUALITY.md`, `docs/style/STYLE_GUIDE.md`, and confirm you are actually following them. The standing performance directives (`~/workspace/your_files/standing-performance-directives.md`, appended to the v3 prompt) remain in force.

This is owner feedback on shipped work — every item below was explicitly requested. One branch + one PR per numbered item. Commit and push after each milestone.

## 1. Body station (new game station)

The owner will add a **body station** to the game, built around the new body-healing narration. Asset is ready and waiting; station design is TBD — **the owner will spec the body station himself**. Do not invent the station's design, layout, or visuals; track the audio as ready and implement only once the owner provides the spec.

- Audio: `workspace/ether/narrations/google/body-healing_Aria.mp3` (Aria, speed 92, ~6 min)
- Script: `workspace/ether/narrations/body-healing-script.txt` (790 words)
- Theme: our relationship with our body as the path to healing it — the war we fight with our bodies, disease as unprocessed catalyst, the practice of turning toward pain with love. Ends on "Peace. Be still."
- Sourcing: composed from L/L transcript material (not word-for-word archive).
- **Style flag:** the script contains one "not X, not Y" line ("Not with fixing, not with fighting — with attention") that violates the locked narration style rule. The owner has not ruled on a rewrite — leave it flagged, do not rewrite without his word.
- When the owner's station spec lands, integrate per the standing audio/narration conventions (real audio file, no invented dialogue, pause support via the shared transcript player).

## 2. Dynamic graphics quality (the game doesn't run smoothly on some devices)

The game doesn't run smoothly on all devices/versions. The owner wants **dynamic quality**. Confirmed feasible: dynamic resolution scaling is a rendering-layer mechanism — it monitors frame times and scales the internal render resolution up/down, and it does not touch game logic, scenes, shaders, or art. Requirements:

- **Automatic by default.** Detect the device tier at startup (phones start conservative, desktops higher) and adapt live: watch frame times and scale the internal render resolution within a band (e.g. 0.5x–1.0x of native), restoring full resolution when there's headroom.
- **Tuning lives in settings, not code.** Once the adaptive system exists, its thresholds (target frame time, scale band, hysteresis, tier definitions) must be config-driven — retuning them must not require code changes.
- **WebGPU stays primary.** Dynamic quality is independent of the renderer — keep WebGPU, keep the existing WebGL2 fallback for older devices.
- **No visual-identity compromises without owner approval** (standing rule): resolution scaling first — it's the least visible lever. Never touch hero art, fog, or the light design to buy frames without asking.
- **Open decision (owner):** automatic-only with no visible graphics settings UI, vs a small quality override (Auto / Low / Medium / High). The game's minimal-UI philosophy leans automatic-only; a manual override can be added later if the auto system ever proves insufficient.
- This complements the residency work, it doesn't replace it — the standing performance directives still apply. Measure on the weakest target device (physical iPhone) per directive 10.

## 3. Square breathing guide during auto-fly / auto-run

The owner wants a **guided square-breathing practice** that runs while the game moves on its own — during **auto-fly** or **auto-run**. Auto-fly/auto-run themselves are also new (the owner flagged "will add that too"): this item covers both the auto-movement modes and the breathing guide that lives inside them, so they ship coherently.

**Auto-fly / auto-run (new modes):**
- **Auto-run:** the wanderer walks forward on its own at a gentle pace, steering softly along the world (no input needed). **Auto-fly:** the camera lifts and glides — a slow, soaring traversal.
- Any manual movement input (WASD/arrows, joystick) pauses auto mode immediately and returns control; a minimal, on-theme toggle re-engages it. Keep the game's minimal-UI philosophy — one small control, no menus.
- Auto modes must respect colliders/world bounds (see v4 item 2's collider work) — the wanderer never clips through solid props while auto-moving.

**Square breathing (the practice):**
- Classic box pattern: **inhale 4s → hold 4s → exhale 4s → hold 4s**, looping. Phase durations must be config-tunable (settings, not code) — the owner may want 4-4-6-2 or other patterns later.
- **Aria guides it vocally.** Minimal, contemplative cues only — e.g. "Breathe in." / "Hold." / "Breathe out." / "Rest." No greetings, no "friends"/"my friends", no named entities, no "not X, not Y" constructions (locked narration style rules apply). Spoken attribution, if any, is only "cosmic wisdom" — breathing cues need none.
- **Audio asset: PENDING.** The Aria breathing-guide clip(s) have not been produced yet — they will come from the narrations pipeline (Aria, avocado_v2:MAI_01, speed 92, same as all game narration). Implementation options, owner's call on final form:
  - (a) One seamless ~16s looped clip covering a full cycle, or
  - (b) Four short discrete cue clips triggered at phase boundaries, with the particle clock running independently.
  Whichever is chosen: no clicks/pops at loop or cue boundaries, duck the water bed slightly under the voice, and support the game's existing pause/mute behavior. **Do not synthesize placeholder voice or invent the script** — wire the real asset path once produced; until then, build the system with a clearly-marked asset slot and verify timing with a silent/metronome stand-in that is never shipped.
- The breathing guide starts when auto-fly/auto-run engages and stops when the player takes manual control (or toggles it off). It should feel like the world breathing with you, not a fitness app — unhurried, warm, quiet.

**Particle breathing animation (on screen):**
- A visible breathing guide **built from particles**, synced to the 4-phase clock: the particle field **expands on inhale, holds, contracts on exhale, holds** — the eye can follow the breath without any text or numbers.
- Use the game's existing particle aesthetic (warm gold additive motes, as in the gates' ink-mote system) — no new visual language. It should read as part of the world, not an overlay widget.
- Placement: in the player's view during auto modes (e.g. a soft ring/field of motes around the wanderer's view axis, or a gentle screen-space breath halo) — visible without demanding focus, contemplative, never distracting. No text labels, no progress bars, no counts on screen.
- Must stay within the performance budget on the weakest target device (physical iPhone) per the standing performance directives — particle count modest, additive blending, no per-frame allocations.

**Verification:**
- Walk/fly the auto modes on a real device: breathing phases stay in sync with Aria's cues and the particle motion over many cycles (no drift).
- Manual input interrupts cleanly; re-engaging resumes the cycle from a phase boundary, never mid-phase.
- With the voice asset slot empty (pre-production), the system runs silently with correct timing — nothing crashes, nothing references a missing file loudly.

## 4. Boot screen — what this is and how to hold it

The game currently drops the player straight into the world. The owner wants a **quiet opening screen at boot** that explains the game and its intended use before the journey begins.

**Purpose of the screen:**
- Tell the player what Inward Journey is: a contemplative place, not a game to win — for **exploring and listening**.
- Set the intended use: something you keep **open in the background next to your laptop while you work**, or **lie down with to contemplate**. No objectives, no scores, no fail states.
- A minimal controls hint (move / look / tap the gates), kept to one or two lines.

**Draft copy (owner's words, lightly shaped — owner has final say):**
> *Inward Journey is not a game to win. It is a place to wander — across still water, through seven gates, toward the light. There is nothing to collect and nowhere to be. Keep it open beside you while you work, or lie down and let it hold you. Move gently. Listen. Breathe.*

**Design constraints:**
- One screen, contemplative and minimal — it must feel like the game, not a EULA. Slow fade-in over the world (or over darkness), warm typography, no buttons screaming for attention. The standing visual bar (VISUAL_QUALITY.md, ANIMATION_QUALITY.md, STYLE_GUIDE.md) applies.
- Single unhurried gesture to enter ("Begin" or a tap anywhere — no dead ends, no multi-step onboarding).
- Show on first launch; remember the choice (localStorage) and skip on later boots — with a small, quiet way to revisit it (e.g. from a settings/pause corner, if one exists by then).
- Must not block or delay asset loading unreasonably — the world can keep loading behind it; entering fades it away.
- Audio: no autoplay voice before the player's first gesture (browser policy) — the water bed and narration begin on entry as they do today.

## 5. Fourth-density world material (source concepts for world-building)

The owner researched what the L/L archive says about fourth-density worlds (for the "What the Voices Say" episode series) and wants the concepts captured here as **source material for future world/layer design**. Nothing below is a design directive — these are concepts for the owner to shape; no implementation until he does.

**Concepts (from the archive, owner's paraphrase approved as source material):**
- **Nested densities:** multiple worlds occupying the same space, each solid and real to its own inhabitants. A possible design principle for revealing deeper layers: a higher layer becomes perceptible only when "it would not disturb" the player — visibility as a function of readiness, not distance.
- **Invisibility by choice:** fourth-density beings *choose* not to be seen by third density (courtesy, and to protect third density's concentration), while seeing third density clearly — "the way we watch the deer in the forest." One-way visibility as a world rule.
- **The body as carriage:** the fourth-density vehicle is "lighter and electrically driven rather than chemically driven"; transition imaged as the butterfly shedding the cocoon. Possible movement/presence language for lighter states of the wanderer.
- **Atmosphere of unconditional love — with depth:** the love/fear dynamic doesn't end in fourth density, it *deepens*: "as light is brought into the darkness, it reveals more subtle patterns of shadow and light." Love as an atmosphere with weather, not a flat reward state.
- **No veil between people:** everyone perceives everyone. Background lore possibility: the "war in heaven" — positive and negative fourth-density beings in open conflict, both "still believing that a battle is appropriate," both eventually maturing past it ("there are always people new to fourth density willing to take up the cudgels"). Conflict as immaturity, not as evil.
- **The visibility rule (single line):** "you see only what would not disturb you."

**Open (owner):** whether/how any of this enters the game, which layer or area it belongs to, and in what form. Track as source material only.

## 6. Densities area — "The World After the Veil" (new walkthrough area)

The owner wants a **new walkthrough area** about the densities (third → fourth), built from his "What the Voices Say" episode research. Full brief is the prompt file **`~/workspace/your_files/opus-densities-area-prompt.md`** — implement from that file; the summary below is an index, not the spec.

**In brief:** a mysterious, cosmic, forest-like region separated from the rest of the map. One initial door, then open walking — no more doors. A **particle-composed humanoid angel** (warm-gold motes, existing aesthetic) walks ahead of the player and speaks **7 narration beats** at proximity triggers: the Door (third density/Choice), the Forest Walk (transition), the Clearing (fourth density revealed), the Newcomers' Ground (early fourth), the War in Heaven (polarities, thought-battle), the Mirror (how both touch Earth — invisible by choice, temptation never force), the Laying Down (maturation, exit).

**Audio — CINEMATIC set (ready, do not regenerate):** `~/workspace/ether/narrations/densities-area/densities-area-cine-1.mp3` … `-cine-7.mp3` (Aria, speed 92) — full cinematic narrations, ~1–2.5 min each, ~8.5 min total:
- cine-1 The Door (71s) · cine-2 The Forest Walk (67s) · cine-3 The Clearing (90s) · cine-4 The Newcomers (59s) · cine-5 The War in Heaven (136s) · cine-6 The Mirror (98s) · cine-7 The Laying Down (76s)
- Scripts: `~/workspace/ether/narrations/densities-area/scripts/beat-N.txt`. QC passed on all 7 (amplitude verified, click scan clean, full-transcript loop check clean — zero repeated phrases).
- (Supersedes the earlier 17–33s beat set `densities-area-1.mp3` … `-7.mp3`, which remains in the folder as fallback.)
- Integrate per standing audio conventions (real files, no invented dialogue, shared transcript player pause support).

**Standing constraints:** no objectives/scores/fail states; no invented dialogue; particle budget per performance directives; verify every scene with `?shot=` stills against the visual bar; flag inventions. One branch + one PR.

**Update (owner-approved parallels, now in the prompt file):**
- Scene 5 shadowed forms are **qlippoth-like husks** (Kabbalistic "husks" that feed on divine light — matches the archive's "leeching"); they must look **beautiful but wrong** (2 Cor 11:14, "angel of light" — never demonic; luminous and elegant with a subtle wrongness); like Mara's armies they **never touch the player** — temptation only, never force.
- Scene 6 shadow-threads **dissolve when the player's gaze falls directly on them** (Quran 114, "the whisperer who withdraws").

## 7. Wanderer area — "The Long Descent" (new walkthrough area, owner-requested original)

The owner asked for a brand-new area on an untouched topic, designed from scratch. Full brief is the prompt file **`~/workspace/your_files/opus-wanderer-area-prompt.md`** — implement from that file; the summary below is an index, not the spec.
Visual design treatment (palette, motifs, mood arc, per-scene elements, performance notes): **`~/workspace/your_files/opus-wanderer-visual-design.md`** — Opus reads this first, then builds from the prompt's scene specs.

**In brief:** a **cloud-layer region high above the main map** about **the Wanderer** (owner's location choice — thematically exact: the arc is about descending from above). Entered through **one portal of white light** (a vertical beam/shaft the player steps into; base placement at a high, quiet point of the main world — Opus to propose). A sixth-density being volunteers to incarnate in the heavy world. Same proven structure as the Densities area (one entrance, open walking after, particle-angel guide speaking 7 beats at proximity triggers), but the guide here plays the wanderer's **own higher self** — the part that stayed awake above the veil, speaking down to the part that forgot. It walks ahead early, stays at the veil's edge in Scene 3 (does not cross), and rejoins walking *beside* the player from Scene 5 on.

**Scenes:** 1. The Council (the volunteering, sixth density) · 2. The Descent (falling through fifth and fourth) · 3. The Veil (the forgetting — guide does not follow) · 4. The Life (a third-density life in flashes, player alone) · 5. The Ache (homesickness under the stars — guide rejoins) · 6. The Remembering (the veil leaks) · 7. The Radiating (the mission: a lighthouse, not a rescue boat).

**Audio — CINEMATIC set (ready, do not regenerate):** `~/workspace/ether/narrations/wanderer-area/wanderer-cine-1.mp3` … `-cine-7.mp3` (Aria, speed 92) — 65s / 71s / 89s / 74s / 74s / 72s / 93s, ~9 min total. Scripts: `~/workspace/ether/narrations/wanderer-area/scripts/beat-N.txt`. QC passed on all 7 (amplitude verified, click scan clean after declick of 4 joins, full-transcript loop check with zero repeated phrases). Integrate per standing audio conventions (real files, no invented dialogue, shared transcript player pause support).

**Standing constraints:** one entrance only; no objectives/scores/fail states; no invented dialogue; heaviest effects are the veil mist (Scene 3) and the radiating rings (Scene 7) — budget carefully, verify on physical iPhone; `?shot=` stills per scene; flag inventions. One branch + one PR.

## 8. First-density animation — polish and focus framing

The owner's verdict on the current first-density animation: "a bit meh." Two things to fix:

- **Polish the animation itself.** Raise it to the standing visual bar — it should feel as crafted as the rest of the densities sequence, not a weak opening.
- **Fix the focus framing per density — center vs. zoom out is a per-scene call.** The owner's note: for the first density, the wide view is prettier, so the focus move should pull back to reveal it rather than push in past it. But this isn't a blanket rule — some densities read better centered, some zoomed out. Propose the framing per density, verify each with `?shot=` stills, and let the owner judge which is which.

**Verification:** `?shot=` stills of the focus move at several timestamps — the beautiful part must stay in frame throughout. Compare against the visual bar docs before calling it done. One branch + one PR.

## 9. Egypt pyramid / past choices — Aton disk illustrations

In the Egypt pyramid area (the past-choices Egypt room), add **visual references to Aton** — the sun disk with rays ending in **arms/hands reaching down** (Amarna-period iconography). These read as wall illustrations/carvings in the pyramid's visual language: the disk above, the ray-arms extending downward toward the world.

**Constraints:** render in the game's existing illustration idiom (no new art style); keep it as illustration/carving detail within the architecture, not a new interactive element. Verify with `?shot=` stills against the visual bar. One branch + one PR.
