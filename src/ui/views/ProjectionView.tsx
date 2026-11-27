import { useEffect, useState, type FormEvent } from "react";
import { ASSET_CLASSES, PROJECTION_HORIZONS, type AssetClass, type ProjectionAssumptions } from "../../core";
import { projectionApi, type ProjectionReply } from "../api";
import { formatEur, formatEurInput, formatMonth, parseEur } from "../format";
import { ASSET_CLASS_LABELS } from "../labels";
import { errorText, FeedbackLine, type Feedback } from "./settings/feedback";
import { Figure } from "./SnapshotView";

/** 6.5 → "6,5" for a percent input. */
function formatNumberInput(value: number): string {
  return String(value).replace(".", ",");
}

/** "6,5" or "6.5" → 6.5; anything else → NaN (the core rejects it with a German message). */
function parseNumberInput(text: string): number {
  const trimmed = text.trim();
  return /^-?\d+([.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(",", ".")) : Number.NaN;
}

type FormState = {
  returns: Record<AssetClass, string>;
  /** Empty: the default (12-month average). */
  savings: string;
  horizonYears: ProjectionAssumptions["horizonYears"];
  spread: string;
};

function toForm(assumptions: ProjectionAssumptions): FormState {
  return {
    returns: Object.fromEntries(
      ASSET_CLASSES.map((c) => [c, formatNumberInput(assumptions.annualReturns[c])]),
    ) as Record<AssetClass, string>,
    savings: assumptions.monthlySavings === null ? "" : formatEurInput(assumptions.monthlySavings),
    horizonYears: assumptions.horizonYears,
    spread: formatNumberInput(assumptions.bandSpread),
  };
}

/** Prognose settings: expected return per Anlageklasse, monthly savings, horizon and band spread, with the result. */
export function ProjectionView() {
  const [reply, setReply] = useState<ProjectionReply | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    projectionApi.get().then((r) => {
      setReply(r);
      setForm(toForm(r.assumptions));
    });
  }, []);

  if (!reply || !form) return <main className="page" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const savings = form.savings.trim() === "" ? null : parseEur(form.savings);
    if (savings === null && form.savings.trim() !== "") {
      return setFeedback({ kind: "error", text: "Bitte einen gültigen Sparbetrag eingeben." });
    }
    // NaN goes over the wire as null; the core answers with the German message.
    const assumptions: ProjectionAssumptions = {
      annualReturns: Object.fromEntries(
        ASSET_CLASSES.map((c) => [c, parseNumberInput(form.returns[c])]),
      ) as ProjectionAssumptions["annualReturns"],
      monthlySavings: savings,
      horizonYears: form.horizonYears,
      bandSpread: parseNumberInput(form.spread),
    };
    try {
      const next = await projectionApi.save(assumptions);
      setReply(next);
      setForm(toForm(next.assumptions));
      setFeedback({ kind: "success", text: "Gespeichert." });
    } catch (e) {
      setFeedback({ kind: "error", text: errorText(e) });
    }
  }

  const { projection } = reply;
  const end = projection?.months.at(-1);
  const years = reply.assumptions.horizonYears;
  return (
    <main className="page">
      <h1>Prognose</h1>
      <p className="empty">
        Eine Schätzung, keine Vorhersage: jede Anlageklasse wächst Monat für Monat mit ihrer erwarteten Rendite, der
        Sparbetrag kommt jeden Monat als verfügbares Cash dazu, Gebundenes wird mit der Fälligkeit verfügbar.
      </p>
      {end && projection && (
        <>
          <div className="figures">
            <Figure label={`Erwartet in ${years} Jahren`} value={formatEur(end.netWorth)} />
            <Figure label="Optimistisch" value={formatEur(end.optimistic)} />
            <Figure label="Pessimistisch" value={formatEur(end.pessimistic)} />
          </div>
          <div className="figures">
            <Figure label="Davon verfügbar" value={formatEur(end.byLiquidity.available)} />
            <Figure label="Davon gebunden" value={formatEur(end.byLiquidity.locked)} />
          </div>
          <p className="empty">
            Stand {formatMonth(end.month)}, ausgehend von {formatMonth(projection.months[0]!.month)}.
          </p>
        </>
      )}
      {!projection && <p className="empty">Noch kein Monatsstand erfasst: die Prognose beginnt beim letzten Monatsstand.</p>}
      <form aria-label="Annahmen" onSubmit={submit}>
        <fieldset>
          <legend>Erwartete Rendite pro Jahr (%)</legend>
          <div className="profile-grid">
            {ASSET_CLASSES.map((c) => (
              <label key={c}>
                {`Erwartete Rendite ${ASSET_CLASS_LABELS[c]}`}
                <input
                  inputMode="decimal"
                  value={form.returns[c]}
                  onChange={(e) => setForm({ ...form, returns: { ...form.returns, [c]: e.target.value } })}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="profile-grid">
          <label>
            Monatlicher Sparbetrag
            <input
              inputMode="decimal"
              value={form.savings}
              placeholder={formatEurInput(projection?.defaultMonthlySavings ?? 0)}
              onChange={(e) => setForm({ ...form, savings: e.target.value })}
            />
            <small>
              Leer lassen für den Durchschnitt der letzten 12 Monate: {formatEur(projection?.defaultMonthlySavings ?? 0)}
            </small>
          </label>
          <label>
            Zeitraum
            <select
              aria-label="Zeitraum"
              value={form.horizonYears}
              onChange={(e) => setForm({ ...form, horizonYears: Number(e.target.value) as FormState["horizonYears"] })}
            >
              {PROJECTION_HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {h} Jahre
                </option>
              ))}
            </select>
          </label>
          <label>
            Bandbreite
            <input inputMode="decimal" value={form.spread} onChange={(e) => setForm({ ...form, spread: e.target.value })} />
            <small>Prozentpunkte über und unter jeder Rendite für das optimistische und pessimistische Band.</small>
          </label>
        </div>
        <FeedbackLine feedback={feedback} />
        <button type="submit">Speichern</button>
      </form>
    </main>
  );
}
