import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * App settings that must be known before unlocking, so they cannot live in the
 * encrypted document. Plain JSON, holding only the chosen data file location.
 */
export type AppSettings = { dataFile?: string };

export async function readSettings(path: string): Promise<AppSettings> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return typeof parsed?.dataFile === "string" ? { dataFile: parsed.dataFile } : {};
  } catch {
    return {};
  }
}

export async function writeSettings(path: string, settings: AppSettings): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(settings, null, 2) + "\n", "utf8");
  await rename(`${path}.tmp`, path);
}
