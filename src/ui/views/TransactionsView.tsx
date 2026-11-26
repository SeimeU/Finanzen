import { useEffect, useState } from "react";
import type { Transaction } from "../../core";
import { api, importApi } from "../api";
import { formatDate, formatEur } from "../format";
import { accountOptions } from "../labels";

/** The Transaction list (Umsätze), filtered by Konto, date range and text. */
export function TransactionsView() {
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  useEffect(() => {
    api.structure().then((r) => setAccounts(accountOptions(r.structure)));
  }, []);

  useEffect(() => {
    let current = true;
    importApi
      .searchTransactions({ accountId: accountId || null, from: from || null, to: to || null, text })
      .then((r) => current && setTransactions(r.transactions));
    return () => {
      current = false;
    };
  }, [accountId, from, to, text]);

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
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td>{formatDate(t.bookingDate)}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
