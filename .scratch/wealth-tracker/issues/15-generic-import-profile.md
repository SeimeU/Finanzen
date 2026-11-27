# 15: Generic Importprofil

**What to build:** For a bank without a built-in profile, the owner maps columns (date, amount, counterparty, purpose, optional IBAN and reference), the separator, the date and number formats, and header lines to skip once, previewing the result as they go. The Import profile is saved for that Account and used automatically for later files.

**Blocked by:** 13: Trade Republic CSV import

**Status:** done

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Core: user-defined Import profiles with validation
- [ ] A mapping UI shows a live preview of the first parsed rows
- [ ] Later files matching the profile are detected and parsed automatically
- [ ] Core tests with synthetic CSVs in several formats (comma and semicolon, decimal comma, DD.MM.YYYY)
