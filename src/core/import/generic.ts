import {
  GENERIC_DATE_FORMATS,
  GENERIC_DECIMAL_SEPARATORS,
  GENERIC_SEPARATORS,
  type GenericColumnMapping,
  type GenericImportProfile,
  type GenericProfileSettings,
  type WealthDocument,
} from "../document";
import { fail, type Result } from "../result";
import { decimalToCents, decodeText, isIsoDate, parseCsv } from "./csv";
import type { ImportProfile, ParsedTransaction, ParseResult } from "./profile";

/**
 * Generic Import profiles: the owner describes a bank's CSV once (separator, lines to skip,
 * date and number format, which column holds what) and saves it for one Account.
 * A later file is recognized when its header row (if the sample had one) and its first
 * Transaction row fit the profile; any row that doesn't fit then fails the whole file.
 */

const COLUMN_LABELS: Record<keyof GenericColumnMapping, string> = {
  bookingDate: "Datum",
  amount: "Betrag",
  counterpartyName: "Gegenseite",
  purpose: "Verwendungszweck",
  counterpartyIban: "IBAN",
  paymentReference: "Zahlungsreferenz",
};
const REQUIRED_COLUMNS = ["bookingDate", "amount", "counterpartyName", "purpose"] as const;
const MAX_SKIP_LINES = 100;
const PREVIEW_LINES = 10;
const PREVIEW_TRANSACTIONS = 5;

export type ImportProfilePreview = {
  /** The file's first lines split at the chosen separator, skipped lines included, for picking columns. */
  lines: string[][];
  result:
    | { ok: true; transactions: ParsedTransaction[]; transactionCount: number }
    | { ok: false; error: { code: string; message: string } };
};

/** Live preview while the owner sets up a generic Import profile: the first parsed rows, or why the file doesn't fit. */
export function previewImportProfile(input: { settings: GenericProfileSettings; sample: Uint8Array }): ImportProfilePreview {
  const text = input.sample instanceof Uint8Array ? decodeText(input.sample) : "";
  const separator = (GENERIC_SEPARATORS as readonly string[]).includes(input.settings?.separator)
    ? input.settings.separator
    : ";";
  const lines = splitLines(text)
    .slice(0, PREVIEW_LINES)
    .map((line) => parseCsv(line, separator)?.[0] ?? [line]);
  const read = readSample(input);
  return {
    lines,
    result: read.ok
      ? { ok: true, transactions: read.transactions.slice(0, PREVIEW_TRANSACTIONS), transactionCount: read.transactions.length }
      : { ok: false, error: read.error },
  };
}

/**
 * Saves a generic Import profile for an Account, replacing the one it had. The sample file
 * must be read without error with these settings; it fixes the column count and header row.
 */
export function saveImportProfile(
  document: WealthDocument,
  input: { accountId: string; settings: GenericProfileSettings; sample: Uint8Array },
): Result<{ document: WealthDocument; id: string }> {
  if (!document.accounts.some((a) => a.id === input.accountId)) {
    return fail("account-not-found", "Bitte ein Konto für das Importprofil wählen.");
  }
  const read = readSample(input);
  if (!read.ok) return fail(read.error.code, read.error.message);
  const existing = document.importProfiles.find((p) => p.accountId === input.accountId);
  const id = existing?.id ?? nextProfileId(document.importProfiles);
  const s = input.settings;
  const profile: GenericImportProfile = {
    id,
    accountId: input.accountId,
    separator: s.separator,
    skipLines: s.skipLines,
    dateFormat: s.dateFormat,
    decimalSeparator: s.decimalSeparator,
    columns: { ...s.columns },
    columnCount: read.columnCount,
    header: read.header,
  };
  const importProfiles = existing
    ? document.importProfiles.map((p) => (p.id === id ? profile : p))
    : [...document.importProfiles, profile];
  return { ok: true, document: { ...document, importProfiles }, id };
}

/** The document's generic Import profiles in the shape the import pipeline tries. */
export function genericProfiles(document: WealthDocument): ImportProfile[] {
  return document.importProfiles.flatMap((saved) => {
    const account = document.accounts.find((a) => a.id === saved.accountId);
    if (!account) return [];
    const institution = document.institutions.find((i) => i.id === account.institutionId);
    return [
      {
        id: saved.id,
        label: `Importprofil ${institution ? `${institution.name} – ` : ""}${account.name}`,
        accountId: saved.accountId,
        matchesInstitution: () => false,
        detect: (text: string) => {
          const read = readText(text, saved, { columnCount: saved.columnCount, limit: 1 });
          return read.ok && sameHeader(read.header, saved.header);
        },
        parse: (text: string): ParseResult => {
          const read = readText(text, saved, { columnCount: saved.columnCount });
          return read.ok ? { ok: true, transactions: read.transactions } : read;
        },
      },
    ];
  });
}

type Read =
  | { ok: true; transactions: ParsedTransaction[]; columnCount: number; header: string[] | null }
  | { ok: false; error: { code: string; message: string } };

function readSample(input: { settings: GenericProfileSettings; sample: Uint8Array }): Read {
  const invalid = validateSettings(input.settings);
  if (invalid) return invalid;
  if (!(input.sample instanceof Uint8Array) || input.sample.length === 0) {
    return failure("empty-file", "Die Beispieldatei ist leer.");
  }
  return readText(decodeText(input.sample), input.settings, {});
}

function validateSettings(settings: GenericProfileSettings | undefined): Read | null {
  if (typeof settings !== "object" || settings === null) return failure("invalid-profile", "Die Einstellungen fehlen.");
  if (!(GENERIC_SEPARATORS as readonly string[]).includes(settings.separator)) {
    return failure("invalid-profile", "Bitte ein Trennzeichen wählen.");
  }
  if (!(GENERIC_DATE_FORMATS as readonly string[]).includes(settings.dateFormat)) {
    return failure("invalid-profile", "Bitte ein Datumsformat wählen.");
  }
  if (!(GENERIC_DECIMAL_SEPARATORS as readonly string[]).includes(settings.decimalSeparator)) {
    return failure("invalid-profile", "Bitte ein Dezimaltrennzeichen wählen.");
  }
  if (!Number.isInteger(settings.skipLines) || settings.skipLines < 0 || settings.skipLines > MAX_SKIP_LINES) {
    return failure("invalid-profile", `Die Anzahl der zu überspringenden Zeilen muss zwischen 0 und ${MAX_SKIP_LINES} liegen.`);
  }
  const columns = settings.columns ?? ({} as GenericColumnMapping);
  for (const key of Object.keys(COLUMN_LABELS) as (keyof GenericColumnMapping)[]) {
    const value = columns[key] ?? null;
    const required = (REQUIRED_COLUMNS as readonly string[]).includes(key);
    if (value === null) {
      if (required) return failure("column-missing", `Bitte eine Spalte für „${COLUMN_LABELS[key]}“ wählen.`);
    } else if (!Number.isInteger(value) || value < 0) {
      return failure("invalid-profile", `Die Spalte für „${COLUMN_LABELS[key]}“ ist ungültig.`);
    }
  }
  const used = Object.values(columns).filter((v): v is number => v !== null);
  if (new Set(used).size !== used.length) {
    return failure("column-twice", "Jede Spalte kann nur einem Feld zugeordnet werden.");
  }
  return null;
}

function readText(
  text: string,
  settings: GenericProfileSettings,
  options: { columnCount?: number; limit?: number },
): Read {
  const lines = splitLines(text);
  if (lines.length <= settings.skipLines) {
    return failure("no-transactions", "Nach den übersprungenen Zeilen enthält die Datei keine Umsätze.");
  }
  const rows = parseCsv(lines.slice(settings.skipLines).join("\n"), settings.separator);
  if (!rows) return failure("csv-unreadable", "Die Datei ist kein gültiges CSV (ein Anführungszeichen wird nicht geschlossen).");
  if (rows.length === 0) return failure("no-transactions", "Nach den übersprungenen Zeilen enthält die Datei keine Umsätze.");

  const columnCount = options.columnCount ?? rows[0]!.length;
  const columns = settings.columns;
  for (const key of Object.keys(COLUMN_LABELS) as (keyof GenericColumnMapping)[]) {
    const index = columns[key];
    if (index !== null && index >= columnCount) {
      return failure("column-missing", `Die Spalte ${index + 1} für „${COLUMN_LABELS[key]}“ gibt es in der Datei nicht.`);
    }
  }
  const headerCells = settings.skipLines > 0 ? parseCsv(lines[settings.skipLines - 1]!, settings.separator)?.[0] : undefined;
  const header = headerCells && headerCells.length === columnCount ? headerCells.map(normalizeHeader) : null;

  const transactions: ParsedTransaction[] = [];
  for (const [index, cells] of rows.slice(0, options.limit).entries()) {
    const line = settings.skipLines + index + 1;
    if (cells.length !== columnCount) {
      return failure("bad-row", `Zeile ${line} hat ${cells.length} statt ${columnCount} Spalten. Es wurde nichts importiert.`);
    }
    const get = (index: number | null) => (index === null ? "" : cells[index]!.trim());
    const bookingDate = toIsoDate(get(columns.bookingDate), settings.dateFormat);
    if (!bookingDate) {
      return failure(
        "bad-row",
        `Zeile ${line}: „${get(columns.bookingDate)}“ ist kein Datum im Format ${settings.dateFormat}. Es wurde nichts importiert.`,
      );
    }
    const amountCents = toCents(get(columns.amount), settings.decimalSeparator);
    if (amountCents === null) {
      return failure("bad-row", `Zeile ${line}: „${get(columns.amount)}“ ist kein gültiger Betrag. Es wurde nichts importiert.`);
    }
    const iban = get(columns.counterpartyIban).replace(/\s+/g, "").toUpperCase();
    transactions.push({
      bookingDate,
      amountCents,
      counterpartyName: get(columns.counterpartyName),
      counterpartyIban: iban === "" ? null : iban,
      paymentReference: get(columns.paymentReference),
      purpose: get(columns.purpose),
      origin: { category: null, type: null, transactionId: null, feeCents: null, taxCents: null, securityName: null, isin: null },
    });
  }
  return { ok: true, transactions, columnCount, header };
}

function toIsoDate(raw: string, format: GenericProfileSettings["dateFormat"]): string | null {
  const pad = (n: string) => n.padStart(2, "0");
  let iso: string | null = null;
  if (format === "YYYY-MM-DD") iso = raw;
  else {
    const separator = format === "DD.MM.YYYY" ? "." : "/";
    const parts = raw.split(separator);
    if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p)) && parts[2]!.length === 4) {
      const [a, b, year] = parts as [string, string, string];
      iso = format === "MM/DD/YYYY" ? `${year}-${pad(a)}-${pad(b)}` : `${year}-${pad(b)}-${pad(a)}`;
    }
  }
  return iso !== null && isIsoDate(iso) ? iso : null;
}

/** "-1.234,56" with decimal comma, or "-1,234.56" with decimal point; grouping is optional. */
function toCents(raw: string, decimal: GenericProfileSettings["decimalSeparator"]): number | null {
  const compact = raw.replace(/[\s ]/g, "");
  const group = decimal === "," ? "\\." : ",";
  const point = decimal === "," ? "," : "\\.";
  const match = new RegExp(`^([+-]?)(\\d{1,3}(?:${group}\\d{3})+|\\d+)(?:${point}(\\d+))?$`).exec(compact);
  if (!match) return null;
  const [, sign = "", whole = "", fraction] = match;
  return decimalToCents(`${sign}${whole.replace(/[.,]/g, "")}${fraction === undefined ? "" : `.${fraction}`}`);
}

function sameHeader(found: string[] | null, expected: string[] | null): boolean {
  if (expected === null) return true;
  return found !== null && found.length === expected.length && found.every((cell, i) => cell === expected[i]);
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase();
}

function failure(code: string, message: string): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code, message } };
}

function nextProfileId(profiles: GenericImportProfile[]): string {
  let max = 0;
  for (const p of profiles) {
    const n = Number(p.id.slice(2));
    if (p.id.startsWith("ip") && Number.isFinite(n) && n > max) max = n;
  }
  return `ip${max + 1}`;
}
