/* One way to give a place's key light its shadow, so every room's shadows are made as the
   world's moon makes its own: the box fitted to the place (three's default is 10 m across at
   512 px, so a room's sun cast its shadows only near the middle, in blocks), the map as large as
   the quality tier gives the moon, and the same bias, normal bias and softness. Rooms keep their
   own light's colour, strength and direction; only how its shadow is made is shared. */
import * as THREE from "three/webgpu";

/** The shadow map's size for the current quality tier (main.ts sets it with the moon's). */
export const rig = { shadowSize: 2048 };
const keyed = new Set<THREE.DirectionalLight>();

/** Cast `light`'s shadow over `radius` metres round its target. */
export function keyShadow(light: THREE.DirectionalLight, radius: number): THREE.DirectionalLight {
  light.castShadow = true;
  const c = light.shadow.camera as THREE.OrthographicCamera;
  c.left = c.bottom = -radius;
  c.right = c.top = radius;
  const d = light.position.distanceTo(light.target.position);
  c.near = Math.max(0.5, d - radius * 2);
  c.far = d + radius * 2;
  c.updateProjectionMatrix();
  light.shadow.mapSize.set(rig.shadowSize, rig.shadowSize);
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.04;
  light.shadow.radius = 3;
  keyed.add(light);
  return light;
}

/** The tier changed: every key light still in use follows the moon's map size. */
export function setShadowSize(size: number): void {
  rig.shadowSize = size;
  for (const l of keyed) {
    if (!l.parent) keyed.delete(l); // its room was taken down
    else l.shadow.mapSize.set(size, size);
  }
}
