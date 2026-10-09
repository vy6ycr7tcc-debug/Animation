# Film mode — the game records its own tour

Open a URL, walk away, come back to a video file with the tour's picture and sound.

```
?film=grand                 the whole walk, end to end (every narrated place)
?film=<tour>                one tour: temple, pyramid, densities, adept, past, veil, descent,
                            ancient, lessons, visions, duat (the same ids as ⋮ → Map → Tours)
&fps=30                     frames a second (10–60, default 30)
&scale=1                    render scale multiplier (2 = twice the pixels, for a bigger capture)
&until=<seconds>            stop after this long (otherwise: 3 s after the tour's end)
&fast=1                     offline capture (below)
&seed=<n>                   seed for what the tours leave to chance (Math.random is seeded)
```

The game wakes at the shore (the device's save is neither read nor written), plays the tour with
every control, label and word hidden, and offers `inward-journey-<tour>.webm` at the end, with its
size. If the browser won't let sound start by itself it shows one "Begin filming" button first.
Keep the tab in front while it records. The REC dot is DOM, so it is never in the picture.

## Real time (default)

Chrome or Edge on a computer. The picture is a composite canvas (the game plus the dark or white of
each crossing's fade, which is a DOM layer and so would otherwise be missing) captured by
`MediaRecorder`. The sound is the audio engine's whole master bus (voice, bed, tones, one-shots),
tapped after its compressor, so the file holds everything the player would hear. The best graphics
tier is held for the whole recording.

## Fast (`&fast=1`)

Time is virtual (`src/debug/filmClock.ts`): `performance.now`, `Date.now`, timers and
`requestAnimationFrame` run on a clock the film steps one 1/fps at a time, so the game's simulation
is on a fixed timestep with no wall-clock dependence, and each frame takes as long as the GPU needs.
Every frame is encoded with WebCodecs (VP9) into a WebM (`webm-muxer`, MIT). The sound is rebuilt
from a timeline of what the audio engine played: every voice start and stop with its fade, the
water bed and its ducking, the master level, all on the audio clock. That is the **voice and the
water**. The generated layer (modal pad, bowls, chimes, one-shots) is made live from random choices
and is **not** in a fast capture; use real time for the full mix.

Alongside the video comes `inward-journey-<tour>.timeline.json`: fps, frame count, size, seed and
every audio event with the frame it fires on.

Without WebCodecs (Firefox, Safari) a zip comes instead: `frames/f000000.jpg…`, `timeline.json` and
`make-video.sh`, an ffmpeg command that lays the voice in at the timeline's moments.

## Notes

- The archive player (planets, trees, crystals) plays through a media element, outside the audio
  graph, and tours never use it.
- A MediaRecorder file has no duration header (it plays, but some players can't seek);
  `ffmpeg -i in.webm -c copy out.webm` writes one. Fast captures have it.
- Verified headless (software GPU): real time with `&until=20` gives VP9 + Opus; fast gives an exact
  frame count and duration. A real GPU/laptop pass is the owner's.
