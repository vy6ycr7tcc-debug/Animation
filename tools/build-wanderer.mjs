// Rebuilds public/models/wanderer.glb from the Universal Animation Library (CC0).
// Setup: git clone https://github.com/J-Ponzo/gltf-universal-animation-library ual
//        npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer
// Run:   node tools/build-wanderer.mjs ual/glTF/AnimationLibrary_Godot_Standard.gltf
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, weld, simplify, quantize, meshopt, dedup, resample } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(process.argv[2] ?? 'ual/glTF/AnimationLibrary_Godot_Standard.gltf');
const root = doc.getRoot();
const keep = ['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Swim_Fwd_Loop','Swim_Idle_Loop','Jump_Start','Jump_Loop','Jump_Land',
  'Sitting_Enter','Sitting_Idle_Loop','Sitting_Exit','Spell_Simple_Enter','Spell_Simple_Idle_Loop','Spell_Simple_Exit','Interact'];
for (const a of root.listAnimations()) if (!keep.includes(a.getName())) a.dispose();
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  console.log(mesh.getName(), prim.getMaterial()?.getName(), prim.getAttribute('POSITION').getCount(), prim.listSemantics());
  for (const s of prim.listSemantics()) if (s.startsWith('TEXCOORD') || s.startsWith('COLOR') || s==='TANGENT') prim.setAttribute(s, null);
}
await doc.transform(prune(), dedup(), resample(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.8, error: 0.0005 }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) console.log('out', prim.getAttribute('POSITION').getCount());
console.log('anims', root.listAnimations().map(a=>a.getName()+':'+a.listSamplers()[0]?.getInput()?.getMax([])[0]?.toFixed(2)).join(' '));
await io.write(new URL('../public/models/wanderer.glb', import.meta.url).pathname, doc);
