import type { CategorizationRule, RuleCondition, Transaction, WealthDocument } from "./document";
import { fail, type Result } from "./result";

/**
 * Categorization rules (Regeln). They are applied when Transactions are imported and,
 * on request, re-applied to every Transaction (reapplyRules); the match is stored as
 * `transaction.ruleCategoryId`. Classification (./classification.ts) ranks it below the
 * manual Category and Trade/Transfer, so a rule never overrides a hand-set Category.
 */

export type RuleInput = {
  condition: RuleCondition;
  categoryId: string;
  /** Re-apply all rules to the existing Transactions right away. */
  applyToExisting?: boolean;
};

type Created = Result<{ document: WealthDocument; id: string }>;
type Updated = Result<{ document: WealthDocument }>;

/** The rules in the owner's order: the first one a Transaction meets gives its Category. */
export function listRules(document: WealthDocument): CategorizationRule[] {
  return document.categorizationRules;
}

/** Adds a rule at the end of the order (so it is tried last). */
export function createRule(document: WealthDocument, input: RuleInput): Created {
  const rule = validRule(document, input);
  if (!rule.ok) return rule;
  const id = `r${document.categorizationRules.reduce((max, r) => Math.max(max, Number(r.id.slice(1)) || 0), 0) + 1}`;
  const next = { ...document, categorizationRules: [...document.categorizationRules, { id, ...rule.value }] };
  return { ok: true, id, document: input.applyToExisting ? reapply(next).document : next };
}

/** Changes a rule's condition and Category, keeping its place in the order. */
export function updateRule(document: WealthDocument, input: RuleInput & { id: string }): Updated {
  if (!document.categorizationRules.some((r) => r.id === input.id)) return notFound();
  const rule = validRule(document, input);
  if (!rule.ok) return rule;
  const next = {
    ...document,
    categorizationRules: document.categorizationRules.map((r) => (r.id === input.id ? { id: r.id, ...rule.value } : r)),
  };
  return { ok: true, document: input.applyToExisting ? reapply(next).document : next };
}

/** Removes a rule. Categories it already gave stay until the rules are re-applied. */
export function deleteRule(document: WealthDocument, input: { id: string }): Updated {
  if (!document.categorizationRules.some((r) => r.id === input.id)) return notFound();
  return { ok: true, document: { ...document, categorizationRules: document.categorizationRules.filter((r) => r.id !== input.id) } };
}

/** Moves a rule one place earlier ("up", tried sooner) or later ("down"). At either end it stays. */
export function moveRule(document: WealthDocument, input: { id: string; direction: "up" | "down" }): Updated {
  const rules = [...document.categorizationRules];
  const from = rules.findIndex((r) => r.id === input.id);
  if (from === -1) return notFound();
  const to = input.direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= rules.length) return { ok: true, document };
  [rules[from], rules[to]] = [rules[to]!, rules[from]!];
  return { ok: true, document: { ...document, categorizationRules: rules } };
}

/**
 * Applies the current rules to every Transaction, replacing what earlier rules gave.
 * A Category set by hand is untouched (and keeps winning). `changedCount` counts
 * Transactions whose rule Category changed.
 */
export function reapplyRules(document: WealthDocument): Result<{ document: WealthDocument; changedCount: number }> {
  return { ok: true, ...reapply(document) };
}

function reapply(document: WealthDocument): { document: WealthDocument; changedCount: number } {
  let changedCount = 0;
  const transactions = document.transactions.map((t) => {
    const ruleCategoryId = ruleCategoryFor(document.categorizationRules, t);
    if (ruleCategoryId === t.ruleCategoryId) return t;
    changedCount += 1;
    return { ...t, ruleCategoryId };
  });
  return { document: { ...document, transactions }, changedCount };
}

/** The Category id of the first rule (in the owner's order) the Transaction meets, else null. */
export function ruleCategoryFor(rules: CategorizationRule[], transaction: Matchable): string | null {
  return rules.find((r) => matches(r.condition, transaction))?.categoryId ?? null;
}

type Matchable = Pick<Transaction, "counterpartyName" | "purpose" | "paymentReference" | "amountCents">;

function matches(condition: RuleCondition, t: Matchable): boolean {
  if (condition.field === "amount") {
    if (condition.operator === "equals") return t.amountCents === condition.amountCents;
    if (condition.operator === "atLeast") return t.amountCents >= condition.amountCents;
    return t.amountCents <= condition.amountCents;
  }
  const value = normalize(
    condition.field === "counterparty" ? t.counterpartyName : condition.field === "purpose" ? t.purpose : t.paymentReference,
  );
  const text = normalize(condition.text);
  return condition.operator === "equals" ? value === text : value.includes(text);
}

const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

const TEXT_FIELDS = ["counterparty", "purpose", "reference"];

function validRule(document: WealthDocument, input: RuleInput): Result<{ value: Omit<CategorizationRule, "id"> }> {
  if (!document.categories.some((c) => c.id === input.categoryId)) {
    return fail("category-not-found", "Bitte eine Kategorie wählen.");
  }
  const c = input.condition as Partial<Record<string, unknown>> | undefined;
  let condition: RuleCondition;
  if (c && TEXT_FIELDS.includes(c.field as string)) {
    if (c.operator !== "contains" && c.operator !== "equals") return badCondition();
    const text = typeof c.text === "string" ? c.text.trim().replace(/\s+/g, " ") : "";
    if (text === "") return fail("text-required", "Bitte einen Text für die Regel eingeben.");
    condition = { field: c.field as "counterparty" | "purpose" | "reference", operator: c.operator, text };
  } else if (c && c.field === "amount") {
    if (c.operator !== "equals" && c.operator !== "atLeast" && c.operator !== "atMost") return badCondition();
    if (!Number.isInteger(c.amountCents)) return fail("amount-required", "Bitte einen Betrag für die Regel eingeben.");
    condition = { field: "amount", operator: c.operator, amountCents: c.amountCents as number };
  } else {
    return badCondition();
  }
  return { ok: true, value: { condition, categoryId: input.categoryId } };
}

const badCondition = () => fail("invalid-condition", "Diese Bedingung ist ungültig.");
const notFound = () => fail("rule-not-found", "Diese Regel gibt es nicht.");
