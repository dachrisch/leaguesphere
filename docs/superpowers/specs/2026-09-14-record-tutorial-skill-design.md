# Record-Tutorial Skill — Design

**Status:** Draft
**Date:** 2026-09-14

## Purpose

LeagueSphere needs video tutorials for end users, starting with **"How to use the
Gameday Designer and templates."** Rather than build a one-off recording, this design
creates a reusable Claude Code skill, `record-tutorial`, that drives a scripted
walkthrough of `demo.leaguesphere.app` in a real browser, captures it as video with
burned-in captions, and optionally layers a locally-generated voice narration on top.
Each tutorial's actual content (what to click, what to say) lives in a separate
**storyboard file**, so the same skill produces future tutorials too.

## Why demo stage

`demo.leaguesphere.app` is the right recording target: public URL, synthetic data,
auto-resets nightly (see `container/docs/leaguesphere-environments.md`), and ships
**intentionally public demo credentials** (`admin@demo.local` / `DemoAdmin123!`,
documented in `docs/topics/deployment/demo-deployment.md` and
`docs/topics/guides/demo.md`). No secrets handling is needed — the storyboard's login
step references the documented admin account directly.

## Non-goals

- Hosting/publishing the finished video (delivered to the user as a file; where it's
  published afterward is out of scope).
- Voiceover on the first cut — narration is an optional, separate post-processing step
  that can be skipped entirely and added later without re-recording.
- General-purpose screen recording unrelated to LeagueSphere (the skill is scoped to
  driving LeagueSphere's own UI).

## Architecture

```
storyboard.md  ──►  runner  ──►  [Xvfb + Chrome, driven via chrome-devtools-mcp]
                       │                        │
                       │                        ├─ before each step: inject/update
                       │                        │  burned-in caption overlay (JS)
                       │                        └─ perform the step's browser action
                       │
                       ├─► ffmpeg (x11grab) records the whole run → <slug>.mp4
                       │
                       └─► (optional) Piper TTS renders each caption line → audio
                            clips → ffmpeg muxes onto <slug>.mp4 → <slug>.narrated.mp4
```

### Components

1. **Storyboard file** (`storyboards/<slug>.md` inside the skill directory) — the only
   thing that changes between tutorials. An ordered list of steps, each with:
   - `caption` — the on-screen caption text (also the narration line, if narrated)
   - `action` — `navigate` / `click` / `fill` / `wait` / `hover`
   - `target` — CSS selector or description used to resolve the element
   - `hold` — seconds to hold the caption/frame before advancing (gives viewers time
     to read; also the unit narration timing is built from)

2. **Runner** (`scripts/run_recording.sh` + a small driver script) —
   - Starts `Xvfb` on a scratch `:DISPLAY`.
   - Launches Chrome via `chrome-devtools-mcp` pointed at that display (not the user's
     live browser/tabs — recordings must be reproducible and safe to run unattended).
   - Runs a **pre-flight check** against demo stage: confirms a suitable target
     gameday exists for the "apply template" steps; if not, creates one off-camera
     through the admin/API before recording starts, so the recorded footage only shows
     the actual Designer workflow, not incidental setup.
   - Starts `ffmpeg -f x11grab` against the virtual display.
   - Walks the storyboard step by step: injects/updates the caption overlay via
     `evaluate_script`, then performs the step's action, then waits `hold` seconds.
   - Stops `ffmpeg` after the last step (plus a short trailing pad), producing
     `<slug>.mp4`.

3. **Caption overlay** — a small fixed-position, styled `<div>` injected into the live
   page (not a separate ffmpeg `drawtext` filter), so what's burned into the video is
   exactly what's on screen at that instant — no separate timing track to keep in
   sync.

4. **Optional narration pass** (`scripts/add_narration.sh`) — for each storyboard step,
   render `caption` to a short `.wav` via **Piper TTS** (local, open-source, MIT
   license, no API keys/network calls), concatenate with silence padding to match each
   step's `hold` duration, and mux the result onto `<slug>.mp4` with `ffmpeg` to produce
   `<slug>.narrated.mp4`. This is a fully separate script — the silent captioned video
   is always the working output even if Piper isn't installed.

5. **Delivery** — the runner's final action hands `<slug>.mp4` (and
   `<slug>.narrated.mp4` if requested) to the user via file delivery. No repo commit,
   no hosting step.

### Prerequisites (documented in `SKILL.md`, checked at runner start)

- `ffmpeg`, `Xvfb` on the host running the recording.
- `chrome-devtools-mcp` available.
- Piper TTS binary + a voice model, only required for the optional narration pass.

## File layout

```
leaguesphere/.claude/skills/record-tutorial/
├── SKILL.md                     # how to invoke, prerequisites, storyboard schema
├── storyboards/
│   └── gameday-designer-basics.md
└── scripts/
    ├── run_recording.sh         # Xvfb + chrome-devtools-mcp + ffmpeg capture loop
    └── add_narration.sh         # optional Piper TTS narration pass
```

## First tutorial: "Gameday Designer basics"

Scope (per user decision): the **full journey**, so a viewer sees the actual payoff,
not just the editor in isolation.

1. Log in to demo stage as `admin@demo.local`.
2. Open the Gameday Designer.
3. Build a small template from a blank canvas: add a couple of stages/games, wire a
   winner/loser progression between them.
4. Save it as a named template.
5. Navigate to a gameday (created off-camera in the pre-flight step if none suitable
   exists) and apply the saved template to it.
6. Show the resulting scheduled games as the payoff shot.

This becomes `storyboards/gameday-designer-basics.md`, written as part of
implementation (not finalized in this spec) since exact selectors/copy should be
verified against the live Designer UI while building the storyboard.

## Error handling

- Pre-flight failure (demo stage unreachable, login fails): abort before starting
  `ffmpeg` — no partial/broken recording produced.
- Mid-recording step failure (selector not found, action times out): abort the
  recording, stop `ffmpeg`, discard the partial file, and report which step failed —
  no silent partial tutorials.
- Narration pass failure (Piper missing/errors): leave `<slug>.mp4` (silent, captioned)
  as the valid deliverable; report that narration was skipped.

## Testing

- Dry run against demo stage producing `gameday-designer-basics.mp4`, watched
  end-to-end to confirm captions stay in sync with on-screen actions and the payoff
  (applied template → scheduled games) is visible.
- Optional: one narrated run to confirm the Piper narration pass and muxing work,
  independent of the silent-video path.
