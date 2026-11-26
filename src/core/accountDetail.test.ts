import { describe, expect, it } from "vitest";
import {
  accountDetail,
  contributionSplit,
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  saveSnapshot,
  type Result,
  type WealthDocument,
} from "./index";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
const ETF = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
const TODAY = "2026-11-26";

/** Raiffeisen/Girokonto (cash), Trade Republic/Depot with two ETFs, Raiffeisen/Kredit (debt). */
function setup() {
  let document: WealthDocument = createEmptyDocument();
  const bank = must(createInstitution(document, { name: "Raiffeisen" }));
  document = bank.document;
  const broker = must(createInstitution(document, { name: "Trade Republic" }));
  document = broker.document;
  const giro = must(createAccount(document, { institutionId: bank.id, name: "Girokonto", defaultClassification: CASH }));
  document = giro.document;
  const cash = must(createHolding(document, { accountId: giro.id, name: "Giro", classification: CASH }));
  document = cash.document;
  const depot = must(createAccount(document, { institutionId: broker.id, name: "Depot", defaultClassification: ETF }));
  document = depot.document;
  const world = must(createHolding(document, { accountId: depot.id, name: "MSCI World", classification: ETF }));
  document = world.document;
  const em = must(createHolding(document, { accountId: depot.id, name: "MSCI EM", classification: ETF }));
  document = em.document;
  const credit = must(
    createAccount(document, { institutionId: bank.id, name: "Kredit", isDebt: true, defaultClassification: CASH }),
  );
  document = credit.document;
  const loan = must(createHolding(document, { accountId: credit.id, name: "Kredit", classification: CASH }));
  document = loan.document;
  return {
    document,
    giro: giro.id,
    depot: depot.id,
    credit: credit.id,
    cash: cash.id,
    world: world.id,
    em: em.id,
    loan: loan.id,
  };
}

function save(
  document: WealthDocument,
  month: string,
  holdingValues: { holdingId: string; marketValue: number; contribution?: number | null }[],
) {
  return must(saveSnapshot(document, { month, today: TODAY, holdingValues })).document;
}

describe("Account detail", () => {
  it("an Account's value per month is the sum of its Holdings' Market values, carried forward", () => {
    const s = setup();
    let document = save(s.document, "2026-01", [
      { holdingId: s.world, marketValue: 100_000, contribution: 10_000 },
      { holdingId: s.em, marketValue: 20_000 },
      { holdingId: s.cash, marketValue: 5_000 },
    ]);
    document = save(document, "2026-03", [{ holdingId: s.world, marketValue: 110_000 }]);

    expect(accountDetail(document, s.depot)!.series).toEqual([
      { month: "2026-01", value: 120_000, contribution: 10_000, notUpdated: false },
      { month: "2026-02", value: 120_000, contribution: 0, notUpdated: true },
      { month: "2026-03", value: 130_000, contribution: 0, notUpdated: false },
    ]);
  });

  it("lists the Account's Holdings with their latest Market value, and starts at its first value", () => {
    const s = setup();
    let document = save(s.document, "2026-01", [{ holdingId: s.cash, marketValue: 5_000 }]);
    document = save(document, "2026-02", [{ holdingId: s.world, marketValue: 100_000 }]);
    document = save(document, "2026-03", [{ holdingId: s.cash, marketValue: 6_000 }]);

    const detail = accountDetail(document, s.depot)!;
    expect(detail).toMatchObject({ name: "Depot", institutionName: "Trade Republic", isDebt: false });
    expect(detail.series.map((m) => m.month)).toEqual(["2026-02", "2026-03"]);
    expect(detail.holdings).toEqual([
      { id: s.world, name: "MSCI World", classification: ETF, marketValue: 100_000, notUpdated: true },
      { id: s.em, name: "MSCI EM", classification: ETF, marketValue: null, notUpdated: false },
    ]);
  });

  it("a debt Account's value counts negatively, its Holdings show the amount owed", () => {
    const s = setup();
    const document = save(s.document, "2026-01", [{ holdingId: s.loan, marketValue: 800_000 }]);

    const detail = accountDetail(document, s.credit)!;
    expect(detail.isDebt).toBe(true);
    expect(detail.series).toEqual([{ month: "2026-01", value: -800_000, contribution: 0, notUpdated: false }]);
    expect(detail.holdings[0]!.marketValue).toBe(800_000);
  });

  it("is null for an unknown Account", () => {
    expect(accountDetail(setup().document, "a99")).toBeNull();
  });
});

describe("Contribution versus market change", () => {
  it("splits each month's Net worth change into Contributions, market change and other change", () => {
    const s = setup();
    let document = save(s.document, "2026-01", [
      { holdingId: s.cash, marketValue: 500_000 },
      { holdingId: s.world, marketValue: 1_000_000 },
      { holdingId: s.loan, marketValue: 300_000 },
    ]);
    // Giro pays 1.000 € into MSCI World and 200 € off the loan; MSCI World also gains 500 €.
    document = save(document, "2026-02", [
      { holdingId: s.cash, marketValue: 380_000 },
      { holdingId: s.world, marketValue: 1_150_000, contribution: 100_000 },
      { holdingId: s.loan, marketValue: 280_000 },
    ]);

    expect(contributionSplit(document)).toEqual([
      { month: "2026-02", netWorthChange: 50_000, contribution: 100_000, marketChange: 50_000, otherChange: -100_000 },
    ]);
  });

  it("a carried-forward month changes nothing, and a new investment Holding starts from zero", () => {
    const s = setup();
    let document = save(s.document, "2026-01", [{ holdingId: s.world, marketValue: 1_000_000 }]);
    document = save(document, "2026-03", [
      { holdingId: s.world, marketValue: 1_020_000 },
      { holdingId: s.em, marketValue: 200_000, contribution: 190_000 },
    ]);

    expect(contributionSplit(document)).toEqual([
      { month: "2026-02", netWorthChange: 0, contribution: 0, marketChange: 0, otherChange: 0 },
      { month: "2026-03", netWorthChange: 220_000, contribution: 190_000, marketChange: 30_000, otherChange: 0 },
    ]);
  });

  it("is empty with fewer than two months", () => {
    const s = setup();
    expect(contributionSplit(s.document)).toEqual([]);
    expect(contributionSplit(save(s.document, "2026-01", [{ holdingId: s.world, marketValue: 1 }]))).toEqual([]);
  });
});
