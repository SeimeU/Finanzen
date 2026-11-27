import type { MonthEvent, Snapshot, WealthDocument, YearMonth } from "./document";
import { nextId } from "./ids";
import { fail, type Result } from "./result";

/** A month with a Note or Events (or both). */
export type MonthNotes = { month: YearMonth; note: string | null; events: MonthEvent[] };

type MonthInput = { month: YearMonth; today: string };

/** Sets a month's Note; a blank Note removes it. */
export function setNote(
  document: WealthDocument,
  input: MonthInput & { note: string },
): Result<{ document: WealthDocument }> {
  const month = validMonth(input);
  if (!month.ok) return month;
  const note = typeof input.note === "string" ? input.note.trim() : "";
  return {
    ok: true,
    document: withSnapshot(document, input.month, (snapshot) => {
      const { note: _, ...rest } = snapshot;
      return note === "" ? rest : { ...rest, note };
    }),
  };
}

/** Adds an Event to a month. Amount in cents; negative for an outflow such as a purchase. */
export function addEvent(
  document: WealthDocument,
  input: MonthInput & { label: string; amount: number },
): Result<{ document: WealthDocument; id: string }> {
  const month = validMonth(input);
  if (!month.ok) return month;
  const fields = validEvent(input);
  if (!fields.ok) return fields;
  const id = nextEventId(document);
  const event: MonthEvent = { id, label: fields.label, amount: fields.amount };
  return {
    ok: true,
    id,
    document: withSnapshot(document, input.month, (s) => ({ ...s, events: [...(s.events ?? []), event] })),
  };
}

/** Replaces an Event's label and amount. */
export function updateEvent(
  document: WealthDocument,
  input: { id: string; label: string; amount: number },
): Result<{ document: WealthDocument }> {
  const fields = validEvent(input);
  if (!fields.ok) return fields;
  return changeEvents(document, input.id, (e) => [{ ...e, label: fields.label, amount: fields.amount }]);
}

export function deleteEvent(document: WealthDocument, input: { id: string }): Result<{ document: WealthDocument }> {
  return changeEvents(document, input.id, () => []);
}

/** Every month with a Note or Events, oldest first. */
export function notesAndEvents(document: WealthDocument): MonthNotes[] {
  return document.snapshots
    .filter((s) => s.note !== undefined || (s.events?.length ?? 0) > 0)
    .map((s) => ({ month: s.month, note: s.note ?? null, events: s.events ?? [] }));
}

/** Applies `change` to the month's Snapshot, creating an empty one (no values) if needed. */
function withSnapshot(document: WealthDocument, month: YearMonth, change: (s: Snapshot) => Snapshot): WealthDocument {
  const existing = document.snapshots.find((s) => s.month === month) ?? { month, holdingValues: [], accountValues: [] };
  const snapshots = [...document.snapshots.filter((s) => s.month !== month), change(existing)].sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  return { ...document, snapshots };
}

function changeEvents(
  document: WealthDocument,
  id: string,
  replace: (event: MonthEvent) => MonthEvent[],
): Result<{ document: WealthDocument }> {
  if (!document.snapshots.some((s) => s.events?.some((e) => e.id === id))) {
    return fail("event-not-found", "Das Ereignis gibt es nicht.");
  }
  const snapshots = document.snapshots.map((s) =>
    s.events?.some((e) => e.id === id) ? { ...s, events: s.events.flatMap((e) => (e.id === id ? replace(e) : [e])) } : s,
  );
  return { ok: true, document: { ...document, snapshots } };
}

function validEvent(input: { label: unknown; amount: unknown }): Result<{ label: string; amount: number }> {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (label === "") return fail("label-required", "Bitte eine Bezeichnung eingeben.");
  if (!Number.isSafeInteger(input.amount)) return fail("invalid-amount", "Bitte Beträge in Euro und Cent eingeben.");
  return { ok: true, label, amount: input.amount as number };
}

/** "e" plus a running number, unique among all Events. */
function nextEventId(document: WealthDocument): string {
  return nextId(document.snapshots.flatMap((s) => s.events ?? []), "e");
}

function validMonth(input: MonthInput): Result<object> {
  if (typeof input.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) {
    return fail("invalid-month", "Bitte einen gültigen Monat wählen.");
  }
  if (input.month > String(input.today).slice(0, 7)) {
    return fail("month-in-future", "Notizen und Ereignisse können nicht für einen künftigen Monat erfasst werden.");
  }
  return { ok: true };
}
