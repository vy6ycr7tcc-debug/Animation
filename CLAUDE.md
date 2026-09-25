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
  - Built first for the seven Mind archetypes; all 22 since Samuel's "implement the 22" (below).
  - The zip he uploaded (`reference/inward-journey-game-package.zip`) holds the same recordings already in `public/audio/`.
- 2026-09-25: Samuel: the look was "a bit too 2D… like a croquis instead of an actual working game". He wants "Children of Light level" smooth graphics and depth; it runs on good phones.
  - Depth comes from form, light and air, not drawn lines:
    - height fog with moonlit in-scattering in every material (`src/world/fog.ts`);
    - real terrain out to the mountains, in two levels of detail;
    - sand ripples and glitter;
    - sky-seen shading in hollows;
    - soft moon shadows from trees and rocks;
    - clouds;
    - a luminous night sky.
  - Linework stays only as faint traces: etched stone, root lines up close, the spawn mandala.
- 2026-09-25: no live AI conversation (too sophisticated). Instead, preset recorded answers:
  - You sit with an archetype and choose a question or a feeling; it answers with Samuel's recording.
  - Choices and answers live in `content/dialogues.json`, and recordings in `public/audio/answers/<numeral>/<prompt>.mp3` (`src/core/dialogues.ts`).
  - All 176 sit-down answers (22 archetypes × 8) are recorded, with transcripts and a `source` object in `content/dialogues.json`.
  - He's considering emotions: prompts have a `kind` ("question" or "feeling").
  - Seated actions: ask, rest in silence (stars come out, time slows), offer light, stand up.
- 2026-09-25: Samuel: "Whenever done push to mainline." Merge finished, verified work into `main` without asking.
- 2026-09-25: Samuel likes the female voice and not the male one.
  - Only the female voice plays.
  - Male-voice tracks (J02, J04, J06, J08, J10) are skipped by the background playlist until `narration/revoice-female.sh` has made female copies in `public/audio/female/`.
- 2026-09-25 (later): Samuel found the fluid body's shape "really weird". Replaced:
  - a normal humanoid, transparent: the recorded figure's own mesh as glowing glass (`src/player/lightBody.ts`), for the wanderer and the beings;
  - in water, the wanderer becomes an orb of light;
  - new moves: run (hold; running off a slope glides) and free flight (F or Fly: rise, sink, hover, as high as you like).
  - The fluid-body entry below is superseded.
- 2026-09-25: Samuel wants the world "bigger, bigger, bigger". Size costs no storage: the land is computed from a formula and streamed.
  - The world is about 8 km across (`WORLD_R`), with mountains at its edge and kilometre-scale highlands, lowlands and great lakes.
  - The archetypes' homes are spread up to about 1 km from the shore.
  - A third ground level reaches about 2.5 km, for views while flying.
  - Clouds wrap around the camera.
- 2026-09-25: better graphics with real assets, keeping the art direction (all CC0/MIT, credited in `CREDITS.md`, shipped with the game):
  - Poly Haven scans for ground (sand, meadow, rock), stone and bark (`src/world/textures.ts`), tinted to the moonlit palette;
  - three scanned boulders (`public/models/rocks.glb`, built by `tools/build-rocks.mjs`);
  - N8AO ambient occlusion on the two higher quality levels.
  - Code-generated shapes stay where Samuel's direction asks for them: round, curling trees, crystals, spirits.
- 2026-09-25: Samuel's Q&A package (`reference/archetype-qa-audio.zip`):
  - 66 answers (22 archetypes × who, teaching, practice) are in `public/audio/answers/<numeral>/{who,teach,life}.mp3`, with transcripts in `content/dialogues.json`.
  - 21 passage narrations are in `public/audio/passages/`, with transcripts in `content/passages.json`. They play on the road between archetypes (below).
  - The scripts and audit report are in the zip.
- 2026-09-25: the feelings became one draggable heart spectrum: "How is your heart right now?", from shadow to light.
  - Five anchors per archetype: lost, afraid, still, bright, radiant.
  - Releasing the drag plays the nearest anchor (`A-<numeral>-<anchor>`).
  - The anchor recordings are in (2026-09-25).
- 2026-09-25 (later):
  - flight has no practical ceiling, and the climb speeds up the longer you hold it;
  - diving (hold Down or C while swimming) leads to a glowing sea floor (`src/world/underwater.ts`);
  - stillness turns the wanderer inward: head bowed, hands at the heart, aura, streams of light, and the whole network lights up (`src/world/communion.ts`);
  - creatures (`src/world/creatures.ts`): horse herds that come close in stillness, and bird flocks.
- 2026-09-25: **transcript orbs and groves**, a free-exploration layer separate from the archetype stations:
  - Everything binds to `content/transcript_orbs.json` (`orbs[]`, `trees[].episodes[]`).
  - The real audio is live: 86 narrations in `public/audio/orbs/` (8 orbs, 18 groves). Wired with no code change: the bindings read the JSON.
  - Placement from the data alone (`src/world/sites.ts`): about a quarter of the orbs in the sky, a quarter underwater, the rest on land; groves by `suggested_biome`.
  - Visuals (`src/world/vessels.ts`): planet-like orbs; one great tree per grove, with a fruit per episode.
  - The quiet player (`src/ui/transcriptPlayer.ts`):
    - it starts only on a tap and never autoplays;
    - it has pause/resume, source and close;
    - captions read "An interpretive narration after …" or "Quoting …", one line per source;
    - at the end it offers "Continue with background narration" or "Just the music".
  - ⋮ → About carries the L/L Research disclaimer.
  - The real delivery (8 orbs, 18 groves) needs no code change.
- 2026-09-25: Samuel: the crude deer were "horrible" ("if you're gonna do the most basic shape… just don't"). Rules:
  - Creatures come from real animated models or are left out.
  - Now: horses, storks, flamingos and parrots by mirada (ROME, via the three.js examples), drawn in the glass-light material.
  - The deer and hoppers are removed.
- 2026-09-25: stillness must not look like "a lamp":
  - the aura is a wispy luminous gas (point puffs torn by noise);
  - the streams are winding strokes of light flowing in and out (made smooth and soft later the same day, below);
  - rocks and crystals you stop before vibrate light (waves over their surface, motes streaming off; `vibeUniforms`).
- 2026-09-25: Samuel: the character's glow was "too much"; it should be relaxing, "like a timid light… embodying the thing".
  - The body's own light is quiet: low inner emission and a soft edge.
  - The halo, point light, motes and ribbons are toned down.
  - Bloom follows the community's standard advice: a high threshold (0.88) and gentle strength (0.7), so only truly bright things glow.
  - Keep new effects in this register.
- 2026-09-25: controls simplified after Samuel found up/down unintuitive and disliked the Down button. Modelled on Sky: Children of the Light.
  - One round button: tap to jump; hold to take off and rise (it accelerates); let go to drift down.
  - Run by pushing the stick to its edge.
  - One contextual word beside the button: "Land" while flying (tap), "Dive" in water (hold).
  - The Run, Fly and Down buttons are gone. Keyboard: Space, Shift, C/L.
- 2026-09-25: Samuel, from his iPhone: the stillness effect was "not the most pleasant" (dashed, chain-like lines and a brownish haze), and he asked for a "360… classic joystick".
  - Streams are now smooth, unbroken strokes of light: a soft core in a glow, no bristle texture, never thinner than a few pixels (thin ribbons broke into dashes on the phone). Fewer of them (about 8 in, 5 out, a few between), drawn slowly, with slow swells of light travelling along. They melt into the aura before they reach the body.
  - The aura is pale mist (warm pearl to moonlit lavender), never orange; each puff stays clear of the ground, so the ground doesn't cut it in a hard line.
  - The spirits' veils are continuous ribbons along a smoothed path; as dots they pulled apart into bead chains when a spirit moved fast.
  - The wanderer's halo is no longer depth-tested, so the ground doesn't slice it along the feet.
  - Movement is a classic, always-visible 360° stick fixed bottom-left. Touching on or near it takes it, and the knob goes to the thumb; walking is analog, running is at the edge (the ring turns gold). Look-drag works anywhere else.
- 2026-09-25: Samuel: "implement the 22", "make the map easier to navigate", "you can do some underwater, make waters deeper", "diving is quite poor and the underwater world is awful", and "sometimes the audios overlap when sitting with an archetype".
  - All 22 archetypes are beings (`src/world/beings.ts`), recreated from the cards (`reference/IMG_0035–0056`; the photos are not in deck order). Where a card and the recorded voice differ, the being follows the voice (VIII Strength with the lion, XI Justice with scales and sword). XII and XXI (archive gaps) are drawn dashed and unfinished.
  - Homes (`src/world/terrain.ts` `WISHED_SITES`, by kind: land, high, shore, deep, island): the Mind's seven unchanged around the shore; the Body east; the Spirit west; the Choice on an island in the northern lake. XVIII and XX live on the floor of deep lakes (a column of light and a ring on the water mark them). The Body and Spirit homes are quiet (`Home` in `stations.ts`); the being carries the card's forms.
  - The Q&A package is wired as its own design says (the tunnel): arrival speaks the Threshold (the Mind keeps its J narration; the others "Who are you?"), stepping within ~3.4 m the Walk (Q2), sitting (or resting still before an underwater being) the Heart (Q3), and after leaving an archetype the passage P(n) is the next voice (`updateTunnel` in `main.ts`, `content/archetype_qa.json`).
  - Audio overlap fixed: a play token so a track still loading never starts after another was asked for (a double tap used to start two copies), a quick handoff between voices, and no background narration while seated. Decoded audio is cached for only the few most recent tracks (a long orb decodes to ~100 MB; Safari reloads the page when memory runs out).
  - The map (`src/ui/map.ts`): pan, pinch/scroll/−/+/All, tap to choose then "Wake here", places listed by group, marks by group shape (circle, diamond, triangle, star) and a wave for homes in the deep.
  - Water is deeper (below the shallows, depth × up to 2.6). Diving is Abzû-like (`controller.ts` `swimUnder`): tap to dive, swim where you look, tap to stroke, hold to rise, "Surface" word, hold at the surface to fly out.
  - Underwater (`src/world/underwater.ts`): absorption by colour with depth, world-fixed moonlight shafts, Snell's window, the orb as a lantern; kelp (dark blades, rising specks) that parts around you and the camera; caustics on the floor (`terrain.ts`); marine snow; bubbles; muffled sound. The procedural jellyfish and point-fish are gone (house rule); Quaternius's CC0 Animated Fish Pack (fish schools, mantas, dolphins, a whale) swims in glass light, brighter than the wanderer's (`lightBodyMaterial` glow option). AO and god rays rest underwater.
- 2026-09-25: research (two agents): graphics — stay on WebGL for now; first fix iPhone foundations (audio memory, the quality controller under Low Power Mode's 30 fps, context loss, shader precompile), then a light map so lanterns, beings and spirits light the ground, dense GPU grass, a richer night sky, impostor forests, KTX2 textures, spatial audio, Home Screen install; WebGPU/TSL as a measured phase 2. Underwater — the plan above.
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
- `reference/RA_EVOLUTION_HANDBOOK.md` (added 2026-09-25) is Samuel's game bible:
  - cosmology, densities, the 22 archetypes card by card (Part XII);
  - dialogue seeds (XIII), a bestiary of beings (XIV), design notes (XV).
  - It is paraphrase with archive citations; verify against the theory file before quoting anything.
  - Use it to enrich content and creatures. Samuel's current focus is visuals.
- The Ra tarot deck: `reference/IMG_0033–0056.jpeg`. The overview chart: `reference/BE9C2465-….png`.
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
