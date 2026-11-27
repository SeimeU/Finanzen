# 16: Kategorien, inbox and Trade Republic classification

**What to build:** A default two-level Category list (e.g. Wohnen → Miete), each Category marked income or expense, which the owner can edit. The owner sets a Transaction's Category by hand. An Uncategorized inbox shows every Transaction without a Category. Trade Republic rows are pre-classified: TRADING rows become Trades (Kauf / Verkauf), INTEREST_PAYMENT and DISTRIBUTION are income under "Kapitalerträge", tax rows are expenses under "Steuern", and unknown types land in the inbox.

**Blocked by:** 13: Trade Republic CSV import

**Status:** done

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core: Categories (two levels, income or expense) with a default set; manual Category on a Transaction
- [ ] Trade classification and its exclusion from spending and income
- [ ] Trade Republic type mapping as described; unknown types are never dropped
- [ ] Uncategorized inbox view and a Category editor
- [ ] Core tests for the type mapping and the manual Category; Playwright categorizes from the inbox
