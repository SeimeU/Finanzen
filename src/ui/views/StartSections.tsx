import { lazy, Suspense, useEffect, useId, useState } from "react";
import type { ContributionMonth, InstitutionView } from "../../core";
import { accountDetailApi, api } from "../api";
import { formatEur, formatMonth } from "../format";

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
