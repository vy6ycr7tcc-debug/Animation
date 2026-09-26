/* The robe the wanderer wears in the temple (Samuel: "when entering the temple the character
   becomes covered with a robe, like an Ancient Greek character… head stays the same, character
   doesn't glow inside the temple"). A chiton of pale linen:
   - over the body: the figure's own form, a little fuller, from the shoulders to the hips, with
     short sleeves (head, neck, forearms and hands, legs and feet are left out);
   - from the waist to the ankles: a long skirt in soft folds, bound to the hips and, more toward
     the hem, to the thighs, so it swings with each step; a belt at the waist, a band at the hem.
   Both are skinned to the figure's own skeleton, so they move as it moves. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";

const { normalLocal, positionLocal } = T;

/** Bones whose flesh stays bare (the robe leaves them out). */
const BARE = ["head", "neck", "hand", "f_", "thumb", "forearm", "thigh", "shin", "foot", "toe"];

const LINEN = new THREE.Color(0.82, 0.77, 0.68);
const BAND = new THREE.Color(0.56, 0.36, 0.2);
const BELT = new THREE.Color(0.62, 0.5, 0.3);

/** Bone names as the loader keeps them (it drops "." and the like), lower-cased. */
const norm = (name: string) => name.replace(/[\s.:/[\]]/g, "").toLowerCase();

/** The robe for a figure made of several skinned meshes (the body and its joints): a tunic over
    each, and one skirt. */
export function buildRobe(meshes: THREE.SkinnedMesh[]): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  for (const m of meshes) {
    const t = tunicFor(m);
    if (t) out.push(t);
  }
  const main = [...meshes].sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
  const skirt = main && skirtFor(main);
  if (skirt) out.push(skirt);
  for (const m of out) {
    m.castShadow = true;
    m.frustumCulled = false;
    m.visible = false;
  }
  return out;
}

function tunicFor(mesh: THREE.SkinnedMesh): THREE.SkinnedMesh | null {
  const g = mesh.geometry, skel = mesh.skeleton;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
  if (!si || !sw) return null;
  const names = skel.bones.map((b) => norm(b.name));
  const bare = names.map((n) => BARE.some((k) => n.includes(k)));
  const main = (v: number) => {
    let best = 0, w = -1;
    for (let k = 0; k < 4; k++) {
      const wk = sw.getComponent(v, k);
      if (wk > w) (w = wk), (best = si.getComponent(v, k));
    }
    return best;
  };

  // the tunic: the body's triangles, less the bare parts
  const index = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  const keep: number[] = [];
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    if (bare[main(a)] || bare[main(b)] || bare[main(c)]) continue;
    keep.push(a, b, c);
  }
  const tg = new THREE.BufferGeometry();
  for (const k of ["position", "normal", "skinIndex", "skinWeight"]) if (g.attributes[k]) tg.setAttribute(k, g.attributes[k]);
  tg.setIndex(keep);
  const tunicMat = new THREE.MeshStandardNodeMaterial({ color: LINEN, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
  // a little fuller than the body beneath, so no skin shows through the cloth
  tunicMat.positionNode = positionLocal.add(normalLocal.mul(0.03));
  const tunic = new THREE.SkinnedMesh(tg, tunicMat);
  tunic.bind(skel, mesh.bindMatrix);
  return tunic;
}

/** The skirt: from the waist to just above the ankles, made in the figure's bind pose. */
function skirtFor(mesh: THREE.SkinnedMesh): THREE.SkinnedMesh | null {
  const g = mesh.geometry, skel = mesh.skeleton, pos = g.attributes.position;
  const names = skel.bones.map((b) => norm(b.name));
  const bi = (name: string) => names.indexOf(norm(name));
  const iHips = bi("DEF-hips"), iSpine = bi("DEF-spine.001"), iL = bi("DEF-thigh.L"), iR = bi("DEF-thigh.R"), iFoot = bi("DEF-foot.L");
  if ([iHips, iSpine, iL, iR, iFoot].some((i) => i < 0)) return null;
  const inv = mesh.bindMatrixInverse;
  const bonePos = (i: number) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(skel.boneInverses[i]).invert()).applyMatrix4(inv);
  const hips = bonePos(iHips), waist = bonePos(iSpine), thighL = bonePos(iL), ankle = bonePos(iFoot);
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const up = box.max.y - box.min.y > box.max.z - box.min.z ? 1 : 2; // the figure's up axis (y, or z as exported)
  const U = (v: THREE.Vector3) => (up === 1 ? v.y : v.z);
  const waistH = U(waist) - (U(waist) - U(hips)) * 0.2, hemH = U(ankle) + (U(waist) - U(ankle)) * 0.06;
  // how wide the body is at the waist and at the hips
  let rw = 0;
  const cx = hips.x, cz = up === 1 ? hips.z : hips.y;
  for (let i = 0; i < pos.count; i++) {
    const h = up === 1 ? pos.getY(i) : pos.getZ(i);
    if (Math.abs(h - (waistH + U(hips)) / 2) > (U(waist) - U(ankle)) * 0.08) continue;
    const a = pos.getX(i) - cx, b = (up === 1 ? pos.getZ(i) : pos.getY(i)) - cz;
    rw = Math.max(rw, Math.hypot(a, b));
  }
  if (!rw) rw = (box.max.x - box.min.x) * 0.2;
  const SEG = 48, ROWS = 14;
  const P: number[] = [], SI: number[] = [], SW: number[] = [], C: number[] = [], I: number[] = [];
  const sideL = Math.sign(thighL.x - cx) || 1;
  for (let r = 0; r <= ROWS; r++) {
    const t = r / ROWS, h = waistH + (hemH - waistH) * t;
    const radius = rw * (1.02 + 0.5 * Math.pow(t, 0.9));
    for (let s = 0; s <= SEG; s++) {
      const th = (s / SEG) * Math.PI * 2;
      const fold = 1 + (0.012 + 0.05 * t) * Math.sin(th * 11) + 0.02 * t * Math.sin(th * 5 + 1);
      const a = Math.cos(th) * radius * fold, b = Math.sin(th) * radius * fold;
      if (up === 1) P.push(cx + a, h, cz + b);
      else P.push(cx + a, cz + b, h);
      // the hem follows the legs a little, the waist the hips
      const k = 0.6 * t, lat = THREE.MathUtils.clamp((a / radius) * sideL, -1, 1);
      SI.push(iHips, iL, iR, 0);
      SW.push(1 - k, k * (0.5 + 0.5 * lat), k * (0.5 - 0.5 * lat), 0);
      const c = t < 0.05 ? BELT : t > 0.92 ? BAND : LINEN;
      C.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < ROWS; r++)
    for (let s = 0; s < SEG; s++) {
      const a = r * (SEG + 1) + s, b = a + SEG + 1;
      I.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  sg.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(SI, 4));
  sg.setAttribute("skinWeight", new THREE.Float32BufferAttribute(SW, 4));
  sg.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  sg.setIndex(I);
  sg.computeVertexNormals();
  const skirtMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const skirt = new THREE.SkinnedMesh(sg, skirtMat);
  skirt.bind(skel, mesh.bindMatrix);
  return skirt;
}

/** The body beneath the robe, as it shows at the head, arms and feet: pale and matte, no light of its own. */
export function plainSkin(): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.78, 0.7, 0.62), roughness: 0.62, metalness: 0 });
}
