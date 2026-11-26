# 06: Backups, restore and unencrypted export

**What to build:** Every save keeps an encrypted backup of the previous state, retaining the last 30. In settings the owner can see the backups with their timestamps and restore one. An "Export unencrypted" action writes a readable JSON copy to a location the owner chooses, after a warning.

**Blocked by:** 01: Walking skeleton

**Status:** ready-for-agent

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Store keeps the 30 most recent backups, rotating the oldest out
- [ ] Backups are encrypted with the same password
- [ ] Listing and restoring a backup work; restoring itself creates a backup of the state it replaces
- [ ] Unencrypted export writes valid JSON of the current document
- [ ] Store tests: rotation at 30, restore, export; Playwright: restore an earlier state
