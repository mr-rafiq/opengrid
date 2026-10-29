import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@opengrid/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
      "@opengrid/react/styles.css": fileURLToPath(
        new URL("../../packages/react/src/styles.css", import.meta.url),
      ),
      "@opengrid/react": fileURLToPath(
        new URL("../../packages/react/src/index.tsx", import.meta.url),
      ),
    },
  },
});
