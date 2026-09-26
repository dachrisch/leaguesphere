# LeagueSphere Domain Knowledge (hardening reference)

How a season is set up, how games are structured, and how the three hardening
targets read/write that structure. Mined from code + live demo seed/API
2026-09-25/26. Stage SSH was unreachable from the runner, so patterns come
from demo seed data (`seed_demo_data.py`) — re-confirm against stage via
`lookup-stage-data` from a keyed host before treating seed quirks as real.

## 1. Season setup

- `Season {name, slug}`, `League {name, slug}`, `Association {abbr unique,
  name}` — no FKs between them (`gamedays/models.py:10-43`).
- `SeasonLeagueTeam {season FK CASCADE, league FK CASCADE, teams M2M}` is the
  roster of a season+league (`models.py:61-67`); no DB uniqueness, enforced via
  `get_or_create + teams.set()` (seed `:143-148`).
- `Gameday {name, season FK, league FK, date, start e.g. 10:00,
  format default "6_2", author, address, status ∈ {DRAFT,PUBLISHED,IN_PROGRESS,
  COMPLETED} default DRAFT, published_at, updated_at}` (`models.py:70-120`).
  `format` keys into `schedule_<format>.json`.
- Demo seed: latest season × 4 leagues × 3 teams; per league 2 gamedays —
  Spieltag 1 `PUBLISHED`, Spieltag 2 `DRAFT` (`seed_demo_data.py:248-284`).
  Demo resets nightly ~midnight UTC **with fresh RANDOM scores**
  (`random.randint(0,3)` per half, `create_game_result :335-367`) — never
  assert exact seed scores across days. `get_or_create` reseeding does **not**
  clean `TeamLog` rows (soft-deleted remnants persist).
- Demo logins: `admin@demo.local/DemoAdmin123!`,
  `referee@demo.local/DemoRef123!`, `manager`, `user` (seed `:200-245`).

## 2. Schedule formats (planning language)

- Files: `gamedays/management/schedules/`: 29 `schedule_*.json` + 13
  `update_*.json` (some formats have no update file → loader returns `{}`).
  Name pattern `schedule_<format>.json`; `format.split("_")[0]` = team count,
  must equal group sizes sum (`management/schedule_manager.py:172-177`).
- Schedule entry: `{field: str, games: [{stage, standing, home, away,
  official, break_after?}]}`. `field` → `Gameinfo.field` verbatim; `{}` =
  empty slot (time advances, no game). `break_after` (default 0) adds minutes
  to the 70-min slot (`schedule_manager.py:232-240`).
- Team refs: `G_T` = groupIndex_teamIndex (`0_0`); anything without `_` is a
  **literal placeholder-team name** that must exist as a `Team` row or the
  gameday's Gameinfos are wiped + `TeamNotExistent` raised
  (`schedule_manager.py:213-218`). Vocabulary: `P1/P2/P3 Gruppe N`,
  `Gewinner/Verlierer HF1/HF2/P3/P5/PO1/PO2/Spiel N`,
  `Bester/Zweitbester/Schlechtester P1/P2` (created in
  `tests/setup_factories/db_setup.py:273-325`).
- Minimal pair to learn the shape: `schedule_4_final4_1.json` (6 games:
  2× Vorrunde `Spiel 1/2`, then Finalrunde `Spiel 3/4/5/P1` wired by
  Gewinner/Verlierer refs) + `update_4_final4_1.json` (per target
  `{name, pre_finished, games: [{home,away,officials: {standing, place,
  points}}]}`; `points`: 2 = win, 0 = loss).
- `stage` → `Gameinfo.stage` free text; `stage_category` auto-derived
  (`Vorrunde/Hauptrunde→PRELIMINARY, Finalrunde→FINAL,
  Zwischenrunde→PLACEMENT`, else CUSTOM; `service/stage_category.py`).
- Resolution: `ScheduleUpdate.update()` (file path) and
  `schedule_resolution_service.update_participants(finished_standing)`
  (designer `TemplateUpdateRule` path) look up
  `GamedayModelWrapper.get_team_by(place, standing, points)` → overwrite
  `Gameresult.team` / `Gameinfo.officials`. Fired via `post_save` on
  `status==COMPLETED` (`service/signals.py:16-35`). Bracket helper:
  `service/bracket_resolution.py` (winner by `fh+sh`, raises on draw/missing).

## 3. Game structure & lifecycle (playing language)

- `Gameinfo {gameday FK, scheduled TimeField, field +int, officials FK(Team,
  PROTECT), status default "Geplant" (no choices=), gameStarted/gameHalftime/
  gameFinished TimeFields, stage, standing, stage_category, league_group FK
  null, in_possession CharField null}` (`models.py:165-211`). Model statuses:
  `DRAFT, Geplant (=PUBLISHED), Gestartet (=IN_PROGRESS), beendet
  (=COMPLETED)`; runtime-only `"1. Halbzeit"/"2. Halbzeit"`
  (`service/wrapper/gameinfo_wrapper.py:9-11`).
- `Gameresult {gameinfo FK, team FK null, fh/sh SmallInt null,
  pa +int null, isHome bool}` — total = `fh+sh`
  (`service/wrapper/gameresult_wrapper.py:54-60`).
- `TeamLog {gameinfo FK, team FK null, sequence +int, player +int null,
  event Char(100), input Char(100), value +int, cop bool, half +int,
  isDeleted bool, created_time, author FK}` (`models.py:280-292`).
- Transitions (all unconditional overwrites — **no guards**):
  `PUT /api/game/<id>/setup` → start (`"1. Halbzeit"`, only on first create),
  `PUT .../halftime` → `"2. Halbzeit"`, `PUT .../finalize` → `beendet` +
  `GameSetup{captains, note}`, `PUT .../possession` → free text.
  Verified live: finalize-direct on `Geplant` → 200; halftime-after-finish →
  200 + status regresses to `"2. Halbzeit"`; finalize-again → 200; setup with
  valid body on `beendet` → 200, status stays `beendet` (no restart).
  Each transition writes a `TeamLog(half=0, sequence=0)` marker
  (`_create_log_entry`).
- Scoring: `POST /api/gamelog/<gameId> {gameId, team (id preferred,
  name/description fallback), half (1|2), event: [{name, player?, input?}]}`.
  `value`: Touchdown→6, Overtime/1-Extra-Punkt/Safety(+1)→1,
  2-Extra-Punkte/Safety(+2)→2, else 0; `cop` for Turnover/Interception;
  `player` coerced to 0..32767 or dropped; `Strafe/Spielzeit/Auszeit/First
  Down` get sequence 0 (excluded). Accepted in **any** game status; each write
  recomputes `Gameresult` halves from non-deleted logs. Valid shape → 201
  (verified). Non-list `event` → 500 (F1). `DELETE /api/gamelog/<id>
  {sequence}` soft-deletes + rescores; auth: staff/gameday-author/entry-author,
  others → 403 (verified: referee vs admin entry).
- Manual result path: `PATCH gameinfo/<pk>/result/` (`Geplant`+halftime_score
  → `Gestartet`; final_score → `beendet`, cascades gameday
  PUBLISHED→IN_PROGRESS→COMPLETED); `POST .../results/` always completes.
- Standings (`league_table`): only `beendet` games count; pf=fh+sh, points and
  tiebreaks per `datatypes.py` config.

## 4. Read paths & filters (watching language)

- Scorecard SPA (`/scorecard/`, JS+Redux): menu → `Scorecard` →
  `#/select-game` → `GET /api/gameday/list` filtered to **server-local today**
  (`GamedayListAPIView`, `gamedays/api/views.py:342-354`; `?/DEBUG_DATE` in
  DEBUG). Game list shows only games the user officiates ("zu pfeifen") unless
  "Zeige alle Spiele". Writes use `axios` with `csrftoken`/`X-CSRFToken`.
- Liveticker SPA (`/liveticker/`, JS+Redux, polls every 60 s,
  `?league=<slug>`): feed = server-today gamedays
  (`liveticker_service.py:25-32`) with upcoming/latest slot windows; per-game
  `home/away {name, ...}` currently fed from `team__description` (F8).
- Games list ETag-cached (`GET /api/gamedays/<id>/games/` → 304, verified);
  unknown ids → 404 (`{"error":"Gameday not found"}` / gamelog
  `{"detail":"No game found…"}`).

## 5. Reusable hardening harness

Playwright-core + system Chromium headless (`--no-sandbox`). Scripts live in
`/tmp/opencode/harness/` (copy into repo on request): `gate.js`,
`recon.js`, `harden.js` (D1–D5/S1–S4/L1–L3), `harden2.js` (CSRF fix,
scorecard deep-dive, cleanup), `harden3.js` (GET/DELETE/possession edges,
today-shift, publish-empty), `harden4.js` (PUBLISHED-today click-through),
`probe.js` (500 capture), `verify.js` (seed restore), `corrected.js`
(server-today proof + populated states), `round5.js` (status matrix, log
lifecycle, referee matrix, UI E2E attempt), `round6.js` (cleanup, permission
matrix, setup-guard, revert verify), `investigate.js` (log inspection).
Auth recipe: UI login (cookies shared with `page.request`) + `Referer` +
`Origin` + `X-CSRFToken`; without `Referer` Django returns 403 regardless.
Results: `runs/<ts>/{results.json|*.log,shots/}`. Run all mutation rounds
against **demo only**; revert date shifts; deleted scratch gamedays return
204; seed scores are random per reset — assert shapes, not values.
