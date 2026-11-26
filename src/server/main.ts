import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createApp } from "./app";

// Configuration via environment (used by the e2e tests):
//   FINANZEN_DATA_FILE  path of the encrypted data file (default: data/vermoegen.dat)
//   FINANZEN_PORT       port, 0 = any free port (default: 4317)
// Flag --open opens the default browser once the server listens (used by start.bat).
const dataFile = resolve(process.env.FINANZEN_DATA_FILE ?? "data/vermoegen.dat");
const port = Number(process.env.FINANZEN_PORT ?? 4317);
const uiDir = resolve(import.meta.dirname, "../../dist/ui");

const server = createApp({ dataFile, uiDir });

// Bind to the loopback interface only: never reachable from other machines.
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : port}`;
  console.log(`Finanzen läuft auf ${url} (Datendatei: ${dataFile})`);
  if (process.argv.includes("--open")) openBrowser(url);
});

function openBrowser(url: string) {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => console.log(`Bitte im Browser öffnen: ${url}`));
  child.unref();
}
