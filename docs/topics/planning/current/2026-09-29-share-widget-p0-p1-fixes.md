# Share widget (PR #2029) — P0/P1 fix plan

Status: **planned, not implemented**. Source: production-readiness review of
PR #2029 (`feat/share-widget`, stage `v4.34.0-rc.13`, 2026-09-29) with headless
Chromium against stage and a cross-origin test page.

Review verdict: **not ready**. Security posture holds (framing headers, output
escaping, `http(s)`-only URLs, no CORS); correctness of the default views and
the snapshot throttle block production.

Every item follows the repo TDD rule (failing test first). Frontend lives in
`share/src/`, backend in `share/` and `gamedays/api/`. One commit per item.

## P0 — blockers

### P0-1 Stale games shown as upcoming; default spans all seasons (M)

Repro: `/share/widget/?t=159` lists four games from 13.05.2023 under
"Kommende Spiele" (status `Geplant`, gameday still `PUBLISHED`) and
"Weitere 85 anzeigen" across all seasons. The spec promises "latest season".

- `lib/schedule.ts`: past = status `beendet`; upcoming = not final **and**
  gameday date >= today. Past-dated unfinished games are dropped.
- `lib/live.ts`: `activeWatchedGames` only counts non-final games whose
  gameday is today (stops perpetual 60 s liveticker polling).
- Default season (no `season`/`year`): newest `season_display` in the snapshot
  that contains one of the watched teams' games, filtered client-side (no extra
  request, no API change). Update `specification.md`; rename the generator
  option "Alle / Neueste" to "Aktuelle Saison".
- Tests: 2023 `Geplant` fixture appears in neither list; no live polling when
  the only open game is not today; multi-season snapshot renders only newest.

### P0-2 Table view picks a cup instead of the league (M)

Repro: `/share/widget/?t=159&view=table` (with or without `year=2026`) →
`GET /api/league-table/afvby/` 404 → "Tabelle nicht verfügbar". Works only with
explicit `league=7`.

- `lib/table.ts`: replace `pickLeagueSeason` with `leagueCandidates` — leagues
  in the resolved season, ordered by number of games desc.
- `views/Table.tsx`: try candidates in order, first 200 wins; error only when
  all fail. Explicit `league=` short-circuits.
- Generator: derive the league list from the snapshot even without a season;
  in the Tabelle view with more than one league, show a hint to pick one.
- Tests: cup + league fixture where the cup 404s → league table shown;
  explicit `league` wins.

### P0-3 "Rang" column shows the group name (S)

Repro: `/share/widget/?t=159&view=table&year=2026&league=7` → every row's rank
is "Gruppe 1". The API's `standing` is the group label, not the rank.

- `lib/types.ts`: `standing: string`.
- `StandingsTable.tsx`: rank = index within group + 1; render a group header
  row when the group changes and the table has more than one group.
- Tests: ranks 1..n, header only with multiple groups.

### P0-4 Snapshot throttle incompatible with per-page-view loads (M/L)

`snapshot` scope is 60/hour per IP and counts cache hits and 304s. Every widget
load costs one snapshot, `year=` embeds cost two, and each generator option
change reloads the preview (15 colour steps → 8 snapshot fetches). Behind
CGNAT/venue Wi-Fi the limit is shared; once hit, every widget from that IP shows
"Daten konnten nicht geladen werden." for up to an hour, with no retry.

- Backend (`gamedays/api/snapshot.py`): apply the strict `snapshot` rate only
  on a payload cache **miss** (rebuild path). Drop `ScopedRateThrottle` from
  `throttle_classes` and invoke it explicitly in the miss branch, raising
  `Throttled`. Cache hits and 304s stay under the general `anon` 120/min.
- Frontend: `useSnapshot` waits until `year` is resolved before fetching
  (removes the double fetch); retry once on 429 honouring `Retry-After`
  (cap 30 s), then show the error.
- Generator: debounce the preview URL (~600 ms) so colour dragging/typing
  reloads the iframe once.
- Tests — pytest: > 60 cache hits not throttled, 61st miss → 429, 304 not
  counted, with `assertNumQueries`. vitest: no fetch before season resolved;
  debounce collapses a burst (fake timers); single 429 retry.

## P1 — should fix before prod

### P1-5 Documented parameters with no effect (M)

- `powered=0` hides the attribution (PR body + spec promise it; `PoweredBy.tsx`
  says the opposite) — add a generator checkbox. *Decision pending, see below.*
- `live_url`: make the LIVE card link to it (`http(s)` only,
  `target=_blank rel=noopener`); generator input shown for the Live view.
- `compact=1`: real `.share-widget--compact` style instead of the no-op
  `text-body` class.
- `refresh`: remove from parser and docs (ETags already handle freshness).
- Tests: param → rendering; generator URL round-trip.

### P1-6 Listener snippet hard-codes `https://leaguesphere.app` (S)

Embeds generated on stage or on `www.leaguesphere.app` (served directly, no
redirect) never auto-size. Replace `PARENT_LISTENER_SNIPPET` with
`buildListenerSnippet(origin)` fed by `window.location.origin` (same origin as
the widget URL). Test: snippet contains the given origin.

### P1-7 Standings table overflows at phone width (S)

At 375 px the "Pkt" column is cut off. Wrap in `.table-responsive`; hide EP/GP
below 420 px iframe width. Verify with Playwright at 375 px (no horizontal
overflow, Pkt visible).

### P1-8 Highlight bar drawn on every cell (S)

`widget.css`: `border-left` on `.share-table__row--highlight td:first-child`
only.

### P1-9 Generator page is frameable without need (S)

`/share/` includes the site header (logout POST form) and is framed by
`frame-ancestors *`, although only `/share/widget/` must be embeddable (the
preview frames the widget, not the generator). Make `ShareGeneratorView` a
plain `TemplateView` (keeps `X-Frame-Options: DENY`). Tests: generator `DENY`,
widget `frame-ancestors *`. Update `requirements.md` criterion 1, overview,
`share/views.py` docstring and PR body ("only `/share/widget/`").

## Order

1. P0-3, P1-8, P1-9, P1-6 (small, independent)
2. P0-1, then P0-2 (depends on P0-1 season resolution)
3. P0-4 (backend, then frontend)
4. P1-7, P1-5
5. Gates: `npm --prefix share run test:run|typecheck|eslint|build`,
   `pytest share gamedays/tests/api`, `black .`,
   `python3 scripts/check_scope_coverage.py`
6. Deploy to stage, re-run the Playwright review scripts, tick the manual item
   of the PR test plan.

## Open decisions

1. Attribution toggle: implement `powered=0` (matches PR body/spec, default of
   this plan) or keep attribution mandatory and fix the docs.
2. Land the fixes on `feat/share-widget` (keeps PR #2029 one unit, default) or
   as a follow-up PR.
3. Stage deployment needs an explicit go-ahead.

## Nits (not in scope)

Team heading/opponents use the short code ("Nürn") instead of the full name;
accent colour invisible in the Spielplan view; generator preview never shrinks;
`/api/teams/` lists ~200 placeholder teams ("A1", "Gewinner AF 1"); live score
wraps as "13 :" / "0" on narrow widths. Stage-only: team logo media 404.
