# Architecture Remediation Roadmap (agreed, 2026-11-25)

> **Status:** agreed. No phase beyond Phase 0 is refined yet.
> **Baseline:** `master` at `387fad15f` for the review; counts and corrections from `d53e6d848`.
> **Detailed next step:** [Phase 0 implementation plan](./2026-11-25-phase0-plan.md).

## 1. Why this roadmap exists

A full architecture review (SOLID, maintainability, future readiness) found a codebase with strong delivery discipline but structural debt that now makes cross-cutting work expensive. The five issues below are ranked by **blast radius × urgency**, not by how bad the code looks. Everything is evidenced with file paths; line numbers are from the review commit and may drift.

| # | Issue | Evidence | Why this rank |
|---|---|---|---|
| 1 | Core → consumer coupling | 15 non-test files, ~39 import statements in `gamedays`: `league_table` 17, `gameevents` 8, `gameday_designer` 4, `officials` 4, `passcheck` 3, `liveticker` 3 | Root cause of shotgun changes; `league_table` is the dominant edge. Two schema-level FKs also cross the boundary. |
| 2 | Unfinished event-store strangler | `SCORECARD_EVENT_FEED` off by default, two write paths, 6,369 legacy games skipped by reconciliation | Correctness risk with a live roadmap; needs decisions plus infra work, not just code. |
| 3 | Orchestration god-modules | `gamedays/views.py` 1,054 l, `officials/views.py` 1,039 l, `scorecard_v2/.../Tracking.tsx` 2,694 l, `GameSetup.tsx` 1,554 l, `GameTable.tsx` 1,014 l | Highest regression cost per change; blocks per-league configurability. |
| 4 | Frontend duplication / split generations | 5 HTTP clients, 4 error models, `token` written 6× vs `authToken` 1×, 3 byte-identical `trackEvent.ts` copies + 1 variant, no npm workspaces, scorecard v1/v2 and liveticker v1/v2 share no code | Every client/auth fix is repeated 5–7 times; packaging decision gates the phase. |
| 5 | Standards not executable | `black --check .` fails on 171 files, query assertions unevenly adopted, 6 ADR files with a numbering gap and 4 without Status, overview still says Locust / Django 5.2+ | Without gates, issues 1–4 regress after refactoring. |

The project explicitly claims SOLID/DRY in `docs/topics/guides/coding-standards.md:5-9`; the gap between that claim and enforcement is the central finding.

## 2. Phase sequence

Order is **0a → 0c → 0b → 1 … 5**. The guardrails (0a) and the equivalence harness (0c) must exist before the reformat (0b) and every refactor phase. 0b is the harness's first real end-to-end proof and must produce zero diffs.

| Issue | Phase | Goal / scope | Depends on | Rough size | Exit criteria / guardrail | Decisions (all agreed — §4) | Risk & rollback |
|---|---|---|---|---|---|---|---|
| [#2536](https://github.com/dachrisch/leaguesphere/issues/2536) | **0a** Boundary guardrail | In: stdlib import-boundary check over `gamedays`, generated allowlist from current state, CI wiring, scope mapping, root `AGENTS.md`. Out: behaviour changes, inversion work. | none | S (~1 week) | Check green in `scope_coverage`; `python3 scripts/check_scope_coverage.py` passes; no new back-edge can merge silently | 1, 6 | False positives → allowlist entries tagged for Phase 1; rollback = disable the CI step. |
| [#2536](https://github.com/dachrisch/leaguesphere/issues/2536) | **0c** Behaviour equivalence | In: probe manifest, normalisers, JSON/HTML diff, write scenarios with run-id entities, noise-floor self-test, redacted PR report; long-lived agent stage and infra PR. Out: prod/public stage, DB over tunnel, real prod accounts. | infra PR applied on servyy-test first | M (repo S–M, infra M) | Ref-vs-ref noise floor = zero; 0b produces zero diffs; reports posted on the stack PRs; agent stage kept until Phase 5 | 12–16 | Nondeterminism → normalisers + noise floor; tunnel exposure → basic auth + long-lived credential; rollback = stop using the runner (no app change). |
| [#2536](https://github.com/dachrisch/leaguesphere/issues/2536) | **0b** Formatting baseline | In: one mechanical `black` reformat of 171 files, `.git-blame-ignore-revs`, `black --check .` gate, `AGENTS.md`. Starts only when there are **no non-draft PRs open other than this stack's**. | 0a, 0c, open-PR gate | S–M | Gate green **and** equivalence report clean (zero diffs) | 6, 12, 13 | Collides with stacked PRs → quiet window, no non-draft PRs, merge commit for 0b; rollback = revert gate, keep formatting commit. |
| [#2537](https://github.com/dachrisch/leaguesphere/issues/2537) | **1** Invert coupling | `gamedays` owns hooks/registries; the five forbidden imports are gone; the two FKs are documented. Out: schema migrations, UX, `gameevents` path. Detailed plan: [Phase 1 implementation plan](./2026-11-25-phase1-plan.md). | 0a, 0c | L (3–4 w) | Those exits **+ equivalence report clean** | 1, 2 | Scheduler mis-resolution → characterization tests; rollback = per-commit revert (no runtime kill switch). |
| [#2538](https://github.com/dachrisch/leaguesphere/issues/2538) | **2** Event-store cutover | ADR with the user as owner; events truth for v2; 6,369 legacy games left legacy and documented; no shadow writes. Env rollout is Ansible in the separate `container` repo, test env first. | 0c | M (2–4 w) | Those exits **+ equivalence report clean** | 3, 4, 5 | Destructive backfill is out of scope by decision; rollback = flag off, legacy path retained. |
| [#2539](https://github.com/dachrisch/leaguesphere/issues/2539) | **3** Split modules | Orchestration-only extraction of the named backend views and frontend screens. Out: visual redesign, new features. | 1 | L (4–6 w) | No orchestration source file above ~900 lines in the named modules; behaviour preserved; **equivalence report clean** | 7 | UI drift → characterization tests, one slice per commit; rollback = per-commit revert. |
| [#2540](https://github.com/dachrisch/leaguesphere/issues/2540) | **4** Shared frontend client | Packaging spike → `file:` dependency; one typed client, error model and auth contract (`token` canonical); incremental app migration. Out: merging v1/v2 generations. | 0c | M–L (size depends on spike) | One client / error type / token key; legacy clients deleted after soak; **equivalence report clean** | 8, 9 | Auth breakage → dual-read and staged migration; rollback = old client behind a one-line switch. |
| [#2541](https://github.com/dachrisch/leaguesphere/issues/2541) | **5** Enforcement & docs | Query-assertion gate (global 4 weeks after it lands), docs/ADR refresh, one-command verify per app, GHA audit removing only dead workflows. Formatting stays in 0b. | 0b | S–M (1–2 w) | Gates green; docs match code; no dead workflows after audit; **equivalence report clean** | 10, 11 | Query-gate noise → start diff-scoped; rollback = widen/soften gate. |

**Phase 1 target directions:** `gameevents` is **allowed**, with the boundary wording: *gameevents may write gamedays projection tables through a defined projector boundary; gamedays → gameevents is limited to the append/read service API* (`gameevents/service/append.py:295,416,443,450` create/save `TeamLog`/`Gameinfo`; `reconcile.py:361,409` delete/create `TeamLog`). `league_table`, `gameday_designer`, `officials`, `passcheck`, `liveticker` are **forbidden from `gamedays`**; their inbound direction stays allowed. Import inversion does not remove schema FKs — `Gameinfo.league_group → "league_table.LeagueGroup"` (`gamedays/models.py:212-214`) and `GameOfficial.official → "officials.Official"` (`gamedays/models.py:267-271`) are string references, kept and documented by decision.

**Migration caveat:** the shared-DB equivalence model cannot be used for a phase that changes the schema. Refactor phases are expected not to need migrations; if one does, its detailed plan must provision a second DB copy.

## 3. Equivalence step (0c) — summary

A single long-lived **agent stage** on `servyy-test.lxd`, deployed once via `./servyy-test.sh --tags ls.app.stage` (prod clone via `ls_db_sync`). It is routed to the agents through opentunnel and has dedicated throwaway role accounts. There is **no reset between runs and no per-run secret handoff**. One DB is shared by two app containers: `ref`, pinned to the master image the phase starts from (no watchtower label), and `cand`, running the stack head. Both sit behind one basic-auth proxy; the long-lived credential lives in the infra repo's git-crypt secrets and is supplied in each session's brief.

- **Read probes** hit `ref` and `cand` on the same data and diff structurally (JSON) and as normalised text (HTML). Normalisers cover CSRF tokens, timestamps, asset hashes, ETags, session bits and run-id entity IDs.
- **Write scenarios** (finalise game → scheduler signal progression, designer publish, officials signup) create fresh run-id-tagged entities on both sides, then re-read and diff. IDs are normalised.
- **Noise-floor self-test:** ref vs ref must produce zero diffs; no report is trusted before that passes.
- **Probe sample** is coverage-based: at least one gameday per schedule type (designer template, canvas-published, legacy JSON), with and without officials, finished and upcoming, plus league tables for those leagues/seasons.
- **Report:** markdown posted to the stack PRs with counts, every diff, and intended diffs declared separately. Redaction: paths, field names and counts only — no values, emails or names (PRs are public).
- **Update path:** `cand` uses `leaguesphere/backend:agent-candidate` with `com.centurylinklabs.watchtower.scope=dev` (watchtower-dev polls every 300 s and is health-gated); `ref` has no watchtower label. A session triggers the build via `gh workflow run` and waits for `/health/version/` to show the new SHA.
- **Nightly sync:** `ls_db_sync` installs a user systemd timer `ls-db-sync-nightly.timer` at 02:00, and `servyy-test.lxd` has `services_enabled.leaguesphere: true`, so the role runs there. The infra PR keeps that timer **off on servyy-test** (preferred) and the runbook documents how to verify it, because a nightly re-clone would delete the agent accounts.
- OpenTunnel facts: hostname is public in Certificate Transparency logs; route names are private but are **not authentication**; TLS terminates on servyy-test and the relay routes by SNI. Hence basic auth in front of both apps; HTTP-only probing; no DB access over the tunnel.

## 4. User decisions (agreed, do not reopen)

1. Dependency directions approved as proposed; `league_table` first.
2. Keep and document the two FKs (`league_group`, `official`); no schema migration in Phase 1.
3. Event-store owner: the user (sole maintainer); name them as owner in the ADR.
4. Events are truth for v2 games.
5. The 6,369 legacy games stay on the legacy read path — **no backfill**; Phase 2 exit is "zero unreconciled v2 games; legacy set explicitly accepted and documented".
6. Reformat window: after the open PR(s) land, at a quiet point.
7. Phase 3: orchestration-only.
8. Phase 4: spike first, then a `file:` dependency; packaging decision recorded.
9. Canonical token key: `token`.
10. Query-assertion gate: global four weeks after it lands (diff-scoped until then).
11. GHA audit: remove only dead workflows; dco, reuse, release-please* and deploy stay, as do the three required CircleCI checks (`full_gate`, `scope_coverage`, `check_version_sequence` per `docs/topics/deployment/scoped-ci.md:62-64`).
12. Agent stage is long-lived: one restore, one credential, no per-run spin-up/teardown; keep it until Phase 5.
13. Probe users are dedicated harness accounts with throwaway passwords in git-crypt secrets; never real prod accounts; reports redacted.
14. 0b's open-PR gate ignores draft PRs and this stack's own PRs: "no non-draft PRs open other than this stack's".
15. Verify `watchtower-dev` on servyy-test during infra review (defined in `portainer/docker-compose.yml:87`, scope `dev`); Ofelia timer is the fallback.
16. `agent-candidate` is a `workflow_dispatch` target in `.github/workflows/deploy.yaml`.
17. Nightly sync: keep `ls-db-sync-nightly.timer` off on servyy-test; document verification in the runbook (recreating accounts after each sync was rejected).
18. Infra PRs go to GitHub `dachrisch/servyy-container`; the local codey checkout is behind `origin/master` and must be fetched. The user applies Ansible on servyy-test; codey authors the PR/runbook only and does not attempt host-level work.

## 5. Delivery workflow for every phase

1. **Refine.** A detailed plan for the phase, agreed between the implementing agent, the coordinating agent and the user, saved under `docs/topics/planning/current/`. This document and the Phase 0 plan are the model.
2. **Implement.** A **new** opencode session executes the agreed plan in a worktree as a `gh stack` of small PRs (one PR per task group). Non-interactive setup: `git config rerere.enabled true`, `git config remote.pushDefault origin`, `gh stack init --base master <layers…>`, `gh stack add <layer>`, signed conventional commits, `gh stack submit --auto --open` — PRs are **ready for review, never drafts**. Use `gh stack view --json` for status (never the TUI). CI must be green and an equivalence report with zero unexplained diffs must be posted on every PR. The agent **never merges**; the user merges bottom-up. Phase 0b's PR must be merged with a **merge commit** so the blame-ignore hash remains valid. Note: `master` belongs to multiple stacks locally, so a non-trunk branch must be checked out before `gh stack` commands.
3. **Next phase.** Only after the user merges does the next phase get refined.
