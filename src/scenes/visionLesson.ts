/* The lessons' seat: a stone of the world's idiom (displaced, flat shaded, etched gold), used by
   the enacted lessons, the temple's Choice and the monuments' seated rooms. (The vision-lesson
   format that lived here was replaced by the enacted lessons, scenes/enacted.ts.) */
import * as THREE from "three/webgpu";
import { etchedStone } from "../world/etching";
import { fbm } from "../world/terrain";

/** A seat of rough stone (the world's stone idiom: displaced, flat shaded, etched gold). */
export function seatStone(at: THREE.Vector3): THREE.Mesh {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const d = 0.82 + fbm(v.x * 1.5 + 4.1, v.z * 1.5 + v.y * 1.2) * 0.3;
    p.setXYZ(i, v.x * d, v.y * d, v.z * d);
  }
  g.computeVertexNormals();
  const mat = etchedStone("#221e30", "#e9c37d", 1.6);
  mat.flatShading = true;
  const m = new THREE.Mesh(g, mat);
  m.scale.set(0.62, 0.42, 0.5);
  m.position.copy(at).setY(at.y + 0.14); // part-buried: it rests in the ground, never on it
  m.castShadow = m.receiveShadow = true;
  return m;
}
