# Share Widget — Requirements

## User stories

- As a club volunteer, I can pick my team and copy an embed code so our website
  shows our fixtures and results without running a server.
- As a fan, I can embed a live scoreboard for my team and it updates during the
  game without reloading the page.
- As a club, the widget only ever shows the team(s) I configured.
- As the platform, embedding stays safe: only public, read-only data is
  exposed, and only the `/share/widget/` page may be framed.

## Acceptance criteria

1. `/share/widget/` responds with
   `Content-Security-Policy: frame-ancestors *` and **no** `X-Frame-Options`.
2. Every other route (including `/`, `/admin/`, the JSON API and the `/share/`
   generator) still responds with `X-Frame-Options: DENY`.
3. `GET /api/teams/?search=<q>` returns a paginated directory with only
   `id`, `name`, `description` and `logo` — no location, association or roster
   data.
4. The widget renders exclusively the teams given by `t`; malformed/negative
   ids are ignored.
5. `live_url` and `logo` accept only `http(s)` URLs; other schemes are ignored.
6. The widget posts `{ type: 'iframeHeight', height }` to the parent and the
   generator documents the matching listener with the widget's own origin check
   (so it works on stage and on any self-hosted instance).
7. All values from the API are rendered as text (no HTML injection).
8. The widget reads only the public `/api/snapshot/`; live scores come from its
   `live` include, re-polled every 60 s while a watched game is open today.
9. The table view renders the snapshot's standings for every league the
   configured teams play in (leagues without a table are not returned); an
   explicit `league` shows only that league.

## Out of scope

- Opening the read API with CORS. (Since superseded: `/api/snapshot/`, and only
  that path, is now cross-origin readable as the public API; see
  [snapshot-v1](../public-api/snapshot-v1.md).)
- Stored per-team widget configurations (configuration is stateless URL params).
- Authentication, API keys or write access.
- WebSockets/push updates.
- Client-side standings computation (the snapshot's `standings` are used instead).
