# MASTER PLAN — Full Visual Redo + Density Expansion (Claude Code)

**Prepared:** September 29, 2026 (EDT)
**For:** Claude Code, running locally with the user's git credentials
**Scope:** redo ALL game visuals (every scene, including the temple tour) + build the Density Monument expansion
**Status of this plan:** the owner judged the merged scene upgrades (PRs #73–#78, Tree Station push, Sept 28 style-fix wave) bad and wants everything redone. Nothing in this plan has been sent to any builder. All audio is DRAFT until the owner explicitly approves it.

> The canonical repo copy of this document, the style guides, and all narration scripts lives at
> `docs/claude-scene-redo-master-plan.md` (and siblings) in the Animation repo. If anything in
> a local copy disagrees with the repo copy, the repo copy wins.

---

## 1. DEPLOYMENT TARGET + REPO/BRANCH RULES (read before touching anything)

- **Repository:** `vy6ycr7tcc-debug/Animation` — PUBLIC. This is the only repo you build in.
- **Branch:** `main` is the deployed branch. You work on **session/feature branches**, never directly on main.
- **Live site:** `https://vy6ycr7tcc-debug.github.io/Animation/` — GitHub Pages deploys from `main` via `.github/workflows/pages.yml` (push to main → Vite build: `npm ci`, node 22 → Pages). The site serves `public/` at the root with Vite `base: "./"` (relative), so `public/audio/x.mp3` is fetched by game code as the **relative** path `audio/x.mp3`.
- **The `inward-journey` repo is DEAD and DELETED (deleted 2026-09-29 after consolidation PR #69).** Never reference it, its paths (`art/`, `audio/`, `game/`), or any of its branches. On September 29 a full temple visual pass landed in a repo no website reads from and was invisible on the live site — that failure class must not repeat.
- **Do NOT touch:** the `vy6ycr7tcc-debug/listen` repo (separate app, separate repo). Do not merge PRs — **the owner merges PRs themselves**; you open PRs and stop.
- **One branch per feature/scene.** Commit and push after every scene/milestone — never accumulate unpushed work. A session's work does not exist until it is pushed; anything unpushed is stranded and effectively lost. After each push, report the branch name and commit hash.

---

## 2. GLOBAL QUALITY GATES (binding on every scene)

### 2.1 The three style docs — attached in the repo, non-negotiable
- `docs/style/VISUAL_QUALITY.md`
- `docs/style/ANIMATION_QUALITY.md`
- `docs/style/STYLE_GUIDE.md` — distilled from the game's own code; it is the source of truth when the docs disagree.

Read and follow all three on every visual you generate. **Confirm in your own words that you are actually following them** when you report a scene done. The style guide documents known conflicts between the generic quality docs and the mainline code — the code canon wins (see its §6 "Conflicts").

**The acceptance bar is not typecheck.** It is this: *a single still frame, no motion, no explanation — does it look intentional?* Every scene must share the soft, painterly, atmospheric look. Cheap symptoms that have been explicitly rejected before: flat clip-art geometry, rectangular light pillars, flat base discs, hovering/floating placement, unanchored props, wireframe/debug-looking geometry, linear constant-velocity motion, synchronized identical motion, pure-black void backgrounds, Milky/washed-out grade.

### 2.2 Verification protocol (no exceptions)
1. **Never call a scene done on `tsc`/build alone.** Boot the game in a real (or headless) browser.
2. Verify every new/changed scene through the still-frame hook: `?shot=<sceneId>&t=<seconds>` (`src/debug/shot.ts`), waiting on `window.__shotReady`. Register every new scene id there. A scene that has not rendered a frame has not been built.
3. **Renderer compatibility:** the game runs three.js `^0.186.1` with a **WebGPU primary renderer and a WebGL2 fallback** (`?webgl` forces it). Verify every scene under BOTH. iOS Safari has no WebGPU and the owner plays on iPhone — WebGPU-only is unacceptable.
4. **Physical iPhone review** is the final gate for visual approval. You verify technically (typecheck + build + `?shot=` under both renderers, no console/shader errors, NaN scan clean, motion proof); the owner judges visually.

### 2.3 The codebase pipeline (work WITH it, never bolt over it)
- Tone mapping: `AgXToneMapping`, set once globally in `src/main.ts`. Never change it, never add another.
- Fog: custom height fog via `scene.fogNode = ijFogNode()`, tuned through `fogUniforms`. Never add `THREE.Fog`/`FogExp2` alongside.
- Post: the bespoke `post` module — `post.configure({ ao, rays, bloom, aa })`. **Never** import EffectComposer/UnrealBloomPass/OutputPass.
- Lights: hemisphere + ONE directional "star" (+ the `Moods` system). **Never add punctual lights.** Depth comes from glow sprites, rim light, and fog — not more lights.
- Materials: the codebase's solid-object idiom is **unlit node materials with hand-rolled TSL lighting** (`MeshBasicNodeMaterial` + custom light math, e.g. bark/crystals/leaves in `src/world/creation.ts`). `MeshStandardMaterial` is the exception (etched stone), not the default. Flat unlit is banned.
- **Import three.js from `three/webgpu`, never bare `three`** — the node materials the game is built on only exist on the `three/webgpu` export. TSL helpers come from `../gpu/tsl` or `three/tsl`, never invented.
- `WebGPURenderer` requires `await renderer.init()` before the first render — without it you get `Cannot read properties of null (reading 'build')` spam.
- TSL nodes are WebGPU-only: **the WebGL2 fallback path needs standard materials**, not TSL.
- `glowShader`'s color callback returns **vec3, never vec4**. Alpha is folded into RGB (`vec4(color, 1)`); all additive materials must pass through `additiveKeepsAlpha()` (`src/main.ts`); `fog: false` and `depthWrite: false` on all glow/additive/point materials. Guard every division (e.g. `max(d, 1e-4)`). (Full recipe list in STYLE_GUIDE.md §2 and §6.)
- `setPixelRatio(Math.min(devicePixelRatio, 2))` on iPhone. `InstancedMesh` for repeats. Never allocate in the animation loop. One shadow caster, tight frustum.
- Palette canon: **deep blues, golds, embers** (exact values in STYLE_GUIDE.md §1). 3–5 colors per scene, analogous or complementary. New hues must be justified by the fiction, never decorative.

---

## 3. PER-SCENE REDO — every scene, including the temple tour

Code homes: scenes live in `src/scenes/` and are registered in `src/scenes/sites.ts` (SITES record: `shore`, `igloo`, `garden`, `galaxies`, `desert`, `tree`, `tree-station`). The temple tour is `src/scenes/templeTour.ts` built on the real temple site in `src/world/temple.ts`. The Duat visual lives in `src/world/pyramid.ts`. Lesson scenes are `src/scenes/lessonKit.ts`. Register new still-frame ids in `src/debug/shot.ts`.

General rule for all redos: **do not assume the merged work is a good base** — the owner judged the merged upgrades bad. Read the current code, keep what is technically sound (material idioms, lighting recipes), and rebuild the look. Verify against the three style docs and the gates in §2, not against "it typechecks."

### 3.1 Duat — `src/world/pyramid.ts` (PR #73 merged the recovery)
- **What was wrong:** the owner explicitly rejected the Duat render as looking like **"cheap Windows Microsoft Paint"** (2026-09-28) — flat, clip-art, no atmosphere. From-scratch redo variants were produced (night desert with lamp posts, arch, dark orb) and a recovered upgrade was merged (#73), but the owner still judges it bad.
- **Redo must achieve:** a soft, painterly, atmospheric Duat that shares the garden/galaxies look; deep blues, golds, embers; the still-frame must read as intentional with no explanation. No flat hard-edged geometry, no plasticky lighting.
- **Note:** the September 28 archive contains Duat redo stills for mood reference; treat them as inspiration, not canon.

### 3.2 Temple tour — `src/scenes/templeTour.ts` + `src/world/temple.ts` (PR #74 merged)
- **What was wrong:** the owner says the whole temple tour visual still fails the bar — it is included in this redo. Earlier stills showed it dark and atmospheric (acceptable base mood), but the tour has never had a **real visual walkthrough on the owner's phone**, and its narration synchronization was never proved.
- **Critical constraint — the real temple only:** the actual temple interior is centered at approximately `(30000, 1, 0)`. A previous port attempt searched open water 1,300–2,500 m from world origin and built a **second, separate temple site ~28 km from the real one** — the user entered a different temple than the tour walked. The redo MUST use the real temple's hall niches, gateway, and sanctuary coordinates from `src/world/temple.ts`. Never build another temple site.
- **Camera direction (owner, 2026-09-28):** the hall-walk camera must NOT fly a straight line — rework it into a **slow S-weave that sways toward each card** as it moves down the hall. Keep the existing scenery as-is; the camera move is the change.
- **Narration sync:** the tour is a full 10:36 guided walk over 26 stations (audio `temple-tour.mp3`, 636 s; narration track `TEMPLE` with 105 sentence cues + 26 scene cues in `content/narration.json`). The redo must prove narration synchronization works (voice fades in 0.4 s, fades out over 2 s, never cuts; subtitles linger 1.5 s after voice; music bed ducks under speech — see STYLE_GUIDE.md §5).
- **Locked gameplay decisions (owner-resolved 2026-09-28):** free roaming with an obvious guide/next destination; ambient wind/water/piano with wind (not silence) between narration; 22 stations with a clear "next" while narration audio plays continuously, absorbing extra cues as transitions rather than extra stations.

### 3.3 Shore — `src/scenes/shore.ts` (PR #75 merged)
- **What was wrong:** at a t=60 still, the frame showed only grass/palm environment — **the robed figure and cords, the intended focal composition, were absent/off-frame**. This was a framing/build issue, never resolved. Additionally, PR #75 was merged despite a suspected **robe material regression** — the material treatment in that recovery must not be repeated.
- **Redo must achieve:** the robed figure and cords must be visible and properly framed at the still-frame checkpoints; figure reads as the one focal point per view; composition follows foreground/midground/background with rule-of-thirds placement.

### 3.4 Igloo — `src/scenes/igloo.ts` (PR #76 merged)
- **What was wrong:** the owner called the original "awful" (2026-09-28). A full overhaul was done and merged (soft radial glow bands, edge fades on ice walls, three nested soft glow sprites for the flame, feathered crossed planes for beams, path cores with shared halos and a traveling brightness wave, plus the dome from #76) — and the owner still judges it bad.
- **Redo must achieve:** everything in the redo bar — do not assume the merged overhaul is the right base. Re-read the style docs and rebuild the look from the igloo's own fiction (ice, crystal clusters, dome, hearth), in the soft painterly idiom.

### 3.5 Garden — `src/scenes/garden.ts` (PR #77 merged)
- **What was wrong:** the owner said it **"looks like shit."** Caveat: that verdict was given on SwiftShader headless stills, which are NOT faithful to a real GPU — but the owner has ordered a full redo anyway, so the redo is authoritative, not the caveat.
- **Note:** an earlier technical audit found the garden conformant with the style docs (it was the nominal style anchor) and fixed one real bug — an unguarded denominator `(k / whorl.n)` → `(k / Math.max(1e-6, whorl.n))`. Keep the fix; do not keep the "anchor" assumption. The garden must earn the bar again with fresh eyes.
- **Redo must achieve:** the same verdict test as every scene — one still frame must read as intentional. Night garden with moon disc and glowing stalks, in the soft painterly idiom.

### 3.6 Desert — `src/scenes/desert.ts` + world-level `src/world/genesis.ts` (PR #78 merged)
- **What was wrong:** (a) **placement bug, still open:** grass tufts and pale trees float above the ground — hovering with no contact, roots dangling, no shadow anchoring them. This is a bug, not a style choice; plant every prop at terrain height. (b) **World-level issues, still open:** falling slab-like shards, a pale dome, and hard-edged rings need softening (owned by `genesis.ts`, not `desert.ts`). (c) PR #78 showed "no visible change" — the merged recovery did not move the needle.
- **Redo must achieve:** the pillars-as-soft-volumetric-billboard-columns treatment stands, but the scene must be re-verified whole: no floating props, softened world-level shards/dome/rings, all in the soft painterly idiom.

### 3.7 Tree Station / Tree of Life — `src/scenes/treeStation.ts`, `src/scenes/tree.ts` (Tree Station pushed directly)
- **What was wrong:** the Tree of Life rest scene ("The Catalyst of the Body" narration) had rectangular light pillars, a flat base disc/orb, and **wireframe-looking rocks** — the clip-art/debug-geometry problem. A style pass replaced the orange wisp disc with nested soft glows and improved the moss seat, but the wireframe rocks are **world-level geometry in `src/world/genesis.ts`** and were never resolved. The owner has not accepted any revision.
- **Redo must achieve:** glowing tree + gold arcs preserved and elevated; wireframe rocks in `genesis.ts` rebuilt as proper rock idiom (displaced `IcosahedronGeometry` with fbm noise, flat shading, cast/receive shadow — see STYLE_GUIDE.md §2 "Stone"); no flat discs, no rectangular pillars.

### 3.8 Galaxies — `src/scenes/galaxies.ts` (never got its upgrade — the redo session FAILED)
- **What was wrong:** this is the only scene that never received any visual upgrade. Open issues: (a) the scene contains MiMo-invented `whisper(...)` narration for Lesson 06 — **no Lesson 06 transcript was available**; whether to retain, replace, or ground those lines is still an open owner decision (see §6, decision 7). (b) The lesson animation/navigation integration was never built.
- **Locked creative direction (owner, 2026-09-28):** NOT a large separate thematic environment. It is **a seat in a dark space, a beautiful galaxy hovering around it, and the narrator character**. Sitting triggers narration-synchronized animation.
- **Locked workflow (owner preference):** prepare each narration animation as a **standalone visual for review first**, then decide whether it makes sense, and only afterward integrate it with the seat trigger and narration timing.
- **Locked (owner, 2026-09-28):** the Galaxies scene HAS narration audio like every other scene — it is not silent or music-only.
- **Redo must achieve:** the seat-and-galaxy concept in the soft painterly idiom; resolve the `whisper()` decision (owner decides, §6.7); narration sync proved before integration.

### 3.9 Lesson scenes — `src/scenes/lessonKit.ts`
- **Status: no recorded feedback.** The five lesson scenes (LESSON-03 through LESSON-07, audio in `public/audio/lessons/`, tracks L03–L07, 570–639 s each) have no visual verdicts on record. They are part of this redo's conformance pass so every scene meets the bar — not because anything specific was reported wrong.

### 3.10 World-level — `src/world/genesis.ts` (not a scene, but in scope)
- **What was wrong:** debug-looking **wireframe dome rocks** (visible in tree/desert frames), falling shards, pale dome, hard-edged rings. These sit outside any scene file, so scene-local passes never fixed them.
- **Redo must achieve:** replace wireframe/debug geometry with the codebase's stone/rock idiom (STYLE_GUIDE.md §2); soften or rebuild shards/dome/rings in the painterly idiom.

### 3.11 Per-scene checklist (paste-ready, run for every scene)
1. Read `docs/style/VISUAL_QUALITY.md`, `docs/style/ANIMATION_QUALITY.md`, `docs/style/STYLE_GUIDE.md` and state in your own words how you are following them.
2. `npx tsc --noEmit` + `vite build` pass.
3. Boot in a real (or headless) browser; verify `?shot=<sceneId>&t=<seconds>` reaches `__shotReady` under the default WebGPU renderer AND under `?webgl`.
4. No console or shader errors; shader NaN scan clean; motion proof (t→t+1 changes a sane fraction of sampled pixels, not 0%, not everything).
5. The screenshot test: one still frame, no motion, no explanation — intentional?
6. Commit and push to the scene's branch; report branch name + commit hash. **Owner merges.**

---

## 4. DENSITY MONUMENT EXPANSION (design complete, NOT built)

Full design document: `docs/density_monument_handover_v2.txt` (committed alongside this plan — the complete handover, 600+ lines, including all eight narration scripts in §5, the builder protocol, and the changelog). What follows is the build-relevant summary; the handover is authoritative for details.

**Status:** design + audio drafts complete. The eight monument scripts are still DRAFTS — a deeper research/content audit (especially the seventh-density claims) and a re-render must happen **before** any builder handoff of the audio, and the six open decisions in §4.7 must be resolved by the owner. Build the monument structure/code against the handover; wire audio only from the final masters the operator delivers.

### 4.1 Vision
The player approaches a great rock monument and steps inside. Within: a living miniature of creation — volcanoes erupting, galaxies blooming and dying in an endless loop. Portals lead through seven rooms, one per density (stage) of conscious evolution: rock and fire learning to BE; the green world learning to GROW; the human world and its great CHOICE; a luminous planet of LOVE; the magician's hall of WISDOM; the merging sea of UNITY; then a corridor of white light — the GATEWAY — returning the player to the monument where it all began. Each room has its own narration (voice Aria), its own visual world, its own lesson. The end is the beginning: the octave turns, creation starts over.

### 4.2 Journey map (in order)
`[0] MONUMENT OF CREATION (lobby/hub)` → portal (pitch black transition) → `[1] FIRST DENSITY: Learning to Be` → portal (illuminated door, trees/branches growing from its frame) → `[2] SECOND DENSITY: Learning to Grow` → portal → `[3] THIRD DENSITY: The Great Choice` → portal → `[4] FOURTH DENSITY: The World of Love` → portal → `[5] FIFTH DENSITY: The Hall of Wisdom` → portal → `[6] SIXTH DENSITY: The Merging` → portal (single door of pure white light) → `[7] SEVENTH DENSITY: The Gateway (return corridor)` → back to `[0]` (the octave: it begins again).

Design rule: the player can always walk straight through — **portals are never locked**. Lingering is rewarded (rooms are beautiful; narrations are ~5 minutes), never required.

### 4.3 Room specifications (condensed — full text in the handover)
- **[0] Monument of Creation.** Exterior: a great rock monument; the player walks up and enters through a stone doorway. Interior: vast dim chamber, a miniature cosmos — stars igniting/exploding, galaxies blooming, volcanoes pouring fire, oceans forming, on an endless loop. Mood: awe, smallness, wonder; dark stone, then unbearable light at the core. Audio: `audio/densities/the_beginning.mp3` (234 s draft). This room is also the END (the octave).
- **[1] First Density: Learning to Be.** Elemental world: towering rock, volcano pouring slow fire, black-sand shores, breathing ocean, storm clouds that never quite break. No plants, no animals — the four elements practicing existence. Mood: ancient, patient, heavy, sacred. Audio: `audio/densities/density_1.mp3` (339 s draft).
- **[2] Second Density: Learning to Grow.** Green world: trees growing in visible time-lapse pulses, flowers turning to light shafts, herds moving as one body, birds wheeling, primates playing. Mood: trust, abundance, innocence. Audio: `audio/densities/density_2.mp3` (297 s draft).
- **[3] Third Density: The Great Choice.** Human world, split down the middle: war/suffering/cruelty on one side, hands extended and quiet courage on the other; the player walks between. Mood: gravity, tension, tenderness. Audio: `audio/densities/density_3.mp3` (300 s draft).
- **[4] Fourth Density: The World of Love.** Luminous planet: crystalline architecture, soft technology serving wonder, skies of gentle light; **visible threads of light connecting every being to every other** (the social memory complex). Mood: warmth, belonging, relief. Audio: `audio/densities/density_4.mp3` (348 s draft).
- **[5] Fifth Density: The Hall of Wisdom.** The magician's hall: vast solitary chamber, beams of light bending through prisms, formulas tracing themselves in air, a lone robed figure studying light. Physics references: light, numbers, sacred geometry. Mood: clarity, solitude, precision. Audio: `audio/densities/density_5.mp3` (317 s draft).
- **[6] Sixth Density: The Merging.** Dark hall, gentle as deep water; countless orbs of light drift together and merge — two flames becoming a greater light; each orb holds a faint scene from earlier rooms; far end: one radiant ocean of light. Mood: unity, homecoming, overwhelming tenderness. Audio: `audio/densities/density_6.mp3` (291 s draft). **Concept is PROPOSED, not yet owner-approved — see §4.7 decision 1.**
- **[7] Seventh Density: The Gateway.** Not a room but a corridor — simple, quiet, white-gold light; delivers the player back into the Monument of Creation with the creation-loop still turning. Mood: completion, rest, quiet joy, recognition. Audio: `audio/densities/density_7.mp3` (273 s draft).

### 4.4 Audio contract (binding)
- The eight monument MP3s will be delivered by the operator into the Animation repo at `public/audio/densities/` **after the pending script audit and re-render**. They are not there yet.
- Reference them verbatim as the relative paths `audio/densities/<file>` (existing repo convention). Do NOT re-encode, move, rename, or re-upload them.
- **Never** fetch or merge the old private `audio-library` branch — a builder on this repo cannot even read that private repo.
- Playback: each room's narration starts when the player enters the room (trigger zone at the portal exit); plays once; a small unobtrusive replay control is available. Narration never blocks movement.
- Voice: Aria (`avocado_v2:MAI_01`), speed 92, for all monument narration.

### 4.5 Scene integration pattern (existing convention — follow it)
- New scenes in `src/scenes/`, registered in `src/scenes/sites.ts` (add the monument + rooms to the SITES record the same way shore/igloo/garden/galaxies/desert/tree/tree-station are registered).
- Register every new still-frame id in `src/debug/shot.ts`.
- Keep the journey map (§4.2) as the integration order.

### 4.6 Locked constraints
- **Spoken attribution is ONLY "cosmic wisdom."** Never name channeled entities, never name transcript sessions or dates, never say "the archive says" or anything like it in spoken audio. (Sources are documented internally only.)
- The word **"density"** IS used in room titles and narrations (owner decision 2026-09-28).
- No entity names, no session numbers, no dates anywhere the player can see or hear. The metaphysics must be fully translatable into the game's own poetic language.
- Contemplative tone: ethereal calm, soothing, inward-pointing, no religious imprinting. Match the existing visual language (ink art, minimal UI, dark/quiet).
- Mobile-first: the owner plays on iPhone. Tap targets ≥ 44 px. Everything runs under BOTH the WebGPU renderer and the WebGL2 fallback.
- TTS text uses spelled-out numbers — no digits, no abbreviations, no markup, no stage directions (applies to any script you are asked to touch; the eight monument scripts are already in this form).

### 4.7 OPEN DECISIONS — ask the owner, do not decide for them
1. **Room 6 concept** ("The Merging" — orbs of light flowing into one radiant ocean): approved, or a different concept?
2. **Monument exterior:** how grand / where in the landscape? (Interior is specced; the approach is not.)
3. **Portal mechanics:** walk-through always (current spec) — or should later portals require finishing the room's narration? (Spec says never lock.)
4. **Narration replay UI:** small replay control per room (current spec) — enough, or a fuller in-room player?
5. **"The Beginning" on loop** in the monument — or a shorter ambient variant?
6. **Evolution of Spirit chapters** (The Path, The Greater Life, The Gift of Hardship, The Power of Thought, One): future rooms one day, or stay Listen-app-only?
7. **Galaxies Lesson 06 `whisper(...)` narration:** MiMo invented those lines (no transcript available) — retain, replace, or ground?

(Resolved 2026-09-28 and off the list: "density" stays in room titles and narration.)

---

## 5. NARRATION / AUDIO LAYER (all drafts — nothing is final)

**Status rule for every track below:** DRAFT. The owner is listening and has not approved any of them. You work with these files; you do not claim they are final, you do not mark them final, and you do not put monument tracks into the game until the owner approves the finals (delivered separately per §4.4).

### 5.1 The fourteen rewritten series tracks
All re-rendered September 29, 2026 with Aria (`avocado_v2:MAI_01`), speed 92; transcribed and verified loop-free. In this repo at `audio/narrations/<file>.mp3`; scripts at `docs/audio/scripts/<name>.txt`. They belong to the Listen app's four new series sections — they are committed here so you have them as reference material, not as game integrations.

| ID | Title | File | Series | Duration | Status |
|---|---|---|---|---|---|
| OW | Other Worlds | `other_worlds.mp3` | Cosmos | 307 s | DRAFT |
| LIGHT | The Architecture of Light | `atoms_and_light.mp3` | Cosmos | 311 s | DRAFT |
| WEATHER | The Unseen Weather | `psychic_greetings.mp3` | Cosmos | 302 s | DRAFT |
| ADEPT1 | The Call | `adept_1_the_call.mp3` | The Adept | 296 s | DRAFT |
| ADEPT2 | The Crucible | `adept_2_the_crucible.mp3` | The Adept | 321 s | DRAFT |
| ADEPT3 | The Radiance | `adept_3_the_radiance.mp3` | The Adept | 306 s | DRAFT |
| MALDEK | The World That Broke | `past_maldek.mp3` | The Archive of Past Choices | 225 s | DRAFT |
| MARS | The Red Desert | `past_mars.mp3` | The Archive of Past Choices | 286 s | DRAFT |
| ATLANTIS | The Drowned Bells | `past_atlantis.mp3` | The Archive of Past Choices | 278 s | DRAFT |
| EGYPT | The Stone That Remembers | `past_egypt.mp3` | The Archive of Past Choices | 276 s | DRAFT |
| STONES | The Stones That Sing | `practice_stones.mp3` | Ancient Practices | 291 s | DRAFT |
| PYRAMIDS | The Mountain of Initiation | `practice_pyramids.mp3` | Ancient Practices | 300 s | DRAFT |
| DISCIPLINES | The Daily Work | `practice_disciplines.mp3` | Ancient Practices | 330 s | DRAFT |
| OTHERS | What the Others Do | `practice_others.mp3` | Ancient Practices | 332 s | DRAFT |

Narration writing rules that made this series work (locked — apply to anything you touch):
- Poetic, flowing prose; commas and naturally connected sentences. Never bullet-like delivery, never chains of short fragments (the voice turns robotic).
- One emotionally coherent story per track, not a list of teaching points. One clear narrative spine; concrete scenes before abstraction; one beat per paragraph; gentle orientation/signposting.
- Spoken attribution ONLY "cosmic wisdom." Never name entities, transcript archives, sessions, or dates. Past-civilization material keeps "the old telling goes" / "it is said" / "whether history or mirror" framing — historical facts and received cosmology stay in distinct registers.
- Spelled-out numbers in TTS text — no digits, abbreviations, markup, or stage directions.
- Narration pacing (STYLE_GUIDE.md §5): voice fades in 0.4 s, fades out over 2 s, never cuts; subtitles linger 1.5 s after the voice ends; music bed ducks under speech; motion must never outrun the narration's emotional pace.

### 5.2 The eight monument scripts
Full text in the handover (`docs/density_monument_handover_v2.txt` §5); script files at `docs/audio/scripts/`. All are drafts — mechanically cleaned (archive references removed, "cosmic wisdom" only, D1 grammar fix); the deeper research/content audit (especially seventh-density claims) is still pending before the final re-render.

| Room | Script file | Audio (future master) | Draft dur. |
|---|---|---|---|
| [0] Monument of Creation | `the_beginning_script.txt` | `audio/densities/the_beginning.mp3` | 234 s |
| [1] First Density: Learning to Be | `density_1_script.txt` | `audio/densities/density_1.mp3` | 339 s |
| [2] Second Density: Learning to Grow | `density_2_script.txt` | `audio/densities/density_2.mp3` | 297 s |
| [3] Third Density: The Great Choice | `density_3_script.txt` | `audio/densities/density_3.mp3` | 300 s |
| [4] Fourth Density: The World of Love | `density_4_script.txt` | `audio/densities/density_4.mp3` | 348 s |
| [5] Fifth Density: The Hall of Wisdom | `density_5_script.txt` | `audio/densities/density_5.mp3` | 317 s |
| [6] Sixth Density: The Merging | `density_6_script.txt` | `audio/densities/density_6.mp3` | 291 s |
| [7] Seventh Density: The Gateway | `density_7_script.txt` | `audio/densities/density_7.mp3` | 273 s |

---

## 6. WORKING RULES (hard rules — the September 28–29 lessons, in writing)

1. **Build ONLY in `vy6ycr7tcc-debug/Animation`, on feature branches, opening PRs to main.** Never touch the dead `inward-journey` repo. Never touch the `listen` repo.
2. **Commit and push after every scene/milestone.** Never accumulate unpushed work. After each push, report the branch name and commit hash.
3. **The owner merges PRs. You do not merge.** Never write app code's merge yourself; open the PR and stop.
4. **One branch per feature.** Parallel work must touch non-overlapping files.
5. **No junk in the repo.** No scratch scripts, no `update_*.sh`-style helpers, no temp scaffolding merged to any branch. Delete helpers before the final push of a branch.
6. **Never call a scene done on typecheck/build alone** — §2.2 verification is the gate.
7. **Audio is delivered, not fetched** — §4.4 and §5. Never fetch the private `audio-library` branch; never re-encode, move, rename, or re-upload delivered audio.
8. **iPhone is the target.** The owner plays on iPhone/Safari. WebGL2 fallback compatibility is mandatory; tap targets ≥ 44 px.
9. **When in doubt about a decision in §4.7, ask the owner** — do not invent answers to open questions.

---

## 7. REFERENCE FILES COMMITTED WITH THIS PLAN (in the repo)

- `docs/claude-scene-redo-master-plan.md` — this document
- `docs/density_monument_handover_v2.txt` — the complete Density Monument handover (authoritative for the expansion)
- `docs/style/VISUAL_QUALITY.md` — visual quality bar
- `docs/style/ANIMATION_QUALITY.md` — animation quality bar
- `docs/style/STYLE_GUIDE.md` — style distilled from the game's own code (source of truth)
- `docs/audio/scripts/` — all 22 narration scripts: the 14 series tracks + the 8 monument scripts (drafts)
- `audio/narrations/` — the 14 rewritten series MP3s (drafts, not final)

*End of plan.*
