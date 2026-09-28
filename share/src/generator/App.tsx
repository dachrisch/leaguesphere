import { useEffect, useState } from 'react';

import { fetchTeams } from '../lib/api';
import {
  buildIframeSnippet,
  buildWidgetUrl,
  type GeneratorOptions,
  PARENT_LISTENER_SNIPPET,
} from '../lib/generator';
import type { ViewName } from '../lib/params';
import type { TeamDirectoryEntry } from '../lib/types';

const DEFAULT_OPTIONS: GeneratorOptions = {
  teams: [],
  view: 'spielplan',
  color: 'ff4500',
  past: 3,
  future: 0,
  showPast: true,
  showFuture: true,
  title: true,
  compact: false,
  liveUrl: null,
  logo: null,
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="mb-3">
      <label className="form-label small text-muted">{label}</label>
      <textarea className="form-control" readOnly rows={4} value={value} />
      <button type="button" className="btn btn-sm btn-outline-secondary mt-1" onClick={copy}>
        <i className="bi bi-clipboard me-1" />
        {copied ? 'Kopiert!' : 'Kopieren'}
      </button>
    </div>
  );
}

export function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TeamDirectoryEntry[]>([]);
  const [selected, setSelected] = useState<TeamDirectoryEntry[]>([]);
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_OPTIONS);

  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      fetchTeams(query)
        .then((teams) => {
          if (active) {
            setResults(teams);
          }
        })
        .catch(() => {
          if (active) {
            setResults([]);
          }
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [query]);

  const update = (patch: Partial<GeneratorOptions>) =>
    setOptions((previous) => ({ ...previous, ...patch }));

  const widgetBase = `${window.location.origin}/share/widget/`;
  const url = buildWidgetUrl(widgetBase, {
    ...options,
    teams: selected.map((team) => team.id),
  });

  return (
    <main className="share-gen">
      <h1>LeagueSphere Widget</h1>
      <p className="text-muted">
        Team auswählen, Optionen festlegen und den Einbettungscode kopieren. Das
        Widget zeigt nur die ausgewählten Teams.
      </p>

      <div className="content-section">
        <h2 className="h5">1. Teams</h2>
        <input
          type="search"
          className="form-control"
          placeholder="Team suchen…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {results.length > 0 && (
          <ul className="share-gen__results">
            {results.map((team) => (
              <li key={team.id}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => {
                    setSelected((previous) =>
                      previous.some((entry) => entry.id === team.id)
                        ? previous
                        : [...previous, team]
                    );
                    setQuery('');
                  }}
                >
                  {team.name} ({team.description})
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected.length > 0 && (
          <ul className="share-gen__selected">
            {selected.map((team) => (
              <li key={team.id} className="badge text-bg-light d-inline-flex align-items-center gap-2">
                <span>{team.name}</span>
                <button
                  type="button"
                  className="btn-close"
                  aria-label={`${team.name} entfernen`}
                  onClick={() =>
                    setSelected((previous) =>
                      previous.filter((entry) => entry.id !== team.id)
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="content-section">
        <h2 className="h5">2. Optionen</h2>
        <div className="row g-2 align-items-end">
          <div className="col-sm-4">
            <label className="form-label small">Ansicht</label>
            <select
              className="form-select form-select-sm"
              value={options.view}
              onChange={(event) =>
                update({ view: event.target.value as ViewName })
              }
            >
              <option value="spielplan">Spielplan</option>
              <option value="table">Tabelle</option>
              <option value="live">Live-Ticker</option>
            </select>
          </div>
          <div className="col-sm-4">
            <label className="form-label small">Vergangene Spiele</label>
            <input
              type="number"
              min={0}
              className="form-control form-control-sm"
              value={options.past}
              onChange={(event) =>
                update({ past: Math.max(0, Number(event.target.value) || 0) })
              }
            />
          </div>
          <div className="col-sm-4">
            <label className="form-label small">Kommende Spiele (0 = alle)</label>
            <input
              type="number"
              min={0}
              className="form-control form-control-sm"
              value={options.future}
              onChange={(event) =>
                update({ future: Math.max(0, Number(event.target.value) || 0) })
              }
            />
          </div>
        </div>
        <div className="row g-2 align-items-end mt-1">
          <div className="col-sm-4">
            <label className="form-label small" htmlFor="opt-color">
              Akzentfarbe
            </label>
            <input
              id="opt-color"
              type="color"
              className="form-control form-control-color form-control-sm"
              data-testid="gen-color"
              value={`#${options.color}`}
              onChange={(event) =>
                update({ color: event.target.value.replace('#', '').toLowerCase() })
              }
            />
          </div>
          <div className="col-sm-8">
            <label className="form-label small" htmlFor="opt-logo">
              Logo-URL (optional)
            </label>
            <input
              id="opt-logo"
              type="url"
              className="form-control form-control-sm"
              data-testid="gen-logo"
              placeholder="https://…/logo.png"
              value={options.logo ?? ''}
              onChange={(event) =>
                update({ logo: event.target.value === '' ? null : event.target.value })
              }
            />
          </div>
        </div>
        <div className="form-check mt-2">
          <input
            className="form-check-input"
            type="checkbox"
            id="opt-show-past"
            checked={options.showPast}
            onChange={(event) => update({ showPast: event.target.checked })}
          />
          <label className="form-check-label" htmlFor="opt-show-past">
            Vergangene Spiele anzeigen
          </label>
        </div>
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            id="opt-show-future"
            checked={options.showFuture}
            onChange={(event) => update({ showFuture: event.target.checked })}
          />
          <label className="form-check-label" htmlFor="opt-show-future">
            Kommende Spiele anzeigen
          </label>
        </div>
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            id="opt-title"
            checked={options.title}
            onChange={(event) => update({ title: event.target.checked })}
          />
          <label className="form-check-label" htmlFor="opt-title">
            Teamname anzeigen
          </label>
        </div>
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            id="opt-compact"
            checked={options.compact}
            onChange={(event) => update({ compact: event.target.checked })}
          />
          <label className="form-check-label" htmlFor="opt-compact">
            Kompakte Darstellung
          </label>
        </div>
      </div>

      <div className="content-section">
        <h2 className="h5">3. Vorschau &amp; Einbettung</h2>
        {selected.length === 0 ? (
          <p className="share-empty">Bitte zuerst ein Team auswählen.</p>
        ) : (
          <>
            <iframe
              className="share-gen__preview mb-3"
              title="Vorschau"
              src={url}
            />
            <CopyField
              label="Schritt 1 – Größen-Listener (einmalig auf der Seite)"
              value={PARENT_LISTENER_SNIPPET}
            />
            <CopyField label="Schritt 2 – iframe" value={buildIframeSnippet(url)} />
            <CopyField label="Direktlink" value={url} />
          </>
        )}
      </div>
    </main>
  );
}
