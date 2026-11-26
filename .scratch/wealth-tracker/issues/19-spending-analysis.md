# 19: Spending analysis and Sparquote

**What to build:** The owner sees monthly spending by Category (top level and drilled down), income versus expenses over time, and the monthly Savings rate (Sparquote). Months where some Accounts carrying income or spending have no imported Transactions are flagged as incomplete instead of showing a Savings rate. The owner can compare a Category's spending between months or years.

**Blocked by:** 17: Regeln; 18: Umbuchungen

**Status:** ready-for-agent

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core queries: spending and income by Category per month; Savings rate = (income − expenses) ÷ income, excluding Transfers and Trades
- [ ] Accounts can be flagged as carrying income or spending; a month is complete only when each flagged Account has Transactions covering the whole month
- [ ] Spending views with drill-down and comparison
- [ ] Core tests for the Savings rate and incompleteness; Playwright checks a spending chart after an import
