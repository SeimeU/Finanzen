import {
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  saveSnapshot,
  setPerHoldingFrom,
  type Result,
  type SnapshotInput,
  type WealthDocument,
} from "../src/core";
import { save } from "../src/store";
import { expect, test } from "./fixtures";
import { unlock } from "./helpers";

const PASSWORD = "geheim123";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

/**
 * Trade Republic Depot: Kontostand gesamt until December 2025, then MSCI World (ETF) and
 * Verrechnungskonto (Cash). Raiffeisen Festgeld (Anleihe, Gebunden) recorded once in March 2025.
 */
function documentWithHistory(): WealthDocument {
  const cash = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
  const etf = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
  const bond = { assetClass: "bond", liquidity: "locked", maturityDate: "2030-06-30" } as const;
  const tr = must(createInstitution(createEmptyDocument(), { name: "Trade Republic" }));
  const raiffeisen = must(createInstitution(tr.document, { name: "Raiffeisen" }));
  const depot = must(createAccount(raiffeisen.document, { institutionId: tr.id, name: "Depot", defaultClassification: etf }));
  const msci = must(createHolding(depot.document, { accountId: depot.id, name: "MSCI World", classification: etf }));
  const verrechnung = must(createHolding(msci.document, { accountId: depot.id, name: "Verrechnungskonto", classification: cash }));
  const festgeld = must(
    createAccount(verrechnung.document, { institutionId: raiffeisen.id, name: "Festgeld", defaultClassification: bond }),
  );
  const festgeldHolding = must(createHolding(festgeld.document, { accountId: festgeld.id, name: "Festgeld", classification: bond }));
  let document = must(setPerHoldingFrom(festgeldHolding.document, { accountId: depot.id, month: "2026-01" })).document;
  const snapshot = (month: string, values: Partial<Omit<SnapshotInput, "month" | "today">>) => {
    document = must(saveSnapshot(document, { month, today: "2026-11-26", holdingValues: [], ...values })).document;
  };
  snapshot("2025-03", {
    accountValues: [{ accountId: depot.id, marketValue: 1_000_000 }],
    holdingValues: [{ holdingId: festgeldHolding.id, marketValue: 500_000 }],
  });
  snapshot("2025-12", { accountValues: [{ accountId: depot.id, marketValue: 1_500_000 }] });
  snapshot("2026-01", {
    holdingValues: [
      { holdingId: msci.id, marketValue: 1_250_000 },
      { holdingId: verrechnung.id, marketValue: 250_000 },
    ],
  });
  snapshot("2026-02", {
    holdingValues: [
      { holdingId: msci.id, marketValue: 1_200_000 },
      { holdingId: verrechnung.id, marketValue: 300_000 },
    ],
  });
  snapshot("2026-03", {
    holdingValues: [
      { holdingId: msci.id, marketValue: 1_300_000 },
      { holdingId: verrechnung.id, marketValue: 300_000 },
    ],
  });
  return document;
}

test("the start screen shows Vermögen with its changes and the breakdowns", async ({ page, app }) => {
  await save(app.dataFile, PASSWORD, documentWithHistory());
  await page.goto(app.url);
  await unlock(page, PASSWORD);

  await expect(page.getByLabel("Aktuelles Vermögen")).toHaveText("21.000,00 €");
  await expect(page.getByLabel("Veränderung zum Vormonat")).toHaveText("+1.000,00 € (+5,0 %)");
  await expect(page.getByLabel("Veränderung zum Vorjahresmonat")).toHaveText("+6.000,00 € (+40,0 %)");

  // Stacked by Anlageklasse, with a range selector.
  const chart = page.getByRole("figure", { name: "Vermögen im Zeitverlauf" });
  await expect(chart.locator("svg")).toBeVisible();
  await expect(chart).toContainText("ETF");
  await expect(chart).toContainText("Anleihe");
  const range = page.getByRole("group", { name: "Zeitraum" });
  await expect(range.getByRole("button", { name: "Alle" })).toHaveAttribute("aria-pressed", "true");
  await range.getByRole("button", { name: "1 Jahr" }).click();
  await expect(range.getByRole("button", { name: "1 Jahr" })).toHaveAttribute("aria-pressed", "true");
  await expect(range.getByRole("button", { name: "Alle" })).toHaveAttribute("aria-pressed", "false");
  await expect(chart.locator("svg")).toBeVisible();

  // Current breakdowns.
  const byAssetClass = page.getByRole("table", { name: "Nach Anlageklasse" });
  await expect(byAssetClass.getByRole("row", { name: /ETF/ })).toContainText("13.000,00 €");
  await expect(byAssetClass.getByRole("row", { name: /Cash/ })).toContainText("3.000,00 €");
  await expect(byAssetClass.getByRole("row", { name: /Anleihe/ })).toContainText("5.000,00 €");

  const byLiquidity = page.getByRole("table", { name: "Nach Verfügbarkeit" });
  await expect(byLiquidity.getByRole("row", { name: /Verfügbar/ })).toContainText("16.000,00 €");
  await expect(byLiquidity.getByRole("row", { name: /Gebunden/ })).toContainText("5.000,00 €");
  await expect(page.getByRole("figure", { name: "Nach Verfügbarkeit" }).locator("svg")).toBeVisible();

  const byInstitution = page.getByRole("table", { name: "Nach Institut" });
  await expect(byInstitution.getByRole("row", { name: /Trade Republic/ })).toContainText("16.000,00 €");
  await expect(byInstitution.getByRole("row", { name: /Raiffeisen/ })).toContainText("5.000,00 €");
  await expect(page.getByRole("figure", { name: "Nach Institut" }).locator("svg")).toBeVisible();

  // The contribution section stays on the start screen.
  await expect(page.getByRole("heading", { name: "Einzahlung und Marktveränderung" })).toBeVisible();
});
