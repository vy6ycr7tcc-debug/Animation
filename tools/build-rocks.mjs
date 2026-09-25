// Builds public/models/rocks.glb from three CC0 Poly Haven scans (namaqualand_boulder_02, _03,
// rock_09): each cut to ~1.5k triangles with 512 px colour and normal maps.
// Setup: download each asset's 1k glTF from polyhaven.com into <dir>/<id>/, then
//        npm i --no-save sharp @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer
// Run:   node tools/build-rocks.mjs <dir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup, weld, simplify, textureCompress, meshopt, unpartition, flatten, join } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const dir = process.argv[2];
const ids = ['namaqualand_boulder_02', 'namaqualand_boulder_03', 'rock_09'];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const out = await io.read(`${dir}/${ids[0]}/${ids[0]}.gltf`);
for (const id of ids.slice(1)) mergeDocuments(out, await io.read(`${dir}/${id}/${id}.gltf`));
const root = out.getRoot();
// one scene holding all three, each rock a named node
const scene = root.listScenes()[0];
for (const s of root.listScenes().slice(1)) { for (const n of s.listChildren()) scene.addChild(n); s.dispose(); }
root.listNodes().forEach((n, i) => n.getMesh() && n.setName(`rock${i}`));
// keep colour and normal maps only
for (const m of root.listMaterials()) { m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setRoughnessFactor(0.9); m.setMetallicFactor(0); }
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const n = p.getIndices()?.getCount() / 3; console.log(mesh.getName(), 'tris in', n);
}
await out.transform(
  unpartition(), prune(), dedup(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.02, error: 0.01 }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [512, 512], quality: 80 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) console.log(mesh.getName(), 'tris out', p.getIndices()?.getCount() / 3);
await io.write(new URL('../public/models/rocks.glb', import.meta.url).pathname, out);
