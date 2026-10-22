# Season rollover (staff)

Staff-facing flow that turns last season's league/team setup into this
season's, and hands off to gameday creation. Built for issue #2079; step 1 of
the home-page creation nudge (#2078) links here.

## Why

Before this flow, starting a season meant Django admin for `Season`, then a
second admin screen per league for `SeasonLeagueTeam`, then `gameday/new/`.
Non-admin staff could not do it at all, which is why the home-page nudge could
not honestly point anywhere.

## Routes

All staff-only (`is_staff`); anonymous users are redirected to login, other
users get 403.

| Route | Purpose |
|---|---|
| `/gamedays/seasons/` | Season list with league/team/gameday counts |
| `/gamedays/seasons/new/` | Create a season (name only) |
| `/gamedays/seasons/<pk>/update/` | Rename a season |
| `/gamedays/seasons/<pk>/leagues/` | League/team assignment for that season |
| `POST /gamedays/seasons/<pk>/leagues/copy/` | "Aus Vorsaison übernehmen" |
| `POST /gamedays/seasons/<pk>/leagues/<league_pk>/` | Manual assignment for one league |

Entry point: the **Saisons** button on the gameday list (staff only).

## Behaviour

- **Slug**: derived from the name with `slugify` on create. A name whose slug
  is already taken is a form error naming the conflicting season — never a 500
  and never an automatic suffix. Renaming keeps the existing slug, so links
  that already point at the season keep working.
- **"Aus Vorsaison übernehmen"** is the primary action on the setup page. The
  source defaults to the most recent season whose *name* sorts before the
  target (the ordering used by `SeasonViewSet` and the league-table
  repository); a source season can be chosen explicitly.
- **Copy is idempotent**: leagues already configured for the target season are
  skipped and reported, never overwritten. The confirmation message states the
  created/skipped counts.
- **Duplicates**: `SeasonLeagueTeam` has no database uniqueness constraint on
  `(season, league)` and this flow does not add one. New duplicates are
  prevented in the form (`SeasonLeagueTeamForm.clean`) and by the copy service;
  existing ones are reported by
  `python manage.py report_duplicate_season_league_teams` (read-only) so a
  follow-up migration can be prepared safely.
- **Deleting a season** is deliberately not offered: `Season` cascades to
  `Gameday`, so a delete affordance would need an explicit confirmation naming
  the affected gamedays and teams.

## Onward

The setup page links to the designer (`Aus Vorlage anwenden`, primary — the
same emphasis as `/gamedays/gameday/create/`) and to the classic
`gameday/new/` form (secondary).

Known limitation: the designer's "create gameday" action picks the first
season/league from its own API (ordered by season name, league name), so after
setting up a season it may not preselect the same league. Fixing that is
designer work, not part of this flow.

## Not modelled

Per-league staff scoping. `Permissions` is a bare name and users have no league
relation, so every new route is gated on `is_staff` and staff are treated as
instance-wide.
