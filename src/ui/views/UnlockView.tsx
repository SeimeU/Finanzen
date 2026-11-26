import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

export function UnlockView({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api.unlock(password);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unbekannter Fehler.");
    }
  }

  return (
    <main className="card">
      <h1>Entsperren</h1>
      <form onSubmit={submit}>
        <label>
          Passwort
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Entsperren</button>
      </form>
    </main>
  );
}
