/** Start screen. Empty for now; later tickets add Net worth, charts and navigation. */
export function StartView({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <main className="page">
      <nav className="toolbar">
        <button type="button" className="secondary" onClick={onOpenSettings}>
          Einstellungen
        </button>
      </nav>
      <h1>Vermögen</h1>
      <p className="empty">Noch keine Konten angelegt.</p>
    </main>
  );
}
