# 03: Enter a Monatsstand and see Vermögen

**What to build:** The owner opens the Monatsstand form for any month. It lists every open Holding grouped by Institution and Account, pre-filled with the previous month's values, with an optional Contribution (Einzahlung) field on investment Holdings. Net worth (Vermögen) and the change since last month update live as they type. Saving stores the Snapshot and replaces any existing one for that month. A Holding left untouched carries forward its previous value and is flagged "nicht aktualisiert". The start screen shows current Net worth and a line chart of Net worth over time.

**Blocked by:** 02: Manage Institute, Konten and Positionen

**Status:** done

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core command: save a Snapshot for a year-month with a Market value per Holding and optional Contributions; at most one Snapshot per month (saving again replaces it)
- [ ] Core query: Net worth series by month with carry-forward and per-Holding "not updated" flags; debts count negatively
- [ ] Amounts are stored and calculated as integer cents
- [ ] The current date is passed into the core, never read from the clock
- [ ] The form is pre-filled from last month and shows live Net worth and the change versus last month
- [ ] The start screen shows current Net worth and a Net worth line chart
- [ ] Core tests: carry-forward, replacing a month, debts, Contributions stored
- [ ] Playwright: enter two months, the second pre-filled from the first, and see Net worth update
