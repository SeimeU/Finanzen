import type { Page } from "@playwright/test";
import { createAccount, createEmptyDocument, createInstitution } from "../src/core";
import { save } from "../src/store";
import { expect, test } from "./fixtures";

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;

/** A bank without a built-in Import profile, with two Accounts. */
async function withErsteBank(dataFile: string) {
  const bank = createInstitution(createEmptyDocument(), { name: "Erste Bank" });
  if (!bank.ok) throw new Error();
  const giro = createAccount(bank.document, { institutionId: bank.id, name: "Giro", defaultClassification: CASH });
  if (!giro.ok) throw new Error();
  const savings = createAccount(giro.document, { institutionId: bank.id, name: "Sparen", defaultClassification: CASH });
  if (!savings.ok) throw new Error();
  await save(dataFile, "geheim123", savings.document);
}

async function unlock(page: Page, url: string) {
  await page.goto(url);
  await page.getByLabel("Passwort").fill("geheim123");
  await page.getByRole("button", { name: "Entsperren" }).click();
}

async function dropFile(page: Page, name: string, content: string) {
  const dataTransfer = await page.evaluateHandle(
    ({ name, content }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([content], name, { type: "text/csv" }));
      return transfer;
    },
    { name, content },
  );
  await page.getByRole("region", { name: "CSV-Dateien hier ablegen" }).dispatchEvent("drop", { dataTransfer });
}

const CSV = [
  "Kontoauszug Erste Bank",
  "Datum;Betrag;Empfänger;Verwendungszweck;IBAN",
  "03.05.2026;-1.234,56;Hausverwaltung;Miete Mai;AT61 1904 3002 3457 3201",
  "15.05.2026;2.500,00;Arbeitgeber GmbH;Gehalt;",
].join("\n");

test("set up an Importprofil for an unknown bank with a live preview; the next file is read automatically", async ({
  page,
  app,
}) => {
  await withErsteBank(app.dataFile);
  await unlock(page, app.url);
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await dropFile(page, "erste-mai.csv", CSV);
  const file = page.getByRole("region", { name: "erste-mai.csv" });
  await file.getByRole("button", { name: "Importprofil anlegen" }).click();

  const setup = file.getByRole("form", { name: "Importprofil anlegen" });
  const preview = setup.getByRole("region", { name: "Vorschau" });
  await setup.getByLabel("Konto").selectOption({ label: "Erste Bank – Giro" });
  await setup.getByLabel("Trennzeichen", { exact: true }).selectOption({ label: "Semikolon (;)" });
  await setup.getByLabel("Zeilen überspringen").fill("2");
  await setup.getByLabel("Datumsformat").selectOption("DD.MM.YYYY");
  await setup.getByLabel("Dezimaltrennzeichen").selectOption({ label: "Komma (1.234,56)" });
  await expect(preview.getByRole("alert")).toHaveText("Bitte eine Spalte für „Datum“ wählen.");

  await setup.getByLabel("Spalte für Datum").selectOption({ label: "Spalte 1: Datum" });
  await setup.getByLabel("Spalte für Betrag").selectOption({ label: "Spalte 2: Betrag" });
  await setup.getByLabel("Spalte für Gegenüber").selectOption({ label: "Spalte 3: Empfänger" });
  await setup.getByLabel("Spalte für Verwendungszweck").selectOption({ label: "Spalte 4: Verwendungszweck" });
  await setup.getByLabel("Spalte für IBAN").selectOption({ label: "Spalte 5: IBAN" });

  const rows = preview.getByRole("table", { name: "Vorschau der Umsätze" }).getByRole("row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("03.05.2026");
  await expect(rows.nth(1)).toContainText("-1.234,56 €");
  await expect(rows.nth(1)).toContainText("Hausverwaltung");
  await expect(rows.nth(1)).toContainText("AT611904300234573201");
  await expect(rows.nth(2)).toContainText("2.500,00 €");

  await setup.getByRole("button", { name: "Importprofil speichern" }).click();
  await expect(file).toContainText("Format: Importprofil Erste Bank – Giro");
  await expect(file).toContainText("2 neu / 0 Duplikate");
  await expect(file.getByLabel("Konto").locator("option:checked")).toHaveText("Erste Bank – Giro");
  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page.getByRole("status")).toContainText("2 Umsätze importiert.");

  // After a restart, the next month's file is recognized and assigned without any setup.
  await app.restart();
  await unlock(page, app.url);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await dropFile(page, "erste-juni.csv", `${CSV}\n02.06.2026;-12,30;Billa;Einkauf;`);
  const next = page.getByRole("region", { name: "erste-juni.csv" });
  await expect(next).toContainText("Format: Importprofil Erste Bank – Giro");
  await expect(next).toContainText("1 neu / 2 Duplikate");
  await expect(next.getByLabel("Konto").locator("option:checked")).toHaveText("Erste Bank – Giro");
});
