# Credits

- **Narration and water ambience:** from Samuel's game package (`prompts/GAME_PROMPT.md`). The scripts are inspired by the L/L Research channeling archive (llresearch.org).
- **The wanderer's body and motion:** the mannequin and animations from the Universal Animation Library by Quaternius (quaternius.com), CC0 1.0. It was taken from the glTF mirror at github.com/J-Ponzo/gltf-universal-animation-library, then reduced, compressed and recoloured as light for this game (`public/models/wanderer.glb`).
- **Engine:** three.js (MIT), postprocessing by pmndrs (Zlib), meshoptimizer and glTF-Transform (MIT) for the asset build.

## Textures and scanned rocks (CC0, Poly Haven — polyhaven.com)
- Ground and stone surfaces: `coast_sand_01`, `sparse_grass`, `rock_face_03`; tree bark: `bark_willow` (colour and normal maps, 1k, re-encoded) — `public/textures/`.
- Boulders: `namaqualand_boulder_02`, `namaqualand_boulder_03`, `rock_09` (simplified to ~0.5–2k triangles with 512 px maps by `tools/build-rocks.mjs`) — `public/models/rocks.glb`.

## Ambient occlusion
- N8AO by N8python (MIT) — github.com/N8python/n8ao
