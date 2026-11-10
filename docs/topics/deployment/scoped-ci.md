# Scoped CI (CircleCI dynamic config)

The CircleCI pipeline is **path-scoped**: each push only *works on* the
test jobs affected by the changed paths. Every job is still scheduled, so
every status context reports. Setup is split into two files driven by the
`circleci/path-filtering` orb:

| File | Role |
|---|---|
| `.circleci/config.yml` | Setup config (`setup: true`). Declares pipeline parameters and runs `path-filtering/filter` to diff against `master` and continue the pipeline. |
| `.circleci/continue.yml` | The real pipeline: fanned-out test shards, image builds, deploy/promote chain. |
| `.circleci/scope-mapping.txt` | **Single source of truth** for path → job rules (`<regex> <pipeline-parameter> <value>`, anchor-anchored, per-line). |
| `.circleci/scope-exclude.txt` | Tracked paths that need no CI job (docs, manual scripts, agent metadata). |
| `scripts/check_scope_coverage.py` | Always-on safety net job (`scope_coverage`): fails the pipeline if any git-tracked file matches neither mapping nor exclude file. |
| `scripts/check_ci_gate.py` | Always-on guard (`scope_coverage`): no job may be path-gated by a `filters:` expression, and `full_gate` must fan in every job that runs on tags. |

## Workflow

1. Every push runs the `scope` setup workflow in `config.yml`.
2. The orb diffs the change against `master` and maps changed paths to
   boolean pipeline parameters (`run-python-core`, `run-scorecard`, …).
3. The pipeline continues with `continue.yml`, where each scoped job is
   always *scheduled* and receives its parameter as the `needed` job
   parameter. Only the work is skipped, never the job itself.
4. **A job switched off with a `filters:` expression publishes no status
   at all**, which is why scoping uses `needed` instead: the job still
   runs (in seconds) and reports a green context, so the ruleset can
   require a check that means "everything this diff scoped in passed".
   The `scoped_job` command wraps a scoped job's real steps and replaces
   them with a no-op when `needed` is false — a no-op that **fails** when
   it finds `$CIRCLE_TAG`, because a release must never skip work.
   `scripts/check_ci_gate.py` (always-on, in `scope_coverage`) rejects a
   `filters:` expression, a `needed:` entry whose job lacks the matching
   boolean parameter, and any job that runs on tags without being fanned
   into `full_gate`.
5. **Tests gate deploys, not builds.** `full_gate` fans in every scheduled
   job (shards, JS suites, the three `e2e_*` browser suites, both image
   tests, the builds, the compose boot) and the deploy jobs require it, so
   a release only ships
   when the complete matrix of a full run is green. Because nothing in
   that matrix is filtered out, `full_gate` runs on branch pipelines too,
   where it is the **required** context: there it is green only when every
   suite the diff scoped in is green, so a red `scorecard_js` blocks the
   merge instead of surfacing on the next release PR
   ([#2353](https://github.com/dachrisch/leaguesphere/pull/2353) →
   [#2356](https://github.com/dachrisch/leaguesphere/pull/2356)). On tag
   pipelines the scope resolves to a full run (version files match the
   shared and per-app rules), so every job does its real work.

### Guarantees

- **Tags fail open to full run**: a release tag on master's tip has no
  diff (the orb falls back to HEAD~1); release tags touch version files
  across every app → full run. A stale/large diff also resolves to a
  full run, and `check_release_sequence` refuses stale deploys.
- **Docs-only pushes** run only the always-on jobs — `scope_coverage`,
  `check_version_sequence`, `check_migrations`, the three `e2e_*` browser
  suites, plus every scoped
  job in its no-op form (`scoped_job` with `needed: false`, which prints
  one line and passes). They report in seconds; nothing is tested, no
  image is built and nothing is booted.
- **Required checks always report.** The ruleset requires exactly the
  contexts that are created on every branch push: `full_gate`,
  `scope_coverage` and `check_version_sequence`.
  - `full_gate` is the terminal context of the matrix. Every job it fans
    in is always scheduled (no-ops included), so it exists on every push
    and is green only when every suite the diff scoped in passed. It also
    gates the deploys, so the `e2e_*` suites, `check_migrations`,
    `test_compose_network` and the image tests are covered through it
    rather than required one by one.
  - `scope_coverage` and `check_version_sequence` are unconditional jobs
    that run only on branches; they are PR-time guards, so they are
    deliberately not part of the deploy matrix and are required on their
    own.
  - The `e2e_*` jobs and `check_migrations` are unconditional jobs.
    `check_migrations` runs the checkout itself against an ephemeral
    MariaDB (`cimg/mysql` sidecar) instead of the backend image, so making
    it always-on drags no image build behind it.
  - The browser suites are split per app (`e2e_scorecard`,
    `e2e_scorecard_v2`, `e2e_designer`) so they run in parallel: one job
    that ran all three back to back was 80% of a PR run's wall clock.
    They do not gate the image smoke tests — e2e reaches the deploy
    through `full_gate`, and a 35s docker check must not wait for a
    browser suite.
  - `test_compose_network` needs both images, so it is scheduled always
    but boots only when `run-images` is true. When it is false the job
    prints "nothing to boot" and passes; on a tag pipeline it **fails**
    instead, so a release can never be green on a no-op.
- **CI config changes itself** trigger everything (`\.circleci/.*` → all
  parameters true).
- No path can be silently uncovered: `scripts/check_scope_coverage.py`
  (TDD-tested) enforces every tracked file matches a rule, and
  `scripts/check_ci_gate.py` (TDD-tested, always-on) enforces that no
  scoped job can be filtered out and that `full_gate` stays complete.


### Test shards

| Shard | Pytest paths (local equivalent) |
|---|---|
| `python-core` | `uv run pytest league_manager/tests/ share/tests/ home/tests/ -n 4` |
| `python-gamedays` | `uv run pytest gamedays/ league_table/ gameevents/ -n 4` |
| `python-officials` | `uv run pytest officials/tests/ teammanager/ -n 4` (accounts is a test stub; its scope only opens the shard) |
| `python-live` | `uv run pytest liveticker/tests/ scorecard/tests.py scorecard_v2/tests/ -n 4` |
| `python-designer` | `uv run pytest passcheck/tests/ gameday_designer/tests/ journey/tests.py journey/api/tests/ matchreport/tests/ -n 4` |
| `python-cross` | `uv run pytest tests/ scripts/tests/ -n 4` |

Shards need the LXC test DB locally (see Contributor Guide) and get a
sidecar MySQL service + `-n 4 --nomigrations` in CI. e2e dirs stay
excluded from shards via `pytest.ini` and run only in the `e2e_*` jobs.

### Coverage uploads and carryforward

Each shard and frontend job uploads its own Codecov flag (`python-core`,
`scorecard`, …). Because a scoped run legitimately skips shards, the
skipped flags get no fresh report on that commit. `.codecov.yml` enables
`flag_management.default_rules.carryforward: true` so Codecov reuses each
flag's last known coverage instead of dropping its files from the project
comparison — without it, a single-app PR falsely fails `codecov/project`
with a large apparent drop (issue #2015). Adding a new shard/flag needs
no Codecov change; `scripts/check_codecov_flags.py` fails if any CI flag
is not carryforward-enabled, and runs as an always-on step of the
`scope_coverage` job (plus its unit test in the `python-cross` shard).

### Adding/changing a scope rule

1. Edit `.circleci/scope-mapping.txt` (jobs) or `.circleci/scope-exclude.txt` (ignores).
   Both files follow orb format: blank lines and `#` comments are
   skipped, regexes are anchored `^...$`.
2. If adding a new scoped job: declare the pipeline parameter in
   `.circleci/continue.yml` (`parameters:`), give the job a boolean
   `needed` parameter (default `true`), wrap its steps in the
   `scoped_job` command with
   `needed: << parameters.needed >>`, invoke it from the workflow with
   `needed: << pipeline.parameters.<name> >>` and `filters: tags: only: /.*/`,
   and add it to `full_gate.requires`. Do **not** gate a job with
   `filters: "(pipeline.parameters.<name> == true)"`: a filtered-out job
   reports no status (job-level `when` is not valid in config version
   2.1 either).
3. Run `python3 scripts/check_scope_coverage.py` (0 uncovered files) and
   `python3 scripts/check_ci_gate.py` (every scoped job reports and feeds
   the gate) — both have a TDD layer in `scripts/tests/`, run via pytest.
4. Validate both configs: `circleci config validate .circleci/{config,continue}.yml`.
   `circleci config process .circleci/continue.yml` expands the jobs; run
   it on a copy outside the repo if the CLI cannot resolve the org.

**Prerequisite (one-time, project settings):** "Enable dynamic config
using setup workflows" must be enabled for the CircleCI project.
