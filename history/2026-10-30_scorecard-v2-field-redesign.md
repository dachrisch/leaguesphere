# Scorecard v2 — field redesign (2026-10-30)

## Problem

A design review of `/scorecard/v2/` on demo (iPhone 13 viewport, referee
account) found an app that worked but read like a website shrunk onto a phone:

- ~40% of the height was chrome (steel bar, brand/kicker line with a large
  title, a pinned footer); on tracking the footer covered the game log.
- Every entry opened a sheet; possession was a small pill; the log sat below
  the actions.
- The touchdown sheet pre-selected a +1 conversion before the try was played.
- An official without an assignment hit a dead-end empty state.
- A device lock was discovered only on the first write and then announced up
  to five times; offline state was a small dot.
- **Bug:** a reopened game showed no possession on any device — event appends
  stored it in `gameevents.GameState`, but `/api/gamelog/<id>` reads
  `Gameinfo.in_possession`.

Review artifact: https://claude.ai/artifact/Lh4qNWSkzHF8LEq4H2K28a

## Solution (PR series)

Stacked PRs, each based on the previous branch (GitHub retargets on merge):

| PR | Branch | Content |
|---|---|---|
| #2182 | `feat/scorecard-v2-quick-wins` | One app bar, no footer (legal links in the account menu), wake lock, save vibration, `--action` CTA token, copy fixes |
| #2183 | `feat/scorecard-v2-tracking-cockpit` | Possession switch, log above actions, one-tap 1st Down / Turnover with undo toast and "Nr. ergänzen" |
| #2185 | `feat/scorecard-v2-touchdown-two-step` | Touchdown alone; extra point after the try in the TD button's place; keypad above 24 players; scorer chips |
| #2186 | `feat/scorecard-v2-game-list` | Segmented Meine/Alle with fallback, "Als Nächstes" card, unclamped pairings |
| #2187 | `feat/scorecard-v2-preparation` | Folded complete crew, direction on a field, "Bitte beachten" first in the start sheet |
| #2188 | `feat/scorecard-v2-sync-lock` | One sync strip, "wartet" tags, single lock message |
| #2189 | `feat/scorecard-v2-lock-on-open` | Setup read reports `locked_elsewhere` / `can_release_lock`; staff "Spiel übernehmen" |
| (this) | `feat/scorecard-v2-outdoor-theme` | "Sonne" high-contrast theme |

Independent from `master`: **#2184** `fix/gameevents-sync-possession` — event
appends mirror the projected possession onto `Gameinfo.in_possession`.

## Deliberately not done (decisions for the product owner)

- Auto-opening a single gameday (changes boot flow and back navigation).
- Coin-toss choice ball/defer/side (backlog I4.2, waits on sport templates).
- Removing the start confirmation (a deliberate safety step, I3.1/L4).
- Take-over by any crew referee instead of staff only (permission rule).
- Team colours on the team model (I8.1).

## Verification

- Frontend: `cd scorecard_v2 && npx vitest run` (1005 tests at the top of the
  stack), `npm run eslint`, `npx tsc -b --noEmit`.
- Backend: `pytest gameevents gamedays accounts officials teammanager` against
  the LXC MariaDB (`./container/spinup_test_db.sh`).
- Visual: a locally seeded demo (`seed_demo_data`, `seed_scorecard_demo`) on an
  iPhone 13 profile in light, dark and Sonne; two-device lock/take-over run.

## Known issues / follow-ups

- One-tap entries race the session's mount-time queue read if tapped within
  milliseconds of opening a game (tests use `renderTrackingReady`).
- The open extra point lives in memory; a reload before answering drops the
  prompt (the touchdown row is saved).
- Local visual runs of the stack lose possession after a reload until #2184 is
  merged.
