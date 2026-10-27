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

### Planned stage fixture

The stage DB already has the teams and rosters; only the gameday/game wiring is
created for the test:

| Item | Value |
|---|---|
| League | `OL_Ost`, pk **31** |
| Season | pk **6** |
| Gameday | **Passcheck v2 Testtag**, today (server-local), start **13:30**, format **6_2**, status **PUBLISHED** |
| Home team | **Staaken Bats**, pk **262** (14 active `Playerlist` rows) |
| Away team | **Vorpommern Vandals**, pk **110** (14 active `Playerlist` rows) |
| Officials team/user | **passcheck-test**, team pk **706**, staff user **358** |
| Eligibility rule | existing rule pk **39** for league 31, `eligible_in` 31, `maximum_player_strength` 100 — **reuse, do not overwrite** |
| Photos | pass numbers **9447**, **1115514**, **1116146** from team 262 |

Run this once on stage (it is idempotent for the gameday/game, not for players —
it creates none):

```python
from datetime import date

from django.contrib.auth.models import User
from django.utils import timezone

from gamedays.models import Gameday, Gameinfo, Gameresult, League, Season, Team

league = League.objects.get(pk=31)
season = Season.objects.get(pk=6)
officials = Team.objects.get(pk=706)
home = Team.objects.get(pk=262)
away = Team.objects.get(pk=110)
user = User.objects.get(username="passcheck-test")

gameday, _ = Gameday.objects.get_or_create(
    name="Passcheck v2 Testtag",
    date=date.today(),
    defaults={
        "league": league,
        "season": season,
        "start": "13:30",
        "format": "6_2",
        "author": user,
    },
)
gameday.status = Gameday.STATUS_PUBLISHED
gameday.published_at = gameday.published_at or timezone.now()
gameday.save(update_fields=["status", "published_at"])

game, _ = Gameinfo.objects.get_or_create(
    gameday=gameday,
    field=1,
    defaults={
        "scheduled": "13:30",
        "officials": officials,
        "stage": "",
        "standing": "",
    },
)
Gameresult.objects.get_or_create(gameinfo=game, team=home, isHome=True)
Gameresult.objects.get_or_create(gameinfo=game, team=away, isHome=False)

print(f"GAMEDAY {gameday.pk}; officials {officials.name}; game {game.pk}")
print(
    home.playerlist_set.filter(left_on__isnull=True).count(),
    away.playerlist_set.filter(left_on__isnull=True).count(),
)
```

The output must show **14 14**. Do not create players; the rosters already
exist.

### Import the three consenting photos

The three players are from team 262 with pass numbers `9447`, `1115514` and
`1116146`. Name the files `<pass_number>.jpg` (or `.png`/`.webp`) and run:

```bash
python manage.py import_pass_photos --dir /tmp/passcheck-photos --dry-run
python manage.py import_pass_photos --dir /tmp/passcheck-photos --consent
```

Only run `--consent` for photos with written consent. The endpoint serves a
photo only when `photo_consent_at` is set.

### Field protocol

1. Log in as `passcheck-test`, open `/passcheck/v2/?gameday=<id>`, start at the
   first player and stop after the last; record `Ø s/Spieler`.
2. After player 5, enable airplane mode, finish the roster and save.
3. Reconnect and confirm exactly one `PasscheckVerification` and the same stats
   in the match report.
4. Open the same gameday on a second phone with the same token; it must be
   read-only (`409`).
5. Open `/passcheck/` for the same team: the roster matches, and
   `navigator.serviceWorker.controller` is `null` there.
6. Open one consented photo, then revoke consent for one player and confirm it
   becomes `404`.

```python
from passcheck.models import PasscheckVerification, PlayerlistGameday
assert PasscheckVerification.objects.filter(gameday_id=<id>).count() == 1
assert PlayerlistGameday.objects.filter(gameday_id=<id>).count() == 14
```

Re-capture `league_manager/static/help/img/passcheck-v2.png` on stage after the
protocol passes.
