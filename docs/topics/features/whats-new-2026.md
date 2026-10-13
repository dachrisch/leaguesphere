# What's New 2026

User-facing highlights shipped in LeagueSphere during 2026 (v3.19.0 → v4.36.x).
Source of truth for dates/versions is the root `CHANGELOG.md` — this page
curates the major features by theme, not every fix.

## Share your games anywhere: embeddable widget + public API

The biggest 2026 theme: clubs can now publish LeagueSphere data on their own sites.

- **Embeddable Share Widget (v4.34.0)** — `<iframe>` widget for fixtures,
  results, live scores and standings. Generator at `/share/` with search-first
  team picker, season/league selection, human-readable year param, club logo
  and color customization, auto-sizing embed, phone-width standings table,
  HH:MM kick-off and context-aware result column. Non-optional
  "powered by LeagueSphere" attribution. See
  [Share Widget](./share-widget/overview.md).
- **Multi-team table view (v4.35.0)** — one embed renders a standings table per
  league for all selected teams, with generator league list derived from all
  teams and highlighted own teams.
- **Public snapshot API (v4.29.0, v4.33.0, v4.36.0)** — `/api/snapshot/` is now
  the only public, cross-origin readable endpoint (`/api/leagues/` exposes
  `slug` for directory use). Snapshot gained `teams, standings, live, year`,
  cheap ETag freshness, throttled rebuilds, and the widget builds on the public
  snapshot only. Documented in [Public API](./public-api/snapshot-v1.md).
- **SEO/sharing polish** — sitewide Organization/WebSite JSON-LD (v4.28.0) and
  Open Graph tags (v3.28.0) for better link previews and search results.

## Gameday Designer: faster to build, harder to break

- **Tournament View (v4.8.0)** — dedicated view for cup/tournament gamedays.
- **Onboarding tours (v4.11.0)** — guided tours for manual build and
  save-as-template.
- **Designer identity (v4.10.0)** — real user avatar + username in the designer
  header; Orga designer link cleanup (v4.6.0).
- **Expert Mode progression inspector (v4.25.0)** — inspect dual-progression
  state; see [dual-progression](./dual-progression.md).
- **Move games between stages and fields (v4.23.0)** — drag/reassign across
  stages without rebuilding.
- **Configurable defaults (v4.32.0)** — default game duration and
  break-between-games are now designer settings.
- **Auto-assign referees (v4.7.0)** — one-click referee assignment in the
  designer.
- **Legacy migration (v4.20.0)** — migrate legacy gamedays to the Designer,
  with adoption reporting (v4.21.0) and creation-method metrics (v3.31.0).
- **Finals 2026 templates (v4.2.0)** — ready-made finals templates.
- **Safer results handling** — block unlocking a gameday with entered results
  (v4.3.0), `restore_gameday` scoped recovery command (v4.4.0), ResourceURLs
  for gameday details (v3.32.0).

## Officials & match report: compliance without paperwork pain

- **Self-reported games import (v4.27.0)** — staff UI to import referee
  self-reported games (XLSX-native dates, "Mix" position, async review UI with
  tag search and consolidated menu).
- **Team cards + referee leaderboard (v4.19.0)** — searchable team cards and
  referee statistics leaderboard.
- **Automatic compliance check (v4.24.0)** — match report checks officials
  compliance automatically and shows license numbers.
- **Passcheck integration** — Passcheck Export in match report & gameday view
  (v4.9.0); Passcheck names in statistics (v3.21.0).
- **Smoother sign-up (v4.1.0)** — remember-me for officials sign-up.

## Journey, dashboard and operations

- **Journey timeline (v4.14.0)** — user-journey analysis reworked into a
  per-session timeline widget.
- **Live dashboard (v3.20.0)** — dynamic live/upcoming status for today's
  gamedays ("UPCOMING" until first game starts), clearer terminology and
  progress visualization.
- **Maintenance mode (v4.5.0, v4.17.0–v4.18.0)** — admin toggle, simplified to
  a 3-scope dropdown, surfaced on the health-check endpoint.
- **DB-outage resilience (v3.30.0)** — auto-recovering DB-outage page when the
  database returns.

## Under the hood (for operators)

Zero-downtime blue-green Watchtower swaps (v4.31.0), path-scoped CI with
fanned-out shards (v4.26.0), tag-driven releases + release-please automation
(v3.27.0, v3.19.0), game-aware auto-approve (v4.13.0). No action needed for
most users.

---
*Last updated: 2026-10-13. Full history: root `CHANGELOG.md`.*
