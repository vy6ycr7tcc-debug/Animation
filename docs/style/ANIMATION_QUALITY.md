# Animation Quality Bar — Inward Journey game

Companion to `VISUAL_QUALITY.md`. Read both before generating ANY motion: ambient
life, camera moves, transitions, effects, narration-synced visuals.

## The core truth

The model's default motion is linear interpolation at constant velocity — and that
is exactly what "cheap" feels like. Nothing in nature moves that way. Every motion
in this game must be eased, arced, layered, and motivated. Slow is luxurious:
this is a contemplative game, so pacing is measured in seconds, not frames.

## The 12 principles, adapted for a contemplative game

| Principle | How it applies HERE |
|---|---|
| **Slow in / slow out** | NEVER linear. Every tween eased (easeInOutCubic, expo.out). This one rule fixes most robotic motion. |
| **Arcs** | Nothing travels in a straight line. Wisps, birds, lights, camera — everything curves, orbits, or sways. |
| **Secondary action** | When the main element moves, small things respond slightly delayed: particle trails, light flicker, wisp lag. This is what makes motion feel alive. |
| **Follow-through & overlap** | Elements don't arrive simultaneously — stagger arrivals by fractions of a second. Children lag parents. |
| **Timing** | Slow = elegant. Idle motion is unhurried — periods of several seconds, nothing twitchy (mainline practice: ~2s beam shimmer up to ~20–30s ring turns; 4–8s is a safe default for breathing, not a ceiling). Reveals unfold over seconds. Fast motion is reserved for nothing — speed is not in this game's vocabulary. |
| **Anticipation** | Before a reveal, a subtle pull-back: light dims a breath before the scene opens, camera settles before the subject arrives. Preps the eye. |
| **Staging** | One primary motion at a time. When the key moment happens, background motion quiets — dim the secondary so the primary reads. |
| **Exaggeration** | Used with restraint here. Push 5%, not 30%. The style is whisper, not shout. |
| **Appeal** | The sum of the above, applied with care. Motion should feel like breath. |

(Squash & stretch and solid drawing are character-animation tools — mostly N/A for
this game's abstract cast. Don't force them.)

## Procedural motion patterns (Three.js)

- **Frame-rate independence is mandatory**: all motion in units per second, scaled
  by `dt`; cap `dt` at 0.05 so tab-resume doesn't cause jumps. Never `position.x += 0.2`
  per frame — that speed changes with the player's refresh rate.
- **Smooth damping** for anything that follows (camera, lights, wisps trailing the
  player): damp toward the target over ~0.3–0.6s, never snap or track directly.
- **Sine + phase offsets** for ambient life: `Math.sin(t * speed + phase) * amp`
  with different phases per element — a field of lights breathing out of sync.
  Pure synchronized sine looks mechanical; offset phases look organic.
- **Noise-based drift** for camera idle and floating elements: layered sines at
  irrational frequency ratios, or simplex noise — never a single clean sine.
- **Springs** for settle-and-overshoot moments (a light arriving, a reveal
  landing): stiffness/damping tuned soft, so it sighs into place.

## Ambient life ("living stillness")

A contemplative world is never frozen — but it never hurries either:
- Every scene needs at least one ambient motion layer: drifting particles, breathing
  light, swaying geometry, distant birds.
- Idle behaviors on loops: unhurried breathing (several-second periods), slow orbits, drifting fog banks.
- Flocking/boids-lite for birds: start simple (follow-the-leader + separation),
  add complexity only if needed.
- Distant motion sells scale: far birds, slow clouds, deep water — the background
  must live too.

## Camera

- **Motivation rule**: the camera moves for one of three reasons only — it FOLLOWS
  a moving subject, it CHANGES MEANING (a reveal, growing intensity), or the move
  IS the concept. A move without a reason wastes the shot. When in doubt, lock the
  camera and move the subject.
- **One move per shot.** Never dolly + pan + tilt at once.
- Vocabulary for this game: slow push-in (intimacy), slow orbit (reveal/desire),
  crane up (scale/awe), pull-back (context), slow pan across vista (world-establishing).
- Handheld is "subtle handheld drift," never shake. Stillness is also a move —
  a locked frame while light changes sells endurance and calm.
- Every move states where it ends. No endless drifting into the void.

## Anti-patterns

- Linear tweens. Constant-velocity anything.
- Everything appearing at frame 1 / everything moving at once.
- Synchronized identical motion across many elements (the "CGI crowd" tell).
- Motion faster than the narration's emotional pace.
- Animating with fixed per-frame increments instead of `dt`.
- Camera moves with no motivation.
- 60fps or don't animate: a stuttering animation is worse than none. Pause
  offscreen and hidden layers.

## The breath test

Watch (or imagine) any motion on a loop for 30 seconds. If it starts to annoy,
it's wrong. Contemplative motion should be watchable forever — like breath,
like water. If you can predict exactly where it will be in 5 seconds, add
variation: a second frequency, a phase drift, a responding secondary element.
