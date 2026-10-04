# Share Widget

An embeddable, cross-origin widget for club and fan websites: LeagueSphere
fixtures, results, live scores and standings in a single `<iframe>`.

## Iframe and public API

The widget is the ready-made display; clubs that want their own layout read the
same data from the public API, [`/api/snapshot/`](../public-api/snapshot-v1.md),
which is the only cross-origin readable endpoint. The widget document runs on
`leaguesphere.app` and reads only that endpoint. Framing is relaxed only for
the `/share/widget/` route (the generator is a normal page and keeps
`X-Frame-Options: DENY`).

## Pages

| Route | Purpose |
|---|---|
| `/share/` | Generator: search a team, pick options, copy the embed code |
| `/share/widget/` | The React app rendered inside the iframe |

## Data

The widget reads one request per view from the public API:

- `/api/snapshot/?team=<id>&include=games,teams` — schedule, results and full
  team names/logos (`view=spielplan`).
- `…&include=games,teams,standings` — plus the league tables (`view=table`).
- `…&include=games,teams,live&date_from=<today>&date_to=<today>` — today's live
  blocks, re-polled every 60 s while a watched game is open (`view=live`).

The generator (a LeagueSphere page) also uses the internal `/api/teams/?search=`
and `/api/seasons/` for its pickers, and shows the snapshot URL of the current
selection as "Daten als JSON".

## Behavior

- Renders only the teams configured in `?t=` (repeatable).
- `view=spielplan` (default): past results and upcoming fixtures, with the team
  name, opponent and score; past games collapse after `past` entries.
- `view=table`: the standings of every league the configured teams play in,
  with those teams highlighted (an explicit `league` pins it to one league).
- `view=live`: play-by-play for in-progress watched games.
- Posts its height to the embedding page so the iframe auto-sizes.
- Always shows a "powered by LeagueSphere" attribution (not configurable).

See [specification.md](./specification.md) for the full URL parameter table and
freshness/privacy notes.
