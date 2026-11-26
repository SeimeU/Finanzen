import { lazy, Suspense, useEffect, useState } from "react";
import type { MonthNotes, NetWorthMonth } from "../../core";
import { notesApi, snapshotsApi } from "../api";
import { formatEur, formatMonth } from "../format";
import { MonthNotesSection } from "./MonthNotesSection";
import { Figure } from "./SnapshotView";
import { AccountLinks, ContributionSection } from "./StartSections";

// ECharts is large: load it in its own chunk, only when there is a chart to show.
const NetWorthChart = lazy(() => import("../NetWorthChart").then((m) => ({ default: m.NetWorthChart })));

/** Start screen: current Net worth and its history. Navigation is in UnlockedApp. */
export function StartView({ onOpenAccount }: { onOpenAccount: (accountId: string) => void }) {
  const [series, setSeries] = useState<NetWorthMonth[] | null>(null);
  const [notes, setNotes] = useState<MonthNotes[]>([]);
  /** Month clicked on the chart: its Note and Events open below it. */
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
    snapshotsApi.netWorth().then((r) => setSeries(r.series));
    notesApi.list().then((r) => setNotes(r.notes));
  }, []);

  const latest = series?.at(-1);
  return (
    <main className="page">
      <h1>Vermögen</h1>
      {series !== null && !latest && <p className="empty">Noch kein Monatsstand erfasst.</p>}
      {latest && (
        <>
          <Figure label="Aktuelles Vermögen" value={formatEur(latest.netWorth)} />
          <p className="empty">Stand {formatMonth(latest.month)}</p>
          <Suspense fallback={null}>
            <NetWorthChart series={series!} notes={notes} onSelectMonth={setSelectedMonth} />
          </Suspense>
          {selectedMonth ? (
            <MonthNotesSection month={selectedMonth} onChange={setNotes} />
          ) : (
            <p className="empty">Einen Monat im Diagramm anklicken, um Notiz und Ereignisse zu erfassen.</p>
          )}
          <ContributionSection />
        </>
      )}
      <AccountLinks onOpenAccount={onOpenAccount} />
    </main>
  );
}
