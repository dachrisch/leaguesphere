# Snapshot as the only public API

Status: **implemented** on branch `claude/triage-open-issues` (2026-10-04);
contract: [features/public-api/snapshot-v1.md](../../features/public-api/snapshot-v1.md).
Origin: triage of #2028 / #2036 / #2037. Where the implementation differs from
the proposal below, see "As built".

## As built (differences from the proposal)

- `year=` lives in the snapshot: seasons whose name *starts with* the year
  (`2025` matches `2025/2026`, as the generator assumes); a well-formed year
  without a season gives an empty scope instead of a 400.
- `SNAPSHOT_LARGE_SCOPE_GAMEDAYS` is 100, not 50: a long-standing club's
  all-seasons widget scope (the default before the client picks the latest
  season) must not count as a dump.
- Logos are stored site-relative in the cached payload and made absolute per
  request (`request.build_absolute_uri`), so the cache stays host-independent.
- The teams map is one extra query per build (`scope_teams`), not collected
  from the prefetch; constant in scope size.
- `has_designer_state` had an N+1 (one query per gameday); fixed with a
  key-only prefetch while touching the payload builder.
- Open decisions 1–5 took their defaults.
- One branch/PR with one commit per area instead of one PR per step.

## Decision

`GET /api/snapshot/` becomes LeagueSphere's **only public API**: documented,
versioned, stable within a version, readable cross-origin. Every other `/api/`
endpoint is **internal**: it stays anonymous where it is today (LeagueSphere's
own pages need that), but it is undocumented, carries no stability promise and
never gets CORS.

"Internal without auth" means *unsupported*, not *secret*. Anyone can still
`curl` an internal endpoint; we just do not promise anything, do not advertise
it, and do not let third-party pages read it from a browser. Enforcement beyond
the existing `anon` throttle is out of scope (see Open decisions, 4).

Why one endpoint:

- One contract to keep stable, one ETag/caching story, one throttle to tune.
- The snapshot already is the bulk/consumer endpoint (the external snapshot bot
  is the heaviest API client, #1977) and already has scoped filters, opt-in
  `include=`, ETag + payload cache, and a rebuild throttle.
- #2028's security argument only has to be made for one path.
- The widget (#2029) dogfoods it: if the widget can be built on the snapshot
  alone, so can a club's own page.

## Endpoint classification

| Endpoint | Today | After |
|---|---|---|
| `/api/snapshot/` | anonymous, undocumented in `llms*.txt` | **public**: documented, v1 contract, CORS `*` |
| `/api/liveticker/` | documented in `llms*.txt`, `facts.json` | internal (liveticker app, widget until migrated) |
| `/api/league-table/{league}/[{season}/]` | documented | internal (league table pages) |
| `/api/gamedays/`, `/api/gamedays/{id}/games/` | documented | internal (scorecard, designer, gameday pages) |
| `/api/gameday/{id}/details/` | documented | internal |
| `/api/game-progress/` | documented | internal (journey dashboard) |
| `/api/leagues/`, `/api/seasons/` | documented | internal (generator, designer) |
| `/api/teams/` | added as "public" by #2029 | internal (generator team search) |
| everything else | internal | unchanged |

Internal endpoints are **not removed or changed** by this proposal. They only
leave the docs and lose the implied promise.

## Snapshot v1 contract

Unchanged: scope filters (`team`, `league`, `season`, `date_from`, `date_to`,
`status`, repeated params = OR), drafts excluded by default, `include=games,logs`,
response shape `{generated_at, etag, scope, gamedays}`. Without new `include`
tokens the payload stays byte-identical, so the snapshot bot is unaffected.

New:

### `schema_version`

Top-level `"schema_version": 1`. Rule for v1: additive changes only (new
fields, new `include` tokens). A breaking change ships as `?v=2` side by side
with v1 for at least one season.

### `include=teams` (replaces #2036's per-result fields)

Top-level map of every team referenced in scope (results plus the `team`
filter):

```json
"teams": {
  "159": {"name": "Nürn", "description": "Nürnberg Renegades",
          "logo": "https://leaguesphere.app/media/teammanager/logos/….png"}
}
```

- Keys are strings (JSON object keys); values from the prefetched
  `gameresult_set__team`, so no extra query for result teams, one `pk__in`
  query for filter teams not in any result.
- `logo` absolute (build from `settings` site URL, the snapshot has no
  request-independent cache otherwise), `null` when unset — same form as
  `/api/teams/`.
- Results keep `team_id`/`team_name`; clients look up `teams[team_id]`.
- Size, measured on prod 2026-10-04 (raw / gzip vs. today):

  | Scope | per-result fields (#2036 as filed) | `teams` map |
  |---|---|---|
  | `team=159&include=games` (560 results) | +44% / +23% | +4% / +9% |
  | `league=7&include=games` (1,468 results) | +46% / +20% | +1% / +3% |

### `include=standings` (new; absorbs the widget's league-table call)

One table per `LeagueSeasonConfig` whose (league, season) occurs among the
gamedays in scope. Leagues without a config (cups, tournaments) are simply
absent, so a client never has to guess which league has a table (the cause of
#2029 review P0-2).

```json
"standings": [
  {"league": {"id": 18, "slug": "ff-bl", "name": "…"},
   "season": {"id": 9, "slug": "2026", "name": "2026"},
   "ranking": ["win_quotient", "head_to_head", "…"],
   "rows": [ {"rank": 1, "group": "Gruppe 1", "team_id": 159, "wins": …,
              "draws": …, "losses": …, "games_played": …, "pf": …, "pa": …,
              "diff": …, "win_points": …, "win_quotient": …} ]}
]
```

- Built with `LeagueTableService(config).get_standing()` and the existing
  `STANDING_COLUMNS` (`league_table/api/views.py:13`), so numbers equal the
  league-table pages.
- `rank` and `group` are explicit (the API's `standing` column is the group
  label, which is what made "Rang" show "Gruppe 1" in the review).
- `ranking` = the ruleset's tie-break step keys in order. Clients show the
  `win_quotient` column when it comes first (#2037 part 1) without
  hard-coding league slugs.
- `team__description` is dropped from rows in favour of `teams[team_id]`
  when `include=teams` is set; kept otherwise. (Decide once, see Open
  decisions, 2.)
- Size: 1–7 KB raw per table on prod (6–35 rows).

### `include=live` (new; absorbs the widget's liveticker call)

For each game of a gameday dated **today** in scope whose status is not
`beendet`, a `live` block next to the game:
`{"status", "possession": "home"|"away"|null, "ticks": [{"text", "team",
"time"}]}` (last 5 ticks), produced by `LivetickerService` for those gameday
ids, so the ticker text is identical to the liveticker app. Games on other
days get no `live` key. `include=logs` stays the raw, complete event log.

## Freshness

The snapshot ETag (`gamedays/api/snapshot.py:172`) covers gamedays, results,
logs and gameinfos **in scope**. The new includes read data outside that:

| Include | Missing from today's ETag | Fix |
|---|---|---|
| `teams` | team name/description/logo edits | add `Team.updated_at` (auto_now, migration with default = now); fold `Max(updated_at)` over teams in scope |
| `standings` | results of *other* teams in the same league-season (a team-scoped snapshot!), point adjustments, config changes | fold `league_table.api.etag.generate_etag` inputs for each config in scope; config `updated_at` arrives with #1926 step 1 |
| `live` | nothing extra (ticks are TeamLogs of in-scope games) | — |

The include tokens are already part of the ETag, so scopes without the new
includes pay none of the extra aggregate queries.

## Rebuild control (throttle)

Today: payload cache keyed by ETag, 5-minute TTL, strict `snapshot` rate
60/hour **per IP** charged on every cache miss (`snapshot.py:337-340`).

Problem once live data comes from the snapshot: during a gameday every score
or log write changes the ETag, so almost every poll is a miss. One visitor
polling once a minute uses the whole 60/h; two widgets on one page, or a club
house behind one IP, get 429s mid-game.

Change: bound rebuilds **per scope**, not per IP.

- Keep a second cache entry per scope key (normalized query string):
  `{etag, payload, built_at}`.
- On a miss, if that scope was built less than `SNAPSHOT_MIN_REBUILD_SECONDS`
  (30) ago, serve the stored payload with **its own** ETag
  (`response["ETag"]` set in the view; Django's `condition` only sets the
  header when absent). Clients see data at most 30 s old during live play.
- Otherwise rebuild (single-flight lock as today).
- The per-IP 60/h rate stays only for **large scopes** (no `team`, `league`,
  `season` or date filter, or more than `SNAPSHOT_LARGE_SCOPE_GAMEDAYS` = 100
  gamedays): that is the dump the strict rate was written for.

Result: rebuild cost is at most 2 per minute per distinct scope, independent of
viewers; cache hits and 304s stay on `anon` 120/min.

## CORS (the narrowed #2028)

```python
# league_manager/settings/base.py — only the public API is cross-origin readable
CORS_URLS_REGEX = r"^/api/snapshot/$"
CORS_ALLOW_ALL_ORIGINS = True          # applies only to CORS_URLS_REGEX
CORS_ALLOW_CREDENTIALS = False
CORS_ALLOW_METHODS = ("GET", "HEAD", "OPTIONS")
CORS_ALLOW_HEADERS = (*default_headers, "if-none-match")
CORS_EXPOSE_HEADERS = ("ETag", "Retry-After")
CORS_ALLOWED_ORIGINS = []              # unchanged from #1977
```

#2028's analysis holds and gets simpler: one anonymous, read-only, already
throttled path; no credentials; every internal endpoint keeps #1977's posture.
`Retry-After` is exposed so browser clients can back off on 429.

## Widget migration (dogfooding)

`share/src/lib/api.ts` today calls six endpoints. After:

| View | Today | After |
|---|---|---|
| Spielplan | snapshot + `/api/seasons/` (year → id) | `snapshot?team=…&include=games,teams` |
| Tabelle | snapshot + `/api/leagues/` + `/api/league-table/…` (try candidates) | same snapshot `+standings` |
| Live | snapshot + `/api/liveticker/` every 60 s | `snapshot?team=…&date_from=today&date_to=today&include=games,teams,live` every 60 s with `If-None-Match` |
| Generator (`/share/`) | `/api/teams/`, `/api/seasons/`, `/api/leagues/` | unchanged — it is a LeagueSphere page, internal endpoints are fine |

- `year=` resolution moves server-side (`?year=2026` → seasons whose name
  starts with `2026`), removing `/api/seasons/` from the widget.
- Short codes ("Nürn") disappear: headings/opponents use
  `teams[id].description` (#2029 review nit).
- `leagueCandidates` and the 404-retry loop in `views/Table.tsx` go away.
- The generator shows the snapshot URL for the current selection ("Daten als
  JSON"), which is also how a club developer finds team ids — no public
  directory endpoint needed.

## Docs

- `llms-dynamic.txt`, `llms-full.txt`, `llms.txt`, `facts.json`
  (`league_manager/views.py:111`): replace the endpoint list with the snapshot
  (params, includes, ETag, rebuild cadence, "poll at most once a minute, only
  while a gameday is live, pause hidden tabs", v1 stability rule). One line:
  "Other `/api/` paths are internal and may change without notice."
- New `docs/topics/features/public-api/snapshot-v1.md` as the contract
  reference; `share-widget/specification.md` points to it.

## Effect on open issues

- **#2028** — keep open, retitle "CORS for `/api/snapshot/` (the public API)";
  this proposal's CORS block is the implementation. Previous recommendation
  (close as superseded) is withdrawn.
- **#2036** — implement as `include=teams` instead of per-result fields; drop
  the `/games/` part (internal endpoint).
- **#2037** — part 1 via `standings[].ranking`; part 2 (score order) is
  widget-only and independent.
- **#1926** — table modes surface in `standings` as additive fields
  (`mode`, `accounted_games`) when that lands; its `config.updated_at` also
  closes the standings ETag gap above.

## Delivery order (one PR each, TDD)

1. **Snapshot: `schema_version` + `include=teams` + `Team.updated_at` in the
   ETag.** Tests: map covers result and filter teams; absolute logo; null logo;
   query count unchanged for result teams; team edit changes the ETag; no
   `include=teams` → payload byte-identical.
2. **Snapshot: `include=standings`.** Tests: config-less league omitted;
   numbers equal `LeagueTableAPIView`; `rank`/`group`/`ranking`; a result of a
   team *outside* a team-scoped snapshot changes its ETag when `standings` is
   included and does not when it is not; `assertNumQueries` per config.
3. **Rebuild control** (per-scope min interval, large-scope IP rate). Tests:
   burst of misses within 30 s → one build, stored ETag returned; large scope
   still 429s at 61; small scope never 429s from rebuilds.
4. **Snapshot: `include=live`.** Tests: only today's non-final games carry
   `live`; tick text equals `/api/liveticker/` for the same game.
5. **CORS on `/api/snapshot/`** + tests from #2028 (header only on snapshot;
   preflight GET ok, POST not listed; no credentials header; internal paths
   such as `/api/leagues/`, `/api/teams/`, `/api/liveticker/` get no CORS).
6. **Widget on snapshot only** (+ `year` filter), #2037 both parts.
7. **Docs switch** (`llms*.txt`, `facts.json`, contract page).

1–2 are independent of each other; 6 needs 1, 2, 4; 7 goes last so docs never
promise something not deployed.

## Open decisions

1. **Trim internal fields from the public payload?** `author` (user id) and
   `has_designer_state` come from `GamedayListSerializer` and mean nothing to
   consumers. Dropping them is breaking for v1 consumers (the snapshot bot).
   Default: keep in v1, mark "not part of the contract", drop in v2.
2. **`team__description` in standings rows**: always, or only without
   `include=teams`. Default: always (simpler clients, ~30 bytes/row).
3. **Logo URL base**: absolute with the configured site URL (default) vs.
   site-relative (then clients on other origins must prefix).
4. **Soft-enforcing "internal"** (e.g. stricter anon rate for requests
   without a same-origin `Sec-Fetch-Site`): not now; revisit if access logs
   show third-party load on internal paths.
5. **Deprecation notice for documented consumers** of liveticker/league-table:
   check access logs (User-Agent, `Origin`) before step 7; the endpoints keep
   working either way.
