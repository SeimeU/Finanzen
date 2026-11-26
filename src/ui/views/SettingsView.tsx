import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

/** Settings: password change and data file location. Ticket 06 adds backups and export here. */
export function SettingsView() {
  return (
    <main className="page">
      <h1>Einstellungen</h1>
      <ChangePasswordForm />
      <DataFileLocationForm />
    </main>
  );
}

type Feedback = { kind: "success" | "error"; text: string } | null;

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return feedback.kind === "success" ? (
    <p role="status" className="success">
      {feedback.text}
    </p>
  ) : (
    <p role="alert">{feedback.text}</p>
  );
}

function errorText(e: unknown) {
  return e instanceof ApiError ? e.message : "Unbekannter Fehler.";
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next === "") return setFeedback({ kind: "error", text: "Bitte ein neues Passwort eingeben." });
    if (next !== repeat) return setFeedback({ kind: "error", text: "Die Passwörter stimmen nicht überein." });
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setRepeat("");
      setFeedback({ kind: "success", text: "Das Passwort wurde geändert." });
    } catch (e) {
      setFeedback({ kind: "error", text: errorText(e) });
    }
  }

  return (
    <section className="settings-section">
      <h2 id="passwort-aendern">Passwort ändern</h2>
      <form aria-labelledby="passwort-aendern" onSubmit={submit}>
        <p className="warning">
          Die Datendatei und alle Sicherungen werden mit dem neuen Passwort neu verschlüsselt. Das alte Passwort
          funktioniert danach nirgends mehr. Ein vergessenes Passwort bedeutet den endgültigen Verlust aller Daten.
        </p>
        <label>
          Aktuelles Passwort
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label>
          Neues Passwort
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label>
          Neues Passwort wiederholen
          <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        <FeedbackLine feedback={feedback} />
        <button type="submit">Passwort ändern</button>
      </form>
    </section>
  );
}

function DataFileLocationForm() {
  const [path, setPath] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    api.settings().then((settings) => setPath(settings.dataFile), () => {});
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await api.moveDataFile(path);
      setPath(result.dataFile);
      setFeedback({ kind: "success", text: "Die Datendatei wurde verschoben." });
    } catch (e) {
      setFeedback({ kind: "error", text: errorText(e) });
    }
  }

  return (
    <section className="settings-section">
      <h2 id="speicherort">Speicherort der Datendatei</h2>
      <form aria-labelledby="speicherort" onSubmit={submit}>
        <p>
          Die Datendatei und ihre Sicherungen werden an den neuen Ort verschoben. Gib einen vollständigen Pfad zu
          einer Datei oder einem Ordner an.
        </p>
        <label>
          Datendatei
          <input type="text" value={path} onChange={(e) => setPath(e.target.value)} />
        </label>
        <FeedbackLine feedback={feedback} />
        <button type="submit">Verschieben</button>
      </form>
    </section>
  );
}
