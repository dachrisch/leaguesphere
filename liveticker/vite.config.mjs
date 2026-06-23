import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  legacy: {
    inconsistentCjsInterop: true,
  },
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },

  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },

  // Development server configuration
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },

  // Build configuration
  build: {
    outDir: 'static/liveticker/js',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/index.jsx'),
      output: {
        // Classic <script> tag (no type="module") in the Django template, so the
        // bundle must be IIFE. The default `es` format lets the bundler emit
        // `import.meta` (e.g. from deps), which throws "Cannot use 'import.meta'
        // outside a module" in a classic script and prevents the app from mounting.
        format: 'iife',
        // Single bundle output to match Django expectations
        entryFileNames: 'liveticker.js',
        chunkFileNames: 'liveticker-[name].js',
        assetFileNames: 'liveticker-[name].[ext]',
        // Disable code splitting for single bundle
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
    // Inline small assets
    assetsInlineLimit: 4096,
  },

  // Resolve configuration
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
