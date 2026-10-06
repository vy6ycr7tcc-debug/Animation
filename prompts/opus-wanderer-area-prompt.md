# Opus prompt — Wanderer Area ("The Long Descent")

Repo: `vy6ycr7tcc-debug/Animation` — branch `main`. One branch + one PR for this item. Commit and push after each milestone.

The standing bar applies: read and follow `docs/style/VISUAL_QUALITY.md`, `docs/style/ANIMATION_QUALITY.md`, and `docs/style/STYLE_GUIDE.md` on every visual you generate. Confirm you are actually following them. Match the style in STYLE_GUIDE.md — it was distilled from the game's own code. The standing performance directives (`~/workspace/your_files/standing-performance-directives.md`) remain in force — verify on the weakest target device (physical iPhone).

## What this is

A new walkthrough area for Inward Journey, on a topic the game has never touched: **the Wanderer** — a being from a higher density who volunteers to incarnate in the heavy world, passes through the veil of forgetting, lives a third-density life without remembering why they came, and slowly wakes up.

**Location: the clouds.** The area floats in a cloud layer high above the main map, separated from the rest of the world — thematically exact, since the whole arc is about descending from above. The player enters through **one portal of white light** (a vertical beam/shaft of light the player steps into; suggest placing its base at a high, quiet point of the main world). After the portal, no more gates — the whole area is open walking through sky, cloud terraces, and the descent path.

Structure mirrors the Densities area (one entrance, then open walking, a guide who speaks seven beats at proximity triggers) so the implementation pattern is already proven. **One entrance only** — a portal of white light, not a door; after that, no more gates.

The emotional arc is a descent and a return: fullness → falling → forgetting → a life → the ache → the remembering → the mission revealed. It should feel like the most personal area in the game. The player is not a tourist here. The player is the wanderer.

## The guide (reuse the angel)

Reuse the **particle-composed humanoid angel** from the Densities area (warm-gold additive motes, same asset). Here it plays a different role: it is the wanderer's **own higher self** — the part that stayed awake above the veil, speaking down to the part that forgot. Same behavior as before: walks slightly ahead, pauses and faces the player at each trigger, waits without rushing, never loops dialogue. But the tone of the staging should be more intimate — it stays closer to the player in this area, and in Scenes 5–7 it walks *beside* the player rather than ahead.

## Audio (ready, do not regenerate)

Seven cinematic beats, in `~/workspace/ether/narrations/wanderer-area/`:
- `wanderer-cine-1.mp3` … `wanderer-cine-7.mp3` — Aria, speed 92.
- Scripts: `scripts/beat-1.txt` … `scripts/beat-7.txt`.
- Integrate per the standing audio/narration conventions (real audio files, no invented dialogue, pause support via the shared transcript player). Trigger: proximity zones along the path, one per scene, in order.

## Scene-by-scene

Full visual design treatment (palette, motifs, mood arc, performance notes):
**`~/workspace/your_files/opus-wanderer-visual-design.md`** — read it first (both Part I and the expanded Part II: transitions, depth breakdowns, ambient life, responsive details, pacing, the guide's arc), then build
from the specs below. The treatment is written in the game's own visual language
(STYLE_GUIDE.md idioms); the specs below are the build checklist.

**Mood arc (use the Moods system, never hardcoded skies):** Scene 1 golden →
Scene 2 twilight → Scene 3 dusk draining grey → Scene 4 night → Scene 5 deep →
Scene 6 dawn → Scene 7 sunrise. The mood crossfade IS the emotional arc.

### Scene 1 — The Council (Beat 1: the volunteering) — mood: golden
Focal point: the player at the center of a great circle. The council = twelve tall
**beams** (kit's pale-blue columns `0xb8d1ff`, breathing slowly) arranged in a ring,
slightly inclined inward — presences, not people. Overhead: three gold **rings**
(`0xffd700`) turning on ~25s periods. A **groundDisc** of warm gold under the player.
Foreground: slow cloud-wisps drifting past (fade via `outOfTheWay()`). Background:
the cloud sea curving away, gold on blue. Faint luminous threads connect everything
(unity made visible — same thread idiom as the Densities area). The guide waits
*beside* the player, close. Beat 1: you volunteered.

### Scene 2 — The Descent (Beat 2: falling through the densities) — mood: twilight
A spiral ramp of cloud-stone (etched-stone idiom `#1c1a2c`) descending through three bands:
- **Fifth (wisdom):** instanced **crystals**, blue-white prisms, slow-turning, geometric.
- **Fourth (love):** the **pathLights wave** — brightness traveling along the lamp
  trail (`sin(t*2 - i*0.6)`), warm `0xffe6a0`. The wave IS the singing. Golden motes
  lean toward the player at the path edges.
- **Thinning:** colors desaturate, lamps space wider, the cloud sea below darkens.
Beat 2 triggers at the fourth-density band. The guide walks close — shoulder to
shoulder by the end.

### Scene 3 — The Veil (Beat 3: the forgetting) — mood: dusk → grey
The set piece. Push the height-fog density high (visibility ~15m) + slow drifting
sprite clouds (snowfall idiom, horizontal). **Memory shards** drift past the player —
a ring of presences, a name in light-lines, a small sun — each **dissolving**
(hash-discard) as the mist touches it. The player's own glow dims along the walk
(the follower wisp fades gold → grey). At the far edge the guide **STOPS** — stands
in the mist, one arm raised in farewell, and does not follow. Silhouette-first:
the farewell must read as a dark shape against grey. The player walks on alone.
Slowest scene in the area. Nothing moves fast. Nothing.

### Scene 4 — The Life (Beat 4: a third-density life, in flashes) — mood: night
**Deliberately broken grammar:** no glowing center, no rings, no guide — the only
scene allowed desaturated colors (the heavy world). **Tableaux** along the path:
small warm-light dioramas (a hospital-bright room, a giant hand around a small one,
a birthday candle, an empty chair), each fading via `outOfTheWay()` as the player
approaches — memories that won't hold still. Rain via the snowfall system, colder.
One solitary streetlamp (single path light, no wave). Beat 4 plays as a voice from
far away (extra reverb/distance in the mix if the engine supports it).

### Scene 5 — The Ache (Beat 5: homesickness) — mood: deep
A long road under the densest starfield in the game. **One region of the sky is
brighter** — a dense warm cluster, layered glow sprites, the largest soft light in
the area (emissive sprites ONLY, never a new light). Occasional small silent planes
of light crossing far overhead (distant wisps). Scale contrast: tiny player, huge
sky. The **path lights return** — sparse, dim. The guide **rejoins, walking beside**
the player. The restored grammar IS the reunion; no announcement needed.

### Scene 6 — The Remembering (Beat 6: the veil leaks) — mood: dawn
The lightening sky is the main event. **The impossibilities**, one at a time:
- A **book floating open**, pages of light (etched-line idiom), text unreadable.
- A **stranger-figure of pale light** that raises a hand in greeting, then dissolves.
- **Three seconds of total stillness**: the scene-local particle clock pauses, then
  resumes. The noise stops. (Cheapest effect in the area: the absence of motion.)
Then the **still pool**: water mirroring only the sky, and in it the player's
reflection is **luminous** — gold, for the first time since the veil. Threads
reconnect between guide and player one by one. Beat 6.

### Scene 7 — The Radiating (Beat 7: the mission) — mood: sunrise
A high overlook above a sleeping city: far below, a dark blue plane scattered with
**clusters of warm points** (the `horses` idiom repurposed as distant city lights).
The final visual: **expanding rings of warm light** flowing outward from the player
toward the city — the `rings` motif releasing one ring every ~12s, endless. The
city brightens almost imperceptibly with each. As Beat 7 ends, the guide's and the
player's particle fields **intermingle**, then gently separate. Far horizon, barely
visible: faint **concentric ripples** — the council, waiting. Path back curves away.
Peaceful close.

## The portal (entrance, in the main world)
A single vertical **beam** of white-gold light, large enough to step into — the kit's
beam motif at architectural scale, breathing slowly. Place its base at a high, quiet
point of the main world (propose the exact spot in the PR). Stepping in: soft
white-fade, not a loading screen. No door, no gate, no key — a shaft of light the
player walks into, because the wanderer *descends*.

## Constraints

- **One entrance only** (Scene 1 portal). Everything after is open walking — no gates, no locks, no keys.
- **No objectives, no scores, no fail states** — the standing game philosophy holds. The player cannot die, lose, or get stuck.
- **The guide does not cross the veil** (Scene 3) — it waits at the edge and rejoins in Scene 5. This staging beat matters; don't skip it.
- **No invented dialogue.** The guide speaks only the seven provided beats.
- **Performance:** the veil mist (Scene 3) and the radiating rings (Scene 7) are the heaviest effects — budget carefully, additive blending, no per-frame allocations, verify on a physical iPhone.
- **Verify visually:** use the `?shot=` still-frame hook and `window.__shotReady` per scene before calling anything done. Read each still with your own eyes against VISUAL_QUALITY.md.
- **Flag inventions:** the council's appearance, the tableaux in Scene 4, and the "impossibilities" in Scene 6 are the owner's inventions from the concept (not archive-literal). Note any further invention in the PR.
