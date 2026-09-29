# 13 — iPhone & Safari (Platform Reality)

## The Primary Platform

The user experiences this on **iPhone**. This isn't a "mobile version" — it's the main event. If it doesn't work beautifully on iPhone Safari, it doesn't work.

## What the Prototype Learned (the Hard Way)

### The WebGPU Problem

iPhone Safari threw `Invalid CommandEncoder` errors. The prototype team initially thought it was a texture issue (mipmaps) and fixed that — but the error persisted.

**The nuance:** "Invalid CommandEncoder" is a *symptom*, not a cause. It's what the browser says when something earlier in the frame went wrong. Chasing the symptom wastes days.

**The approach that works:** Capture the *first* validation error in each frame. The browser's WebGPU API lets you push an error scope, render, then pop and read what actually failed. The first error is the real problem. Everything after it is cascade.

A diagnostic was built that displays this root error on screen. If you hit WebGPU issues, build this first — don't guess.

### The Texture Rule

iOS Safari fails with certain texture configurations that work fine on desktop. The prototype found that **mipmaps** trigger failures.

**The practical rule:** All textures targeting iOS should use simple linear filtering with no mipmaps. This applies to card images, glow effects, everything. Build this in from the start — don't retrofit.

### Other iOS Realities

- **No exotic GPU features.** If it requires a desktop GPU extension, it won't work on iPhone.
- **Async loading matters.** Photos and assets load after the first frame. The scene must handle this gracefully — show the procedural/light version first, swap in the photo when it arrives. Don't show a broken frame.
- **Memory is limited.** 22 high-res card textures plus scene geometry — manage this carefully. Dispose what you don't need.

## The Verification Loop

**Never call a scene "done" because the code compiles.** The prototype had scenes that typechecked, built successfully, and looked awful.

The verification that matters:
1. Screenshot the actual rendered frame on (or simulating) iPhone
2. Look at it closely — dense inspection, not a glance
3. Check movement — a still can lie. Verify the animation.
4. Ask: does this feel contemplative? Does it look cheap? Would the user say "look closer, you're off"?

The prototype built a URL parameter (`?shot=<scene>&t=<seconds>`) that renders a specific frame for screenshot verification. Build something equivalent. It's the only way to verify visual work without manually playing through the whole experience.
