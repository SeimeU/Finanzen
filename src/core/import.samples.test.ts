import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { confirmImport, createAccount, createEmptyDocument, createInstitution, previewImport, type Result } from "./index";

/**
 * Runs against the owner's real exports in `samples/` (never committed), only when that folder exists.
 * A file whose name contains "trade" or "tr" is expected to be a Trade Republic export.
 */
const SAMPLES = join(import.meta.dirname, "..", "..", "samples");
const files = existsSync(SAMPLES) ? readdirSync(SAMPLES).filter((f) => f.toLowerCase().endsWith(".csv")) : [];
const tradeRepublicFiles = files.filter((f) => /trade|(^|[^a-z])tr([^a-z]|$)/i.test(f));

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result;
}

describe.skipIf(tradeRepublicFiles.length === 0)("real Trade Republic exports in samples/", () => {
  it.each(tradeRepublicFiles)("%s is recognized, imports completely and re-imports as duplicates", (name) => {
    const bytes = readFileSync(join(SAMPLES, name));
    let document = createEmptyDocument();
    const institution = must(createInstitution(document, { name: "Trade Republic" }));
    const account = must(
      createAccount(institution.document, {
        institutionId: institution.id,
        name: "Verrechnungskonto",
        defaultClassification: { assetClass: "cash", liquidity: "available", maturityDate: null },
      }),
    );
    document = account.document;

    const [preview] = must(previewImport(document, { files: [{ name, bytes }] })).files;
    if (!preview!.ok) throw new Error(preview!.error.message);
    expect(preview).toMatchObject({ profile: { id: "trade-republic" }, suggestedAccountId: account.id, duplicateCount: 0 });
    expect(preview!.newCount).toBeGreaterThan(0);

    const once = must(confirmImport(document, { importedAt: "2026-01-01T00:00:00Z", files: [{ name, bytes, accountId: account.id }] }));
    expect(once.files[0]!.newCount).toBe(preview!.newCount);
    const twice = must(previewImport(once.document, { files: [{ name, bytes }] })).files[0]!;
    expect(twice).toMatchObject({ newCount: 0, duplicateCount: preview!.newCount });
  });
});
