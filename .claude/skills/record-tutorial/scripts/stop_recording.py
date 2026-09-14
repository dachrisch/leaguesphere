#!/usr/bin/env python3
"""CLI: stop a recording session started by start_recording.py.

Runs as a fresh process that only has PIDs (loaded from the pidfile written
by a different process), so it signals by PID directly rather than reusing
recording.stop(), which operates on in-process subprocess.Popen objects.
"""
import argparse
import json
import os
import signal
import time
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pidfile", required=True)
    args = parser.parse_args()

    pidfile = Path(args.pidfile)
    info = json.loads(pidfile.read_text())

    os.kill(info["ffmpeg_pid"], signal.SIGINT)
    _wait_for_exit(info["ffmpeg_pid"], timeout=15)

    os.kill(info["xvfb_pid"], signal.SIGTERM)
    _wait_for_exit(info["xvfb_pid"], timeout=5)

    pidfile.unlink()
    print(f"recording stopped -> {info['output']}")


def _wait_for_exit(pid: int, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        if _is_zombie(pid):
            # Dead but not yet reaped by its parent (which isn't us -- we only
            # have the PID from the pidfile), so kill(pid, 0) would succeed
            # forever. A zombie is gone for our purposes.
            return
        time.sleep(0.2)


def _is_zombie(pid: int) -> bool:
    """True if pid is a zombie (or already reaped between the two checks)."""
    try:
        with open(f"/proc/{pid}/stat") as f:
            stat = f.read()
    except FileNotFoundError:
        return True
    comm_end = stat.rfind(")")
    parts = stat[comm_end + 1 :].split()
    return bool(parts) and parts[0] == "Z"


if __name__ == "__main__":
    main()
