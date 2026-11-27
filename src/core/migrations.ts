import { CURRENT_SCHEMA_VERSION, type WealthDocument } from "./document";
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
  // 4 → 5: Account-level values and each Account's switch to per-Holding values.
  4: (document) => ({
    ...document,
    schemaVersion: 5,
    accounts: (document.accounts as object[]).map((a) => ({ ...a, perHoldingFrom: null })),
    snapshots: (document.snapshots as object[]).map((s) => ({ ...s, accountValues: [] })),
  }),
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
