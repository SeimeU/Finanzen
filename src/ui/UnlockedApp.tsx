import { useState } from "react";
import { AccountsView } from "./views/AccountsView";
import { ImportView } from "./views/ImportView";
import { SettingsView } from "./views/SettingsView";
import { StartView } from "./views/StartView";
import { TransactionsView } from "./views/TransactionsView";

/**
 * Navigation between the unlocked views. A simple state-based switch: to add a
 * view, add its key and label to VIEWS and render it below.
 */
const VIEWS = {
  start: "Übersicht",
  transactions: "Umsätze",
  import: "Import",
  accounts: "Konten verwalten",
  settings: "Einstellungen",
} as const;

type ViewKey = keyof typeof VIEWS;

export function UnlockedApp() {
  const [view, setView] = useState<ViewKey>("start");
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
      </nav>
      {view === "start" && <StartView />}
      {view === "transactions" && <TransactionsView />}
      {view === "import" && <ImportView />}
      {view === "accounts" && <AccountsView />}
      {view === "settings" && <SettingsView onBack={() => setView("start")} />}
    </>
  );
}
