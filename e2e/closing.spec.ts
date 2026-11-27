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

/** Trade Republic: Depot with MSCI World (ETF) and Verrechnungskonto (Cash), January 2026 recorded. */
function document(): WealthDocument {
  const cash = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
  const etf = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
  const bank = must(createInstitution(createEmptyDocument(), { name: "Trade Republic" }));
  const depot = must(createAccount(bank.document, { institutionId: bank.id, name: "Depot", defaultClassification: etf }));
  const msci = must(createHolding(depot.document, { accountId: depot.id, name: "MSCI World", classification: etf }));
  const verrechnung = must(createHolding(msci.document, { accountId: depot.id, name: "Verrechnungskonto", classification: cash }));
  return must(
    saveSnapshot(verrechnung.document, {
      month: "2026-01",
      today: "2026-11-27",
      holdingValues: [
        { holdingId: msci.id, marketValue: 1_000_000 },
        { holdingId: verrechnung.id, marketValue: 50_000 },
      ],
    }),
  ).document;
}

test("close a Position as of a month: it leaves that month's Monatsstand, its history stays", async ({ page, app }) => {
  await save(app.dataFile, PASSWORD, document());
  await page.goto(app.url);
  await unlock(page, PASSWORD);

  await page.getByRole("button", { name: "Konten verwalten" }).click();
  const msci = page.getByRole("listitem").filter({ hasText: "MSCI World" });
  await msci.getByRole("button", { name: "Position schließen" }).click();
  const close = msci.getByRole("form", { name: "Position schließen" });
  // Not before a month that already has a value.
  await close.getByLabel("Geschlossen ab").fill("2026-01");
  await close.getByRole("button", { name: "Schließen" }).click();
  await expect(close.getByRole("alert")).toHaveText(
    "Für diese Position gibt es ab diesem Monat schon Werte. Sie kann erst danach geschlossen werden.",
  );
  await close.getByLabel("Geschlossen ab").fill("2026-02");
  await close.getByRole("button", { name: "Schließen" }).click();
  await expect(msci).toContainText("Geschlossen ab Februar 2026");

  await page.getByRole("button", { name: "Monatsstand" }).click();
  const form = page.getByRole("form", { name: "Monatsstand" });
  await form.getByLabel("Monat", { exact: true }).fill("2026-01");
  await expect(form.getByRole("group", { name: "MSCI World" })).toBeVisible();
  await form.getByLabel("Monat", { exact: true }).fill("2026-02");
  await expect(form.getByRole("group", { name: "Verrechnungskonto" })).toBeVisible();
  await expect(form.getByRole("group", { name: "MSCI World" })).toHaveCount(0);
  await form.getByRole("group", { name: "Verrechnungskonto" }).getByLabel("Wert").fill("1.050.000,00");
  await expect(form.getByLabel("Vermögen", { exact: true })).toHaveText("1.050.000,00 €");
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Monatsstand für Februar 2026 gespeichert.");

  await page.getByRole("button", { name: "Übersicht" }).click();
  await expect(page.getByLabel("Aktuelles Vermögen")).toHaveText("1.050.000,00 €");

  // Reopening brings it back, carried forward.
  await page.getByRole("button", { name: "Konten verwalten" }).click();
  await msci.getByRole("button", { name: "Wieder öffnen" }).click();
  await expect(msci).not.toContainText("Geschlossen ab");
});

test("add a Position from a month and close a whole Konto", async ({ page, app }) => {
  await save(app.dataFile, PASSWORD, document());
  await page.goto(app.url);
  await unlock(page, PASSWORD);

  await page.getByRole("button", { name: "Konten verwalten" }).click();
  const depot = page.getByRole("region", { name: "Depot" });
  const newHolding = depot.getByRole("form", { name: "Position anlegen" });
  await newHolding.getByLabel("Name").fill("S&P 500");
  await newHolding.getByLabel("Anlageklasse").selectOption({ label: "ETF" });
  await newHolding.getByLabel("Beginn").fill("2026-03");
  await newHolding.getByRole("button", { name: "Position anlegen" }).click();
  await expect(depot.getByRole("listitem").filter({ hasText: "S&P 500" })).toContainText("Beginn März 2026");

  await page.getByRole("button", { name: "Monatsstand" }).click();
  const form = page.getByRole("form", { name: "Monatsstand" });
  await form.getByLabel("Monat", { exact: true }).fill("2026-02");
  await expect(form.getByRole("group", { name: "MSCI World" })).toBeVisible();
  await expect(form.getByRole("group", { name: "S&P 500" })).toHaveCount(0);
  await form.getByLabel("Monat", { exact: true }).fill("2026-03");
  await expect(form.getByRole("group", { name: "S&P 500" })).toBeVisible();

  await page.getByRole("button", { name: "Konten verwalten" }).click();
  await depot.getByRole("button", { name: "Konto schließen" }).click();
  const close = depot.getByRole("form", { name: "Konto schließen" });
  await close.getByLabel("Geschlossen ab").fill("2026-04");
  await close.getByRole("button", { name: "Schließen" }).click();
  await expect(depot).toContainText("Geschlossen ab April 2026");

  await page.getByRole("button", { name: "Monatsstand" }).click();
  await form.getByLabel("Monat", { exact: true }).fill("2026-04");
  await expect(form.getByText("In diesem Monat ist keine Position offen.")).toBeVisible();
  await expect(form.getByRole("group", { name: "MSCI World" })).toHaveCount(0);
  await expect(form.getByRole("heading", { name: "Trade Republic" })).toHaveCount(0);
});
