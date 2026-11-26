import { useEffect, useState } from "react";
import type { MonthNotes } from "../../core";
import { ApiError, notesApi } from "../api";
import { formatEur, formatMonth } from "../format";

/** All Notes and Events, month by month, oldest first. Editing happens in MonthNotesSection. */
export function NotesView() {
  const [notes, setNotes] = useState<MonthNotes[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    notesApi.list().then(
      (r) => setNotes(r.notes),
      (e) => setError(e instanceof ApiError ? e.message : String(e)),
    );
  }, []);

  return (
    <main className="page">
      <h1>Notizen und Ereignisse</h1>
      {error && <p role="alert">{error}</p>}
      {notes?.length === 0 && <p className="empty">Noch keine Notizen oder Ereignisse erfasst.</p>}
      {notes?.map((m) => (
        <section key={m.month} className="month-notes">
          <h2>{formatMonth(m.month)}</h2>
          {m.note && <p className="note">{m.note}</p>}
          {m.events.length > 0 && (
            <ul className="events">
              {m.events.map((e) => (
                <li key={e.id}>
                  <span className="event-label">{e.label}</span> <strong>{formatEur(e.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}
