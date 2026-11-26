import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { errorText, FeedbackLine, type Feedback } from "./feedback";

/** Settings section "Speicherort der Datendatei": moves the data file and its backups. */
export function DataFileLocationSection() {
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
