# Finanzen

A local, offline wealth tracker with a German interface. The data lives in one password-encrypted file. See `.scratch/wealth-tracker/spec.md`, `GLOSSARY.md` and `docs/adr/`.

Requires Node.js 22.12 or newer (older versions make npm silently skip the native build tools). `start.bat` checks this before installing.

## Start the app

- **Windows:** double-click `start.bat`. The first start needs internet once: it installs the dependencies (`npm ci`) and builds the UI. Everything afterwards runs offline: later starts reinstall only when `package-lock.json` changed and rebuild only when the UI is missing or older than the sources, then start the server on `http://127.0.0.1:4317` from the installed and built files and open the browser.
- **Any OS:** run `npm install`, then `npm run build`, then `npm start` (add `-- --open` to open the browser).

The data file defaults to `data/vermoegen.dat`. Set `FINANZEN_DATA_FILE` to use a different path, and `FINANZEN_PORT` to use a different port.

For development, run `npm run dev:server` and `npm run dev:ui` (Vite on port 5173, which proxies `/api` to the server).

## Tests

- `npm test` runs the unit tests (Vitest) for the core, the store and the UI helpers.
- `npm run test:e2e` builds the UI and runs the Playwright end-to-end tests. Each test starts its own server with a temporary data file.
- `npm run typecheck` runs the type checker.
