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
- Phase 2 adds liveticker HTML/JSON probes, a per-game feed probe and their
  `If-None-Match` revalidation probes (the SSE `/api/liveticker/stream/`
  endpoint is deliberately not diffed). Three write scenarios exercise the
  v2 event write, the legacy v1 shadow write and the reconciliation flag; a
  fourth creates a gameday through the legacy wizard with a compact legacy
  JSON schedule and finalises its game. Client ids are run-id-derived UUIDs
  and normalised.
- The officials sign-up flow is Moodle-gated (`MOODLE_LOGGED_IN_USER`), so
  with harness accounts the scenario only exercises the guard redirect.

## Flag-ON comparison (Phase 2, historical procedure)

**This procedure only applies to the pre-cutover build.** Layer 6 removes
`SCORECARD_EVENT_FEED`, so there is no flag to toggle after the cutover. It is
kept as the record of the Layer 4 flag-ON comparison and of the flag-ON half of
the Layers 5/6 release candidate. Layers 5 and 6 ship together in one release
after the agent-stage gameday rehearsal; the flag is never flipped on a
post-cutover build.

On servyy-test the flag is turned on for `cand` only through the
`ls_agent_stage` role's `ls_agent_stage_cand_env` (a Compose `environment`
entry overrides the `false` inherited from the stage env file). `ref` is never
touched. The infra branch is `dachrisch/servyy-container`
`agent-stage-phase2-cand-env` and is applied by the coordinator, not the agent:

```bash
./servyy-test.sh --tags ls.agent.stage \
  -e '{"ls_agent_stage_cand_env": {"SCORECARD_EVENT_FEED": "true"}}'
```

After confirming both baked SHAs via `/health/version/`, run the same
`runner.py` command as the flag-OFF report with the two tunnel URLs. The stage
is a prod clone with no event-sourced games, so the event path is exercised by
the `v2-events-write`, `v1-shadow-write` and `reconciliation-flag` scenarios.
Restore the flag-off baseline before any later flag-OFF run:

```bash
./servyy-test.sh --tags ls.agent.stage -e '{"ls_agent_stage_cand_env": {}}'
```

See [the Phase 2 flag-on report](../../../docs/topics/planning/current/2026-11-25-phase2-flag-on-report.md)
for the recorded result.

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

Scenario diffs use the same file with `<scenario>:<step>` keys, e.g.
`{"v1-shadow-write:read-feed": ["$.events[]"]}`. Matching diffs are reported
separately as intended; anything else is unexplained and fails the run. The
revalidation probes assert the 200↔304 contract; literal ETag values stay
normalised noise. Each revalidation probe resolves its **own** expanded source
(`base#category:id`), and a probe that never receives a 304 is listed in the
report instead of silently passing. Liveticker reads are scoped with
`?gameday={gameday_id}` so scenario-created games reach the projection path.
The `reconciliation-flag` scenario writes a real sequence-0 penalty before its
delete, and the harness asserts `409 {"needs_reconciliation": true}` on both
sides — a delete that names no row is a no-op, not evidence of the flag path.

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
