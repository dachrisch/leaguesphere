"""Load and render help topic Markdown.

Language resolution: try ``<slug>.<lang>.md`` first, then fall back to
``<slug>.<DEFAULT_LANGUAGE>.md``. This lets English translations be added
incrementally without breaking pages that only exist in German.
"""

from pathlib import Path

import markdown
from django.utils.translation import get_language

from league_manager.help.registry import DEFAULT_LANGUAGE, HelpTopic

CONTENT_DIR = Path(__file__).resolve().parent / "content"

MARKDOWN_EXTENSIONS = ["extra", "toc", "sane_lists"]


def normalize_language(lang: str | None) -> str:
    if not lang:
        return DEFAULT_LANGUAGE
    return lang.split("-")[0].lower()


def read_topic_markdown(topic: HelpTopic, lang: str | None = None) -> str:
    normalized = normalize_language(lang or get_language())
    for candidate in (normalized, DEFAULT_LANGUAGE):
        path = CONTENT_DIR / f"{topic.slug}.{candidate}.md"
        if path.exists():
            return path.read_text(encoding="utf-8")
    return ""


def render_topic(topic: HelpTopic, lang: str | None = None) -> str:
    text = read_topic_markdown(topic, lang)
    return markdown.markdown(text, extensions=MARKDOWN_EXTENSIONS)
