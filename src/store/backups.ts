import { backupFile } from "./backupFiles";
import { load, save } from "./encryptedFileStore";

/**
 * Restores a backup: decrypts it with `password`, then saves it as the data file.
 * That save backs up the state being replaced, so a restore can itself be undone.
 * Throws WrongPasswordError (nothing changed) or BackupNotFoundError.
 */
export async function restoreBackup(dataFile: string, password: string, id: string): Promise<unknown> {
  const value = await load(await backupFile(dataFile, id), password);
  await save(dataFile, password, value);
  return value;
}
