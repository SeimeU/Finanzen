import { accountIsOpen } from "./closing";
import type { Holding, WealthDocument, YearMonth } from "./document";
import { netWorthSeries } from "./snapshots";
import { valuationOfHolding } from "./structure";

/** One Locked Holding on the maturity timeline. */
export type MaturityEntry = {
  holdingId: string;
  holdingName: string;
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

/** The open Locked Holdings ordered by Maturity date, with their latest Market value. `today` is "YYYY-MM-DD". */
export function maturityTimeline(document: WealthDocument, today: string): MaturityTimeline {
  const latest = netWorthSeries(document).at(-1);
  const entries = document.holdings
    .filter((holding) => isOpenLocked(document, holding, today.slice(0, 7)))
    .map((holding): MaturityEntry => {
      const value = latest?.holdings.find((v) => v.holdingId === holding.id);
      const maturityDate = holding.classification.maturityDate!;
      return {
        holdingId: holding.id,
        holdingName: holding.name,
        accountId: holding.accountId,
        accountName: document.accounts.find((a) => a.id === holding.accountId)!.name,
        maturityDate,
        marketValue: value ? valuationOfHolding(document, holding.id).sign * value.marketValue : null,
        matured: maturityDate < today,
      };
    })
    .sort((a, b) => (a.maturityDate < b.maturityDate ? -1 : a.maturityDate > b.maturityDate ? 1 : 0));
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
