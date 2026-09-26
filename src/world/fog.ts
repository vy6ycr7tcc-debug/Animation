/* Atmosphere with depth. The air is thickest low over the ground and water and thins with
   height, so valleys fill with haze while hilltops and far peaks stand clear above it, layer
   behind layer. Looking toward the moon, the haze glows warm with its light.
   The shader side lives in gpu/tsl.ts (`ijFog`): it is the scene's fog node, so every standard
   material shares it, and custom materials call it themselves. */
import * as THREE from "three/webgpu";

/** The direction to the bright star and the moon's glow (low over the island, ahead from the shore). */
export function starDirection(out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(0.06, 0.16, -1).normalize();
}

export const FOG = {
  color: new THREE.Color(0.105, 0.1, 0.22), // matches the sky at the horizon
  moon: new THREE.Color(0.55, 0.42, 0.34),
  density: 0.0052, // per metre, at the water's surface
  falloff: 0.045, // how quickly the air clears with height
  haze: 0.00045, // a thin haze at every height
};
