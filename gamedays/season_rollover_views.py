"""Staff season-rollover views, extracted verbatim from ``gamedays.views``.

The names are re-exported from ``gamedays.views`` so ``gamedays/urls.py`` and
any external importer keep resolving them. A sibling module (not a ``views/``
package) avoids shadowing ``gamedays/views.py``.
"""

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.db.models import Count
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.views import View
from django.views.generic import CreateView, ListView, TemplateView, UpdateView

from .constants import (
    LEAGUE_GAMEDAY_CREATE,
    LEAGUE_SEASON_LIST,
    LEAGUE_SEASON_LEAGUE_SETUP,
)
from .forms import SeasonForm, SeasonLeagueTeamAssignForm
from .models import League, Season, SeasonLeagueTeam, Team
from .service.season_rollover_service import copy_league_teams, previous_season


class GamedayCreateChooserView(LoginRequiredMixin, UserPassesTestMixin, TemplateView):
    template_name = "gamedays/gameday_create_chooser.html"

    def test_func(self):
        return self.request.user.is_staff


class StaffOnlyMixin(LoginRequiredMixin, UserPassesTestMixin):
    """Staff-only page: anonymous users are redirected to login, others get 403."""

    def test_func(self):
        return self.request.user.is_staff


class SeasonListView(StaffOnlyMixin, ListView):
    model = Season
    template_name = "gamedays/season/list.html"
    context_object_name = "seasons"

    def get_queryset(self):
        return Season.objects.annotate(
            league_count=Count("seasonleagueteam__league", distinct=True),
            team_count=Count("seasonleagueteam__teams", distinct=True),
            gameday_count=Count("gameday", distinct=True),
        ).order_by("-name")


class SeasonCreateView(StaffOnlyMixin, CreateView):
    model = Season
    form_class = SeasonForm
    template_name = "gamedays/season/form.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["action_label"] = "Saison anlegen"
        context["cancel_url"] = reverse(LEAGUE_SEASON_LIST)
        return context

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(
            self.request,
            f"Saison „{self.object.name}“ angelegt. Jetzt Ligen und Teams zuordnen.",
        )
        return response

    def get_success_url(self):
        return reverse(LEAGUE_SEASON_LEAGUE_SETUP, kwargs={"pk": self.object.pk})


class SeasonUpdateView(StaffOnlyMixin, UpdateView):
    model = Season
    form_class = SeasonForm
    template_name = "gamedays/season/form.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["action_label"] = "Saison umbenennen"
        context["cancel_url"] = reverse(LEAGUE_SEASON_LIST)
        return context

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(self.request, f"Saison „{self.object.name}“ gespeichert.")
        return response

    def get_success_url(self):
        return reverse(LEAGUE_SEASON_LIST)


class SeasonLeagueTeamSetupView(StaffOnlyMixin, TemplateView):
    """Season rollover: league/team assignment per league for one season."""

    template_name = "gamedays/season/league_setup.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        season = get_object_or_404(Season, pk=self.kwargs["pk"])

        assignments = {
            assignment.league_id: assignment
            for assignment in SeasonLeagueTeam.objects.filter(season=season)
            .select_related("league")
            .prefetch_related("teams")
            .order_by("league__name")
        }

        rows = []
        for league in League.objects.order_by("name"):
            assignment = assignments.get(league.pk)
            teams = list(assignment.teams.all()) if assignment is not None else []
            rows.append(
                {
                    "league": league,
                    "assignment": assignment,
                    "teams": teams,
                    "team_ids": {team.pk for team in teams},
                }
            )

        context.update(
            {
                "season": season,
                "rows": rows,
                "all_teams": list(Team.objects.order_by("description")),
                "previous_season": previous_season(season),
                "source_seasons": Season.objects.exclude(pk=season.pk).order_by(
                    "-name"
                ),
                "gameday_create_url": reverse(LEAGUE_GAMEDAY_CREATE),
                "designer_url": (
                    f'{reverse("gameday_designer_app:index")}?season={season.pk}'
                ),
            }
        )
        return context


class SeasonLeagueTeamCopyView(StaffOnlyMixin, View):
    """Copy last season's assignments into this season (idempotent)."""

    def get(self, request, *args, **kwargs):
        return redirect(
            reverse(LEAGUE_SEASON_LEAGUE_SETUP, kwargs={"pk": self.kwargs["pk"]})
        )

    def post(self, request, *args, **kwargs):
        season = get_object_or_404(Season, pk=self.kwargs["pk"])
        source_id = request.POST.get("from_season")

        if source_id:
            source = Season.objects.filter(pk=source_id).exclude(pk=season.pk).first()
            if source is None:
                messages.error(request, "Die gewählte Vorsaison wurde nicht gefunden.")
                return redirect(
                    reverse(LEAGUE_SEASON_LEAGUE_SETUP, kwargs={"pk": season.pk})
                )
        else:
            source = previous_season(season)
            if source is None:
                messages.warning(
                    request,
                    "Keine Vorsaison gefunden – es wurde nichts übernommen.",
                )
                return redirect(
                    reverse(LEAGUE_SEASON_LEAGUE_SETUP, kwargs={"pk": season.pk})
                )

        summary = copy_league_teams(source, season)
        messages.success(
            request,
            f"{summary.created} Zuordnung(en) übernommen, "
            f"{summary.skipped} übersprungen. (aus {source.name})",
        )
        return redirect(reverse(LEAGUE_SEASON_LEAGUE_SETUP, kwargs={"pk": season.pk}))


class SeasonLeagueTeamAssignView(StaffOnlyMixin, View):
    """Manual per-league team assignment. Updates an existing row instead of
    creating a second one for the same (season, league)."""

    def get(self, request, *args, **kwargs):
        return redirect(
            reverse(LEAGUE_SEASON_LEAGUE_SETUP, kwargs={"pk": self.kwargs["pk"]})
        )

    def post(self, request, *args, **kwargs):
        season = get_object_or_404(Season, pk=self.kwargs["pk"])
        league = get_object_or_404(League, pk=self.kwargs["league_pk"])
        setup_url = reverse(LEAGUE_SEASON_LEAGUE_SETUP, kwargs={"pk": season.pk})

        form = SeasonLeagueTeamAssignForm(request.POST)
        if not form.is_valid():
            messages.error(
                request,
                f"Die Teamauswahl für {league.name} konnte nicht gespeichert werden.",
            )
            return redirect(setup_url)

        assignment = (
            SeasonLeagueTeam.objects.filter(season=season, league=league)
            .order_by("pk")
            .first()
        )
        if assignment is None:
            assignment = SeasonLeagueTeam.objects.create(season=season, league=league)
        assignment.teams.set(form.cleaned_data["teams"])
        messages.success(request, f"Teams für {league.name} gespeichert.")
        return redirect(setup_url)
