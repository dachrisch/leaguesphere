"""Assemble per-step screenshots into an mp4 slideshow via ffmpeg's concat demuxer.

Used instead of ``recording.py``'s Xvfb/x11grab capture when chrome-devtools-mcp's
browser can't be pointed at an isolated virtual display (it always renders on the
host's real desktop session) -- see SKILL.md. Each storyboard step becomes one still
frame (a chrome-devtools-mcp screenshot with the caption already burned in), held on
screen for that step's configured ``hold`` duration.
"""
from __future__ import annotations

import subprocess
from pathlib import Path


def build_concat_list(frames: list[tuple[Path | str, float]]) -> str:
    """Return the contents of an ffmpeg concat-demuxer list file.

    ``frames`` is an ordered list of (image_path, hold_seconds). The final frame is
    repeated without a duration line -- the concat demuxer ignores the duration of
    the last listed file, so without the repeat the last frame would flash for a
    single output frame instead of holding for its configured duration.
    """
    if not frames:
        raise ValueError("frames must not be empty")
    lines: list[str] = []
    for path, duration in frames:
        lines.append(f"file '{path}'")
        lines.append(f"duration {duration}")
    last_path, _ = frames[-1]
    lines.append(f"file '{last_path}'")
    return "\n".join(lines) + "\n"


def build_ffmpeg_command(concat_path: Path | str, output_path: Path | str, fps: int = 25) -> list[str]:
    """Build the ffmpeg argv that renders a concat list file into an mp4."""
    return [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(concat_path),
        "-vf", f"fps={fps},pad=ceil(iw/2)*2:ceil(ih/2)*2",
        "-pix_fmt", "yuv420p",
        str(output_path),
    ]


def render(frames: list[tuple[Path | str, float]], concat_path: Path | str, output_path: Path | str,
           run=subprocess.run) -> None:
    """Write the concat list and invoke ffmpeg to render it to ``output_path``."""
    Path(concat_path).write_text(build_concat_list(frames))
    run(build_ffmpeg_command(concat_path, output_path), check=True)
