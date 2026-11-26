import { readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/**
 * Seam for where backups live (ticket 06 owns the backup scheme).
 * Everything that must touch "all backups" (password change, moving the data file)
 * goes through these two functions, so ticket 06 only has to keep them in step
 * with how it names backups.
 *
 * Placeholder convention: `<dataFile>.backup-<anything>` in the data file's folder.
 */
export async function listBackupFiles(dataFile: string): Promise<string[]> {
  const prefix = `${basename(dataFile)}.backup-`;
  let names: string[];
  try {
    names = await readdir(dirname(dataFile));
  } catch {
    return [];
  }
  return names
    .filter((name) => name.startsWith(prefix) && !name.endsWith(".tmp"))
    .sort()
    .map((name) => join(dirname(dataFile), name));
}

/** Where `backupFile` (a backup of `fromDataFile`) belongs once the data file lives at `toDataFile`. */
export function relocatedBackupFile(backupFile: string, fromDataFile: string, toDataFile: string): string {
  const suffix = basename(backupFile).slice(basename(fromDataFile).length);
  return join(dirname(toDataFile), basename(toDataFile) + suffix);
}
