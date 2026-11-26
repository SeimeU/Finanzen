import type { Page } from "@playwright/test";
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

const PASSWORD = "geheim123";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

/** Raiffeisen: Girokonto (Giro, Cash) and Depot (MSCI World, ETF), with two Monatsstände. */
function documentWithHistory(): WealthDocument {
  const cash = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
  const etf = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
  let document = createEmptyDocument();
  const bank = must(createInstitution(document, { name: "Raiffeisen" }));
  const giro = must(createAccount(bank.document, { institutionId: bank.id, name: "Girokonto", defaultClassification: cash }));
  const giroHolding = must(createHolding(giro.document, { accountId: giro.id, name: "Giro", classification: cash }));
  const depot = must(createAccount(giroHolding.document, { institutionId: bank.id, name: "Depot", defaultClassification: etf }));
  const msci = must(createHolding(depot.document, { accountId: depot.id, name: "MSCI World", classification: etf }));
  document = msci.document;
  const today = "2026-11-26";
  document = must(
    saveSnapshot(document, {
      month: "2026-01",
      today,
      holdingValues: [
        { holdingId: giroHolding.id, marketValue: 150_000 },
        { holdingId: msci.id, marketValue: 1_000_000 },
      ],
    }),
  ).document;
  // 500 € paid from Giro into MSCI World, which also gained 250 €.
  return must(
    saveSnapshot(document, {
      month: "2026-02",
      today,
      holdingValues: [
        { holdingId: giroHolding.id, marketValue: 100_000 },
        { holdingId: msci.id, marketValue: 1_075_000, contribution: 50_000 },
      ],
    }),
  ).document;
}

async function unlock(page: Page, url: string) {
  await page.goto(url);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Entsperren" }).click();
  await expect(page.getByRole("heading", { name: "Vermögen" })).toBeVisible();
}

test("see Einzahlung vs Marktveränderung and open a Konto from the start screen and the settings", async ({ page, app }) => {
  await save(app.dataFile, PASSWORD, documentWithHistory());
  await unlock(page, app.url);

  const split = page.getByRole("region", { name: "Einzahlung und Marktveränderung" });
  await expect(split.getByRole("figure", { name: "Einzahlung und Marktveränderung" }).locator("svg")).toBeVisible();
  const february = split.getByRole("row", { name: /Februar 2026/ });
  await expect(february.getByRole("cell")).toHaveText([
    "Februar 2026",
    "500,00 €",
    "250,00 €",
    "-500,00 €",
    "250,00 €",
  ]);

  await page.getByRole("region", { name: "Konten" }).getByRole("button", { name: "Depot" }).click();
  await expect(page.getByRole("heading", { name: "Depot" })).toBeVisible();
  await expect(page.getByLabel("Aktueller Wert")).toHaveText("10.750,00 €");
  await expect(page.getByRole("figure", { name: "Wert im Zeitverlauf" }).locator("svg")).toBeVisible();
  const holdings = page.getByRole("table", { name: "Positionen" });
  await expect(holdings.getByRole("row", { name: /MSCI World/ })).toContainText("10.750,00 €");
  const history = page.getByRole("table", { name: "Verlauf" });
  await expect(history.getByRole("row", { name: /Jänner 2026/ }).getByRole("cell")).toHaveText([
    "Jänner 2026",
    "10.000,00 €",
    "",
  ]);
  await expect(history.getByRole("row", { name: /Februar 2026/ }).getByRole("cell")).toHaveText([
    "Februar 2026",
    "10.750,00 €",
    "500,00 €",
  ]);

  await page.getByRole("button", { name: "Konten verwalten" }).click();
  await page
    .getByRole("region", { name: "Girokonto" })
    .getByRole("button", { name: "Konto ansehen" })
    .click();
  await expect(page.getByRole("heading", { name: "Girokonto" })).toBeVisible();
  await expect(page.getByLabel("Aktueller Wert")).toHaveText("1.000,00 €");

  await page.getByRole("button", { name: "Zurück" }).click();
  await expect(page.getByRole("heading", { name: "Institute, Konten und Positionen" })).toBeVisible();
});
