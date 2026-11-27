import { useEffect, useState } from "react";
import type { TransferSuggestion } from "../../core";
import { api, ApiError, transfersApi } from "../api";
import { formatDate, formatEur } from "../format";
import { accountOptions } from "../labels";

/**
 * Suggested Umbuchungen: the same amount out of one own Konto and into another within 3 days.
 * Übernehmen marks both as Umbuchung; Ablehnen keeps both and never suggests the pair again.
 */
export function TransfersView() {
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [suggestions, setSuggestions] = useState<TransferSuggestion[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.structure().then((r) => setAccounts(accountOptions(r.structure)));
    transfersApi.suggestions().then((r) => setSuggestions(r.suggestions));
  }, []);

  async function decide(action: "accept" | "reject", s: TransferSuggestion) {
    setError("");
    try {
      const r = await transfersApi[action](s.outgoing.id, s.incoming.id);
      setSuggestions(r.suggestions);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e.message);
    }
  }

  const accountLabel = (id: string) => accounts.find((a) => a.id === id)?.label ?? id;

  return (
    <main className="page">
      <h1>Umbuchungen</h1>
      <p className="meta">
        Umsätze mit einem eigenen Konto als Gegenkonto (IBAN) gelten automatisch als Umbuchung. Gleiche Beträge, die
        innerhalb von 3 Tagen von einem eigenen Konto ab- und auf einem anderen eingehen, werden hier vorgeschlagen.
      </p>
      {error && <p role="alert">{error}</p>}
      {suggestions !== null && suggestions.length === 0 && <p className="empty">Keine Vorschläge.</p>}
      {suggestions !== null && suggestions.length > 0 && (
        <table aria-label="Vorgeschlagene Umbuchungen" className="transactions">
          <thead>
            <tr>
              <th>Betrag</th>
              <th>Von</th>
              <th>Nach</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s) => (
              <tr key={`${s.outgoing.id}-${s.incoming.id}`}>
                <td className="amount">{formatEur(s.incoming.amountCents)}</td>
                <td>
                  {accountLabel(s.outgoing.accountId)}, {formatDate(s.outgoing.date)}
                  <div className="meta">{s.outgoing.purpose || s.outgoing.counterpartyName}</div>
                </td>
                <td>
                  {accountLabel(s.incoming.accountId)}, {formatDate(s.incoming.date)}
                  <div className="meta">{s.incoming.purpose || s.incoming.counterpartyName}</div>
                </td>
                <td>
                  <div className="row">
                    <button type="button" onClick={() => decide("accept", s)}>
                      Übernehmen
                    </button>
                    <button type="button" className="secondary" onClick={() => decide("reject", s)}>
                      Ablehnen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
