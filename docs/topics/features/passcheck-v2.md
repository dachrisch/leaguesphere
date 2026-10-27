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
