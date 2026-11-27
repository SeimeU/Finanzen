import { CURRENT_SCHEMA_VERSION, defaultCategories, defaultProjectionAssumptions, type WealthDocument } from "./document";
import { fail, type Result } from "./result";

type RawDocument = { schemaVersion: number } & Record<string, unknown>;

/**
 * MIGRATIONS[n] turns a document of schema version n into version n + 1.
 * To change the document shape: add MIGRATIONS[CURRENT_SCHEMA_VERSION],
 * then bump CURRENT_SCHEMA_VERSION in ./document.ts.
 */
const MIGRATIONS: Record<number, (document: RawDocument) => RawDocument> = {
  // 0 → 1: no-op, proves the mechanism (version 0 was the pre-release shape).
  0: (document) => ({ ...document, schemaVersion: 1 }),
  // 1 → 2: Institutions, Accounts and Holdings.
  1: (document) => ({ ...document, schemaVersion: 2, institutions: [], accounts: [], holdings: [] }),
  // 2 → 3: Snapshots.
  2: (document) => ({ ...document, schemaVersion: 3, snapshots: [] }),
  // 3 → 4: imported Transactions and the imports they came from.
  3: (document) => ({ ...document, schemaVersion: 4, transactions: [], imports: [] }),
  // 4 → 5: user-defined (generic) Import profiles.
  4: (document) => ({ ...document, schemaVersion: 5, importProfiles: [] }),
  // 5 → 6: ELBA origin fields on Transactions and the Account remembered per import file name.
  5: (document) => ({
    ...document,
    schemaVersion: 6,
    transactions: (document.transactions as { origin: object }[]).map((t) => ({
      ...t,
      origin: { ...t.origin, bookingText: null, valueDate: null },
    })),
    importAccountChoices: [],
  }),
  // 6 → 7: Categories (default list) and the manual Category on each Transaction.
  6: (document) => ({
    ...document,
    schemaVersion: 7,
    categories: defaultCategories(),
    transactions: (document.transactions as object[]).map((t) => ({ ...t, manualCategoryId: null })),
  }),
  // 7 → 8: Account-level values and each Account's switch to per-Holding values.
  7: (document) => ({
    ...document,
    schemaVersion: 8,
    accounts: (document.accounts as object[]).map((a) => ({ ...a, perHoldingFrom: null })),
    snapshots: (document.snapshots as object[]).map((s) => ({ ...s, accountValues: [] })),
  }),
  // 8 → 9: Categorization rules, and the Category they gave each Transaction.
  8: (document) => ({
    ...document,
    schemaVersion: 9,
    categorizationRules: [],
    transactions: (document.transactions as object[]).map((t) => ({ ...t, ruleCategoryId: null })),
  }),
  // 9 → 10: starting and closing months of Holdings and Accounts (all open, from the start).
  9: (document) => ({
    ...document,
    schemaVersion: 10,
    accounts: (document.accounts as object[]).map((a) => ({ ...a, closingMonth: null })),
    holdings: (document.holdings as object[]).map((h) => ({ ...h, startMonth: null, closingMonth: null })),
  }),
  // 10 → 11: Transfers: the owner's mark on each Transaction and the rejected Transfer suggestions.
  10: (document) => ({
    ...document,
    schemaVersion: 11,
    transactions: (document.transactions as object[]).map((t) => ({ ...t, transferMark: null })),
    rejectedTransferSuggestions: [],
  }),
  // 11 → 12: Projection assumptions, at their defaults.
  11: (document) => ({ ...document, schemaVersion: 12, projectionAssumptions: defaultProjectionAssumptions() }),
  // 12 → 13: spending analysis: no Account flagged as carrying income or spending yet, and each
  // import's covered date range (taken from the Transactions it stored; its duplicates are unknown).
  12: (document) => {
    const transactions = document.transactions as { importId: string; bookingDate: string }[];
    return {
      ...document,
      schemaVersion: 13,
      accounts: (document.accounts as object[]).map((a) => ({ ...a, carriesCashFlow: false })),
      imports: (document.imports as { id: string }[]).map((i) => {
        const dates = transactions.filter((t) => t.importId === i.id).map((t) => t.bookingDate).sort();
        return { ...i, coveredFrom: dates[0] ?? "", coveredTo: dates.at(-1) ?? "" };
      }),
    };
  },
  // 13 → 14: an import covers whole months, from its first booking's month to its last's.
  13: (document) => ({
    ...document,
    schemaVersion: 14,
    imports: (document.imports as { coveredFrom: string; coveredTo: string }[]).map((i) => ({
      ...i,
      coveredFrom: i.coveredFrom.slice(0, 7),
      coveredTo: i.coveredTo.slice(0, 7),
    })),
  }),
  // 14 → 15: Transfer pairs. Pairs accepted before are not known, so none is linked.
  14: (document) => ({
    ...document,
    schemaVersion: 15,
    transactions: (document.transactions as object[]).map((t) => ({ ...t, transferPartnerId: null })),
  }),
  // 15 → 16: glossary names for stored fields: a Transaction's `date` (was bookingDate), the bank's
  // raw text `origin.rawText` (was bookingText), and the generic Import profile's `columns.date`.
  15: (document) => ({
    ...document,
    schemaVersion: 16,
    transactions: (document.transactions as Record<string, unknown>[]).map(({ bookingDate, origin, ...t }) => {
      const { bookingText, ...restOrigin } = (origin ?? {}) as Record<string, unknown>;
      return { ...t, date: bookingDate, ...(origin === undefined ? {} : { origin: { ...restOrigin, rawText: bookingText ?? null } }) };
    }),
    importProfiles: (document.importProfiles as { columns?: Record<string, unknown> }[]).map((p) => {
      if (!p.columns) return p;
      const { bookingDate, ...columns } = p.columns;
      return { ...p, columns: { date: bookingDate, ...columns } };
    }),
  }),
  // 16 → 17: the default Category Einkommen → Prämien (Trade Republic's Saveback), added after the
  // owner's Categories; top-level when the owner deleted Einkommen. Not added when it is already
  // there, or the owner made a "Prämien" of their own in that place (names are unique per parent).
  16: (document) => {
    const categories = document.categories as { id: string; name: string; parentId: string | null }[];
    const parentId = categories.some((c) => c.id === "einkommen") ? "einkommen" : null;
    const present = categories.some(
      (c) => c.id === "einkommen-praemien" || (c.parentId === parentId && c.name.trim().toLowerCase() === "prämien"),
    );
    if (present) return { ...document, schemaVersion: 17 };
    return {
      ...document,
      schemaVersion: 17,
      categories: [...categories, { id: "einkommen-praemien", name: "Prämien", parentId, kind: "income" }],
    };
  },
};

/** Validates a parsed JSON value and migrates it to the current schema version. */
export function loadDocument(raw: unknown): Result<{ document: WealthDocument }> {
  if (!isRawDocument(raw)) {
    return fail("invalid-document", "Die Datei enthält keine gültigen Daten.");
  }
  if (raw.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return fail(
      "unsupported-schema-version",
      "Die Datei wurde mit einer neueren Version der App gespeichert.",
    );
  }
  let document = raw;
  while (document.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[document.schemaVersion];
    if (!migrate) {
      return fail("invalid-document", `Keine Migration für Version ${document.schemaVersion}.`);
    }
    document = migrate(document);
  }
  return { ok: true, document: document as WealthDocument };
}

function isRawDocument(raw: unknown): raw is RawDocument {
  return (
    typeof raw === "object" &&
    raw !== null &&
    Number.isInteger((raw as { schemaVersion?: unknown }).schemaVersion) &&
    (raw as RawDocument).schemaVersion >= 0
  );
}
