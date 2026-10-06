# Temple redesign — three rooms, three intros (DESIGN PROPOSAL — not approved, do not build)

**Status:** proposal for the owner's eye. Nothing here is decided except what the owner already said. Every invention is flagged **[INVENTION]**. All spoken scripts are **PENDING the owner's words** — draft concepts only, never final dialogue.

**What the owner asked for (2026-10-06):** redesign the three rooms properly (Mind / Body / Spirit as three real rooms, not one hall with two walls plus a sanctuary); an intro moment for each room; fix the entrance (the lamp just inside the door to the left is lame and nonsensical); guarantee free navigation — walk to any shrine, sit with any card, in any order. His sketch: a pre-room with the Mind, then the temple with the cards. Ordering is an open question — two options below, with a recommendation.

**What stays:** the pylon gate in the open world; the beings of flowing light posed as on their tarot cards (recreated from the Ra tarot); the per-shrine interaction (being wakes on approach, narration, the small lamp before each shrine kindles); the brass diya lamps, papyrus-bundle columns, etched stone, scanned sandstone; the Moods system as the light rig (no new lights, no new pipeline features — everything recomposed from existing idioms per the style guide).

---

## 1. The walk, end to end (proposed)

Pylon gate (open world, near the shore) → **Vestibule of Arrival** (new, small) → **Room of the Mind** (the pre-room: smaller, darker, quieter) → passage → **Room of the Body** → passage → **Room of the Spirit** (the ring; the Choice at its heart under the oculus) → walk back out the way you came.

The whole temple remains "a place apart" (built far beyond the world's edge, the world hidden while inside).

---

## 2. The three rooms, re-conceived

Each room is one architectural idea with its own light, palette, and air — but all three are the same temple (same stone, same column language, same beings). Palette discipline: 3–5 colors per room, from the game's canon (deep blues, golds, embers).

### Room of the Mind (I–VII) — the pre-room

- **Idea:** the mind is the night sky — vast, cool, patterned. The existing blue ceiling of gold stars becomes this room's signature (it moves here from the old hall).
- **Architecture:** smaller and more intimate than the other rooms **[INVENTION: proportion]** — a long, narrow chamber. Slimmer papyrus-bundle columns, set wider apart so the room feels like a colonnade under stars rather than a forest of stone. Walls carved in glyph registers (existing relief idiom), pigment mostly blue with traces of gold.
- **Light:** cool and low. Thin shafts from a clerestory, pale blue (`0xb8d1ff` idiom). The seven shrines sit in niches along both walls (four one side, three the other — the asymmetry is deliberate: the mind is not perfectly balanced **[INVENTION]**). Each niche holds its being of flowing light, cool-tinted.
- **Air:** still. The quietest room. Dust motes drifting almost imperceptibly (existing mote idiom, slowest setting).
- **Sound-feel:** near-silence; the water bed ducks lower here than anywhere else in the temple **[INVENTION: mix note]**.

### Room of the Body (VIII–XIV) — the hearth room

- **Idea:** the body is earth and warmth — what carries you.
- **Architecture:** the full hypostyle treatment the old hall had — two rows of papyrus-bundle columns, but warmer: red sandstone pavement (existing `red_sandstone_pavement` scan) underfoot, walls in ochre registers. Seven shrines along the walls, evenly spaced, each with its vessels at the foot (existing prop idiom).
- **Light:** ember and gold. The brass diya lamps are this room's signature — a lamp burns before every shrine (existing behavior: dim ember until its rite is done, then steady flame in the archetype's own color), plus low fire pits between the columns (existing fire-pit props). Warm fog, slightly denser.
- **Air:** warm drift — slow ember motes rising (existing ember idiom from the campfire).
- **Sound-feel:** the water bed at its normal temple level; the faintest low warmth under it **[INVENTION: mix note]**.

### Room of the Spirit (XV–XXI + the Choice) — the dawn room

- **Idea:** the spirit is dawn — light arriving.
- **Architecture:** the most open room: few or no columns (the roof lifts away — **[INVENTION]**), the seven stand in a ring facing the centre as today. At the centre, the Choice (XXII) on its round dais.
- **Light:** the oculus shaft from above (existing) — the single brightest light in the temple, falling on the Choice. Pale blue-gold air, the palest fog in the building. The ring's shrines each carry a thin vertical beam of pale light (existing `beams` idiom, quiet).
- **Air:** slow circling motes, gold-white, rising toward the oculus.
- **Sound-feel:** the most "open" mix — the water bed breathes a little wider here **[INVENTION: mix note]**.

---

## 3. The intro moment per room

Each threshold crossing gets one beat — a few seconds that tell the player "you are now in the room of the Mind" (etc.). All beats are built from existing idioms (lamp flames, light shafts, glow sprites, fog density shifts). No text on screen, ever.

- **Vestibule of Arrival (temple intro):** you step through the door into a small, dim court. A still basin of dark water at its centre (the game's home motif — **[INVENTION]**), two braziers flanking the far arch (existing fire-pit idiom). This replaces the lame entrance lamp: the door is flanked by *meaningful* fire, and the basin gives the eye somewhere to rest before the Mind room. Narration concept (PENDING): what the temple is — a place to meet the twenty-two, no objectives, wander and sit. **[INVENTION: the basin and the temple-intro narration slot]**
- **Mind intro:** the arch from the vestibule is low; you emerge into darkness. Then seven small flames kindle in sequence along the walls (existing lamp-flame idiom, staggered ~1s apart, slowest easing) — the room introduces itself one shrine at a time. Narration concept (PENDING): the Mind — the part of you that asks.
- **Body intro:** the passage between rooms warms as you walk it (fog color shifts cool → warm — **[INVENTION: transition passage]**); you enter to ember light and the smell-less suggestion of warmth: the fire pits are already lit, the diyas glow. Narration concept (PENDING): the Body — the part of you that carries.
- **Spirit intro:** the passage climbs slightly; the air pales. You enter the ring room as the oculus shaft brightens over ~4 seconds (existing shaft, slow fade-up — **[INVENTION: the timed brightening]**), the seven turn their faces toward you (existing being-pose idiom). Narration concept (PENDING): the Spirit — the part of you that returns.

---

## 4. Ordering — two options

### Option A — Mind → Body → Spirit (owner's sketch; RECOMMENDED)

The Mind as pre-room, then Body, then Spirit. The case:
- It is the archive's own teaching order and the cards' own numbering (I–VII, VIII–XIV, XV–XXI).
- The light arc ascends: cool dark (night) → warm (ember) → radiant (dawn). You walk toward the light — the game's central image.
- The pre-room works dramatically: the smallest, quietest room first teaches the player how to be in the temple (slow down, look, sit) before the larger rooms open.

### Option B — Body → Mind → Spirit

Enter through the Body first (you arrive on foot, in a body), then the Mind quiets, then the Spirit. The case:
- Phenomenological: the classic temple progression is embodiment first — arrive, settle, then the mind stills.
- The warm room first is more welcoming; the Mind's darkness lands harder as a second movement (contrast).

**Recommendation: A.** The numbering, the teaching order, and the light arc all agree, and the owner's sketch already points there. B is honest but the "walk toward the light" arc is the stronger piece of design.

---

## 5. The Choice (XXII)

Stays at the heart of the Spirit room: on its round dais, in the oculus shaft, the ring of the seven facing inward toward it. It is the culmination of the Spirit sequence, not a fourth room — giving it its own chamber would dilute the ring's geometry, which is the strongest composition in the current temple. **[INVENTION: the judgment call to keep it in the ring — owner to confirm.]** Strengthen the moment: the dais slightly raised (existing), the shaft the brightest light in the building, two diyas at the dais steps (existing prop placement).

---

## 6. Shrine interaction (unchanged in kind, restated for the new layout)

- **Free navigation, guaranteed:** no prescribed order within or between rooms. Every shrine is walkable-to from the room's open floor; colliders keep you out of the plinths and columns but never funnel you (collider audit per v4 item 2 applies here).
- **At a shrine:** the existing three beats stay — **threshold** (arrival: "Who are you?"), **walk** (step closer: its teaching), **heart** (sit: its practice). The sit spot before each shrine is kept and made generous (existing `spots`, widened clearance **[INVENTION: minor]**).
- **The being** wakes as you approach (existing wake behavior), speaks its narration, and its lamp kindles — dim ember until its rite is done, then steady flame in the archetype's own color (existing lamp behavior).
- Nothing auto-plays. Nothing gates. You can sit with one card for an hour and never touch the others.

---

## 7. The entrance fix (the lame lamp)

The lamp just inside the door to the left goes away entirely. In its place: the Vestibule of Arrival (§3) — door flanked by two braziers (fire, meaningful, symmetrical — no more one random lamp), a still basin at the centre, and the far arch leading to the Mind room. The entrance now *means* something: fire (purification/light) and still water (the game's home) before the archetypes.

---

## 8. Exit

Keep the walk back out the way you came (Vestibule → door → pylon gate → shore). It mirrors the journey: you return through the rooms in reverse, changed. **[INVENTION — owner to confirm;** a one-way loop exit was considered and rejected in this proposal because the return walk is the contemplative payoff, but the owner may prefer a loop.)

---

## 9. Constraints honored

- No objectives, scores, or fail states anywhere. No gating, no required order.
- Contemplative pacing: all intro beats run 3–6 seconds, eased (easeInOutCubic), never synchronized; ambient motion keeps the game's unhurried periods (seconds, nothing twitchy).
- Performance: everything recomposed from existing idioms — instanced props, sprite clouds, glow materials, the single directional "star" + hemisphere rig, the Moods system. No new lights, no new pipeline features. Physical iPhone is the final gate; verify with `?shot=` stills per room and per intro beat.
- The standing visual bar applies (`docs/style/VISUAL_QUALITY.md`, `ANIMATION_QUALITY.md`, `STYLE_GUIDE.md`); the builder confirms it is actually following them.

---

## 10. Open decisions for the owner

1. **Ordering:** A (Mind → Body → Spirit, recommended) or B (Body → Mind → Spirit)?
2. **All intro narration scripts** — the concepts are above; the words are yours. (Also the vestibule temple-intro slot.)
3. **The Choice:** keep at the heart of the Spirit ring (recommended) or give it its own small apse chamber?
4. **Exit:** walk back out (recommended) or a one-way loop?
5. **Room palettes and the Mind room's smaller proportion** — the night/ember/dawn arc is a proposal; redirect any of it.
6. **The vestibule basin** — invention; keep or cut?
7. **Anything else in §2–§8 marked [INVENTION]** — all of it is redirectable. Nothing here is precious.
