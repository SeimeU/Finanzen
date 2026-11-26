import { describe, expect, it } from "vitest";
import {
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  netWorthSeries,
  saveSnapshot,
  snapshotForm,
  type Result,
  type SnapshotInput,
  type WealthDocument,
} from "./index";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
const ETF = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
const TODAY = "2026-11-26";

/** Raiffeisen/Girokonto (cash), Trade Republic/Depot (ETF) and optionally a debt Kredit. */
function setup() {
  let document: WealthDocument = createEmptyDocument();
  const bank = must(createInstitution(document, { name: "Raiffeisen" }));
  document = bank.document;
  const giro = must(createAccount(document, { institutionId: bank.id, name: "Girokonto", defaultClassification: CASH }));
  document = giro.document;
  const cash = must(createHolding(document, { accountId: giro.id, name: "Girokonto", classification: CASH }));
  document = cash.document;
  const depot = must(createAccount(document, { institutionId: bank.id, name: "Depot", defaultClassification: ETF }));
  document = depot.document;
  const etf = must(createHolding(document, { accountId: depot.id, name: "MSCI World", classification: ETF }));
  document = etf.document;
  const credit = must(
    createAccount(document, { institutionId: bank.id, name: "Kredit", isDebt: true, defaultClassification: CASH }),
  );
  document = credit.document;
  const loan = must(createHolding(document, { accountId: credit.id, name: "Kredit", classification: CASH }));
  document = loan.document;
  return { document, cash: cash.id, etf: etf.id, loan: loan.id, bankId: bank.id };
}

function save(
  document: WealthDocument,
  month: string,
  holdingValues: { holdingId: string; marketValue: number; contribution?: number | null }[],
) {
  return must(saveSnapshot(document, { month, today: TODAY, holdingValues })).document;
}

describe("Net worth series", () => {
  it("a Snapshot's Net worth is the sum of its Market values in cents", () => {
    const { document, cash, etf } = setup();
    const next = save(document, "2026-01", [
      { holdingId: cash, marketValue: 150_000 },
      { holdingId: etf, marketValue: 1_000_050 },
    ]);
    expect(netWorthSeries(next).map((m) => [m.month, m.netWorth])).toEqual([["2026-01", 1_150_050]]);
  });

  it("a Holding left out keeps its latest earlier value and is flagged not updated", () => {
    const { document, cash, etf } = setup();
    let next = save(document, "2026-01", [
      { holdingId: cash, marketValue: 100_000 },
      { holdingId: etf, marketValue: 500_000 },
    ]);
    next = save(next, "2026-03", [{ holdingId: cash, marketValue: 120_000 }]);
    const series = netWorthSeries(next);
    expect(series.map((m) => [m.month, m.netWorth])).toEqual([
      ["2026-01", 600_000],
      ["2026-02", 600_000],
      ["2026-03", 620_000],
    ]);
    expect(series[1]!.holdings).toEqual([
      { holdingId: cash, marketValue: 100_000, contribution: null, notUpdated: true },
      { holdingId: etf, marketValue: 500_000, contribution: null, notUpdated: true },
    ]);
    expect(series[2]!.holdings).toEqual([
      { holdingId: cash, marketValue: 120_000, contribution: null, notUpdated: false },
      { holdingId: etf, marketValue: 500_000, contribution: null, notUpdated: true },
    ]);
  });

  it("a Holding with no value yet is not counted, never read as zero", () => {
    const { document, cash, etf } = setup();
    const next = save(document, "2026-01", [{ holdingId: cash, marketValue: 100_000 }]);
    expect(netWorthSeries(next)[0]!.holdings.map((h) => h.holdingId)).toEqual([cash]);
    expect(netWorthSeries(next)[0]!.holdings.some((h) => h.holdingId === etf)).toBe(false);
  });

  it("months are in calendar order whatever order they were entered in, across years", () => {
    const { document, cash } = setup();
    let next = save(document, "2026-01", [{ holdingId: cash, marketValue: 300 }]);
    next = save(next, "2025-11", [{ holdingId: cash, marketValue: 100 }]);
    expect(netWorthSeries(next).map((m) => [m.month, m.netWorth])).toEqual([
      ["2025-11", 100],
      ["2025-12", 100],
      ["2026-01", 300],
    ]);
  });

  it("saving a month again replaces its Snapshot", () => {
    const { document, cash, etf } = setup();
    let next = save(document, "2026-01", [{ holdingId: cash, marketValue: 100_000 }]);
    next = save(next, "2026-02", [
      { holdingId: cash, marketValue: 110_000 },
      { holdingId: etf, marketValue: 50_000 },
    ]);
    next = save(next, "2026-02", [{ holdingId: cash, marketValue: 111_111 }]);
    const series = netWorthSeries(next);
    expect(series.map((m) => [m.month, m.netWorth])).toEqual([
      ["2026-01", 100_000],
      ["2026-02", 111_111],
    ]);
    expect(series[1]!.holdings).toEqual([
      { holdingId: cash, marketValue: 111_111, contribution: null, notUpdated: false },
    ]);
  });

  it("debts count negatively", () => {
    const { document, cash, loan } = setup();
    const next = save(document, "2026-01", [
      { holdingId: cash, marketValue: 500_000 },
      { holdingId: loan, marketValue: 1_200_000 },
    ]);
    expect(netWorthSeries(next)[0]!.netWorth).toBe(-700_000);
  });

  it("Contributions are stored with the month they were entered for, not carried forward", () => {
    const { document, etf } = setup();
    let next = save(document, "2026-01", [{ holdingId: etf, marketValue: 100_000, contribution: 20_000 }]);
    next = save(next, "2026-02", []);
    const [january, february] = netWorthSeries(next);
    expect(january!.holdings[0]).toEqual({ holdingId: etf, marketValue: 100_000, contribution: 20_000, notUpdated: false });
    expect(february!.holdings[0]).toEqual({ holdingId: etf, marketValue: 100_000, contribution: null, notUpdated: true });
  });
});

describe("Monatsstand form", () => {
  it("lists every Holding by Institution and Account, pre-filled with the previous month's values", () => {
    const { document, cash, etf, loan, bankId } = setup();
    let next = save(document, "2026-01", [
      { holdingId: cash, marketValue: 100_000 },
      { holdingId: etf, marketValue: 500_000, contribution: 10_000 },
    ]);
    next = save(next, "2026-02", [{ holdingId: cash, marketValue: 90_000 }]);
    const form = snapshotForm(next, "2026-04");
    expect(form.month).toBe("2026-04");
    expect(form.exists).toBe(false);
    expect(form.previousNetWorth).toBe(590_000);
    expect(form.institutions.map((i) => i.id)).toEqual([bankId]);
    expect(form.institutions[0]!.accounts.map((a) => [a.name, a.isDebt])).toEqual([
      ["Girokonto", false],
      ["Depot", false],
      ["Kredit", true],
    ]);
    const holdings = form.institutions[0]!.accounts.flatMap((a) => a.holdings);
    expect(holdings).toEqual([
      { id: cash, name: "Girokonto", isInvestment: false, previousValue: 90_000, marketValue: 90_000, contribution: null, recorded: false },
      { id: etf, name: "MSCI World", isInvestment: true, previousValue: 500_000, marketValue: 500_000, contribution: null, recorded: false },
      { id: loan, name: "Kredit", isInvestment: false, previousValue: null, marketValue: null, contribution: null, recorded: false },
    ]);
  });

  it("for a month that already has a Snapshot, shows what was recorded", () => {
    const { document, cash, etf } = setup();
    let next = save(document, "2026-01", [
      { holdingId: cash, marketValue: 100_000 },
      { holdingId: etf, marketValue: 500_000 },
    ]);
    next = save(next, "2026-02", [{ holdingId: etf, marketValue: 520_000, contribution: 15_000 }]);
    const form = snapshotForm(next, "2026-02");
    expect(form.exists).toBe(true);
    expect(form.previousNetWorth).toBe(600_000);
    const holdings = form.institutions[0]!.accounts.flatMap((a) => a.holdings);
    expect(holdings.find((h) => h.id === etf)).toMatchObject({ previousValue: 500_000, marketValue: 520_000, contribution: 15_000, recorded: true });
    expect(holdings.find((h) => h.id === cash)).toMatchObject({ previousValue: 100_000, marketValue: 100_000, recorded: false });
  });

  it("the first month has no previous Net worth", () => {
    const { document } = setup();
    expect(snapshotForm(document, "2026-01").previousNetWorth).toBeNull();
  });
});

describe("saving a Snapshot", () => {
  function code(result: Result<object>) {
    return result.ok ? undefined : result.error.code;
  }

  it("rejects a malformed month or a month after today", () => {
    const { document, cash } = setup();
    for (const month of ["2026-13", "2026-1", "11/2026", ""]) {
      expect(code(saveSnapshot(document, { month, today: TODAY, holdingValues: [] }))).toBe("invalid-month");
    }
    expect(code(saveSnapshot(document, { month: "2026-12", today: TODAY, holdingValues: [{ holdingId: cash, marketValue: 1 }] }))).toBe(
      "month-in-future",
    );
    expect(saveSnapshot(document, { month: "2026-11", today: TODAY, holdingValues: [] }).ok).toBe(true);
  });

  it("rejects unknown or repeated Holdings and amounts that are not whole cents", () => {
    const { document, cash } = setup();
    const attempt = (holdingValues: SnapshotInput["holdingValues"]) =>
      code(saveSnapshot(document, { month: "2026-01", today: TODAY, holdingValues }));
    expect(attempt([{ holdingId: "h99", marketValue: 1 }])).toBe("holding-not-found");
    expect(attempt([{ holdingId: cash, marketValue: 1 }, { holdingId: cash, marketValue: 2 }])).toBe("duplicate-holding");
    expect(attempt([{ holdingId: cash, marketValue: 1.5 }])).toBe("invalid-amount");
    expect(attempt([{ holdingId: cash, marketValue: 1, contribution: 0.1 }])).toBe("invalid-amount");
  });
});
