import { describe, expect, it } from "vitest";
import {
  closeAccount,
  closeHolding,
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  maturityTimeline,
  setPerHoldingFrom,
  saveSnapshot,
  type Classification,
  type Result,
  type SnapshotInput,
  type WealthDocument,
} from "./index";

function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

const CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;
const locked = (maturityDate: string, assetClass: Classification["assetClass"] = "bond"): Classification => ({
  assetClass,
  liquidity: "locked",
  maturityDate,
});
const TODAY = "2026-11-26";

/** Raiffeisen: Sparkonto (Cash) and Festgeld with two Locked tranches; Allianz: a pension Locked until 2055. */
function setup() {
  const raiffeisen = must(createInstitution(createEmptyDocument(), { name: "Raiffeisen" }));
  const allianz = must(createInstitution(raiffeisen.document, { name: "Allianz" }));
  const spar = must(
    createAccount(allianz.document, { institutionId: raiffeisen.id, name: "Sparkonto", defaultClassification: CASH }),
  );
  const sparHolding = must(createHolding(spar.document, { accountId: spar.id, name: "Sparkonto", classification: CASH }));
  const festgeld = must(
    createAccount(sparHolding.document, {
      institutionId: raiffeisen.id,
      name: "Festgeld",
      defaultClassification: locked("2030-06-30"),
    }),
  );
  const late = must(
    createHolding(festgeld.document, { accountId: festgeld.id, name: "Festgeld 2030", classification: locked("2030-06-30") }),
  );
  const early = must(
    createHolding(late.document, { accountId: festgeld.id, name: "Festgeld 2027", classification: locked("2027-03-31") }),
  );
  const pensionAccount = must(
    createAccount(early.document, {
      institutionId: allianz.id,
      name: "Pensionsvorsorge",
      defaultClassification: locked("2055-01-01", "other"),
    }),
  );
  const pension = must(
    createHolding(pensionAccount.document, {
      accountId: pensionAccount.id,
      name: "Pension",
      classification: locked("2055-01-01", "other"),
    }),
  );
  return {
    document: pension.document,
    spar: sparHolding.id,
    festgeld: festgeld.id,
    late: late.id,
    early: early.id,
    pensionAccount: pensionAccount.id,
    pension: pension.id,
  };
}

function save(document: WealthDocument, month: string, values: Partial<Omit<SnapshotInput, "month" | "today">>) {
  return must(saveSnapshot(document, { month, today: TODAY, holdingValues: [], ...values })).document;
}

describe("maturityTimeline", () => {
  it("lists the Locked Holdings ordered by Maturity date with their latest Market value", () => {
    const s = setup();
    let document = save(s.document, "2026-09", {
      holdingValues: [
        { holdingId: s.spar, marketValue: 300_000 },
        { holdingId: s.late, marketValue: 1_000_000 },
        { holdingId: s.early, marketValue: 500_000 },
        { holdingId: s.pension, marketValue: 2_000_000 },
      ],
    });
    document = save(document, "2026-10", { holdingValues: [{ holdingId: s.early, marketValue: 510_000 }] });

    const { entries } = maturityTimeline(document, TODAY);

    expect(entries).toEqual([
      {
        holdingId: s.early,
        holdingName: "Festgeld 2027",
        accountId: s.festgeld,
        accountName: "Festgeld",
        maturityDate: "2027-03-31",
        marketValue: 510_000,
        matured: false,
      },
      {
        holdingId: s.late,
        holdingName: "Festgeld 2030",
        accountId: s.festgeld,
        accountName: "Festgeld",
        maturityDate: "2030-06-30",
        marketValue: 1_000_000,
        matured: false,
      },
      {
        holdingId: s.pension,
        holdingName: "Pension",
        accountId: s.pensionAccount,
        accountName: "Pensionsvorsorge",
        maturityDate: "2055-01-01",
        marketValue: 2_000_000,
        matured: false,
      },
    ]);
  });

  it("marks Holdings whose Maturity date has passed as matured; one maturing today is not yet", () => {
    const s = setup();
    const document = save(s.document, "2026-09", {
      holdingValues: [
        { holdingId: s.late, marketValue: 1_000_000 },
        { holdingId: s.early, marketValue: 500_000 },
      ],
    });

    const matured = (today: string) =>
      maturityTimeline(document, today).entries.map((e) => [e.holdingName, e.matured]);

    expect(matured("2027-03-31")).toEqual([
      ["Festgeld 2027", false],
      ["Festgeld 2030", false],
      ["Pension", false],
    ]);
    expect(matured("2027-04-01")).toEqual([
      ["Festgeld 2027", true],
      ["Festgeld 2030", false],
      ["Pension", false],
    ]);
  });

  it("lists a Locked Holding without any value with no amount", () => {
    const s = setup();
    const document = save(s.document, "2026-09", { holdingValues: [{ holdingId: s.early, marketValue: 500_000 }] });

    const values = maturityTimeline(document, TODAY).entries.map((e) => [e.holdingName, e.marketValue]);

    expect(values).toEqual([
      ["Festgeld 2027", 500_000],
      ["Festgeld 2030", null],
      ["Pension", null],
    ]);
    expect(maturityTimeline(createEmptyDocument(), TODAY).entries).toEqual([]);
  });

  it("counts a Locked Holding on a debt Account negatively", () => {
    const raiffeisen = must(createInstitution(createEmptyDocument(), { name: "Raiffeisen" }));
    const loan = must(
      createAccount(raiffeisen.document, {
        institutionId: raiffeisen.id,
        name: "Bauspardarlehen",
        isDebt: true,
        defaultClassification: locked("2031-12-31"),
      }),
    );
    const holding = must(
      createHolding(loan.document, { accountId: loan.id, name: "Darlehen", classification: locked("2031-12-31") }),
    );
    const document = save(holding.document, "2026-09", { holdingValues: [{ holdingId: holding.id, marketValue: 40_000 }] });

    expect(maturityTimeline(document, TODAY).entries.map((e) => e.marketValue)).toEqual([-40_000]);
  });

  it("gives the next Maturity date with the total maturing that day, skipping matured Holdings", () => {
    const s = setup();
    const sameDay = must(
      createHolding(s.document, { accountId: s.festgeld, name: "Festgeld 2030 b", classification: locked("2030-06-30") }),
    );
    const document = save(sameDay.document, "2026-09", {
      holdingValues: [
        { holdingId: s.late, marketValue: 1_000_000 },
        { holdingId: sameDay.id, marketValue: 250_000 },
        { holdingId: s.early, marketValue: 500_000 },
      ],
    });

    expect(maturityTimeline(document, TODAY).next).toEqual({ maturityDate: "2027-03-31", amount: 500_000 });
    expect(maturityTimeline(document, "2027-03-31").next).toEqual({ maturityDate: "2027-03-31", amount: 500_000 });
    expect(maturityTimeline(document, "2027-04-01").next).toEqual({ maturityDate: "2030-06-30", amount: 1_250_000 });
    expect(maturityTimeline(document, "2055-01-02").next).toBeNull();
  });

  it("leaves out closed Holdings and the Holdings of closed Accounts", () => {
    const s = setup();
    let document = save(s.document, "2026-09", {
      holdingValues: [
        { holdingId: s.late, marketValue: 1_000_000 },
        { holdingId: s.early, marketValue: 500_000 },
        { holdingId: s.pension, marketValue: 2_000_000 },
      ],
    });
    document = must(closeHolding(document, { holdingId: s.early, month: "2026-10" })).document;
    document = must(closeAccount(document, { accountId: s.pensionAccount, month: "2026-11" })).document;

    const timeline = maturityTimeline(document, TODAY);

    expect(timeline.entries.map((e) => e.holdingName)).toEqual(["Festgeld 2030"]);
    expect(timeline.next).toEqual({ maturityDate: "2030-06-30", amount: 1_000_000 });
  });

  it("lists an Account Locked via its Default classification and valued as a whole, with its Account-level value", () => {
    const s = setup();
    // The pension is recorded as one Kontostand gesamt until 2027: its Holding has no value of its own.
    let document = must(setPerHoldingFrom(s.document, { accountId: s.pensionAccount, month: "2027-01" })).document;
    document = save(document, "2026-09", {
      holdingValues: [{ holdingId: s.early, marketValue: 500_000 }],
      accountValues: [{ accountId: s.pensionAccount, marketValue: 2_000_000 }],
    });

    const timeline = maturityTimeline(document, TODAY);

    expect(timeline.entries.map((e) => [e.holdingName, e.accountName, e.maturityDate, e.marketValue])).toEqual([
      ["Festgeld 2027", "Festgeld", "2027-03-31", 500_000],
      ["Festgeld 2030", "Festgeld", "2030-06-30", null],
      [null, "Pensionsvorsorge", "2055-01-01", 2_000_000],
    ]);
    expect(timeline.entries.at(-1)).toMatchObject({ holdingId: null, accountId: s.pensionAccount, matured: false });
    expect(maturityTimeline(document, "2055-01-02").entries.at(-1)!.matured).toBe(true);
  });

  it("an Account valued as a whole under an Available Default classification has nothing Locked to list", () => {
    const s = setup();
    const spar = must(createAccount(s.document, { institutionId: "i1", name: "Bauspar", defaultClassification: CASH }));
    const bauspar = must(createHolding(spar.document, { accountId: spar.id, name: "Bausparvertrag", classification: locked("2028-12-31") }));
    let document = must(setPerHoldingFrom(bauspar.document, { accountId: spar.id, month: "2027-01" })).document;
    document = save(document, "2026-09", { accountValues: [{ accountId: spar.id, marketValue: 80_000 }] });

    expect(maturityTimeline(document, TODAY).entries.map((e) => e.accountName)).not.toContain("Bauspar");
  });

  it("still lists a Holding whose closing month is after today's month", () => {
    const s = setup();
    let document = save(s.document, "2026-09", { holdingValues: [{ holdingId: s.early, marketValue: 500_000 }] });
    document = must(closeHolding(document, { holdingId: s.early, month: "2026-12" })).document;

    expect(maturityTimeline(document, TODAY).entries.map((e) => e.holdingName)).toContain("Festgeld 2027");
  });
});
