import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the same build works on GitHub Pages (/animation/), Netlify, or any subfolder.
export default defineConfig({
  test: {
    environment: "jsdom"
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB limit to allow app shell JS
        // Don't precache audio, models, or textures - we handle these explicitly in the offline downloader.
        // We only want the app shell (JS, CSS, HTML, and webmanifest) to be precached.
        globPatterns: ['**/*.{js,css,html,json,webmanifest}'],
        globIgnores: ['audio/**', 'models/**', 'textures/**', 'assets.json']
      },
      manifest: {
        name: "The Inward Journey",
        short_name: "Inward Journey",
        description: "A contemplative third-person exploration game about Mind, Body and Spirit.",
        theme_color: "#0b0a1c",
        background_color: "#0b0a1c",
        display: "standalone",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ],
  base: "./",
  // the build's time, shown in the #stats readout, so a phone holding an old copy can be told
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC") },
  server: { host: true },
  build: {
    target: "es2020", // Safari 14+
    chunkSizeWarningLimit: 1200,
  },
});
