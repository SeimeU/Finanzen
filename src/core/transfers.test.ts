import { describe, expect, it } from "vitest";
import {
  confirmImport,
  createAccount,
  createEmptyDocument,
  createInstitution,
  createRule,
  searchTransactions,
  setTransactionCategory,
  setTransfer,
  acceptTransferSuggestion,
  rejectTransferSuggestion,
  transferSuggestions,
  uncategorizedTransactions,
  undoImport,
  updateAccount,
  type Result,
  type WealthDocument,
} from "./index";

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
const IMPORTED_AT = "2026-11-26T10:00:00.000Z";
const ELBA_IBAN = "AT483200000012345864";
const TR_IBAN = "DE89370400440532013000";
const TR_HEADER =
  "datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,original_amount,original_currency,fx_rate,description,transaction_id,counterparty_name,counterparty_iban,payment_reference,mcc_code";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

/** A Raiffeisen Girokonto and a Trade Republic Verrechnungskonto; IBANs only when asked for. */
function twoAccounts(ibans: { elba?: string | null; tr?: string | null } = {}) {
  const document = createEmptyDocument();
  const rb = must(createInstitution(document, { name: "Raiffeisenbank Wien" }));
  const tr = must(createInstitution(rb.document, { name: "Trade Republic" }));
  const giro = must(
    createAccount(tr.document, { institutionId: rb.id, name: "Girokonto", iban: ibans.elba ?? null, defaultClassification: CASH }),
  );
  const cash = must(
    createAccount(giro.document, { institutionId: tr.id, name: "Verrechnungskonto", iban: ibans.tr ?? null, defaultClassification: CASH }),
  );
  return { document: cash.document, elba: giro.id, tr: cash.id };
}

/** One Trade Republic row (category CASH). */
function trRow(f: { date: string; amount: string; type: string; description: string; iban?: string; name?: string }): string {
  return `${f.date}T10:00:00Z,${f.date},DEFAULT,CASH,${f.type},,,,,,${f.amount},,,EUR,,,,${f.description},id-${f.description},${f.name ?? ""},${f.iban ?? ""},,`;
}

/** One ELBA row; the date is "DD.MM.YYYY" and the amount German-formatted. */
function elbaRow(f: { date: string; amount: string; text: string }): string {
  return `${f.date};${f.text};${f.date};${f.amount};EUR;${f.date} 12:00:00:000`;
}

function importFiles(document: WealthDocument, files: { name: string; text: string; accountId: string }[]): WealthDocument {
  return must(
    confirmImport(document, {
      importedAt: IMPORTED_AT,
      files: files.map((f) => ({ name: f.name, bytes: new TextEncoder().encode(f.text), accountId: f.accountId })),
    }),
  ).document;
}

/** purpose → "Umbuchung (iban, excluded)" or "<kind> (<cashFlow>)". */
function kinds(document: WealthDocument): Record<string, string> {
  return Object.fromEntries(
    searchTransactions(document).map((t) => {
      const c = t.classification;
      return [t.purpose, c.kind === "transfer" ? `Umbuchung (${c.source}, ${c.cashFlow})` : `${c.kind} (${c.cashFlow})`];
    }),
  );
}

const idOf = (document: WealthDocument, purpose: string): string => {
  const t = document.transactions.find((x) => x.purpose === purpose);
  if (!t) throw new Error(`no Transaction "${purpose}"`);
  return t.id;
};

/**
 * An ELBA outgoing transfer to Trade Republic (2 Nov) and Trade Republic's matching inbound
 * row (4 Nov), plus an ELBA card payment. IBANs on the Accounts only when given.
 */
function elbaToTradeRepublic(ibans: { elba?: string | null; tr?: string | null }, extra: { elba?: string[]; tr?: string[] } = {}) {
  const { document, elba, tr } = twoAccounts(ibans);
  const elbaText = [
    elbaRow({
      date: "02.11.2026",
      amount: "-500,00",
      text: "Überweisung Verwendungszweck: Sparen November IBAN Empfänger: DE89 3704 0044 0532 0130 00 Empfänger: Max Mustermann",
    }),
    elbaRow({ date: "03.11.2026", amount: "-23,46", text: "Bezahlung Karte Empfänger: BILLA DANKT" }),
    ...(extra.elba ?? []),
  ].join("\n");
  const trText = [
    TR_HEADER,
    trRow({ date: "2026-11-04", amount: "500.00", type: "CUSTOMER_INBOUND", description: "Einzahlung", name: "Max Mustermann", iban: ELBA_IBAN }),
    ...(extra.tr ?? []),
  ].join("\n");
  return {
    document: importFiles(document, [
      { name: "elba.csv", text: elbaText, accountId: elba },
      { name: "tr.csv", text: trText, accountId: tr },
    ]),
    elba,
    tr,
  };
}

describe("Transfers detected by IBAN", () => {
  it("a Transaction whose counterparty IBAN is one of the owner's Accounts is a Transfer, excluded from spending and income", () => {
    const { document } = elbaToTradeRepublic({ elba: ELBA_IBAN, tr: TR_IBAN });
    expect(kinds(document)).toEqual({
      "Sparen November": "Umbuchung (iban, excluded)",
      "Bezahlung Karte": "uncategorized (unknown)",
      Einzahlung: "Umbuchung (iban, excluded)",
    });
    expect(uncategorizedTransactions(document).map((t) => t.purpose)).toEqual(["Bezahlung Karte"]);
  });

  it("an IBAN entered on an Account after the import is applied to the Transactions already there", () => {
    const { document, tr } = elbaToTradeRepublic({});
    const account = document.accounts.find((a) => a.id === tr)!;
    const updated = must(updateAccount(document, { ...account, iban: TR_IBAN })).document;
    expect(kinds(updated)["Sparen November"]).toBe("Umbuchung (iban, excluded)");
    expect(kinds(updated)["Einzahlung"]).toBe("uncategorized (unknown)");
  });

  it("a manual Category wins over IBAN detection", () => {
    const { document } = elbaToTradeRepublic({ elba: ELBA_IBAN, tr: TR_IBAN });
    const updated = must(
      setTransactionCategory(document, { transactionId: idOf(document, "Einzahlung"), categoryId: "einkommen-sonstige" }),
    ).document;
    expect(kinds(updated)["Einzahlung"]).toBe("category (income)");
  });

  it("an IBAN-detected Transfer wins over a matching Categorization rule", () => {
    const { document } = elbaToTradeRepublic({ elba: ELBA_IBAN, tr: TR_IBAN });
    const withRule = must(
      createRule(document, {
        condition: { field: "counterparty", operator: "contains", text: "mustermann" },
        categoryId: "einkommen-sonstige",
        applyToExisting: true,
      }),
    ).document;
    const einzahlung = withRule.transactions.find((t) => t.purpose === "Einzahlung")!;
    expect(einzahlung.ruleCategoryId).toBe("einkommen-sonstige");
    expect(kinds(withRule)["Einzahlung"]).toBe("Umbuchung (iban, excluded)");
  });
});

describe("marking Transfers by hand", () => {
  it("marking makes a Transaction a Transfer; unmarking overrides IBAN detection", () => {
    const { document } = elbaToTradeRepublic({ elba: ELBA_IBAN, tr: TR_IBAN });
    let updated = must(setTransfer(document, { transactionId: idOf(document, "Bezahlung Karte"), transfer: true })).document;
    updated = must(setTransfer(updated, { transactionId: idOf(document, "Einzahlung"), transfer: false })).document;
    expect(kinds(updated)).toEqual({
      "Sparen November": "Umbuchung (iban, excluded)",
      "Bezahlung Karte": "Umbuchung (manual, excluded)",
      Einzahlung: "uncategorized (unknown)",
    });
  });

  it("clearing the mark (null) returns the Transaction to automatic detection", () => {
    const { document } = elbaToTradeRepublic({ elba: ELBA_IBAN, tr: TR_IBAN });
    const id = idOf(document, "Einzahlung");
    const unmarked = must(setTransfer(document, { transactionId: id, transfer: false })).document;
    const automatic = must(setTransfer(unmarked, { transactionId: id, transfer: null })).document;
    expect(kinds(automatic)["Einzahlung"]).toBe("Umbuchung (iban, excluded)");
  });

  it("marking a Trade Republic Trade as a Transfer overrides the bank's classification", () => {
    const { document } = elbaToTradeRepublic(
      {},
      { tr: [`2026-11-05T10:00:00Z,2026-11-05,DEFAULT,TRADING,BUY,FUND,ETF,IE00B4L5Y983,1,100,-100.00,,,EUR,,,,Kauf ETF,id-kauf,,,,`] },
    );
    const updated = must(setTransfer(document, { transactionId: idOf(document, "Kauf ETF"), transfer: true })).document;
    expect(kinds(updated)["Kauf ETF"]).toBe("Umbuchung (manual, excluded)");
  });

  it("marking a Transfer by hand replaces a manual Category, and setting a Category replaces the mark", () => {
    const { document } = elbaToTradeRepublic({});
    const id = idOf(document, "Bezahlung Karte");
    const categorized = must(setTransactionCategory(document, { transactionId: id, categoryId: "lebensmittel-supermarkt" })).document;
    const marked = must(setTransfer(categorized, { transactionId: id, transfer: true })).document;
    expect(kinds(marked)["Bezahlung Karte"]).toBe("Umbuchung (manual, excluded)");
    const recategorized = must(setTransactionCategory(marked, { transactionId: id, categoryId: "lebensmittel-supermarkt" })).document;
    expect(kinds(recategorized)["Bezahlung Karte"]).toBe("category (expense)");
  });

  it("rejects an unknown Transaction", () => {
    const { document } = elbaToTradeRepublic({});
    const result = setTransfer(document, { transactionId: "nope", transfer: true });
    expect(result.ok ? null : result.error.code).toBe("transaction-not-found");
  });
});

/** Each suggestion as "outgoing purpose → incoming purpose". */
const suggested = (document: WealthDocument): string[] =>
  transferSuggestions(document).map((s) => `${s.outgoing.purpose} → ${s.incoming.purpose}`);

describe("Transfer suggestions by amount", () => {
  it("a Trade Republic inbound transfer is suggested as the Transfer of an equal ELBA outgoing transfer two days earlier", () => {
    const { document, elba, tr } = elbaToTradeRepublic({});
    const [suggestion] = transferSuggestions(document);
    expect(suggested(document)).toEqual(["Sparen November → Einzahlung"]);
    expect(suggestion).toMatchObject({
      outgoing: { accountId: elba, bookingDate: "2026-11-02", amountCents: -50000 },
      incoming: { accountId: tr, bookingDate: "2026-11-04", amountCents: 50000 },
    });
    // Until accepted, both still count as ordinary Transactions.
    expect(kinds(document)["Einzahlung"]).toBe("uncategorized (unknown)");
  });

  it("accepting marks both as Transfers and the suggestion goes away", () => {
    const { document } = elbaToTradeRepublic({});
    const accepted = must(
      acceptTransferSuggestion(document, { outgoingId: idOf(document, "Sparen November"), incomingId: idOf(document, "Einzahlung") }),
    ).document;
    expect(kinds(accepted)).toEqual({
      "Sparen November": "Umbuchung (manual, excluded)",
      "Bezahlung Karte": "uncategorized (unknown)",
      Einzahlung: "Umbuchung (manual, excluded)",
    });
    expect(suggested(accepted)).toEqual([]);
  });

  it("unmarking one side of an accepted pair unmarks its counterpart too", () => {
    const { document } = elbaToTradeRepublic({});
    const pair = { outgoingId: idOf(document, "Sparen November"), incomingId: idOf(document, "Einzahlung") };
    const accepted = must(acceptTransferSuggestion(document, pair)).document;

    const unmarked = must(setTransfer(accepted, { transactionId: pair.incomingId, transfer: false })).document;
    expect(kinds(unmarked)).toMatchObject({
      "Sparen November": "uncategorized (unknown)",
      Einzahlung: "uncategorized (unknown)",
    });

    const automatic = must(setTransfer(accepted, { transactionId: pair.outgoingId, transfer: null })).document;
    expect(automatic.transactions.filter((t) => t.id === pair.outgoingId || t.id === pair.incomingId).map((t) => t.transferMark)).toEqual([
      null,
      null,
    ]);
    // Back to automatic detection: suggested again.
    expect(suggested(automatic)).toEqual(["Sparen November → Einzahlung"]);
  });

  it("after the counterpart's import is undone, unmarking the other side touches no re-imported Transaction", () => {
    const { document, tr } = elbaToTradeRepublic({});
    const pair = { outgoingId: idOf(document, "Sparen November"), incomingId: idOf(document, "Einzahlung") };
    const accepted = must(acceptTransferSuggestion(document, pair)).document;
    const trImport = accepted.imports.find((i) => i.fileName === "tr.csv")!;
    const undone = must(undoImport(accepted, { importId: trImport.id })).document;
    const trText = [TR_HEADER, trRow({ date: "2026-11-20", amount: "77.00", type: "CUSTOMER_INBOUND", description: "Neu", iban: ELBA_IBAN })].join("\n");
    const reimported = importFiles(undone, [{ name: "tr.csv", text: trText, accountId: tr }]);
    const marked = must(setTransfer(reimported, { transactionId: idOf(reimported, "Neu"), transfer: true })).document;

    const unmarked = must(setTransfer(marked, { transactionId: pair.outgoingId, transfer: false })).document;
    expect(kinds(unmarked)).toMatchObject({ "Sparen November": "uncategorized (unknown)", Neu: "Umbuchung (manual, excluded)" });
  });

  it("rejecting keeps both as ordinary Transactions and the pair is never suggested again", () => {
    const { document } = elbaToTradeRepublic({});
    const pair = { outgoingId: idOf(document, "Sparen November"), incomingId: idOf(document, "Einzahlung") };
    const rejected = must(rejectTransferSuggestion(document, pair)).document;
    expect(suggested(rejected)).toEqual([]);
    expect(kinds(rejected)["Einzahlung"]).toBe("uncategorized (unknown)");
    expect(acceptTransferSuggestion(rejected, pair).ok).toBe(false);
  });

  it("only a current suggestion can be accepted or rejected", () => {
    const { document } = elbaToTradeRepublic({});
    const notAPair = { outgoingId: idOf(document, "Bezahlung Karte"), incomingId: idOf(document, "Einzahlung") };
    const accept = acceptTransferSuggestion(document, notAPair);
    const reject = rejectTransferSuggestion(document, notAPair);
    expect(accept.ok ? null : accept.error.code).toBe("suggestion-not-found");
    expect(reject.ok ? null : reject.error.code).toBe("suggestion-not-found");
  });

  it("3 days apart is still suggested, 4 days apart is not", () => {
    const at = (date: string) =>
      suggested(
        elbaToTradeRepublic(
          {},
          { tr: [trRow({ date, amount: "23.46", type: "CUSTOMER_INBOUND", description: "Rückzahlung" })] },
        ).document,
      );
    expect(at("2026-11-06")).toContain("Bezahlung Karte → Rückzahlung");
    expect(at("2026-11-07")).not.toContain("Bezahlung Karte → Rückzahlung");
  });

  it("equal amounts on the same Account, or with the same sign, are not suggested", () => {
    const sameAccount = elbaToTradeRepublic(
      {},
      { elba: [elbaRow({ date: "03.11.2026", amount: "+23,46", text: "Gutschrift Verwendungszweck: Retoure Billa" })] },
    ).document;
    expect(suggested(sameAccount)).toEqual(["Sparen November → Einzahlung"]);
    const sameSign = elbaToTradeRepublic(
      {},
      { tr: [trRow({ date: "2026-11-03", amount: "-23.46", type: "CARD_TRANSACTION", description: "Kartenzahlung" })] },
    ).document;
    expect(suggested(sameSign)).toEqual(["Sparen November → Einzahlung"]);
  });

  it("Transactions already classified (IBAN Transfer, Trade, manual Category, unmarked) are not suggested", () => {
    const trade = `2026-11-03T10:00:00Z,2026-11-03,DEFAULT,TRADING,SELL,FUND,ETF,IE00B4L5Y983,1,23.46,23.46,,,EUR,,,,Verkauf ETF,id-verkauf,,,,`;
    const ibanDetected = elbaToTradeRepublic({ tr: TR_IBAN }, { tr: [trade] }).document;
    expect(suggested(ibanDetected)).toEqual([]);

    const { document } = elbaToTradeRepublic({});
    const categorized = must(
      setTransactionCategory(document, { transactionId: idOf(document, "Einzahlung"), categoryId: "einkommen-sonstige" }),
    ).document;
    expect(suggested(categorized)).toEqual([]);
    const unmarked = must(setTransfer(document, { transactionId: idOf(document, "Sparen November"), transfer: false })).document;
    expect(suggested(unmarked)).toEqual([]);
  });

  it("each Transaction is in at most one suggestion, paired with the closest date", () => {
    const { document } = elbaToTradeRepublic(
      {},
      { tr: [trRow({ date: "2026-11-02", amount: "500.00", type: "CUSTOMER_INBOUND", description: "Einzahlung früh" })] },
    );
    expect(suggested(document)).toEqual(["Sparen November → Einzahlung früh"]);
  });

  it("after undoing an import and importing it again, a rejected pair is suggested again", () => {
    const { document, tr } = elbaToTradeRepublic({});
    const pair = { outgoingId: idOf(document, "Sparen November"), incomingId: idOf(document, "Einzahlung") };
    const rejected = must(rejectTransferSuggestion(document, pair)).document;
    const trImport = rejected.imports.find((i) => i.fileName === "tr.csv")!;
    const undone = must(undoImport(rejected, { importId: trImport.id })).document;
    const trText = [
      TR_HEADER,
      trRow({ date: "2026-11-04", amount: "500.00", type: "CUSTOMER_INBOUND", description: "Einzahlung", name: "Max Mustermann", iban: ELBA_IBAN }),
    ].join("\n");
    const reimported = importFiles(undone, [{ name: "tr.csv", text: trText, accountId: tr }]);
    expect(suggested(reimported)).toEqual(["Sparen November → Einzahlung"]);
  });
});
