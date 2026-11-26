import { useEffect, useState } from "react";
import { api, type AppState } from "./api";
import { SettingsView } from "./views/SettingsView";
import { SetupPasswordView } from "./views/SetupPasswordView";
import { StartView } from "./views/StartView";
import { UnlockView } from "./views/UnlockView";

/** Top level: picks the view from the server's lock state. Add new unlocked views under StartView's navigation. */
export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    api.status().then((status) => setState(status.state));
  }, []);

  if (state === null) return null;
  if (state === "new") return <SetupPasswordView onDone={() => setState("unlocked")} />;
  if (state === "locked") return <UnlockView onDone={() => setState("unlocked")} />;
  if (showSettings) return <SettingsView onBack={() => setShowSettings(false)} />;
  return <StartView onOpenSettings={() => setShowSettings(true)} />;
}
