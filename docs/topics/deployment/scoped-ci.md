# Scoped CI (CircleCI dynamic config)

The CircleCI pipeline is **path-scoped**: each push runs only the test
jobs that are actually affected by the changed paths. Setup is split
into two files driven by the `circleci/path-filtering` orb:

| File | Role |
|---|---|
| `.circleci/config.yml` | Setup config (`setup: true`). Declares pipeline parameters and runs `path-filtering/filter` to diff against `master` and continue the pipeline. |
| `.circleci/continue.yml` | The real pipeline: fanned-out test shards, image builds, deploy/promote chain. |
| `.circleci/scope-mapping.txt` | **Single source of truth** for path → job rules (`<regex> <pipeline-parameter> <value>`, anchor-anchored, per-line). |
| `.circleci/scope-exclude.txt` | Tracked paths that need no CI job (docs, manual scripts, agent metadata). |
| `scripts/check_scope_coverage.py` | Always-on safety net job (`scope_coverage`): fails the pipeline if any git-tracked file matches neither mapping nor exclude file. |

## Workflow

1. Every push runs the `scope` setup workflow in `config.yml`.
2. The orb diffs the change against `master` and maps changed paths to
   boolean pipeline parameters (`run-python-core`, `run-scorecard`, …).
3. The pipeline continues with `continue.yml`, where each test job is
   gated by an expression filter on its parameter. Only relevant jobs run.
4. **Path-scoped jobs** are only the test shards and the JS suites: each
   has an expression filter and runs only when its parameter is true.
   **The image chain is always scheduled** — `build_backend`,
   `build_frontend` and the required `test_compose_network` decide
   *inside* the job (`needed`, from the single `run-images` parameter)
   whether to build or boot, and otherwise print a line and pass. That is
   the only way a required context can report on a diff that needs no
   image: a filtered-out job publishes no status at all.
   `test_backend_image` / `test_frontend_image` stay scoped; `e2e` is
   always-run and gates them.
5. **Tests gate deploys, not builds.** `full_gate` fans in every scoped
   job (shards, JS suites, `e2e`, both image tests, the builds, the
   compose boot) and the deploy jobs require it, so a release only ships
   when the complete matrix of a full run is green. On a branch
   `full_gate` is skipped whenever any job it fans in was skipped —
   nothing deploys there. On tag pipelines the scope resolves to a full
   run (version files match the shared and per-app rules), so every job
   `full_gate` waits for actually runs.

### Guarantees

- **Tags fail open to full run**: a release tag on master's tip has no
  diff (the orb falls back to HEAD~1); release tags touch version files
  across every app → full run. A stale/large diff also resolves to a
  full run, and `check_release_sequence` refuses stale deploys.
- **Docs-only pushes** run only the always-on jobs — `scope_coverage`,
  `check_version_sequence`, `check_migrations`, `e2e`, plus the always
  scheduled image jobs in their no-op form (`build_backend`,
  `build_frontend`, `test_compose_network`). They report in seconds; no
  image is built and nothing is booted.
- **Required checks always report.** The ruleset requires three contexts —
  `e2e`, `check_migrations`, `test_compose_network`:
  - `e2e` and `check_migrations` are unconditional jobs.
    `check_migrations` runs the checkout itself against an ephemeral
    MariaDB (`cimg/mysql` sidecar) instead of the backend image, so making
    it always-on drags no image build behind it.
  - `test_compose_network` needs both images, so it is scheduled always
    but boots only when `run-images` is true. When it is false the job
    prints "nothing to boot" and passes; on a tag pipeline it **fails**
    instead, so a release can never be green on a no-op.
- **CI config changes itself** trigger everything (`\.circleci/.*` → all
  parameters true).
- No path can be silently uncovered: `scripts/check_scope_coverage.py`
  (TDD-tested) enforces every tracked file matches a rule.

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
excluded from shards via `pytest.ini` and run only in the `e2e` job.

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
2. If adding a new pipeline parameter: declare it in
   `.circleci/continue.yml` (`parameters:`) and gate the job with an
   expression filter, e.g.
   `filters: "(pipeline.parameters.<name> == true)"` (job-level `when`
   is not valid in config version 2.1).
3. Run `python3 scripts/check_scope_coverage.py` — it must report 0
   uncovered files (and a TDD layer exists in
   `scripts/tests/test_check_scope_coverage.py`, run via pytest).
4. Validate both configs: `circleci config validate .circleci/{config,continue}.yml`.

**Prerequisite (one-time, project settings):** "Enable dynamic config
using setup workflows" must be enabled for the CircleCI project.
