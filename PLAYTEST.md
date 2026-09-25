# Playtest: milestone 1 (the shore and the swim)

## How to run
- **Online:** open the link Claude sent (or the GitHub Pages URL once Pages is on).
- **Locally:** `npm install`, then `npm run dev`. Open the "Network" URL on your phone (same Wi-Fi).
- Add `#stats` to the end of the URL to see frame-rate readings.

## Controls
| | Phone | Keyboard + mouse |
|---|---|---|
| Walk to a spot | Tap it | Click it |
| Walk freely | Touch and drag on the left half | W A S D or arrow keys |
| Walk a little faster | Push the thumb to the edge | Hold Shift |
| Look around | Drag on the right half | Drag with the mouse |
| Zoom | Pinch | Scroll wheel |
| Jump | The round button, bottom right | Space |
| Settings (volume, subtitles, reduce motion, Leave) | ⋮ top right | Esc |

## The path
1. Touch the water to begin. You wake as a figure of light on a night shore, and **J01 The Shore** plays.
2. Walk down the beach into the water. You start swimming and **J02 The Crossing** plays. The swim takes about 45 seconds, about the length of J02.
3. About halfway across, seven soft lights appear on the island. These are where the stations will stand (milestone 2).
4. Step onto the island's sand and **J03 Arrival** plays.

Each narration plays once, and progress is saved on the device. Settings → Leave keeps your place.
To start the story again, clear the site's data in Safari.

## Placeholder in this milestone
- The stations are only lights (milestone 2), and J04–J11 aren't wired yet.
- The island and figure are simple shapes; the look comes from light, water and the gold linework.

## Known issues
- Subtitle timings were aligned automatically to the pauses in each recording. A line may change a moment early or late.

## Frame rate
- Measured only in a headless software renderer here, which says nothing about a phone.
- About 25–55 draw calls and 50–60k triangles per frame, well within an iPhone's budget.
- Quality lowers itself automatically if frames run slow.
- Audio adds about 5 MB (11 narrations and the water bed), loaded as needed.
