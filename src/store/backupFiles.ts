import { existsSync } from "node:fs";
import { copyFile, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { temporaryPathFor } from "./temporaryPath";

/**
 * Backup files of a data file. Before each save the previous data file is copied,
 * still encrypted, into `<data dir>/backups/` as `<name>-<UTC timestamp>-<seq>.dat`.
 * The newest MAX_BACKUPS are kept; older ones are deleted.
 */
export const MAX_BACKUPS = 30;

/** One backup of the data file. `id` is opaque; `createdAt` is an ISO 8601 UTC timestamp. */
export type Backup = { id: string; createdAt: string };

/** No backup with this id exists for the data file. */
export class BackupNotFoundError extends Error {
  constructor(id: string) {
    super(`backup not found: ${id}`);
    this.name = "BackupNotFoundError";
  }
}

function backupDir(dataFile: string) {
  return join(dirname(dataFile), "backups");
}

function prefix(dataFile: string) {
  return `${basename(dataFile, extname(dataFile))}-`;
}

// "<prefix>2026-11-26T10-20-30-123Z-000.dat": sorts chronologically by name.
const STAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-\d{3}\.dat$/;

/** Copies the current data file (if any) into the backups and rotates out the oldest. */
export async function keepBackupOf(dataFile: string, now = new Date()): Promise<void> {
  if (!existsSync(dataFile)) return;
  const dir = backupDir(dataFile);
  await mkdir(dir, { recursive: true });
  const stamp = now.toISOString().replace(/:/g, "-").replace(".", "-");
  const temporaryPath = temporaryPathFor(join(dir, prefix(dataFile) + stamp));
  await copyFile(dataFile, temporaryPath);
  // Claim the first free sequence number by creating it exclusively ("wx" fails if the name is
  // taken, even by a concurrent save), then move the finished copy over the claimed name.
  try {
    for (let sequence = 0; ; sequence++) {
      const target = join(dir, `${prefix(dataFile)}${stamp}-${String(sequence).padStart(3, "0")}.dat`);
      const claimed = await open(target, "wx").catch((e: NodeJS.ErrnoException) => {
        if (e.code === "EEXIST") return null;
        throw e;
      });
      if (!claimed) continue;
      await claimed.close();
      await rename(temporaryPath, target);
      break;
    }
  } finally {
    await rm(temporaryPath, { force: true });
  }

  const names = await backupNames(dataFile);
  for (const name of names.slice(MAX_BACKUPS)) await rm(join(dir, name), { force: true });
}

/** The backups of the data file, newest first. */
export async function listBackups(dataFile: string): Promise<Backup[]> {
  const names = await backupNames(dataFile);
  return names.map((name) => {
    const [, date, h, m, s, ms] = STAMP.exec(name.slice(prefix(dataFile).length))!;
    return { id: name, createdAt: `${date}T${h}:${m}:${s}.${ms}Z` };
  });
}

/** The file of a listed backup; throws BackupNotFoundError for anything else. */
export async function backupFile(dataFile: string, id: string): Promise<string> {
  if (!(await backupNames(dataFile)).includes(id)) throw new BackupNotFoundError(id);
  return join(backupDir(dataFile), id);
}

async function backupNames(dataFile: string): Promise<string[]> {
  const dir = backupDir(dataFile);
  if (!existsSync(dir)) return [];
  const p = prefix(dataFile);
  return (await readdir(dir))
    .filter((name) => name.startsWith(p) && STAMP.test(name.slice(p.length)))
    .sort()
    .reverse();
}

/** The files of all backups of the data file, newest first (for password change and moving). */
export async function allBackupFiles(dataFile: string): Promise<string[]> {
  return (await backupNames(dataFile)).map((name) => join(backupDir(dataFile), name));
}

/** Where a backup file of `fromDataFile` belongs once the data file lives at `toDataFile`. */
export function relocatedBackupFile(backupPath: string, fromDataFile: string, toDataFile: string): string {
  const stamp = basename(backupPath).slice(prefix(fromDataFile).length);
  return join(backupDir(toDataFile), prefix(toDataFile) + stamp);
}

/** Removes the backups folder of the data file if it is empty. */
export async function removeEmptyBackupDir(dataFile: string): Promise<void> {
  const dir = backupDir(dataFile);
  if (existsSync(dir) && (await readdir(dir)).length === 0) await rm(dir, { recursive: true });
}
