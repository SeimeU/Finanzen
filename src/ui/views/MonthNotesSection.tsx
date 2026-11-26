import { useEffect, useId, useState } from "react";
import type { MonthEvent, MonthNotes } from "../../core";
import { ApiError, notesApi } from "../api";
import { formatEur, formatEurInput, formatMonth, parseEur } from "../format";

const AMOUNT_ERROR = "Bitte einen Betrag wie -15.000,00 eingeben.";

type Feedback = { status?: string; error?: string };

function message(e: unknown): string {
  return e instanceof ApiError ? e.message : String(e);
}

/**
 * One month's Note and Events, editable. Used below the Monatsstand form and below
 * the chart on the start screen. `onChange` gets the whole list after every change.
 */
export function MonthNotesSection({ month, onChange }: { month: string; onChange?: (notes: MonthNotes[]) => void }) {
  const headingId = useId();
  const [loaded, setLoaded] = useState<MonthNotes | null>(null);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<Feedback>({});

  function show(notes: MonthNotes[]) {
    const current = notes.find((m) => m.month === month) ?? { month, note: null, events: [] };
    setLoaded(current);
    onChange?.(notes);
    return current;
  }

  useEffect(() => {
    let current = true;
    setFeedback({});
    setLoaded(null);
    notesApi.list().then(
      (r) => {
        if (!current) return;
        const m = r.notes.find((n) => n.month === month);
        setLoaded(m ?? { month, note: null, events: [] });
        setNote(m?.note ?? "");
      },
      (e) => current && setFeedback({ error: message(e) }),
    );
    return () => {
      current = false;
    };
  }, [month]);

  async function run(action: () => Promise<{ notes: MonthNotes[] }>, status: string): Promise<boolean> {
    setFeedback({});
    try {
      show((await action()).notes);
      setFeedback({ status });
      return true;
    } catch (e) {
      setFeedback({ error: message(e) });
      return false;
    }
  }

  async function saveNote(event: React.FormEvent) {
    event.preventDefault();
    await run(() => notesApi.setNote({ month, note }), "Notiz gespeichert.");
  }

  return (
    <section className="month-notes" aria-labelledby={headingId}>
      <h2 id={headingId}>Notiz und Ereignisse – {formatMonth(month)}</h2>
      {loaded && (
        <>
          <form onSubmit={saveNote}>
            <label>
              Notiz
              <textarea value={note} rows={3} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="submit">Notiz speichern</button>
          </form>
          {loaded.events.length > 0 && (
            <ul className="events">
              {loaded.events.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  onSave={(label, amount) =>
                    run(() => notesApi.updateEvent({ id: e.id, label, amount }), "Ereignis gespeichert.")
                  }
                  onDelete={() => run(() => notesApi.deleteEvent({ id: e.id }), "Ereignis gelöscht.")}
                />
              ))}
            </ul>
          )}
          <EventFields
            label="Ereignis hinzufügen"
            submit="Ereignis hinzufügen"
            initial={{ label: "", amount: "" }}
            onSubmit={(label, amount) => run(() => notesApi.addEvent({ month, label, amount }), "Ereignis hinzugefügt.")}
            clearAfterSubmit
          />
        </>
      )}
      {feedback.error && <p role="alert">{feedback.error}</p>}
      {feedback.status && <p role="status">{feedback.status}</p>}
    </section>
  );
}

function EventRow({
  event,
  onSave,
  onDelete,
}: {
  event: MonthEvent;
  onSave: (label: string, amount: number) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li>
        <EventFields
          label={`${event.label} bearbeiten`}
          submit="Speichern"
          initial={{ label: event.label, amount: formatEurInput(event.amount) }}
          onSubmit={async (label, amount) => {
            if (await onSave(label, amount)) setEditing(false);
            return true;
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }
  return (
    <li>
      <span className="event-label">{event.label}</span> <strong>{formatEur(event.amount)}</strong>{" "}
      <button type="button" className="secondary" onClick={() => setEditing(true)}>
        Bearbeiten
      </button>{" "}
      <button type="button" className="secondary" onClick={onDelete}>
        Löschen
      </button>
    </li>
  );
}

/** Bezeichnung + Betrag, used to add an Event and to edit one. */
function EventFields({
  label,
  submit,
  initial,
  onSubmit,
  onCancel,
  clearAfterSubmit = false,
}: {
  label: string;
  submit: string;
  initial: { label: string; amount: string };
  onSubmit: (label: string, amount: number) => Promise<boolean>;
  onCancel?: () => void;
  clearAfterSubmit?: boolean;
}) {
  const [text, setText] = useState(initial.label);
  const [amountText, setAmountText] = useState(initial.amount);
  const amount = amountText.trim() === "" ? null : parseEur(amountText);
  const invalid = amountText.trim() !== "" && amount === null;

  async function handle(event: React.FormEvent) {
    event.preventDefault();
    if (amount === null) return;
    const saved = await onSubmit(text, amount);
    if (saved && clearAfterSubmit) {
      setText("");
      setAmountText("");
    }
  }

  return (
    <form onSubmit={handle} aria-label={label} className="event-fields">
      <label>
        Bezeichnung
        <input value={text} onChange={(e) => setText(e.target.value)} required />
      </label>
      <label>
        Betrag
        <input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} required />
      </label>
      {invalid && <p role="alert">{AMOUNT_ERROR}</p>}
      <div className="actions">
        <button type="submit" disabled={amount === null}>
          {submit}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}
