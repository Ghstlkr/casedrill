import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => {
  const single = mode === "single";

  return {
    base: "./",
    plugins: [
      react(),
      single
        ? viteSingleFile()
        : VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["icons/icon.svg"],
            workbox: { globPatterns: ["**/*.{js,css,html,woff2,svg,png}"], maximumFileSizeToCacheInBytes: 3_000_000 },
            manifest: {
              name: "CaseDrill",
              short_name: "CaseDrill",
              description: "Free money laundering (AML) analyst simulator.",
              theme_color: "#12304a",
              background_color: "#e8f0ec",
              display: "standalone",
              start_url: "./",
              scope: "./",
              icons: [
                { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
                { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
              ],
            },
          }),
    ],
    server: { fs: { allow: ["../.."] } },
    build: { outDir: single ? "dist-single" : "dist", chunkSizeWarningLimit: 1500 },
  };
});
