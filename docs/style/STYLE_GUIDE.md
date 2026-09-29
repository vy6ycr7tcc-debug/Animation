# Style Guide — Inward Journey (distilled from mainline code)

Source of truth for how this game looks. Every rule below was extracted from the
core systems — `src/main.ts`, `src/gpu/tsl.ts`, `src/world/creation.ts`,
`src/scenes/creationKit.ts`, `src/world/moods.ts`, `src/world/fog.ts`,
`src/world/sky.ts`, `src/world/etching.ts`, `src/core/narration.ts` — on branch
`temple-tour-v2`. Scene files currently being rewritten (igloo, desert, tree,
templeTour) are NOT sources; they are experiments.

Write new visuals to match this document, not to invent a new look.

---

## 1. Palette — the actual colors

The game's canon is **deep blues, golds, embers** (VISUAL_QUALITY.md agrees).
Values below are the real ones; use them, don't approximate.

**Night baseline** (`src/world/moods.ts:52-59`, the NIGHT mood — the game's home key):
- Sky zenith `(0.016, 0.022, 0.072)`, mid `(0.038, 0.043, 0.12)`, horizon `(0.105, 0.1, 0.22)`
- Fog color = horizon `(0.105, 0.1, 0.22)`; moon-glow in haze `(0.55, 0.42, 0.34)`
- Hemisphere sky `(0.48, 0.53, 0.82)`, ground `(0.13, 0.1, 0.21)`, intensity `0.85`
- Key "star" light `(1.8, 1.58, 1.33)` — warm white, never pure white

**Gold accents** (the game's signature light):
- Rings: `0xffd700` (`src/scenes/creationKit.ts:188`)
- Bark grain: `(1.0, 0.78, 0.48)` alternating with pale blue `(0.75, 0.85, 1.0)` by seed (`src/world/creation.ts:337`)
- Etched stone lines: `#e9c37d` (`src/world/etching.ts:134`); rock etch `#d8b8ff` (`src/world/creation.ts:593`)
- Path lamps: `0xffe6a0` (`src/scenes/creationKit.ts:375`)

**Cool lights**:
- Light beams: `0xb8d1ff` (`src/scenes/creationKit.ts:227`)
- Starlight rim on bark: `(0.3, 0.38, 0.8)` (`src/world/creation.ts:332`)
- Leaf/canopy bands by hue: gold `(1.0, 0.8, 0.5)` → pale blue `(0.7, 0.85, 1.0)` → pink `(1.0, 0.7, 0.88)` (`src/world/creation.ts:578`)

**Crystals**: core blends blue `(0.45, 0.55, 1.0)` → pink `(1.0, 0.72, 0.92)` by per-instance hue; rainbow split via `spectrum()`; starlight glint `(1.0, 0.95, 0.9)` × 2.5 (`src/world/creation.ts:401-407`)

**Dark surfaces**: bark base `mix((0.006,0.005,0.014), (0.03,0.028,0.06), hemi)` — near-black with a blue lift (`src/world/creation.ts:330`); stone `#1c1a2c` (`src/world/etching.ts:134`); fog shadow grade lifts blacks to `(0, 0.01, 0.04)` (`src/gpu/tsl.ts:79`).

**Mood travel**: 9 moods (`src/world/moods.ts:167` — night, sunrise, sunset, deep, twilight, golden, dusk, ember, dawn) shift sky/fog/light per direction of travel. New scenes inherit the Moods system; do not hardcode a competing sky.

**Rule**: 3–5 colors per scene, analogous or complementary. New hues must be justified by the fiction, never decorative.

---

## 2. Material idioms — the code recipes

**Bark / organic solids** (`src/world/creation.ts:304-365`): `MeshBasicNodeMaterial` (NOT MeshStandardMaterial) with hand-rolled TSL lighting. Recipe: near-black blue-tinted base; normal-map relief that fades out beyond 25–60 m (`smoothstep(25, 60, dist)`); grain as fine light lines spiraling with `aU`/`aAng`; light flowing down the trunk `pow(fract(vU*3 + uT*0.11), 14)`; thin starlight rim `pow(1-ndv, 5) * 0.18`; crown sway ∝ height² (`sw0² * 0.002`, roots still); hash-discard dissolve when the camera comes closer than ~0.6–2.2 m so bark never becomes a wall in front of the lens; fog mixed manually at the end. Geometry: `grow(SHAPES[k], seed)` → `tubes()` — CatmullRom limbs with flare at the base, 4–8 sides by thickness (`src/world/creation.ts:241-273`).

**Crystals** (`src/world/creation.ts:367-425`): `prismGeometry()` — six-sided column, pointed tip, flat-shaded, `aY` 0 at base → 1 at tip. `crystalMaterial()` — instanced, additive `MeshBasicNodeMaterial`, DoubleSide, `renderOrder = 2`. Light recipe: colored core + rainbow `spectrum()` split on the fresnel that drifts slowly with time + light rising through the stone `pow(fract(vY*1.3 - uT*0.22), 8)` + hard starlight glint `pow(max(dot(reflect(-v, n), uStar)), 40) * 2.5`.

**Canopy / leaves** (`src/world/creation.ts:561-588`): `spriteCloud` of instanced soft sprites hung on the twig tips. Per-instance attributes drive everything: hue band picks gold/blue/pink; twinkle `sin(uT*(k*2.5+1.2) + k*60)*0.45+0.55`; a slow luminance wave travels down the canopy `sin(uT*0.5 - y*0.4)*0.4+0.6`; a few glints detach and fall. **Alpha is folded into RGB**: `mat.colorNode = vec4(vC * a * vA, 1)` — the alpha channel is always 1.

**Glow** (`src/gpu/tsl.ts:174-186`): `glowShader(init, (u, uv) => vec3(...))` — additive `MeshBasicNodeMaterial`, `fog: false`, `depthWrite: false`. The color callback returns **vec3**; the maker wraps it as `vec4(color, 1)`.

**Soft points** (`src/gpu/tsl.ts:143-156`): `softPoints()` — `PointsNodeMaterial`, additive, transparent, `depthWrite: false`, `fog: false`, `sizeAttenuation: false` (pixel-sized; set `sizeAttenuation: true` + `size` for world-sized). Round sprite mask: `smoothstep(0.5, 0.2, length(pointUV - 0.5))` multiplied into opacity. Pixel size from world size: `size * uPx / max(viewDepth, 0.5)`, clamped (e.g. 1.5–90 px), divided by screen DPR.

**Stone** (`src/world/etching.ts:134` + `src/world/creation.ts:592-601`): `etchedStone("#1c1a2c", line, scale)` — `MeshStandardNodeMaterial`, roughness `0.78`, metalness `0.05`, triplanar-projected cliff texture (never stretches), etched light lines in the cracks. Rocks: displaced `IcosahedronGeometry` (fbm noise), `flatShading: true`, cast + receive shadow.

**Rainbow helper**: `spectrum(h) = 0.5 + 0.5*cos(2π(h + (0, 0.33, 0.67)))` (`src/gpu/tsl.ts:50`) — the crystals' shifting spectrum.

---

## 3. Light & atmosphere — the exact setup

- **Tone mapping**: `renderer.toneMapping = THREE.AgXToneMapping`, set once globally (`src/main.ts:117`). Never change it, never add another. Design emissive intensities to sit well under it.
- **Lights**: hemisphere `0x7a86d0` / `0x221a36` @ `0.85` + ONE directional "star" `0xffe0bc` @ `1.8` (`src/main.ts:140-142`). The directional is the only shadow caster: frustum ±26 m, near 1, far 160, `bias -0.0005`, `normalBias 0.04`, `radius 3`, PCF (WebGPU three has no PCFSoft) (`src/main.ts:143-151`). The `Moods` system drives both per direction of travel (`src/main.ts:228`). **Never add punctual lights.**
- **Fog**: `scene.fogNode = ijFogNode()` (`src/main.ts:124`) — height fog with moonlit in-scattering (`src/gpu/tsl.ts:86-109`): density `0.0052`/m at the surface (`src/world/fog.ts:16`), clears with height (falloff `0.045`), thin universal haze `0.00045`, glow toward the moon `pow(dot(rd, glowDir), 5)`. Tune `fogUniforms` per scene; never add `THREE.Fog`/`FogExp2` alongside.
- **Sky** (`src/world/sky.ts:140-166`): gradient `uHor → uMid → uZen` by elevation; sun disc `pow(sd,1600)*9` + glow `pow(sd,48)*0.9 + pow(sd,5)*0.5` on its side; moon glow in the haze; **below the horizon the sky becomes the fog color** so the world's edge never draws a line.
- **Post**: `post.configure({ ao, rays, bloom, aa })` (`src/main.ts:289`). AA is SMAA — TRAA ghosted behind moving motes on the phone (`src/main.ts:283-285`). Color grade after tone mapping (`src/gpu/post.ts:159-166`): saturation, contrast around a `0.42` pivot, shadow lift, per-mood (`src/world/moods.ts` GRADES).
- **Depth/separation** comes from glow sprites, rim light, and fog — not from more lights. Anything that would come between the camera and the player fades out via `outOfTheWay()` (`src/gpu/tsl.ts:115-121`) — use it for veils, spirits, and foreground glow.
- **Camera**: fov 58 (66 portrait / 55 landscape via resize), near `0.15`, far `6000` (`src/main.ts:122`, `~270`).
- **Lakes**: `water.setReflection(false)` — the water mirrors only the sky, per the user's call (`src/main.ts:292-294`).

---

## 4. Signature motifs — recurring elements and placement

Build new scenes by composing these, placed with seeded RNG (same layout every run: `makeRng()` — `s = s*16807 % 2147483647`, `src/scenes/creationKit.ts:19`):

- `rings(center, radius=9, tube=0.15)` — three gold `0xffd700` tori, tilted, turning slowly above a crown or gathering place (`creationKit.ts:182`)
- `beams(positions, height=10, radius=0.5)` — columns of pale blue `0xb8d1ff` additive light, breathing opacity (`creationKit.ts:218`)
- `groundDisc(radius, color, opacity, y)` — a flat ring (0.85r–r) laid on the ground to gather the eye, breathing ±15% (`creationKit.ts:348`)
- `pathLights(points)` — a trail of small warm `0xffe6a0` lamps; a brightness wave travels along the trail (`sin(t*2 - i*0.6)`), leading the player somewhere (`creationKit.ts:370`)
- `wisp(color, size)` — a small additive sun the scene can move; `setCenter(v)` places it (`creationKit.ts:255`)
- `birds(n, center, radius=20, height=8)` — white points circling overhead so the sky never feels empty (`creationKit.ts:48`)
- `horses(center, radius=12)` — four clusters of warm points on the horizon reading as distant life (`creationKit.ts:75`)
- `crystals(n, center, radius=5)` — instanced prisms breathing in scale (`creationKit.ts:116`)
- `flowers(...)` / `snowfall(...)` — seeded sprite clouds for swaying light-flowers and falling snow (`creationKit.ts:280,317`)
- Trees: `grow(SHAPES[2], seed)` is the tree-of-life shape (spreading, `src/world/creation.ts:121`); `tubes()` skins limbs and roots

Compositional grammar: a glowing center (wisp/hearth) → a ground ring gathering the eye → path lights leading away → rings or beams overhead → birds/horses at the horizon. Foreground, midground, background in every shot; one focal point per view.

---

## 5. Motion idioms — how the mainline animates

- **Frame loop**: `dt = Math.min(0.05, ms/1000)` — dt capped so tab-resume never jumps (`src/main.ts:2288`). All motion in units/second × dt.
- **Following/damping**: `x += (target - x) * Math.min(1, dt * k)` with `k ≈ 0.8–3.5` — camera yaw/pitch/dist, UI blends, rise animations all use this (`src/main.ts:712-714, 1256, 1322`). Never snap, never track directly.
- **Ambient sines with per-element phase offsets** — never synchronized. Kit examples: rings `t*0.2` / `t*(0.3+i*0.1)` (periods ~20–30 s); ground disc `sin(t*0.5)` (~12.6 s); crystals `sin(t*2 + i*0.7)` (~3.1 s); beams `sin(t*3 + i)` (~2.1 s); bark sway `sin(uT*0.55)` (~11 s); canopy wave `sin(uT*0.5)` (~12.6 s). The vocabulary is **unhurried: periods of several seconds, nothing twitchy**.
- **Two clocks**: TSL-side motion reads uniforms (`creationUniforms.uT`, kit `uT`); CPU updaters receive `(dt, t)` (`creationKit.ts:27-31`). The scene's own clock drives its motion so each scene lives only while active.
- **Falling/drifting wrap**: `mod(y - t*speed, height)` — endless snowfall with per-flake speed (`creationKit.ts:330`).
- **Traveling waves**: brightness/scale waves move along trails and canopies (`sin(t*2 - i*0.6)` for lamps; canopy luminance wave above).
- **Secondary action**: leaves twinkle while the canopy breathes; lamp scale follows lamp opacity; horse clusters bob while the group orbits.
- **Narration pacing** (`src/core/narration.ts`): subtitles are DOM text (`.on` class); voice fades in over 0.4 s, fades out over 2 s — never cuts; subtitles linger 1.5 s after the voice ends; the music bed ducks under speech. Motion must never outrun the narration's emotional pace.

---

## 6. Hard rules / anti-patterns

1. `glowShader`'s color callback returns **vec3, never vec4** — nesting a vec4 inside the maker's `vec4(color, 1)` produces invalid WGSL and kills the material (`src/gpu/tsl.ts:174-186`).
2. **Alpha is folded into RGB.** Glow/leaf/point materials end with `vec4(color, 1)` — there is no second alpha channel. Luminance carries the fade (`src/world/creation.ts:582`, `src/gpu/tsl.ts:183`).
3. Every additive material must pass through `additiveKeepsAlpha()` (`src/main.ts:249-263`): plain `AdditiveBlending` punches dark squares into the lake's reflection texture. The fix is `CustomBlending` with `blendSrc = SrcAlphaFactor, blendDst = OneFactor, blendSrcAlpha = ZeroFactor, blendDstAlpha = OneFactor` — adds light, leaves alpha alone.
4. `fog: false` on ALL glow/additive/point materials — they either draw their own fog or sit outside it (`src/gpu/tsl.ts:145`, `src/scenes/creationKit.ts` throughout).
5. `depthWrite: false` on all transparents; crystals use `renderOrder = 2`.
6. Guard every division: `.div(max(x, eps))` (e.g. `max(d, 1e-4)`, `max(dot(ab,ab), 1e-3)`). `smoothstep` is the reversed-edge-safe version (`src/gpu/tsl.ts:21-25`) — Safari's WebGPU leaves native reversed smoothstep undefined.
7. Never add: `THREE.Fog`/`FogExp2`, `EffectComposer`/`UnrealBloomPass`/`OutputPass`, a second tone mapper, punctual lights, `MeshBasicMaterial` solid objects without the custom-TSL treatment. Golden rule: grep `main.ts` for the existing equivalent before adding anything pipeline-level.
8. Seeded placement, scene-local clocks, `frustumCulled = false` on sprite clouds, `InstancedMesh`/`InstancedBufferAttribute` for repeats, never allocate in the animation loop, DPR via the quality tiers (`src/main.ts:265-289`).
9. The still-frame bar: one frame with no motion and no explanation must read as intentional.
10. **Import three.js from `three/webgpu`, never bare `three`.** The node materials the whole game is built on (`MeshBasicNodeMaterial`, `MeshStandardNodeMaterial`, `PointsNodeMaterial`) only exist on the `three/webgpu` export — bare `three` does not have them and `tsc` fails (`src/world/etching.ts:1`, `src/world/beings.ts:21`). TSL helpers come from `../gpu/tsl` (the `T` namespace) or `three/tsl`, never invented. A file that imports from bare `three` is broken on arrival.

---

## Conflicts with the quality docs (do not silently override — flagged here)

1. **VISUAL_QUALITY.md "Materials" says `MeshBasicMaterial` (unlit) is "for glow sprites and sky, never for solid objects."** The mainline contradicts this: its signature solids — bark (`src/world/creation.ts:304`), crystals (`:395`), leaves (`:561`) — are all `MeshBasicNodeMaterial` with hand-rolled TSL lighting instead of `MeshStandardMaterial`. For this codebase the canon wins: unlit node materials with custom lighting ARE the solid-object idiom. The doc's rule reads as generic Three.js advice that doesn't match this custom pipeline.
2. **VISUAL_QUALITY.md diagnosis table, "Milky, washed out" row, prescribes "ACESFilmic + OutputPass."** This contradicts the doc's own pipeline section (AgXToneMapping, no OutputPass) and the code (`src/main.ts:117`). The table row is stale generic advice; follow the pipeline section.
3. **ANIMATION_QUALITY.md says "idle breathing cycles run 4–8 seconds."** Mainline practice is wider: beams ~2.1 s, crystals ~3.1 s, ground disc/canopy ~12.6 s, rings ~20–30 s (`src/scenes/creationKit.ts`, `src/world/creation.ts`). The doc's band is narrower than canon. Distilled rule actually observed: **unhurried, periods of several seconds, nothing twitchy** — the 4–8 s band is a safe default, not a ceiling/floor.
