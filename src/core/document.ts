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
  /** User-defined (generic) Import profiles, at most one per Account. */
  importProfiles: GenericImportProfile[];
  /** The Account last confirmed for each import file name; suggested when that name is dropped again. */
  importAccountChoices: ImportAccountChoice[];
  /** Two levels: top-level Categories (parentId null) and their children. See ./categories.ts. */
  categories: Category[];
  /** Transfer suggestions the owner rejected, as Transaction id pairs; never suggested again. See ./transfers.ts. */
  rejectedTransferSuggestions: [string, string][];
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
  /** Free text about the month; absent when there is none. */
  note?: string;
  /** Absent or empty when the month has none. */
  events?: MonthEvent[];
};

/** An Event: a notable happening in a month. Amount in cents, may be negative. */
export type MonthEvent = { id: string; label: string; amount: number };

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
  /** The Category the owner set by hand; it wins over every automatic classification. */
  manualCategoryId: string | null;
  /**
   * The owner's own say on whether this is a Transfer: true marks it (also set by accepting a
   * suggestion), false unmarks it against automatic detection, null leaves it to detection.
   * A mark and a manual Category exclude each other: setting one clears the other.
   */
  transferMark: boolean | null;
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

export const CATEGORY_KINDS = ["income", "expense"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/**
 * What a Transaction was for. A child (parentId set) always has its parent's kind.
 * Default Categories have readable ids (e.g. "kapitalertraege-zinsen"); new ones get c1, c2, ….
 */
export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  kind: CategoryKind;
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

export const GENERIC_SEPARATORS = [";", ",", "\t", "|"] as const;
export const GENERIC_DATE_FORMATS = ["DD.MM.YYYY", "YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"] as const;
export const GENERIC_DECIMAL_SEPARATORS = [",", "."] as const;

/** Zero-based column numbers; IBAN and payment reference are optional (null). */
export type GenericColumnMapping = {
  bookingDate: number | null;
  amount: number | null;
  counterpartyName: number | null;
  purpose: number | null;
  counterpartyIban: number | null;
  paymentReference: number | null;
};

/** How the owner described one bank's CSV export. */
export type GenericProfileSettings = {
  separator: (typeof GENERIC_SEPARATORS)[number];
  /** Lines at the top of the file (header included) that hold no Transactions. */
  skipLines: number;
  dateFormat: (typeof GENERIC_DATE_FORMATS)[number];
  decimalSeparator: (typeof GENERIC_DECIMAL_SEPARATORS)[number];
  columns: GenericColumnMapping;
};

/**
 * A user-defined Import profile, saved for one Account. `columnCount` and `header`
 * come from the sample file it was set up with and are what later files are recognized by.
 */
export type GenericImportProfile = GenericProfileSettings & {
  id: string;
  accountId: string;
  columnCount: number;
  /** The last skipped line's cells (trimmed, lower case) if it looks like a header row, else null. */
  header: string[] | null;
};

export const CURRENT_SCHEMA_VERSION = 8;

export function createEmptyDocument(): WealthDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    institutions: [],
    accounts: [],
    holdings: [],
    snapshots: [],
    transactions: [],
    imports: [],
    importProfiles: [],
    importAccountChoices: [],
    categories: defaultCategories(),
    rejectedTransferSuggestions: [],
  };
}

/** The Category list a new document starts with (also added by the 6 → 7 migration). */
export function defaultCategories(): Category[] {
  const list: [string, string, CategoryKind, [string, string][]][] = [
    ["einkommen", "Einkommen", "income", [["gehalt", "Gehalt"], ["sonstige", "Sonstige Einnahmen"]]],
    ["kapitalertraege", "Kapitalerträge", "income", [["zinsen", "Zinsen"], ["ausschuettungen", "Ausschüttungen"]]],
    ["wohnen", "Wohnen", "expense", [["miete", "Miete"], ["betriebskosten", "Betriebskosten"], ["energie", "Strom & Gas"], ["internet", "Internet & Telefon"]]],
    ["lebensmittel", "Lebensmittel", "expense", [["supermarkt", "Supermarkt"], ["baeckerei", "Bäckerei & Markt"]]],
    ["mobilitaet", "Mobilität", "expense", [["oeffis", "Öffis"], ["auto", "Auto"], ["treibstoff", "Treibstoff"]]],
    ["gesundheit", "Gesundheit", "expense", [["arzt", "Arzt & Apotheke"], ["sport", "Sport"]]],
    ["freizeit", "Freizeit", "expense", [["restaurant", "Restaurant & Café"], ["urlaub", "Urlaub"], ["hobbys", "Hobbys"]]],
    ["einkaeufe", "Einkäufe", "expense", [["kleidung", "Kleidung"], ["haushalt", "Haushalt & Elektronik"]]],
    ["versicherungen", "Versicherungen", "expense", []],
    ["steuern", "Steuern", "expense", [["kapitalertragsteuer", "Kapitalertragsteuer"], ["sonstige", "Sonstige Steuern"]]],
    ["sonstiges", "Sonstiges", "expense", [["gebuehren", "Gebühren"], ["geschenke", "Geschenke & Spenden"]]],
  ];
  return list.flatMap(([id, name, kind, children]) => [
    { id, name, parentId: null, kind },
    ...children.map(([childId, childName]) => ({ id: `${id}-${childId}`, name: childName, parentId: id, kind })),
  ]);
}
