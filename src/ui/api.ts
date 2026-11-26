// The only place the UI talks to the server. Same origin, JSON in and out.

export type AppState = "new" | "locked" | "unlocked";

/** A failed API call; `message` is German and can be shown to the owner as-is. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new ApiError(json.error.code, json.error.message);
  return json as T;
}

export const api = {
  status: () => call<{ state: AppState }>("GET", "/api/status"),
  setup: (password: string) => call<{ state: AppState }>("POST", "/api/setup", { password }),
  unlock: (password: string) => call<{ state: AppState }>("POST", "/api/unlock", { password }),
  lock: () => call<{ state: AppState }>("POST", "/api/lock"),
};

/** One backup of the data file; `createdAt` is an ISO 8601 UTC instant. */
export type Backup = { id: string; createdAt: string };

// Kept apart from `api` so tickets adding endpoints in parallel don't collide.
export const backupsApi = {
  list: () => call<{ backups: Backup[] }>("GET", "/api/backups"),
  restore: (id: string) => call<{ backups: Backup[] }>("POST", "/api/backups/restore", { id }),
  exportSuggestion: () => call<{ suggestedPath: string }>("GET", "/api/export"),
  exportUnencrypted: (path: string) => call<{ path: string }>("POST", "/api/export", { path }),
};
