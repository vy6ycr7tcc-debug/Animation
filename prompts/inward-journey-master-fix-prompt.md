# INWARD JOURNEY — MASTER FIX & ELEVATION PROMPT

## What this is

One prompt to fix everything. Three phases, in order, each gated on the last. You do not start a phase until the previous phase's PRs are merged by the owner.

- **Phase 1 — Review & repair:** verify everything built so far, fix what's broken.
- **Phase 2 — Feedback rebuilds:** the owner's playtest notes (tour triggers, B6/B7 quality, map menu, Battle of Heaven), rebuilt with real creative effort.
- **Phase 3 — Global beautify:** system-by-system elevation with before/after proof.

## Standing rules (non-negotiable, all phases)

- The visual bar: `docs/style/` (VISUAL_QUALITY, ANIMATION_QUALITY, STYLE_GUIDE). Read and follow on every visual; confirm in each PR summary.
- Every visual claim gets a `?shot=<sceneId>&t=<seconds>` still inspected with read_image_file before you call it done. Typecheck + build is not verification.
- One branch + one PR per issue or per tight cluster. **Never merge — the owner merges.**
- No visual-identity compromises without owner approval. No invented narration/dialogue. No placeholder voice.
- Do not touch `claude/b6-after-veil` / `claude/b7-long-descent` remnants or any other agent's live branch.
- Effort is the point: this is a high-effort pass. Lazy filler (random sitters, single-trick effects) will be rejected. The visual Bible (`prompts/visual-bible/`) is your inspiration source — extract mood, palette, and structure, never clone.
- Context hygiene: load only what the current task needs, at the moment you need it. Do NOT read the whole prompt library, all style docs, the full sweep set, or the entire Bible up front — that burns context and degrades instruction-following over long sessions. Before each task, name the exact files/sections required, read those fresh, and work. When you return to a file later, re-read the relevant range rather than trusting a stale earlier read.

---

## PHASE 1 — Review & repair

**Context:** read `~/workspace/sweep/static-audit.md` (every merged PR #194–#210 diff-checked vs plan criteria) and `~/workspace/sweep/review-findings.md` (90 stills reviewed overnight, 7 findings pre-filed, F1–F7). The stills at `~/workspace/sweep/shots/` are current as of main @ e9401365.

**Do:**
1. For plan items A1–A5, B1–B5, check each merged diff against EVERY acceptance criterion. Mark: VERIFIED (code + still), PLAUSIBLE, GAP.
2. Work the pre-filed findings:
   - **F1 (fix first):** `?shot=density-0` / `?shot=density-7` hang — the room factory in `src/main.ts` only maps rooms 1–6. Map 0 and 7 to their real modules.
   - **F2 (fix first):** `ruin-0`, `ruin-4`, `meadow` shot cameras mis-framed (inside geometry / weak composition). Re-frame them.
   - **F3:** density-5 nearly black — propose a brightness level, verify with a still.
   - **F4:** Duat "animations all over the place" — stagger the hour-vision morphs so adjacent hours don't transition simultaneously; lengthen the morph cycle; calm the vortex. Verify with a denser still time-series (t=0..30 in 3s steps per hour). (Tour video is not capturable headless — full boot never completes under SwiftShader; do not attempt it.)
   - **F5:** B3 framing — densities 2/3 read wide, 5/6 read center, all read well. Confirm each with a still and record the decision explicitly.
   - **F7:** A4 "patchy character LOD" was never changed in #200. Reproduce with close-up stills; fix the LOD.
3. Extend the findings ledger with anything new (severity / evidence / proposed fix), then fix: one branch + PR per issue, each with `?shot=` proof.
4. Walk the grand tour's state machine and the Duat tour's hour-restart/finale-handoff logic against the fixed code.

**Gate:** Phase 1 is done when the findings ledger is complete, fix PRs are open with visual proof, and the owner has merged them.

---

## PHASE 2 — Feedback rebuilds (owner playtest 2026-10-07)

Build these with genuine creative effort. The visual Bible at `prompts/visual-bible/` (README + 10 images) is required reading before you touch B6/second-wave areas.

### 2A — Tour arrival triggers (B6 + B7 + every tour-bearing monument)
Every monument with a guided tour must START its tour when the player arrives — no dead monuments, no hunting for a start button. Implement arrival detection per monument; the tour begins on entry. Verify each with a still at tour start.

### 2B — B7 Long Descent: de-baggy
The owner reports: sky flooding, no real floor ("super baggy"), everything bland. Build a proper ground plane, richer set dressing, layered depth. It should feel like a descent, not a void.

### 2C — B6 transition-to-new-age: the ruins reborn (visual Bible section 3)
The current animation is lazy (random sitters, alien head-beams — never again). The new centerpiece: a forest path leads the player to ruins; then the ruins come ALIVE — stones levitate into place, walls rebuild, gardens bloom in time-lapse, light washes through. The thesis is **Nehemiah: the glorious ruins made new, the new earth**. Choreograph it; this is the scene's reason to exist.

### 2D — Map menu redo
The menu is unnavigable as content grows. Redesign it for clarity at scale: group by era/region, show what's where at a glance, keep it to two taps max to any destination.

### 2E — Battle of Heaven
The owner hasn't seen a working version. Build or fix per the visual Bible (section 4): celestial, painterly, golden light vs shadow, awe not horror.

**Gate:** Phase 2 is done when each rebuild has `?shot=` proof (and still time-series for the B6 rebuild animation) and the owner has merged the PRs.

---

## PHASE 3 — Global beautify

Only after Phases 1–2 are merged. **Systems, never scenes.** One shared system per branch/PR. For EVERY system: change it, re-render the full `?shot=` sweep (shot list: `~/workspace/sweep/shot-list.txt`, script: `~/workspace/sweep/sweep-farm.py`), build before/after contact sheets (script: `~/workspace/sweep/compare-sweeps.py`) pairing your re-render against the pre-change stills, inspect every pair. If ANY scene regressed, revert or narrow. A global tweak that hurts one scene does not ship.

Order of leverage:
- **S1 — Post-processing** (`src/gpu/post.ts`): grade, bloom, vignette. Cohesive cinematic finish; keep night scenes legible.
- **S2 — Shared particle shaders** (`src/gpu/tsl.ts` softPoints/spriteCloud): softer edges, better distance attenuation, gentler falloff. Watch dense scenes for overdraw blowout.
- **S3 — Shared materials** (ribbons, stone, texture pipeline): richer speculars, softer translucency.
- **S4 — Lighting rig consistency:** converge reinvented per-scene rigs on shared parameters; don't flatten intentional variety.
- **S5 — The wanderer:** last, the most-seen object.

**Done when:** ≤5 PRs, each one system, each with before/after sheets proving no regression and visible elevation. The owner should feel the difference in the first frame of every scene.

---

## Repo hygiene (do first, it's quick)

Delete assets/code no longer referenced anywhere (the owner authorized cleanup). Recycle what's reusable. List what you removed in the PR summary.
