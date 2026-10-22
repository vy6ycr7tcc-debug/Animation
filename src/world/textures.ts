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

export type SurfaceName = "sand" | "meadow" | "rock" | "bark" | "cliff" | "moon" | "wood" | "rust";
/** A surface's colour map and normal map, and (the ground's scans, like the temple's) its packed
    occlusion / roughness / metal map. */
export function surface(name: SurfaceName): { diff: THREE.Texture; nor: THREE.Texture; arm: THREE.Texture } {
  const arm = name === "bark" ? "textures/sand_arm.jpg" : `textures/${name}_arm.jpg`;
  return { diff: tex(`textures/${name}_diff.jpg`, true), nor: tex(`textures/${name}_nor.jpg`, false), arm: tex(arm, false) };
}

/** The regions' own soils (tools/build-ground-scans.py), one texture array: layers 0–6 the scans'
    colour (tundra lichen, autumn leaf litter, burnt ash, moor mud and moss, red laterite, mossy
    leaves, grey chalk ground), 7–13 their normals; 512 px each. Its colour is stored as is (not
    marked sRGB, since the normals share it): read it through `toLinear`. Grey until loaded. */
export const REGION_LAYERS = 7;
let regionTex: THREE.DataArrayTexture | null = null;
export function regionScans(): THREE.DataArrayTexture {
  if (regionTex) return regionTex;
  const S = 512, D = REGION_LAYERS * 2;
  const data = new Uint8Array(S * S * 4 * D).fill(128);
  const t = new THREE.DataArrayTexture(data, S, S, D);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 16;
  t.needsUpdate = true;
  regionTex = t;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S * D;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    g.drawImage(img, 0, 0);
    data.set(g.getImageData(0, 0, S, S * D).data);
    t.needsUpdate = true;
  };
  img.src = "textures/regions.jpg";
  return t;
}
