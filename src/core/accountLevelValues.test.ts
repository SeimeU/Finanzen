import { describe, expect, it } from "vitest";
import {
  accountDetail,
  contributionSplit,
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  netWorthSeries,
  saveSnapshot,
  setPerHoldingFrom,
  snapshotForm,
  updateAccount,
  type Result,
  type SnapshotInput,
  type WealthDocument,
} from "./index";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

function code(result: Result<object>) {
  return result.ok ? undefined : result.error.code;
}

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
const ETF = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
const LOCKED_BOND = { assetClass: "bond", liquidity: "locked", maturityDate: "2030-06-30" } as const;
const TODAY = "2026-11-26";

/** Depot (Default classification ETF) with MSCI World (ETF) and a cash Holding; a debt Kredit. */
function setup() {
  let document: WealthDocument = createEmptyDocument();
  const bank = must(createInstitution(document, { name: "Trade Republic" }));
  document = bank.document;
  const depot = must(createAccount(document, { institutionId: bank.id, name: "Depot", defaultClassification: ETF }));
  document = depot.document;
  const etf = must(createHolding(document, { accountId: depot.id, name: "MSCI World", classification: ETF }));
  document = etf.document;
  const cash = must(createHolding(document, { accountId: depot.id, name: "Verrechnungskonto", classification: CASH }));
  document = cash.document;
  const credit = must(
    createAccount(document, { institutionId: bank.id, name: "Kredit", isDebt: true, defaultClassification: CASH }),
  );
  document = credit.document;
  return { document, depot: depot.id, etf: etf.id, cash: cash.id, credit: credit.id };
}

function save(document: WealthDocument, month: string, values: Omit<SnapshotInput, "month" | "today">) {
  return must(saveSnapshot(document, { month, today: TODAY, ...values })).document;
}

function switchAt(document: WealthDocument, accountId: string, month: string | null) {
  return must(setPerHoldingFrom(document, { accountId, month })).document;
}

describe("Account-level values (Kontostand gesamt)", () => {
  it("count in Net worth for months before the Account switches to per-Holding values", () => {
    const { document, depot } = setup();
    let next = switchAt(document, depot, "2026-01");
    next = save(next, "2025-11", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 800_000 }] });
    expect(netWorthSeries(next).map((m) => [m.month, m.netWorth])).toEqual([["2025-11", 800_000]]);
  });

  it("an Account cannot have an Account-level value and values per Holding in the same month", () => {
    const { document, depot, etf, cash } = setup();
    const next = switchAt(document, depot, "2026-01");
    const mixed = saveSnapshot(next, {
      month: "2025-11",
      today: TODAY,
      holdingValues: [{ holdingId: etf, marketValue: 500_000 }],
      accountValues: [{ accountId: depot, marketValue: 800_000 }],
    });
    expect(code(mixed)).toBe("mixed-values");
    expect(mixed.ok ? "" : mixed.error.message).toBe(
      "Ein Konto hat in einem Monat entweder einen Kontostand gesamt oder Werte pro Position, nicht beides.",
    );
    // Same rule however the values are ordered or which month it is.
    expect(
      code(
        saveSnapshot(next, {
          month: "2026-02",
          today: TODAY,
          accountValues: [{ accountId: depot, marketValue: 1 }],
          holdingValues: [{ holdingId: cash, marketValue: 1 }],
        }),
      ),
    ).toBe("mixed-values");
  });

  it("each month takes the input its Account's switch month calls for", () => {
    const { document, depot, etf, credit } = setup();
    const next = switchAt(document, depot, "2026-01");
    const attempt = (month: string, values: Omit<SnapshotInput, "month" | "today">) =>
      code(saveSnapshot(next, { month, today: TODAY, ...values }));
    // Before the switch: Kontostand gesamt only.
    expect(attempt("2025-12", { holdingValues: [{ holdingId: etf, marketValue: 1 }] })).toBe("account-level-month");
    // From the switch on: per Holding only.
    expect(attempt("2026-01", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 1 }] })).toBe(
      "per-holding-month",
    );
    expect(attempt("2026-01", { holdingValues: [{ holdingId: etf, marketValue: 1 }] })).toBeUndefined();
    // An Account never switched is per Holding in every month.
    expect(attempt("2020-01", { holdingValues: [], accountValues: [{ accountId: credit, marketValue: 1 }] })).toBe(
      "per-holding-month",
    );
    // Unknown, repeated and fractional Account-level values are rejected.
    expect(attempt("2025-12", { holdingValues: [], accountValues: [{ accountId: "a99", marketValue: 1 }] })).toBe(
      "account-not-found",
    );
    expect(
      attempt("2025-12", {
        holdingValues: [],
        accountValues: [
          { accountId: depot, marketValue: 1 },
          { accountId: depot, marketValue: 2 },
        ],
      }),
    ).toBe("duplicate-account");
    expect(attempt("2025-12", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 0.5 }] })).toBe(
      "invalid-amount",
    );
  });

  it("count under the Account's Default classification, and negatively on a debt Account", () => {
    let { document, depot, etf, cash, credit } = setup();
    const bank = must(createInstitution(document, { name: "Raiffeisen" }));
    const bausparer = must(
      createAccount(bank.document, { institutionId: bank.id, name: "Bausparer", defaultClassification: LOCKED_BOND }),
    );
    document = bausparer.document;
    document = switchAt(document, depot, "2026-01");
    document = switchAt(document, credit, "2026-01");
    document = switchAt(document, bausparer.id, "2026-01");
    document = save(document, "2025-12", {
      holdingValues: [],
      accountValues: [
        { accountId: depot, marketValue: 900_000 },
        { accountId: credit, marketValue: 200_000 },
        { accountId: bausparer.id, marketValue: 300_000 },
      ],
    });
    document = save(document, "2026-01", {
      holdingValues: [
        { holdingId: etf, marketValue: 850_000 },
        { holdingId: cash, marketValue: 60_000 },
      ],
    });
    const [december, january] = netWorthSeries(document);
    expect(december).toMatchObject({
      netWorth: 1_000_000,
      byAssetClass: { etf: 900_000, cash: -200_000, bond: 300_000 },
      byLiquidity: { available: 700_000, locked: 300_000 },
    });
    // From the switch on, the Depot counts per Holding; the others have nothing recorded yet.
    expect(january).toMatchObject({
      netWorth: 910_000,
      byAssetClass: { etf: 850_000, cash: 60_000 },
      byLiquidity: { available: 910_000 },
    });
  });

  it("carry forward until the switch month, and are never carried into per-Holding months", () => {
    const { document, depot, etf } = setup();
    let next = switchAt(document, depot, "2026-01");
    next = save(next, "2025-10", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 700_000 }] });
    next = save(next, "2026-02", { holdingValues: [{ holdingId: etf, marketValue: 750_000 }] });
    const series = netWorthSeries(next);
    expect(series.map((m) => [m.month, m.netWorth])).toEqual([
      ["2025-10", 700_000],
      ["2025-11", 700_000],
      ["2025-12", 700_000],
      ["2026-01", 0],
      ["2026-02", 750_000],
    ]);
    expect(series[0]!.accounts).toEqual([{ accountId: depot, marketValue: 700_000, notUpdated: false }]);
    expect(series[1]!.accounts).toEqual([{ accountId: depot, marketValue: 700_000, notUpdated: true }]);
    expect(series[3]!.accounts).toEqual([]);
    expect(series[3]!.holdings).toEqual([]);
  });

  it("re-saving a month replaces its Account-level values too", () => {
    const { document, depot } = setup();
    let next = switchAt(document, depot, "2026-01");
    next = save(next, "2025-12", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 1_000 }] });
    next = save(next, "2025-12", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 2_000 }] });
    expect(netWorthSeries(next).map((m) => m.netWorth)).toEqual([2_000]);
  });
});

describe("switching an Account to per-Holding values", () => {
  it("can be moved earlier or later as long as no recorded value ends up on the wrong side", () => {
    const { document, depot, etf } = setup();
    let next = switchAt(document, depot, "2026-01");
    next = save(next, "2025-06", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 1 }] });
    next = save(next, "2026-03", { holdingValues: [{ holdingId: etf, marketValue: 2 }] });
    const attempt = (month: string | null) => code(setPerHoldingFrom(next, { accountId: depot, month }));
    expect(attempt("2025-06")).toBe("account-level-values-recorded");
    expect(attempt(null)).toBe("account-level-values-recorded");
    expect(attempt("2026-04")).toBe("values-per-holding-recorded");
    expect(attempt("2025-07")).toBeUndefined();
    expect(attempt("2026-03")).toBeUndefined();
    expect(attempt("2026-13")).toBe("invalid-month");
    expect(code(setPerHoldingFrom(next, { accountId: "a99", month: "2026-01" }))).toBe("account-not-found");
  });

  it("moving the switch changes which months count which values", () => {
    const { document, depot, etf } = setup();
    let next = switchAt(document, depot, "2026-03");
    next = save(next, "2026-01", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 100 }] });
    next = save(next, "2026-03", { holdingValues: [{ holdingId: etf, marketValue: 300 }] });
    expect(netWorthSeries(next).map((m) => m.netWorth)).toEqual([100, 100, 300]);
    next = switchAt(next, depot, "2026-02");
    expect(netWorthSeries(next).map((m) => m.netWorth)).toEqual([100, 0, 300]);
  });

  it("editing the Account keeps its switch month", () => {
    const { document, depot } = setup();
    let next = switchAt(document, depot, "2026-01");
    next = must(updateAccount(next, { id: depot, name: "Wertpapierdepot", defaultClassification: ETF })).document;
    next = save(next, "2025-12", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 5 }] });
    expect(netWorthSeries(next)[0]!.netWorth).toBe(5);
  });
});

describe("Monatsstand form with Account-level values", () => {
  function depotIn(form: ReturnType<typeof snapshotForm>) {
    return form.institutions[0]!.accounts.find((a) => a.name === "Depot")!;
  }

  it("shows a Kontostand gesamt field before the switch month and Holdings from it on", () => {
    const { document, depot, etf } = setup();
    let next = switchAt(document, depot, "2026-01");
    next = save(next, "2025-11", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 700_000 }] });
    next = save(next, "2026-01", { holdingValues: [{ holdingId: etf, marketValue: 750_000 }] });

    const december = snapshotForm(next, "2025-12", TODAY);
    expect(december.previousNetWorth).toBe(700_000);
    expect(depotIn(december)).toMatchObject({
      perHoldingFrom: "2026-01",
      accountValue: { previousValue: 700_000, marketValue: 700_000, recorded: false },
      holdings: [],
      canSwitchToPerHolding: true,
    });
    expect(depotIn(snapshotForm(next, "2025-11", TODAY)).accountValue).toEqual({
      previousValue: null,
      marketValue: 700_000,
      recorded: true,
    });
    // November has a Kontostand gesamt, so the switch cannot move to before it.
    expect(depotIn(snapshotForm(next, "2025-10", TODAY)).canSwitchToPerHolding).toBe(false);

    // The switch month starts from nothing: the Kontostand gesamt is not carried into it.
    const january = snapshotForm(next, "2026-01", TODAY);
    expect(january.previousNetWorth).toBe(700_000);
    expect(depotIn(january).accountValue).toBeNull();
    expect(depotIn(january).holdings.map((h) => [h.name, h.previousValue, h.marketValue, h.recorded])).toEqual([
      ["MSCI World", null, 750_000, true],
      ["Verrechnungskonto", null, null, false],
    ]);
    expect(depotIn(snapshotForm(next, "2026-02", TODAY)).holdings[0]).toMatchObject({ previousValue: 750_000 });
  });

  it("in a per-Holding month, suggests where the switch goes if this month should take a Kontostand gesamt", () => {
    const { document, etf } = setup();
    // No values per Holding yet: everything before the current month becomes history.
    expect(depotIn(snapshotForm(document, "2020-05", TODAY)).accountLevelSwitch).toBe("2026-11");
    expect(depotIn(snapshotForm(document, "2026-11", TODAY)).accountLevelSwitch).toBe("2026-12");
    // Otherwise the first month with values per Holding after this one.
    const next = save(document, "2026-03", { holdingValues: [{ holdingId: etf, marketValue: 1 }] });
    expect(depotIn(snapshotForm(next, "2020-05", TODAY)).accountLevelSwitch).toBe("2026-03");
    // Not possible once values per Holding exist in or before this month.
    expect(depotIn(snapshotForm(next, "2026-03", TODAY)).accountLevelSwitch).toBeNull();
    expect(depotIn(snapshotForm(next, "2026-05", TODAY)).accountLevelSwitch).toBeNull();
  });
});

describe("Konto detail and Contribution split with Account-level values", () => {
  function history() {
    const { document, depot, etf, cash, credit } = setup();
    let next = switchAt(document, depot, "2026-01");
    next = switchAt(next, credit, "2026-01");
    next = save(next, "2025-11", {
      holdingValues: [],
      accountValues: [
        { accountId: depot, marketValue: 700_000 },
        { accountId: credit, marketValue: 100_000 },
      ],
    });
    next = save(next, "2025-12", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 720_000 }] });
    next = save(next, "2026-01", {
      holdingValues: [
        { holdingId: etf, marketValue: 730_000, contribution: 5_000 },
        { holdingId: cash, marketValue: 10_000 },
      ],
    });
    return { document: next, depot, credit };
  }

  it("the Konto's value history includes its months with a Kontostand gesamt", () => {
    const { document, depot, credit } = history();
    expect(accountDetail(document, depot)!.series).toEqual([
      { month: "2025-11", value: 700_000, contribution: 0, notUpdated: false },
      { month: "2025-12", value: 720_000, contribution: 0, notUpdated: false },
      { month: "2026-01", value: 740_000, contribution: 5_000, notUpdated: false },
    ]);
    // The debt's Kontostand gesamt counts negatively, carried forward until its switch.
    expect(accountDetail(document, credit)!.series).toEqual([
      { month: "2025-11", value: -100_000, contribution: 0, notUpdated: false },
      { month: "2025-12", value: -100_000, contribution: 0, notUpdated: true },
    ]);
  });

  it("an investment Account's Kontostand gesamt change is market change, also across the switch", () => {
    const { document } = history();
    expect(contributionSplit(document)).toEqual([
      { month: "2025-12", netWorthChange: 20_000, contribution: 0, marketChange: 20_000, otherChange: 0 },
      // Depot 720.000 (ETF) became MSCI World 730.000 (5.000 paid in) and 10.000 cash; the Kredit has no value any more.
      { month: "2026-01", netWorthChange: 120_000, contribution: 5_000, marketChange: 5_000, otherChange: 110_000 },
    ]);
  });
});
