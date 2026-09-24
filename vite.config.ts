import { defineConfig } from "vite";

// Relative base so the same build works on GitHub Pages (/animation/), Netlify, or any subfolder.
export default defineConfig({
  base: "./",
  server: { host: true },
  build: {
    target: "es2020", // Safari 14+
    chunkSizeWarningLimit: 1200,
  },
});
