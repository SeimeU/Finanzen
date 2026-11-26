# 12: Prognose

**What to build:** The owner sets an expected annual return per Asset class, a monthly savings amount (defaulting to the average of the last 12 months) and a horizon (5, 10 or 20 years). The Projection (Prognose) appears as a dashed continuation of the Net worth chart with optimistic and pessimistic bands. Locked Holdings become Available on their Maturity date in the Projection.

**Blocked by:** 09: Start screen breakdowns; 11: Konto detail and Einzahlung vs market change

**Status:** ready-for-agent

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core command to store Projection assumptions; core query returns the Projection series with bands
- [ ] Month-by-month compounding per Asset class; the savings amount is added to Available cash
- [ ] Default savings amount = 12-month average of Contributions plus growth in cash Holdings
- [ ] Bands at each expected return ±2 percentage points by default, with a configurable spread
- [ ] Locked Holdings move to Available at their Maturity date
- [ ] Projection settings view; dashed line with bands on the start-screen chart
- [ ] Core tests with hand-calculated expected values
