import { describe, expect, it } from "vitest";
import {
  accountDetail,
  closeAccount,
  closeHolding,
  setPerHoldingFrom,
  setHoldingStart,
  snapshotForm,
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  netWorthSeries,
  saveSnapshot,
  updateHolding,
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
const TODAY = "2026-11-26";

/** Depot with MSCI World and Verrechnungskonto; Girokonto with Giro. */
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
  const giroAccount = must(createAccount(document, { institutionId: bank.id, name: "Girokonto", defaultClassification: CASH }));
  document = giroAccount.document;
  const giro = must(createHolding(document, { accountId: giroAccount.id, name: "Giro", classification: CASH }));
  document = giro.document;
  return { document, bank: bank.id, depot: depot.id, etf: etf.id, cash: cash.id, giroAccount: giroAccount.id, giro: giro.id };
}

function save(document: WealthDocument, month: string, values: Omit<SnapshotInput, "month" | "today">) {
  return must(saveSnapshot(document, { month, today: TODAY, ...values })).document;
}

function netWorths(document: WealthDocument) {
  return netWorthSeries(document).map((m) => [m.month, m.netWorth]);
}

describe("closing a Holding", () => {
  it("contributes nothing from its closing month on and is not carried forward; history stays", () => {
    const { document, etf, cash } = setup();
    let next = save(document, "2026-01", {
      holdingValues: [
        { holdingId: etf, marketValue: 1_000_000 },
        { holdingId: cash, marketValue: 50_000 },
      ],
    });
    next = must(closeHolding(next, { holdingId: etf, month: "2026-03" })).document;
    next = save(next, "2026-04", { holdingValues: [{ holdingId: cash, marketValue: 1_060_000 }] });
    expect(netWorths(next)).toEqual([
      ["2026-01", 1_050_000],
      ["2026-02", 1_050_000],
      ["2026-03", 50_000],
      ["2026-04", 1_060_000],
    ]);
    expect(netWorthSeries(next)[2]!.holdings.map((h) => h.holdingId)).toEqual([cash]);
  });

  it("cannot be closed before a month that already has a value for it", () => {
    const { document, etf } = setup();
    const next = save(document, "2026-03", { holdingValues: [{ holdingId: etf, marketValue: 1_000_000 }] });
    const closed = closeHolding(next, { holdingId: etf, month: "2026-03" });
    expect(code(closed)).toBe("values-after-closing");
    expect(closed.ok ? "" : closed.error.message).toBe(
      "Für diese Position gibt es ab diesem Monat schon Werte. Sie kann erst danach geschlossen werden.",
    );
    expect(code(closeHolding(next, { holdingId: etf, month: "2026-04" }))).toBeUndefined();
  });

  it("takes no value from its closing month on", () => {
    const { document, etf } = setup();
    const next = must(closeHolding(document, { holdingId: etf, month: "2026-03" })).document;
    const late = saveSnapshot(next, { month: "2026-05", today: TODAY, holdingValues: [{ holdingId: etf, marketValue: 1 }] });
    expect(code(late)).toBe("holding-not-active");
    expect(code(saveSnapshot(next, { month: "2026-02", today: TODAY, holdingValues: [{ holdingId: etf, marketValue: 1 }] }))).toBeUndefined();
  });

  it("can be reopened", () => {
    const { document, etf } = setup();
    let next = save(document, "2026-01", { holdingValues: [{ holdingId: etf, marketValue: 1_000 }] });
    next = must(closeHolding(next, { holdingId: etf, month: "2026-02" })).document;
    next = save(next, "2026-03", { holdingValues: [] });
    next = must(closeHolding(next, { holdingId: etf, month: null })).document;
    expect(netWorths(next)).toEqual([
      ["2026-01", 1_000],
      ["2026-02", 1_000],
      ["2026-03", 1_000],
    ]);
  });
});

describe("a Holding's starting month", () => {
  it("a new Holding added from a month takes values from that month on only", () => {
    const { document, depot } = setup();
    const added = must(
      createHolding(document, { accountId: depot, name: "S&P 500", classification: ETF, startMonth: "2026-04" }),
    );
    const early = saveSnapshot(added.document, {
      month: "2026-03",
      today: TODAY,
      holdingValues: [{ holdingId: added.id, marketValue: 100 }],
    });
    expect(code(early)).toBe("holding-not-active");
    const next = save(added.document, "2026-04", { holdingValues: [{ holdingId: added.id, marketValue: 200_000 }] });
    expect(netWorths(next)).toEqual([["2026-04", 200_000]]);
  });

  it("cannot be set after a month that already has a value for it", () => {
    const { document, etf } = setup();
    const next = save(document, "2026-02", { holdingValues: [{ holdingId: etf, marketValue: 1_000 }] });
    const late = setHoldingStart(next, { holdingId: etf, month: "2026-03" });
    expect(code(late)).toBe("values-before-start");
    expect(late.ok ? "" : late.error.message).toBe(
      "Für diese Position gibt es schon Werte vor diesem Monat. Sie muss spätestens dann beginnen.",
    );
    expect(code(setHoldingStart(next, { holdingId: etf, month: "2026-02" }))).toBeUndefined();
    expect(code(setHoldingStart(next, { holdingId: etf, month: null }))).toBeUndefined();
  });

  it("can be changed while editing the Holding, under the same rules", () => {
    const { document, etf } = setup();
    const next = save(document, "2026-02", { holdingValues: [{ holdingId: etf, marketValue: 1_000 }] });
    const edit = { id: etf, name: "MSCI World", classification: ETF };
    expect(code(updateHolding(next, { ...edit, startMonth: "2026-03" }))).toBe("values-before-start");
    const started = must(updateHolding(next, { ...edit, startMonth: "2026-02" })).document;
    expect(code(saveSnapshot(started, { month: "2026-01", today: TODAY, holdingValues: [{ holdingId: etf, marketValue: 1 }] }))).toBe(
      "holding-not-active",
    );
    // Left out: the starting month stays.
    const renamed = must(updateHolding(started, { ...edit, name: "MSCI ACWI" })).document;
    expect(code(saveSnapshot(renamed, { month: "2026-01", today: TODAY, holdingValues: [{ holdingId: etf, marketValue: 1 }] }))).toBe(
      "holding-not-active",
    );
  });

  it("must lie before the closing month", () => {
    const { document, etf } = setup();
    const started = must(setHoldingStart(document, { holdingId: etf, month: "2026-04" })).document;
    expect(code(closeHolding(started, { holdingId: etf, month: "2026-04" }))).toBe("closing-not-after-start");
    const closed = must(closeHolding(started, { holdingId: etf, month: "2026-05" })).document;
    expect(code(setHoldingStart(closed, { holdingId: etf, month: "2026-05" }))).toBe("closing-not-after-start");
  });
});

describe("closing an Account", () => {
  it("drops its Holdings from the closing month on; no history moves to the new Account", () => {
    const { document, bank, depot, etf, giro } = setup();
    let next = save(document, "2026-01", {
      holdingValues: [
        { holdingId: etf, marketValue: 1_000_000 },
        { holdingId: giro, marketValue: 20_000 },
      ],
    });
    next = must(closeAccount(next, { accountId: depot, month: "2026-02" })).document;
    const moved = must(createAccount(next, { institutionId: bank, name: "Depot neu", defaultClassification: ETF }));
    const newEtf = must(
      createHolding(moved.document, { accountId: moved.id, name: "MSCI World", classification: ETF, startMonth: "2026-02" }),
    );
    next = save(newEtf.document, "2026-02", { holdingValues: [{ holdingId: newEtf.id, marketValue: 1_010_000 }] });
    expect(netWorths(next)).toEqual([
      ["2026-01", 1_020_000],
      ["2026-02", 1_030_000],
    ]);
    expect(netWorthSeries(next)[1]!.holdings.map((h) => h.holdingId)).toEqual([giro, newEtf.id]);
  });

  it("drops a carried-forward Kontostand gesamt from the closing month on", () => {
    const { document, depot } = setup();
    let next = must(setPerHoldingFrom(document, { accountId: depot, month: "2026-01" })).document;
    next = save(next, "2025-03", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 500_000 }] });
    next = must(closeAccount(next, { accountId: depot, month: "2025-05" })).document;
    next = save(next, "2025-06", { holdingValues: [] });
    expect(netWorths(next)).toEqual([
      ["2025-03", 500_000],
      ["2025-04", 500_000],
      ["2025-05", 0],
      ["2025-06", 0],
    ]);
    expect(netWorthSeries(next)[2]!.accounts).toEqual([]);
  });

  it("cannot be closed before a month that already has a value for it", () => {
    const { document, depot, cash } = setup();
    const perHolding = save(document, "2026-03", { holdingValues: [{ holdingId: cash, marketValue: 1 }] });
    expect(code(closeAccount(perHolding, { accountId: depot, month: "2026-03" }))).toBe("values-after-closing");
    expect(code(closeAccount(perHolding, { accountId: depot, month: "2026-04" }))).toBeUndefined();
    let accountLevel = must(setPerHoldingFrom(document, { accountId: depot, month: "2026-01" })).document;
    accountLevel = save(accountLevel, "2025-06", { holdingValues: [], accountValues: [{ accountId: depot, marketValue: 1 }] });
    const closed = closeAccount(accountLevel, { accountId: depot, month: "2025-06" });
    expect(code(closed)).toBe("values-after-closing");
    expect(closed.ok ? "" : closed.error.message).toBe(
      "Für dieses Konto gibt es ab diesem Monat schon Werte. Es kann erst danach geschlossen werden.",
    );
  });

  it("takes no values from its closing month on", () => {
    const { document, depot, etf } = setup();
    let next = must(setPerHoldingFrom(document, { accountId: depot, month: "2026-01" })).document;
    next = must(closeAccount(next, { accountId: depot, month: "2025-05" })).document;
    const accountLevel = saveSnapshot(next, {
      month: "2025-05",
      today: TODAY,
      holdingValues: [],
      accountValues: [{ accountId: depot, marketValue: 1 }],
    });
    expect(code(accountLevel)).toBe("account-closed");
    const perHolding = saveSnapshot(next, { month: "2026-02", today: TODAY, holdingValues: [{ holdingId: etf, marketValue: 1 }] });
    expect(code(perHolding)).toBe("account-closed");
  });
});

describe("the Monatsstand form", () => {
  function shown(document: WealthDocument, month: string) {
    return snapshotForm(document, month, TODAY).institutions.flatMap((i) =>
      i.accounts.map((a) => [a.name, a.accountValue ? "Kontostand gesamt" : a.holdings.map((h) => h.name)]),
    );
  }

  it("hides Holdings that are closed or not yet started", () => {
    const { document, depot, etf } = setup();
    let next = must(closeHolding(document, { holdingId: etf, month: "2026-03" })).document;
    next = must(
      createHolding(next, { accountId: depot, name: "S&P 500", classification: ETF, startMonth: "2026-03" }),
    ).document;
    expect(shown(next, "2026-02")).toEqual([
      ["Depot", ["MSCI World", "Verrechnungskonto"]],
      ["Girokonto", ["Giro"]],
    ]);
    expect(shown(next, "2026-03")).toEqual([
      ["Depot", ["Verrechnungskonto", "S&P 500"]],
      ["Girokonto", ["Giro"]],
    ]);
  });

  it("hides closed Accounts, also in Kontostand gesamt months, and Accounts whose Holdings are all closed", () => {
    const { document, depot, giro } = setup();
    let next = must(setPerHoldingFrom(document, { accountId: depot, month: "2026-01" })).document;
    next = must(closeAccount(next, { accountId: depot, month: "2025-06" })).document;
    next = must(closeHolding(next, { holdingId: giro, month: "2025-07" })).document;
    expect(shown(next, "2025-05")).toEqual([
      ["Depot", "Kontostand gesamt"],
      ["Girokonto", ["Giro"]],
    ]);
    expect(shown(next, "2025-06")).toEqual([["Girokonto", ["Giro"]]]);
    expect(shown(next, "2025-07")).toEqual([]);
    expect(snapshotForm(next, "2025-07", TODAY).institutions).toEqual([]);
    expect(snapshotForm(next, "2025-07", TODAY).hasHoldings).toBe(true);
    expect(snapshotForm(createEmptyDocument(), "2025-07", TODAY).hasHoldings).toBe(false);
  });
});

describe("history before closing", () => {
  it("stays in the closed Account's detail", () => {
    const { document, depot, etf, giro } = setup();
    let next = save(document, "2026-01", { holdingValues: [{ holdingId: etf, marketValue: 1_000_000 }] });
    next = save(next, "2026-02", { holdingValues: [{ holdingId: etf, marketValue: 1_100_000 }] });
    next = must(closeAccount(next, { accountId: depot, month: "2026-03" })).document;
    next = save(next, "2026-04", { holdingValues: [{ holdingId: giro, marketValue: 1_100_000 }] });
    expect(accountDetail(next, depot)!.series.map((m) => [m.month, m.value])).toEqual([
      ["2026-01", 1_000_000],
      ["2026-02", 1_100_000],
    ]);
    expect(netWorths(next)).toEqual([
      ["2026-01", 1_000_000],
      ["2026-02", 1_100_000],
      ["2026-03", 0],
      ["2026-04", 1_100_000],
    ]);
  });
});
