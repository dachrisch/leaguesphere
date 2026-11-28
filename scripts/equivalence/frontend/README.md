# Frontend journey equivalence harness (Phase 3 Layer 1, #2539)

The backend harness (`scripts/equivalence/`) compares server HTML/API only. On
the agent stage the backend images have no `/static/` bundles, so Phase 3 Layer
1 adds the missing frontend half. It runs the **same** six Playwright journeys
against both sides of the shared stage and diffs each step.

## Run

```bash
python3 scripts/equivalence/frontend/runner.py \
  --ref https://<ref-route> --cand https://<cand-route> \
  --username "$LS_AGENT_BASIC_USER" --password "$LS_AGENT_BASIC_PASSWORD" \
  --run-id fe-20261126-1 \
  --report /tmp/frontend-journeys.md \
  --comment-pr <pr-number>
```

The four role credentials use the same environment names as the backend
manifest (`LS_AGENT_{STAFF,TEAM_MANAGER,OFFICIAL}_{USER,PASSWORD}`). A role that
is absent or cannot log in makes that journey's steps **skipped**, never faked.
The runner exits 1 on any unexplained diff, skipped step, harness error or
journey with fewer than `--min-steps` (default 2) captured steps — a run that
clicked nothing is never reported as "0 diffs". Phase 3 declares no intended
diffs; `--intended` exists for later phases only.

**Noise floor first:** run with `--ref <ref-route> --cand <ref-route>` (the same
side twice) with all four role credentials present. Zero diffs **and no login
errors or skipped steps** are required before any ref-vs-cand report is trusted.
The first noise floor also fixes the volatile-node allowlist below — it is
reviewed, never widened silently.

Role logins go through the stdlib transport (which sends the `Referer:
https://localhost/...` the proxied Django requires). Each role gets its **own**
browser context: Django's `sessionid` cookie is identical for every account,
so one shared jar would silently leave the last role logged in (and the
scorecard journeys on the login page). A missing or failed role login skips
the affected journey, never fakes a step. Each step waits until no new API
request has arrived for 600 ms, so parallel mount fetches are captured
deterministically.
SSE requests are aborted and every page/context is closed after a journey, so a
stream can never pin a side's worker.

## What a step records

- **Normalised API requests**: ordered `[{method, path, body_shape}]` for every
  `/api/…` XHR/fetch. Query parameters are sorted, run-id ids become
  `<entity-N>`, and `body_shape` is keys/types only, never values. CSRF,
  timestamps, ETags, asset hashes and session noise are removed by importing
  the backend `normalise.py`; the SSE stream (`/api/liveticker/stream/`) is
  excluded exactly as in the backend harness.
- **Visible DOM/ARIA**: `document.body.innerText` plus Playwright's
  `locator("body").aria_snapshot()`, normalised with `normalise_dom()`. Diffs
  use the backend `diff.py`, so the report carries line numbers and paths only
  — no names, emails, values or credentials.

### Volatile-node allowlist (reviewed at the first noise floor)

| Pattern | Reason |
|---|---|
| `\bvor \d+\s*(?:s\|sek\|min\|h)\b`, `\bgerade eben\b` → `<time>` | Relative clock labels change while a step runs. Unanchored (`capture.py` `VOLATILE_NODES`): the label is replaced in place inside its line, the rest of the line is kept. |
| `\[(focused\|active)\]` → removed token | Focus state depends on the last clicked control; the rest of the line is kept. |
| `\b(fade\|slide\|transition)-(in\|out)\b` → removed token | CSS transition state is timing-dependent; the rest of the line is kept. |
| A whole line that is only `HH:MM` (optionally prefixed by an ARIA label such as `- time:`) → `<time>` | The scorecard event log renders wall clocks as bare `HH:MM` (`EventLog.tsx` `formatLogTime`); two runs a minute apart otherwise disagree on identical rows. In-place, line-preserving, and narrow: scores (`12:7`) and times inside prose (`Kickoff 10:00 Uhr`) keep their values, so a real kickoff/score change still diffs. Not tokenisable with `id_tokens`: the clock is created by the browser at capture time, not by the fixture. |

Relative clock labels and event-log clocks become `<time>` rather than dropping the line.

## Journeys

`scorecard_v2_tracking` (log filter, Spielzug sheet, a real touchdown + extra
point write and undo, halftime write, series tile, and the live/finished/
stranded panel states), `scorecard_v2_gamesetup` (crew picker, a real start
write and the saved-setup "Fortsetzen" state), `designer_gametable` (opens the
grouped team-option menu on a team cell of a DRAFT fixture gameday, picks
another team and waits for the designer's own autosave `PUT …/designer-state/`), `officials_pages` (signup guard + licence
view), `passcheck` (eligibility list), `liveticker` (public page and its XHR
sequence). All six run on **every** layer (PROVISIONAL P10); a failure is
attributed by journey and step in the report. The first two journeys exercise
every screen split by Phase 3 Layers 6–12, so the DOM/ARIA diff is a real
behaviour witness.

Writes use dedicated run-id-tagged gamedays/games created through the same API
steps as the backend write fixtures, so ref and cand start from identical
state and never write to each other's rows; captured ids are normalised to
`<entity-N>`. Each journey removes the gameday it created itself at the end;
this is the one deliberate exception to plan §3.3's "never delete stage rows"
(see `fixture.cleanup()`): a side's leftover fixture would otherwise be picked
up by the other side's `discover()` and show up as a cross-side diff. Nothing
else on the stage is deleted. Every write is a required click: an absent
write control fails the journey (skipped step → exit 1). Only genuinely
optional states (for example "Fortsetzen", which exists only once a setup was
saved) use optional clicks, which record their selector in the step's
`absent` list; that list is diffed too. A journey that raises (for example a
fixture error) is listed under "Harness errors" and the remaining journeys
still run.

## Tests and coverage

```bash
python3 -m pytest --confcutdir=scripts/equivalence/frontend/tests \
  scripts/equivalence/frontend/tests -q
python3 -m coverage run --rcfile=scripts/equivalence/frontend/.coveragerc \
  -m pytest --confcutdir=scripts/equivalence/frontend/tests \
  scripts/equivalence/frontend/tests -q
python3 -m coverage json -o coverage-frontend.json
python3 scripts/check_branch_coverage.py --coverage coverage-frontend.json \
  --base HEAD --root . \
  --require-file scripts/equivalence/frontend/capture.py \
  --require-file scripts/equivalence/frontend/runner.py
```

`capture.py` and `runner.py` are characterized at 100% branches with fakes;
they are the only files plan §3.4 puts under the branch gate, and CI forces
exactly those two back in with `--require-file`. The rest of the harness is
deliberately left out of the gate: `browser.py` (the real Playwright/HTTP
adapters), `journeys/common.py` and `journeys/fixture.py` drive a live browser
against the stage, and a broken one cannot produce a green report, because the
runner fails on every skipped step, harness error and too-short journey. They
are verified by the noise floor on the live stage. Reports are posted manually with `gh pr comment`
(PROVISIONAL P6). Rollback: stop using the harness; no app code is involved.
