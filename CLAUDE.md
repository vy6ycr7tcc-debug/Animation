# Inward Journey — Three Islands (web 3D game)

## What this is
A contemplative 3D browser game for Samuel. Mind, Body and Spirit are three floating islands in the ether. Each island holds seven places, one per archetype: Matrix, Potentiator, Catalyst, Experience, Significator, Transformation, Great Way. That makes 21 places, based on the Law of One (Ra) tarot archetypal mind.

The visitor wanders, becomes still near a place, and it opens: light, sound, and one spoken line.

It is art, not doctrine. There are no scores, no urgency, and no telling people what to believe. It should leave visitors quieter, not just impressed.

Samuel works mainly from an **iPhone**. Mobile Safari performance and audio are first-class requirements.

## Source material (authoritative)
- `reference/theory/Mind__Body__Spirit___Foundational_Theory.md` holds verbatim Ra/Q'uo quotes per archetype and the 21 narration lines (section c). Never invent quotes or session numbers.
- Archive gaps: the Significator of the Body (12) and the Great Way of the Spirit (21) have no Ra definition. Mark them visually as open or unfinished (dashed or incomplete forms).
- Ra's teaching order (88.24): 1, 8, 15, 2, 9, 16, 3, 10, 17, 4, 11, 18, 5, 12, 19, 6, 13, 20, 7, 14, 21.

## Art direction
- **Primary references:**
  - `reference/drawings/samuel-art/`: Samuel's own work. Fine white or gold linework on dark grounds, spirals, sacred geometry, handwriting that becomes architecture, mirrored symmetry.
  - `reference/drawings/egyptian-tarot-cards/`: the Egyptian-style tarot deck Ra discussed.
- **Style:** Egyptian and pre-Columbian art, abstracted and respectful. Signs are invented in the spirit of those scripts, never copied.
  - **Mind:** Egyptian temple. Pylon gate, sphinx avenue, painted papyrus colonnade, obelisk over a lotus pool, winged sun disk, ibises.
  - **Body:** Mesoamerican and Andean. Talud-tablero pyramid with red panels and step-fret, stair with serpent heads, braziers, Inca fitted stone, a feathered serpent in flight, a Nazca hummingbird drawn in light below.
  - **Spirit:** night. Basalt chakana platform, monolithic sun gate holding a veil of light, carved stelae, Nut's star-body arch, a turning sun-stone calendar, the solar barque crossing.
- **Mood:** midnight blue, pearl, dim gold, blush, occasional turquoise and jade. Calm, deep negative space, fog, glow.
- **Avoid:** New Age clichés, gamification, flashing, and walls of text.

## Current state
`prototype/three-islands-v3.html` is a working single-file prototype in raw WebGL1. It has:
- all 21 places, stillness to open, and the narration flow;
- threads between islands, the teaching-order light column, the Places menu, and the ending;
- reduced motion, keyboard use and accessibility.

**Port its behaviour and design. Do not port its renderer.** Its weaknesses:
- procedural low-poly shapes;
- no shadows, textures or real assets;
- the device voice stands in for the narrators;
- it has only been tested in a simulated browser.

`prototype/ether-crossing.html` is piece 1 (the threshold) and is a possible intro scene.

## Target stack
- Vite, TypeScript, Three.js, and `postprocessing` (pmndrs): bloom, god rays, SMAA, vignette.
- Assets:
  - glTF/GLB models, Draco or Meshopt compressed;
  - KTX2 textures;
  - HDR environment;
  - Samuel's drawings as texture and decal sources for glyph panels.
- Audio:
  - Web Audio;
  - on iOS 17+, set `navigator.audioSession.type = "playback"` so sound plays with the silent switch on;
  - start audio and the first narration inside the Enter tap;
  - keep music above about 200 Hz, since phone speakers lose the low end.
- Deploy to a static host (GitHub Pages, Netlify or Vercel) so Samuel can test on his iPhone. During development, run `vite --host` and use the LAN URL.

## Quality bar
- Materials that react to light: sandstone, basalt, gold, water.
- Soft shadows, fog with depth, light shafts through the gates, GPU particles.
- Animated creatures: the serpent, the winged disk, the ibises, the barque.
- The camera glides smoothly.
- **Opening a place:** the disk ignites, gold wings unfold, a beam of light rises, and its seven signs orbit upward, all with sound.
- **Performance:** 60 fps on a recent iPhone and at least 30 fps on mid-range devices, with adaptive quality (pixel ratio, shadow resolution, effects).
- **Accessibility:**
  - pointer, touch and keyboard all work;
  - reduced motion is supported, both automatically and as a toggle;
  - subtitles are always on;
  - a Places menu offers travel for screen readers;
  - no personal data and no tracking.

## Narration
- **Voices:** Aria is `avocado_v2:MAI_01` and Rowan is `avocado_v2:miles`, speed 92.
- **Who speaks what:**
  - Mind: Aria.
  - Body: Rowan.
  - Spirit: alternating, starting with Aria.
  - Opening and closing: dialogue between the two.
- **Generating the files:** run `sh narration/generate.sh` wherever Samuel's `tts` CLI is installed. It writes `opening.mp3`, `s01`–`s21.mp3` and `closing.mp3`.
- **Playback:** the game plays those files, falls back to the device voice, and always shows subtitles.

## Milestones
1. Scaffold the project and deploy it. Confirm that Samuel hears sound and sees 60 fps on his iPhone.
2. Port the mechanics from the prototype (movement, places, narration, threads, ending).
3. The Mind island at full quality: models, materials, lighting, animation. Review with Samuel.
4. The Body island, then the Spirit island.
5. Integrate the narration audio and the soundtrack.
6. Polish, performance pass, and accessibility pass.

Ask Samuel before large aesthetic decisions. He expects the transcripts to stay the authority on meaning.
