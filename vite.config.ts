import { defineConfig } from "vite";

// Relative base so the same build works on GitHub Pages (/animation/), Netlify, or any subfolder.
export default defineConfig({
  base: "./",
  // the build's time, shown in the #stats readout, so a phone holding an old copy can be told
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC") },
  server: { host: true },
  build: {
    target: "es2020", // Safari 14+
    chunkSizeWarningLimit: 1200,
  },
});
