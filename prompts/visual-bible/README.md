# VISUAL BIBLE — Ancient Civilizations & New Age Redo
**Purpose:** inspiration pack for the master build prompt (effort increase). The agent reads these images and extracts mood, palette, architecture, and nature — never copies them literally. All images are token-economy sized (~768px, 856K total).
**Game context:** Inward Journey — contemplative, painterly, deep blues/golds, moonlit. Follow `docs/style/` (VISUAL_QUALITY, ANIMATION_QUALITY, STYLE_GUIDE) on everything.

## ATLANTIS — the drowned city
Direction: concentric-ring city plan (Plato), sunken marble, coral-dusted columns, light filtering through water. Majestic, not kitschy.
- `atlantis-rings.jpg` — **the canonical plan**: concentric rings of land and water. Use as the city's layout logic.
- `atlantis-city.jpg` — above-water grandeur: white stone, harbors, scale. The memory of what it was.
- `atlantis-underwater.jpg` — the drowned present: broken columns on the seabed, blue-green light, marine growth. The mood to build.

## LEMURIA — the jungle continent
Direction: Southeast Cambodia first (Angkor Wat swallowed by jungle), with touches of Madagascar (baobabs, alien trees) and Australia (red rock, vastness). Lush, ancient, breathing.
- `lemuria-angkor.jpg` — temple and jungle as one organism. This is the primary architectural language.
- `lemuria-baobab.jpg` — Madagascar: impossible trees, otherworldly silhouettes. Scatter sparingly.
- `lemuria-uluru.jpg` — Australia: monolithic red rock rising from flat land. One landmark, not a theme.

## THE NEW AGE (transition) — ruins rebuilt and flourishing
Direction: the player walks a forest path that opens onto ruins — then the ruins come ALIVE: stones rise, walls rebuild, gardens bloom in accelerated time. The visual thesis is **Nehemiah: the glorious ruins made new, the new earth**. Joyful, luminous, earned.
- `newage-flourish.jpg` — the end state: stone and garden interwoven, wisteria over arches, tended and wild at once.
- `newage-rebuild.jpg` — reconstruction in progress: scaffolds of light, half-built walls. The midpoint of the animation.
- **Animation note (owner):** the current "random people sitting + alien with head-beams" is lazy and silly. The rebuild animation IS the scene's centerpiece — choreograph it: stones levitating into place, vines blooming in time-lapse, light washing through. No head-beams. Ever.

## THE BATTLE OF HEAVEN
Direction: celestial, painterly, overwhelming light — golden clouds, winged figures, radiance vs shadow. Awe, not horror. The owner hasn't seen a working version; treat as a fresh build.
- `battle-heaven-1.jpg` — the register: gold vs blue-grey, swirling hosts, divine light breaking through. Match this palette.
- `battle-heaven-2.jpg` — compositional energy: diagonal motion, figures in flight, luminous center.

## Global rules for the agent
1. Extract **mood, palette, and structure** — never clone a photo into the game.
2. Every scene keeps the game's contemplative register: no horror, no kitsch, no photorealism-breaking spectacle.
3. One branch + one PR per area. `?shot=` stills with read_image_file before calling anything done. The owner merges.
4. Arrival triggers: every tour-bearing monument starts its tour when the player arrives — no dead monuments.
