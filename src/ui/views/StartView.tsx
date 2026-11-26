import { lazy, Suspense, useEffect, useState } from "react";
import type { NetWorthMonth } from "../../core";
import { snapshotsApi } from "../api";
import { formatEur, formatMonth } from "../format";
import { Figure } from "./SnapshotView";
import { AccountLinks, ContributionSection } from "./StartSections";

// ECharts is large: load it in its own chunk, only when there is a chart to show.
const NetWorthChart = lazy(() => import("../NetWorthChart").then((m) => ({ default: m.NetWorthChart })));

/** Start screen: current Net worth and its history. Navigation is in UnlockedApp. */
export function StartView({ onOpenAccount }: { onOpenAccount: (accountId: string) => void }) {
  const [series, setSeries] = useState<NetWorthMonth[] | null>(null);

  useEffect(() => {
    snapshotsApi.netWorth().then((r) => setSeries(r.series));
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
            <NetWorthChart series={series!} />
          </Suspense>
          <ContributionSection />
        </>
      )}
      <AccountLinks onOpenAccount={onOpenAccount} />
    </main>
  );
}
