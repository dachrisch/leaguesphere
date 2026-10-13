# What's New 2026

User-facing highlights shipped in LeagueSphere during 2026 (Jan–Oct; versioned
as v3.19.0 → v4.36.x — work from Jan–mid-May predates release-please
versioning, so it has PR numbers but no version entries).
Source of truth is the merge history / root `CHANGELOG.md` — this page curates
the major features by theme, not every fix. Contributors are credited per item
(`@dachrisch`, `@JaWeilBaum`, `@phhbr`; dependency-bot PRs excluded).

## Baseline: what LeagueSphere could already do before 2026

Before the 2026 work, LeagueSphere was already a complete league-operations
system (Django 5.2 + MariaDB backend, standalone Vite React apps served via
`collectstatic`):

- **Core scheduling (`gamedays`)** — create and manage gamedays, leagues,
  games, schedules and results; league-table standings calculation.
- **Visual planning (`gameday_designer`)** — flowchart-based schedule design
  with templates.
- **Game day execution** — on-field score entry (`scorecard`), real-time fan
  updates (`liveticker`), match reporting (`matchreport`).
- **People & eligibility** — club/roster management (`teammanager`), officials
  management (`officials`), player eligibility verification (`passcheck`),
  auth via DRF + Knox (`accounts`).
- **Insight (`journey`, `dashboard`)** — user-journey tracking and operations
  dashboard.

What was missing: there was no public, cross-origin API or embeddable widget
(clubs could not publish scores on their own sites), designer work was largely
manual (no tours, no auto-assign, no move-across-stages, no expert inspector),
officials compliance and imports were manual, and there was no maintenance
mode, SEO/OG metadata, or scoped/zero-downtime release machinery. The sections
below are the new capabilities on top of that baseline.

## Now: new capabilities in 2026 at a glance

| Before (pre-2026 baseline) | Now (new in 2026) |
|---|---|
| Scores visible only inside LeagueSphere | Embeddable `<iframe>` Share Widget + multi-team table view for club sites |
| Internal APIs only | Public `/api/snapshot/` (teams, standings, live, year) + `/api/leagues/` slug |
| Manual designer builds | Onboarding tours, Expert Mode inspector, move games across stages/fields, configurable durations, auto-assign referees |
| Legacy + canvas gamedays side by side | Legacy migration to Designer + adoption reporting, Finals 2026 templates, Tournament View |
| Manual officials checks, XLSX by hand | Self-reported import UI, team cards + leaderboard, automatic compliance check + licenses |
| Rosters/stats without passcheck link | Passcheck Export + Passcheck names in statistics |
| Raw journey events, static dashboard | Per-session timeline widget, live/upcoming gameday status |
| No maintenance switch, thin SEO | Maintenance mode + health signal, JSON-LD + Open Graph, DB-outage auto-recovery |

## Early 2026: designer foundations, dashboards, journey tracking (Jan–May)

Shipped before release-please versioning started — PR numbers instead of
versions, mostly `@dachrisch`:

- **Tournament generation in the designer** (#694, #728, #731, #944) —
  automatic time calculation, ranking-stage refinements, dual-tournament
  progression with centralized placeholder resolution, validation system with
  highlighting and cross-stage logic, team exchange (#805), structured export
  (#793).
- **Designer i18n** (#710, #971) — full internationalization of the designer.
- **Gameday Management & Dashboard** (#758, #1147) — management views plus a
  game-progress dashboard.
- **Templates** (#980, #1060) — gameday template management, league-team
  selection for tournament templates.
- **Journey tracking** (#1097, #1155) — user-journey tracking system plus a
  global journey dashboard and layout refactor.
- **Spielberichtsbogen lite** (#1150) — lightweight scoresheet.
- **Demo environment** (#1071) — complete demo env with auto-reset and seeding.
- **DB resilience groundwork** (#984, #1393) — connection guard, auto-recovering
  DB-outage page.
- **Team pool** (#1085) — team select dialog with association filters.

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

- **Tournament View (v4.8.0, @JaWeilBaum #1573)** — dedicated view for cup/tournament gamedays.
- **Onboarding tours (v4.11.0, @dachrisch #1598)** — guided tours for manual build and
  save-as-template.
- **Designer identity (v4.10.0, @dachrisch #1593)** — real user avatar + username in the designer
  header; Orga designer link cleanup (v4.6.0).
- **Expert Mode progression inspector (v4.25.0, @JaWeilBaum #1938)** — inspect dual-progression
  state; see [dual-progression](./dual-progression.md).
- **Move games between stages and fields (v4.23.0, @dachrisch #1922)** — drag/reassign across
  stages without rebuilding.
- **Configurable defaults (v4.32.0, @JaWeilBaum #1976)** — default game duration and
  break-between-games are now designer settings.
- **Auto-assign referees (v4.7.0, @dachrisch #1572)** — one-click referee assignment in the
  designer.
- **Legacy migration (v4.20.0, @dachrisch #1883)** — migrate legacy gamedays to the Designer,
  with adoption reporting (v4.21.0) and creation-method metrics (v3.31.0).
- **Finals 2026 templates (v4.2.0, @JaWeilBaum #1528)** — ready-made finals templates.
- **Safer results handling** — block unlocking a gameday with entered results
  (v4.3.0), `restore_gameday` scoped recovery command (v4.4.0), ResourceURLs
  for gameday details (v3.32.0).

## Officials & match report: compliance without paperwork pain

- **Self-reported games import (v4.27.0, @dachrisch)** — staff UI to import referee
  self-reported games (XLSX-native dates, "Mix" position, async review UI with
  tag search and consolidated menu).
- **Team cards + referee leaderboard (v4.19.0, @JaWeilBaum, #1871)** —
  searchable team cards and referee statistics leaderboard.
- **Automatic compliance check (v4.24.0, @JaWeilBaum, #1917)** — match report
  checks officials compliance automatically and shows license numbers.
- **Scorecard officials lookup (v4.35.1, @JaWeilBaum, #2039)** — find officials
  by full name; officials summary and licenses in the scorecard.
- **Passcheck integration** — Passcheck Export in match report & gameday view
  (v4.9.0, @JaWeilBaum #1582, re-landed #1586); Passcheck names in statistics
  (v3.21.0, @JaWeilBaum #1244).
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

## Security & privacy hardening (@phhbr, #1977/#1978)

App-review remediation, phases 1–2 — mostly invisible, all user-protecting:

- **Transport & framing** — secure cookies, HSTS + SSL redirect in prod/stage,
  removed invalid `ALLOWALL` frame option (back to `DENY`), nginx security
  headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).
- **Fail loud, not open** — prod/stage refuse to start without required env
  vars instead of silently falling back to defaults; CORS allow-all replaced
  with an explicit allow-list.
- **XSS fixes** — hand-escaped rendering in league/gameday statistics, game
  detail, tournament and match-report tables; escaped officials-import messages
  and JSON-LD payloads.
- **Abuse & privacy** — rate-limited HTML login endpoints, pass numbers hidden
  from anonymous roster visitors, journey-event validation with a retention
  purge command. Decision recorded in
  [passcheck-roster-privacy](./passcheck-roster-privacy.md).

## Under the hood (for operators)

Zero-downtime blue-green Watchtower swaps (v4.31.0), path-scoped CI with
fanned-out shards (v4.26.0), tag-driven releases + release-please automation
(v3.27.0, v3.19.0), game-aware auto-approve (v4.13.0). No action needed for
most users.

---
*Last updated: 2026-10-13. Full history: root `CHANGELOG.md`.*

## Contributors (2026 feature work)

- **@dachrisch** — designer foundations (tournament generation, i18n,
  templates), dashboards, journey tracking, demo env, maintenance mode,
  Share Widget + snapshot API, officials import UI, scoped CI / releases.
- **@JaWeilBaum** — Tournament View, Passcheck Export + names in statistics,
  Open Graph tags, ResourceURLs, Finals 2026 templates, officials leaderboard,
  compliance check, Expert Mode inspector, configurable designer durations,
  scorecard officials lookup.
- **@phhbr** — security & privacy hardening (settings/edge phase 1,
  escaping/validation phase 2).
