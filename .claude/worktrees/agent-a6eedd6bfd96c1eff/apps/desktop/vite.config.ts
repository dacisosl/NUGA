import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  // GitHub Pages 배포 시 VITE_BASE=/NUGA/ ; Tauri·로컬은 "/"
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@nuga/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: host || false, watch: { ignored: ["**/src-tauri/**"] } },
  build: { target: "es2022", outDir: "dist" },
});
