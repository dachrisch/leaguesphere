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

**Capture mechanism: CDP screenshot slideshow, not continuous screen recording.**
chrome-devtools-mcp always launches its own Chrome on the host's *real* desktop
session (confirmed via `ps` — it passes `--ozone-platform=wayland` and no
`--headless`/`--remote-debugging-port` override is available to us), never onto an
isolated virtual display we control. That makes `Xvfb` + `ffmpeg -f x11grab`
(`recording.py`) unusable: it captures a display chrome-devtools-mcp's browser was
never drawn on, producing a blank video. Recording the host's *actual* screen instead
(GNOME's `org.gnome.Mutter.ScreenCast` + PipeWire + GStreamer) was explored --
`wayland_recording.py`, `start_wayland_recording.py`, `stop_wayland_recording.py`,
`record_wayland.js` and their tests still sit in `scripts/` -- but was abandoned: it
would visibly take over a window on the operator's live desktop for the whole
recording and the D-Bus/PipeWire pipeline was never validated end-to-end. Those files
are left as a starting point if continuous screen capture is worth revisiting later;
they are not wired into the procedure below.

Instead, `slideshow.py` takes one chrome-devtools-mcp screenshot per storyboard step
(caption already burned in via `evaluate_script`, same as before) and stitches the
stills into an mp4 with ffmpeg's concat demuxer, holding each frame for that step's
`hold` duration. This never touches or displays anything on the operator's real
screen, works headfully or headlessly, and needs nothing beyond tools already
available (`take_screenshot`, `evaluate_script`). The tradeoff: the output is a series
of clean stills, not smooth continuous motion (no live cursor movement, no
mid-transition animation frames).

## Prerequisites

- `ffmpeg` installed on whatever host runs the recording (for `slideshow.py`'s
  concat-and-encode step). `Xvfb` is only needed if you deliberately revive the old
  x11grab path -- not part of the default procedure.
- `chrome-devtools-mcp` tools available to the agent (this is how the browser is
  actually driven — never `claude-in-chrome`, which shares the user's live browser).
- Piper TTS binary + a voice model — **only** required for the optional narration
  pass (Step 4 below). Everything else works without it.
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
selectors, falling back to a plain-English description of the element (resolved by
visible text or DOM structure at recording time) when no stable selector exists.
`hold` is how many seconds to hold that step's frame in the final video (and, for
`fill`, doubles as the narration line's target duration in the optional pass).

**Team/dynamic-reference dropdowns are `react-select`, not plain `<select>`s.** Any
Home/Away/Official selector in the Gameday Designer is one of these. The
accessibility-tree `combobox` node chrome-devtools-mcp's `click` tool would target is
a ~0x0px dummy input that only holds keyboard focus -- clicking it directly times out
("did not become interactive"). Open and pick from these via `evaluate_script`
instead:

```js
// open: dispatch on the ancestor .react-select__control, not the input itself
var control = inputEl.closest('.react-select__control');
var opts = {bubbles: true, cancelable: true, view: window, button: 0};
control.dispatchEvent(new MouseEvent('mousedown', opts));
control.dispatchEvent(new MouseEvent('mouseup', opts));
control.dispatchEvent(new MouseEvent('click', opts));

// pick: match the rendered .react-select__option by exact textContent
var match = Array.from(document.querySelectorAll('.react-select__menu .react-select__option'))
  .find(function(o) { return o.textContent === desiredLabel; });
var evt = {bubbles: true, cancelable: true, view: window, button: 0};
match.dispatchEvent(new MouseEvent('mousedown', evt));
match.dispatchEvent(new MouseEvent('mouseup', evt));
match.dispatchEvent(new MouseEvent('click', evt));
```

Direct-team options are plain team names; indirect/dynamic references appear as
"⚡ Winner of `<Game>` (`<Stage>`)" / "💔 Loser of `<Game>` (`<Stage>`)" grouped by
stage — these only exist for games that already exist elsewhere in the schedule when
the menu is opened, so add and save the games being referenced first.

Validate a storyboard parses before recording:

```bash
cd leaguesphere/.claude/skills/record-tutorial
PYTHONPATH=scripts python3 -c "from storyboard import load_storyboard; print(load_storyboard('storyboards/<slug>.md'))"
```

## Procedure

### 0. Pre-flight (before capturing any frames)

1. Log in to `https://demo.leaguesphere.app` via `chrome-devtools-mcp` as
   `admin@demo.local` / `DemoAdmin123!` (documented public demo credentials — see
   `docs/topics/deployment/demo-deployment.md`).
2. Check whether a gameday or template left over from a previous run already exists
   (demo data resets nightly, but a same-day rerun can still collide) and delete it
   first — the recording should start from the clean state the storyboard's own
   notes describe. **The Template Library's "Delete" button is unreliable via
   `evaluate_script`'s synthetic clicks**: it shows the confirm-with-Undo toast but
   the delete frequently never actually commits (confirmed via
   `list_network_requests` -- no DELETE call fires), even retried, even with the
   real `click` tool. Don't burn time on it. Go straight to the API instead, which
   works immediately:
   ```js
   async () => {
     function getCookie(name) {
       const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
       return m ? m.pop() : '';
     }
     const csrftoken = getCookie('csrftoken');
     const res = await fetch(`/api/designer/templates/${id}/`, {
       method: 'DELETE', credentials: 'same-origin',
       headers: {'X-CSRFToken': csrftoken},
     });
     return res.status; // 204 on success
   }
   ```
   List current templates first with `GET /api/designer/templates/?sharing=association`
   (or `personal`/`global`) to get the `id`s. Gamedays with no designer state clutter
   is checked the same way: `GET /api/gamedays/?search=&has_designer_state=true`.
3. Resize the page to the storyboard's target resolution (default 1920x1080) with
   `resize_page`, and navigate to a neutral starting page so the first captured frame
   is predictable.
4. `mkdir` a scratch frames directory (e.g. under your scratchpad), one per recording
   run — `<slug>-frames/`.

### 1. Walk the storyboard, capturing frames per step (with a visible, *moving* cursor)

A single before/after still per step doesn't show *where* the action happened —
viewers can't follow along. And a single intermediate point (old/first attempt at
this: jump to 60%, then jump to 100%) doesn't read as movement either — it reads as
two teleports, which looks broken/cheap. Use `cursor_overlay.py` (mirrored as inline
`evaluate_script` helpers, same pattern as `caption_overlay.py`) to draw a synthetic
pointer that eases through **~6-7 interpolated points** toward the target before
each click, then flashes a click ring:

1. Install the helpers once at the start of the run: `window.__lsCaption`,
   `window.__lsCenter`, `window.__lsRipple`, `window.__lsClearRipple`,
   `window.__lsMoveTo(x, y, fraction)` (positions the cursor at `fraction` of the
   way from its last resting spot to `(x, y)`, **eased** via
   `1 - (1-t)**3` / `cursor_overlay.ease_out_cubic` — not linear, so early steps
   cover most of the distance and the cursor visibly decelerates into the target
   the way a real mouse does), and `window.__lsMoveStep(x, y, i, n)` (shorthand for
   `__lsMoveTo(x, y, i/n)`) — plus `__lsOpenSelectControl`/`__lsFindOptionCenter`/
   `__lsClickOption` for react-select.
2. For each clickable step, with `N = 7`:
   - For `i = 1..N-1`: `__lsMoveStep(x, y, i, N)`, screenshot (hold ~0.05s each —
     these are the "moving" frames; skimping on their count is exactly what makes
     the result look cheap, don't drop below ~5-6).
   - Final frame: `__lsMoveTo(x, y, 1)` + `__lsRipple(x, y)` + the actual action
     (`el.click()`, or the react-select open/pick call) + `__lsCaption(...)`, one
     screenshot held for the step's configured `hold`.
   - Clear the *previous* step's ripple (`__lsClearRipple()`) at the start of the
     *next* step's first move call, not right after showing it — removing it
     before the click-frame's screenshot defeats the point.
3. React-select fields (see the workaround above) are two click-like moments —
   opening the control and picking the option — so run step 2's full N-frame
   sequence twice: once to open, once to select. That's ~14 frames for one
   dropdown; don't shortcut this to save calls, the doubled cost is what makes
   both the open and the selection visible.
4. For a step whose click triggers client-side navigation (no full page reload,
   e.g. React Router), the overlay divs are appended to `document.body` and survive
   the route change — no re-injection needed, unlike a real `navigate_page` browser
   navigation (which *does* destroy them and resets the helpers entirely; reinstall
   them and re-inject caption/cursor after those).
5. Scroll the relevant element into view first if it isn't already on screen (the
   designer canvas is a long scrollable page) — do this once, before the first
   `__lsMoveStep` call of the sequence, in the same script call that computes the
   center, so the rect reflects the post-scroll position.
6. Name frames `frame_<step>_<sub>.png` (zero-padded), one growing group per
   storyboard step — the exact sub-frame count varies by step (plain click: 7,
   fill: 8-ish with the type_text call spliced in, react-select: 14), so assembly
   (below) infers durations from the grouping rather than needing a fixed count.
7. Spot-check a frame or two with `Read` as you go — cheaper to catch a wrong
   selector, a stray open dropdown, or a misplaced cursor mid-run than after 20
   steps are done. Specifically check that early frames in a movement sequence are
   clearly *between* the previous and next click points, not clustered at one end.

### 2. Assemble the video

Group frames by their `<step>` prefix; every frame in a group but the last is a
movement beat held briefly (0.05s -- short enough that ~7 of them read as one fluid
motion rather than a slideshow), and the last carries that step's real `hold` from
the storyboard — this is what lets step 1's sub-frame count differ from step 2's
without hand-tracking durations during capture:

```bash
cd leaguesphere/.claude/skills/record-tutorial
PYTHONPATH=scripts python3 -c "
import re
from collections import defaultdict
from pathlib import Path
from storyboard import load_storyboard
from slideshow import render

frames_dir = Path('<frames-dir>')
steps = load_storyboard('storyboards/<slug>.md')

by_step = defaultdict(list)
for f in sorted(frames_dir.glob('frame_*.png')):
    step_num = int(re.match(r'frame_(\d+)_(\d+)\.png', f.name).group(1))
    by_step[step_num].append(f)
assert set(by_step) == set(range(1, len(steps) + 1))

frames = []
for i, step in enumerate(steps, start=1):
    group = sorted(by_step[i])
    frames += [(str(f), 0.05) for f in group[:-1]]
    frames.append((str(group[-1]), step.hold))

render(frames, frames_dir / 'concat.txt', '<output-dir>/<slug>.mp4')
"
```

This produces `<slug>.mp4` — the required deliverable, captions burned in, no
narration. Verify it with `ffprobe` (duration should roughly match the sum of the
storyboard's `hold` values plus ~0.1-0.3s per step for the movement/click beats;
codec `h264`; resolution matching Step 0.3) before
handing it back.

### 3. Failure handling

If pre-flight or any storyboard step fails: stop, do not assemble a video from a
partial frame set, and report which step failed. Never hand back a partial or broken
video as if it were finished.

### 4. Optional: add narration

Only after Step 2 has produced a valid `<slug>.mp4`:

```bash
python scripts/render_narration.py \
  --storyboard storyboards/<slug>.md \
  --video <output-dir>/<slug>.mp4 \
  --voice-model en_US-amy-medium \
  --output <output-dir>/<slug>.narrated.mp4
```

If Piper isn't installed or this fails, `<slug>.mp4` (silent, captioned) remains the
valid deliverable — report that narration was skipped, don't fail the whole run.

### 5. Deliver

Hand the produced file(s) (`<slug>.mp4`, and `<slug>.narrated.mp4` if made) to the
user directly. This skill does not publish or host anything.
