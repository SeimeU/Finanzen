import { writeFile } from "node:fs/promises";

/** The export target already exists; nothing was written. */
export class ExportTargetExistsError extends Error {
  constructor(path: string) {
    super(`export target exists: ${path}`);
    this.name = "ExportTargetExistsError";
  }
}

/**
 * Writes `value` as readable, UNENCRYPTED JSON to `targetPath`. Never overwrites
 * an existing file (flag "wx"); the caller warns the owner beforehand.
 */
export async function exportUnencrypted(targetPath: string, value: unknown): Promise<void> {
  try {
    await writeFile(targetPath, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new ExportTargetExistsError(targetPath);
    throw e;
  }
}
