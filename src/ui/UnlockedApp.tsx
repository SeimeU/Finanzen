import { useEffect, useState } from "react";
import { api } from "./api";
import { AccountsView } from "./views/AccountsView";
import { NotesView } from "./views/NotesView";
import { SettingsView } from "./views/SettingsView";
import { SnapshotView } from "./views/SnapshotView";
import { StartView } from "./views/StartView";

/**
 * Navigation between the unlocked views. A simple state-based switch: to add a
 * view, add its key and label to VIEWS and render it below.
 */
const VIEWS = {
  start: "Übersicht",
  snapshot: "Monatsstand",
  notes: "Notizen & Ereignisse",
  accounts: "Konten verwalten",
  settings: "Einstellungen",
} as const;

type ViewKey = keyof typeof VIEWS;

/** How often the UI asks whether the server has locked itself (the status poll does not count as use). */
const LOCK_POLL_MS = 3000;

/** Also holds the Sperren button and the auto-lock watch: once the server has locked, `onLocked` returns to the unlock screen. */
export function UnlockedApp({ onLocked }: { onLocked: () => void }) {
  const [view, setView] = useState<ViewKey>("start");

  useEffect(() => {
    const timer = setInterval(async () => {
      const status = await api.status().catch(() => null);
      if (status && status.state !== "unlocked") onLocked();
    }, LOCK_POLL_MS);
    return () => clearInterval(timer);
  }, [onLocked]);

  async function lock() {
    await api.lock();
    onLocked();
  }

  return (
    <>
      <nav className="nav" aria-label="Hauptnavigation">
        {(Object.keys(VIEWS) as ViewKey[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-current={view === key ? "page" : undefined}
            onClick={() => setView(key)}
          >
            {VIEWS[key]}
          </button>
        ))}
        <button type="button" className="lock" onClick={lock}>
          Sperren
        </button>
      </nav>
      {view === "start" && <StartView />}
      {view === "snapshot" && <SnapshotView />}
      {view === "notes" && <NotesView />}
      {view === "accounts" && <AccountsView />}
      {view === "settings" && <SettingsView />}
    </>
  );
}
