import { useEffect, useState } from "react";
import type { MaturityTimeline } from "../../core";
import { ApiError, maturitiesApi } from "../api";
import { formatDate, formatEur } from "../format";

/** Fälligkeiten: every Locked Holding ordered by Maturity date; matured ones are marked "fällig". */
export function MaturitiesView() {
  const [timeline, setTimeline] = useState<MaturityTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    maturitiesApi.timeline().then(
      (r) => setTimeline(r.timeline),
      (e) => setError(e instanceof ApiError ? e.message : String(e)),
    );
  }, []);

  return (
    <main className="page">
      <h1>Fälligkeiten</h1>
      {error && <p role="alert">{error}</p>}
      {timeline?.entries.length === 0 && <p className="empty">Keine gebundenen Positionen.</p>}
      {timeline && timeline.entries.length > 0 && (
        <table className="table maturities">
          <caption>Gebundenes Geld nach Fälligkeit</caption>
          <thead>
            <tr>
              <th>Fälligkeit</th>
              <th>Position</th>
              <th>Konto</th>
              <th className="amount">Marktwert</th>
            </tr>
          </thead>
          <tbody>
            {timeline.entries.map((e) => (
              <tr key={e.holdingId ?? e.accountId} className={e.matured ? "matured" : undefined}>
                <td>
                  {formatDate(e.maturityDate)}
                  {e.matured && <span className="badge"> fällig</span>}
                </td>
                <td>{e.holdingName ?? "Kontostand gesamt"}</td>
                <td>{e.accountName}</td>
                <td className="amount">{e.marketValue === null ? "–" : formatEur(e.marketValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
