import { useEffect, useId, useState } from "react";
import type { SnapshotForm, SnapshotFormHolding } from "../../core";
import { ApiError, snapshotsApi } from "../api";
import { formatEur, formatEurInput, formatMonth, parseEur } from "../format";

/** What the owner typed for one Holding. `touched` = changed in this form since it loaded. */
type Entry = { value: string; contribution: string; touched: boolean };

const AMOUNT_ERROR = "Bitte einen Betrag wie 1.234,56 eingeben.";

/** "YYYY-MM" of the browser's current month: the form's default. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function entriesFrom(form: SnapshotForm): Record<string, Entry> {
  const entries: Record<string, Entry> = {};
  for (const institution of form.institutions) {
    for (const account of institution.accounts) {
      for (const h of account.holdings) {
        entries[h.id] = {
          value: h.marketValue === null ? "" : formatEurInput(h.marketValue),
          contribution: h.contribution === null ? "" : formatEurInput(h.contribution),
          touched: false,
        };
      }
    }
  }
  return entries;
}

/** Parsed amount in cents, null if blank, "invalid" if it is not an amount. */
function amount(text: string): number | null | "invalid" {
  if (text.trim() === "") return null;
  return parseEur(text) ?? "invalid";
}

/**
 * The Monatsstand form: every Holding pre-filled from the previous month. Only Holdings
 * the owner changed (or that this month already recorded) are saved; the rest carry
 * forward and are flagged "nicht aktualisiert".
 */
export function SnapshotView() {
  const [month, setMonth] = useState(currentMonth);
  const [form, setForm] = useState<SnapshotForm | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setStatus(null);
    setError(null);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    snapshotsApi.form(month).then(
      (r) => {
        if (!current) return;
        setForm(r.form);
        setEntries(entriesFrom(r.form));
      },
      (e) => current && setError(e instanceof ApiError ? e.message : String(e)),
    );
    return () => {
      current = false;
    };
  }, [month]);

  const accounts = form?.institutions.flatMap((i) => i.accounts) ?? [];
  let netWorth = 0;
  let invalid = false;
  const holdingValues: { holdingId: string; marketValue: number; contribution: number | null }[] = [];
  for (const account of accounts) {
    for (const holding of account.holdings) {
      const entry = entries[holding.id];
      if (!entry) continue;
      const value = amount(entry.value);
      const contribution = amount(entry.contribution);
      if (value === "invalid" || contribution === "invalid") {
        invalid = true;
        continue;
      }
      if (value !== null) netWorth += (account.isDebt ? -1 : 1) * value;
      if (value !== null && (entry.touched || holding.recorded)) {
        holdingValues.push({ holdingId: holding.id, marketValue: value, contribution });
      }
    }
  }
  const change = form?.previousNetWorth == null ? null : netWorth - form.previousNetWorth;

  const update = (id: string, patch: Partial<Entry>) => {
    setStatus(null);
    setEntries((all) => ({ ...all, [id]: { ...all[id]!, ...patch, touched: true } }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form || invalid) return;
    setError(null);
    try {
      const r = await snapshotsApi.save({ month: form.month, holdingValues });
      setForm(r.form);
      setEntries(entriesFrom(r.form));
      setStatus(`Monatsstand für ${formatMonth(form.month)} gespeichert.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <main className="page">
      <h1>Monatsstand</h1>
      <form aria-label="Monatsstand" onSubmit={submit} className="snapshot-form">
        <label className="month">
          Monat
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
        </label>
        {form?.exists && <p className="empty">Für diesen Monat gibt es schon einen Monatsstand. Speichern ersetzt ihn.</p>}
        {form && accounts.length === 0 && <p className="empty">Noch keine Positionen angelegt.</p>}
        {form?.institutions.map((institution) => (
          <section key={institution.id} className="institution">
            <h2>{institution.name}</h2>
            {institution.accounts.map((account) => (
              <section key={account.id} className="account">
                <h3>
                  {account.name}
                  {account.isDebt && <span className="badge">Schulden</span>}
                </h3>
                {account.holdings.map((holding) => (
                  <HoldingFields
                    key={holding.id}
                    holding={holding}
                    entry={entries[holding.id]}
                    onChange={(patch) => update(holding.id, patch)}
                  />
                ))}
              </section>
            ))}
          </section>
        ))}
        <div className="totals">
          <Figure label="Vermögen" value={formatEur(netWorth)} />
          <Figure label="Veränderung zum Vormonat" value={change === null ? "–" : formatEur(change)} />
        </div>
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
        <button type="submit" disabled={!form || invalid}>
          Speichern
        </button>
      </form>
    </main>
  );
}

function HoldingFields({
  holding,
  entry,
  onChange,
}: {
  holding: SnapshotFormHolding;
  entry: Entry | undefined;
  onChange: (patch: Partial<Entry>) => void;
}) {
  const legendId = useId();
  if (!entry) return null;
  const notUpdated = !entry.touched && !holding.recorded && holding.previousValue !== null;
  const invalid = amount(entry.value) === "invalid" || amount(entry.contribution) === "invalid";
  return (
    <fieldset className="holding" aria-labelledby={legendId}>
      <legend id={legendId}>{holding.name}</legend>
      <label>
        Wert
        <input inputMode="decimal" value={entry.value} onChange={(e) => onChange({ value: e.target.value })} />
      </label>
      {holding.isInvestment && (
        <label>
          Einzahlung
          <input
            inputMode="decimal"
            value={entry.contribution}
            onChange={(e) => onChange({ contribution: e.target.value })}
          />
        </label>
      )}
      {notUpdated && <span className="badge">nicht aktualisiert</span>}
      {invalid && <p role="alert">{AMOUNT_ERROR}</p>}
    </fieldset>
  );
}

/** A labelled headline figure, e.g. "Vermögen 1.234,56 €". */
export function Figure({ label, value }: { label: string; value: string }) {
  const id = useId();
  return (
    <div className="figure">
      <span id={id}>{label}</span>
      <strong aria-labelledby={id}>{value}</strong>
    </div>
  );
}
