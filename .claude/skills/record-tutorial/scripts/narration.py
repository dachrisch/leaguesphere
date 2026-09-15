"""Optional narration pass: render each caption via Piper TTS and mux onto the video."""
from __future__ import annotations

import subprocess
from pathlib import Path

from storyboard import Step


def render_step_audio(step: Step, voice_model: str, out_wav: Path, run=subprocess.run) -> Path:
    """Render a single caption line to a wav file via the local Piper TTS binary."""
    cmd = ["piper", "--model", voice_model, "--output_file", str(out_wav)]
    run(cmd, input=step.caption, text=True, check=True)
    return out_wav


def build_pad_command(wav_path: Path, target_seconds: float, out_path: Path) -> list[str]:
    """Pad (or trim) a rendered clip to exactly target_seconds long, so narration
    timing tracks the storyboard's `hold` durations instead of drifting."""
    return [
        "ffmpeg", "-y", "-i", str(wav_path),
        "-af", f"apad,atrim=0:{target_seconds}",
        str(out_path),
    ]


def build_concat_list(wav_paths: list[Path], concat_file: Path) -> Path:
    """Write an ffmpeg concat-demuxer list file referencing wav_paths in order."""
    lines = [f"file '{p.resolve()}'" for p in wav_paths]
    concat_file.write_text("\n".join(lines) + "\n")
    return concat_file


def build_mux_command(video_path: Path, audio_path: Path, output_path: Path) -> list[str]:
    return [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(audio_path),
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        str(output_path),
    ]
