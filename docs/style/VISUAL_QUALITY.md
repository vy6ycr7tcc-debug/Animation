# Visual Quality Bar — Inward Journey game

Read this before generating ANY visual: new scene, new area, new prop, new effect.
The model is blind — it cannot see its output. This document is its eyes, encoded.
Every item here is a known difference between "cheap-looking" and "cinematic" in
Three.js, gathered from production best practices.

## The core truth

Beauty is 90% LIGHT, not geometry. Assassin's Creed doesn't look good because its
rocks have more polygons — it looks good because of lighting design, atmosphere,
post-processing, and composition. A glowing sphere with great light beats a detailed
mesh with flat light, every time. When output looks "cheap," the cause is almost
never the geometry. It is the light.

## The pipeline (THIS codebase — WebGPU/TSL, custom)

This game does NOT use the vanilla three.js stack. It has its own custom pipeline —
work WITH it. Never bolt EffectComposer/UnrealBloomPass/OutputPass on top; never
add a second fog, tone mapper, or light rig.

1. **Tone mapping**: `AgXToneMapping` is set globally in `main.ts`. Don't change it,
   don't add another. Design emissive intensities to sit well under it.
2. **Fog**: custom height fog via `scene.fogNode = ijFogNode()`, driven by
   `fogUniforms` (color, glow, density) with moonlit in-scattering. New areas tune
   these existing uniforms per scene — never add `THREE.Fog`/`FogExp2` alongside
   (two fogs composite twice).
3. **Post**: the bespoke `post` module — `post.configure({ ao, rays, bloom, aa })`.
   Bloom and glow live here, in the game's own hologram/glow idiom (custom shaders,
   additive sprites). Do NOT import EffectComposer or UnrealBloomPass.
4. **Lighting**: a hemisphere + a single directional ("star"/moon) + the `Moods`
   system carry all color and mood. New scenes inherit this rig. Achieve subject
   separation the codebase way (glow sprites, emissive accents, fog depth) — not
   by adding punctual lights. One shadow-caster discipline still applies.
5. **Materials**: match the existing PBR ranges (roughness/metalness) already in
   the codebase. Check how neighboring scenes set up their materials and stay in
   family.

**Golden rule: before adding any pipeline-level feature, grep `main.ts` for the
existing equivalent.** This codebase is years of accumulated custom rendering —
duplication is the enemy. The generic vanilla-three advice below the diagnosis
table applies only where the custom pipeline has no equivalent.

## The cheap-look diagnosis table

| Symptom | Cause | Fix |
|---|---|---|
| Flat, cardboard, "not 3D" | No environment map | `scene.environment` via PMREM |
| Milky, washed out, low contrast | Grade/tone-mapping drift | Keep `AgXToneMapping` (never swap it); tune the existing post color grade and `fogUniforms`, not a new tone mapper |
| Plasticky / candy colors | Over-lighting — every channel climbing to its ceiling | Cut light intensities, not the colors |
| Pure black void background | No atmosphere | Fog + gradient sky + floating particles |
| Flickering surfaces ("glitchy") | Z-fighting: coplanar surfaces, depth precision | Increase `near`, decrease `far`; never place surfaces coplanar; `logarithmicDepthBuffer` if needed |
| Striped shadows ("glitchy") | Shadow acne | `shadow.bias = -0.0005`; tighten shadow camera frustum before raising mapSize |
| Banded gradients | 8-bit quantization | Low-opacity grain/dither |
| Too-perfect CG primitives | Default sphere/box, no variation | Bevels, slight random displacement, flat shading for faceted looks, roughness variation |
| Everything in focus, no depth | No depth cues | Fog, subtle DoF on hero, atmospheric perspective |
| Robotic motion | Linear easing, constant velocity | EaseInOutCubic / expo.out, slow, staged reveals; idle sway on ambient elements |
| Empty, one object floating | No context | Particles, ground plane, ambient elements — a subject needs a world |

## Composition (before writing any geometry)

- **Rule of thirds**: place the subject off-center. Centered = surveillance camera.
- **Foreground / midground / background**: every shot needs all three. A lone object
  in a void is the default failure.
- **Silhouette first**: the shape must read as a dark silhouette before any detail.
  If the silhouette is boring, no material will save it.
- **Scale contrast**: tiny lights against vast darkness, small figure under huge
  geometry — awe comes from scale difference.
- **Limited palette**: 3–5 colors per scene, analogous or complementary. This game's
  canon: deep blues, golds, embers. New hues must be justified, never decorative.
- **One focal point per view**: the eye must know where to land. Everything else
  supports it.

## Materials

- This codebase's solid-object idiom is **unlit node materials with hand-rolled
  TSL lighting** (`MeshBasicNodeMaterial` + custom light math — see
  `src/world/creation.ts` bark/crystals/leaves). That is canon, not a shortcut:
  near-black blue bases, grain/relief in TSL, fresnel rims, fog mixed manually.
  `MeshStandardMaterial` is the exception here (etched stone), not the default.
  What's banned is FLAT unlit — a solid with no lighting treatment at all.
  `MeshBasicMaterial` (non-node, no custom lighting) is for glow sprites and
  sky only.
- Roughness ~0.9–1.0 for stone/organic, lower + envmap for anything that should
  feel wet, polished, or luminous.
- Vertex colors or subtle noise for large surfaces — a 10k-vertex terrain can carry
  full color variation with zero textures.
- Emissive is for LIGHT SOURCES ONLY. If it doesn't emit light in the fiction,
  it doesn't get emissive.

## Motion

- Nothing moves at constant velocity. Nothing appears at frame 1 all at once.
- Slow is luxurious: contemplative pacing means seconds, not frames.
- Secondary motion: when the main element moves, small elements (particles,
  light flicker, cloth/ hair/ wisps) respond slightly delayed.
- Camera: subtle drift or breathing sway, never perfectly static, never jerky.

## Performance (iPhone Safari is the target)

- `setPixelRatio(Math.min(devicePixelRatio, 2))` — DPR 3 renders 9× fragments
  for no visible gain on a phone.
- `InstancedMesh` for repeated geometry — each `Mesh` is a draw call.
- Never allocate geometry/materials inside the animation loop.
- One shadow-casting light. Tight shadow frustum.
- Post passes at reduced resolution where possible; measure before stacking.

## The screenshot test

Every visual must pass this: **a single still frame, no motion, no explanation —
does it look intentional?** If the answer needs a paragraph of context, the visual
failed. The verification loop screenshots every scene; design for the still frame
first, motion second.
