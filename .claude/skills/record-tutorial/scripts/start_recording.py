#!/usr/bin/env python3
"""CLI: start the Xvfb + ffmpeg recording session and persist its PIDs to a pidfile."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from recording import start  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--display", required=True, help="X display to use, e.g. :99")
    parser.add_argument("--resolution", required=True, help="e.g. 1280x720")
    parser.add_argument("--output", required=True, help="Output .mp4 path")
    parser.add_argument("--pidfile", required=True, help="Where to write the session's PIDs")
    args = parser.parse_args()

    session = start(args.display, args.resolution, args.output)
    Path(args.pidfile).write_text(json.dumps({
        "xvfb_pid": session.xvfb_proc.pid,
        "ffmpeg_pid": session.ffmpeg_proc.pid,
        "output": args.output,
    }))
    print(f"recording started -> {args.output}")


if __name__ == "__main__":
    main()
