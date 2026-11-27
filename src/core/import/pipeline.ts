import type { ImportRecord, Transaction, WealthDocument } from "../document";
import { fail, type Result } from "../result";
import { decodeText } from "./csv";
import { genericProfiles } from "./generic";
import type { ImportProfile, ParsedTransaction } from "./profile";
import { BUILT_IN_PROFILES } from "./profiles";

/**
 * The import pipeline: detect format → parse → normalize → deduplicate → preview → confirm.
 * Pure: files come in as bytes, the import time is passed in.
 */

export type ImportFileInput = { name: string; bytes: Uint8Array };

export type FilePreview =
  | {
      name: string;
      ok: true;
      profile: { id: string; label: string };
      /** The Account the file is previewed against: the one asked for, else the only matching one, else null. */
      suggestedAccountId: string | null;
      dateRange: { from: string; to: string };
      newCount: number;
      duplicateCount: number;
    }
  | { name: string; ok: false; error: { code: string; message: string } };

/** Previews each file on its own; an unreadable file gets an error entry, the others are unaffected. */
export function previewImport(
  document: WealthDocument,
  input: { files: (ImportFileInput & { accountId?: string | null })[] },
): Result<{ files: FilePreview[] }> {
  if (!Array.isArray(input.files) || input.files.length === 0) {
    return fail("no-files", "Bitte mindestens eine CSV-Datei auswählen.");
  }
  const files = input.files.map((file): FilePreview => {
    const read = readFile(document, file);
    if (!read.ok) return { name: file.name, ok: false, error: read.error };
    const accountId =
      file.accountId && document.accounts.some((a) => a.id === file.accountId)
        ? file.accountId
        : suggestAccount(document, read.profile);
    const { fresh } = splitDuplicates(document.transactions, accountId, read.transactions);
    const dates = read.transactions.map((t) => t.bookingDate).sort();
    return {
      name: file.name,
      ok: true,
      profile: { id: read.profile.id, label: read.profile.label },
      suggestedAccountId: accountId,
      dateRange: { from: dates[0]!, to: dates[dates.length - 1]! },
      newCount: accountId ? fresh.length : read.transactions.length,
      duplicateCount: accountId ? read.transactions.length - fresh.length : 0,
    };
  });
  return { ok: true, files };
}

export type ImportedFile = { name: string; importId: string | null; newCount: number; duplicateCount: number };

/**
 * Stores the new Transactions of every file on its chosen Account, skipping duplicates
 * (also against earlier files of the same call). All or nothing: one unreadable file or
 * unknown Account rejects the whole call. A file with nothing new records no import.
 */
export function confirmImport(
  document: WealthDocument,
  input: { importedAt: string; files: (ImportFileInput & { accountId: string })[] },
): Result<{ document: WealthDocument; files: ImportedFile[] }> {
  if (!Array.isArray(input.files) || input.files.length === 0) {
    return fail("no-files", "Bitte mindestens eine CSV-Datei auswählen.");
  }
  let transactions = document.transactions;
  let imports = document.imports;
  const files: ImportedFile[] = [];
  for (const file of input.files) {
    if (!document.accounts.some((a) => a.id === file.accountId)) {
      return fail("account-required", `Bitte für „${file.name}“ ein Konto wählen.`);
    }
    const read = readFile(document, file);
    if (!read.ok) return fail(read.error.code, `${file.name}: ${read.error.message}`);
    const { fresh, duplicateCount } = splitDuplicates(transactions, file.accountId, read.transactions);
    if (fresh.length === 0) {
      files.push({ name: file.name, importId: null, newCount: 0, duplicateCount });
      continue;
    }
    const importId = nextId(imports, "imp");
    const firstNumber = nextNumber(transactions, "t");
    const added: Transaction[] = fresh.map((t, i) => ({
      id: `t${firstNumber + i}`,
      accountId: file.accountId,
      importId,
      ...t,
    }));
    const record: ImportRecord = {
      id: importId,
      fileName: file.name,
      profileId: read.profile.id,
      accountId: file.accountId,
      importedAt: input.importedAt,
      transactionCount: added.length,
      duplicateCount,
    };
    transactions = [...transactions, ...added];
    imports = [...imports, record];
    files.push({ name: file.name, importId, newCount: added.length, duplicateCount });
  }
  return { ok: true, document: { ...document, transactions, imports }, files };
}

/** Removes an import and exactly the Transactions it stored. */
export function undoImport(document: WealthDocument, input: { importId: string }): Result<{ document: WealthDocument }> {
  if (!document.imports.some((i) => i.id === input.importId)) {
    return fail("import-not-found", "Diesen Import gibt es nicht.");
  }
  return {
    ok: true,
    document: {
      ...document,
      imports: document.imports.filter((i) => i.id !== input.importId),
      transactions: document.transactions.filter((t) => t.importId !== input.importId),
    },
  };
}

/** Confirmed imports, newest first. */
export function listImports(document: WealthDocument): ImportRecord[] {
  return [...document.imports].reverse();
}

type ReadFile =
  | { ok: true; profile: ImportProfile; transactions: ParsedTransaction[] }
  | { ok: false; error: { code: string; message: string } };

function readFile(document: WealthDocument, file: ImportFileInput): ReadFile {
  if (!(file.bytes instanceof Uint8Array) || file.bytes.length === 0) {
    return { ok: false, error: { code: "empty-file", message: "Die Datei ist leer." } };
  }
  const text = decodeText(file.bytes);
  // Built-in profiles first, then the owner's generic ones.
  const profile = [...BUILT_IN_PROFILES, ...genericProfiles(document)].find((p) => p.detect(text));
  if (!profile) {
    return {
      ok: false,
      error: { code: "unknown-format", message: "Das Format dieser Datei wurde nicht erkannt. Es wurde nichts importiert." },
    };
  }
  const parsed = profile.parse(text);
  if (!parsed.ok) return parsed;
  return { ok: true, profile, transactions: parsed.transactions };
}

function suggestAccount(document: WealthDocument, profile: ImportProfile): string | null {
  if (profile.accountId && document.accounts.some((a) => a.id === profile.accountId)) return profile.accountId;
  const institutionIds = new Set(
    document.institutions.filter((i) => profile.matchesInstitution(i.name)).map((i) => i.id),
  );
  const candidates = document.accounts.filter((a) => institutionIds.has(a.institutionId));
  return candidates.length === 1 ? candidates[0]!.id : null;
}

/**
 * The duplicate key is Account, booking date, amount in cents and normalized text.
 * Keys are counted, so a file with two identical rows keeps both on first import
 * and skips both on a re-import.
 */
function splitDuplicates(
  existing: Transaction[],
  accountId: string | null,
  incoming: ParsedTransaction[],
): { fresh: ParsedTransaction[]; duplicateCount: number } {
  const available = new Map<string, number>();
  for (const t of existing) {
    if (t.accountId !== accountId) continue;
    const key = duplicateKey(t);
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  const fresh: ParsedTransaction[] = [];
  for (const t of incoming) {
    const key = duplicateKey(t);
    const left = available.get(key) ?? 0;
    if (left > 0) available.set(key, left - 1);
    else fresh.push(t);
  }
  return { fresh, duplicateCount: incoming.length - fresh.length };
}

function duplicateKey(t: Pick<Transaction, "bookingDate" | "amountCents" | "counterpartyName" | "purpose">): string {
  return [t.bookingDate, t.amountCents, normalizeText(`${t.counterpartyName} ${t.purpose}`)].join("|");
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function nextNumber(entries: { id: string }[], prefix: string): number {
  let max = 0;
  for (const e of entries) {
    const n = Number(e.id.slice(prefix.length));
    if (e.id.startsWith(prefix) && Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function nextId(entries: { id: string }[], prefix: string): string {
  return `${prefix}${nextNumber(entries, prefix)}`;
}
