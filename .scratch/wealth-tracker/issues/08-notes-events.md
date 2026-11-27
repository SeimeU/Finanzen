# 08: Notizen and Ereignisse

**What to build:** The owner adds a free-text Note (Notiz) and any number of Events (Ereignisse, a label and an amount, e.g. "Auto gekauft, −15.000 €") to a month, at the bottom of the Monatsstand form or from the chart. Events appear as markers on the Net worth chart with label and amount on hover. A chronological view lists all Notes and Events.

**Blocked by:** 03: Enter a Monatsstand and see Vermögen

**Status:** done

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core commands to set a month's Note and to add, edit and delete Events
- [ ] Core query returns Notes and Events chronologically
- [ ] Event markers on the Net worth chart, with hover details
- [ ] A chronological list view of Notes and Events
- [ ] Core tests; Playwright adds an Event and sees its marker
