# Share Widget

An embeddable widget for club and fan websites: live scores, fixtures and
standings from LeagueSphere, dropped into any page with one `<iframe>`.

## Iframe and public API

The widget is LeagueSphere-hosted, so it needs no CORS; framing is relaxed only
for the `/share/widget/` route. Its single data source is the public API,
[`/api/snapshot/`](../public-api/snapshot-v1.md), which is also readable
cross-origin, so a club can build its own display from the same data.

## Behavior

- The widget renders **only** the teams configured in its URL (`?t=`), so a club
  cannot accidentally publish another club's schedule.
- Data comes only from the public API, one `/api/snapshot/` request per view:
  `include=games,teams` (schedule, results, full team names and logos), plus
  `standings` for the table or `live` (scoped to today) for the live view.
  The generator's team search uses the internal `/api/teams/`.
- The widget reports its own height to the embedding page with
  `postMessage({ type: 'iframeHeight', height })`, so the iframe grows to fit.
- Unfinished games dated before today are treated as stale and omitted from
  "Kommende Spiele"; `view=live` only polls while a watched game is open today
  and the tab is visible.
- Results read home : away in a fixed order next to the H/A column.
- `view=table`: the snapshot's standings for each league the configured teams
  play in within the resolved season (leagues without a table, e.g. cups, are
  not returned). An explicit `league` pins the view to that one league. Tables
  ranked by league quotient show a "Quote" column.

## Configuration (URL parameters)

| Parameter | Default | Description |
|---|---|---|
| `t` | — | Team id. Repeat for multiple teams (`?t=159&t=287`). Required. |
| `view` | `spielplan` | `spielplan`, `table` or `live`. |
| `color` | `ff4500` | Accent color, 3- or 6-digit hex without `#`. |
| `past` | `3` | Past games shown before collapsing behind "weitere anzeigen". |
| `future` | `0` | Maximum upcoming games (`0` = all). |
| `show_past` | `1` | Set to `0` to hide past results. |
| `show_future` | `1` | Set to `0` to hide upcoming fixtures. |
| `title` | `1` | Set to `0` to hide the team heading. |
| `compact` | `0` | Set to `1` for a denser layout. |
| `live_url` | — | Optional `http(s)` link target for the live banner. |
| `season` | Aktuelle Saison | Season id (gameday entries carry it as `season`); scopes fixtures/results and the table to one season. When neither `season` nor `year` is set, the widget resolves the newest season in which one of the configured teams plays (client-side, no extra request). |
| `year` | — | Human-readable alternative to `season`, passed to the snapshot's `year` filter: seasons whose name starts with it (`2026`, or `2025/2026` for `2025`). `season` wins if both are set. |
| `league` | — | League id (gameday entries carry it as `league`); scopes to one league within the season (e.g. league vs. relegation, which are separate leagues). |

Non-`http(s)` values for `live_url`/`logo` are ignored; unknown values fall back
to defaults. The "powered by LeagueSphere" attribution is always rendered and
cannot be disabled. The parameter contract is compatible with the earlier
`renegades-scores` relay, so existing embeds only need their iframe `src`
changed.

## Data freshness

- Schedules and results are ETag-cached; the browser revalidates cheaply.
- Live scores come from the snapshot's `live` include. A scope is rebuilt at
  most every 30 seconds, and the widget polls every 60 seconds with
  revalidation, so unchanged polls are 304s.
- Snapshot payloads are file-cached for 300 seconds. The strict 60/hour per-IP
  rate applies only to rebuilding dump-sized scopes (no filter or more than 100
  gamedays); a club's team scope is never charged. The widget requests one
  team-scoped snapshot per load.

## Privacy

The widget serves only already-public data: team names, scores, game statuses
and standings. It does not include rosters, pass numbers or any personal data.
The snapshot is readable cross-origin, but never with credentials
(`CORS_ALLOW_CREDENTIALS` is off), so no LeagueSphere cookies or session data
are exposed; every other route has no CORS headers at all.
