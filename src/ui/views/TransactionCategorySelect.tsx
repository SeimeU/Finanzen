import type { ClassifiedTransaction } from "../../core";

/**
 * The "Kategorie" select of one Transaction. It shows the current classification;
 * picking a Category sets it by hand, and the empty choice clears the manual Category,
 * so the automatic classification (Kauf / Verkauf, Umbuchung, Trade Republic mapping, inbox) applies again.
 */
export function TransactionCategorySelect({
  transaction,
  options,
  onChange,
}: {
  transaction: ClassifiedTransaction;
  options: { id: string; label: string }[];
  onChange: (categoryId: string | null) => void;
}) {
  const c = transaction.classification;
  const value = c.kind === "category" ? c.categoryId : "";
  const automatic =
    c.kind === "trade" ? (c.direction === "buy" ? "Kauf" : "Verkauf") : c.kind === "transfer" ? "Umbuchung" : "Nicht kategorisiert";
  return (
    <select aria-label="Kategorie" value={value} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{c.kind === "category" ? "Automatisch" : automatic}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
