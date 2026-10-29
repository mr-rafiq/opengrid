import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { createContent } from "./scripts/content.mjs";
import fs from "node:fs";
import path from "node:path";
import { repositoryRoot, base } from "./scripts/content.mjs";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/opengrid/",
  plugins: [
    react(),
    {
      name: "opengrid-documentation",
      resolveId(id) {
        if (id === "virtual:site-content") return "\0virtual:site-content";
      },
      load(id) {
        if (id === "\0virtual:site-content") {
          const content = createContent();
          for (const page of content.pages)
            this.addWatchFile(path.join(repositoryRoot, page.source));
          return `export default ${JSON.stringify(content)}`;
        }
      },
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const media = Object.entries(createContent().media).find(
            ([, target]) => request.url?.split("?")[0] === base + target,
          );
          if (!media) return next();
          response.setHeader(
            "Content-Type",
            path.extname(media[0]) === ".svg" ? "image/svg+xml" : "image/png",
          );
          fs.createReadStream(path.join(repositoryRoot, media[0])).pipe(
            response,
          );
        });
      },
    },
  ],
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
