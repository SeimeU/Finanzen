# 07: Password change, auto-lock and data file location

**What to build:** The owner can change their password, which re-encrypts the data file and all backups so the old password stops working everywhere. The app locks itself after 30 minutes without use, and can be locked manually; the server discards the decrypted document while locked. The owner can choose where the data file lives.

**Blocked by:** 01: Walking skeleton

**Status:** ready-for-agent

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] Password change re-encrypts the data file and every backup; the old password fails on all of them
- [ ] Server discards the decrypted document after 30 minutes without requests, or on manual lock; the UI returns to the unlock screen
- [ ] The timeout is configurable for tests
- [ ] The owner can choose the data file location in settings (moving the existing file and its backups)
- [ ] Store tests for the password change; Playwright for auto-lock with a shortened timeout and for manual lock
