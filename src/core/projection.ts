import {
  ASSET_CLASSES,
  PROJECTION_HORIZONS,
  type AssetClass,
  type Liquidity,
  type ProjectionAssumptions,
  type WealthDocument,
  type YearMonth,
} from "./document";
import { fail, type Result } from "./result";
import { contributionSplit } from "./accountDetail";
import { netWorthSeries, nextMonth } from "./snapshots";
import { valuationOfAccount, valuationOfHolding, type Valuation } from "./structure";

export { defaultProjectionAssumptions, PROJECTION_HORIZONS, type ProjectionAssumptions } from "./document";

/** Largest expected annual return (and band spread) the owner can enter, in percent either way. */
const MAX_RETURN = 100;
const MAX_SPREAD = 50;

/** Replaces the stored Projection assumptions. */
export function setProjectionAssumptions(
  document: WealthDocument,
  input: ProjectionAssumptions,
): Result<{ document: WealthDocument }> {
  if (!PROJECTION_HORIZONS.includes(input.horizonYears)) {
    return fail("invalid-horizon", "Bitte einen Zeitraum von 5, 10 oder 20 Jahren wählen.");
  }
  const returns = input.annualReturns ?? {};
  if (!ASSET_CLASSES.every((c) => isNumberWithin(returns[c], -MAX_RETURN, MAX_RETURN))) {
    return fail("invalid-return", `Bitte für jede Anlageklasse eine Rendite zwischen -${MAX_RETURN} % und ${MAX_RETURN} % eingeben.`);
  }
  if (input.monthlySavings !== null && !Number.isSafeInteger(input.monthlySavings)) {
    return fail("invalid-savings", "Bitte einen gültigen Sparbetrag eingeben.");
  }
  if (!isNumberWithin(input.bandSpread, 0, MAX_SPREAD)) {
    return fail("invalid-spread", `Bitte eine Bandbreite zwischen 0 und ${MAX_SPREAD} Prozentpunkten eingeben.`);
  }
  const projectionAssumptions: ProjectionAssumptions = {
    annualReturns: Object.fromEntries(ASSET_CLASSES.map((c) => [c, returns[c]])) as ProjectionAssumptions["annualReturns"],
    monthlySavings: input.monthlySavings,
    horizonYears: input.horizonYears,
    bandSpread: input.bandSpread,
  };
  return { ok: true, document: { ...document, projectionAssumptions } };
}

function isNumberWithin(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export type ProjectionMonth = {
  month: YearMonth;
  /** Expected Net worth in cents. */
  netWorth: number;
  /** Net worth with every return raised by the band spread. */
  optimistic: number;
  /** Net worth with every return lowered by the band spread. */
  pessimistic: number;
  /** The expected Net worth split by Liquidity; a Locked value counts as Available from its Maturity date's month. */
  byLiquidity: Record<Liquidity, number>;
};

export type Projection = {
  assumptions: ProjectionAssumptions;
  /** Cents: the average over the last 12 months (fewer if there are fewer) of Contributions plus the growth in cash. */
  defaultMonthlySavings: number;
  /** Cents actually added each month: the owner's amount, or the default. */
  monthlySavings: number;
  /** From the latest Snapshot month (actual values) through horizonYears × 12 months after it. */
  months: ProjectionMonth[];
};

/**
 * One value the Projection grows: a Holding's or an Account-level value, signed like Net worth.
 * `maturity`: the month a Locked value becomes Available (null: Available already).
 */
type Bucket = { assetClass: AssetClass; maturity: YearMonth | null; amount: number };

/** One scenario's month: total and the part still Locked, unrounded cents. */
type Point = { month: YearMonth; total: number; locked: number };

/** The Projection from the latest Snapshot month on; null without any Snapshot. */
export function projection(document: WealthDocument): Projection | null {
  const latest = netWorthSeries(document).at(-1);
  if (!latest) return null;
  const assumptions = document.projectionAssumptions;
  const start: Bucket[] = [
    ...latest.accounts.map((v) => bucket(valuationOfAccount(document, v.accountId), v.marketValue)),
    ...latest.holdings.map((v) => bucket(valuationOfHolding(document, v.holdingId), v.marketValue)),
  ];
  const defaultMonthlySavings = defaultSavings(document);
  const savings = assumptions.monthlySavings ?? defaultMonthlySavings;
  const scenario = (shift: number) => simulate(latest.month, start, savings, assumptions, shift);
  const optimistic = scenario(assumptions.bandSpread);
  const pessimistic = scenario(-assumptions.bandSpread);
  const months = scenario(0).map((point, i): ProjectionMonth => {
    const netWorth = Math.round(point.total);
    const locked = Math.round(point.locked);
    return {
      month: point.month,
      netWorth,
      optimistic: Math.round(optimistic[i]!.total),
      pessimistic: Math.round(pessimistic[i]!.total),
      byLiquidity: { available: netWorth - locked, locked },
    };
  });
  return { assumptions, defaultMonthlySavings, monthlySavings: savings, months };
}

/**
 * Ticket 11's split: what the owner saved in a month is the Contributions plus the other
 * (cash and debt) change, i.e. the Net worth change without the investments' market change.
 */
function defaultSavings(document: WealthDocument): number {
  const lastYear = contributionSplit(document).slice(-12);
  if (lastYear.length === 0) return 0;
  return Math.round(sumOf(lastYear.map((m) => m.contribution + m.otherChange)) / lastYear.length);
}

function bucket(valuation: Valuation, marketValue: number): Bucket {
  const { assetClass, liquidity, maturityDate } = valuation.classification;
  return {
    assetClass,
    maturity: liquidity === "locked" && maturityDate ? maturityDate.slice(0, 7) : null,
    amount: valuation.sign * marketValue,
  };
}

/**
 * Month by month from `startMonth` (index 0, the actual values), every return shifted by
 * `shift` percentage points. A value counts as Locked in the months before its Maturity date's month.
 */
function simulate(
  startMonth: YearMonth,
  start: Bucket[],
  savings: number,
  assumptions: ProjectionAssumptions,
  shift: number,
): Point[] {
  // Compounded monthly so that 12 months give exactly the annual return; below −100 % a value just goes to 0.
  const factor = (assetClass: AssetClass) =>
    Math.max(0, 1 + (assumptions.annualReturns[assetClass] + shift) / 100) ** (1 / 12);
  // Savings collect in their own Available Cash bucket.
  const saved = { assetClass: "cash" as const, maturity: null, amount: 0, factor: factor("cash") };
  // A debt (any negative value) stays as it is: it earns no return.
  const buckets = [...start.map((b) => ({ ...b, factor: b.amount < 0 ? 1 : factor(b.assetClass) })), saved];
  const point = (month: YearMonth): Point => ({
    month,
    total: sumOf(buckets.map((b) => b.amount)),
    locked: sumOf(buckets.filter((b) => b.maturity !== null && month < b.maturity).map((b) => b.amount)),
  });
  let month = startMonth;
  const points = [point(month)];
  for (let i = 0; i < assumptions.horizonYears * 12; i++) {
    month = nextMonth(month);
    for (const b of buckets) b.amount *= b.factor;
    saved.amount += savings;
    points.push(point(month));
  }
  return points;
}

function sumOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
