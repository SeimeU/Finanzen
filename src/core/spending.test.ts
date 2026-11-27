import { describe, expect, it } from "vitest";
import {
  cashFlowMonths,
  categoryHistory,
  categorySpending,
  closeAccount,
  setAccountCarriesCashFlow,
  confirmImport,
  createAccount,
  createEmptyDocument,
  createInstitution,
  setTransactionCategory,
  type Result,
  type WealthDocument,
} from "./index";

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
const IMPORTED_AT = "2026-11-26T10:00:00.000Z";
const TR_IBAN = "DE89370400440532013000";
const TR_HEADER =
  "datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,original_amount,original_currency,fx_rate,description,transaction_id,counterparty_name,counterparty_iban,payment_reference,mcc_code";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

/** A Raiffeisen Girokonto and a Trade Republic Verrechnungskonto (with an IBAN, so Transfers to it are detected). */
function twoAccounts() {
  const document = createEmptyDocument();
  const rb = must(createInstitution(document, { name: "Raiffeisenbank Wien" }));
  const tr = must(createInstitution(rb.document, { name: "Trade Republic" }));
  const giro = must(createAccount(tr.document, { institutionId: rb.id, name: "Girokonto", defaultClassification: CASH }));
  const cash = must(
    createAccount(giro.document, { institutionId: tr.id, name: "Verrechnungskonto", iban: TR_IBAN, defaultClassification: CASH }),
  );
  return { document: cash.document, giro: giro.id, tr: cash.id };
}

/** One ELBA row: date "DD.MM.YYYY", German amount; the purpose is the row's label. */
function elba(date: string, amount: string, purpose: string, iban?: string): string {
  const text = iban
    ? `Überweisung Verwendungszweck: ${purpose} IBAN Empfänger: ${iban} Empfänger: Max Mustermann`
    : `Bezahlung Karte Verwendungszweck: ${purpose} Empfänger: Händler`;
  return `${date};${text};${date};${amount};EUR;${date} 12:00:00:000`;
}

/** One Trade Republic row. */
function tr(date: string, category: string, type: string, amount: string, description: string): string {
  return `${date}T10:00:00Z,${date},DEFAULT,${category},${type},,,,,,${amount},,,EUR,,,,${description},id-${description},,,,`;
}

function importFile(document: WealthDocument, accountId: string, name: string, lines: string[]): WealthDocument {
  return must(
    confirmImport(document, {
      importedAt: IMPORTED_AT,
      files: [{ name, bytes: new TextEncoder().encode(lines.join("\n")), accountId }],
    }),
  ).document;
}

/** Sets a manual Category on the Transactions with the given purposes. */
function categorize(document: WealthDocument, byPurpose: Record<string, string>): WealthDocument {
  let result = document;
  for (const [purpose, categoryId] of Object.entries(byPurpose)) {
    const t = result.transactions.find((x) => x.purpose === purpose);
    if (!t) throw new Error(`no Transaction "${purpose}"`);
    result = must(setTransactionCategory(result, { transactionId: t.id, categoryId })).document;
  }
  return result;
}

/** November on the Girokonto plus interest, a tax row and a Trade on Trade Republic. */
function november() {
  const { document, giro, tr: trAccount } = twoAccounts();
  let d = importFile(document, giro, "elba.csv", [
    elba("01.11.2026", "3.000,00", "Gehalt November"),
    elba("02.11.2026", "-900,00", "Miete November"),
    elba("05.11.2026", "-60,00", "BILLA"),
    elba("12.11.2026", "-40,00", "SPAR"),
    elba("15.11.2026", "-30,00", "Unbekannt"),
    elba("20.11.2026", "-500,00", "Sparen", "DE89 3704 0044 0532 0130 00"),
    elba("30.11.2026", "-100,00", "Wohnen allgemein"),
  ]);
  d = importFile(d, trAccount, "tr.csv", [
    TR_HEADER,
    tr("2026-11-21", "TRADING", "BUY", "-400.00", "Kauf ETF"),
    tr("2026-11-30", "CASH", "INTEREST_PAYMENT", "12.00", "Zinsen"),
    tr("2026-11-30", "CASH", "TAX_PAYMENT", "-3.00", "KESt"),
  ]);
  d = categorize(d, {
    "Gehalt November": "einkommen-gehalt",
    "Miete November": "wohnen-miete",
    BILLA: "lebensmittel-supermarkt",
    SPAR: "lebensmittel-supermarkt",
    "Wohnen allgemein": "wohnen",
  });
  return { document: d, giro, tr: trAccount };
}

/** "name: amount" per row, amounts in cents. */
const rows = (r: { name: string; amount: number }[]) => r.map((x) => `${x.name}: ${x.amount}`);

describe("spending and income by Category", () => {
  it("top level: expenses per top-level Category, Uncategorized outflows in their own bucket, Transfers and Trades left out", () => {
    const { document } = november();
    expect(rows(categorySpending(document, { period: "2026-11", kind: "expense", parentId: null }))).toEqual([
      "Wohnen: 100000",
      "Lebensmittel: 10000",
      "Nicht kategorisiert: 3000",
      "Steuern: 300",
    ]);
    expect(rows(categorySpending(document, { period: "2026-11", kind: "income", parentId: null }))).toEqual([
      "Einkommen: 300000",
      "Kapitalerträge: 1200",
    ]);
  });

  it("drilled down: a top-level Category's children, plus what was put on the top level itself", () => {
    const { document } = november();
    expect(rows(categorySpending(document, { period: "2026-11", kind: "expense", parentId: "wohnen" }))).toEqual([
      "Miete: 90000",
      "Wohnen (ohne Unterkategorie): 10000",
    ]);
  });
});

describe("comparing a Category's spending between months or years", () => {
  function twoYears() {
    const { document, giro } = twoAccounts();
    let d = importFile(document, giro, "elba.csv", [
      elba("10.11.2025", "-50,00", "BILLA 2025"),
      elba("10.10.2026", "-80,00", "BILLA Okt"),
      elba("12.10.2026", "-5,00", "Bäcker Okt"),
      elba("10.12.2026", "-95,00", "BILLA Dez"),
      elba("11.12.2026", "-7,00", "Offen"),
    ]);
    d = categorize(d, {
      "BILLA 2025": "lebensmittel-supermarkt",
      "BILLA Okt": "lebensmittel-supermarkt",
      "Bäcker Okt": "lebensmittel-baeckerei",
      "BILLA Dez": "lebensmittel-supermarkt",
    });
    return d;
  }
  const series = (r: { period: string; amount: number }[]) => r.map((x) => `${x.period}: ${x.amount}`);

  it("by month: a top-level Category with its children, every month in the range, empty ones as 0", () => {
    const history = categoryHistory(twoYears(), { categoryId: "lebensmittel", by: "month" });
    expect(series(history).slice(-3)).toEqual(["2026-10: 8500", "2026-11: 0", "2026-12: 9500"]);
    expect(history[0]).toEqual({ period: "2025-11", amount: 5000 });
  });

  it("by year, and for a child Category or Nicht kategorisiert", () => {
    const d = twoYears();
    expect(series(categoryHistory(d, { categoryId: "lebensmittel", by: "year" }))).toEqual(["2025: 5000", "2026: 18000"]);
    expect(series(categoryHistory(d, { categoryId: "lebensmittel-baeckerei", by: "year" }))).toEqual(["2025: 0", "2026: 500"]);
    expect(series(categoryHistory(d, { categoryId: null, by: "year" }))).toEqual(["2025: 0", "2026: 700"]);
  });
});

/** Flags the given Accounts as carrying income and spending. */
function flag(document: WealthDocument, ...accountIds: string[]): WealthDocument {
  return accountIds.reduce((d, accountId) => must(setAccountCarriesCashFlow(d, { accountId, carriesCashFlow: true })).document, document);
}

describe("income versus expenses and the Savings rate (Sparquote)", () => {
  it("per month: income and expenses exclude Transfers and Trades; Savings rate = (income − expenses) ÷ income", () => {
    const { document, giro } = november();
    const [month] = cashFlowMonths(flag(document, giro));
    // Income: Gehalt 3.000 + Zinsen 12. Expenses: Miete 900, Wohnen 100, Lebensmittel 100, Unbekannt 30, KESt 3.
    expect(month).toMatchObject({ month: "2026-11", income: 301200, expenses: 113300, uncategorizedCount: 1 });
    expect(month!.complete).toBe(true);
    expect(month!.savingsRate).toBeCloseTo(0.6238379814, 8);
  });

  it("lists every month from the first to the last Transaction, gaps included", () => {
    const { document, giro } = twoAccounts();
    let d = importFile(document, giro, "sep.csv", [elba("10.09.2026", "-10,00", "A")]);
    d = importFile(d, giro, "nov.csv", [elba("10.11.2026", "-20,00", "B")]);
    expect(cashFlowMonths(d).map((m) => `${m.month}: ${m.expenses}`)).toEqual(["2026-09: 1000", "2026-10: 0", "2026-11: 2000"]);
  });

  it("is a negative Savings rate when expenses exceed income, and none at all without income", () => {
    const { document, giro } = twoAccounts();
    let d = importFile(document, giro, "nov.csv", [
      elba("01.11.2026", "1.000,00", "Gehalt"),
      elba("30.11.2026", "-1.500,00", "Urlaub"),
    ]);
    d = categorize(flag(d, giro), { Gehalt: "einkommen-gehalt", Urlaub: "freizeit-urlaub" });
    expect(cashFlowMonths(d)[0]!.savingsRate).toBeCloseTo(-0.5, 10);
    const noIncome = categorize(d, { Gehalt: "freizeit-urlaub" });
    expect(cashFlowMonths(noIncome)[0]).toMatchObject({ income: 0, complete: true, savingsRate: null });
  });
});

describe("incomplete months", () => {
  it("without any Account flagged as carrying income or spending, no month is complete", () => {
    const { document } = november();
    expect(cashFlowMonths(document)[0]).toMatchObject({
      complete: false,
      incompleteReason: "no-accounts-flagged",
      missingAccounts: [],
      savingsRate: null,
    });
  });

  it("a flagged Account whose imports do not cover the month makes it incomplete instead of showing a Savings rate", () => {
    const { document, giro, tr: trAccount } = twoAccounts();
    let d = importFile(document, giro, "nov.csv", [elba("03.11.2026", "1.000,00", "Gehalt")]);
    // Trade Republic's only file is from October.
    d = importFile(d, trAccount, "tr.csv", [TR_HEADER, tr("2026-10-15", "CASH", "INTEREST_PAYMENT", "1.00", "Zinsen")]);
    expect(cashFlowMonths(flag(d, giro, trAccount)).at(-1)).toMatchObject({
      month: "2026-11",
      complete: false,
      incompleteReason: "accounts-missing",
      missingAccounts: [{ id: trAccount, name: "Verrechnungskonto" }],
      savingsRate: null,
      income: 100000,
    });
  });

  it("an import covers every whole month from the month of its first booking to the month of its last", () => {
    const { document, giro, tr: trAccount } = november();
    // Trade Republic's file starts on 21 November and has no booking on the 1st: November still counts.
    expect(cashFlowMonths(flag(document, giro, trAccount))[0]).toMatchObject({ complete: true, missingAccounts: [] });

    const { document: empty, giro: g } = twoAccounts();
    const d = importFile(empty, g, "herbst.csv", [elba("05.09.2026", "100,00", "A"), elba("20.11.2026", "-10,00", "B")]);
    expect(cashFlowMonths(flag(d, g)).map((m) => `${m.month}: ${m.complete}`)).toEqual([
      "2026-09: true",
      "2026-10: true",
      "2026-11: true",
    ]);
  });

  it("a month between two imports of a flagged Account is incomplete, the months the files cover are complete", () => {
    const { document, giro } = twoAccounts();
    let d = importFile(document, giro, "sep.csv", [elba("03.09.2026", "100,00", "A"), elba("20.09.2026", "-10,00", "B")]);
    d = importFile(d, giro, "nov.csv", [elba("04.11.2026", "100,00", "C"), elba("28.11.2026", "-20,00", "D")]);
    expect(cashFlowMonths(flag(d, giro)).map((m) => `${m.month}: ${m.complete}`)).toEqual([
      "2026-09: true",
      "2026-10: false",
      "2026-11: true",
    ]);
  });

  it("coverage is the whole date range of each imported file, duplicate rows included, and adjoining files join up", () => {
    const { document, giro } = twoAccounts();
    let d = importFile(document, giro, "a.csv", [elba("01.10.2026", "100,00", "A"), elba("31.10.2026", "-10,00", "B")]);
    // Its October row is a duplicate; only the November row is new, the file's range still starts 31 Oct.
    d = importFile(d, giro, "b.csv", [elba("31.10.2026", "-10,00", "B"), elba("30.11.2026", "-20,00", "C")]);
    d = importFile(d, giro, "c.csv", [elba("01.12.2026", "-5,00", "D"), elba("31.12.2026", "-5,00", "E")]);
    expect(cashFlowMonths(flag(d, giro)).map((m) => `${m.month}: ${m.complete}`)).toEqual([
      "2026-10: true",
      "2026-11: true",
      "2026-12: true",
    ]);
  });

  it("a closed Account is not needed from its closing month on", () => {
    const { document, giro, tr: trAccount } = november();
    const closed = must(closeAccount(flag(document, giro, trAccount), { accountId: trAccount, month: "2026-11" })).document;
    expect(cashFlowMonths(closed)[0]!.complete).toBe(true);
  });

  it("flagging an unknown Account is rejected", () => {
    const result = setAccountCarriesCashFlow(createEmptyDocument(), { accountId: "a9", carriesCashFlow: true });
    expect(result.ok ? null : result.error.code).toBe("account-not-found");
  });
});
