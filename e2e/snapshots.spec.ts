import type { Page } from "@playwright/test";
import { createAccount, createEmptyDocument, createHolding, createInstitution, type Result, type WealthDocument } from "../src/core";
import { save } from "../src/store";
import { expect, test } from "./fixtures";

const PASSWORD = "geheim123";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

/** Raiffeisen: Girokonto (Cash) and Depot with MSCI World (ETF). */
function structure(): WealthDocument {
  const cash = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
  const etf = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
  let document = createEmptyDocument();
  const bank = must(createInstitution(document, { name: "Raiffeisen" }));
  const giro = must(createAccount(bank.document, { institutionId: bank.id, name: "Girokonto", defaultClassification: cash }));
  document = must(createHolding(giro.document, { accountId: giro.id, name: "Giro", classification: cash })).document;
  const depot = must(createAccount(document, { institutionId: bank.id, name: "Depot", defaultClassification: etf }));
  return must(createHolding(depot.document, { accountId: depot.id, name: "MSCI World", classification: etf })).document;
}

async function unlock(page: Page, url: string) {
  await page.goto(url);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Entsperren" }).click();
  await expect(page.getByRole("heading", { name: "Vermögen" })).toBeVisible();
}

test("enter two Monatsstände, the second pre-filled from the first, and see Vermögen update", async ({ page, app }) => {
  await save(app.dataFile, PASSWORD, structure());
  await unlock(page, app.url);
  await expect(page.getByText("Noch kein Monatsstand erfasst.")).toBeVisible();

  await page.getByRole("button", { name: "Monatsstand" }).click();
  const form = page.getByRole("form", { name: "Monatsstand" });
  await form.getByLabel("Monat", { exact: true }).fill("2026-01");
  const giro = form.getByRole("group", { name: "Giro" });
  const msci = form.getByRole("group", { name: "MSCI World" });
  await expect(giro.getByLabel("Einzahlung")).toHaveCount(0);

  await giro.getByLabel("Wert").fill("1.500,00");
  await expect(form.getByLabel("Vermögen", { exact: true })).toHaveText("1.500,00 €");
  await msci.getByLabel("Wert").fill("10.000");
  await msci.getByLabel("Einzahlung").fill("500");
  await expect(form.getByLabel("Vermögen", { exact: true })).toHaveText("11.500,00 €");
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Monatsstand für Jänner 2026 gespeichert.");

  await form.getByLabel("Monat", { exact: true }).fill("2026-02");
  await expect(giro.getByLabel("Wert")).toHaveValue("1.500,00");
  await expect(msci.getByLabel("Wert")).toHaveValue("10.000,00");
  await expect(msci.getByLabel("Einzahlung")).toHaveValue("");
  await expect(form.getByLabel("Veränderung zum Vormonat")).toHaveText("0,00 €");

  await msci.getByLabel("Wert").fill("10.250,00");
  await expect(form.getByLabel("Vermögen", { exact: true })).toHaveText("11.750,00 €");
  await expect(form.getByLabel("Veränderung zum Vormonat")).toHaveText("250,00 €");
  await expect(giro).toContainText("nicht aktualisiert");
  await expect(msci).not.toContainText("nicht aktualisiert");
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Monatsstand für Februar 2026 gespeichert.");

  // A typo is reported, not saved.
  await msci.getByLabel("Wert").fill("10,250,00");
  await expect(msci.getByRole("alert")).toHaveText("Bitte einen Betrag wie 1.234,56 eingeben.");
  await expect(form.getByRole("button", { name: "Speichern", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Übersicht" }).click();
  await expect(page.getByLabel("Aktuelles Vermögen")).toHaveText("11.750,00 €");
  await expect(page.getByRole("figure", { name: "Vermögen im Zeitverlauf" }).locator("svg")).toBeVisible();

  // Saved for good, and Giro was flagged as carried forward.
  await app.restart();
  await unlock(page, app.url);
  await expect(page.getByLabel("Aktuelles Vermögen")).toHaveText("11.750,00 €");
  await page.getByRole("button", { name: "Monatsstand" }).click();
  await form.getByLabel("Monat", { exact: true }).fill("2026-02");
  await expect(msci.getByLabel("Wert")).toHaveValue("10.250,00");
  await expect(giro).toContainText("nicht aktualisiert");
});
