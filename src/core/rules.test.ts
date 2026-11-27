import { describe, expect, it } from "vitest";
import {
  confirmImport,
  createAccount,
  createEmptyDocument,
  createInstitution,
  createRule,
  deleteCategory,
  deleteRule,
  listCategories,
  listRules,
  moveRule,
  reapplyRules,
  updateRule,
  searchTransactions,
  setTransactionCategory,
  type Result,
  type RuleCondition,
  type WealthDocument,
} from "./index";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
const HEADER =
  "datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,original_amount,original_currency,fx_rate,description,transaction_id,counterparty_name,counterparty_iban,payment_reference,mcc_code";

type Row = { date: string; amount: string; purpose: string; counterparty?: string; reference?: string; type?: string; category?: string };

/** One Trade Republic CSV row; `category` is TR's own column (CASH, TRADING, …), not ours. */
const trRow = (r: Row) =>
  `${r.date}T10:00:00Z,${r.date},DEFAULT,${r.category ?? "CASH"},${r.type ?? "CARD_TRANSACTION"},,,,,,${r.amount},,,EUR,,,,${r.purpose},id-${r.purpose},${r.counterparty ?? ""},,${r.reference ?? ""},`;

const csv = (rows: Row[]) => new TextEncoder().encode([HEADER, ...rows.map(trRow)].join("\n"));

/** A document with one Trade Republic Account and no Transactions yet. */
function withAccount(): { document: WealthDocument; accountId: string } {
  const tr = must(createInstitution(createEmptyDocument(), { name: "Trade Republic" }));
  const account = must(createAccount(tr.document, { institutionId: tr.id, name: "Verrechnungskonto", defaultClassification: CASH }));
  return { document: account.document, accountId: account.id };
}

let fileNumber = 0;
function importRows(document: WealthDocument, accountId: string, rows: Row[]): WealthDocument {
  fileNumber += 1;
  return must(
    confirmImport(document, {
      importedAt: "2026-11-26T10:00:00Z",
      files: [{ name: `tr-${fileNumber}.csv`, bytes: csv(rows), accountId }],
    }),
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

/** purpose → a readable classification, e.g. "Lebensmittel → Supermarkt (rule)". */
function classified(document: WealthDocument): Record<string, string> {
  return Object.fromEntries(
    searchTransactions(document).map((t) => {
      const c = t.classification;
      const text =
        c.kind === "category"
          ? `${categoryPath(document, c.categoryId)} (${c.source})`
          : c.kind === "trade"
            ? c.direction === "buy" ? "Kauf" : "Verkauf"
            : "Unkategorisiert";
      return [t.purpose, text];
    }),
  );
}

describe("Categorization rules on import", () => {
  it("a rule on the counterparty categorizes matching Transactions as they are imported", () => {
    let { document, accountId } = withAccount();
    document = must(
      createRule(document, {
        condition: { field: "counterparty", operator: "contains", text: "billa" },
        categoryId: "lebensmittel-supermarkt",
      }),
    ).document;
    document = importRows(document, accountId, [
      { date: "2026-05-03", amount: "-23.45", purpose: "Kartenzahlung Billa", counterparty: "BILLA DANKT" },
      { date: "2026-05-04", amount: "-9.90", purpose: "Kartenzahlung Spar", counterparty: "SPAR" },
    ]);
    expect(classified(document)).toEqual({
      "Kartenzahlung Billa": "Lebensmittel → Supermarkt (rule)",
      "Kartenzahlung Spar": "Unkategorisiert",
    });
  });
});

const billaRule = { condition: { field: "counterparty", operator: "contains", text: "billa" }, categoryId: "lebensmittel-supermarkt" } as const;

describe("rule precedence", () => {
  const rows: Row[] = [
    { date: "2026-05-01", amount: "-500.00", purpose: "Kauf ETF", type: "BUY", category: "TRADING", counterparty: "BILLA" },
    { date: "2026-05-02", amount: "0.50", purpose: "Zinsen Mai", type: "INTEREST_PAYMENT", counterparty: "BILLA" },
    { date: "2026-05-03", amount: "-23.45", purpose: "Kartenzahlung Billa", counterparty: "BILLA DANKT", reference: "Filiale 12" },
  ];

  it("the first matching rule in the owner's order wins", () => {
    let { document, accountId } = withAccount();
    document = must(createRule(document, { condition: { field: "reference", operator: "contains", text: "filiale" }, categoryId: "einkaeufe-haushalt" })).document;
    document = must(createRule(document, billaRule)).document;
    document = importRows(document, accountId, rows);
    expect(classified(document)["Kartenzahlung Billa"]).toBe("Einkäufe → Haushalt & Elektronik (rule)");
  });

  it("Trades and the bank's own classification win over rules", () => {
    let { document, accountId } = withAccount();
    document = must(createRule(document, billaRule)).document;
    document = importRows(document, accountId, rows);
    expect(classified(document)).toMatchObject({ "Kauf ETF": "Kauf", "Zinsen Mai": "Kapitalerträge → Zinsen (bank)" });
  });

  it("a Category set by hand wins over a rule, also after re-applying", () => {
    let { document, accountId } = withAccount();
    document = must(createRule(document, billaRule)).document;
    document = importRows(document, accountId, rows);
    const billa = searchTransactions(document).find((t) => t.purpose === "Kartenzahlung Billa")!;
    document = must(setTransactionCategory(document, { transactionId: billa.id, categoryId: "freizeit-restaurant" })).document;
    document = must(reapplyRules(document)).document;
    expect(classified(document)["Kartenzahlung Billa"]).toBe("Freizeit → Restaurant & Café (manual)");
  });
});

describe("matching", () => {
  const rows: Row[] = [
    { date: "2026-05-01", amount: "-850.00", purpose: "Miete   Mai", counterparty: "Hausverwaltung" },
    { date: "2026-05-02", amount: "-850.01", purpose: "Miete Mai Nachzahlung", counterparty: "Hausverwaltung" },
    { date: "2026-05-03", amount: "-9.99", purpose: "Abo", counterparty: "Netflix" },
    { date: "2026-05-04", amount: "3250.00", purpose: "Lohn", counterparty: "Muster GmbH" },
  ];
  const matched = (condition: RuleCondition) => {
    const { document, accountId } = withAccount();
    const withRule = must(createRule(document, { condition, categoryId: "sonstiges" })).document;
    return Object.entries(classified(importRows(withRule, accountId, rows)))
      .filter(([, c]) => c !== "Unkategorisiert")
      .map(([purpose]) => purpose)
      .sort();
  };

  it("text equals ignores case and repeated spaces; contains finds a part", () => {
    expect(matched({ field: "purpose", operator: "equals", text: " miete mai " })).toEqual(["Miete   Mai"]);
    expect(matched({ field: "purpose", operator: "contains", text: "MIETE" })).toEqual(["Miete   Mai", "Miete Mai Nachzahlung"]);
  });

  it("amounts compare signed cents: outflows are negative", () => {
    expect(matched({ field: "amount", operator: "equals", amountCents: -999 })).toEqual(["Abo"]);
    expect(matched({ field: "amount", operator: "atMost", amountCents: -85000 })).toEqual(["Miete   Mai", "Miete Mai Nachzahlung"]);
    expect(matched({ field: "amount", operator: "atLeast", amountCents: 0 })).toEqual(["Lohn"]);
  });
});

describe("re-applying rules", () => {
  const billaRow: Row = { date: "2026-05-03", amount: "-23.45", purpose: "Kartenzahlung Billa", counterparty: "BILLA DANKT" };

  it("a rule created after the import categorizes existing Transactions only once re-applied", () => {
    let { document, accountId } = withAccount();
    document = importRows(document, accountId, [billaRow]);
    document = must(createRule(document, billaRule)).document;
    expect(classified(document)["Kartenzahlung Billa"]).toBe("Unkategorisiert");
    const reapplied = must(reapplyRules(document));
    expect(reapplied.changedCount).toBe(1);
    expect(classified(reapplied.document)["Kartenzahlung Billa"]).toBe("Lebensmittel → Supermarkt (rule)");
  });

  it("re-applying after a rule was deleted takes its Category back", () => {
    const { document: start, accountId } = withAccount();
    const created = must(createRule(start, billaRule));
    let document = importRows(created.document, accountId, [billaRow]);
    document = must(deleteRule(document, { id: created.id })).document;
    expect(classified(document)["Kartenzahlung Billa"]).toBe("Lebensmittel → Supermarkt (rule)");
    document = must(reapplyRules(document)).document;
    expect(classified(document)["Kartenzahlung Billa"]).toBe("Unkategorisiert");
  });

  it("creating a rule with applyToExisting re-applies the rules at once", () => {
    let { document, accountId } = withAccount();
    document = importRows(document, accountId, [billaRow]);
    document = must(createRule(document, { ...billaRule, applyToExisting: true })).document;
    expect(classified(document)["Kartenzahlung Billa"]).toBe("Lebensmittel → Supermarkt (rule)");
  });
});

describe("editing rules", () => {
  const reference = { condition: { field: "reference", operator: "contains", text: "filiale" }, categoryId: "einkaeufe-haushalt" } as const;
  const billaRows: Row[] = [{ date: "2026-05-03", amount: "-23.45", purpose: "Kartenzahlung Billa", counterparty: "BILLA DANKT", reference: "Filiale 12" }];

  it("moving a rule up makes it win; the order is what listRules shows", () => {
    let { document, accountId } = withAccount();
    document = must(createRule(document, reference)).document;
    const billa = must(createRule(document, billaRule));
    document = must(moveRule(billa.document, { id: billa.id, direction: "up" })).document;
    expect(listRules(document).map((r) => r.categoryId)).toEqual(["lebensmittel-supermarkt", "einkaeufe-haushalt"]);
    document = must(moveRule(document, { id: billa.id, direction: "up" })).document;
    expect(listRules(document)[0]!.id).toBe(billa.id);
    expect(classified(importRows(document, accountId, billaRows))["Kartenzahlung Billa"]).toBe("Lebensmittel → Supermarkt (rule)");
  });

  it("updating a rule changes its condition and Category in place", () => {
    let { document, accountId } = withAccount();
    const created = must(createRule(document, reference));
    document = must(createRule(created.document, billaRule)).document;
    document = must(
      updateRule(document, { id: created.id, condition: { field: "purpose", operator: "contains", text: "billa" }, categoryId: "sonstiges" }),
    ).document;
    expect(listRules(document)[0]).toEqual({
      id: created.id,
      condition: { field: "purpose", operator: "contains", text: "billa" },
      categoryId: "sonstiges",
    });
    expect(classified(importRows(document, accountId, billaRows))["Kartenzahlung Billa"]).toBe("Sonstiges (rule)");
  });

  it("deleting a Category deletes its rules and sends what they categorized back to the inbox", () => {
    let { document, accountId } = withAccount();
    document = must(createRule(document, { ...billaRule, categoryId: "sonstiges-geschenke" })).document;
    document = importRows(document, accountId, billaRows);
    document = must(deleteCategory(document, { id: "sonstiges-geschenke" })).document;
    expect(listRules(document)).toEqual([]);
    expect(classified(document)["Kartenzahlung Billa"]).toBe("Unkategorisiert");
  });

  it("rejects an empty text, a missing amount, an unknown Category or rule", () => {
    const { document } = withAccount();
    const code = (r: Result<object>) => (r.ok ? "ok" : r.error.code);
    expect(code(createRule(document, { ...billaRule, condition: { field: "counterparty", operator: "contains", text: "  " } }))).toBe("text-required");
    expect(code(createRule(document, { ...billaRule, condition: { field: "amount", operator: "equals", amountCents: 1.5 } }))).toBe("amount-required");
    expect(code(createRule(document, { ...billaRule, categoryId: "nope" }))).toBe("category-not-found");
    expect(code(deleteRule(document, { id: "r9" }))).toBe("rule-not-found");
    expect(code(updateRule(document, { id: "r9", ...billaRule }))).toBe("rule-not-found");
  });
});
