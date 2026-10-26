import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
    include: [
      '/src\/.*\.(js|mjs|cjs|ts|jsx|tsx)$/',
      '/__tests__\/.*\.(js|mjs|cjs|ts|jsx|tsx)$/',
    ],
    exclude: ['node_modules'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text', 'cobertura'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/setupTests.ts',
        'src/main.tsx',
      ],
    },
  },
});
