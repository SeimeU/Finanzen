import {
  ASSET_CLASSES,
  LIQUIDITIES,
  type Account,
  type Classification,
  type Holding,
  type Institution,
  type WealthDocument,
  type YearMonth,
  isYearMonth,
} from "./document";
import { setHoldingStart } from "./closing";
import { fail, type Result } from "./result";

type Created = Result<{ document: WealthDocument; id: string }>;

export type HoldingInput = { accountId: string; name: string; classification: Classification };

/** startMonth: the first month the Holding can have a value (e.g. when it was bought); omitted or null: from the start. */
export type NewHoldingInput = HoldingInput & { startMonth?: YearMonth | null };

export type AccountInput = {
  institutionId: string;
  name: string;
  iban?: string | null;
  isDebt?: boolean;
  defaultClassification: Classification;
};

export function createInstitution(document: WealthDocument, input: { name: string }): Created {
  const name = validName(input.name);
  if (!name.ok) return name;
  const id = nextId(document, "i");
  const institution: Institution = { id, name: name.value };
  return { ok: true, id, document: { ...document, institutions: [...document.institutions, institution] } };
}

export function createAccount(document: WealthDocument, input: AccountInput): Created {
  const account = validAccount(document, "", input);
  if (!account.ok) return account;
  const id = nextId(document, "a");
  return {
    ok: true,
    id,
    document: { ...document, accounts: [...document.accounts, { ...account.value, id, perHoldingFrom: null, closingMonth: null }] },
  };
}

export function createHolding(document: WealthDocument, input: NewHoldingInput): Created {
  const holding = validHolding(document, "", input);
  if (!holding.ok) return holding;
  const startMonth = input.startMonth ?? null;
  if (startMonth !== null && !isYearMonth(startMonth)) return fail("invalid-month", "Bitte einen gültigen Monat wählen.");
  const id = nextId(document, "h");
  return {
    ok: true,
    id,
    document: { ...document, holdings: [...document.holdings, { ...holding.value, id, startMonth, closingMonth: null }] },
  };
}

type Updated = Result<{ document: WealthDocument }>;

export function updateInstitution(document: WealthDocument, input: { id: string; name: string }): Updated {
  if (!document.institutions.some((i) => i.id === input.id)) {
    return fail("institution-not-found", "Das Institut gibt es nicht.");
  }
  const name = validName(input.name);
  if (!name.ok) return name;
  return {
    ok: true,
    document: {
      ...document,
      institutions: document.institutions.map((i) => (i.id === input.id ? { ...i, name: name.value } : i)),
    },
  };
}

/** Replaces the Account's editable fields; institutionId defaults to its current Institution. */
export function updateAccount(
  document: WealthDocument,
  input: { id: string } & Omit<AccountInput, "institutionId"> & { institutionId?: string },
): Updated {
  const existing = document.accounts.find((a) => a.id === input.id);
  if (!existing) return fail("account-not-found", "Das Konto gibt es nicht.");
  const account = validAccount(document, input.id, { ...input, institutionId: input.institutionId ?? existing.institutionId });
  if (!account.ok) return account;
  return {
    ok: true,
    document: {
      ...document,
      accounts: document.accounts.map((a) => (a.id === input.id ? { ...account.value, perHoldingFrom: a.perHoldingFrom, closingMonth: a.closingMonth } : a)),
    },
  };
}

/**
 * Replaces the Holding's name and classification; it stays in its Account.
 * startMonth, if given, is set as setHoldingStart does (left out: unchanged).
 */
export function updateHolding(
  document: WealthDocument,
  input: { id: string; name: string; classification: Classification; startMonth?: YearMonth | null },
): Updated {
  const existing = document.holdings.find((h) => h.id === input.id);
  if (!existing) return fail("holding-not-found", "Die Position gibt es nicht.");
  const holding = validHolding(document, input.id, { ...input, accountId: existing.accountId });
  if (!holding.ok) return holding;
  const updated: WealthDocument = {
    ...document,
    holdings: document.holdings.map((h) =>
      h.id === input.id ? { ...holding.value, startMonth: h.startMonth, closingMonth: h.closingMonth } : h,
    ),
  };
  if (input.startMonth === undefined) return { ok: true, document: updated };
  return setHoldingStart(updated, { holdingId: input.id, month: input.startMonth });
}

/**
 * How a value recorded for a Holding or an Account counts: under which classification,
 * and with which sign (−1 on a debt Account). Queries over Snapshots must resolve every
 * value through these at query time, so edits reach all months, history included.
 */
export type Valuation = { classification: Classification; sign: 1 | -1 };

export function valuationOfHolding(document: WealthDocument, holdingId: string): Valuation {
  const holding = document.holdings.find((h) => h.id === holdingId);
  if (!holding) throw new Error(`unknown Holding ${holdingId}`);
  const account = document.accounts.find((a) => a.id === holding.accountId)!;
  return { classification: holding.classification, sign: account.isDebt ? -1 : 1 };
}

export function valuationOfAccount(document: WealthDocument, accountId: string): Valuation {
  const account = document.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error(`unknown Account ${accountId}`);
  return { classification: account.defaultClassification, sign: account.isDebt ? -1 : 1 };
}

export type HoldingView = Omit<Holding, "accountId">;
/** perHoldingFrom is left out: the Monatsstand form (snapshotForm) shows and changes it. */
export type AccountView = Omit<Account, "institutionId" | "perHoldingFrom"> & { holdings: HoldingView[] };
export type InstitutionView = Institution & { accounts: AccountView[] };

/** Institutions → Accounts → Holdings, in creation order. */
export function listStructure(document: WealthDocument): InstitutionView[] {
  return document.institutions.map((institution) => ({
    ...institution,
    accounts: document.accounts
      .filter((a) => a.institutionId === institution.id)
      .map(({ institutionId: _, perHoldingFrom: __, ...account }) => ({
        ...account,
        holdings: document.holdings
          .filter((h) => h.accountId === account.id)
          .map(({ accountId: _, ...holding }) => holding),
      })),
  }));
}

// --- validation ---

type Valid<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

function validName(raw: unknown): Valid<string> {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return fail("name-required", "Bitte einen Namen eingeben.");
  return { ok: true, value: name };
}

function validAccount(
  document: WealthDocument,
  id: string,
  input: AccountInput,
): Valid<Omit<Account, "perHoldingFrom" | "closingMonth">> {
  if (!document.institutions.some((i) => i.id === input.institutionId)) {
    return fail("institution-not-found", "Das Institut gibt es nicht.");
  }
  const name = validName(input.name);
  if (!name.ok) return name;
  const iban = validIban(input.iban);
  if (!iban.ok) return iban;
  const classification = validClassification(input.defaultClassification);
  if (!classification.ok) return classification;
  return {
    ok: true,
    value: {
      id,
      institutionId: input.institutionId,
      name: name.value,
      iban: iban.value,
      isDebt: input.isDebt === true,
      defaultClassification: classification.value,
    },
  };
}

function validIban(raw: unknown): Valid<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const iban = String(raw).replace(/\s+/g, "").toUpperCase();
  if (iban === "") return { ok: true, value: null };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || ibanChecksum(iban) !== 1) {
    return fail("invalid-iban", "Die IBAN ist ungültig. Bitte prüfen.");
  }
  return { ok: true, value: iban };
}

/** ISO 13616 check: move the first four characters to the end, letters to numbers, mod 97. */
function ibanChecksum(iban: string): number {
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder;
}

function validClassification(raw: Classification | undefined): Valid<Classification> {
  if (!raw || !(ASSET_CLASSES as readonly string[]).includes(raw.assetClass)) {
    return fail("invalid-asset-class", "Bitte eine gültige Anlageklasse wählen.");
  }
  if (!(LIQUIDITIES as readonly string[]).includes(raw.liquidity)) {
    return fail("invalid-liquidity", "Bitte eine gültige Verfügbarkeit wählen.");
  }
  if (raw.liquidity === "available") {
    return { ok: true, value: { assetClass: raw.assetClass, liquidity: "available", maturityDate: null } };
  }
  if (!isIsoDate(raw.maturityDate)) {
    return fail("maturity-date-required", "Gebundenes Geld braucht eine gültige Fälligkeit.");
  }
  return { ok: true, value: { assetClass: raw.assetClass, liquidity: "locked", maturityDate: raw.maturityDate } };
}

function isIsoDate(raw: unknown): raw is string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw;
}

function validHolding(
  document: WealthDocument,
  id: string,
  input: HoldingInput,
): Valid<Omit<Holding, "startMonth" | "closingMonth">> {
  if (!document.accounts.some((a) => a.id === input.accountId)) {
    return fail("account-not-found", "Das Konto gibt es nicht.");
  }
  const name = validName(input.name);
  if (!name.ok) return name;
  const classification = validClassification(input.classification);
  if (!classification.ok) return classification;
  return { ok: true, value: { id, accountId: input.accountId, name: name.value, classification: classification.value } };
}

/** Ids are a prefix plus a running number, unique within the document. */
function nextId(document: WealthDocument, prefix: string): string {
  const all = [...document.institutions, ...document.accounts, ...document.holdings];
  const used = all.filter((e) => e.id.startsWith(prefix)).map((e) => Number(e.id.slice(prefix.length)));
  return `${prefix}${Math.max(0, ...used) + 1}`;
}
