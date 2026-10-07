/* The trees of the world after the veil, and of the forest round its door: the world's own grown
   kinds (world/creation.ts) in living bark with light in the grain, under crowns of dark leaves
   that have body (they hide the sky behind them), a few holding a speck of gold. One merged bark
   mesh and one cloud of leaves for the lot. */
import * as THREE from "three/webgpu";
import { T, spriteCloud, vnoise, type N } from "../../gpu/tsl";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { touch } from "../densities/roomKit";
import { barkMaterial, grow, SHAPES, tubes } from "../../world/creation";

const { cameraPosition, float, length, mix, positionWorld, pow, sin, smoothstep, vec2, vec3 } = T;

export interface TreeSpot {
  x: number;
  z: number;
  /** The ground there. */
  y: number;
  size: number;
  shape: number;
  /** How full its crown (0 bare … 1 full). */
  crown: number;
}

export function forest(spots: TreeSpot[], t: N, R: () => number, seed = 3000): { objects: THREE.Object3D[]; dispose(): void } {
  const bark = barkMaterial(new THREE.Color(1.0, 0.78, 0.46), 0.37);
  const geos: THREE.BufferGeometry[] = [];
  const leafPts: number[] = [];
  const leafK: number[] = [];
  spots.forEach((sp, i) => {
    const tree = grow(SHAPES[sp.shape], seed + i * 13);
    const geo = tubes([...tree.limbs, ...tree.roots]);
    const a = R() * Math.PI * 2;
    geo.rotateY(a);
    geo.scale(sp.size, sp.size, sp.size);
    geo.translate(sp.x, sp.y - 0.15, sp.z);
    geos.push(geo);
    const c = Math.cos(a), sn = Math.sin(a);
    for (const tp of tree.tips) {
      const n = Math.round(30 * sp.crown);
      for (let k = 0; k < n; k++) {
        const q = R() * Math.PI * 2, rr = Math.sqrt(R()) * 1.7;
        const lx = tp.x + Math.cos(q) * rr, lz = tp.z + Math.sin(q) * rr, ly = tp.y + (R() - 0.35) * 1.4;
        leafPts.push(sp.x + (lx * c + lz * sn) * sp.size, sp.y - 0.15 + ly * sp.size, sp.z + (-lx * sn + lz * c) * sp.size);
        leafK.push(R(), R(), R(), R());
      }
    }
  });
  // (merged keeping the bark's own attributes: its grain runs along aU and round aAng)
  const trunks = new THREE.Mesh(mergeGeometries(geos)!, bark);
  for (const q of geos) q.dispose();
  trunks.castShadow = true;
  const objects: THREE.Object3D[] = [trunks];
  const n = leafPts.length / 3;
  const leafMat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  leafMat.sizeAttenuation = true;
  leafMat.size = 0.9;
  if (n) {
    const cloud = spriteCloud(n, { position: 3, aK: 4 }, leafMat);
    (cloud.attrs.position.array as Float32Array).set(leafPts);
    (cloud.attrs.aK.array as Float32Array).set(leafK);
    touch(cloud);
    const K = cloud.nodes.aK, LP = cloud.nodes.position;
    const sway = sin(t.mul(float(0.4).add(K.x.mul(0.3))).add(K.y.mul(30))).mul(0.06);
    leafMat.positionNode = LP.add(vec3(sway, 0, sway.mul(0.6)));
    const pr = length(T.pointUV.sub(0.5).mul(vec2(1, 1.4))).mul(2).add(vnoise(T.pointUV.mul(5).add(K.xy.mul(40))).mul(0.5).sub(0.22));
    const hue = mix(vec3(0.006, 0.013, 0.009), vec3(0.025, 0.045, 0.028), smoothstep(-2, 3, LP.y.sub(5))).mul(K.z.mul(0.5).add(0.75)).add(vec3(0.4, 0.3, 0.12).mul(pow(K.w, 16)));
    leafMat.colorNode = hue;
    // (fading near the lens: a leaf must never become a blot across the view)
    leafMat.opacityNode = smoothstep(1, 0.55, pr).mul(0.92).mul(smoothstep(1.2, 4.5, length(cameraPosition.sub(positionWorld))));
    objects.push(cloud.sprite);
  }
  return {
    objects,
    dispose: () => {
      trunks.geometry.dispose();
      bark.dispose();
      leafMat.dispose();
    },
  };
}
