import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";

export const repositoryRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
);
export const base = "/opengrid/";
export const repository = "https://github.com/mr-rafiq/opengrid";
const root = path.resolve(repositoryRoot);
const realRoot = fs.realpathSync(root);
for (const [name, grammar] of Object.entries({
  typescript,
  javascript,
  bash,
  json,
  css,
}))
  hljs.registerLanguage(name, grammar);
const aliases = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  sh: "bash",
  shell: "bash",
};
export const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-");
const labels = {
  "getting-started": "Getting started",
  overview: "Project overview",
  api: "API reference",
  "feature-parity": "Feature roadmap",
  "filter-builder": "Filter builder",
  "find-notes": "Find & notes",
  "notes-ui": "Note dialog",
  "row-edit": "Row edit sessions",
  "row-reorder": "Row reorder API",
  "column-spans": "Column spans",
  "row-spans": "Row spans",
  localization: "Localization",
  rtl: "Right-to-left layout",
  "gap-inventory": "Remaining gaps",
  "row-dragging-ui": "Managed row dragging",
  "row-editor-ui": "Row editor UI",
  "remote-grids": "Remote React grids",
  "remote-models": "Remote data models",
  "show-values-as": "Analytical transforms",
  "aligned-columns": "Aligned columns",
  "third-party-notices": "Dependency notices",
  "pinned-full-width-rows": "Pinned & full-width rows",
  "custom-filters": "Custom column filters",
  "calculated-columns": "Calculated columns",
};
const order = [
  "getting-started",
  "overview",
  "api",
  "editors",
  "row-editor-ui",
  "row-edit",
  "row-reorder",
  "row-dragging-ui",
  "column-groups",
  "column-spans",
  "row-spans",
  "localization",
  "rtl",
  "row-layout",
  "advanced-filters",
  "filter-builder",
  "custom-filters",
  "find-notes",
  "notes-ui",
  "remote-models",
  "remote-grids",
  "formulas",
  "calculated-columns",
  "charts",
  "show-values-as",
  "aligned-columns",
  "value-cache",
  "exports",
  "import",
  "printing",
  "feature-parity",
  "gap-inventory",
  "architecture",
  "contributing",
  "research",
  "verification",
  "third-party-notices",
  "license",
];
const section = (slug) =>
  ["getting-started", "overview", "api"].includes(slug)
    ? "Start building"
    : [
          "editors",
          "row-editor-ui",
          "row-edit",
          "row-reorder",
          "row-dragging-ui",
          "column-groups",
          "column-spans",
          "row-spans",
          "localization",
          "rtl",
          "row-layout",
          "advanced-filters",
          "filter-builder",
          "custom-filters",
          "find-notes",
          "notes-ui",
          "pinned-full-width-rows",
        ].includes(slug)
      ? "Grid experience"
      : [
            "remote-models",
            "remote-grids",
            "formulas",
            "calculated-columns",
            "charts",
            "show-values-as",
            "aligned-columns",
            "value-cache",
            "exports",
            "import",
            "printing",
          ].includes(slug)
        ? "Data & analysis"
        : "Project";

export function createContent() {
  const sources = fs
    .readdirSync(path.join(root, "docs"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({
      source: `docs/${file}`,
      slug: slugify(file.slice(0, -3)),
    }));
  sources.push(
    { source: "README.md", slug: "overview" },
    { source: "CONTRIBUTING.md", slug: "contributing" },
    { source: "THIRD_PARTY_NOTICES.md", slug: "third-party-notices" },
    { source: "LICENSE", slug: "license" },
    {
      source: "examples/site/content/getting-started.md",
      slug: "getting-started",
    },
  );
  const routes = new Map(
    sources.map((item) => [item.source, `${base}docs/${item.slug}/`]),
  );
  const media = new Map();
  const problems = [];
  function rewrite(href, source, image = false) {
    if (!href) return href;
    if (/^[a-z][a-z\d+.-]*:/i.test(href))
      return /^(https?:|mailto:)/i.test(href) ? href : "#unsupported-link";
    if (href.startsWith("//")) return `https:${href}`;
    if (href.startsWith("#") || href.startsWith(base)) return href;
    const match = /^([^?#]*)([?#].*)?$/.exec(href);
    const file = decodeURIComponent(match?.[1] ?? href);
    const suffix = match?.[2] ?? "";
    const relative = path.posix.normalize(
      path.posix.join(path.posix.dirname(source), file),
    );
    if (routes.has(relative)) return routes.get(relative) + suffix;
    const absolute = path.resolve(root, relative);
    if (relative.startsWith("../") || !absolute.startsWith(root + path.sep)) {
      problems.push(`${source}: outside-repository link ${href}`);
      return "#invalid-link";
    }
    if (!fs.existsSync(absolute)) {
      problems.push(`${source}: missing link ${href} -> ${relative}`);
      return "#invalid-link";
    }
    const realTarget = fs.realpathSync(absolute);
    if (
      realTarget !== realRoot &&
      !realTarget.startsWith(realRoot + path.sep)
    ) {
      problems.push(`${source}: symlink leaves repository ${href}`);
      return "#invalid-link";
    }
    if (image) {
      const canonicalMedia = path.relative(realRoot, realTarget);
      if (
        fs.lstatSync(absolute).isSymbolicLink() ||
        canonicalMedia.split(path.sep).some((part) => part.startsWith(".")) ||
        !/\.(?:png|jpe?g|gif|webp|svg)$/i.test(canonicalMedia)
      ) {
        problems.push(`${source}: unsupported canonical media target ${href}`);
        return "#invalid-media";
      }
      if (
        !/\.(?:png|jpe?g|gif|webp|svg)$/i.test(relative) ||
        relative.split("/").some((part) => part.startsWith("."))
      ) {
        problems.push(`${source}: unsupported media path ${href}`);
        return "#invalid-media";
      }
      const target = `media/${relative.replaceAll("/", "--")}`;
      media.set(relative, target);
      return base + target + suffix;
    }
    return `${repository}/blob/main/${relative.split("/").map(encodeURIComponent).join("/")}${suffix}`;
  }
  const pages = sources
    .map(({ source, slug }) => {
      const sourcePath = path.join(root, source);
      const sourceStat = fs.lstatSync(sourcePath);
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink())
        throw new Error(
          `Documentation source must be a regular file: ${source}`,
        );
      const realSource = fs.realpathSync(sourcePath);
      if (!realSource.startsWith(realRoot + path.sep))
        throw new Error(`Documentation source leaves checkout: ${source}`);
      const raw = fs.readFileSync(sourcePath, "utf8");
      const headings = [];
      const used = new Map();
      const md = new MarkdownIt({
        html: false,
        linkify: false,
        typographer: false,
      });
      const escape = md.utils.escapeHtml;
      md.renderer.rules.fence = (tokens, index) => {
        const token = tokens[index];
        const language = token.info.trim().split(/\s/)[0] || "text";
        const registered = aliases[language] ?? language;
        const code = hljs.getLanguage(registered)
          ? hljs.highlight(token.content, {
              language: registered,
              ignoreIllegals: true,
            }).value
          : escape(token.content);
        return `<div class="code-block"><div class="code-label"><span>${escape(language)}</span><button type="button" class="copy-code" aria-label="Copy code: ${escape(language)}">Copy code</button></div><pre tabindex="0" aria-label="${escape(language)} code"><code class="hljs language-${escape(language)}">${code}</code></pre></div>`;
      };
      const linkOpen =
        md.renderer.rules.link_open ??
        ((tokens, index, options, _env, self) =>
          self.renderToken(tokens, index, options));
      md.renderer.rules.link_open = (tokens, index, options, env, self) => {
        const href = rewrite(tokens[index].attrGet("href"), source);
        tokens[index].attrSet("href", href);
        if (/^https?:/.test(href)) tokens[index].attrSet("rel", "noreferrer");
        return linkOpen(tokens, index, options, env, self);
      };
      const imageRule = md.renderer.rules.image;
      md.renderer.rules.image = (tokens, index, options, env, self) => {
        tokens[index].attrSet(
          "src",
          rewrite(tokens[index].attrGet("src"), source, true),
        );
        tokens[index].attrSet("loading", "lazy");
        return imageRule(tokens, index, options, env, self);
      };
      md.renderer.rules.table_open = () =>
        '<div class="table-scroll" tabindex="0" role="region" aria-label="Documentation table"><table>';
      md.renderer.rules.table_close = () => "</table></div>";
      md.core.ruler.push("heading-ids", (state) => {
        for (let i = 0; i < state.tokens.length; i++)
          if (state.tokens[i].type === "heading_open") {
            const label = state.tokens[i + 1].content.replace(/[`*_]/g, "");
            const key = slugify(label) || "section";
            const n = used.get(key) ?? 0;
            used.set(key, n + 1);
            const id = key + (n ? `-${n}` : "");
            state.tokens[i].attrSet("id", id);
            headings.push({
              id,
              label,
              level: Number(state.tokens[i].tag.slice(1)),
            });
          }
      });
      const html =
        source === "LICENSE"
          ? `<h1 id="mit-license">MIT License</h1><pre tabindex="0" aria-label="License text">${escape(raw)}</pre>`
          : md.render(raw);
      const title =
        labels[slug] ?? headings.find((h) => h.level === 1)?.label ?? slug;
      return {
        slug,
        title,
        html,
        section: section(slug),
        headings,
        source,
        description: `OpenGrid documentation: ${title}.`,
        searchText: raw
          .replace(/[#*`|>]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      };
    })
    .sort(
      (a, b) =>
        (order.indexOf(a.slug) < 0 ? 999 : order.indexOf(a.slug)) -
        (order.indexOf(b.slug) < 0 ? 999 : order.indexOf(b.slug)),
    );
  if (problems.length)
    throw new Error(
      `Documentation links failed validation:\n${problems.join("\n")}`,
    );
  return {
    pages,
    groups: ["Start building", "Grid experience", "Data & analysis", "Project"],
    base,
    repository,
    media: Object.fromEntries(media),
  };
}
