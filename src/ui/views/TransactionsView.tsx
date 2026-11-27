import { useEffect, useState } from "react";
import type { ClassifiedTransaction } from "../../core";
import { api, ApiError, categoriesApi, importApi, transfersApi } from "../api";
import { formatDate, formatEur } from "../format";
import { accountOptions, categoryOptions } from "../labels";
import { TransactionCategorySelect } from "./TransactionCategorySelect";

/**
 * The Transaction list (Umsätze), filtered by Konto, date range and text; each row's Kategorie
 * can be set by hand, and it can be marked or unmarked as an Umbuchung.
 */
export function TransactionsView() {
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [transactions, setTransactions] = useState<ClassifiedTransaction[] | null>(null);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api.structure().then((r) => setAccounts(accountOptions(r.structure)));
    categoriesApi.list().then((r) => setCategories(categoryOptions(r.categories)));
  }, []);

  useEffect(() => {
    let current = true;
    importApi
      .searchTransactions({ accountId: accountId || null, from: from || null, to: to || null, text })
      .then((r) => current && setTransactions(r.transactions));
    return () => {
      current = false;
    };
  }, [accountId, from, to, text, version]);

  async function categorize(transactionId: string, categoryId: string | null) {
    setError("");
    try {
      await categoriesApi.setTransactionCategory(transactionId, categoryId);
      setVersion((v) => v + 1);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e.message);
    }
  }

  /** Checking marks the Transaction as an Umbuchung by hand; unchecking unmarks it, also against IBAN detection. */
  async function markTransfer(transactionId: string, transfer: boolean) {
    setError("");
    try {
      await transfersApi.setTransfer(transactionId, transfer);
      setVersion((v) => v + 1);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e.message);
    }
  }

  const accountLabel = (id: string) => accounts.find((a) => a.id === id)?.label ?? id;

  return (
    <main className="page">
      <h1>Umsätze</h1>
      <div className="row filters">
        <label>
          Konto
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Alle Konten</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Von
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Bis
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Suche
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {transactions !== null && transactions.length === 0 && <p className="empty">Keine Umsätze gefunden.</p>}
      {transactions !== null && transactions.length > 0 && (
        <table aria-label="Umsätze" className="transactions">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Konto</th>
              <th>Gegenüber</th>
              <th>Verwendungszweck</th>
              <th className="amount">Betrag</th>
              <th>Kategorie</th>
              <th>Umbuchung</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td>{formatDate(t.date)}</td>
                <td>{accountLabel(t.accountId)}</td>
                <td>
                  {t.counterpartyName}
                  {t.counterpartyIban && <div className="meta">{t.counterpartyIban}</div>}
                </td>
                <td>
                  {t.purpose}
                  {t.paymentReference && <div className="meta">{t.paymentReference}</div>}
                </td>
                <td className="amount">{formatEur(t.amountCents)}</td>
                <td>
                  <TransactionCategorySelect transaction={t} options={categories} onChange={(c) => categorize(t.id, c)} />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label="Umbuchung"
                    checked={t.classification.kind === "transfer"}
                    onChange={(e) => markTransfer(t.id, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
