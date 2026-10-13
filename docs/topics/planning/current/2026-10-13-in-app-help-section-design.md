# In-App Help Section — Design

**Date:** 2026-10-13
**Status:** In progress

## Goal

Introduce the first in-app help for LeagueSphere, inspired by the structure of
[What's New 2026](../../features/whats-new-2026.md): short, plain-language
content organized by topic, with room to grow into richer material (videos,
tutorials) where it helps. Start small — a handful of topics, no new app, no
database.

## Decisions

- **Location:** In-app pages (not repo docs). Reachable from the main navbar.
- **Authoring:** Markdown files in the repo, rendered server-side.
- **Entry point:** A `❓ Hilfe` / `❓ Help` link in the navbar, with icon.
- **Language:** Bilingual-ready. German first; English files added later with
  no code changes.
- **Scope:** Four starter topics plus a link to the 2026 roundup.

## Architecture

A self-contained module inside `league_manager` (which already owns
`base.html`, `urls.py`, views and the navbar). No new Django app, no
migrations.

```
league_manager/
  help/
    __init__.py
    registry.py        # ordered topic definitions
    loader.py          # resolve locale file + render Markdown
    content/
      getting-started.de.md
      gamedays.de.md
      teams-officials.de.md
      share-widget.de.md
  templates/help/
    index.html         # topic overview, grouped by area
    topic.html         # one rendered topic + sidebar nav
```

### Content model

Each help page is a Markdown file named `slug.<lang>.md`. A Python registry
(`registry.py`) describes each topic so grouping and order are explicit:

```python
HelpTopic(
    slug="gamedays",
    group="spieltage",
    title={"de": "Spieltage", "en": "Gamedays"},
    summary={"de": "...", "en": "..."},
    icon="bi-calendar-event",
    video=None,      # optional YouTube embed URL
    tutorial=None,   # optional external tutorial link
    order=20,
)
```

`loader.py` picks the file for the active language (`get_language()`), falls
back to German when an English file does not exist yet, and renders with
Python-Markdown (`extra`, `toc`, `sane_lists`) — already a project dependency.
Raw HTML in Markdown is allowed so video embeds and richer blocks work where
appropriate. Content is repo-controlled and trusted, so rendered HTML is marked
safe.

## URLs, views, templates

- `/help/` → `help-index` — overview, topics grouped by area.
- `/help/<slug:slug>/` → `help-topic` — one topic; unknown slug → 404.

- `HelpIndexView` — context: groups with resolved title/summary/icon.
- `HelpTopicView` — context: topic, rendered HTML, prev/next navigation.

Templates extend `base.html` and reuse Bootstrap + existing CSS; no new build
step. The index also surfaces a "Was ist neu 2026" card.

## Initial topics

| Group | Slug | Icon | Covers |
|---|---|---|---|
| Erste Schritte | `getting-started` | `bi-rocket` | What LeagueSphere is, roles/accounts, logging in |
| Funktionen | `share-widget` | `bi-code-slash` | Embedding the widget, public API |
| Funktionen | `gameday-designer` | `bi-diagram-3` | Guided start, reusable templates, tournaments |
| Funktionen | `referee-import` | `bi-file-earmark-arrow-up` | Importing officials' self-reported games |
| Funktionen | `live-status` | `bi-broadcast` | Today's upcoming / live / finished gamedays |

Each topic has an optional `video` / `tutorial` field, empty for now.

## Testing

- `test_help_index` — `/help/` returns 200 and lists all registry topics.
- `test_help_topic_renders_markdown` — `/help/gamedays/` contains rendered HTML.
- `test_help_unknown_topic_404` — `/help/nope/` → 404.
- `test_help_falls_back_to_german` — missing `.en.md` serves German content.
- Registry sanity — every registry topic has a corresponding `.de.md` file.

## Out of scope (future)

- English translations of the content.
- Videos/tutorials filled in per topic.
- Search, per-role help, in-context help links.
