# League Management & Result Recording — Help Topics + Videos Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three new in-app help topics — *Liga & Spieltag verwalten* (staff league lifecycle), *Ergebnisse erfassen* (Scorecard result entry) and *Offizielle: Übersicht & Statistik* — each with a German-captioned walkthrough video wired into `/help/<slug>/`, so the two most important user jobs (running a league, recording results) are documented and shown.

**Architecture:** The in-app help module already exists (`league_manager/help/`) and is merged on `master`. Each topic is one `HelpTopic` entry in `registry.py` plus a German Markdown file rendered server-side; `topic.html` already renders a `video=` YouTube **embed** URL as a 16:9 iframe. Videos are produced with the existing `record-tutorial` skill (chrome-devtools-mcp + `ffmpeg` screenshot slideshow), uploaded to YouTube, and the embed URLs are written back into the registry. No new app, no migrations.

**Tech Stack:** `record-tutorial` skill (chrome-devtools-mcp + `slideshow.py`/`ffmpeg`), Python-Markdown (help loader), Django (help views + tests), YouTube (manual upload/host).

> **Revision (2026-10-16):** The `liga-verwalten` topic now leads with the **Gameday Designer** as the recommended way to create a gameday, documents the classic form only as the alternative, and reuses the designer walkthrough video (`Ek3yec2hqK0`) instead of the classic-form recording (`876HYWyVNFs`). See branch `feat/help-liga-verwalten-designer-first`. Notes below that say "classic form" reflect the original, now-superseded decision.

---

## Scope & decisions (locked)

- **Three topics, one per job** (user decision):
  1. `liga-verwalten` — *"Liga & Spieltag verwalten"* — the **full staff league lifecycle** (overview): create a gameday with the **Gameday Designer** (recommended) or the classic form + wizard, then publish; points on to the officials and results topics. _Revised: the designer leads (the designer's own video, `gameday-designer`, is reused here). Original decision was the classic form/wizard only._
  2. `ergebnisse-erfassen` — *"Ergebnisse erfassen"* — the **Scorecard** deep dive (select game → officials/coin toss → score logging → halftime → finalize/captains confirm).
  3. `offizielle-statistik` — *"Offizielle: Übersicht & Statistik"* — the **Offizielle menu** area: overview cards, statistics/leaderboard, all assignments, license check. Deep companion to the existing `teams-offizielle` topic (cross-link both ways).
- **Group:** all three in the existing `spielbetrieb` ("Running your league") group. Orders `5`, `35`, `40` (see registry task).
- **Videos:** German captions, silent (matches existing help videos; `piper` narration is an optional stretch). Hosted on YouTube as **embed** URLs (`https://www.youtube.com/embed/<id>`, never `watch?v=`).
- **Data source:** **all three videos from `demo.leaguesphere.app`** (user decision), seeding demo data as needed. **No local server spin-up** (user decision) — drive the remote demo with the `chrome-devtools-mcp` browser.
- **Demo seeding (user decision, implemented):** `league_manager/management/commands/seed_demo_data.py` was extended to seed a "Demo Officials" team, 8 licensed officials and four `GameOfficial` rows per game (so `/officials/statistics/` is populated), and to fix schedule seeding so each gameday gets its full round-robin (6 games, not 2). Committed as `b558f5a1` on `feat/help-og-llm-linking`; the demo reseed is delegated to the `servyy-infra` session (see Task 0b).
- **Language:** German `.de.md` only. English is a later stretch (loader falls back automatically).
- **Branch base:** `master` (help module already merged via PR #2060).

---

## Key facts gathered from the codebase (do not re-research)

- **Help routes:** `help/` → `help-index`; `help/<slug>/` → `help-topic` (`league_manager/urls.py:145-146`).
- **Registry:** `league_manager/help/registry.py` — `HelpTopic` dataclass `L15-25`, `HELP_GROUPS` `L28-45`, `HELP_TOPICS` `L48-158`. `video`/`tutorial` are `Optional[str]`, `featured` default `False`.
- **Content:** `league_manager/help/content/<slug>.de.md`, leading H1 stripped by the loader; template renders the registry title + icon. Screenshots are `/static/help/img/<name>.png` referenced inside `<figure class="help-figure">`.
- **Tests:** `league_manager/tests/test_help.py` enforces (a) a `.de.md` per registry topic (`L120-127`), (b) `video` starts with `https://www.youtube.com/embed/` (`L129-134`), (c) every `/static/help/img/...` referenced in content exists (`L147-155`), (d) `PROMISED_TOPICS` (`L137`) render an `<img>`.

### Flow 1 — league / gameday lifecycle (classic + wizard)
- Entry: `Orga` menu → **"Spieltag erstellen"** → chooser `/gamedays/gameday/create/` (`gamedays/menu.py:14-17`, route `gamedays/urls.py:60-64`, `GamedayCreateChooserView` `gamedays/views.py:832`). Staff-only (`is_staff`).
- Chooser (`gamedays/templates/gamedays/gameday_create_chooser.html`): card CTA **"Spieltag designen"** → designer; link **"…oder das klassische Formular verwenden →"** → classic form.
- Classic form `/gamedays/gameday/new/` (`GamedayCreateView` `gamedays/views.py:332`, template `gamedays/gameday_form.html`): `<form id="gameday-form">`, crispy fields, URL formset, submit **"Spieltag erstellen"** (`value="create"`).
- Wizard `GameinfoWizard` (`gamedays/views.py:599`), routes `/gameday/<pk>/gameinfos/wizard/`:
  - Step 1 `fields_groups.html` (`#fields-groups-form`): groups / `number_fields` / `format` → **"Weiter"**.
  - Step 2 `gamedays_format.html` (`#gamedays-format-form`): per-group team `autocomplete` (`/dal/team`) → **"Spielplan erstellen"**.
  - Step 3 `gameinfos.html` (`#gameinfos-form`, `#games-table`, `#add-row`): review schedule → finish.
- **No `data-testid`s** in these Django templates — storyboard targets ids/labels listed above.
- Preconditions: a `Season`, a `League`, and `Team` rows exist (demo has them). A created classic-form gameday is `STATUS_PUBLISHED` immediately.

### Flow 2 — officials overview & statistics
- Menu `Offizielle` (`officials/menu.py:11`): **Übersicht** → `/officials/team/all/list/` (`AllTeamsCardListView` `officials/views.py:84`); **Statistik** → `/officials/statistics/` (`OfficialsStatisticsView` `:92`); **Alle Einsätze** → `/officials/einsaetze/` (`GameOfficialListView` `:198`, cached 24h); superuser **Moodle Lizenz check** → `/officials/licensecheck/15/` (`LicenseCheckForOfficials` `:709`).
- All are public except license check (staff or user `offd`). Statistics obfuscates names for non-staff.
- Templates: `all_teams_card_list.html` (search `#team-search`), `statistics.html` (year filter, toggle `#include-external-toggle`, tables `#statistics-table-without-external` / `#statistics-table-with-external`; shows top 50 officials with ≥10 games, excludes Scorecard-Judge), `game_officials_list.html` (columns Datum, Spieltag, Team, Name, Position, Spiel, Platzierung), `license_check.html` (`#req`).
- **No `data-testid`s.** Precondition: `GameOfficial` rows exist (created by the Scorecard's officials step — see Flow 3).

### Flow 3 — record results (Scorecard)
- Route `/scorecard/` → SPA (`scorecard/urls.py:6`, `scorecard/views.py:4`), HashRouter so routes are `/scorecard/#/<route>`.
- Entry `SelectPasscheckOrScorecard`: **"Scorecard"** button. Select gameday → **"Auswählen"**, then game → **"Start"**.
- Officials step `Officials.jsx`: 5 official dropdowns (`scJudgeName`, `referee`, `downJudge`, `fieldJudge`, `sideJudge`), coin toss `ctWon`/`ctLost`, possession `possessionHome`/`possessionAway`, submit **"Spiel starten"**. Saves via `PUT /api/game/<id>/officials`.
- Score entry `Details.jsx` + `AddPoints.jsx` (radios Touchdown `id=td`, Serie `id=serie`, Mehr… `id=gameEvent`; submit **"Eintrag speichern"**); each entry `POST /api/gamelog/<gameId>`.
- `Halftime.jsx`: `data-testid="halftimeButton"` (**"Halbzeit"**), `data-testid="finalizeButton"` (**"Ende"**), modal `halftime-cancel`/`halftime-done`.
- `Finalize.jsx`: `data-testid="editScoreLink"`, `confirmHomeButton`/`confirmAwayButton` (**"Bestätigen"**), note `#gameNote`, submit **"Ergebnis abschicken"** → `PUT /api/game/<id>/finalize`.
- Only this flow has `data-testid`s. Preconditions: a gameday with scheduled games (Flow 1 output) and a `Team` of officials for the dropdowns.
- **Note:** recording the Scorecard officials step creates `GameOfficial` rows, which then populate the officials videos — sequence results before officials (Task order below reflects this).

---

## Shared recording procedure (referenced by every video task)

Every video task uses the **same** procedure — read `.claude/skills/record-tutorial/SKILL.md` and follow it exactly. In short:

1. **Pre-flight:** log in to `https://demo.leaguesphere.app` as `admin@demo.local` / `DemoAdmin123!`. Clean up leftover scratch state for the feature (demo resets nightly; same-day reruns collide — delete scratch gamedays/templates via API, SKILL.md §0.2). Resize to 1920x1080; `mkdir -p /tmp/opencode/<slug>-frames/`.
2. **Capture:** one screenshot per storyboard step; synthetic cursor eased through ~7 interpolated frames before each click (`cursor_overlay.py` helpers installed via `evaluate_script`), click ripple, caption burned in. `data-testid` when present, else CSS id/label. Name frames `frame_<step>_<sub>.png`.
3. **Assemble:** group frames by step prefix; movement frames held 0.05s, each step's last frame held for its `hold`; concat-and-encode with `slideshow.render(...)` (SKILL.md §2).
4. **Verify:** `ffprobe` — h264, 1920x1080, duration ≈ sum of `hold`s.
5. **Deliver:** write the mp4 to `~/leaguesphere-tutorials/<slug>.mp4`.

Storyboard conventions: file `.claude/skills/record-tutorial/storyboards/<slug>.de.md`; German imperative captions; `hold` 2.5–4s; 8–16 steps. **Never assemble from a partial frame set** (SKILL.md §3) — if a step fails, stop and report.

---

## Task 0: Branch setup

**Files:** none (git only).

**Step 1:** Base off `master` (the help module is already merged):
```bash
git fetch origin master
git checkout -b feat/help-league-results-videos origin/master
```

**Step 2:** Confirm the help module is present and green:
```bash
ls league_manager/help/content/
.venv/bin/python -m pytest league_manager/tests/test_help.py --ds=test_settings -q
```
Expected: the nine `.de.md` files list; tests pass.

**Step 3:** Confirm tooling:
```bash
command -v ffmpeg && command -v chromium || command -v google-chrome
```
Expected: `/usr/bin/ffmpeg` and `/usr/bin/chromium`. On this host ffmpeg was **not** present and was installed with `apk add --no-cache ffmpeg` (Alpine). `piper` is optional (narration stretch).

**Step 4:** Confirm the capture browser works (no local spin-up — this drives the remote demo):
- `chrome-devtools-mcp` lists/pages a browser, navigates to `https://demo.leaguesphere.app/login/`, logs in as `admin@demo.local` / `DemoAdmin123!`, and the staff **Orga** menu appears.

---

## Task 0b: Demo seeding (implemented; reseed delegated to infra)

**Files:**
- Modified (done): `league_manager/management/commands/seed_demo_data.py`
- Created (done): `tests/league_manager/management/commands/test_seed_demo_data.py`

**Why:** `/officials/statistics/` only lists officials with **≥ 10** LeagueSphere games (`OfficialsRepositoryService.get_officials_statistics_for_season`, filtered by `gameinfo__gameday__date__year`), and the scorecard official dropdowns need `Official` rows on the game's `officials` team. The stock seed created **neither**, and a `get_or_create` keyed on `(gameday, league_group)` collapsed each group's round-robin to a single game.

**Changes:** added `create_officials(associations, gamedays)` (a "Demo Officials" team, 8 officials with license history, 4 `GameOfficial` positions per game, every game's `officials` FK pointed at that team), and included `stage` in the `Gameinfo.get_or_create` lookup so the full round-robin (6 games/gameday) is created.

**Verify locally:**
```bash
.venv/bin/python -m pytest tests/league_manager/management/commands/test_seed_demo_data.py --ds=test_settings -q
```
Expected: 5 passed.

**Reseed the demo** (delegated to the `servyy-infra` session, thread `demo-seed-officials`): the demo's `container/entrypoint.demo.sh` only runs `seed_demo_data` on **first init**; if `/app/snapshots/demo_snapshot.sql` already exists the container just restores the **old** snapshot. So the reseed must delete/rename that snapshot then restart the demo container (triggers `init_database` → seed + fresh snapshot), or run `manage.py seed_demo_data` inside `ls-demo-app` and regenerate the snapshot. The change is on branch `feat/help-og-llm-linking` (not yet on `master`) — coordinate whether infra deploys the branch or a merged PR.

**Done when:** `https://demo.leaguesphere.app/officials/statistics/` shows non-empty rows.

---

## Task 1: Add the three help topics to the registry + content (TDD)

**Files:**
- Modify: `league_manager/help/registry.py` (append three `HelpTopic`s to `HELP_TOPICS`)
- Create: `league_manager/help/content/liga-verwalten.de.md`
- Create: `league_manager/help/content/ergebnisse-erfassen.de.md`
- Create: `league_manager/help/content/offizielle-statistik.de.md`
- Test: `league_manager/tests/test_help.py`

**Step 1: Write the failing test** — assert the three new topics exist and are served. Append to `league_manager/tests/test_help.py`:

```python
NEW_TOPICS = ["liga-verwalten", "ergebnisse-erfassen", "offizielle-statistik"]


class TestNewLeagueAndResultsTopics(TestCase):
    def test_new_topics_render(self):
        for slug in NEW_TOPICS:
            response = self.client.get(reverse("help-topic", kwargs={"slug": slug}))
            assert response.status_code == 200, slug
            assert "<h1" in response.content.decode(), slug
```

**Step 2: Run it — expected FAIL** (404 for each slug):
```bash
.venv/bin/python -m pytest league_manager/tests/test_help.py::TestNewLeagueAndResultsTopics --ds=test_settings -q
```

**Step 3: Add the registry entries.** Append to `HELP_TOPICS` in `league_manager/help/registry.py` (orders chosen so `liga-verwalten` leads the `spielbetrieb` group):

```python
    HelpTopic(
        slug="liga-verwalten",
        group="spielbetrieb",
        title={"de": "Liga & Spieltag verwalten", "en": "Running a gameday"},
        summary={
            "de": "Einen Spieltag anlegen, Teams und Felder festlegen und den Spielplan veröffentlichen.",
            "en": "Create a gameday, set teams and fields, and publish the schedule.",
        },
        icon="bi-clipboard-plus",
        order=5,
    ),
    HelpTopic(
        slug="ergebnisse-erfassen",
        group="spielbetrieb",
        title={"de": "Ergebnisse erfassen", "en": "Recording results"},
        summary={
            "de": "Auf dem Platz Ergebnisse eintragen: Offizielle, Spielzüge, Halbzeit und Abschluss.",
            "en": "Enter results on game day: officials, plays, halftime and finalization.",
        },
        icon="bi-clipboard-check",
        order=35,
    ),
    HelpTopic(
        slug="offizielle-statistik",
        group="spielbetrieb",
        title={"de": "Offizielle: Übersicht & Statistik", "en": "Officials: overview & stats"},
        summary={
            "de": "Wer welche Spiele geleitet hat – Übersicht, Bestenliste und alle Einsätze.",
            "en": "Who officiated what – overview, leaderboard and all assignments.",
        },
        icon="bi-bar-chart",
        order=40,
    ),
```

**Step 4: Write the three content files.** Each starts with `# <Title>` (the loader strips the H1), stays short (what it is → steps → *Häufige Fragen*), and includes one screenshot figure (Task 2 provides the image). Suggested outlines:

`liga-verwalten.de.md` — what a gameday is; **Orga → Spieltag erstellen** → choose *Spieltag designen* (recommended; link to `/help/gameday-designer/`) with the classic form documented as the alternative; designer flow (Liga/Saison/Datum → Teams/Felder → Vorlage speichern); publish; then → *Ergebnisse erfassen* and *Offizielle: Übersicht & Statistik*. FAQ: "Warum sehe ich den Menüpunkt nicht?" (nur Staff), "Muss ich den Designer nutzen?" (empfohlen, aber nicht Pflicht).

`ergebnisse-erfassen.de.md` — open `/scorecard/`, **Scorecard** wählen, Spieltag → Spiel **Auswählen/Start**, Offizielle + Münzwurf, Spielzüge mit **Eintrag speichern** (Touchdown/Serie/Mehr…), **Halbzeit**, **Ende**, Kapitäne **Bestätigen**, **Ergebnis abschicken**. FAQ: "Ergebnis falsch erfasst?" (Eintrag per Doppelklick löschen / *Spielstand bearbeiten*), "Wer darf erfassen?" (angemeldete Offizielle).

`offizielle-statistik.de.md` — `Offizielle → Übersicht` (Teamkarten, Suche), `Statistik` (Bestenliste, ≥10 Spiele, Top 50, *Externe einblenden*), `Alle Einsätze` (Datum, Spieltag, Position), `Lizenz check` (Staff). Cross-link **Teams & Offizielle** (`/help/teams-offizielle/`). FAQ: "Warum sind Namen/Teams ausgeblendet?" (Datenschutz für Gäste), "Warum fehlt ein Offizieller?" (weniger als 10 Spiele).

Screenshot figure pattern (same in all three):
```html
<figure class="help-figure">
  <img src="/static/help/img/<slug>.png" alt="...">
  <figcaption>...</figcaption>
</figure>
```

**Step 5: Run the tests — expected PASS** (content/existence guards pass once Task 2 adds the images):
```bash
.venv/bin/python -m pytest league_manager/tests/test_help.py --ds=test_settings -q
```
If `test_help_images_referenced_by_content_exist` fails because the image is not yet present, that is expected until Task 2 — proceed to Task 2, then re-run.

**Step 6: Format + commit.**
```bash
.venv/bin/python -m black --fast league_manager/help/ league_manager/tests/test_help.py
git add league_manager/help/registry.py league_manager/help/content/ league_manager/tests/test_help.py
git commit -m "feat(help): add league management and result recording topics"
```

---

## Task 2: Screenshots for the three topics

**Files:**
- Create: `league_manager/static/help/img/liga-verwalten.png`
- Create: `league_manager/static/help/img/ergebnisse-erfassen.png`
- Create: `league_manager/static/help/img/offizielle-statistik.png`

Screenshots come from `demo.leaguesphere.app` (all-three-from-demo decision), login-gated pages included. Install a headless Chromium if missing (`apk add --no-cache chromium` on Alpine; Playwright's bundled browser fails on musl).

**Step 1:** Capture (log in first for gated pages; see the add-help-topic skill):
```bash
chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1000 \
  --screenshot=league_manager/static/help/img/liga-verwalten.png \
  "https://demo.leaguesphere.app/gamedays/gameday/create/"
```
Repeat for `ergebnisse-erfassen.png` (Scorecard mid-game view) and `offizielle-statistik.png` (`/officials/statistics/`). Prefer obfuscated/public data; never expose real personal names.

**Step 2: Verify the image tests pass:**
```bash
.venv/bin/python -m pytest league_manager/tests/test_help.py --ds=test_settings -q
```
Expected: PASS.

**Step 3: Commit.**
```bash
git add league_manager/static/help/img/
git commit -m "docs(help): screenshots for league and result topics"
```

---

## Task 3: Storyboard + video — *Liga & Spieltag verwalten*

**Files:**
- Create: `.claude/skills/record-tutorial/storyboards/liga-verwalten.de.md`
- Read for wording: `league_manager/help/content/liga-verwalten.de.md`

**Step 1: Pre-flight state.** Log in as demo admin. Confirm a `Season`/`League` and some `Team`s exist. Delete any scratch gameday left from a prior run (API, SKILL.md §0.2).

**Step 2: Author the storyboard** (German captions). Arc (~10–12 steps):
1. `navigate` `/gamedays/gameday/create/` — "Neuen Spieltag anlegen"
2. `click` "…oder das klassische Formular verwenden" — "Klassisches Formular öffnen"
3. `fill` name/date fields in `#gameday-form` — "Name und Datum eintragen"
4. `click` season/league selectors — "Saison und Liga wählen"
5. `click` submit `value="create"` ("Spieltag erstellen") — "Spieltag anlegen"
6. `wait` — "Spielpläne werden angelegt"
7. `fill` `#fields-groups-form` (Gruppen/Felder/Format) → `click` "Weiter" — "Gruppen und Felder festlegen"
8. `fill` team `autocomplete` fields → `click` "Spielplan erstellen" — "Teams zuordnen"
9. `wait` — "Spielplan wird berechnet"
10. `click` finish on `#gameinfos-form` — "Spielplan veröffentlichen"
11. `wait` on gameday detail — "Spieltag ist online"
> If a field's exact label differs at record time, resolve by visible text; adjust the caption, not the flow.

**Step 3: Validate the storyboard parses:**
```bash
cd .claude/skills/record-tutorial
PYTHONPATH=scripts python3 -c "from storyboard import load_storyboard; print(load_storyboard('storyboards/liga-verwalten.de.md'))"
```
Expected: prints parsed steps, no exception.

**Step 4: Record + assemble + verify** per the Shared procedure → `~/leaguesphere-tutorials/liga-verwalten.mp4`.

**Step 5: Spot-check** 2–3 frames with `Read` (wrong selector, open dropdown, missing cursor).

---

## Task 4: Storyboard + video — *Ergebnisse erfassen*

**Files:**
- Create: `.claude/skills/record-tutorial/storyboards/ergebnisse-erfassen.de.md`
- Read for wording: `league_manager/help/content/ergebnisse-erfassen.de.md`

**Step 1: Pre-flight state.** Ensure a gameday **dated today** with scheduled games exists. The scorecard's gameday list only returns gamedays dated today (`GamedayListAPIView.get_queryset`: `date=datetime.today()`, `gamedays/api/views.py:388-392`), so a gameday seeded +7/+14 days will **not** appear — create one dated today (via the Task 3 flow, or Django admin) right before recording. The officials dropdowns resolve from the game's `officials` team, which the new seed sets to "Demo Officials" (Task 0b).

**Step 2: Author the storyboard** (German captions). Prefer the `data-testid`s listed in "Key facts". Arc (~12 steps):
1. `navigate` `/scorecard/` — "Scorecard öffnen"
2. `click` "Scorecard" — "Modus wählen"
3. `wait` — "Spieltag auswählen"
4. `click` gameday row "Auswählen" — "Spieltag wählen"
5. `click` game row "Start" — "Spiel starten"
6. `fill` the five official dropdowns — "Offizielle eintragen"
7. `click` coin toss + possession → "Spiel starten" — "Münzwurf festhalten"
8. `click` Touchdown + "Eintrag speichern" — "Spielzug erfassen"
9. `click` Serie/Mehr… + "Eintrag speichern" — "Weiterer Spielzug"
10. `click` `[data-testid="halftimeButton"]` + `halftime-done` — "Halbzeit"
11. `click` `[data-testid="finalizeButton"]` — "Spiel beenden"
12. `click` `confirmHomeButton` + `confirmAwayButton` + "Ergebnis abschicken" — "Ergebnis abschicken"

**Step 3: Validate** — parse command, path `storyboards/ergebnisse-erfassen.de.md`.

**Step 4: Record + assemble + verify** → `~/leaguesphere-tutorials/ergebnisse-erfassen.mp4`.

**Step 5: Spot-check** frames; confirm the score and finalize screenshots show a plausible score.

---

## Task 5: Storyboard + video — *Offizielle: Übersicht & Statistik*

**Files:**
- Create: `.claude/skills/record-tutorial/storyboards/offizielle-statistik.de.md`
- Read for wording: `league_manager/help/content/offizielle-statistik.de.md`

**Step 1: Pre-flight state.** The demo seed (Task 0b) now provides the "Demo Officials" crew and `GameOfficial` rows, so `/officials/statistics/` should list ~8 officials with ≥10 games and survive the nightly reset. If it is empty, the demo has not been reseeded yet (Task 0b) — recording a couple of scorecard games will **not** clear the ≥10-game threshold. Confirm rows render before recording.

**Step 2: Author the storyboard** (German captions). Arc (~8 steps):
1. `navigate` `/officials/team/all/list/` — "Offizielle-Übersicht"
2. `fill` `#team-search` — "Nach Team suchen"
3. `navigate` `/officials/statistics/` — "Statistik öffnen"
4. `click` `#include-external-toggle` — "Externe Offizielle einblenden"
5. `wait` on `#statistics-table-with-external` — "Bestenliste mit Einsätzen"
6. `navigate` `/officials/einsaetze/` — "Alle Einsätze"
7. `wait` on the assignments table — "Wer hat wann gepfiffen"
8. `navigate` `/officials/licensecheck/15/` — "Lizenz-Check (Staff)"
> `/officials/einsaetze/` is cached 24h — capture fresh demo data if the table looks stale.

**Step 3: Validate** — parse command, path `storyboards/offizielle-statistik.de.md`.

**Step 4: Record + assemble + verify** → `~/leaguesphere-tutorials/offizielle-statistik.mp4`.

**Step 5: Spot-check** frames; ensure names are demo data.

---

## Task 6: Upload to YouTube (manual checkpoint)

Cannot be automated from here.

**Step 1:** Upload the three mp4s to the LeagueSphere YouTube channel (unlisted is fine if embeds are enabled), German title/description matching each help topic.

**Step 2:** Copy each **embed** URL (`https://www.youtube.com/embed/<videoId>`) — not the watch URL:

| slug | videoId | embed URL |
|---|---|---|
| liga-verwalten | | |
| ergebnisse-erfassen | | |
| offizielle-statistik | | |

**Step 3:** Confirm each embed plays in an incognito window (a restricting channel renders a blank iframe).

---

## Task 7: Wire the videos into the registry (TDD)

**Files:**
- Modify: `league_manager/help/registry.py` (set `video=` on the three topics)
- Test: `league_manager/tests/test_help.py` (the embed-URL guard already exists, `L129`)

**Step 1: Set `video=`** on each of the three `HelpTopic`s with the IDs from Task 6:
```python
        video="https://www.youtube.com/embed/<liga-verwalten-id>",
```
(add `tutorial=` only where a matching `docs/topics/features/...` page exists; for these three, leave it out).

**Step 2: Run the tests — expected PASS with real values:**
```bash
.venv/bin/python -m pytest league_manager/tests/test_help.py --ds=test_settings -q
```

**Step 3: Commit.**
```bash
git add league_manager/help/registry.py
git commit -m "feat(help): link league and result walkthrough videos"
```

---

## Task 8: Cross-link related topics

**Files:**
- Modify: `league_manager/help/content/getting-started.de.md` (add links to the three new topics)
- Modify: `league_manager/help/content/spieltage.de.md` (link *Ergebnisse erfassen* from the "Live verfolgen"/results paragraph)
- Modify: `league_manager/help/content/teams-offizielle.de.md` (link *Offizielle: Übersicht & Statistik*)
- Modify: `league_manager/help/content/whats-new-2026.de.md` (link *Liga & Spieltag verwalten* from the designer/tournament bullet)

**Step 1:** Add Markdown links using the `/help/<slug>/` form, e.g.:
```markdown
Für den Ablauf Schritt für Schritt siehe [Ergebnisse erfassen](/help/ergebnisse-erfassen/).
```

**Step 2: Run tests + commit:**
```bash
.venv/bin/python -m pytest league_manager/tests/test_help.py --ds=test_settings -q
git add league_manager/help/content/
git commit -m "docs(help): cross-link league and result topics"
```

---

## Task 9 (stretch): English content + narration

Only if the three core videos are done and verified.

- **EN content:** add `league_manager/help/content/<slug>.en.md` (no code change; loader prefers `.en.md` and falls back to German).
- **Narration:** if `piper` is installed, run `scripts/render_narration.py` (SKILL.md §4) and upload the narrated version. If unavailable, the silent captioned mp4 is the valid deliverable.

---

## Verification (before reporting done)

```bash
.venv/bin/python -m pytest league_manager/tests/test_help.py --ds=test_settings -q
python scripts/check_scope_coverage.py
```
And for each output:
```bash
ffprobe -v error -show_entries stream=codec_name,width,height -show_entries format=duration ~/leaguesphere-tutorials/<slug>.mp4
```
Expected: h264, 1920x1080; duration ≈ sum of storyboard `hold`s. Then confirm each `https://demo.leaguesphere.app/help/<slug>/` renders the video iframe and the screenshot. Report any step that failed rather than presenting a partial result.

---

## Open dependencies / risks

- **Demo reseed is a prerequisite.** Officials data comes from the extended seed (Task 0b) via an infra reseed; until that lands, `/officials/statistics/` is empty. The **today-dated gameday** for the scorecard/results video cannot be seeded (it would be stale after the next reset) and must be created at capture time.
- **No local spin-up.** Capture drives the remote demo with `chrome-devtools-mcp` (headful on the host desktop); this session can do it, but it is slow and serial.
- **No `data-testid`s** on the wizard and officials pages — storyboards target CSS ids/labels, which can drift with UI edits. Re-confirm selectors against the deployed build at record time.
- **`/officials/einsaetze/` is cached 24h** (Flow 2) — a stale cache can show old/empty data; seed and wait before capturing.
- **YouTube upload is manual** and gates Task 7; Tasks 1–5 and 8 can proceed independently.
- **`liga-verwalten` vs `gameday-designer` overlap** — the lifecycle topic now leads with the designer and reuses the designer walkthrough video, with the classic form documented as the alternative; do not re-record designer basics.
```