import { BackupsSection } from "./settings/BackupsSection";
import { ExportSection } from "./settings/ExportSection";

/** Settings ("Einstellungen"). Each topic is its own section component in ./settings/. */
export function SettingsView({ onBack }: { onBack: () => void }) {
  return (
    <main className="page">
      <button type="button" className="secondary" onClick={onBack}>
        Zurück
      </button>
      <h1>Einstellungen</h1>
      <BackupsSection />
      <ExportSection />
    </main>
  );
}
