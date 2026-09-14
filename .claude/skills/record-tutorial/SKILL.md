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
