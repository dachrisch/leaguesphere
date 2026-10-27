# Scorecard — Feature Plan & Status

**Source:** [Scorecard — Ideas & Findings from the 2026-10-27 Sync](./2026-10-27-scorecard-ideas.md) (raw material, 12 sections, timestamps into the transcript).
**Companion:** [LeagueSphere v5 Sync — Intake](./2026-10-27-leaguesphere-v5-sync.md) (the full call: offd/Moodle, Game Day, Passcheck API).
**What this is:** the implementation plan for those ideas, with one tracked row per idea. The call deliberately deferred prioritisation; the decision on 2026-10-27 is that **all of them are to be added eventually**, so this document is a backlog with owners and layers, not a schedule.

Update the `Status` column when a layer ships. When nothing is left in `in layer` or `next`, move this file to `history/`.

| Tracked | `shipped` | `in layer` | `next` | `blocked` | `v3+` | `dropped` |
|---|---|---|---|---|---|---|
| 45 | 4 | 8 | 22 | 2 | 5 | 4 |

Last updated: 2026-10-27 (L1 opens with the person search).

---

## Delivery layers

Each feature is one layer PR, stacked on the layer below it until it reaches `master`. A layer is a reviewable unit, not a theme: the person-matching work is one layer, the clock confirmations are another. The concrete chain (branches, specs, acceptance, subagent protocol) is the [Scorecard — Layer Plan](./2026-10-27-scorecard-layers-plan.md).

| Layer | Branch | PR | Ships | Status |
|---|---|---|---|---|
| L0 | `feat/scorecard-v2` | [#2104](https://github.com/dachrisch/leaguesphere/pull/2104) | Scorecard v2 at `/scorecard/v2/` (offline outbox, device lock, possession model, penalty search, dark/light theme) | open, design awaiting approval |
| L1 | `feat/scorecard-v2-person-search` | [#2113](https://github.com/dachrisch/leaguesphere/pull/2113) | Person search across the database + linked/free-text state on the officials crew (`I1.5`, `I1.6`, `I2.1`–`I2.6`) | in review |
| L2 | `feat/passcheck-v2` | [#2114](https://github.com/dachrisch/leaguesphere/pull/2114) | Passcheck v2 at `/passcheck/v2/` — **left the stack** on 2026-10-27: rebased on `master`, only Passcheck code, merged independently of the scorecard layers | open |
| L3+ | per-feature branches, stacked on L1 | — | the `next` rows below, in the [layer plan](./2026-10-27-scorecard-layers-plan.md)'s order | not started |

Scorecard layers merge bottom-up (`L0 → L1 → L3 …`); each squash merge sends the layers above it `--onto` the new `master`. Passcheck no longer participates — it is a parallel track with no shared files, and its migration (`gamedays/0046_person_photo`) will be renumbered to `0048` after #2104 lands, because the scorecard ships `0046`/`0047`. L1 adds no migration.

## Status vocabulary

| Status | Meaning |
|---|---|
| `shipped` | in `master` |
| `in layer` | built or being built in the named open layer PR |
| `next` | planned, not started; gets its own layer when it is picked up |
| `blocked` | needs a decision or sign-off (owner named) |
| `v3+` | explicitly after v2 runs cleanly |
| `dropped` | rejected or deprioritised by decision |

## Cross-cutting rules (every row)

- **TDD.** A failing test first, then the change — backend in `pytest`, frontend in `vitest`, the field flow in the Playwright e2e.
- **Signed commits** (`git commit -s`, DCO) and conventional prefixes.
- **Help topic.** Every change an operator can see updates `/help/spieltag-v2/` (German) with a fresh screenshot — see `.opencode/skills/add-help-topic/SKILL.md`.
- **Feature doc.** `docs/topics/features/scorecard-v2/overview.md` describes the flow; it is updated in the same layer.
- **Scoped CI.** New frontend paths need `run-scorecard-v2` in `.circleci/scope-mapping.txt`; `scripts/check_scope_coverage.py` is the safety net.
- **Version files** (`scripts/check_version_sequence.py`, `release-please-config.json`, `.circleci/`, `container/`, `deployed/`) belong to L0 and to the parallel Passcheck track (#2114); feature layers leave them alone.

---

## §1 Findings from the v2 stage review

| ID | Idea | Status | Layer / note |
|---|---|---|---|
| `I1.1` | The other team must be selectable — record what the opponent does, not only "my" team | `next` | v2 already records both sides through possession (touchdown/PAT for the side in possession, penalties against the opponent, turnovers flip possession). An explicit per-event side picker is **not** built; needs a design decision before a layer |
| `I1.2` | Dark/light theme distinction | `shipped` | L0: `ThemeToggle`, `theme.ts`, tokens in `styles/tokens.css` |
| `I1.3` | Referee/operator labels configured per league | `next` | New layer; needs a config model + migration and a decision on league vs. gameday vs. sport scoping (`Q4`) |
| `I1.4` | Required fields enforced instead of accepted-then-cleaned-up | `next` | Partly there in L0 (licence warning before start, captains must be confirmed); the general rule is not enforced |
| `I1.5` | Free-text names leave records unlinked; the suggestion list is never used | `in layer` | L1 |
| `I1.6` | Person search covers only the current team, not the whole database | `in layer` | L1 |
| `I1.7` | Team logos are not used at all yet | `next` | Small layer, frontend-only: `Team.logo` already serialises; also §8 |

## §2 Person matching & data quality (the biggest operator complaint)

| ID | Idea | Status | Layer / note |
|---|---|---|---|
| `I2.1` | Suggest aggressively while typing ("we found these people") | `in layer` | L1: `PersonPicker`, debounced search |
| `I2.2` | Visible link state — unlinked yellow/ambiguous, linked green | `in layer` | L1: chip per crew row, green "verknüpft" / yellow "Freitext" |
| `I2.3` | Fuzzy/automatic matching for the clearly matchable | `in layer` | L1: a single clear match is *offered* ("Übernehmen"), never written silently |
| `I2.4` | Search across the entire database | `in layer` | L1: new `GET /api/officials/search/list`, DB-wide (the existing search needs both names, ≥3 characters and excludes one team, so it cannot drive a typing picker) |
| `I2.5` | First + last name are required fields | `in layer` | L1: enforced on the free-text path |
| `I2.6` | No "pseudo-regulation" via free text — refuse the unlinked variant when a match exists | `in layer` | L1 for the crew; the captains field stays free text (no FK on `GameSetup`) and needs its own layer |

## §3 Clock handling and confirmations

| ID | Idea | Status | Layer / note |
|---|---|---|---|
| `I3.1` | Game duration feeds the live clock — confirm before pressing Start | `next` | v2 has no live clock yet (v3, `I6.1`); today only the licence warning needs a second tap |
| `I3.2` | Second confirmation for corrections made during the game | `next` | Reference pattern: handball's yellow flag |
| `I3.3` | The official clock stays authoritative; the device is an aid, drift is corrected by announcement | `next` | Design constraint for `I3.1`, not a feature on its own |
| `I3.4` | Saving must not stop the clock; saving and clock are separate concerns | `next` | Same layer as `I3.1` |
| `I3.5` | Per event type, configure whether the entry stops the clock | `next` | Depends on `I6.1` |

## §4 Match setup — templates instead of user configuration

Decision from the call: fixed templates per sport, held in the gameday designer and picked by the league manager; a new sport is a new template. Not a free-form configuration screen.

| ID | Idea | Status | Layer / note |
|---|---|---|---|
| `I4.1` | Officials count 3–5 (football) / 5–8 (tackle), selectable | `next` | Template work; `Q4` decides the owner of the field |
| `I4.2` | Coin toss winner chooses receive / defer / side, mirrored in the second half | `next` | Template work; today v2 records the toss winner only |
| `I4.3` | Possession & direction labels per sport | `next` | Template work |
| `I4.4` | Game time per sport (2×20 football, 4×12 tackle, 2×10 youth indoor) | `next` | Template work |
| `I4.5` | Period semantics — "Halbzeit" vs "Quarter" | `next` | Template work |
| `I4.6` | Event/penalty labels per league | `next` | Template work; v2 has a penalty search over the configured catalogue already |
| `I4.7` | Sport templates live in the gameday designer, selected by the league manager | `next` | The umbrella row for `I4.1`–`I4.6` |

## §5 Event sourcing — the architectural decision

The app writes only events; a server-side service derives score, period, penalties, statistics and liveticker state. Accepted by Christoph, **Leon's sign-off outstanding** (`Q1`).

| ID | Idea | Status | Layer / note |
|---|---|---|---|
| `I5.1` | Event-only writes with a per-event sequence counter; consumers derive state | `blocked` | Needs Leon (`Q1`) and decides whether it lands in v2 or v3. L0 already ships the pieces that make it cheap later: idempotent submissions, a per-game device lock, a snapshot of the log |

## §6 v3 — live event capture and statistics

Explicitly after v2 runs cleanly.

| ID | Idea | Status | Layer / note |
|---|---|---|---|
| `I6.1` | Live clock inside the scorecard, pausing on interaction, resuming on save | `v3+` | Every event then carries a real timestamp |
| `I6.2` | Events ordered by sequence, not by minute | `v3+` | Depends on `I5.1` |
| `I6.3` | Statistics beyond the score (who caught, who tackled, yards, penalty type, down) | `v3+` | GFL has a statistician per team; trade-off: more events = fewer operators |
| `I6.4` | Several devices each covering a slice, all writing into one stream | `v3+` | Depends on `I5.1` |

## §7 Input UX — buttons vs. one search field

| ID | Idea | Status | Layer / note |
|---|---|---|---|
| `I7.1` | Curated button grid for frequent events | `shipped` | L0: the tracking screen is a button grid |
| `I7.2` | Search over the full catalogue for the long tail | `shipped` | L0: penalty sheet search |
| `I7.3` | Voice input via the phone keyboard | `next` | Free by-product of a text field; no work planned until `I7.4` is decided |
| `I7.4` | Emerging consensus: shortlist of buttons + search over everything | `shipped` | L0 is exactly this shape |

## §8 Team identity & roster

| ID | Idea | Status | Layer / note |
|---|---|---|---|
| `I8.1` | Team logos and colours move to the central team entity and are used by scorecard, widgets, liveticker | `next` | Same layer as `I1.7`; `Team.logo` exists, the scorecard ignores it |
| `I8.2` | Does the scorecard need its own Kader, or does Passcheck create it? | `blocked` | Deferred to the Leon session (`Q3`) |

## §9 Integrations & portability

| ID | Idea | Status | Layer / note |
|---|---|---|---|
| `I9.1` | Game Day creates referee assignments; LeagueSphere pulls them into the officials step | `next` | Contract is `Q5` |
| `I9.2` | Liveticker fed by scorecard events, so referees stop re-typing results | `next` | Depends on `I5.1` |
| `I9.3` | Telegram channel subscriptions per team/league, driven by the same events | `next` | Depends on `I5.1` |
| `I9.4` | Fantasy football off the captured data | `v3+` | Concrete association request, explicitly not scoped |
| `I9.5` | Keep the API boundary clean so the app could run against another association's backend | `next` | Standing constraint on every layer; no distribution or licensing commitment |

## §10 Long-term vision

Not tracked: automated capture (camera + AI, several observers, hybrid) is beyond v3 and only becomes possible once `I5.1` exists.

## §11 Explicitly rejected / deprioritised

| ID | Idea | Status | Reason |
|---|---|---|---|
| `I10.1` | Open user-facing configuration of periods, officials count, coin toss | `dropped` | Replaced by sport templates (§4) |
| `I10.2` | Competing with Game Day on referee planning | `dropped` | Coexistence via API (`I9.1`) |
| `I10.3` | Rebuilding the Kader before Passcheck is settled | `dropped` | Wait for Leon (`Q3`) |
| `I10.4` | Fantasy football now | `dropped` | `I9.4` is v3+ at the earliest |

## §12 Open questions (Leon session)

| ID | Question | Blocks |
|---|---|---|
| `Q1` | Event sourcing: yes/no, and does it land in v2 or v3? | `I5.1`, `I6.x`, `I9.2`, `I9.3` |
| `Q2` | Does the scorecard own statistics capture, or only score + penalties? | `I6.3` |
| `Q3` | Kader: does the scorecard require a roster, or does Passcheck create it? | `I8.2` |
| `Q4` | Which template fields belong to league vs. gameday vs. sport? | `I1.3`, `I4.x` |
| `Q5` | Game Day hand-over contract: what exactly goes over the API in each direction? | `I9.1` |

---

## Suggested order for the `next` rows

Chosen for cost and dependency, not for importance — the call's own ranking was deferred.

1. **Team logos & colours** (`I1.7`, `I8.1`) — frontend-only, immediately visible, no migration.
2. **Per-league crew labels** (`I1.3`) — first template-shaped change, proves the config pattern with one field.
3. **Required fields** (`I1.4`) — small, closes the "accepted then cleaned up" complaint.
4. **Clock confirmations** (`I3.1`, `I3.3`, `I3.4`) — start confirmation, independent of the v3 clock.
5. **Sport templates** (`I4.1`–`I4.7`) — needs `Q4` answered first.
6. **Event sourcing** (`I5.1`) — needs `Q1`; unblocks `I6.x`, `I9.2`, `I9.3`.
7. **Game Day officials** (`I9.1`) — needs `Q5`.
8. **v3 capture** (`I6.x`) — only after v2 runs cleanly in the field.

## Keeping this current

- When a layer opens: flip its rows to `in layer` and name the PR in the layer table.
- When a layer is squash-merged: flip its rows to `shipped`; the help topic and the feature doc are part of "shipped", not a follow-up.
- When a decision lands: resolve the matching `Qn` row, then move the `blocked` rows to `next` with an owner.
- When a `next` row is picked up: it gets its own layer in the table above — the row moves, the backlog does not shrink by accident.
