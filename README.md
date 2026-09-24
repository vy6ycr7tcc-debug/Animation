# Three Islands — Inward Journey

A contemplative 3D browser piece: Mind, Body and Spirit as three floating islands.
See `CLAUDE.md` for the brief, art direction and milestones.

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

- `src/main.ts` — renderer, post-processing (bloom, tone mapping, SMAA, vignette), input, UI, readings panel
- `src/scene.ts` — milestone 1 test scene (placeholder island, winged disk, beam, motes, sky)
- `src/audio.ts` — Web Audio engine (iOS audio session, pad, bells; nothing below 200 Hz)
- `src/voice.ts` — narration with always-on subtitles (device voice until the mp3s exist)
- `src/quality.ts` — frame stats and adaptive quality tiers
- `prototype/`, `reference/`, `narration/` — source material (see `CLAUDE.md`)
