# home/ — CLAUDE.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
The **personal home page** (`/home/`): one authenticated, read-only page that
answers "what do I owe before the next gameday". Cross-cutting presentation over
data other apps own; it stores nothing.

## Role in the system
Reads from [gamedays](../gamedays/CLAUDE.md) (`Gameday`, `Gameinfo`,
`Gameresult`, `TeamLog`, `SeasonLeagueTeam`), [league_table](../league_table/CLAUDE.md)
(the existing ranking engine), [passcheck](../passcheck/CLAUDE.md) (roster,
jersey numbers, transfers, `EligibilityRule`) and [officials](../officials/CLAUDE.md)
(signups, licences, compliance). It writes nothing and has no models — zero
migrations.

## Key files
- `service/cards.py` — **pure** card builders, no ORM, no template logic. Every
  card returns `{key, title, severity, severity_text, summary, rows, links}`;
  `severity_text` always carries the meaning in words.
- `service/home_service.py` — `build_context(user, official_id=..., today=...)`
  is the only layer that queries. Role precedence: `team` → `official` (Moodle
  session) → `staff` → `guest`.
- `templates/home/home.html` — server-rendered, German UI, Bootstrap like the
  rest of the site.

## Routes
`/home/` (`name="home"`, `LoginRequiredMixin`). `LOGIN_REDIRECT_URL` points here;
`/` deliberately keeps its permanent redirect to the gameday list.

## Conventions & gotchas
- **No per-user or per-team state.** "Since last gameday" is derived from data
  every request; there is no `last_seen_at` and no cookie.
- **`TeamLog.player` is a jersey number**, not a player reference. Render `#19`;
  never resolve it to a name. Scoring events come from
  `gamedays.service.gamelog.SCORING_EVENTS` (keyed on event name, because
  `TeamLog.value` stays `0` when no jersey number was entered).
- **`Gameresult` carries only `fh`, `sh`, `pa`** — no yardage/catch data. Do not
  invent stats, ratings or predictions.
- **Team-less users must not get roster/transfer cards** — not even empty ones.
- **Query count must stay flat**: the page is read for one team only; assert
  with `django_assert_num_queries` / `CaptureQueriesContext` that 1 team and 12
  teams cost the same.
- There is **no User → Official relation**: the official state can only be
  rendered from `request.session["moodle_logged_in_user"]`.
- Per-league staff scoping is not modelled; staff are treated instance-wide and
  the nudge is limited to the league of the most recent gameday.

## Tests
```bash
cd leaguesphere && pytest home
```

## CI scope (scoped CI)

Changes here run: **python-core (pytest league_manager/tests/ share/tests/ home/tests/) + the backend image build.** Scoping details: [Scoped CI](../docs/topics/deployment/scoped-ci.md).
