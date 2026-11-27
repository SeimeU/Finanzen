import { describe, expect, it } from "vitest";
import {
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  netWorthSeries,
  contributionSplit,
  projection,
  notesAndEvents,
  saveSnapshot,
  setNote,
  addEvent,
  updateEvent,
  deleteEvent,
  type Result,
  type WealthDocument,
} from "./index";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

const TODAY = "2026-11-26";
const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;

/** One Girokonto with one cash Holding. */
function setup() {
  const bank = must(createInstitution(createEmptyDocument(), { name: "Raiffeisen" }));
  const giro = must(createAccount(bank.document, { institutionId: bank.id, name: "Girokonto", defaultClassification: CASH }));
  const cash = must(createHolding(giro.document, { accountId: giro.id, name: "Girokonto", classification: CASH }));
  return { document: cash.document, cash: cash.id };
}

function note(document: WealthDocument, month: string, text: string) {
  return must(setNote(document, { month, today: TODAY, note: text })).document;
}

describe("Notes", () => {
  it("a month's Note is listed with its month", () => {
    const document = must(setNote(createEmptyDocument(), { month: "2026-03", today: TODAY, note: "Neuer Job" })).document;
    expect(notesAndEvents(document)).toEqual([{ month: "2026-03", note: "Neuer Job", events: [] }]);
  });

  it("re-saving a month's values keeps its Note, and the Note does not change Net worth", () => {
    const { document, cash } = setup();
    let next = must(saveSnapshot(document, { month: "2026-01", today: TODAY, holdingValues: [{ holdingId: cash, marketValue: 100_000 }] })).document;
    next = note(next, "2026-01", "Bonus erhalten");
    next = must(saveSnapshot(next, { month: "2026-01", today: TODAY, holdingValues: [{ holdingId: cash, marketValue: 120_000 }] })).document;
    expect(notesAndEvents(next)).toEqual([{ month: "2026-01", note: "Bonus erhalten", events: [] }]);
    expect(netWorthSeries(next).map((m) => [m.month, m.netWorth])).toEqual([["2026-01", 120_000]]);
  });

  it("a Note or Event on a month without values adds no month to Net worth or what is derived from it", () => {
    const { document, cash } = setup();
    let next = note(document, "2026-01", "Vor dem ersten Monatsstand");
    next = must(addEvent(next, { month: "2025-12", today: TODAY, label: "Erbschaft", amount: 500_000 })).document;
    expect(netWorthSeries(next)).toEqual([]);
    expect(projection(next)).toBeNull();

    next = must(saveSnapshot(next, { month: "2026-02", today: TODAY, holdingValues: [{ holdingId: cash, marketValue: 100_000 }] })).document;
    next = must(saveSnapshot(next, { month: "2026-03", today: TODAY, holdingValues: [{ holdingId: cash, marketValue: 120_000 }] })).document;

    expect(netWorthSeries(next).map((m) => [m.month, m.netWorth])).toEqual([
      ["2026-02", 100_000],
      ["2026-03", 120_000],
    ]);
    expect(contributionSplit(next).map((m) => [m.month, m.netWorthChange])).toEqual([["2026-03", 20_000]]);
    expect(projection(next)!.defaultMonthlySavings).toBe(20_000);
  });

  it("setting a Note again replaces it; a blank Note removes it", () => {
    let document = note(createEmptyDocument(), "2026-02", "Erster Text");
    document = note(document, "2026-02", "  Korrigiert  ");
    expect(notesAndEvents(document)).toEqual([{ month: "2026-02", note: "Korrigiert", events: [] }]);
    document = note(document, "2026-02", "   ");
    expect(notesAndEvents(document)).toEqual([]);
  });

  it("a Note cannot be set for a future month", () => {
    const result = setNote(createEmptyDocument(), { month: "2026-12", today: TODAY, note: "Später" });
    expect(result.ok || result.error.code).toBe("month-in-future");
  });
});

function add(document: WealthDocument, month: string, label: string, amount: number) {
  return must(addEvent(document, { month, today: TODAY, label, amount }));
}

describe("Events", () => {
  it("Events are listed with their month, label and amount, months oldest first", () => {
    let document = add(createEmptyDocument(), "2026-05", "Auto gekauft", -1_500_000).document;
    document = add(document, "2026-02", "Erbschaft", 500_000).document;
    document = add(document, "2026-05", "Bonus", 200_000).document;
    document = note(document, "2026-03", "Ruhiger Monat");
    expect(
      notesAndEvents(document).map((m) => [m.month, m.note, m.events.map((e) => [e.label, e.amount])]),
    ).toEqual([
      ["2026-02", null, [["Erbschaft", 500_000]]],
      ["2026-03", "Ruhiger Monat", []],
      ["2026-05", null, [["Auto gekauft", -1_500_000], ["Bonus", 200_000]]],
    ]);
  });

  it("an Event can be edited and deleted by its id", () => {
    const first = add(createEmptyDocument(), "2026-05", "Auto", -1_000_000);
    const second = add(first.document, "2026-06", "Urlaub", -300_000);
    expect(second.id).not.toBe(first.id);
    let document = must(updateEvent(second.document, { id: first.id, label: "Auto gekauft", amount: -1_500_000 })).document;
    expect(notesAndEvents(document)[0]!.events).toEqual([{ id: first.id, label: "Auto gekauft", amount: -1_500_000 }]);
    document = must(deleteEvent(document, { id: second.id })).document;
    expect(notesAndEvents(document).map((m) => m.month)).toEqual(["2026-05"]);
  });

  it("an Event needs a label and an amount in cents", () => {
    const blank = addEvent(createEmptyDocument(), { month: "2026-05", today: TODAY, label: "  ", amount: 100 });
    expect(blank.ok || blank.error.code).toBe("label-required");
    const fraction = addEvent(createEmptyDocument(), { month: "2026-05", today: TODAY, label: "X", amount: 1.5 });
    expect(fraction.ok || fraction.error.code).toBe("invalid-amount");
    const future = addEvent(createEmptyDocument(), { month: "2027-01", today: TODAY, label: "X", amount: 1 });
    expect(future.ok || future.error.code).toBe("month-in-future");
  });

  it("editing or deleting an unknown Event fails", () => {
    const update = updateEvent(createEmptyDocument(), { id: "e9", label: "X", amount: 1 });
    expect(update.ok || update.error.code).toBe("event-not-found");
    const removed = deleteEvent(createEmptyDocument(), { id: "e9" });
    expect(removed.ok || removed.error.code).toBe("event-not-found");
  });

  it("re-saving a month's values keeps its Events", () => {
    const { document, cash } = setup();
    let next = add(document, "2026-01", "Bonus", 200_000).document;
    next = must(saveSnapshot(next, { month: "2026-01", today: TODAY, holdingValues: [{ holdingId: cash, marketValue: 120_000 }] })).document;
    expect(notesAndEvents(next)[0]!.events.map((e) => e.label)).toEqual(["Bonus"]);
  });
});
