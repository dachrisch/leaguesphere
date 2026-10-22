# Personal home (`/home/`)

One authenticated page per role, answering "what do I owe before the next
gameday". Built for issue #2078. Server-rendered, read-only, German UI, **zero
migrations** — nothing about the visitor is stored.

## Why

LeagueSphere is form-shaped: people log in when they have to enter something.
There was no page that gave them a reason to look *before* the deadline, and `/`
redirects straight to the gameday list. The home page is built only from data
that already exists — no notifications, no email, no feed, no per-user state.

## Routes and wiring

| Route | Behaviour |
|---|---|
| `/home/` | `HomeView`, `LoginRequiredMixin` |
| `/` | unchanged: permanent redirect to the gameday list |
| nav "Home" | now points at `/home/`; `LOGIN_REDIRECT_URL = "home"` |

`league_manager/views.py::homeview` and its unused template were removed.

## The four states

Role precedence: **team → official → staff → guest**.

1. **Team with an upcoming gameday** — countdown, date, field(s), first kickoff,
   the team's games with the previous meeting's scoreline, and a checklist:
   roster below the league minimum (`EligibilityRule.minimum_player_strength`,
   read only when a rule exists), players without a jersey number, incoming
   transfers awaiting approval, officials assigned.
2. **Team, no upcoming gameday (season break)** — "Keine Spieltage geplant"
   with the reason, the off-season chores (jersey numbers, roster size), and the
   season's other gamedays. This is the normal state most of the year.
3. **Team-less official** — next `OfficialGamedaySignup`, licence state, games
   finished without a result. Officials authenticate through Moodle, and the
   schema has **no User → Official relation**, so this state renders only when
   `request.session["moodle_logged_in_user"]` is present.
4. **Staff** — with an upcoming gameday: readiness (understaffed games via
   `officials_compliance_service`, drafts in the league, licences that expire
   before the gameday). Without one: the 3-step chain **Saison → Vorlage →
   Spieltag**, with **"Aus Vorlage anwenden" as the primary action** and the
   manual `gameday/new/` form as the fallback. Step 1 links to the season flow
   from #2079, not to Django admin.

Every row states its severity in words (`Erledigt`, `Achtung`, `Offen`); colour
is never the only carrier. Completed checks stay visible as a green row so the
list feels finite.

## Data rules

- **`TeamLog.player` is a jersey number** — rendered `#19`, never resolved to a
  name. Moments are scoring events only (`SCORING_EVENT_VALUES` / `SCORING_EVENTS`
  in `gamedays/service/gamelog.py`), keyed on the event name because
  `TeamLog.value` is `0` when no number was entered.
- **`Gameresult` has only `fh`, `sh`, `pa`** — the score block shows
  `own (fh+sh) : pa`. No yardage, catches or completions exist and none are
  invented.
- **Table movement** is the only new computation: `LeagueTableService.get_standing(until_date=...)`
  ranks the league as of the day **before the last gameday** and is compared with
  the current rank.
- **No new business rules**: the checklist reads existing rules and validators.

## Not built (deliberately)

Notifications, email, a public/`share` twin, a feed, an activity stream,
per-user "since you last looked", and any rating/prediction/ranking beyond the
existing table engine. A team's "top scorer" ranking would be exactly such a new
ranking, so it is not shown.

## Known gaps (follow-ups)

- **No per-league staff scoping.** `Permissions` is a bare name and users have
  no league relation, so staff are treated as instance-wide; the nudge is limited
  to the league of the most recent gameday and only fires when that league has no
  upcoming gameday.
- **Official state depends on the Moodle session** (no User → Official link).
- `AutoAssignOfficialsService` (`gamedays/service/auto_assign_officials_service.py`)
  has no product surface yet, so readiness can only link to the gameday page.

## Tests

`pytest home`. The suite covers the pure cards, role selection, the four view
states, the wiring (`/` still 301s, nav points at `/home/`, login redirect) and a
query-count test proving 1 team and 12 teams cost the same number of queries.
