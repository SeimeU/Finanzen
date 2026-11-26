import { BackupsSection } from "./settings/BackupsSection";
import { DataFileLocationSection } from "./settings/DataFileLocationSection";
import { ExportSection } from "./settings/ExportSection";
import { PasswordSection } from "./settings/PasswordSection";

/** Settings ("Einstellungen"). Each topic is its own section component in ./settings/. Opened from UnlockedApp's nav. */
export function SettingsView() {
  return (
    <main className="page">
      <h1>Einstellungen</h1>
      <PasswordSection />
      <BackupsSection />
      <ExportSection />
      <DataFileLocationSection />
    </main>
  );
}
