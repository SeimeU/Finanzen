import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";

let dir: string;
let server: Server;
let port: number;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "finanzen-app-"));
  await writeFile(join(dir, "index.html"), "<!doctype html><title>Finanzen</title>");
  server = createApp({ dataFile: join(dir, "vermoegen.dat"), uiDir: dir });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

type Response = { status: number; body: any };

/** A raw HTTP request, so the test controls Host, Origin and Content-Type exactly. */
function send(
  method: "GET" | "POST",
  path: string,
  { body, headers = {} }: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<Response> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          host: `127.0.0.1:${port}`,
          ...(payload === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown = text;
          try {
            parsed = JSON.parse(text);
          } catch {
            // not JSON (static file)
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const post = (path: string, body: unknown = {}, headers: Record<string, string> = {}) => send("POST", path, { body, headers });

describe("cross-site protection", () => {
  it("answers requests addressed to 127.0.0.1 or localhost on its own port", async () => {
    expect((await send("GET", "/api/status")).status).toBe(200);
    expect((await send("GET", "/api/status", { headers: { host: `localhost:${port}` } })).status).toBe(200);
    expect((await post("/api/setup", { password: "geheim" }, { origin: `http://127.0.0.1:${port}` })).status).toBe(200);
  });

  it("refuses a request whose Host is another name (DNS rebinding)", async () => {
    for (const host of [`evil.example:${port}`, "127.0.0.1", `127.0.0.1:${port + 1}`, `localhost.evil.example:${port}`]) {
      const response = await send("GET", "/api/status", { headers: { host } });
      expect(response.status, host).toBe(403);
    }
    expect((await send("GET", "/", { headers: { host: `evil.example:${port}` } })).status).toBe(403);
  });

  it("refuses a request from another origin", async () => {
    for (const origin of ["http://evil.example", `http://127.0.0.1:${port + 1}`, "null"]) {
      const response = await post("/api/setup", { password: "geheim" }, { origin });
      expect(response.status, origin).toBe(403);
    }
    expect((await send("GET", "/api/status")).body.state).toBe("new");
  });

  it("refuses a POST that is not JSON", async () => {
    for (const contentType of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      const response = await post("/api/setup", { password: "geheim" }, { "content-type": contentType });
      expect(response.status, contentType).toBe(415);
    }
    const withoutType = await send("POST", "/api/lock", { headers: {} });
    expect(withoutType.status).toBe(415);
    expect((await send("GET", "/api/status")).body.state).toBe("new");
  });

  it("accepts JSON with a charset", async () => {
    const response = await post("/api/setup", { password: "geheim" }, { "content-type": "application/json; charset=utf-8" });
    expect(response.status).toBe(200);
  });
});

describe("concurrent commands", () => {
  it("loses no update when many commands arrive at once", async () => {
    await post("/api/setup", { password: "geheim" });
    const names = Array.from({ length: 12 }, (_, i) => `Bank ${i + 1}`);

    const responses = await Promise.all(names.map((name) => post("/api/institutions/create", { name })));

    expect(responses.map((r) => r.status)).toEqual(names.map(() => 200));
    const listed = async () => ((await send("GET", "/api/structure")).body.structure as { name: string }[]).map((i) => i.name).sort();
    expect(await listed()).toEqual([...names].sort());
    // And all of them reached the data file.
    await post("/api/lock");
    await post("/api/unlock", { password: "geheim" });
    expect(await listed()).toEqual([...names].sort());
  }, 30_000);

  it("finishes a save when a lock arrives meanwhile", async () => {
    await post("/api/setup", { password: "geheim" });

    const [created, lockResponse] = await Promise.all([post("/api/institutions/create", { name: "Erste" }), post("/api/lock")]);

    expect(created.status).toBe(200);
    expect(lockResponse.status).toBe(200);
    expect((await send("GET", "/api/status")).body.state).toBe("locked");
    await post("/api/unlock", { password: "geheim" });
    expect((await send("GET", "/api/structure")).body.structure.map((i: { name: string }) => i.name)).toEqual(["Erste"]);
  }, 30_000);

  it("keeps a password change and a command made at the same time", async () => {
    await post("/api/setup", { password: "alt" });

    const responses = await Promise.all([
      post("/api/institutions/create", { name: "Erste" }),
      post("/api/password", { currentPassword: "alt", newPassword: "neu" }),
      post("/api/institutions/create", { name: "Zweite" }),
    ]);

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    await post("/api/lock");
    expect((await post("/api/unlock", { password: "neu" })).status).toBe(200);
    const names = (await send("GET", "/api/structure")).body.structure.map((i: { name: string }) => i.name).sort();
    expect(names).toEqual(["Erste", "Zweite"]);
  }, 30_000);
});
