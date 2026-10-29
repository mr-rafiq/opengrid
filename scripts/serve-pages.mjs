import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  fileURLToPath(new URL("../dist/pages", import.meta.url)),
);
const port = Number(process.argv[process.argv.indexOf("--port") + 1]) || 4174;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
};
http
  .createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (!url.pathname.startsWith("/opengrid/")) {
        response.writeHead(404);
        response.end("Use /opengrid/");
        return;
      }
      let target = path.resolve(
        root,
        decodeURIComponent(url.pathname.slice("/opengrid/".length)),
      );
      if (target !== root && !target.startsWith(root + path.sep)) {
        response.writeHead(400);
        response.end("Invalid path");
        return;
      }
      let stat = await fs.stat(target).catch(() => undefined);
      if (stat?.isDirectory()) {
        if (!url.pathname.endsWith("/")) {
          response.writeHead(301, {
            Location: url.pathname + "/" + url.search,
          });
          response.end();
          return;
        }
        target = path.join(target, "index.html");
        stat = await fs.stat(target).catch(() => undefined);
      }
      if (!stat?.isFile()) {
        response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        response.end(await fs.readFile(path.join(root, "404.html")));
        return;
      }
      response.writeHead(200, {
        "Content-Type":
          types[path.extname(target)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(await fs.readFile(target));
    } catch {
      response.writeHead(400);
      response.end("Bad request");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`OpenGrid Pages preview http://127.0.0.1:${port}/opengrid/`),
  );
