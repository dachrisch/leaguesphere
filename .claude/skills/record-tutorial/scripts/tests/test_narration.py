from pathlib import Path

from storyboard import Step
from narration import build_concat_list, build_mux_command, build_pad_command, render_step_audio


class FakeRun:
    def __init__(self):
        self.calls: list[dict] = []

    def __call__(self, cmd, **kwargs):
        self.calls.append({"cmd": cmd, **kwargs})


def test_render_step_audio_calls_piper_with_caption_on_stdin(tmp_path):
    step = Step(caption="Open the Gameday Designer", action="navigate", target="/designer/", hold=3.0)
    fake_run = FakeRun()
    out_wav = tmp_path / "step-000.wav"

    result = render_step_audio(step, "en_US-amy-medium", out_wav, run=fake_run)

    assert result == out_wav
    assert fake_run.calls[0]["cmd"] == [
        "piper", "--model", "en_US-amy-medium", "--output_file", str(out_wav),
    ]
    assert fake_run.calls[0]["input"] == "Open the Gameday Designer"
    assert fake_run.calls[0]["check"] is True


def test_build_pad_command_pads_to_hold_duration():
    cmd = build_pad_command(Path("/tmp/raw.wav"), 3.5, Path("/tmp/padded.wav"))
    assert cmd[:3] == ["ffmpeg", "-y", "-i"]
    assert "-af" in cmd
    af = cmd[cmd.index("-af") + 1]
    assert "atrim=0:3.5" in af
    assert cmd[-1] == "/tmp/padded.wav"


def test_build_concat_list_writes_one_quoted_path_per_line(tmp_path):
    wav_paths = [tmp_path / "a.wav", tmp_path / "b.wav"]
    concat_file = tmp_path / "concat.txt"

    result = build_concat_list(wav_paths, concat_file)

    assert result == concat_file
    lines = concat_file.read_text().splitlines()
    assert lines == [f"file '{wav_paths[0].resolve()}'", f"file '{wav_paths[1].resolve()}'"]


def test_build_mux_command_copies_video_encodes_audio():
    cmd = build_mux_command(Path("/tmp/video.mp4"), Path("/tmp/narration.wav"), Path("/tmp/out.mp4"))
    assert cmd == [
        "ffmpeg", "-y",
        "-i", "/tmp/video.mp4",
        "-i", "/tmp/narration.wav",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        "/tmp/out.mp4",
    ]
