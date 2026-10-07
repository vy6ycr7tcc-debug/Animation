/* Real surfaces: photo-scanned textures (CC0, Poly Haven; see CREDITS.md), each a colour map
   and a normal map at 1024 px, shipped with the game (no network at runtime). The ground's four
   (sand coast_sand_01, soil forrest_ground_01, rock aerial_rocks_02, cliff cliff_side) also
   carry their occlusion and roughness (arm), as the temple's stone does. */
import * as THREE from "three/webgpu";

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

function tex(path: string, colour: boolean): THREE.Texture {
  let t = cache.get(path);
  if (!t) {
    t = loader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16; // the ground is mostly seen at a grazing angle: keep its grain sharp there
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(path, t);
  }
  return t;
}

export type SurfaceName = "sand" | "meadow" | "rock" | "bark" | "cliff";
/** A surface's colour map and normal map, and (the ground's scans, like the temple's) its packed
    occlusion / roughness / metal map. */
export function surface(name: SurfaceName): { diff: THREE.Texture; nor: THREE.Texture; arm: THREE.Texture } {
  const arm = name === "bark" ? "textures/sand_arm.jpg" : `textures/${name}_arm.jpg`;
  return { diff: tex(`textures/${name}_diff.jpg`, true), nor: tex(`textures/${name}_nor.jpg`, false), arm: tex(arm, false) };
}
