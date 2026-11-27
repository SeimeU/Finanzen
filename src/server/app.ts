import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, dirname, extname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import {
  accountDetail,
  closeAccount,
  closeHolding,
  contributionSplit,
  confirmImport,
  createCategory,
  deleteCategory,
  listCategories,
  setTransactionCategory,
  setTransfer,
  acceptTransferSuggestion,
  rejectTransferSuggestion,
  transferSuggestions,
  updateCategory,
  createRule,
  deleteRule,
  listRules,
  moveRule,
  reapplyRules,
  updateRule,
  listImports,
  previewImport,
  previewImportProfile,
  saveImportProfile,
  searchTransactions,
  type GenericProfileSettings,
  undoImport,
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  currentOverview,
  listStructure,
  loadDocument,
  netWorthSeries,
  saveSnapshot,
  setPerHoldingFrom,
  snapshotForm,
  updateAccount,
  updateHolding,
  updateInstitution,
  type Result,
  type SnapshotInput,
  type WealthDocument,
} from "../core";
import { addEvent, deleteEvent, notesAndEvents, setNote, updateEvent } from "../core";
import * as store from "../store";
import { writeSettings } from "./settings";

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
  /** Where a data file location chosen in the settings is remembered (see settings.ts). */
  settingsFile?: string;
};

export const DEFAULT_LOCK_TIMEOUT_MS = 30 * 60 * 1000;

type Session = { password: string; document: WealthDocument };
type Reply = { status: number; body: unknown };
type Handler = (body: Record<string, unknown>) => Promise<Reply>;

const categoriesView = (document: WealthDocument) => ({ categories: listCategories(document) });
const rulesView = (document: WealthDocument) => ({ rules: listRules(document) });
const suggestionsView = (document: WealthDocument) => ({ suggestions: transferSuggestions(document) });

export function createApp(initialConfig: AppConfig): Server {
  // The data file location can change at runtime (settings), so keep a mutable copy.
  const config = { ...initialConfig };
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

  /**
   * Runs a core command on the unlocked document, saves the result, then replies
   * with the command's extra fields (e.g. a new id) plus the updated `structure`
   * (or whatever `view` returns for the updated document).
   */
  function command<I>(
    cmd: (document: WealthDocument, input: I) => Result<{ document: WealthDocument }>,
    view: (document: WealthDocument) => object = (document) => ({ structure: listStructure(document) }),
  ): Handler {
    return async (body) => {
      if (!session) return error(423, "locked", "Die App ist gesperrt.");
      const result = cmd(session.document, body as I);
      if (!result.ok) return error(400, result.error.code, result.error.message);
      const { ok: _, document, ...rest } = result;
      await store.save(config.dataFile, session.password, document);
      session.document = document;
      return ok({ ...rest, ...view(document) });
    };
  }

  /** Like `command`, but replies with the Notes and Events list instead of the structure. */
  function notesCommand(cmd: (document: WealthDocument, body: Record<string, unknown>) => Result<{ document: WealthDocument }>): Handler {
    return async (body) => {
      if (!session) return locked();
      const result = cmd(session.document, body);
      if (!result.ok) return error(400, result.error.code, result.error.message);
      const { ok: _, document, ...rest } = result;
      await store.save(config.dataFile, session.password, document);
      session.document = document;
      return ok({ ...rest, notes: notesAndEvents(document) });
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

    "POST /api/password": async ({ currentPassword, newPassword }) => {
      if (!session) return locked();
      if (currentPassword !== session.password) {
        return error(401, "wrong-password", "Das aktuelle Passwort ist falsch.");
      }
      if (typeof newPassword !== "string" || newPassword === "") {
        return error(400, "password-required", "Bitte ein neues Passwort eingeben.");
      }
      await store.changePassword(config.dataFile, session.password, newPassword);
      session.password = newPassword;
      return ok({});
    },

    "GET /api/settings": async () => {
      if (!session) return locked();
      return ok({ dataFile: config.dataFile });
    },

    "POST /api/data-file": async ({ path }) => {
      if (!session) return locked();
      if (typeof path !== "string" || !isAbsolute(path.trim())) {
        return error(400, "absolute-path-required", "Bitte einen vollständigen Pfad angeben, z. B. D:\\Finanzen\\vermoegen.dat.");
      }
      let target = resolve(path.trim());
      const existing = await stat(target).catch(() => null);
      if (existing?.isDirectory()) target = join(target, basename(config.dataFile));
      try {
        await store.moveDataFile(config.dataFile, target);
      } catch (e) {
        if (e instanceof store.TargetExistsError) {
          return error(409, "target-exists", "Am Ziel gibt es bereits eine Datei. Bitte einen anderen Pfad wählen.");
        }
        throw e;
      }
      config.dataFile = target;
      if (config.settingsFile) await writeSettings(config.settingsFile, { dataFile: target });
      return ok({ dataFile: target });
    },

    "GET /api/structure": async () =>
      session ? ok({ structure: listStructure(session.document) }) : error(423, "locked", "Die App ist gesperrt."),
    "POST /api/institutions/create": command(createInstitution),
    "POST /api/institutions/update": command(updateInstitution),
    "POST /api/accounts/create": command(createAccount),
    "POST /api/accounts/update": command(updateAccount),
    "POST /api/holdings/create": command(createHolding),
    "POST /api/holdings/update": command(updateHolding),
    "POST /api/holdings/close": command(closeHolding),
    "POST /api/accounts/close": command(closeAccount),

    // Monatsstand (Snapshots). `today` is the server's local date, passed into the core.
    "GET /api/net-worth": async () => (session ? ok({ series: netWorthSeries(session.document) }) : locked()),
    // Start screen headline figures and current breakdowns (ticket 09).
    "GET /api/overview": async () => (session ? ok({ overview: currentOverview(session.document) }) : locked()),
    // Konto detail and Einzahlung vs market change (ticket 11).
    "POST /api/accounts/detail": async ({ id }) => {
      if (!session) return locked();
      const detail = accountDetail(session.document, String(id));
      return detail ? ok({ detail }) : error(404, "account-not-found", "Das Konto gibt es nicht.");
    },
    "GET /api/contributions": async () =>
      session ? ok({ months: contributionSplit(session.document) }) : locked(),
    "POST /api/snapshots/form": async ({ month }) => {
      if (!session) return locked();
      if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return error(400, "invalid-month", "Bitte einen gültigen Monat wählen.");
      }
      return ok({ form: snapshotForm(session.document, month, localToday()) });
    },
    "POST /api/snapshots/save": async (body) => {
      if (!session) return locked();
      const result = saveSnapshot(session.document, { ...(body as SnapshotInput), today: localToday() });
      if (!result.ok) return error(400, result.error.code, result.error.message);
      await store.save(config.dataFile, session.password, result.document);
      session.document = result.document;
      return ok({ form: snapshotForm(result.document, String(body.month), localToday()) });
    },
    // Moves an Account's switch to per-Holding values; replies with the form for `formMonth`.
    "POST /api/snapshots/per-holding-from": async ({ accountId, month, formMonth }) => {
      if (!session) return locked();
      const result = setPerHoldingFrom(session.document, { accountId: String(accountId), month: typeof month === "string" ? month : null });
      if (!result.ok) return error(400, result.error.code, result.error.message);
      await store.save(config.dataFile, session.password, result.document);
      session.document = result.document;
      return ok({ form: snapshotForm(result.document, String(formMonth), localToday()) });
    },

    // Notes and Events. Every command replies with the whole chronological list as `notes`.
    "GET /api/notes": async () => (session ? ok({ notes: notesAndEvents(session.document) }) : locked()),
    "POST /api/notes/set": notesCommand((d, body) => setNote(d, { ...(body as { month: string; note: string }), today: localToday() })),
    "POST /api/events/add": notesCommand((d, body) =>
      addEvent(d, { ...(body as { month: string; label: string; amount: number }), today: localToday() }),
    ),
    "POST /api/events/update": notesCommand((d, body) => updateEvent(d, body as { id: string; label: string; amount: number })),
    "POST /api/events/delete": notesCommand((d, body) => deleteEvent(d, body as { id: string })),
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
    // Generic Import profiles: { accountId, settings, file: { name, contentBase64 } } (the sample file).
    "POST /api/import-profiles/preview": async ({ settings, file }) => {
      if (!session) return locked();
      const [sample] = decodeFiles([file]);
      return ok({ preview: previewImportProfile({ settings: settings as GenericProfileSettings, sample: sample!.bytes }) });
    },
    "POST /api/import-profiles/save": async ({ accountId, settings, file }) => {
      if (!session) return locked();
      const [sample] = decodeFiles([file]);
      const result = saveImportProfile(session.document, {
        accountId: String(accountId ?? ""),
        settings: settings as GenericProfileSettings,
        sample: sample!.bytes,
      });
      if (!result.ok) return error(400, result.error.code, result.error.message);
      await store.save(config.dataFile, session.password, result.document);
      session.document = result.document;
      return ok({ id: result.id });
    },
    "GET /api/imports": async () => (session ? ok({ imports: listImports(session.document) }) : locked()),
    "POST /api/transactions/search": async (filter) =>
      session ? ok({ transactions: searchTransactions(session.document, filter) }) : locked(),
    "POST /api/transactions/category": command(setTransactionCategory, () => ({})),

    // Transfers (Umbuchungen): { transactionId, transfer: true | false | null }; suggestions reply with the updated list.
    "POST /api/transactions/transfer": command(setTransfer, () => ({})),
    "GET /api/transfer-suggestions": async () =>
      session ? ok({ suggestions: transferSuggestions(session.document) }) : locked(),
    "POST /api/transfer-suggestions/accept": command(acceptTransferSuggestion, suggestionsView),
    "POST /api/transfer-suggestions/reject": command(rejectTransferSuggestion, suggestionsView),

    // Categories (Kategorien). Every command replies with the whole updated tree.
    "GET /api/categories": async () => (session ? ok({ categories: listCategories(session.document) }) : locked()),
    "POST /api/categories/create": command(createCategory, categoriesView),
    "POST /api/categories/update": command(updateCategory, categoriesView),
    "POST /api/categories/delete": command(deleteCategory, categoriesView),

    // Categorization rules (Regeln). Every command replies with the whole list, in order.
    "GET /api/rules": async () => (session ? ok(rulesView(session.document)) : locked()),
    "POST /api/rules/create": command(createRule, rulesView),
    "POST /api/rules/update": command(updateRule, rulesView),
    "POST /api/rules/delete": command(deleteRule, rulesView),
    "POST /api/rules/move": command(moveRule, rulesView),
    "POST /api/rules/reapply": command(reapplyRules, rulesView),
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

/** The local calendar date, "YYYY-MM-DD". The only place the clock is read for the core. */
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** `[{ name, contentBase64, ...rest }]` from the UI → `[{ name, bytes, ...rest }]` for the core. */
function decodeFiles(raw: unknown): { name: string; bytes: Uint8Array; accountId?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(({ contentBase64, ...rest } = {}) => ({
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
