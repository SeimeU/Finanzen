import { describe, expect, it } from "vitest";
import {
  createAccount,
  createEmptyDocument,
  createHolding,
  createInstitution,
  listStructure,
  updateAccount,
  updateHolding,
  updateInstitution,
  valuationOfAccount,
  valuationOfHolding,
  type Classification,
  type Result,
  type WealthDocument,
} from "./index";

/** Unwraps a successful command result, failing the test otherwise. */
function must<T extends object>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
  return result;
}

function errorCode(result: Result<object>): string | undefined {
  return result.ok ? undefined : result.error.code;
}

const AVAILABLE_CASH = { assetClass: "cash", liquidity: "available", maturityDate: null } as const;

function withInstitution(): { document: WealthDocument; institutionId: string } {
  const { document, id } = must(createInstitution(createEmptyDocument(), { name: "Raiffeisen" }));
  return { document, institutionId: id };
}

describe("Institutions", () => {
  it("a created Institution is listed with its name", () => {
    const result = createInstitution(createEmptyDocument(), { name: "Trade Republic" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(listStructure(result.document)).toEqual([
      { id: result.id, name: "Trade Republic", accounts: [] },
    ]);
  });
});

describe("Accounts", () => {
  it("a created Account is listed under its Institution with IBAN and Default classification", () => {
    const { document, institutionId } = withInstitution();
    const { document: next, id } = must(
      createAccount(document, {
        institutionId,
        name: "Girokonto",
        iban: "at61 1904 3002 3457 3201",
        isDebt: false,
        defaultClassification: AVAILABLE_CASH,
      }),
    );
    expect(listStructure(next)[0]!.accounts).toEqual([
      {
        id,
        name: "Girokonto",
        iban: "AT611904300234573201",
        isDebt: false,
        defaultClassification: AVAILABLE_CASH,
        closingMonth: null,
        holdings: [],
      },
    ]);
  });
});

function withAccount(): { document: WealthDocument; accountId: string } {
  const { document, institutionId } = withInstitution();
  const { document: next, id } = must(
    createAccount(document, { institutionId, name: "Depot", defaultClassification: AVAILABLE_CASH }),
  );
  return { document: next, accountId: id };
}

function holdingsOf(document: WealthDocument) {
  return listStructure(document)[0]!.accounts[0]!.holdings;
}

describe("Holdings", () => {
  it("a created Holding is listed under its Account with its classification", () => {
    const { document, accountId } = withAccount();
    const classification = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
    const { document: next, id } = must(
      createHolding(document, { accountId, name: "MSCI World", classification }),
    );
    expect(holdingsOf(next)).toEqual([{ id, name: "MSCI World", classification, startMonth: null, closingMonth: null }]);
  });

  it("accepts every Asset class", () => {
    const { document, accountId } = withAccount();
    for (const assetClass of ["cash", "etf", "stock", "bond", "crypto", "commodity", "other"]) {
      const classification = { assetClass, liquidity: "available", maturityDate: null } as Classification;
      expect(createHolding(document, { accountId, name: assetClass, classification }).ok).toBe(true);
    }
  });

  it("a pension is a Holding Locked until the retirement date", () => {
    const { document, accountId } = withAccount();
    const classification = { assetClass: "other", liquidity: "locked", maturityDate: "2055-06-30" } as const;
    const { document: next } = must(createHolding(document, { accountId, name: "Pensionsvorsorge", classification }));
    expect(holdingsOf(next)[0]!.classification).toEqual(classification);
  });

  it("rejects a Locked Holding without a Maturity date", () => {
    const { document, accountId } = withAccount();
    for (const maturityDate of [null, "", "31.12.2030", "2030-02-30"]) {
      const classification = { assetClass: "bond", liquidity: "locked", maturityDate } as Classification;
      expect(errorCode(createHolding(document, { accountId, name: "Festgeld", classification }))).toBe(
        "maturity-date-required",
      );
    }
  });

  it("drops a Maturity date from an Available Holding", () => {
    const { document, accountId } = withAccount();
    const classification = { assetClass: "cash", liquidity: "available", maturityDate: "2030-01-01" } as const;
    const { document: next } = must(createHolding(document, { accountId, name: "Tagesgeld", classification }));
    expect(holdingsOf(next)[0]!.classification.maturityDate).toBeNull();
  });

  it("rejects an unknown Asset class or Liquidity", () => {
    const { document, accountId } = withAccount();
    const badAsset = { assetClass: "gold", liquidity: "available", maturityDate: null } as unknown as Classification;
    const badLiquidity = { assetClass: "cash", liquidity: "soon", maturityDate: null } as unknown as Classification;
    expect(errorCode(createHolding(document, { accountId, name: "x", classification: badAsset }))).toBe(
      "invalid-asset-class",
    );
    expect(errorCode(createHolding(document, { accountId, name: "x", classification: badLiquidity }))).toBe(
      "invalid-liquidity",
    );
  });

  it("rejects a Holding without a name or an existing Account", () => {
    const { document, accountId } = withAccount();
    expect(errorCode(createHolding(document, { accountId, name: "  ", classification: AVAILABLE_CASH }))).toBe(
      "name-required",
    );
    expect(errorCode(createHolding(document, { accountId: "a99", name: "x", classification: AVAILABLE_CASH }))).toBe(
      "account-not-found",
    );
  });

  it("an Account's Default classification is validated the same way", () => {
    const { document, institutionId } = withInstitution();
    const locked = { assetClass: "bond", liquidity: "locked", maturityDate: null } as const;
    expect(errorCode(createAccount(document, { institutionId, name: "Festgeld", defaultClassification: locked }))).toBe(
      "maturity-date-required",
    );
  });
});

describe("IBAN", () => {
  it("is optional", () => {
    const { document, institutionId } = withInstitution();
    for (const iban of [undefined, null, "", "  "]) {
      const { document: next } = must(
        createAccount(document, { institutionId, name: "Bargeld", iban, defaultClassification: AVAILABLE_CASH }),
      );
      expect(listStructure(next)[0]!.accounts[0]!.iban).toBeNull();
    }
  });

  it("rejects a mistyped IBAN", () => {
    const { document, institutionId } = withInstitution();
    for (const iban of ["AT61 1904 3002 3457 3202", "Girokonto"]) {
      expect(
        errorCode(createAccount(document, { institutionId, name: "Giro", iban, defaultClassification: AVAILABLE_CASH })),
      ).toBe("invalid-iban");
    }
  });
});

describe("editing", () => {
  it("renames an Institution", () => {
    const { document, institutionId } = withInstitution();
    const { document: next } = must(updateInstitution(document, { id: institutionId, name: "Raiffeisenbank" }));
    expect(listStructure(next)[0]!.name).toBe("Raiffeisenbank");
    expect(errorCode(updateInstitution(document, { id: institutionId, name: "" }))).toBe("name-required");
    expect(errorCode(updateInstitution(document, { id: "i99", name: "x" }))).toBe("institution-not-found");
  });

  it("edits an Account's name, IBAN, debt flag and Default classification", () => {
    const { document, accountId } = withAccount();
    const locked = { assetClass: "bond", liquidity: "locked", maturityDate: "2027-03-31" } as const;
    const { document: next } = must(
      updateAccount(document, {
        id: accountId,
        name: "Festgeld",
        iban: "AT611904300234573201",
        isDebt: true,
        defaultClassification: locked,
      }),
    );
    expect(listStructure(next)[0]!.accounts[0]).toMatchObject({
      id: accountId,
      name: "Festgeld",
      iban: "AT611904300234573201",
      isDebt: true,
      defaultClassification: locked,
    });
    expect(errorCode(updateAccount(document, { id: accountId, name: "x", defaultClassification: { ...locked, maturityDate: null } }))).toBe(
      "maturity-date-required",
    );
    expect(errorCode(updateAccount(document, { id: "a99", name: "x", defaultClassification: AVAILABLE_CASH }))).toBe(
      "account-not-found",
    );
  });

  it("edits a Holding's name and classification", () => {
    const { document, accountId } = withAccount();
    const { document: withHolding, id } = must(
      createHolding(document, { accountId, name: "ETF", classification: AVAILABLE_CASH }),
    );
    const etf = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
    const { document: next } = must(updateHolding(withHolding, { id, name: "MSCI World", classification: etf }));
    expect(holdingsOf(next)).toEqual([{ id, name: "MSCI World", classification: etf, startMonth: null, closingMonth: null }]);
    expect(errorCode(updateHolding(withHolding, { id: "h99", name: "x", classification: etf }))).toBe(
      "holding-not-found",
    );
  });

  it("commands never mutate the document they are given", () => {
    const { document, accountId } = withAccount();
    const before = JSON.stringify(document);
    must(createHolding(document, { accountId, name: "ETF", classification: AVAILABLE_CASH }));
    must(updateAccount(document, { id: accountId, name: "Neu", defaultClassification: AVAILABLE_CASH }));
    expect(JSON.stringify(document)).toBe(before);
  });
});

describe("valuation: how a recorded value counts", () => {
  it("a Holding counts under its current classification, so a change reaches every month", () => {
    const { document, accountId } = withAccount();
    const { document: withHolding, id } = must(
      createHolding(document, { accountId, name: "ETF", classification: AVAILABLE_CASH }),
    );
    expect(valuationOfHolding(withHolding, id)).toEqual({ classification: AVAILABLE_CASH, sign: 1 });

    const etf = { assetClass: "etf", liquidity: "available", maturityDate: null } as const;
    const { document: next } = must(updateHolding(withHolding, { id, name: "ETF", classification: etf }));
    expect(valuationOfHolding(next, id)).toEqual({ classification: etf, sign: 1 });
  });

  it("an Account-level value counts under the Account's Default classification", () => {
    const { document, accountId } = withAccount();
    expect(valuationOfAccount(document, accountId)).toEqual({ classification: AVAILABLE_CASH, sign: 1 });
  });

  it("values on a debt Account count negatively, for its Holdings and Account-level values", () => {
    const { document, accountId } = withAccount();
    const { document: withHolding, id } = must(
      createHolding(document, { accountId, name: "Kredit", classification: AVAILABLE_CASH }),
    );
    const { document: debt } = must(
      updateAccount(withHolding, { id: accountId, name: "Kredit", isDebt: true, defaultClassification: AVAILABLE_CASH }),
    );
    expect(valuationOfHolding(debt, id).sign).toBe(-1);
    expect(valuationOfAccount(debt, accountId).sign).toBe(-1);
  });
});
