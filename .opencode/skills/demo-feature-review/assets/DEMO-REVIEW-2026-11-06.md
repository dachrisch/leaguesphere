# Demo-Review 2026-11-06 — Scorecard v2 (5.12.2)

The artifact this skill was written from: the review of the stack from the
2026-11-05 scorecard meeting (stack #2287 → 5.12.0) plus the follow-ups
`#2310`, `#2311`, `#2313` (5.12.1, 5.12.2).

**Document:** https://app.docstash.ai/jc8q0z — 11 pages, German.
**Captures:** `assets/screenshots/` (the 11 shots embedded in it, 390 × 844).
**Scaffold:** `assets/review-template.html`.

## Page map

| Page | Content |
|---|---|
| 1 | Cover — 5.12.2, 16 PRs |
| 2 | Status table of the meeting (A5, A6, A7a–d, B5, C3, R0–R5, B3 not built) |
| 3 | A5 interception + return (`04`, `07`) |
| 4 | A6 touchdown as the play's result + try (`02`, `03`) |
| 5 | B5 timeouts at the team (`08`, `01`) |
| 6 | A7a–d numbers and corrections (`05`, `06`) |
| 7 | R5/R7 intermission and timeout budget (`10`) |
| 8 | R0/R2/R3/R4 rules from the definition (drawn field) |
| 9 | C3 two devices on one game (`00`, `09`) |
| 10 | The three follow-ups with a before/after table |
| 11 | Seven browser checks, release timeline, what is out of scope |

## The screenshots

| File | Shows |
|---|---|
| `00-start-confirm.jpeg` | Preparation screen with the start-confirmation sheet |
| `01-tracking.jpeg` | Tracking at kickoff — team row with `0/2` budgets, tiles, log |
| `02-play-touchdown.jpeg` | Play sheet: Run, 45 yards, jersey 7, **Touchdown** selected |
| `03-try-b5.jpeg` | After the TD: `Versuch · B5`, 6:0, extra-point prompt |
| `04-interception-sheet.jpeg` | Interception sheet: defender 11, "B · gegnerische", line 20, return 15 |
| `05-penalty-half-distance.jpeg` | Penalty sheet: yardage 0–50, `Nach der Strafe: A2,5` |
| `06-edit-play-row.jpeg` | `Run ändern` — an existing play row corrected |
| `07-interception-row.jpeg` | Log row `#11 · bis M · 12 Yards Return` (+ the replaced row, struck through) |
| `08-timeout-budget.jpeg` | Team row with `1/2` / `0/2`, ball stays with the other side |
| `09-readonly-device.jpeg` | `Nur lesen – das Spiel läuft auf einem anderen Gerät` + takeover |
| `10-halftime-break.jpeg` | Break panel `Pause 01:49`, second half, budgets reset |

## Findings (the reason a review is worth doing)

1. **C3's pre-start warning can never appear.**
   `PUT /setup` stores `device_id`, but `GameSetupSerializer` marks the field
   `write_only`, so `GET /setup` never returns it and `foreignDevice()` in
   `GameSetup.tsx` always sees `undefined`. The server does answer with
   `locked_elsewhere` / `can_release_lock` — the *tracking* screen consumes those
   (`session/lock.ts`), the preparation screen does not.
   Effect: the lock works (verified: second device is read-only, staff can take
   over), the warning before the first write is dead code. Fix: read
   `locked_elsewhere` in `GameSetup` instead of comparing `device_id` (one line
   plus a test), or make `device_id` readable.

2. **A touchdown from the play sheet without a jersey scores nothing.**
   `playEvents()` (`components/sheets/PlaySheet.tsx`) returns `[play]` when
   `player === null`, so choosing Run + *Touchdown* + `Ohne Nummer` writes only
   the run: no TD row, no six points, no message. Observed on 5.12.2 while
   capturing `02` — the first attempt landed as a plain `Run 45 Yards` and had to
   be undone. Either require a number for the TD switch or write the team's TD
   without a player.

3. **By design, not a bug:** the second tap on `Interception` replaces the
   one-tap row; the replaced row stays in the log, struck through (`07`). The
   arm window is 10 s and starts after the write resolves.

## How it was produced

- Headless Chrome at 390 × 844 on `demo.leaguesphere.app`, one game per capture
  run (`Scorecard v2 Testtag`), staff takeover when the device lock was stale.
- Images hosted at `https://demo.leaguesphere.app/static/docstash/` by copying
  them into the `leaguesphere-demo.www` container (see SKILL.md §4).
  **A demo repull removes them** — re-upload from `assets/screenshots/` before
  re-rendering the document; the baked PDF keeps its copy.
- The document was rendered, then reviewed with `screenshot_document` in two
  windows (1–8, 9–11) and corrected with `edit_pdf`.

## Demo state left behind

Games 55 and 56 were used for the captures (started, a few test rows, one break
running). The nightly reset at 00:00 UTC clears them; no production or staging
data was touched.
