"""Wayland screen capture via Mutter ScreenCast + PipeWire + GStreamer.

On Wayland sessions (e.g. GNOME with rootless XWayland) ``ffmpeg -f x11grab``
only sees a black root window: native Wayland clients such as Chrome never
paint into X11. This module builds the replacement capture pipeline:

1. A long-lived recorder (``record_wayland.js``, run with ``gjs``) owns a
   ``org.gnome.Mutter.ScreenCast`` D-Bus session for the whole recording --
   the session dies with the recorder's bus connection, so one process must
   hold it open from start to stop.
2. The recorder spawns ``gst-launch-1.0`` with the pipeline built here,
   reading the compositor's PipeWire node and writing an .mp4.
3. ``stop_wayland_recording.py`` SIGTERMs the recorder, which SIGINTs
   gst-launch (``-e`` finalizes the mp4 via EOS) and stops the session.

Stdlib only; see ``tests/test_wayland_recording.py``.
"""
from __future__ import annotations

import json
from pathlib import Path

SCREENCAST_BUS = "org.gnome.Mutter.ScreenCast"
SCREENCAST_PATH = "/org/gnome/Mutter/ScreenCast"
SCREENCAST_IFACE = "org.gnome.Mutter.ScreenCast"
SESSION_IFACE = "org.gnome.Mutter.ScreenCast.Session"
STREAM_IFACE = "org.gnome.Mutter.ScreenCast.Stream"

PIDFILE_BACKEND = "wayland"


def build_gst_pipeline(node_id: int, output_path: str) -> list[str]:
    """Build the gst-launch-1.0 argv capturing PipeWire node ``node_id`` to mp4.

    ``-e`` makes gst-launch emit EOS on SIGINT so the mp4 container is
    finalized cleanly instead of truncated.
    """
    return [
        "gst-launch-1.0", "-e",
        "pipewiresrc", f"path={node_id}", "!",
        "videoconvert", "!",
        "x264enc", "tune=zerolatency", "bitrate=4096", "speed-preset=veryfast", "!",
        "mp4mux", "!", "filesink", f"location={output_path}",
    ]


def write_pidfile(pidfile: Path | str, recorder_pid: int, output: str) -> dict:
    """Persist the recorder session; returns the payload written."""
    payload = {"backend": PIDFILE_BACKEND, "recorder_pid": recorder_pid, "output": output}
    Path(pidfile).write_text(json.dumps(payload))
    return payload


def read_pidfile(pidfile: Path | str) -> dict:
    """Load and validate a pidfile written by :func:`write_pidfile`."""
    info = json.loads(Path(pidfile).read_text())
    if info.get("backend") != PIDFILE_BACKEND:
        raise ValueError(f"not a wayland recording pidfile: {pidfile}")
    for key in ("recorder_pid", "output"):
        if key not in info:
            raise ValueError(f"wayland pidfile {pidfile} missing key '{key}'")
    return info
