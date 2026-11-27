import { useEffect, useState } from "react";
import type { CategorizationRule } from "../../core";
import { ApiError, categoriesApi, rulesApi } from "../api";
import { categoryOptions, formatRuleCondition } from "../labels";
import { RuleForm } from "./RuleForm";

/**
 * The rules editor (Regeln): rules in the order they are tried (the first match wins),
 * a form for a new one, and re-applying all rules to the Transactions already imported.
 */
export function RulesView() {
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    rulesApi.list().then((r) => setRules(r.rules));
    categoriesApi.list().then((r) => setCategories(categoryOptions(r.categories)));
  }, []);

  /** Runs a rule command; returns whether it succeeded. */
  async function run(action: () => Promise<{ rules: CategorizationRule[]; changedCount?: number }>): Promise<boolean> {
    setError("");
    setStatus("");
    try {
      const result = await action();
      setRules(result.rules);
      if (result.changedCount !== undefined) {
        setStatus(`${result.changedCount} ${result.changedCount === 1 ? "Umsatz" : "Umsätze"} neu kategorisiert.`);
      }
      return true;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e.message);
      return false;
    }
  }

  const categoryLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? "?";

  return (
    <main className="page">
      <h1>Regeln</h1>
      <p className="meta">
        Regeln ordnen importierte Umsätze automatisch einer Kategorie zu. Die erste passende Regel gilt. Eine von Hand
        gesetzte Kategorie, Käufe und Verkäufe ändern sie nie.
      </p>
      <RuleForm name="Neue Regel" submitLabel="Regel anlegen" categories={categories} onSubmit={(input) => run(() => rulesApi.create(input))} />
      {error && <p role="alert">{error}</p>}
      {rules.length === 0 ? (
        <p className="empty">Noch keine Regeln.</p>
      ) : (
        <ol aria-label="Regeln" className="rules">
          {rules.map((rule, index) => (
            <li key={rule.id}>
              {editingId === rule.id ? (
                <RuleForm
                  name="Regel bearbeiten"
                  submitLabel="Speichern"
                  initial={{ condition: rule.condition, categoryId: rule.categoryId, applyToExisting: false }}
                  categories={categories}
                  onSubmit={async (input) => {
                    const saved = await run(() => rulesApi.update({ id: rule.id, ...input }));
                    if (saved) setEditingId(null);
                    return saved;
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="row rule">
                  <span>
                    {formatRuleCondition(rule.condition)} → {categoryLabel(rule.categoryId)}
                  </span>
                  <button type="button" className="secondary" disabled={index === 0} onClick={() => run(() => rulesApi.move(rule.id, "up"))}>
                    Nach oben
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={index === rules.length - 1}
                    onClick={() => run(() => rulesApi.move(rule.id, "down"))}
                  >
                    Nach unten
                  </button>
                  <button type="button" className="secondary" onClick={() => setEditingId(rule.id)}>
                    Bearbeiten
                  </button>
                  <button type="button" className="secondary" onClick={() => run(() => rulesApi.remove(rule.id))}>
                    Löschen
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <section>
        <button type="button" onClick={() => run(() => rulesApi.reapply())}>
          Regeln erneut anwenden
        </button>
        <p className="meta">Wendet alle Regeln in dieser Reihenfolge auf alle bisher importierten Umsätze an.</p>
        {status && <p role="status">{status}</p>}
      </section>
    </main>
  );
}
