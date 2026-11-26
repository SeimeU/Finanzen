import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, extname, isAbsolute, join, normalize, sep } from "node:path";
import {
  confirmImport,
  listImports,
  previewImport,
  searchTransactions,
  undoImport,
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  listStructure,
  loadDocument,
  updateAccount,
  updateHolding,
  updateInstitution,
  type Result,
  type WealthDocument,
} from "../core";
import * as store from "../store";

/**
 * Thin JSON API over the core and the store. Each command endpoint:
 * run the core command → on success save the document → reply.
 * Also serves the built UI (dist/ui) for every non-/api path.
 */
export type AppConfig = { dataFile: string; uiDir: string };

type Session = { password: string; document: WealthDocument };
type Reply = { status: number; body: unknown };
type Handler = (body: Record<string, unknown>) => Promise<Reply>;

export function createApp(config: AppConfig): Server {
  // The decrypted document lives only here, and only while unlocked.
  let session: Session | null = null;

  /**
   * Runs a core command on the unlocked document, saves the result, then replies
   * with the command's extra fields (e.g. a new id) plus the updated `structure`.
   */
  function command<I>(cmd: (document: WealthDocument, input: I) => Result<{ document: WealthDocument }>): Handler {
    return async (body) => {
      if (!session) return error(423, "locked", "Die App ist gesperrt.");
      const result = cmd(session.document, body as I);
      if (!result.ok) return error(400, result.error.code, result.error.message);
      const { ok: _, document, ...rest } = result;
      await store.save(config.dataFile, session.password, document);
      session.document = document;
      return ok({ ...rest, structure: listStructure(document) });
    };
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

    "GET /api/backups": async () => {
      if (!session) return locked();
      return ok({ backups: await store.listBackups(config.dataFile) });
    },

    "POST /api/backups/restore": async ({ id }) => {
      if (!session) return locked();
      if (typeof id !== "string") return error(400, "backup-required", "Bitte eine Sicherung auswählen.");
      let raw: unknown;
      try {
        raw = await store.restoreBackup(config.dataFile, session.password, id);
      } catch (e) {
        if (e instanceof store.BackupNotFoundError) {
          return error(404, "backup-not-found", "Diese Sicherung gibt es nicht mehr.");
        }
        if (e instanceof store.WrongPasswordError) {
          return error(422, "backup-wrong-password", "Diese Sicherung ist mit einem anderen Passwort verschlüsselt.");
        }
        throw e;
      }
      const result = loadDocument(raw);
      if (!result.ok) return error(422, result.error.code, result.error.message);
      session.document = result.document;
      return ok({ backups: await store.listBackups(config.dataFile) });
    },

    "GET /api/export": async () => {
      if (!session) return locked();
      const today = new Date().toISOString().slice(0, 10);
      return ok({ suggestedPath: join(dirname(config.dataFile), `vermoegen-export-${today}.json`) });
    },

    "POST /api/export": async ({ path }) => {
      if (!session) return locked();
      if (typeof path !== "string" || !isAbsolute(path)) {
        return error(400, "export-path-required", "Bitte einen vollständigen Dateipfad angeben, z. B. E:\\vermoegen.json.");
      }
      try {
        await store.exportUnencrypted(path, session.document);
      } catch (e) {
        if (e instanceof store.ExportTargetExistsError) {
          return error(409, "export-target-exists", "Diese Datei gibt es bereits. Bitte einen anderen Namen wählen.");
        }
        const code = (e as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "EACCES" || code === "EPERM" || code === "EISDIR") {
          return error(400, "export-failed", "Die Datei konnte dort nicht geschrieben werden. Gibt es den Ordner?");
        }
        throw e;
      }
      return ok({ path });
    },

    "POST /api/lock": async () => {
      session = null;
      return ok({ state: "locked" });
    },

    "GET /api/structure": async () =>
      session ? ok({ structure: listStructure(session.document) }) : error(423, "locked", "Die App ist gesperrt."),
    "POST /api/institutions/create": command(createInstitution),
    "POST /api/institutions/update": command(updateInstitution),
    "POST /api/accounts/create": command(createAccount),
    "POST /api/accounts/update": command(updateAccount),
    "POST /api/holdings/create": command(createHolding),
    "POST /api/holdings/update": command(updateHolding),

    // CSV import. Files travel as base64 in JSON: { name, contentBase64 }.
    "POST /api/import/preview": async ({ files }) => {
      if (!session) return locked();
      const result = previewImport(session.document, { files: decodeFiles(files) });
      if (!result.ok) return error(400, result.error.code, result.error.message);
      return ok({ files: result.files });
    },
    "POST /api/import/confirm": async ({ files }) => {
      if (!session) return locked();
      const result = confirmImport(session.document, {
        importedAt: new Date().toISOString(),
        files: decodeFiles(files) as ({ name: string; bytes: Uint8Array; accountId: string })[],
      });
      if (!result.ok) return error(400, result.error.code, result.error.message);
      await store.save(config.dataFile, session.password, result.document);
      session.document = result.document;
      return ok({ files: result.files, imports: listImports(result.document) });
    },
    "POST /api/import/undo": async (body) => {
      if (!session) return locked();
      const result = undoImport(session.document, body as { importId: string });
      if (!result.ok) return error(400, result.error.code, result.error.message);
      await store.save(config.dataFile, session.password, result.document);
      session.document = result.document;
      return ok({ imports: listImports(result.document) });
    },
    "GET /api/imports": async () => (session ? ok({ imports: listImports(session.document) }) : locked()),
    "POST /api/transactions/search": async (filter) =>
      session ? ok({ transactions: searchTransactions(session.document, filter) }) : locked(),
  };

  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      if (path.startsWith("/api/")) {
        const handler = routes[`${request.method} ${path}`];
        const reply = handler
          ? await handler(await readJson(request))
          : error(404, "not-found", "Unbekannter Endpunkt.");
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

/** `[{ name, contentBase64, ...rest }]` from the UI → `[{ name, bytes, ...rest }]` for the core. */
function decodeFiles(raw: unknown): { name: string; bytes: Uint8Array; accountId?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(({ contentBase64, ...rest }) => ({
    ...rest,
    name: String(rest.name ?? ""),
    bytes: new Uint8Array(Buffer.from(String(contentBase64 ?? ""), "base64")),
  }));
}

function locked(): Reply {
  return error(423, "locked", "Die App ist gesperrt. Bitte erneut entsperren.");
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
