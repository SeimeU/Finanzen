import { classifyTransactions, type ClassifiedTransaction } from "./classification";
import type { WealthDocument } from "./document";
import { fail, type Result } from "./result";

/** Equal and opposite amounts on two own Accounts at most this many days apart are suggested. */
const MAX_DAYS_APART = 3;

/** A likely Transfer the owner hasn't decided on: money out of one Account, the same amount into another. */
export type TransferSuggestion = { outgoing: ClassifiedTransaction; incoming: ClassifiedTransaction };

type PairInput = { outgoingId: string; incomingId: string };

/**
 * Amount-matching suggestions, newest first. Only Transactions not classified otherwise
 * take part: no Transfer or Trade, no manual or bank Category, not unmarked by hand
 * (a Category from a Categorization rule doesn't stop a suggestion). Each Transaction is in
 * at most one suggestion; the pairs closest in date are taken first. Rejected pairs are left out.
 */
export function transferSuggestions(document: WealthDocument): TransferSuggestion[] {
  const rejected = new Set(document.rejectedTransferSuggestions.map(([a, b]) => pairKey(a, b)));
  const candidates = classifyTransactions(document, document.transactions).filter(
    (t) =>
      t.amountCents !== 0 &&
      t.transferMark !== false &&
      (t.classification.kind === "uncategorized" ||
        (t.classification.kind === "category" && t.classification.source !== "manual" && t.classification.source !== "bank")),
  );
  const incomingByAmount = new Map<number, ClassifiedTransaction[]>();
  for (const t of candidates) {
    if (t.amountCents > 0) incomingByAmount.set(t.amountCents, [...(incomingByAmount.get(t.amountCents) ?? []), t]);
  }
  const pairs: (TransferSuggestion & { gap: number })[] = [];
  for (const outgoing of candidates) {
    if (outgoing.amountCents > 0) continue;
    for (const incoming of incomingByAmount.get(-outgoing.amountCents) ?? []) {
      const gap = Math.abs(dayNumber(incoming.bookingDate) - dayNumber(outgoing.bookingDate));
      if (incoming.accountId === outgoing.accountId || gap > MAX_DAYS_APART) continue;
      if (rejected.has(pairKey(outgoing.id, incoming.id))) continue;
      pairs.push({ outgoing, incoming, gap });
    }
  }
  pairs.sort((a, b) => a.gap - b.gap || compare(a.outgoing.bookingDate, b.outgoing.bookingDate) || compare(a.outgoing.id, b.outgoing.id));
  const used = new Set<string>();
  const chosen: TransferSuggestion[] = [];
  for (const { outgoing, incoming } of pairs) {
    if (used.has(outgoing.id) || used.has(incoming.id)) continue;
    used.add(outgoing.id).add(incoming.id);
    chosen.push({ outgoing, incoming });
  }
  return chosen.sort((a, b) => compare(b.outgoing.bookingDate, a.outgoing.bookingDate));
}

/** Accepts a current suggestion: both Transactions are marked as Transfers, as a pair. */
export function acceptTransferSuggestion(document: WealthDocument, input: PairInput): Result<{ document: WealthDocument }> {
  if (!isSuggested(document, input)) return suggestionNotFound();
  const ids = new Set([input.outgoingId, input.incomingId]);
  return {
    ok: true,
    document: {
      ...document,
      transactions: document.transactions.map((t) =>
        ids.has(t.id)
          ? {
              ...t,
              transferMark: true,
              manualCategoryId: null,
              transferPartnerId: t.id === input.outgoingId ? input.incomingId : input.outgoingId,
            }
          : t,
      ),
    },
  };
}

/** Rejects a current suggestion: both stay ordinary Transactions and the pair is not suggested again. */
export function rejectTransferSuggestion(document: WealthDocument, input: PairInput): Result<{ document: WealthDocument }> {
  if (!isSuggested(document, input)) return suggestionNotFound();
  return {
    ok: true,
    document: {
      ...document,
      rejectedTransferSuggestions: [...document.rejectedTransferSuggestions, [input.outgoingId, input.incomingId]],
    },
  };
}

function isSuggested(document: WealthDocument, input: PairInput): boolean {
  return transferSuggestions(document).some((s) => s.outgoing.id === input.outgoingId && s.incoming.id === input.incomingId);
}

function suggestionNotFound() {
  return fail("suggestion-not-found", "Dieser Vorschlag ist nicht mehr aktuell. Bitte die Seite neu laden.");
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** "YYYY-MM-DD" → days since the epoch. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Transfers (Umbuchungen): money moved between two of the owner's own Accounts.
 * Detection itself is part of the classification precedence (./classification.ts):
 * a mark by hand, then the counterparty IBAN. This module has the owner's commands
 * and the amount-matching suggestions.
 */

/**
 * Marks (true) or unmarks (false) a Transaction as a Transfer by hand, overriding detection;
 * null leaves it to detection again. Marking clears a manual Category. Unmarking (false or
 * null) one side of an accepted pair does the same to its counterpart and dissolves the pair.
 */
export function setTransfer(
  document: WealthDocument,
  input: { transactionId: string; transfer: boolean | null },
): Result<{ document: WealthDocument }> {
  if (!document.transactions.some((t) => t.id === input.transactionId)) {
    return fail("transaction-not-found", "Diesen Umsatz gibt es nicht.");
  }
  const mark = input.transfer === true || input.transfer === false ? input.transfer : null;
  const partnerId = mark === true ? null : document.transactions.find((t) => t.id === input.transactionId)!.transferPartnerId;
  return {
    ok: true,
    document: {
      ...document,
      transactions: document.transactions.map((t) => {
        if (t.id === input.transactionId) {
          return {
            ...t,
            transferMark: mark,
            manualCategoryId: mark === true ? null : t.manualCategoryId,
            transferPartnerId: mark === true ? t.transferPartnerId : null,
          };
        }
        return t.id === partnerId ? { ...t, transferMark: mark, transferPartnerId: null } : t;
      }),
    },
  };
}
