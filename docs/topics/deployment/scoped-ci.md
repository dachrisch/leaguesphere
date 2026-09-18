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
4. `e2e` runs standalone in parallel with the shards and the image
   builds (it needs neither image); it gates `test_backend_image` and
   `test_frontend_image` instead. `build_backend` and `build_frontend`
   share `test_compose_network`'s exact filter (not just their own
   narrower one), since a `requires` entry silently drops out when its
   own filter is false — with independent filters, a partial-scope
   pipeline could schedule `test_compose_network` (which unconditionally
   loads both images) without one of them ever having been built.
   Deploys `require` `test_compose_network`, which — thanks to that
   shared filter — transitively requires both builds, both image tests,
   and `check_migrations`, covering the full scoped test matrix without
   a separately duplicated list, so tag and branch pipelines share one
   gating chain.

### Guarantees

- **Tags fail open to full run**: a release tag on master's tip has no
  diff (the orb falls back to HEAD~1); release tags touch version files
  across every app → full run. A stale/large diff also resolves to a
  full run, and `check_release_sequence` refuses stale deploys.
- **Docs-only pushes** run just the always-on jobs
  (`scope_coverage`, `check_version_sequence`) — adds ~seconds, not minutes.
- **CI config changes itself** trigger everything (`\.circleci/.*` → all
  parameters true).
- No path can be silently uncovered: `scripts/check_scope_coverage.py`
  (TDD-tested) enforces every tracked file matches a rule.

### Test shards

| Shard | Pytest paths (local equivalent) |
|---|---|
| `python-core` | `uv run pytest league_manager/tests/ -n 4` |
| `python-gamedays` | `uv run pytest gamedays/ league_table/ -n 4` |
| `python-officials` | `uv run pytest officials/tests/ -n 4` (accounts/teammanager are test stubs; their scopes only open the shard) |
| `python-live` | `uv run pytest liveticker/tests/ scorecard/tests.py -n 4` |
| `python-designer` | `uv run pytest passcheck/tests/ gameday_designer/tests/ journey/tests.py journey/api/tests/ matchreport/tests/ -n 4` |
| `python-cross` | `uv run pytest tests/ scripts/tests/ -n 4` |

Shards need the LXC test DB locally (see Contributor Guide) and get a
sidecar MySQL service + `-n 4 --nomigrations` in CI. e2e dirs stay
excluded from shards via `pytest.ini` and run only in the `e2e` job.

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
