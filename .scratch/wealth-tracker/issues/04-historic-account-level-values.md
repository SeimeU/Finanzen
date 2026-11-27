# 04: Historic Kontostand gesamt

**What to build:** For past months, the owner enters one Account-level value (Kontostand gesamt) per Account instead of values per Holding. It counts under the Account's Default classification. In any given month an Account has either an Account-level value or values per Holding, never both. The owner can switch an Account to values per Holding from a chosen month, and can enter many historic months in a row quickly (e.g. save and move to the previous or next month).

**Blocked by:** 03: Enter a Monatsstand and see Vermögen

**Status:** done

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core command accepts Account-level values in a Snapshot; mixing them with per-Holding values for the same Account and month is rejected with a validation error
- [ ] Net worth and all breakdown queries count Account-level values under the Account's Default classification
- [ ] Each Account records the month it switches to per-Holding values; the form shows the right input per Account per month
- [ ] Carry-forward works across the switch (an Account-level value is not carried into per-Holding months)
- [ ] The form supports fast sequential entry of months
- [ ] Core tests cover the mixing rule, the classification and the switch; Playwright enters three historic months
