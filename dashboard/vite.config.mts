import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.tsx',
      formats: ['es'],
      fileName: () => 'dashboard.js',
    },
    outDir: 'static/dashboard/js',
    emptyOutDir: true,
    rollupOptions: {
      external: [],
      output: {
        entryFileNames: 'dashboard.js',
        chunkFileNames: 'dashboard.js',
        assetFileNames: 'dashboard.[ext]',
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
