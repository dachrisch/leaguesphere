#!/usr/bin/env python3
"""Render the three-chart CircleCI duration dashboard as one self-contained HTML file.

Usage:
    python3 render.py [--analysis FILE] [--out FILE]

Charts
    1. Job execution times   – horizontal bars, mean +- std dev, sorted longest first
    2. Typical PR run        – horizontal stacked bar of job-group composition
    3. Release pipeline      – stacked vertical bars per release run, average line

The HTML is print-ready; push it to DocStash with create_pdf (see SKILL.md).
"""
import argparse
import html
import json
import os
import statistics


def fmt(sec):
    sec = max(0, round(sec))
    m, s = divmod(sec, 60)
    return f"{m}m {s:02d}s" if m else f"{s}s"


# Display cap for Chart 3: extreme release outliers are listed, not plotted.
CAP = 1800  # 30 min


def chart_jobs(jobs):
    jobs = jobs[:18]
    maxval = max(j["mean"] + j["std"] for j in jobs)
    xmax = 360 if maxval <= 360 else (int(maxval // 60) + 1) * 60
    W, H = 820, 40 + len(jobs) * 24 + 40
    left, right = 210, 30
    plot_w = W - left - right
    sx = lambda v: left + (v / xmax) * plot_w
    rows, y = [], 40
    for j in jobs:
        mean, std = j["mean"], j["std"]
        x1 = sx(mean)
        lox, hix = sx(max(0, mean - std)), sx(min(xmax, mean + std))
        col = "#e11d48" if mean > 120 else ("#fb7185" if mean > 60 else "#9ca3af")
        rows.append(f'''<text x="{left-10}" y="{y+4}" text-anchor="end" font-size="11" fill="#334155">{html.escape(j["job"])}</text>
<rect x="{left}" y="{y-7}" width="{x1-left:.1f}" height="14" rx="3" fill="{col}" opacity="0.92"/>
<line x1="{lox:.1f}" y1="{y}" x2="{hix:.1f}" y2="{y}" stroke="#1e293b" stroke-width="1.4" opacity="0.75"/>
<line x1="{lox:.1f}" y1="{y-4}" x2="{lox:.1f}" y2="{y+4}" stroke="#1e293b" stroke-width="1.4" opacity="0.75"/>
<line x1="{hix:.1f}" y1="{y-4}" x2="{hix:.1f}" y2="{y+4}" stroke="#1e293b" stroke-width="1.4" opacity="0.75"/>
<circle cx="{x1:.1f}" cy="{y}" r="3.2" fill="#1e293b"/>
<text x="{hix+8:.1f}" y="{y+4}" font-size="10.5" fill="#1e293b" font-weight="600">{fmt(mean)}</text>
<text x="{x1:.1f}" y="{y-9}" text-anchor="middle" font-size="8" fill="#64748b">n={j["n"]}</text>''')
        y += 24
    grid = []
    for t in range(0, xmax + 1, 60):
        gx = sx(t)
        grid.append(f'<line x1="{gx:.1f}" y1="28" x2="{gx:.1f}" y2="{y-4}" stroke="#e5e7eb" stroke-width="1"/>')
        grid.append(f'<text x="{gx:.1f}" y="{y+16}" text-anchor="middle" font-size="10" fill="#6b7280">{t//60}m</text>')
    return f'''<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
<text x="{left}" y="20" font-size="12" fill="#6b7280">Average execution time &#177; std dev (successful runs, n&#8805;2) &#183; scale 0&#8211;{xmax//60} min</text>
{''.join(grid)}{''.join(rows)}</svg>''', jobs


def chart_pr(crit):
    """Horizontal stacked bar of one median PR run's critical path (wall-clock)."""
    segs = crit["segments"]
    total = sum(s["seconds"] for s in segs)
    colors = {
        "e2e browser suite": "#e11d48",
        "image smoke test": "#3b82f6",
        "full gate": "#22c55e",
        "queue / scheduling": "#94a3b8",
        "compose network": "#8b5cf6",
        "migrations check": "#8b5cf6",
        "image build": "#3b82f6",
    }
    W, px, pw, pby, ph = 820, 10, 800, 50, 40
    parts, cur = [], px
    for s in segs:
        w = (s["seconds"] / total) * pw
        pct = 100 * s["seconds"] / total
        col = colors.get(s["label"], "#f59e0b")
        parts.append(f'<rect x="{cur:.1f}" y="{pby}" width="{w:.1f}" height="{ph}" fill="{col}"/>')
        short = {"e2e browser suite": "e2e", "image smoke test": "image", "full gate": "gate",
                 "queue / scheduling": "queue", "compose network": "compose",
                 "migrations check": "migrations", "image build": "build"}.get(s["label"], s["label"])
        if w > 55:
            parts.append(f'<text x="{cur+w/2:.1f}" y="{pby+18}" text-anchor="middle" font-size="11.5" fill="#fff" font-weight="700">{html.escape(short)}</text>')
            parts.append(f'<text x="{cur+w/2:.1f}" y="{pby+33}" text-anchor="middle" font-size="10" fill="#fff">{pct:.0f}%</text>')
        cur += w
    leg = []
    lx = px
    for s in segs:
        col = colors.get(s["label"], "#f59e0b")
        leg.append(f'<rect x="{lx:.1f}" y="{pby+ph+16}" width="11" height="11" rx="2" fill="{col}"/>')
        leg.append(f'<text x="{lx+15:.1f}" y="{pby+ph+25}" font-size="10" fill="#334155">{html.escape(s["label"])} {fmt(s["seconds"])}</text>')
        lx += 190
    H = pby + ph + 44
    svg = f'''<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
<text x="{px}" y="20" font-size="12" fill="#6b7280">Typical PR run #{crit["pipeline"]} &#8212; actual wall-clock breakdown (total {fmt(total)})</text>
<text x="{px}" y="36" font-size="9.5" fill="#64748b">Critical path of the median PR run; unit tests and image builds run in parallel under e2e, so they add no wall-clock.</text>
{''.join(parts)}
{''.join(leg)}</svg>'''
    return svg, segs, total


def chart_releases(releases):
    allrel = [r for r in releases if r["blue"] is not None]
    allrel.sort(key=lambda r: r["tagpush"])
    shown = [r for r in allrel if (r["blue"] + r["purple"] + r["greenp"]) <= CAP]
    outliers = [r for r in allrel if (r["blue"] + r["purple"] + r["greenp"]) > CAP]
    n = len(shown)
    W = 900
    left, right, top, bot, ph = 60, 30, 40, 64, 205
    plot_w = W - left - right
    ymax = max(600, (int(max((r["blue"] + r["purple"] + r["greenp"]) for r in shown) // 300) + 1) * 300)
    sy = lambda v: top + ph - (v / ymax) * ph
    bw = plot_w / n
    bars, labels = [], []
    for i, r in enumerate(shown):
        x = left + i * bw
        yb = top + ph
        xh, w = x + bw * 0.12, bw * 0.76
        for val, col in ((r["blue"], "#3b82f6"), (r["purple"], "#8b5cf6"), (r["greenp"], "#22c55e")):
            h = (val / ymax) * ph
            bars.append(f'<rect x="{xh:.1f}" y="{yb-h:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{col}"/>')
            yb -= h
        if i % 5 == 0:
            labels.append(f'<text x="{x+bw/2:.1f}" y="{top+ph+16}" text-anchor="end" font-size="9" fill="#334155" transform="rotate(-62 {x+bw/2:.1f} {top+ph+16})">{r["tagpush"][5:10]}</text>')
    avg = statistics.mean(r["blue"] + r["purple"] + r["greenp"] for r in shown)
    ay = sy(avg)
    grid = []
    for m in range(0, ymax // 60 + 1, 5):
        yy = sy(m * 60)
        grid.append(f'<line x1="{left}" y1="{yy:.1f}" x2="{left+plot_w}" y2="{yy:.1f}" stroke="#e5e7eb" stroke-width="1"/>')
        grid.append(f'<text x="{left-8}" y="{yy+4:.1f}" text-anchor="end" font-size="10" fill="#6b7280">{m}m</text>')
    svg = f'''<svg viewBox="0 0 {W} {top+ph+bot}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
<text x="{left}" y="20" font-size="12" fill="#6b7280">Each bar = one release tag pipeline (chronological) &#183; PR&#8594;tag + tag&#8594;first CI + CI execution</text>
{''.join(grid)}{''.join(bars)}{''.join(labels)}
<line x1="{left}" y1="{ay:.1f}" x2="{left+plot_w}" y2="{ay:.1f}" stroke="#e11d48" stroke-width="2" stroke-dasharray="7 4"/>
<text x="{left+plot_w}" y="{ay-6:.1f}" text-anchor="end" font-size="10" fill="#e11d48" font-weight="600">avg {fmt(avg)}</text>
<line x1="{left}" y1="{top+ph}" x2="{left+plot_w}" y2="{top+ph}" stroke="#1e293b" stroke-width="1.5"/></svg>'''
    return svg, shown, outliers, avg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--analysis", default=os.path.join(os.path.dirname(__file__), "..", ".cache", "analysis.json"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "dashboard.html"))
    args = ap.parse_args()

    data = json.load(open(args.analysis))
    jobs_all, releases, pr_jobs, meta = data["jobs"], data["releases"], data["pr_jobs"], data["meta"]
    crit = data["pr_critical"]

    svg1, jobs = chart_jobs(jobs_all)
    svg2, pr_segs, pr_total = chart_pr(crit)
    svg3, shown, outliers, avg = chart_releases(releases)

    rows = "".join(f'<tr><td>{html.escape(j["job"])}</td><td>{fmt(j["mean"])}</td><td>&#177;{fmt(j["std"])}</td><td>{j["n"]}</td><td>{fmt(j["p25"])} &#8211; {fmt(j["p75"])}</td></tr>' for j in jobs)
    all_tot = [r["blue"] + r["purple"] + r["greenp"] for r in releases if r["blue"] is not None]
    shown_tot = [r["blue"] + r["purple"] + r["greenp"] for r in shown]
    latest = [r for r in releases if r["blue"] is not None][-1]
    latest_total = fmt(latest["blue"] + latest["purple"] + latest["greenp"])
    outlier_txt = ", ".join(f'{html.escape(o["tag"])} ({fmt(o["blue"]+o["purple"]+o["greenp"])})' for o in sorted(outliers, key=lambda r: -(r["blue"] + r["purple"] + r["greenp"])))
    pr_txt = " &#183; ".join(f'{html.escape(s["label"])} {100*s["seconds"]/pr_total:.0f}%' for s in pr_segs)
    k = dict(avg_total=fmt(statistics.mean(shown_tot)), med_total=fmt(statistics.median(all_tot)),
             avg_blue=fmt(statistics.mean(r["blue"] for r in shown)),
             avg_purple=fmt(statistics.mean(r["purple"] for r in shown)),
             avg_green=fmt(statistics.mean(r["greenp"] for r in shown)))
    bf = next((j for j in jobs if j["job"] == "build_frontend"), jobs[0])

    doc = f'''<!doctype html><html><head><meta charset="utf-8"><style>
@page{{size:letter;margin:0.7in 0.55in;@bottom-center{{content:"CircleCI Dashboard — {html.escape(meta["project"])} — real workflow data";font-size:8.5pt;color:#6b7280;}}}}
body{{font-family:system-ui,sans-serif;color:#1a1a1a;background:#fff;font-size:12.5px;line-height:1.45;}}
h1{{color:#e11d48;font-size:23px;border-bottom:5px solid #e11d48;padding-bottom:9px;margin-bottom:6px;}}
.sub{{color:#6b7280;font-size:11.5px;margin-bottom:16px;}}
h2{{color:#e11d48;font-size:15.5px;margin-top:22px;border-left:5px solid #e11d48;padding-left:11px;}}
.box{{background:#fffdf6;border-left:4px solid #e11d48;padding:12px;border-radius:4px;margin:12px 0;font-size:11.5px;}}
.card{{display:inline-block;background:#1e293b;color:#fff;border-radius:8px;padding:9px 15px;margin:4px 6px 4px 0;}}
.card b{{display:block;font-size:19px;}} .card span{{font-size:10px;color:#cbd5e1;}}
.chart{{border:2px solid #e11d48;border-radius:8px;padding:10px;margin:10px 0;background:#fff;overflow:hidden;}}
table{{width:100%;border-collapse:collapse;font-size:10.5px;border:1px solid #ddd;}}
th{{background:#1e293b;color:#fff;padding:5px 6px;text-align:left;font-size:10px;}}
td{{padding:4px 6px;border-bottom:1px solid #e5e7eb;}}
.mono{{font-family:ui-monospace,monospace;font-size:10.5px;background:#f1f5f9;padding:1px 4px;border-radius:3px;}} .k{{font-weight:600}}
</style></head><body>
<h1>CircleCI Duration Dashboard</h1>
<div class="sub">Project <span class="mono">{html.escape(meta["project"])}</span> &#183; source: CircleCI API v2 (pipelines &#8594; workflows &#8594; jobs) &#183; <b>{meta["n_jobs"]} execution jobs across {meta["n_releases"]} release pipelines + {meta["n_pr_runs"]} successful PR runs</b> &#183; range {meta["date_from"]} &#8594; {meta["date_to"]}.</div>
<div class="box"><strong>How long yesterday vs last month:</strong> latest release <span class="mono">{html.escape(latest["tag"])}</span> = <b>{latest_total}</b> PR&#8594;green. Median over the window = <b>{k["med_total"]}</b>; mean = <b>{k["avg_total"]}</b> (pulled up by outliers). The left edge of Chart 3 vs the right edge is the month-over-month trend.</div>
<div class="box" style="margin-top:6px;"><strong>Method.</strong> Durations are actual <span class="mono">stopped_at &#8722; started_at</span> timestamps, not estimates. Chart 1 aggregates tag + master successful runs; Chart 2 is the critical path of the median successful PR run (segments sum to that run's wall-clock); Chart 3 derives release segments from real timestamps: PR-merge = the master-branch pipeline sharing the tag's commit SHA; tag-push = tag pipeline <span class="mono">created_at</span>; first CI = earliest execution-job <span class="mono">started_at</span>; green = latest execution-job <span class="mono">stopped_at</span>. Segments sum exactly to PR&#8594;green. Approval-hold jobs excluded.</div>

<h2>Chart 1 — Job Execution Times (Average &#177; Variability)</h2>
<div class="chart">{svg1}</div>
<div style="font-size:11px;color:#555;"><strong>&#9679; = average (bar end)</strong> &#183; <strong>&#9500;&#9472;&#9508; = &#177;1 standard deviation</strong> &#183; sorted longest first &#183; approval gates excluded &#183; successful <em>execution</em> builds only (n&#8805;2).</div>
<table style="margin-top:8px;"><thead><tr><th>Job</th><th>Mean</th><th>Std dev</th><th>n</th><th>P25 &#8211; P75</th></tr></thead><tbody>{rows}</tbody></table>
<div style="font-size:10.5px;color:#6b7280;margin-top:4px;">Showing the {len(jobs)} slowest of {meta["n_jobs"]} execution jobs (chart and table); stats computed across all {meta["n_jobs"]}.</div>

<h2>Chart 2 — Typical PR Run: Wall-Clock Breakdown (Critical Path)</h2>
<div style="font-size:11px;color:#555;">e2e is the critical path and dominates PR wall-clock; parallel unit tests and image builds add nothing. Segments sum exactly to the median run&#8217;s elapsed time.</div>
<div class="chart">{svg2}</div>

<h2>Chart 3 — Release Pipeline Over Time (per run)</h2>
<div class="chart">{svg3}</div>
<div style="font-size:11px;color:#555;"><strong>Segments:</strong> <span style="color:#3b82f6">&#9632; PR merged &#8594; tag pushed</span> &#183; <span style="color:#8b5cf6">&#9632; Tag pushed &#8594; first CI job</span> &#183; <span style="color:#22c55e">&#9632; First CI job &#8594; pipeline green</span> &#183; <span style="color:#e11d48">- - - average total {fmt(avg)}</span> (shown runs).</div>
<div style="margin:8px 0;">
<div class="card"><b>{k["avg_total"]}</b><span>mean PR&#8594;green (shown)</span></div>
<div class="card"><b>{k["med_total"]}</b><span>median PR&#8594;green</span></div>
<div class="card"><b>{k["avg_green"]}</b><span>mean CI execution</span></div>
<div class="card"><b>{k["avg_blue"]}</b><span>mean PR&#8594;tag</span></div>
<div class="card"><b>{k["avg_purple"]}</b><span>mean tag&#8594;CI</span></div>
<div class="card"><b>{meta["n_releases"]}</b><span>tagged releases</span></div>
</div>
<div style="font-size:10.5px;color:#6b7280;">Chart 3 shows {len(shown)} runs; extreme outliers (&gt;30 min) omitted for scale: {outlier_txt}.</div>

<h2>How the charts complement each other</h2>
<table><thead><tr><th>Question</th><th>Chart</th><th>Answer from this data</th></tr></thead><tbody>
<tr><td>Which jobs are slowest?</td><td>1 Job execution</td><td><span class="k">{html.escape(jobs[0]["job"])} {fmt(jobs[0]["mean"])}</span>, then {html.escape(jobs[1]["job"])} {fmt(jobs[1]["mean"])}, {html.escape(jobs[2]["job"])} {fmt(jobs[2]["mean"])}</td></tr>
<tr><td>Which jobs are inconsistent?</td><td>1 Job execution error bars</td><td>Widest &#177;: <span class="k">{html.escape(jobs[0]["job"])} &#177;{fmt(jobs[0]["std"])}</span>, {html.escape(bf["job"])} &#177;{fmt(bf["std"])}</td></tr>
<tr><td>Where does PR CI wall-clock go?</td><td>2 PR critical path</td><td>{pr_txt}</td></tr>
<tr><td>Is the release process getting faster?</td><td>3 Release pipeline</td><td>Shown runs range {fmt(min(shown_tot))} &#8211; {fmt(max(shown_tot))}; median {k["med_total"]}</td></tr>
<tr><td>Waiting or CI execution the bottleneck?</td><td>3 Release segments</td><td><span class="k">CI execution dominates</span> — mean {k["avg_green"]} of {k["avg_total"]}; PR&#8594;tag and tag&#8594;CI are seconds-to-minutes</td></tr>
<tr><td>Are individual releases unusually slow?</td><td>3 Release pipeline</td><td>Bars above the dashed avg line are the slow ones; omitted outliers are the extreme cases</td></tr>
</tbody></table>
</body></html>'''
    with open(args.out, "w") as f:
        f.write(doc)
    print(f"wrote {args.out} ({len(doc)} bytes)")


if __name__ == "__main__":
    main()
