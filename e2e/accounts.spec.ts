import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test("create an Institut, a Konto and Positionen; every change survives a restart", async ({ page, app }) => {
  await setPassword(page, app.url, "geheim123");
  await page.getByRole("button", { name: "Konten verwalten" }).click();
  await expect(page.getByRole("heading", { name: "Institute, Konten und Positionen" })).toBeVisible();

  const newInstitution = page.getByRole("form", { name: "Institut anlegen" });
  await newInstitution.getByLabel("Name").fill("Trade Republic");
  await newInstitution.getByRole("button", { name: "Institut anlegen" }).click();
  const institution = page.getByRole("region", { name: "Trade Republic" });
  await expect(institution).toBeVisible();

  const newAccount = institution.getByRole("form", { name: "Konto anlegen" });
  await newAccount.getByLabel("Name").fill("Depot");
  await newAccount.getByLabel("IBAN").fill("DE89 3704 0044 0532 0130 00");
  await newAccount.getByLabel("Anlageklasse").selectOption({ label: "ETF" });
  await newAccount.getByRole("button", { name: "Konto anlegen" }).click();
  const account = institution.getByRole("region", { name: "Depot" });
  await expect(account).toContainText("DE89370400440532013000");
  await expect(account).toContainText("Standardeinordnung: ETF, Verfügbar");

  const newHolding = account.getByRole("form", { name: "Position anlegen" });
  await newHolding.getByLabel("Name").fill("MSCI World");
  await newHolding.getByLabel("Anlageklasse").selectOption({ label: "ETF" });
  await newHolding.getByRole("button", { name: "Position anlegen" }).click();
  await expect(account.getByRole("listitem").filter({ hasText: "MSCI World" })).toContainText("ETF, Verfügbar");

  // A Locked Holding needs a Fälligkeit.
  await newHolding.getByLabel("Name").fill("Festgeld");
  await newHolding.getByLabel("Anlageklasse").selectOption({ label: "Anleihe" });
  await newHolding.getByLabel("Verfügbarkeit").selectOption({ label: "Gebunden bis" });
  await newHolding.getByRole("button", { name: "Position anlegen" }).click();
  await expect(newHolding.getByRole("alert")).toHaveText("Gebundenes Geld braucht eine gültige Fälligkeit.");
  await newHolding.getByLabel("Fälligkeit").fill("2027-03-31");
  await newHolding.getByRole("button", { name: "Position anlegen" }).click();
  await expect(account.getByRole("listitem").filter({ hasText: "Festgeld" })).toContainText(
    "Anleihe, Gebunden bis 31.03.2027",
  );

  // Rename the Institution.
  await institution.getByRole("button", { name: "Institut bearbeiten" }).click();
  const editInstitution = page.getByRole("form", { name: "Institut bearbeiten" });
  await editInstitution.getByLabel("Name").fill("Trade Republic Bank");
  await editInstitution.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("region", { name: "Trade Republic Bank" })).toBeVisible();

  // Reclassify a Holding.
  const msci = page.getByRole("listitem").filter({ hasText: "MSCI World" });
  await msci.getByRole("button", { name: "Position bearbeiten" }).click();
  const editHolding = page.getByRole("form", { name: "Position bearbeiten" });
  await editHolding.getByLabel("Anlageklasse").selectOption({ label: "Aktie" });
  await editHolding.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "MSCI World" })).toContainText("Aktie, Verfügbar");

  await app.restart();
  await page.goto(app.url);
  await page.getByLabel("Passwort").fill("geheim123");
  await page.getByRole("button", { name: "Entsperren" }).click();
  await page.getByRole("button", { name: "Konten verwalten" }).click();
  const saved = page.getByRole("region", { name: "Trade Republic Bank" });
  await expect(saved.getByRole("region", { name: "Depot" })).toBeVisible();
  await expect(saved.getByRole("listitem").filter({ hasText: "MSCI World" })).toContainText("Aktie, Verfügbar");
  await expect(saved.getByRole("listitem").filter({ hasText: "Festgeld" })).toContainText("Gebunden bis 31.03.2027");
});

test("a debt Konto is marked as Schulden", async ({ page, app }) => {
  await setPassword(page, app.url, "geheim123");
  await page.getByRole("button", { name: "Konten verwalten" }).click();
  const newInstitution = page.getByRole("form", { name: "Institut anlegen" });
  await newInstitution.getByLabel("Name").fill("Raiffeisen");
  await newInstitution.getByRole("button", { name: "Institut anlegen" }).click();

  const newAccount = page.getByRole("region", { name: "Raiffeisen" }).getByRole("form", { name: "Konto anlegen" });
  await newAccount.getByLabel("Name").fill("Kredit");
  await newAccount.getByLabel("Schulden").check();
  await newAccount.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(page.getByRole("region", { name: "Kredit" })).toContainText("Schulden");
});

async function setPassword(page: Page, url: string, password: string) {
  await page.goto(url);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByLabel("Passwort wiederholen").fill(password);
  await page.getByRole("button", { name: "Passwort festlegen" }).click();
  await expect(page.getByRole("heading", { name: "Vermögen" })).toBeVisible();
}
