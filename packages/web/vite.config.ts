import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import path from "path";
import { defineConfig } from "vite";

const { version } = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(`${version}`),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the Neon auth stack in one chunk — its UI and core modules
          // re-export each other, and splitting them produced a circular
          // chunk dependency warning (broken execution order risk).
          if (
            id.includes("@neondatabase") ||
            id.includes("better-auth") ||
            id.includes("better-fetch")
          ) {
            return "auth";
          }
        },
      },
    },
  },
  envDir: path.resolve(__dirname, "../../"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // The server serves the API under /api/* (see packages/server/src/
      // index.ts), so this is a pure passthrough — no prefix rewrite.
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
