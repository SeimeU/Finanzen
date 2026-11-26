import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { createEmptyDocument, loadDocument, type WealthDocument } from "../core";
import * as store from "../store";

/**
 * Thin JSON API over the core and the store. Each command endpoint:
 * run the core command → on success save the document → reply.
 * Also serves the built UI (dist/ui) for every non-/api path.
 */
export type AppConfig = {
  dataFile: string;
  uiDir: string;
  /** Discard the decrypted document after this long without requests (default 30 minutes). */
  lockTimeoutMs?: number;
};

export const DEFAULT_LOCK_TIMEOUT_MS = 30 * 60 * 1000;

type Session = { password: string; document: WealthDocument };
type Reply = { status: number; body: unknown };
type Handler = (body: Record<string, unknown>) => Promise<Reply>;

export function createApp(config: AppConfig): Server {
  // The decrypted document lives only here, and only while unlocked.
  let session: Session | null = null;
  const lockTimeoutMs = config.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  let lockTimer: NodeJS.Timeout | undefined;

  // Session lock: any request except the status poll counts as use and restarts the countdown.
  function registerActivity() {
    clearTimeout(lockTimer);
    if (!session) return;
    lockTimer = setTimeout(() => (session = null), lockTimeoutMs);
    lockTimer.unref();
  }

  const routes: Record<string, Handler> = {
    "GET /api/status": async () =>
      ok({ state: session ? "unlocked" : existsSync(config.dataFile) ? "locked" : "new" }),

    "POST /api/setup": async ({ password }) => {
      if (existsSync(config.dataFile)) return error(409, "already-set-up", "Es gibt bereits eine Datendatei.");
      if (typeof password !== "string" || password === "") {
        return error(400, "password-required", "Bitte ein Passwort eingeben.");
      }
      const document = createEmptyDocument();
      await mkdir(dirname(config.dataFile), { recursive: true });
      await store.save(config.dataFile, password, document);
      session = { password, document };
      return ok({ state: "unlocked" });
    },

    "POST /api/unlock": async ({ password }) => {
      if (!existsSync(config.dataFile)) return error(409, "not-set-up", "Es gibt noch keine Datendatei.");
      if (typeof password !== "string") return error(400, "password-required", "Bitte ein Passwort eingeben.");
      let raw: unknown;
      try {
        raw = await store.load(config.dataFile, password);
      } catch (e) {
        if (e instanceof store.WrongPasswordError) return error(401, "wrong-password", "Falsches Passwort.");
        if (e instanceof store.InvalidDataFileError) {
          return error(422, "invalid-data-file", "Die Datendatei ist beschädigt oder keine Datei dieser App.");
        }
        throw e;
      }
      const result = loadDocument(raw);
      if (!result.ok) return error(422, result.error.code, result.error.message);
      session = { password, document: result.document };
      return ok({ state: "unlocked" });
    },

    "POST /api/lock": async () => {
      session = null;
      return ok({ state: "locked" });
    },
  };

  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      if (path.startsWith("/api/")) {
        const handler = routes[`${request.method} ${path}`];
        const reply = handler
          ? await handler(await readJson(request))
          : error(404, "not-found", "Unbekannter Endpunkt.");
        if (`${request.method} ${path}` !== "GET /api/status") registerActivity();
        sendJson(response, reply);
      } else {
        await serveStatic(config.uiDir, path, response);
      }
    } catch (e) {
      console.error(e);
      sendJson(response, error(500, "internal", "Interner Fehler."));
    }
  });
}

function ok(body: unknown): Reply {
  return { status: 200, body };
}

function error(status: number, code: string, message: string): Reply {
  return { status, body: { error: { code, message } } };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, reply: Reply) {
  response.writeHead(reply.status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(reply.body));
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveStatic(uiDir: string, path: string, response: ServerResponse) {
  const file = normalize(join(uiDir, decodeURIComponent(path)));
  const inside = file.startsWith(normalize(uiDir) + sep);
  // Unknown paths fall back to index.html (single-page app).
  const target = inside && extname(file) && existsSync(file) ? file : join(uiDir, "index.html");
  try {
    const body = await readFile(target);
    response.writeHead(200, { "content-type": CONTENT_TYPES[extname(target)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("UI nicht gebaut. Bitte zuerst `npm run build` ausführen.");
  }
}
