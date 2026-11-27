import { isIsoDate, parseCsv } from "./csv";
import type { ImportProfile, ParsedTransaction, ParseResult } from "./profile";

/**
 * Raiffeisen Austria "Mein ELBA" transaction export: no header row, semicolon-separated,
 * UTF-8 with BOM. Columns: Buchungsdatum; Buchungstext; Valutadatum; Betrag; Währung; Zeitstempel.
 * The layout comes from open-source importers, not from Raiffeisen, and has not been checked
 * against a real export yet (decimal format, sign convention, date format), so every field is
 * validated and anything unexpected fails the whole file.
 */
const COLUMN_COUNT = 6;

export const elbaProfile: ImportProfile = {
  id: "elba",
  label: "Raiffeisen ELBA",
  matchesInstitution: (name) => /raiffeisen|elba/i.test(name),
  detect: (text) => {
    const first = parseCsv(firstLine(text), ";")?.[0];
    if (!first || !hasElbaShape(first)) return false;
    return toIsoDate(first[0]!) !== null && germanDecimalToCents(first[3]!) !== null;
  },
  parse,
};

function parse(text: string): ParseResult {
  const rows = parseCsv(text, ";");
  if (!rows) return failure("csv-unreadable", "Die Datei ist kein gültiges CSV (ein Anführungszeichen wird nicht geschlossen).");
  if (rows.length === 0) return failure("no-transactions", "Die Datei enthält keine Umsätze.");

  const transactions: ParsedTransaction[] = [];
  for (const [index, row] of rows.entries()) {
    const line = index + 1;
    if (!hasElbaShape(row)) {
      return failure("bad-row", `Zeile ${line} hat ${row.length} statt ${COLUMN_COUNT} Spalten. Es wurde nichts importiert.`);
    }
    const [rawDate, rawText, rawValueDate, rawAmount, currency] = row.map((cell) => cell.trim()) as [
      string,
      string,
      string,
      string,
      string,
    ];
    const date = toIsoDate(rawDate);
    if (date === null) {
      return failure("bad-row", `Zeile ${line}: „${rawDate}“ ist kein gültiges Datum. Es wurde nichts importiert.`);
    }
    const valueDate = rawValueDate === "" ? null : toIsoDate(rawValueDate);
    if (rawValueDate !== "" && valueDate === null) {
      return failure("bad-row", `Zeile ${line}: „${rawValueDate}“ ist kein gültiges Valutadatum. Es wurde nichts importiert.`);
    }
    const amountCents = germanDecimalToCents(rawAmount);
    if (amountCents === null) {
      return failure("bad-row", `Zeile ${line}: „${rawAmount}“ ist kein gültiger Betrag. Es wurde nichts importiert.`);
    }
    if (currency !== "EUR") {
      return failure(
        "unsupported-currency",
        `Zeile ${line}: Nur Euro wird unterstützt, nicht „${currency}“. Es wurde nichts importiert.`,
      );
    }
    const fields = splitRawText(rawText);
    // The counterparty is the payee of an outflow and the payer of an inflow; if the text
    // only names the other side, that one is used.
    const [preferred, other] = amountCents < 0 ? [fields.payee, fields.payer] : [fields.payer, fields.payee];
    const counterparty = preferred.name || preferred.iban ? preferred : other;
    transactions.push({
      date,
      amountCents,
      counterpartyName: counterparty.name,
      counterpartyIban: counterparty.iban === "" ? null : counterparty.iban.replace(/\s+/g, "").toUpperCase(),
      paymentReference: fields.paymentReference,
      purpose: fields.purpose,
      origin: {
        category: null,
        type: null,
        transactionId: null,
        feeCents: null,
        taxCents: null,
        securityName: null,
        isin: null,
        rawText,
        valueDate,
      },
    });
  }
  return { ok: true, transactions };
}

/**
 * Keys ELBA packs into the Buchungstext as "Key: value". There is no official list; these come
 * from open-source importers. Only "Key:" preceded by whitespace (or at the start) counts, and
 * the longest key wins, so "IBAN Auftraggeber:" is not read as "Auftraggeber:".
 */
const BOOKING_TEXT_KEYS = [
  "Verwendungszweck",
  "Zahlungsreferenz",
  "Auftraggeberreferenz",
  "Mandat",
  "Mandatsreferenz",
  "Creditor-ID",
  "Creditor ID",
  "IBAN Auftraggeber",
  "BIC Auftraggeber",
  "Auftraggeber",
  "Zahlungspflichtiger",
  "IBAN Empfänger",
  "BIC Empfänger",
  "Empfänger",
  "Empfänger-Kennung",
  "Zahlungsempfänger",
  "IBAN Zahlungsempfänger",
  "BIC Zahlungsempfänger",
  "IBAN Zahlungspflichtiger",
  "BIC Zahlungspflichtiger",
  "Kartenzahlung mit Kartenfolge-Nr.",
  "Bezahlung Karte mit Kartenfolge-Nr.",
  "Kartenfolge-Nr.",
  "Bankomat",
  "Terminal",
  "Originalbetrag",
  "Wechselkurs",
  "Buchungsreferenz",
] as const;

const KEY_PATTERN = new RegExp(
  `(?<=^|\\s)(${[...BOOKING_TEXT_KEYS]
    .sort((a, b) => b.length - a.length)
    .map((key) => key.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&"))
    .join("|")}):`,
  "g",
);

type Party = { name: string; iban: string };

/** The fields a Transaction needs, read from the packed Buchungstext. Missing keys give "". */
function splitRawText(text: string): {
  purpose: string;
  paymentReference: string;
  payer: Party;
  payee: Party;
} {
  const values = new Map<string, string>();
  const matches = [...text.matchAll(KEY_PATTERN)];
  const leading = (matches.length === 0 ? text : text.slice(0, matches[0]!.index)).trim();
  matches.forEach((match, i) => {
    const end = i + 1 < matches.length ? matches[i + 1]!.index : text.length;
    const value = text.slice(match.index + match[0].length, end).trim();
    if (!values.has(match[1]!)) values.set(match[1]!, value);
  });
  const get = (...keys: string[]) => keys.map((k) => values.get(k) ?? "").find((v) => v !== "") ?? "";
  return {
    purpose: get("Verwendungszweck") || leading,
    paymentReference: get("Zahlungsreferenz"),
    payer: {
      name: get("Auftraggeber", "Zahlungspflichtiger"),
      iban: get("IBAN Auftraggeber", "IBAN Zahlungspflichtiger"),
    },
    payee: {
      name: get("Empfänger", "Zahlungsempfänger"),
      iban: get("IBAN Empfänger", "IBAN Zahlungsempfänger"),
    },
  };
}

/** Six fields; a seventh, empty one (a trailing semicolon) is tolerated. */
function hasElbaShape(row: string[]): boolean {
  return row.length === COLUMN_COUNT || (row.length === COLUMN_COUNT + 1 && row[COLUMN_COUNT]!.trim() === "");
}

/** "31.10.2026" → "2026-10-31"; an ISO date is accepted as is; anything else is null. */
function toIsoDate(raw: string): string | null {
  const german = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw.trim());
  const iso = german ? `${german[3]}-${german[2]}-${german[1]}` : raw.trim();
  return isIsoDate(iso) ? iso : null;
}

/**
 * German number format: "-1.234,56", "+3.250,00", "-7,9", "12". Thousands separators must
 * group by three. A bare "1.234" is ambiguous (decimal point or thousands?) and is rejected.
 */
function germanDecimalToCents(raw: string): number | null {
  const match = /^([+-]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/.exec(raw.trim().replace(/\s+/g, ""));
  if (!match) return null;
  const [, sign, whole, fraction] = match;
  if (fraction === undefined && whole!.includes(".")) return null;
  const digits = ((fraction ?? "") + "000").slice(0, 3);
  let cents = Number(whole!.replace(/\./g, "")) * 100 + Number(digits.slice(0, 2));
  if (Number(digits[2]) >= 5) cents += 1;
  return sign === "-" && cents !== 0 ? -cents : cents;
}

function failure(code: string, message: string): ParseResult {
  return { ok: false, error: { code, message } };
}

function firstLine(text: string): string {
  const end = text.search(/\r?\n/);
  return end === -1 ? text : text.slice(0, end);
}
