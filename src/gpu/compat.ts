/* Small differences between browsers' WebGPU, smoothed over before three starts.
   - three always sets a texture view's `swizzle` to "rgba" (the default). Some Chrome versions
     know an older form of that field and reject the string, so the default is left out. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const G = globalThis as any;
if (G.GPUTexture?.prototype?.createView) {
  const createView = G.GPUTexture.prototype.createView;
  G.GPUTexture.prototype.createView = function (d?: any) {
    if (d && d.swizzle === "rgba") {
      d = { ...d };
      delete d.swizzle;
    }
    return createView.call(this, d);
  };
}
export {};
