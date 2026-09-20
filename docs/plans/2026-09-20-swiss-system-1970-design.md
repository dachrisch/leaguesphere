# Swiss System Tournament Engine — Design Notes (#1970)

**Status:** exploratory design notes, not an implementation plan. Written while scoping #1970;
several decisions below are still open and need a ruling before implementation starts.

**Mock:** a self-contained, dependency-free click-through prototype of the flow described here is
in this PR at `docs/plans/2026-09-20-swiss-system-1970-mock/` — open `index.html` in any browser,
no server or account needed. The same flow also lives as a richer interactive Claude artifact:
<https://claude.ai/artifact/2VBwY4Y2rjcsEeTWKCcvYn> (private — ask the author to share it if you
can't open the link).

## What #1970 asks for

A Swiss-system tournament engine inspired by the JLT Flag 2026 format (AFCV NRW): teams are
seeded once, each round pairs teams by current points (top half of a group vs. bottom half),
odd-sized groups float their lowest seed down, byes go to the lowest-ranked team that hasn't had
one, and it should integrate with the gameday designer (#1921) for scheduling.

## Rule verification

The generic [Wikipedia Swiss-system article](https://de.wikipedia.org/wiki/Schweizer_System) is
chess-oriented and does **not** specify bye or floater mechanics — its only concrete odd-group
rule is in a Pétanque-specific aside, and it floats a team *up* into the group above, which is the
opposite direction from what #1970 describes.

The [actual JLT Flag 2026 source](https://afcvnrw.de/news/das-spielsystem-beim-jlt-flag-2026/)
matches #1970's description exactly:
- Floater: the weakest seed in an odd-sized group ("T5" in their example) drops down into the
  next-lower points group.
- Bye: worth 2 points, goes to whichever team is lowest on the original seed list among those
  that haven't had one yet ("kein Team muss zweimal aussetzen").
- Not specified by either source: rematch avoidance across rounds, and tie-break criteria for the
  final ranking (chess Swiss convention uses Buchholz / Sonneborn-Berger, but that's not confirmed
  for this format). See **Open questions**.

## Reframing: control panel, not a one-shot flow

Every other format in `gameday_designer` is authored once as a flow and then run. Swiss can't work
that way — pairings for round *N* don't exist until round *N-1*'s results are in. For this stage
type the designer becomes a loop: enter teams + rounds/fields/duration once, then repeatedly
*generate → play → confirm → generate* until the configured round count is reached. The round
table itself is also worth its own public-facing view (via `liveticker`), not just something
embedded in the organizer's control panel — see **Reuses**.

## Architecture

**Today:** `gamedays/wizard/gameday_format.py` + `SCHEDULE_MAP` (in `gamedays/forms.py`) pick one
fixed pairing table by team count, once, before the gameday starts. The newer `gameday_designer`
models a template as `stages[]`, each with a `progressionMode` (`round_robin`, `placement`, …) and
a `progressionMapping` of fixed `sourceIndex` winner/loser refs (`utils/tournamentTemplates.ts`),
resolved once when the template is authored. Neither model fits Swiss.

**Proposed:** a new `progressionMode: 'swiss'` stage. Config is
`{ rounds, fields, gameDuration, seedOrder }`. Instead of a static `progressionMapping`, a
`SwissRoundResolver` runs *after* a round's results are confirmed and fills in the next round's
pairings from the seed list + live standings.

**This isn't as new as it sounds.** `GameNode` (`gameday_designer/src/types/flowchart.ts`)
already separates the game's *reservation* (`fieldId`, `startTime`, `duration`, `breakAfter`) from
its *pairing* (`homeTeamDynamic` / `awayTeamDynamic`, nullable until resolved) — exactly like a
playoff's TBD semifinal slot works today. `startTime` also already supports a `manualTime` flag
("true if startTime was manually set — prevents auto-recalc"). So:
- Fields + game duration at setup are only needed to pre-create every round's slots (field +
  time) through the *existing* auto-time-calc engine, teams left `null`.
- The computed per-round start time is a **default, not a lock** — the organizer can nudge any
  round's time individually (reusing the existing `manualTime` override), e.g. if a round runs
  long and the next one needs to shift. `SwissRoundResolver` only ever fills in the two dynamic
  team refs on slots that already exist; it never creates or times a slot itself.

## Reuses as-is

- `GameResultModal` for score entry — a Swiss game is scored exactly like any other.
- The existing auto-time-calc engine + `manualTime` override for slot scheduling.
- `TeamSelectionModal` for the team pool.
- `LeagueRuleset` (`league_table/models.py`) for point values — win/bye = 2 pts is a ruleset
  variant, not bespoke Swiss-only scoring.
- `liveticker` (already a standalone public app, no sign-in) as the natural home for a public
  round-standings view, reading the same standings query the control panel uses.

## New

- A setup step: seeds + rounds + fields + game duration, replacing nothing (no existing wizard
  step captures a rank order or a round count).
- Pre-creation of all rounds' slots (field + time) at setup, teams left unresolved.
- `SwissRoundResolver` service: grouping by points, top/bottom split, floater cascade, bye
  assignment.
- A "generate next round" action, gated on the current round's results being confirmed.
- A public standings view served through `liveticker`.

## Open questions

1. A bye is worth 2 pts but isn't a game. The schema is game-centric today — does a bye get a
   synthetic `Gameinfo` row, or a standings-only adjustment? Affects both the standings query and
   the designer canvas rendering.
2. Rematch avoidance and final-ranking tie-breaks aren't specified by the AFCV source. Needs a
   ruling before round 3+ can be built with confidence.
3. Exact UI for adjusting a round's start time (single control per round vs. per-game) isn't
   designed yet — the mock only demonstrates that the affordance needs to exist.

## Next steps

This is scoping, not a task breakdown. Before writing an implementation plan we need answers to
the open questions above, in particular the bye/schema question since it affects the data model.

## Implementation status (v1, #1971)

Round-pairing engine implemented, no data-model or UI changes yet:

- Backend: `gameday_designer/service/swiss_round_resolver.py` (`SwissRoundResolver.resolve_round`,
  `SwissRoundResult(pairings, bye, floaters)`), tested in
  `gameday_designer/tests/test_swiss_round_resolver.py`.
- Frontend mirror: `gameday_designer/src/utils/swissRoundResolver.ts` (`resolveSwissRound`,
  `SWISS_BYE_POINTS`), tested in `src/utils/__tests__/swissRoundResolver.test.ts`.
- Type integration: `ProgressionMode` gains `'swiss'` with a `SwissConfig`
  (`{ rounds, seedOrder, byePoints }`) in `src/types/flowchart.ts`. Existing
  `round_robin`/`placement` branches are untouched — swiss stages carry no static
  `progressionMapping`; the resolver fills `homeTeamDynamic`/`awayTeamDynamic` on
  pre-created slots instead.

v1 rulings on the open questions above:

1. Bye is a standings-only adjustment returned separately (`bye`, worth
   `BYE_POINTS = 2`); no synthetic `Gameinfo` row is created.
2. Rematch avoidance is best-effort adjacent swap (deterministic, no randomness);
   final-ranking tie-breaks stay out of scope (ordering is points, then seed).
3. Round start-time UI still open — `manualTime` override already covers per-game
   nudges; no new control added in v1.

Still open: setup step (seeds + rounds + fields + duration), slot pre-creation,
"generate next round" action gating, and the public `liveticker` standings view.

## Decisions confirmed (2026-09-21)

Reviewed the v1 implementation (hand-traced both `resolve_round` and `resolveSwissRound` against
the AFCV-verified rules — both correctly reproduce the mock's 10-team scenario) and ratified the
open-question rulings above:

1. **Bye schema:** standings-only adjustment, as implemented. No synthetic `Gameinfo` row.
2. **Tie-breaks:** points then seed, as implemented. No Buchholz/Sonneborn-Berger.
3. **Rematch avoidance:** best-effort adjacent swap, as implemented. Not worth a
   backtracking search for a rule the source doesn't even confirm is required.
4. **PR scope:** #1971 also carries an unrelated opencode-bot commit (a matchreport
   flaky-test fix, `c10d0c35`). Decision: leave it merged together rather than
   splitting it out — small, already correct, not worth the extra git surgery.

One real bug found and fixed during review: `resolve_round`/`resolveSwissRound` each had an
`is_last_group`/`isLastGroup` branch handling an odd-sized pool at the last points group by
re-picking a bye. That state is mathematically unreachable (the upfront global bye keeps the
active-team count even, and induction over the floater carry shows the last group's pool parity
always matches it) — confirmed by hand-tracing both implementations — but the two "mirrored"
files handled the impossible case inconsistently (Python silently overwrote an already-assigned
bye; TS silently dropped a team from pairing with no record at all). Replaced both with a
post-loop invariant check that raises/throws instead of silently misbehaving if that assumption
is ever violated by a future change. Also dropped an unused `swapped` flag and an unused
`bye_points` parameter that had already drifted out of the TS mirror. All 14 existing tests
(7 Python + 7 TypeScript) still pass unchanged.
