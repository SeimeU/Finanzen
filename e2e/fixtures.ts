import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base, expect } from "@playwright/test";

/**
 * `app` starts the real server (serving the built UI from dist/ui) on a free port
 * with a data file in a fresh temporary directory. `restart()` stops and starts
 * the server on the same data file, i.e. a "later start" of the app.
 * Every test also fails if the page requests anything outside the app's origin.
 */
type App = { url: string; dataFile: string; restart: () => Promise<void> };

export const test = base.extend<{ app: App; appEnv: Record<string, string> }>({
  // Extra environment for the server, e.g. test.use({ appEnv: { FINANZEN_LOCK_TIMEOUT_MS: "1500" } }).
  appEnv: [{}, { option: true }],
  app: async ({ page, appEnv }, use) => {
    const dir = await mkdtemp(join(tmpdir(), "finanzen-e2e-"));
    const dataFile = join(dir, "vermoegen.dat");
    let server = await startServer(dataFile, appEnv);
    const app: App = {
      url: server.url,
      dataFile,
      restart: async () => {
        await stopServer(server.process);
        server = await startServer(dataFile, appEnv);
        app.url = server.url;
      },
    };

    const foreignRequests: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith("http://127.0.0.1:")) foreignRequests.push(request.url());
    });

    await use(app);

    await stopServer(server.process);
    await rm(dir, { recursive: true, force: true });
    expect(foreignRequests, "no network requests outside localhost").toEqual([]);
  },
});

export { expect };

async function startServer(
  dataFile: string,
  extraEnv: Record<string, string>,
): Promise<{ url: string; process: ChildProcess }> {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/main.ts"], {
    env: { ...process.env, FINANZEN_DATA_FILE: dataFile, FINANZEN_PORT: "0", ...extraEnv },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const url = await new Promise<string>((resolve, reject) => {
    let output = "";
    child.stdout!.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]);
    });
    child.once("exit", (code) => reject(new Error(`server exited with ${code}: ${output}`)));
  });
  return { url, process: child };
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
}
