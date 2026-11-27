import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cashFlowMonths,
  categorySpending,
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
  return { transactions: searchTransactions(once.document), document: once.document };
}

describe.skipIf(tradeRepublicFiles.length === 0)("real Trade Republic exports in samples/", () => {
  it.each(tradeRepublicFiles)("%s is recognized, imports completely and re-imports as duplicates", (name) => {
    importSample(name, "Trade Republic", "trade-republic");
  });

  it.each(tradeRepublicFiles)("%s: card payments name the merchant as counterparty", (name) => {
    const cards = importSample(name, "Trade Republic", "trade-republic").transactions.filter(
      (t) => t.origin.type === "CARD_TRANSACTION",
    );
    for (const card of cards) {
      expect(card.counterpartyName).not.toBe("");
      expect(card.amountCents).toBeLessThan(0);
      expect(card.origin.securityName).toBeNull();
    }
  });

  it.each(tradeRepublicFiles)("%s: interest is Kapitalerträge → Zinsen and Saveback Einkommen → Prämien", (name) => {
    const { transactions } = importSample(name, "Trade Republic", "trade-republic");
    const categoryOf = (type: string) =>
      transactions.filter((t) => t.origin.type === type).map((t) => t.classification.kind === "category" && t.classification.categoryId);
    for (const c of categoryOf("INTEREST_PAYMENT")) expect(c).toBe("kapitalertraege-zinsen");
    for (const c of categoryOf("BENEFITS_SAVEBACK")) expect(c).toBe("einkommen-praemien");
  });

  it.each(tradeRepublicFiles)("%s: tax withheld counts as Kapitalertragsteuer, the gross amounts as income", (name) => {
    const { transactions, document } = importSample(name, "Trade Republic", "trade-republic");
    const taxed = transactions.filter((t) => t.origin.taxCents);
    const taxByMonth = new Map<string, number>();
    for (const t of taxed) taxByMonth.set(t.date.slice(0, 7), (taxByMonth.get(t.date.slice(0, 7)) ?? 0) - t.origin.taxCents!);
    for (const [month, tax] of taxByMonth) {
      const steuern = categorySpending(document, { period: month, kind: "expense", parentId: "steuern" });
      expect(steuern.find((r) => r.categoryId === "steuern-kapitalertragsteuer")?.amount).toBe(tax);
    }
    // Interest and Saveback are paid gross; the tax is withheld on them (negative, smaller than the amount).
    for (const t of taxed.filter((t) => t.amountCents > 0)) {
      expect(t.origin.taxCents!).toBeLessThan(0);
      expect(-t.origin.taxCents!).toBeLessThan(t.amountCents);
    }
    const income = cashFlowMonths(document).reduce((sum, m) => sum + m.income, 0);
    const grossIn = transactions
      .filter((t) => t.classification.cashFlow === "income")
      .reduce((sum, t) => sum + t.amountCents, 0);
    expect(income).toBeGreaterThanOrEqual(grossIn);
  });
});

describe.skipIf(elbaFiles.length === 0)("real Raiffeisen ELBA exports in samples/", () => {
  it.each(elbaFiles)("%s is recognized, imports completely and re-imports as duplicates", (name) => {
    importSample(name, "Raiffeisen", "elba");
  });

  // The ELBA sign convention is unverified: a real Girokonto export has both inflows and outflows.
  it.each(elbaFiles)("%s has both positive and negative amounts", (name) => {
    const amounts = importSample(name, "Raiffeisen", "elba").transactions.map((t) => t.amountCents);
    expect(amounts.some((a) => a > 0)).toBe(true);
    expect(amounts.some((a) => a < 0)).toBe(true);
  });

  // The packed Buchungstext keys are unverified: on a real export most rows should yield a counterparty.
  it.each(elbaFiles)("%s yields a counterparty for most Transactions", (name) => {
    const { transactions } = importSample(name, "Raiffeisen", "elba");
    const named = transactions.filter((t) => t.counterpartyName !== "").length;
    expect(named / transactions.length).toBeGreaterThan(0.5);
  });

  it.each(elbaFiles)("%s: a card payment with a Verwendungszweck names it as the merchant", (name) => {
    const { transactions } = importSample(name, "Raiffeisen", "elba");
    const cards = transactions.filter((t) => /Kartenzahlung/.test(t.origin.rawText ?? "") && /Verwendungszweck:/.test(t.origin.rawText ?? ""));
    for (const card of cards) {
      expect(card.counterpartyName).not.toBe("");
      expect(card.counterpartyName).toBe(card.purpose);
    }
  });

  it.each(elbaFiles)("%s: a Zahlungsempfänger is the counterparty, never the Urspr. Empfänger read as payee", (name) => {
    const { transactions } = importSample(name, "Raiffeisen", "elba");
    for (const t of transactions.filter((t) => /^"?Zahlungsempfänger:/.test(t.origin.rawText ?? ""))) {
      const payee = /^"?Zahlungsempfänger:\s*(.*?)\s+(?:Verwendungszweck|IBAN Zahlungsempfänger):/.exec(t.origin.rawText!)?.[1];
      expect(t.counterpartyName).toBe(payee);
    }
  });
});
