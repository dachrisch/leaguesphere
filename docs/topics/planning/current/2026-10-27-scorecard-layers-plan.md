# Scorecard — Layer Plan (stacked features)

**Goal:** turn the `next` rows of the [feature tracker](./2026-10-27-scorecard-feature-plan.md) into a linear chain of reviewable layer PRs and execute them one layer at a time with implementer subagents.

**Status:** L0 (#2104) awaiting design approval · L1 (#2113) in review · L2–L5 planned · blocked rows stay out.

---

## Stack model

```
master
 └── feat/scorecard-v2                 #2104  L0  (scorecard v2)
      └── feat/scorecard-v2-person-search   #2113  L1  (person search, this branch)
           └── feat/scorecard-v2-team-logos       L2
                └── feat/scorecard-v2-crew-labels      L3
                     └── feat/scorecard-v2-period-templates  L4
                          └── feat/scorecard-v2-start-confirmation  L5
```

Rules that keep the chain usable:

1. **One layer = one branch = one PR**, based on the branch below it. Never branch off `master` while a lower layer is unmerged.
2. **Merge bottom-up.** Each squash merge sends the layers above it `--onto` the new `master`; the lower layer's own branch is then deleted.
3. **A layer may only touch its own surface.** CI, version files (`scripts/check_version_sequence.py`, `release-please-config.json`, `.circleci/`, `container/`, `deployed/`), `passcheck_v2/`, `gamedays/0048_person_photo*` and the L0 backend endpoints belong to other owners.
4. **Migrations start at `0049`.** L0 ships `0046`/`0047`, Passcheck renumbers to `0048`. A layer that adds one announces the number in the PR body.
5. **Every layer ships its help text** (`/help/spieltag-v2/`, German, short) and a line in `docs/topics/features/scorecard-v2/overview.md`.
6. **Definition of done per layer:** failing test first, `pytest` + `vitest` green, `eslint`/`tsc` clean, `check_scope_coverage.py` OK, `codecov/patch` ≥ 90% of the diff, tracker rows flipped, PR body with a verification table.

## Order change (2026-10-28)

**Period templates moved behind the start confirmation.** L4 as planned assumes a 4-period game can be recorded, but the v2 write model is two-half only: `TeamLog.half` (1/2), `Gameinfo.status` (`1. Halbzeit`/`2. Halbzeit`), the per-half `entries` in the log payload and the liveticker all assume halves. A "Quarter" label on top of that would be a lie, and giving it real support is a backend layer of its own (model, aggregation, status transitions, liveticker, old-app compatibility).

So the chain continues with the **start confirmation** (self-contained, no data-model change) and the period template becomes `L6`, blocked on a quarters design decision. Nothing about the sport-template direction from the call changes — only the order in which it is safe to build.

## Execution protocol (subagent-driven)

Per layer, in order:

1. **Implementer subagent** — gets the layer spec verbatim plus the scene (worktree path, base branch, shared-surface rules). Writes the failing test, implements, runs the verification commands, commits with `-s`. Does not push, does not open the PR.
2. **Spec reviewer subagent** — checks the diff against the layer's "acceptance" list only (nothing missing, nothing extra).
3. **Code-quality reviewer subagent** — checks readability, duplication, test honesty, a11y, tokens instead of hard-coded colours.
4. **Controller (this session)** — re-runs the verification commands itself, checks `codecov/patch`, pushes, opens the PR with base = the layer below, flips the tracker and messages the scorecard owner.

A layer is not started until the one below it is pushed, so `git rebase --onto` stays trivial.

---

## L2 — Team identity: logos

**Branch:** `feat/scorecard-v2-team-logos` (base `feat/scorecard-v2-person-search`)
**Ideas:** `I1.7`, `I8.1` (logos only — colours are not on `Team` and need their own decision)
**Why:** the reviewer's only cosmetic finding, and the cheapest visible win for demo and field use; it makes a game recognisable at a glance.

**Scope (frontend only, no migration, no backend change):**

- Find the existing authenticated team payload (`GET /api/teams/` → `TeamSerializer` with `id`, `name`, `description`, `logo`). **Verify the response shape and pagination first**; do not invent an endpoint.
- `scorecard_v2/src/api/teams.ts`: `loadTeams()` → `Map<name, logoUrl>`, plus `teamLogo(name)`; resolve relative `/media/…` URLs as-is.
- Cache the mapping in the existing IndexedDB snapshot store under a versioned key so the field app still shows logos offline after one online load; a failed load is silent (initials fallback stays).
- Render in `ScoreHeader` (both sides), `GameList` rows and the `GameSetup` header. Fallback: the existing `initials()` circle. 32 px in lists, 40 px in the header; `alt=""` because the team name is adjacent text.
- Tests: `teams.test.ts` (payload → map, missing logo, offline read), `ScoreHeader`/`GameList`/`GameSetup` assertions for logo vs. initials fallback.

**Out of scope:** team colours, logos in the liveticker/widgets, logo upload.

**Acceptance:** a game with two known teams shows both logos in list, setup and header; a team without a logo (or a failed/offline load) shows the initials, never a broken image; no new network call per screen.

---

## L3 — Crew positions per league

**Branch:** `feat/scorecard-v2-crew-labels` (base L2)
**Ideas:** `I1.3`, first half of `I4.1`
**Why:** the officials step hard-codes five positions with German labels; associations name and count them differently. This is the first template-shaped change and proves the config pattern with one field.

**Assumption recorded (was `Q4`):** the configuration lives on the **league** (a gameday inherits it), because the same crew works a whole league's season. Revisit if the league manager disagrees; it is one migration either way.

**Scope:**

- Model: `CrewPosition` (league FK, `position` — the exact `GameOfficial.position` wire value, `label`, `order`, `required` bool) **or** a JSON field on the league if a model proves heavier than the value; migration `0049`.
- Seed defaults for the existing five positions so nothing changes for leagues without configuration; unknown stored positions keep rendering read-only (unchanged behaviour).
- API: positions for a game's league (`GET /api/game/<id>/crew-positions` or a field on the games-to-whistle payload — pick the one that adds no new round trip to the setup screen).
- Django admin/management for the league manager to edit labels, order and the required flag; a league without rows falls back to the current five.
- `GameSetup` renders the configured slots; completeness counting uses `required` instead of the hard-coded `REFEREED_POSITIONS` set.
- Tests: model/config fallback, endpoint, slot rendering + `x/y` counter, unknown position preserved.

**Out of scope:** officials count per sport (`I4.1` second half — it follows with the sport template in L4), per-gameday overrides.

**Acceptance:** a league with configured labels shows them in the setup (and its counter counts only `required` slots); a league without configuration behaves exactly as today; the old scorecard's writes stay readable.

---

## L5 — Period templates (game format) — deferred until quarters are designed

**Blocked:** the two-half write model above. Do not start this layer by adding labels; the layer has to bring `TeamLog`/status/aggregation support for four periods first.
**Branch:** `feat/scorecard-v2-period-templates` (base L3)
**Ideas:** `I4.4`, `I4.5`, `I4.2`, second half of `I4.1` (`Q4` answered by L3's league-level choice)
**Why:** "Halbzeit" is wrong for a 4×12 tackle game, and the coin toss in the review needs receive/defer/side with a mirrored second half. This is the sport template in its smallest honest form.

**Scope:**

- League-level template: `periods` (2 or 4), `period_minutes`, `officials_required` (3–8), `period_label` derived (`Halbzeit` for 2, `Quarter` for 4 — never typed by an operator).
- Migration `0050`; seed the current football defaults so existing leagues are unchanged.
- `GameSetup`: coin toss winner chooses **Erhalten / Abgeben / Seite** instead of a bare side; the choice is stored and mirrored for the second half, shown as a summary line ("Wolves erhalten, Ravens wählen West in Hälfte 2").
- `Tracking`: half-time button and period markers use the template's label and count.
- Tests: template → labels, coin-toss mirroring, migration defaults, setup summary.

**Out of scope:** the live clock (`I6.1`, v3), per-event "stops the clock" (`I3.5`), event/penalty label catalogues (`I4.6` — its own layer later).

**Acceptance:** a 2-period league still says "Halbzeit" and behaves exactly as today; a 4-period league never shows "Halbzeit"; the second-half coin-toss consequence is visible before the half starts.

---

## L4 — Start confirmation and required fields

**Branch:** `feat/scorecard-v2-start-confirmation` (base L3)
**Ideas:** `I3.1` (confirmation half), `I3.3`, `I3.4`, `I1.4`
**Why:** the review's complaint is that a wrong setup entry costs the whole game and that bad input is accepted. A confirmation before **Spiel starten** is the cheap half of the clock story and does not need the v3 clock.

**Scope (frontend, plus one display field if needed):**

- First tap on **Spiel starten** opens a confirmation sheet that restates what is about to start: teams, format (`2 × 20 Min`), toss result, first possession, direction, crew completeness, licence warnings. Second tap starts.
- Incomplete input is refused rather than confirmed: a crew slot that is `required` but empty, a free-text name without both names, a missing toss/possession/direction.
- Saving and the clock are separate concerns: the sheet states that the setup write does not start a clock, and no client-side timer is introduced.
- Tests: first tap opens the sheet and writes nothing, second tap writes exactly once, missing required input blocks with a specific reason, the existing licence confirmation still works.

**Out of scope:** the in-app live clock (`I6.1`) and per-event clock stops (`I3.5`).

**Acceptance:** a wrong format is caught before the game starts; nothing is sent on the first tap; the licence warning and the confirmation do not stack into three taps.

---

## L5 — Preparation-screen layout (delivered 2026-10-28)

**Branch:** `feat/scorecard-v2-prep-layout` · **PR:** [#2120](https://github.com/dachrisch/leaguesphere/pull/2120) · base L4.

A design review of the preparation screen (referee on a phone, outdoors, under time pressure) produced the layout that now ships: crest card, `1. Offizielle` with required-first card rows and the optional position behind an add-row, one `2. Spielkonfiguration` card with the three renamed switches, a state-aware readiness banner above the sticky start bar, an account menu that owns theme + logout, and the 320/360/600/900 px table (wider shell **prep-only**, so sheets and lists keep 560 px). Presentation only — L4's two-tap start, blockers and offline behaviour are unchanged.

Copy that moved with it: `Vorbereitung` → `Spiel vorbereiten`, `Richtung` → `Spielrichtung`, `Münzwurf` → `Münzwurf gewonnen von`, `vollständig` → `4/4 besetzt`. `I2.2` was rewritten to match what actually ships: guests keep the yellow **Freitext** tag, linked state is stated in the picker rather than as a green chip on the row.

## Not in this chain

| Idea | Why not now |
|---|---|
| `I5.1` event sourcing, `I6.x`, `I9.2`, `I9.3` | blocked on Leon (`Q1`); would replace the write model |
| `I9.1` Game Day officials | blocked on the API contract (`Q5`) |
| `I9.4` fantasy football | explicitly v3+ |
| `I4.6` event/penalty label catalogue | needs the template model from L4 first; own layer afterwards |
| team colours | not on the `Team` model; needs a product decision on where they live |
| `I1.1` explicit per-event side picker | v2 records both sides through possession; the reviewer's complaint needs a design decision, not a layer yet |

## Risks

| Risk | Mitigation |
|---|---|
| #2104 changes while L2+ are open | L0 is frozen for design approval; only the `--onto master` rebase touches these layers |
| Migration collision with Passcheck | start at `0049`, announce the number in the PR body |
| Offline behaviour regressions (L2 cache, L5 confirmation) | every layer with storage or a blocking step adds an offline test (`offline.test.tsx` pattern) |
| Layers grow into each other | acceptance lists above are the spec; anything else becomes a tracker row, not a patch |
