import { describe, expect, it } from "vitest";
import {
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  currentOverview,
  netWorthSeries,
  saveSnapshot,
  setPerHoldingFrom,
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
const LOCKED_BOND = { assetClass: "bond", liquidity: "locked", maturityDate: "2030-06-30" } as const;
const TODAY = "2026-11-26";

/**
 * Trade Republic: Depot (Default classification ETF) with MSCI World (ETF) and Verrechnungskonto (Cash).
 * Raiffeisen: Festgeld (Locked Bond) and a Kredit (debt, Cash).
 */
function setup() {
  let document: WealthDocument = createEmptyDocument();
  const tr = must(createInstitution(document, { name: "Trade Republic" }));
  const raiffeisen = must(createInstitution(tr.document, { name: "Raiffeisen" }));
  document = raiffeisen.document;
  const depot = must(createAccount(document, { institutionId: tr.id, name: "Depot", defaultClassification: ETF }));
  const etf = must(createHolding(depot.document, { accountId: depot.id, name: "MSCI World", classification: ETF }));
  const cash = must(createHolding(etf.document, { accountId: depot.id, name: "Verrechnungskonto", classification: CASH }));
  const festgeld = must(
    createAccount(cash.document, { institutionId: raiffeisen.id, name: "Festgeld", defaultClassification: LOCKED_BOND }),
  );
  const bond = must(
    createHolding(festgeld.document, { accountId: festgeld.id, name: "Festgeld", classification: LOCKED_BOND }),
  );
  const credit = must(
    createAccount(bond.document, {
      institutionId: raiffeisen.id,
      name: "Kredit",
      isDebt: true,
      defaultClassification: CASH,
    }),
  );
  const creditHolding = must(
    createHolding(credit.document, { accountId: credit.id, name: "Kredit", classification: CASH }),
  );
  return {
    document: creditHolding.document,
    tr: tr.id,
    raiffeisen: raiffeisen.id,
    depot: depot.id,
    etf: etf.id,
    cash: cash.id,
    bond: bond.id,
    credit: creditHolding.id,
  };
}

function save(document: WealthDocument, month: string, values: Partial<Omit<SnapshotInput, "month" | "today">>) {
  return must(saveSnapshot(document, { month, today: TODAY, holdingValues: [], ...values })).document;
}

describe("currentOverview", () => {
  it("is null without any Snapshot", () => {
    expect(currentOverview(createEmptyDocument())).toBeNull();
  });

  it("shows the latest month's Net worth with the change versus last month and versus 12 months ago", () => {
    const { document, cash } = setup();
    let next = save(document, "2025-03", { holdingValues: [{ holdingId: cash, marketValue: 800_000 }] });
    next = save(next, "2026-02", { holdingValues: [{ holdingId: cash, marketValue: 1_000_000 }] });
    next = save(next, "2026-03", { holdingValues: [{ holdingId: cash, marketValue: 1_050_000 }] });
    const overview = currentOverview(next)!;
    expect(overview.month).toBe("2026-03");
    expect(overview.netWorth).toBe(1_050_000);
    expect(overview.vsLastMonth).toEqual({ since: "2026-02", amount: 50_000, percent: 5 });
    expect(overview.vs12MonthsAgo).toEqual({ since: "2025-03", amount: 250_000, percent: 31.25 });
  });

  it("has no change when the earlier month is before the first Snapshot, and no percent from zero", () => {
    const { document, cash } = setup();
    let next = save(document, "2026-02", { holdingValues: [{ holdingId: cash, marketValue: 0 }] });
    next = save(next, "2026-03", { holdingValues: [{ holdingId: cash, marketValue: 10_000 }] });
    const overview = currentOverview(next)!;
    expect(overview.vsLastMonth).toEqual({ since: "2026-02", amount: 10_000, percent: null });
    expect(overview.vs12MonthsAgo).toBeNull();
  });

  it("measures the percent change against the size of a negative earlier Net worth", () => {
    const { document, credit } = setup();
    let next = save(document, "2026-02", { holdingValues: [{ holdingId: credit, marketValue: 200_000 }] });
    next = save(next, "2026-03", { holdingValues: [{ holdingId: credit, marketValue: 150_000 }] });
    expect(currentOverview(next)!.vsLastMonth).toEqual({ since: "2026-02", amount: 50_000, percent: 25 });
  });

  it("splits current Net worth by Asset class, Liquidity and Institution, with debts counting negatively", () => {
    const { document, tr, raiffeisen, etf, cash, bond, credit } = setup();
    const next = save(document, "2026-03", {
      holdingValues: [
        { holdingId: etf, marketValue: 500_000 },
        { holdingId: cash, marketValue: 20_000 },
        { holdingId: bond, marketValue: 300_000 },
        { holdingId: credit, marketValue: 100_000 },
      ],
    });
    const overview = currentOverview(next)!;
    expect(overview.netWorth).toBe(720_000);
    expect(overview.byAssetClass).toEqual({ etf: 500_000, cash: -80_000, bond: 300_000 });
    expect(overview.byLiquidity).toEqual({ available: 420_000, locked: 300_000 });
    expect(overview.byInstitution).toEqual([
      { institutionId: tr, name: "Trade Republic", value: 520_000 },
      { institutionId: raiffeisen, name: "Raiffeisen", value: 200_000 },
    ]);
  });

  it("counts Account-level values under the Account's Default classification and Institution", () => {
    const { document, tr, raiffeisen, depot, bond } = setup();
    let next = must(setPerHoldingFrom(document, { accountId: depot, month: "2026-04" })).document;
    next = save(next, "2026-03", {
      holdingValues: [{ holdingId: bond, marketValue: 300_000 }],
      accountValues: [{ accountId: depot, marketValue: 650_000 }],
    });
    const overview = currentOverview(next)!;
    expect(overview.byAssetClass).toEqual({ etf: 650_000, bond: 300_000 });
    expect(overview.byLiquidity).toEqual({ available: 650_000, locked: 300_000 });
    expect(overview.byInstitution).toEqual([
      { institutionId: tr, name: "Trade Republic", value: 650_000 },
      { institutionId: raiffeisen, name: "Raiffeisen", value: 300_000 },
    ]);
  });

  it("leaves out Institutions that hold nothing in the latest month", () => {
    const { document, tr, cash } = setup();
    const next = save(document, "2026-03", { holdingValues: [{ holdingId: cash, marketValue: 20_000 }] });
    expect(currentOverview(next)!.byInstitution).toEqual([{ institutionId: tr, name: "Trade Republic", value: 20_000 }]);
  });
});

describe("Net worth series by Asset class", () => {
  it("history entered as Account-level values and recent months per Holding form one series by Asset class", () => {
    const { document, depot, etf, cash } = setup();
    let next = must(setPerHoldingFrom(document, { accountId: depot, month: "2026-02" })).document;
    next = save(next, "2025-12", { accountValues: [{ accountId: depot, marketValue: 600_000 }] });
    next = save(next, "2026-02", {
      holdingValues: [
        { holdingId: etf, marketValue: 560_000 },
        { holdingId: cash, marketValue: 70_000 },
      ],
    });
    expect(netWorthSeries(next).map((m) => [m.month, m.byAssetClass])).toEqual([
      ["2025-12", { etf: 600_000 }],
      ["2026-01", { etf: 600_000 }],
      ["2026-02", { etf: 560_000, cash: 70_000 }],
    ]);
  });
});
