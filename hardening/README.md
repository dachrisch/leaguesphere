# LeagueSphere hardening harness

Reusable browser + API harness for provoking errors on the public demo
(`https://demo.leaguesphere.app`) with headless Chrome, driven via
`playwright-core`. Produced by the 2026-09-25/26 hardening track
(see `docs/topics/testing/hardening-2026-09-25-findings.md` and
`docs/topics/testing/hardening-domain-knowledge.md`).

> **Run against demo ONLY.** Demo resets nightly to seed data; stage is
> observe-only by policy; production is never touched by this harness.

## Requirements

- Node.js 18+
- A system Chromium build (musl/Alpine compatible — `apk add chromium` on
  Alpine; `apt install chromium` on Debian). `playwright-core` is used so no
  browser binaries are downloaded by npm.
- Network access to `https://demo.leaguesphere.app`.

```bash
cd hardening
npm install
```

## Usage

```bash
node recon.js          # read-only inventory (gamedays, templates, games)
node provoke-api.js    # API 4xx/5xx matrix (gamelog, halftime/finalize/possession, template apply)
node lifecycle.js      # create gameday -> placeholders -> apply -> publish -> score
node verify-demo.js    # seed-state restore check after a run
```

Each run writes `runs/<timestamp>/` with `results.json` / `*.log` and, for UI
steps, per-step screenshots.

## How the harness authenticates

1. Logs in through the UI (`admin@demo.local` / `DemoAdmin123!`, public demo
   creds) so the Playwright context shares session cookies with
   `page.request`.
2. Every API call adds `Referer: https://demo.leaguesphere.app/`,
   `Origin`, and `X-CSRFToken` (from the `csrftoken` cookie). Without
   `Referer`, Django answers **every** mutating call with
   `403 {"detail":"CSRF Failed: Referer checking failed - no Referer."}` —
   that is a harness artifact, not an app bug.

## Gotchas learned the hard way

- **Server-local "today"**: the scorecard list (`/api/gameday/list`) and the
  liveticker feed filter by the **server's** local date (`datetime.today()`).
  On this setup the server is Europe/Berlin (UTC+2 in summer), so a gameday
  dated to *UTC* today shows up as "no games". Date gamedays with
  `<server-today>` (helper `serverToday()` in `lib.js`) when testing those
  views, and revert afterwards.
- **Seed scores are random per nightly reset**: `seed_demo_data` fills
  `fh/sh` with `random.randint(0,3)` per half. Never assert seed score
  values across days; assert shapes.
- **`get_or_create` reseeding does not clean `TeamLog` rows**: soft-deleted
  log remnants persist across resets.
- **Published gamedays can't be deleted** (`403 "Published gamedays cannot be
  deleted. Please unlock the gameday first."`) — `PUT` status back to
  `DRAFT`, then `DELETE` (204).
- Scratch gamedays/templates created by a run should be deleted before the
  run finishes (demo resets nightly, but a same-day rerun collides).