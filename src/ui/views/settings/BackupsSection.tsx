import { useEffect, useState } from "react";
import { ApiError, backupsApi, type Backup } from "../../api";
import { formatDateTime } from "../../format";

/** Settings section "Sicherungen": the automatic backups, newest first, each restorable. */
export function BackupsSection() {
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backupsApi.list().then((r) => setBackups(r.backups), showError);
  }, []);

  function showError(e: unknown) {
    setMessage(null);
    setError(e instanceof ApiError ? e.message : "Unbekannter Fehler.");
  }

  async function restore(backup: Backup) {
    try {
      const r = await backupsApi.restore(backup.id);
      setBackups(r.backups);
      setError(null);
      setMessage(
        `Sicherung wiederhergestellt. Der Stand vom ${formatDateTime(backup.createdAt)} ist wieder aktuell; ` +
          "der ersetzte Stand wurde selbst gesichert.",
      );
    } catch (e) {
      showError(e);
    }
  }

  return (
    <section aria-labelledby="backups-heading">
      <h2 id="backups-heading">Sicherungen</h2>
      <p className="empty">
        Bei jedem Speichern wird der vorherige Stand verschlüsselt gesichert. Die letzten 30 Sicherungen bleiben erhalten.
      </p>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {backups?.length === 0 && <p className="empty">Noch keine Sicherungen vorhanden.</p>}
      {backups && backups.length > 0 && (
        <ul className="backups">
          {backups.map((backup) => (
            <li key={backup.id}>
              <span>{formatDateTime(backup.createdAt)}</span>
              <button type="button" onClick={() => restore(backup)}>
                Wiederherstellen
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
