import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  confirmImport,
  createAccount,
  createEmptyDocument,
  createInstitution,
  listImports,
  previewImport,
  searchTransactions,
  undoImport,
  type Result,
  type WealthDocument,
} from "./index";

const FIXTURES = join(import.meta.dirname, "import", "fixtures");
const fixture = (name: string): Uint8Array => readFileSync(join(FIXTURES, name));
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

const AVAILABLE_CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;

/** A Trade Republic Institution with one Account, plus an unrelated bank. */
function withTradeRepublicAccount(): { document: WealthDocument; accountId: string } {
  let document = createEmptyDocument();
  const tr = must(createInstitution(document, { name: "Trade Republic" }));
  document = tr.document;
  const bank = must(createInstitution(document, { name: "Raiffeisen" }));
  document = bank.document;
  document = must(createAccount(document, { institutionId: bank.id, name: "Girokonto", defaultClassification: AVAILABLE_CASH })).document;
  const account = must(
    createAccount(document, { institutionId: tr.id, name: "Verrechnungskonto", defaultClassification: AVAILABLE_CASH }),
  );
  return { document: account.document, accountId: account.id };
}

const IMPORTED_AT = "2026-11-26T10:00:00.000Z";

function importFile(document: WealthDocument, name: string, bytes: Uint8Array, accountId: string) {
  return must(confirmImport(document, { importedAt: IMPORTED_AT, files: [{ name, bytes, accountId }] }));
}

const HEADER =
  "datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,original_amount,original_currency,fx_rate,description,transaction_id,counterparty_name,counterparty_iban,payment_reference,mcc_code";

/** One Trade Republic CSV row from the fields that matter in a test. */
function trRow(fields: { date: string; amount: string; type?: string; description?: string; counterparty?: string }): string {
  const { date, amount, type = "CARD_TRANSACTION", description = "Kartenzahlung", counterparty = "" } = fields;
  return `${date}T10:00:00Z,${date},DEFAULT,CASH,${type},,,,,,${amount},,,EUR,,,,${description},id-${date}-${amount},${counterparty},,,`;
}

describe("import preview", () => {
  it("recognizes a Trade Republic export and suggests the only Trade Republic Account", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const { files } = must(previewImport(document, { files: [{ name: "tr.csv", bytes: fixture("trade-republic-basic.csv") }] }));
    expect(files).toEqual([
      {
        name: "tr.csv",
        ok: true,
        profile: { id: "trade-republic", label: "Trade Republic" },
        suggestedAccountId: accountId,
        dateRange: { from: "2026-04-01", to: "2026-05-20" },
        newCount: 6,
        duplicateCount: 0,
      },
    ]);
  });
});

describe("confirming an import", () => {
  it("stores the Transactions with signed amounts rounded to cents and the bank's own fields", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const { document: next, files } = importFile(document, "tr.csv", fixture("trade-republic-basic.csv"), accountId);
    expect(files).toEqual([{ name: "tr.csv", importId: expect.any(String), newCount: 6, duplicateCount: 0 }]);

    const found = searchTransactions(next);
    expect(found.map((t) => [t.bookingDate, t.amountCents, t.origin.type])).toEqual([
      ["2026-05-20", -20000, "TRANSFER_OUTBOUND"],
      ["2026-05-15", 1240, "DISTRIBUTION"],
      ["2026-05-03", -2346, "CARD_TRANSACTION"],
      ["2026-04-30", 123, "INTEREST_PAYMENT"],
      ["2026-04-02", -50000, "BUY"],
      ["2026-04-01", 100000, "CUSTOMER_INBOUND"],
    ]);
    expect(found[0]).toEqual({
      id: expect.any(String),
      accountId,
      importId: files[0]!.importId,
      bookingDate: "2026-05-20",
      amountCents: -20000,
      counterpartyName: "Max Mustermann",
      counterpartyIban: "AT611904300234573201",
      paymentReference: "Miete Mai",
      purpose: "Überweisung",
      origin: {
        category: "CASH",
        type: "TRANSFER_OUTBOUND",
        transactionId: "3f2a1c00-0006-4000-8000-000000000006",
        feeCents: null,
        taxCents: null,
        securityName: null,
        isin: null,
        bookingText: null,
        valueDate: null,
      },
    });
    expect(found.find((t) => t.origin.type === "BUY")!.origin).toMatchObject({
      category: "TRADING",
      feeCents: -100,
      securityName: "iShares Core MSCI World USD (Acc)",
      isin: "IE00B4L5Y983",
    });
  });

  it("lists the import with its file, Account and counts", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const { document: next } = importFile(document, "tr.csv", fixture("trade-republic-basic.csv"), accountId);
    expect(listImports(next)).toEqual([
      {
        id: expect.any(String),
        fileName: "tr.csv",
        profileId: "trade-republic",
        accountId,
        importedAt: IMPORTED_AT,
        transactionCount: 6,
        duplicateCount: 0,
      },
    ]);
  });

  it("changes nothing but the Transactions, imports and the remembered Account per file name", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const { document: next } = importFile(document, "tr.csv", fixture("trade-republic-basic.csv"), accountId);
    const { transactions: _t, imports: _i, importAccountChoices: _c, ...rest } = next;
    const { transactions: _t0, imports: _i0, importAccountChoices: _c0, ...before } = document;
    expect(rest).toEqual(before);
  });

  it("reads unquoted fields, quoted separators and CRLF line ends", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const crlf = new TextDecoder().decode(fixture("trade-republic-unquoted.csv")).replace(/\n/g, "\r\n");
    const { document: next } = importFile(document, "tr.csv", utf8(crlf), accountId);
    expect(searchTransactions(next).map((t) => [t.purpose, t.amountCents, t.origin.type])).toEqual([
      ["Storno Einzahlung", -5000, "CUSTOMER_INPAYMENT_CANCELLED"],
      ["Einzahlung, Juni", 5000, "CUSTOMER_INPAYMENT"],
    ]);
  });

  it("reads a file with a byte order mark", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const text = `﻿${HEADER}\n${trRow({ date: "2026-07-01", amount: "-4.50", description: "Bäckerei" })}\n`;
    const { document: next } = importFile(document, "tr.csv", utf8(text), accountId);
    expect(searchTransactions(next).map((t) => t.purpose)).toEqual(["Bäckerei"]);
  });

  it("falls back to Windows-1252 when the file is not valid UTF-8", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const text = `${HEADER}\n${trRow({ date: "2026-07-01", amount: "-4.50", description: "Bäckerei Müller", counterparty: "BÄCKEREI" })}\n`;
    const windows1252 = Uint8Array.from(text, (c) => c.charCodeAt(0));
    const { document: next } = importFile(document, "tr.csv", windows1252, accountId);
    expect(searchTransactions(next).map((t) => [t.purpose, t.counterpartyName])).toEqual([["Bäckerei Müller", "BÄCKEREI"]]);
  });

  it("rejects an unknown Account", () => {
    const { document } = withTradeRepublicAccount();
    const result = confirmImport(document, {
      importedAt: IMPORTED_AT,
      files: [{ name: "tr.csv", bytes: fixture("trade-republic-basic.csv"), accountId: "a99" }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("duplicates", () => {
  it("re-importing the same file counts every row as a duplicate and stores nothing", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const once = importFile(document, "tr.csv", fixture("trade-republic-basic.csv"), accountId).document;

    const { files: preview } = must(previewImport(once, { files: [{ name: "tr.csv", bytes: fixture("trade-republic-basic.csv") }] }));
    expect(preview[0]).toMatchObject({ ok: true, newCount: 0, duplicateCount: 6 });

    const twice = importFile(once, "tr.csv", fixture("trade-republic-basic.csv"), accountId);
    expect(twice.files).toEqual([{ name: "tr.csv", importId: null, newCount: 0, duplicateCount: 6 }]);
    expect(searchTransactions(twice.document)).toHaveLength(6);
    expect(listImports(twice.document)).toHaveLength(1);
  });

  it("an overlapping export only adds the rows not yet present; text is compared ignoring case and spacing", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const first = `${HEADER}\n${trRow({ date: "2026-07-01", amount: "-4.50", description: "Bäckerei  Müller" })}\n`;
    const second =
      `${HEADER}\n${trRow({ date: "2026-07-01", amount: "-4.50", description: "BÄCKEREI MÜLLER" })}\n` +
      `${trRow({ date: "2026-07-02", amount: "-4.50", description: "Bäckerei Müller" })}\n`;
    const once = importFile(document, "a.csv", utf8(first), accountId).document;
    const { files } = importFile(once, "b.csv", utf8(second), accountId);
    expect(files[0]).toMatchObject({ newCount: 1, duplicateCount: 1 });
  });

  it("two identical rows in one file are both kept, and both skipped on re-import", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const row = trRow({ date: "2026-07-01", amount: "-4.50", description: "Kaffee" });
    const text = `${HEADER}\n${row}\n${row}\n`;
    const once = importFile(document, "a.csv", utf8(text), accountId);
    expect(once.files[0]).toMatchObject({ newCount: 2, duplicateCount: 0 });
    expect(importFile(once.document, "a.csv", utf8(text), accountId).files[0]).toMatchObject({ newCount: 0, duplicateCount: 2 });
  });

  it("the same row on another Account is not a duplicate", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const other = document.accounts.find((a) => a.id !== accountId)!.id;
    const once = importFile(document, "tr.csv", fixture("trade-republic-basic.csv"), accountId).document;
    expect(importFile(once, "tr.csv", fixture("trade-republic-basic.csv"), other).files[0]).toMatchObject({ newCount: 6 });
  });
});

describe("undoing an import", () => {
  it("removes exactly that import's Transactions", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const first = importFile(document, "a.csv", fixture("trade-republic-basic.csv"), accountId);
    const second = importFile(first.document, "b.csv", fixture("trade-republic-unquoted.csv"), accountId);
    const { document: undone } = must(undoImport(second.document, { importId: first.files[0]!.importId! }));
    expect(searchTransactions(undone).map((t) => t.purpose)).toEqual(["Storno Einzahlung", "Einzahlung, Juni"]);
    expect(listImports(undone).map((i) => i.fileName)).toEqual(["b.csv"]);
  });

  it("after undo the file imports as new again", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const first = importFile(document, "a.csv", fixture("trade-republic-basic.csv"), accountId);
    const { document: undone } = must(undoImport(first.document, { importId: first.files[0]!.importId! }));
    expect(importFile(undone, "a.csv", fixture("trade-republic-basic.csv"), accountId).files[0]).toMatchObject({ newCount: 6 });
  });

  it("rejects an unknown import", () => {
    const { document } = withTradeRepublicAccount();
    expect(undoImport(document, { importId: "imp9" }).ok).toBe(false);
  });
});

describe("unreadable files", () => {
  function previewOf(text: string | Uint8Array) {
    const { document } = withTradeRepublicAccount();
    const bytes = typeof text === "string" ? utf8(text) : text;
    return must(previewImport(document, { files: [{ name: "x.csv", bytes }] })).files[0]!;
  }

  function errorOf(text: string | Uint8Array): string {
    const preview = previewOf(text);
    if (preview.ok) throw new Error("expected the file to be rejected");
    return preview.error.code;
  }

  it("an unknown format is rejected with a German message", () => {
    expect(previewOf("Datum;Betrag\n01.07.2026;-4,50\n")).toEqual({
      name: "x.csv",
      ok: false,
      error: { code: "unknown-format", message: "Das Format dieser Datei wurde nicht erkannt. Es wurde nichts importiert." },
    });
  });

  it("an empty file is rejected", () => {
    expect(errorOf(new Uint8Array())).toBe("empty-file");
  });

  it("a Trade Republic header with an extra or missing column fails loudly", () => {
    const row = trRow({ date: "2026-07-01", amount: "-4.50" });
    const preview = previewOf(`${HEADER},new_column\n${row},x\n`);
    expect(preview).toMatchObject({ ok: false, error: { code: "unexpected-columns" } });
    if (!preview.ok) expect(preview.error.message).toContain("new_column");
    expect(errorOf(`${HEADER.replace(",mcc_code", "")}\n${row.replace(/,$/, "")}\n`)).toBe("unexpected-columns");
  });

  it("a header without rows is rejected", () => {
    expect(errorOf(`${HEADER}\n`)).toBe("no-transactions");
  });

  it("a row with a bad date, a bad amount or the wrong number of fields fails the whole file", () => {
    const good = trRow({ date: "2026-07-01", amount: "-4.50" });
    expect(errorOf(`${HEADER}\n${good}\n${trRow({ date: "2026-02-30", amount: "-4.50" })}\n`)).toBe("bad-row");
    expect(errorOf(`${HEADER}\n${good}\n${trRow({ date: "2026-07-02", amount: "-4,50" })}\n`)).toBe("bad-row");
    expect(errorOf(`${HEADER}\n${good}\n${good},extra\n`)).toBe("bad-row");
  });

  it("a non-EUR row fails the file", () => {
    const row = trRow({ date: "2026-07-01", amount: "-4.50" }).replace(",EUR,", ",USD,");
    expect(errorOf(`${HEADER}\n${row}\n`)).toBe("unsupported-currency");
  });

  it("one unreadable file does not affect the preview of the others", () => {
    const { document } = withTradeRepublicAccount();
    const { files } = must(
      previewImport(document, {
        files: [
          { name: "bad.csv", bytes: utf8("foo\n") },
          { name: "tr.csv", bytes: fixture("trade-republic-basic.csv") },
        ],
      }),
    );
    expect(files.map((f) => f.ok)).toEqual([false, true]);
  });

  it("confirming an unreadable file imports nothing", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const result = confirmImport(document, {
      importedAt: IMPORTED_AT,
      files: [
        { name: "tr.csv", bytes: fixture("trade-republic-basic.csv"), accountId },
        { name: "bad.csv", bytes: utf8("foo\n"), accountId },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe("suggested Account", () => {
  it("no Account is suggested when several Accounts match", () => {
    let { document } = withTradeRepublicAccount();
    const tr = document.institutions.find((i) => i.name === "Trade Republic")!;
    document = must(createAccount(document, { institutionId: tr.id, name: "Depot", defaultClassification: AVAILABLE_CASH })).document;
    const { files } = must(previewImport(document, { files: [{ name: "tr.csv", bytes: fixture("trade-republic-basic.csv") }] }));
    expect(files[0]).toMatchObject({ ok: true, suggestedAccountId: null, newCount: 6, duplicateCount: 0 });
  });

  it("an Account chosen for the preview is used for the duplicate count", () => {
    const { document, accountId } = withTradeRepublicAccount();
    const other = document.accounts.find((a) => a.id !== accountId)!.id;
    const once = importFile(document, "tr.csv", fixture("trade-republic-basic.csv"), other).document;
    const { files } = must(
      previewImport(once, { files: [{ name: "tr.csv", bytes: fixture("trade-republic-basic.csv"), accountId: other }] }),
    );
    expect(files[0]).toMatchObject({ ok: true, suggestedAccountId: other, duplicateCount: 6 });
  });
});

describe("transaction search", () => {
  function imported() {
    const { document, accountId } = withTradeRepublicAccount();
    const other = document.accounts.find((a) => a.id !== accountId)!.id;
    let next = importFile(document, "tr.csv", fixture("trade-republic-basic.csv"), accountId).document;
    next = importFile(next, "u.csv", fixture("trade-republic-unquoted.csv"), other).document;
    return { document: next, accountId, other };
  }

  it("filters by Account", () => {
    const { document, other } = imported();
    expect(searchTransactions(document, { accountId: other }).map((t) => t.bookingDate)).toEqual(["2026-06-02", "2026-06-01"]);
  });

  it("filters by an inclusive date range", () => {
    const { document } = imported();
    expect(searchTransactions(document, { from: "2026-05-03", to: "2026-05-20" }).map((t) => t.bookingDate)).toEqual([
      "2026-05-20",
      "2026-05-15",
      "2026-05-03",
    ]);
  });

  it("finds text in counterparty, purpose, reference and IBAN, ignoring case", () => {
    const { document } = imported();
    const purposes = (text: string) => searchTransactions(document, { text }).map((t) => t.purpose);
    expect(purposes("billa")).toEqual(["Kartenzahlung Billa"]);
    expect(purposes("miete mai")).toEqual(["Überweisung"]);
    expect(purposes("AT6119")).toEqual(["Überweisung"]);
    expect(purposes("mustermann einzahlung")).toEqual(["Storno Einzahlung", "Einzahlung, Juni", "Einzahlung"]);
  });
});
