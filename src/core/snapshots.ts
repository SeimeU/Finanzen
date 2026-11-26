import type { HoldingValue, Snapshot, WealthDocument, YearMonth } from "./document";
import { fail, type Result } from "./result";
import { valuationOfHolding } from "./structure";

export type SnapshotInput = {
  month: YearMonth;
  /** "YYYY-MM-DD"; passed in so the core never reads the clock. */
  today: string;
  holdingValues: { holdingId: string; marketValue: number; contribution?: number | null }[];
};

/**
 * Stores the values for one month. A month has at most one Snapshot: saving it again
 * replaces its holdingValues (other fields of an existing Snapshot are kept).
 */
export function saveSnapshot(document: WealthDocument, input: SnapshotInput): Result<{ document: WealthDocument }> {
  if (!isYearMonth(input.month)) return fail("invalid-month", "Bitte einen gültigen Monat wählen.");
  if (input.month > String(input.today).slice(0, 7)) {
    return fail("month-in-future", "Ein Monatsstand kann nicht für einen künftigen Monat erfasst werden.");
  }
  const holdingValues: HoldingValue[] = [];
  for (const v of input.holdingValues ?? []) {
    if (!document.holdings.some((h) => h.id === v.holdingId)) {
      return fail("holding-not-found", "Die Position gibt es nicht.");
    }
    if (holdingValues.some((h) => h.holdingId === v.holdingId)) {
      return fail("duplicate-holding", "Eine Position kann nur einen Wert pro Monat haben.");
    }
    const contribution = v.contribution ?? null;
    if (!Number.isSafeInteger(v.marketValue) || (contribution !== null && !Number.isSafeInteger(contribution))) {
      return fail("invalid-amount", "Bitte Beträge in Euro und Cent eingeben.");
    }
    holdingValues.push({ holdingId: v.holdingId, marketValue: v.marketValue, contribution });
  }
  const existing = document.snapshots.find((s) => s.month === input.month);
  const snapshot: Snapshot = { ...existing, month: input.month, holdingValues };
  const snapshots = [...document.snapshots.filter((s) => s.month !== input.month), snapshot].sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  return { ok: true, document: { ...document, snapshots } };
}

function isYearMonth(raw: unknown): raw is YearMonth {
  return typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw);
}

/** One Holding's value in a month: recorded that month, or carried forward (notUpdated). */
export type HoldingMonthValue = HoldingValue & { notUpdated: boolean };

export type NetWorthMonth = {
  month: YearMonth;
  /** Cents; debts count negatively. */
  netWorth: number;
  /** Every Holding that has a value by this month, in document order. */
  holdings: HoldingMonthValue[];
};

/**
 * Net worth for every month from the first to the last Snapshot, gaps included.
 * A Holding without a value in a month carries forward its latest earlier value.
 */
export function netWorthSeries(document: WealthDocument): NetWorthMonth[] {
  const first = document.snapshots[0];
  const last = document.snapshots.at(-1);
  if (!first || !last) return [];
  const latest = new Map<string, HoldingValue>();
  const series: NetWorthMonth[] = [];
  for (let month = first.month; month <= last.month; month = nextMonth(month)) {
    const recorded = new Map(
      (document.snapshots.find((s) => s.month === month)?.holdingValues ?? []).map((v) => [v.holdingId, v]),
    );
    for (const value of recorded.values()) latest.set(value.holdingId, value);
    const holdings: HoldingMonthValue[] = [];
    let netWorth = 0;
    for (const holding of document.holdings) {
      const own = recorded.get(holding.id);
      const value = own ?? latest.get(holding.id);
      if (!value) continue;
      holdings.push(
        own ? { ...own, notUpdated: false } : { holdingId: holding.id, marketValue: value.marketValue, contribution: null, notUpdated: true },
      );
      netWorth += valuationOfHolding(document, holding.id).sign * value.marketValue;
    }
    series.push({ month, netWorth, holdings });
  }
  return series;
}

export type SnapshotFormHolding = {
  id: string;
  name: string;
  /** Not Cash: the form offers a Contribution field. */
  isInvestment: boolean;
  /** Value as of the previous month (carried forward), null if it has none. */
  previousValue: number | null;
  /** Pre-fill: this month's recorded value, else previousValue. */
  marketValue: number | null;
  contribution: number | null;
  /** Whether this month's Snapshot has a value for the Holding. */
  recorded: boolean;
};

export type SnapshotForm = {
  month: YearMonth;
  /** Whether this month already has a Snapshot (saving replaces it). */
  exists: boolean;
  /** Net worth of the previous month, null if nothing was recorded before. */
  previousNetWorth: number | null;
  institutions: {
    id: string;
    name: string;
    accounts: { id: string; name: string; isDebt: boolean; holdings: SnapshotFormHolding[] }[];
  }[];
};

/** Everything the Monatsstand form for `month` shows. Amounts in cents; debts positive. */
export function snapshotForm(document: WealthDocument, month: YearMonth): SnapshotForm {
  const previous = valuesAsOf(document, previousMonth(month));
  const current = document.snapshots.find((s) => s.month === month);
  const recorded = new Map((current?.holdingValues ?? []).map((v) => [v.holdingId, v]));
  const hasPrevious = document.snapshots.some((s) => s.month < month);
  let previousNetWorth = 0;
  for (const [holdingId, value] of previous) {
    previousNetWorth += valuationOfHolding(document, holdingId).sign * value.marketValue;
  }
  return {
    month,
    exists: current !== undefined,
    previousNetWorth: hasPrevious ? previousNetWorth : null,
    institutions: document.institutions.map((institution) => ({
      id: institution.id,
      name: institution.name,
      accounts: document.accounts
        .filter((a) => a.institutionId === institution.id)
        .map((account) => ({
          id: account.id,
          name: account.name,
          isDebt: account.isDebt,
          holdings: document.holdings
            .filter((h) => h.accountId === account.id)
            .map((holding) => {
              const own = recorded.get(holding.id);
              const previousValue = previous.get(holding.id)?.marketValue ?? null;
              return {
                id: holding.id,
                name: holding.name,
                isInvestment: holding.classification.assetClass !== "cash",
                previousValue,
                marketValue: own ? own.marketValue : previousValue,
                contribution: own ? own.contribution : null,
                recorded: own !== undefined,
              };
            }),
        })),
    })),
  };
}

/** Each Holding's latest value recorded in or before `month`. */
function valuesAsOf(document: WealthDocument, month: YearMonth): Map<string, HoldingValue> {
  const latest = new Map<string, HoldingValue>();
  for (const snapshot of document.snapshots) {
    if (snapshot.month > month) break;
    for (const value of snapshot.holdingValues) latest.set(value.holdingId, value);
  }
  return latest;
}

export function nextMonth(month: YearMonth): YearMonth {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}

export function previousMonth(month: YearMonth): YearMonth {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}
