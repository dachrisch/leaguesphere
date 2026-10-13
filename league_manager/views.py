from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
from django.views.generic import TemplateView
from django.conf import settings

from league_manager.constants import STATIC_INFO_PATHS


def homeview(request):
    return render(request, "homeview.html")


def database_error_view(request):
    # Static response to avoid any context processors or database-dependent template rendering
    html = """<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="10">
    <title>Datenbank nicht erreichbar - LeagueSphere</title>
    <link crossorigin="anonymous" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #f8f9fa; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .error-container { max-width: 600px; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
        h1 { color: #dc3545; }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>Datenbank nicht erreichbar</h1>
        <p class="lead mt-4">
            LeagueSphere kann momentan keine Verbindung zur Datenbank herstellen.
        </p>
        <div class="alert alert-warning mt-4" role="alert">
            Wir arbeiten bereits an einer Lösung. Bitte versuche es in ein paar Minuten erneut.
        </div>
        <p class="text-muted small mt-4">
            Vielen Dank für dein Verständnis.
        </p>
    </div>
</body>
</html>"""
    return HttpResponse(html, content_type="text/html", status=503)


def agent_card_json_view(request):
    card = {
        "name": "LeagueSphere Assistant",
        "description": (
            "Helps visitors find flag-football gamedays, live scores, league "
            "standings, teams and officials assignments on LeagueSphere."
        ),
        "url": "https://leaguesphere.app",
        "provider": {
            "organization": "LeagueSphere",
            "url": "https://leaguesphere.app",
        },
        "version": "1.0.0",
        "protocolVersion": "1.0",
        "preferredTransport": "HTTP",
        "capabilities": {},
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "skills": [
            {
                "id": "live-scores",
                "name": "Live scores",
                "description": "Current scores and game status for today's gamedays",
                "tags": ["scores", "liveticker", "live"],
                "examples": ["What is the current score in league west?"],
            },
            {
                "id": "league-table",
                "name": "League standings",
                "description": "Standings per league and season, including tie-breaks",
                "tags": ["standings", "table", "league"],
                "examples": ["Show the standings for ff-bl season 6"],
            },
            {
                "id": "gameday-info",
                "name": "Gameday information",
                "description": "Schedules, results and progress for gamedays",
                "tags": ["gameday", "schedule", "results"],
                "examples": ["When is the next gameday?"],
            },
        ],
        "documentation": {
            "siteOverview": STATIC_INFO_PATHS["llms"],
            "dynamicData": STATIC_INFO_PATHS["llms-dynamic"],
            "facts": STATIC_INFO_PATHS["facts"],
            "agents": STATIC_INFO_PATHS["agents"],
            "security": STATIC_INFO_PATHS["security"],
        },
    }
    return JsonResponse(card)


def facts_json_view(request):
    facts = {
        "name": "LeagueSphere",
        "url": "https://leaguesphere.app",
        "description": (
            "Web platform for organizing flag-football league play: gameday "
            "schedules, live scores, league standings, team rosters, and "
            "officials assignments."
        ),
        "sport": "American flag football",
        "locale": "de-DE",
        "entities": ["Season", "League", "Gameday", "Game", "Team", "Official"],
        # The snapshot is the only public API; other /api/ paths are internal.
        "dynamicEndpoints": [
            {
                "url": "/api/snapshot/",
                "description": (
                    "Public API: gamedays filtered by team, league, season, year "
                    "or date, with opt-in games, logs, teams (full names, logos), "
                    "standings and today's live scores via ?include="
                ),
                "updateFrequency": (
                    "ETag on every response; rebuilt at most every 30 seconds "
                    "while games are live"
                ),
                "auth": "none",
                "crossOrigin": True,
                "schemaVersion": 1,
            },
        ],
        "snapshotPolicy": (
            "A game is final once its status is 'beendet'; a gameday page is "
            "final once all its games are finished. Finalized data is stable "
            "and safe to cite. Use /api/snapshot/ for current data."
        ),
        "agentDocumentation": [
            STATIC_INFO_PATHS["llms"],
            STATIC_INFO_PATHS["llms-full"],
            STATIC_INFO_PATHS["llms-dynamic"],
            STATIC_INFO_PATHS["agents"],
            STATIC_INFO_PATHS["security"],
        ],
    }
    return JsonResponse(facts)


from django.contrib.auth.mixins import UserPassesTestMixin
from django.core.cache import cache
from django.http import Http404
from django.shortcuts import redirect
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils.safestring import mark_safe
from django.utils.translation import get_language
from django.views import View
from gamedays.service.team_repository_service import TeamRepositoryService

from league_manager.help import loader
from league_manager.help.registry import (
    HELP_GROUPS,
    get_topic,
    localized,
    ordered_topics,
)


class ClearCacheView(UserPassesTestMixin, View):
    def get(self, request):
        cache.clear()
        referer = request.META.get("HTTP_REFERER", "/")
        if url_has_allowed_host_and_scheme(referer, allowed_hosts={request.get_host()}):
            return redirect(referer)
        return redirect("/")

    def test_func(self):
        return self.request.user.is_staff


class AllTeamListView(View):
    template_name = "team/all_teams_list.html"

    def get(self, request, **kwargs):
        all_teams = TeamRepositoryService.get_all_teams()
        context = {
            "object_list": all_teams,
            "app": kwargs.get("app"),
        }
        return render(request, self.template_name, context)


class DemoInfoView(TemplateView):
    template_name = "demo/demo_info.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["demo_mode"] = getattr(settings, "DEMO_MODE", False)
        context["demo_credentials"] = [
            {
                "username": "admin@demo.local",
                "password": "DemoAdmin123!",
                "role": "Administrator",
                "description": "Full system access, user management",
            },
            {
                "username": "referee@demo.local",
                "password": "DemoRef123!",
                "role": "Referee",
                "description": "Match officiating and scoring",
            },
            {
                "username": "manager@demo.local",
                "password": "DemoMgr123!",
                "role": "Team Manager",
                "description": "Team management and roster control",
            },
            {
                "username": "user@demo.local",
                "password": "DemoUser123!",
                "role": "Regular User",
                "description": "Viewing standings and league information",
            },
        ]
        return context


def _topic_context(topic, lang):
    return {
        "slug": topic.slug,
        "title": localized(topic.title, lang),
        "summary": localized(topic.summary, lang),
        "icon": topic.icon,
        "video": topic.video,
        "tutorial": topic.tutorial,
    }


def _help_groups_context(lang):
    topics = ordered_topics()
    return [
        {
            "key": key,
            "title": localized(meta["title"], lang),
            "topics": [_topic_context(topic, lang) for topic in topics if topic.group == key],
        }
        for key, meta in sorted(HELP_GROUPS.items(), key=lambda item: item[1]["order"])
    ]


class HelpIndexView(TemplateView):
    template_name = "help/index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        lang = loader.normalize_language(get_language())
        context["title"] = localized({"de": "Hilfe", "en": "Help"}, lang)
        context["help_groups"] = _help_groups_context(lang)
        return context


class HelpTopicView(TemplateView):
    template_name = "help/topic.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        slug = kwargs.get("slug")
        topic = get_topic(slug)
        if topic is None:
            raise Http404(f"Unknown help topic: {slug}")

        lang = loader.normalize_language(get_language())
        context["title"] = localized(topic.title, lang)
        context["topic"] = _topic_context(topic, lang)
        context["topic_html"] = mark_safe(loader.render_topic(topic, lang))

        topics = ordered_topics()
        index = topics.index(topic)
        context["prev_topic"] = (
            _topic_context(topics[index - 1], lang) if index > 0 else None
        )
        context["next_topic"] = (
            _topic_context(topics[index + 1], lang)
            if index < len(topics) - 1
            else None
        )
        context["help_groups"] = _help_groups_context(lang)
        return context
