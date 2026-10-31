#!/usr/bin/env python3
"""Turn the collect.py cache into the analysis JSON used by render.py.

Usage:
    python3 analyze.py [--cache-dir DIR] [--out FILE]

Produces analysis.json:
    jobs        – per-job mean / std / p25 / p75 / n (tag + master runs)
    releases    – per tag pipeline: blue / purple / green seconds + timestamps
    pr_jobs     – per-job mean / std / n over successful PR runs
    meta        – counts, date range, median PR wall-clock

Definitions
    blue   = PR merged -> tag pushed  (tag's commit SHA matched to the earliest
             master-branch pipeline; PR-merge time is that pipeline's created_at)
    purple = tag pushed -> first CI job (tag pipeline created_at -> earliest job started_at)
    green  = first CI job -> pipeline green (earliest started_at -> latest stopped_at)
"""
import argparse
import json
import os
import statistics
from collections import defaultdict
from datetime import datetime


# Job dependency graph for the PR/branch workflow (from .circleci/continue.yml).
# Only jobs that gate other jobs need an entry; every other job starts at t0.
DEPS = {
    "test_backend_image": ["build_backend", "e2e"],
    "test_frontend_image": ["build_frontend", "e2e"],
    "test_compose_network": ["build_backend", "build_frontend", "check_migrations"],
    "full_gate": ["python-core", "python-gamedays", "python-officials", "python-live",
                  "python-designer", "python-cross", "scorecard_js", "scorecard_v2_js",
                  "liveticker_js", "passcheck_js", "gameday_designer_js",
                  "journey_dashboard_js", "share_js", "e2e", "check_migrations",
                  "build_backend", "build_frontend", "test_backend_image",
                  "test_frontend_image", "test_compose_network"],
}

# Human labels for critical-path phases (grouped; unknown jobs keep their name).
JOB_LABELS = {
    "e2e": "e2e browser suite",
    "test_backend_image": "image smoke test",
    "test_frontend_image": "image smoke test",
    "test_compose_network": "compose network",
    "check_migrations": "migrations check",
    "build_backend": "image build",
    "build_frontend": "image build",
    "full_gate": "full gate",
}


def parse(dt: str) -> datetime:
    return datetime.fromisoformat(dt.replace("Z", "+00:00"))


def load(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


def fmt(sec):
    sec = max(0, round(sec))
    m, s = divmod(sec, 60)
    return f"{m}m {s:02d}s" if m else f"{s}s"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache-dir", default=os.path.join(os.path.dirname(__file__), "..", ".cache"))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    cache = args.cache_dir
    out = args.out or os.path.join(cache, "analysis.json")

    pipes = load(os.path.join(cache, "pipelines.json"), [])
    wf = load(os.path.join(cache, "workflows.json"), {})
    jb = load(os.path.join(cache, "jobs.json"), {})

    by_num = {p["number"]: p for p in pipes}

    def is_pr(p):
        v = p.get("vcs") or {}
        return bool(v.get("branch")) and not v.get("tag") and v.get("branch") != "master"

    def main_workflow(p):
        ws = wf.get(p["id"]) or []
        m = next((w for w in ws if w.get("name") == "build_test_deploy"), None)
        return m or (ws[0] if ws else None)

    def exec_jobs(w):
        if not w:
            return []
        return [j for j in jb.get(w["id"], [])
                if j.get("status") == "success"
                and j.get("type") != "approval"
                and j.get("started_at") and j.get("stopped_at")]

    # ---- job stats over tag + master successful runs -----------------
    agg = defaultdict(list)
    for p in pipes:
        v = p.get("vcs") or {}
        if not (v.get("tag") or v.get("branch") == "master"):
            continue
        w = main_workflow(p)
        if not w or w.get("status") != "success":
            continue
        for j in exec_jobs(w):
            agg[j["name"]].append((parse(j["stopped_at"]) - parse(j["started_at"])).total_seconds())
    jobs = []
    for name, ds in agg.items():
        if len(ds) < 2:
            continue
        q = statistics.quantiles(ds, n=4) if len(ds) >= 4 else [min(ds), statistics.median(ds), max(ds)]
        jobs.append({"job": name, "n": len(ds), "mean": statistics.mean(ds),
                     "std": statistics.pstdev(ds), "min": min(ds), "max": max(ds),
                     "p25": q[0], "p75": q[2]})
    jobs.sort(key=lambda r: -r["mean"])

    # ---- release phases ----------------------------------------------
    rev_master = {}
    for p in pipes:
        v = p.get("vcs") or {}
        if v.get("branch") == "master" and not v.get("tag") and v.get("revision"):
            t = parse(p["created_at"])
            if v["revision"] not in rev_master or t < rev_master[v["revision"]]:
                rev_master[v["revision"]] = t

    releases = []
    for p in pipes:
        v = p.get("vcs") or {}
        if not v.get("tag"):
            continue
        w = main_workflow(p)
        if not w or w.get("status") != "success":
            continue
        js = exec_jobs(w)
        if not js:
            continue
        tagpush = parse(p["created_at"])
        first_ci = min(parse(j["started_at"]) for j in js)
        green = max(parse(j["stopped_at"]) for j in js)
        merge = rev_master.get(v.get("revision"))
        blue = (tagpush - merge).total_seconds() if merge else None
        if blue is not None and blue < 0:
            blue = None
        releases.append({
            "pipeline": p["number"], "tag": v["tag"], "tagpush": p["created_at"],
            "blue": blue, "purple": (first_ci - tagpush).total_seconds(),
            "greenp": (green - first_ci).total_seconds(),
        })
    releases.sort(key=lambda r: r["tagpush"])

    # ---- PR run stats (per-job means + wall clock) ------------------
    pr_agg = defaultdict(list)
    pr_wall = []
    for p in pipes:
        if not is_pr(p):
            continue
        w = main_workflow(p)
        if not w or w.get("status") != "success":
            continue
        try:
            pr_wall.append((parse(w["stopped_at"]) - parse(w["created_at"])).total_seconds())
        except Exception:
            pass
        for j in exec_jobs(w):
            pr_agg[j["name"]].append((parse(j["stopped_at"]) - parse(j["started_at"])).total_seconds())
    pr_jobs = []
    for name, ds in pr_agg.items():
        if len(ds) < 3:
            continue
        pr_jobs.append({"job": name, "n": len(ds), "mean": statistics.mean(ds),
                        "std": statistics.pstdev(ds)})
    pr_jobs.sort(key=lambda r: -r["mean"])

    # ---- typical PR run: critical-path wall-clock breakdown --------
    # For each successful PR run, walk the dependency DAG backwards from the
    # last-finishing job, following the latest-finishing dependency. The chain
    # durations + scheduling gaps + startup equal that run's wall-clock.
    runs = []
    for p in pipes:
        if not is_pr(p):
            continue
        w = main_workflow(p)
        if not w or w.get("status") != "success":
            continue
        jmap = {j["name"]: (parse(j["started_at"]), parse(j["stopped_at"]))
                for j in exec_jobs(w)}
        if not jmap:
            continue
        first = min(s for s, _ in jmap.values())
        last = max(e for _, e in jmap.values())
        end_job = max(jmap.items(), key=lambda kv: kv[1][1])[0]
        chain, cur = [], end_job
        while cur:
            chain.append(cur)
            deps = [d for d in DEPS.get(cur, []) if d in jmap]
            cur = max(deps, key=lambda d: jmap[d][1]) if deps else None
        chain.reverse()
        segs, order = {}, []
        for name in chain:
            s, e = jmap[name]
            label = JOB_LABELS.get(name, name)
            segs[label] = segs.get(label, 0) + (e - s).total_seconds()
            if label not in order:
                order.append(label)
        gap = sum(max(0.0, (jmap[chain[i + 1]][0] - jmap[chain[i]][1]).total_seconds())
                  for i in range(len(chain) - 1))
        lead = max(0.0, (jmap[chain[0]][0] - first).total_seconds())
        runs.append({"pipeline": p["number"], "wall": (last - first).total_seconds(),
                     "chain": chain, "segs": segs, "order": order, "queue": gap + lead})

    if runs:
        walls = [r["wall"] for r in runs]
        med = statistics.median(walls)
        rep = min(runs, key=lambda r: abs(r["wall"] - med))
        seg_list = [{"label": lbl, "seconds": rep["segs"][lbl]} for lbl in rep["order"]]
        if rep["queue"] > 0.5:
            seg_list.append({"label": "queue / scheduling", "seconds": rep["queue"]})
        pr_critical = {
            "pipeline": rep["pipeline"], "wall": rep["wall"],
            "segments": seg_list, "chain": rep["chain"],
            "median_wall": med, "mean_wall": statistics.mean(walls),
            "n_runs": len(runs),
            "n_with_gate": sum(1 for r in runs if "full_gate" in r["chain"]),
        }
    else:
        pr_critical = None

    dates = sorted(p["created_at"][:10] for p in pipes)
    meta = {
        "project": "gh/dachrisch/leaguesphere",
        "pipelines": len(pipes),
        "date_from": dates[0] if dates else None,
        "date_to": dates[-1] if dates else None,
        "n_releases": len(releases),
        "n_pr_runs": len(pr_wall),
        "pr_wall_median": statistics.median(pr_wall) if pr_wall else 0,
        "n_jobs": len(agg),
    }
    data = {"meta": meta, "jobs": jobs, "releases": releases,
            "pr_jobs": pr_jobs, "pr_critical": pr_critical}
    with open(out, "w") as f:
        json.dump(data, f, indent=2)
    print(f"wrote {out}: jobs={len(jobs)} releases={len(releases)} pr_jobs={len(pr_jobs)} "
          f"pr_runs={meta['n_pr_runs']} pr_wall_med={fmt(meta['pr_wall_median'])}")


if __name__ == "__main__":
    main()
