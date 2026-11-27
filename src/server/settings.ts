import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { temporaryPathFor } from "../store";

/**
 * App settings that must be known before unlocking, so they cannot live in the
 * encrypted document (ADR 0003). Plain JSON, holding only the chosen data file location.
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
  const temporaryPath = temporaryPathFor(path);
  await writeFile(temporaryPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  await rename(temporaryPath, path);
}
