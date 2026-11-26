import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { errorText, FeedbackLine, type Feedback } from "./feedback";

/** Settings section "Passwort ändern": re-encrypts the data file and every backup. */
export function PasswordSection() {
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
