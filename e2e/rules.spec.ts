import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { confirmImport, createAccount, createEmptyDocument, createInstitution } from "../src/core";
import { save } from "../src/store";
import { expect, test } from "./fixtures";
import { unlock } from "./helpers";

const FIXTURE = join(import.meta.dirname, "..", "src", "core", "import", "fixtures", "trade-republic-basic.csv");
const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;

/** A data file with the Trade Republic sample already imported onto one Account. */
async function withImportedTradeRepublicFile(dataFile: string) {
  const tr = createInstitution(createEmptyDocument(), { name: "Trade Republic" });
  if (!tr.ok) throw new Error();
  const account = createAccount(tr.document, { institutionId: tr.id, name: "Verrechnungskonto", defaultClassification: CASH });
  if (!account.ok) throw new Error();
  const bytes = new Uint8Array(await readFile(FIXTURE));
  const imported = confirmImport(account.document, {
    importedAt: "2026-11-26T10:00:00Z",
    files: [{ name: "tr.csv", bytes, accountId: account.id }],
  });
  if (!imported.ok) throw new Error(imported.error.message);
  await save(dataFile, "geheim123", imported.document);
}

const nav = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();

test("creating a rule from an inbox Transaction categorizes the matching Transactions", async ({ page, app }) => {
  await withImportedTradeRepublicFile(app.dataFile);
  await page.goto(app.url);
  await unlock(page, "geheim123");

  await nav(page, "Nicht kategorisiert");
  const inbox = page.getByRole("table", { name: "Nicht kategorisiert" });
  await expect(inbox.getByRole("row")).toHaveCount(4); // header + 3
  await inbox.getByRole("row", { name: /Kartenzahlung Billa/ }).getByRole("button", { name: "Regel erstellen" }).click();

  const form = page.getByRole("form", { name: "Neue Regel" });
  await expect(form.getByLabel("Feld")).toHaveValue("counterparty");
  await expect(form.getByLabel("Bedingung")).toHaveValue("contains");
  await expect(form.getByLabel("Text")).toHaveValue("BILLA DANKT");
  await expect(form.getByLabel("Auf bestehende Umsätze anwenden")).toBeChecked();
  await form.getByLabel("Text").fill("billa");
  await form.getByLabel("Kategorie").selectOption({ label: "Lebensmittel → Supermarkt" });
  await form.getByRole("button", { name: "Regel anlegen" }).click();

  await expect(inbox.getByRole("row")).toHaveCount(3);
  await expect(inbox).not.toContainText("Billa");

  await nav(page, "Umsätze");
  await expect(page.getByRole("row", { name: /Kartenzahlung Billa/ }).getByLabel("Kategorie")).toHaveValue("lebensmittel-supermarkt");

  await nav(page, "Regeln");
  await expect(page.getByRole("list", { name: "Regeln" }).getByRole("listitem")).toHaveText([
    /Gegenüber enthält „billa“ → Lebensmittel → Supermarkt/,
  ]);
});

test("the rules editor: order, and re-applying rules to existing Transactions", async ({ page, app }) => {
  await withImportedTradeRepublicFile(app.dataFile);
  await page.goto(app.url);
  await unlock(page, "geheim123");

  await nav(page, "Regeln");
  const form = page.getByRole("form", { name: "Neue Regel" });
  const addRule = async (field: string, text: string, category: string) => {
    await form.getByLabel("Feld").selectOption({ label: field });
    await form.getByLabel("Text").fill(text);
    await form.getByLabel("Kategorie").selectOption({ label: category });
    await form.getByLabel("Auf bestehende Umsätze anwenden").uncheck();
    await form.getByRole("button", { name: "Regel anlegen" }).click();
    await expect(form.getByLabel("Text")).toHaveValue(""); // saved: the form clears itself
  };
  const rules = page.getByRole("list", { name: "Regeln" }).getByRole("listitem");
  await addRule("Gegenüber", "mustermann", "Einkommen → Sonstige Einnahmen");
  await addRule("Zahlungsreferenz", "miete", "Wohnen → Miete");
  await expect(rules).toHaveText([/Gegenüber enthält „mustermann“/, /Zahlungsreferenz enthält „miete“/]);

  // Moving "miete" first makes it win for the rent transfer (whose counterparty is also Max Mustermann).
  await rules.nth(1).getByRole("button", { name: "Nach oben" }).click();
  await expect(rules).toHaveText([/Zahlungsreferenz enthält „miete“/, /Gegenüber enthält „mustermann“/]);

  // Not applied yet: both still wait in the inbox.
  await nav(page, "Nicht kategorisiert");
  await expect(page.getByRole("table", { name: "Nicht kategorisiert" }).getByRole("row")).toHaveCount(4);

  await nav(page, "Regeln");
  await page.getByRole("button", { name: "Regeln erneut anwenden" }).click();
  await expect(page.getByRole("status")).toHaveText("2 Umsätze neu kategorisiert.");

  await nav(page, "Umsätze");
  await expect(page.getByRole("row", { name: /Überweisung/ }).getByLabel("Kategorie")).toHaveValue("wohnen-miete");
  await expect(page.getByRole("row", { name: /Einzahlung/ }).getByLabel("Kategorie")).toHaveValue("einkommen-sonstige");

  // A Category set by hand survives re-applying.
  const saved = page.waitForResponse("**/api/transactions/category");
  await page.getByRole("row", { name: /Überweisung/ }).getByLabel("Kategorie").selectOption({ label: "Sonstiges" });
  await saved;
  await nav(page, "Regeln");
  await page.getByRole("button", { name: "Regeln erneut anwenden" }).click();
  await expect(page.getByRole("status")).toHaveText("0 Umsätze neu kategorisiert.");
  await nav(page, "Umsätze");
  await expect(page.getByRole("row", { name: /Überweisung/ }).getByLabel("Kategorie")).toHaveValue("sonstiges");

  // Deleting a rule.
  await nav(page, "Regeln");
  await rules.first().getByRole("button", { name: "Löschen" }).click();
  await expect(rules).toHaveText([/Gegenüber enthält „mustermann“/]);
});
