import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const manifest = read("package.json");
const lock = read("package-lock.json");
const files = [
  "package.json",
  ...manifest.workspaces.flatMap((pattern) =>
    fs.globSync(`${pattern}/package.json`, { cwd: root }),
  ),
];
const workspaces = files.map((file) => ({
  file: file.replaceAll("\\", "/"),
  data: read(file),
}));
const names = new Set(workspaces.map((item) => item.data.name));
const problems = [];
const version = manifest.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))
  problems.push("Root release version is invalid");
if (lock.version !== version)
  problems.push("Root lockfile version differs from the workspace release");
for (const { file, data } of workspaces) {
  const key = file === "package.json" ? "" : path.posix.dirname(file);
  const locked = lock.packages?.[key];
  if (data.version !== version)
    problems.push(`${file}: expected version ${version}`);
  if (locked?.version !== version)
    problems.push(`${file}: lockfile version differs`);
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const [name, requested] of Object.entries(data[field] ?? {})) {
      if (!names.has(name)) continue;
      if (requested !== version)
        problems.push(`${file}: ${name} must use ${version}`);
      if (locked?.[field]?.[name] !== requested)
        problems.push(`${file}: locked ${name} range differs`);
    }
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Release ${version}: ${workspaces.length} manifests, internal dependencies and lockfile are consistent.`,
  );
