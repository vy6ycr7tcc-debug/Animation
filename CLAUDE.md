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
- 2026-09-25: Samuel, of stillness on his iPhone: "obnoxious when it gets in the view". The gathering spirits rushed in from up to 70 m, their wide veils streaking across the screen and folding into ladder-like rails.
  - Spirits drift (speed capped at 2.2–3 m/s) and, keeping company, circle above the head (radius 3.4 m, 2.8 m up).
  - Veils are thinner and softer, and their ribbon direction comes from the drawn curve, so they can't fold.
  - Spirits, veils and the stillness strokes fade near the lens and wherever they would pass between the camera and the wanderer (`outOfTheWay` in `creation.ts`, `vClear` in `communion.ts`). Keep new effects out of that corridor.
- 2026-09-26: Samuel: "it's like pixeling… we want the maximum resolution" (iPhone 17); keep the screen awake; the narrator "is repeating the same thing over and over"; save the session locally; the map's "Wake here" didn't work ("should be a tap on the map"); the orb underwater "shines too much and kinda blinds the view".
  - Resolution first (`src/core/quality.ts`): native (3x) on the top tier and never below 2x on a phone; the costly effects (AO, god rays, reflection, shadows, bloom) rest first. The controller ignores the first seconds and each arrival (`quality.hold`), treats a steady 30 fps (Low Power Mode) as a cap, and retries a tier after a long good run. The lakes' mirror renders at most 1.5x.
  - Screen Wake Lock (`src/core/awake.ts`), a menu setting (on by default); let go on Leave, asked again on return.
  - Background narration (`src/core/playlist.ts`): each voice once per journey, a minute or two of quiet between, then the narrator rests. Everything heard, the teachings and practices heard, passages spoken and archive narrations heard are saved (`SaveData.journey`); the start map offers "Continue where you were".
  - The map: a tap on a place, on open land, or on a name in the list takes you there (no confirm step).
  - Underwater: the orb is a soft light (dimmer core and halo, a faint lantern glow); kelp near the lens thins away (a bend-away displacement had smeared blades into slabs across the view).
- 2026-09-26: Samuel: "for each entity (Ra, Latwii, etc) create a character… they appear when a transcript from them is being played", and "a little character guide… on the settings or even on the map view".
  - Presences (`src/world/presences.ts`): while an archive narration plays, its first source's entity appears ahead and to the side as a figure of light in its own colour and form (Ra: gold, three turning rings; Q'uo: three lights meeting; Hatonn: green-rose, a breathing heart-light; Latwii: pale blue, darting motes; Oxal: indigo veil; Laitos: teal ripples; Nona: rose, rising notes; others: pearl in their own hue). Abstract light, never portraits or icons.
  - The guide (`src/world/guide.ts`, ⋮ → Guide, or "Ask the guide" on the map while travelling): somewhere new, the archetypes by realm, the groves, the orbs; "Walk with the guide" (a warm light leads, waits, circles the place on arrival) or "Take me there".
- 2026-09-26: research (three agents, relayed to Samuel): the flatness is mostly lighting (three even fill lights, no local light, fog flattening values, no grade), not the engine; stay on three.js; an engine change only helps natively (Unity/Unreal + $99/yr Apple). Living world: a saved "light field" all systems read and write, one shared breath, waves of light, spreading bloom, generative voices. Platform: Home Screen install protects saves from Safari's 7-day eviction; wake lock retried on touch; `storage.persist()` requested.
- 2026-09-26: Samuel's direction: the game is feature-complete but "feels like a skeleton"; make the most of the phone. Plan: Phase 0 (stop wasting the hardware), Phase 1 (port to three/webgpu WebGPURenderer + TSL with the WebGL2 fallback; replace `postprocessing`/`n8ao` with three's TSL post: bloom ~0.88/0.7, GTAO, TRAA, AgX), Phase 2 (fill the world: compute grass, particles, GPU flocking, local light, probes, impostors, KTX2), Phase 3 (a real sky whose planets and stars carry archive narrations, data-driven `vessel` field). Stay on Three.js, never Babylon. Stop after each phase for Samuel to see it on his iPhone.
  - Phase 0 (`src/core/quality.ts`, `src/main.ts`): phones start on the top tier (native dpr, up to 3). When slow, a render scale steps down by 0.1 (the browser upscales) before any effect rests, never below 2x on a phone; it climbs back first when frames are good; a failed tier is retried after ~30 s; Low Power Mode's steady 30 fps counts as a cap. All shaders compile before the first frame (`renderer.compileAsync`), and the controller waits for it. Hidden readout: add `#stats` to the URL, or tap ⋮ five times quickly (remembered on the device): renderer and GPU, fps, tier, dpr, render scale, pixel size, the last quality decision, shader status, draws.
  - Phase 1 (on `claude/vite-threejs-scaffold-yym13y`, published at `/next/` beside the live game until Samuel approves it on his iPhone): `WebGPURenderer` with automatic WebGL2 fallback (`?webgl` forces it). Every shader is TSL (`src/gpu/tsl.ts` holds the shared pieces: hashes, noise, the height fog `ijFog` as `scene.fogNode`, `outOfTheWay`, `spriteCloud`). Rules learned:
    - WebGPU draws points one pixel wide, so every soft point is an instanced `Sprite` + `PointsNodeMaterial` (`spriteCloud`, `worldPoints`); inside a point use `uv()`, never `gl_PointCoord`.
    - Node materials fog by default: glow materials need `fog: false`, or their quads show as boxes.
    - Quantized model data (KHR_mesh_quantization: `wanderer.glb`, `rocks.glb`) becomes floats on load (`floatAttributes` in `core/assets.ts`); WebGPU's shadow pass misread it (one rock covered the whole shadow map).
    - Post (`src/gpu/post.ts`): GTAO, underwater, screen-space god rays, TRAA, bloom 0.88/0.7, AgX, vignette; `?aa=smaa|none` to compare. The lakes use three's `reflector()`, rendered before the frame; the sky, the grass and the through-the-ground lights are on `NO_MIRROR_LAYER`.
    - The shadow map resizes itself from `mapSize` (never dispose it); `PCFShadowMap` (WebGPU has no PCFSoft).
    - Known gap: the roots seen through the ground (`depthFunc: GreaterDepth` lines) don't show yet.
- 2026-09-26: Samuel, after playing: flying with the stick let go should glide; flying must not look like swimming ("lame"), "Superman sort of posture"; the sky "more prevalent", with more colours (sunsets, mornings, night) changing as you walk, not tied to time; he loves the earthy parts with lots of soil texture ("higher end game"); "tenuous" cold winter sunset/sunrise colours; near pitch-black night; galaxies and nebulae.
  - Flight (`controller.ts`): stick released → a steady glide ahead (7.5 m/s, sinking 1.6 m/s); hold still rises; "Land" still lands. Pose (`wanderer.ts` `flyPose`): no swim clip; the body tips flat about the hips, both arms stretched ahead; hovering stands upright, arms low.
  - Moods (`src/world/moods.ts`): the sky, fog colour and density, clouds, moon/sun light, hemisphere light and the baked sky reflection blend by where you are: home a moonlit night; east (the Body) a cold winter sunrise; west (the Spirit) a violet-amber sunset; north (toward the Choice) the deep night, nearly black. Blended over ~250–1100 m from the shore, eased.
  - Sky (`sky.ts`): Milky Way band with dust lanes, nebulae (rose/violet/teal fbm clouds, mostly near the band), four far spiral galaxies, more stars in the deep night; the low sun's glow at dawn/dusk. The water mirrors a cheaper version (no fine detail).
  - Ground (`terrain.ts`): the scans' texture reaches farther (to ~520 m) with stronger relief, more of their own colour, and broad stretches of warm bare earth using the rock scan's grit.
- 2026-09-26: Samuel: "Continue everything and finish the game". Phases 2 and 3, on the same branch (`/next/`):
  - Sky vessels (`sites.ts`, `vessels.ts`): each narration may name its vessel, `"vessel": "tree" | "planet" | "star"`. Default split (proposed to Samuel): groves' episodes stay fruit; of the orbs, a quarter become stars far overhead (620–1000 m, a bright core, halo and four slow rays), a quarter great planets in the sky (26–42 m across, 260–420 m up, ringed), a quarter planets in the deep, the rest small planets over the land. Stars and sky planets have their own pale marks on the map (a sparkle, a ringed disc).
  - Shooting stars in the sky shader, often in the deep night.
  - Light on the land (`lightfield.ts`): lanterns, beings, crystals, spirits, flowers and the wanderer splat their glow into a 160 m top-down texture that follows you; the ground and etched stone add it as light.
  - Grass: 7 × 7 tiles of 360 blades (fades out at 32–50 m).
  - Forests beyond (`forest.ts`): past ~96 m, each tree the world would grow (same cells as `creation.ts`) is a camera-facing likeness of its own kind, drawn once from its grown limbs; out to ~480 m.
- 2026-09-26: Samuel, after playing the WebGPU build: stillness should "remove the cloudy glass, just make the heart shine a bit"; the right button and ⋮ "don't respond"; "no narration anymore"; "where are the planets and narrations"; the sunset colours and changing sky weren't there; "many comments… were not really respected".
  - Stillness: the gas aura is gone; a small warm light breathes at the heart (`communion.ts` `heart`). The streams stay.
  - Narration never goes silent: once the journey's voices are heard, the nearest unheard archive narration plays (`playlist.onRunOut`), 35–60 s of quiet between. (Superseded the same day: the archive never plays by itself; see below.) "Just the music" rests the narrator for 15 minutes, not for good; the player's end card clears itself after 15 s. The narrator setting is saved (`settings.voices`).
  - The sky moods start turning ~80 m from the shore and are full by ~450 m (east sunrise, west sunset, north deep night, south the blue hour before dawn).
  - Sky planets and stars hang lower (stars 150–240 m over the ground; planets later lower still, below); the map marks every grove, planet and star; their names show from farther away.
  - The milky "too diffused" look had one cause, a port bug: outside `positionNode` (in colour and varyings) `positionLocal` is the already moved position. The flowers' brightness grew with distance from the world's centre (~80× at 400 m, which bloom smeared into a haze), grass fogged as if far away, the crystals' shafts vanished, kelp misjudged distance. Rule: read `positionGeometry` in colour and varyings; keep `positionLocal` inside `positionNode` (there it carries an InstancedMesh's transform).
  - The vignette only darkens (mixing toward grey lifted the night's corners into haze).
  - ⋮ opens on the touch itself: a phone makes no click of a tap while the other thumb holds the stick, so it didn't respond while walking. The round button already worked that way. Errors now show on screen ("Problem: …") so a phone-only failure can be read from a screenshot.
- 2026-09-26: Samuel, from his iPhone (underwater screenshot): "everything is too diffused now"; flying still looked like swimming and didn't glide (he was on the old live build); "the experience to go deeper underwater is awful"; "controls aren't great".
  - Crisp over soft: SMAA is the default (TRAA softened the whole image and left ghost trails behind moving motes); bloom radius 0.45; the home night's haze a little thinner (0.0044).
  - Clearer water: absorption about halved (forms read to ~30 m), brighter moonlight shafts.
  - Going deeper takes no effort: let go of the stick and the button under the water and you sink slowly (1.1 m/s) toward the floor; hold to rise; the stick swims where you look.
  - Flight: whenever the button isn't held it's a glide (7.5 m/s, sinking 1.6 m/s), steered by the stick, straight on when it's released.
  - The WebGPU build became the live game (merged to main); the pre-WebGPU game stays at `/classic/` for comparison.
- 2026-09-26: Samuel, from his iPhone: controls — "the response and intuitiveness… check how other similar format games config their controls"; "the planets and orbs need to be on the sky"; glare "should be glowing but contained… only ray tracing from sun or moon or water reflection or a tiny bit of bloom, not this ever spreading glare"; then (screenshots) "arms back for flying"; "episodes are popping out of nowhere instead of you tapping on a planet (which are missing) or a tree fruit or a rock"; a "weird split" when flying high; "a tiny bit choppy… reduce the tree count… more variety of elements… more flowers rising above the ground"; a collapsible archive card and "a semi circle top left with play pause in the middle" to go back; "the sky is perfect now… add some like these too: dusk, haze, sunset".
  - Controls, after Sky and Genshin (`core/input.ts`, `player/controller.ts`): a thumb anywhere in the lower left takes the stick (it comes to the thumb, goes home on release; a floating stick is found faster); the inner half walks, beyond it the walk rises smoothly into a run (no jump at the edge); scaled dead zone; quicker start (a walk within ~0.1 s) and turning; tap the button in the air to take off, and in flight a tap is a wingbeat (hold still rises); the camera swings behind sooner and firmer in flight; a finger's tap no longer walks you to the spot (look flicks sent the wanderer off); ⋮ and the mini-player answer on the touch itself.
  - The archive never plays by itself: it starts only from a tapped planet, star or fruit (the auto-play above is gone). When the journey's voices are all heard, a quiet word every few minutes says where one is waiting. Rocks carry no narrations (Samuel's "or a rock" not yet acted on; ask).
  - All orbs are in the sky, planets and stars in turn (`sites.ts`; `Realm` is "star" | "sky"): planets 18–30 m across, 50–90 m up and 240 m–1.3 km out, low enough to rise over the horizon of a phone's view (higher, they sat above it), tappable from the ground below; stars 150–240 m up (fly).
  - Glow contained: bloom 0.5 strength, threshold 0.9, and its two widest blurs left out (`bloomTintColors`), so it never spreads a veil; planets' and stars' halos a thin rim; lanterns', spirits' and held orbs' halos smaller. God rays from the moon/sun and the water's reflection stay. Keep new glows contained.
  - Flight pose: arms swept back along the sides, lifted a little (`flyPose`). The hand ribbons are capped at 1.4 m (fast climbs stretched them into strings, as if hung from them).
  - The splits when flying high: below the horizon the sky is the far haze's own colour (`sky.ts`), so the world's edge never shows as a line; the moon's shadow box stays on the land below you (up high it hung in the air and the ground under it went dark and speckled).
  - Fewer trees (about half, in groves with open meadow between); the far likenesses have small glints, not white puffs. New: rising flowers (`world/blooms.ts`): tall curving stems with a spiral-curled leaf and an upright cup of petals around a light, in drifts in the meadows; they rise one after another as you come within ~18 m and sink back some while after you've gone.
  - Archive player: the card has ‹ fold and Back 15 s, and folds itself after 10 s into a half-moon on the left edge (play/pause in the middle, back 15 s above, the card below, the curve filling with progress).
  - Sky moods in eight directions (`moods.ts`): E sunrise, NE haze, N deep night, NW dusk, W sunset, SW ember (red sunset), S blue hour, SE pink dawn; neighbours blend.
- 2026-09-26: Samuel: "the transcript audios should be loaded on demand… tap on the artifact that stores it (planets, crystals, trees)… then you have the random rotation narrations"; "I want them to be able to walk away and listen to it even if the screen locks and auto load next one"; "caves, mountains with snow, palm trees, tall grass"; the player "top right corner, not the side"; "dusk should be reds and blues together".
  - Archive audio streams (`ui/transcriptPlayer.ts`): one `<audio>` element, started inside the tap, plays each recording as it downloads (it used to download and decode it whole, ~100 MB each). Being media, not Web Audio, it keeps playing with the phone locked or the game hidden; Media Session puts it on the lock screen (play/pause, back 15 s, forward, next). When one ends the next follows by itself (`tp.next` in `main.ts`: the archive's order, unheard first); while hidden, at once (timers sleep there). The end card's two choices are gone; closing the player lets the journey's voices speak again. Its volume follows the menu's on desktop (iOS ignores media volume).
  - Crystal gardens: a grove whose biome is stony (stone circle, cliff, observatory hill, stone bench, white sand; or `"vessel": "crystal"`) grows as a great crystal ringed by one crystal per episode (`vessels.ts` `buildGarden`, the world's own `crystalMaterial`); the one speaking burns brighter; map mark a tall diamond. Rocks carry no narrations.
  - The player is top right: the card under ⋮, the half-moon hanging from the top edge beside ⋮ (back 15 s, play/pause, next, the card below).
  - Dusk: deep blue above, the sun's red low along the horizon (a weak, low glow, so the two don't blend to lavender).
  - Tall grass: drifts in the meadows up to ~2.4 m, arcing under their length, darker with pale heads (`life.ts`). Palms on beaches by the water (`world/wilds.ts`): leaning ringed trunk, arching fronds curling into spirals at the tips, seed-lights; they sway. Caves (`terrain.ts` `CAVE_SITES`, built in `wilds.ts`): up to 7 hollows of etched stone in steep hillsides, the mouth downhill, crystals at the back, glow-worms, walls as colliders; the rock dissolves where it would hide the wanderer (`maskNode` + `outOfTheWay`); trees and groves keep clear. Snowy mountains (`terrain.ts` `PEAKS`): five ridged massifs 240–380 m high, 1.6–2.9 km out, away from every home; the high snowfields whiter.
- 2026-09-26: Samuel (screenshot, flying low over the land): soft coloured blobs over the ground, "very annoying… I think it's the galaxies reflection". It was: glossy things reflect `scene.environment`, baked from the full sky, and blurred, its nebulae, galaxies and bright star became blobs sliding over the land. The environment now bakes a plain sky (`buildSky(true)`, `skyColorPlain`: colours, low sun, moon glow, no night lights). The hand ribbons rest in flight (they trailed down like stilts while climbing).
- 2026-09-26: Samuel: "when flying it should be more like a mermaid swimming". `flyPose` adds a dolphin kick: legs drawn together as one tail, a slow wave down the body (spine, thighs, shins, pointed feet, each later than the one above), faster and fuller when moving, slow when hovering; arms stay swept back.
- 2026-09-26: Samuel: glare and a sheen over the ground, "it also makes the game choppy". The sky's reflection was re-baked (PMREM) every ~4 s while travelling between moods: a hitch on the phone and a jumping sheen. It is now baked once; the moods' lights carry the colour change; the sky's sheen is 0.7× as strong. The wanderer's own light is quieter (point light about half, its pool on the ground 3.5 m at half strength). Don't re-bake the environment per frame or per mood.
- 2026-09-26: Samuel: "I don't see the player"; "remove subtitles". The half-moon now rests in view top right whenever you play (`tp.setResting`); with nothing playing its ▶ begins the first narration of the archive not yet heard (and » too), then it carries on as before; tapping a vessel opens the card, which folds itself after 10 s. Subtitles are gone (no menu switch; `subtitlesOn = false`), overriding the earlier "subtitles always on".
- 2026-09-26: Samuel: "remove that annoying chasing character". The entities' figures (`presences.ts`) no longer appear during archive narrations (not loaded, never shown); the entity's name still whispers once when a narration begins. Supersedes the presences entry above.
- 2026-09-26: Samuel: "the glare still chasing the floor and it makes it choppy… you don't need to be ray tracing the floor"; his screen showed "GPUDevice.createCommandEncoder: Unable to make command encoder" (the GPU device lost). The ground is matte (roughness 1, sky sheen 0.35×); the wanderer's point light and its light pool on the ground are gone (one light fewer for every material). On a lost GPU device the game saves and reloads (`renderer.onDeviceLost`), after the page is visible again.
- 2026-09-26: Samuel: "for flying… it becomes a flame instead of the body, and just use physics for that to look natural". In flight the body fades into a flame (`player/flame.ts`), as in water into an orb: a small breathing core, and particles born there that rise by buoyancy, slow by drag, swirl with a little turbulence, keep a quarter of the flier's motion (so they stream behind in flight and lick upward in a hover), shrink and cool white-gold → gold → rose ember. Contained: dim particles, only the core blooms. Landing, the body forms again. (The mermaid kick above still drives the hidden skeleton.)
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
- No subtitles (Samuel, 2026-09-26: "remove subtitles").
- iOS 17+: set `navigator.audioSession.type = "playback"`, so sound plays with the silent switch on.
- Start audio inside the first tap ("Touch the water to begin").
- Keep music above about 200 Hz; phone speakers lose the low end.
- Narration voices: Aria is `avocado_v2:MAI_01` (warm female), Rowan is `avocado_v2:miles` (soothing male), speed 92.

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
