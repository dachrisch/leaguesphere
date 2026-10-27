# Passcheck Field App (`/passcheck/v2/`)

The Passcheck v2 is the phone-first passcheck for the sideline. It runs beside the
classic `/passcheck/` UI, writes the same `PlayerlistGameday` and
`PasscheckVerification` rows, and can be rolled back per gameday by using the
old link.

## What it does

- **Games for today**: the official sees the games their team officiates, with
  a „geprüft“/„offen“ state per team.
- **One-tap roster**: tapping a player checks them; the last check can be undone
  for five seconds. The header tracks checked count and `Ø s/Spieler`.
- **Player record**: jersey number (skipping numbers already in use), eligibility
  errors as a hard block, warnings that do not block, and the consent-gated pass
  photo.
- **Save**: the verification sheet enforces the minimum player strength and a
  named official, then sends the roster with a `client_id` and `device_id`.
- **Offline**: when the network is down the save goes into an IndexedDB outbox;
  it is retried on the next `online` event and in FIFO order. A counter is shown
  and finalising is blocked while entries wait.

## Server guarantees

The old app keeps working while v2 is in the field:

- New request fields are optional; a legacy write without `client_id`/`device_id`
  is accepted.
- A repeated `client_id` applies at most once (idempotent retry).
- A different v2 device gets `409`; staff can clear the lock with
  `python manage.py reset_passcheck_device --team <id> --gameday <id>`.
- Roster writes are restricted to the gameday's officiating team (or staff) and
  validated against the season roster, jersey range/uniqueness and strength
  rules.

## Photos and privacy

- A photo is served only when `photo_consent_at` is set and the requester
  officiates that gameday.
- Photos live in `PASS_PHOTO_ROOT`, outside `MEDIA_ROOT` (nginx serves `/media/`
  unauthenticated), in the `pass-photos` compose volume.
- The endpoint streams the bytes with `Cache-Control: no-store` and
  `X-Content-Type-Options: nosniff`; the client fetches them as an authenticated
  blob, never as a plain `<img src>`.

Bulk import for the pilot:

```bash
python manage.py import_pass_photos --dir /path/to/photos --dry-run
python manage.py import_pass_photos --dir /path/to/photos --consent
```

The file name must be the player's pass number. Consent is **not** recorded
unless `--consent` is passed for a batch with written consent.

## Rollout

- `/passcheck/v2/` is opt-in: linked from the passcheck menu („Passcheck v2“) and from
  each game card in the old UI.
- `/passcheck/` stays the default and is unchanged.
- The service worker only controls `/passcheck/v2/`; it never caches `/api/**` and
  never touches the old app.

## Tests

```bash
/root/dev/dachrisch/leaguesphere/.venv/bin/python -m pytest passcheck_v2 passcheck --ds=test_settings
npm --prefix passcheck_v2 run test:run
npm --prefix passcheck_v2 run typecheck
npm --prefix passcheck_v2 run eslint
```

Plan and acceptance protocol:
[2026-10-26 Passcheck v2](../planning/history/2026-10-26-passcheck-v2.md).

## Stage acceptance (combined rc.4)

Passcheck v2 is stacked on Scorecard v2, so the first stage build that contains
it is the combined `deploy.yaml` run from `feat/passcheck-v2` after rc.3. Do not
deploy or run the field protocol before that build.

### Seed a gameday and 14-player roster

Run on the stage container with the app's settings. Replace the team, league,
season and user placeholders with stage values; run it once (it is not
idempotent for players).

```python
from datetime import date, timedelta

from django.contrib.auth.models import User

from gamedays.models import Gameday, Gameinfo, Gameresult, League, Person, Season, Team
from passcheck.models import EligibilityRule, Player, Playerlist

officials = Team.objects.get(name="<OFFICIALS_TEAM>")
home = Team.objects.get(name="<HOME_TEAM>")
away = Team.objects.get(name="<AWAY_TEAM>")
league = League.objects.get(name="<LEAGUE>")
season = Season.objects.get(name="<SEASON>")
user = User.objects.get(username=officials.name)

gameday, _ = Gameday.objects.get_or_create(
    name="Passcheck Feldtest",
    date=date.today(),
    defaults={"league": league, "season": season, "start": "10:00", "author": user},
)
game, _ = Gameinfo.objects.get_or_create(
    gameday=gameday,
    field=1,
    defaults={"scheduled": "10:00", "officials": officials, "stage": "", "standing": ""},
)
Gameresult.objects.get_or_create(gameinfo=game, team=home, isHome=True)
Gameresult.objects.get_or_create(gameinfo=game, team=away, isHome=False)

rule, _ = EligibilityRule.objects.get_or_create(
    league=league,
    defaults={"max_gamedays": 99, "minimum_player_strength": 1, "maximum_player_strength": -1},
)
rule.eligible_in.add(league)

for number in range(1, 15):
    person = Person.objects.create(
        first_name=f"Testspieler {number:02d}", last_name="Passcheck", year_of_birth=1995
    )
    player = Player.objects.create(person=person, pass_number=f"9{number:04d}")
    Playerlist.objects.create(
        team=home,
        player=player,
        jersey_number=number,
        joined_on=date.today() - timedelta(days=30),
    )

print(f"GAMEDAY {gameday.pk}; officials team {officials.name}; 14 players for {home.name}")
```

`maximum_player_strength=-1` means "no maximum" and is accepted (regression
covered by `test_accepts_when_the_maximum_strength_is_disabled`).

### Import the three consenting photos

Name each file after the player's `pass_number` (`.jpg`, `.png` or `.webp`):

```bash
python manage.py import_pass_photos --dir /tmp/passcheck-photos --dry-run
python manage.py import_pass_photos --dir /tmp/passcheck-photos --consent
```

Only run `--consent` for photos with written consent.

### Field protocol

1. Log in as the officials team, open `/passcheck/v2/?gameday=<id>`, start at
   the first player and stop after the last; record `Ø s/Spieler`.
2. After player 5, enable airplane mode, finish the roster and save.
3. Reconnect and confirm exactly one `PasscheckVerification` and the same stats
   in the match report.
4. Open the same gameday on a second phone with the same token; it must be
   read-only (`409`).
5. Open `/passcheck/` for the same team: the roster matches, and
   `navigator.serviceWorker.controller` is `null` there.

```python
from passcheck.models import PasscheckVerification, PlayerlistGameday
assert PasscheckVerification.objects.filter(gameday_id=<id>).count() == 1
assert PlayerlistGameday.objects.filter(gameday_id=<id>).count() == 14
```

Re-capture `league_manager/static/help/img/passcheck-v2.png` on stage after the
protocol passes.
