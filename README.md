# Inward Journey

A contemplative third-person exploration game about Mind, Body and Spirit.
The brief is `prompts/master-build-prompt.md`; `CLAUDE.md` records how it's being applied; `PLAYTEST.md` says how to play the current build.

## Develop

```sh
npm install
npm run dev        # serves on your LAN too; open the "Network" URL on the iPhone
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build on the LAN
```

## Deploy

`.github/workflows/pages.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`
(or by hand from the Actions tab). One-time setup: repository **Settings → Pages → Source: GitHub Actions**.
The site then lives at `https://vy6ycr7tcc-debug.github.io/Animation/`.

The build uses a relative base, so `dist/` also works as-is on Netlify, Vercel or any static host.

## Layout

- `src/main.ts`: renderer and post-processing, world setup, input, UI wiring, the frame loop
- `src/journey.ts`: the stations' narration, prompts and questions, the Chariot's ride, the return and the ending
- `src/core/`: audio (water bed, tones, one-shots), narration and subtitles, input, save, adaptive quality, asset loading
- `src/world/`: sky, water, reflection, terrain, stations, etched linework, atmosphere (mist, far hills, fireflies), motes
- `src/player/`: the wanderer (recorded animation, fluid body, motes, ribbons), controller, camera, footprints
- `src/ui/journal.ts`: the private journal
- `content/`: narration catalogue with subtitle cues, station data, scripts
- `public/`: audio and the wanderer's skeleton and animations
- `prompts/`, `reference/`, `narration/`, `prototype/`: briefs and source material
