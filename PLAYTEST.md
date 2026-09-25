# Playtest: the open world

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
| Jump | Tap the round button, bottom right | Space |
| Glide | Hold the round button in the air | Hold Space in the air |
| Settings, Leave, Begin again | ⋮ top right | Esc |

## What it is
There is no island and no path. You wake on a meadow at night beside the water. From there you can go anywhere.
- **Narration runs in the background.** The first track starts after a few seconds. The rest follow in order (J01 → J11), with a quiet gap of 20–40 s between them. You never have to stop and wait anywhere for it. Turn it off under ⋮ → Narration.
- **The world answers as you pass:**
  - grass leans away from you and keeps a faint trail of light;
  - flowers open when you brush past, each with a note from one soft scale;
  - butterflies drift after you for a while;
  - light creatures glide overhead.
- **Lanterns:** clusters of dark orbs stand in the hills. Walk close and they kindle one by one with chimes, and they stay lit between visits. Lighting them is the only "collecting" there is, and nothing depends on it.
- **Landmarks:** six of the geometric forms from the Mind stations stand out in the world. You find them by wandering. Each still reacts:

  | Landmark | What happens |
  |---|---|
  | Beam and gold ring | Step into the ring: the beam brightens and you reach upward. |
  | Two pillars and mist | Stand still a moment: time slows, the mist parts, more stars appear. |
  | Spiral garden | Walk the spiral inward: rising tones, then a bloom at the centre. |
  | Throne on a square of light | Stand still: constellations gather overhead. |
  | Arch of three stones | Walk through: a ripple and a low tone. |
  | Two crossing rings | Walk to the crossing: the rings pulse. |

- **The whole creation:**
  - **Trees of light,** grown in smooth curves, with twigs that curl into spirals. Pulses of light run down from the crown through the trunk. Under the ground you can see the roots as fine lines of light going deep, brightest near you.
  - **The network.** Threads of light join the roots of neighbouring trees and crystals underground, and the same pulses travel along them.
  - **Crystals.** The great ones take a shaft of light from the sky. Every cluster splits light into rainbow petals on the ground and shifts colour as you walk around it. Walk close and they wake.
  - **Rocks,** etched with fine gold lines.
  - **Spirits.** Wisps of light with trailing veils. They circle the trees and crystals, and now and then one comes to keep you company.
  - Lanterns kindle silently.
- Water is safe: walk in and you swim. Far out, mountains mark the edge of the world.

## Voices
- Only the female voice plays. The five tracks recorded in the male voice (J02, J04, J06, J08, J10) are skipped by the background narration until they're re-voiced.
- To re-voice them, run `sh narration/revoice-female.sh` where the `tts` CLI is installed, then commit `public/audio/female/`. The game picks the new files up automatically.

## Known issues
- Subtitle timings were aligned automatically to pauses in each recording, so a line may change a moment early or late.
- The Chariot is not placed in the open world yet.
- The narration talks about places that don't match where you are. This waits on Samuel's map drawing.
- When the camera passes through a tree, the tree dissolves into a fine stipple.
- ⋮ → Begin again (tap twice) forgets the lit lanterns and starts over.

## Performance
- Measured only in a headless software renderer here, which says nothing about a phone. Please send the `#stats` readings from the iPhone.
- About 150 draw calls and 80–100k triangles. Distant landmarks are hidden beyond 300 m. The ground streams in 80 m squares around you, trees out to about 100 m.
- **The costliest effects, and when they turn off:**
  - the ray-marched fluid body: 48 steps on the top quality level, down to 24 on the lowest;
  - the water reflection: top two quality levels only;
  - the god rays: top two quality levels only.
- The quality level drops automatically if frames run slow.
