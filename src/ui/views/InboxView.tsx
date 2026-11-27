import { useEffect, useState } from "react";
import type { ClassifiedTransaction } from "../../core";
import { api, ApiError, categoriesApi, importApi } from "../api";
import { formatDate, formatEur } from "../format";
import { accountOptions, categoryOptions } from "../labels";
import { TransactionCategorySelect } from "./TransactionCategorySelect";

/** The Uncategorized inbox: every Transaction without a Category, sorted by picking one. */
export function InboxView() {
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [transactions, setTransactions] = useState<ClassifiedTransaction[] | null>(null);
  const [error, setError] = useState("");

  const reload = () => importApi.searchTransactions({ uncategorized: true }).then((r) => setTransactions(r.transactions));

  useEffect(() => {
    api.structure().then((r) => setAccounts(accountOptions(r.structure)));
    categoriesApi.list().then((r) => setCategories(categoryOptions(r.categories)));
    reload();
  }, []);

  async function categorize(transactionId: string, categoryId: string | null) {
    setError("");
    try {
      await categoriesApi.setTransactionCategory(transactionId, categoryId);
      await reload();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e.message);
    }
  }

  const accountLabel = (id: string) => accounts.find((a) => a.id === id)?.label ?? id;

  return (
    <main className="page">
      <h1>Nicht kategorisiert</h1>
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
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.bookingDate)}</td>
                  <td>{accountLabel(t.accountId)}</td>
                  <td>{t.counterpartyName}</td>
                  <td>
                    {t.purpose}
                    {t.paymentReference && <div className="meta">{t.paymentReference}</div>}
                  </td>
                  <td className="amount">{formatEur(t.amountCents)}</td>
                  <td>
                    <TransactionCategorySelect transaction={t} options={categories} onChange={(c) => categorize(t.id, c)} />
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
