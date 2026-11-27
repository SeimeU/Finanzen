import { useEffect, useState, type DragEvent } from "react";
import type { FilePreview, ImportRecord } from "../../core";
import { api, ApiError, importApi, toUploadFile, type UploadFile } from "../api";
import { formatDate, formatDateTime } from "../format";
import { accountOptions } from "../labels";
import { ImportProfileSetup } from "./ImportProfileSetup";

type Pending = { upload: UploadFile; preview: FilePreview; accountId: string };

/**
 * Import view: drop CSV files, check the confirmation screen (format, Konto, date range,
 * new / duplicates), then confirm. Lists earlier imports, each of which can be undone.
 */
export function ImportView() {
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.structure().then((r) => setAccounts(accountOptions(r.structure)));
    importApi.imports().then((r) => setImports(r.imports));
  }, []);

  async function run(action: () => Promise<void>) {
    setError("");
    try {
      await action();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e.message);
    }
  }

  const addFiles = (files: File[]) =>
    run(async () => {
      if (files.length === 0) return;
      setStatus("");
      const uploads = await Promise.all(files.map(toUploadFile));
      const { files: previews } = await importApi.preview(uploads);
      setPending(
        previews.map((preview, i) => ({
          upload: uploads[i]!,
          preview,
          accountId: preview.ok ? (preview.suggestedAccountId ?? "") : "",
        })),
      );
    });

  const chooseAccount = (index: number, accountId: string) =>
    run(async () => {
      const item = pending[index]!;
      const { files } = await importApi.preview([{ ...item.upload, accountId: accountId || null }]);
      setPending(pending.map((p, i) => (i === index ? { ...p, accountId, preview: files[0]! } : p)));
    });

  /** After an Importprofil was saved for a file, preview it again so the new profile reads it. */
  const repreview = (index: number) =>
    run(async () => {
      const item = pending[index]!;
      const { files } = await importApi.preview([item.upload]);
      const preview = files[0]!;
      const accountId = preview.ok ? (preview.suggestedAccountId ?? "") : "";
      setPending((current) => current.map((p, i) => (i === index ? { ...p, accountId, preview } : p)));
    });

  const readable = pending.filter((p) => p.preview.ok);
  const canConfirm = readable.length > 0 && readable.every((p) => p.accountId !== "");

  const confirm = () =>
    run(async () => {
      const result = await importApi.confirm(readable.map((p) => ({ ...p.upload, accountId: p.accountId })));
      const added = result.files.reduce((sum, f) => sum + f.newCount, 0);
      const duplicates = result.files.reduce((sum, f) => sum + f.duplicateCount, 0);
      setStatus(
        duplicates > 0
          ? `${added} Umsätze importiert, ${duplicates} Duplikate übersprungen.`
          : `${added} Umsätze importiert.`,
      );
      setImports(result.imports);
      setPending([]);
    });

  const undo = (importId: string) =>
    run(async () => {
      const result = await importApi.undo(importId);
      setImports(result.imports);
      setStatus("Import rückgängig gemacht.");
    });

  const accountLabel = (id: string) => accounts.find((a) => a.id === id)?.label ?? id;

  return (
    <main className="page">
      <h1>Umsätze importieren</h1>
      <DropZone onFiles={addFiles} />

      {pending.map((item, index) => (
        <FilePreviewSection
          key={`${item.upload.name}-${index}`}
          item={item}
          accounts={accounts}
          onChooseAccount={(id) => chooseAccount(index, id)}
          onProfileSaved={() => repreview(index)}
        />
      ))}
      {pending.length > 0 && (
        <div className="row">
          <button type="button" disabled={!canConfirm} onClick={confirm}>
            Importieren
          </button>
          <button type="button" className="secondary" onClick={() => setPending([])}>
            Abbrechen
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <p role="status">{status}</p>

      <section aria-label="Bisherige Importe">
        <h2>Bisherige Importe</h2>
        {imports.length === 0 ? (
          <p className="empty">Noch nichts importiert.</p>
        ) : (
          <ul className="backups">
            {imports.map((record) => (
              <li key={record.id}>
                <span>
                  <strong>{record.fileName}</strong> → {accountLabel(record.accountId)}:{" "}
                  {record.transactionCount} Umsätze, {formatDateTime(record.importedAt)}
                </span>
                <button type="button" className="secondary" onClick={() => undo(record.id)}>
                  Import rückgängig machen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    onFiles(Array.from(event.dataTransfer.files));
  };
  return (
    <section
      aria-label="CSV-Dateien hier ablegen"
      className={over ? "dropzone over" : "dropzone"}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <p>CSV-Dateien hier ablegen</p>
      <label className="file-input">
        oder auswählen
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </label>
    </section>
  );
}

function FilePreviewSection({
  item,
  accounts,
  onChooseAccount,
  onProfileSaved,
}: {
  item: Pending;
  accounts: { id: string; label: string }[];
  onChooseAccount: (accountId: string) => void;
  onProfileSaved: () => void;
}) {
  const { preview } = item;
  const [settingUpProfile, setSettingUpProfile] = useState(false);
  return (
    <section aria-label={item.upload.name} className="institution">
      <h2>{item.upload.name}</h2>
      {preview.ok ? (
        <>
          <p>Format: {preview.profile.label}</p>
          <p>
            {formatDate(preview.dateRange.from)} – {formatDate(preview.dateRange.to)}
          </p>
          <p>
            {preview.newCount} neu / {preview.duplicateCount} Duplikate
          </p>
          <label>
            Konto
            <select value={item.accountId} onChange={(e) => onChooseAccount(e.target.value)}>
              <option value="">– bitte wählen –</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <p role="alert">{preview.error.message}</p>
          {preview.error.code === "unknown-format" &&
            (settingUpProfile ? (
              <ImportProfileSetup
                upload={item.upload}
                accounts={accounts}
                onSaved={() => {
                  setSettingUpProfile(false);
                  onProfileSaved();
                }}
              />
            ) : (
              <button type="button" className="secondary" onClick={() => setSettingUpProfile(true)}>
                Importprofil anlegen
              </button>
            ))}
        </>
      )}
    </section>
  );
}
