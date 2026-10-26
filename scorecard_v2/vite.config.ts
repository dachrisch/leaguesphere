import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Nothing is served from a public/ dir; without this a future public/ would
  // be copied into the JS output dir Django serves.
  publicDir: false,
  server: {
    port: 3004,
    proxy: { "/api": "http://localhost:8000" },
  },
  build: {
    outDir: "static/scorecard_v2/js",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/main.tsx",
      output: {
        // The Django template loads the bundle with a classic <script> tag (no
        // type="module"), so it must be IIFE. The default `es` format lets the
        // bundler emit `import.meta` (e.g. from deps), which throws "Cannot
        // use 'import.meta' outside a module" in a classic script and stops
        // the app from mounting.
        format: "iife",
        entryFileNames: "scorecard_v2.js",
        assetFileNames: "scorecard_v2-[name][extname]",
        // One bundle, no code splitting: Django loads exactly one file.
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
});
