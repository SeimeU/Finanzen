import { useEffect, useId, useRef, useState } from "react";
import type { SnapshotForm, SnapshotFormAccount, SnapshotFormHolding } from "../../core";
import { ApiError, snapshotsApi } from "../api";
import { formatEur, formatEurInput, formatMonth, parseEur } from "../format";
import { MonthNotesSection } from "./MonthNotesSection";

/**
 * What the owner typed for one Holding, or for one Account's Kontostand gesamt
 * (keyed by accountKey). `touched` = changed in this form since it loaded.
 */
type Entry = { value: string; contribution: string; touched: boolean };

const AMOUNT_ERROR = "Bitte einen Betrag wie 1.234,56 eingeben.";

/** Entries for Account-level values live next to the Holdings' under this key. */
const accountKey = (accountId: string) => `account:${accountId}`;

/** "YYYY-MM" of the browser's current month: the form's default. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, by: 1 | -1): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

const formatInput = (cents: number | null) => (cents === null ? "" : formatEurInput(cents));

/** Fresh entries for `form`; entries the owner already touched (and that still apply) are kept. */
function entriesFrom(form: SnapshotForm, keep: Record<string, Entry> = {}): Record<string, Entry> {
  const entries: Record<string, Entry> = {};
  for (const institution of form.institutions) {
    for (const account of institution.accounts) {
      if (account.accountValue) {
        const key = accountKey(account.id);
        entries[key] = keep[key]?.touched
          ? keep[key]
          : { value: formatInput(account.accountValue.marketValue), contribution: "", touched: false };
      }
      for (const h of account.holdings) {
        entries[h.id] = keep[h.id]?.touched
          ? keep[h.id]
          : { value: formatInput(h.marketValue), contribution: formatInput(h.contribution), touched: false };
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
 * The Monatsstand form: every Holding pre-filled from the previous month, or one
 * Kontostand gesamt per Account in months before its switch to per-Holding values.
 * Only values the owner changed (or that this month already recorded) are saved; the
 * rest carry forward and are flagged "nicht aktualisiert".
 */
export function SnapshotView() {
  const [month, setMonth] = useState(currentMonth);
  const [form, setForm] = useState<SnapshotForm | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A switch to or from Kontostand gesamt is being saved: one at a time, each builds on the last. */
  const [switching, setSwitching] = useState(false);
  /** Status to show once the next month's form has loaded ("save and go to …"). */
  const statusAfterLoad = useRef<string | null>(null);
  const today = currentMonth();

  useEffect(() => {
    let current = true;
    setStatus(statusAfterLoad.current);
    statusAfterLoad.current = null;
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
  const accountValues: { accountId: string; marketValue: number }[] = [];
  for (const account of accounts) {
    const sign = account.isDebt ? -1 : 1;
    const accountEntry = entries[accountKey(account.id)];
    if (account.accountValue && accountEntry) {
      const value = amount(accountEntry.value);
      if (value === "invalid") invalid = true;
      else if (value !== null) {
        netWorth += sign * value;
        if (accountEntry.touched || account.accountValue.recorded) {
          accountValues.push({ accountId: account.id, marketValue: value });
        }
      }
    }
    for (const holding of account.holdings) {
      const entry = entries[holding.id];
      if (!entry) continue;
      const value = amount(entry.value);
      const contribution = amount(entry.contribution);
      if (value === "invalid" || contribution === "invalid") {
        invalid = true;
        continue;
      }
      if (value !== null) netWorth += sign * value;
      if (value !== null && (entry.touched || holding.recorded)) {
        holdingValues.push({ holdingId: holding.id, marketValue: value, contribution });
      }
    }
  }
  const change = form?.previousNetWorth == null ? null : netWorth - form.previousNetWorth;

  const update = (key: string, patch: Partial<Entry>) => {
    setStatus(null);
    setEntries((all) => ({ ...all, [key]: { ...all[key]!, ...patch, touched: true } }));
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || invalid || switching) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const goTo = submitter?.value === "previous" ? -1 : submitter?.value === "next" ? 1 : 0;
    setError(null);
    try {
      const r = await snapshotsApi.save({ month: form.month, holdingValues, accountValues });
      const saved = `Monatsstand für ${formatMonth(form.month)} gespeichert.`;
      if (goTo === 0) {
        setForm(r.form);
        setEntries(entriesFrom(r.form));
        setStatus(saved);
      } else {
        statusAfterLoad.current = saved;
        setMonth(shiftMonth(form.month, goTo));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  async function switchAccount(accountId: string, perHoldingFrom: string | null) {
    if (!form || switching) return;
    setError(null);
    setSwitching(true);
    try {
      const r = await snapshotsApi.setPerHoldingFrom({ accountId, month: perHoldingFrom, formMonth: form.month });
      setForm(r.form);
      setEntries((all) => entriesFrom(r.form, all));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSwitching(false);
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
              <AccountFields
                key={account.id}
                account={account}
                month={form.month}
                entries={entries}
                switching={switching}
                onChange={update}
                onSwitch={(perHoldingFrom) => switchAccount(account.id, perHoldingFrom)}
              />
            ))}
          </section>
        ))}
        <div className="totals">
          <Figure label="Vermögen" value={formatEur(netWorth)} />
          <Figure label="Veränderung zum Vormonat" value={change === null ? "–" : formatEur(change)} />
        </div>
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
        <div className="row">
          <button type="submit" disabled={!form || invalid || switching}>
            Speichern
          </button>
          <button type="submit" value="previous" className="secondary" disabled={!form || invalid || switching}>
            Speichern und Vormonat
          </button>
          {month < today && (
            <button type="submit" value="next" className="secondary" disabled={!form || invalid || switching}>
              Speichern und nächster Monat
            </button>
          )}
        </div>
      </form>
      {/^\d{4}-\d{2}$/.test(month) && <MonthNotesSection month={month} />}
    </main>
  );
}

function AccountFields({
  account,
  month,
  entries,
  switching,
  onChange,
  onSwitch,
}: {
  account: SnapshotFormAccount;
  month: string;
  entries: Record<string, Entry>;
  switching: boolean;
  onChange: (key: string, patch: Partial<Entry>) => void;
  onSwitch: (perHoldingFrom: string | null) => void;
}) {
  const headingId = useId();
  const accountEntry = entries[accountKey(account.id)];
  return (
    <section className="account" aria-labelledby={headingId}>
      <h3 id={headingId}>
        {account.name}
        {account.isDebt && <span className="badge">Schulden</span>}
      </h3>
      {account.accountValue && accountEntry && (
        <>
          <AmountField
            className="holding"
            label="Kontostand gesamt"
            entry={accountEntry}
            notUpdated={!accountEntry.touched && !account.accountValue.recorded && account.accountValue.previousValue !== null}
            onChange={(value) => onChange(accountKey(account.id), { value })}
          />
          <p className="meta">
            Werte pro Position ab {formatMonth(account.perHoldingFrom!)}.{" "}
            {account.canSwitchToPerHolding && (
              <button type="button" className="secondary" disabled={switching} onClick={() => onSwitch(month)}>
                Ab diesem Monat Werte pro Position
              </button>
            )}
          </p>
        </>
      )}
      {account.holdings.map((holding) => (
        <HoldingFields
          key={holding.id}
          holding={holding}
          entry={entries[holding.id]}
          onChange={(patch) => onChange(holding.id, patch)}
        />
      ))}
      {account.accountLevelSwitch && (
        <p className="meta">
          <button
            type="button"
            className="secondary"
            disabled={switching}
            onClick={() => onSwitch(account.accountLevelSwitch)}
          >
            Kontostand gesamt erfassen
          </button>{" "}
          bis einschließlich {formatMonth(shiftMonth(account.accountLevelSwitch, -1))}
        </p>
      )}
    </section>
  );
}

function AmountField({
  className,
  label,
  entry,
  notUpdated,
  onChange,
}: {
  className: string;
  label: string;
  entry: Entry;
  notUpdated: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className={className}>
      <label>
        {label}
        <input inputMode="decimal" value={entry.value} onChange={(e) => onChange(e.target.value)} />
      </label>
      {notUpdated && <span className="badge">nicht aktualisiert</span>}
      {amount(entry.value) === "invalid" && <p role="alert">{AMOUNT_ERROR}</p>}
    </div>
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
