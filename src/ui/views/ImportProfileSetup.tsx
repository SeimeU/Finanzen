import { useEffect, useRef, useState } from "react";
import type { GenericColumnMapping, GenericProfileSettings, ImportProfilePreview } from "../../core";
import { ApiError, importProfilesApi, type UploadFile } from "../api";
import { formatDate, formatEur } from "../format";

const SEPARATORS: { value: GenericProfileSettings["separator"]; label: string }[] = [
  { value: ";", label: "Semikolon (;)" },
  { value: ",", label: "Komma (,)" },
  { value: "\t", label: "Tabulator" },
  { value: "|", label: "Senkrechter Strich (|)" },
];
const DATE_FORMATS: GenericProfileSettings["dateFormat"][] = ["DD.MM.YYYY", "YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"];
const DECIMALS: { value: GenericProfileSettings["decimalSeparator"]; label: string }[] = [
  { value: ",", label: "Komma (1.234,56)" },
  { value: ".", label: "Punkt (1,234.56)" },
];
const FIELDS: { key: keyof GenericColumnMapping; label: string; optional?: boolean }[] = [
  { key: "bookingDate", label: "Datum" },
  { key: "amount", label: "Betrag" },
  { key: "counterpartyName", label: "Gegenüber" },
  { key: "purpose", label: "Verwendungszweck" },
  { key: "counterpartyIban", label: "IBAN", optional: true },
  { key: "paymentReference", label: "Zahlungsreferenz", optional: true },
];

const INITIAL: GenericProfileSettings = {
  separator: ";",
  skipLines: 1,
  dateFormat: "DD.MM.YYYY",
  decimalSeparator: ",",
  columns: {
    bookingDate: null,
    amount: null,
    counterpartyName: null,
    purpose: null,
    counterpartyIban: null,
    paymentReference: null,
  },
};

/**
 * Sets up a generic Importprofil from a file no profile recognizes: separator, lines to skip,
 * formats and the column of each field, with a live preview of the first parsed Umsätze.
 * Saved for one Konto; later files of the same shape are then recognized automatically.
 */
export function ImportProfileSetup({
  upload,
  accounts,
  onSaved,
}: {
  upload: UploadFile;
  accounts: { id: string; label: string }[];
  onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [settings, setSettings] = useState<GenericProfileSettings>(INITIAL);
  const [preview, setPreview] = useState<ImportProfilePreview | null>(null);
  const [error, setError] = useState("");
  const latest = useRef(0);

  useEffect(() => {
    const request = ++latest.current;
    importProfilesApi.preview(settings, upload).then(
      (r) => request === latest.current && setPreview(r.preview),
      (e) => {
        if (!(e instanceof ApiError)) throw e;
        if (request === latest.current) setError(e.message);
      },
    );
  }, [settings, upload]);

  const change = (patch: Partial<GenericProfileSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const mapColumn = (key: keyof GenericColumnMapping, value: string) =>
    setSettings((s) => ({ ...s, columns: { ...s.columns, [key]: value === "" ? null : Number(value) } }));

  const save = async () => {
    setError("");
    try {
      await importProfilesApi.save(accountId, settings, upload);
      onSaved();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e.message);
    }
  };

  const lines = preview?.lines ?? [];
  const columnCount = Math.max(0, ...lines.slice(settings.skipLines).map((l) => l.length));
  // Name each column after the header row (the last skipped line) or else the first data row.
  const nameRow = lines[settings.skipLines - 1]?.length === columnCount ? lines[settings.skipLines - 1]! : (lines[settings.skipLines] ?? []);
  const columnLabel = (i: number) => {
    const sample = (nameRow[i] ?? "").trim();
    return sample ? `Spalte ${i + 1}: ${sample.length > 30 ? `${sample.slice(0, 30)}…` : sample}` : `Spalte ${i + 1}`;
  };

  return (
    <form
      aria-label="Importprofil anlegen"
      className="profile-setup"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h3>Importprofil anlegen</h3>
      <div className="profile-grid">
        <label>
          Konto
          <select aria-label="Konto" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">– bitte wählen –</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Trennzeichen
          <select aria-label="Trennzeichen"
            value={settings.separator}
            onChange={(e) => change({ separator: e.target.value as GenericProfileSettings["separator"] })}
          >
            {SEPARATORS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Zeilen überspringen
          <input aria-label="Zeilen überspringen"
            type="number"
            min={0}
            max={100}
            value={settings.skipLines}
            onChange={(e) => change({ skipLines: e.target.value === "" ? 0 : Number(e.target.value) })}
          />
        </label>
        <label>
          Datumsformat
          <select aria-label="Datumsformat"
            value={settings.dateFormat}
            onChange={(e) => change({ dateFormat: e.target.value as GenericProfileSettings["dateFormat"] })}
          >
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dezimaltrennzeichen
          <select aria-label="Dezimaltrennzeichen"
            value={settings.decimalSeparator}
            onChange={(e) => change({ decimalSeparator: e.target.value as GenericProfileSettings["decimalSeparator"] })}
          >
            {DECIMALS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        {FIELDS.map((field) => (
          <label key={field.key}>
            {`Spalte für ${field.label}`}
            <select
              aria-label={`Spalte für ${field.label}`}
              value={settings.columns[field.key] ?? ""} onChange={(e) => mapColumn(field.key, e.target.value)}>
              <option value="">{field.optional ? "– keine –" : "– bitte wählen –"}</option>
              {Array.from({ length: columnCount }, (_, i) => (
                <option key={i} value={i}>
                  {columnLabel(i)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <section aria-label="Dateianfang">
        <h4>Dateianfang</h4>
        <table className="transactions">
          <tbody>
            {lines.map((cells, i) => (
              <tr key={i} className={i < settings.skipLines ? "skipped" : undefined}>
                <th scope="row">{i + 1}</th>
                {cells.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-label="Vorschau">
        <h4>Vorschau</h4>
        {preview && !preview.result.ok && <p role="alert">{preview.result.error.message}</p>}
        {preview?.result.ok && (
          <>
            <table className="transactions" aria-label="Vorschau der Umsätze">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Betrag</th>
                  <th>Gegenüber</th>
                  <th>Verwendungszweck</th>
                  <th>IBAN</th>
                  <th>Zahlungsreferenz</th>
                </tr>
              </thead>
              <tbody>
                {preview.result.transactions.map((t, i) => (
                  <tr key={i}>
                    <td>{formatDate(t.bookingDate)}</td>
                    <td className="amount">{formatEur(t.amountCents)}</td>
                    <td>{t.counterpartyName}</td>
                    <td>{t.purpose}</td>
                    <td>{t.counterpartyIban ?? ""}</td>
                    <td>{t.paymentReference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>{preview.result.transactionCount} Umsätze in der Datei.</p>
          </>
        )}
      </section>

      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={!accountId || !preview?.result.ok}>
        Importprofil speichern
      </button>
    </form>
  );
}
