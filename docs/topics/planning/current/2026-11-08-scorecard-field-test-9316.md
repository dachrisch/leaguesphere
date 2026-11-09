# Scorecard v2 — Field Test Feedback (Game 9316, 1st half)

> **Source:** written feedback from an operator who scored the first half of game 9316 with
> `/scorecard/v2/` (play-by-play, 2026-11). This plan triages every point against the code on
> `master` (release 5.13.1), names the cause where one is visible, and orders the work into
> independently shippable layers.
>
> **Related:** [Rules Validation](./2026-11-05-scorecard-rules-validation.md) (several points are
> the still-open S2.T5 *try state* and the §9.4 local-rule questions),
> [Feature Plan](./2026-10-27-scorecard-feature-plan.md), [Overview](../../features/scorecard-v2/overview.md).

**Guiding principle (unchanged, meeting 2026-11-05):** *field calls win* — the app may derive,
suggest and warn, but the operator can always override, and `Feldposition` always wins.

---

## 1. Triage

Rating: **bug** = the app does something wrong · **gap** = missing feature · **UX** = works, but
costs taps or attention · **rule?** = depends on a rule value that needs a decision (§4).

### 1.1 Series engine (`scorecard_v2/src/app/drive.ts`)

| # | Situation | Expected | Today | Cause | Rating |
|---|---|---|---|---|---|
| D1 | Penalty on 1st & Goal at B22 (offence penalty, 5 yd) | `1st & G @ A23` | `1st & M @ A23` | `applyPenalty` always returns `goal: false` and `toGo = middle - ballOn`; a goal-to-go series must keep the goal line (mirror `advance`/`placeBall`, which already do) | **bug** |
| D2 | Ball on the middle line | `1st & G @ B25` | `1st & M · M` | `pastMiddle` is `ballOn > middle` (R 5-1-1a "beyond", decision S2.T4). The operator expects *reaching* the middle to count. Independently, `& M` with 0 yards to go at `M` is a nonsensical display. | **rule?** + **bug** (display) |
| D3 | 4th down short of the middle | an explicit **Turnover** row in the log | only the possession flip | `submitPlay` (`Tracking.tsx` ~1450) calls `takePossession` only; no log row says *why* the ball changed | **gap** |
| D4 | Adjust down / line to gain by hand | correct `down` and `M`/`G` like the spot | only the spot (`FieldPositionSheet`) | `Feldposition` payload carries `ballOn` only; `placeBall` keeps the derived down | **gap** |
| D5 | 1st down in play-by-play | derived from the play | a separate **1st Down** tile next to the plays | `advance` already derives it; the tile is redundant once plays carry yards | **UX** |
| D6 | Safety as the result of any play | pick *Safety* as the play's result | separate Safety entry only | `PlaySheet` has no result step | **gap** |

### 1.2 Touchdown, try and possession

| # | Situation | Expected | Today | Cause | Rating |
|---|---|---|---|---|---|
| T1 | Touchdown entered | ball stays with the scoring team until the try is over | possession flips immediately | `flipsPossession` returns true for `Touchdown`; the flip is written with the TD | **bug** |
| T2 | Penalty during the try | penalty can be entered | only the try result (+1/+2/nicht verwandelt) | no try state (Rules Validation **S2.T5**, still open); tiles are locked while the XP is open | **gap** |
| T3 | Different QB on the try | pick the QB | pre-selected QB, no change | the XP step only asks the converter | **gap** |
| T4 | TD via play — loss switch | no *Raumverlust* option | loss switch shown | `PlaySheet` shows the gain/loss switch for every result | **UX** |
| T5 | TD via play — distance | prefilled with the distance to the goal line | field shows `0` | the yards default is `"0"` | **UX** |
| T6 | Separate TD tile | gone once the play has a *Score* result (TD → XP 1/2) | TD tile + play TD | layout predates the play sheet | **UX** |

### 1.3 Plays and entry flow (`PlaySheet`, `EditSheet`)

| # | Situation | Expected | Today | Rating |
|---|---|---|---|---|
| P1 | Order of the play sheet | wizard: **type → result → QB → receiver/runner → tackler** | one long form | **UX** |
| P2 | QB in the sheet | only the number once chosen, "ändern" to re-pick (rare) | full picker every time | **UX** |
| P3 | QB per team before kick-off | QB chosen in *Spiel vorbereiten* | QB remembered per device only after the first pass | **gap** |
| P4 | End spot instead of yards | type the spot (A/B + yards) *or* the yards, with a live preview "→ 2nd & M · B12" | yards only | **gap** |
| P5 | Edit a pass's yards | log shows the corrected yards | still `0 yd` | **bug** — `EditSheet` rebuilds `input` via `playInput`; needs a reproducing test (suspect: the drive suffix / optimistic row keeps the old text, or `payload.yards` is not what the row renders) |
| P6 | Interception | sheet: defender jersey, dead-ball spot, optional *pick six* (TD by that jersey) | one-tap entry, jersey later; `deadBall` exists in `SeriesSheet` but isn't asked on the first tap | **gap** |
| P7 | Overview tiles | **Pass · Run · Sack · Interception · Strafe · Spielzeit** directly on the board | one wide *Spielzug* button opening a sheet | **UX** |

### 1.4 Clock, timeouts, half-time

| # | Situation | Expected | Today | Rating |
|---|---|---|---|---|
| C1 | 2-minute warning / Spielzeit with an empty minutes or seconds field | empty = `0` | validation error (`timeError` in `SeriesSheet.tsx`, deliberately "both fields required") | **UX** (reverse the earlier decision: only *both* empty is an error) |
| C2 | Timeout | dialog with a 60-s countdown + the remaining game time | silent one-tap row, count-up in the UI | **gap** |
| C3 | 3rd timeout in a half | not possible | "3 von 2" | **rule?** — today a deliberate *warn, never block* (R7, meeting 36:57) |
| C4 | Timeouts per half | both teams start each half with 2 | already per half (`timeoutBudget(rows, team, half, …)`) — verify the header uses the current half after the half-time marker | verify |
| C5 | Half-time | dialog with a 120-s countdown, the 2nd-half possession and direction, the score | progress bar inside the Halbzeit button | **UX** |

### 1.5 Header layout

| # | Expected | Today |
|---|---|---|
| H1 | Possession shown in the score header (the team row), not as a separate switch below | separate *Ballbesitz* block |
| H2 | Timeouts at each team as circles: ●● → ●○ → ○○ | `1/2` text badge on the possession row |

---

## 2. Layers

One PR per layer, bottom-up, each with tests first (vitest for `scorecard_v2`, pytest where the
projector/`gameevents` changes). Layers 1–2 are small and fix wrong numbers on the board; they ship
first. Layers 3–6 change the entry flow and should be checked with the operator on
`stage.leaguesphere.app` (or demo) before merging.

### L1 — Series engine fixes (`drive.ts`, `Tracking.tsx` thin) · D1, D2 display, D3, C1
- `applyPenalty`: keep `state.goal`; line to gain stays the goal line in a goal-to-go series. Test:
  `1st & G @ B22` + offence 5 yd → `1st & G @ A23`; defence penalty in goal-to-go stays `& G`.
- Ball exactly on the middle: implement decision **Q1** (`series.middle_reached`) in `pastMiddle`;
  until it is decided, the bar must at least not claim a fresh `1st & M` at `M` — test the
  sequence the operator saw and pin the display.
- Turnover on downs writes a `Turnover` row (`input: "4th down"`, `payload.reason: "downs"`), and the
  possession flip carries that row's `originId`, so one undo removes both. Test in `possessionUndo`.
- `timeError`: one empty field counts as `0`; both empty stays an error. Update the help text.

### L2 — Try state · T1, T2, T3 (= Rules Validation S2.T5)
- `DriveState.phase: "series" | "try"`; a `Touchdown` enters the try for the **scoring team**.
- Defer the possession flip: the touchdown keeps the ball; the flip is written when the try ends
  (+1, +2, nicht verwandelt, defensive score), with the TD op as `originId` so undoing the TD still
  takes its flip. `flipsPossession` no longer flips on `Touchdown` alone. Old logs (flip right after
  the TD) must replay unchanged — golden test against `gameevents/tests/golden_cases.py`.
- During the try, **Strafe** is unlocked; a penalty repeats the try from the enforced spot
  (B5 → B2,5 / B7,5 …) and does not move the following series.
- The XP step shows the QB (number + "ändern") alongside the converter.

### L3 — Pre-game QB · P3
- *Spiel vorbereiten*, section 2: optional **Quarterback** per team (roster jersey picker). Stored in
  the game setup and seeded into the per-device memory (`rememberQuarterback`) at start, so every
  device taking over the game gets it. Skipping it keeps today's behaviour.

### L4 — Play wizard · P1, P2, P4, P5, T4, T5, D6, P6
- `PlaySheet` becomes steps: **type** (Pass/Run/Sack — preselected when opened from a tile, L5)
  → **result** (Raumgewinn · Incomplete · Touchdown · Safety · Interception) → **QB** (number only,
  "ändern") → **receiver/runner** → **tackler**. Steps that don't apply are skipped (no tackler on
  a TD, no receiver on a sack).
- Distance step: toggle **Yards** | **Endpunkt** (A/B + 0–25, same control as `FieldPositionSheet`)
  with a live preview line from `advance()` ("→ 3rd & M · A18" / "→ 1st & G · B20" /
  "→ Turnover on downs"). Result *Touchdown* prefills the distance to the goal line and hides the
  loss switch; *Safety* prefills the distance to the own goal line.
- Result *Interception* opens the interception step: defender jersey, dead-ball spot (`deadBall`),
  and **Pick six** → touchdown credited to that jersey, then the try for the defence. The
  standalone Interception tile uses the same sheet instead of one-tap + "Nr. ergänzen".
- P5: write the reproducing test first (edit a `Pass` row's yards 0 → 12, assert the rendered row
  and `driveAfter` both show 12), then fix.

### L5 — Board layout · P7, T6, D5, H1, H2
- Composer tiles: **Pass · Run · Sack · Interception · Strafe · Spielzeit** (each opens the wizard
  on its type); *Turnover*, *Feldposition*, *Challenge*, *Overtime* move to **Mehr**.
- The separate Touchdown tile goes when play-by-play is used: scores come from the play's result.
  A **Score** entry in *Mehr* stays for the short form (TD → XP 1/2) so a lower-league operator who
  doesn't track plays keeps one tap.
- **1st Down** tile hidden in play-by-play (derived, D5); kept in the short form.
- Header: each team row in `ScoreHeader` shows the ball icon when it has possession (tap = switch,
  replacing the *Ballbesitz* block) and two timeout circles (filled = left). Tap on the circles =
  take a timeout (L6 dialog). Keep the 44 px touch targets and the landscape/short-phone rules in
  `scorecard_v2/AGENTS.md`.
- "Play-by-play" vs "short form" needs a name and a switch — see **Q3**.

### L6 — Timeout and half-time dialogs · C2, C3, C5, D4
- **Auszeit** dialog: 60-s countdown (definition `timeouts.seconds`), optional field *verbleibende
  Spielzeit* (mm:ss, same parser as C1), "Auszeit beenden". Countdown is device-local like the
  half-time break (`break.ts` pattern), not a game event.
- No timeout left: the circles are empty and the dialog says so; behaviour per **Q2**.
- **Halbzeit** dialog: 120-s countdown (`periods.intermission_minutes`), the score, which team gets
  the ball in the 2nd half (`secondHalfPossession`) and the playing direction (setup direction,
  flipped). Replaces the progress bar inside the button.
- `FieldPositionSheet` gains **Down** (1–4) and **Line to gain** (M / G); the `Feldposition` payload
  carries `down` and `goal` when set, and `placeBall` uses them instead of the derived values.
  The projector ignores unknown payload keys — confirm in `gameevents/service/projector.py`.

---

## 3. Order and size

| Layer | Size | Depends on | Why this position |
|---|---|---|---|
| L1 | S | — | wrong numbers on the board today |
| L2 | M | L1 | wrong possession on every touchdown; unblocks penalties on the try |
| L3 | S | — | can ship in parallel |
| L4 | L | L2 | biggest UX gain; the wizard needs the try state for pick six / TD result |
| L5 | M | L4 | tiles open the wizard on a type |
| L6 | M | L5 (header circles) | dialogs; D4 can go earlier on its own |

---

## 4. Open decisions

| # | Question | Options | Decision (2026-11-08) |
|---|---|---|---|
| Q1 | Does a ball **on** the middle line earn the first down? (D2) | IFAF R 5-1-1a: *beyond* (today) · operator: *reaching* | **Reaching counts.** The definition carries `series.middle_reached: "on"`; `"beyond"` stays a data change for a league that plays the book literally. |
| Q2 | 3rd timeout in a half (C3) | block · warn + require a second tap and offer the *charged timeout* penalty | **Warn + second tap.** The circles show the state; the dialog names the 5-yard foul and records it only on the confirmed tap. |
| Q3 | Mode switch for play-by-play (D5, L5) | per league setting · per game in setup · device toggle | **Still open.** The board now carries the six primary tiles *and* keeps the short-form entries (Touchdown / 1st Down) until a mode switch is decided. |
| Q4 | Pre-game QB storage (L3) | `GameSetup` field (migration) · event payload on *Spiel gestartet* | **`GameSetup` field** (`qbHome` / `qbAway`, migration `0048`). The setup read already reaches every device; the start event carries no payload today. |

---

## 5. Implementation (2026-11-08)

Shipped on `feat/scorecard-field-test-9316`:

- **L1** — `applyPenalty` keeps goal-to-go; `series.middle_reached` ("on") is the definition's
  first-down line; a failed fourth down writes its own **Turnover** row (one undo removes play,
  row and flip); one empty mm/ss field counts as 0.
- **L2** — `DriveState.phase: "try"`: a touchdown keeps the ball, the try ends the possession
  (a miss is a possession change without a row), a penalty repeats it from the enforced spot,
  and the try sheet carries the quarterback.
- **L3** — **Spiel vorbereiten** stores an optional QB per team; starting seeds the device
  memory and every later device reads it from the setup.
- **L4** — the play wizard (type → result → distance → QB → receiver/runner → tackler), yards or
  end spot with a live preview, touchdown/safety results, interception with dead-ball spot and
  pick six; the edit bug was `payload.input` surviving the correction.
- **L5** — Pass/Run/Sack/Interception/Strafe/Spielzeit tiles, a **Mehr** menu, and the header
  carries possession and two timeout circles per team.
- **L6** — the Auszeit dialog (60 s countdown, optional game time, Q2 second tap), the
  Halbzeit dialog (score, second-half possession and direction), and **Feldposition** with
  **Down** / **Line to gain**.

Q3 remains open; the short-form tiles stay until it is decided.

---

## 6. Verification

- `scorecard_v2`: `vitest run` (1403 tests), `eslint`, `tsc -b --noEmit` and `vite build`.
- `gameevents`: `pytest gameevents/tests` (definition + projector); `gamedays/tests/api` for the
  setup contract.
- The operator's column is pinned in `scorecard_v2/src/app/drive.test.ts`: goal-to-go after a
  penalty, reaching the middle, the Turnover row, the try phase (TD, +1/+2, penalty, miss,
  old-log replay) and the explicit **Down** / **Line to gain** of a **Feldposition** row.
- A real 9316 log replay on stage is still the operator walk-through: export the log with
  `ls_db_sync` and feed it through `driveAfter` after the deploy.
