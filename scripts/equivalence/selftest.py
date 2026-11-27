#!/usr/bin/env python3
"""Noise-floor self-test for the equivalence harness.

Runs the whole probe set twice against the **same** deployment (ref vs ref).
The two runs see the same data, so any diff is harness noise: a CSRF token,
a timestamp, an asset hash or a session bit the normaliser failed to strip.
No equivalence report is trusted before this exits 0.

Usage::

    python3 scripts/equivalence/selftest.py \
        --url https://ref.example --username ... --password ...
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import probes as probe_mod  # noqa: E402
from probes import describe_diffs  # noqa: E402
from transport import build_sessions  # noqa: E402


def run_selftest(args):
    manifest = probe_mod.load_manifest(args.manifest)
    errors = []
    sessions = build_sessions(args.url, args.username, args.password, manifest, errors)
    if errors:
        print("harness setup failed:")
        for error in errors:
            print(f"  {error}")
        return 1

    gamedays = probe_mod.discover(sessions["anonymous"], manifest)
    gamedays = probe_mod.discover_games(sessions["anonymous"], manifest, gamedays)
    probes = probe_mod.expand_probes(manifest, gamedays)
    first_run, first_skipped = probe_mod.run_probes(sessions, manifest, probes)
    second_run, second_skipped = probe_mod.run_probes(sessions, manifest, probes)
    diffs = probe_mod.compare_probe_results(first_run, second_run)
    skipped = sorted(set(first_skipped) | set(second_skipped))

    print(f"noise-floor selftest: {len(first_run)} probes compared twice")
    if skipped:
        print("skipped probes (role credentials not supplied):")
        for name in skipped:
            print(f"  {name}")
    if diffs:
        print(f"FAIL: {len(diffs)} probe(s) differ between two ref runs:")
        for line in describe_diffs(diffs):
            print(line)
        return 1
    print("PASS: ref vs ref produced zero diffs")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Equivalence noise-floor self-test")
    parser.add_argument("--url", required=True, help="deployment base URL")
    parser.add_argument("--username", default="", help="basic-auth user")
    parser.add_argument("--password", default="", help="basic-auth password")
    parser.add_argument("--manifest", default=None, help="probe manifest (JSON)")
    args = parser.parse_args(argv)
    return run_selftest(args)


if __name__ == "__main__":
    sys.exit(main())
