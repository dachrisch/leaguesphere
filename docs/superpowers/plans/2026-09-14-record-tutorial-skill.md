# Record-Tutorial Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Claude Code skill, `record-tutorial`, that drives a scripted browser walkthrough of `demo.leaguesphere.app`, captures it as video with burned-in captions, optionally narrates it via local TTS, and uses it to produce the first tutorial: "Gameday Designer basics."

**Architecture:** Small, independently-testable Python utility modules (storyboard parsing, caption-overlay JS generation, Xvfb/ffmpeg recording control, narration rendering) live under `scripts/`, each exposed via a thin CLI wrapper so they can be invoked with plain `Bash` calls. The step-by-step *browser driving* itself (navigate/click/fill/evaluate_script against `chrome-devtools-mcp`) is performed live by whichever agent runs the skill, following the procedure documented in `SKILL.md` and the ordered steps in a storyboard file — it is not a background script, since `chrome-devtools-mcp` tools are only callable from within an agent's own tool-calling loop, not from a standalone subprocess.

**Tech Stack:** Python 3 (stdlib only — `argparse`, `subprocess`, `dataclasses`, `re`, `json`; no new dependencies), `pytest` for the scripts' own test suite, `Xvfb` + `ffmpeg` for capture, `chrome-devtools-mcp` for browser automation, Piper TTS (optional, narration pass only).

**Spec:** `leaguesphere/docs/superpowers/specs/2026-09-14-record-tutorial-skill-design.md`

## Global Constraints

- No secrets handling: the storyboard's login step uses the documented public demo account `admin@demo.local` / `DemoAdmin123!` — never introduce env-var secrets or credential files for this.
- The skill's job ends at producing local video file(s), delivered to the user directly — no repo commit of video, no hosting/publishing step.
- The silent, captioned video (`<slug>.mp4`) must always be a valid deliverable on its own; the narration pass (`<slug>.narrated.mp4`) is strictly optional and must never block or corrupt the silent output.
- Captions are burned in via an overlay injected into the live page (`evaluate_script`), updated per step — never a separate ffmpeg `drawtext`/timing track that could drift out of sync.
- Browser automation uses `chrome-devtools-mcp` only, run against a dedicated `Xvfb` display — never `claude-in-chrome` (which shares the user's live browser/tabs).
- Any step failure (pre-flight, or mid-recording) aborts cleanly: stop `ffmpeg`, discard the partial file, report which step failed — no silent partial tutorials.

---

## File Structure

```
leaguesphere/.claude/skills/record-tutorial/
├── SKILL.md                        # procedure the agent follows to run a recording
├── storyboards/
│   └── gameday-designer-basics.md  # first tutorial's content (steps + captions)
└── scripts/
    ├── storyboard.py               # parse a storyboard .md into ordered Step objects
    ├── caption_overlay.py          # build the JS snippet for the burned-in caption
    ├── print_caption_script.py     # CLI: print that JS snippet for a given caption
    ├── recording.py                # build/run Xvfb + ffmpeg x11grab commands
    ├── start_recording.py          # CLI: start a recording session, write a pidfile
    ├── stop_recording.py           # CLI: stop a recording session from its pidfile
    ├── narration.py                # build Piper TTS + padding + mux commands
    ├── render_narration.py         # CLI: render narration for a whole storyboard
    └── tests/
        ├── conftest.py             # puts scripts/ on sys.path for the test suite
        ├── test_storyboard.py
        ├── test_caption_overlay.py
        ├── test_recording.py
        ├── test_stop_recording_cli.py
        └── test_narration.py
```

Every module below is stdlib-only, so `python -m pytest scripts/tests/ -v` (run from
`leaguesphere/.claude/skills/record-tutorial/`) needs no new dependencies.

---

### Task 1: Storyboard parser

**Files:**
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/storyboard.py`
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/tests/conftest.py`
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/tests/test_storyboard.py`

**Interfaces:**
- Produces: `Step` (frozen dataclass: `caption: str`, `action: str`, `target: str`, `hold: float`), `parse_storyboard(text: str) -> list[Step]`, `load_storyboard(path: Path) -> list[Step]`, `StoryboardError(ValueError)`. Later tasks (`narration.py`, `render_narration.py`, and the Task 6 storyboard file) depend on this exact schema and these exact names.

- [ ] **Step 1: Write the failing tests**

```python
# leaguesphere/.claude/skills/record-tutorial/scripts/tests/conftest.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
```

```python
# leaguesphere/.claude/skills/record-tutorial/scripts/tests/test_storyboard.py
import pytest
from pathlib import Path

from storyboard import Step, StoryboardError, parse_storyboard, load_storyboard

VALID = """\
# Gameday Designer basics

## Step 1
- caption: Open the Gameday Designer
- action: navigate
- target: /designer/
- hold: 3

## Step 2
- caption: Click "New template"
- action: click
- target: [data-testid="new-template-button"]
- hold: 2.5
"""


def test_parses_ordered_steps():
    steps = parse_storyboard(VALID)
    assert steps == [
        Step(caption="Open the Gameday Designer", action="navigate", target="/designer/", hold=3.0),
        Step(
            caption='Click "New template"',
            action="click",
            target='[data-testid="new-template-button"]',
            hold=2.5,
        ),
    ]


def test_rejects_missing_required_field():
    text = "## Step 1\n- caption: Open it\n- action: navigate\n- hold: 3\n"
    with pytest.raises(StoryboardError, match="missing required field 'target'"):
        parse_storyboard(text)


def test_rejects_invalid_action():
    text = "## Step 1\n- caption: c\n- action: teleport\n- target: t\n- hold: 1\n"
    with pytest.raises(StoryboardError, match="invalid action 'teleport'"):
        parse_storyboard(text)


def test_rejects_non_numeric_hold():
    text = "## Step 1\n- caption: c\n- action: wait\n- target: t\n- hold: soon\n"
    with pytest.raises(StoryboardError, match="non-numeric hold"):
        parse_storyboard(text)


def test_rejects_non_positive_hold():
    text = "## Step 1\n- caption: c\n- action: wait\n- target: t\n- hold: 0\n"
    with pytest.raises(StoryboardError, match="hold must be positive"):
        parse_storyboard(text)


def test_rejects_storyboard_with_no_steps():
    with pytest.raises(StoryboardError, match="no '## Step' sections"):
        parse_storyboard("# Just a title, no steps\n")


def test_load_storyboard_reads_file(tmp_path: Path):
    p = tmp_path / "story.md"
    p.write_text(VALID)
    assert load_storyboard(p) == parse_storyboard(VALID)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd leaguesphere/.claude/skills/record-tutorial && python -m pytest scripts/tests/test_storyboard.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'storyboard'`

- [ ] **Step 3: Write the implementation**

```python
# leaguesphere/.claude/skills/record-tutorial/scripts/storyboard.py
"""Parse a tutorial storyboard markdown file into ordered Step objects."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

VALID_ACTIONS = {"navigate", "click", "fill", "wait", "hover"}


@dataclass(frozen=True)
class Step:
    caption: str
    action: str
    target: str
    hold: float


class StoryboardError(ValueError):
    pass


_FIELD_RE = re.compile(r"^-\s*(\w+):\s*(.+)$")


def parse_storyboard(text: str) -> list[Step]:
    """Parse storyboard markdown into an ordered list of Steps.

    Each step is a level-2 markdown section:

        ## Step 1
        - caption: Open the Gameday Designer
        - action: navigate
        - target: /designer/
        - hold: 3
    """
    blocks = re.split(r"(?m)^##\s+.*$", text)[1:]
    if not blocks:
        raise StoryboardError("storyboard has no '## Step' sections")

    steps: list[Step] = []
    for i, block in enumerate(blocks, start=1):
        fields = _parse_fields(block)
        for required in ("caption", "action", "target", "hold"):
            if required not in fields:
                raise StoryboardError(f"step {i} missing required field '{required}'")

        action = fields["action"]
        if action not in VALID_ACTIONS:
            raise StoryboardError(
                f"step {i} has invalid action '{action}'; must be one of {sorted(VALID_ACTIONS)}"
            )

        try:
            hold = float(fields["hold"])
        except ValueError as exc:
            raise StoryboardError(f"step {i} has non-numeric hold '{fields['hold']}'") from exc
        if hold <= 0:
            raise StoryboardError(f"step {i} hold must be positive, got {hold}")

        steps.append(Step(caption=fields["caption"], action=action, target=fields["target"], hold=hold))
    return steps


def _parse_fields(block: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in block.splitlines():
        m = _FIELD_RE.match(line.strip())
        if m:
            fields[m.group(1).lower()] = m.group(2).strip()
    return fields


def load_storyboard(path: Path) -> list[Step]:
    return parse_storyboard(path.read_text())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd leaguesphere/.claude/skills/record-tutorial && python -m pytest scripts/tests/test_storyboard.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git -C leaguesphere add .claude/skills/record-tutorial/scripts/storyboard.py \
  .claude/skills/record-tutorial/scripts/tests/conftest.py \
  .claude/skills/record-tutorial/scripts/tests/test_storyboard.py
git -C leaguesphere commit -m "feat(record-tutorial): add storyboard parser"
```

---

### Task 2: Caption overlay JS builder

**Files:**
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/caption_overlay.py`
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/print_caption_script.py`
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/tests/test_caption_overlay.py`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `OVERLAY_ID: str`, `build_caption_script(caption: str) -> str`, `build_clear_script() -> str`. `SKILL.md` (Task 5) instructs the agent to run `print_caption_script.py` and pass its stdout to the `chrome-devtools-mcp` `evaluate_script` tool before each storyboard step.

- [ ] **Step 1: Write the failing tests**

```python
# leaguesphere/.claude/skills/record-tutorial/scripts/tests/test_caption_overlay.py
import json

from caption_overlay import OVERLAY_ID, build_caption_script, build_clear_script


def test_caption_script_embeds_overlay_id():
    script = build_caption_script("Open the Gameday Designer")
    assert json.dumps(OVERLAY_ID) in script


def test_caption_script_embeds_caption_as_json_string():
    script = build_caption_script("Open the Gameday Designer")
    assert json.dumps("Open the Gameday Designer") in script


def test_caption_script_safely_escapes_hostile_caption():
    hostile = '"; document.body.innerHTML=""; //'
    script = build_caption_script(hostile)
    # The only way the hostile text can appear is inside a JSON-encoded
    # string literal -- never as a bare, breakable JS expression.
    assert json.dumps(hostile) in script
    assert 'document.body.innerHTML=""; //"' not in script.replace(json.dumps(hostile), "")


def test_clear_script_removes_overlay_by_id():
    script = build_clear_script()
    assert json.dumps(OVERLAY_ID) in script
    assert "remove()" in script
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd leaguesphere/.claude/skills/record-tutorial && python -m pytest scripts/tests/test_caption_overlay.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'caption_overlay'`

- [ ] **Step 3: Write the implementation**

```python
# leaguesphere/.claude/skills/record-tutorial/scripts/caption_overlay.py
"""Build the JS snippet used to show/update the burned-in caption overlay."""
import json

OVERLAY_ID = "lsphere-tutorial-caption"

_INJECT_TEMPLATE = """\
(function() {{
  var el = document.getElementById({overlay_id});
  if (!el) {{
    el = document.createElement('div');
    el.id = {overlay_id};
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
      'background:rgba(0,0,0,0.75);color:#fff;font:600 28px/1.4 sans-serif;' +
      'text-align:center;padding:16px 24px;pointer-events:none;';
    document.body.appendChild(el);
  }}
  el.textContent = {caption};
}})();
"""


def build_caption_script(caption: str) -> str:
    """Return a JS snippet that creates (if needed) and updates the caption overlay.

    Both the element id and the caption text are JSON-encoded before being
    embedded, so arbitrary caption text (quotes, backslashes, HTML) can
    never break out of the JS string literal it's embedded in.
    """
    return _INJECT_TEMPLATE.format(overlay_id=json.dumps(OVERLAY_ID), caption=json.dumps(caption))


def build_clear_script() -> str:
    """Return a JS snippet that removes the caption overlay, if present."""
    return (
        "(function() { var el = document.getElementById(%s); "
        "if (el) { el.remove(); } })();" % json.dumps(OVERLAY_ID)
    )
```

```python
#!/usr/bin/env python3
# leaguesphere/.claude/skills/record-tutorial/scripts/print_caption_script.py
"""CLI: print the caption-overlay JS snippet for a given caption, or --clear."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from caption_overlay import build_caption_script, build_clear_script  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--caption", help="Caption text to show")
    group.add_argument("--clear", action="store_true", help="Print the script that removes the overlay")
    args = parser.parse_args()
    print(build_clear_script() if args.clear else build_caption_script(args.caption))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd leaguesphere/.claude/skills/record-tutorial && python -m pytest scripts/tests/test_caption_overlay.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git -C leaguesphere add .claude/skills/record-tutorial/scripts/caption_overlay.py \
  .claude/skills/record-tutorial/scripts/print_caption_script.py \
  .claude/skills/record-tutorial/scripts/tests/test_caption_overlay.py
git -C leaguesphere commit -m "feat(record-tutorial): add caption overlay JS builder"
```

---

### Task 3: Recording controller (Xvfb + ffmpeg)

**Files:**
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/recording.py`
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/start_recording.py`
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/stop_recording.py`
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/tests/test_recording.py`
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/tests/test_stop_recording_cli.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `RecordingSession` (dataclass: `display`, `resolution`, `output_path`, `xvfb_proc`, `ffmpeg_proc`), `build_xvfb_command(display, resolution) -> list[str]`, `build_ffmpeg_command(display, resolution, output_path) -> list[str]`, `start(display, resolution, output_path, popen=subprocess.Popen) -> RecordingSession`, `stop(session) -> None`. `start_recording.py` writes `{"xvfb_pid": int, "ffmpeg_pid": int, "output": str}` to a pidfile; `stop_recording.py` reads that exact shape. `SKILL.md` (Task 5) documents these two CLIs as the recording start/stop commands.

- [ ] **Step 1: Write the failing tests**

```python
# leaguesphere/.claude/skills/record-tutorial/scripts/tests/test_recording.py
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
```

```python
# leaguesphere/.claude/skills/record-tutorial/scripts/tests/test_stop_recording_cli.py
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

    for pid in (xvfb_stub.pid, ffmpeg_stub.pid):
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd leaguesphere/.claude/skills/record-tutorial && python -m pytest scripts/tests/test_recording.py scripts/tests/test_stop_recording_cli.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'recording'`, and the CLI test fails because `stop_recording.py` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```python
# leaguesphere/.claude/skills/record-tutorial/scripts/recording.py
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
```

```python
#!/usr/bin/env python3
# leaguesphere/.claude/skills/record-tutorial/scripts/start_recording.py
"""CLI: start the Xvfb + ffmpeg recording session and persist its PIDs to a pidfile."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from recording import start  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--display", required=True, help="X display to use, e.g. :99")
    parser.add_argument("--resolution", required=True, help="e.g. 1280x720")
    parser.add_argument("--output", required=True, help="Output .mp4 path")
    parser.add_argument("--pidfile", required=True, help="Where to write the session's PIDs")
    args = parser.parse_args()

    session = start(args.display, args.resolution, args.output)
    Path(args.pidfile).write_text(json.dumps({
        "xvfb_pid": session.xvfb_proc.pid,
        "ffmpeg_pid": session.ffmpeg_proc.pid,
        "output": args.output,
    }))
    print(f"recording started -> {args.output}")


if __name__ == "__main__":
    main()
```

```python
#!/usr/bin/env python3
# leaguesphere/.claude/skills/record-tutorial/scripts/stop_recording.py
"""CLI: stop a recording session started by start_recording.py.

Runs as a fresh process that only has PIDs (loaded from the pidfile written
by a different process), so it signals by PID directly rather than reusing
recording.stop(), which operates on in-process subprocess.Popen objects.
"""
import argparse
import json
import os
import signal
import time
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pidfile", required=True)
    args = parser.parse_args()

    pidfile = Path(args.pidfile)
    info = json.loads(pidfile.read_text())

    os.kill(info["ffmpeg_pid"], signal.SIGINT)
    _wait_for_exit(info["ffmpeg_pid"], timeout=15)

    os.kill(info["xvfb_pid"], signal.SIGTERM)
    _wait_for_exit(info["xvfb_pid"], timeout=5)

    pidfile.unlink()
    print(f"recording stopped -> {info['output']}")


def _wait_for_exit(pid: int, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        time.sleep(0.2)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd leaguesphere/.claude/skills/record-tutorial && python -m pytest scripts/tests/test_recording.py scripts/tests/test_stop_recording_cli.py -v`
Expected: PASS (4 tests). Note: `test_stop_recording_kills_both_processes_and_removes_pidfile` uses real `sleep` processes and sends real signals — no `ffmpeg`/`Xvfb` binary needed for this test.

- [ ] **Step 5: Commit**

```bash
git -C leaguesphere add .claude/skills/record-tutorial/scripts/recording.py \
  .claude/skills/record-tutorial/scripts/start_recording.py \
  .claude/skills/record-tutorial/scripts/stop_recording.py \
  .claude/skills/record-tutorial/scripts/tests/test_recording.py \
  .claude/skills/record-tutorial/scripts/tests/test_stop_recording_cli.py
git -C leaguesphere commit -m "feat(record-tutorial): add Xvfb/ffmpeg recording controller"
```

---

### Task 4: Narration builder (optional pass)

**Files:**
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/narration.py`
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/render_narration.py`
- Create: `leaguesphere/.claude/skills/record-tutorial/scripts/tests/test_narration.py`

**Interfaces:**
- Consumes: `Step` from Task 1 (`storyboard.py`).
- Produces: `render_step_audio(step, voice_model, out_wav, run=subprocess.run) -> Path`, `build_pad_command(wav_path, target_seconds, out_path) -> list[str]`, `build_concat_list(wav_paths, concat_file) -> Path`, `build_mux_command(video_path, audio_path, output_path) -> list[str]`. `render_narration.py` is the CLI `SKILL.md` (Task 5) documents for the optional narration pass.

- [ ] **Step 1: Write the failing tests**

```python
# leaguesphere/.claude/skills/record-tutorial/scripts/tests/test_narration.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd leaguesphere/.claude/skills/record-tutorial && python -m pytest scripts/tests/test_narration.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'narration'`

- [ ] **Step 3: Write the implementation**

```python
# leaguesphere/.claude/skills/record-tutorial/scripts/narration.py
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
```

```python
#!/usr/bin/env python3
# leaguesphere/.claude/skills/record-tutorial/scripts/render_narration.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd leaguesphere/.claude/skills/record-tutorial && python -m pytest scripts/tests/test_narration.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git -C leaguesphere add .claude/skills/record-tutorial/scripts/narration.py \
  .claude/skills/record-tutorial/scripts/render_narration.py \
  .claude/skills/record-tutorial/scripts/tests/test_narration.py
git -C leaguesphere commit -m "feat(record-tutorial): add optional Piper TTS narration pass"
```

---

### Task 5: SKILL.md — the recording procedure

**Files:**
- Create: `leaguesphere/.claude/skills/record-tutorial/SKILL.md`

**Interfaces:**
- Consumes: all CLI entry points from Tasks 1-4 (`print_caption_script.py`, `start_recording.py`, `stop_recording.py`, `render_narration.py`) and `storyboard.py`'s schema (documented for storyboard authors).
- Produces: the procedure Task 6 (storyboard authoring) and Task 7/8 (dry runs) follow.

This task is documentation, not TDD'd code — its "test" is Task 7's dry run actually
following it successfully end to end.

- [ ] **Step 1: Write `SKILL.md`**

```markdown
---
name: record-tutorial
description: Record a captioned tutorial video of a LeagueSphere feature by scripting a walkthrough of demo.leaguesphere.app
type: skill
---

# Record Tutorial Skill

Drives a scripted browser walkthrough of `demo.leaguesphere.app`, captures it as an
.mp4 with burned-in captions, and optionally layers a local-TTS voice track on top.
Each tutorial's content lives in its own storyboard file under `storyboards/` — this
skill is the reusable runner, not tied to any one feature.

## Prerequisites

- `ffmpeg` and `Xvfb` installed on whatever host runs the recording.
- `chrome-devtools-mcp` tools available to the agent (this is how the browser is
  actually driven — never `claude-in-chrome`, which shares the user's live browser).
- Piper TTS binary + a voice model — **only** required for the optional narration
  pass (Step 5 below). Everything else works without it.
- Python 3, stdlib only: `cd leaguesphere/.claude/skills/record-tutorial && python -m
  pytest scripts/tests/ -v` should pass before recording anything.

## Storyboard schema

A storyboard is a markdown file under `storyboards/` with one `## Step N` section per
action:

```
## Step 1
- caption: Open the Gameday Designer
- action: navigate
- target: /designer/
- hold: 3
```

`action` is one of `navigate` / `click` / `fill` / `wait` / `hover`. `target` is a URL
(for `navigate`) or a CSS selector (for everything else) — prefer `[data-testid="..."]`
selectors already present in `gameday_designer/src/**/*.tsx` over fragile structural
selectors. `hold` is how many seconds to keep that caption on screen (and, for
`fill`, doubles as the narration line's target duration in the optional pass).
Validate a storyboard parses before recording:

```bash
cd leaguesphere/.claude/skills/record-tutorial
PYTHONPATH=scripts python3 -c "from storyboard import load_storyboard; print(load_storyboard('storyboards/<slug>.md'))"
```

## Procedure

### 0. Pre-flight (off camera — do this before starting the recording)

1. Log in to `https://demo.leaguesphere.app` via `chrome-devtools-mcp` as
   `admin@demo.local` / `DemoAdmin123!` (documented public demo credentials — see
   `docs/topics/deployment/demo-deployment.md`).
2. Check whether a gameday suitable for the storyboard's "apply template" step
   already exists (demo data resets nightly). If not, create one through the admin
   UI now, off camera, so the recorded footage shows only the actual feature being
   taught, not incidental setup.
3. Navigate back to a neutral starting page (e.g. the dashboard) so the recording
   starts from a clean, predictable screen.

**Verify the display binding before relying on it:** confirm `chrome-devtools-mcp`'s
browser instance actually renders on the `Xvfb` display started in Step 2 below (not
its own default browser instance) — e.g. take a screenshot via
`chrome-devtools-mcp` right after starting `Xvfb` and check it isn't blank/errored.
If `chrome-devtools-mcp` cannot be pointed at an arbitrary `DISPLAY`, launch Chrome
manually first (`DISPLAY=<display> google-chrome --remote-debugging-port=9222
--no-first-run`) and use `chrome-devtools-mcp`'s page-selection tools to attach to
that already-running instance instead of letting it launch its own.

### 1. Start the virtual display + capture

```bash
cd leaguesphere/.claude/skills/record-tutorial
python scripts/start_recording.py \
  --display :99 --resolution 1280x720 \
  --output /tmp/<slug>.mp4 --pidfile /tmp/<slug>-recording.pid
```

### 2. Walk the storyboard

For each step in the storyboard, in order:

1. Print and inject the caption overlay:
   `python scripts/print_caption_script.py --caption "<step caption>"` → pass the
   printed JS to `chrome-devtools-mcp`'s `evaluate_script`.
2. Perform the step's `action` against `target` via the matching
   `chrome-devtools-mcp` tool (`navigate_page`, `click`, `fill`, `hover`, or
   `wait_for`).
3. Hold for `hold` seconds before moving to the next step (so the caption is
   readable and, if narrated later, has enough room).

### 3. Stop the capture

```bash
python scripts/print_caption_script.py --clear   # then evaluate_script it, to end clean
python scripts/stop_recording.py --pidfile /tmp/<slug>-recording.pid
```

This produces `/tmp/<slug>.mp4` — the required deliverable, captions burned in, no
narration.

### 4. Failure handling

If pre-flight or any storyboard step fails: run `stop_recording.py` immediately,
delete the partial `<slug>.mp4`, and report which step failed. Never hand back a
partial or broken video as if it were finished.

### 5. Optional: add narration

Only after Step 3 has produced a valid `<slug>.mp4`:

```bash
python scripts/render_narration.py \
  --storyboard storyboards/<slug>.md \
  --video /tmp/<slug>.mp4 \
  --voice-model en_US-amy-medium \
  --output /tmp/<slug>.narrated.mp4
```

If Piper isn't installed or this fails, `<slug>.mp4` (silent, captioned) remains the
valid deliverable — report that narration was skipped, don't fail the whole run.

### 6. Deliver

Hand the produced file(s) (`<slug>.mp4`, and `<slug>.narrated.mp4` if made) to the
user directly. This skill does not publish or host anything.
```

- [ ] **Step 2: Commit**

```bash
git -C leaguesphere add .claude/skills/record-tutorial/SKILL.md
git -C leaguesphere commit -m "docs(record-tutorial): add skill procedure"
```

---

### Task 6: "Gameday Designer basics" storyboard

**Files:**
- Create: `leaguesphere/.claude/skills/record-tutorial/storyboards/gameday-designer-basics.md`

**Interfaces:**
- Consumes: `storyboard.py`'s schema from Task 1 (the file must parse via `load_storyboard`).
- Produces: the content Task 7's dry run records.

Exact selectors can't be written from reading backend code alone — the Designer is a
React app whose interactive elements (drag targets, canvas nodes, wiring handles) need
to be confirmed live. `grep -ro 'data-testid="[a-zA-Z0-9_-]*"' gameday_designer/src`
is a useful starting list (`new-template-button`, `flow-toolbar`,
`gameday-metadata-accordion`, `publish-schedule-button`, etc. already exist), but the
canvas's own stage/game nodes are dynamically generated and need live inspection.

- [ ] **Step 1: Inspect the live Designer**

Using `chrome-devtools-mcp`, log in to `https://demo.leaguesphere.app` as
`admin@demo.local` / `DemoAdmin123!`, open the Gameday Designer (`/designer/`), and
use `take_snapshot` / `evaluate_script` to record the real selectors/URLs for each of:
opening the designer, starting a new template, adding a stage, adding a game, wiring a
winner/loser progression between two games, saving the template with a name, opening
an existing (or the just-created) gameday, and applying the saved template to it.

- [ ] **Step 2: Write the storyboard file**

Author `storyboards/gameday-designer-basics.md` covering the full journey (per the
spec's scope decision): blank canvas → build a small template (a couple of
stages/games, one winner/loser progression) → save it named → apply it to a gameday →
payoff shot of the resulting scheduled games. Use the schema from Task 1/`SKILL.md`
and the selectors discovered in Step 1. Each caption should be a short, plain-language
sentence a viewer can read in the `hold` window (2–4 s for short captions, more for
longer ones).

- [ ] **Step 3: Validate it parses**

Run: `cd leaguesphere/.claude/skills/record-tutorial && PYTHONPATH=scripts python3 -c "from storyboard import load_storyboard; steps = load_storyboard('storyboards/gameday-designer-basics.md'); print(len(steps), 'steps')"`
Expected: prints a step count with no exception.

- [ ] **Step 4: Commit**

```bash
git -C leaguesphere add .claude/skills/record-tutorial/storyboards/gameday-designer-basics.md
git -C leaguesphere commit -m "docs(record-tutorial): add Gameday Designer basics storyboard"
```

---

### Task 7: Dry-run recording — produce the first tutorial

**Files:** none created; this task executes the skill end to end.

**Interfaces:**
- Consumes: `SKILL.md` (Task 5) and `storyboards/gameday-designer-basics.md` (Task 6).
- Produces: `gameday-designer-basics.mp4`, delivered to the user.

- [ ] **Step 1: Run the full procedure from `SKILL.md`** against
  `storyboards/gameday-designer-basics.md`, producing `gameday-designer-basics.mp4`.

- [ ] **Step 2: Watch the result end to end** and confirm: captions stay in sync with
  the on-screen action at each step, no step was skipped or mistimed, and the payoff
  (applied template → scheduled games appear) is clearly visible.

- [ ] **Step 3: Fix and re-record** anything wrong — most likely a stale selector from
  Task 6's live inspection, or a `hold` duration too short to read. Update the
  storyboard file and re-run Step 1 until Step 2 passes cleanly.

- [ ] **Step 4: Deliver** `gameday-designer-basics.mp4` to the user via file delivery.

---

### Task 8: Narrated dry run (optional path verification)

**Files:** none created; this task executes the optional narration pass.

**Interfaces:**
- Consumes: `gameday-designer-basics.mp4` from Task 7 and `render_narration.py` from
  Task 4.

- [ ] **Step 1: Run** `scripts/render_narration.py` against the storyboard and the
  finished `gameday-designer-basics.mp4` from Task 7, producing
  `gameday-designer-basics.narrated.mp4`.

- [ ] **Step 2: Watch the narrated result** and confirm the voice track roughly tracks
  each caption's `hold` window (per-clip padding, not frame-accurate sync — see the
  spec's non-goals) and that a missing/broken Piper install would not have blocked
  Task 7's silent deliverable.

- [ ] **Step 3: Deliver** `gameday-designer-basics.narrated.mp4` to the user via file
  delivery, noting it's the optional narrated variant.
