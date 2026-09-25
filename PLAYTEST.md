# Playtest: phase 1 (walking prototype)

## How to run
- **Online:** open the link Claude sent (or the GitHub Pages URL once Pages is on).
- **Locally:** `npm install`, then `npm run dev`. Open the "Network" URL on your phone (same Wi-Fi).
- Add `#stats` to the end of the URL to see frame-rate readings.

## Controls
| | Phone | Keyboard + mouse |
|---|---|---|
| Walk | Touch and drag on the left half | W A S D or arrow keys |
| Glide (run) | Push the thumb to the edge | Hold Shift |
| Look around | Drag on the right half | Drag with the mouse |
| Zoom | Pinch | Scroll wheel |
| Jump | The round button, bottom right | Space |
| Settings (volume, reduce motion, Leave) | ⋮ top right | Esc |

## What to try
1. Touch the water to begin. Sound should start right away, even with the silent switch on.
2. Walk around the stone platform. The fine gold and pearl lines are the seven-fold map of the journey.
3. Walk off the edge into the lake and swim. Your strokes leave rings on the water.
4. Swim to an island:
   - Mind: ahead-left, silver-blue, mirrors and a floating grove.
   - Body: ahead-right, terraced, with a waterfall.
   - Spirit: behind you, violet crystals.

   Each island has its own sound, which fades in as you approach. Its glowing contour lines are the etched-light look taken from your drawings.
5. Settings → Leave, then return. You should reappear where you were, even after closing the page.

## Placeholder in this phase
- Island shapes and landmarks are blockouts, and the wanderer is simple capsules.
- No stations, narration, boat or water-walking yet (phases 2–3).
- The drawings aren't used as textures yet. The line style is only a first pass at their look.
- Swimming to an island takes about 25 seconds.

## Frame rate
- Measured only in a headless software renderer here, which says nothing about a phone.
- About 30–50 draw calls and 30–50k triangles per frame, well within an iPhone's budget.
- Quality lowers itself automatically if frames run slow: resolution, then shadows, then bloom.
- Please send the `#stats` readings from your iPhone.
