import { useEffect, useState } from "react";
import { api } from "./api";
import { AccountDetailView } from "./views/AccountDetailView";
import { AccountsView } from "./views/AccountsView";
import { CategoriesView } from "./views/CategoriesView";
import { InboxView } from "./views/InboxView";
import { NotesView } from "./views/NotesView";
import { ImportView } from "./views/ImportView";
import { ProjectionView } from "./views/ProjectionView";
import { SettingsView } from "./views/SettingsView";
import { SnapshotView } from "./views/SnapshotView";
import { StartView } from "./views/StartView";
import { TransactionsView } from "./views/TransactionsView";

/**
 * Navigation between the unlocked views. A simple state-based switch: to add a
 * view, add its key and label to VIEWS and render it below.
 */
const VIEWS = {
  start: "Übersicht",
  snapshot: "Monatsstand",
  notes: "Notizen & Ereignisse",
  projection: "Prognose",
  transactions: "Umsätze",
  inbox: "Nicht kategorisiert",
  categories: "Kategorien",
  import: "Import",
  accounts: "Konten verwalten",
  settings: "Einstellungen",
} as const;

type ViewKey = keyof typeof VIEWS;

/** How often the UI asks whether the server has locked itself (the status poll does not count as use). */
const LOCK_POLL_MS = 3000;

/** Also holds the Sperren button and the auto-lock watch: once the server has locked, `onLocked` returns to the unlock screen. */
export function UnlockedApp({ onLocked }: { onLocked: () => void }) {
  const [view, setView] = useState<ViewKey>("start");
  // Konto detail opens over the current view (start screen or Konten verwalten); Zurück returns to it.
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);

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
            aria-current={view === key && !openAccountId ? "page" : undefined}
            onClick={() => {
              setView(key);
              setOpenAccountId(null);
            }}
          >
            {VIEWS[key]}
          </button>
        ))}
        <button type="button" className="lock" onClick={lock}>
          Sperren
        </button>
      </nav>
      {openAccountId ? (
        <AccountDetailView accountId={openAccountId} onBack={() => setOpenAccountId(null)} />
      ) : (
        <>
          {view === "start" && <StartView onOpenAccount={setOpenAccountId} />}
          {view === "snapshot" && <SnapshotView />}
          {view === "notes" && <NotesView />}
          {view === "projection" && <ProjectionView />}
          {view === "transactions" && <TransactionsView />}
          {view === "inbox" && <InboxView />}
          {view === "categories" && <CategoriesView />}
          {view === "import" && <ImportView />}
          {view === "accounts" && <AccountsView onOpenAccount={setOpenAccountId} />}
          {view === "settings" && <SettingsView />}
        </>
      )}
    </>
  );
}
