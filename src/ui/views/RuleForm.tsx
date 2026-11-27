import { useState, type FormEvent } from "react";
import type { RuleCondition, RuleInput } from "../../core";
import { formatEurInput, parseEur } from "../format";
import { RULE_FIELD_LABELS, RULE_OPERATOR_LABELS } from "../labels";

type Field = RuleCondition["field"];
type Operator = RuleCondition["operator"];

const FIELDS: Field[] = ["counterparty", "purpose", "reference", "amount"];
const TEXT_OPERATORS: Operator[] = ["contains", "equals"];
const AMOUNT_OPERATORS: Operator[] = ["equals", "atLeast", "atMost"];

/**
 * Creates or edits one Categorization rule: field, condition, value and Category.
 * Used by the rules editor (Regeln) and by "Regel erstellen" in the inbox.
 * `onSubmit` returns whether it was saved; a new rule's form then clears itself.
 */
export function RuleForm({
  name,
  submitLabel,
  initial,
  categories,
  onSubmit,
  onCancel,
}: {
  name: string;
  submitLabel: string;
  initial?: { condition: RuleCondition; categoryId: string; applyToExisting: boolean };
  categories: { id: string; label: string }[];
  onSubmit: (input: RuleInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const start = initial?.condition ?? { field: "counterparty", operator: "contains", text: "" };
  const [field, setField] = useState<Field>(start.field);
  const [operator, setOperator] = useState<Operator>(start.operator);
  const [text, setText] = useState(start.field === "amount" ? "" : start.text);
  const [amount, setAmount] = useState(start.field === "amount" ? formatEurInput(start.amountCents) : "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [applyToExisting, setApplyToExisting] = useState(initial?.applyToExisting ?? true);

  const operators = field === "amount" ? AMOUNT_OPERATORS : TEXT_OPERATORS;

  function changeField(next: Field) {
    setField(next);
    const nextOperators = next === "amount" ? AMOUNT_OPERATORS : TEXT_OPERATORS;
    if (!nextOperators.includes(operator)) setOperator(nextOperators[0]!);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const condition =
      field === "amount"
        ? ({ field, operator, amountCents: parseEur(amount) ?? Number.NaN } as RuleCondition)
        : ({ field, operator, text } as RuleCondition);
    const saved = await onSubmit({ condition, categoryId, applyToExisting });
    if (saved && !initial) {
      setText("");
      setAmount("");
    }
  }

  return (
    <form aria-label={name} className="row inline-form rule-form" onSubmit={submit}>
      <select aria-label="Feld" value={field} onChange={(e) => changeField(e.target.value as Field)}>
        {FIELDS.map((f) => (
          <option key={f} value={f}>
            {RULE_FIELD_LABELS[f]}
          </option>
        ))}
      </select>
      <select aria-label="Bedingung" value={operator} onChange={(e) => setOperator(e.target.value as Operator)}>
        {operators.map((o) => (
          <option key={o} value={o}>
            {RULE_OPERATOR_LABELS[o]}
          </option>
        ))}
      </select>
      {field === "amount" ? (
        <input aria-label="Betrag" inputMode="decimal" placeholder="-9,99" value={amount} onChange={(e) => setAmount(e.target.value)} />
      ) : (
        <input aria-label="Text" value={text} onChange={(e) => setText(e.target.value)} />
      )}
      <span aria-hidden="true">→</span>
      <select aria-label="Kategorie" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Kategorie wählen</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <label className="checkbox">
        <input type="checkbox" checked={applyToExisting} onChange={(e) => setApplyToExisting(e.target.checked)} />
        Auf bestehende Umsätze anwenden
      </label>
      <button type="submit">{submitLabel}</button>
      {onCancel && (
        <button type="button" className="secondary" onClick={onCancel}>
          Abbrechen
        </button>
      )}
    </form>
  );
}
