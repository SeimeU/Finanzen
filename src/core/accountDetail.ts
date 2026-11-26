import type { Classification, YearMonth, WealthDocument } from "./document";
import { netWorthSeries, type NetWorthMonth } from "./snapshots";
import { valuationOfHolding, type Valuation } from "./structure";

/**
 * One value counted in a month's Net worth, resolved through the valuation helpers.
 * Today every entry is a Holding's value; Account-level values (ticket 04) add
 * entries here with `holdingId: null` and the Account's valuation, and every
 * query below picks them up.
 */
type ValuedEntry = {
  accountId: string;
  holdingId: string | null;
  valuation: Valuation;
  marketValue: number;
  contribution: number | null;
  notUpdated: boolean;
};

function valuedEntries(document: WealthDocument, month: NetWorthMonth): ValuedEntry[] {
  return month.holdings.map((value) => ({
    accountId: document.holdings.find((h) => h.id === value.holdingId)!.accountId,
    holdingId: value.holdingId,
    valuation: valuationOfHolding(document, value.holdingId),
    marketValue: value.marketValue,
    contribution: value.contribution,
    notUpdated: value.notUpdated,
  }));
}

export type AccountMonth = {
  month: YearMonth;
  /** Cents, as counted in Net worth: a debt is negative. */
  value: number;
  /** Contributions recorded this month, signed like `value`. */
  contribution: number;
  /** No value of this Account was recorded this month; all were carried forward. */
  notUpdated: boolean;
};

export type AccountDetailHolding = {
  id: string;
  name: string;
  classification: Classification;
  /** Latest Market value (carried forward), as entered (debts positive); null if it has none. */
  marketValue: number | null;
  notUpdated: boolean;
};

export type AccountDetail = {
  id: string;
  name: string;
  institutionName: string;
  iban: string | null;
  isDebt: boolean;
  defaultClassification: Classification;
  /** Every month from the Account's first value to the last Snapshot. */
  series: AccountMonth[];
  holdings: AccountDetailHolding[];
};

/** One Account's value history and Holdings; null if the Account does not exist. */
export function accountDetail(document: WealthDocument, accountId: string): AccountDetail | null {
  const account = document.accounts.find((a) => a.id === accountId);
  if (!account) return null;
  const series: AccountMonth[] = [];
  let latest: NetWorthMonth | undefined;
  for (const month of netWorthSeries(document)) {
    latest = month;
    const entries = valuedEntries(document, month).filter((e) => e.accountId === accountId);
    if (entries.length === 0) continue;
    series.push({
      month: month.month,
      value: sum(entries.map((e) => e.valuation.sign * e.marketValue)),
      contribution: sum(entries.map((e) => e.valuation.sign * (e.contribution ?? 0))),
      notUpdated: entries.every((e) => e.notUpdated),
    });
  }
  const current = new Map((latest?.holdings ?? []).map((v) => [v.holdingId, v]));
  return {
    id: account.id,
    name: account.name,
    institutionName: document.institutions.find((i) => i.id === account.institutionId)?.name ?? "",
    iban: account.iban,
    isDebt: account.isDebt,
    defaultClassification: account.defaultClassification,
    series,
    holdings: document.holdings
      .filter((h) => h.accountId === accountId)
      .map((h) => ({
        id: h.id,
        name: h.name,
        classification: h.classification,
        marketValue: current.get(h.id)?.marketValue ?? null,
        notUpdated: current.get(h.id)?.notUpdated ?? false,
      })),
  };
}

export type ContributionMonth = {
  month: YearMonth;
  /** Net worth change since the previous month, in cents. Always contribution + marketChange + otherChange. */
  netWorthChange: number;
  /** Contributions paid into investment Holdings this month. */
  contribution: number;
  /** Investment Holdings' change beyond their Contributions: what the market added. */
  marketChange: number;
  /** Everything else: cash and debts (where Contributions are usually paid from). */
  otherChange: number;
}

/**
 * Per month (from the second month on), how much of the Net worth change came from
 * Contributions, from market changes of investments (not Cash) and from other changes.
 * A value that is new this month counts from zero.
 */
export function contributionSplit(document: WealthDocument): ContributionMonth[] {
  const result: ContributionMonth[] = [];
  let previous: Map<string, number> | null = null;
  let previousNetWorth = 0;
  for (const month of netWorthSeries(document)) {
    const entries = valuedEntries(document, month);
    const current = new Map(entries.map((e) => [entryKey(e), e.valuation.sign * e.marketValue]));
    if (previous) {
      let contribution = 0;
      let marketChange = 0;
      for (const entry of entries) {
        if (entry.valuation.classification.assetClass === "cash") continue;
        const paidIn = entry.valuation.sign * (entry.contribution ?? 0);
        const change = current.get(entryKey(entry))! - (previous.get(entryKey(entry)) ?? 0);
        contribution += paidIn;
        marketChange += change - paidIn;
      }
      const netWorthChange = month.netWorth - previousNetWorth;
      result.push({
        month: month.month,
        netWorthChange,
        contribution,
        marketChange,
        otherChange: netWorthChange - contribution - marketChange,
      });
    }
    previous = current;
    previousNetWorth = month.netWorth;
  }
  return result;
}

function entryKey(entry: ValuedEntry): string {
  return entry.holdingId ?? `account:${entry.accountId}`;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
