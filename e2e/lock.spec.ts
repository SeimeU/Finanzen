import { expect, test } from "./fixtures";
import { setPassword, unlock } from "./helpers";

test("manual lock returns to the unlock screen and the data needs the password again", async ({ page, app }) => {
  await setPassword(page, app.url, "geheim123");

  await page.getByRole("button", { name: "Sperren" }).click();

  await expect(page.getByRole("heading", { name: "Entsperren" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Entsperren" })).toBeVisible();
  await unlock(page, "geheim123");
});

test.describe("auto-lock", () => {
  test.use({ appEnv: { FINANZEN_LOCK_TIMEOUT_MS: "1500" } });

  test("locks itself after the timeout without requests", async ({ page, app }) => {
    await setPassword(page, app.url, "geheim123");

    await expect(page.getByRole("heading", { name: "Entsperren" })).toBeVisible({ timeout: 10_000 });
    const status = await page.request.get(`${app.url}/api/status`);
    expect(await status.json()).toEqual({ state: "locked" });
  });
});
