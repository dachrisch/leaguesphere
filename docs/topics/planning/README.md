# Planning & Roadmap

Project plans, tracks, and roadmap documentation.

## Quick Links

### Active Plans
See [current/](./current/) for active planning work.

- [2026-09-25 App Review: Remediation Plan](./current/2026-09-25-app-review-remediation-plan.md): security, reliability, caching and hygiene fixes from the full-app code review
- [2026-10-04 Snapshot as the only public API](./current/2026-10-04-snapshot-only-public-api.md): implemented; public contract on `/api/snapshot/` (teams, standings, live includes, CORS, per-scope rebuild control); all other `/api/` endpoints internal
- [2026-10-13 In-App Help Section](./current/2026-10-13-in-app-help-section-design.md): design for the first in-app help, Markdown topics rendered server-side, bilingual-ready
- [2026-10-13 Help Videos & Howtos](./current/2026-10-13-help-videos-and-howtos-plan.md): walkthrough videos for the headline 2026 features, wired into the in-app help topics
- [2026-10-15 League Management & Result Recording Help Videos](./current/2026-10-15-league-and-results-help-videos-plan.md): three new help topics + walkthrough videos for running a gameday, recording results, and reading officials stats
- [2026-10-26 Scorecard v2](./current/2026-10-26-scorecard-v2.md): offline-capable field app at `/scorecard/v2/` (PWA + IndexedDB outbox, idempotent writes, device lock) while `/scorecard/` stays untouched
- [2026-10-27 LeagueSphere v5 Sync — Intake](./current/2026-10-27-leaguesphere-v5-sync.md): projects and open threads from the call with Christoph (offd/Moodle migration, Scorecard v2/v3, event sourcing, Game Day coexistence, Passcheck API); intake only, roadmap deferred
- [2026-10-27 Scorecard — Ideas & Findings](./current/2026-10-27-scorecard-ideas.md): every scorecard idea from that call in one place (v2 review findings, person matching, clock confirmations, sport templates, event sourcing, v3 capture, input UX, integrations)
- [2026-10-27 Scorecard — Feature Plan & Status](./current/2026-10-27-scorecard-feature-plan.md): those ideas as one tracked row each (ID, layer, status); all of them are to be added, the delivery layers ship bottom-up
- [2026-10-27 Scorecard — Layer Plan](./current/2026-10-27-scorecard-layers-plan.md): the concrete stack (L2 logos → L3 crew labels → L4 period templates → L5 start confirmation) with per-layer specs, acceptance and the subagent protocol
- [2026-11-05 Scorecard — Rules Validation](./current/2026-11-05-scorecard-rules-validation.md): IFAF 2023 against the field app (9 defects, 5 kept simplifications), the `flag_football_5v5` rule definition as data, the `gh stack` layer chain R0–R15 and the 2026-11-05 meeting cross-check
- [2026-11-08 Scorecard — Field Test 9316](./current/2026-11-08-scorecard-field-test-9316.md): an operator's first-half feedback triaged against the code (series engine, try state, play wizard, board layout, timeout/half-time dialogs) as layers L1–L6 with four open decisions

### Completed Plans
See [history/](./history/) for completed and archived plans.

## Overview

This directory tracks project plans and completed work. Plans use YYYY-MM-DD-name.md naming.

When a plan is complete, move it from `current/` to `history/`.
- [2026-10-28 Scorecard — Event Architecture](./current/2026-10-28-scorecard-event-architecture.md): recording separated from meaning — the app appends sport-neutral events, the server owns the store, the projection and the channels; slice 1 = event store + projection feed + liveticker
- [2026-11-05 Scorecard v2 Offline Scenarios](./current/2026-11-05-scorecard-offline-scenarios.md): two real phones, offline queues, hard kills, take-over and late returns — what the app does today, and the evidence for the Q4 take-over decision
