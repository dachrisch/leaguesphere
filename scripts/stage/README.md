# Stage E2E helper scripts

Manual browser/API helpers for validating the staging environment. These are **not** part of CI
and must never be pointed at production. Run them from the repository root:

```bash
export TEST_USERNAME=<your-stage-username>
export TEST_PASSWORD=<your-stage-password>

node scripts/stage/find-game-id.js --password="$TEST_PASSWORD"
node scripts/stage/e2e-game-test.js --gameid=9001 --password="$TEST_PASSWORD"
```

| Script | Purpose |
|---|---|
| `find-game-id.js` | Find published, unfinished gamedays with fresh games and suggest a game ID. |
| `e2e-game-test.js` | Drive one complete game lifecycle (login → events → halftime → finalize) against stage. |
| `step1-find-game.js` | Early spike: log in and find a non-today gameday with games. |
| `setup-gameday-for-today.js` | **Mutating:** move a published gameday's date to today so the E2E test can use it. Revert afterwards. |
| `capture_screenshot.sh` | Headless-Chrome screenshot of a URL to a local PNG path. |

All scripts require `TEST_USERNAME` (or `--username=...` where supported) — no username is baked
in. Passwords come from `TEST_PASSWORD` or `--password=...`. Stage resets its seed data
periodically, so IDs printed above are examples only.

The maintained load-test suite lives in [`tests/load/`](../../tests/load/README.md); the k6 entry
point is `load-test-k6.js` at the repository root.
