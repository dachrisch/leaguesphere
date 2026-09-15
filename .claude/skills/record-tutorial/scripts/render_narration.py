#!/usr/bin/env python3
"""CLI: render narration for a whole storyboard and mux it onto the recorded video."""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from narration import build_concat_list, build_mux_command, build_pad_command, render_step_audio  # noqa: E402
from storyboard import load_storyboard  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--storyboard", required=True, type=Path)
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--voice-model", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    steps = load_storyboard(args.storyboard)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        padded_paths = []
        for i, step in enumerate(steps):
            raw_wav = tmp_dir / f"step-{i:03d}-raw.wav"
            padded_wav = tmp_dir / f"step-{i:03d}.wav"
            render_step_audio(step, args.voice_model, raw_wav)
            subprocess.run(build_pad_command(raw_wav, step.hold, padded_wav), check=True)
            padded_paths.append(padded_wav)

        concat_file = build_concat_list(padded_paths, tmp_dir / "concat.txt")
        narration_wav = tmp_dir / "narration.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file), str(narration_wav)],
            check=True,
        )
        subprocess.run(build_mux_command(args.video, narration_wav, args.output), check=True)

    print(f"narrated video written -> {args.output}")


if __name__ == "__main__":
    main()
