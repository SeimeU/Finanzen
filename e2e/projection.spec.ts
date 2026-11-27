import {
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  saveSnapshot,
  type Result,
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
 * Depot (ETF) 100.000 €, Giro (Cash) 1.000 € then 1.300 € (so 300 € saved a month),
 * Festgeld (Anleihe) 10.000 € Gebunden bis 31.05.2028.
 */
function document(): WealthDocument {
  const cash = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
  const etf = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
  const bond = { assetClass: "bond", liquidity: "locked", maturityDate: "2028-05-31" } as const;
  const bank = must(createInstitution(createEmptyDocument(), { name: "Bank" }));
  const depot = must(createAccount(bank.document, { institutionId: bank.id, name: "Depot", defaultClassification: etf }));
  const msci = must(createHolding(depot.document, { accountId: depot.id, name: "MSCI World", classification: etf }));
  const giro = must(createAccount(msci.document, { institutionId: bank.id, name: "Giro", defaultClassification: cash }));
  const giroHolding = must(createHolding(giro.document, { accountId: giro.id, name: "Giro", classification: cash }));
  const festgeld = must(createAccount(giroHolding.document, { institutionId: bank.id, name: "Festgeld", defaultClassification: bond }));
  const festgeldHolding = must(createHolding(festgeld.document, { accountId: festgeld.id, name: "Festgeld", classification: bond }));
  let next = festgeldHolding.document;
  next = must(
    saveSnapshot(next, {
      month: "2026-09",
      today: "2026-11-26",
      holdingValues: [
        { holdingId: msci.id, marketValue: 10_000_000 },
        { holdingId: giroHolding.id, marketValue: 100_000 },
        { holdingId: festgeldHolding.id, marketValue: 1_000_000 },
      ],
    }),
  ).document;
  next = must(
    saveSnapshot(next, { month: "2026-10", today: "2026-11-26", holdingValues: [{ holdingId: giroHolding.id, marketValue: 130_000 }] }),
  ).document;
  return next;
}

test("the owner sets the Prognose assumptions and sees it continue the Vermögen chart", async ({ page, app }) => {
  await save(app.dataFile, PASSWORD, document());
  await page.goto(app.url);
  await unlock(page, PASSWORD);

  await page.getByRole("navigation").getByRole("button", { name: "Prognose" }).click();
  await expect(page.getByRole("heading", { name: "Prognose", exact: true })).toBeVisible();
  await expect(page.getByText("Leer lassen für den Durchschnitt der letzten 12 Monate: 300,00 €")).toBeVisible();

  // ETF 6 %, everything else 0 %, 5 years.
  for (const label of ["Cash", "Aktie", "Anleihe", "Krypto", "Rohstoff", "Sonstiges"]) {
    await page.getByLabel(`Erwartete Rendite ${label}`).fill("0");
  }
  await page.getByLabel("Erwartete Rendite ETF").fill("6");
  await page.getByLabel("Zeitraum").selectOption("5");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("status")).toHaveText("Gespeichert.");

  // 100.000 € × 1,06^5 + 1.300 € + 10.000 € + 60 × 300 € = 163.122,56 €; the Festgeld is Verfügbar by then.
  await expect(page.getByLabel("Erwartet in 5 Jahren")).toHaveText("163.122,56 €");
  await expect(page.getByLabel("Davon gebunden")).toHaveText("0,00 €");

  // An own savings amount replaces the average: 60 × 100 € less.
  await page.getByLabel("Monatlicher Sparbetrag").fill("200");
  await page.getByLabel("Bandbreite").fill("1,5");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByLabel("Erwartet in 5 Jahren")).toHaveText("157.122,56 €");

  // The assumptions are stored.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Vermögen" })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Prognose" }).click();
  await expect(page.getByLabel("Erwartete Rendite ETF")).toHaveValue("6");
  await expect(page.getByLabel("Monatlicher Sparbetrag")).toHaveValue("200,00");
  await expect(page.getByLabel("Bandbreite")).toHaveValue("1,5");

  // The start screen's chart continues as a dashed line with the bands.
  await page.getByRole("navigation").getByRole("button", { name: "Übersicht" }).click();
  const chart = page.getByRole("figure", { name: "Vermögen im Zeitverlauf" });
  await expect(chart.locator("svg")).toBeVisible();
  await expect(chart.locator("path[stroke-dasharray]")).toHaveCount(0);
  await page.getByRole("button", { name: "Prognose anzeigen" }).click();
  await expect(chart.locator("path[stroke-dasharray]").first()).toBeVisible();
  await expect(chart.getByText("Optimistisch")).toBeVisible();
  await expect(chart.getByText("Pessimistisch")).toBeVisible();
});

test("an invalid assumption is rejected with a German message", async ({ page, app }) => {
  await save(app.dataFile, PASSWORD, document());
  await page.goto(app.url);
  await unlock(page, PASSWORD);
  await page.getByRole("navigation").getByRole("button", { name: "Prognose" }).click();
  await page.getByLabel("Erwartete Rendite ETF").fill("abc");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toContainText("Rendite");
});
