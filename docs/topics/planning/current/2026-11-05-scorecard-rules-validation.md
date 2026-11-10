# Scorecard — Rules Validation & Rule Definition Plan

> **Coordinator:** this plan owns the scorecard rules work and the meeting adjustments of
> 2026-11-05 (§9). Implementation is approved. Every PR stays a **draft** until Christian merges.

> **REQUIRED SUB-SKILL:** `executing-plans` (or `subagent-driven-development`) to implement it task by task.

**Source of truth:** *IFAF Flag Football Rules 2023, 5 on 5 / non-contact* (`https://americanfootball.sport/wp-content/uploads/2023/05/FlagRules2023.pdf`, 60 pp.). Chosen 2026-11-05: it is the only rule document available. Where the book itself marks a field as a national/competition option (R "National Changes", p. 7), the value below is the **default**; a competition may override it later. Everything else is the standard.

**Goal:** make the scorecard's scoring, series, timing and penalty behaviour conform to IFAF 2023, and move the rules out of code into one declarative `flag_football_5v5` definition that the API, the backend projector and the field app all read.

**Architecture:** A JSON sport definition (`gameevents/sport/flag_football_5v5.json`) plus a thin loader (`gameevents/service/rules.py`) served through the existing config endpoints. The drive engine, the scoring tables and the penalty sheet read it; the Django-free projector keeps a local copy guarded by an equality test (the pattern that already guards `SCORING_EVENT_VALUES`). Four layer PRs, each independently shippable.

**Stack:** Django 6 + DRF, React 19 + TypeScript + Vite, vitest, pytest.

**Branch chain:** one `gh stack` chain off `master` — `feat/scorecard-rules-definition` → `…-rules-endpoint` → `…-rules-client` → `…-rules-series` → `…-score-team` → `…-try-state` → `…-rule-timing` (optionally adopting the open `fix/scorecard-fieldpos-keeps-down` as the bottom). One PR per layer, squash-merged bottom-up; `gh stack sync` handles the replay. See §4.

---

## 1. Validation result

Ratings: **bug** = contradicts IFAF 2023 · **keep** = deliberate product simplification, documented · **gap** = not modelled at all.

| # | Rule (page) | What the app does today | Rating |
|---|---|---|---|
| 1 | R 8-1-1, p. 28 — points are a team score, no player requirement | `_apply_score` writes `value = 0` when `player is None` (`projector.py:386`), and `MoreSheet` forces a jersey for Safety/Overtime | **bug** |
| 2 | R 3-1-3c, p. 19 — OT series starts at the middle line, no first down at the middle | `Overtime startet` is in `KICKOFF_EVENTS` → `FIRST_AND_TEN` (A5, 1st & M) (`drive.ts:74`) | **bug** |
| 3 | R 5-1-1, p. 23 — interception → new series at the **dead-ball spot** | `TURNOVER_EVENTS` reset to A5 (`drive.ts:83`); needs a manual `Feldposition` every time | **bug** |
| 4 | R 5, p. 23 — a first down is a state change | the `First Down` tile writes a row that `driveAfter` skips; down & distance never moves | **bug** |
| 5 | R 8-1-1, p. 28 — defensive score on a try = 2 points | `writePat` always writes for `patTry.team` (`Tracking.tsx:1201`) | **bug** |
| 6 | R 8-3-2c/e, p. 28 — try is its own down from B5/B10, penalties repeat it | no try state: bar reads `1st & M · A5`, penalties are enforced against a scrimmage spot | **bug** |
| 7 | R 3-3-2, p. 20 — 2 timeouts per half, no carry-over | `TimeoutHistory` sums the whole game, no cap, no "none left" rule | **bug** |
| 8 | R 3-2-1, p. 19 — 2-minute intermission | `HALFTIME_BREAK_SECONDS = 5 * 60` (`break.ts:14`) | **bug** |
| 9 | p. 39 — Summary of Penalties, 32 concepts | 50 rows cover 30 concepts: **failed challenge** and **charged timeout without a timeout left** missing; `illegale Ballübergabe` has no yardage (R 7-1-5 = 5 + LoD); pre-2023 German labels | **bug** |
| 10 | R 10-3, p. 33 — basic spot / spot of foul / dead-ball spot | only "current spot + signed yards"; `SF`/`DB` exist nowhere but in `subtext` text | **gap** (partly mitigated by the manual yardage field) |
| 11 | R 3-2, p. 20 — play clock 25 s, pass clock 7 s | none | **keep** (official clock is authoritative; R 3-2-3 allows a stopwatch) |
| 12 | R 7-1-3 e/f/g, p. 25 — QB may not run past the LOS, no-running zone ≤ 5 yd | none | **gap** (a warning is possible, see S4.T4) |
| 13 | R 10-2, p. 32 — declined / offsetting fouls | none | **keep** (an unrecorded or manually corrected penalty is the workaround) |
| 14 | R 8-5, p. 29 — touchback → own 5 | default after an interception is A5, i.e. accidentally correct | **keep** |
| 15 | R 3-1-1/2, p. 19 — coin toss, defer, sides | setup screen only | **keep** |
| 16 | R 1-1-1, p. 10 — 5 players, roster 15 | passcheck/roster, not scorecard | **keep** |

Already conformant and to be preserved: the points table, the A5/midfield/goal series geometry, the "first down at midfield only once" rule (the `goal` flag survives a loss across the middle), 4th-down failure → own 5, half-distance enforcement to the *offending* team's goal, penalty across the middle → 1st & G, safety credited to the opponent, safety-on-a-try as `Safety (+1)`, touchdown → possession flip → separate try entry.

Boundary nit (S2.T4): the app awards a new series at `ballOn >= 25`; R 5-1-1a says "**beyond** the middle".

---

## 2. The rule definition

**Value uncertainty (2026-11-05):** IFAF 2023 is the only rule document available and it has
not been confirmed as what the German leagues play; the 2027 rules were announced as final. Every
value therefore lives in the JSON — a rule change is a data change. Values that may be a deliberate
local rule are listed in §9.4.

**Guiding principle (meeting 11:55, 36:57, 46:08, 53:05):** *field calls win*. The operator enters
what the referee announces; the app may warn but never blocks, and `Feldposition` always wins. The
app covers the common cases — no full enforcement algebra. New inputs stay optional with a sensible
default so a lower-league operator is not slowed down.

### 2.1 File and loading

- `gameevents/sport/flag_football_5v5.json` — the definition. Sibling files (`beach_4v4.json`, `flag_7v7.json`) are the future variants and must need no schema change.
- `gameevents/service/rules.py` — `load_rules(sport="flag_football", variant="5v5") -> dict`, `penalty_catalogue(rules)`, `scoring_values(rules)`. Pure: `json` + `functools.cache` + `importlib.resources`, **no Django imports**, so the projector can be tested against it without a database.
- **Packaging trap:** `uv sync --no-editable` installs the project as a wheel and `[tool.setuptools.packages.find]` ships `.py` only — a `.json` inside a package is dropped unless declared. Add `[tool.setuptools.package-data] gameevents = ["sport/*.json"]` and load through `importlib.resources.files`, not `Path(__file__)`. This touches `pyproject.toml`, which may widen the CI test set (see `docs/topics/deployment/scoped-ci.md`); note it in the PR description.
- Served at `GET /api/config/scorecard/rules` (no trailing slash, like `.../penalties`). The existing `GET /api/config/scorecard/penalties` keeps its response shape (`name`, `subtext`, `isPenaltyAgainstOpponent`) but is built from the definition, so the old `scorecard` app is untouched. Add the new path to `snapshotKey.rules()` and the offline preload in `scorecard_v2/src/offline/snapshot.ts`.

### 2.2 Schema (the shape the app and the backend both consume)

```json
{
  "sport": "flag_football",
  "variant": "5v5",
  "ruleset": "IFAF 2023",
  "field": {
    "length": 50, "width": 25, "end_zone": 10, "middle": 25, "no_run_zone": 5,
    "spot_precision": 0.5
  },
  "series": {
    "downs": 4,
    "start": 5,
    "line_to_gain": ["middle", "goal"],
    "first_down_at_middle": "once",
    "turnover_on_downs_spot": 5,
    "interception_spot": "dead_ball"
  },
  "scoring": {
    "touchdown": 6,
    "try": { "5": 1, "10": 2 },
    "try_defense": 2,
    "try_safety": 1,
    "safety": 2,
    "touchback_spot": 5,
    "after_try_spot": 5,
    "safety_spot": 5
  },
  "periods": {
    "count": 2,
    "length_minutes": 20,
    "intermission_minutes": 2,
    "play_clock_seconds": 25,
    "pass_clock_seconds": 7,
    "running_clock_diff": 30
  },
  "timeouts": { "per_half": 2, "seconds": 60, "carry_over": false, "in_overtime": false },
  "overtime": {
    "start_spot": 25,
    "first_down_at_middle": false,
    "tiebreak_try": { "spot": 5, "points": 1 }
  },
  "officials": { "counts": [2, 3, 4] },
  "penalties": [ /* see 2.3 */ ]
}
```

### 2.3 Penalty entries

One row per **UI choice** (the current 50 keep their German labels; two concepts gain two rows each). Fields: `code`, `name` (German, unchanged where it exists), `subtext` (unchanged, for the old client), `yards` (`null` = not derivable, official types it), `down` (`repeat` | `first` | `loss`), `enforcement` (`BS` | `SF` | `DB` | `SL`), `side` (`offense` | `defense` | `both`), `rule`, `disqualification` (optional), `charged_timeout` (optional).

| `code` | DE label | yd | down | spot | side | rule |
|---|---|---|---|---|---|---|
| `pass_interference` | (Defense/Offense) Passbehinderung | 10 | first / loss | BS | both | 7-3-3 |
| `illegal_contact` | illegaler Kontakt Defense/Offense | 10 | first / loss | BS | both | 9-1-1 |
| `game_interference` | Behinderung Spieldurchführung Defense/Offense | 10 | first / loss | BS | both | 9-1-2 |
| `unsportsmanlike` | Unsportliches Verhalten Offense/Defense | 10 | repeat | DB | both | 9-2-1 |
| `illegal_kick_by_runner` | illegaler Kick durch Runner | 5 | loss | SF | offense | 6-1-1 |
| `illegal_run` | illegaler Lauf / illegaler Laufspielzug | 5 | loss | SL | offense | 7-1-3 |
| `illegal_handoff` | illegale Ballübergabe | **5** | loss | SF | offense | 7-1-5 |
| `illegal_backward_pass` | illegaler Rückwärtspass | 5 | loss | SF | offense | 7-2-1 |
| `backward_pass_batted` | Vorwärtsschlagen eines Rückwärtspasses | 5 | loss | SF | offense | 7-2-5 |
| `illegal_forward_pass` | illegaler Vorwärtspass | 5 | loss | SF | offense | 7-3-2 |
| `jumping` / `diving` | Springen / Hechten | 5 | loss | SF | offense | 9-2-2b |
| `flag_guarding` | Flag Guarding | 5 | loss | SF | offense | 9-2-2c |
| `illegal_snap` | illegaler Snap | 5 | repeat | DB | offense | 7-1-1a, 7-1-2 |
| `delay_of_game` | Spielverzögerung Offense/Defense | 5 | repeat | DB | both | 7-1-1b |
| `false_start` / `encroachment` | Fehlstart / Encroachment | 5 | repeat | DB | offense | 7-1-3a/c |
| `illegal_shift` / `illegal_motion` | illegaler Shift / illegale Motion | 5 | repeat | SL | offense | 7-1-3d |
| `offside` / `disconcerting` / `illegal_blitzer_signal` | Defense Offside / Störende Signale / illegales Blitzersignal | 5 | repeat | DB | defense | 7-1-4 |
| `illegal_rush` | illegaler Blitz | 5 | repeat | SL | defense | 7-1-4f |
| `shielding` | Abschirmen Offense/Defense | 5 | repeat | BS | both | 9-2-2a |
| `illegal_flag_pull` | illegales Flaggenziehen | 5 | repeat | BS | both | 9-2-2d |
| `illegal_kicking_a_pass` | illegales Treten eines Pass Defense/Offense | 5 | repeat | BS | both | 9-2-2e |
| `illegal_participation` | illegale Spielteilnahme Offense/Defense | 5 | repeat | SL | both | 9-2-2f |
| `sideline_interference` | Behinderung an der Seitenlinie Offense/Defense | 5 | repeat | SL | both | 9-2-2g |
| **`charged_timeout_without_remaining`** | Auszeit ohne verbleibende Auszeit | 5 | repeat | DB | both | 9-2-2, p. 39 |
| `illegal_substitution` | illegale Auswechslung Offense/Defense | 5 | repeat | SL | both | 9-3-1 |
| `delay_of_pass` | Passverzögerung | 0 | loss | SL | offense | 7-1-3g |
| `illegal_touching` | illegales Touching/Ballberührung | 0 | loss | SL | offense | 7-2-5 |
| `illegal_equipment` / `missing_equipment` / `bleeding_wound` | Person mit (fehlender) Ausrüstung / blutender Wunde verlässt nicht das Feld | 0 | repeat | DB | both | 9-2-2h (charged timeout) |
| **`failed_challenge`** | Fehlgeschlagene Challenge | 0 | repeat | DB | both | 12-1-4 (charged timeout) |
| `flagrant` | Grob unsportliches Verhalten Offense/Defense | `null` | repeat | DB | both | 10-1-1 (disqualification) |

Row count: 50 today → 54 (two concepts × two sides added). `null` vs `0` matters: `0` is a real no-distance penalty, `null` means "the book gives no number, ask the official".

**Acceptance of the definition (S1.T1):** a test enumerates all 32 concepts of p. 39, and every `yards`/`down`/`enforcement` triple is asserted against the page-39 table — the definition, not the code, is what the test pins.

---

## 3. Slices

> **PR mapping:** S1 → R1–R3 · S2 (T1–T4) → R4 · S2 (T5) + S4 (T1) → R6 · S3 → R5 · S4 (T2–T4) → R7. See §4.

### S1 — Rule definition (behaviour-neutral)

**S1.T1 — the definition + loader + its golden test**
- Create `gameevents/sport/flag_football_5v5.json`, `gameevents/service/rules.py`, `gameevents/tests/test_rules_definition.py`.
- Test: `load_rules()` returns the six top-level sections; every penalty row has the seven fields with allowed values; the 32 concepts of p. 39 are all present; `illegal_handoff.yards == 5`; the 54 rows have unique `(name, side)`; `scoring_values()` equals the table in R 8-1-1.
- Run: `DJANGO_SETTINGS_MODULE=league_manager.settings.test_sqlite PYTHONPATH="$PWD" .venv/bin/python -m pytest gameevents/tests/test_rules_definition.py -q` → first red, then green.
- Commit: `feat: add flag football 5v5 rule definition`

**S1.T2 — the config endpoint**
- Modify `gamedays/api/urls.py:168` (add `config/scorecard/rules`), `gamedays/api/game_views.py:839` (`ConfigPenalties` reads the definition; new `ConfigRules`), `gamedays/tests/api/test_game_views.py:1764` (assert 54 rows, the two new names, and the rules payload's `ruleset`).
- Keep the legacy response keys byte-for-byte; only the count and the two new entries change. Public, unauthenticated, like today.
- Acceptance: old scorecard and `scorecard_v2` keep working unchanged against `/penalties`; `/rules` returns the full definition; the test fails if a `subtext` loses its yardage.
- Commit: `feat: serve the rule definition from the scorecard config endpoints`

**S1.T3 — the Django-free projector guard**
- Modify `gameevents/tests/test_projector.py` (or the existing "two copies agree" test) to compare `SCORING_EVENT_VALUES` with `scoring_values(load_rules())`, and `gamedays/service/gamelog.py:17` likewise. Do **not** make the projector import the loader — the module stays Django-free by design.
- Commit: `test: pin projector and gamelog scoring values to the rule definition`

**S1.T4 — the app reads the definition**
- Create `scorecard_v2/src/api/rules.ts` (`GameRules` type + `fetchRules()` through `cachedGet`, `snapshotKey.rules()`).
- Modify `offline/snapshot.ts` (key), `offline/snapshot.test.ts:133` (path list), `app/drive.ts` (constants → `RuleGeometry`, default `IFAF_2023_5V5` so every existing pure test keeps working), `session/events.ts:79` (`SCORING_VALUES` from rules), `components/sheets/PenaltySheet.tsx:80-99` (`penaltyYardage`/`penaltyNextDown` read structured fields; keep the exported signatures so the 872-line test file stays valid).
- Tests: default geometry equals today's constants (regression), a non-default definition moves the first-down line, `displayOf` still scores `pat1` = 1.
- Commands: `npm --prefix scorecard_v2 run test:run`, `npm --prefix scorecard_v2 run eslint`, `npm --prefix scorecard_v2 run build` (all three are CI gates).
- Commit: `feat: drive the scorecard engine from the rule definition`

### S2 — Engine correctness (items 2, 3, 4, 6, 12)

All in `scorecard_v2/src/app/drive.ts` — pure functions, no database, vitest only.

**S2.T1 — overtime starts at the middle, without a first down at the middle**
- `OT_START` from `rules.overtime`; `Overtime startet` leaves `KICKOFF_EVENTS` and gets its own case.
- Test: after `Overtime startet` the state is `1st & G` on `M`, and a gain to 25 does **not** award a fresh series.

**S2.T2 — interception at the dead-ball spot**
- `TURNOVER_EVENTS` distinguishes `interception` (series at `payload.deadBall` when present, else mark the spot as unknown and keep the officials' `Feldposition`) from `turnover`/failed 4th down (own 5).
- `SeriesSheet` interception mode gains an optional "wo getackelt?" spot field (`A`/`B` + yards), written into `payload`.
- Test: `Feldposition` still wins over the derivation; a 4th-down failure still lands on own 5.

**S2.T3 — `First Down` resets the series**
- `driveAfter` treats a live `First Down` row as `seriesAt(state.ballOn)`; a deleted row is ignored (undo rewinds).
- Test: tapping First Down moves `3rd & M` to `1st & M`; undoing it restores `3rd`.

**S2.T4 — boundary: "beyond the middle"** (decision 2026-11-05: **half yards**, `spot_precision: 0.5`)
- New `pastMiddle(ballOn)` helper (`ballOn > MIDDLE`, no flooring — half yards are already real, they fall out of the half-distance penalty rule and are displayed as `A4,5`), used by `advance`, `placeBall`, `applyPenalty`.
- The definition carries the precision so a competition that spots whole yards only needs a data change, not a code change.
- Test: exactly `25` stays `1st & M`; `25.5` becomes `1st & G`; a penalty landing on `M` does not award a new series.

**S2.T5 — try state**
- New `phase: "series" | "try"` in `DriveState`; `Touchdown` → try at `B5` (1) or `B10` (2) chosen by the answer the official already gives; a try ends on the score/miss/`Feldposition`; the next series starts at the opponent's `own 5`.
- The bar renders `Versuch` instead of a down.
- Test: a penalty during the try repeats it and does not move the following series.

### S3 — Score without a jersey, and overtime as its own period

**S3.T1 — the score stops depending on `player`**
- `gameevents/service/projector.py:386` (`row_value = value` regardless of player), `gamedays/service/gamelog.py:78` (same), `league_table`/`livestream` readers unaffected because a row with `player=None` and `value=6` is already what a v1 "team touchdown" produces.
- Projector test: a touchdown without a jersey moves `score_home` by 6 **and** stores `value = 6`; the golden rows for existing payloads are unchanged.
- Migration note: no schema change; `TeamLog.value` already exists.

**S3.T2 — the UI stops demanding a jersey for team scores**
- `MoreSheet` (Safety/Overtime) makes the jersey optional; `TouchdownSheet` gains "ohne Nummer" for a defensive/teams score; `JerseyPicker`'s `optionalLabel` reused.
- Help topic `/help/spieltag-v2/` updated (screenshot) — see `.opencode/skills/add-help-topic`.

**S3.T3 — overtime is period 3**
- `TeamLog.half` stays 1/2 for existing consumers; `GameEvent.period` 3 for OT, and the projector sums OT into the final score but exposes `state.overtime` so the league table can exclude it if a competition wants (R 3-1-4 counts regular time for tiebreaks).
- Test: a TD in OT is reachable as `period=3`; the final score still includes it.

### S4 — Guards and catalogue housekeeping (items 1-UI, 5, 7, 8, 9)

**S4.T1 — defensive score on a try**
- `answerPat` gains "Gegner" (defense scores 2): writes `2-Extra-Punkte` for the non-scoring team with `payload.try_defense = true`.
- Test: the score lands on the defence; the following series is unchanged.

**S4.T2 — timeout budget (warn only — field calls win)**
- `timeouts` per team per half from the definition; the tile shows `1/2` and the sheet shows the remaining count.
- A third timeout in a half **warns** and offers the `charged_timeout_without_remaining` penalty, but **never blocks**: the operator records what the referee announced (meeting 36:57).
- Test: two in H1, one in H2 is allowed; a third in H2 warns and still saves; an undo frees the slot.

**S4.T3 — intermission 2 minutes**
- `break.ts:14` from the definition (`intermission_minutes`); the countdown text unchanged.
- Test: `secondsLeft` starts at 120.

**S4.T4 — rule guards the app can see (warnings only, never blocking)**
- No-running zone: ball inside `no_run_zone` + a `Run` entry → "Kein Lauf in der No-Run-Zone (R 7-1-3f)".
- QB run: `payload.qb === player` and yards > LOS → hint.
- 7-second pass clock: passive stopwatch on the play sheet, no enforcement.
- Test: each hint appears only in its condition and never disables the save button.

---

## 4. Review topology — one `gh stack` chain

The four slices are one story (*"the scorecard follows IFAF 2023"*), so they belong in **one stack**; the existing open scorecard layers are already merged, so this is a fresh chain off `master`.

### 4.1 What I checked (2026-11-05)

| Check | Result |
|---|---|
| `gh stack` installed | yes — `github/gh-stack` **v0.1.1** |
| `git config rerere.enabled` | `true` (conflict memory survives rebases) |
| remotes | **two** (`origin`, `phhbr`); `remote.pushDefault=origin` is set, so `checkout`/`trunk` work non-interactively |
| current branch in a stack | no (`gh stack view --json` → "not part of a stack") |
| `master` state | scorecard v2 L0–L5 are **merged** (#2278 last); no open scorecard layer remains |
| open PR touching the same code | **#2280** `fix/scorecard-fieldpos-keeps-down` — `drive.ts`, `drive.test.ts`, `FieldPositionSheet.tsx`, `Tracking.test.tsx` |
| GitHub stacked-PR feature | **enabled** (confirmed 2026-11-05) — `submit` links the layer PRs into one GitHub stack, so reviewers see the chain in order |
| repository ruleset on `master` | **protected** by the active ruleset `PR` (id 12420854): pull request required, code quality, no force-push, no deletion, required checks `ci/circleci: full_gate`, `ci/circleci: scope_coverage`, `ci/circleci: check_version_sequence`. Admins may bypass; everybody else cannot |
| merge settings | squash/rebase/merge commit all allowed, `delete_branch_on_merge=true`; no merge queue, so `gh stack merge --squash` merges directly |
| consequence | each layer must be **green on CI** before the layer above can merge, and merge **bottom-up**: a merged layer's branch is auto-deleted and `gh stack sync --prune` replays the rest |

### 4.2 The chain (bottom → top)

Each row must be a sentence a reviewer can hold in their head, and must be green on its own.

| # | Branch | The one sentence | Main files |
|---|---|---|---|
| **R0** | `fix/scorecard-fieldpos-keeps-down` (#2280, **adopted**) | the open fix lands first so the engine diffs rebase cleanly | `drive.ts`, `FieldPositionSheet.tsx` |
| **R1** | `feat/scorecard-rules-definition` | the rulebook becomes **data**: one JSON + a pure loader + the page-39 golden test | `gameevents/sport/*.json`, `gameevents/service/rules.py`, `gameevents/tests/*`, `pyproject.toml` (package-data) |
| **R2** | `feat/scorecard-rules-endpoint` | the **API** serves that data; the old `/penalties` shape is unchanged, the list grows 50 → 54 | `gamedays/api/{urls,game_views}.py`, `gamedays/tests/api/test_game_views.py`, the "50 items" doc line |
| **R3** | `feat/scorecard-rules-client` | the **app consumes** the definition and behaves exactly as before (defaults = today's constants) | `api/rules.ts`, `offline/snapshot.ts`, `app/drive.ts`, `session/events.ts`, `sheets/PenaltySheet.tsx` |
| **R4** | `feat/scorecard-rules-series` | **down & distance follows the book**: OT from the middle, interception at the dead-ball spot, a tapped First Down resets, "beyond" the middle | `app/drive.ts`, `sheets/SeriesSheet.tsx`, `screens/Tracking.tsx` (thin) |
| **R5** | `feat/scorecard-score-team` | the **score is a team score**: no jersey required, overtime is its own period | `projector.py`, `gamelog.py`, `MoreSheet.tsx`, `TouchdownSheet.tsx`, `Tracking.tsx` (thin) |
| **R6** | `feat/scorecard-try-state` | **the try is a down**: B5/B10, repeat on a penalty, a defensive score is 2 points | `app/tryState.ts` (new), `drive.ts`, `Tracking.tsx` (thin) |
| **R7** | `feat/scorecard-rule-timing` | **time and warnings**: 2 timeouts per half, a 2-minute intermission, no-run-zone / QB-run hints | `app/timeouts.ts` (new), `break.ts`, `SeriesSheet.tsx`, `PlaySheet.tsx` |

Dependency check: R3 needs R1 (data) and R2 (endpoint, for the offline preload path) → R4 needs R3 (geometry) → R6 needs R4 (phase) and R5 (jersey-free score) → R7 is independent above R3. The order above satisfies every dependency, which is what makes a linear stack safe.

**R0 decision (2026-11-05): adopt #2280 as the stack bottom**, unchanged unless CI requires it. It edits the same lines of `drive.ts` as R4, so leaving it outside the stack would guarantee a conflict.

### 4.3 The scoping rule that makes each PR reviewable

The biggest review cost in this codebase is `screens/Tracking.tsx` (1 920 lines) and `app/drive.ts`: nearly every PR would touch both. Two rules keep each diff honest, following the pattern that already exists (`app/drive.ts`, `app/break.ts`, `app/sideline.ts` are pure modules with their own tests):

1. **New logic goes into a small pure module with its own test file.** `Tracking.tsx` receives only the call site — target ≤ 20 changed lines per PR. So R6 adds `app/tryState.ts` (tested alone) and R7 adds `app/timeouts.ts` (tested alone); the screen change is "call it and render its text".
2. **A PR never edits another PR's test file** unless a shared type changed — and then the type change lives in the lower PR (R3), so the upper PR's diff stays additive.

Every PR is verified standalone: `npm --prefix scorecard_v2 run test:run && … run eslint && … run build`, plus the backend shard for R1/R2/R5. Docs (`overview.md`, `/help/spieltag-v2/` + screenshot) land in the PR that changes what an operator sees — R5, R6, R7 — not in R1.

Three PRs change externally visible behaviour (R2, R5, R6), so their body carries the rule reference table from §1; `gh stack submit --auto` only derives titles from commits, so follow it with `gh pr edit <n> --body-file <file>`.

### 4.4 Commands

```bash
# already configured in this checkout (verified above)
git config rerere.enabled true
git config remote.pushDefault origin

# bottom of the stack: adopt the open fix, or start at master once it merges
gh stack init --base master fix/scorecard-fieldpos-keeps-down
# … commit R0 is already there

# one branch per layer, added only when the layer below is committed
gh stack add feat/scorecard-rules-definition
gh stack add feat/scorecard-rules-endpoint
gh stack add feat/scorecard-rules-client
gh stack add feat/scorecard-rules-series
gh stack add feat/scorecard-score-team
gh stack add feat/scorecard-try-state
gh stack add feat/scorecard-rule-timing

# publish (drafts). The first submit that has two or more PRs also creates the
# GitHub stack grouping; a single-PR chain simply stays a normal PR until R2 exists
gh stack submit --auto --remote origin
gh stack submit --auto --open --remote origin

# routine: after each squash merge (the merged branch is auto-deleted on GitHub)
gh stack sync --prune --remote origin

# merge the chain bottom-up; no merge queue on master, so this merges directly
gh stack merge --yes --squash
```

Never run `gh stack add -Am …` here: stage deliberately so each layer contains only its own concern. Never run `gh stack` from two worktrees at once — the stack is repository-level state while subagent worktrees are throwaway. `gh stack view --json` is the only safe way to inspect it.

Failure paths: **exit 3** → resolve, `git add`, `gh stack rebase --continue` (or `--abort`, which restores every branch). **exit 6** → a branch is in two stacks; `gh stack checkout <branch>` from a non-shared branch first. **exit 9** would mean stacks were switched off; if that ever happens the chain survives as plain base-chained PRs (`gh pr create --base <branch below>` per layer), but with stacks enabled it does not apply.

### 4.5 What the reviewer actually sees

| PR | New/touched files | Expected diff shape |
|---|---|---|
| R1 | 4 | one JSON (≈350 lines, data), one loader (≈40), one test (≈120) |
| R2 | 4 | ~80 lines of view + ~40 of test |
| R3 | 8 | mostly mechanical: a type, a path, three call-site swaps |
| R4 | 3 + test | ~60 lines in `drive.ts`, ~30 in the sheet |
| R5 | 5 + test | ~30 lines backend, ~60 UI |
| R6 | 1 new module + 3 | new module ≈100, screen ≈20 |
| R7 | 1 new module + 4 | new module ≈80, screen ≈25 |

## 5. Gates per slice

```bash
# backend (local SQLite; the CI path is `uv run pytest` against MySQL)
DJANGO_SETTINGS_MODULE=league_manager.settings.test_sqlite PYTHONPATH="$PWD" \
  .venv/bin/python -m pytest gamedays/tests/api scorecard/tests.py gameevents -q -p no:cacheprovider

# scorecard_v2 frontend
npm --prefix scorecard_v2 run test:run
npm --prefix scorecard_v2 run eslint        # 0 errors
npm --prefix scorecard_v2 run build
```

Definition of done for every slice: green backend shard + vitest + eslint + build, signed commit (`git commit -s`), no migration in `gamedays` unless stated, help topic + feature doc updated for anything an operator sees, `.circleci/scope-mapping.txt` untouched unless a new path appears (the JSON under `gameevents/` is covered by the `gameevents` scope; `pyproject.toml` may widen the run).

---

## 6. Obligations that are easy to miss (from the repo's readiness checks)

| Item | Where |
|---|---|
| The planning doc needs a line in the index | `docs/topics/planning/README.md` |
| `2026-10-26-scorecard-v2.md:176` says "50 items" | update to 54 when S1 ships |
| Snapshot path list | `scorecard_v2/src/offline/snapshot.test.ts:133` |
| Help topic + screenshot + `llms-full.txt` | `league_manager/help/content/spieltag-v2.de.md`, `league_manager/static/help/img/`, `test_help.py`, `test_ai_readiness.py` |
| Feature doc | `docs/topics/features/scorecard-v2/overview.md` |
| CI scope coverage | `scripts/check_scope_coverage.py` safety net |

---

## 7. Explicitly not in this plan

- Beach 4v4 and Flag 7v7 **values** (the schema admits them; no squad plays them yet).
- A running game clock, the 25-second play clock as an enforced timer, quarter support, and the running-clock-at-30 rule.
- Declined/offsetting fouls and full enforcement-spot algebra (R 10-3) — the manual yardage field stays the escape hatch.
- Retirement of the old `scorecard` app.
- Any change to `gamedays` models or migrations.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| The JSON is dropped from the wheel (`uv sync --no-editable`) | `[tool.setuptools.package-data]` + `importlib.resources` + a loader test; verify once in a built image |
| `driveAfter`/`displayOf` signatures ripple through ~30 test files | Defaulted parameters (`rules = IFAF_2023_5V5`), which keeps every current call site valid |
| The German labels are what operators know | Labels never change in S1; only structure is added, and `subtext` is preserved verbatim |
| Overtime as period 3 breaks readers that assume 1/2 | `TeamLog.half` stays 1/2; only `GameEvent.period` grows, so no existing consumer changes |
| A rules fix changes a running gameday's display mid-day | Ship S1 (no behaviour change) first; S2/S3 are deployable independently and neither rewrites stored rows |
| #2280 is open on the same twelve lines of `drive.ts` | Adopt it as the stack bottom (R0) or do not start R4 before it merges |
| `gh stack` state is repository-level, subagents run in worktrees | All stack commands from one worktree; subagent worktrees never run `gh stack` |
| `submit --auto` generates PR titles/bodies from commits only | `gh pr edit <n> --body-file` for the three behaviour-changing PRs (R2, R5, R6) |
| `master` is protected by the ruleset `PR` | every layer must be green on the three required checks; merge bottom-up, never a middle layer first |

## 9. Meeting cross-check (2026-11-05)

Checked against `master` at `d8c812e8` (#2281). Every row is either covered by a layer, a new layer,
already done on `master` (with the evidence), or held.

### 9.1 Agreed changes — to build

| ID | Meeting | Status | Where / evidence |
|---|---|---|---|
| A5 | Interception **and its return as one event** (47:15–49:03): number, where the play ended; interception spot and return yards optional for statistics | **new layer R8** | today `Interception` is a one-tap row (`SERIES_TILES`) and the spot needs a second `Feldposition` row; `drive.ts:83` resets the new series to A5 regardless of the return |
| A6 | **Touchdown is the result of the play entry**, not a separate step (53:05–53:43); the extra point stays its own event so a penalty on the touchdown carries into the try (51:45) | **new layer R9** | `TouchdownSheet` is its own tile; `PlaySheet` has pass/run/sack only; a penalty recorded after the TD is a separate row with no link to the try |
| A7a | Yards input is clipped on a phone (21:02) | **new layer R10** | `.sheetinput-num { max-width: 120px; font-size: var(--fs-xl) }` (`app.css:2589`) with `width: 100%` — three digits at `fs-xl` overflow the 120 px box on a 360 px viewport |
| A7b | A spot input offers 0–99 where the field has 50 yards (30:24); check the penalty sheet first | **new layer R11** | the **penalty** sheet says "Yardage (0–99)" and accepts 99 (`PenaltySheet.tsx:555`, `yards.ts`); `FieldPositionSheet` already caps at 0–25 per side (`:82`, `:145`) — the field-position input is **already correct** |
| A7c | Some log rows have no edit action, so operators can only reset (24:50–25:46) | **new layer R12** | `EDITABLE_EVENTS` (`EventLog.tsx:161`) omits `Turnover`, `Pass`, `Pass unvollständig`, `Run`, `Sack`, `Feldposition`, `Challenge`; `editField` (`EditSheet.tsx:39`) can only do jersey or clock, so those rows would write a broken correction |
| A7d | Half-distance at A5: 5 yards offered instead of 2,5 (56:02) | **new layer R11** (same "numbers" concern) | the **engine** is correct — `applyPenalty` clamps to `max(ballOn, spot/2)` = 2,5 at `A5` (`drive.ts:203`); the **sheet** prints the catalogue's 5 yards and shows no resulting spot, which is what Léon saw. Reproduce as a display test, then show the effective spot |
| B3 | Review every screen on phone/tablet/desktop; three most used actions big and on top, rest smaller below, no needless scrolling (11:55, 34:01, 1:01:36) — **without rebuilding the entry flow** (held A4) | **new layer R13** (presentation only: layout, order, sizes; no new flow) | current breaker points 900/1280 px are documented in `scorecard_v2/AGENTS.md`; the composer grid is `SERIES_TILES` + `action-grid`; before/after screenshots required |
| B5 | Tap a team to set possession **or take that team's timeout**, and show its remaining timeouts there; either team can call one regardless of possession (57:33–59:08) | **new layer R14** | possession is already two team buttons (`tracking-possession`, shortcut **B**); a timeout is the `Auszeit` tile + sheet (`SeriesSheet` timeout mode) and is always recorded for the possessing team (`writeTeam`) — so an opponent's timeout must currently be booked as a possession change |
| C3 | Two users on one game saw no warning before kickoff (14:47); keep the staff-only release | **new layer R15** | the lock is only discovered when `PUT /setup` fails with `409` (`GameSetup.tsx:256`); the setup read already carries `device_id`, so the warning can be shown before the tap |

### 9.2 Held — no code in this stack

| ID | Item | Needs |
|---|---|---|
| A4 | After a flag, propose next down and spot for confirmation (42:48) | entry-flow decision; would touch `PenaltySheet`, `drive.ts` and the composer |
| — | Locked penalty yards (penalty catalogue as fixed values) | the same entry-flow decision; `PenaltySheet` + the definition |
| — | One-screen vs step-by-step entry | entry-flow decision; `Tracking.tsx` |
| B1/B2 | Simple / advanced mode per league | what "simple" contains; `api/config` + `Tracking.tsx` |
| C1/C2 | Take-over by non-staff accounts | take-over rules; `gameevents`/`gamedays` lock + `SyncStrip` |
| C4 | Post-game corrections beyond what exists | who may correct, how much; `Result`/`Finalize` + `gamedays` API |

### 9.3 Not in the rules plan (other owners)

Live ticker, PDF report, Passcheck, officials/Game Day, Moodle — untouched.

### 9.4 Values that may be a deliberate local rule (need Léon's confirmation)

| Value | IFAF 2023 | In the app today |
|---|---|---|
| Intermission | 2 min (R 3-2-1) | **5 min** (`break.ts:14`) — shipped as the definition default, PR body asks for confirmation |
| Timeouts per half | 2 (R 3-3-2) | unlimited; R7 shows `1/2` and warns, never blocks |
| Half length | 20 min (R 3-2-1) | no clock in the app at all (product decision) |
| Try spots | B5 = 1, B10 = 2 (R 8-3-2c) | points only, no spot |
| Safety on a try | 1 point (R 8-1-1) | `Safety (+1)` exists, label does not say "try" |
| Penalty yardage table | p. 39 | German catalogue, two concepts missing, one yardage missing |
| No-run zone / 7-s pass clock / QB-run | R 7-1-3 e/f/g | not modelled; R7 adds warnings only |
