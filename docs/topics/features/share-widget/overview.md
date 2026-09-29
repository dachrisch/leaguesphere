# Share Widget

An embeddable, cross-origin widget for club and fan websites: LeagueSphere
fixtures, results, live scores and standings in a single `<iframe>`.

## Why an iframe instead of CORS

Third-party pages cannot read `/api/...` from the browser because the responses
carry no `Access-Control-Allow-Origin`. Instead of opening the read API to every
origin, we host the widget ourselves: the document runs on `leaguesphere.app`,
so its API calls are same-origin and no CORS headers are needed. Only framing is
relaxed — and only for the `/share/widget/` route (the generator is a normal
page and keeps `X-Frame-Options: DENY`).

## Pages

| Route | Purpose |
|---|---|
| `/share/` | Generator: search a team, pick options, copy the embed code |
| `/share/widget/` | The React app rendered inside the iframe |

## Data

All data is already public and anonymous:

- `/api/snapshot/?team=<id>&include=games` — one team-scoped dump of gamedays,
  games and results (replaces the old per-gameday scrape + `snapshot.json`).
- `/api/liveticker/` — live scores, cached 60 s server-side.
- `/api/league-table/<league>/<season>/` — standings for `view=table`.
- `/api/teams/?search=` — team search for the generator.

## Behavior

- Renders only the teams configured in `?t=` (repeatable).
- `view=spielplan` (default): past results and upcoming fixtures, with the team
  name, opponent and score; past games collapse after `past` entries.
- `view=table`: the watched team's league standings, with that team highlighted.
- `view=live`: play-by-play for in-progress watched games.
- Posts its height to the embedding page so the iframe auto-sizes.
- Shows a "powered by LeagueSphere" link unless `powered=0`.

See [specification.md](./specification.md) for the full URL parameter table and
freshness/privacy notes.
