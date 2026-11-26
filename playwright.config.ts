import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Use the pre-installed Chromium when Playwright's own download is missing.
const preinstalledChromium = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  // Each test starts its own server with its own temporary data file (see e2e/fixtures.ts).
  fullyParallel: true,
  use: {
    trace: "off",
    launchOptions: existsSync(preinstalledChromium) ? { executablePath: preinstalledChromium } : {},
  },
});
