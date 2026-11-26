import { useCallback, useEffect, useState } from "react";
import { api, type AppState } from "./api";
import { SetupPasswordView } from "./views/SetupPasswordView";
import { UnlockedShell } from "./views/UnlockedShell";
import { UnlockView } from "./views/UnlockView";

/** Top level: picks the view from the server's lock state. Add new unlocked views to UnlockedShell. */
export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const onLocked = useCallback(() => setState("locked"), []);

  useEffect(() => {
    api.status().then((status) => setState(status.state));
  }, []);

  if (state === null) return null;
  if (state === "new") return <SetupPasswordView onDone={() => setState("unlocked")} />;
  if (state === "locked") return <UnlockView onDone={() => setState("unlocked")} />;
  return <UnlockedShell onLocked={onLocked} />;
}
