# Share Widget

An embeddable widget for club and fan websites: live scores, fixtures and
standings from LeagueSphere, dropped into any page with one `<iframe>`.

## Why an iframe instead of CORS

A third-party page cannot read `/api/...` from the browser because the API
responses carry no `Access-Control-Allow-Origin`. Opening the read API to every
origin was considered, but hosting the widget ourselves is a tighter boundary:
the widget document runs on `leaguesphere.app`, so its API calls are
same-origin and no CORS headers are needed at all. The only thing that needs to
be relaxed is framing, and only for the two `/share/` routes.

## Behavior

- The widget renders **only** the teams configured in its URL (`?t=`), so a club
  cannot accidentally publish another club's schedule.
- Data comes from the public API: `/api/snapshot/` (schedule + results, team
  filtered), `/api/liveticker/` (live scores, ~60 s freshness) and
  `/api/league-table/` (standings). `/api/teams/` powers team search.
- The widget reports its own height to the embedding page with
  `postMessage({ type: 'iframeHeight', height })`, so the iframe grows to fit.

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
| `powered` | `1` | Set to `0` to hide the "powered by LeagueSphere" link. |
| `live_url` | — | Optional `http(s)` link target for the live banner. |
| `refresh` | — | Present (and not `0`) to bypass client caches. |
| `season` | latest | Season id (from `/api/seasons/`); scopes fixtures/results and the table to one season. |
| `league` | — | League id (from `/api/leagues/`); scopes to one league within the season (e.g. league vs. relegation, which are separate leagues). |

Non-`http(s)` values for `live_url`/`logo` are ignored; unknown values fall back
to defaults. The parameter contract is compatible with the earlier
`renegades-scores` relay, so existing embeds only need their iframe `src`
changed.

## Data freshness

- Schedules and results are ETag-cached; the browser revalidates cheaply.
- Live scores follow `/api/liveticker/`, which is cached for 60 seconds
  server-side. That is the effective live update cadence.
- Snapshot responses are file-cached for 300 seconds and throttled (60/hour per
  IP); the widget requests one team-scoped snapshot per load.

## Privacy

The widget serves only already-public data: team names, scores, game statuses
and standings. It does not include rosters, pass numbers or any personal data.
Because the iframe is same-origin with the API and `CORS_ALLOW_CREDENTIALS`
stays off, no LeagueSphere cookies or session data are exposed.
