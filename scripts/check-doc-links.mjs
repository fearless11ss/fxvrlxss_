import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const documentationRoots = [
  path.join(root, "README.md"),
  path.join(root, "docs"),
];
const markdownLinkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
const forbiddenObsidianPattern = /!?\[\[[^\]]+\]\]/g;
const failures = [];

async function collectMarkdownFiles(target) {
  const stats = await import("node:fs/promises").then(({ stat }) =>
    stat(target),
  );
  if (stats.isFile()) return [target];

  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(target, entry.name);
      if (entry.isDirectory()) return collectMarkdownFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

for (const documentationRoot of documentationRoots) {
  const files = await collectMarkdownFiles(documentationRoot);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const repositoryPath = path.relative(root, file);

    const forbiddenLinks = source.match(forbiddenObsidianPattern) ?? [];
    for (const link of forbiddenLinks) {
      failures.push(`${repositoryPath}: GitHub-incompatible link ${link}`);
    }

    for (const match of source.matchAll(markdownLinkPattern)) {
      const target = match[1]?.trim();
      if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue;

      const pathWithoutAnchor = decodeURIComponent(
        target.split("#", 1)[0] ?? "",
      );
      if (!pathWithoutAnchor) continue;

      const resolved = path.resolve(path.dirname(file), pathWithoutAnchor);
      try {
        await access(resolved);
      } catch {
        failures.push(`${repositoryPath}: missing link target ${target}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Documentation links are portable and valid.");
}
