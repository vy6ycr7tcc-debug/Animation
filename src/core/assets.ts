/* Loads asset bytes. A single-file build can embed its audio as base64 in
   window.__IJ_ASSETS (keyed by relative path); otherwise the file is fetched. */

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
