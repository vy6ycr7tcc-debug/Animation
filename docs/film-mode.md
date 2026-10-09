# Film mode — the game records its own tour

Open a URL, walk away, come back to a video file with the tour's picture and sound.

```
?film=grand                 the whole walk, end to end (every narrated place)
?film=<tour>                one tour: temple, pyramid, densities, adept, past, veil, descent,
                            ancient, lessons, visions, duat (the same ids as ⋮ → Map → Tours)
&fps=30                     frames a second (10–60, default 30)
&res=1080                   height of the video in pixels: 1080 (default), 1440p, 4k (2160), 720p, or a number.
                            The game draws that many pixels, even more than your screen has.
&scale=1                    multiplies the render size and, unless &res is given, the video height
&until=<seconds>            stop after this long (otherwise: 3 s after the tour's end)
&fast=1                     offline capture (below)
&seed=<n>                   seed for what the tours leave to chance (Math.random is seeded)
```

In real time the file is an `.mp4` (H.264, made by the computer's own video hardware, so recording barely slows the game) where the browser can, else a `.webm`. The game wakes at the shore (the device's save is neither read nor written), plays the tour with
every control, label and word hidden, and offers `inward-journey-<tour>.webm` at the end, with its
size. If the browser won't let sound start by itself it shows one "Begin filming" button first.
Keep the tab in front while it records. The REC dot is DOM, so it is never in the picture.

## Everything, walk-away (`?film=everything`)

One address films every part of the game as its own clip and writes a manifest for the TV app:

```
?film=everything                    temple, pyramid, densities, adept, past, veil, descent, ancient,
                                    lessons, visions, duat, then autofly, autowalk and genesis
&only=temple,autofly                just these      &skip=duat     all but these
&grand=1                            also the whole walk as one long clip
&flysecs=240  &walksecs=150         how long the autofly and auto-walk clips run
&fast=1                             as above, offline (see below)
&fresh=1                            film clips again that are already done
```

It asks for one click (a folder to save into, which writes each file straight to disk, or plain
downloads) and then needs nothing. Between clips every tour and automatic mode is put away and the
wanderer goes back to the shore. Clips already filmed are remembered on the device, so if the page
restarts (the GPU can be taken away on a long run) reload the address, click, and it carries on with
the rest. Keep the tab in front and the computer awake.

Each clip writes `<id>.webm` and `<id>.chapters.json` (fast mode also `<id>.timeline.json`), and
after every clip `manifest.json` is rewritten, so a stopped run still leaves a usable set.

### Chapters and the manifest (for the TV app)

`manifest.json`:

```json
{ "app": "inward-journey", "mode": "live", "fps": 30, "size": { "width": 1920, "height": 1080 },
  "clips": [ { "id": "temple", "label": "The temple, guided", "kind": "tour",
               "file": "temple.webm", "chaptersFile": "temple.chapters.json", "duration": 812.4,
               "bytes": 183000000, "warning": "(only if something looks wrong)",
               "chapters": [ { "id": "03-iii-the-empress", "label": "III · The Empress",
                               "detail": "3 of 24", "kind": "temple",
                               "where": "The temple › III Empress",
                               "start": 143.2, "end": 171.8 } ] } ] }
```

A chapter is one stop of a tour (a shrine, a room, a walk between places, a story of the Duat), or
the whole of autofly, auto-walk or genesis. `start` and `end` are seconds from the clip's first
frame; `kind` is `stop`, `travel`, `temple`, `duat`, `autofly`, `autowalk`, `genesis` or `free`;
`where` is the game's own place name when the chapter began. To jump to a part: open the clip,
seek to the chapter's `start`, play to its `end`. A TV page config can name a clip and a chapter id
(or a clip and a time), e.g. `{ "clip": "temple", "chapter": "03-iii-the-empress" }`.

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

## 4K

`?film=<tour>&res=4k` records 3840×2160. The game then renders about 8.3 million pixels a frame, which
no laptop can do in real time, so for 4K use fast capture: `?film=<tour>&res=4k&fast=1`. It takes as
long as the computer needs (minutes of film can take an hour) and the video is exact; the sound is the
voice and the water (see above). Real-time 4K needs a strong desktop GPU and hardware H.264 encoding;
the card's frame rate says if the machine keeps up. `?film=everything&res=4k&fast=1` films every clip.
