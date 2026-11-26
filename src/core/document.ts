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
  /** Imported Transactions (Umsätze). They never change any Snapshot. */
  transactions: Transaction[];
  /** One entry per confirmed file import; undoing it removes exactly its Transactions. */
  imports: ImportRecord[];
  /** The Account last confirmed for each import file name; suggested when that name is dropped again. */
  importAccountChoices: ImportAccountChoice[];
};

export type ImportAccountChoice = { fileName: string; accountId: string };

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
 * The values recorded for one month. Holdings left out keep their latest earlier
 * value at query time. Later tickets add fields (Account-level values, Note, Events):
 * saveSnapshot replaces only holdingValues and keeps every other field.
 */
export type Snapshot = {
  month: YearMonth;
  holdingValues: HoldingValue[];
};

/** Amounts in integer cents. A debt's value is entered positive (amount owed). */
export type HoldingValue = {
  holdingId: string;
  marketValue: number;
  /** Money newly paid in during the month; null when none was recorded. */
  contribution: number | null;
};

/** One movement of money on an Account, read from a bank's CSV export. */
export type Transaction = {
  id: string;
  accountId: string;
  importId: string;
  /** "YYYY-MM-DD" */
  bookingDate: string;
  /** Signed EUR cents; outflows are negative. */
  amountCents: number;
  counterpartyName: string;
  /** Normalized: upper case, no spaces. */
  counterpartyIban: string | null;
  paymentReference: string;
  purpose: string;
  origin: TransactionOrigin;
};

/**
 * What the bank itself said about a Transaction, kept for classification
 * (Trades, Transfers, Categories). Fields a format doesn't have are null.
 */
export type TransactionOrigin = {
  /** Trade Republic: TRADING, CASH or CORPORATE_ACTION. */
  category: string | null;
  /** Trade Republic: BUY, CUSTOMER_INBOUND, INTEREST_PAYMENT, …, *_CANCELLED. */
  type: string | null;
  transactionId: string | null;
  feeCents: number | null;
  taxCents: number | null;
  securityName: string | null;
  isin: string | null;
  /** ELBA: the raw Buchungstext the other fields were split from. */
  bookingText: string | null;
  /** ELBA: the Valutadatum, "YYYY-MM-DD". */
  valueDate: string | null;
};

export type ImportRecord = {
  id: string;
  fileName: string;
  /** The Import profile the file was read with, e.g. "trade-republic". */
  profileId: string;
  accountId: string;
  /** ISO 8601 UTC instant, passed in by the caller. */
  importedAt: string;
  transactionCount: number;
  duplicateCount: number;
};

export const CURRENT_SCHEMA_VERSION = 5;

export function createEmptyDocument(): WealthDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    institutions: [],
    accounts: [],
    holdings: [],
    snapshots: [],
    transactions: [],
    imports: [],
    importAccountChoices: [],
  };
}
