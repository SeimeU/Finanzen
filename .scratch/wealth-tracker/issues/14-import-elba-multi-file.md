# 14: ELBA import and several files at once

**What to build:** The owner drops Trade Republic and Raiffeisen ELBA files together. The ELBA profile reads the headerless semicolon file and splits the packed Buchungstext into counterparty, IBAN, payment reference and purpose. The confirmation screen has one line per file; the Account is suggested automatically when only one Account matches the format, can be corrected, and the choice is remembered by file name.

**Blocked by:** 13: Trade Republic CSV import

**Status:** done

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Built-in ELBA profile: no header, semicolon-separated, UTF-8 with BOM; the Buchungstext key-value pairs are parsed into fields
- [x] Decimal format, sign convention and date format verified against the owner's real ELBA export in `samples/` before this ticket is done; tests against `samples/` run when the folder is present
- [ ] Multi-file preview and confirm, with an Account per file
- [ ] Account suggested automatically when exactly one Account matches; the owner's correction is remembered by file name
- [ ] Playwright: drop one Trade Republic and one ELBA file together and confirm
