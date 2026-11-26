# 17: Regeln

**What to build:** The owner defines Categorization rules (Regeln) on counterparty, purpose, reference or amount, in a chosen order, including creating one directly from a Transaction in the inbox. Rules apply on import and can be re-applied to existing Transactions. A Category set by hand is never overwritten.

**Blocked by:** 16: Kategorien, inbox and Trade Republic classification

**Status:** ready-for-agent

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core: rules with ordered matching; the first match wins
- [ ] Precedence: manual Category → Trade/Transfer → first matching rule → Uncategorized
- [ ] Rules apply on import and on an explicit re-apply
- [ ] Rules editor, and "create rule from this Transaction" in the inbox
- [ ] Core tests for precedence and re-apply; Playwright creates a rule from the inbox and sees matching Transactions categorized
