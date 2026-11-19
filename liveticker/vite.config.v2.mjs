import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Separate entry/output so the legacy JS/Redux bundle and its static output
// stay byte-identical while /liveticker/v2/ is built next to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'static/liveticker/v2/js',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/v2/main.tsx'),
      output: {
        format: 'iife',
        entryFileNames: 'liveticker-v2.js',
        chunkFileNames: 'liveticker-v2-[name].js',
        assetFileNames: 'liveticker-v2.[ext]',
        inlineDynamicImports: true,
      },
    },
    assetsInlineLimit: 4096,
  },
  resolve: {
    alias: {
      '@v2': path.resolve(__dirname, './src/v2'),
    },
  },
});
