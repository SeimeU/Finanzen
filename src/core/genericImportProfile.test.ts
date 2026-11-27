import { describe, expect, it } from "vitest";
import {
  confirmImport,
  createAccount,
  createEmptyDocument,
  createInstitution,
  previewImport,
  previewImportProfile,
  saveImportProfile,
  searchTransactions,
  type GenericProfileSettings,
  type Result,
  type WealthDocument,
} from "./index";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;

/** A bank without a built-in Import profile, with two Accounts so nothing is suggested by Institution. */
function withTwoAccounts(): { document: WealthDocument; giro: string; savings: string } {
  let document = createEmptyDocument();
  const bank = must(createInstitution(document, { name: "Erste Bank" }));
  document = bank.document;
  const giro = must(createAccount(document, { institutionId: bank.id, name: "Giro", defaultClassification: CASH }));
  const savings = must(createAccount(giro.document, { institutionId: bank.id, name: "Sparen", defaultClassification: CASH }));
  return { document: savings.document, giro: giro.id, savings: savings.id };
}

const IMPORTED_AT = "2026-11-26T10:00:00.000Z";

/** Semicolon, decimal comma with thousands points, DD.MM.YYYY, two lines before the header. */
const SEMICOLON_CSV = [
  "Kontoauszug Erste Bank",
  "Datum;Betrag;Empfänger;Verwendungszweck;IBAN;Referenz",
  '03.05.2026;-1.234,56;Hausverwaltung;"Miete; Mai";AT61 1904 3002 3457 3201;RF18',
  "15.05.2026;2.500,00;Arbeitgeber GmbH;Gehalt;;",
].join("\r\n");

const SEMICOLON_SETTINGS: GenericProfileSettings = {
  separator: ";",
  skipLines: 2,
  dateFormat: "DD.MM.YYYY",
  decimalSeparator: ",",
  columns: { bookingDate: 0, amount: 1, counterpartyName: 2, purpose: 3, counterpartyIban: 4, paymentReference: 5 },
};

describe("generic Import profiles", () => {
  it("reads a semicolon file with decimal commas and DD.MM.YYYY dates once its profile is saved", () => {
    const { document, giro } = withTwoAccounts();
    const saved = must(saveImportProfile(document, { accountId: giro, settings: SEMICOLON_SETTINGS, sample: utf8(SEMICOLON_CSV) }));

    const later = SEMICOLON_CSV + "\r\n20.05.2026;-12,30;Billa;Einkauf;;";
    const { files } = must(previewImport(saved.document, { files: [{ name: "erste.csv", bytes: utf8(later) }] }));
    expect(files).toEqual([
      {
        name: "erste.csv",
        ok: true,
        profile: { id: expect.any(String), label: "Importprofil Erste Bank – Giro" },
        suggestedAccountId: giro,
        dateRange: { from: "2026-05-03", to: "2026-05-20" },
        newCount: 3,
        duplicateCount: 0,
      },
    ]);

    const imported = must(confirmImport(saved.document, { importedAt: IMPORTED_AT, files: [{ name: "erste.csv", bytes: utf8(later), accountId: giro }] }));
    const found = searchTransactions(imported.document);
    expect(found.map((t) => [t.bookingDate, t.amountCents, t.counterpartyName, t.purpose, t.counterpartyIban, t.paymentReference])).toEqual([
      ["2026-05-20", -1230, "Billa", "Einkauf", null, ""],
      ["2026-05-15", 250000, "Arbeitgeber GmbH", "Gehalt", null, ""],
      ["2026-05-03", -123456, "Hausverwaltung", "Miete; Mai", "AT611904300234573201", "RF18"],
    ]);
  });

  it("reads a headerless comma file with decimal points and ISO dates, recognized by its column count", () => {
    const { document, savings } = withTwoAccounts();
    const csv = '2026-06-01,"1,250.00",Zinsen Bank,Zinsgutschrift\n2026-06-02,-3.5,Shop,"Kauf, online"\n';
    const settings: GenericProfileSettings = {
      separator: ",",
      skipLines: 0,
      dateFormat: "YYYY-MM-DD",
      decimalSeparator: ".",
      columns: { bookingDate: 0, amount: 1, counterpartyName: 2, purpose: 3, counterpartyIban: null, paymentReference: null },
    };
    const saved = must(saveImportProfile(document, { accountId: savings, settings, sample: utf8(csv) }));
    const imported = must(confirmImport(saved.document, { importedAt: IMPORTED_AT, files: [{ name: "a.csv", bytes: utf8(csv), accountId: savings }] }));
    expect(searchTransactions(imported.document).map((t) => [t.bookingDate, t.amountCents, t.purpose])).toEqual([
      ["2026-06-02", -350, "Kauf, online"],
      ["2026-06-01", 125000, "Zinsgutschrift"],
    ]);

    const { files } = must(previewImport(saved.document, { files: [{ name: "b.csv", bytes: utf8("2026-06-03,1.00,X,Y,extra\n") }] }));
    expect(files[0]).toMatchObject({ ok: false, error: { code: "unknown-format" } });
  });

  it("does not claim a file whose header row differs from the sample's", () => {
    const { document, giro } = withTwoAccounts();
    const saved = must(saveImportProfile(document, { accountId: giro, settings: SEMICOLON_SETTINGS, sample: utf8(SEMICOLON_CSV) }));
    const other = SEMICOLON_CSV.replace("Datum;Betrag", "Buchungstag;Betrag");
    const { files } = must(previewImport(saved.document, { files: [{ name: "x.csv", bytes: utf8(other) }] }));
    expect(files[0]).toMatchObject({ ok: false, error: { code: "unknown-format" } });
  });

  it("rejects a later file of the same format as a whole when one row does not fit", () => {
    const { document, giro } = withTwoAccounts();
    const saved = must(saveImportProfile(document, { accountId: giro, settings: SEMICOLON_SETTINGS, sample: utf8(SEMICOLON_CSV) }));
    const broken = SEMICOLON_CSV + "\r\n2026-05-20;-12,30;Billa;Einkauf;;";
    const { files } = must(previewImport(saved.document, { files: [{ name: "x.csv", bytes: utf8(broken) }] }));
    expect(files[0]).toEqual({
      name: "x.csv",
      ok: false,
      error: { code: "bad-row", message: "Zeile 5: „2026-05-20“ ist kein Datum im Format DD.MM.YYYY. Es wurde nichts importiert." },
    });
  });

  it("keeps one Import profile per Account: saving again replaces it", () => {
    const { document, giro } = withTwoAccounts();
    const first = must(saveImportProfile(document, { accountId: giro, settings: SEMICOLON_SETTINGS, sample: utf8(SEMICOLON_CSV) }));
    const headerless = SEMICOLON_CSV.split("\r\n").slice(2).join("\n");
    const second = must(
      saveImportProfile(first.document, { accountId: giro, settings: { ...SEMICOLON_SETTINGS, skipLines: 0 }, sample: utf8(headerless) }),
    );
    expect(second.id).toBe(first.id);
    const preview = (text: string) => must(previewImport(second.document, { files: [{ name: "f.csv", bytes: utf8(text) }] })).files[0]!;
    expect(preview(headerless)).toMatchObject({ ok: true, suggestedAccountId: giro, newCount: 2 });
    expect(preview(SEMICOLON_CSV)).toMatchObject({ ok: false });
  });

  it.each([
    [{ columns: { ...SEMICOLON_SETTINGS.columns, purpose: null } }, "column-missing", "Bitte eine Spalte für „Verwendungszweck“ wählen."],
    [{ columns: { ...SEMICOLON_SETTINGS.columns, purpose: 2 } }, "column-twice", "Jede Spalte kann nur einem Feld zugeordnet werden."],
    [{ columns: { ...SEMICOLON_SETTINGS.columns, paymentReference: 9 } }, "column-missing", "Die Spalte 10 für „Zahlungsreferenz“ gibt es in der Datei nicht."],
    [{ skipLines: 1 }, "bad-row", "Zeile 2: „Datum“ ist kein Datum im Format DD.MM.YYYY. Es wurde nichts importiert."],
    [{ decimalSeparator: "." }, "bad-row", "Zeile 3: „-1.234,56“ ist kein gültiger Betrag. Es wurde nichts importiert."],
    [{ separator: "," }, "column-missing", "Die Spalte 3 für „Gegenüber“ gibt es in der Datei nicht."],
    [{ skipLines: -1 }, "invalid-profile", "Die Anzahl der zu überspringenden Zeilen muss zwischen 0 und 100 liegen."],
  ] as const)("refuses to save a profile the sample does not fit (%j)", (change, code, message) => {
    const { document, giro } = withTwoAccounts();
    const settings = { ...SEMICOLON_SETTINGS, ...change } as GenericProfileSettings;
    expect(saveImportProfile(document, { accountId: giro, settings, sample: utf8(SEMICOLON_CSV) })).toEqual({
      ok: false,
      error: { code, message },
    });
  });

  it("refuses a profile without an existing Account", () => {
    const { document } = withTwoAccounts();
    const result = saveImportProfile(document, { accountId: "a99", settings: SEMICOLON_SETTINGS, sample: utf8(SEMICOLON_CSV) });
    expect(result).toMatchObject({ ok: false, error: { code: "account-not-found" } });
  });
});

describe("previewing an Import profile while setting it up", () => {
  it("shows the file's first lines split into columns and the first parsed Transactions", () => {
    const preview = previewImportProfile({ settings: SEMICOLON_SETTINGS, sample: utf8(SEMICOLON_CSV) });
    expect(preview.lines[1]).toEqual(["Datum", "Betrag", "Empfänger", "Verwendungszweck", "IBAN", "Referenz"]);
    expect(preview.lines).toHaveLength(4);
    expect(preview.result).toMatchObject({ ok: true, transactionCount: 2 });
    if (!preview.result.ok) throw new Error();
    expect(preview.result.transactions[0]).toMatchObject({ bookingDate: "2026-05-03", amountCents: -123456, purpose: "Miete; Mai" });
  });

  it("explains what is wrong instead of rows when the settings do not fit yet", () => {
    const preview = previewImportProfile({ settings: { ...SEMICOLON_SETTINGS, skipLines: 0 }, sample: utf8(SEMICOLON_CSV) });
    expect(preview.lines).toHaveLength(4);
    expect(preview.result).toEqual({
      ok: false,
      error: { code: "column-missing", message: "Die Spalte 2 für „Betrag“ gibt es in der Datei nicht." },
    });
  });

  it("decodes a Windows-1252 sample", () => {
    const bytes = new Uint8Array([...utf8("01.02.2026;5,00;M"), 0xfc, ...utf8("ller;Gr"), 0xfc, ...utf8("n\n")]);
    const settings = { ...SEMICOLON_SETTINGS, skipLines: 0, columns: { ...SEMICOLON_SETTINGS.columns, counterpartyIban: null, paymentReference: null } };
    const preview = previewImportProfile({ settings, sample: bytes });
    expect(preview.result).toMatchObject({ ok: true, transactions: [{ counterpartyName: "Müller", purpose: "Grün", amountCents: 500 }] });
  });
});
