# Scorecard v2

> **REQUIRED SUB-SKILL:** Use `executing-plans` (or `subagent-driven-development`) to implement this plan task by task.

**Goal:** Build Scorecard v2 as a complete, offline-capable field app served from `/scorecard/v2/` — gameday selection, preparation, live tracking, offline capture and the finalised result — while the existing scorecard keeps running untouched at `/scorecard/`.

**Architecture:** A new Django app `scorecard_v2` serves one login-gated page with a Vite/React/TypeScript SPA. It writes the same `TeamLog`, `GameSetup` and `GameOfficial` rows the old app writes, using the existing endpoints plus two additive backend changes: idempotent log submissions (`GameLogSubmission`) and a per-game device lock (`GameSetup.device_id`). A service worker plus an IndexedDB outbox make capture work without a network.

**Tech Stack:** Django 6 + DRF, Vite + React 19 + TypeScript, `idb`, `vite-plugin-pwa` (or hand-rolled SW), vitest + @testing-library + `fake-indexeddb`, Django session auth + CSRF.

---

## Readiness check (verified against `origin/master` 17c063f7, 2026-10-26)

Every row was checked in the repo before execution. The right column is where
the correction already lives in the tasks below.

| Assumption | What is actually true | Fixed in |
|---|---|---|
| A new Django app needs only `INSTALLED_APPS` | `pyproject.toml` lists packages **explicitly** (`scorecard*`, `gamedays*`, …). Without `"scorecard_v2*"` the production image cannot import the app | Task 1 |
| The bundle can be committed | Every `static/**/js/*.js` is gitignored and built in Docker. v2 needs the same ignore rule and a Docker build stage | Tasks 2, 17, 22 |
| The page template has a CSRF `<meta>` tag | It does not. The old app uses a knox token from `localStorage`; v2 uses the `csrftoken` cookie seeded by `ensure_csrf_cookie` | Tasks 1, 3 |
| Latest migration is 0045 | Correct — `gamedays/migrations/0045_team_updated_at.py` is the head, so the new one is `0046` | Task 16 (unchanged) |
| The roster is a simple query | `Gameresult.team` is **nullable** for bracket placeholders; a naive `.get().team` raises 500 on exactly the games the designer creates | Task 6 |
| A service worker may cache `/api/**` | Those responses are per-user. Caching them leaks a previous user's log on a shared device; preload into IndexedDB instead | Tasks 17, 20 |
| The device lock protects the game | It only guards `PUT /setup`. The log `POST` needs the same check or a second device can still write | Task 16 |
| `id_home`/`id_away` are team ids | They are **`Gameresult` PKs** (pandas merge keeps `id_y`), so `id_home in verified` is false for every game. Resolve them through `Gameresult` first | Task 6 |
| v2 Python tests belong in `python-core` | The existing scorecard backend tests run in the `python-live` shard (`scorecard/tests.py` + liveticker); v2 belongs there | Task 22 |
| The bundle is built somewhere | `container/nginx.Dockerfile` builds each app in its own node stage and `container/start_dev_server.sh` lists every app for dev builds | Task 22 |
| Captains can be proposed from the roster | `Playerlist` has no captain flag and `GameSetup.homeCaptain/awayCaptain` are free-text. Propose **surnames**, never invent a captain relation | Task 15 |
| An expired licence should block the start | The current app only displays licence state and never blocks. Blocking could strand a gameday; v2 warns and needs an explicit "Trotzdem starten" | Task 7 |
| A penalty's "gegen wen" is free choice | `GET /api/config/scorecard/penalties` already carries `isPenaltyAgainstOpponent`, and the old app derives the team from it. The picker must default from that flag, not contradict it | Task 12 |

Two product decisions were resolved on 2026-10-26 (see Tasks 7 and 22):
licence problems warn instead of blocking the start, and v2 gets a new
`spieltag-v2` help topic while `ergebnisse-erfassen` stays untouched.

### Execution notes (2026-10-26)

Baseline recorded before Task 2, with the commands that actually run here:

| Check | Result |
|---|---|
| `pytest scorecard/tests.py gamedays/tests/api scorecard_v2` (see below) | **123 passed, 1 xfailed** |
| `npm --prefix scorecard run test:run` | **27 files / 111 passed, 1 skipped** |
| `npm --prefix scorecard run eslint` | **0 errors** |

Local environment (this container, not CI): the worktree `.venv` is unusable —
`uv sync --extra test` fails on musl (`playwright==1.62.0` has no musllinux
wheel) — and there is no MySQL on `127.0.0.1:3306`. Run the backend tests with
the repo's shared interpreter and the SQLite settings:

```bash
DJANGO_SETTINGS_MODULE=league_manager.settings.test_sqlite PYTHONPATH="$PWD" \
  /root/dev/dachrisch/leaguesphere/.venv/bin/python -m pytest \
  scorecard/tests.py gamedays/tests/api scorecard_v2 -q -p no:cacheprovider
```

CI still uses `uv run pytest` against its MySQL service; that path is unchanged.

Four integration requirements that are easy to miss:

| Requirement | What it needs |
|---|---|
| A new `package.json` is not bumped by release-please | Add `scorecard_v2/package.json` to `release-please-config.json` `extra-files` **and** `scripts/check_version_sequence.py` `VERSION_FILES` |
| A new CI parameter is not enough | Add `run-scorecard-v2` to the `\.circleci/.*` "validate everything" block as well as `config.yml` parameters |
| The help topic needs more than a registry entry | A screenshot under `league_manager/static/help/img/`, referenced from the topic Markdown, plus a line in `league_manager/templates/llms-full.txt` (the skill's `templates/llms-full.txt`); `test_help.py` checks the images, `test_ai_readiness.py` the llms list |
| The demo/release version bump stages files explicitly | `.github/workflows/deploy.yaml` and `release-please-finalize.yaml` both rewrite every SPA `package.json` **and** `git add` it; an app missing from either list silently stays on the old version |

---

## Routing decision

| URL | Serves | Status |
|---|---|---|
| `/scorecard/` | existing scorecard | **unchanged** |
| `/scorecard/v2/` | this app | new |

The old app is not linked from v2, not imported, not modified. Rollback is a bookmark. Retirement of the old app is explicitly **not** part of this plan.

`league_manager/urls.py`, before the existing scorecard include:

```python
path("scorecard/v2/", include("scorecard_v2.urls")),
path("scorecard/", include("scorecard.urls")),
```

The service worker lives at `/scorecard/v2/sw.js` so its scope is exactly `/scorecard/v2/` and it can never intercept the old app.

## Parity contract

The new app must run a whole gameday alone — that is what makes it a candidate, not a demo.

| # | Capability | Must |
|---|---|---|
| 1 | Pick gameday | list today's gamedays, tap one |
| 2 | Pick game | time, field, teams, status, passcheck |
| 3 | Officials | crew + licence state, edit if needed |
| 4 | Preparation | toss, possession, direction, **Spiel starten** |
| 5 | Load game | gamelog rendered as a live log |
| 6 | Touchdown + PAT | jersey from roster, PAT 1/2/0 |
| 7 | Series | First Down, Turnover, Interception |
| 8 | Penalty | 50 items, search, against/for, optional jersey |
| 9 | More events | Safety, Overtime, Timeout, Spielzeit |
| 10 | Half-time | writes half-time, switches half |
| 11 | Possession | visible ball, one tap to switch |
| 12 | Undo | one tap, server `isDeleted` |
| 13 | Finalise | captains from roster + note |
| 14 | Result | confirmation with final and half-time score |

## Reference: the clickable mock

**https://app.docstash.ai/kn9cdg** — DocStash, private to the workspace. Stashed and current.

It is the interaction reference for this plan, not the implementation. It runs a full flow on mock data: gameday list → game list → preparation (officials with licence state, coin toss, first possession, direction, passcheck) → tracking (touchdown and PAT from the roster, penalty, series, safety, timeout, undo) → game end with captain confirmation.

Mapping from mock to tasks:

| Mock screen | Plan task |
|---|---|
| „Meine Spieltage" | Task 4, 5 |
| Game list with status and passcheck | Task 5, 6 |
| „Vorbereitung" (officials, licences, toss, possession, direction) | Task 7, 8 |
| Tracking shell, score header, log | Task 9 |
| Touchdown sheet with jersey grid | Task 10 |
| Series, safety, overtime, time | Task 11, 13 |
| Penalty sheet with search | Task 12 |
| „Rückgängig" on the last entry | Task 14 |
| „Spielende" with captains | Task 15 |
| Sync badge and offline toggle | Task 20 (visual), 16–19 (behaviour) |

What the mock deliberately does **not** model, and must not be copied:

- No persistence, no service worker, no outbox — its offline toggle only changes a badge.
- No idempotency and no device lock; it assumes one device and never retries.
- Finalise is not guarded by a pending queue.
- Everything is in-memory: a reload loses the game.

Those four are exactly Tasks 16–20. Treat the mock as the brochure, the tasks as the contract.

## Offline contract

Offline is part of v2, not a follow-up. What that means precisely:

| Works offline | Needs network |
|---|---|
| Open the app shell (after first load) | Finalising the result |
| Record any in-game event (touchdown, penalty, series, safety, OT, time, timeout) | Starting a *different* game |
| Undo an entry that has not synced yet | Loading a game never loaded on this device |
| Switch possession, record half-time | Editing officials |
| See the score and log built from local entries | |

Rules that make it safe:

1. **Writes are idempotent.** Every queued submission carries a `client_id`; the server applies it at most once.
2. **One device per game.** The first device to start the game owns the session. A second device is read-only and says why. Staff can release the lock.
3. **One queue per game, FIFO.** The outbox flushes in order and stops on the first network error, so the log order is the order the official tapped.
4. **Finalise is blocked while the queue is non-empty.** No result may leave the device with events still pending.
5. **The score is never computed client-side.** Local entries are optimistic display only; every sync replaces the log with the server payload.

## The API contract

| Action | Call | Payload |
|---|---|---|
| Load log | `GET /api/gamelog/<gameId>` | — |
| Record event | `POST /api/gamelog/<gameId>` | `{team, gameId, half, client_id, event:[{name, player?, input?}]}` |
| Delete entry | `DELETE /api/gamelog/<gameId>` | `{sequence}` |
| Possession | `PUT /api/game/<gameId>/possession` | `{team: "<team name>"}` |
| Half-time | `PUT /api/game/<gameId>/halftime` | `{}` |
| Finalise | `PUT /api/game/<gameId>/finalize` | `{homeCaptain, awayCaptain, note}` |
| Setup | `GET/PUT /api/game/<gameId>/setup` | `{ctResult, direction, fhPossession, device_id}` |
| Officials | `GET/PUT /api/game/<gameId>/officials` | `[{position, name, official}]` |
| Gamedays | `GET /api/gameday/list` | today only |
| Games | `GET /api/gameday/<id>/officials/<team>` | `team=*` for all |
| Roster | `GET /api/game/<gameId>/roster` | new: `[{side, jersey, name}]`; `[]` for a bracket placeholder |
| Penalties | `GET /api/config/scorecard/penalties` | 50 items with `isPenaltyAgainstOpponent` |

Two rules apply to every write:

- **`client_id`.** `POST /api/gamelog/<gameId>` and every queued write carry a
  UUID. The server dedupes the log write (Task 16) and answers a repeat with
  the current log, which the client treats as success.
- **`device_id`.** It travels in the setup payload and as an
  `X-Scorecard-Device` header on log writes, so the lock in Task 16 is not
  client-side only.

Event names are a wire format shared with ticker, statistics and match report. Do not invent new ones:

| UI | `event[].name` |
|---|---|
| Touchdown + 1 / + 2 / none | `Touchdown` + `1-Extra-Punkt` / `2-Extra-Punkte` / `Touchdown` only |
| First Down | `First Down` |
| Turnover / Interception | `Turnover` / `Interception` (server sets `cop`) |
| Penalty | `Strafe` + `input` = penalty name |
| Safety 1 / 2 | `Safety (+1)` / `Safety (+2)` (against the opponent) |
| Spielzeit | `Spielzeit` + `input` = `mm:ss` |
| Timeout | `Auszeit` + `input` = `m:ss` |
| Overtime | `Overtime` |

---

## Task 0: Workspace and baseline

**Files:** the plan itself (`docs/topics/planning/current/2026-10-26-scorecard-v2.md`), `docs/topics/planning/README.md`.

**Step 1: Branch from master, not from a feature branch**

```bash
git fetch origin
git worktree add /root/dev/dachrisch/leaguesphere-scorecard-v2 -b feat/scorecard-v2 origin/master
cd /root/dev/dachrisch/leaguesphere-scorecard-v2
```

(If the OpenCode worktree already exists, `git checkout -b feat/scorecard-v2 origin/master` in it.)

**Step 2: Commit this plan before writing code**

```bash
cp <wherever this file was written>/2026-10-26-scorecard-v2.md docs/topics/planning/current/
git add docs/topics/planning/current/2026-10-26-scorecard-v2.md docs/topics/planning/README.md
git commit -m "docs(scorecard-v2): add the implementation plan"
```

Add the plan to `docs/topics/planning/README.md` under *Active Plans* in the same commit.

**Step 3: Record the baseline**

```bash
uv run pytest scorecard/tests.py gamedays/tests/api -q
npm --prefix scorecard/ run eslint
npm --prefix scorecard/ run test:run
```

Expected: green. Anything red is pre-existing; write the failing test names into the task commit so the final verification is not blamed for them. Do **not** start Task 1 on a red baseline without recording it.

**Step 4:** commit nothing else; the baseline is a checkpoint, not a change.

---

## Task 1: Backend app, route and shell

**Files**

- Create: `scorecard_v2/__init__.py`, `apps.py`, `views.py`, `urls.py`
- Create: `scorecard_v2/templates/scorecard_v2/index.html`
- Create: `scorecard_v2/tests/__init__.py`, `tests/test_views.py`
- Modify: `league_manager/settings/base.py`, `league_manager/urls.py`, `pyproject.toml`

**Step 1: Failing test**

```python
# scorecard_v2/tests/test_views.py
from django.contrib.auth.models import User
from django.urls import reverse
from django_webtest import WebTest


class TestScorecardV2View(WebTest):
    def test_anonymous_visitor_is_redirected_to_login(self):
        response = self.app.get(reverse("scorecard-v2-home"), status=302)
        assert "/login/" in response.location

    def test_logged_in_user_sees_the_app_shell(self):
        user = User.objects.create_user("official", password="x")
        response = self.app.get(reverse("scorecard-v2-home"), user=user)
        assert 'id="scorecard-v2-app"' in response.text
        assert "/static/scorecard_v2/js/scorecard_v2.js" in response.text
        # Session auth + CSRF: the cookie, not a <meta> tag, carries the token.
        assert "csrftoken" in response.cookies

    def test_old_scorecard_route_is_untouched(self):
        assert reverse("scorecard-home") == "/scorecard/"
```

**Step 2:** `pytest scorecard_v2/tests/test_views.py -v` → `NoReverseMatch`.

**Step 3: Implement**

```python
# scorecard_v2/views.py
from django.contrib.auth.mixins import LoginRequiredMixin
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.generic import TemplateView


@method_decorator(ensure_csrf_cookie, name="dispatch")
class ScorecardV2View(LoginRequiredMixin, TemplateView):
    template_name = "scorecard_v2/index.html"
    login_url = "login"
```

```python
# scorecard_v2/urls.py
from django.urls import path

from scorecard_v2.views import ScorecardV2View

urlpatterns = [path("", ScorecardV2View.as_view(), name="scorecard-v2-home")]
```

Template mirrors `scorecard/templates/scorecard/index.html` **minus Bootstrap**:
`id="scorecard-v2-app"`, the manifest link, the bundle script, and no CSRF
meta tag (the cookie set by `ensure_csrf_cookie` is the token source).

Three registrations are easy to forget and each one breaks production, not the
test run:

1. `"scorecard_v2"` in `INSTALLED_APPS` (`league_manager/settings/base.py`).
2. `"scorecard_v2*"` in `pyproject.toml` → `[tool.setuptools.packages.find] include`.
3. The two URL lines, `scorecard/v2/` **before** `scorecard/`.

**Step 4:** tests pass. **Step 5:** commit `feat(scorecard-v2): add app shell at /scorecard/v2/`.

---

## Task 2: Vite + TypeScript build

**Files:** `scorecard_v2/package.json`, `package-lock.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.mjs`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`, `.gitignore`

Same shape as the old scorecard build, because Django loads a classic script:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: { port: 3004, proxy: { "/api": "http://localhost:8000" } },
  build: {
    outDir: "static/scorecard_v2/js",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/main.tsx",
      output: {
        format: "iife",
        entryFileNames: "scorecard_v2.js",
        assetFileNames: "scorecard_v2-[name][extname]",
      },
    },
  },
});
```

TDD: smoke test renders "Meine Spieltage"; `npm run build` produces `static/scorecard_v2/js/scorecard_v2.js`; `npm run typecheck` (`tsc -b --noEmit`) exits 0.

**Do not commit the bundle.** The repo builds every SPA bundle in Docker and
ignores it (`.gitignore:151-152`). Add the same two lines for v2:

```text
scorecard_v2/static/scorecard_v2/js/*.js
scorecard_v2/static/scorecard_v2/js/*.css
```

Scripts mirror the old app plus a type gate: `start`, `build`, `watch`,
`test`, `test:run`, `eslint`, `eslint:junit`, `typecheck`. Dependencies:
React 19, `idb`; dev: `typescript`, `@types/react`, `@types/react-dom`,
`@vitejs/plugin-react`, `vite`, `vitest`, `@vitest/coverage-v8`, `jsdom`,
`@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`, `fake-indexeddb`, `eslint`,
`typescript-eslint`, `eslint-plugin-react-hooks`.

Commit `package-lock.json` (CI runs `npm ci`). Register the new version file in
`release-please-config.json` (`extra-files`) and
`scripts/check_version_sequence.py` (`VERSION_FILES`) — both enumerate every SPA
`package.json`, and a missing entry means release-please silently stops bumping
v2. Use the current root version as the initial value.

Commit `feat(scorecard-v2): add the TypeScript build`.

---

## Task 3: API client

**Files:** `src/api/client.ts`, `src/api/client.test.ts`

`apiGet/apiPost/apiPut/apiDelete` over `fetch` with `credentials: "same-origin"` and `X-CSRFToken` read from the `csrftoken` **cookie** (there is no meta tag; `ensure_csrf_cookie` guarantees the cookie exists). Non-2xx throws `ApiError(status, body, detail)`.

Tests: JSON parsing, error status carries the server `detail`, CSRF header on unsafe methods, DELETE sends a JSON body (`{sequence}`), and `X-Scorecard-Device` is attached once a game is open.

Commit `feat(scorecard-v2): add api client`.

---

## Task 4: Types and gameday screen

**Files:** `src/api/types.ts`, `src/screens/GamedayList.tsx`, `src/components/AppHeader.tsx`, `src/components/Screen.tsx`, `src/styles/tokens.css`, `src/styles/app.css`, `gamedays/api/serializers.py`, tests

Types for `Gameday`, `Game`, `Official`, `GameSetup`, `LogEntry`, `GameLog`, `RosterPlayer`, `Penalty`. `PendingOp` belongs to the outbox (Task 18) and is deliberately not declared here.

The design foundation lands with this screen: self-hosted Barlow Condensed/Inter, dark tokens, shared header/screen chrome, list primitives. Backend addition: `league_display` on `GamedaySerializer`, because `/api/gameday/list` otherwise returns only the league pk and the card's subtitle cannot name the league.

Tests: renders name, league and date, calls `onSelect`, empty state "Keine Spieltage für heute", missing address hides the meta row, impossible dates fall back to the raw string.

Commit.

---

## Task 5: Game list

**Files:** `src/screens/GameList.tsx`, tests

Tests: score `7:21` / `–`, status tags, "kein Passcheck", planned → `onSelect`, running → `onResume`, finished inert.

Commit.

---

## Task 6: Backend — passcheck flag and roster endpoint

**Files**

- Modify: `gamedays/api/game_views.py`, `gamedays/api/urls.py`
- Test: `gamedays/tests/api/test_game_views.py`

**Failing tests**

```python
def test_games_to_whistle_reports_passcheck_state(self): ...
def test_games_to_whistle_passcheck_is_true_for_two_verified_teams(self): ...
def test_game_roster_lists_both_teams_without_pass_numbers(self): ...
def test_game_roster_is_empty_for_a_bracket_placeholder(self): ...
def test_game_roster_requires_authentication(self): ...
```

**Implementation**

```python
# GamesToWhistleAPIView.get — annotate, don't touch the pandas wrapper.
# id_home/id_away are Gameresult pks (the merge keeps `id_y`), not team pks.
game_ids = [game["id"] for game in games_to_whistle]
team_by_result = {
    str(result_id): team_id
    for result_id, team_id in Gameresult.objects.filter(
        gameinfo_id__in=game_ids
    ).values_list("id", "team_id")
}
verified = set(
    PasscheckVerification.objects.filter(gameday_id=kwargs["pk"]).values_list("team_id", flat=True)
)
for game in games_to_whistle:
    home = team_by_result.get(str(game.get("id_home", "")))
    away = team_by_result.get(str(game.get("id_away", "")))
    game["passcheck"] = home in verified and away in verified
```

`id_home`/`id_away` arrive as strings (pandas `astype("string")`, `""` for a
placeholder), so stringify the `Gameresult` keys before lookup. A test must
prove the flag is true for a fully verified game — the naive team-id comparison
would make it false everywhere.

```python
# GameRosterAPIView.get — jersey + surname only, never pass numbers
class GameRosterAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            game = Gameinfo.objects.get(pk=pk)
        except Gameinfo.DoesNotExist:
            raise NotFound(detail=f"No game found for gameId {pk}")

        sides = {
            row["team_id"]: "home" if row["isHome"] else "away"
            for row in Gameresult.objects.filter(
                gameinfo=game, team__isnull=False
            ).values("team_id", "isHome")
        }
        if not sides:  # bracket placeholder: both teams are still unknown
            return Response([])

        rows = (
            PlayerlistGameday.objects.filter(
                gameday_id=game.gameday_id,
                playerlist__team_id__in=sides,
                playerlist__left_on__isnull=True,
            )
            .select_related("playerlist__player__person")
            .order_by("playerlist__team_id", "gameday_jersey")
        )
        return Response(
            [
                {
                    "side": sides[row.playerlist.team_id],
                    "jersey": row.gameday_jersey,
                    "name": row.playerlist.player.person.last_name,
                }
                for row in rows
            ]
        )
```

Route: `path("game/<int:pk>/roster", GameRosterAPIView.as_view(), name="api-game-roster")`.
Register it in `gamedays/api/urls.py` next to the other `game/<int:pk>/…`
paths. `IsAuthenticated` matters: the DRF default is
`IsAuthenticatedOrReadOnly`, which would expose the roster to anonymous
visitors.

Commit `feat(gamedays): add passcheck state and game roster`.

---

## Task 7: Preparation — officials and licences

**Files:** `src/screens/GameSetup.tsx`, tests

Tests: crew names/roles, "Lizenz gültig" / "abgelaufen seit …" / "keine
Lizenz"; an invalid licence shows a warning and a second tap ("Trotzdem
starten") is required. **It does not hard-block the start** — the current app
never blocks, and refusing to start a game because a licence lapsed would
strand a gameday. Record the warning in the UI copy, not in the database.

> **Decision (2026-10-26): warn, do not block.** The start stays available
> behind an explicit second tap. Every other task assumes warn-and-confirm.

Commit.

---

## Task 8: Preparation — toss, possession, direction, start

**Files:** `src/screens/GameSetup.tsx`, tests

Tests: summary line updates; a fresh game sends the defaults `home/home/Ost`; an
existing `GameSetup` renders as "Fortsetzen" instead of "Spiel starten"; `409`
shows either "Dieser Spielstatus erlaubt keinen Spielstart." or "Dieses Spiel
läuft auf einem anderen Gerät." depending on `detail`; the device id is sent
once (Task 16 defines it).

Start sequence: `PUT /officials` (if edited) → `PUT /setup` → `GET /gamelog` → tracking.

Commit.

---

## Task 9: Tracking shell

**Files:** `src/screens/Tracking.tsx`, `src/components/ScoreHeader.tsx`, `src/components/EventLog.tsx`, tests

Tests: score from payload, possession marker, newest-first entries with
time/jersey/half, struck-through `isDeleted`, empty state, and **half is
derived from the server payload** (`gameHalftime` / status), never defaulted to
`1` on reload — the old app's silent default is how a second-half entry ends up
in the first half.

Commit.

---

## Task 10: Touchdown and PAT

**Files:** `src/components/sheets/TouchdownSheet.tsx`, `src/components/JerseyPicker.tsx`, tests

Tests: roster of the possession team, save disabled until jersey, `+1` posts the two-event payload, `+2`, none, numeric fallback when the roster is empty.

Heading: use "Bestätigter Kader" only when `game.passcheck === true`,
otherwise "Kader". The roster endpoint is deliberately unfiltered — a game
whose passcheck never ran still needs the numeric fallback.

Commit.

---

## Task 11: Series and time

**Files:** `src/components/sheets/SeriesSheet.tsx`, tests

Tests: First Down (optional jersey), Turnover, Interception **against the opponent**, Spielzeit `mm:ss`, Auszeit `m:ss`.

Commit.

---

## Task 12: Penalties

**Files:** `src/components/sheets/PenaltySheet.tsx`, tests

Tests: 50 items from the config endpoint, search filters, first five visible,
the "gegen wen" default comes from `isPenaltyAgainstOpponent` (the possessing
team's opponent when the flag is true), the official can override it, "ganzes
Team" is the default player, payload `{name:"Strafe", player, input}`.

The config flag and the team picker must not disagree: the picker's initial
value is the flag, and the flag only decides the *default*, not a permanent
mapping. The old app derives the team from the flag alone — worth a test so a
penalty logged "gegen Ravens" is never written for Wolves.

Commit.

---

## Task 13: Safety, overtime, half-time, possession

**Files:** `src/components/sheets/MoreSheet.tsx`, `src/screens/Tracking.tsx`, tests

Tests: safety for the opponent + possession flip; overtime; half-time PUT + half switch; possession PUT uses the team **name**.

**Possession flip rule (inherited from v1, with one correction):** after a successful
`POST /api/gamelog` the client flips possession for `Touchdown`, `Turnover`,
`Interception`, `Safety`, `Overtime`, and keeps it for `Strafe`, `Spielzeit`,
`Auszeit`, `First Down`. v1 also flipped on `Auszeit` (its exclusion list has only
three entries) — that is a bug, not parity. The flip goes through
`PUT /api/game/<id>/possession`, must respect an in-flight possession change, and
must only adopt the server's `inPossession` on failure.

Commit.

---

## Task 14: Undo

**Files:** `src/screens/Tracking.tsx`, `src/components/EventLog.tsx`, tests

Tests: every row has "Rückgängig"; calls `DELETE` with `{sequence}`; list re-renders from the response; deleted rows stay visible.

Commit.

---

## Task 15: Finalise and result

**Files:** `src/screens/Finalize.tsx`, `src/screens/Result.tsx`, tests

Tests: both captain fields are text inputs with **surname suggestions** from
the loaded roster (there is no captain flag on `Playerlist`, and
`GameSetup.homeCaptain/awayCaptain` are free text), note optional, button
disabled until both are confirmed, `PUT /finalize` payload
`{homeCaptain, awayCaptain, note}`, result shows final and half-time score.

The finalise button is also disabled while the outbox has pending **or failed**
ops, with the reason ("3 Einträge warten auf Übertragung"). Task 20 wires the
count; this task owns the guard.

Commit.

---

## Task 16: Backend — idempotent submissions and the device lock

This is what makes offline safe. Both changes are additive and backwards compatible with the old app.

**Files**

- Create: `gamedays/migrations/0046_gamelogsubmission_device_lock.py`
- Modify: `gamedays/models.py`, `gamedays/api/serializers.py`, `gamedays/api/game_views.py`
- Test: `gamedays/tests/api/test_game_views.py`, `gamedays/tests/api/test_idempotency.py`

**Step 1: Failing tests**

```python
def test_same_client_id_is_applied_once(self):
    first = self.client.post(gamelog_url, {..., "client_id": str(uuid4())}, format="json")
    second = self.client.post(gamelog_url, {..., "client_id": same_id}, format="json")
    assert TeamLog.objects.filter(gameinfo=game).count() == rows_after_first
    assert first.json() == second.json()

def test_post_without_client_id_still_works(self):
    # old app path: no client_id, no submission row, normal insert

def test_duplicate_submission_does_not_duplicate_touchdown_and_pat(self):
    # one submission, two rows (Touchdown + 1-Extra-Punkt) → exactly two rows after two POSTs

def test_second_device_cannot_take_over_a_started_game(self):
    # PUT setup with device_id=A → 200; again with B → 409; with A → 200

def test_setup_without_device_id_is_still_accepted(self):
    # backwards compatible for the old app

def test_invalid_client_id_is_a_400(self):
    # "not-a-uuid" must not reach a UUIDField and 500

def test_failed_write_does_not_leave_a_submission_behind(self):
    # force the gamelog write to raise → no GameLogSubmission row, so a retry applies

def test_log_post_from_another_device_is_rejected(self):
    # setup locked to A; POST with X-Scorecard-Device: B → 409, no rows written

def test_staff_can_release_the_device_lock(self):
    # DELETE /api/game/<id>/device as staff → 204; as a normal user → 403
```

**Step 2:** run, expect failures.

**Step 3: Implement**

```python
# gamedays/models.py
class GameLogSubmission(models.Model):
    """One client submission; guarantees at-most-once log writes offline."""

    gameinfo = models.ForeignKey(Gameinfo, on_delete=models.CASCADE)
    client_id = models.UUIDField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["gameinfo", "client_id"], name="unique_submission_per_game"
            )
        ]
```

```python
class GameSetup(models.Model):
    ...
    device_id = models.CharField(max_length=64, blank=True, default="")
```

**POST `/api/gamelog/<id>`**

```python
client_id = request.data.get("client_id")
if client_id:
    try:
        client_id = uuid.UUID(str(client_id))
    except ValueError:
        raise ValidationError({"client_id": "must be a UUID"})
    _, created = GameLogSubmission.objects.get_or_create(
        gameinfo=game_service.gameinfo.gameinfo, client_id=client_id
    )
    if not created:
        # 200, not 201: nothing was created. The client accepts either.
        return Response(json.loads(game_service.get_gamelog().as_json()))
# ... existing write path unchanged
```

Wrap the `get_or_create` and the write in **one** `transaction.atomic()` so a
crash cannot leave a submission without rows; the loser of a race on the unique
constraint returns the current log.

**PUT `/api/game/<id>/setup`**

```python
incoming = request.data.get("device_id", "")
if incoming and game_setup.device_id and incoming != game_setup.device_id:
    return Response(
        {"detail": "Dieses Spiel läuft auf einem anderen Gerät.", "device_id": game_setup.device_id},
        status=HTTPStatus.CONFLICT,
    )
if incoming and not game_setup.device_id:
    game_setup.device_id = incoming
```

**Lock the write path, not just the setup**

`PUT /setup` is only the first write. A stale tab on a second device could
still `POST` log rows, so the same check belongs in `GameLogAPIView.post`:

```python
device = request.headers.get("X-Scorecard-Device", "")
setup = GameSetup.objects.filter(gameinfo_id=data.get("gameId")).first()
if setup and setup.device_id and device != setup.device_id:
    return Response(
        {"detail": "Dieses Spiel läuft auf einem anderen Gerät."},
        status=HTTPStatus.CONFLICT,
    )
```

A missing header is allowed, so the old app keeps working. **Staff release:**
`DELETE /api/game/<id>/device` (staff only) clears `device_id`; without it a
lost phone permanently locks the game.

**Retention:** `GameLogSubmission` grows forever. Add
`python manage.py purge_gamelog_submissions --days 7` as a management command
with a test; scheduling it is out of scope for this plan.

**Step 4:** `pytest gamedays/tests/api -v` → PASS.
**Step 5:** commit `feat(gamedays): make log writes idempotent and lock games to a device`.

---

## Task 17: PWA shell and service worker

**Files**

- Create: `scorecard_v2/static/scorecard_v2/sw.js` (a Django template: `sw.js` rendered with `{% now %}`/version), `scorecard_v2/static/scorecard_v2/offline.html`, `scorecard_v2/static/scorecard_v2/manifest.webmanifest`, `scorecard_v2/static/scorecard_v2/icons/*`, `scorecard_v2/views.py` (`ServiceWorkerView`, `ManifestView`)
- Modify: `scorecard_v2/urls.py`, `scorecard_v2/templates/scorecard_v2/index.html`, `src/main.tsx`

**Why a view:** the worker must be served from `/scorecard/v2/sw.js` so its scope is `/scorecard/v2/`. Served from `/static/...`, it could only control static assets.

```python
class ServiceWorkerView(View):
    def get(self, request):
        path = finders.find("scorecard_v2/sw.js")
        return FileResponse(open(path, "rb"), content_type="application/javascript")
```

Routes:

```python
path("sw.js", ServiceWorkerView.as_view(), name="scorecard-v2-sw"),
```

Worker responsibilities (keep it thin; all logic lives in `src/offline`):

- `install`: precache the **static** `offline.html`, the bundle, manifest and icons. Never precache the Django-rendered page — it carries a session-gated CSRF cookie and would be served to a logged-out user later.
- `fetch` for navigation: network-first; on failure serve `offline.html`. The SPA then boots from IndexedDB.
- `fetch` for static assets: network-first with a cached fallback. The bundle name is fixed (`scorecard_v2.js`), so cache-first would pin a stale build forever; cache-first is only acceptable once the name carries a content hash.
- **Do not cache `/api/**`.** Those responses are per-user; caching them leaks one official's log to the next user of the device. The IndexedDB preload (Task 20) is the only offline data store.
- No caching of non-GET, ever.
- A `CACHE_VERSION` (rendered into `sw.js`) plus `skipWaiting`/`clients.claim` on activate; delete old caches on activate.
- `message` from the page (`{type:"logout"}`) clears all caches and asks the app to wipe IndexedDB.

`ServiceWorkerView` must **not** require login (a 302 to `/login/` would break
every worker update) and must send `Cache-Control: no-cache`, so a deploy's
new worker is picked up. `FileResponse(..., headers={"Cache-Control": "no-cache"})`.

**Tests**

```python
def test_service_worker_is_served_from_the_app_scope(self):
    response = self.client.get("/scorecard/v2/sw.js")
    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/javascript")

def test_manifest_start_url_points_at_v2(self): ...
```

Manual checklist: DevTools → Application → Service Worker active, scope `/scorecard/v2/`; reload with "Offline" ticked still shows the shell.

Commit `feat(scorecard-v2): add installable shell and service worker`.

---

## Task 18: Offline store and outbox (pure modules)

**Files**

- Create: `src/offline/db.ts`, `src/offline/outbox.ts`, `src/offline/types.ts`, tests
- Add dev dependency: `idb`, `fake-indexeddb`

Keep all queue logic out of React, with injected storage, so it can be tested without a browser.

```ts
// src/offline/types.ts
export type OpKind = "event" | "delete" | "possession" | "halftime";

export interface PendingOp {
  id: string;            // uuid, also the client_id for events
  gameId: number;
  kind: OpKind;
  payload: unknown;
  createdAt: number;
  attempts: number;
}
```

```ts
// src/offline/outbox.ts
export interface Outbox {
  enqueue(op: PendingOp): Promise<void>;
  pending(gameId: number): Promise<PendingOp[]>;
  peek(gameId: number): Promise<PendingOp | undefined>;
  remove(id: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
  clear(gameId: number): Promise<void>;
}
```

**Tests** (`fake-indexeddb`): FIFO order per game; `enqueue` rejects duplicate
ids; `pending` is scoped to one game; removing a pending entry removes it from
the queue; two games do not interleave; a second tab sees the first tab's ops
(shared IDB, no in-memory cache).

Two tabs of the same game are the realistic failure mode (an official opening
the link twice). Use a `BroadcastChannel("scorecard-v2")` plus a
`navigator.locks.request("outbox-<gameId>")` around `flush`, so only one tab
drains the queue; the other observes and re-renders.

Commit `feat(scorecard-v2): add offline outbox`.

---

## Task 19: Sync engine

**Files:** `src/offline/sync.ts`, `src/offline/sync.test.ts`

```ts
export interface Transport {
  send(op: PendingOp): Promise<void>;
}

export function createSync(outbox: Outbox, transport: Transport, onChange: (s: SyncState) => void) {
  // flush(gameId): loop FIFO; remove on success; stop on network error;
  // 4xx → markFailed and continue; emit {pending, syncing, failed}
}
```

**Tests**

- Flushes in order and stops at the first **network/5xx** rejection (queue keeps the rest).
- `400`/`422` marks the op failed but does not block the following ops.
- `401`/`403` **pauses** the queue (session expired): nothing is marked failed, and a re-login resumes it — an expired session must not destroy a game's events.
- `409` with the device-lock detail pauses the queue and switches the app to read-only.
- A duplicate `client_id` answered with `200` counts as success and removes the op.
- Calling `flush` twice concurrently does not send twice (lock).
- Emits pending counts after each op.
- `online` event triggers a flush; going offline does not lose the queue; a `visibilitychange` to visible also retries.
- Retries use capped exponential backoff (1s → 30s) and never spin.

Commit `feat(scorecard-v2): add sync engine`.

---

## Task 20: Offline UI — status, preload, guards

**Files:** `src/components/SyncBadge.tsx`, `src/screens/Tracking.tsx`, `src/screens/GameSetup.tsx`, tests

- Header badge: `Synchron` / `N warten` / `Offline` with the queue count.
- Preload at game start into IndexedDB: game log, setup, roster, penalties — so a fresh tab offline still opens the running game.
- Finalise disabled while `pending > 0` **or** `failed > 0`, with the reason "3 Einträge warten auf Übertragung".
- Deleting an unsynced entry removes it from the outbox locally and does **not** call `DELETE`.
- Second device: `409` on setup shows "Dieses Spiel läuft auf einem anderen Gerät" and switches to read-only, including a disabled composer.
- Logout clears IndexedDB and the SW caches (`{type:"logout"}`); a shared device must not show the previous official's game.
- The displayed score is **last server payload + pending ops**, marked as provisional. The server payload always wins; nothing outside the outbox is ever recomputed.
- Failed ops are visible (a small "1 Eintrag abgelehnt" row) and can be retried or dropped, so a bad payload cannot silently vanish.

Tests cover each bullet with mocked transport.

Commit `feat(scorecard-v2): surface offline state and guards`.

---

## Task 21: App shell and flow wiring

**Files:** `src/App.tsx`, `src/main.tsx`, tests

State machine `gamedays | games | setup | tracking | finalize | result`, load-on-demand with error panels and retry, back navigation, `beforeunload` guard while a game is running, sync lifecycle started once at boot.

One integration test walks the full path with mocked API and asserts the request order and the final navigation.

Commit `feat(scorecard-v2): wire the full flow`.

---

## Task 22: Help, CI and verification

**Files**

- Create: `league_manager/help/content/spieltag-v2.de.md` + `registry.py` entry (per `.opencode/skills/add-help-topic/SKILL.md`)
- Create: `docs/topics/features/scorecard-v2/overview.md`, `scorecard_v2/tests/e2e/test_scorecard_v2_flow.py`
- Modify: `.circleci/config.yml`, `.circleci/continue.yml`, `.circleci/scope-mapping.txt`, `container/nginx.Dockerfile`, `container/start_dev_server.sh`, `docs/topics/features/README.md`

**Help topic**

> **Decision (2026-10-26): a new topic.** `spieltag-v2` is added to
> `registry.py`, titled "Scorecard v2" and marked beta in its summary; the
> existing `ergebnisse-erfassen` topic is left alone until the old app is
> retired (which this plan does not do).

The topic also needs its screenshot at
`league_manager/static/help/img/spieltag-v2.png` and a link line in
`league_manager/templates/llms-full.txt` (step 5 of the skill);
`test_help.py` checks that every image referenced from the content exists and
`test_ai_readiness.py` that the llms list links every topic. Capture the
screenshot from staging once `/scorecard/v2/` is deployed.

**CI**

```yaml
# config.yml and continue.yml parameters
run-scorecard-v2: { type: boolean, default: false }
```

`\.circleci/.*` in `scope-mapping.txt` is the "validate everything" block: add
`run-scorecard-v2 true` there too, otherwise a CI-config change never exercises
the new job.

Add a `scorecard_v2_js` job modelled on `scorecard_js` (`continue.yml:280`)
running `npm ci`, `npm run eslint`, `npm run typecheck`, `npm run test:run`,
`npm run build`; add the workflow entry next to `scorecard_js` (`continue.yml:1140`).
The `e2e` job (`continue.yml:435-475`) must also `npm ci && npm run build` for
`scorecard_v2` and run `scorecard_v2/tests/e2e/` beside the old flow.

```text
scorecard_v2/(src/.*|package\.json|package-lock\.json|vite\..*|vitest\..*|eslint\..*|tsconfig.*|index\.html|\.npmrc) run-scorecard-v2 true
scorecard_v2/(src/.*|package\.json|package-lock\.json|vite\..*|vitest\..*|eslint\..*|tsconfig.*|index\.html|\.npmrc) run-build-frontend true
scorecard_v2/static/.* run-build-frontend true
scorecard_v2/.*\.py run-python-live true
scorecard_v2/templates/.* run-python-live true
scorecard_v2/tests/e2e/.* run-python-live true
gamedays/api/.* run-python-live true
```

`run-python-live`, not `run-python-core`: the existing scorecard backend tests
(`scorecard/tests.py`) live in that shard, and v2 exercises the same
`gamedays` APIs.

**Container (otherwise the page 404s in production)**

`container/nginx.Dockerfile` builds every SPA in its own node stage. Add a
`scorecard-v2-app` stage (`COPY scorecard_v2`, `rm -rf static/scorecard_v2/js`,
`npm ci`, `npm run build`) and copy its `static` in the nginx stage next to the
others. `container/start_dev_server.sh` lists apps twice (`:93` and `:119`) —
add `scorecard_v2` to both, or `--hot scorecard_v2` silently builds nothing.

`python scripts/check_scope_coverage.py` must exit 0.

**Verification**

```bash
pytest scorecard_v2 gamedays -q
cd scorecard_v2 && npm run eslint && npm run typecheck && npm run test:run && npm run build
python scripts/check_scope_coverage.py
uv run pytest scorecard/tests/e2e/ scorecard_v2/tests/e2e/ -v
```

**Offline acceptance on a phone**

- [ ] Load `/scorecard/v2/`, start a game, then enable flight mode.
- [ ] Record touchdown, penalty, first down, safety; score and log update locally.
- [ ] Kill the app, reopen offline: the game and its log are still there.
- [ ] Undo an unsynced entry: it disappears from the log and never reaches the server.
- [ ] Re-enable network: queue drains in order, badge returns to `Synchron`, ticker matches.
- [ ] Finalise is blocked while the queue is non-empty.
- [ ] Second device shows the game read-only with the reason.

Commit `docs(scorecard-v2): add help topic, ci scope and feature overview`.

---

## Risks

| Risk | Handling |
|---|---|
| Duplicate writes after a flaky retry | `client_id` + `GameLogSubmission` unique constraint; tested twice |
| Two devices writing offline | Device lock at game start **and** on the log POST; second device read-only; staff can release |
| Out-of-order log after sync | Single FIFO queue per game + one device per game |
| Service worker caching a logged-out shell | Only `offline.html` is precached; the authenticated page and `/api/**` are never cached |
| Stale bundle after a deploy | Network-first for static + versioned caches + `no-cache` on `sw.js` |
| Session expires mid-queue | `401/403` pauses the queue, never marks ops failed; re-login resumes |
| Shared device shows the previous official's game | Logout clears IndexedDB and SW caches |
| Two tabs drain the same queue | BroadcastChannel + `navigator.locks` around `flush` |
| Placeholder game crashes the roster | `team__isnull=False` + `[]` fallback, with a test |
| Production image misses the new app | `pyproject.toml` include + `nginx.Dockerfile` node stage + `start_dev_server.sh` |
| Old app broken by backend changes | Both additions are optional fields; the old app sends neither, tested explicitly |

## Definition of done

- `/scorecard/v2/` runs gameday → result end to end, including offline capture.
- `/scorecard/` is untouched and still works.
- Both apps write the same rows; ticker, table and statistics show v2 results identically.
- No duplicate entries after retries; a second device cannot corrupt a game.
- The production image builds and serves the v2 bundle (`nginx.Dockerfile` stage present, `pyproject.toml` includes the app).
- `npm run typecheck`, the vitest suite and the Playwright flow are green in CI.
- Help topic shipped, CI shard running, scope check green.
- Old-app retirement is not part of this plan and stays open.
