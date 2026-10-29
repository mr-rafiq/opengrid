import fs from "node:fs/promises";
import path from "node:path";

/** Read only lockfile-listed installed packages and their conventional license/notice files. */
export async function collectPagesLicenses(root) {
  const lock = JSON.parse(
    await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
  );
  const realModules = await fs.realpath(path.join(root, "node_modules"));
  const documents = new Map();
  const metadataOnly = [];
  let installedPackages = 0;
  for (const [relative, entry] of Object.entries(lock.packages)) {
    if (!relative.startsWith("node_modules/") || entry.link) continue;
    if (
      !/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/.test(
        relative,
      ) ||
      relative.split("/").some((part) => part === ".." || part.startsWith("."))
    )
      throw new Error(`Invalid dependency path: ${relative}`);
    const directory = path.resolve(root, relative);
    let files;
    try {
      const canonical = await fs.realpath(directory);
      if (!canonical.startsWith(realModules + path.sep))
        throw new Error(
          `Dependency directory leaves installed tree: ${relative}`,
        );
      files = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") continue;
      throw error;
    }
    const metadata = JSON.parse(
      await fs.readFile(path.join(directory, "package.json"), "utf8"),
    );
    const label = `${metadata.name ?? relative}@${metadata.version ?? entry.version ?? "unknown"}`;
    installedPackages++;
    const candidates = files.filter(
      (file) =>
        file.isFile() &&
        /^(?:licen[cs]e|copying|notice)(?:$|[._-])/i.test(file.name) &&
        !/\.(?:[cm]?js|ts|json|map|wasm|node|exe|dll|zip|gz)$/i.test(file.name),
    );
    if (!candidates.length)
      metadataOnly.push(
        `${label}: ${typeof metadata.license === "string" ? metadata.license : "see upstream package"}`,
      );
    for (const file of candidates.sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const filename = path.join(directory, file.name);
      const canonical = await fs.realpath(filename);
      if (!canonical.startsWith(realModules + path.sep))
        throw new Error(
          `License file leaves installed tree: ${relative}/${file.name}`,
        );
      const stat = await fs.stat(canonical);
      if (stat.size > 2_000_000)
        throw new Error(
          `License text is unexpectedly large: ${relative}/${file.name}`,
        );
      const text = (await fs.readFile(canonical, "utf8"))
        .replaceAll("\r\n", "\n")
        .trim();
      const existing = documents.get(text) ?? [];
      existing.push(`${label} — ${file.name}`);
      documents.set(text, existing);
    }
  }
  const notices = await fs.readFile(
    path.join(root, "THIRD_PARTY_NOTICES.md"),
    "utf8",
  );
  const ownLicense = await fs.readFile(path.join(root, "LICENSE"), "utf8");
  const text = `${notices}\n\n===== OpenGrid =====\n${ownLicense}\n\n===== Installed build-tree dependency licenses and notices =====\nThis inventory includes build/test packages as well as browser runtime packages; presence is not a statement that every package is bundled. Absent optional platform packages are skipped. Identical texts are deduplicated with all originating package labels retained. Upstream prebuilt bundle caveats in the notices above still apply.\n\n${[...documents].map(([body, owners]) => `===== ${owners.join("; ")} =====\n${body}`).join("\n\n")}\n\n===== Packages without a standalone license/notice file =====\n${metadataOnly.join("\n")}\n`;
  return { text, installedPackages, distinctTexts: documents.size };
}
