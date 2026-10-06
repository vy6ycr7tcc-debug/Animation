# Wanderer Area ("The Long Descent") — Visual Design Treatment

How the area looks, in the game's own visual language (STYLE_GUIDE.md / VISUAL_QUALITY.md).
Written for the owner to read; the buildable version lives in `opus-wanderer-area-prompt.md`.

## The big decisions

**1. The area travels through the Moods.** The game has 9 moods (night, sunrise, sunset,
deep, twilight, golden, dusk, ember, dawn). The Wanderer arc *is* a journey from light
into darkness and back — so the area rides the mood system as its narrative spine:
- Scene 1 Council → **golden** (fullness, dawn of the story)
- Scene 2 Descent → **twilight** (light thinning)
- Scene 3 Veil → **dusk** draining toward grey (the forgetting)
- Scene 4 Life → **night** (the heavy world)
- Scene 5 Ache → **deep** (the darkest, most star-filled)
- Scene 6 Remembering → **dawn** (first light)
- Scene 7 Radiating → **sunrise** (return)

No hardcoded skies. The Moods system does the emotional heavy lifting, and the
player *feels* the arc as a change in the air itself.

**2. The compositional grammar breaks on purpose in Scene 4.** The game's grammar is:
glowing center → ground ring → path lights leading away → rings/beams overhead →
birds at the horizon. Every scene uses it — except Scene 4 (the Life), where the
guide is gone and there is deliberately *no glowing center*. The absence of the
grammar is how the player feels the absence of the guide. When the path lights
return in Scene 5, their return *is* the reunion.

**3. Clouds are a night sea, not white fluff.** Palette discipline: deep blues and
golds, never decorative white. The cloud layer is moonlit — deep blue volumes with
warm gold light caught on their upper edges, drifting slowly (periods of 10+ seconds,
nothing twitchy). Below the cloud deck: nothing. The sky below the horizon becomes
the fog color (per the sky system), so the world's edge never draws a line — the
player stands on weather above an abyss, and it feels safe, not scary.

**4. The veil is the fog system, turned up.** No new weather tech. Scene 3 pushes the
existing height-fog density up and adds slow drifting sprite clouds (the snowfall
idiom, horizontal). Memory shards dissolving = the hash-discard dissolve the bark
uses when the camera gets close — repurposed as *forgetting made visible*.

## Scene-by-scene

### Scene 1 — The Council (golden)
Focal point: the player standing at the center of a great circle. The council =
twelve tall **beams** (the kit's pale-blue columns, `0xb8d1ff`) arranged in a ring,
breathing slowly, all slightly inclined inward — presences, not people. Overhead:
three gold **rings** (`0xffd700`, the game's signature tori) turning on ~25-second
periods. A **groundDisc** of warm gold gathers the eye under the player. Foreground:
slow cloud-wisps drifting past the camera (they fade via `outOfTheWay()` so they
never block the lens). Background: the cloud sea curving away, gold on blue.
The guide waits beside the player — close, not ahead. Everything connected by
faint luminous threads (the densities-area thread idiom, reused for continuity:
unity made visible).

### Scene 2 — The Descent (twilight)
A spiral ramp of cloud-stone descending — etched-stone idiom (`#1c1a2c`, roughness
0.78) for the path, so the player's feet have something real. Three bands:
- **Fifth (wisdom):** instanced **crystals** — blue-white prisms, slow-turning,
  geometric. Cold clarity. A few detach and rise instead of fall.
- **Fourth (love):** the **pathLights** wave — a brightness wave traveling along
  the lamp trail (`sin(t*2 - i*0.6)`), warm `0xffe6a0`. The wave *is* the singing:
  light arriving in pulses, the way a choir breathes. Golden motes gather at the
  path edges, leaning toward the player as they pass.
- **Thinning:** colors desaturate, the lamps space wider apart, the cloud sea
  below darkens. The guide walks close — shoulder to shoulder by the end.
Beat 2 lands mid-spiral, at the fourth-density band.

### Scene 3 — The Veil (dusk → grey)
The set piece. A wide expanse, fog density pushed high, visibility ~15 meters.
**Memory shards:** small glowing fragments drift past the player — a ring of
presences, a name written in light-lines, a small sun — and each one **dissolves**
(hash-discard) as the mist touches it. The player's own glow dims as they walk
(the wisp that follows the player fades from gold toward grey — the fiction
justifies touching the light rig here: the *player's* light is story).
At the far edge: the guide **stops**. It stands in the mist, one arm raised in
farewell, and does not follow. Silhouette-first: the farewell must read as a dark
shape against the grey before any detail. The player walks on alone into ordinary
night. Saddest, most beautiful scene in the game. Nothing moves fast. Nothing.

### Scene 4 — The Life (night)
Deliberately broken grammar: no glowing center, no rings, no guide. A dim,
muted path — the only scene allowed desaturated colors (justified: the heavy
world). **Tableaux:** small dioramas of warm light placed along the path — a
hospital-bright white room, a giant hand around a small one, a birthday candle,
an empty chair — each built from the glow-sprite idiom, each **fading via
`outOfTheWay()` as the player approaches**. Memories that won't hold still.
Rain: the snowfall system, slightly faster, slightly colder. One solitary
streetlamp (a single path light, no wave). Foreground: rain-streaked dark shapes.
The player is small in frame. Beat 4 plays as a voice from far away.

### Scene 5 — The Ache (deep)
The emotional low point, and the most visually spectacular scene. A long road
under the deepest night sky — the star field at its densest. **One region of the
sky is brighter**: a dense cluster of warm light, slightly too complex, slightly
too *home* — built as layered glow sprites, the largest soft light in the area.
Occasionally a small silent plane of light crosses the sky (a wisp, far away,
slow). Scale contrast does the work: tiny player, huge sky. The **path lights
return** — sparse, dim, but there. And the guide **rejoins**, walking *beside*
the player for the first time. The reunion needs no announcement; the grammar
restored is the announcement.

### Scene 6 — The Remembering (dawn)
The sky lightens as the player walks — the mood crossfade is the scene's main
event. **The impossibilities,** small and quiet, one at a time:
- A **book floating open**, pages of light (etched-line idiom on dark pages),
  the text unreadable, the glow readable.
- A **stranger-figure of pale light** that raises a hand in greeting and
  dissolves. No audio. Just the gesture.
- **Three seconds of total stillness**: every particle clock in the scene pauses.
  The scene-local clock stops. The noise stops. Then resumes. (The most
  technically daring beat — and the cheapest: it's the *absence* of motion.)
Then the **still pool**: water that mirrors only the sky (per the standing rule),
and in it the player's reflection is **luminous** — gold, for the first time
since the veil. Faint threads reappear between guide and player, one by one.
Wonder, not triumph.

### Scene 7 — The Radiating (sunrise)
A high overlook above a sleeping city: the far below is a dark blue plane scattered
with **clusters of warm points** — the `horses` idiom repurposed as distant city
lights, orange-gold, utterly still. Foreground: the player at the cliff edge, the
guide beside them. The final visual: **expanding rings of warm light** flowing
outward from the player, down toward the city — the `rings` motif, but the tori
grow, fade, and release, one every ~12 seconds, endless. The city brightens
almost imperceptibly with each one. As Beat 7 ends, the guide's particle field
and the player's glow **intermingle** — two clouds of motes becoming one, then
gently separating. On the far horizon, barely visible in the brightening sky:
faint **concentric ripples** — the council, waiting. The path back to the main
world curves away behind. Peaceful close.

## The portal (entrance, main world)
A single vertical **beam** of white-gold light, large enough to step into —
the kit's beam motif at architectural scale, breathing slowly. Placed at a high,
quiet point of the main world (Opus proposes the exact spot). Stepping in:
soft white-fade, not a loading screen. No door, no gate, no key — a shaft of
light you walk into, because the wanderer *descends*.

## Performance notes (for the brief)
- Heaviest effects: veil mist (fog + instanced sprites — cheap by design) and the
  radiating rings (a handful of tori with shader opacity — cheap). Nothing here
  needs a new light or a new pipeline feature. That's deliberate: the whole area
  is composed from existing idioms, recombined.
- The three-second stillness (Scene 6) is free — it's a clock pause.
- Shadow discipline holds: the single directional "star" remains the only
  shadow caster. The "brighter region of sky" in Scene 5 is emissive sprites,
  never a light.
- iPhone verification per scene with `?shot=` stills, as standing.

---

# Part II — Expanded element pass

Second layer of detail: the walks *between* scenes, per-scene depth breakdowns,
ambient life, the world noticing the player, pacing, and the guide's own arc.
Everything below stays inside the game's idioms — no new pipeline features.

## A. The in-between spaces (transitions)

The seven beats are ~60–90s each; the walks between them are 30–45s of quiet.
The quiet is sacred — no filler audio, no objectives. Each transition has its own
micro-identity so the journey never feels like loading corridors:

- **Portal → Council:** the beam deposits the player on a high cloud shelf. The
  clouds part ahead like a curtain (two large soft billboards drifting apart on
  ~15s periods). First faint threads appear, leading the eye forward.
- **Council → Descent:** the rim. The player walks to the edge of the council
  circle; the groundDisc's ring *breaks* at one point and becomes the start of
  the spiral ramp. One deliberate "last look back" vantage — the council framed
  behind, already smaller.
- **Descent → Veil:** the grey approaches. Fingers of mist reach up the ramp and
  curl around the last few lamps, dimming them one by one as the player passes.
  The pathLights wave stutters and stops. The singing ends mid-note.
- **Veil → Life:** the far shore. Mist thins into drizzle; cloud-stone gives way
  to dark earth (near-black blue, the bark-base color family). The first tableau
  glows faintly ahead — the player sees it before they understand it.
- **Life → Ache:** the road opens. The last tableau fades behind; the path
  widens; the sky *opens* — the first time the full starfield is visible. The
  camera should feel the release: a slow, almost imperceptible pull-back.
- **Ache → Remembering:** the east pales. A thin line of lighter blue on the
  horizon that wasn't there before. The floating book waits just past the
  transition — the first impossible, placed exactly where the light changes.
- **Remembering → Radiating:** the climb. The path rises on cloud steps; with
  each step, more city lights appear below. The radiating rings begin faintly
  *before* Scene 7's trigger — the player sees their own light working before
  the narration names it.
- **Radiating → exit:** cloud steps descending gently back toward the main world,
  dawn birds (the `birds` idiom) circling. The area exhales.

## B. Per-scene depth (the still-frame test)

Every view carries foreground / midground / background. The breakdowns:

- **Scene 1:** FG — drifting cloud-wisps crossing the lens (faded via
  `outOfTheWay()`); MG — the player, the guide, the groundDisc, the twelve
  beams; BG — cloud sea curving to a gold horizon, rings overhead.
- **Scene 2:** FG — the ramp's etched edge and passing lamps; MG — the player
  mid-spiral, crystals or singing lamps of the current band; BG — the bands
  above and below, the cloud sea falling away.
- **Scene 3:** FG — mist, memory shards dissolving near the camera; MG — the
  player walking, glow dimming; BG — the guide's farewell silhouette, then
  nothing. Depth *collapses* here on purpose: 15m visibility. The flatness is
  the point.
- **Scene 4:** FG — rain-streaked dark shapes, wet glints; MG — the current
  tableau, the solitary lamp; BG — house silhouettes, a dim horizon that never
  quite resolves.
- **Scene 5:** FG — the road's edge, sparse lamps; MG — the player and the
  rejoined guide, small; BG — the vast sky, the brighter region. Maximum scale
  contrast in the whole game.
- **Scene 6:** FG — the pool's rim, reeds of light; MG — the pool, the player's
  luminous reflection, the impossibilities; BG — the lightening east, long
  shadows of cloud.
- **Scene 7:** FG — the cliff edge, the two figures; MG — the expanding rings;
  BG — the sleeping city, the faint council ripples on the horizon.

## C. Ambient life (independent of the player)

- **Three mote layers** everywhere in the cloud scenes: near (large, slow, few),
  mid (the guide's family — warm gold), far (tiny, countless, blue). Different
  drift periods (8s / 14s / 22s), never synchronized.
- **The cloud deck breathes:** the whole walkable surface rises and falls ~2m on
  a ~20s period. Subtle enough to feel, never enough to notice — the world is
  alive and asleep at the same time.
- **Distant weather:** in Scenes 4–5, silent light flickers deep in the cloud sea
  far below — storms the player will never reach. No thunder. Just light,
  breathing, far away.
- **The under-sky:** where the clouds part, the player can glimpse the main world
  glimmering impossibly far below — a few warm points in the dark. The two areas
  are one world; the wanderer is always above their own life.

## D. The world noticing the player (responsive, never objective)

Not interactivity — *acknowledgment*. The world is aware and gentle:

- Motes **brighten slightly** as the player passes (proximity glow, small radius).
- **Light-flowers** along the path in Scenes 1, 6, 7 (the `flowers` sprite idiom)
  that **open** as the player approaches and close behind — the path blooming and
  resting.
- **Footfalls:** in Scenes 1 and 7, each step lands a soft expanding ring of light
  (tiny groundDisc pulse). The wanderer's feet bless the ground. In Scenes 2–6,
  the footfalls fade out — the world stops recognizing them — and return in 7.
  The player may never consciously notice. Their body will.
- In Scene 3, the mist **recoils slightly** from the player, then closes in —
  the veil noticing a light, then forgetting it. The saddest micro-animation in
  the area.

## E. Pacing

Total area: ~15–18 minutes at a contemplative walk. Beats are 60–93s; the walks
between triggers are 30–45s of quiet. The narration must never chase the player:
if the player outruns a trigger, the beat waits (the guide waits — standing
rule). If the player lingers, nothing loops, nothing nags. The still pool in
Scene 6 has no trigger timer at all — the beat fires on approach, and the player
can stand at the water as long as they want before walking on.

## F. The portal site (main world)

The beam's base should feel like a **place of pilgrimage**, not a game mechanic:
a quiet high meadow, a broken ring of etched stones (`#1c1a2c`, etched lines
`#e9c37d`), the beam rising from its center. Visible from far away — a landmark
players navigate by long before they understand it. No signage, no label. When
they're ready, they'll walk into the light.

## G. Color scripts (3–5 colors per scene, canon only)

- **S1 Council:** deep blue `(0.038,0.043,0.12)` / gold `0xffd700` / warm white
  `(1.8,1.58,1.33)` / pale blue `0xb8d1ff`. Fullness.
- **S2 Descent:** twilight blue / crystal blue-white `(0.45,0.55,1.0)` → lamp
  gold `0xffe6a0` → desaturating grey-blue. Light becoming heavy.
- **S3 Veil:** grey-blue fog / dim gold draining to grey / near-black blue.
  The palette *loses a color* as the scene progresses. That's the forgetting.
- **S4 Life:** near-black blue `(0.006,0.005,0.014)` / muted amber (tableaux only)
  / cold rain blue `(0.3,0.38,0.8)` / single lamp `0xffe6a0`. Muted, except memory.
- **S5 Ache:** deepest blue `(0.016,0.022,0.072)` / star white / the warm cluster
  (gold-pink `(1.0,0.7,0.88)`) / dim lamp gold. Darkness with one warm wound.
- **S6 Remembering:** dawn blue-pink / pale gold / pool-sky reflection / new green?
  No — new hues must be justified. Dawn stays in blue/pink/gold. The *light*
  changes, not the palette.
- **S7 Radiating:** sunrise gold / deep blue below / warm city ambers / white-gold
  rings. Return, but richer than the departure — the palette learned something.

## H. The guide's own arc

The angel's particle body tells the story alongside the narration:

- **S1:** brightest, densest — fully coherent, threads reaching out to the council.
- **S2:** slightly dimmer, staying close — a companion on the way down.
- **S3:** grey and **fraying at the edges** — dispersing more, reforming slower.
  The farewell: it raises one arm and its particles stream gently toward the
  player, then stop at the veil's edge, as if pressed against glass.
- **S4:** absent. (The player may look back. Nothing is there.)
- **S5:** returns **dimmer but warmer** — fewer particles, more gold. It walks
  beside, not ahead, for the first time.
- **S6:** brightening with the dawn; threads reconnect one by one.
- **S7:** radiant — and in the final moment the two particle fields intermingle,
  gold on gold, then gently separate. The guide was never other. It was always
  the player, arriving early.
