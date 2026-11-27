import { lazy, Suspense, useEffect, useId, useMemo, useState } from "react";
import type { CashFlowMonth, CategoryKind, CategorySpendingRow, InstitutionView } from "../../core";
import { spendingApi } from "../api";
import { formatEur, formatMonth } from "../format";
import { CATEGORY_KIND_PLURAL_LABELS } from "../labels";

const BreakdownChart = lazy(() => import("../BreakdownChart").then((m) => ({ default: m.BreakdownChart })));
const CashFlowChart = lazy(() => import("../SpendingCharts").then((m) => ({ default: m.CashFlowChart })));
const HistoryChart = lazy(() => import("../SpendingCharts").then((m) => ({ default: m.HistoryChart })));

/** 0.6238 → "62,4 %". */
function formatRate(rate: number): string {
  return `${(Math.round(rate * 1000) / 10).toFixed(1).replace(".", ",")} %`;
}

const formatPeriod = (period: string) => (period.length === 7 ? formatMonth(period) : period);

/**
 * Ausgaben & Sparquote: income versus expenses per month with the Savings rate (or why a month
 * is incomplete), spending per Category for a month or year with drill-down, and one Category
 * compared between months or years. Nicht kategorisiert is its own bucket, never dropped.
 */
export function SpendingView() {
  const [months, setMonths] = useState<CashFlowMonth[] | null>(null);
  const [structure, setStructure] = useState<InstitutionView[]>([]);

  useEffect(() => {
    spendingApi.cashFlow().then((r) => {
      setMonths(r.months);
      setStructure(r.structure);
    });
  }, []);

  async function setFlag(accountId: string, carries: boolean) {
    const r = await spendingApi.setCarriesCashFlow(accountId, carries);
    setMonths(r.months);
    setStructure(r.structure);
  }

  if (months === null) return null;
  return (
    <main className="page">
      <h1>Ausgaben &amp; Sparquote</h1>
      {months.length === 0 ? (
        <p className="empty">Noch keine Umsätze importiert.</p>
      ) : (
        <>
          <CashFlowSection months={months} />
          <CategorySection months={months} />
        </>
      )}
      <AccountFlagsSection structure={structure} onChange={setFlag} />
    </main>
  );
}

function CashFlowSection({ months }: { months: CashFlowMonth[] }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Einnahmen und Ausgaben</h2>
      <Suspense fallback={null}>
        <CashFlowChart months={months} />
      </Suspense>
      <table className="table">
        <caption>Sparquote je Monat</caption>
        <thead>
          <tr>
            <th scope="col">Monat</th>
            <th scope="col">Einnahmen</th>
            <th scope="col">Ausgaben</th>
            <th scope="col">Sparquote</th>
          </tr>
        </thead>
        <tbody>
          {[...months].reverse().map((m) => (
            <tr key={m.month}>
              <th scope="row">{formatMonth(m.month)}</th>
              <td className="amount">{formatEur(m.income)}</td>
              <td className="amount">{formatEur(m.expenses)}</td>
              <td>
                <SavingsRateCell month={m} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SavingsRateCell({ month }: { month: CashFlowMonth }) {
  const note =
    month.uncategorizedCount > 0 ? ` (enthält ${month.uncategorizedCount} nicht kategorisierte Umsätze)` : "";
  if (month.incompleteReason === "no-accounts-flagged") {
    return <span className="incomplete">unvollständig – keine Konten mit Einnahmen und Ausgaben gewählt</span>;
  }
  if (month.incompleteReason === "accounts-missing") {
    return (
      <span className="incomplete">
        unvollständig – fehlt: {month.missingAccounts.map((a) => a.name).join(", ")}
      </span>
    );
  }
  if (month.savingsRate === null) return <span>– (keine Einnahmen){note}</span>;
  return (
    <span>
      {formatRate(month.savingsRate)}
      {note}
    </span>
  );
}

function CategorySection({ months }: { months: CashFlowMonth[] }) {
  const headingId = useId();
  const periods = useMemo(() => {
    const monthList = months.map((m) => m.month).reverse();
    const years = [...new Set(monthList.map((m) => m.slice(0, 4)))];
    return { months: monthList, years };
  }, [months]);
  const [period, setPeriod] = useState(periods.months[0]!);
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [parent, setParent] = useState<{ id: string; name: string } | null>(null);
  const [rows, setRows] = useState<CategorySpendingRow[] | null>(null);
  const [compare, setCompare] = useState<{ categoryId: string | null; name: string } | null>(null);

  useEffect(() => {
    spendingApi.categories({ period, kind, parentId: parent?.id ?? null }).then((r) => setRows(r.rows));
  }, [period, kind, parent, months]);

  const label = `${CATEGORY_KIND_PLURAL_LABELS[kind]} nach Kategorie – ${parent ? `${parent.name}, ` : ""}${formatPeriod(period)}`;
  const chartRows = useMemo(() => (rows ?? []).map((r) => ({ name: r.name, value: r.amount })), [rows]);

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Nach Kategorie</h2>
      <div className="row">
        <label>
          Zeitraum
          <select aria-label="Zeitraum" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <optgroup label="Monate">
              {periods.months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Jahre">
              {periods.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label>
          Art
          <select
            aria-label="Art"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as CategoryKind);
              setParent(null);
            }}
          >
            <option value="expense">{CATEGORY_KIND_PLURAL_LABELS.expense}</option>
            <option value="income">{CATEGORY_KIND_PLURAL_LABELS.income}</option>
          </select>
        </label>
        {parent && (
          <button type="button" className="secondary" onClick={() => setParent(null)}>
            Alle Kategorien
          </button>
        )}
      </div>
      {rows !== null && rows.length === 0 && <p className="empty">Keine {CATEGORY_KIND_PLURAL_LABELS[kind]} in diesem Zeitraum.</p>}
      {rows !== null && rows.length > 0 && (
        <>
          <Suspense fallback={null}>
            <BreakdownChart label={label} rows={chartRows} />
          </Suspense>
          <table className="table">
            <caption>{label}</caption>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.categoryId}-${r.name}`}>
                  <th scope="row">{r.name}</th>
                  <td className="amount">{formatEur(r.amount)}</td>
                  <td>
                    {r.drillable && (
                      <button type="button" className="secondary" onClick={() => setParent({ id: r.categoryId!, name: r.name })}>
                        Unterkategorien
                      </button>
                    )}{" "}
                    {(r.categoryId === null ? kind === "expense" : r.categoryId !== parent?.id) && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setCompare({ categoryId: r.categoryId, name: r.name })}
                      >
                        Vergleichen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {compare && <ComparisonSection categoryId={compare.categoryId} name={compare.name} onClose={() => setCompare(null)} />}
    </section>
  );
}

function ComparisonSection(props: { categoryId: string | null; name: string; onClose: () => void }) {
  const headingId = useId();
  const [by, setBy] = useState<"month" | "year">("month");
  const [history, setHistory] = useState<{ period: string; amount: number }[]>([]);

  useEffect(() => {
    spendingApi.history({ categoryId: props.categoryId, by }).then((r) => setHistory(r.history));
  }, [props.categoryId, by]);

  const label = `${props.name} im Vergleich`;
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId}>{label}</h3>
      <div className="row">
        <label>
          Vergleich nach
          <select aria-label="Vergleich nach" value={by} onChange={(e) => setBy(e.target.value as "month" | "year")}>
            <option value="month">Monaten</option>
            <option value="year">Jahren</option>
          </select>
        </label>
        <button type="button" className="secondary" onClick={props.onClose}>
          Vergleich schließen
        </button>
      </div>
      <Suspense fallback={null}>
        <HistoryChart label={label} history={history} />
      </Suspense>
      <table className="table">
        <caption>{label}</caption>
        <tbody>
          {[...history].reverse().map((h, i, list) => {
            const previous = list[i + 1];
            return (
              <tr key={h.period}>
                <th scope="row">{formatPeriod(h.period)}</th>
                <td className="amount">{formatEur(h.amount)}</td>
                <td className="amount">
                  {previous && `${h.amount - previous.amount > 0 ? "+" : ""}${formatEur(h.amount - previous.amount)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** Which Accounts carry income or spending: only months their imports fully cover get a Sparquote. */
function AccountFlagsSection(props: { structure: InstitutionView[]; onChange: (accountId: string, carries: boolean) => Promise<void> }) {
  const headingId = useId();
  const [busy, setBusy] = useState(false);
  const accounts = props.structure.flatMap((i) =>
    i.accounts.filter((a) => a.closingMonth === null).map((a) => ({ ...a, institution: i.name })),
  );
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Konten mit Einnahmen und Ausgaben</h2>
      <p className="meta">
        Die Sparquote eines Monats wird nur gezeigt, wenn für jedes gewählte Konto Umsätze dieses Monats importiert sind.
        Eine importierte Datei deckt jeden ganzen Monat ab, vom Monat ihrer ersten bis zum Monat ihrer letzten Buchung.
      </p>
      {accounts.length === 0 && <p className="empty">Noch keine Konten angelegt.</p>}
      {accounts.map((a) => (
        <label key={a.id} className="checkbox">
          <input
            type="checkbox"
            checked={a.carriesCashFlow}
            disabled={busy}
            onChange={async (e) => {
              setBusy(true);
              try {
                await props.onChange(a.id, e.target.checked);
              } finally {
                setBusy(false);
              }
            }}
          />
          {a.institution} – {a.name}
        </label>
      ))}
    </section>
  );
}
