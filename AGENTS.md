# AGENTS.md — Inward Journey (vy6ycr7tcc-debug/Animation)

Jules reads this file automatically. For deeper context also read `CLAUDE.md`
(full project history and decisions) and `PLAYTEST.md` (current world behavior).

## What this is
A contemplative third-person 3D exploration game (Three.js r186, TypeScript, Vite).
A static site deployed via **GitHub Pages from `main` — this repo IS the live site**.
Every merge to `main` ships to players.

## Commands — run these, in this order
- Install: `npm ci` (lockfile-based. **Never** run `npm install` or regenerate `package-lock.json`)
- Typecheck: `npm run typecheck` (`tsc --noEmit`)
- Tests: `npm test` (`vitest run`) — the repo currently has **no test files**;
  "No test files found" is the expected state, not a failure of your change
- Build: `npm run build` (runs `prebuild`: `node generate-assets.js`, which
  regenerates `public/assets.json` from `public/` — never hand-edit `assets.json`)

Typecheck and build must pass before you call the work done.

## Paths
- `src/` — game code (TypeScript modules bundled by Vite). This is where you work.
  Entry: `src/main.ts`. Scenes: `src/scenes/`. World systems: `src/world/`.
- `art/`, `audio/`, `narration/` — binary assets at repo ROOT.
  **Never add, remove, or regenerate files here.** Check existing imports for the
  correct relative-path pattern before referencing them; do not move them.
- `public/` — static files served as-is. `public/assets.json` is generated, not written by hand.
- `index.html` — entry page.
- `content/`, `prompts/`, `reference/`, `references/`, `PLAYTEST.md`, `CLAUDE.md` —
  design docs and reference material. Read them; do not rewrite them.
- `tools/`, `prototype/` — dev tooling and experiments. Leave alone unless asked.

## Hard rules
- **Allowed to modify:** `src/`, `index.html`, non-generated files under `public/`.
- **DO NOT MODIFY:** `package-lock.json`, `package.json` dependencies
  (no adding/removing deps without explicit instruction), `vite.config.ts`,
  `tsconfig.json`, anything under `art/`, `audio/`, `narration/`, `.github/`,
  `public/assets.json`.
- Samuel plays mainly on **iPhone** — Mobile Safari performance and audio are
  first-class requirements. No heavy desktop-only techniques without a fallback.

## Visual/scene work — verification bar
Typecheck/build passing is NOT visual verification. This project ships a
dev-only still-frame hook: `?shot=<sceneId>&t=<seconds>` (see `src/debug/shot.ts`)
boots the world, jumps the scene to time T, renders exactly one deterministic
frame, and stops. Scene ids include: shore, igloo, garden, galaxies, desert,
tree, tree-station, pyramid, duat, temple-tour.
**Verify every scene change by rendering its still frame and inspecting it.**
Never call a scene done on typecheck/build alone.

## Session discipline (non-negotiable)
- **Commit and push the session branch after each milestone** — never accumulate
  unpushed work, and never finish with uncommitted changes.
- One feature per session, one branch per session.
- Parallel sessions must not touch overlapping files.
- Do not regenerate a plan that discards human commits on the branch.
- **Do not ask clarifying questions** — make the least-surprising
  assumption, state it in your summary, and keep working. A session parked
  waiting for feedback is a failure mode, not a status.
- Name the exact files in scope up front. If you touch anything outside
  them, restore those files from `origin/main`
  (`git fetch origin && git checkout origin/main -- <file>`) and report
  what happened before continuing.
- Visual briefs may attach project style docs (visual quality, animation
  quality, style guide) — when present, they are the visual bar: read and
  follow them on every visual you generate, and confirm in your summary
  that you are actually following them.

