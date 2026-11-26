// Encrypted file store: the only module that reads or writes the data file and its backups.
export { InvalidDataFileError, WrongPasswordError, load, save } from "./encryptedFileStore";
export { BackupNotFoundError, MAX_BACKUPS, listBackups, type Backup } from "./backupFiles";
export { restoreBackup } from "./backups";
export { ExportTargetExistsError, exportUnencrypted } from "./export";
export { TargetExistsError, changePassword, moveDataFile } from "./dataFileMaintenance";
