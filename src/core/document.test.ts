import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, createEmptyDocument, loadDocument } from "./index";

describe("data document", () => {
  it("a new document is empty and carries the current schema version", () => {
    const document = createEmptyDocument();
    expect(document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
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

  it("a version 4 document migrates through every step: no Import profiles, ELBA fields, no remembered Accounts, default Categories", () => {
    const origin = { category: "CASH", type: "BUY", transactionId: "x", feeCents: null, taxCents: null, securityName: null, isin: null };
    const v4 = { ...createEmptyDocument(), schemaVersion: 4, transactions: [{ id: "t1", origin }] } as Record<string, unknown>;
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
  });

  it("a version 6 document gets the default Categories and its Transactions no manual Category", () => {
    const v6 = { ...createEmptyDocument(), schemaVersion: 6, categories: undefined, transactions: [{ id: "t1", purpose: "Billa" }] };
    const result = loadDocument(v6);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.document.categories).toEqual(createEmptyDocument().categories);
    expect(result.document.transactions).toEqual([{ id: "t1", purpose: "Billa", manualCategoryId: null }]);
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
