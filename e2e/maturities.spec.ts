import {
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  saveSnapshot,
  type Classification,
  type Result,
  type WealthDocument,
} from "../src/core";
import { save } from "../src/store";
import { expect, test } from "./fixtures";
import { unlock } from "./helpers";

const PASSWORD = "geheim123";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

const locked = (maturityDate: string): Classification => ({ assetClass: "bond", liquidity: "locked", maturityDate });

/**
 * Raiffeisen Festgeld: one tranche matured end of 2025, two maturing on 30.06.2030.
 * Allianz Pension Locked until 2055. Dates are far from the real today the server uses.
 */
function documentWithLockedHoldings(): WealthDocument {
  const raiffeisen = must(createInstitution(createEmptyDocument(), { name: "Raiffeisen" }));
  const allianz = must(createInstitution(raiffeisen.document, { name: "Allianz" }));
  const festgeld = must(
    createAccount(allianz.document, { institutionId: raiffeisen.id, name: "Festgeld", defaultClassification: locked("2030-06-30") }),
  );
  const matured = must(
    createHolding(festgeld.document, { accountId: festgeld.id, name: "Festgeld 2025", classification: locked("2025-12-31") }),
  );
  const a = must(createHolding(matured.document, { accountId: festgeld.id, name: "Festgeld A", classification: locked("2030-06-30") }));
  const b = must(createHolding(a.document, { accountId: festgeld.id, name: "Festgeld B", classification: locked("2030-06-30") }));
  const pensionAccount = must(
    createAccount(b.document, { institutionId: allianz.id, name: "Pensionsvorsorge", defaultClassification: locked("2055-01-01") }),
  );
  const pension = must(
    createHolding(pensionAccount.document, { accountId: pensionAccount.id, name: "Pension", classification: locked("2055-01-01") }),
  );
  return must(
    saveSnapshot(pension.document, {
      month: "2025-10",
      today: "2025-10-31",
      holdingValues: [
        { holdingId: matured.id, marketValue: 300_000, contribution: null },
        { holdingId: a.id, marketValue: 1_000_000, contribution: null },
        { holdingId: b.id, marketValue: 250_000, contribution: null },
        { holdingId: pension.id, marketValue: 2_000_000, contribution: null },
      ],
    }),
  ).document;
}

test("the start screen shows the next Fälligkeit and the timeline lists Locked Holdings by Fälligkeit", async ({
  page,
  app,
}) => {
  await save(app.dataFile, PASSWORD, documentWithLockedHoldings());
  await page.goto(app.url);
  await unlock(page, PASSWORD);

  await expect(page.getByLabel("Nächste Fälligkeit")).toHaveText("30.06.2030: 12.500,00 €");

  await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: "Fälligkeiten" }).click();
  const table = page.getByRole("table", { name: "Gebundenes Geld nach Fälligkeit" });
  const rows = table.getByRole("row");
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(1)).toContainText("31.12.2025");
  await expect(rows.nth(1)).toContainText("fällig");
  await expect(rows.nth(1)).toContainText("3.000,00 €");
  await expect(rows.nth(2)).toContainText("Festgeld A");
  await expect(rows.nth(2)).not.toContainText("fällig");
  await expect(rows.nth(3)).toContainText("Festgeld B");
  await expect(rows.nth(4)).toContainText("01.01.2055");
  await expect(rows.nth(4)).toContainText("20.000,00 €");
});
