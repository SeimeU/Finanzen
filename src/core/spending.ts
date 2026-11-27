import { classifyTransactions, type ClassifiedTransaction } from "./classification";
import { accountIsOpen } from "./closing";
import type { Category, CategoryKind, WealthDocument, YearMonth } from "./document";
import { fail, type Result } from "./result";
import { nextMonth } from "./snapshots";

/**
 * Spending analysis (Ausgaben, Einnahmen, Sparquote). Every query reads Transactions
 * through classifyTransactions and switches on `cashFlow`:
 * - "income" / "expense": counted under its Category. Amounts are net: a refund on an
 *   expense Category lowers that Category's spending.
 * - "excluded" (Transfers, Trades): never counted.
 * - "unknown" (Uncategorized): never dropped. It counts by sign, outflows as expenses and
 *   inflows as income, in its own bucket "Nicht kategorisiert" (categoryId null).
 * All amounts are positive cents in the row's kind (spent for expenses, received for income).
 */

export const UNCATEGORIZED_LABEL = "Nicht kategorisiert";

/** A period: one month "YYYY-MM" or one year "YYYY". */
export type Period = string;

export type CategorySpendingRow = {
  /** null: Nicht kategorisiert. In a drill-down, the parent's own id for what was put on it directly. */
  categoryId: string | null;
  name: string;
  amount: number;
  /** A top-level Category with children: can be drilled down. */
  drillable: boolean;
};

/** One counted Transaction: in which kind, under which Category (null: Uncategorized), how much (positive = in the kind's direction). */
type Counted = { date: string; kind: CategoryKind; categoryId: string | null; amount: number };

function counted(document: WealthDocument): Counted[] {
  return classifyTransactions(document, document.transactions).flatMap((t: ClassifiedTransaction): Counted[] => {
    const c = t.classification;
    if (c.cashFlow === "excluded") return [];
    if (c.kind === "category") {
      const amount = c.cashFlow === "expense" ? -t.amountCents : t.amountCents;
      return [{ date: t.date, kind: c.cashFlow, categoryId: c.categoryId, amount }];
    }
    const kind: CategoryKind = t.amountCents < 0 ? "expense" : "income";
    return [{ date: t.date, kind, categoryId: null, amount: Math.abs(t.amountCents) }];
  });
}

const inPeriod = (date: string, period: Period) => date.startsWith(period);

/**
 * Spending (kind "expense") or income per Category in a month or year, largest first.
 * parentId null: top-level Categories (children rolled up) plus Nicht kategorisiert.
 * parentId set: that Category's children, plus "<name> (ohne Unterkategorie)" for
 * Transactions put on the top-level Category itself. Categories with nothing are left out.
 */
export function categorySpending(
  document: WealthDocument,
  input: { period: Period; kind: CategoryKind; parentId: string | null },
): CategorySpendingRow[] {
  const byId = new Map(document.categories.map((c) => [c.id, c]));
  const hasChildren = new Set(document.categories.flatMap((c) => (c.parentId ? [c.parentId] : [])));
  const totals = new Map<string | null, number>();
  for (const t of counted(document)) {
    if (t.kind !== input.kind || !inPeriod(t.date, input.period)) continue;
    const key = rowKey(t.categoryId, input.parentId, byId);
    if (key === undefined) continue;
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }
  return [...totals]
    .filter(([, amount]) => amount !== 0)
    .map(([categoryId, amount]): CategorySpendingRow => {
      if (categoryId === null) return { categoryId, name: UNCATEGORIZED_LABEL, amount, drillable: false };
      const category = byId.get(categoryId)!;
      if (categoryId === input.parentId) {
        return { categoryId, name: `${category.name} (ohne Unterkategorie)`, amount, drillable: false };
      }
      return { categoryId, name: category.name, amount, drillable: input.parentId === null && hasChildren.has(categoryId) };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * One Category's amount (a top-level one with its children) in every month or year from the
 * first to the last Transaction, empty periods as 0: for comparing between months or years.
 * categoryId null: Nicht kategorisiert spending (Uncategorized outflows).
 */
export function categoryHistory(
  document: WealthDocument,
  input: { categoryId: string | null; by: "month" | "year" },
): { period: Period; amount: number }[] {
  const all = counted(document);
  if (all.length === 0) return [];
  const byId = new Map(document.categories.map((c) => [c.id, c]));
  const category = input.categoryId === null ? null : byId.get(input.categoryId);
  if (category === undefined) return [];
  const kind: CategoryKind = category ? category.kind : "expense";
  const matches = (categoryId: string | null) =>
    category === null
      ? categoryId === null
      : categoryId !== null && (categoryId === category.id || byId.get(categoryId)?.parentId === category.id);
  const length = input.by === "month" ? 7 : 4;
  const totals = new Map<Period, number>();
  for (const t of all) {
    if (t.kind !== kind || !matches(t.categoryId)) continue;
    const period = t.date.slice(0, length);
    totals.set(period, (totals.get(period) ?? 0) + t.amount);
  }
  const months = all.map((t) => t.date.slice(0, 7)).sort();
  const periods: Period[] = [];
  if (input.by === "month") {
    for (let month = months[0]!; month <= months.at(-1)!; month = nextMonth(month)) periods.push(month);
  } else {
    for (let year = Number(months[0]!.slice(0, 4)); year <= Number(months.at(-1)!.slice(0, 4)); year++) periods.push(String(year));
  }
  return periods.map((period) => ({ period, amount: totals.get(period) ?? 0 }));
}

export type CashFlowMonth = {
  month: YearMonth;
  /** Positive cents: received, and spent (net of refunds). Uncategorized counts by sign. */
  income: number;
  expenses: number;
  /** Uncategorized Transactions counted in income or expenses this month. */
  uncategorizedCount: number;
  /**
   * Complete: every open Account flagged as carrying income or spending has an import covering
   * the month (see ImportRecord.coveredFrom). Without any flagged Account no month is complete.
   */
  complete: boolean;
  incompleteReason: "no-accounts-flagged" | "accounts-missing" | null;
  /** The flagged Accounts whose imports leave a gap in this month. */
  missingAccounts: { id: string; name: string }[];
  /** (income − expenses) ÷ income as a fraction (0.25 = 25 %); null when incomplete or without income. */
  savingsRate: number | null;
};

/** Income versus expenses and the Savings rate, for every month from the first to the last Transaction (gaps included). */
export function cashFlowMonths(document: WealthDocument): CashFlowMonth[] {
  const all = counted(document);
  if (all.length === 0) return [];
  const months = all.map((t) => t.date.slice(0, 7)).sort();
  const coverage = coverageByAccount(document);
  const flagged = document.accounts.filter((a) => a.carriesCashFlow);
  const result: CashFlowMonth[] = [];
  for (let month = months[0]!; month <= months.at(-1)!; month = nextMonth(month)) {
    let income = 0;
    let expenses = 0;
    let uncategorizedCount = 0;
    for (const t of all) {
      if (!inPeriod(t.date, month)) continue;
      if (t.kind === "income") income += t.amount;
      else expenses += t.amount;
      if (t.categoryId === null) uncategorizedCount++;
    }
    const required = flagged.filter((a) => accountIsOpen(a, month));
    const missingAccounts = required
      .filter((a) => !covers(coverage.get(a.id) ?? [], month))
      .map((a) => ({ id: a.id, name: a.name }));
    const incompleteReason = flagged.length === 0 ? "no-accounts-flagged" : missingAccounts.length > 0 ? "accounts-missing" : null;
    const complete = incompleteReason === null;
    result.push({
      month,
      income,
      expenses,
      uncategorizedCount,
      complete,
      incompleteReason,
      missingAccounts,
      savingsRate: complete && income > 0 ? (income - expenses) / income : null,
    });
  }
  return result;
}

/** Flags (or unflags) an Account as carrying income or spending, for the Savings rate's completeness. */
export function setAccountCarriesCashFlow(
  document: WealthDocument,
  input: { accountId: string; carriesCashFlow: boolean },
): Result<{ document: WealthDocument }> {
  if (!document.accounts.some((a) => a.id === input.accountId)) return fail("account-not-found", "Das Konto gibt es nicht.");
  return {
    ok: true,
    document: {
      ...document,
      accounts: document.accounts.map((a) => (a.id === input.accountId ? { ...a, carriesCashFlow: input.carriesCashFlow === true } : a)),
    },
  };
}

type MonthRange = { from: YearMonth; to: YearMonth };

/** Per Account: the month ranges its imported files cover, merged where they overlap or adjoin. */
function coverageByAccount(document: WealthDocument): Map<string, MonthRange[]> {
  const byAccount = new Map<string, MonthRange[]>();
  const sorted = document.imports
    .filter((i) => i.coveredFrom && i.coveredTo)
    .map((i) => ({ accountId: i.accountId, from: i.coveredFrom, to: i.coveredTo }))
    .sort((a, b) => a.from.localeCompare(b.from));
  for (const range of sorted) {
    const ranges = byAccount.get(range.accountId) ?? [];
    const last = ranges.at(-1);
    if (last && range.from <= nextMonth(last.to)) {
      if (range.to > last.to) last.to = range.to;
    } else ranges.push({ from: range.from, to: range.to });
    byAccount.set(range.accountId, ranges);
  }
  return byAccount;
}

function covers(ranges: MonthRange[], month: YearMonth): boolean {
  return ranges.some((r) => r.from <= month && r.to >= month);
}

/** Which row a Transaction's Category lands in; undefined: not shown at this level. */
function rowKey(categoryId: string | null, parentId: string | null, byId: Map<string, Category>): string | null | undefined {
  if (categoryId === null) return parentId === null ? null : undefined;
  const top = topLevelOf(categoryId, byId);
  if (parentId === null) return top;
  return top === parentId ? categoryId : undefined;
}

function topLevelOf(categoryId: string, byId: Map<string, Category>): string {
  return byId.get(categoryId)?.parentId ?? categoryId;
}
