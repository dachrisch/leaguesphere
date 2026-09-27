import { ErrorBanner } from '../components/ErrorBanner';
import { useAutoHeight } from '../hooks/useAutoHeight';
import { useSnapshot } from '../hooks/useSnapshot';
import { parseWidgetConfig } from '../lib/params';
import { Live } from '../views/Live';
import { Spielplan } from '../views/Spielplan';
import { Table } from '../views/Table';

export function App() {
  const config = parseWidgetConfig(new URLSearchParams(window.location.search));
  const { snapshot, loading, error } = useSnapshot(config.teams);
  useAutoHeight();

  if (config.teams.length === 0) {
    return <p className="share-empty">Kein Team konfiguriert.</p>;
  }
  if (error !== null) {
    return <ErrorBanner message={error} />;
  }
  if (loading || snapshot === null) {
    return <p className="share-loading">Lädt…</p>;
  }
  if (config.view === 'live') {
    return <Live snapshot={snapshot} config={config} />;
  }
  if (config.view === 'table') {
    return <Table snapshot={snapshot} config={config} />;
  }
  return <Spielplan snapshot={snapshot} config={config} />;
}
