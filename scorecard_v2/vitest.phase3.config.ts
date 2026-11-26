import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Phase 3 Layer 6 scoping (PROVISIONAL P5): commit A points the threshold at
// the original GameSetup.tsx helpers; commit B follows the extracted modules.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/screens/game-setup/**/*.phase3.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/screens/GameSetup.tsx"],
      thresholds: { branches: 100, perFile: true },
    },
  },
});
