import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'static/share',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        widget: fileURLToPath(new URL('./src/widget/main.tsx', import.meta.url)),
        generator: fileURLToPath(
          new URL('./src/generator/main.tsx', import.meta.url)
        ),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunk-[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/media': 'http://localhost:8000',
    },
  },
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
});
