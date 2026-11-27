import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  confirmImport,
  createAccount,
  createEmptyDocument,
  createInstitution,
  previewImport,
  searchTransactions,
  undoImport,
  type Result,
  type WealthDocument,
} from "./index";

const FIXTURES = join(import.meta.dirname, "import", "fixtures");
const fixture = (name: string): Uint8Array => readFileSync(join(FIXTURES, name));
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const IMPORTED_AT = "2026-11-26T10:00:00.000Z";
const AVAILABLE_CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

/** A Raiffeisen Girokonto and a Trade Republic Verrechnungskonto. */
function withBothBanks(): { document: WealthDocument; elbaAccountId: string; trAccountId: string } {
  let document = createEmptyDocument();
  const rb = must(createInstitution(document, { name: "Raiffeisenbank Wien" }));
  const tr = must(createInstitution(rb.document, { name: "Trade Republic" }));
  const giro = must(createAccount(tr.document, { institutionId: rb.id, name: "Girokonto", defaultClassification: AVAILABLE_CASH }));
  const cash = must(
    createAccount(giro.document, { institutionId: tr.id, name: "Verrechnungskonto", defaultClassification: AVAILABLE_CASH }),
  );
  return { document: cash.document, elbaAccountId: giro.id, trAccountId: cash.id };
}

/** One ELBA row: Buchungsdatum;Buchungstext;Valutadatum;Betrag;Währung;Zeitstempel. */
function elbaRow(fields: { date?: string; text?: string; valueDate?: string; amount?: string; currency?: string }): string {
  const { date = "01.11.2026", text = "Kontoführung", valueDate = date, amount = "-7,90", currency = "EUR" } = fields;
  return `${date};${text};${valueDate};${amount};${currency};${date} 12:00:00:000`;
}

function importElba(document: WealthDocument, bytes: Uint8Array, accountId: string) {
  return must(confirmImport(document, { importedAt: IMPORTED_AT, files: [{ name: "elba.csv", bytes, accountId }] }));
}

function previewOf(text: string) {
  const { document } = withBothBanks();
  return must(previewImport(document, { files: [{ name: "elba.csv", bytes: utf8(text) }] })).files[0]!;
}

function errorOf(text: string): string {
  const preview = previewOf(text);
  if (preview.ok) throw new Error("expected the file to be rejected");
  return preview.error.code;
}

describe("ELBA import", () => {
  it("recognizes a headerless ELBA export and suggests the only Raiffeisen Account", () => {
    const { document, elbaAccountId } = withBothBanks();
    const { files } = must(previewImport(document, { files: [{ name: "elba.csv", bytes: fixture("elba-basic.csv") }] }));
    expect(files).toEqual([
      {
        name: "elba.csv",
        ok: true,
        profile: { id: "elba", label: "Raiffeisen ELBA" },
        suggestedAccountId: elbaAccountId,
        dateRange: { from: "2026-10-01", to: "2026-10-31" },
        newCount: 5,
        duplicateCount: 0,
      },
    ]);
  });
});

describe("ELBA Transactions", () => {
  it("reads German dates and signed amounts and splits the Buchungstext into fields", () => {
    const { document, elbaAccountId } = withBothBanks();
    const { document: next } = importElba(document, fixture("elba-basic.csv"), elbaAccountId);
    const found = searchTransactions(next);
    expect(
      found.map((t) => [t.date, t.amountCents, t.counterpartyName, t.counterpartyIban, t.paymentReference, t.purpose]),
    ).toEqual([
      ["2026-10-31", -790, "", null, "", "Kontoführung"],
      ["2026-10-15", -8410, "Wien Energie GmbH", "AT022011100000001234", "123456789", "Strom Oktober"],
      ["2026-10-05", -2346, "BILLA DANKT 1234 WIEN", null, "", "Bezahlung Karte"],
      ["2026-10-03", -85000, "Hausverwaltung Huber", "AT611904300234573201", "Miete Oktober", "Überweisung"],
      ["2026-10-01", 325000, "Muster GmbH", "AT483200000012345864", "LOHN-2026-10", "Gehalt Oktober 2026"],
    ]);
  });

  it("reads the real Girokonto export's shape: quoted Buchungstext, unsigned inflows, Zahlungsempfänger, standing orders, card payments", () => {
    const { document, elbaAccountId } = withBothBanks();
    const { document: next } = importElba(document, fixture("elba-girokonto.csv"), elbaAccountId);
    expect(
      searchTransactions(next).map((t) => [t.date, t.amountCents, t.counterpartyName, t.counterpartyIban, t.paymentReference, t.purpose]),
    ).toEqual([
      [
        "2026-11-08",
        -299,
        "BEISPIELSHOP.COM/BILL DUBLIN UNKNOWN",
        null,
        "ePAYMENT      2,99 IE  D1   07.11. 21:04",
        "BEISPIELSHOP.COM/BILL DUBLIN UNKNOWN",
      ],
      ["2026-11-07", 850, "", null, "Rückerstattung 4711", ""],
      ["2026-11-06", -10000, "", null, "SB-BEHEBUNG 00012345 K1   06.11. 10:15", ""],
      ["2026-11-05", -5000, "Erika Musterfrau", "AT483200000012345864", "Taschengeld", "Dauerauftrag vom 05.11"],
      ["2026-11-04", -2999, "Zahldienst Europe GmbH", "DE89370400440532013000", "", "1000012345678 Beispielshop"],
      ["2026-11-03", -4567, "Muster Versicherung Aktiengesellschaft", "AT611904300234573201", "", "Polizze 12345 November"],
    ]);
  });

  it("keeps the raw Buchungstext and the Valutadatum", () => {
    const { document, elbaAccountId } = withBothBanks();
    const { document: next } = importElba(document, fixture("elba-basic.csv"), elbaAccountId);
    const card = searchTransactions(next).find((t) => t.date === "2026-10-05")!;
    expect(card.origin).toMatchObject({
      rawText: "Bezahlung Karte Kartenzahlung mit Kartenfolge-Nr.: 1 Empfänger: BILLA DANKT 1234 WIEN",
      valueDate: "2026-10-04",
      category: null,
      type: null,
    });
  });

  it("takes the payer of an inflow and the payee of an outflow as counterparty, else whichever side is named", () => {
    const { document, elbaAccountId } = withBothBanks();
    const both = "Auftraggeber: Ich Selbst IBAN Empfänger: AT61 1904 3002 3457 3201 Empfänger: Vermieter";
    const text = [
      elbaRow({ date: "01.11.2026", amount: "-500,00", text: both }),
      elbaRow({ date: "02.11.2026", amount: "+500,00", text: both }),
      elbaRow({ date: "03.11.2026", amount: "-5,00", text: "Abbuchung Auftraggeber: Nur Zahler IBAN Auftraggeber: AT48 3200 0000 1234 5864" }),
    ].join("\n");
    const found = searchTransactions(importElba(document, utf8(text), elbaAccountId).document);
    expect(found.map((t) => [t.date, t.counterpartyName, t.counterpartyIban])).toEqual([
      ["2026-11-03", "Nur Zahler", "AT483200000012345864"],
      ["2026-11-02", "Ich Selbst", null],
      ["2026-11-01", "Vermieter", "AT611904300234573201"],
    ]);
  });

  it("reads quoted fields, CRLF line ends, a trailing semicolon and a file without BOM", () => {
    const { document, elbaAccountId } = withBothBanks();
    const text =
      '"02.11.2026";"Gutschrift Verwendungszweck: Rückzahlung; danke Auftraggeber: Eva";"02.11.2026";"+1.234.567,8";"EUR";"02.11.2026 08:00:00:000";\r\n' +
      "03.11.2026;Kontoführung;03.11.2026;-0,5;EUR;03.11.2026 08:00:00:000\r\n";
    const found = searchTransactions(importElba(document, utf8(text), elbaAccountId).document);
    expect(found.map((t) => [t.amountCents, t.counterpartyName, t.purpose])).toEqual([
      [-50, "", "Kontoführung"],
      [123456780, "Eva", "Rückzahlung; danke"],
    ]);
  });

  it("falls back to Windows-1252 when the file is not valid UTF-8", () => {
    const { document, elbaAccountId } = withBothBanks();
    const text = elbaRow({ text: "Bezahlung Karte Empfänger: BÄCKEREI MÜLLER" });
    const windows1252 = Uint8Array.from(text, (c) => c.charCodeAt(0));
    const found = searchTransactions(importElba(document, windows1252, elbaAccountId).document);
    expect(found.map((t) => t.counterpartyName)).toEqual(["BÄCKEREI MÜLLER"]);
  });

  it("re-importing an ELBA file counts every row as a duplicate", () => {
    const { document, elbaAccountId } = withBothBanks();
    const once = importElba(document, fixture("elba-basic.csv"), elbaAccountId).document;
    expect(importElba(once, fixture("elba-basic.csv"), elbaAccountId).files[0]).toMatchObject({ newCount: 0, duplicateCount: 5 });
  });
});

describe("several files at once", () => {
  const trFile = () => ({ name: "trade-republic.csv", bytes: fixture("trade-republic-basic.csv") });
  const elbaFile = () => ({ name: "elba.csv", bytes: fixture("elba-basic.csv") });

  it("previews each file with its own format and suggested Account", () => {
    const { document, elbaAccountId, trAccountId } = withBothBanks();
    const { files } = must(previewImport(document, { files: [trFile(), elbaFile()] }));
    expect(files.map((f) => (f.ok ? [f.name, f.profile.id, f.suggestedAccountId, f.newCount] : f.name))).toEqual([
      ["trade-republic.csv", "trade-republic", trAccountId, 6],
      ["elba.csv", "elba", elbaAccountId, 5],
    ]);
  });

  it("confirms every file onto its own Account", () => {
    const { document, elbaAccountId, trAccountId } = withBothBanks();
    const result = must(
      confirmImport(document, {
        importedAt: IMPORTED_AT,
        files: [
          { ...trFile(), accountId: trAccountId },
          { ...elbaFile(), accountId: elbaAccountId },
        ],
      }),
    );
    expect(result.files.map((f) => [f.name, f.newCount])).toEqual([
      ["trade-republic.csv", 6],
      ["elba.csv", 5],
    ]);
    expect(searchTransactions(result.document, { accountId: trAccountId })).toHaveLength(6);
    expect(searchTransactions(result.document, { accountId: elbaAccountId })).toHaveLength(5);
  });
});

describe("remembered Account per file name", () => {
  /** Two Raiffeisen Accounts, so nothing can be suggested from the format alone. */
  function withTwoRaiffeisenAccounts() {
    const { document, elbaAccountId, trAccountId } = withBothBanks();
    const rb = document.institutions.find((i) => i.name.startsWith("Raiffeisen"))!;
    const savings = must(createAccount(document, { institutionId: rb.id, name: "Sparkonto", defaultClassification: AVAILABLE_CASH }));
    return { document: savings.document, giroId: elbaAccountId, savingsId: savings.id, trAccountId };
  }
  const suggested = (document: WealthDocument, name: string, bytes = fixture("elba-basic.csv")) => {
    const preview = must(previewImport(document, { files: [{ name, bytes }] })).files[0]!;
    return preview.ok ? preview.suggestedAccountId : "unreadable";
  };

  it("the Account chosen for a file name is suggested the next time a file of that name is dropped", () => {
    const { document, savingsId } = withTwoRaiffeisenAccounts();
    expect(suggested(document, "elba.csv")).toBeNull();
    const next = importElba(document, fixture("elba-basic.csv"), savingsId).document;
    expect(suggested(next, "elba.csv")).toBe(savingsId);
    expect(suggested(next, "anderes.csv")).toBeNull();
  });

  it("a correction of the suggested Account wins over the format match from then on", () => {
    const { document, elbaAccountId, trAccountId } = withBothBanks();
    const next = importElba(document, fixture("elba-basic.csv"), trAccountId).document;
    expect(suggested(next, "elba.csv")).toBe(trAccountId);
    expect(suggested(next, "elba-2.csv")).toBe(elbaAccountId);
  });

  it("is remembered even when the file brought nothing new, and survives undoing the import", () => {
    const { document, giroId, savingsId } = withTwoRaiffeisenAccounts();
    const once = importElba(document, fixture("elba-basic.csv"), giroId).document;
    const again = importElba(once, fixture("elba-basic.csv"), savingsId);
    const moved = importElba(again.document, fixture("elba-basic.csv"), savingsId);
    expect(moved.files[0]).toMatchObject({ newCount: 0 });
    expect(suggested(moved.document, "elba.csv")).toBe(savingsId);
    const { document: undone } = must(undoImport(moved.document, { importId: again.files[0]!.importId! }));
    expect(suggested(undone, "elba.csv")).toBe(savingsId);
  });

  it("an Account asked for in the preview wins over the remembered one", () => {
    const { document, giroId, savingsId } = withTwoRaiffeisenAccounts();
    const next = importElba(document, fixture("elba-basic.csv"), savingsId).document;
    const preview = must(previewImport(next, { files: [{ ...{ name: "elba.csv", bytes: fixture("elba-basic.csv") }, accountId: giroId }] }));
    expect(preview.files[0]).toMatchObject({ suggestedAccountId: giroId, newCount: 5 });
  });
});

describe("unreadable ELBA files", () => {
  const good = elbaRow({});

  it("a row with a bad date, an unclear amount or the wrong number of fields fails the whole file", () => {
    expect(errorOf(`${good}\n${elbaRow({ date: "31.02.2026" })}\n`)).toBe("bad-row");
    expect(errorOf(`${good}\n${elbaRow({ valueDate: "2026/11/01" })}\n`)).toBe("bad-row");
    expect(errorOf(`${good}\n${elbaRow({ amount: "-4.50" })}\n`)).toBe("bad-row");
    expect(errorOf(`${good}\n${elbaRow({ amount: "1.234" })}\n`)).toBe("bad-row");
    expect(errorOf(`${good}\n${elbaRow({ amount: "12,34-" })}\n`)).toBe("bad-row");
    expect(errorOf(`${good}\n${good};extra\n`)).toBe("bad-row");
    expect(errorOf(`${good}\n01.11.2026;Kontoführung;01.11.2026;-7,90;EUR\n`)).toBe("bad-row");
  });

  it("names the failing line in German", () => {
    expect(previewOf(`${good}\n${elbaRow({ amount: "-4.50" })}\n`)).toMatchObject({
      ok: false,
      error: { message: "Zeile 2: „-4.50“ ist kein gültiger Betrag. Es wurde nichts importiert." },
    });
  });

  it("a non-EUR row fails the file", () => {
    expect(errorOf(`${good}\n${elbaRow({ currency: "USD" })}\n`)).toBe("unsupported-currency");
  });

  it("a semicolon file that does not look like ELBA is not recognized", () => {
    expect(errorOf("Buchungsdatum;Buchungstext;Valutadatum;Betrag;Währung;Zeitstempel\n" + good)).toBe("unknown-format");
    expect(errorOf("01.11.2026;-7,90;EUR\n")).toBe("unknown-format");
  });
});
