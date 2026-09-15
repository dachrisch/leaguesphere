import pytest

from slideshow import build_concat_list, build_ffmpeg_command, render


def test_build_concat_list_repeats_last_frame_without_duration():
    text = build_concat_list([("frame_001.png", 3.0), ("frame_002.png", 2.5)])
    assert text == (
        "file 'frame_001.png'\n"
        "duration 3.0\n"
        "file 'frame_002.png'\n"
        "duration 2.5\n"
        "file 'frame_002.png'\n"
    )


def test_build_concat_list_rejects_empty_frames():
    with pytest.raises(ValueError):
        build_concat_list([])


def test_build_ffmpeg_command():
    cmd = build_ffmpeg_command("/tmp/concat.txt", "/tmp/out.mp4", fps=25)
    assert cmd[:6] == ["ffmpeg", "-y", "-f", "concat", "-safe", "0"]
    assert "-i" in cmd and cmd[cmd.index("-i") + 1] == "/tmp/concat.txt"
    assert "-vf" in cmd and "fps=25" in cmd[cmd.index("-vf") + 1]
    assert cmd[-1] == "/tmp/out.mp4"


def test_render_writes_concat_file_and_invokes_ffmpeg(tmp_path):
    calls = []

    def fake_run(cmd, check):
        calls.append((cmd, check))

    concat_path = tmp_path / "concat.txt"
    render([("frame_001.png", 3.0)], concat_path, "/tmp/out.mp4", run=fake_run)

    assert concat_path.read_text() == "file 'frame_001.png'\nduration 3.0\nfile 'frame_001.png'\n"
    assert calls == [(build_ffmpeg_command(concat_path, "/tmp/out.mp4"), True)]
