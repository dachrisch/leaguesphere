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
- Follow-up backlog (every idea from the 2026-10-27 review, with status):
  [Scorecard feature plan](../../planning/current/2026-10-27-scorecard-feature-plan.md)
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
   passcheck state. A segmented **Meine | Alle** control switches the scope
   (count on the shown one); an official with no assignment is moved to
   **Alle** automatically with the reason, instead of an empty list. With two
   or more open games an **Als Nächstes** card leads: the running game, else
   the earliest open one, with both teams on their own lines and one action. Team logos from the public team directory accompany the
   names here, in the score header and in the preparation team card; the
   directory
   is cached in IndexedDB and the logo files are cached by the service worker
   (bounded, `/media/teammanager/logos/` only), so a device keeps them offline
   after one load, and a team without one (or a file that cannot be loaded)
   keeps the initials disc.
3. **Spiel vorbereiten** — a team card (both crests, the team descriptions,
   kick-off and field), then two numbered sections. **1. Offizielle**: crew and
   licences as card rows (initials, role, person, a licence dot chip and a
   chevron that opens the picker), the league's required positions first and a
   `n/m besetzt` counter. An empty optional position is a compact dashed
   **<Position> hinzufügen** row ("Optional · ohne Pflicht zur Besetzung");
   once somebody is assigned it becomes a normal row. **2. Spielkonfiguration**:
   one card with **Münzwurf gewonnen von**, **Erster Ballbesitz** and
   **Spielrichtung**; the first two are full-width two-option switches, the
   direction is drawn on a field between the **West** and **Ost** end zones.
   A crew with every required slot staffed, every licence valid and nothing to
   clean up folds into one **Crew vollständig** row (**ändern** opens it); any
   problem keeps the rows open. The start confirmation leads with **Bitte
   beachten** (missing passcheck, invalid licences) before restating the
   setup. A readiness banner
   above the start action is the single source of truth: green **Bereit zum
   Starten**, amber **Angaben fehlen** with exactly the missing facts, and
   **Start nur online** / **Nur lesen** when the disabled start bar has that
   reason instead. The
   crew slots are *the league's*: which positions exist, how they are labelled
   and which of them count towards the completeness chip is configured per
   league (`officials.CrewPosition`, edited in the Django admin). Configured
   rows are overrides **on top of** the built-in five (Scorecard Judge
   optional, Referee / Down Judge / Field Judge / Side Judge required):
   relabelling one slot keeps the others, a new position is added after them,
   and a league without rows gets the defaults — the officials step is never
   empty. Hiding a default position is not part of this layer (it belongs to
   the crew template / count work); it would need another column. A crew slot
   is filled by searching the whole officials directory; the row marks a guest
   as **Freitext** (a person who is not in it — first and last name required,
   offered only while nobody matches). A stored position the league does not
   configure stays visible read-only and is written back unchanged: the API
   upserts by the exact `GameOfficial.position` string, never by the label. An
   invalid licence shows an inline hint and needs a second tap; it never blocks
   the start. Toss, first possession and direction have no default, and the
   first tap on **Spiel starten** only opens a confirmation that restates
   teams, kick-off and field, the crew with the league's labels, toss,
   possession, direction, licences and passcheck, refuses an empty `required`
   slot, a free-text name without both names and an unchosen
   toss/possession/direction with a named reason, and says that starting writes
   the setup while no clock runs in the app.
4. **Feld · Runde** (the tracking screen) — score board, a two-way
   **Ballbesitz** switch under it, the log in the middle and the actions at the
   bottom (thumb zone, tinted in the colour of the side with the ball).
   **1st Down** and **Turnover** save on the tap; a toast under the log offers
   **Rückgängig** and, for a first down, **Nr. ergänzen** (the jersey sheet
   then writes the numbered row and undoes the one-tap row). Interception,
   Spielzeit, Auszeit, penalty, safety and overtime keep their sheets.
   Touchdown with the roster's jerseys (a tile grid up to 24 players, a
   two-digit keypad above that with the roster name as confirmation; numeric
   field when there is no roster; this game's scorers as chips). The touchdown
   is saved alone; the extra point is asked **after the try** in place of the
   touchdown button (+1 / +2 / nicht verwandelt, nothing pre-selected),
   credited to the scoring team with the scorer's jersey, and **Spiel
   beenden** waits while it is open. First down, turnover, interception, penalty with search, safety,
   overtime, Spielzeit, Auszeit, half-time, and **Rückgängig** per entry. The
   screen keeps the display on while the game is open (Wake Lock, where the
   browser offers it) and confirms each saved entry with a short vibration.
5. **Spielende** — captains from the roster (suggestions only, free text),
   optional note, then **Ergebnis abschicken**.
6. **Ergebnis gesendet** — final and half-time score from the server payload.

Every screen has one steel app bar and nothing else as chrome: back, the title
with its context line (on tracking: gameday and league), the sync chip and the
account menu (avatar: identity, **Auto**/**Hell**/**Dunkel**, **Abmelden**, and
the LeagueSphere version with Impressum and Datenschutz). There is no screen
footer, so the content area runs to the bottom edge.

On the tracking screen one **strip under the bar** carries the transmission
state, and nothing else repeats it: **Nur lesen – das Spiel läuft auf einem
anderen Gerät** (with **Erneut prüfen**), **Schreiben gesperrt – bitte neu
anmelden**, **Offline · n Einträge noch nicht übertragen**, **Spielstand
vorläufig · …** while sending, and **✓ Alles gesendet** for a moment after the
queue drained. The bar's chip is the coloured dot alone there. A log row that
is still queued on the device carries a **wartet** tag.

What the backend had to grow (all additive):

- `GET /api/game/<id>/roster` — jersey + surname per side, `[]` for a bracket
  placeholder;
- `GET /api/officials/search/list` — progressive, database-wide person search
  for the crew picker (one name part is enough, a `team` param only ranks that
  team first, "nobody" is an empty list);
- `passcheck` on the games-to-whistle payload;
- `league_display` on the gameday list;
- `GameLogSubmission` and `GameSetup.device_id` (migrations `0046`, `0047`);
- `GET /api/officials/crew-positions/game/<id>` — the league's crew slots in
  display order (`position`, `label`, `order`, `required`). The screen only
  knows the game id, so game → gameday → league is resolved server-side; an
  unconfigured league answers the defaults in the same shape. Preloaded into
  IndexedDB like the setup payload. Table: `officials.CrewPosition`
  (migration `officials/0016`).

## Offline contract

Offline is part of the feature, not a follow-up. The app shell is precached;
captured plays live in an IndexedDB outbox and are drained FIFO.

**The app writes events, nothing else.** Every in-game write — a play, a change
of possession, the half-time marker, an undo — is an event appended to
`POST /api/game/<id>/events`, so all of them queue and replay the same way.
`PUT /api/game/<id>/possession` and `PUT /api/game/<id>/halftime` are no longer
called by v2, and an undo is a `correction` event even for a penalty. The only
non-event write left is the legacy `DELETE` for a row that **no event wrote** —
a game the old app recorded before the event store existed.

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
6. **An undo is a correction event.** The client names the target row's event
   `seq` (`payload.undo_of`), which `GET /api/gamelog/<id>` publishes per row —
   one extra, additive field on the log. A scoring play's correction removes the
   whole submission group, so a touchdown and its conversion go together; a
   penalty's removes exactly its own row, although every penalty shares
   `sequence 0`. Only a row no event wrote (`seq: null`, the old app's rows)
   still needs the pre-event `DELETE` by `team_log_id`.
7. **No API response is cached by the worker.** `/api/**` is per user; the
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
scripts/seed_stage_scorecard_demo.sh
# or, without the wrapper:
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

Automated: 857 vitest cases (incl. the outbox/sync engine and a real
status-0 → remount → flush flow), the `gamedays` + `officials` +
`scorecard_v2` Django suites, the Playwright gameday → result flow, and the CI
checks in the table above.

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

