---
name: add-help-topic
description: Use when adding a new in-app help topic/section for a LeagueSphere feature, when a feature needs a Help page, or when asked to document a feature in the in-app help with a screenshot.
---

# Add a Help Topic

Add a topic to the in-app help (`/help/`). Help lives inside `league_manager`:

```
league_manager/
  help/
    registry.py            # topic definitions (group, title, icon, order)
    loader.py              # locale resolution + Markdown rendering
    content/<slug>.de.md   # one Markdown file per topic (German first)
  static/help/img/<name>.png   # screenshots
  templates/help/{index,topic}.html
  tests/test_help.py
```

## Steps

1. **Add a `HelpTopic`** to `HELP_TOPICS` in `help/registry.py` (keep `slug`,
   `group`, `title`, `summary`, `icon`, `order`). `title`/`summary` are
   `{"de": ..., "en": ...}` dicts. Groups live in `HELP_GROUPS`.
2. **Write `help/content/<slug>.de.md`** (German first). Start with `# Title`
   (the loader strips the leading H1; the template renders the title with icon).
   Keep it short: what it is, the steps, a "Häufige Fragen" section.
3. **Add screenshots** (see below) and reference them from the Markdown:
   ```html
   <figure class="help-figure">
     <img src="/static/help/img/<name>.png" alt="...">
     <figcaption>Short caption.</figcaption>
   </figure>
   ```
   Use absolute `/static/help/img/...` paths (Markdown can't call `{% static %}`).
4. **Link it** from a related topic (e.g. `getting-started.de.md`) with a normal
   Markdown link: `[Spieltage](/help/spieltage/)`.
5. **Run the tests** (they enforce registry↔content and image existence):
   ```bash
   .venv/bin/python -m pytest league_manager/tests/test_help.py --ds=test_settings -q
   .venv/bin/python -m black --fast league_manager/help/ league_manager/tests/test_help.py
   ```
6. Deploy to staging (use the `deploy-to-staging` skill) and verify at
   `https://stage.leaguesphere.app/help/<slug>/`.

## Screenshots

Source depends on whether the page needs login:

- **Public pages** (gamedays, tables, teams, officials, widget) → capture from
  `stage.leaguesphere.app`, which has real populated data. **The public demo is
  too sparse** (no games/standings/tables).
- **Login-required pages** (Gameday Designer, referee import, staff flows) →
  capture from `demo.leaguesphere.app` with the documented demo credentials
  (`admin@demo.local` / `DemoAdmin123!`), seeding data if needed.

Capture with headless Chromium (Playwright's bundled browser fails on Alpine's
musl; install `chromium` via `apk add --no-cache chromium` first):

```bash
chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --window-size=1440,1000 \
  --screenshot=league_manager/static/help/img/<name>.png \
  "https://stage.leaguesphere.app/<path>/"
```

Authenticated pages: log in first (or reuse `capture_screenshot.sh` where a
`google-chrome` is available). Prefer obfuscated/public data; never expose real
personal names.

## Conventions

- **Group** the topic under an existing group; add a new one to `HELP_GROUPS`
  only when it's a genuinely new area.
- **Featured** topics (`featured=True`) render as a highlight card on the index
  and are excluded from the grouped list.
- **Videos/tutorials**: set `video` (embed URL) or `tutorial` (link) on the
  topic when available; leave `None` otherwise.
- **Bilingual**: only `.de.md` is required. Add `<slug>.en.md` later — the
  loader falls back to German automatically. No code change needed.

## Common Mistakes

- Referencing images with a relative path or `{% static %}` inside Markdown →
  use `/static/help/img/...`.
- Forgetting the German content file → the registry test fails.
- Forgetting the screenshot file → the image-reference test fails.
- Duplicating the title: don't add a second H1 in the body; the template shows it.
