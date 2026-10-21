# What's New 2026

A year of LeagueSphere, in plain language. The story actually starts in late
2025: that's when the Gameday Designer and the new league-table engine landed.
In 2026 LeagueSphere became a platform that can publish your competitions on
your own website. Here is the foundation and everything that followed.

## At a glance: before → now

| Before | Now |
|---|---|
| Scores lived only inside LeagueSphere | Publish fixtures, results, live scores and tables on your own club site |
| Schedules built by hand | Gameday Designer with templates, tournament generator and one-click referee assignment |
| Tables were fixed to one scheme | Configurable points, tie-breakers and precision, multiple teams and leagues at a glance |
| Cups and group stages were the limit | Swiss-system tournaments with automatic pairings and an embedded table |
| Referee paperwork was manual | Import self-reported games, automatic compliance checks, referee leaderboards |
| Rosters and stats stood alone | Linked with Passcheck: exports and names where you need them |
| Static overview pages | Live "upcoming / in progress" status on today's game days |

## Show your games on your own website

The headline capability of the year: LeagueSphere can now power the scores and
tables on your club's site.

- **Embeddable widget** — drop a small snippet into any website to show
  fixtures, results, live scores and league tables. Pick your teams, season and
  league; the widget adapts to your club's logo and colors and resizes itself to
  fit.
- **Multi-team tables** — one embed can show every league your teams play in,
  with your teams highlighted.
- **Public API** — clubs that want their own layout can read the same data from
  `/api/snapshot/`, an anonymous, read-only endpoint any website can call. See
  [Public API](./public-api/overview.md).
- **Better sharing** — LeagueSphere links now show proper titles and images when
  shared, and include search-engine-friendly data.

See [Share Widget](./share-widget/overview.md).

## Plan game days and tournaments faster

- **Guided start** — built-in tours walk you through building a schedule and
  saving it as a reusable template.
- **Template library** — save templates, share them with others and reuse them
  with teams from your association.
- **Less clicking** — assign every referee with one button, move games between
  stages and fields instead of rebuilding them, and set your own defaults for
  game length and breaks.
- **Cups and tournaments** — dedicated tournament views, automatic time
  calculation and ranking stages, plus ready-made "Finals 2026" templates.
- **Swiss system** — set rounds and fields, generate each round's pairings
  automatically, follow the standings inside the designer and adjust pairings by
  hand when needed.
- **Expert Mode** — a progression inspector shows exactly how teams advance
  through complex tournament formats; see [dual-progression](./dual-progression.md).
- **Know who planned what** — the designer shows the planner's name and avatar.
- **Links where you need them** — attach livestream and document links to a game
  day.
- **Upgrade without rework** — legacy schedules are migrated into the designer
  automatically, and a lost schedule can be restored.
- **Safe by design** — game days with entered results can't be unlocked by
  accident, and schedule editing is limited to staff.

More in the [Gameday Designer](./gameday-designer/).

## Referees and match reports, minus the paperwork

- **Import reported games** — referees' self-reported games, including
  spreadsheets, are reviewed and imported through a guided staff workflow.
- **Automatic compliance checks** — match reports verify the officials and show
  license numbers by themselves.
- **Referee profiles** — searchable team cards and a referee leaderboard show
  who officiated what.
- **Eligibility where you need it** — export eligibility data from match reports
  and game days, and see eligibility names in statistics.
- **Fewer logins** — referees can stay signed in while they self-report games.

## Follow your league day by day

- **Live status** — today's game days show whether they're upcoming or live,
  with clearer progress overviews.
- **Maintenance notices** — planned downtime is announced in advance and shown
  clearly instead of failing silently.
- **Self-healing** — the site recovers on its own after a brief database
  hiccup, and updates are deployed without downtime.

## Help right in the app

- **Topics instead of a manual** — getting started, game days, league tables,
  teams & officials, the Gameday Designer, the share widget and referee imports.
- **Screenshots and short videos** — the most important workflows are explained
  visually.

## Safer and more private

- **Roster privacy** — player pass numbers are only visible to signed-in users;
  anonymous visitors and search engines see obfuscated names only. See
  [Passcheck roster privacy](./passcheck-roster-privacy.md).
- **Hardened logins and data** — rate limiting, secure cookies, HTTPS
  enforcement, security headers and stricter input handling across the site.
- **Reliable logos** — team logos are served consistently, and broken logo links
  are hidden instead of showing empty images.

## The foundation: what landed in late 2025

None of 2026 would have been possible without the work in the months before.
The essentials:

- **The Gameday Designer** — the visual schedule editor with stages, fields,
  colors and progression badges. Tournaments get automatic time calculation.
- **The new league table** — standings are calculated, with configurable points,
  tie-breakers and precision. Add several teams to a league in one step and group
  tables by league.
- **The gameday wizard** — create game days with groups, stages and formats, then
  keep editing, delete or reset them.
- **Rules and licenses** — BOFF license rules and license years.
- **Being found** — the LeagueSphere name with its own favicon, plus `robots.txt`
  and `sitemap.xml` for search engines.
- **Reliable operations** — a health check that includes login, and a staging
  environment for testing before going live.

Everything else — game days, Scorecard, Liveticker, match reports, Passcheck and
dashboards — already existed and remains the base.

---

*Thanks to @dachrisch, @JaWeilBaum and @phhbr for the feature work since late 2025.*
