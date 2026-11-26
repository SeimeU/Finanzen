// The only place the UI talks to the server. Same origin, JSON in and out.
import type { AccountInput, Classification, HoldingInput, InstitutionView } from "../core";

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

  structure: () => call<Structure>("GET", "/api/structure"),
  createInstitution: (input: { name: string }) => call<Structure>("POST", "/api/institutions/create", input),
  updateInstitution: (input: { id: string; name: string }) => call<Structure>("POST", "/api/institutions/update", input),
  createAccount: (input: AccountInput) => call<Structure>("POST", "/api/accounts/create", input),
  updateAccount: (input: { id: string } & Omit<AccountInput, "institutionId">) =>
    call<Structure>("POST", "/api/accounts/update", input),
  createHolding: (input: HoldingInput) => call<Structure>("POST", "/api/holdings/create", input),
  updateHolding: (input: { id: string; name: string; classification: Classification }) =>
    call<Structure>("POST", "/api/holdings/update", input),
};

/** Every structure command replies with the whole updated tree. */
export type Structure = { structure: InstitutionView[] };
