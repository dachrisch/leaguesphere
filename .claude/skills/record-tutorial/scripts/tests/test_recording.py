from recording import build_ffmpeg_command, build_xvfb_command, start, stop


def test_build_xvfb_command():
    assert build_xvfb_command(":99", "1280x720") == ["Xvfb", ":99", "-screen", "0", "1280x720x24"]


def test_build_ffmpeg_command():
    cmd = build_ffmpeg_command(":99", "1280x720", "/tmp/out.mp4")
    assert cmd[:4] == ["ffmpeg", "-y", "-f", "x11grab"]
    assert "-video_size" in cmd and cmd[cmd.index("-video_size") + 1] == "1280x720"
    assert "-i" in cmd and cmd[cmd.index("-i") + 1] == ":99"
    assert "-c:v" in cmd and cmd[cmd.index("-c:v") + 1] == "libx264"
    assert cmd[-1] == "/tmp/out.mp4"


class FakeProc:
    def __init__(self, pid: int):
        self.pid = pid
        self.signals: list[int] = []
        self.terminated = False
        self.waited_with: list[int] = []

    def send_signal(self, sig: int) -> None:
        self.signals.append(sig)

    def terminate(self) -> None:
        self.terminated = True

    def wait(self, timeout: int | None = None) -> None:
        self.waited_with.append(timeout)


class FakePopen:
    def __init__(self):
        self.calls: list[list[str]] = []
        self._next_pid = 1000

    def __call__(self, cmd: list[str]) -> FakeProc:
        self.calls.append(cmd)
        proc = FakeProc(self._next_pid)
        self._next_pid += 1
        return proc


def test_start_launches_xvfb_then_ffmpeg():
    fake_popen = FakePopen()
    session = start(":99", "1280x720", "/tmp/out.mp4", popen=fake_popen)

    assert fake_popen.calls[0] == build_xvfb_command(":99", "1280x720")
    assert fake_popen.calls[1] == build_ffmpeg_command(":99", "1280x720", "/tmp/out.mp4")
    assert session.xvfb_proc.pid == 1000
    assert session.ffmpeg_proc.pid == 1001


def test_stop_sends_sigint_to_ffmpeg_before_terminating_xvfb():
    import signal

    fake_popen = FakePopen()
    session = start(":99", "1280x720", "/tmp/out.mp4", popen=fake_popen)

    stop(session)

    assert session.ffmpeg_proc.signals == [signal.SIGINT]
    assert session.ffmpeg_proc.waited_with == [15]
    assert session.xvfb_proc.terminated is True
    assert session.xvfb_proc.waited_with == [5]
