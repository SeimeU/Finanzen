import { randomUUID } from "node:crypto";

/**
 * A fresh name next to `path` for writing before an atomic rename. Unique per call,
 * so two writes to the same file never share (and clobber) one temporary file.
 */
export function temporaryPathFor(path: string): string {
  return `${path}.${randomUUID()}.tmp`;
}
