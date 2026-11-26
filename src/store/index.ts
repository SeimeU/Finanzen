// Encrypted file store: the only module that reads or writes the data file.
export { InvalidDataFileError, WrongPasswordError, load, save } from "./encryptedFileStore";
