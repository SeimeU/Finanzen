import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  confirmImport,
  createAccount,
  createEmptyDocument,
  createInstitution,
  deleteCategory,
  listCategories,
  searchTransactions,
  setTransactionCategory,
  uncategorizedTransactions,
  type ClassifiedTransaction,
  type Result,
  type WealthDocument,
} from "./index";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
const HEADER =
  "datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,original_amount,original_currency,fx_rate,description,transaction_id,counterparty_name,counterparty_iban,payment_reference,mcc_code";

/** One Trade Republic CSV row; `category` is TR's own column (CASH, TRADING, …), not ours. */
function trRow(f: { date: string; amount: string; type: string; category?: string; description: string }): string {
  return `${f.date}T10:00:00Z,${f.date},DEFAULT,${f.category ?? "CASH"},${f.type},,,,,,${f.amount},,,EUR,,,,${f.description},id-${f.description},,,,`;
}

function imported(csv: Uint8Array | string): WealthDocument {
  let document = createEmptyDocument();
  const tr = must(createInstitution(document, { name: "Trade Republic" }));
  const account = must(createAccount(tr.document, { institutionId: tr.id, name: "Verrechnungskonto", defaultClassification: CASH }));
  document = account.document;
  const bytes = typeof csv === "string" ? new TextEncoder().encode(csv) : csv;
  return must(
    confirmImport(document, { importedAt: "2026-11-26T10:00:00Z", files: [{ name: "tr.csv", bytes, accountId: account.id }] }),
  ).document;
}

const categoryPath = (document: WealthDocument, id: string): string => {
  for (const top of listCategories(document)) {
    if (top.id === id) return top.name;
    const child = top.children.find((c) => c.id === id);
    if (child) return `${top.name} → ${child.name}`;
  }
  throw new Error(`no Category ${id}`);
};

/** A readable classification, e.g. "Kapitalerträge → Zinsen (income, bank)" or "Kauf (excluded)". */
function classificationText(document: WealthDocument, t: ClassifiedTransaction): string {
  const c = t.classification;
  return c.kind === "category"
    ? `${categoryPath(document, c.categoryId)} (${c.cashFlow}, ${c.source})`
    : c.kind === "trade"
      ? `${c.direction === "buy" ? "Kauf" : "Verkauf"} (${c.cashFlow})`
      : `Unkategorisiert (${c.cashFlow})`;
}

/** purpose → its readable classification. */
function classified(document: WealthDocument): Record<string, string> {
  return Object.fromEntries(searchTransactions(document).map((t) => [t.purpose, classificationText(document, t)]));
}

const fixture = readFileSync(join(import.meta.dirname, "import", "fixtures", "trade-republic-basic.csv"));

describe("Trade Republic classification", () => {
  it("TRADING rows are Trades, interest and distributions are Kapitalerträge, other rows wait in the inbox", () => {
    expect(classified(imported(fixture))).toEqual({
      Einzahlung: "Unkategorisiert (unknown)",
      "Kauf iShares Core MSCI World": "Kauf (excluded)",
      "Zinsen April": "Kapitalerträge → Zinsen (income, bank)",
      "Kartenzahlung Billa": "Unkategorisiert (unknown)",
      "Ausschüttung Vanguard FTSE All-World": "Kapitalerträge → Ausschüttungen (income, bank)",
      Überweisung: "Unkategorisiert (unknown)",
    });
  });

  it("a sale is a Verkauf, tax rows are Steuern, cancellations keep their type's Category", () => {
    const csv = [
      HEADER,
      trRow({ date: "2026-06-01", amount: "800.00", type: "SELL", category: "TRADING", description: "Verkauf ETF" }),
      trRow({ date: "2026-06-02", amount: "-4.20", type: "TAX_CORRECTION", description: "Steuerkorrektur" }),
      trRow({ date: "2026-06-03", amount: "1.10", type: "TAX_REFUND", description: "Steuererstattung" }),
      trRow({ date: "2026-06-04", amount: "-1.23", type: "INTEREST_PAYMENT_CANCELLED", description: "Storno Zinsen" }),
    ].join("\n");
    expect(classified(imported(csv))).toEqual({
      "Verkauf ETF": "Verkauf (excluded)",
      Steuerkorrektur: "Steuern → Kapitalertragsteuer (expense, bank)",
      Steuererstattung: "Steuern → Kapitalertragsteuer (expense, bank)",
      "Storno Zinsen": "Kapitalerträge → Zinsen (income, bank)",
    });
  });

  it("Saveback is income under Einkommen → Prämien (not a Trade), interest Kapitalerträge, card payments wait in the inbox", () => {
    const document = imported(readFileSync(join(import.meta.dirname, "import", "fixtures", "trade-republic-cash.csv")));
    expect(
      Object.fromEntries(searchTransactions(document).map((t) => [t.origin.type + " " + t.date, classificationText(document, t)])),
    ).toEqual({
      "BENEFITS_SAVEBACK 2026-10-02": "Einkommen → Prämien (income, bank)",
      "INTEREST_PAYMENT 2026-10-31": "Kapitalerträge → Zinsen (income, bank)",
      "CARD_TRANSACTION 2026-10-14": "Unkategorisiert (unknown)",
      "CARD_TRANSACTION 2026-10-20": "Unkategorisiert (unknown)",
    });
  });

  it("an unknown or empty type is kept and lands in the inbox", () => {
    const csv = [
      HEADER,
      trRow({ date: "2026-06-01", amount: "5.00", type: "MYSTERY_BONUS", description: "Bonus" }),
      trRow({ date: "2026-06-02", amount: "-5.00", type: "", category: "", description: "Ohne Typ" }),
    ].join("\n");
    const document = imported(csv);
    expect(uncategorizedTransactions(document).map((t) => t.purpose)).toEqual(["Ohne Typ", "Bonus"]);
  });

  it("when the mapped default Category was deleted, the row goes to the inbox instead", () => {
    const document = must(deleteCategory(imported(fixture), { id: "kapitalertraege-zinsen" })).document;
    expect(classified(document)["Zinsen April"]).toBe("Unkategorisiert (unknown)");
  });
});

describe("the Uncategorized inbox", () => {
  it("lists every Transaction without a Category, newest first", () => {
    expect(uncategorizedTransactions(imported(fixture)).map((t) => t.purpose)).toEqual([
      "Überweisung",
      "Kartenzahlung Billa",
      "Einzahlung",
    ]);
  });
});

describe("manual Category", () => {
  const byPurpose = (document: WealthDocument, purpose: string) => searchTransactions(document).find((t) => t.purpose === purpose)!;

  it("setting a Category by hand moves a Transaction out of the inbox", () => {
    let document = imported(fixture);
    const billa = byPurpose(document, "Kartenzahlung Billa");
    document = must(setTransactionCategory(document, { transactionId: billa.id, categoryId: "lebensmittel-supermarkt" })).document;
    expect(classified(document)["Kartenzahlung Billa"]).toBe("Lebensmittel → Supermarkt (expense, manual)");
    expect(uncategorizedTransactions(document).map((t) => t.purpose)).toEqual(["Überweisung", "Einzahlung"]);
  });

  it("wins over the Trade Republic classification, and clearing it restores that", () => {
    let document = imported(fixture);
    const buy = byPurpose(document, "Kauf iShares Core MSCI World");
    document = must(setTransactionCategory(document, { transactionId: buy.id, categoryId: "sonstiges" })).document;
    expect(classified(document)["Kauf iShares Core MSCI World"]).toBe("Sonstiges (expense, manual)");
    document = must(setTransactionCategory(document, { transactionId: buy.id, categoryId: null })).document;
    expect(classified(document)["Kauf iShares Core MSCI World"]).toBe("Kauf (excluded)");
  });

  it("deleting the Category sends its Transactions back to the inbox", () => {
    let document = imported(fixture);
    const billa = byPurpose(document, "Kartenzahlung Billa");
    document = must(setTransactionCategory(document, { transactionId: billa.id, categoryId: "lebensmittel-supermarkt" })).document;
    document = must(deleteCategory(document, { id: "lebensmittel-supermarkt" })).document;
    expect(uncategorizedTransactions(document).map((t) => t.purpose)).toContain("Kartenzahlung Billa");
  });

  it("rejects an unknown Transaction or Category", () => {
    const document = imported(fixture);
    const billa = byPurpose(document, "Kartenzahlung Billa");
    expect(setTransactionCategory(document, { transactionId: "t999", categoryId: "sonstiges" })).toMatchObject({
      ok: false,
      error: { code: "transaction-not-found" },
    });
    expect(setTransactionCategory(document, { transactionId: billa.id, categoryId: "nope" })).toMatchObject({
      ok: false,
      error: { code: "category-not-found" },
    });
  });
});
