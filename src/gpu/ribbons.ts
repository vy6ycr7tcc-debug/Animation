/* Lines as ribbons a few pixels wide at any distance. A GPU line is one device pixel: on a 3x
   phone screen it all but vanishes. Each segment becomes a quad, widened in view space across
   its own direction as seen. */
import * as THREE from "three/webgpu";
import { gpuUniforms, T, type N } from "./tsl";

const { attribute, cameraProjectionMatrix, float, modelViewMatrix, normalize, positionGeometry, vec2, vec4 } = T;

/** From segment end-pairs (x0,y0,z0, x1,y1,z1, …) as LineSegments would take them. */
export function ribbonGeometry(pairs: ArrayLike<number>): THREE.BufferGeometry {
  const segs = Math.floor(pairs.length / 6);
  const pos = new Float32Array(segs * 12), other = new Float32Array(segs * 12), side = new Float32Array(segs * 4);
  const idx = new Uint32Array(segs * 6);
  for (let s = 0; s < segs; s++) {
    const o = s * 6;
    const A = [pairs[o], pairs[o + 1], pairs[o + 2]], B = [pairs[o + 3], pairs[o + 4], pairs[o + 5]];
    // corners A-left, A-right, B-right, B-left; `other` is the far end, so at B the direction is
    // reversed and the side flipped to keep the hand
    ([[A, B, -1], [A, B, 1], [B, A, -1], [B, A, 1]] as [number[], number[], number][]).forEach(([P, Q, sd], c) => {
      pos.set(P, (s * 4 + c) * 3);
      other.set(Q, (s * 4 + c) * 3);
      side[s * 4 + c] = sd;
    });
    idx.set([s * 4, s * 4 + 1, s * 4 + 2, s * 4, s * 4 + 2, s * 4 + 3], s * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aO", new THREE.BufferAttribute(other, 3));
  g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** Additive ribbons `px` CSS pixels wide, soft at both edges; `color` is a vec3 node. */
export function ribbonMaterial(color: N, px: number, depthTest = true): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const vA = modelViewMatrix.mul(vec4(positionGeometry, 1)), vB = modelViewMatrix.mul(vec4(attribute("aO", "vec3"), 1));
  const dir = normalize(vB.xy.div(vB.z.negate()).sub(vA.xy.div(vA.z.negate())).add(vec2(1e-6, 0)));
  const sd = attribute("aSide", "float");
  const off = vec2(dir.y.negate(), dir.x).mul(sd).mul(vA.z.negate().mul(px).div(gpuUniforms.px));
  m.vertexNode = cameraProjectionMatrix.mul(vec4(vA.xy.add(off), vA.z, 1));
  const soft = float(1).sub(sd.mul(sd)).mul(1.8).min(1);
  m.colorNode = vec4(color.mul(soft), 1);
  return m;
}
