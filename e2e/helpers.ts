import { expect, type Page } from "@playwright/test";

export async function setPassword(page: Page, url: string, password: string) {
  await page.goto(url);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByLabel("Passwort wiederholen").fill(password);
  await page.getByRole("button", { name: "Passwort festlegen" }).click();
  await expect(page.getByRole("heading", { name: "Vermögen" })).toBeVisible();
}

export async function unlock(page: Page, password: string) {
  await expect(page.getByRole("heading", { name: "Entsperren" })).toBeVisible();
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Entsperren" }).click();
  await expect(page.getByRole("heading", { name: "Vermögen" })).toBeVisible();
}
