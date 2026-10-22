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

## Header and orientation

The page opens like a home, not a console:

- **Greeting by time of day** (`Guten Morgen` < 11, `Guten Tag` < 18, `Guten Abend`) plus the
  person's first name from `UserProfile.firstname`, then `user.first_name`; without a real name
  the greeting stays neutral (never the role, never the account login).
- **Avatar** prefers `UserProfile.avatar`, then the team's `Team.logo`, then initials of the
  person (first + last name). The old role abbreviation ("ST" for staff) is gone.
- **Role line in a sentence** ("Teamverantwortlich für …", "Liga-Verwaltung · <Liga>") plus the
  season context. No date in the header — it is a home page, not a console.
- **A strip of icon pills** at the bottom links into the rest of the site — the page is the
  post-login target (`LOGIN_REDIRECT_URL`) and should orient, not only list tasks. Links are
  role-aware: everyone gets Spieltage, Offizielle, Team and Hilfe; team users and staff also get
  their league's table; staff additionally get the season administration.
- **No destination twice.** The strip owns navigation, so cards only carry links the strip does
  not offer (Kader & Transfers, Saison anlegen, Spieltag manuell anlegen). The nudge's gameday
  step already opens the designer, so it has no second designer button; the past is stated by the
  review card only. A test asserts each of those URLs appears exactly once inside `<main>`.
- **Card badges only for `warning`/`danger`** — an `info` card (like "nothing planned yet") carries
  no chip. Row-level severity still always says `Erledigt` / `Achtung` / `Offen` in words.

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
   before the gameday). Without one: **Saison → Spieltag**, with the designer as
   the default way and the manual `gameday/new/` form as the fallback only.
   Creating a gameday *from a template* happens in the designer, so "Vorlage" is
   an annotation on the gameday step ("Vorlage vorhanden – im Designer anwenden"
   / "Keine Vorlage – im Designer anlegen"), not a step of its own. Step 1 links
   to the season flow from #2079, not to Django admin.

   Both staff states also carry one **past review card**: the last season, how
   many gamedays it has (and whether it is finished), teams/leagues, the last
   gameday with "vor N Wochen/Tagen", and how many of its games have results.
   Pluralisation is correct (`1 Spieltag`, `6 Spieltage`), zero-value rows are
   omitted, the date is not printed twice when the gameday name already contains
   it ("Gameday on 16.10.2026"), and a season without gamedays collapses to a
   single line instead of `Teams 0 · Ligen 0` / `Spiele erfasst 0 / 0`.

Every row states its severity in words (`Erledigt`, `Achtung`, `Offen`); colour
is never the only carrier. Completed checks stay visible as a green row so the
list feels finite. An empty October is **not** an alarm: the "nothing planned"
nudge is neutral (`Hinweis`), and `Achtung`/`Offen` are reserved for states that
are actually wrong (roster below the league minimum, missing officials).

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
- The designer's "create gameday" picks the first season/league from its own API
  unless it is opened with `?season=<id>&league=<id>` (stacked follow-up PR).

## Tests

`pytest home`. The suite covers the pure cards, role selection, the four view
states, the wiring (`/` still 301s, nav points at `/home/`, login redirect) and a
query-count test proving 1 team and 12 teams cost the same number of queries.
