import { useEffect, useState } from "react";
import type { ClassifiedTransaction, RuleCondition, RuleInput } from "../../core";
import { api, ApiError, categoriesApi, importApi, rulesApi } from "../api";
import { formatDate, formatEur } from "../format";
import { accountOptions, categoryOptions } from "../labels";
import { RuleForm } from "./RuleForm";
import { TransactionCategorySelect } from "./TransactionCategorySelect";

/**
 * The Uncategorized inbox: every Transaction without a Category, sorted by picking one
 * or by creating a Categorization rule from a Transaction (which then sorts every match).
 */
export function InboxView() {
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [transactions, setTransactions] = useState<ClassifiedTransaction[] | null>(null);
  const [ruleFrom, setRuleFrom] = useState<ClassifiedTransaction | null>(null);
  const [error, setError] = useState("");

  const reload = () => importApi.searchTransactions({ uncategorized: true }).then((r) => setTransactions(r.transactions));

  useEffect(() => {
    api.structure().then((r) => setAccounts(accountOptions(r.structure)));
    categoriesApi.list().then((r) => setCategories(categoryOptions(r.categories)));
    reload();
  }, []);

  async function attempt(action: () => Promise<unknown>): Promise<boolean> {
    setError("");
    try {
      await action();
      await reload();
      return true;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e.message);
      return false;
    }
  }

  async function createRule(input: RuleInput): Promise<boolean> {
    const saved = await attempt(() => rulesApi.create(input));
    if (saved) setRuleFrom(null);
    return saved;
  }

  const accountLabel = (id: string) => accounts.find((a) => a.id === id)?.label ?? id;

  return (
    <main className="page">
      <h1>Nicht kategorisiert</h1>
      {ruleFrom && (
        <section aria-label="Regel aus Umsatz">
          <h2>Regel aus „{ruleFrom.purpose || ruleFrom.counterpartyName}“</h2>
          <RuleForm
            key={ruleFrom.id}
            name="Neue Regel"
            submitLabel="Regel anlegen"
            initial={{ condition: conditionFrom(ruleFrom), categoryId: "", applyToExisting: true }}
            categories={categories}
            onSubmit={createRule}
            onCancel={() => setRuleFrom(null)}
          />
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {transactions !== null && transactions.length === 0 && <p className="empty">Alle Umsätze haben eine Kategorie.</p>}
      {transactions !== null && transactions.length > 0 && (
        <>
          <p className="meta">{transactions.length === 1 ? "1 Umsatz" : `${transactions.length} Umsätze`} ohne Kategorie.</p>
          <table aria-label="Nicht kategorisiert" className="transactions">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Konto</th>
                <th>Gegenüber</th>
                <th>Verwendungszweck</th>
                <th className="amount">Betrag</th>
                <th>Kategorie</th>
                <th>Regel</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.date)}</td>
                  <td>{accountLabel(t.accountId)}</td>
                  <td>{t.counterpartyName}</td>
                  <td>
                    {t.purpose}
                    {t.paymentReference && <div className="meta">{t.paymentReference}</div>}
                  </td>
                  <td className="amount">{formatEur(t.amountCents)}</td>
                  <td>
                    <TransactionCategorySelect
                      transaction={t}
                      options={categories}
                      onChange={(c) => attempt(() => categoriesApi.setTransactionCategory(t.id, c))}
                    />
                  </td>
                  <td>
                    <button type="button" className="secondary" onClick={() => setRuleFrom(t)}>
                      Regel erstellen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}

/** The suggested condition for a rule made from a Transaction: its counterparty, else its purpose, else its amount. */
function conditionFrom(t: ClassifiedTransaction): RuleCondition {
  if (t.counterpartyName.trim()) return { field: "counterparty", operator: "contains", text: t.counterpartyName };
  if (t.purpose.trim()) return { field: "purpose", operator: "contains", text: t.purpose };
  return { field: "amount", operator: "equals", amountCents: t.amountCents };
}
