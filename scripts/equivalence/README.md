# Equivalence harness (Phase 0c)

Part of [Phase 0 / issue #2536](https://github.com/dachrisch/leaguesphere/issues/2536).
The harness proves that a refactor behaves like the code it replaces by
diffing the same reads from two deployments that share one database:

- **ref** — the master image the phase started from (no watchtower label),
- **cand** — `leaguesphere/backend:agent-candidate` (the `ls-agent-cand-update` system timer picks it up; health-gated, ~5 min).

The agent stage, its basic-auth proxy and the harness accounts live in the
`servyy-container` infra repo (`ls_agent_stage` role). This directory holds
the client side only; stdlib-only, so it runs with a bare `python3`.

## Noise floor first

```bash
python3 scripts/equivalence/selftest.py \
  --url https://ref.example --username "$LS_AGENT_BASIC_USER" \
  --password "$LS_AGENT_BASIC_PASSWORD"
```

Ref vs ref must produce **zero diffs**. No report is trusted before that
passes. If it fails, fix the normaliser (`normalise.py`) — never widen the
report's tolerance.

## Run a comparison

```bash
python3 scripts/equivalence/runner.py \
  --ref https://ref.example --cand https://cand.example \
  --username "$LS_AGENT_BASIC_USER" --password "$LS_AGENT_BASIC_PASSWORD" \
  --report /tmp/equivalence.md --comment-pr 2600 2601
```

- Probes are selected from `manifest.json` at run time: at least one gameday
  per schedule type (designer canvas, published without a canvas, finished),
  with league tables for the sampled leagues/seasons.
- Write scenarios (`scenarios.py`) create run-id-tagged entities on **each**
  side (`<run-id>-ref`, `<run-id>-cand`) and re-read them; captured ids are
  normalised so the two sides compare equal.
- `--skip-scenarios` is the 0b zero-diff check (probes only).
- Role probes (staff / team manager / official) need the harness role
  credentials in `LS_AGENT_STAFF_*`, `LS_AGENT_TEAM_MANAGER_*`,
  `LS_AGENT_OFFICIAL_*`; without them those probes are reported as *skipped*,
  never faked.
- The officials sign-up flow is Moodle-gated (`MOODLE_LOGGED_IN_USER`), so
  with harness accounts the scenario only exercises the guard redirect.

## Redaction

The report is posted to public pull requests. It contains probe names, field
paths, diff kinds and counts — no values, emails, names, tunnel URLs or
credentials. A field that really differs shows up as a path like
`$.games[0].home (value)`, never as the value itself.

## Intended diffs

A phase that deliberately changes a response lists the changed paths in a
JSON file and passes it with `--intended`:

```json
{"snapshot-api": ["$.schema_version"]}
```

Matching diffs are reported separately as intended; anything else is
unexplained and fails the run.

## Files

| file | purpose |
|---|---|
| `manifest.json` | probe sample (selection rules + paths), roles, discovery |
| `transport.py` | basic-auth HTTP sessions, Django login, cookie jars |
| `normalise.py` | strips CSRF/tokens, timestamps, asset hashes, run-id ids |
| `diff.py` | structural JSON diff and normalised-text line diff (no values) |
| `probes.py` | discovery, sample selection, probe execution, comparison |
| `scenarios.py` | write scenarios (designer publish, finalize, sign-up guard) |
| `selftest.py` | ref-vs-ref noise floor |
| `runner.py` | both sides + report + `gh pr comment` |
| `report.py` | redacted markdown rendering |
