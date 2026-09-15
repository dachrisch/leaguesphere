#!/usr/bin/env python3
"""CLI: stop a Wayland recording started by start_wayland_recording.py.

SIGTERMs the recorder process (which SIGINTs gst-launch so the mp4 is
finalized via EOS, then stops its ScreenCast session), waits for its exit,
and unlinks the pidfile.
"""
import argparse
import os
import signal
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from wayland_recording import read_pidfile  # noqa: E402


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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pidfile", required=True)
    args = parser.parse_args()

    pidfile = Path(args.pidfile)
    info = read_pidfile(pidfile)

    os.kill(info["recorder_pid"], signal.SIGTERM)
    _wait_for_exit(info["recorder_pid"], timeout=25)

    pidfile.unlink()
    print(f"recording stopped -> {info['output']}")


if __name__ == "__main__":
    main()
