import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const repoRoot = path.resolve(siteRoot, "..");
const source = path.join(repoRoot, "essays");
const target = path.join(siteRoot, "public", "source");

if (!fs.existsSync(source)) {
  throw new Error(`Essays directory not found: ${source}`);
}

fs.rmSync(target, { force: true, recursive: true });
fs.cpSync(source, target, {
  recursive: true,
  filter: (entry) => !path.basename(entry).startsWith("."),
});

console.log(`Synced ${path.relative(repoRoot, source)} to ${path.relative(repoRoot, target)}`);
