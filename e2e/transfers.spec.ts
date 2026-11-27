import type { Page } from "@playwright/test";
import { confirmImport, createAccount, createEmptyDocument, createInstitution, type Result } from "../src/core";
import { save } from "../src/store";
import { expect, test } from "./fixtures";
import { unlock } from "./helpers";

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
const TR_HEADER =
  "datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,original_amount,original_currency,fx_rate,description,transaction_id,counterparty_name,counterparty_iban,payment_reference,mcc_code";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

/**
 * Girokonto (ELBA) sends 500 € to Trade Republic on 2 Nov, arriving on 4 Nov; no Account has an
 * IBAN, so the pair is only a suggestion. Plus a card payment on the Girokonto.
 */
async function withTransferBetweenOwnAccounts(dataFile: string) {
  const rb = must(createInstitution(createEmptyDocument(), { name: "Raiffeisenbank Wien" }));
  const tr = must(createInstitution(rb.document, { name: "Trade Republic" }));
  const giro = must(createAccount(tr.document, { institutionId: rb.id, name: "Girokonto", defaultClassification: CASH }));
  const cash = must(createAccount(giro.document, { institutionId: tr.id, name: "Verrechnungskonto", defaultClassification: CASH }));
  const elba = [
    "02.11.2026;Überweisung Verwendungszweck: Sparen November Empfänger: Max Mustermann;02.11.2026;-500,00;EUR;02.11.2026 12:00:00:000",
    "03.11.2026;Bezahlung Karte Empfänger: BILLA DANKT;03.11.2026;-23,46;EUR;03.11.2026 12:00:00:000",
  ].join("\n");
  const trCsv = [
    TR_HEADER,
    "2026-11-04T10:00:00Z,2026-11-04,DEFAULT,CASH,CUSTOMER_INBOUND,,,,,,500.00,,,EUR,,,,Einzahlung,id-1,Max Mustermann,,,",
  ].join("\n");
  const encode = (text: string) => new TextEncoder().encode(text);
  const imported = must(
    confirmImport(cash.document, {
      importedAt: "2026-11-26T10:00:00Z",
      files: [
        { name: "elba.csv", bytes: encode(elba), accountId: giro.id },
        { name: "tr.csv", bytes: encode(trCsv), accountId: cash.id },
      ],
    }),
  );
  await save(dataFile, "geheim123", imported.document);
}

const nav = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();

test("the owner accepts a suggested Umbuchung, and marks and unmarks Umbuchungen by hand", async ({ page, app }) => {
  await withTransferBetweenOwnAccounts(app.dataFile);
  await page.goto(app.url);
  await unlock(page, "geheim123");

  // Umbuchungen: the equal and opposite pair is suggested.
  await nav(page, "Umbuchungen");
  const suggestions = page.getByRole("table", { name: "Vorgeschlagene Umbuchungen" });
  const suggestion = suggestions.getByRole("row", { name: /Sparen November/ });
  await expect(suggestion).toContainText("Einzahlung");
  await suggestion.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByText("Keine Vorschläge.")).toBeVisible();

  // Umsätze: both sides are Umbuchungen now, so the inbox only holds the card payment.
  await nav(page, "Umsätze");
  const transactions = page.getByRole("table", { name: "Umsätze" });
  await expect(transactions.getByRole("row", { name: /Sparen November/ }).getByLabel("Umbuchung")).toBeChecked();
  await expect(transactions.getByRole("row", { name: /Einzahlung/ }).getByLabel("Umbuchung")).toBeChecked();
  await nav(page, "Nicht kategorisiert");
  await expect(page.getByRole("table", { name: "Nicht kategorisiert" }).getByRole("row")).toHaveCount(2); // header + 1

  // Mark the card payment by hand, unmark the inbound side. The box shows the saved state once the list reloads.
  await nav(page, "Umsätze");
  const card = transactions.getByRole("row", { name: /Bezahlung Karte/ }).getByLabel("Umbuchung");
  const inbound = transactions.getByRole("row", { name: /Einzahlung/ }).getByLabel("Umbuchung");
  await card.click();
  await expect(card).toBeChecked();
  await inbound.click();
  await expect(inbound).not.toBeChecked();
  await expect(transactions.getByRole("row", { name: /Einzahlung/ }).getByLabel("Kategorie").locator("option:checked")).toHaveText(
    "Nicht kategorisiert",
  );

  // It sticks across a restart.
  await app.restart();
  await page.goto(app.url);
  await unlock(page, "geheim123");
  await nav(page, "Nicht kategorisiert");
  const inbox = page.getByRole("table", { name: "Nicht kategorisiert" });
  await expect(inbox.getByRole("row")).toHaveCount(2);
  await expect(inbox).toContainText("Einzahlung");
});

test("a rejected suggestion is not offered again", async ({ page, app }) => {
  await withTransferBetweenOwnAccounts(app.dataFile);
  await page.goto(app.url);
  await unlock(page, "geheim123");
  await nav(page, "Umbuchungen");
  await page.getByRole("row", { name: /Sparen November/ }).getByRole("button", { name: "Ablehnen" }).click();
  await expect(page.getByText("Keine Vorschläge.")).toBeVisible();
  await nav(page, "Nicht kategorisiert");
  await expect(page.getByRole("table", { name: "Nicht kategorisiert" }).getByRole("row")).toHaveCount(4);
  await nav(page, "Umbuchungen");
  await expect(page.getByText("Keine Vorschläge.")).toBeVisible();
});
