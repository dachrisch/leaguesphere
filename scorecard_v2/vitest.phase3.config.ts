import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Phase 3 coverage gate (PROVISIONAL P5). The include list is the union of
// every module extracted so far (Layer 6 onward), so the top of the stack
// still gates each earlier layer at 100% branches.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    include: [
      "src/screens/game-setup/**/*.phase3.test.{ts,tsx}",
      "src/screens/tracking-flow/**/*.phase3.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: [
        // Layer 6
        "src/screens/game-setup/crew.tsx",
        "src/screens/game-setup/useCrewSetup.ts",
        // Layer 7
        "src/screens/game-setup/start.ts",
        "src/screens/game-setup/useGameStart.ts",
        // Layer 8
        "src/screens/tracking-flow/logic.ts",
        "src/screens/tracking-flow/SyncStrip.tsx",
      ],
      thresholds: { branches: 100, perFile: true },
    },
  },
});
