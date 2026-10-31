#!/usr/bin/env python3
"""Collect CircleCI pipeline / workflow / job data into a local JSON cache.

Usage:
    export CIRCLECI_TOKEN=...
    python3 collect.py [--project gh/org/repo] [--days 35] [--pr-sample 70] [--cache-dir DIR]

Writes into the cache dir:
    pipelines.json   – raw pipeline records (newest first)
    workflows.json   – {pipeline_id: [workflow, ...]}
    jobs.json        – {workflow_id: [job, ...]}

Only tag pipelines, master pipelines and a sample of PR/feature-branch
pipelines are expanded into workflows/jobs; the rest are kept for metadata.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

BASE = "https://circleci.com/api/v2"
MAX_PAGES = 200


def parse(dt: str) -> datetime:
    return datetime.fromisoformat(dt.replace("Z", "+00:00"))


def token() -> str:
    for key in ("CIRCLECI_TOKEN", "CIRCLE_TOKEN", "CCIPAT"):
        if os.environ.get(key):
            return os.environ[key]
    sys.exit("Set CIRCLECI_TOKEN (or CIRCLE_TOKEN / CCIPAT) to a CircleCI API token.")


def get(session, url, **params):
    r = session.get(url, params=params, timeout=30)
    if r.status_code != 200:
        print(f"  WARN {r.status_code} {url}: {r.text[:160]}", file=sys.stderr)
        return None
    return r.json()


def load(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


def save(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default="gh/dachrisch/leaguesphere")
    ap.add_argument("--days", type=int, default=35)
    ap.add_argument("--pr-sample", type=int, default=70)
    ap.add_argument("--cache-dir", default=os.path.join(os.path.dirname(__file__), "..", ".cache"))
    args = ap.parse_args()

    os.makedirs(args.cache_dir, exist_ok=True)
    p_pipe = os.path.join(args.cache_dir, "pipelines.json")
    p_wf = os.path.join(args.cache_dir, "workflows.json")
    p_job = os.path.join(args.cache_dir, "jobs.json")

    session = requests.Session()
    session.headers.update({"Circle-Token": token()})
    slug = args.project

    # ---- 1. pipelines -------------------------------------------------
    pipes = load(p_pipe, [])
    seen = {p["id"] for p in pipes}
    page_token = None
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    for page in range(MAX_PAGES):
        params = {"limit": 100}
        if page_token:
            params["page-token"] = page_token
        data = get(session, f"{BASE}/project/{slug}/pipeline", **params)
        if not data:
            break
        items = data.get("items", [])
        if not items:
            break
        for p in items:
            if p["id"] not in seen:
                pipes.append(p)
                seen.add(p["id"])
        oldest = parse(items[-1]["created_at"])
        print(f"pipelines page {page + 1}: total={len(pipes)} oldest={oldest.date()} remaining={data.get('next_page_token') and 'yes' or 'no'}")
        if oldest < cutoff:
            break
        page_token = data.get("next_page_token")
        if not page_token:
            break
        save(p_pipe, pipes)
        time.sleep(0.15)
    save(p_pipe, pipes)

    wf = load(p_wf, {})
    job = load(p_job, {})

    def workflows(pid):
        if pid in wf:
            return wf[pid]
        data = get(session, f"{BASE}/pipeline/{pid}/workflow")
        wf[pid] = (data or {}).get("items", [])
        return wf[pid]

    def jobs(wid):
        if wid in job:
            return job[wid]
        data = get(session, f"{BASE}/workflow/{wid}/job")
        job[wid] = (data or {}).get("items", [])
        return job[wid]

    def expand(pipeline):
        ws = workflows(pipeline["id"])
        main = next((w for w in ws if w.get("name") == "build_test_deploy"), None)
        if main is None and ws:
            main = ws[0]
        if main and main.get("status") == "success":
            jobs(main["id"])

    def is_pr(p):
        v = p.get("vcs") or {}
        return bool(v.get("branch")) and not v.get("tag") and v.get("branch") != "master"

    tags = [p for p in pipes if (p.get("vcs") or {}).get("tag")]
    master = [p for p in pipes if (p.get("vcs") or {}).get("branch") == "master"]
    prs = [p for p in pipes if is_pr(p)][: args.pr_sample]

    todo = tags + master + prs
    print(f"expanding {len(todo)} pipelines (tags={len(tags)}, master={len(master)}, pr_sample={len(prs)})")
    for i, p in enumerate(todo):
        expand(p)
        if (i + 1) % 20 == 0:
            print(f"  {i + 1}/{len(todo)}")
            save(p_wf, wf)
            save(p_job, job)
            time.sleep(0.15)
    save(p_wf, wf)
    save(p_job, job)
    print(f"done: {len(pipes)} pipelines, {len(wf)} workflows, {len(job)} job lists")


if __name__ == "__main__":
    main()
