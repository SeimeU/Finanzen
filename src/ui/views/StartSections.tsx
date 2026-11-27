import { lazy, Suspense, useEffect, useId, useMemo, useState } from "react";
import { ASSET_CLASSES, LIQUIDITIES, type ContributionMonth, type CurrentOverview, type InstitutionView } from "../../core";
import { accountDetailApi, api } from "../api";
import { formatEur, formatMonth } from "../format";
import { ASSET_CLASS_LABELS } from "../labels";

const BreakdownChart = lazy(() => import("../BreakdownChart").then((m) => ({ default: m.BreakdownChart })));

/** Liquidity in a breakdown: without a single Maturity date, so "Gebunden" rather than "Gebunden bis". */
const LIQUIDITY_BREAKDOWN_LABELS = { available: "Verfügbar", locked: "Gebunden" } as const;

type BreakdownRow = { name: string; value: number };

/** Current Vermögen split by Anlageklasse (table), Verfügbarkeit and Institut (small chart and table each). */
export function BreakdownSection({ overview }: { overview: CurrentOverview }) {
  const headingId = useId();
  const { byAssetClass, byLiquidity } = overview;
  const assetClasses = useMemo(
    () =>
      ASSET_CLASSES.filter((c) => byAssetClass[c] !== undefined).map((c) => ({
        name: ASSET_CLASS_LABELS[c],
        value: byAssetClass[c]!,
      })),
    [byAssetClass],
  );
  const liquidity = useMemo(
    () => LIQUIDITIES.map((l) => ({ name: LIQUIDITY_BREAKDOWN_LABELS[l], value: byLiquidity[l] ?? 0 })),
    [byLiquidity],
  );
  const institutions = useMemo(
    () => overview.byInstitution.map((i) => ({ name: i.name, value: i.value })),
    [overview.byInstitution],
  );
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Aufteilung – {formatMonth(overview.month)}</h2>
      <div className="breakdowns">
        <div>
          <BreakdownTable caption="Nach Anlageklasse" rows={assetClasses} />
        </div>
        <div>
          <Suspense fallback={null}>
            <BreakdownChart label="Nach Verfügbarkeit" rows={liquidity} />
          </Suspense>
          <BreakdownTable caption="Nach Verfügbarkeit" rows={liquidity} />
        </div>
        <div>
          <Suspense fallback={null}>
            <BreakdownChart label="Nach Institut" rows={institutions} />
          </Suspense>
          <BreakdownTable caption="Nach Institut" rows={institutions} />
        </div>
      </div>
    </section>
  );
}

function BreakdownTable({ caption, rows }: { caption: string; rows: BreakdownRow[] }) {
  return (
    <table className="table">
      <caption>{caption}</caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <th scope="row">{r.name}</th>
            <td className="amount">{formatEur(r.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const ContributionChart = lazy(() => import("../AccountCharts").then((m) => ({ default: m.ContributionChart })));

/** Start screen: one button per Konto, opening its detail view. */
export function AccountLinks({ onOpenAccount }: { onOpenAccount: (accountId: string) => void }) {
  const [structure, setStructure] = useState<InstitutionView[] | null>(null);
  const headingId = useId();

  useEffect(() => {
    api.structure().then((r) => setStructure(r.structure));
  }, []);

  const institutions = structure?.filter((i) => i.accounts.length > 0) ?? [];
  if (institutions.length === 0) return null;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Konten</h2>
      {institutions.map((institution) => (
        <div key={institution.id}>
          <h3>{institution.name}</h3>
          <ul className="account-links">
            {institution.accounts.map((account) => (
              <li key={account.id}>
                <button type="button" className="secondary" onClick={() => onOpenAccount(account.id)}>
                  {account.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Per month: how much of the change in Vermögen came from Einzahlungen and how much from the market. */
export function ContributionSection() {
  const [months, setMonths] = useState<ContributionMonth[] | null>(null);
  const headingId = useId();

  useEffect(() => {
    accountDetailApi.contributions().then((r) => setMonths(r.months));
  }, []);

  if (!months || months.length === 0) return null;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Einzahlung und Marktveränderung</h2>
      <p className="meta">
        Marktveränderung: Wertänderung aller Positionen außer Cash, abzüglich Einzahlungen. Sonstige Veränderung: Cash
        und Schulden.
      </p>
      <Suspense fallback={null}>
        <ContributionChart months={months} />
      </Suspense>
      <table className="table">
        <thead>
          <tr>
            <th>Monat</th>
            <th className="amount">Einzahlung</th>
            <th className="amount">Marktveränderung</th>
            <th className="amount">Sonstige Veränderung</th>
            <th className="amount">Veränderung Vermögen</th>
          </tr>
        </thead>
        <tbody>
          {[...months].reverse().map((m) => (
            <tr key={m.month}>
              <td>{formatMonth(m.month)}</td>
              <td className="amount">{formatEur(m.contribution)}</td>
              <td className="amount">{formatEur(m.marketChange)}</td>
              <td className="amount">{formatEur(m.otherChange)}</td>
              <td className="amount">{formatEur(m.netWorthChange)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
