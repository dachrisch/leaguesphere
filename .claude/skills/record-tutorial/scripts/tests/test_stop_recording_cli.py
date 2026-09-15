import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent


def test_stop_recording_kills_both_processes_and_removes_pidfile(tmp_path):
    xvfb_stub = subprocess.Popen(["sleep", "100"])
    ffmpeg_stub = subprocess.Popen(["sleep", "100"])
    pidfile = tmp_path / "recording.pid"
    pidfile.write_text(json.dumps({
        "xvfb_pid": xvfb_stub.pid,
        "ffmpeg_pid": ffmpeg_stub.pid,
        "output": str(tmp_path / "out.mp4"),
    }))

    result = subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / "stop_recording.py"), "--pidfile", str(pidfile)],
        capture_output=True, text=True, timeout=20,
    )

    assert result.returncode == 0, result.stderr
    assert not pidfile.exists()

    # This test process is the stubs' parent, so the dead stubs linger as
    # zombies until we reap them -- reaping is the parent's job.
    xvfb_stub.wait(timeout=5)
    ffmpeg_stub.wait(timeout=5)

    for pid in (xvfb_stub.pid, ffmpeg_stub.pid):
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)
