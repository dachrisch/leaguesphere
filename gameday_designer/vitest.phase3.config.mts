import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Phase 3 Layer 5 scoping (PROVISIONAL P5): commit A points the threshold at
// the original file, commit B at the extracted teamOptions module.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/components/list/**/*.phase3.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/components/list/game-table/teamOptions.tsx'],
      thresholds: { branches: 100, perFile: true },
    },
  },
});
