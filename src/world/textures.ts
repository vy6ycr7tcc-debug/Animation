/* Real surfaces: photo-scanned textures (CC0, Poly Haven; see CREDITS.md), each a colour map
   and a normal map at 1024 px, shipped with the game (no network at runtime). */
import * as THREE from "three/webgpu";

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

function tex(path: string, colour: boolean): THREE.Texture {
  let t = cache.get(path);
  if (!t) {
    t = loader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(path, t);
  }
  return t;
}

export type SurfaceName = "sand" | "meadow" | "rock" | "bark";
/** A surface's colour map and normal map. */
export function surface(name: SurfaceName): { diff: THREE.Texture; nor: THREE.Texture } {
  return { diff: tex(`textures/${name}_diff.jpg`, true), nor: tex(`textures/${name}_nor.jpg`, false) };
}
