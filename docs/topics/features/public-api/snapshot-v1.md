# `GET /api/snapshot/`: contract, schema version 1

Implementation: `gamedays/api/snapshot.py`. Tests:
`gamedays/api/tests/test_snapshot.py`, `test_snapshot_public_api.py`,
`league_manager/tests/test_cors.py`.

## Access

- Anonymous; no authentication, no API key.
- CORS: `Access-Control-Allow-Origin: *` on this path only; methods
  GET/HEAD/OPTIONS; request header `If-None-Match` allowed; `ETag` and
  `Retry-After` exposed; never credentialed.
- Rate limits: the general anonymous rate (120/min per IP) for every request.
  Dump-sized scopes (no filter, or more than 100 gamedays) additionally cost the
  strict 60/hour per-IP rate, but only when the payload has to be rebuilt.
  A `429` carries `Retry-After`.

## Scope parameters

A repeated parameter is OR, different parameters are AND.

| Parameter | Meaning |
|---|---|
| `team=<id>` | Gamedays in which the team has a result row (includes unplayed fixtures). |
| `league=<id>` | Gamedays of the league. |
| `season=<id>` | Gamedays of the season. |
| `year=YYYY` | Seasons whose name starts with the year (`2025` → `2025`, `2025/2026`). Merged into `season`. A well-formed year without a matching season gives an empty scope. |
| `date_from`, `date_to` | `YYYY-MM-DD`, inclusive, on the gameday date. |
| `status` | Gameday status (`DRAFT`, `PUBLISHED`, `IN_PROGRESS`, `COMPLETED`). Without it, drafts are excluded. |

Unknown ids, malformed dates/years and unknown statuses return `400` with a
message per parameter.

## Includes (`include=a,b,…`)

All opt-in; without `include` the payload carries gameday entries only.

| Token | Adds |
|---|---|
| `games` | `gamedays[].games[]`: id, scheduled, field, stage, standing, status, `results[]` (`team_id`, `team_name` short code or placeholder label, `fh`, `sh`, `pa`, `isHome`), `halftime_score`, `final_score`. |
| `logs` | `games[].log`: the full event log, same shape as the game log page. |
| `teams` | Top-level `teams: {"<id>": {name, description, logo}}` for every team in scope (result teams plus `team` filter). `description` is the full name; `logo` is an absolute URL or `null`. |
| `standings` | Top-level `standings[]`: one entry per league-season in scope that has a table (`league {id, slug, name}`, `season {id, slug, name}`, `ranking` = tie-break step keys in order, `rows[]` with `rank` (within group), `group`, `standing`, `team_id`, `team__description`, `wins`, `draws`, `losses`, `games_played`, `pf`, `pa`, `diff`, `win_points`, `win_quotient`). Covers the whole league-season, not just the scope's teams. Cups/tournaments have no table. |
| `live` | Implies `games`. Today's games that are not `beendet` get `live {status, time, home {name, score, isInPossession}, away {…}, ticks[] {text, team, time}}` (latest 5 ticks, same text as the liveticker). |

## Envelope

```json
{
  "schema_version": 1,
  "generated_at": "2026-10-04T12:00:00+00:00",
  "etag": "…",
  "scope": {"league": null, "season": [9], "team": [159], "date_from": null,
            "date_to": null, "status": null, "include": ["games", "teams"], "count": 8},
  "gamedays": [{"id": …, "name": …, "season": 9, "season_display": "2026",
                "league": 7, "league_display": "…", "date": "2026-05-09", …}],
  "teams": {…},
  "standings": […]
}
```

Gameday entries also carry `author` and `has_designer_state`; they are not part
of the contract and may be dropped in a later schema version.

## Freshness

- Every response has an `ETag`; `If-None-Match` returns `304` when nothing in
  the response changed: gamedays, games, results, logs, plus team edits
  (`teams`), every result and point adjustment of the league-season
  (`standings`) and the current date (`live`).
- Payloads are cached for 300 s per ETag. While a gameday runs, a scope is
  rebuilt at most every 30 s; requests in between get the latest build under
  its own ETag.
- Polite clients poll at most once a minute, only while games are live, and
  pause when nobody is looking.

## Versioning

`schema_version` 1 changes additively only: new fields, new includes, new
filters. A breaking change ships as a new version side by side with v1.
