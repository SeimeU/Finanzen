import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, createEmptyDocument, loadDocument } from "./index";

describe("data document", () => {
  it("a new document is empty and carries the current schema version", () => {
    const document = createEmptyDocument();
    expect(document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
    expect(document).toMatchObject({ institutions: [], accounts: [], holdings: [] });
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
