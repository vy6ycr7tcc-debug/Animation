# 14 — Quality Bar (The User's Eye)

## What the User Has Rejected

These are direct quotes. They define the standard:

- **"Omg…look closer… you are so off."** — On a visual review that was too superficial. The work was technically complete but artistically wrong, and a casual glance didn't catch it.

- **"It looks boxy no?"** — On the Duat. The shapes were correct but they felt like 3D primitives, not a real place.

- **"I didn't want the actual copy paste image of the tarot cards but a rendering … that type of holographic"** — On the cards looking like pasted photos instead of light projections.

- **"Awful tbh"** — On the igloo looking like a beginner 3D model.

- **"This is too awful" / "absolute disaster"** — On the overall implementation pipeline, 2026-09-28. The process was broken, not just the output.

## What These Rejections Have in Common

The user sees **materiality**. They can feel the difference between:
- A photo pasted on vs. light projected
- A box with texture vs. a carved stone
- A 3D model vs. a real place
- Something contemplative vs. something gamey

This isn't about polygon count or texture resolution. It's about whether the thing *feels* like what it claims to be. The user trusts their eye over any technical metric.

## The Standard

**"If it looks cheap, it is cheap — no matter what the code says."**

Typecheck passing means nothing. Build succeeding means nothing. The only thing that matters is: does it look and feel right?

## How to Apply This

1. **Look closer.** The user's first complaint was that the review was superficial. When verifying visual work, inspect dense frames. Zoom in. Look at the edges, the lighting, the composition.

2. **Check movement.** A still frame can hide bad animation. Verify that things move the way they should — the weave, the hologram shimmer, the tree's growth, the water.

3. **Ask the materiality question.** For every element: does this feel like what it is? Does the ice feel like ice? Does the hologram feel like light? Does the stone feel like stone? If the answer is "it feels like a 3D model of [x]," it's wrong.

4. **Trust the eye over the metric.** If the exposure reads as blown out, it is — even if the values are "correct." If the pacing feels rushed, it is — even if the timing matches the spec.

## The Three Documents

The prototype used three quality documents for every visual worker:
- **Visual quality** — composition, lighting, color, materiality
- **Animation quality** — movement, pacing, transitions, the feel of motion
- **Style guide** — distilled from the project's own code, the aesthetic source of truth

Every piece of visual work should be checked against all three. Not as a checklist — as a way of seeing.
