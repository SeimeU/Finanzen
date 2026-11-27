import { lazy, Suspense, useEffect, useId, useState } from "react";
import type { AccountDetail } from "../../core";
import { accountDetailApi, ApiError } from "../api";
import { formatEur, formatMonth } from "../format";
import { formatClassification } from "../labels";
import { Figure } from "./SnapshotView";

// ECharts is large: its own chunk, loaded only when a chart is shown.
const AccountValueChart = lazy(() => import("../AccountCharts").then((m) => ({ default: m.AccountValueChart })));

/** Konto detail: value history and Holdings of one Account. Values as counted in Vermögen (debts negative). */
export function AccountDetailView({ accountId, onBack }: { accountId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const holdingsId = useId();
  const historyId = useId();

  useEffect(() => {
    accountDetailApi
      .detail(accountId)
      .then((r) => setDetail(r.detail))
      .catch((e) => setProblem(e instanceof ApiError ? e.message : "Das Konto konnte nicht geladen werden."));
  }, [accountId]);

  const back = (
    <button type="button" className="secondary" onClick={onBack}>
      Zurück
    </button>
  );
  if (problem) {
    return (
      <main className="page">
        {back}
        <p role="alert">{problem}</p>
      </main>
    );
  }
  if (!detail) return null;
  const latest = detail.series.at(-1);

  return (
    <main className="page">
      {back}
      <h1>{detail.name}</h1>
      <p className="meta">
        {detail.institutionName}
        {detail.iban && <> · IBAN: {detail.iban}</>} · Standardeinordnung:{" "}
        {formatClassification(detail.defaultClassification)}
        {detail.isDebt && <> · Schulden</>}
      </p>
      {latest ? (
        <>
          <Figure label="Aktueller Wert" value={formatEur(latest.value)} />
          <p className="empty">Stand {formatMonth(latest.month)}</p>
          <Suspense fallback={null}>
            <AccountValueChart series={detail.series} />
          </Suspense>
        </>
      ) : (
        <p className="empty">Für dieses Konto wurde noch kein Wert erfasst.</p>
      )}

      <h2 id={holdingsId}>Positionen</h2>
      {detail.holdings.length === 0 ? (
        <p className="empty">Keine Positionen.</p>
      ) : (
        <table className="table" aria-labelledby={holdingsId}>
          <thead>
            <tr>
              <th>Position</th>
              <th>Einordnung</th>
              <th className="amount">Wert</th>
            </tr>
          </thead>
          <tbody>
            {detail.holdings.map((h) => (
              <tr key={h.id}>
                <td>{h.name}</td>
                <td>{formatClassification(h.classification)}</td>
                <td className="amount">
                  {h.marketValue === null ? "–" : formatEur(h.marketValue)}
                  {h.notUpdated && <span className="meta"> (nicht aktualisiert)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detail.series.length > 0 && (
        <>
          <h2 id={historyId}>Verlauf</h2>
          <table className="table" aria-labelledby={historyId}>
            <thead>
              <tr>
                <th>Monat</th>
                <th className="amount">Wert</th>
                <th className="amount">Einzahlung</th>
              </tr>
            </thead>
            <tbody>
              {detail.series.map((m) => (
                <tr key={m.month}>
                  <td>{formatMonth(m.month)}</td>
                  <td className="amount">{formatEur(m.value)}</td>
                  <td className="amount">{m.contribution === 0 ? "" : formatEur(m.contribution)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
