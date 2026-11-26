import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { createAccount, createEmptyDocument, createInstitution, type WealthDocument } from "../src/core";
import { save } from "../src/store";
import { expect, test } from "./fixtures";

const FIXTURE = join(import.meta.dirname, "..", "src", "core", "import", "fixtures", "trade-republic-basic.csv");
const ELBA_FIXTURE = join(import.meta.dirname, "..", "src", "core", "import", "fixtures", "elba-basic.csv");
const CASH ={ assetClass: "cash", liquidity: "available", maturityDate: null } as const;

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

/** Drops files onto the drop zone the way a browser does: a drop event carrying a DataTransfer. */
async function dropFiles(page: Page, files: { name: string; content: string }[]) {
  const dataTransfer = await page.evaluateHandle((files) => {
    const transfer = new DataTransfer();
    for (const { name, content } of files) transfer.items.add(new File([content], name, { type: "text/csv" }));
    return transfer;
  }, files);
  await page.getByRole("region", { name: "CSV-Dateien hier ablegen" }).dispatchEvent("drop", { dataTransfer });
}

const dropFile = (page: Page, name: string, content: string) => dropFiles(page, [{ name, content }]);

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

test("drop a Trade Republic and an ELBA file together, confirm both and see their Umsätze", async ({ page, app }) => {
  let document: WealthDocument = createEmptyDocument();
  for (const [institution, account] of [
    ["Trade Republic", "Verrechnungskonto"],
    ["Raiffeisenbank", "Girokonto"],
  ] as const) {
    const created = createInstitution(document, { name: institution });
    if (!created.ok) throw new Error();
    const added = createAccount(created.document, { institutionId: created.id, name: account, defaultClassification: CASH });
    if (!added.ok) throw new Error();
    document = added.document;
  }
  await save(app.dataFile, "geheim123", document);
  await unlock(page, app.url);
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await dropFiles(page, [
    { name: "trade-republic.csv", content: await readFile(FIXTURE, "utf8") },
    { name: "elba-giro.csv", content: await readFile(ELBA_FIXTURE, "utf8") },
  ]);
  const tr = page.getByRole("region", { name: "trade-republic.csv" });
  const elba = page.getByRole("region", { name: "elba-giro.csv" });
  await expect(tr).toContainText("Format: Trade Republic");
  await expect(tr.getByLabel("Konto").locator("option:checked")).toHaveText("Trade Republic – Verrechnungskonto");
  await expect(elba).toContainText("Format: Raiffeisen ELBA");
  await expect(elba).toContainText("01.10.2026 – 31.10.2026");
  await expect(elba).toContainText("5 neu / 0 Duplikate");
  await expect(elba.getByLabel("Konto").locator("option:checked")).toHaveText("Raiffeisenbank – Girokonto");
  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page.getByRole("status")).toContainText("11 Umsätze importiert.");

  await page.getByRole("button", { name: "Umsätze", exact: true }).click();
  const rows = page.getByRole("table", { name: "Umsätze" }).getByRole("row");
  await expect(rows).toHaveCount(12); // header + 6 + 5
  await page.getByLabel("Suche").fill("wien energie");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("15.10.2026");
  await expect(rows.nth(1)).toContainText("Raiffeisenbank – Girokonto");
  await expect(rows.nth(1)).toContainText("Strom Oktober");
  await expect(rows.nth(1)).toContainText("-84,10 €");
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
