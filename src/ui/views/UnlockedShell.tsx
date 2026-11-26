import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { SettingsView } from "./SettingsView";
import { StartView } from "./StartView";

/** How often the UI asks whether the server has locked itself (the status poll does not count as use). */
const LOCK_POLL_MS = 3000;

type Page = "start" | "settings";

/**
 * Frame around every unlocked view: navigation, the Sperren button, and the
 * auto-lock watch that returns to the unlock screen once the server has locked.
 */
export function UnlockedShell({ onLocked }: { onLocked: () => void }) {
  const [page, setPage] = useState<Page>("start");

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

  const views: Record<Page, ReactNode> = {
    start: <StartView />,
    settings: <SettingsView />,
  };

  return (
    <>
      <nav className="topbar">
        <button type="button" aria-current={page === "start" ? "page" : undefined} onClick={() => setPage("start")}>
          Vermögen
        </button>
        <button
          type="button"
          aria-current={page === "settings" ? "page" : undefined}
          onClick={() => setPage("settings")}
        >
          Einstellungen
        </button>
        <button type="button" className="lock" onClick={lock}>
          Sperren
        </button>
      </nav>
      {views[page]}
    </>
  );
}
