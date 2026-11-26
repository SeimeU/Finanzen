import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  confirmImport,
  createAccount,
  createEmptyDocument,
  createInstitution,
  previewImport,
  searchTransactions,
  type Result,
} from "./index";

/**
 * Runs against the owner's real exports in `samples/` (never committed), only when that folder exists.
 * A file whose name contains "trade" or "tr" is expected to be a Trade Republic export,
 * one whose name contains "elba" or "raiffeisen" a Raiffeisen ELBA export.
 */
const SAMPLES = join(import.meta.dirname, "..", "..", "samples");
const files = existsSync(SAMPLES) ? readdirSync(SAMPLES).filter((f) => f.toLowerCase().endsWith(".csv")) : [];
const tradeRepublicFiles = files.filter((f) => /trade|(^|[^a-z])tr([^a-z]|$)/i.test(f));
const elbaFiles = files.filter((f) => /elba|raiffeisen/i.test(f));

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result;
}

/** Imports a real sample onto the only Account of an Institution named `institution`; returns what was stored. */
function importSample(name: string, institution: string, profileId: string) {
  const bytes = readFileSync(join(SAMPLES, name));
  const created = must(createInstitution(createEmptyDocument(), { name: institution }));
  const account = must(
    createAccount(created.document, {
      institutionId: created.id,
      name: "Konto",
      defaultClassification: { assetClass: "cash", liquidity: "available", maturityDate: null },
    }),
  );
  const document = account.document;

  const [preview] = must(previewImport(document, { files: [{ name, bytes }] })).files;
  if (!preview!.ok) throw new Error(preview!.error.message);
  expect(preview).toMatchObject({ profile: { id: profileId }, suggestedAccountId: account.id, duplicateCount: 0 });
  expect(preview!.newCount).toBeGreaterThan(0);

  const once = must(confirmImport(document, { importedAt: "2026-01-01T00:00:00Z", files: [{ name, bytes, accountId: account.id }] }));
  expect(once.files[0]!.newCount).toBe(preview!.newCount);
  const twice = must(previewImport(once.document, { files: [{ name, bytes }] })).files[0]!;
  expect(twice).toMatchObject({ newCount: 0, duplicateCount: preview!.newCount });
  return searchTransactions(once.document);
}

describe.skipIf(tradeRepublicFiles.length === 0)("real Trade Republic exports in samples/", () => {
  it.each(tradeRepublicFiles)("%s is recognized, imports completely and re-imports as duplicates", (name) => {
    importSample(name, "Trade Republic", "trade-republic");
  });
});

describe.skipIf(elbaFiles.length === 0)("real Raiffeisen ELBA exports in samples/", () => {
  it.each(elbaFiles)("%s is recognized, imports completely and re-imports as duplicates", (name) => {
    importSample(name, "Raiffeisen", "elba");
  });

  // The ELBA sign convention is unverified: a real Girokonto export has both inflows and outflows.
  it.each(elbaFiles)("%s has both positive and negative amounts", (name) => {
    const amounts = importSample(name, "Raiffeisen", "elba").map((t) => t.amountCents);
    expect(amounts.some((a) => a > 0)).toBe(true);
    expect(amounts.some((a) => a < 0)).toBe(true);
  });

  // The packed Buchungstext keys are unverified: on a real export most rows should yield a counterparty.
  it.each(elbaFiles)("%s yields a counterparty for most Transactions", (name) => {
    const transactions = importSample(name, "Raiffeisen", "elba");
    const named = transactions.filter((t) => t.counterpartyName !== "").length;
    expect(named / transactions.length).toBeGreaterThan(0.5);
  });
});
