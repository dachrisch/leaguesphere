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
  poweredBy: true,
  liveUrl: null,
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
    <label className="share-gen__field">
      <span>{label}</span>
      <textarea readOnly rows={4} value={value} />
      <button type="button" onClick={copy}>
        {copied ? 'Kopiert!' : 'Kopieren'}
      </button>
    </label>
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
      <h1>LeagueSphere Widget-Generator</h1>
      <p>
        Team auswählen, Optionen festlegen und den fertigen Einbettungscode
        kopieren. Das Widget zeigt nur die ausgewählten Teams.
      </p>

      <section className="share-gen__section">
        <h2>1. Teams</h2>
        <input
          type="search"
          placeholder="Team suchen…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="share-gen__results">
          {results.map((team) => (
            <li key={team.id}>
              <button
                type="button"
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
        <ul className="share-gen__selected">
          {selected.map((team) => (
            <li key={team.id}>
              <span>{team.name}</span>
              <button
                type="button"
                aria-label={`${team.name} entfernen`}
                onClick={() =>
                  setSelected((previous) =>
                    previous.filter((entry) => entry.id !== team.id)
                  )
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="share-gen__section">
        <h2>2. Optionen</h2>
        <label className="share-gen__inline">
          Ansicht
          <select
            value={options.view}
            onChange={(event) => update({ view: event.target.value as ViewName })}
          >
            <option value="spielplan">Spielplan</option>
            <option value="table">Tabelle</option>
            <option value="live">Live-Ticker</option>
          </select>
        </label>
        <label className="share-gen__inline">
          Akzentfarbe
          <input
            type="color"
            value={`#${options.color}`}
            onChange={(event) => update({ color: event.target.value.slice(1) })}
          />
        </label>
        <label className="share-gen__inline">
          Vergangene Spiele
          <input
            type="number"
            min={0}
            value={options.past}
            onChange={(event) =>
              update({ past: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </label>
        <label className="share-gen__inline">
          Kommende Spiele (0 = alle)
          <input
            type="number"
            min={0}
            value={options.future}
            onChange={(event) =>
              update({ future: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </label>
        <label className="share-gen__inline">
          <input
            type="checkbox"
            checked={options.showPast}
            onChange={(event) => update({ showPast: event.target.checked })}
          />
          Vergangene Spiele anzeigen
        </label>
        <label className="share-gen__inline">
          <input
            type="checkbox"
            checked={options.showFuture}
            onChange={(event) => update({ showFuture: event.target.checked })}
          />
          Kommende Spiele anzeigen
        </label>
        <label className="share-gen__inline">
          <input
            type="checkbox"
            checked={options.title}
            onChange={(event) => update({ title: event.target.checked })}
          />
          Teamname anzeigen
        </label>
        <label className="share-gen__inline">
          <input
            type="checkbox"
            checked={options.compact}
            onChange={(event) => update({ compact: event.target.checked })}
          />
          Kompakte Darstellung
        </label>
        <label className="share-gen__inline">
          <input
            type="checkbox"
            checked={options.poweredBy}
            onChange={(event) => update({ poweredBy: event.target.checked })}
          />
          LeagueSphere-Hinweis anzeigen
        </label>
      </section>

      <section className="share-gen__section">
        <h2>3. Vorschau &amp; Einbettung</h2>
        {selected.length === 0 ? (
          <p className="share-empty">Bitte zuerst ein Team auswählen.</p>
        ) : (
          <>
            <iframe className="share-gen__preview" title="Vorschau" src={url} />
            <CopyField label="Schritt 1 – Größen-Listener (einmalig)" value={PARENT_LISTENER_SNIPPET} />
            <CopyField label="Schritt 2 – iframe" value={buildIframeSnippet(url)} />
            <CopyField label="Direktlink" value={url} />
          </>
        )}
      </section>
    </main>
  );
}
