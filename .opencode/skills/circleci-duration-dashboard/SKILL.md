---
name: circleci-duration-dashboard
description: Use when asked to analyze CircleCI build/test durations for this repo, to reproduce the CircleCI duration dashboard, or to report how long PR/release CI takes over time. Builds three charts (job execution times, typical PR-run critical path as wall-clock, release pipeline over time) from the real CircleCI API and renders a print-ready HTML you can push to DocStash as a PDF.
---

# CircleCI Duration Dashboard

Reproducible, data-driven dashboard of this repo's CI cost. Everything is
computed from **actual CircleCI timestamps**, never estimates.

## Output

Three charts, in this order:

1. **Job Execution Times** — one horizontal bar per job, sorted longest first.
   Bar = mean duration, error bar = ±1 standard deviation (successful runs only).
2. **Typical PR Run: Wall-Clock Breakdown** — one horizontal stacked bar. This is
   the **critical path** of the median successful PR run, so the segments
   (e2e browser suite → image smoke test → full gate, plus queue/scheduling)
   **add up to that run's elapsed wall-clock**. Parallel unit tests and image
   builds run under e2e and add nothing to the elapsed time.
3. **Release Pipeline Over Time** — one stacked vertical bar per release tag
   pipeline, chronological. Segments: PR-merged → tag-pushed (blue),
   tag-pushed → first CI job (purple), first CI job → green (green). Dashed line
   = average. Extreme outliers (> 30 min) are listed but omitted from the plot.

## Prerequisites

- A CircleCI API token in `CIRCLECI_TOKEN` (also accepts `CIRCLE_TOKEN` / `CCIPAT`).
- Python 3 with `requests` (already a repo dependency).

## Run it

```bash
export CIRCLECI_TOKEN=...            # personal API token
cd .opencode/skills/circleci-duration-dashboard
./scripts/run.sh                     # collect -> analyze -> render
# -> dashboard.html  (self-contained, print-ready)
```

Tune with env vars:

```bash
PROJECT=gh/dachrisch/leaguesphere DAYS=35 PR_SAMPLE=70 CACHE_DIR=/tmp/cc ./scripts/run.sh
```

Then render to a PDF with DocStash:
`create_pdf(content=dashboard.html)`. The dashboard is one continuous
top-to-bottom document; DocStash paginates it. Review the rendered pages with
`screenshot_document` before presenting, and fix overflow/blank-page findings.

## How the data is assembled

- **Pipelines are NOT the status.** Every record from
  `GET /project/{slug}/pipeline` has `state: "created"` regardless of outcome.
  The real status lives on the **workflow** (`GET /pipeline/{id}/workflow` →
  `status`). Filter workflows by `status == "success"`.
- **Jobs** come from `GET /workflow/{id}/job`. Duration is
  `stopped_at − started_at`; timestamps are timezone-aware ISO strings.
- **Approval gates** (`type: "approval"`, e.g. `hold_production`) are excluded
  everywhere — their duration is human waiting, not CI execution.
- **Release "blue" segment** (PR merged → tag pushed): match the tag pipeline's
  `vcs.revision` to the *earliest* `master`-branch pipeline with the same SHA;
  that pipeline's `created_at` is the merge time. Runs without a SHA match are
  omitted from Chart 3 (still counted in the total).
- **PR runs** are feature/PR-branch pipelines: a non-empty `vcs.branch` that is
  neither a tag nor `master`. Chart 2 samples the newest `PR_SAMPLE` of them;
  only successful runs with `build_test_deploy` workflows contribute.
- **Chart 2 is a critical path.** For each PR run `analyze.py` walks the
  dependency DAG in `continue.yml` backwards from the last-finishing job,
  following the latest-finishing dependency; chain durations + scheduling gaps +
  startup equal that run's wall-clock. It renders the run whose wall-clock is
  the median, so the segments add up exactly. The DAG lives in `DEPS` and the
  phase labels in `JOB_LABELS` at the top of `scripts/analyze.py` — update both
  when the workflow graph changes.

## Files

```
.opencode/skills/circleci-duration-dashboard/
  SKILL.md
  .gitignore                # ignores .cache/ and dashboard.html
  scripts/
    collect.py              # pipelines + workflows + jobs -> .cache/*.json
    analyze.py              # .cache -> analysis.json (stats + phases + PR mix)
    render.py               # analysis.json -> dashboard.html (3 SVG charts)
    run.sh                  # end-to-end wrapper
```

The cache is disposable — delete `.cache/` to refetch from CircleCI. Never
commit the token; it is read from the environment only.

## Gotchas

- CircleCI returns ~20 pipelines/page regardless of `limit`; paginate with
  `next_page_token` until the oldest record passes the date cutoff.
- The API rate limit is ~300 requests/window. `collect.py` sleeps briefly
  between pages and caches per-workflow/per-job responses, so re-runs are cheap.
- A tag pipeline and its merge pipeline share a commit SHA — that is what makes
  the PR→tag segment measurable without the GitHub API.
- Release durations have long tail outliers (approval waits, manual holds).
  Chart 3 caps the plot at 30 min and lists the omitted runs; the KPI cards
  report both mean and median so the tail does not hide the typical case.
- Charts are hand-authored inline SVG (PDFs run no JavaScript). Keep the SVG
  `viewBox` compact — a tall SVG that exceeds one printed page will force a
  page break and leave blank space.
