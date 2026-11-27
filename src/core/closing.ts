import { isYearMonth, type Account, type Holding, type WealthDocument, type YearMonth } from "./document";
import { fail, type Result } from "./result";

/**
 * Closing and starting Holdings and Accounts over time. A closed one contributes nothing
 * from its closing month on and is not carried forward; its history before stays. A Holding
 * with a starting month has no value before it. Every month query filters with
 * holdingIsActive / accountIsOpen; the commands keep recorded values inside the open period.
 */

/** Whether `holding` (on its own, ignoring its Account) appears in `month`. */
export function holdingIsActive(holding: Holding, month: YearMonth): boolean {
  return (holding.startMonth === null || month >= holding.startMonth) && (holding.closingMonth === null || month < holding.closingMonth);
}

/** Whether `account` appears in `month`. */
export function accountIsOpen(account: Account, month: YearMonth): boolean {
  return account.closingMonth === null || month < account.closingMonth;
}

type Updated = Result<{ document: WealthDocument }>;

/** Closes the Holding as of `month` (e.g. sold completely); null reopens it. */
export function closeHolding(document: WealthDocument, input: { holdingId: string; month: YearMonth | null }): Updated {
  const holding = document.holdings.find((h) => h.id === input.holdingId);
  if (!holding) return fail("holding-not-found", "Die Position gibt es nicht.");
  if (input.month !== null && !isYearMonth(input.month)) return fail("invalid-month", "Bitte einen gültigen Monat wählen.");
  const closed: Holding = { ...holding, closingMonth: input.month };
  if (!startsBeforeClosing(closed)) return fail("closing-not-after-start", CLOSING_NOT_AFTER_START);
  if (recordedOutside(document, closed)) {
    return fail(
      "values-after-closing",
      "Für diese Position gibt es ab diesem Monat schon Werte. Sie kann erst danach geschlossen werden.",
    );
  }
  return withHolding(document, closed);
}

/** Sets the first month the Holding can have a value (e.g. when it was bought); null: from the start. */
export function setHoldingStart(document: WealthDocument, input: { holdingId: string; month: YearMonth | null }): Updated {
  const holding = document.holdings.find((h) => h.id === input.holdingId);
  if (!holding) return fail("holding-not-found", "Die Position gibt es nicht.");
  if (input.month !== null && !isYearMonth(input.month)) return fail("invalid-month", "Bitte einen gültigen Monat wählen.");
  const started: Holding = { ...holding, startMonth: input.month };
  if (!startsBeforeClosing(started)) return fail("closing-not-after-start", CLOSING_NOT_AFTER_START);
  if (recordedOutside(document, started)) {
    return fail(
      "values-before-start",
      "Für diese Position gibt es schon Werte vor diesem Monat. Sie muss spätestens dann beginnen.",
    );
  }
  return withHolding(document, started);
}

/** Closes the Account as of `month` (e.g. a depot moved to another broker); null reopens it. */
export function closeAccount(document: WealthDocument, input: { accountId: string; month: YearMonth | null }): Updated {
  const account = document.accounts.find((a) => a.id === input.accountId);
  if (!account) return fail("account-not-found", "Das Konto gibt es nicht.");
  if (input.month !== null && !isYearMonth(input.month)) return fail("invalid-month", "Bitte einen gültigen Monat wählen.");
  const closed: Account = { ...account, closingMonth: input.month };
  const holdingIds = new Set(document.holdings.filter((h) => h.accountId === account.id).map((h) => h.id));
  const recordedAfter = document.snapshots.some(
    (s) =>
      !accountIsOpen(closed, s.month) &&
      (s.accountValues.some((v) => v.accountId === account.id) || s.holdingValues.some((v) => holdingIds.has(v.holdingId))),
  );
  if (recordedAfter) {
    return fail(
      "values-after-closing",
      "Für dieses Konto gibt es ab diesem Monat schon Werte. Es kann erst danach geschlossen werden.",
    );
  }
  return {
    ok: true,
    document: { ...document, accounts: document.accounts.map((a) => (a.id === account.id ? closed : a)) },
  };
}

const CLOSING_NOT_AFTER_START = "Eine Position kann erst nach ihrem Beginn geschlossen werden.";

function startsBeforeClosing(holding: Holding): boolean {
  return holding.startMonth === null || holding.closingMonth === null || holding.startMonth < holding.closingMonth;
}

/** Whether a Snapshot has a value for `holding` in a month it would not be active in. */
function recordedOutside(document: WealthDocument, holding: Holding): boolean {
  return document.snapshots.some(
    (s) => !holdingIsActive(holding, s.month) && s.holdingValues.some((v) => v.holdingId === holding.id),
  );
}

function withHolding(document: WealthDocument, holding: Holding): Updated {
  return { ok: true, document: { ...document, holdings: document.holdings.map((h) => (h.id === holding.id ? holding : h)) } };
}
