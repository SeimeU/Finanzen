/**
 * The data document: all of the owner's state as one versioned JSON value.
 * To change its shape, bump CURRENT_SCHEMA_VERSION with a migration in ./migrations.ts.
 */
export type WealthDocument = {
  schemaVersion: number;
  institutions: Institution[];
  accounts: Account[];
  holdings: Holding[];
  /** At most one per month, ordered by month. */
  snapshots: Snapshot[];
};

export type Institution = { id: string; name: string };

export type Account = {
  id: string;
  institutionId: string;
  name: string;
  /** Normalized: upper case, no spaces. */
  iban: string | null;
  /** A debt's values are entered as positive amounts owed and count negatively. */
  isDebt: boolean;
  defaultClassification: Classification;
  /**
   * The first month whose values are recorded per Holding. Months before it take one
   * Account-level value instead. null: per Holding in every month.
   */
  perHoldingFrom: YearMonth | null;
};

/**
 * Snapshots (later tickets) reference a Holding by id only. Its classification
 * and its Account's isDebt are looked up at query time, so editing them is
 * reflected in every query, history included.
 */
export type Holding = {
  id: string;
  accountId: string;
  name: string;
  classification: Classification;
};

export const ASSET_CLASSES = ["cash", "etf", "stock", "bond", "crypto", "commodity", "other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const LIQUIDITIES = ["available", "locked"] as const;
export type Liquidity = (typeof LIQUIDITIES)[number];

/** A Locked classification always has a maturityDate ("YYYY-MM-DD"); an Available one never has. */
export type Classification = {
  assetClass: AssetClass;
  liquidity: Liquidity;
  maturityDate: string | null;
};

/** A calendar month, "YYYY-MM". Its reference date is the month's last day. */
export type YearMonth = string;

/**
 * The values recorded for one month. Holdings (and Accounts) left out keep their latest
 * earlier value at query time. Later tickets add fields (Note, Events): saveSnapshot
 * replaces only holdingValues and accountValues and keeps every other field.
 * An Account has values per Holding or an Account-level value in a month, never both.
 */
export type Snapshot = {
  month: YearMonth;
  holdingValues: HoldingValue[];
  accountValues: AccountValue[];
};

/** An Account-level value (Kontostand gesamt) in cents; counts under the Account's Default classification. */
export type AccountValue = {
  accountId: string;
  marketValue: number;
};

/** Amounts in integer cents. A debt's value is entered positive (amount owed). */
export type HoldingValue = {
  holdingId: string;
  marketValue: number;
  /** Money newly paid in during the month; null when none was recorded. */
  contribution: number | null;
};

export const CURRENT_SCHEMA_VERSION = 4;

export function createEmptyDocument(): WealthDocument {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, institutions: [], accounts: [], holdings: [], snapshots: [] };
}
