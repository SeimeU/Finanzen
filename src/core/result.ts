/**
 * Every core command (and loadDocument) returns a Result instead of throwing,
 * so the server can turn a validation error into a 4xx response.
 */
export type CoreError = { code: string; message: string };

export type Result<T> = { ok: true } & T | { ok: false; error: CoreError };

export function fail(code: string, message: string): { ok: false; error: CoreError } {
  return { ok: false, error: { code, message } };
}
