import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'static/passcheck/js',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Classic <script> tag (no type="module") in the Django template, so the
        // bundle must be IIFE. The default `es` format lets the bundler emit
        // `import.meta` (e.g. from deps), which throws "Cannot use 'import.meta'
        // outside a module" in a classic script and prevents the app from mounting.
        format: 'iife',
        entryFileNames: 'passcheck.js',
        chunkFileNames: 'passcheck.js',
        assetFileNames: 'passcheck.[ext]',
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    port: 3003,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
