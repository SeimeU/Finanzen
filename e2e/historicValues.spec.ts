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

/** Raiffeisen: Girokonto (Giro, Cash) and Depot (MSCI World, ETF); January 2026 recorded per Holding. */
function trackedFromJanuary(): WealthDocument {
  const cash = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
  const etf = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
  let document = createEmptyDocument();
  const bank = must(createInstitution(document, { name: "Raiffeisen" }));
  const giro = must(createAccount(bank.document, { institutionId: bank.id, name: "Girokonto", defaultClassification: cash }));
  const giroHolding = must(createHolding(giro.document, { accountId: giro.id, name: "Giro", classification: cash }));
  const depot = must(createAccount(giroHolding.document, { institutionId: bank.id, name: "Depot", defaultClassification: etf }));
  const msci = must(createHolding(depot.document, { accountId: depot.id, name: "MSCI World", classification: etf }));
  document = msci.document;
  return must(
    saveSnapshot(document, {
      month: "2026-01",
      today: "2026-01-31",
      holdingValues: [
        { holdingId: giroHolding.id, marketValue: 120_000 },
        { holdingId: msci.id, marketValue: 560_000 },
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

test("enter three historic months as Kontostand gesamt, one after another", async ({ page, app }) => {
  await save(app.dataFile, PASSWORD, trackedFromJanuary());
  await unlock(page, app.url);
  await page.getByRole("button", { name: "Monatsstand" }).click();
  const form = page.getByRole("form", { name: "Monatsstand" });
  const monthInput = form.getByLabel("Monat", { exact: true });
  const girokonto = form.getByRole("region", { name: "Girokonto" });
  const depot = form.getByRole("region", { name: "Depot" });
  const vermoegen = form.getByLabel("Vermögen", { exact: true });

  // October 2025: both Accounts still show Holdings until switched to Kontostand gesamt.
  await monthInput.fill("2025-10");
  await expect(girokonto.getByRole("group", { name: "Giro" })).toBeVisible();
  await expect(girokonto).toContainText("bis einschließlich Dezember 2025");
  await girokonto.getByRole("button", { name: "Kontostand gesamt erfassen" }).click();
  await depot.getByRole("button", { name: "Kontostand gesamt erfassen" }).click();
  await expect(girokonto.getByRole("group", { name: "Giro" })).toHaveCount(0);
  await expect(girokonto).toContainText("Werte pro Position ab Jänner 2026.");
  await girokonto.getByLabel("Kontostand gesamt").fill("1.000");
  await depot.getByLabel("Kontostand gesamt").fill("5.000,00");
  await expect(vermoegen).toHaveText("6.000,00 €");
  await form.getByRole("button", { name: "Speichern und nächster Monat" }).click();

  // November: pre-filled from October.
  await expect(monthInput).toHaveValue("2025-11");
  await expect(form.getByRole("status")).toHaveText("Monatsstand für Oktober 2025 gespeichert.");
  await expect(girokonto.getByLabel("Kontostand gesamt")).toHaveValue("1.000,00");
  await expect(depot.getByLabel("Kontostand gesamt")).toHaveValue("5.000,00");
  await expect(form.getByLabel("Veränderung zum Vormonat")).toHaveText("0,00 €");
  await depot.getByLabel("Kontostand gesamt").fill("5.200");
  await expect(girokonto).toContainText("nicht aktualisiert");
  await form.getByRole("button", { name: "Speichern und nächster Monat" }).click();

  // December.
  await expect(monthInput).toHaveValue("2025-12");
  await expect(depot.getByLabel("Kontostand gesamt")).toHaveValue("5.200,00");
  await girokonto.getByLabel("Kontostand gesamt").fill("1.100");
  await depot.getByLabel("Kontostand gesamt").fill("5.400");
  await expect(form.getByLabel("Veränderung zum Vormonat")).toHaveText("300,00 €");
  await form.getByRole("button", { name: "Speichern und nächster Monat" }).click();

  // January 2026 is per Holding: the Kontostand gesamt is not carried into it.
  await expect(monthInput).toHaveValue("2026-01");
  await expect(girokonto.getByLabel("Kontostand gesamt")).toHaveCount(0);
  await expect(girokonto.getByRole("group", { name: "Giro" }).getByLabel("Wert")).toHaveValue("1.200,00");
  await expect(vermoegen).toHaveText("6.800,00 €");
  await expect(form.getByLabel("Veränderung zum Vormonat")).toHaveText("300,00 €");

  // Saved for good; going back month by month shows what was entered.
  await app.restart();
  await unlock(page, app.url);
  await page.getByRole("button", { name: "Monatsstand" }).click();
  await monthInput.fill("2025-12");
  await expect(girokonto.getByLabel("Kontostand gesamt")).toHaveValue("1.100,00");
  await form.getByRole("button", { name: "Speichern und Vormonat" }).click();
  await expect(monthInput).toHaveValue("2025-11");
  await expect(depot.getByLabel("Kontostand gesamt")).toHaveValue("5.200,00");
  await expect(girokonto).toContainText("nicht aktualisiert");
  await page.getByRole("button", { name: "Übersicht" }).click();
  await expect(page.getByLabel("Aktuelles Vermögen")).toHaveText("6.800,00 €");
  await expect(page.getByRole("figure", { name: "Vermögen im Zeitverlauf" }).locator("svg")).toBeVisible();
});
