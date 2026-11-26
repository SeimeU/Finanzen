import { useEffect, useState } from "react";
import { api, type AppState } from "./api";
import { SetupPasswordView } from "./views/SetupPasswordView";
import { UnlockedApp } from "./UnlockedApp";
import { UnlockView } from "./views/UnlockView";

/** Top level: picks the view from the server's lock state. Unlocked views live in UnlockedApp. */
export function App() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    api.status().then((status) => setState(status.state));
  }, []);

  if (state === null) return null;
  if (state === "new") return <SetupPasswordView onDone={() => setState("unlocked")} />;
  if (state === "locked") return <UnlockView onDone={() => setState("unlocked")} />;
  return <UnlockedApp />;
}
