# Phase 2 — flag-ON validation report (2026-11-26)

Part of [Phase 2](./2026-11-25-phase2-plan.md) / [#2538](https://github.com/dachrisch/leaguesphere/issues/2538).
Records the repeatable flag-ON comparison on the long-lived agent stage
(servyy-test) and its result. The flag is on for `cand` only; `ref` keeps the
programme baseline and the flag off.

## Setup

- The infra change is the `dachrisch/servyy-container` branch
  `agent-stage-phase2-cand-env` at `1d1201bf33654c122e815461b41d811e33903b12`.
  It adds `ls_agent_stage_cand_env` and renders it only into `cand`'s Compose
  `environment:` block; it asserts `is_test_host`, keeps
  `ls_agent_stage_schema_check: true`, and is **never merged**.
- Applied by the coordinator with
  `./servyy-test.sh --tags ls.agent.stage -e '{"ls_agent_stage_cand_env": {"SCORECARD_EVENT_FEED": "true"}}'`
  (exit 0). Verified inside the containers: `cand` has
  `SCORECARD_EVENT_FEED=true`, `ref` has the variable unset; both healthy.
- Flag env key used: `SCORECARD_EVENT_FEED: "true"` (cand only).

## Result

| side | baked commit | flag |
|---|---|---|
| ref | `96ec02b175a62e0e264f51771355ebf806c21797` | off (baseline) |
| cand | `ba40150b01fc9313db2ebf7a273c667a507adc3a` | on |

Run id: `phase2-l3-final-on` (the extended harness, Layer 3 head baked into
cand). The Layer 2 report was also run flag-ON at cand
`3b9f4ecbf29735b301c819b56e06c74601913e7a` with zero diffs.

- Probes compared: **31** — diffs: **0** — skipped: **0**
- Write scenarios: **9**, all clean — `designer-publish`, `finalize-game`,
  `finalize-canvas`, `finalize-legacy`, `v2-events-write`, `v1-shadow-write`,
  `reconciliation-flag`, `legacy-wizard-finalize`, `officials-signup`
- Unexplained diffs: **0**; intended diffs: **0**
- Reconciliation (Layer 2's `--all --report` on cand, flag on): 6,369 legacy
  games with rows and no events, zero drift, zero flagged v2 games, zero
  event-sourced games in the prod-clone stage data.

The stage is a prod clone with **no event-sourced games**, so the flag-ON
comparison exercises the event path through the games created by
`v2-events-write`, `v1-shadow-write` and `reconciliation-flag` on both sides,
not through restored rows. The 200↔304 revalidation contract was checked by
the new feed/liveticker probes; literal validators remain normalised noise.

The redacted reports are posted as comments on PRs #2566 and #2567. No diff
was declared intended: every path matched on both sides.

## Revert

Before any flag-OFF comparison, empty the dict and re-apply the role:

```bash
./servyy-test.sh --tags ls.agent.stage -e '{"ls_agent_stage_cand_env": {}}'
```

Then confirm `cand`'s `/health/version/` still reports the layer-head SHA and
that the flag-off probe set is unchanged. The infra branch stays unmerged.

## What this does not do

No app code and no prod/public-stage environment change. Stage/demo/prod flag
rollout is a separate, user-gated Ansible step in `dachrisch/servyy-container`;
the agent only planned and applied the servyy-test validation path.
