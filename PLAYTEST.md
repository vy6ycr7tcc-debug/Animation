# Playtest: the whole journey (M1–M5)

## How to run
- **Online:** https://vy6ycr7tcc-debug.github.io/Animation/ (updates about a minute after each merge into `main`).
- **Locally:** `npm install`, then `npm run dev`. Open the "Network" URL on your phone (same Wi-Fi).
- Add `#stats` to the URL to see frame-rate readings.

## Controls
| | Phone | Keyboard + mouse |
|---|---|---|
| Walk to a spot | Tap it | Click it |
| Walk freely | Touch and drag on the left half | W A S D or arrow keys |
| Walk a little faster | Push the thumb to the edge | Hold Shift |
| Look around | Drag on the right half | Drag with the mouse |
| Zoom | Pinch | Scroll wheel |
| The offered word (sit, board…), otherwise jump | The round button, bottom right | Space or E |
| Stand up after sitting | Tap, move, or the round button | Move, or Space |
| Settings, journal, Leave | ⋮ top right | Esc |

## The path
1. **The shore.** Touch the water to begin. J01 plays.
2. **The crossing.** Walk into the water and swim; J02 plays. The island's seven lights appear halfway across.
3. **Arrival.** Step onto the sand: J03.
4. **The seven stations,** in any order. Walking into one plays its narration. Walking away fades it. Hearing it through marks the station visited: its broken ring becomes whole and its beacon settles. Its closing question then appears quietly, with a "write" link to the private journal.

   | Station | Where | What to do |
   |---|---|---|
   | I. The Magician | Beam and gold ring | Step into the ring: the beam brightens, sparks rise, you reach upward. |
   | II. The High Priestess | Two pillars, mist | Sit on the bench: time slows, the mist parts, more stars appear. |
   | III. The Empress | Spiral garden | Walk the spiral inward: rising tones, then a bloom opens at the centre. |
   | IV. The Emperor | Throne on a square of light | Sit: constellations gather overhead. |
   | V. The Hierophant | Arch of three stones | Walk through: a ripple spreads and a low tone sounds. |
   | VI. The Lovers | Two rings, crossing paths, a star | Walk either path to the crossing: the rings pulse once. |
   | VII. The Chariot | A vessel at the far edge, and a road to the horizon | After the other six: board. |

5. **The ride.** The vessel carries you slowly past echoes of the six stations to the near shore while J10 plays.
6. **The return.** A path of light leads home across the water. J11 plays as you swim. On the home shore:
   - the sky brightens a little;
   - a small star goes with you;
   - a card reads "The water will always be here."

   After that you can keep wandering.

## Voices
- Only the female voice plays. The five tracks recorded in the male voice (J02, J04, J06, J08, J10) show as subtitles until they're re-voiced.
- To re-voice them, run `sh narration/revoice-female.sh` where the `tts` CLI is installed, then commit `public/audio/female/`. The game picks the new files up automatically.

## Known issues
- Subtitle timings were aligned automatically to pauses in each recording, so a line may change a moment early or late.
- Jumping has no animation of its own beyond the recorded jump and landing.
- To replay from the beginning, clear the site's data in Safari. The journal is cleared too.

## Performance
- Measured only in a headless software renderer here, which says nothing about a phone. Please send the `#stats` readings from the iPhone.
- About 50–60 draw calls and ~100k triangles on the island.
- **The costliest effects, and when they turn off:**
  - the ray-marched fluid body: 48 steps on the top quality level, down to 24 on the lowest;
  - the water reflection: top two quality levels only;
  - the god rays: top two quality levels only.
- The quality level drops automatically if frames run slow.
- Audio is about 5 MB and the figure is 1.8 MB, both loaded as needed.
