import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [react()],
  test: { include: ["packages/**/*.test.{ts,tsx}"], environment: "node" },
  resolve: {
    alias: {
      "@opengrid/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@opengrid/react": fileURLToPath(
        new URL("./packages/react/src/index.tsx", import.meta.url),
      ),
    },
  },
});
