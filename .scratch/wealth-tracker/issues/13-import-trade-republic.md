# 13: Trade Republic CSV import

**What to build:** The owner drops a Trade Republic transaction export onto the import view. A confirmation screen shows the detected format, the suggested Account, the date range and "X new / Y duplicates". Confirming stores the Transactions (Umsätze), which appear in a list the owner can search and filter by Account, date and text. A whole import can be undone. Unreadable files are rejected with a clear German message, and nothing is imported from them. Imports never change any Snapshot.

**Blocked by:** 02: Manage Institute, Konten and Positionen

**Status:** ready-for-agent

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core import pipeline: detect format → parse → normalize → deduplicate → preview → confirm
- [ ] Built-in Trade Republic profile: comma-separated, header row, ISO dates, decimal point, signed amounts; unexpected columns fail loudly instead of mis-parsing
- [ ] Encoding: UTF-8 first, Windows-1252 fallback
- [ ] Duplicates (Account, booking date, amount in cents, normalized text) are skipped and counted
- [ ] Each Transaction records its import; undoing an import removes exactly those Transactions
- [ ] Transaction list with search and filters
- [ ] Committed synthetic fixtures copy the verified Trade Republic structure; extra tests run against `samples/` when present
- [ ] Playwright: drop a file, confirm, see the Transactions, re-drop and see everything counted as duplicates
