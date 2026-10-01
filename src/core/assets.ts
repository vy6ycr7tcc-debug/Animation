/* Loads asset bytes. A single-file build can embed its audio as base64 in
   window.__IJ_ASSETS (keyed by relative path); otherwise the file is fetched. */

import * as THREE from "three/webgpu";

type AssetWindow = Window & { __IJ_ASSETS?: Record<string, string> };

/** A URL to stream an asset from (media elements play it as it downloads). */
export function assetUrl(path: string, type = "audio/mpeg"): string {
  const inline = (window as AssetWindow).__IJ_ASSETS?.[path];
  return inline ? `data:${type};base64,${inline}` : `./${path}`;
}

export async function loadBytes(path: string): Promise<ArrayBuffer | null> {
  const inline = (window as AssetWindow).__IJ_ASSETS?.[path];
  if (inline) {
    const bin = atob(inline);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  // never silent: a failure is reported once, a network error is tried again once after a
  // moment, and a model that cannot load is told to the game (main.ts says so on screen)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`./${path}`);
      if (r.ok) return await r.arrayBuffer();
      warnOnce(path, `HTTP ${r.status}`);
      if (r.status === 404) break; // not there (a re-voiced copy not made yet): no use asking again
    } catch (e) {
      warnOnce(path, String((e as Error)?.message ?? e));
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 900));
  }
  if (path.startsWith("models/")) loadFailed.hook?.(path);
  return null;
}
const warned = new Set<string>();
function warnOnce(path: string, why: string): void {
  if (warned.has(path)) return;
  warned.add(path);
  console.warn(`Could not load ${path}: ${why}`);
}
/** Told when a model could not be loaded (after its retry). */
export const loadFailed: { hook: ((path: string) => void) | null } = { hook: null };

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
