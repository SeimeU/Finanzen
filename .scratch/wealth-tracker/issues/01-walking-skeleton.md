# 01: Walking skeleton: start, set password, unlock

**What to build:** Double-clicking `start.bat` on Windows starts the local server (bound to `localhost` only) and opens the browser. On first start the owner sets a password, after a clear German warning that forgetting it means permanent data loss. On later starts they enter it to unlock. A wrong password is rejected without touching the data file. After unlocking they land on an empty start screen. This ticket lays the foundation the others build on: the TypeScript workspace (Node server, React + Vite frontend), the domain core module with an empty versioned document, the encrypted file store, the thin server API, German UI formatting helpers, and the Playwright test setup. See spec: Implementation Decisions (Platform, Data document, Encrypted file store) and ADR 0001/0002.

**Blocked by:** None (can start immediately)

**Status:** done

Spec: `.scratch/wealth-tracker/spec.md`. Vocabulary: `GLOSSARY.md`.

- [ ] `start.bat` starts the server and opens the default browser on the app
- [ ] The server listens on `localhost` only, and no runtime code makes network requests (all assets bundled locally)
- [ ] First start: password setup with the data-loss warning creates an encrypted data file
- [ ] Later starts: correct password unlocks; wrong password shows a German error and leaves every file unchanged
- [ ] Encrypted file store: save/load round-trip, no plaintext in the file, atomic write (an interrupted write leaves the previous file intact), scrypt key derivation + AES-256-GCM with a random salt and nonce per write
- [ ] Core document carries a schema version and the core runs migrations on load (one no-op migration to prove the mechanism)
- [ ] Store tests run against a temporary directory
- [ ] Playwright e2e: first-start setup, re-unlock, wrong password, using a temporary data file
- [ ] UI labels in German; helpers format EUR as `1.234,56 €` and dates as `31.03.2025`
