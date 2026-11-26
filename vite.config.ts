/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The UI lives in src/ui and is built to dist/ui, which the server serves.
// In dev (`npm run dev:ui`) Vite proxies /api to the server on port 4317.
export default defineConfig({
  root: "src/ui",
  plugins: [react()],
  build: { outDir: "../../dist/ui", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:4317" } },
  test: {
    root: ".",
    include: ["src/**/*.test.ts"],
  },
});
