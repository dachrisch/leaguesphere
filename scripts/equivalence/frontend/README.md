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
The runner exits 1 on any unexplained diff. Phase 3 declares no intended
diffs; `--intended` exists for later phases only.

**Noise floor first:** run with `--ref <ref-route> --cand <ref-route>` (the same
side twice) with all four role credentials present. Zero diffs **and no login
errors or skipped steps** are required before any ref-vs-cand report is trusted.
The first noise floor also fixes the volatile-node allowlist below — it is
reviewed, never widened silently.

Role logins go through the stdlib transport (which sends the `Referer:
https://localhost/...` the proxied Django requires) and their cookies are
injected into the browser context. Each step waits until no new API request
has arrived for 600 ms, so parallel mount fetches are captured deterministically.
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
| `^vor \d+\s*(s\|sek\|min\|h)$`, `^gerade eben$` | Relative clock labels change while a step runs. |
| `\[(focused\|active)\]` | Focus state depends on the last clicked control. |
| `\b(fade\|slide\|transition)-(in\|out)\b` | CSS transition state is timing-dependent. |

## Journeys

`scorecard_v2_tracking` (record + undo), `scorecard_v2_gamesetup` (crew),
`designer_gametable` (team cell), `officials_pages` (signup guard + licence
view), `passcheck` (eligibility list), `liveticker` (public page and its XHR
sequence). All six run on **every** layer (PROVISIONAL P10); a failure is
attributed by journey and step in the report.

Writes use run-id-tagged entities discovered through the API; ids are
normalised to `<entity-N>`. Stage rows are never deleted — both sides share one
DB and see each other's rows by design.

## Tests and coverage

```bash
python3 -m pytest --confcutdir=scripts/equivalence/frontend/tests \
  scripts/equivalence/frontend/tests -q
python3 -m coverage run --branch --source=scripts/equivalence/frontend \
  -m pytest --confcutdir=scripts/equivalence/frontend/tests \
  scripts/equivalence/frontend/tests -q
python3 -m coverage json -o coverage-frontend.json
python3 scripts/check_branch_coverage.py --coverage coverage-frontend.json \
  --base HEAD --root . \
  --require-file scripts/equivalence/frontend/capture.py \
  --require-file scripts/equivalence/frontend/runner.py
```

`capture.py` and `runner.py` are characterized at 100% branches with fakes;
the real browser/HTTP adapters live in `browser.py` and are verified by the
noise floor on the live stage. Reports are posted manually with `gh pr comment`
(PROVISIONAL P6). Rollback: stop using the harness; no app code is involved.
