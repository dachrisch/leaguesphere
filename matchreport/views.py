from datetime import datetime

from django.conf import settings
from django.contrib.auth.mixins import UserPassesTestMixin
from django.db.models.functions import ExtractYear
from django.http import HttpResponseForbidden
from django.shortcuts import render
from django.views import View
from django.views.generic import (
    DetailView,
)

from .constants import (
    MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
    MATCHREPORT_GAMEDAY_LIST_AND_YEAR
)

from gamedays.models import Gameday
from .service.matchreport_service import MatchreportService


class MatchreportGamedayListView(UserPassesTestMixin, View):
    template_name = "matchreport/gameday_list.html"

    def get(self, request, **kwargs):
        year = kwargs.get("season", datetime.today().year)
        league = kwargs.get("league")
        gamedays = Gameday.objects.filter(date__year=year).order_by("date")
        leagues = gamedays.values_list("league__name", flat=True).distinct().order_by("league__name")
        gamedays_filtered_by_league = (
            gamedays.filter(league__name=league) if league else gamedays
        )
        return render(
            request,
            self.template_name,
            {
                "gamedays": gamedays_filtered_by_league,
                "seasons": Gameday.objects.annotate(year=ExtractYear("date"))
                .values_list("year", flat=True)
                .distinct()
                .order_by("-year"),
                "selected_season": year,
                "leagues": leagues,
                "selected_league": league,
                "season_year_pattern": MATCHREPORT_GAMEDAY_LIST_AND_YEAR,
                "league_year_url_pattern": MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
            },
        )

    def test_func(self):
        return self.request.user.is_staff

class MatchreportGamedayDetailView(UserPassesTestMixin, DetailView):
    template_name = "matchreport/gameday_detail.html"
    model = Gameday

    def get(self, request, *args, **kwargs):
        response = super().get(request, *args, **kwargs)
        if not self.request.user.is_staff:
            return HttpResponseForbidden()
        return response

    def get_context_data(self, **kwargs):
        context = super(MatchreportGamedayDetailView, self).get_context_data()
        gameday = context["gameday"]
        ms = MatchreportService.create(gameday.pk)
        render_configs = {
            "index": False,
            "classes": [
                "table",
                "table-hover",
                "table-condensed",
                "table-responsive",
                "text-center",
            ],
            "border": 0,
            "justify": "center",
            "escape": False,
            "table_id": "schedule",
        }

        is_staff = self.request.user.is_staff

        if "officials" in settings.INSTALLED_APPS:
            show_official_names = False
            if is_staff:
                show_official_names = True
            from officials.service.signup_service import OfficialSignupService

            officials = OfficialSignupService.get_signed_up_officials(
                gameday.pk, show_official_names
            )
        else:
            officials = []

        passcheck_info_table = """<p>Du hast keine Berechtigung diese Seite zu sehen!</p>"""
        passcheck_player_data = {}
        gameday_match_reports = []
        if is_staff:
            passcheck_info_table_df = ms.get_staff_passcheck_details()
            passcheck_info_table = """<p>An diesem Spieltag gab es keine Passchecks</p>"""

            if not passcheck_info_table_df.empty:
                passcheck_info_table = passcheck_info_table_df.to_html(
                    **render_configs
                )

            passcheck_player_data = ms.get_passcheck_player_details(render_configs)
            gameday_match_reports = ms.get_gameday_match_reports(render_configs)

        context["info"] = {
            "officials": officials,
            "passcheck_info_table": passcheck_info_table,
            "passcheck_player_data": passcheck_player_data,
            "gameday_match_reports": gameday_match_reports,
        }

        return context

    def test_func(self):
        return self.request.user.is_staff
