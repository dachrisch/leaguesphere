from datetime import datetime

from django.conf import settings
from django.contrib.auth.mixins import UserPassesTestMixin
from django.db.models.functions import ExtractYear
from django.http import HttpResponseForbidden, HttpResponse
from django.shortcuts import render, get_object_or_404
from django.views import View
from django.views.generic import (
    DetailView,
)

from .constants import (
    MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
    MATCHREPORT_GAMEDAY_LIST_AND_YEAR,
    MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD,
    MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD_AND_LEAGUE,
    REPORT_TABLE_RENDER_CONFIG,
)

from gamedays.models import Gameday
from officials.service.officials_compliance_service import (
    compute_gameday_officials_compliance,
)
from .service.gameday_list_csv_service import build_gameday_list_csv
from .service.matchreport_service import MatchreportService


def _filtered_gamedays(year, league, only_violations):
    """Shared by MatchreportGamedayListView and
    MatchreportGamedayListCsvDownloadView so the CSV download always
    reflects exactly the same year/league/only_violations selection
    currently shown on the page."""
    gamedays_qs = (
        Gameday.objects.select_related("league")
        .filter(date__year=year)
        .order_by("date")
    )
    if league:
        gamedays_qs = gamedays_qs.filter(league__name=league)
    gamedays = list(gamedays_qs)

    compliance_by_gameday = compute_gameday_officials_compliance(
        [gameday.pk for gameday in gamedays]
    )
    if only_violations:
        gamedays = [
            gameday
            for gameday in gamedays
            if compliance_by_gameday[gameday.pk].violation_count > 0
        ]
    return gamedays, compliance_by_gameday


class MatchreportGamedayListView(UserPassesTestMixin, View):
    template_name = "matchreport/gameday_list.html"

    def get(self, request, **kwargs):
        year = kwargs.get("season", datetime.today().year)
        league = kwargs.get("league")
        only_violations = request.GET.get("only_violations") == "1"

        leagues = (
            Gameday.objects.filter(date__year=year)
            .values_list("league__name", flat=True)
            .distinct()
            .order_by("league__name")
        )
        gamedays, compliance_by_gameday = _filtered_gamedays(
            year, league, only_violations
        )
        gameday_rows = [
            {"gameday": gameday, "compliance": compliance_by_gameday[gameday.pk]}
            for gameday in gamedays
        ]

        return render(
            request,
            self.template_name,
            {
                "gameday_rows": gameday_rows,
                "seasons": Gameday.objects.annotate(year=ExtractYear("date"))
                .values_list("year", flat=True)
                .distinct()
                .order_by("-year"),
                "selected_season": year,
                "leagues": leagues,
                "selected_league": league,
                "season_year_pattern": MATCHREPORT_GAMEDAY_LIST_AND_YEAR,
                "league_year_url_pattern": MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE,
                "csv_download_url_pattern": (
                    MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD_AND_LEAGUE
                    if league
                    else MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD
                ),
                "only_violations": only_violations,
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
        render_configs = REPORT_TABLE_RENDER_CONFIG

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

        passcheck_info_table = (
            """<p>Du hast keine Berechtigung diese Seite zu sehen!</p>"""
        )
        passcheck_player_data = {}
        gameday_match_reports = []
        officials_check_status = None
        if is_staff:
            passcheck_info_table_df = ms.get_staff_passcheck_details()
            passcheck_info_table = (
                """<p>An diesem Spieltag gab es keine Passchecks</p>"""
            )

            if not passcheck_info_table_df.empty:
                passcheck_info_table = passcheck_info_table_df.to_html(**render_configs)

            passcheck_player_data = ms.get_passcheck_player_details(render_configs)
            gameday_match_reports = ms.get_gameday_match_reports(render_configs)

            officials_check_status = compute_gameday_officials_compliance([gameday.pk])[
                gameday.pk
            ]
            for game in gameday_match_reports:
                game["officials_violations"] = (
                    officials_check_status.game_violations.get(game["gameinfo_id"], [])
                )

        context["info"] = {
            "officials": officials,
            "passcheck_info_table": passcheck_info_table,
            "passcheck_player_data": passcheck_player_data,
            "gameday_match_reports": gameday_match_reports,
            "officials_check_status": officials_check_status,
        }

        return context

    def test_func(self):
        return self.request.user.is_staff


class MatchreportGamedayPasscheckDownloadView(UserPassesTestMixin, View):
    def get(self, request, pk, *args, **kwargs):
        gameday = get_object_or_404(Gameday, pk=pk)
        player_list = MatchreportService.create(gameday.pk).get_passcheck_player_list()

        csv_body = "﻿" + player_list.to_csv(index=False, sep=";")
        response = HttpResponse(csv_body, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="passcheck_spieler_{gameday.pk}.csv"'
        )
        return response

    def test_func(self):
        return self.request.user.is_staff


class MatchreportGamedayListCsvDownloadView(UserPassesTestMixin, View):
    def get(self, request, season, league=None):
        only_violations = request.GET.get("only_violations") == "1"
        gamedays, _ = _filtered_gamedays(season, league, only_violations)

        csv_body = "﻿" + build_gameday_list_csv(gamedays)
        response = HttpResponse(csv_body, content_type="text/csv; charset=utf-8")
        filename = f"spielberichte_{season}" + (f"_{league}" if league else "")
        response["Content-Disposition"] = f'attachment; filename="{filename}.csv"'
        return response

    def test_func(self):
        return self.request.user.is_staff
