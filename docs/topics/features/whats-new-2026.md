# What's New 2026

A year of LeagueSphere, in plain language. 2026 turned LeagueSphere from a place
to run your game days into a platform that can publish your competitions on your
own website. Here's what's new, grouped by what you actually do.

## At a glance: before → now

| Before 2026 | Now |
|---|---|
| Scores lived only inside LeagueSphere | Publish fixtures, results, live scores and tables on your own club site |
| Schedules built by hand | Guided tours, one-click referee assignment, move games across stages, sensible defaults |
| Cup and tournament planning was basic | Dedicated tournament views, ready-made finals templates, legacy schedules migrated automatically |
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
- **Less clicking** — assign every referee with one button, move games between
  stages and fields instead of rebuilding them, and set your own defaults for
  game length and breaks.
- **Cups and tournaments** — dedicated tournament views, automatic time
  calculation and ranking stages, plus ready-made "Finals 2026" templates.
- **Expert Mode** — a progression inspector shows exactly how teams advance
  through complex tournament formats; see [dual-progression](./dual-progression.md).
- **Know who planned what** — the designer shows the planner's name and avatar.
- **Links where you need them** — attach livestream and document links to a game
  day.
- **Upgrade without rework** — legacy schedules are migrated into the designer
  automatically, and a lost schedule can be restored.
- **Safe by design** — game days with entered results can't be unlocked by
  accident, and schedule editing is limited to staff.

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

## Safer and more private

- **Roster privacy** — player pass numbers are only visible to signed-in users;
  anonymous visitors and search engines see obfuscated names only. See
  [Passcheck roster privacy](./passcheck-roster-privacy.md).
- **Hardened logins and data** — rate limiting, secure cookies, HTTPS
  enforcement, security headers and stricter input handling across the site.
- **Reliable logos** — team logos are served consistently, and broken logo links
  are hidden instead of showing empty images.

## What LeagueSphere already did coming into 2026

Everything above builds on the basics you already rely on:

- Plan game days and leagues, with tables and standings calculated
  automatically.
- Design schedules visually with the Gameday Designer, using reusable templates.
- Enter scores on the field (Scorecard), follow games live (Liveticker) and
  write match reports.
- Manage clubs, rosters, referees and player eligibility (Passcheck).
- Dashboards to follow operations and usage.

---

*Thanks to @dachrisch, @JaWeilBaum and @phhbr for the 2026 feature work.*
