import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { createAccount, createEmptyDocument, createInstitution, type WealthDocument } from "../src/core";
import { save } from "../src/store";
import { expect, test } from "./fixtures";

const FIXTURE = join(import.meta.dirname, "..", "src", "core", "import", "fixtures", "trade-republic-basic.csv");
const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;

/** A data file with a Trade Republic Institution holding one Account, so it is suggested. */
async function withTradeRepublicAccount(dataFile: string) {
  const document: WealthDocument = createEmptyDocument();
  const tr = createInstitution(document, { name: "Trade Republic" });
  if (!tr.ok) throw new Error();
  const account = createAccount(tr.document, { institutionId: tr.id, name: "Verrechnungskonto", defaultClassification: CASH });
  if (!account.ok) throw new Error();
  await save(dataFile, "geheim123", account.document);
}

async function unlock(page: Page, url: string) {
  await page.goto(url);
  await page.getByLabel("Passwort").fill("geheim123");
  await page.getByRole("button", { name: "Entsperren" }).click();
}

/** Drops a file onto the drop zone the way a browser does: a drop event carrying a DataTransfer. */
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

test("drop a Trade Republic export, confirm, see the Umsätze; a re-drop is all duplicates; undo removes them", async ({
  page,
  app,
}) => {
  await withTradeRepublicAccount(app.dataFile);
  const csv = await readFile(FIXTURE, "utf8");
  await unlock(page, app.url);
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await dropFile(page, "trade-republic.csv", csv);
  const file = page.getByRole("region", { name: "trade-republic.csv" });
  await expect(file).toContainText("Format: Trade Republic");
  await expect(file).toContainText("01.04.2026 – 20.05.2026");
  await expect(file).toContainText("6 neu / 0 Duplikate");
  await expect(file.getByLabel("Konto")).toHaveValue(/a\d+/);
  await expect(file.getByLabel("Konto").locator("option:checked")).toHaveText("Trade Republic – Verrechnungskonto");
  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page.getByRole("status")).toContainText("6 Umsätze importiert.");

  await page.getByRole("button", { name: "Umsätze", exact: true }).click();
  const rows = page.getByRole("table", { name: "Umsätze" }).getByRole("row");
  await expect(rows).toHaveCount(7); // header + 6
  await expect(rows.nth(1)).toContainText("20.05.2026");
  await expect(rows.nth(1)).toContainText("-200,00 €");
  await expect(rows.nth(1)).toContainText("Max Mustermann");
  await page.getByLabel("Suche").fill("billa");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("-23,46 €");
  await page.getByLabel("Suche").fill("");
  await page.getByLabel("Von").fill("2026-05-01");
  await expect(rows).toHaveCount(4);

  // Dropping the same file again: everything is a duplicate.
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await dropFile(page, "trade-republic.csv", csv);
  await expect(page.getByRole("region", { name: "trade-republic.csv" })).toContainText("0 neu / 6 Duplikate");
  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page.getByRole("status")).toContainText("0 Umsätze importiert, 6 Duplikate übersprungen.");

  // Undo the first import.
  const imports = page.getByRole("region", { name: "Bisherige Importe" }).getByRole("listitem");
  await expect(imports).toHaveCount(1);
  await expect(imports.first()).toContainText("trade-republic.csv");
  await imports.first().getByRole("button", { name: "Import rückgängig machen" }).click();
  await expect(imports).toHaveCount(0);
  await page.getByRole("button", { name: "Umsätze", exact: true }).click();
  await expect(page.getByText("Keine Umsätze gefunden.")).toBeVisible();
});

test("an unreadable file is rejected with a German message and nothing is imported", async ({ page, app }) => {
  await withTradeRepublicAccount(app.dataFile);
  await unlock(page, app.url);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await dropFile(page, "kaputt.csv", "irgendwas;ganz;anderes\n1;2;3\n");
  await expect(page.getByRole("region", { name: "kaputt.csv" }).getByRole("alert")).toHaveText(
    "Das Format dieser Datei wurde nicht erkannt. Es wurde nichts importiert.",
  );
  await expect(page.getByRole("button", { name: "Importieren" })).toBeDisabled();
});
