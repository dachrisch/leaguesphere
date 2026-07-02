# league_manager/ — CLAUDE.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root CLAUDE.md](../CLAUDE.md).

## Purpose
The Django **project package** — not a feature app. Holds global settings, the root URL
dispatcher, middleware, shared utilities, and site-wide templates/menus. When an agent needs
"where is X configured" or "how is the site wired together," it starts here.

## Role in the system
Every other app is mounted from here. `INSTALLED_APPS`, DRF/Knox auth, database config,
static handling, and the top-level `urls.py` that includes each app's routes all live in this
package. Cross-cutting behavior (middleware, context processors, signals, sitemaps) is defined
here and applies globally.

## Key files
- `settings/` — environment-split config (`base`, `dev`, `prod`). Selected via the
  `league_manager` env var (e.g. `league_manager=dev`). **Add new settings to `base` unless
  they are env-specific.**
- `urls.py` — root URL dispatcher; `include()`s each app. Add a new app's routes here.
- `middleware/` — custom request/response middleware.
- `context_processors.py` — variables injected into every template.
- `base_menu.py` / `constants.py` — global navigation and shared constants.
- `signals.py`, `sitemaps.py` — project-wide signal wiring and sitemap definitions.
- `utils/` — helpers shared across apps (import from here rather than duplicating).
- `asgi.py` / `wsgi.py` — server entrypoints.

## Conventions & gotchas
- Choose the settings module via the `league_manager` env var; there is no single `settings.py`.
- New apps must be added to `INSTALLED_APPS` **and** wired into the root `urls.py`.
- Auth is **Knox token-based** (see [accounts](../accounts/CLAUDE.md)); auth config lives in settings here.
- Prefer extending `utils/` over adding one-off helpers inside feature apps.

## Tests
```bash
cd leaguesphere && pytest league_manager/tests
```
