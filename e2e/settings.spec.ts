import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "./fixtures";
import { setPassword, unlock } from "./helpers";

test("changing the password: the old one stops working, the new one unlocks", async ({ page, app }) => {
  await setPassword(page, app.url, "alt12345");
  await page.getByRole("button", { name: "Einstellungen" }).click();

  const form = page.getByRole("form", { name: "Passwort ändern" });
  await form.getByLabel("Aktuelles Passwort").fill("alt12345");
  await form.getByLabel("Neues Passwort", { exact: true }).fill("neu12345");
  await form.getByLabel("Neues Passwort wiederholen").fill("neu12345");
  await form.getByRole("button", { name: "Passwort ändern" }).click();
  await expect(form.getByRole("status")).toHaveText("Das Passwort wurde geändert.");

  await page.getByRole("button", { name: "Sperren" }).click();
  await expect(page.getByRole("heading", { name: "Entsperren" })).toBeVisible();
  await page.getByLabel("Passwort").fill("alt12345");
  await page.getByRole("button", { name: "Entsperren" }).click();
  await expect(page.getByRole("alert")).toHaveText("Falsches Passwort.");
  await unlock(page, "neu12345");
});

test("changing the password with a wrong current password is refused", async ({ page, app }) => {
  await setPassword(page, app.url, "alt12345");
  await page.getByRole("button", { name: "Einstellungen" }).click();

  const form = page.getByRole("form", { name: "Passwort ändern" });
  await form.getByLabel("Aktuelles Passwort").fill("falsch");
  await form.getByLabel("Neues Passwort", { exact: true }).fill("neu12345");
  await form.getByLabel("Neues Passwort wiederholen").fill("neu12345");
  await form.getByRole("button", { name: "Passwort ändern" }).click();

  await expect(form.getByRole("alert")).toHaveText("Das aktuelle Passwort ist falsch.");
});

test("choosing a new data file location moves the file, and a later start finds it there", async ({ page, app }) => {
  await setPassword(page, app.url, "geheim123");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  const target = join(dirname(app.dataFile), "woanders", "meine-daten.dat");

  const form = page.getByRole("form", { name: "Speicherort der Datendatei" });
  await expect(form.getByLabel("Datendatei")).toHaveValue(app.dataFile);
  await form.getByLabel("Datendatei").fill(target);
  await form.getByRole("button", { name: "Verschieben" }).click();
  await expect(form.getByRole("status")).toHaveText("Die Datendatei wurde verschoben.");

  expect(existsSync(target)).toBe(true);
  expect(existsSync(app.dataFile)).toBe(false);

  await app.restart();
  await page.goto(app.url);
  await unlock(page, "geheim123");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await expect(page.getByRole("form", { name: "Speicherort der Datendatei" }).getByLabel("Datendatei")).toHaveValue(
    target,
  );
});
