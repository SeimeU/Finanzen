import { classifyTransactions, type ClassifiedTransaction } from "./classification";
import type { WealthDocument } from "./document";

export type TransactionFilter = {
  accountId?: string | null;
  /** Inclusive "YYYY-MM-DD" bounds on the booking date. */
  from?: string | null;
  to?: string | null;
  /** Case-insensitive; matches counterparty, IBAN, payment reference or purpose. */
  text?: string | null;
  /** Only Transactions without a Category (the Uncategorized inbox). */
  uncategorized?: boolean | null;
};

/** Transactions matching every given filter, newest booking date first, each with its classification. */
export function searchTransactions(document: WealthDocument, filter: TransactionFilter = {}): ClassifiedTransaction[] {
  const words = (filter.text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return classifyTransactions(document, document.transactions)
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => {
      if (filter.accountId && t.accountId !== filter.accountId) return false;
      if (filter.from && t.bookingDate < filter.from) return false;
      if (filter.to && t.bookingDate > filter.to) return false;
      if (filter.uncategorized && t.classification.kind !== "uncategorized") return false;
      if (words.length === 0) return true;
      const haystack = [t.counterpartyName, t.counterpartyIban ?? "", t.paymentReference, t.purpose].join(" ").toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .sort((a, b) => (a.t.bookingDate === b.t.bookingDate ? b.index - a.index : a.t.bookingDate < b.t.bookingDate ? 1 : -1))
    .map(({ t }) => t);
}

/** The Uncategorized inbox: every Transaction without a Category, newest first. */
export function uncategorizedTransactions(document: WealthDocument): ClassifiedTransaction[] {
  return searchTransactions(document, { uncategorized: true });
}
