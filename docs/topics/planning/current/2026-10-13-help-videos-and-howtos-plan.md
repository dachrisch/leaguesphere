# Help Videos & Howtos Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Record four silent, German-captioned walkthrough videos for the headline 2026 features and wire them into the in-app help section, so each `/help/<slug>/` topic shows a YouTube walkthrough alongside its already-written Markdown howto.

**Architecture:** The howtos already exist as German Markdown in PR #2056's `league_manager/help/` module (`content/<slug>.de.md`, rendered server-side). Each `HelpTopic` in `registry.py` already carries `video` (a YouTube *embed* URL, rendered as a 16:9 iframe by `topic.html`) and `tutorial` (an external link) fields — both `None`. This plan produces the videos with the existing `record-tutorial` skill, uploads them to YouTube, and fills `video=` / `tutorial=` for the four feature topics. No new app, no migrations.

**Tech Stack:** `record-tutorial` skill (chrome-devtools-mcp + ffmpeg slideshow), Python-Markdown (help loader), Django (help views + tests), YouTube (manual upload/host).

---

## Scope & decisions (locked)

- **Features (4):** `share-widget`, `gameday-designer`, `referee-import`, `live-status`. (`getting-started` is out of scope.)
- **Howtos:** the existing `league_manager/help/content/<slug>.de.md` files are the howto; refine them to match what the video shows. Optional English `.en.md` is a stretch.
- **Video language:** German captions (matches the German-first help content). Narration is **optional** — `piper` is not installed on this host, so treat voice-over as a stretch and ship silent captioned mp4s.
- **Hosting:** YouTube. `video=` must be an **embed** URL: `https://www.youtube.com/embed/<videoId>` (not the `watch?v=` URL — `topic.html` uses it directly as an iframe `src`).
- **Branch base:** branch off PR #2056 (`feat/in-app-help-section`), because `registry.py` only exists there.

---

## Task 0: Branch setup

**Files:** none (git only).

**Step 1: Fetch PR #2056's branch**

Run:
```bash
cd /home/cda/dev/leaguesphere
git fetch origin feat/in-app-help-section
```
Expected: fetches `origin/feat/in-app-help-section` without error.

**Step 2: Create the working branch off it**

Run:
```bash
git checkout -b feat/help-videos origin/feat/in-app-help-section
```
Expected: `Switched to a new branch 'feat/help-videos'`.

**Step 3: Confirm the help module is present and green**

Run:
```bash
ls league_manager/help/content/
pytest league_manager/tests/test_help.py -q
```
Expected: the four `.de.md` files list; tests pass. If `registry.py`/content is missing, #2056 is not the base — stop and reconcile.

**Step 4: Confirm tooling**

Run:
```bash
command -v ffmpeg && command -v piper || echo "piper missing (narration optional)"
```
Expected: `ffmpeg` path printed; `piper missing` is acceptable.

---

## Shared recording procedure (referenced by every feature task)

Every feature task below uses the **same** `record-tutorial` procedure — read
`.claude/skills/record-tutorial/SKILL.md` and follow it exactly. In short:

1. **Pre-flight:** log in to `https://demo.leaguesphere.app` as `admin@demo.local` / `DemoAdmin123!` via chrome-devtools-mcp. Clean up any leftover state for the feature (demo resets nightly, but a same-day rerun collides). Resize to 1920x1080. Create a scratch frames dir `/tmp/opencode/<slug>-frames/`.
2. **Capture:** one screenshot per storyboard step, with the synthetic cursor easing through ~7 interpolated frames before each click (`cursor_overlay.py` helpers installed via `evaluate_script`), click ripple, caption burned in via `evaluate_script`. Name frames `frame_<step>_<sub>.png`.
3. **Assemble:** group frames by step prefix, hold movement frames 0.05s and each step's final frame for its `hold`, concat-and-encode with `slideshow.render(...)` (command in SKILL.md §2).
4. **Verify:** `ffprobe` the output — h264, 1920x1080, duration ≈ sum of `hold`s.
5. **Deliver:** write the mp4 to `~/leaguesphere-tutorials/<slug>.mp4`.

**No video may be assembled from a partial frame set** (SKILL.md §3). If a step fails, stop and report it.

Storyboard authoring conventions for this plan:
- File: `.claude/skills/record-tutorial/storyboards/<slug>.de.md`
- **Captions in German**, imperative-mood, short (the same voice as `content/<slug>.de.md`).
- Prefer existing `[data-testid="..."]` selectors; fall back to a plain-English element description when none exists.
- `hold` 2.5–4s per step; 8–16 steps per video.

---

## Task 1: Share Widget video

**Files:**
- Create: `.claude/skills/record-tutorial/storyboards/share-widget.de.md`
- Read (source of truth for wording): `docs/topics/features/share-widget/overview.md`, `league_manager/help/content/share-widget.de.md`

**Feature facts:** generator route `/share/` ("Widget einbetten", menu *Team* → *Widget einbetten* per the help text); the rendered widget lives at `/share/widget/?t=<teamId>&include=games,teams[,standings]&view=<spielplan|table|live>`; the public API is `/api/snapshot/`.

**Step 1: Research the live UI**

On `https://demo.leaguesphere.app`, open `/share/` (and follow the nav from *Team → Widget einbetten*). Record: the exact URL, the team-search selector, the season/league pickers (react-select? → use the SKILL.md react-select workaround), the view toggles, and the "copy embed code" control. Confirm one demo team that has fixtures **and** standings, and note its id.

**Step 2: Author the storyboard** (German captions). Suggested arc:
1. `navigate` `/share/` — "Widget-Generator öffnen"
2. `fill` team search — "Verein suchen"
3. `click` team option — "Team auswählen"
4. react-select season — "Saison wählen"
5. react-select league — "Liga wählen"
6. `click` view toggle "Spielplan" — "Ansicht: Spielplan"
7. `wait` preview — "Vorschau passt sich an"
8. `click` view toggle "Tabelle" — "Ansicht: Tabelle"
9. `click` "Code kopieren" — "Embed-Code kopieren"
10. `navigate` `/share/widget/?t=<id>&view=table&include=games,teams,standings` — "So sieht das Widget auf der Vereinsseite aus"
11. `wait` — hold on the rendered widget (team highlighted)

**Step 3: Validate the storyboard parses**

```bash
cd /home/cda/dev/leaguesphere/.claude/skills/record-tutorial
PYTHONPATH=scripts python3 -c "from storyboard import load_storyboard; print(load_storyboard('storyboards/share-widget.de.md'))"
```
Expected: prints the parsed steps, no exception.

**Step 4: Record + assemble + verify** — follow the Shared procedure. Output `/tmp/opencode/share-widget-frames/` → `~/leaguesphere-tutorials/share-widget.mp4`.

**Step 5: Spot-check** 2–3 frames with `Read` (wrong selector / open dropdown / missing cursor are cheap to catch now).

---

## Task 2: Gameday Designer video

**Files:**
- Create: `.claude/skills/record-tutorial/storyboards/gameday-designer.de.md`
- Read/adapt: `.claude/skills/record-tutorial/storyboards/gameday-designer-basics.md` (proven selectors), `docs/topics/features/gameday-designer/gameday-designer.md`, `league_manager/help/content/gameday-designer.de.md`

**Feature facts:** designer route `/gamedays/gameday/design/`; proven `data-testid`s in the existing `gameday-designer-basics.md` (e.g. `create-gameday-button`, `add-team-group-button`, `open-template-library-button`, `save-current-as-template-button`, `apply-template-button`). The help copy emphasises *guided start*, *reusable templates*, and (secondary) referee assignment / moving games.

**Step 1: Reuse the proven selectors**, re-confirm against the current deployed build.

**Step 2: Author the storyboard** (German captions), focused on the guided-start → template arc. Adapt `gameday-designer-basics.md` step order, translating captions to German and trimming to ~12–14 steps. Keep the "Save as Template" step — that is the headline of this topic.

**Step 3: Validate** — same parse command, path `storyboards/gameday-designer.de.md`.

**Step 4: Record + assemble + verify** → `~/leaguesphere-tutorials/gameday-designer.mp4`.

**Step 5: Pre-flight cleanup** — delete any scratch gameday/template from a prior run **via the API** (the Template Library Delete button is unreliable — SKILL.md §0.2).

---

## Task 3: Referee report import video

**Files:**
- Create: `.claude/skills/record-tutorial/storyboards/referee-import.de.md`
- Read: `officials/views.py` (`GameOfficialImportUploadView` ~L473, `GameOfficialImportConfirmView`), `officials/service/game_official_import.py`, `league_manager/help/content/referee-import.de.md`

**Feature facts:** upload route `/officials/gameofficial/import/upload/` (staff only — demo admin qualifies), then `/officials/gameofficial/import/confirm/`. Accepts a **`.csv`/`.xlsx`** export of the officials self-report Google Sheet. The upload POST is `fetch()`-driven and renders a client-side stepper/tabs (new / duplicate / conflict) + pagination; confirm only ever receives selected `row_numbers`.

**Step 1: Prepare a sample file.** Locate or construct a small valid self-report `.csv` (headers must match `parse_uploaded_file` / `ImportColumnError` expectations — check `game_official_import.py`). Keep it in `/tmp/opencode/referee-import-sample.csv`.

**Step 2: Research the live UI** at `/officials/gameofficial/import/upload/`: the file input, the upload spinner, the tabs, a row checkbox, the "select all", and the confirm button.

**Step 3: Author the storyboard** (German captions). **Note:** for the file drop, the SKILL's `fill` action cannot set a file input — use chrome-devtools-mcp's `upload_file` tool on the file input element instead, and add a storyboard note documenting that exception. Suggested arc:
1. `navigate` `/officials/gameofficial/import/upload/` — "Meldungen importieren"
2. `upload` sample file — "Tabelle auswählen"
3. `wait` — "Datei wird geprüft"
4. `click` a tab (z. B. "Neu") — "Neue Einsätze prüfen"
5. `click` row checkbox — "Eintrag auswählen"
6. `click` confirm — "Auswahl importieren"
7. `wait` — "Einsätze sind erfasst"

**Step 4: Validate** — parse command, path `storyboards/referee-import.de.md`.

**Step 5: Record + assemble + verify** → `~/leaguesphere-tutorials/referee-import.mp4`.

---

## Task 4: Today's live status video

**Files:**
- Create: `.claude/skills/record-tutorial/storyboards/live-status.de.md`
- Read: `gamedays/views.py` (`GamedayListView`, ~L87 today-filter), `league_manager/help/content/live-status.de.md`

**Feature facts:** overview route `/gamedays/` (`LEAGUE_GAMEDAY_LIST`); home `/` renders the same list. The status grouping (upcoming / live / finished) applies to gamedays dated **today**, computed in server TZ — so a gameday dated today with an in-progress game is required.

**Step 1: Pre-flight state.** Because demo data resets nightly, **create** a gameday dated today with at least one game set to a live/in-progress status (use the designer + scorecard, or the API). Confirm `/gamedays/` shows it under "Läuft".

**Step 2: Author the storyboard** (German captions). Suggested arc:
1. `navigate` `/` — "Startseite"
2. `wait` — "Heutige Spieltage auf einen Blick"
3. `hover` the today's-gameday card — "Status: Läuft"
4. `click` the gameday — "Spieltag öffnen"
5. `wait` progress view — "Fortschritt des Spieltags"
6. `click` a live game — "Spiel im Liveticker verfolgen"
7. `wait` — hold on the updating ticker

**Step 3: Validate** — parse command, path `storyboards/live-status.de.md`.

**Step 4: Record + assemble + verify** → `~/leaguesphere-tutorials/live-status.mp4`.

**Step 5: Clean up** the injected today-gameday if it would confuse later reruns.

---

## Task 5: Upload to YouTube (manual checkpoint) and collect embed URLs

**Files:** none (external).

This is the one **manual** step — it cannot be automated from here.

**Step 1:** Upload each of the four mp4s to the LeagueSphere YouTube channel (unlisted is fine if embeds are enabled). For each, set a German title/description matching the help topic.

**Step 2:** For each video, copy its **embed** URL — `https://www.youtube.com/embed/<videoId>` — not the watch URL. Record the four IDs here:

| slug | YouTube videoId | embed URL |
|---|---|---|
| share-widget | | |
| gameday-designer | | |
| referee-import | | |
| live-status | | |

**Step 3:** Confirm each embed plays in an incognito window (if the channel restricts embedding, the iframe renders blank).

---

## Task 6: Wire videos into the help registry (TDD)

**Files:**
- Modify: `league_manager/help/registry.py` (set `video=` on the four feature topics)
- Test: `league_manager/tests/test_help.py`

**Step 1: Write the failing test** — add a guard so future edits can't paste a watch URL. Append to `league_manager/tests/test_help.py`:

```python
from league_manager.help.registry import HELP_TOPICS


def test_help_video_urls_are_embed_urls():
    for topic in HELP_TOPICS:
        if topic.video:
            assert topic.video.startswith("https://www.youtube.com/embed/"), (
                f"{topic.slug}: video must be a YouTube /embed/ URL"
            )
```

**Step 2: Run it — expected: PASS** (all four `video=` are still `None`, so the loop body is skipped). This proves the test is wired; Task 6 Step 4 is what turns it meaningful.

```bash
pytest league_manager/tests/test_help.py::test_help_video_urls_are_embed_urls -q
```

**Step 3: Set `video=` and optional `tutorial=`** on each of the four `HelpTopic(...)` entries:

```python
    video="https://www.youtube.com/embed/<share-widget-id>",
    tutorial="https://github.com/dachrisch/leaguesphere/blob/master/docs/topics/features/share-widget/overview.md",
```

(Repeat for the other three. Use the IDs from Task 5. `tutorial=` links are optional — point them at the matching `docs/topics/features/...` page where one exists.)

**Step 4: Run the test again — expected: PASS with real values.**

```bash
pytest league_manager/tests/test_help.py -q
```

**Step 5: Commit**

```bash
git add league_manager/help/registry.py league_manager/tests/test_help.py
git commit -m "feat(help): link feature walkthrough videos in help topics"
```

---

## Task 7: Harmonize the howto Markdown against the videos

**Files:**
- Modify (as needed): `league_manager/help/content/share-widget.de.md`, `gameday-designer.de.md`, `referee-import.de.md`, `live-status.de.md`

**Step 1:** For each topic, read `content/<slug>.de.md` and the recorded storyboard side by side. Fix any drift — a step order, a button label, or a menu path that the video contradicts. Keep the existing plain-language German voice; do not restructure.

**Step 2:** Add a one-line pointer at the top of each file where a video is now present, e.g.:
```markdown
> **Video:** Die wichtigsten Schritte im kurzen Video oben.
```

**Step 3:** Commit.
```bash
git add league_manager/help/content/
git commit -m "docs(help): align topic howtos with walkthrough videos"
```

---

## Task 8 (stretch): English howtos + narration

Only if the four core videos are done and verified.

- **EN content:** add `league_manager/help/content/<slug>.en.md` (mirror of the German page in English). No code changes needed — `loader.py` picks `.en.md` when present and falls back to German otherwise. Add a registry sanity check only if one already exists.
- **Narration:** install `piper` + an English/German voice model, then run `scripts/render_narration.py` per SKILL.md §4 to add a voice track. Upload the narrated version. If `piper` is unavailable, keep the silent captioned mp4 — it is the valid deliverable.

---

## Verification (before reporting done)

```bash
cd /home/cda/dev/leaguesphere
pytest league_manager/tests/test_help.py -q
python scripts/check_scope_coverage.py
```
And for each of the four outputs:
```bash
ffprobe -v error -show_entries stream=codec_name,width,height -show_entries format=duration ~/leaguesphere-tutorials/<slug>.mp4
```
Expected: h264, 1920x1080; duration ≈ sum of the storyboard `hold`s. Then confirm each `https://demo.leaguesphere.app/help/<slug>/` renders the video iframe. Report any step that failed rather than presenting a partial result.

---

## Open dependencies / risks

- **PR #2056 must land (or be the base).** Everything here edits files it introduces. If it changes review, rebase `feat/help-videos` onto the updated branch.
- **Widget embed host.** The demo has no third-party club page; the video ends on the `/share/widget/` route itself, which is the honest "what visitors see" view. If a richer embed demo is wanted, a local host page + `upload_file`/`evaluate_script` injection would be required (not in this plan).
- **Live status needs a today-dated gameday** recreated per run (nightly reset).
- **Referee import needs a valid sample `.csv`/`.xlsx`** whose columns match `game_official_import.py`.
- **YouTube upload is manual** and can gate the whole registry wiring (Task 6); Tasks 1–4 and 7 can proceed independently.
