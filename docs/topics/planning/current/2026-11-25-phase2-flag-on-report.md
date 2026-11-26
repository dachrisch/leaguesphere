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
| cand | `dbd055e6be01b5c543dc6eb4e5edb5d974187468` | on |

Run id: **`phase2-l4-on`** — the extended harness with the **Layer 4** head
baked into cand. This is the record of this layer's flag-ON comparison. Earlier
runs are separate: Layer 3 at cand `ba40150b01fc9313db2ebf7a273c667a507adc3a`
(`phase2-l3-final-on`) and Layer 2 at
`3b9f4ecbf29735b301c819b56e06c74601913e7a`, both posted on their own PRs.

- Probes compared: **31** — diffs: **0** — skipped: **0**
- Write scenarios: **9** — `designer-publish`, `finalize-game`,
  `finalize-canvas`, `finalize-legacy`, `v2-events-write`, `v1-shadow-write`,
  `reconciliation-flag`, `legacy-wizard-finalize`, `officials-signup`. The
  trustworthy signal is **Unexplained diffs: 0**; the per-scenario status line
  in that earlier run always printed "clean" because it used an exact key
  lookup on scenario diffs keyed `<scenario>:<step>` (fixed in #2567).
- Unexplained diffs: **0**; intended diffs: **0**
- Reconciliation (Layer 2's `--all --report` on cand, flag on): 6,369 accepted
  legacy games (the stage had no shadow-only games), zero `v2_drift`, zero
  `v2_flagged`, zero event-sourced games in the prod-clone stage data.

**Flag-OFF rerun after the revert.** After emptying `ls_agent_stage_cand_env`
the coordinator reran the same 31 probes and 9 scenarios: 0 diffs, 0 skipped,
0 unexplained diffs, with ref and cand both reporting
`dbd055e6be01b5c543dc6eb4e5edb5d974187468`. The redacted report is posted on
PR #2568. This confirms the flag override was the only difference.

The stage is a prod clone with **no event-sourced games**, so this flag-ON
comparison can only exercise the event path through games created by
`v2-events-write`, `v1-shadow-write` and `reconciliation-flag`, not through
restored rows. In the recorded L4 run the scenario liveticker reads were not
scoped to the scenario gameday and the reconciliation delete named a sequence
no row had, so this run alone does **not** prove that the flag-gated projection
branch ran; #2567 fixes both and the gate for Layers 5/6 is the gameday
rehearsal on the agent stage, not a prod soak.

The harness compared the **statuses** of the feed/liveticker revalidation
probes (200↔304) and normalised literal validators as noise; it did not assert
a literal 304 for each sample in this run, and plan §6 step 2 (confirm cand's
liveticker ETag includes the projection) and a separate ref-vs-ref noise floor
are **not recorded here**. The #2567 harness changes now resolve each probe's
own `#category:id` validator and report a revalidation that never gets a 304;
those numbers must be captured in the rehearsal report, not inferred from this
one.

The earlier redacted reports are posted as comments on PRs #2566 and #2567;
the L4 flag-ON and flag-OFF reports are posted on PR #2568. No diff was
declared intended: every path matched on both sides.

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
