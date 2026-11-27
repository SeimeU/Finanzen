import { readdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, test } from "./fixtures";

test("first start: set a password after the data-loss warning, land on the empty start screen", async ({ page, app }) => {
  await page.goto(app.url);

  await expect(page.getByRole("heading", { name: "Passwort festlegen" })).toBeVisible();
  await expect(page.getByText(/endgültigen Verlust aller Daten/)).toBeVisible();

  await page.getByLabel("Passwort", { exact: true }).fill("geheim123");
  await page.getByLabel("Passwort wiederholen").fill("geheim123");
  await page.getByRole("button", { name: "Passwort festlegen" }).click();

  await expect(page.getByRole("heading", { name: "Vermögen" })).toBeVisible();
  const bytes = await readFile(app.dataFile);
  expect(bytes.includes(Buffer.from("schemaVersion"))).toBe(false);
});

test("first start: mismatching passwords are rejected", async ({ page, app }) => {
  await page.goto(app.url);
  await page.getByLabel("Passwort", { exact: true }).fill("geheim123");
  await page.getByLabel("Passwort wiederholen").fill("geheim124");
  await page.getByRole("button", { name: "Passwort festlegen" }).click();

  await expect(page.getByRole("alert")).toHaveText("Die Passwörter stimmen nicht überein.");
  await expect(readdir(dirname(app.dataFile))).resolves.toEqual([]);
});

test("later start: the correct password unlocks the data", async ({ page, app }) => {
  await setPassword(page, app.url, "geheim123");
  await app.restart();

  await page.goto(app.url);
  await expect(page.getByRole("heading", { name: "Entsperren" })).toBeVisible();
  await page.getByLabel("Passwort").fill("geheim123");
  await page.getByRole("button", { name: "Entsperren" }).click();

  await expect(page.getByRole("heading", { name: "Vermögen" })).toBeVisible();
});

test("later start: a wrong password shows a German error and leaves every file unchanged", async ({ page, app }) => {
  await setPassword(page, app.url, "geheim123");
  await app.restart();
  const dir = dirname(app.dataFile);
  const listingBefore = await readdir(dir);
  const bytesBefore = await readFile(app.dataFile);

  await page.goto(app.url);
  await page.getByLabel("Passwort").fill("falsch");
  await page.getByRole("button", { name: "Entsperren" }).click();

  await expect(page.getByRole("alert")).toHaveText("Falsches Passwort.");
  await expect(page.getByRole("heading", { name: "Vermögen" })).toBeHidden();
  expect(await readdir(dir)).toEqual(listingBefore);
  expect(await readFile(app.dataFile)).toEqual(bytesBefore);
});

async function setPassword(page: import("@playwright/test").Page, url: string, password: string) {
  await page.goto(url);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByLabel("Passwort wiederholen").fill(password);
  await page.getByRole("button", { name: "Passwort festlegen" }).click();
  await expect(page.getByRole("heading", { name: "Vermögen" })).toBeVisible();
}
