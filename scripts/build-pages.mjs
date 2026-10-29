import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { collectPagesLicenses } from "./collect-pages-licenses.mjs";
import {
  createContent,
  base,
  repositoryRoot,
} from "../examples/site/scripts/content.mjs";

const root = path.resolve(repositoryRoot);
const output = path.resolve(root, "dist/pages");
const ssrOutput = path.resolve(root, "dist/site-ssr");
// Only remove the explicitly named generated output inside this checkout.
if (
  output !== path.resolve(root, "dist", "pages") ||
  !output.startsWith(root + path.sep)
)
  throw new Error("Unsafe Pages output path");
await fs.rm(output, { recursive: true, force: true });
const configFile = path.join(root, "examples/site/vite.config.mjs");
const content = createContent();
console.log(
  `Building OpenGrid Pages: ${content.pages.length} documentation routes`,
);
await build({ configFile, build: { outDir: output, emptyOutDir: true } });
await build({
  configFile,
  build: {
    ssr: path.join(root, "examples/site/src/entry-server.tsx"),
    outDir: ssrOutput,
    emptyOutDir: true,
    copyPublicDir: false,
  },
});
const { renderPage } = await import(
  pathToFileURL(path.join(ssrOutput, "entry-server.js")).href
);
const template = await fs.readFile(path.join(output, "index.html"), "utf8");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
function htmlFor(route, title, description) {
  return template
    .replace(
      '<div id="root"></div>',
      `<div id="root">${renderPage(route)}</div>`,
    )
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escape(description)}" />`,
    )
    .replace(
      "</head>",
      `<link rel="canonical" href="https://mr-rafiq.github.io${route}" /></head>`,
    );
}
await fs.writeFile(
  path.join(output, "index.html"),
  htmlFor(
    base,
    "OpenGrid — Make room for your data.",
    "An independent MIT React and TypeScript grid. Try the real component, explore the docs, and build from source.",
  ),
);
for (const page of content.pages) {
  const destination = path.join(output, "docs", page.slug);
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(
    path.join(destination, "index.html"),
    htmlFor(
      `${base}docs/${page.slug}/`,
      `${page.title} · OpenGrid`,
      page.description,
    ),
  );
}
await fs.writeFile(
  path.join(output, "404.html"),
  htmlFor(
    `${base}404/`,
    "Page not found · OpenGrid",
    "Find your way back to the OpenGrid documentation.",
  ),
);
for (const [source, destination] of Object.entries(content.media)) {
  const target = path.join(output, destination);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(path.join(root, source), target);
}
await fs.writeFile(path.join(output, ".nojekyll"), "");
const licenses = await collectPagesLicenses(root);
await fs.writeFile(
  path.join(output, "THIRD_PARTY_LICENSES.txt"),
  licenses.text,
);
console.log(
  `Retained dependency notices: ${licenses.installedPackages} installed packages, ${licenses.distinctTexts} distinct license texts`,
);
await fs.writeFile(
  path.join(output, "robots.txt"),
  "User-agent: *\nAllow: /opengrid/\nSitemap: https://mr-rafiq.github.io/opengrid/sitemap.xml\n",
);
await fs.writeFile(
  path.join(output, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[base, ...content.pages.map((page) => `${base}docs/${page.slug}/`), `${base}demo/`].map((route) => `<url><loc>https://mr-rafiq.github.io${route}</loc></url>`).join("")}</urlset>`,
);
await build({
  root: path.join(root, "examples/demo"),
  configFile: path.join(root, "examples/demo/vite.config.ts"),
  base: `${base}demo/`,
  build: { outDir: path.join(output, "demo"), emptyOutDir: true },
});
console.log(
  `Pages artifact ready: ${path.relative(root, output)} (${content.pages.length} docs, landing, demo, 404)`,
);
