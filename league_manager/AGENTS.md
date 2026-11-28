# league_manager/ — AGENTS.md

> Module guide. For repo-wide commands, testing setup, and deployment policy see the [root AGENTS.md](../AGENTS.md).

## Purpose
The Django **project package** — not a feature app. Holds global settings, the root URL
dispatcher, middleware, and site-wide templates. It is the **composition root**: it may import
every app, and **no app imports it** (the shared kernel lives in [`core/`](../core/__init__.py)). When an agent needs
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
- `constants.py` — shared constants. The menu base class is `core/base_menu.py`.
- `signals.py`, `sitemaps.py` — project-wide signal wiring and sitemap definitions.
- `utils/utils.py` — menu discovery for the context processor. Helpers shared by apps
  (`etag`, `html`, `serializer_utils`, `url_service`, `base_menu`) live in `core/`; team
  permission helpers live in `gamedays/service/team_permission*.py`.
- `asgi.py` / `wsgi.py` — server entrypoints.

## Conventions & gotchas
- Choose the settings module via the `league_manager` env var; there is no single `settings.py`.
- New apps must be added to `INSTALLED_APPS` **and** wired into the root `urls.py`.
- Auth is **Knox token-based** (see [accounts](../accounts/AGENTS.md)); auth config lives in settings here.
- Put a helper every app needs into `core/` (no app imports there), not into this package:
  an app importing `league_manager` re-creates the import cycle the architecture scan removed
  (import-linter checks it).

## Tests
```bash
cd leaguesphere && pytest league_manager/tests
```


## CI scope (scoped CI)

Changes here run: **python-core (pytest league_manager/tests/) — settings/urls/middleware changes.** Scoping details: [Scoped CI](../docs/topics/deployment/scoped-ci.md).
