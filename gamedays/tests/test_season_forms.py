from django.test import TestCase

from gamedays.forms import SeasonForm, SeasonLeagueTeamForm
from gamedays.models import Season, SeasonLeagueTeam
from gamedays.tests.setup_factories.factories import (
    LeagueFactory,
    SeasonFactory,
    SeasonLeagueTeamFactory,
    TeamFactory,
)


class TestSeasonForm(TestCase):
    def test_derives_slug_from_name(self):
        form = SeasonForm(data={"name": "2026/2027"})

        assert form.is_valid(), form.errors
        season = form.save()

        assert season.name == "2026/2027"
        assert season.slug == "20262027"

    def test_rejects_name_whose_slug_already_exists(self):
        SeasonFactory(name="2025/2026")

        form = SeasonForm(data={"name": "20252026"})

        assert not form.is_valid()
        assert "20252026" in str(form.errors)
        assert "2025/2026" in str(form.errors)

    def test_rejects_name_without_usable_slug(self):
        form = SeasonForm(data={"name": "///"})

        assert not form.is_valid()
        assert "Kürzel" in str(form.errors)

    def test_rename_keeps_the_existing_slug(self):
        season = SeasonFactory(name="2026/2027")

        form = SeasonForm(data={"name": "Saison 2026/2027"}, instance=season)

        assert form.is_valid(), form.errors
        season = form.save()

        assert season.name == "Saison 2026/2027"
        assert season.slug == "20262027"

    def test_rename_does_not_care_about_another_seasons_slug(self):
        SeasonFactory(name="2026/2027")
        other = SeasonFactory(name="2027/2028")

        form = SeasonForm(data={"name": "2026/2027"}, instance=other)

        assert form.is_valid(), form.errors


class TestSeasonLeagueTeamForm(TestCase):
    def test_rejects_second_assignment_for_the_same_league(self):
        season = SeasonFactory(name="2026/2027")
        league = LeagueFactory(name="Premier Division")
        SeasonLeagueTeamFactory(season=season, league=league, teams=[TeamFactory()])

        form = SeasonLeagueTeamForm(
            data={
                "season": season.pk,
                "league": league.pk,
                "teams": [],
            }
        )

        assert not form.is_valid()
        assert "bereits eine Zuordnung" in str(form.errors)
        assert (
            SeasonLeagueTeam.objects.filter(season=season, league=league).count() == 1
        )

    def test_allows_editing_the_existing_assignment(self):
        season = SeasonFactory(name="2026/2027")
        league = LeagueFactory(name="Premier Division")
        assignment = SeasonLeagueTeamFactory(
            season=season, league=league, teams=[TeamFactory()]
        )

        form = SeasonLeagueTeamForm(
            data={
                "season": season.pk,
                "league": league.pk,
                "teams": [assignment.teams.first().pk],
            },
            instance=assignment,
        )

        assert form.is_valid(), form.errors

    def test_allows_the_same_league_in_another_season(self):
        league = LeagueFactory(name="Premier Division")
        SeasonLeagueTeamFactory(season=SeasonFactory(name="2025/2026"), league=league)
        season = SeasonFactory(name="2026/2027")

        form = SeasonLeagueTeamForm(
            data={
                "season": season.pk,
                "league": league.pk,
                "teams": [TeamFactory().pk],
            }
        )

        assert form.is_valid(), form.errors
