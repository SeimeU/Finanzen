import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { CurrentOverview, MonthNotes, NetWorthMonth, NextMaturity, Projection } from "../../core";
import { maturitiesApi, notesApi, projectionApi, snapshotsApi } from "../api";
import { formatChange, formatDate, formatEur, formatMonth } from "../format";
import { MonthNotesSection } from "./MonthNotesSection";
import { Figure } from "./SnapshotView";
import { AccountLinks, BreakdownSection, ContributionSection } from "./StartSections";

// ECharts is large: load it in its own chunk, only when there is a chart to show.
const NetWorthChart = lazy(() => import("../NetWorthChart").then((m) => ({ default: m.NetWorthChart })));

/** Chart time ranges: the latest n months, or all (null). */
const RANGES = [
  { label: "1 Jahr", months: 12 },
  { label: "5 Jahre", months: 60 },
  { label: "Alle", months: null },
] as const;

/** Start screen: current Net worth, its changes, history and breakdowns. Navigation is in UnlockedApp. */
export function StartView({ onOpenAccount }: { onOpenAccount: (accountId: string) => void }) {
  const [series, setSeries] = useState<NetWorthMonth[] | null>(null);
  const [overview, setOverview] = useState<CurrentOverview | null>(null);
  const [notes, setNotes] = useState<MonthNotes[]>([]);
  const [nextMaturity, setNextMaturity] = useState<NextMaturity | null>(null);
  const [rangeMonths, setRangeMonths] = useState<number | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [showProjection, setShowProjection] = useState(false);
  /** Month clicked on the chart: its Note and Events open below it. */
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
    snapshotsApi.netWorth().then((r) => setSeries(r.series));
    snapshotsApi.overview().then((r) => setOverview(r.overview));
    notesApi.list().then((r) => setNotes(r.notes));
    maturitiesApi.timeline().then((r) => setNextMaturity(r.timeline.next));
    projectionApi.get().then((r) => setProjection(r.projection));
  }, []);

  const latest = series?.at(-1);
  const shown = useMemo(
    () => (series && rangeMonths !== null ? series.slice(-rangeMonths) : (series ?? [])),
    [series, rangeMonths],
  );
  return (
    <main className="page">
      <h1>Vermögen</h1>
      {series !== null && !latest && <p className="empty">Noch kein Monatsstand erfasst.</p>}
      {latest && (
        <>
          <div className="figures">
            <Figure label="Aktuelles Vermögen" value={formatEur(latest.netWorth)} />
            {overview?.vsLastMonth && <Figure label="Veränderung zum Vormonat" value={formatChange(overview.vsLastMonth)} />}
            {overview?.vs12MonthsAgo && (
              <Figure label="Veränderung zum Vorjahresmonat" value={formatChange(overview.vs12MonthsAgo)} />
            )}
            {nextMaturity && (
              <Figure
                label="Nächste Fälligkeit"
                value={`${formatDate(nextMaturity.maturityDate)}: ${formatEur(nextMaturity.amount)}`}
              />
            )}
          </div>
          <p className="empty">Stand {formatMonth(latest.month)}</p>
          <div className="range" role="group" aria-label="Zeitraum">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                className="secondary"
                aria-pressed={rangeMonths === r.months}
                onClick={() => setRangeMonths(r.months)}
              >
                {r.label}
              </button>
            ))}
            {projection && (
              <button
                type="button"
                className="secondary"
                aria-pressed={showProjection}
                onClick={() => setShowProjection(!showProjection)}
              >
                Prognose anzeigen
              </button>
            )}
          </div>
          <Suspense fallback={null}>
            <NetWorthChart
              series={shown}
              notes={notes}
              onSelectMonth={setSelectedMonth}
              projection={showProjection ? projection?.months : undefined}
            />
          </Suspense>
          {selectedMonth ? (
            <MonthNotesSection month={selectedMonth} onChange={setNotes} />
          ) : (
            <p className="empty">Einen Monat im Diagramm anklicken, um Notiz und Ereignisse zu erfassen.</p>
          )}
          {overview && <BreakdownSection overview={overview} />}
          <ContributionSection />
        </>
      )}
      <AccountLinks onOpenAccount={onOpenAccount} />
    </main>
  );
}
