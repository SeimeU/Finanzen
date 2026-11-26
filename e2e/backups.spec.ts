import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createEmptyDocument } from "../src/core";
import { load, save } from "../src/store";
import { expect, test } from "./fixtures";

// Current-schema documents, so unlocking does not migrate (and change) them.
const earlier = { ...createEmptyDocument(), note: "früherer Stand" };
const later = { ...createEmptyDocument(), note: "späterer Stand" };

test("restore an earlier state from the backups in the settings", async ({ page, app }) => {
  await save(app.dataFile, "geheim123", earlier);
  await save(app.dataFile, "geheim123", later);
  await unlock(page, app.url, "geheim123");

  await page.getByRole("button", { name: "Einstellungen" }).click();
  const backups = page.getByRole("region", { name: "Sicherungen" }).getByRole("listitem");
  await expect(backups).toHaveCount(1);
  await expect(backups.first()).toContainText(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}/);

  await backups.first().getByRole("button", { name: "Wiederherstellen" }).click();

  await expect(page.getByRole("status")).toContainText("Sicherung wiederhergestellt.");
  await expect(backups).toHaveCount(2);
  expect(await load(app.dataFile, "geheim123")).toEqual(earlier);
});

test("export unencrypted: after a warning, writes readable JSON to the chosen file", async ({ page, app }) => {
  await save(app.dataFile, "geheim123", later);
  await unlock(page, app.url, "geheim123");
  const target = join(dirname(app.dataFile), "mein-export.json");

  await page.getByRole("button", { name: "Einstellungen" }).click();
  const section = page.getByRole("region", { name: "Unverschlüsselt exportieren" });
  await section.getByLabel("Zieldatei").fill(target);
  await section.getByRole("button", { name: "Unverschlüsselt exportieren" }).click();

  await expect(section.getByText(/ohne Passwortschutz/)).toBeVisible();
  await section.getByRole("button", { name: "Trotzdem exportieren" }).click();

  await expect(section.getByRole("status")).toContainText(target);
  expect(JSON.parse(await readFile(target, "utf8"))).toEqual(later);
});

async function unlock(page: import("@playwright/test").Page, url: string, password: string) {
  await page.goto(url);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Entsperren" }).click();
  await expect(page.getByRole("heading", { name: "Vermögen" })).toBeVisible();
}
