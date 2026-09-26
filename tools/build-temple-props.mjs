// Builds public/models/temple-props.glb from CC0 Poly Haven models: stone_fire_pit (the braziers),
// antique_ceramic_vase_01, ceramic_vase_02, planter_pot_clay (vessels), brass_diya_lantern (oil
// lamps): each simplified to a few thousand triangles, with 512 px colour, normal and
// occlusion/roughness maps. Every prop is a named node (its asset id).
// Setup: download each asset's 1k glTF from polyhaven.com into <dir>/<id>/, then
//        npm i --no-save sharp @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer
// Run:   node tools/build-temple-props.mjs <dir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup, weld, simplify, textureCompress, meshopt, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const dir = process.argv[2];
const ids = ['stone_fire_pit', 'antique_ceramic_vase_01', 'ceramic_vase_02', 'planter_pot_clay', 'brass_diya_lantern'];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const out = await io.read(`${dir}/${ids[0]}/${ids[0]}.gltf`);
for (const id of ids.slice(1)) mergeDocuments(out, await io.read(`${dir}/${id}/${id}.gltf`));
const root = out.getRoot();
// one scene; each asset's top node named for the asset
const scenes = root.listScenes();
scenes.forEach((s, i) => s.listChildren().forEach((n) => n.setName(ids[i])));
for (const s of scenes.slice(1)) { for (const n of s.listChildren()) scenes[0].addChild(n); s.dispose(); }
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) console.log(mesh.getName(), 'tris in', p.getIndices()?.getCount() / 3);
await out.transform(
  unpartition(), prune(), dedup(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.002 }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [512, 512], quality: 80 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) console.log(mesh.getName(), 'tris out', p.getIndices()?.getCount() / 3);
await io.write(new URL('../public/models/temple-props.glb', import.meta.url).pathname, out);
