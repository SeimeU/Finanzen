import { constants, existsSync } from "node:fs";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { allBackupFiles, relocatedBackupFile, removeEmptyBackupDir } from "./backupFiles";
import { load, writeEncrypted } from "./encryptedFileStore";

/** A file already exists where the data file (or one of its backups) would be moved to. Nothing was moved. */
export class TargetExistsError extends Error {
  constructor(readonly path: string) {
    super(`target exists: ${path}`);
    this.name = "TargetExistsError";
  }
}

/**
 * Re-encrypts the data file and every backup with `newPassword`.
 * Throws WrongPasswordError (touching nothing) if `oldPassword` does not decrypt
 * the data file or any backup: everything is decrypted before anything is written.
 * Backups are written first and the data file last.
 */
export async function changePassword(dataFile: string, oldPassword: string, newPassword: string): Promise<void> {
  const files = [...(await allBackupFiles(dataFile)), dataFile];
  const contents: unknown[] = [];
  for (const file of files) contents.push(await load(file, oldPassword));
  // Re-encrypt in place: no new backup, which would still be readable with the old password.
  for (const [i, file] of files.entries()) await writeEncrypted(file, newPassword, contents[i], { keepBackup: false });
}

/**
 * Moves the data file and its backups to `toDataFile` (creating folders as needed).
 * Copies everything first and removes the originals only once all copies exist,
 * so a failure leaves the original location complete. Works across drives.
 */
export async function moveDataFile(fromDataFile: string, toDataFile: string): Promise<void> {
  if (resolve(fromDataFile) === resolve(toDataFile)) return;
  const backups = await allBackupFiles(fromDataFile);
  const moves: Array<[string, string]> = [
    [fromDataFile, toDataFile],
    ...backups.map((b): [string, string] => [b, relocatedBackupFile(b, fromDataFile, toDataFile)]),
  ];
  for (const [, to] of moves) if (existsSync(to)) throw new TargetExistsError(to);

  for (const [, to] of moves) await mkdir(dirname(to), { recursive: true });
  const copied: string[] = [];
  try {
    for (const [from, to] of moves) {
      await copyFile(from, to, constants.COPYFILE_EXCL);
      copied.push(to);
    }
  } catch (e) {
    for (const to of copied) await rm(to, { force: true });
    throw e;
  }
  for (const [from] of moves) await rm(from, { force: true });
  await removeEmptyBackupDir(fromDataFile);
}
