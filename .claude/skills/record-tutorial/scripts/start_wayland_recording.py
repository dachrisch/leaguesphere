#!/usr/bin/env python3
"""CLI: start a Wayland screen recording and persist its PID to a pidfile.

Launches ``record_wayland.js`` (gjs + Mutter ScreenCast + gst-launch), waits
for its "recording started" readiness line, then writes the pidfile consumed
by ``stop_wayland_recording.py``.
"""
import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from wayland_recording import write_pidfile  # noqa: E402

READY_PREFIX = "recording started -> "


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, help="Output .mp4 path")
    parser.add_argument("--pidfile", required=True, help="Where to write the session's PIDs")
    parser.add_argument("--monitor", default=None, help="Monitor connector, e.g. eDP-1 (default: first)")
    parser.add_argument("--timeout", type=int, default=20, help="Seconds to wait for readiness")
    args = parser.parse_args()

    script = Path(__file__).resolve().parent / "record_wayland.js"
    cmd = ["gjs", str(script), "--output", args.output]
    if args.monitor:
        cmd += ["--monitor", args.monitor]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    assert proc.stdout is not None
    ready = False
    try:
        for line in iter(proc.stdout.readline, ""):
            if READY_PREFIX in line:
                ready = True
                break
            if proc.poll() is not None:
                break
    except Exception:
        proc.terminate()
        raise
    if not ready:
        proc.terminate()
        raise RuntimeError("wayland recorder exited before becoming ready")

    write_pidfile(args.pidfile, proc.pid, args.output)
    print(f"recording started -> {args.output}")


if __name__ == "__main__":
    main()
