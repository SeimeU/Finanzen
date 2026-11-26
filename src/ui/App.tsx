import { useEffect, useState } from "react";
import { api, type AppState } from "./api";
import { SetupPasswordView } from "./views/SetupPasswordView";
import { StartView } from "./views/StartView";
import { UnlockView } from "./views/UnlockView";

/** Top level: picks the view from the server's lock state. Add new unlocked views under StartView's navigation. */
export function App() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    api.status().then((status) => setState(status.state));
  }, []);

  if (state === null) return null;
  if (state === "new") return <SetupPasswordView onDone={() => setState("unlocked")} />;
  if (state === "locked") return <UnlockView onDone={() => setState("unlocked")} />;
  return <StartView />;
}
