import { createAccount, createEmptyDocument, createHolding, createInstitution, saveSnapshot, type Result } from "../src/core";
import { save } from "../src/store";
import { expect, test } from "./fixtures";
import { unlock } from "./helpers";

const PASSWORD = "geheim123";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

/** Girokonto with Monatsstände for Jänner to März 2026. */
function documentWithHistory() {
  const cash = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
  const bank = must(createInstitution(createEmptyDocument(), { name: "Raiffeisen" }));
  const giro = must(createAccount(bank.document, { institutionId: bank.id, name: "Girokonto", defaultClassification: cash }));
  const holding = must(createHolding(giro.document, { accountId: giro.id, name: "Giro", classification: cash }));
  let document = holding.document;
  for (const [month, marketValue] of [["2026-01", 3_000_000], ["2026-02", 1_500_000], ["2026-03", 1_600_000]] as const) {
    document = must(saveSnapshot(document, { month, today: "2026-11-26", holdingValues: [{ holdingId: holding.id, marketValue }] })).document;
  }
  return document;
}

/** Event markers are drawn in this colour (see NetWorthChart.tsx). */
const MARKER = 'path[fill="#c2410c"]';

test("add a Note and an Event to a month, see the Event's marker on the chart and both in the list", async ({ page, app }) => {
  await save(app.dataFile, PASSWORD, documentWithHistory());
  await page.goto(app.url);
  await unlock(page, PASSWORD);

  // At the bottom of the Monatsstand form.
  await page.getByRole("button", { name: "Monatsstand" }).click();
  await page.getByRole("form", { name: "Monatsstand" }).getByLabel("Monat", { exact: true }).fill("2026-02");
  const notes = page.getByRole("region", { name: "Notiz und Ereignisse" });
  await notes.getByLabel("Notiz").fill("Neues Auto, dafür Erspartes aufgelöst.");
  await notes.getByRole("button", { name: "Notiz speichern" }).click();
  await expect(notes.getByRole("status")).toHaveText("Notiz gespeichert.");
  await notes.getByLabel("Bezeichnung").fill("Auto gekauft");
  await notes.getByLabel("Betrag").fill("-15.000");
  await notes.getByRole("button", { name: "Ereignis hinzufügen" }).click();
  const event = notes.getByRole("listitem").filter({ hasText: "Auto gekauft" });
  await expect(event).toContainText("-15.000,00 €");

  // Marker on the chart, with label and amount on hover.
  await page.getByRole("button", { name: "Übersicht" }).click();
  const chart = page.getByRole("figure", { name: "Vermögen im Zeitverlauf" });
  const marker = chart.locator(MARKER);
  await expect(marker).toHaveCount(1);
  await marker.hover();
  await expect(chart).toContainText("Auto gekauft");
  await expect(chart).toContainText("-15.000,00 €");

  // From the chart: clicking a month opens its Note and Events.
  await marker.click();
  const fromChart = page.getByRole("region", { name: "Notiz und Ereignisse" });
  await expect(fromChart.getByRole("heading")).toHaveText("Notiz und Ereignisse – Februar 2026");
  await expect(fromChart.getByLabel("Notiz")).toHaveValue("Neues Auto, dafür Erspartes aufgelöst.");

  // Edit the Event there.
  const row = fromChart.getByRole("listitem").filter({ hasText: "Auto gekauft" });
  await row.getByRole("button", { name: "Bearbeiten" }).click();
  const editing = fromChart.getByRole("form", { name: "Auto gekauft bearbeiten" });
  await editing.getByLabel("Betrag").fill("-16.500,50");
  await editing.getByRole("button", { name: "Speichern" }).click();
  await expect(fromChart.getByRole("listitem").filter({ hasText: "Auto gekauft" })).toContainText("-16.500,50 €");

  // Chronological list, kept after a restart.
  await app.restart();
  await page.goto(app.url);
  await unlock(page, PASSWORD);
  await page.getByRole("button", { name: "Notizen & Ereignisse" }).click();
  const list = page.getByRole("main");
  await expect(list.getByRole("heading", { name: "Februar 2026" })).toBeVisible();
  await expect(list).toContainText("Neues Auto, dafür Erspartes aufgelöst.");
  await expect(list).toContainText("Auto gekauft");
  await expect(list).toContainText("-16.500,50 €");

  // Deleting the Event removes its marker.
  await page.getByRole("button", { name: "Monatsstand" }).click();
  await page.getByRole("form", { name: "Monatsstand" }).getByLabel("Monat", { exact: true }).fill("2026-02");
  await page.getByRole("region", { name: "Notiz und Ereignisse" }).getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByRole("region", { name: "Notiz und Ereignisse" }).getByRole("listitem")).toHaveCount(0);
  await page.getByRole("button", { name: "Übersicht" }).click();
  await expect(page.getByRole("figure", { name: "Vermögen im Zeitverlauf" }).locator("svg")).toBeVisible();
  await expect(page.getByRole("figure", { name: "Vermögen im Zeitverlauf" }).locator(MARKER)).toHaveCount(0);
});
