# Findings ledger

Every reported defect or review finding, with its cause, its fix and how it was checked. Newest
batch first. A still (`?shot=<id>&t=<s>`) is the proof for every visual claim.

## 2026-10-07, master fix & elevation, Phase 1

| # | Finding | Cause | Fix | Verified |
|---|---|---|---|---|
| F1 | `?shot=density-0` and `density-7` hang | The still-frame room factory (`main.ts`, `room:`) knew rooms 1–6 only; 0 and 7 fell back to room 1's module and never found their factory, so `__shotReady` never came. Room 7's factory is `createDensity7(scene, narration, whisper, at, heading)` and its group is named `density:density-7`, which the visibility filter hid. | Rooms 0 and 7 added with their own factories; room 7 given its place; the filter keeps `density:density-<n>`; still views for both (`ROOM_VIEWS`). | `density-0&t=60` (galaxies in the dark), `density-7&t=60` (the collapse toward the threshold): both render, no errors. |
| F2 | `ruin-0`, `ruin-4`, `meadow` mis-framed | `ruin-n` stood a fixed 9 m off each ruin: sites now holding a drowned city put the camera inside its walls. `meadow` looked at bare ground; its fix first landed the camera under water. | An area site is framed from its own approach view (`ANCIENT_VIEWS[area].a`, turned toward the shore); another ruin from 22 m at 4.5 m height toward the shore. `meadow` frames the vision of creation from a dry vantage with a clear line of sight (34 m off where the land allows, else the nearest dry ring: see W1). Still frames show no whispers (a first-time tip covered the ruins). | `ruin-0` (Lemuria's stones), `ruin-4` (the Mayan pyramid) framed whole, no words over them; `meadow`: the vision on its ground, the sky and planet behind. |
| F3 | density-5 nearly black | Its floor tint 0.02, cool light 12 over 22 m, air glow 0.02–0.04, no shadow lift: the floor vanished. | Proposed level, kept within "pitch black above": floor tint 0.05–0.07, the magician's cool light 20 over 30 m, air glow (0.04, 0.045, 0.07), shadow lift (0.01, 0.012, 0.02). The sky is still not drawn. | `density-5&t=200`: the flagstones read in a pool round the magician, the dark above stays black. |
| F4 | Duat hour-vision morphs "all over the place" | Every 6 s a new form; 3.5 s turns with the vision-of-creation vortex (1.2–2.3 rad, 20–50 % outward, ±0.9 m lift) and 35 % spread of delays: a swirl most of the time. | `VisionStage` `calm` option (the Duat only): delays spread over 55 % of the turn, vortex 0.35–0.65 rad, 6–14 % outward, ±0.3 m. Cycle lengthened: 8.5 s a moment, 6 s of it gathering. Lessons and other visions unchanged. | `duat-1&t=0…30` every 3 s (contact sheet in the PR). |
| F5 | B3 framing decisions unrecorded | — | Stills of each density's live framing after 14 s idle (`journey-2…8&t=40&live=14`). Decisions as in CLAUDE.md (B3): 1 and 4 wide; 0, 2, 3, 5, 6, 7 near. | Contact sheet in the PR. |
| F7 | "Patchy character LOD" | Not reproduced. The wanderer has no LOD or textures; seated at the garden lesson its glass body is whole and clean, and mid-contemplation (17 s still) the view goes cleanly to first person with the body gone. Reported from the owner's 2026-10-03 iPhone recordings at the campfire (close-up). Closed as not reproduced (owner, 2026-10-07); a fresh screenshot if it recurs on device. | — | `garden&t=40&live=6&inward=0`, `garden&t=40&live=17`. |
| W1 | The vision of creation stands on a 3 m pad in the lake | `MONUMENT`'s site search (`terrain.ts`: 55–150 m from the shore, raw height 1.6–14 m, clear of homes and the pyramid) finds nothing and falls back to its default (spawn + (70, −40)); the pad levels a 14 m disc there, water at 20 m. | Closed (owner, 2026-10-07): it stays on the islet, a landmark the monuments are placed around; the islet framing works. | Probe of `heightAt` round it: 3.0 within 14 m, −3 to 0.6 at 20 m, −4 to −19 at 34 m. |
| T1 | Duat tour: the last leg (up the stair into the dawn) had no way out if the stair's top was never reached | `duatTourFrame` waited for the pyramid's exit with no limit; the controls stayed hidden. | After 60 s on that leg the tour ends as complete, the controls back. | Code walk. |
| T2 | Duat tour gave up at 12 s if the Duat was still building | A slow phone builds and compiles in the dark for longer (compile cap 4 s plus the build). | 25 s. | Code walk. |
| T3 | Grand tour: "leaving" has no limit | `walkEnterStop` awaits the hall's `leave()` and polls until outside; a journey that never finishes leaving would hold the walk on "on the way". | Not changed: a forced arrival from there would race the awaited continuation. Proposed: a generation token on `walkEnterStop`, then a 30 s watchdog that arrives through the dark. | Code walk; not reproduced. |

### State machines walked (grand tour, Duat tour)
- **Grand tour** (`walkFrame`), per stop:
  - halls: enter → listen → linger → go → (the door) → the next room's listen, or leaving → travel → enter;
  - places: travel → place.
  - Every phase has a way on except "leaving" (T3).
  - Skip is honoured in every phase. "travel" ends on arrival, on 6 s stalled, or at 150 s; "enter" retries once.
- **Duat tour** (`duatTourFrame`): enter → walk → watch → walk … → dawn.
  - "walk" snaps the wanderer to the stand after 45 s; "watch" lasts the hour's cycle + 1.5 s.
  - The ends are T1 and T2.

### A1–A5, B1–B5 against their acceptance criteria
| Item | Criterion (CLAUDE.md entry) | State |
|---|---|---|
| A1 tours end to end | every room crossed at its door; no lobby skipped | Code matches the entry (`walkFrame` "go"/"leaving"). Headless run evidence is in its PR. |
| A2 collision | rooms' solids are colliders | `solids`/`solids()` registered by the journey; unchanged. |
| A3 Duat dry ground | Duat above the water line | `DUAT_ORIGIN` y offset −4 (y 10); unchanged. |
| A4 Duat speaks | `DUAT` entry plays on entering | `DUAT_TRACKS.entry`; unchanged. |
| A5 Duat pacing | no dead holds; dawn turns to the light | Superseded in part by F4 (a longer, calmer cycle, as asked). |
| B1 quality config | `public/quality.json` read over defaults | Present. |
| B2 welcome | first launch only, the water still the one way in | `inward-journey:welcomed`; present. |
| B3 framing | per-density near/wide | `framing: "wide"` on rooms 1 and 4; stills in F5. |
| B4 Aton | disk, rays ending in hands, ankhs | `atonSegments` in `past/egypt.ts`; present. |
| B5 breathing | auto-walk + breath ring, config pattern | `public/breathing.json`, `world/breath.ts`; present. |

Open with the owner: `prompts/visual-bible/` and the sweep workspace the master prompt names are
not in the repository.
