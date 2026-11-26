import { useEffect, useState, type FormEvent } from "react";
import { ApiError, backupsApi } from "../../api";

/** Settings section "Unverschlüsselt exportieren": a readable JSON copy, written only after a warning. */
export function ExportSection() {
  const [path, setPath] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backupsApi.exportSuggestion().then(
      (r) => setPath((current) => current || r.suggestedPath),
      () => {},
    );
  }, []);

  function ask(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setConfirming(true);
  }

  async function exportNow() {
    setConfirming(false);
    try {
      const r = await backupsApi.exportUnencrypted(path);
      setMessage(`Exportiert nach ${r.path}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unbekannter Fehler.");
    }
  }

  return (
    <section aria-labelledby="export-heading">
      <h2 id="export-heading">Unverschlüsselt exportieren</h2>
      <form onSubmit={ask}>
        <label>
          Zieldatei
          <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="E:\vermoegen.json" />
        </label>
        <button type="submit">Unverschlüsselt exportieren</button>
      </form>
      {confirming && (
        <div className="warning">
          <p>
            Achtung: Die Exportdatei enthält alle Daten lesbar und ohne Passwortschutz. Jeder, der die Datei öffnen
            kann, sieht dein gesamtes Vermögen. Bewahre sie sicher auf, z. B. auf einem verschlossenen USB-Stick.
          </p>
          <button type="button" onClick={exportNow}>
            Trotzdem exportieren
          </button>{" "}
          <button type="button" className="secondary" onClick={() => setConfirming(false)}>
            Abbrechen
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
