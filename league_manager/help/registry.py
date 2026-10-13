"""Registry of in-app help topics.

Topics are described here (not parsed from filenames) so grouping and order
stay explicit. Content lives next to this module in ``content/`` as
``<slug>.<lang>.md``. Adding a topic means adding an entry here plus a German
Markdown file; an English file can follow later with no code changes.
"""

from dataclasses import dataclass
from typing import Dict, Optional

DEFAULT_LANGUAGE = "de"


@dataclass(frozen=True)
class HelpTopic:
    slug: str
    group: str
    title: Dict[str, str]
    summary: Dict[str, str]
    icon: str
    order: int
    video: Optional[str] = None
    tutorial: Optional[str] = None


HELP_GROUPS: Dict[str, Dict[str, object]] = {
    "getting-started": {
        "title": {"de": "Erste Schritte", "en": "Getting started"},
        "order": 10,
    },
    "spieltage": {
        "title": {"de": "Spieltage", "en": "Gamedays"},
        "order": 20,
    },
    "teams": {
        "title": {"de": "Teams & Offizielle", "en": "Teams & Officials"},
        "order": 30,
    },
    "website": {
        "title": {"de": "Website einbinden", "en": "Embed on your website"},
        "order": 40,
    },
}


HELP_TOPICS = [
    HelpTopic(
        slug="getting-started",
        group="getting-started",
        title={"de": "Erste Schritte", "en": "Getting started"},
        summary={
            "de": "Was LeagueSphere ist, welche Rollen es gibt und wie du dich anmeldest.",
            "en": "What LeagueSphere is, which roles exist and how to sign in.",
        },
        icon="bi-rocket",
        order=10,
    ),
    HelpTopic(
        slug="gamedays",
        group="spieltage",
        title={"de": "Spieltage ansehen", "en": "View gamedays"},
        summary={
            "de": "Spielpläne, Ergebnisse und der Tagesstatus eines Spieltags.",
            "en": "Schedules, results and the day status of a gameday.",
        },
        icon="bi-calendar-event",
        order=20,
    ),
    HelpTopic(
        slug="teams-officials",
        group="teams",
        title={"de": "Teams & Offizielle", "en": "Teams & Officials"},
        summary={
            "de": "Kader, Pässe (Passcheck) und die Einsätze der Offiziellen.",
            "en": "Rosters, passes (Passcheck) and officials assignments.",
        },
        icon="bi-people",
        order=30,
    ),
    HelpTopic(
        slug="share-widget",
        group="website",
        title={"de": "Website einbinden", "en": "Embed on your website"},
        summary={
            "de": "Spielplan, Ergebnisse und Tabellen per Widget auf der eigenen Website zeigen.",
            "en": "Show fixtures, results and tables on your own site with the widget.",
        },
        icon="bi-code-slash",
        order=40,
    ),
]


def get_topic(slug: str) -> Optional[HelpTopic]:
    for topic in HELP_TOPICS:
        if topic.slug == slug:
            return topic
    return None


def localized(value: Dict[str, str], lang: str) -> str:
    return value.get(lang) or value[DEFAULT_LANGUAGE]


def ordered_topics():
    group_order = {key: meta["order"] for key, meta in HELP_GROUPS.items()}
    return sorted(
        HELP_TOPICS,
        key=lambda topic: (group_order.get(topic.group, 999), topic.order),
    )
