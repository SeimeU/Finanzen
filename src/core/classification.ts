import type { Category, CategoryKind, Transaction, TransactionOrigin, WealthDocument } from "./document";
import { fail, type Result } from "./result";

/**
 * How a Transaction counts. Computed at query time from the document, never stored,
 * so editing Categories is reflected everywhere at once. Only the match of the
 * Categorization rules is stored (rules apply on import and on an explicit re-apply).
 * `cashFlow` says how spending and income queries count it: Trades and Transfers
 * are "excluded"; Uncategorized is "unknown".
 */
export type TransactionClassification =
  | { kind: "category"; categoryId: string; source: CategorySource; cashFlow: CategoryKind }
  | { kind: "trade"; direction: "buy" | "sell"; cashFlow: "excluded" }
  | { kind: "transfer"; source: TransferSource; cashFlow: "excluded" }
  | { kind: "uncategorized"; cashFlow: "unknown" };

/** Who put the Transaction in its Category. */
export type CategorySource = "manual" | "bank" | "rule";

/**
 * Why a Transaction is a Transfer (Umbuchung): its counterparty IBAN is another of the
 * owner's Accounts ("iban"), or the owner marked it by hand or accepted a suggestion ("manual").
 */
export type TransferSource = "iban" | "manual";

export type ClassifiedTransaction = Transaction & { classification: TransactionClassification };

/** What one precedence step decides; null passes the Transaction on to the next step. */
type Proposal =
  | { kind: "category"; categoryId: string; source: CategorySource }
  | { kind: "trade"; direction: "buy" | "sell" }
  | { kind: "transfer"; source: TransferSource };

type Context = {
  categories: Map<string, Category>;
  /** importId → the Import profile id the Transaction was read with. */
  profileOf: Map<string, string>;
  /** Normalized IBAN → the owner's Account with that IBAN. */
  ownIbans: Map<string, string>;
};

type Classifier = (transaction: Transaction, context: Context) => Proposal | null;

/**
 * THE categorization precedence (spec): manual Category → manual Transfer mark →
 * bank classification (Trades, interest, tax) → IBAN Transfer detection → first
 * matching Categorization rule → Uncategorized. The first step that returns a
 * proposal wins. A Category proposal naming a Category that no longer exists is
 * ignored, so the Transaction falls through to the next step (in the end, the inbox).
 */
const PRECEDENCE: Classifier[] = [
  manualCategory,
  markedTransfer,
  bankClassification,
  ibanTransfer,
  categorizationRule,
];

/** Classifies the given Transactions of the document (in the given order). */
export function classifyTransactions(document: WealthDocument, transactions: Transaction[]): ClassifiedTransaction[] {
  const context: Context = {
    categories: new Map(document.categories.map((c) => [c.id, c])),
    profileOf: new Map(document.imports.map((i) => [i.id, i.profileId])),
    ownIbans: new Map(document.accounts.flatMap((a) => (a.iban ? [[a.iban, a.id] as const] : []))),
  };
  return transactions.map((t) => ({ ...t, classification: classify(t, context) }));
}

function classify(transaction: Transaction, context: Context): TransactionClassification {
  for (const step of PRECEDENCE) {
    const proposal = step(transaction, context);
    if (!proposal) continue;
    if (proposal.kind === "trade") return { kind: "trade", direction: proposal.direction, cashFlow: "excluded" };
    if (proposal.kind === "transfer") return { kind: "transfer", source: proposal.source, cashFlow: "excluded" };
    const category = context.categories.get(proposal.categoryId);
    if (category) return { ...proposal, cashFlow: category.kind };
  }
  return { kind: "uncategorized", cashFlow: "unknown" };
}

function manualCategory(transaction: Transaction): Proposal | null {
  return transaction.manualCategoryId
    ? { kind: "category", categoryId: transaction.manualCategoryId, source: "manual" }
    : null;
}

/** Marked as a Transfer by hand (or by accepting a suggestion): overrides the bank and IBAN detection. */
function markedTransfer(transaction: Transaction): Proposal | null {
  return transaction.transferMark === true ? { kind: "transfer", source: "manual" } : null;
}

/** A Transfer when the counterparty IBAN is another of the owner's Accounts, unless the owner unmarked it. */
function ibanTransfer(transaction: Transaction, context: Context): Proposal | null {
  if (transaction.transferMark === false) return null;
  const account = transaction.counterpartyIban ? context.ownIbans.get(transaction.counterpartyIban) : undefined;
  return account && account !== transaction.accountId ? { kind: "transfer", source: "iban" } : null;
}

/**
 * The Category the first matching Categorization rule gave it, stored on import or
 * on the last re-apply (./rules.ts).
 */
function categorizationRule(transaction: Transaction): Proposal | null {
  return transaction.ruleCategoryId ? { kind: "category", categoryId: transaction.ruleCategoryId, source: "rule" } : null;
}

/**
 * Classification from the bank's own fields (`origin`), keyed by the Import profile
 * the Transaction was read with. Profiles without an entry fall through.
 */
const BANK_CLASSIFIERS: Record<string, (origin: TransactionOrigin, amountCents: number) => Proposal | null> = {
  "trade-republic": tradeRepublicClassifier,
};

function bankClassification(transaction: Transaction, context: Context): Proposal | null {
  const classifier = BANK_CLASSIFIERS[context.profileOf.get(transaction.importId) ?? ""];
  return classifier ? classifier(transaction.origin, transaction.amountCents) : null;
}

/**
 * Trade Republic (spec "Trade Republic mapping"): category TRADING → Trade (Kauf when
 * cash goes out, Verkauf when it comes in); INTEREST_PAYMENT and DISTRIBUTION →
 * Kapitalerträge; any *TAX* type → Steuern. A *_CANCELLED row keeps its type's Category.
 * Transfer types, card payments and unknown types fall through (to rules, then the inbox).
 */
function tradeRepublicClassifier(origin: TransactionOrigin, amountCents: number): Proposal | null {
  if (origin.category === "TRADING") return { kind: "trade", direction: amountCents < 0 ? "buy" : "sell" };
  const type = (origin.type ?? "").replace(/_CANCELLED$/, "");
  const bank = (categoryId: string): Proposal => ({ kind: "category", categoryId, source: "bank" });
  if (type === "INTEREST_PAYMENT") return bank("kapitalertraege-zinsen");
  if (type === "DISTRIBUTION") return bank("kapitalertraege-ausschuettungen");
  if (/(^|_)TAX(_|$)/.test(type)) return bank("steuern-kapitalertragsteuer");
  return null;
}

/**
 * Sets (or, with categoryId null, clears) the Category the owner chose by hand.
 * Setting one clears a Transfer mark (true), so the last choice made by hand wins.
 */
export function setTransactionCategory(
  document: WealthDocument,
  input: { transactionId: string; categoryId: string | null },
): Result<{ document: WealthDocument }> {
  if (!document.transactions.some((t) => t.id === input.transactionId)) {
    return fail("transaction-not-found", "Diesen Umsatz gibt es nicht.");
  }
  const categoryId = input.categoryId ?? null;
  if (categoryId !== null && !document.categories.some((c) => c.id === categoryId)) {
    return fail("category-not-found", "Diese Kategorie gibt es nicht.");
  }
  return {
    ok: true,
    document: {
      ...document,
      transactions: document.transactions.map((t) =>
        t.id === input.transactionId
          ? { ...t, manualCategoryId: categoryId, transferMark: categoryId !== null && t.transferMark === true ? null : t.transferMark }
          : t,
      ),
    },
  };
}
