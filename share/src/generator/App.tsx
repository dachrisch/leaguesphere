import { useEffect, useState } from 'react';

import { usePreviewHeight } from '../hooks/usePreviewHeight';
import { fetchSeasons, fetchSnapshot, fetchTeams } from '../lib/api';
import { leaguesInSnapshot, type LeagueOption } from '../lib/derived';
import {
  buildIframeSnippet,
  buildListenerSnippet,
  buildSnapshotDataUrl,
  buildWidgetUrl,
  type GeneratorOptions,
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
  season: null,
  seasonName: null,
  league: null,
};

const MIN_SEARCH_LENGTH = 2;
const PREVIEW_DEBOUNCE_MS = 600;

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
  const [seasons, setSeasons] = useState<{ id: number; name: string }[]>([]);
  const [derivedLeagues, setDerivedLeagues] = useState<{
    key: string;
    leagues: LeagueOption[];
  }>({ key: '', leagues: [] });

  const trimmedQuery = query.trim();
  const queryReady = trimmedQuery.length >= MIN_SEARCH_LENGTH;
  const teamIdsKey = selected.map((team) => team.id).join(',');

  useEffect(() => {
    let active = true;
    fetchSeasons()
      .then((data) => {
        if (active) {
          setSeasons(data);
        }
      })
      .catch(() => {
        /* seasons are optional */
      });
    return () => {
      active = false;
    };
  }, []);

  // Derive the leagues the selected teams actually played in, so a club can
  // offer only relevant leagues (league vs. relegation etc.) — across all
  // selected teams, and even before picking a season (all-seasons snapshot).
  const leaguesKey =
    teamIdsKey !== '' ? `${teamIdsKey}:${options.season ?? 'all'}` : '';
  useEffect(() => {
    if (leaguesKey === '') {
      return;
    }
    const [teamsRaw, seasonRaw] = leaguesKey.split(':');
    const teamIds = teamsRaw.split(',').map(Number);
    const filters =
      seasonRaw === 'all' ? {} : { season: Number(seasonRaw) };
    let active = true;
    fetchSnapshot(teamIds, filters)
      .then((snapshot) => {
        if (active) {
          setDerivedLeagues({ key: leaguesKey, leagues: leaguesInSnapshot(snapshot) });
        }
      })
      .catch(() => {
        if (active) {
          setDerivedLeagues({ key: leaguesKey, leagues: [] });
        }
      });
    return () => {
      active = false;
    };
  }, [leaguesKey]);

  const leagues =
    leaguesKey !== '' && derivedLeagues.key === leaguesKey
      ? derivedLeagues.leagues
      : [];

  useEffect(() => {
    if (!queryReady) {
      return;
    }
    let active = true;
    const handle = window.setTimeout(() => {
      fetchTeams(trimmedQuery)
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
  }, [trimmedQuery, queryReady]);

  const update = (patch: Partial<GeneratorOptions>) =>
    setOptions((previous) => ({ ...previous, ...patch }));

  const widgetBase = `${window.location.origin}/share/widget/`;
  const url = buildWidgetUrl(widgetBase, {
    ...options,
    teams: selected.map((team) => team.id),
  });
  // Debounce the iframe src so dragging the colour picker / typing does not
  // reload the preview on every keystroke.
  const [previewUrl, setPreviewUrl] = useState(url);
  useEffect(() => {
    const handle = window.setTimeout(
      () => setPreviewUrl(url),
      PREVIEW_DEBOUNCE_MS
    );
    return () => window.clearTimeout(handle);
  }, [url]);
  const [previewRef, previewHeight] = usePreviewHeight(selected.length > 0);

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
        {query.trim().length > 0 && !queryReady && (
          <p className="text-muted small mt-2 mb-0">
            Bitte mindestens {MIN_SEARCH_LENGTH} Zeichen eingeben.
          </p>
        )}
        {queryReady && results.length === 0 && (
          <p className="text-muted small mt-2 mb-0">Kein Team gefunden.</p>
        )}
        {queryReady && results.length > 0 && (
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
              data-testid="gen-view"
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
          <div className="col-sm-6">
            <label className="form-label small" htmlFor="opt-season">
              Saison
            </label>
            <select
              id="opt-season"
              className="form-select form-select-sm"
              data-testid="gen-season"
              value={options.season ?? ''}
              onChange={(event) =>
                update({
                  season: event.target.value === '' ? null : Number(event.target.value),
                  seasonName:
                    seasons.find((season) => String(season.id) === event.target.value)
                      ?.name ?? null,
                  // League depends on season; reset to "all" on change.
                  league: null,
                })
              }
            >
              <option value="">Aktuelle Saison</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-6">
            <label className="form-label small" htmlFor="opt-league">
              Liga
            </label>
            <select
              id="opt-league"
              className="form-select form-select-sm"
              data-testid="gen-league"
              disabled={leagues.length === 0}
              value={options.league ?? ''}
              onChange={(event) =>
                update({
                  league: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            >
              <option value="">Alle</option>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
            {teamIdsKey !== '' && leagues.length === 0 && (
              <span className="form-text">
                Keine Liga für dieses Team gefunden.
              </span>
            )}
            {options.view === 'table' &&
              options.league === null &&
              leagues.length > 1 && (
                <span className="form-text">
                  Mehrere Ligen gefunden – bitte eine Liga für die Tabelle
                  wählen.
                </span>
              )}
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
        {options.view === 'live' && (
          <div className="row g-2 align-items-end mt-1">
            <div className="col-12">
              <label className="form-label small" htmlFor="opt-live-url">
                Live-Link (optional)
              </label>
              <input
                id="opt-live-url"
                type="url"
                className="form-control form-control-sm"
                data-testid="gen-live-url"
                placeholder="https://…/liveticker"
                value={options.liveUrl ?? ''}
                onChange={(event) =>
                  update({
                    liveUrl: event.target.value === '' ? null : event.target.value,
                  })
                }
              />
            </div>
          </div>
        )}
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
              ref={previewRef}
              className="share-gen__preview mb-3"
              title="Vorschau"
              src={previewUrl}
              style={{ height: `${previewHeight}px` }}
            />
            <CopyField
              label="Schritt 1 – Größen-Listener (einmalig auf der Seite)"
              value={buildListenerSnippet(window.location.origin)}
            />
            <CopyField label="Schritt 2 – iframe" value={buildIframeSnippet(url)} />
            <CopyField label="Direktlink" value={url} />
            <CopyField
              label="Daten als JSON (öffentliche API, für eigene Darstellungen)"
              value={buildSnapshotDataUrl(window.location.origin, {
                ...options,
                teams: selected.map((team) => team.id),
              })}
            />
          </>
        )}
      </div>
    </main>
  );
}
