import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, createEmptyDocument, loadDocument } from "./index";

describe("data document", () => {
  it("a new document is empty and carries the current schema version", () => {
    const document = createEmptyDocument();
    expect(document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(9);
    expect(document).toMatchObject({ institutions: [], accounts: [], holdings: [], snapshots: [], transactions: [], imports: [] });
  });

  it("loading a current document returns it unchanged", () => {
    const document = createEmptyDocument();
    const result = loadDocument(JSON.parse(JSON.stringify(document)));
    expect(result).toEqual({ ok: true, document });
  });

  it("loading a document of an older schema version migrates it to the current version", () => {
    const result = loadDocument({ schemaVersion: 0 });
    expect(result).toEqual({ ok: true, document: createEmptyDocument() });
  });

  it("a version 5 document's Transactions get empty ELBA fields and no Account is remembered for any file", () => {
    const origin = { category: "CASH", type: "BUY", transactionId: "x", feeCents: null, taxCents: null, securityName: null, isin: null };
    const v5 = { ...createEmptyDocument(), schemaVersion: 5, transactions: [{ id: "t1", origin }] } as Record<string, unknown>;
    delete v5.importAccountChoices;
    const result = loadDocument(v5);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.document.transactions[0]!.origin).toEqual({ ...origin, bookingText: null, valueDate: null });
    expect(result.document.importAccountChoices).toEqual([]);
  });

  it("a version 4 document migrates through every step: no Import profiles, ELBA fields, no remembered Accounts, default Categories, Account-level values", () => {
    const origin = { category: "CASH", type: "BUY", transactionId: "x", feeCents: null, taxCents: null, securityName: null, isin: null };
    const account = { id: "a1", institutionId: "i1", name: "Giro", iban: null, isDebt: false, defaultClassification: {} };
    const v4 = {
      ...createEmptyDocument(),
      schemaVersion: 4,
      institutions: [{ id: "i1", name: "Bank" }],
      accounts: [account],
      snapshots: [{ month: "2026-01", holdingValues: [] }],
      transactions: [{ id: "t1", origin }],
    } as Record<string, unknown>;
    delete v4.importProfiles;
    delete v4.importAccountChoices;
    delete v4.categories;
    const result = loadDocument(v4);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.document.importProfiles).toEqual([]);
    expect(result.document.transactions[0]!.origin).toEqual({ ...origin, bookingText: null, valueDate: null });
    expect(result.document.transactions[0]!.manualCategoryId).toBeNull();
    expect(result.document.importAccountChoices).toEqual([]);
    expect(result.document.categories).toEqual(createEmptyDocument().categories);
    expect(result.document.accounts).toEqual([{ ...account, perHoldingFrom: null }]);
    expect(result.document.snapshots).toEqual([{ month: "2026-01", holdingValues: [], accountValues: [] }]);
  });

  it("a version 6 document gets the default Categories and its Transactions no manual Category", () => {
    const v6 = { ...createEmptyDocument(), schemaVersion: 6, categories: undefined, transactions: [{ id: "t1", purpose: "Billa" }] };
    const result = loadDocument(v6);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.document.categories).toEqual(createEmptyDocument().categories);
    expect(result.document.transactions).toEqual([{ id: "t1", purpose: "Billa", manualCategoryId: null }]);
  });

  it("a version 7 document gets Account-level values: none recorded, every Account per Holding", () => {
    const account = { id: "a1", institutionId: "i1", name: "Giro", iban: null, isDebt: false, defaultClassification: {} };
    const v7 = {
      ...createEmptyDocument(),
      schemaVersion: 7,
      institutions: [{ id: "i1", name: "Bank" }],
      accounts: [account],
      snapshots: [{ month: "2026-01", holdingValues: [] }],
    };
    const result = loadDocument(v7);
    expect(result.ok && result.document).toMatchObject({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      accounts: [{ ...account, perHoldingFrom: null }],
      snapshots: [{ month: "2026-01", holdingValues: [], accountValues: [] }],
    });
  });

  it("a version 8 document gets the default Projection assumptions", () => {
    const v8 = { ...createEmptyDocument(), schemaVersion: 8 } as Record<string, unknown>;
    delete v8.projectionAssumptions;
    const result = loadDocument(v8);
    expect(result.ok && result.document).toMatchObject({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      projectionAssumptions: createEmptyDocument().projectionAssumptions,
    });
  });

  it("rejects a document from a newer app version", () => {
    const result = loadDocument({ schemaVersion: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unsupported-schema-version");
  });

  it("rejects something that is not a data document", () => {
    for (const raw of [null, 42, "text", {}, { schemaVersion: "1" }]) {
      const result = loadDocument(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("invalid-document");
    }
  });
});
