// Exits 0 when dist/ui is built and newer than every UI source file, else 1 (start.bat then builds).
// Plain Node, no dependencies, no network.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const built = join(root, "dist", "ui", "index.html");

function newestMtime(path) {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return Math.max(0, ...readdirSync(path).map((name) => newestMtime(join(path, name))));
}

let builtAt;
try {
  builtAt = statSync(built).mtimeMs;
} catch {
  process.exit(1);
}
const sources = [join(root, "src"), join(root, "vite.config.ts"), join(root, "package-lock.json")];
process.exit(Math.max(...sources.map(newestMtime)) > builtAt ? 1 : 0);
