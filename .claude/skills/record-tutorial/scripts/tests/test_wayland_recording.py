import json
from pathlib import Path

import pytest

from wayland_recording import (
    PIDFILE_BACKEND,
    build_gst_pipeline,
    read_pidfile,
    write_pidfile,
)


def test_build_gst_pipeline_captures_pipewire_node_to_mp4():
    cmd = build_gst_pipeline(73, "/tmp/out.mp4")

    assert cmd[0] == "gst-launch-1.0" and "-e" in cmd  # -e: EOS on SIGINT, clean mp4
    assert "pipewiresrc" in cmd and "path=73" in cmd
    assert "x264enc" in cmd and "mp4mux" in cmd
    assert cmd[-1] == "location=/tmp/out.mp4"
    # Decode path must come before the encoder.
    assert cmd.index("pipewiresrc") < cmd.index("x264enc") < cmd.index("mp4mux")


def test_pidfile_roundtrip(tmp_path: Path):
    pidfile = tmp_path / "rec.pid"

    payload = write_pidfile(pidfile, 4242, "/tmp/out.mp4")

    assert payload["backend"] == PIDFILE_BACKEND
    assert read_pidfile(pidfile) == payload
    assert json.loads(pidfile.read_text())["recorder_pid"] == 4242


def test_read_pidfile_rejects_foreign_backend(tmp_path: Path):
    pidfile = tmp_path / "rec.pid"
    pidfile.write_text(json.dumps({"xvfb_pid": 1, "ffmpeg_pid": 2, "output": "/tmp/x.mp4"}))

    with pytest.raises(ValueError, match="not a wayland recording pidfile"):
        read_pidfile(pidfile)


def test_gjs_recorder_uses_same_pipeline_elements():
    """The gjs recorder hardcodes its gst pipeline; it must stay in sync with
    build_gst_pipeline() above (node id is only known at runtime in gjs)."""
    src = (Path(__file__).resolve().parent.parent / "record_wayland.js").read_text()

    for token in ["pipewiresrc", "videoconvert", "x264enc", "mp4mux", "filesink"]:
        assert token in src, f"record_wayland.js lost pipeline element {token}"
    assert "'-e'" in src or '"-e"' in src, "record_wayland.js must pass -e for clean EOS"
    assert "recording started -> " in src, "readiness line consumed by start_wayland_recording.py"
