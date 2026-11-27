import { describe, expect, it } from "vitest";
import {
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  projection,
  saveSnapshot,
  setProjectionAssumptions,
  type Classification,
  type ProjectionAssumptions,
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

/** Returns of 0 % for every Asset class, no savings, 5 years, ±2 points: tests override what they need. */
const FLAT: ProjectionAssumptions = {
  annualReturns: { cash: 0, etf: 0, stock: 0, bond: 0, crypto: 0, commodity: 0, other: 0 },
  monthlySavings: 0,
  horizonYears: 5,
  bandSpread: 2,
};

/** One Institution with one Account per given Holding (name → classification, optional debt). */
function setup(holdings: Record<string, { classification: Classification; isDebt?: boolean }>) {
  const bank = must(createInstitution(createEmptyDocument(), { name: "Bank" }));
  let document = bank.document;
  const ids: Record<string, string> = {};
  for (const [name, { classification, isDebt }] of Object.entries(holdings)) {
    const account = must(
      createAccount(document, { institutionId: bank.id, name, isDebt, defaultClassification: classification }),
    );
    const holding = must(createHolding(account.document, { accountId: account.id, name, classification }));
    document = holding.document;
    ids[name] = holding.id;
  }
  return { document, ids };
}

function save(document: WealthDocument, month: string, holdingValues: SnapshotInput["holdingValues"]) {
  return must(saveSnapshot(document, { month, today: TODAY, holdingValues })).document;
}

function assume(document: WealthDocument, assumptions: Partial<ProjectionAssumptions>) {
  return must(setProjectionAssumptions(document, { ...FLAT, ...assumptions })).document;
}

describe("projection", () => {
  it("is null without any Snapshot", () => {
    expect(projection(createEmptyDocument())).toBeNull();
  });

  it("compounds each Asset class month by month at its expected annual return, with ±2 point bands", () => {
    const { document, ids } = setup({ Depot: { classification: ETF } });
    let next = save(document, "2026-10", [{ holdingId: ids.Depot!, marketValue: 10_000_000 }]);
    next = assume(next, { annualReturns: { ...FLAT.annualReturns, etf: 6 } });

    const result = projection(next)!;
    // Starts at the latest Snapshot month and runs 5 years (60 months) past it.
    expect(result.months).toHaveLength(61);
    expect(result.months[0]).toMatchObject({ month: "2026-10", netWorth: 10_000_000, optimistic: 10_000_000, pessimistic: 10_000_000 });
    // After one year: exactly the annual return (6 %), the optimistic 8 %, the pessimistic 4 %.
    expect(result.months[12]).toMatchObject({ month: "2027-10", netWorth: 10_600_000, optimistic: 10_800_000, pessimistic: 10_400_000 });
    // After 5 years: 100.000 € × 1,06^5 = 133.822,56 €.
    expect(result.months[60]).toMatchObject({ month: "2031-10", netWorth: 13_382_256 });
  });

  it("adds the monthly savings amount to Available cash at the end of each month, where it grows at the Cash return", () => {
    const { document, ids } = setup({ Giro: { classification: CASH }, Depot: { classification: ETF } });
    let next = save(document, "2026-10", [
      { holdingId: ids.Giro!, marketValue: 100_000 },
      { holdingId: ids.Depot!, marketValue: 500_000 },
    ]);
    // 1,01^12 − 1 = 12,682503 % a year is exactly 1 % a month.
    next = assume(next, { annualReturns: { ...FLAT.annualReturns, cash: 12.682503013196972 }, monthlySavings: 10_000 });

    const { months } = projection(next)!;
    // Giro 1.000 € × 1,01 + 100 € = 1.110 €; × 1,01 + 100 € = 1.221,10 €. The Depot (0 %) stays at 5.000 €.
    expect(months[1]!.netWorth).toBe(611_000);
    expect(months[2]!.netWorth).toBe(622_110);
  });

  describe("default monthly savings amount", () => {
    it("is the average over the last 12 months of Contributions plus the growth in cash", () => {
      const { document, ids } = setup({ Giro: { classification: CASH }, Depot: { classification: ETF } });
      // 2025-09 → 2025-10: Giro +10.000 €, more than 12 months back, so not counted.
      let next = save(document, "2025-09", [
        { holdingId: ids.Giro!, marketValue: 100_000 },
        { holdingId: ids.Depot!, marketValue: 500_000 },
      ]);
      next = save(next, "2025-10", [{ holdingId: ids.Giro!, marketValue: 1_100_000 }]);
      // Then 12 months of Giro +300 € and Depot +250 € of which 200 € paid in (Einzahlung), 50 € market.
      const months = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
      months.forEach((month, i) => {
        next = save(next, month, [
          { holdingId: ids.Giro!, marketValue: 1_100_000 + (i + 1) * 30_000 },
          { holdingId: ids.Depot!, marketValue: 500_000 + (i + 1) * 25_000, contribution: 20_000 },
        ]);
      });
      next = assume(next, { monthlySavings: null });

      const result = projection(next)!;
      // 200 € Einzahlung + 300 € more cash = 500 € a month; the 50 € market change is not savings.
      expect(result.defaultMonthlySavings).toBe(50_000);
      expect(result.monthlySavings).toBe(50_000);
      // 2026-10: Giro 14.600 € + Depot 8.000 € = 22.600 €; at 0 % returns the next month adds 500 €.
      expect(result.months[1]!.netWorth).toBe(2_310_000);
    });

    it("averages the months there are when there are fewer than 12, and is 0 with a single month", () => {
      const { document, ids } = setup({ Giro: { classification: CASH } });
      let next = save(document, "2026-08", [{ holdingId: ids.Giro!, marketValue: 100_000 }]);
      expect(projection(next)!.defaultMonthlySavings).toBe(0);
      next = save(next, "2026-09", [{ holdingId: ids.Giro!, marketValue: 140_000 }]);
      next = save(next, "2026-10", [{ holdingId: ids.Giro!, marketValue: 160_000 }]);
      // (400 € + 200 €) / 2
      expect(projection(next)!.defaultMonthlySavings).toBe(30_000);
    });

    it("is replaced by the amount the owner sets", () => {
      const { document, ids } = setup({ Giro: { classification: CASH } });
      let next = save(document, "2026-09", [{ holdingId: ids.Giro!, marketValue: 100_000 }]);
      next = save(next, "2026-10", [{ holdingId: ids.Giro!, marketValue: 140_000 }]);
      next = assume(next, { monthlySavings: 25_000 });
      const result = projection(next)!;
      expect(result.defaultMonthlySavings).toBe(40_000);
      expect(result.monthlySavings).toBe(25_000);
      expect(result.months[1]!.netWorth).toBe(165_000);
    });
  });

  it("moves a Locked Holding to Available in the month of its Maturity date", () => {
    const LOCKED = { assetClass: "bond", liquidity: "locked", maturityDate: "2027-03-15" } as const;
    const { document, ids } = setup({ Giro: { classification: CASH }, Festgeld: { classification: LOCKED } });
    let next = save(document, "2026-10", [
      { holdingId: ids.Giro!, marketValue: 100_000 },
      { holdingId: ids.Festgeld!, marketValue: 1_000_000 },
    ]);
    next = assume(next, {});

    const { months } = projection(next)!;
    expect(months[0]!.byLiquidity).toEqual({ available: 100_000, locked: 1_000_000 });
    expect(months[4]).toMatchObject({ month: "2027-02", byLiquidity: { available: 100_000, locked: 1_000_000 } });
    expect(months[5]).toMatchObject({ month: "2027-03", byLiquidity: { available: 1_100_000, locked: 0 } });
    expect(months[60]!.byLiquidity).toEqual({ available: 1_100_000, locked: 0 });
  });

  it("uses the configured band spread", () => {
    const { document, ids } = setup({ Depot: { classification: ETF } });
    let next = save(document, "2026-10", [{ holdingId: ids.Depot!, marketValue: 10_000_000 }]);
    next = assume(next, { annualReturns: { ...FLAT.annualReturns, etf: 6 }, bandSpread: 5 });
    expect(projection(next)!.months[12]).toMatchObject({ optimistic: 11_100_000, pessimistic: 10_100_000 });
  });

  it("keeps debts at their latest amount: they earn no return", () => {
    const { document, ids } = setup({ Giro: { classification: CASH }, Kredit: { classification: CASH, isDebt: true } });
    let next = save(document, "2026-10", [
      { holdingId: ids.Giro!, marketValue: 1_000_000 },
      { holdingId: ids.Kredit!, marketValue: 400_000 },
    ]);
    next = assume(next, { annualReturns: { ...FLAT.annualReturns, cash: 10 } });
    // Giro 10.000 € × 1,10 − Kredit 4.000 €
    expect(projection(next)!.months[12]!.netWorth).toBe(700_000);
  });

  it("starts from the default assumptions: 10 years, savings from the last 12 months, ±2 points", () => {
    const { document, ids } = setup({ Giro: { classification: CASH } });
    const next = save(document, "2026-10", [{ holdingId: ids.Giro!, marketValue: 100_000 }]);
    const result = projection(next)!;
    expect(result.assumptions).toMatchObject({ horizonYears: 10, monthlySavings: null, bandSpread: 2 });
    expect(result.months).toHaveLength(121);
  });

  it("keeps the assumptions the owner sets", () => {
    const { document, ids } = setup({ Giro: { classification: CASH } });
    let next = save(document, "2026-10", [{ holdingId: ids.Giro!, marketValue: 100_000 }]);
    const mine: ProjectionAssumptions = {
      annualReturns: { cash: 1.5, etf: 7, stock: 8, bond: 3, crypto: -5, commodity: 2, other: 0 },
      monthlySavings: -20_000,
      horizonYears: 20,
      bandSpread: 1.5,
    };
    next = must(setProjectionAssumptions(next, mine)).document;
    expect(projection(next)!.assumptions).toEqual(mine);
    expect(projection(next)!.months).toHaveLength(241);
  });

  it("rejects invalid assumptions", () => {
    const document = createEmptyDocument();
    const invalid: [string, Partial<ProjectionAssumptions>][] = [
      ["invalid-horizon", { horizonYears: 7 as 5 }],
      ["invalid-return", { annualReturns: { ...FLAT.annualReturns, etf: Number.NaN } }],
      ["invalid-return", { annualReturns: { ...FLAT.annualReturns, stock: 101 } }],
      ["invalid-return", { annualReturns: { cash: 1 } as ProjectionAssumptions["annualReturns"] }],
      ["invalid-savings", { monthlySavings: 12.5 }],
      ["invalid-spread", { bandSpread: -1 }],
      ["invalid-spread", { bandSpread: 51 }],
    ];
    for (const [code, assumptions] of invalid) {
      const result = setProjectionAssumptions(document, { ...FLAT, ...assumptions });
      expect(result.ok ? "ok" : result.error.code, JSON.stringify(assumptions)).toBe(code);
    }
  });
});
