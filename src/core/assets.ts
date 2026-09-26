/* Loads asset bytes. A single-file build can embed its audio as base64 in
   window.__IJ_ASSETS (keyed by relative path); otherwise the file is fetched. */

import * as THREE from "three/webgpu";

type AssetWindow = Window & { __IJ_ASSETS?: Record<string, string> };

export async function loadBytes(path: string): Promise<ArrayBuffer | null> {
  const inline = (window as AssetWindow).__IJ_ASSETS?.[path];
  if (inline) {
    const bin = atob(inline);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  try {
    const r = await fetch(`./${path}`);
    return r.ok ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Turn quantized vertex data (16-bit positions, 8-bit normals from KHR_mesh_quantization) into
    plain floats. WebGPU's shadow pass misread the quantized positions: one scanned rock covered
    the whole shadow map. Skin indices stay integers. */
export function floatAttributes(root: THREE.Object3D): void {
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (!g) return;
    for (const [name, a] of Object.entries(g.attributes)) {
      if (a.array instanceof Float32Array || (!a.normalized && name !== "position")) continue;
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
      g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
    }
  });
}
