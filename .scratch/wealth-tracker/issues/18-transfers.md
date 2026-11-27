# 18: Umbuchungen

**What to build:** Moving money between the owner's own Accounts is recognized as a Transfer (Umbuchung) and excluded from spending and income. A Transaction whose counterparty IBAN is one of the owner's Accounts is a Transfer. An equal and opposite amount on two own Accounts within 3 days is offered as a suggestion. The owner can mark or unmark Transfers by hand.

**Blocked by:** 14: ELBA import and several files at once; 16: Kategorien, inbox and Trade Republic classification

**Status:** done

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core: IBAN-based Transfer detection on import and on re-apply
- [ ] Amount-matching suggestions (equal and opposite within 3 days) that the owner accepts or rejects
- [ ] Manual mark/unmark overrides detection
- [ ] Transfers excluded from spending and income queries
- [ ] Core tests with a Trade Republic inbound transfer matched to an ELBA outgoing transfer
