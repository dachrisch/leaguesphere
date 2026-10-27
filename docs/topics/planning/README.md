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

### Completed Plans
See [history/](./history/) for completed and archived plans.

- [2026-10-26 Passcheck v2](./history/2026-10-26-passcheck-v2.md): phone-first passcheck UI (`/passcheck/v2/`) beside the unchanged `/passcheck/`; shipped with backend validation, permission-checked photos, idempotent writes and an offline outbox

## Overview

This directory tracks project plans and completed work. Plans use YYYY-MM-DD-name.md naming.

When a plan is complete, move it from `current/` to `history/`.
