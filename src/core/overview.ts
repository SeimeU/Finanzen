import type { WealthDocument, YearMonth } from "./document";
import { netWorthSeries, type NetWorthMonth } from "./snapshots";
import { valuationOfAccount, valuationOfHolding } from "./structure";

/** Change in Net worth from `since` to the overview's month. */
export type NetWorthChange = {
  since: YearMonth;
  /** Cents. */
  amount: number;
  /** Percent of the earlier Net worth's size (its absolute value); null when that was 0. */
  percent: number | null;
};

export type InstitutionShare = { institutionId: string; name: string; value: number };

/** The start screen's headline figures and current breakdowns. Amounts in cents; debts count negatively. */
export type CurrentOverview = {
  /** The latest month with a Snapshot. */
  month: YearMonth;
  netWorth: number;
  /** null when the previous month is before the first Snapshot. */
  vsLastMonth: NetWorthChange | null;
  /** null when the month 12 months earlier is before the first Snapshot. */
  vs12MonthsAgo: NetWorthChange | null;
  byAssetClass: NetWorthMonth["byAssetClass"];
  byLiquidity: NetWorthMonth["byLiquidity"];
  /** Institutions with any value in the month, in document order. */
  byInstitution: InstitutionShare[];
};

/** Net worth in the latest month with its changes and breakdowns; null without any Snapshot. */
export function currentOverview(document: WealthDocument): CurrentOverview | null {
  const series = netWorthSeries(document);
  const latest = series.at(-1);
  if (!latest) return null;
  const change = (monthsBack: number): NetWorthChange | null => {
    const earlier = series[series.length - 1 - monthsBack];
    if (!earlier) return null;
    const amount = latest.netWorth - earlier.netWorth;
    return {
      since: earlier.month,
      amount,
      percent: earlier.netWorth === 0 ? null : (amount / Math.abs(earlier.netWorth)) * 100,
    };
  };
  return {
    month: latest.month,
    netWorth: latest.netWorth,
    vsLastMonth: change(1),
    vs12MonthsAgo: change(12),
    byAssetClass: latest.byAssetClass,
    byLiquidity: latest.byLiquidity,
    byInstitution: byInstitution(document, latest),
  };
}

function byInstitution(document: WealthDocument, month: NetWorthMonth): InstitutionShare[] {
  const totals = new Map<string, number>();
  const add = (accountId: string, signedValue: number) => {
    const institutionId = document.accounts.find((a) => a.id === accountId)!.institutionId;
    totals.set(institutionId, (totals.get(institutionId) ?? 0) + signedValue);
  };
  for (const v of month.accounts) add(v.accountId, valuationOfAccount(document, v.accountId).sign * v.marketValue);
  for (const v of month.holdings) {
    const accountId = document.holdings.find((h) => h.id === v.holdingId)!.accountId;
    add(accountId, valuationOfHolding(document, v.holdingId).sign * v.marketValue);
  }
  return document.institutions
    .filter((i) => totals.has(i.id))
    .map((i) => ({ institutionId: i.id, name: i.name, value: totals.get(i.id)! }));
}
