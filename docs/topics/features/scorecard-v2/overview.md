# Scorecard v2

`/scorecard/v2/` is the field app that replaces the way a gameday is run: pick
the gameday, prepare the game, record the plays, confirm the result. It is a
login-gated single-page app (Vite + React + TypeScript) served by the Django app
`scorecard_v2/`, and it writes the same `TeamLog`, `GameSetup` and
`GameOfficial` rows as the old scorecard, which stays at `/scorecard/`
untouched.

Status: **beta**. Both apps are bookmarks; nothing links v2 from the old app.

- Plan and task list:
  [Scorecard v2 plan](../../planning/current/2026-10-26-scorecard-v2.md)
- Help topic: [Scorecard v2](/help/spieltag-v2/) (in-app, German)

## URL and routing

| URL | Serves |
|---|---|
| `/scorecard/v2/` | this app |
| `/scorecard/v2/sw.js` | its service worker (scope `/scorecard/v2/`, anonymous, `Cache-Control: no-cache`) |
| `/scorecard/` | the existing scorecard, unchanged |

`league_manager/urls.py` includes `scorecard/v2/` **before** `scorecard/`. The
worker lives under the app scope on purpose: served from `/static/` it could
only control static assets, and its scope could never leak into the old app.

## The flow

`gamedays → games → setup → tracking → finalise → result`, one state machine in
`scorecard_v2/src/app/state.ts`:

1. **Meine Spieltage** — today's gamedays (`GET /api/gameday/list`).
2. **Spiele** — the games of one gameday, per crew or the whole gameday
   (`GET /api/gameday/<id>/officials/<team>`, `team=*` for all), with status and
   passcheck state.
3. **Vorbereitung** — crew and licences, coin toss, first possession,
   direction, passcheck link, **Spiel starten**. An invalid licence warns and
   needs a second tap; it never blocks the start.
4. **Feld · Runde** (the tracking screen) — score header with possession,
   touchdown with the roster's jerseys (numeric fallback when there is none),
   PAT, first down, turnover, interception, penalty with search, safety,
   overtime, Spielzeit, Auszeit, half-time, and **Rückgängig** per entry. The
   app bar carries the sync chip, the theme switch and **Abmelden** on every
   screen; the header adds the gameday and league.
5. **Spielende** — captains from the roster (suggestions only, free text),
   optional note, then **Ergebnis abschicken**.
6. **Ergebnis gesendet** — final and half-time score from the server payload.

What the backend had to grow (all additive):

- `GET /api/game/<id>/roster` — jersey + surname per side, `[]` for a bracket
  placeholder;
- `passcheck` on the games-to-whistle payload;
- `league_display` on the gameday list;
- `GameLogSubmission` and `GameSetup.device_id` (migrations `0046`, `0047`).

## Offline contract

Offline is part of the feature, not a follow-up. The app shell is precached;
captured plays live in an IndexedDB outbox and are drained FIFO.

| Works offline (after the first load) | Needs network |
|---|---|
| Open the app shell | **Spiel starten** |
| Record any in-game event (touchdown, PAT, series, penalty, safety, overtime, time, timeout) | Finalise (**Ergebnis abschicken**) |
| Undo an entry that has not been sent yet | Edit the officials |
| Switch possession, record half-time | Load a game this device never opened |
| See the score and log built from local entries (marked *vorläufig*) | |

Rules that make it safe:

1. **Writes are idempotent.** Every queued submission carries a `client_id`; the
   server applies it at most once (`GameLogSubmission`, unique per game) and
   answers a repeat with the current log plus `200` instead of `201`.
2. **One device per game.** The first device to start a game writes
   `GameSetup.device_id` and sends it as `X-Scorecard-Device` on every log
   write. A second device gets `409` and switches to read-only with the reason.
   Staff can release the lock with `DELETE /api/game/<id>/device` — without that
   a lost phone would lock the game forever.
3. **One queue per game, FIFO.** The outbox flushes in order and stops on the
   first network error, so the log order is the order the official tapped.
   `401`/`403` pause the queue instead of dropping it; a re-login resumes.
4. **Finalise is blocked while the queue is non-empty** (pending or rejected
   writes). No result leaves the device with events still on it.
5. **The score is never computed client-side.** Local entries are optimistic
   display only; every sync replaces the log with the server payload.
6. **No API response is cached by the worker.** `/api/**` is per user; the
   IndexedDB preload is the only offline data store.

The outbox, the sync engine and the snapshot store are pure modules under
`scorecard_v2/src/offline/`, tested without a browser (`fake-indexeddb`).

## Rolling back

The old app is not imported, not modified and not linked, so rollback is a
bookmark: keep using `/scorecard/`. Both apps write the same rows, so a gameday
started in v2 can be finished in the old scorecard.

To take v2 out of production, remove the `scorecard/v2/` include from
`league_manager/urls.py`; the backend additions are optional fields the old app
never sends (tested explicitly), so they can stay. Retiring the old app is
**not** part of this work.

## CI

| Job | What it covers |
|---|---|
| `python-live` | `scorecard_v2/tests/` plus the existing `scorecard/tests.py`; the app shares the `gamedays` APIs |
| `scorecard_v2_js` | `npm run eslint`, `npm run typecheck`, `npm run test:run` (Codecov flag `scorecard-v2`), `npm run build` and the IIFE/`import.meta` guard |
| `e2e` | builds the v2 bundle and runs `scorecard_v2/tests/e2e/` beside the old scorecard flow |
| `build_frontend` | `container/nginx.Dockerfile` builds the bundle in a `scorecard-v2-app` node stage |

Scope rules live in `.circleci/scope-mapping.txt`: the frontend files gate
`run-scorecard-v2`, the Python and template files gate `run-python-live`, and
`scorecard_v2/tests/e2e/.*` follows the other e2e sources. The bundle itself is
gitignored and built in Docker, like every other SPA. See
[Scoped CI](../../deployment/scoped-ci.md).

## Testdata on stage

The stage database is reset every night. To get a finished test gameday for
**today**, run the management command inside the stage container:

```bash
ssh cda@lehel.xyz "docker exec leaguesphere_stage.staging-app \
    python manage.py seed_scorecard_demo"
```

It creates (in a dedicated `Scorecard Demo League`, never the real leagues):

- one published gameday for today with four games (13:30 / 14:40, fields 1/2),
- four demo teams with 14 players and jerseys each,
- a `scorecard-test` staff user (password `ScorecardV2!2026`) and an officials
  crew with valid licences,
- confirmed rosters and Passcheck for the first game only, so both chip states
  are visible.

Rerunning the command on the same day updates those rows instead of duplicating
them. Useful options: `--date YYYY-MM-DD`, `--name`, `--username`,
`--players-per-team`. The user/password, gameday name and team/league names are
all overridable.

## Verification

Automated: 494 vitest cases (incl. the outbox/sync engine and a real
status-0 → remount → flush flow), the `gamedays` + `scorecard_v2` Django suites,
the Playwright gameday → result flow, and the CI checks in the table above.

Manual, on a local `runserver` with headless Chromium (not a physical phone):

- server stopped after a game started: touchdown + penalty recorded locally,
  badge `Offline · N`, log and score updated optimistically;
- reload with the server down: the service-worker app shell boots, the game and
  its log come back from IndexedDB;
- undo of an unsynced penalty: row disappears, nothing sent;
- server restarted: the queue drains in tap order, badge returns to `Synchron`,
  the log matches the server;
- finalise refused while the queue is non-empty; logout warns before dropping
  queued writes.

Still to do on real hardware before wide rollout: flight-mode drift (radio off
for minutes, then drain), a second physical device hitting the lock, and a full
gameday in the rain. Treat the above as the baseline, not as field proof.

