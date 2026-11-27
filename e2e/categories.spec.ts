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

test("Trade Republic rows arrive classified; the owner adds a Category and sorts the inbox with it", async ({ page, app }) => {
  await withImportedTradeRepublicFile(app.dataFile);
  await page.goto(app.url);
  await unlock(page, "geheim123");

  // Umsätze: Trades and Kapitalerträge are already classified.
  await nav(page, "Umsätze");
  const transactions = page.getByRole("table", { name: "Umsätze" });
  await expect(
    transactions.getByRole("row", { name: /Kauf iShares/ }).getByLabel("Kategorie").locator("option:checked"),
  ).toHaveText("Kauf");
  await expect(transactions.getByRole("row", { name: /Zinsen April/ }).getByLabel("Kategorie")).toHaveValue(
    "kapitalertraege-zinsen",
  );

  // Kategorien: add "Haustier" (Ausgabe) with the child "Futter".
  await nav(page, "Kategorien");
  const form = page.getByRole("form", { name: "Neue Kategorie" });
  await form.getByLabel("Name").fill("Haustier");
  await form.getByLabel("Art").selectOption({ label: "Ausgabe" });
  await form.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByRole("listitem", { name: "Haustier" })).toContainText("Ausgabe");
  await form.getByLabel("Name").fill("Futter");
  await form.getByLabel("Übergeordnet").selectOption({ label: "Haustier" });
  await form.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByRole("listitem", { name: "Haustier" }).getByRole("listitem", { name: "Futter" })).toBeVisible();

  // The inbox holds the three rows nothing classified.
  await nav(page, "Nicht kategorisiert");
  const inbox = page.getByRole("table", { name: "Nicht kategorisiert" });
  await expect(inbox.getByRole("row")).toHaveCount(4); // header + 3
  await inbox.getByRole("row", { name: /Kartenzahlung Billa/ }).getByLabel("Kategorie").selectOption({ label: "Haustier → Futter" });
  await expect(inbox.getByRole("row")).toHaveCount(3);
  await expect(inbox).not.toContainText("Billa");

  // It sticks across a restart.
  await app.restart();
  await page.goto(app.url);
  await unlock(page, "geheim123");
  await nav(page, "Nicht kategorisiert");
  await expect(page.getByRole("table", { name: "Nicht kategorisiert" }).getByRole("row")).toHaveCount(3);
  await nav(page, "Umsätze");
  await expect(page.getByRole("row", { name: /Kartenzahlung Billa/ }).getByLabel("Kategorie")).toHaveValue(/^c\d+$/);
  await expect(
    page.getByRole("row", { name: /Kartenzahlung Billa/ }).getByLabel("Kategorie").locator("option:checked"),
  ).toHaveText("Haustier → Futter");
});

test("renaming and deleting a Category", async ({ page, app }) => {
  await withImportedTradeRepublicFile(app.dataFile);
  await page.goto(app.url);
  await unlock(page, "geheim123");
  await nav(page, "Kategorien");
  const wohnen = page.getByRole("listitem", { name: "Wohnen" });
  await expect(page.getByRole("button", { name: "Wohnen löschen" })).toBeDisabled();
  const miete = wohnen.getByRole("listitem", { name: "Miete" });
  await miete.getByLabel("Name").fill("Wohnungsmiete");
  await miete.getByRole("button", { name: "Speichern" }).click();
  await expect(wohnen.getByRole("listitem", { name: "Wohnungsmiete" })).toBeVisible();
  await page.getByRole("button", { name: "Wohnungsmiete löschen" }).click();
  await expect(wohnen.getByRole("listitem", { name: "Wohnungsmiete" })).toHaveCount(0);
});
