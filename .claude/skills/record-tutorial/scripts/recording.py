"""Start/stop the Xvfb virtual display and the ffmpeg screen capture."""
from __future__ import annotations

import signal
import subprocess
from dataclasses import dataclass


@dataclass
class RecordingSession:
    display: str
    resolution: str
    output_path: str
    xvfb_proc: object = None
    ffmpeg_proc: object = None


def build_xvfb_command(display: str, resolution: str) -> list[str]:
    return ["Xvfb", display, "-screen", "0", f"{resolution}x24"]


def build_ffmpeg_command(display: str, resolution: str, output_path: str) -> list[str]:
    return [
        "ffmpeg", "-y",
        "-f", "x11grab",
        "-video_size", resolution,
        "-framerate", "30",
        "-i", display,
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-preset", "veryfast",
        output_path,
    ]


def start(display: str, resolution: str, output_path: str, popen=subprocess.Popen) -> RecordingSession:
    """Launch Xvfb then ffmpeg against it. Returns the session handle."""
    session = RecordingSession(display=display, resolution=resolution, output_path=output_path)
    session.xvfb_proc = popen(build_xvfb_command(display, resolution))
    session.ffmpeg_proc = popen(build_ffmpeg_command(display, resolution, output_path))
    return session


def stop(session: RecordingSession) -> None:
    """Stop ffmpeg cleanly (SIGINT, so it finalizes the mp4 container), then Xvfb."""
    session.ffmpeg_proc.send_signal(signal.SIGINT)
    session.ffmpeg_proc.wait(timeout=15)
    session.xvfb_proc.terminate()
    session.xvfb_proc.wait(timeout=5)
