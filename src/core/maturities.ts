import { accountIsOpen } from "./closing";
import type { Account, Holding, WealthDocument, YearMonth } from "./document";
import { isAccountLevelMonth, netWorthSeries } from "./snapshots";
import { isMatured, valuationOfAccount, valuationOfHolding } from "./structure";

/**
 * One entry on the maturity timeline: a Locked Holding, or an Account Locked via its Default
 * classification while it is valued as a whole (Kontostand gesamt; `holdingId`/`holdingName` null).
 */
export type MaturityEntry = {
  holdingId: string | null;
  holdingName: string | null;
  accountId: string;
  accountName: string;
  /** "YYYY-MM-DD". */
  maturityDate: string;
  /** Latest Market value in cents (carried forward like Net worth; a debt counts negatively); null without any value. */
  marketValue: number | null;
  /** The Maturity date has passed (it is before today): the money is Available now. */
  matured: boolean;
};

export type MaturityTimeline = {
  /** Ordered by Maturity date, then document order. */
  entries: MaturityEntry[];
  /** The earliest Maturity date not yet passed, with the total of the Holdings maturing that day; null if none. */
  next: NextMaturity | null;
};

export type NextMaturity = {
  maturityDate: string;
  /** Cents; Holdings without a value count 0. */
  amount: number;
};

/**
 * The open Locked Holdings and Accounts ordered by Maturity date, with their latest Market value.
 * An Account valued as a whole in the latest month (Account-level values) counts as one entry under
 * its Default classification, as in Net worth; its Holdings have no values of their own then.
 * `today` is "YYYY-MM-DD".
 */
export function maturityTimeline(document: WealthDocument, today: string): MaturityTimeline {
  const todayMonth = today.slice(0, 7);
  const latest = netWorthSeries(document).at(-1);
  const valuedAsWhole = (account: Account) => isAccountLevelMonth(account, latest?.month ?? todayMonth);
  const accountName = (accountId: string) => document.accounts.find((a) => a.id === accountId)!.name;
  const holdingEntries = document.holdings
    .filter((holding) => isOpenLocked(document, holding, todayMonth))
    .filter((holding) => !valuedAsWhole(document.accounts.find((a) => a.id === holding.accountId)!))
    .map((holding): MaturityEntry => {
      const value = latest?.holdings.find((v) => v.holdingId === holding.id);
      return {
        holdingId: holding.id,
        holdingName: holding.name,
        accountId: holding.accountId,
        accountName: accountName(holding.accountId),
        maturityDate: holding.classification.maturityDate!,
        marketValue: value ? valuationOfHolding(document, holding.id).sign * value.marketValue : null,
        matured: isMatured(holding.classification, today),
      };
    });
  const accountEntries = document.accounts
    .filter((account) => account.defaultClassification.liquidity === "locked" && accountIsOpen(account, todayMonth))
    .filter(valuedAsWhole)
    .map((account): MaturityEntry => {
      const value = latest?.accounts.find((v) => v.accountId === account.id);
      return {
        holdingId: null,
        holdingName: null,
        accountId: account.id,
        accountName: account.name,
        maturityDate: account.defaultClassification.maturityDate!,
        marketValue: value ? valuationOfAccount(document, account.id).sign * value.marketValue : null,
        matured: isMatured(account.defaultClassification, today),
      };
    });
  // Stable sort: equal dates keep document order, Holdings before Accounts.
  const entries = [...holdingEntries, ...accountEntries].sort((a, b) =>
    a.maturityDate < b.maturityDate ? -1 : a.maturityDate > b.maturityDate ? 1 : 0,
  );
  const nextDate = entries.find((e) => !e.matured)?.maturityDate;
  const next =
    nextDate === undefined
      ? null
      : {
          maturityDate: nextDate,
          amount: entries.filter((e) => e.maturityDate === nextDate).reduce((sum, e) => sum + (e.marketValue ?? 0), 0),
        };
  return { entries, next };
}

/**
 * The one check deciding which Holdings the timeline lists: Locked, and neither it nor its
 * Account closed as of `month` (today's). A Holding not yet started still counts.
 */
function isOpenLocked(document: WealthDocument, holding: Holding, month: YearMonth): boolean {
  const account = document.accounts.find((a) => a.id === holding.accountId)!;
  return (
    holding.classification.liquidity === "locked" &&
    (holding.closingMonth === null || month < holding.closingMonth) &&
    accountIsOpen(account, month)
  );
}
