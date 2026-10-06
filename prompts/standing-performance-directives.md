# Standing performance directives — all games, all future builds

Attach this block to every future build prompt (Opus/Inward Journey and GLM/Juzu alike). These are standing orders, not suggestions. They exist because a full audit (2026-09-30) found the game slow from a thousand small cuts that no single scene brief ever asked anyone to prevent.

**The gate:** zero visual compromise. Nothing about the look gets worse. The weakest target device (physical iPhone for Inward Journey; the target hardware for Juzu) is the judge — desktop smoothness proves nothing.

1. **Residency lifecycle from day one.** Nothing is resident "forever" by default. Every place and system gets a lifecycle: build on approach/enter, dispose on leave (geometries, textures, materials, pipelines). The only always-resident set is what the player can see right now. New content follows the existing streaming pattern (e.g. journey rooms: lazy dynamic import + full `takeDown` dispose) — never the "build at boot, hide with `visible`" shortcut.

2. **No per-frame allocations in hot loops.** Zero `new` (`Color`, `Vector3`, arrays, closures) in per-frame code — preallocate and reuse. A hundred small clones per frame is a silent GC tax that only shows up on mobile, in long sessions. (This exact bug cost real frame time: `moods.blend()`.)

3. **Dirty-flag all dynamic buffers.** Never re-upload GPU attributes every frame unconditionally. Use dirty flags / update ranges, and skip the upload when nothing changed. If the shader animates via uniforms, the CPU-side attributes usually don't need rewriting at all — verify per system.

4. **Distance-gate everything that ticks.** Animation mixers, AI, per-station updates, skinning rates, label updates — every per-frame system gets an explicit distance radius beyond which it doesn't tick. If it's hidden beyond X meters, it costs zero.

5. **Cache expensive analytic queries.** Per-frame procedural queries (terrain height, noise fields) get a coarse lattice cache; keep exact evaluation only where something visually touches the result (player feet, grounded objects). Never ~2,000 trig calls per frame for camera math.

6. **Textures compressed at build.** KTX2/UASTC (or platform equivalent) from the start — never ship raw RGBA8 by default. Hero art gets an on-device A/B before committing to a lossy format; if the difference is visible, that asset stays raw. No orphaned assets riding along in the download.

7. **Warm pipelines ahead of time.** Every new material set gets `compileAsync` (or equivalent) during a fade/loading screen *before* the player can see it. Never compile shaders mid-walk. Pipeline recompiles on quality-tier change coincide with fades.

8. **Load failures are loud.** Asset loads warn + retry with backoff. A missing core model is a visible whisper, never a silent absence. (Silent `loadBytes` once deleted the horses and birds without a trace.)

9. **Bound every cache.** Audio bytes, decoded PCM, geometries, anything that accumulates with session length gets an LRU or a hard cap. Nothing grows unbounded the longer someone plays.

10. **Measure on the weakest device, report numbers.** The live stats readout (fps, frame time, draw calls, tris) is the gate. Every perf-relevant PR reports before/after numbers from the target device. Estimates are not measurements.

11. **No visual-compromise "optimizations" without the owner.** Fill-rate trades (fewer shader taps, fog trims, SMAA→FXAA, resolution cuts) change visible pixels — those are owner decisions, never unilateral optimizations. If the device is still fill-bound after everything free is done, say so and stop.
