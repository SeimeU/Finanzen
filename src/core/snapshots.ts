import type {
  Account,
  AccountValue,
  AssetClass,
  HoldingValue,
  Liquidity,
  Snapshot,
  WealthDocument,
  YearMonth,
} from "./document";
import { isYearMonth } from "./document";
import { accountIsOpen, holdingIsActive } from "./closing";
import { fail, type Result } from "./result";
import { valuationOfAccount, valuationOfHolding, type Valuation } from "./structure";

export type SnapshotInput = {
  month: YearMonth;
  /** "YYYY-MM-DD"; passed in so the core never reads the clock. */
  today: string;
  holdingValues: { holdingId: string; marketValue: number; contribution?: number | null }[];
  /** Account-level values (Kontostand gesamt), for Accounts not yet per Holding in this month. */
  accountValues?: { accountId: string; marketValue: number }[];
};

const WRONG_MODE_HOLDING = "Für dieses Konto wird in diesem Monat der Kontostand gesamt erfasst, nicht pro Position.";
const NOT_ACTIVE_HOLDING = "Diese Position ist in diesem Monat geschlossen oder beginnt erst später.";
const ACCOUNT_CLOSED = "Dieses Konto ist in diesem Monat schon geschlossen.";
const WRONG_MODE_ACCOUNT = "Für dieses Konto werden in diesem Monat Werte pro Position erfasst, kein Kontostand gesamt.";

/** Whether `account` takes one Account-level value in `month` (it switches to per Holding later). */
export function isAccountLevelMonth(account: Account, month: YearMonth): boolean {
  return account.perHoldingFrom !== null && month < account.perHoldingFrom;
}

/**
 * Stores the values for one month. A month has at most one Snapshot: saving it again
 * replaces its holdingValues and accountValues (other fields of an existing Snapshot are kept).
 * Per Account, values per Holding and an Account-level value cannot be mixed in one month.
 */
export function saveSnapshot(document: WealthDocument, input: SnapshotInput): Result<{ document: WealthDocument }> {
  if (!isYearMonth(input.month)) return fail("invalid-month", "Bitte einen gültigen Monat wählen.");
  if (input.month > String(input.today).slice(0, 7)) {
    return fail("month-in-future", "Ein Monatsstand kann nicht für einen künftigen Monat erfasst werden.");
  }
  const accountValues: AccountValue[] = [];
  for (const v of input.accountValues ?? []) {
    if (!document.accounts.some((a) => a.id === v.accountId)) return fail("account-not-found", "Das Konto gibt es nicht.");
    if (accountValues.some((a) => a.accountId === v.accountId)) {
      return fail("duplicate-account", "Ein Konto kann nur einen Kontostand gesamt pro Monat haben.");
    }
    if (!Number.isSafeInteger(v.marketValue)) return fail("invalid-amount", "Bitte Beträge in Euro und Cent eingeben.");
    accountValues.push({ accountId: v.accountId, marketValue: v.marketValue });
  }
  const holdingValues: HoldingValue[] = [];
  for (const v of input.holdingValues ?? []) {
    const holding = document.holdings.find((h) => h.id === v.holdingId);
    if (!holding) return fail("holding-not-found", "Die Position gibt es nicht.");
    if (holdingValues.some((h) => h.holdingId === v.holdingId)) {
      return fail("duplicate-holding", "Eine Position kann nur einen Wert pro Monat haben.");
    }
    if (accountValues.some((a) => a.accountId === holding.accountId)) {
      return fail(
        "mixed-values",
        "Ein Konto hat in einem Monat entweder einen Kontostand gesamt oder Werte pro Position, nicht beides.",
      );
    }
    const contribution = v.contribution ?? null;
    if (!Number.isSafeInteger(v.marketValue) || (contribution !== null && !Number.isSafeInteger(contribution))) {
      return fail("invalid-amount", "Bitte Beträge in Euro und Cent eingeben.");
    }
    holdingValues.push({ holdingId: v.holdingId, marketValue: v.marketValue, contribution });
  }
  for (const v of holdingValues) {
    const holding = document.holdings.find((h) => h.id === v.holdingId)!;
    if (!accountIsOpen(accountOf(document, holding.accountId), input.month)) return fail("account-closed", ACCOUNT_CLOSED);
    if (isAccountLevelMonth(accountOf(document, holding.accountId), input.month)) {
      return fail("account-level-month", WRONG_MODE_HOLDING);
    }
    if (!holdingIsActive(holding, input.month)) {
      return fail("holding-not-active", NOT_ACTIVE_HOLDING);
    }
  }
  for (const v of accountValues) {
    if (!accountIsOpen(accountOf(document, v.accountId), input.month)) return fail("account-closed", ACCOUNT_CLOSED);
    if (!isAccountLevelMonth(accountOf(document, v.accountId), input.month)) {
      return fail("per-holding-month", WRONG_MODE_ACCOUNT);
    }
  }
  const existing = document.snapshots.find((s) => s.month === input.month);
  const snapshot: Snapshot = { ...existing, month: input.month, holdingValues, accountValues };
  const snapshots = [...document.snapshots.filter((s) => s.month !== input.month), snapshot].sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  return { ok: true, document: { ...document, snapshots } };
}

/**
 * Records the month from which `accountId` takes values per Holding; earlier months take
 * an Account-level value. null: per Holding in every month. Rejected when it would leave a
 * recorded value on the wrong side of the switch.
 */
export function setPerHoldingFrom(
  document: WealthDocument,
  input: { accountId: string; month: YearMonth | null },
): Result<{ document: WealthDocument }> {
  const account = document.accounts.find((a) => a.id === input.accountId);
  if (!account) return fail("account-not-found", "Das Konto gibt es nicht.");
  if (input.month !== null && !isYearMonth(input.month)) return fail("invalid-month", "Bitte einen gültigen Monat wählen.");
  const switched: Account = { ...account, perHoldingFrom: input.month };
  const holdingIds = new Set(document.holdings.filter((h) => h.accountId === account.id).map((h) => h.id));
  for (const snapshot of document.snapshots) {
    const accountLevel = isAccountLevelMonth(switched, snapshot.month);
    if (accountLevel && snapshot.holdingValues.some((v) => holdingIds.has(v.holdingId))) {
      return fail(
        "values-per-holding-recorded",
        "In diesem Zeitraum gibt es schon Werte pro Position. Der Wechsel muss davor liegen.",
      );
    }
    if (!accountLevel && snapshot.accountValues.some((v) => v.accountId === account.id)) {
      return fail(
        "account-level-values-recorded",
        "In diesem Zeitraum gibt es schon einen Kontostand gesamt. Der Wechsel muss danach liegen.",
      );
    }
  }
  return {
    ok: true,
    document: { ...document, accounts: document.accounts.map((a) => (a.id === account.id ? switched : a)) },
  };
}

function accountOf(document: WealthDocument, accountId: string): Account {
  return document.accounts.find((a) => a.id === accountId)!;
}

/** One Holding's value in a month: recorded that month, or carried forward (notUpdated). */
export type HoldingMonthValue = HoldingValue & { notUpdated: boolean };

/** One Account-level value in a month: recorded that month, or carried forward (notUpdated). */
export type AccountMonthValue = AccountValue & { notUpdated: boolean };

export type NetWorthMonth = {
  month: YearMonth;
  /** Cents; debts count negatively. */
  netWorth: number;
  /** Every Holding that has a value in this month, in document order. */
  holdings: HoldingMonthValue[];
  /** Every Account with an Account-level value in this month, in document order. */
  accounts: AccountMonthValue[];
  /** Net worth split by Asset class; Account-level values count under the Default classification. */
  byAssetClass: Partial<Record<AssetClass, number>>;
  /** Net worth split by Liquidity; Account-level values count under the Default classification. */
  byLiquidity: Partial<Record<Liquidity, number>>;
};

/**
 * Net worth for every month from the first to the last Snapshot, gaps included.
 * A Holding (or an Account-level value) without a value in a month carries forward its
 * latest earlier value, but never across the Account's switch to per-Holding values.
 */
export function netWorthSeries(document: WealthDocument): NetWorthMonth[] {
  // A Snapshot holding only a Note or Events has no values: the series starts at the first month with values.
  const first = document.snapshots.find((s) => s.holdingValues.length > 0 || s.accountValues.length > 0);
  const last = document.snapshots.at(-1);
  if (!first || !last) return [];
  const series: NetWorthMonth[] = [];
  const carry = new CarryForward(document);
  for (let month = first.month; month <= last.month; month = nextMonth(month)) {
    const values = carry.advanceTo(month);
    const byAssetClass: NetWorthMonth["byAssetClass"] = {};
    const byLiquidity: NetWorthMonth["byLiquidity"] = {};
    for (const { valuation, marketValue } of values.valued) {
      const { assetClass, liquidity } = valuation.classification;
      byAssetClass[assetClass] = (byAssetClass[assetClass] ?? 0) + valuation.sign * marketValue;
      byLiquidity[liquidity] = (byLiquidity[liquidity] ?? 0) + valuation.sign * marketValue;
    }
    series.push({
      month,
      netWorth: netWorthOf(values),
      holdings: values.holdings,
      accounts: values.accounts,
      byAssetClass,
      byLiquidity,
    });
  }
  return series;
}

type MonthValues = {
  holdings: HoldingMonthValue[];
  accounts: AccountMonthValue[];
  /** Every value counted in the month, with how it counts. */
  valued: { valuation: Valuation; marketValue: number }[];
};

function netWorthOf(values: MonthValues): number {
  return values.valued.reduce((sum, v) => sum + v.valuation.sign * v.marketValue, 0);
}

/**
 * Walks the Snapshots in month order, keeping each Holding's and Account's latest value.
 * In a month, an Account counts its Account-level value if the month is before its switch
 * to per Holding, else its Holdings' values; so nothing carries across the switch.
 */
class CarryForward {
  private readonly latestHolding = new Map<string, HoldingValue>();
  private readonly latestAccount = new Map<string, AccountValue>();
  private next = 0;

  constructor(private readonly document: WealthDocument) {}

  /** Values in `month`; call with ascending months. */
  advanceTo(month: YearMonth): MonthValues {
    const { document } = this;
    let current: Snapshot | undefined;
    while (this.next < document.snapshots.length && document.snapshots[this.next]!.month <= month) {
      const snapshot = document.snapshots[this.next++]!;
      for (const v of snapshot.holdingValues) this.latestHolding.set(v.holdingId, v);
      for (const v of snapshot.accountValues) this.latestAccount.set(v.accountId, v);
      if (snapshot.month === month) current = snapshot;
    }
    const values: MonthValues = { holdings: [], accounts: [], valued: [] };
    const open = new Set(document.accounts.filter((a) => accountIsOpen(a, month)).map((a) => a.id));
    const accountLevel = new Set(document.accounts.filter((a) => isAccountLevelMonth(a, month)).map((a) => a.id));
    for (const accountId of accountLevel) {
      if (!open.has(accountId)) continue;
      const value = this.latestAccount.get(accountId);
      if (!value) continue;
      const own = current?.accountValues.some((v) => v.accountId === accountId) ?? false;
      values.accounts.push({ ...value, notUpdated: !own });
      values.valued.push({ valuation: valuationOfAccount(document, accountId), marketValue: value.marketValue });
    }
    for (const holding of document.holdings) {
      if (accountLevel.has(holding.accountId) || !open.has(holding.accountId) || !holdingIsActive(holding, month)) continue;
      const own = current?.holdingValues.find((v) => v.holdingId === holding.id);
      const value = own ?? this.latestHolding.get(holding.id);
      if (!value) continue;
      values.holdings.push(
        own
          ? { ...own, notUpdated: false }
          : { holdingId: holding.id, marketValue: value.marketValue, contribution: null, notUpdated: true },
      );
      values.valued.push({ valuation: valuationOfHolding(document, holding.id), marketValue: value.marketValue });
    }
    return values;
  }
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

/** The Kontostand gesamt field of an Account that takes an Account-level value this month. */
export type SnapshotFormAccountValue = {
  /** Value as of the previous month (carried forward), null if it has none. */
  previousValue: number | null;
  /** Pre-fill: this month's recorded value, else previousValue. */
  marketValue: number | null;
  /** Whether this month's Snapshot has an Account-level value for the Account. */
  recorded: boolean;
};

export type SnapshotFormAccount = {
  id: string;
  name: string;
  isDebt: boolean;
  /** The first month recorded per Holding; null: every month. */
  perHoldingFrom: YearMonth | null;
  /** Set when the Account takes one Kontostand gesamt this month (holdings is then empty). */
  accountValue: SnapshotFormAccountValue | null;
  holdings: SnapshotFormHolding[];
  /**
   * In a per-Holding month: the perHoldingFrom that makes this month take a Kontostand
   * gesamt instead (the Account's next month with values per Holding, else the current
   * month, else the next month). null when values per Holding exist in or before this month.
   */
  accountLevelSwitch: YearMonth | null;
  /** In an Account-level month: whether the Account can switch to per Holding from this month. */
  canSwitchToPerHolding: boolean;
};

export type SnapshotForm = {
  month: YearMonth;
  /** Whether this month already has a Snapshot (saving replaces it). */
  exists: boolean;
  /** Net worth of the previous month, null if nothing was recorded before. */
  previousNetWorth: number | null;
  /** Whether any Holding exists, open in this month or not (institutions lists only the open ones). */
  hasHoldings: boolean;
  institutions: { id: string; name: string; accounts: SnapshotFormAccount[] }[];
};

/**
 * Everything the Monatsstand form for `month` shows. Amounts in cents; debts positive.
 * `today` ("YYYY-MM-DD") only places the suggested switch to per Holding (accountLevelSwitch).
 */
export function snapshotForm(document: WealthDocument, month: YearMonth, today?: string): SnapshotForm {
  const previous = new CarryForward(document).advanceTo(previousMonth(month));
  const previousHolding = new Map(previous.holdings.map((v) => [v.holdingId, v.marketValue]));
  const previousAccount = new Map(previous.accounts.map((v) => [v.accountId, v.marketValue]));
  const current = document.snapshots.find((s) => s.month === month);
  const recorded = new Map((current?.holdingValues ?? []).map((v) => [v.holdingId, v]));
  const recordedAccount = new Map((current?.accountValues ?? []).map((v) => [v.accountId, v]));
  const hasPrevious = document.snapshots.some((s) => s.month < month);
  const todayMonth = today?.slice(0, 7);

  /** Closed Accounts, and per-Holding Accounts whose Holdings are all closed or not yet started, are hidden. */
  const shownInForm = (account: Account): boolean => {
    if (!accountIsOpen(account, month)) return false;
    if (isAccountLevelMonth(account, month)) return true;
    const holdings = document.holdings.filter((h) => h.accountId === account.id);
    return holdings.length === 0 || holdings.some((h) => holdingIsActive(h, month));
  };

  const formAccount = (account: Account): SnapshotFormAccount => {
    const base = { id: account.id, name: account.name, isDebt: account.isDebt, perHoldingFrom: account.perHoldingFrom };
    if (isAccountLevelMonth(account, month)) {
      const own = recordedAccount.get(account.id);
      const previousValue = previousAccount.get(account.id) ?? null;
      return {
        ...base,
        accountValue: { previousValue, marketValue: own ? own.marketValue : previousValue, recorded: own !== undefined },
        holdings: [],
        accountLevelSwitch: null,
        canSwitchToPerHolding: !document.snapshots.some(
          (s) => s.month >= month && s.accountValues.some((v) => v.accountId === account.id),
        ),
      };
    }
    const holdings = document.holdings.filter((h) => h.accountId === account.id);
    const ids = new Set(holdings.map((h) => h.id));
    const perHoldingMonths = document.snapshots
      .filter((s) => s.holdingValues.some((v) => ids.has(v.holdingId)))
      .map((s) => s.month);
    const fallback = todayMonth !== undefined && todayMonth > month ? todayMonth : nextMonth(month);
    return {
      ...base,
      accountValue: null,
      holdings: holdings.filter((holding) => holdingIsActive(holding, month)).map((holding) => {
        const own = recorded.get(holding.id);
        const previousValue = previousHolding.get(holding.id) ?? null;
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
      accountLevelSwitch: perHoldingMonths.some((m) => m <= month)
        ? null
        : (perHoldingMonths.find((m) => m > month) ?? fallback),
      canSwitchToPerHolding: false,
    };
  };

  return {
    month,
    exists: current !== undefined,
    previousNetWorth: hasPrevious ? netWorthOf(previous) : null,
    hasHoldings: document.holdings.length > 0,
    institutions: document.institutions.flatMap((institution) => {
      const all = document.accounts.filter((a) => a.institutionId === institution.id);
      const shown = all.filter(shownInForm);
      // An Institution whose Accounts are all closed is hidden too.
      if (all.length > 0 && shown.length === 0) return [];
      return [{ id: institution.id, name: institution.name, accounts: shown.map(formAccount) }];
    }),
  };
}

export function nextMonth(month: YearMonth): YearMonth {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}

export function previousMonth(month: YearMonth): YearMonth {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}
