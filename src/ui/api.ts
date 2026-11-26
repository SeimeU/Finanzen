// The only place the UI talks to the server. Same origin, JSON in and out.
import type {
  AccountDetail,
  AccountInput,
  ContributionMonth,
  Classification,
  FilePreview,
  GenericProfileSettings,
  ImportProfilePreview,
  HoldingInput,
  ImportedFile,
  ImportRecord,
  InstitutionView,
  MonthNotes,
  NetWorthMonth,
  SnapshotForm,
  SnapshotInput,
  Transaction,
  TransactionFilter,
} from "../core";

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
  changePassword: (currentPassword: string, newPassword: string) =>
    call<object>("POST", "/api/password", { currentPassword, newPassword }),
  settings: () => call<{ dataFile: string }>("GET", "/api/settings"),
  moveDataFile: (path: string) => call<{ dataFile: string }>("POST", "/api/data-file", { path }),

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

/** One backup of the data file; `createdAt` is an ISO 8601 UTC instant. */
export type Backup = { id: string; createdAt: string };

/** Monatsstand (Snapshots) and the Net worth series. Amounts in integer cents. */
export const snapshotsApi = {
  netWorth: () => call<{ series: NetWorthMonth[] }>("GET", "/api/net-worth"),
  form: (month: string) => call<{ form: SnapshotForm }>("POST", "/api/snapshots/form", { month }),
  save: (input: Omit<SnapshotInput, "today">) => call<{ form: SnapshotForm }>("POST", "/api/snapshots/save", input),
};

// Kept apart from `api` so tickets adding endpoints in parallel don't collide.
export const backupsApi = {
  list: () => call<{ backups: Backup[] }>("GET", "/api/backups"),
  restore: (id: string) => call<{ backups: Backup[] }>("POST", "/api/backups/restore", { id }),
  exportSuggestion: () => call<{ suggestedPath: string }>("GET", "/api/export"),
  exportUnencrypted: (path: string) => call<{ path: string }>("POST", "/api/export", { path }),
};

/** Notes and Events. Every call replies with the whole chronological list. Amounts in cents. */
export const notesApi = {
  list: () => call<{ notes: MonthNotes[] }>("GET", "/api/notes"),
  setNote: (input: { month: string; note: string }) => call<{ notes: MonthNotes[] }>("POST", "/api/notes/set", input),
  addEvent: (input: { month: string; label: string; amount: number }) =>
    call<{ notes: MonthNotes[]; id: string }>("POST", "/api/events/add", input),
  updateEvent: (input: { id: string; label: string; amount: number }) =>
    call<{ notes: MonthNotes[] }>("POST", "/api/events/update", input),
  deleteEvent: (input: { id: string }) => call<{ notes: MonthNotes[] }>("POST", "/api/events/delete", input),
};
/** Konto detail and the Einzahlung vs market change split (ticket 11). */
export const accountDetailApi = {
  detail: (id: string) => call<{ detail: AccountDetail }>("POST", "/api/accounts/detail", { id }),
  contributions: () => call<{ months: ContributionMonth[] }>("GET", "/api/contributions"),
};

/** A dropped CSV file on its way to the server. */
export type UploadFile = { name: string; contentBase64: string };

// CSV import and the Transaction list (Umsätze).
export const importApi = {
  preview: (files: (UploadFile & { accountId?: string | null })[]) =>
    call<{ files: FilePreview[] }>("POST", "/api/import/preview", { files }),
  confirm: (files: (UploadFile & { accountId: string })[]) =>
    call<{ files: ImportedFile[]; imports: ImportRecord[] }>("POST", "/api/import/confirm", { files }),
  undo: (importId: string) => call<{ imports: ImportRecord[] }>("POST", "/api/import/undo", { importId }),
  imports: () => call<{ imports: ImportRecord[] }>("GET", "/api/imports"),
  searchTransactions: (filter: TransactionFilter) =>
    call<{ transactions: Transaction[] }>("POST", "/api/transactions/search", filter),
};

export const importProfilesApi = {
  preview: (settings: GenericProfileSettings, file: UploadFile) =>
    call<{ preview: ImportProfilePreview }>("POST", "/api/import-profiles/preview", { settings, file }),
  save: (accountId: string, settings: GenericProfileSettings, file: UploadFile) =>
    call<{ id: string }>("POST", "/api/import-profiles/save", { accountId, settings, file }),
};

export async function toUploadFile(file: File): Promise<UploadFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name: file.name, contentBase64: btoa(binary) };
}
