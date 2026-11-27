import { fail as failure } from "../result";
import { decimalToCents, firstLine, isIsoDate, normalizeHeader, parseCsv } from "./csv";
import type { ImportProfile, ParsedTransaction, ParseResult } from "./profile";

/**
 * Trade Republic's transaction export (available since about April 2026): comma-separated,
 * one header row, every field quoted, ISO dates, decimal point, signed amounts with six decimals.
 * `amount` is gross; `tax` is the tax withheld on it (ADR 0004). The column list is checked
 * against a real export, and any change to it fails the file loudly instead of being guessed at.
 */
const COLUMNS = [
  "datetime",
  "date",
  "account_type",
  "category",
  "type",
  "asset_class",
  "name",
  "symbol",
  "shares",
  "price",
  "amount",
  "fee",
  "tax",
  "currency",
  "original_amount",
  "original_currency",
  "fx_rate",
  "description",
  "transaction_id",
  "counterparty_name",
  "counterparty_iban",
  "payment_reference",
  "mcc_code",
] as const;

type Column = (typeof COLUMNS)[number];

/** Columns that only Trade Republic's export has together; enough to recognize it. */
const SIGNATURE: Column[] = ["datetime", "date", "category", "type", "amount", "transaction_id"];

export const tradeRepublicProfile: ImportProfile = {
  id: "trade-republic",
  label: "Trade Republic",
  matchesInstitution: (name) => /trade\s*republic/i.test(name),
  detect: (text) => {
    const header = parseCsv(firstLine(text), ",")?.[0]?.map(normalizeHeader) ?? [];
    return SIGNATURE.every((column) => header.includes(column));
  },
  parse,
};

function parse(text: string): ParseResult {
  const rows = parseCsv(text, ",");
  if (!rows) return failure("csv-unreadable", "Die Datei ist kein gültiges CSV (ein Anführungszeichen wird nicht geschlossen).");
  const [header = [], ...data] = rows;
  const columns = header.map(normalizeHeader);
  const unexpected = columns.filter((c) => !(COLUMNS as readonly string[]).includes(c));
  const missing = COLUMNS.filter((c) => !columns.includes(c));
  if (unexpected.length > 0 || missing.length > 0) {
    const parts = [
      unexpected.length > 0 ? `unbekannte Spalten: ${unexpected.join(", ")}` : "",
      missing.length > 0 ? `fehlende Spalten: ${missing.join(", ")}` : "",
    ].filter(Boolean);
    return failure(
      "unexpected-columns",
      `Das Trade-Republic-Format hat sich geändert (${parts.join("; ")}). Es wurde nichts importiert.`,
    );
  }
  if (data.length === 0) return failure("no-transactions", "Die Datei enthält keine Umsätze.");

  const transactions: ParsedTransaction[] = [];
  for (const [index, cells] of data.entries()) {
    const line = index + 2;
    if (cells.length !== columns.length) {
      return failure("bad-row", `Zeile ${line} hat ${cells.length} statt ${columns.length} Spalten. Es wurde nichts importiert.`);
    }
    const get = (column: Column) => cells[columns.indexOf(column)]!.trim();
    const date = get("date");
    if (!isIsoDate(date)) {
      return failure("bad-row", `Zeile ${line}: „${date}“ ist kein gültiges Datum. Es wurde nichts importiert.`);
    }
    const amountCents = decimalToCents(get("amount"));
    if (amountCents === null) {
      return failure("bad-row", `Zeile ${line}: „${get("amount")}“ ist kein gültiger Betrag. Es wurde nichts importiert.`);
    }
    if (get("currency") !== "EUR") {
      return failure(
        "unsupported-currency",
        `Zeile ${line}: Nur Euro wird unterstützt, nicht „${get("currency")}“. Es wurde nichts importiert.`,
      );
    }
    const optionalCents = (column: Column) => (get(column) === "" ? null : decimalToCents(get(column)));
    const feeCents = optionalCents("fee");
    const taxCents = optionalCents("tax");
    if ((get("fee") !== "" && feeCents === null) || (get("tax") !== "" && taxCents === null)) {
      return failure("bad-row", `Zeile ${line}: Gebühr oder Steuer ist kein gültiger Betrag. Es wurde nichts importiert.`);
    }
    const iban = get("counterparty_iban").replace(/\s+/g, "").toUpperCase();
    // A card payment leaves the counterparty columns empty and names the merchant in `name`,
    // which on other rows is the security's name.
    const isCard = get("type").replace(/_CANCELLED$/, "") === "CARD_TRANSACTION";
    transactions.push({
      date: date,
      amountCents,
      counterpartyName: get("counterparty_name") || (isCard ? get("name") : ""),
      counterpartyIban: iban === "" ? null : iban,
      paymentReference: get("payment_reference"),
      purpose: get("description") || get("name"),
      origin: {
        category: get("category") || null,
        type: get("type") || null,
        transactionId: get("transaction_id") || null,
        feeCents,
        taxCents,
        securityName: (!isCard && get("name")) || null,
        isin: get("symbol") || null,
        rawText: null,
        valueDate: null,
      },
    });
  }
  return { ok: true, transactions };
}


