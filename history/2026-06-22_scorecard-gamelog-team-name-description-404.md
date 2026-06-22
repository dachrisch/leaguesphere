# Scorecard gamelog 404 — "team {X} not found" on first entry

**Date:** 2026-06-22
**Branch:** `fix/scorecard-gamelog-team-name-description-404`
**Type:** Bugfix (live game-day scoring)

## Problem

During live scoring, saving the **first** scorecard entry of a game returned **HTTP 404**:

```json
{"detail":"Could not create team logs ... team Paderborn Dolphins not found"}
```

Only the first entry (right after the coin toss) failed; every subsequent entry saved
fine (201). The error never appeared as a backend `ERROR` log — DRF returns it only in the
404 response body, so it was visible only in the nginx access log.

## Root cause

A `name`-vs-`description` mismatch between the read/display path and the write path.

Each `Team` has two name fields:

- `Team.name` — short, unique (e.g. `Paderborn`) — used by the **write** path
- `Team.description` — full club name (e.g. `Paderborn Dolphins`) — used by the **display** path

The full `description` leaks into a POST exactly once per game:

1. Coin-toss screen loads the game from `GET /api/gameday/{id}/officials/{team}`, whose
   `home`/`away` come from `team__description` (`gameday_service.py:377/386`).
2. "Spiel starten" navigates to `…/details?start=<description>` (`Officials.jsx:178`).
3. `Details.jsx` reads `?start=` and the **first** "Eintrag speichern" posts it verbatim
   as `team`.
4. Backend `game_service.create_gamelog` did `Team.objects.get(name=team_name)` — the
   short-name lookup can't find the description → `Team.DoesNotExist` → 404
   (`game_views.py:103-106`).

Every later entry uses `gameLog.*.name` (short name, from `/api/gamelog`, which annotates
`team_column="name"`), so it resolves correctly.

## Reproduction (staging, prod data)

Prod data was imported into the `servyy-test` staging stack and the bug reproduced on
the real `GameService.create_gamelog` code path (game #45, *Augsburg Lions* vs
*Augsburg Centurions*): posting `"Augsburg Centurions"` (description) → 404 with the exact
production message; posting `"Centurions"` (name) → 201. 446 of 543 prod teams have
`name` ≠ `description`.

## Fix — team id on the wire

The ambiguity is eliminated by identifying the team by its **id (pk)** at the two
boundaries that crossed name/description, instead of by a name string. Team ids were
already available on both sides (the games/officials list exposes `id_home`/`id_away`;
`/api/gamelog` annotates `home_id`/`away_id`) — they were just unused.

Backend:
- `gamedays/service/gamelog.py` — the gameLog `Team` object and `GameLogObject` now carry
  the team `id`; `GameLog.__init__` reads it from the gameresult teams. POST/response JSON
  now includes `home.id`/`away.id`.
- `gamedays/api/serializers.py` — `GameLogSerializer._get_team` exposes `id` (from the
  existing `home_id`/`away_id` annotations) so the GET `/api/gamelog/{id}` the scorecard
  consumes carries team ids.
- `gamedays/service/game_service.py` — `GameService._resolve_team` resolves by **pk** when
  the identifier is numeric, with name/description fallback so a stale/cached client
  mid-deploy (still posting a name, or the description that used to leak) keeps working
  instead of 404ing. Raises `Team.DoesNotExist` (→ 404) only when nothing matches.

Frontend (scorecard):
- `Officials.jsx` — `?start=` now carries the team id (`selectedGame.id_home/id_away`)
  instead of the team description.
- `Details.jsx` — resolves the `?start=` id to the internal team via `gameLog.home.id`,
  and the gamelog POST now sends `team` = the possessing team's id (derived from
  `gameLog`). Possession is still tracked by name internally (bounded scope).

### Files changed
- `gamedays/service/gamelog.py`, `gamedays/api/serializers.py`,
  `gamedays/service/game_service.py`
- `scorecard/src/components/scorecard/Officials.jsx`,
  `scorecard/src/components/scorecard/Details.jsx`
- Tests: `gamedays/tests/service/test_game_service.py` (resolves by id / name /
  description; unknown → `Team.DoesNotExist`), `gamedays/tests/service/test_gamelog.py`
  (id in json), `gamedays/tests/api/test_game_views.py` (id in POST/GET responses),
  `scorecard/.../__tests__/Details.spec.jsx` + `__tests__/testdata/gameLogData.js`.

## Verification
- Backend (sqlite settings): `test_game_service.py`, `test_gamelog.py`,
  `test_game_views.py`, `test_scorecard_placeholder.py`, `liveticker/tests/` → 62 passed
  (TDD: RED on the description/id tests before the fix, GREEN after).
- Frontend: full `scorecard` vitest suite passed; `Details`+`Officials` specs → 15 passed;
  `npm run eslint` clean. `black` clean.
- Read-only check against staging prod data (game #45): team id, `"Centurions"` (name) and
  `"Augsburg Centurions"` (description) all resolve to team pk=23; unknown values → 404.

## Follow-up (not in this change — "full" scope, deferred)
Possession is still persisted by name (`Gameinfo.in_possession`, `GameSetup.fhPossession`)
and compared against `gameLog.*.name` in several places, so two latent name/description
bugs from the same root remain:
- `Details.jsx` `showHomeLog` is computed by name comparison (now seeded correctly from the
  `?start=` id, but the radios still compare names).
- `Halftime.jsx` compares `gameSetup.fhPossession` (a description) to `gameLog.home.name`
  (short name) → always false, so 2nd-half possession defaults wrong.
Converting the persisted possession fields + all comparisons to ids would close these.
