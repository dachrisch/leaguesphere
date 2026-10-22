---
name: add-help-topic
description: Use when shipping any user-facing LeagueSphere feature or behaviour change (a new page, a changed workflow, a renamed action), when adding a new in-app help topic/section, when a feature needs a Help page, or when asked to document a feature in the in-app help with a screenshot.
---

# Add a Help Topic

## Every user-facing feature ships with a help entry

A feature nobody can look up is half shipped. Before you call feature work done,
check the in-app help (`/help/`):

- **New page or workflow** → add a topic (or extend the closest existing one).
- **Changed behaviour** (renamed button, new step, moved action) → fix the topic
  that describes it in the **same PR**. A stale help page is worse than none.
- **Staff-only or login-only flow** → still document it; `/help/` is public, so
  say who can see what instead of assuming the reader is staff.
- **Bugfix with no user-visible behaviour change** → nothing to do here.

Do this in the feature PR when the change is small, or in a follow-up PR linked
from it — not "sometime later". The in-app help is the only documentation most
users will read.

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
   Keep it **short** — see "Keep it short" below.
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
5. **Add the topic to `templates/llms-full.txt`** (the "Help" list). A test
   asserts that file links the help index and *every* registry topic, so a new
   topic without this line fails `test_ai_readiness.py`.
6. **Run the tests** (they enforce registry↔content, image existence and the
   llms-full list):
   ```bash
   .venv/bin/python -m pytest league_manager/tests/test_help.py --ds=test_settings -q
   .venv/bin/python -m black --fast league_manager/help/ league_manager/tests/test_help.py
   ```
7. Deploy to staging (use the `deploy-to-staging` skill) and verify at
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

## Keep it short

The help page answers "what is this and what do I do", not "everything about the
feature". Target one screen, and hard limits:

- **Lead with one or two sentences**: what it is, when you use it.
- **Steps as a numbered list** — at most 5. If you need more, the flow probably
  belongs in its own topic (link it instead).
- **At most 3 "Häufige Fragen"**, and only questions people actually ask (the
  ones you had to explain in the PR or on stage).
- **Link, don't repeat**: [Spieltage](/help/spieltage/) etc. instead of
  re-explaining another topic's content.
- **No feature history**, no "since version X", no marketing adjectives.
- **Never invent UI text**: quote the button and menu labels as they are.

If the topic is longer than the page it documents, cut it.

## Conventions

- **Group** the topic under an existing group; add a new one to `HELP_GROUPS`
  only when it's a genuinely new area.
- **Featured** topics (`featured=True`) render as a highlight card on the index
  and are excluded from the grouped list.
- **Videos/tutorials**: set `video` (embed URL) or `tutorial` (link) on the
  topic when available; leave `None` otherwise.
- **Bilingual**: only `.de.md` is required. Add `<slug>.en.md` later — the
  loader falls back to German automatically. No code change needed.

## Screenshots that do not exist yet

If the page needs a login and is not on `demo.leaguesphere.app` yet (i.e. the
change is merged but not released), **ship the topic text-first** and add the
screenshot with the release. Do not add a placeholder, a mock, or a screenshot of
the old page - and do not link an image you did not create, because
`test_help_images_referenced_by_content_exist` will fail on a missing file.

## Common Mistakes

- Referencing images with a relative path or `{% static %}` inside Markdown →
  use `/static/help/img/...`.
- Forgetting the German content file → the registry test fails.
- Forgetting the screenshot file → the image-reference test fails.
- Duplicating the title: don't add a second H1 in the body; the template shows it.
- Shipping a user-facing feature with no help entry at all (see the top of this
  skill).
- Describing a flow you did not actually open: click through it once, logged in,
  before writing the steps.
