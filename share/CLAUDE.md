# share/ — CLAUDE.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
Public, cross-origin **embeddable widget** so clubs can show LeagueSphere fixtures,
results, live scores and standings on their own websites with one `<iframe>`. No relay
server, no API key, no CORS.

## Role in the system
- Django app serving a frameable iframe document, a normal (frames-denied)
  generator page and a small React/Vite frontend (this directory).
- Reads public data from [gamedays](../gamedays/CLAUDE.md) (`/api/snapshot/`, `/api/teams/`),
  [liveticker](../liveticker/CLAUDE.md) (`/api/liveticker/`) and
  [league_table](../league_table/CLAUDE.md) (`/api/league-table/`).
- Because LeagueSphere hosts the iframe, its API calls are **same-origin** —
  `CORS_ALLOWED_ORIGINS` stays empty. Only framing is relaxed.

## Key files
- `views.py` — `FrameableTemplateView` adds `Content-Security-Policy: frame-ancestors *`
  and exempts the response from `X-Frame-Options`. Only the widget view may be framed;
  the generator is a plain `TemplateView` (keeps `X-Frame-Options: DENY`).
- `urls.py` — `/share/` (generator) and `/share/widget/` (iframe document).
- `templates/share/` — standalone templates (no `base.html` chrome), reference the built
  bundles via `{% static %}`.
- `src/lib/` — pure logic: `params.ts` (URL config), `schedule.ts`, `table.ts`, `live.ts`,
  `api.ts`, `embed.ts` (postMessage), `generator.ts` (url/snippet builders).
- `src/views/`, `src/components/`, `src/widget/`, `src/generator/` — React UI.
- `static/share/` — Vite build output (`widget.js`, `generator.js`, CSS); **gitignored**.

## Routes (`urls.py`)
- `GET /share/` → generator (`share-generator`)
- `GET /share/widget/` → iframe app (`share-widget`)

## Conventions & gotchas
- **Framing is the security boundary**: `frame-ancestors *` is applied *only* on the
  `/share/widget/` view. Never add it elsewhere; the generator, `/`, `/admin/` and the API
  must keep `X-Frame-Options: DENY` (asserted in `share/tests/test_framing.py`).
- **Stateless config**: all options are URL params (`t`, `view`, `color`, …). No stored
  per-team config; the widget only renders the configured teams.
- **Data freshness**: `/api/liveticker/` is server-cached for 60 s — that is the live
  cadence. Poll at 60 s in the `live` view; do not hammer it faster.
- **Escaping**: never use `dangerouslySetInnerHTML`; React escapes API strings. `live_url`
  and `logo` are validated to `http(s)` in `params.ts`.
- The bundle is built (Vite) before Django serves it; run `npm --prefix share/ run build`
  locally, or the dev server / nginx image build does it.

## Tests
- Python: `DJANGO_SETTINGS_MODULE=league_manager.settings.test_sqlite .venv/bin/python -m pytest share -q`
- Frontend: `npm --prefix share/ run test:run`, plus `typecheck`, `eslint`, `build`.
