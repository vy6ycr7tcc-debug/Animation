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

- `src/main.ts`: game loop, states (intro, play, rest), renderer and post-processing, UI wiring
- `src/core/`: audio (generative beds), input (keyboard, mouse, touch joystick), save, adaptive quality, narration/subtitles
- `src/world/`: sky, water, terrain (one height function for collision and meshes), islands, etched linework, motes
- `src/player/`: the wanderer (mesh and animation), controller, follow camera, footprints
- `prompts/`, `reference/`, `narration/`, `prototype/`: brief and source material
