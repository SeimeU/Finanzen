// German UI labels for domain values (see GLOSSARY.md `_UI_` lines).
import type { AssetClass, CategoryKind, CategoryNode, Classification, Liquidity, RuleCondition } from "../core";
import { formatDate, formatEur } from "./format";

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  cash: "Cash",
  etf: "ETF",
  stock: "Aktie",
  bond: "Anleihe",
  crypto: "Krypto",
  commodity: "Rohstoff",
  other: "Sonstiges",
};

export const LIQUIDITY_LABELS: Record<Liquidity, string> = {
  available: "Verfügbar",
  locked: "Gebunden bis",
};

/** "ETF, Verfügbar" or "Anleihe, Gebunden bis 31.03.2027". */
export function formatClassification(c: Classification): string {
  const liquidity =
    c.liquidity === "locked" && c.maturityDate
      ? `${LIQUIDITY_LABELS.locked} ${formatDate(c.maturityDate)}`
      : LIQUIDITY_LABELS[c.liquidity];
  return `${ASSET_CLASS_LABELS[c.assetClass]}, ${liquidity}`;
}

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  income: "Einnahme",
  expense: "Ausgabe",
};

/** Every Category as "Wohnen" or "Wohnen → Miete", in tree order, for Kategorie selects. */
export function categoryOptions(tree: CategoryNode[]): { id: string; label: string }[] {
  return tree.flatMap((top) => [
    { id: top.id, label: top.name },
    ...top.children.map((c) => ({ id: c.id, label: `${top.name} → ${c.name}` })),
  ]);
}

export const RULE_FIELD_LABELS: Record<RuleCondition["field"], string> = {
  counterparty: "Gegenüber",
  purpose: "Verwendungszweck",
  reference: "Zahlungsreferenz",
  amount: "Betrag",
};

export const RULE_OPERATOR_LABELS: Record<RuleCondition["operator"], string> = {
  contains: "enthält",
  equals: "ist gleich",
  atLeast: "mindestens",
  atMost: "höchstens",
};

/** 'Gegenüber enthält „billa“' or 'Betrag mindestens 100,00 €'. */
export function formatRuleCondition(c: RuleCondition): string {
  const value = c.field === "amount" ? formatEur(c.amountCents) : `„${c.text}“`;
  return `${RULE_FIELD_LABELS[c.field]} ${RULE_OPERATOR_LABELS[c.operator]} ${value}`;
}

/** Every Account as "Institut – Konto", for Konto selects. */
export function accountOptions(structure: import("../core").InstitutionView[]): { id: string; label: string }[] {
  return structure.flatMap((i) => i.accounts.map((a) => ({ id: a.id, label: `${i.name} – ${a.name}` })));
}
