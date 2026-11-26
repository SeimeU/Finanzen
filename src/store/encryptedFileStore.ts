import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { open, readFile, rename } from "node:fs/promises";
import { keepBackupOf } from "./backupFiles";

/**
 * Encrypted file store (ADR 0002). Stores any JSON value; it knows nothing
 * about the document shape (the core validates and migrates after load).
 *
 * File layout (binary):
 *   magic "FZV1" (4) | scrypt log2(N) (1) | salt (16) | nonce (12) | GCM tag (16) | ciphertext
 * Key: scrypt(password, salt, N, r=8, p=1) → 32 bytes, AES-256-GCM.
 * A fresh salt and nonce are drawn on every save.
 */

const MAGIC = Buffer.from("FZV1", "ascii");
const SCRYPT_LOG_N = 15;
const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + SALT_LENGTH + NONCE_LENGTH + TAG_LENGTH;

/** The password does not decrypt the file. No file was touched. */
export class WrongPasswordError extends Error {
  constructor() {
    super("wrong password");
    this.name = "WrongPasswordError";
  }
}

/** The file is not a data file of this app. */
export class InvalidDataFileError extends Error {
  constructor(message = "not a data file") {
    super(message);
    this.name = "InvalidDataFileError";
  }
}

export async function load(path: string, password: string): Promise<unknown> {
  const bytes = await readFile(path);
  if (bytes.length < HEADER_LENGTH || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new InvalidDataFileError();
  }
  let offset = MAGIC.length;
  const logN = bytes[offset];
  offset += 1;
  const salt = bytes.subarray(offset, (offset += SALT_LENGTH));
  const nonce = bytes.subarray(offset, (offset += NONCE_LENGTH));
  const tag = bytes.subarray(offset, (offset += TAG_LENGTH));
  const ciphertext = bytes.subarray(offset);

  const key = await deriveKey(password, salt, logN);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // GCM authentication failed: wrong password (or a tampered file).
    throw new WrongPasswordError();
  }
  return JSON.parse(plaintext.toString("utf8"));
}

/**
 * Encrypts and writes atomically: a temporary file is written, synced, then renamed over `path`.
 * The previous file is first kept as a backup (see ./backupFiles.ts).
 */
export async function save(path: string, password: string, value: unknown): Promise<void> {
  await writeEncrypted(path, password, value, { keepBackup: true });
}

/**
 * Like `save`, but optionally without keeping a backup of the previous file. Used to
 * re-encrypt in place (password change), where a backup under the old password would
 * defeat the purpose. Not exported from the store's index.
 */
export async function writeEncrypted(
  path: string,
  password: string,
  value: unknown,
  { keepBackup }: { keepBackup: boolean },
): Promise<void> {
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const salt = randomBytes(SALT_LENGTH);
  const nonce = randomBytes(NONCE_LENGTH);
  const key = await deriveKey(password, salt, SCRYPT_LOG_N);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const bytes = Buffer.concat([
    MAGIC,
    Buffer.from([SCRYPT_LOG_N]),
    salt,
    nonce,
    cipher.getAuthTag(),
    ciphertext,
  ]);

  const temporaryPath = `${path}.tmp`;
  const handle = await open(temporaryPath, "w");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (keepBackup) await keepBackupOf(path);
  await rename(temporaryPath, path);
}

function deriveKey(password: string, salt: Buffer, logN: number): Promise<Buffer> {
  const N = 2 ** logN;
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 32, { N, r: 8, p: 1, maxmem: 256 * N * 8 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
