import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

export function SetupPasswordView({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password === "") return setError("Bitte ein Passwort eingeben.");
    if (password !== repeat) return setError("Die Passwörter stimmen nicht überein.");
    try {
      await api.setup(password);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unbekannter Fehler.");
    }
  }

  return (
    <main className="card">
      <h1>Passwort festlegen</h1>
      <p className="warning">
        Achtung: Deine Daten werden mit diesem Passwort verschlüsselt. Es gibt keine Möglichkeit, es
        wiederherzustellen. Ein vergessenes Passwort bedeutet den endgültigen Verlust aller Daten. Bewahre es
        sicher auf.
      </p>
      <form onSubmit={submit}>
        <label>
          Passwort
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Passwort wiederholen
          <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Passwort festlegen</button>
      </form>
    </main>
  );
}
