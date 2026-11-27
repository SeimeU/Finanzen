import type { Page } from "@playwright/test";
import { createAccount, createEmptyDocument, createInstitution, createRule, type Result, type WealthDocument } from "../src/core";
import { save } from "../src/store";
import { expect, test } from "./fixtures";
import { unlock } from "./helpers";

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

/** A Raiffeisen Girokonto and rules for salary, rent and groceries. */
async function withGirokontoAndRules(dataFile: string) {
  const rb = must(createInstitution(createEmptyDocument(), { name: "Raiffeisenbank Wien" }));
  let document: WealthDocument = must(
    createAccount(rb.document, { institutionId: rb.id, name: "Girokonto", defaultClassification: CASH }),
  ).document;
  for (const [text, categoryId] of [
    ["gehalt", "einkommen-gehalt"],
    ["miete", "wohnen-miete"],
    ["billa", "lebensmittel-supermarkt"],
  ] as const) {
    document = must(
      createRule(document, { condition: { field: "purpose", operator: "contains", text }, categoryId, applyToExisting: false }),
    ).document;
  }
  await save(dataFile, "geheim123", document);
}

const row = (date: string, text: string, amount: string) => `${date};${text};${date};${amount};EUR;${date} 12:00:00:000`;
const ELBA_NOVEMBER = [
  row("01.11.2026", "Gutschrift Verwendungszweck: Gehalt November Auftraggeber: Firma GmbH", "3.000,00"),
  row("03.11.2026", "Überweisung Verwendungszweck: Miete November Empfänger: Hausverwaltung", "-900,00"),
  row("10.11.2026", "Bezahlung Karte Verwendungszweck: BILLA DANKT Empfänger: BILLA", "-60,00"),
  row("30.11.2026", "Bezahlung Karte Verwendungszweck: Flohmarkt Empfänger: Unbekannt", "-40,00"),
].join("\n");

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

const nav = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();

test("after an import the owner sees spending by Kategorie, drills down, compares, and gets a Sparquote once the Konto is chosen", async ({
  page,
  app,
}) => {
  await withGirokontoAndRules(app.dataFile);
  await page.goto(app.url);
  await unlock(page, "geheim123");

  await nav(page, "Import");
  await dropFile(page, "elba-november.csv", ELBA_NOVEMBER);
  await expect(page.getByRole("region", { name: "elba-november.csv" })).toContainText("4 neu / 0 Duplikate");
  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page.getByRole("status")).toContainText("4 Umsätze importiert.");

  await nav(page, "Ausgaben & Sparquote");
  await expect(page.getByRole("figure", { name: "Einnahmen und Ausgaben" }).locator("svg")).toBeVisible();
  const months = page.getByRole("table", { name: "Sparquote je Monat" });
  const november = months.getByRole("row", { name: /November 2026/ });
  await expect(november).toContainText("3.000,00 €");
  await expect(november).toContainText("1.000,00 €");
  // No Konto is chosen as carrying income and spending yet: no Sparquote.
  await expect(november).toContainText("unvollständig");

  // Spending by top-level Kategorie, Nicht kategorisiert in its own bucket.
  const label = "Ausgaben nach Kategorie – November 2026";
  await expect(page.getByRole("figure", { name: label }).locator("svg")).toBeVisible();
  const categories = page.getByRole("table", { name: label });
  await expect(categories.getByRole("row")).toHaveText([/Wohnen.*900,00 €/, /Lebensmittel.*60,00 €/, /Nicht kategorisiert.*40,00 €/]);

  // Drill down into Wohnen.
  await categories.getByRole("row", { name: /Wohnen/ }).getByRole("button", { name: "Unterkategorien" }).click();
  const wohnen = page.getByRole("table", { name: "Ausgaben nach Kategorie – Wohnen, November 2026" });
  await expect(wohnen.getByRole("row")).toHaveText([/Miete.*900,00 €/]);
  await wohnen.getByRole("row", { name: /Miete/ }).getByRole("button", { name: "Vergleichen" }).click();
  await expect(page.getByRole("figure", { name: "Miete im Vergleich" }).locator("svg")).toBeVisible();
  await expect(page.getByRole("table", { name: "Miete im Vergleich" })).toContainText("900,00 €");

  // The Girokonto carries income and spending, and its import covers all of November.
  const flagResponse = page.waitForResponse("**/api/accounts/carries-cash-flow");
  await page.getByLabel("Raiffeisenbank Wien – Girokonto").click();
  await flagResponse;
  await expect(page.getByLabel("Raiffeisenbank Wien – Girokonto")).toBeChecked();
  await expect(november).toContainText("66,7 %");
});
