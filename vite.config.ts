import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installability (manifest + "Add to Home Screen") and app-shell
    // precaching via Workbox (issue #56) — independent of the query-cache
    // persister in lib/trpc.ts, which handles data, not the app shell.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Intake",
        short_name: "Intake",
        description: "Calorie and nutrition tracking",
        theme_color: "#7c3aed",
        background_color: "#f5f3ff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the built app shell (JS/CSS/HTML/icons) so the app can
        // boot offline; data itself is never cached here (ADR 0003).
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src/client"),
    },
  },
  server: {
      port: 5173,
      host: true,
    proxy: {
      "/trpc": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/trpc/, ""),
      },
    },
  },
});
