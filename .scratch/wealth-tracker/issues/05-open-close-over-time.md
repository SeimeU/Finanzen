# 05: Close and open Positionen and Konten over time

**What to build:** When the owner sells a Holding completely, they close it as of a month: it no longer appears in that or later Snapshots, and its history stays. A new Holding can be added starting from a given month. Whole Accounts can be closed too, e.g. after moving a depot to another broker (old Account closed, new one opened; no history is moved).

**Blocked by:** 03: Enter a Monatsstand and see Vermögen

**Status:** done

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core commands: close a Holding or Account as of a month, and set a Holding's starting month
- [ ] A closed Holding contributes nothing from its closing month on and is not carried forward
- [ ] The Monatsstand form hides Holdings and Accounts that are closed or not yet started
- [ ] History before closing remains in every chart
- [ ] Core tests cover closing, starting and carry-forward interaction; Playwright closes a Holding and checks the next month's form
